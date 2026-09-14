// 样本保管链领域模型
// 五个互斥状态：在柜 / 待取 / 借出 / 净化 / 封存

export type VialStatus =
  | 'in_cabinet' // 在柜
  | 'waiting' // 待取（已排队，可能是队首或队列中）
  | 'on_loan' // 借出
  | 'purifying' // 净化（等待两名核对人结论）
  | 'sealed'; // 封存（终态，不可恢复）

export type PurifyConclusion = 'match' | 'mismatch'; // 相符 / 异常不符

export interface Vial {
  id: string;
  code: string; // 瓶号，如 S-003
  name: string; // 样本名称
  source: string; // 来源 / 采集地点
  smellType: string; // 气味类型标签
  note?: string; // 登记备注
  registeredAt: string;
  status: VialStatus;
  // 待取
  waitSince?: string;
  waitRequester?: string; // 申领人
  waitNote?: string;
  // 借出
  currentLoanId?: string | null;
  // 净化
  activeRoundId?: string | null;
  // 封存
  sealedAt?: string;
  sealReason?: string;
}

// 交接记录（借出 / 转交各一条；转交结束旧记录、生成新记录）
export interface LoanRecord {
  id: string;
  vialId: string;
  seq: number; // 该样本的第几次持有
  holder: string; // 持有人
  pickupPoint: string; // 取件点
  purpose: string; // 用途
  startedAt: string;
  endedAt: string | null;
  endReason: 'returned' | 'transferred' | null;
  fromLoanId: string | null; // 转交来源记录
  note?: string;
}

export interface PurifyVerdict {
  reviewer: string; // 核对人
  conclusion: PurifyConclusion;
  note?: string;
  at: string;
}

export interface PurifyRound {
  id: string;
  vialId: string;
  seq: number;
  startedAt: string;
  verdicts: PurifyVerdict[];
  status: 'pending' | 'completed' | 'conflict';
  agreedConclusion?: PurifyConclusion;
  endedAt?: string;
}

// 时间线事件（只追加，不可改写）
export type TimelineEventType =
  | 'registered' // 登记入柜
  | 'wait_joined' // 加入待取队列
  | 'wait_promoted' // 队首撤回/借出后自动接替
  | 'wait_cancelled' // 撤回待取
  | 'loaned' // 借出
  | 'returned' // 原瓶归还回柜
  | 'transferred' // 转交
  | 'purify_started' // 发起净化
  | 'purify_verdict' // 核对结论
  | 'purify_conflict' // 双人结论冲突
  | 'purify_requeued' // 冲突后返回净化队列（新一轮）
  | 'purify_completed' // 双人结论一致，净化完成
  | 'sealed'; // 封存

export interface TimelineEvent {
  id: string;
  seq: number;
  at: string;
  vialId: string;
  type: TimelineEventType;
  payload: Record<string, unknown>;
  clientToken?: string;
}

// 所有写操作（均携带 clientToken 做幂等）
export type ChainAction =
  | { type: 'register'; clientToken: string; name: string; source: string; smellType: string; note?: string }
  | { type: 'request_wait'; clientToken: string; vialId: string; requester: string; note?: string }
  | { type: 'cancel_wait'; clientToken: string; vialId: string }
  | { type: 'loan'; clientToken: string; vialId: string; holder: string; pickupPoint: string; purpose: string }
  | { type: 'return_loan'; clientToken: string; vialId: string; note?: string }
  | { type: 'transfer'; clientToken: string; vialId: string; newHolder: string; newPickupPoint: string; newPurpose: string; note?: string }
  | { type: 'purify_start'; clientToken: string; vialId: string; note?: string }
  | { type: 'purify_verdict'; clientToken: string; vialId: string; reviewer: string; conclusion: PurifyConclusion; note?: string }
  | { type: 'seal'; clientToken: string; vialId: string; reason: string };

export interface ChainState {
  vials: Vial[];
  waitQueue: string[]; // vialId 顺序，队首可借出
  loans: LoanRecord[];
  rounds: PurifyRound[];
  timeline: TimelineEvent[];
  processedTokens: Record<string, { eventId: string; at: string }>;
}

export interface ActionContext {
  now: string;
  genId: (prefix: string) => string;
}

export interface ActionResult {
  state: ChainState;
  error?: string;
  idempotent?: boolean;
}
