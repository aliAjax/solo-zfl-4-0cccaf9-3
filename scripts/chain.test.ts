// 保管链状态机场景测试（node 直接运行，不依赖测试框架）
// 用法：先 esbuild 打包纯逻辑，再 node 运行。
import assert from 'node:assert';
import type { ChainAction, ChainState } from '../src/chain/chainTypes';
import { emptyChain, reduceChain, waitPosition, activeLoanOf } from '../src/chain/chainRules';
import { buildSeed } from '../src/chain/chainSeed';

let n = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  n++;
};
const eq = (a: unknown, b: unknown, msg: string) => {
  assert.strictEqual(a, b, `${msg} (got ${String(a)}, want ${String(b)})`);
  n++;
};
const fail = (msg: string) => {
  assert.fail(msg);
};

let tick = 0;
const ctx = () => ({ now: new Date(Date.UTC(2026, 8, 14, 9, tick++)).toISOString(), genId: (p: string) => `${p}-t${tick}` });

function run(s: ChainState, a: ChainAction): ChainState {
  const r = reduceChain(s, a, ctx());
  if (r.error) fail(`${a.type} 意外失败: ${r.error}`);
  if (r.idempotent) fail(`${a.type} 意外命中幂等`);
  return r.state;
}
function expectError(s: ChainState, a: ChainAction, mustInclude: string) {
  const r = reduceChain(s, a, ctx());
  assert.ok(r.error, `${a.type} 应当被拒绝但成功了`);
  assert.ok(r.error.includes(mustInclude), `${a.type} 错误信息应包含「${mustInclude}」，实际：${r.error}`);
  n++;
  return s;
}

// ---------- 1. 种子数据合法 ----------
{
  const seed = buildSeed();
  eq(seed.vials.length, 8, '种子应有 8 个样本');
  const byStatus: Record<string, number> = {};
  for (const v of seed.vials) byStatus[v.status] = (byStatus[v.status] ?? 0) + 1;
  eq(byStatus.waiting, 1, '种子中应有 1 瓶待取（S-003 队首）');
  eq(byStatus.on_loan, 1, '种子中应有 1 瓶借出（S-001）');
  eq(byStatus.purifying, 2, '种子中应有 2 瓶净化中');
  eq(byStatus.sealed, 1, '种子中应有 1 瓶封存');
  eq(byStatus.in_cabinet, 3, '种子中应有 3 瓶在柜');
  eq(seed.waitQueue[0], seed.vials[2].id, '队首应为 S-003');
  // S-008 有 两条交接记录（借出 → 转交新记录，旧记录结束）
  const loans8 = seed.loans.filter((l) => l.vialId === seed.vials[7].id);
  eq(loans8.length, 2, '转交应生成新记录');
  eq(loans8[0].endReason, 'transferred', '旧记录因转交结束');
  eq(loans8[1].endReason, 'returned', '新记录随后因归还结束');
  eq(seed.vials[7].status, 'in_cabinet', 'S-008 归还后在柜');
  // S-007 冲突后开启第二轮
  const rounds7 = seed.rounds.filter((r) => r.vialId === seed.vials[6].id);
  eq(rounds7.length, 2, '冲突应开启新一轮');
  eq(rounds7[0].status, 'conflict', '首轮冲突');
  eq(rounds7[1].status, 'pending', '新一轮等待核对');
  console.log('✓ 种子数据合法');
}

// ---------- 2. 登记 → 排队 → 队首借出 → 自动接替 ----------
let s = emptyChain();
s = run(s, { type: 'register', clientToken: 'a1', name: '甲', source: 'A 地', smellType: '木质' });
s = run(s, { type: 'register', clientToken: 'a2', name: '乙', source: 'B 地', smellType: '花香' });
const [v1, v2] = s.vials;
eq(v1.code, 'S-001', '瓶号自动编号');
eq(v2.code, 'S-002', '瓶号递增');
eq(s.timeline.length, 2, '登记各一条时间线');

s = run(s, { type: 'request_wait', clientToken: 'a3', vialId: v1.id, requester: '张三' });
s = run(s, { type: 'request_wait', clientToken: 'a4', vialId: v2.id, requester: '李四' });
eq(waitPosition(s, v1.id), 1, 'v1 队首');
eq(waitPosition(s, v2.id), 2, 'v2 第二');

// 非队首不能借出
expectError(s, { type: 'loan', clientToken: 'x1', vialId: v2.id, holder: '李四', pickupPoint: '窗口', purpose: '研究' }, '登记顺序');

s = run(s, { type: 'loan', clientToken: 'a5', vialId: v1.id, holder: '张三', pickupPoint: '前门收发室', purpose: '比对研究' });
eq(s.vials.find((v) => v.id === v1.id)!.status, 'on_loan', 'v1 借出');
eq(s.waitQueue[0], v2.id, '借出后 v2 自动接替队首');
ok(s.timeline.some((e) => e.type === 'wait_promoted'), '自动接替留下交接记录');
const loanRec = activeLoanOf(s, s.vials.find((v) => v.id === v1.id)!);
ok(loanRec && loanRec.holder === '张三' && loanRec.pickupPoint === '前门收发室' && loanRec.purpose === '比对研究', '借出三要素已登记');
console.log('✓ 排队顺序与借出后自动接替');

// ---------- 3. 撤回 → 下一位接替 ----------
s = emptyChain();
s = run(s, { type: 'register', clientToken: 'b1', name: '丙' });
s = run(s, { type: 'register', clientToken: 'b2', name: '丁' });
s = run(s, { type: 'register', clientToken: 'b3', name: '戊' });
const [w1, w2, w3] = s.vials;
s = run(s, { type: 'request_wait', clientToken: 'b4', vialId: w1.id, requester: '甲' });
s = run(s, { type: 'request_wait', clientToken: 'b5', vialId: w2.id, requester: '乙' });
s = run(s, { type: 'request_wait', clientToken: 'b6', vialId: w3.id, requester: '丙' });
const before = s.timeline.length;
s = run(s, { type: 'cancel_wait', clientToken: 'b7', vialId: w1.id });
eq(s.vials.find((v) => v.id === w1.id)!.status, 'in_cabinet', '撤回后回柜');
eq(s.waitQueue[0], w2.id, '下一位接替');
eq(s.timeline.length, before + 2, '撤回 + 接替共两条记录');
console.log('✓ 撤回自动接替并留痕');

// ---------- 4. 归还：原瓶回柜 ----------
s = run(s, { type: 'loan', clientToken: 'b8', vialId: w2.id, holder: '乙', pickupPoint: '窗口', purpose: '用' });
s = run(s, { type: 'return_loan', clientToken: 'b9', vialId: w2.id, note: '封签完好' });
eq(s.vials.find((v) => v.id === w2.id)!.status, 'in_cabinet', '归还后在柜');
const closed = s.loans.filter((l) => l.vialId === w2.id);
eq(closed[0].endReason, 'returned', '交接记录标记归还');
console.log('✓ 原瓶归还回柜');

// ---------- 5. 转交：结束旧记录、生成新记录 ----------
// w3 此时为队首（w1 已撤回、w2 已归还），直接借出
s = run(s, { type: 'loan', clientToken: 'b11', vialId: w3.id, holder: '丙', pickupPoint: 'P1', purpose: 'U1' });
expectError(s, { type: 'transfer', clientToken: 'x2', vialId: w3.id, newHolder: '丙', newPickupPoint: 'P2', newPurpose: 'U2' }, '相同');
s = run(s, { type: 'transfer', clientToken: 'b12', vialId: w3.id, newHolder: '丁', newPickupPoint: 'P2', newPurpose: 'U2' });
const w3loans = s.loans.filter((l) => l.vialId === w3.id);
eq(w3loans.length, 2, '转交生成新记录');
eq(w3loans[0].endReason, 'transferred', '旧记录转交结束');
eq(w3loans[1].holder, '丁', '新持有人');
eq(w3loans[1].fromLoanId, w3loans[0].id, '新记录指向旧记录');
eq(s.vials.find((v) => v.id === w3.id)!.status, 'on_loan', '转交后仍为借出');
console.log('✓ 转交生成新记录并结束旧记录');

// ---------- 6. 净化：一致完成 / 冲突回退 ----------
s = emptyChain();
s = run(s, { type: 'register', clientToken: 'c1', name: '净 A' });
const p1 = s.vials[0];
s = run(s, { type: 'purify_start', clientToken: 'c2', vialId: p1.id });
// 同一核对人不能重复提交
s = run(s, { type: 'purify_verdict', clientToken: 'c3', vialId: p1.id, reviewer: '何闻', conclusion: 'match' });
expectError(s, { type: 'purify_verdict', clientToken: 'x3', vialId: p1.id, reviewer: '何闻', conclusion: 'mismatch' }, '重复提交');
s = run(s, { type: 'purify_verdict', clientToken: 'c4', vialId: p1.id, reviewer: '沈听澜', conclusion: 'match' });
eq(s.vials[0].status, 'in_cabinet', '双人一致 → 回柜');
const rd1 = s.rounds.find((r) => r.vialId === p1.id)!;
eq(rd1.status, 'completed', '轮次完成');
// 时间线：start + 2 verdicts + completed = 4（不含 register）
eq(s.timeline.filter((e) => e.vialId === p1.id && e.type.startsWith('purify')).length, 4, '净化一致流程事件数');

s = run(s, { type: 'register', clientToken: 'c5', name: '净 B' });
const p2 = s.vials[1];
s = run(s, { type: 'purify_start', clientToken: 'c6', vialId: p2.id });
s = run(s, { type: 'purify_verdict', clientToken: 'c7', vialId: p2.id, reviewer: '何闻', conclusion: 'mismatch' });
s = run(s, { type: 'purify_verdict', clientToken: 'c8', vialId: p2.id, reviewer: '沈听澜', conclusion: 'match' });
eq(s.vials.find((v) => v.id === p2.id)!.status, 'purifying', '冲突后仍为净化中（返回净化队列）');
const p2rounds = s.rounds.filter((r) => r.vialId === p2.id);
eq(p2rounds.length, 2, '冲突后开启新一轮');
eq(p2rounds[0].status, 'conflict', '首轮冲突');
// 新一轮可继续核对直至一致
s = run(s, { type: 'purify_verdict', clientToken: 'c9', vialId: p2.id, reviewer: '何闻', conclusion: 'match' });
s = run(s, { type: 'purify_verdict', clientToken: 'c10', vialId: p2.id, reviewer: '沈听澜', conclusion: 'match' });
eq(s.vials.find((v) => v.id === p2.id)!.status, 'in_cabinet', '重新核对一致后回柜');
console.log('✓ 净化双人核对：一致完成、冲突返回队列');

// ---------- 7. 封存终态 ----------
s = run(s, { type: 'seal', clientToken: 'd1', vialId: p2.id, reason: '长期保存' });
eq(s.vials.find((v) => v.id === p2.id)!.status, 'sealed', '已封存');
expectError(s, { type: 'seal', clientToken: 'x4', vialId: p2.id, reason: '再封' }, '不能恢复');
expectError(s, { type: 'request_wait', clientToken: 'x5', vialId: p2.id, requester: '谁' }, '封存');
expectError(s, { type: 'purify_start', clientToken: 'x6', vialId: p2.id }, '封存');
expectError(s, { type: 'loan', clientToken: 'x7', vialId: p2.id, holder: 'h', pickupPoint: 'p', purpose: 'u' }, '封存');
console.log('✓ 封存后不能恢复 / 禁止一切流转');

// ---------- 8. 非法状态变化拦截 ----------
expectError(s, { type: 'register', clientToken: 'x8', name: '  ', source: '', smellType: '' }, '名称不能为空');
// 在柜才能排队/净化/封存；借出不能直接封存
s = emptyChain();
s = run(s, { type: 'register', clientToken: 'e1', name: '合法' });
const z = s.vials[0];
expectError(s, { type: 'cancel_wait', clientToken: 'x9', vialId: z.id }, '在柜');
expectError(s, { type: 'return_loan', clientToken: 'x10', vialId: z.id }, '在柜');
expectError(s, { type: 'transfer', clientToken: 'x11', vialId: z.id, newHolder: 'a', newPickupPoint: 'b', newPurpose: 'c' }, '在柜');
expectError(s, { type: 'purify_verdict', clientToken: 'x12', vialId: z.id, reviewer: 'r', conclusion: 'match' }, '在柜');
// 借出必填三要素
s = run(s, { type: 'request_wait', clientToken: 'e2', vialId: z.id, requester: 'r' });
expectError(s, { type: 'loan', clientToken: 'x13', vialId: z.id, holder: '', pickupPoint: '', purpose: '' }, '持有人、取件点和用途');
expectError(s, { type: 'seal', clientToken: 'x14', vialId: z.id, reason: 'r' }, '待取');
console.log('✓ 非法状态变化全部拦截并说明原因');

// ---------- 9. 幂等：重复 token 不增加记录 ----------
{
  // 此时 z 处于 waiting（第 8 段 e2 成功），用撤回做幂等场景
  const t0 = s.timeline.length;
  const r1 = reduceChain(s, { type: 'cancel_wait', clientToken: 'dup', vialId: z.id }, ctx());
  ok(!r1.error && !r1.idempotent, '首次提交成功');
  const s1 = r1.state!;
  eq(s1.timeline.length, t0 + 1, '首次增加一条');
  const r2 = reduceChain(s1, { type: 'cancel_wait', clientToken: 'dup', vialId: z.id }, ctx());
  ok(r2.idempotent, '同 token 第二次为幂等命中');
  eq(r2.state, s1, '幂等返回原状态引用');
  eq(r2.state.timeline.length, t0 + 1, '重复提交不增加记录');
  s = s1;
  console.log('✓ 重复提交幂等');
}

// ---------- 10. 时间线只追加 ----------
{
  // 任何操作后，既有事件的 id/seq/内容不变
  const snapshotLen = s.timeline.length;
  const snapshot = JSON.stringify(s.timeline);
  s = run(s, { type: 'request_wait', clientToken: 'e3', vialId: z.id, requester: 'r' });
  eq(JSON.stringify(s.timeline.slice(0, snapshotLen)), snapshot, '既有时间线事件不可改写');
  const seqs = s.timeline.map((e) => e.seq);
  ok(seqs.every((q, i) => q === i + 1), '时间线序号连续');
  console.log('✓ 时间线只追加、序号连续');
}

console.log(`\n全部通过：${n} 条断言`);
