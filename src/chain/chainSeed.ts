// 通过状态机回放构造演示数据：保证初始状态本身也满足全部业务规则。
import type { ChainAction, ChainState } from './chainTypes';
import { emptyChain, reduceChain } from './chainRules';

const BASE_TIME = new Date('2026-09-10T09:00:00.000Z').getTime();
const MIN = 60_000;

export function buildSeed(): ChainState {
  let state = emptyChain();
  let step = 0;
  let counter = 0;
  const clock = () => new Date(BASE_TIME + step++ * MIN * 47).toISOString();
  const genId = (prefix: string) => `${prefix}-seed-${++counter}`;
  const run = (action: ChainAction) => {
    const r = reduceChain(state, action, { now: clock(), genId });
    if (r.error) throw new Error(`seed failed: ${action.type}: ${r.error}`);
    state = r.state;
  };

  // 登记八瓶
  run({ type: 'register', clientToken: 'seed-r1', name: '老衣柜樟木香', source: '外婆家东厢房', smellType: '木质', note: '旧毛衣与樟脑混合' });
  run({ type: 'register', clientToken: 'seed-r2', name: '雨后操场草皮', source: '第三中学操场', smellType: '清新' });
  run({ type: 'register', clientToken: 'seed-r3', name: '糖炒栗子摊', source: '巷口老栗子摊', smellType: '甜香' });
  run({ type: 'register', clientToken: 'seed-r4', name: '旧书页墨香', source: '县图书馆地下室', smellType: '霉味' });
  run({ type: 'register', clientToken: 'seed-r5', name: '夏夜栀子', source: '教工宿舍楼下', smellType: '花香' });
  run({ type: 'register', clientToken: 'seed-r6', name: '雨后青苔石阶', source: '后山步道', smellType: '泥土' });
  run({ type: 'register', clientToken: 'seed-r7', name: '焦糊糖稀', source: '庙会糖画摊', smellType: '焦味' });
  run({ type: 'register', clientToken: 'seed-r8', name: '晒过的棉被', source: '家中天台', smellType: '清新' });

  const ids = () => state.vials.map((v) => v.id);

  // S-008 借出 → 转交 → 归还（演示交接链；先于排队流程，避免阻塞队列）
  run({ type: 'request_wait', clientToken: 'seed-w4', vialId: ids()[7], requester: '周屿' });
  run({ type: 'loan', clientToken: 'seed-l2', vialId: ids()[7], holder: '周屿', pickupPoint: '档案科窗口', purpose: '棉织物气味对比研究' });
  run({
    type: 'transfer',
    clientToken: 'seed-t1',
    vialId: ids()[7],
    newHolder: '吴苔',
    newPickupPoint: '化学楼 B 栋前台',
    newPurpose: '继续棉织物气味对比，原持人外出交流',
    note: '当面交接并核验封签完整',
  });
  run({ type: 'return_loan', clientToken: 'seed-ret1', vialId: ids()[7], note: '封签完好，原瓶回柜' });

  // S-001/2/3 依次排队 → S-001 借出，队列前进触发自动接替
  run({ type: 'request_wait', clientToken: 'seed-w1', vialId: ids()[0], requester: '林小满', note: '气味复刻研究比对' });
  run({ type: 'request_wait', clientToken: 'seed-w2', vialId: ids()[1], requester: '陈雨' });
  run({ type: 'request_wait', clientToken: 'seed-w3', vialId: ids()[2], requester: '周知行' });
  run({
    type: 'loan',
    clientToken: 'seed-l1',
    vialId: ids()[0],
    holder: '林小满',
    pickupPoint: '前门收发室',
    purpose: '气味复刻实验室比对，预计两周',
  });

  // S-002 撤回 → S-003 自动接替（交接记录）
  run({ type: 'cancel_wait', clientToken: 'seed-c1', vialId: ids()[1] });

  // S-004 净化中：已收一份相符结论，等待第二名核对人
  run({ type: 'purify_start', clientToken: 'seed-p1', vialId: ids()[3], note: '读者反映气味偏淡' });
  run({ type: 'purify_verdict', clientToken: 'seed-v1', vialId: ids()[3], reviewer: '何闻', conclusion: 'match', note: '与登记描述相符' });

  // S-005 净化完成（双人相符）
  run({ type: 'purify_start', clientToken: 'seed-p2', vialId: ids()[4] });
  run({ type: 'purify_verdict', clientToken: 'seed-v2', vialId: ids()[4], reviewer: '何闻', conclusion: 'match' });
  run({ type: 'purify_verdict', clientToken: 'seed-v3', vialId: ids()[4], reviewer: '沈听澜', conclusion: 'match', note: '花香特征稳定' });

  // S-007 核对冲突 → 自动返回净化队列（新一轮等待核对）
  run({ type: 'purify_start', clientToken: 'seed-p3', vialId: ids()[6], note: '疑似运输污染' });
  run({ type: 'purify_verdict', clientToken: 'seed-v4', vialId: ids()[6], reviewer: '何闻', conclusion: 'mismatch', note: '焦味偏重' });
  run({ type: 'purify_verdict', clientToken: 'seed-v5', vialId: ids()[6], reviewer: '沈听澜', conclusion: 'match', note: '判断为正常焦糖化' });

  // S-006 封存（终态）
  run({ type: 'seal', clientToken: 'seed-s1', vialId: ids()[5], reason: '活性成分衰减，长期保存样本，不再出库' });

  return state;
}
