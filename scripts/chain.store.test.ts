// 端到端：真实 zustand chainStore + localStorage 垫片，验证完整流程与刷新一致性
import assert from 'node:assert';
import type { ChainState } from '../src/chain/chainTypes';

// --- localStorage 垫片（须在 import store 前就位）---
const mem = new Map<string, string>();
const localStorageShim = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};
(globalThis as Record<string, unknown>).localStorage = localStorageShim;

const { useChainStore } = await import('../src/chain/chainStore');
const STORAGE_KEY = 'scent-chain-storage-v1';
const store = useChainStore;
store.getState().initIfEmpty();
let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };

// 跨状态不变量：队列/状态/记录互相一致
const invariants = (label: string) => {
  const st = store.getState().state;
  // 队列中的样本必须都是 waiting
  for (const id of st.waitQueue) {
    const v = st.vials.find((x) => x.id === id);
    assert.ok(v && v.status === 'waiting', `${label}: 队列成员 ${id} 必须为待取`);
  }
  // waiting 样本必须在队列中
  for (const v of st.vials) {
    if (v.status === 'waiting') assert.ok(st.waitQueue.includes(v.id), `${label}: 待取样本 ${v.code} 必须在队列中`);
    if (v.status === 'on_loan') {
      const loan = st.loans.find((l) => l.id === v.currentLoanId);
      assert.ok(loan && loan.endedAt === null, `${label}: 借出样本必须有持有中的交接记录`);
    }
    if (v.status === 'purifying') {
      const r = st.rounds.find((x) => x.id === v.activeRoundId);
      assert.ok(r && r.status === 'pending' && r.verdicts.length < 2, `${label}: 净化样本必须有未完成轮次`);
    }
    if (v.status === 'sealed') assert.ok(v.sealedAt && v.sealReason, `${label}: 封存样本须有封存信息`);
  }
  n++;
};
invariants('初始');

const dispatch = store.getState().dispatch;

// 清空种子中已有的待取队列，保证新登记的瓶能成为队首
for (let i = store.getState().state.waitQueue.length; i > 0; i--) {
  const head = store.getState().state.waitQueue[0];
  dispatch({ type: 'cancel_wait', clientToken: `e2e-clear-${i}`, vialId: head });
}
const clearedTimeline = store.getState().state.timeline.length;

// 完整流程：登记 → 待取 → 借出 → 转交 → 归还 → 净化（含冲突回退→再核对）→ 封存
const r0 = dispatch({ type: 'register', clientToken: 'e2e-1', name: 'E2E 测试瓶', source: '自动化测试', smellType: '木质' });
ok(!r0.error, '登记成功');
const vialId = store.getState().state.vials.find((v) => v.name === 'E2E 测试瓶')!.id;

ok(!dispatch({ type: 'request_wait', clientToken: 'e2e-2', vialId, requester: '测试员甲' }).error, '待取');
ok(!dispatch({ type: 'loan', clientToken: 'e2e-3', vialId, holder: '测试员甲', pickupPoint: '前台', purpose: 'E2E' }).error, '借出');
// 借出状态不能再借出 / 不能封存 / 不能净化
const blocked1 = dispatch({ type: 'loan', clientToken: 'e2e-bad1', vialId, holder: 'x', pickupPoint: 'y', purpose: 'z' });
ok(blocked1.error?.includes('借出'), '借出态再借出被拦截: ' + blocked1.error);
const blocked2 = dispatch({ type: 'seal', clientToken: 'e2e-bad2', vialId, reason: 'x' });
ok(!!blocked2.error, '借出态封存被拦截');
// 缺必填被拦截
ok(dispatch({ type: 'transfer', clientToken: 'e2e-bad3', vialId, newHolder: '', newPickupPoint: '', newPurpose: '' }).error?.includes('转交'), '转交缺字段被拦截');

ok(!dispatch({ type: 'transfer', clientToken: 'e2e-4', vialId, newHolder: '测试员乙', newPickupPoint: 'B 栋', newPurpose: '继续 E2E' }).error, '转交');
ok(!dispatch({ type: 'return_loan', clientToken: 'e2e-5', vialId, note: '完好' }).error, '归还');

ok(!dispatch({ type: 'purify_start', clientToken: 'e2e-6', vialId }).error, '发起净化');
ok(!dispatch({ type: 'purify_verdict', clientToken: 'e2e-7', vialId, reviewer: '核对人 A', conclusion: 'match' }).error, '核对 1');
ok(!dispatch({ type: 'purify_verdict', clientToken: 'e2e-8', vialId, reviewer: '核对人 B', conclusion: 'mismatch' }).error, '核对 2 冲突');
const mid = store.getState().state;
ok(mid.vials.find((v) => v.id === vialId)!.status === 'purifying', '冲突后返回净化队列');
ok(!dispatch({ type: 'purify_verdict', clientToken: 'e2e-9', vialId, reviewer: '核对人 A', conclusion: 'match' }).error, '新一轮核对 1');
// 同一人本轮不能重复
const dupReviewer = dispatch({ type: 'purify_verdict', clientToken: 'e2e-bad4', vialId, reviewer: '核对人 A', conclusion: 'mismatch' });
ok(dupReviewer.error?.includes('重复提交'), '同人重复结论被拦截');
ok(!dispatch({ type: 'purify_verdict', clientToken: 'e2e-10', vialId, reviewer: '核对人 B', conclusion: 'match' }).error, '新一轮核对 2 一致');
ok(store.getState().state.vials.find((v) => v.id === vialId)!.status === 'in_cabinet', '一致后回柜');

ok(!dispatch({ type: 'seal', clientToken: 'e2e-11', vialId, reason: 'E2E 封存验证' }).error, '封存');
const sealedVial = store.getState().state.vials.find((v) => v.id === vialId)!;
ok(sealedVial.status === 'sealed', '已封存');
const sealedBlock = dispatch({ type: 'request_wait', clientToken: 'e2e-bad5', vialId, requester: 'x' });
ok(sealedBlock.error?.includes('封存后不能恢复'), '封存后操作被明确拒绝');

// 幂等：成功过的 token 重放不增加记录
const beforeLen = store.getState().state.timeline.length;
const replay = dispatch({ type: 'seal', clientToken: 'e2e-11', vialId, reason: 'E2E 封存验证' });
ok(replay.idempotent && store.getState().state.timeline.length === beforeLen, '重复提交不增加记录');

invariants('流程后');
// 流程事件：登记1 待取1 借出1 转交1 归还1 发起净化1 第一结论1
// 第二结论冲突3（结论/冲突/回队） 新一轮第一结论1 新一轮第二结论2（结论/完成） 封存1 = 14
ok(store.getState().state.timeline.length === clearedTimeline + 14, `时间线事件数正确（${store.getState().state.timeline.length - clearedTimeline}）`);

// --- 模拟刷新：localStorage 已写入；重新水合后状态一致 ---
// zustand persist 存储结构为 { state: partialize 的返回, version }
const persisted = JSON.parse(mem.get(STORAGE_KEY)!).state.state as ChainState;
ok(persisted.vials.length === store.getState().state.vials.length, '持久化包含全部样本');
ok(persisted.timeline.length === store.getState().state.timeline.length, '持久化包含全部时间线');

await store.persist.rehydrate();
const after = store.getState().state;
ok(after.vials.find((v) => v.id === vialId)!.status === 'sealed', '刷新后封存状态一致');
ok(JSON.stringify(after.waitQueue) === JSON.stringify(persisted.waitQueue), '刷新后队列一致');
ok(after.timeline.length === persisted.timeline.length, '刷新后时间线一致');
invariants('刷新后');

console.log(`\n端到端全部通过：${n} 条断言（含刷新水合一致性）`);
