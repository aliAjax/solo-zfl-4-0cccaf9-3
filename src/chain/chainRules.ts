// 保管链状态机：纯函数，所有写操作经此分发
// 规则：五状态互斥、待取 FIFO、撤回自动接替、借出登记、归还/转交、
//       净化双人同结论方可完成（冲突回净化队列）、封存终态、时间线只追加、幂等。
import type {
  ActionContext,
  ChainAction,
  ChainState,
  LoanRecord,
  PurifyRound,
  TimelineEvent,
  TimelineEventType,
  Vial,
  VialStatus,
} from './chainTypes';

export const emptyChain = (): ChainState => ({
  vials: [],
  waitQueue: [],
  loans: [],
  rounds: [],
  timeline: [],
  processedTokens: {},
});

// ---------- 展示用元数据 ----------
export const STATUS_META: Record<VialStatus, { label: string; emoji: string; badge: string; dot: string }> = {
  in_cabinet: { label: '在柜', emoji: '🗄️', badge: 'bg-moss-100 text-moss-600 border-moss-200', dot: 'bg-moss-500' },
  waiting: { label: '待取', emoji: '⏳', badge: 'bg-ochre-100 text-ochre-600 border-ochre-200', dot: 'bg-ochre-400' },
  on_loan: { label: '借出', emoji: '🤲', badge: 'bg-lavender-300/40 text-lavender-600 border-lavender-400/50', dot: 'bg-lavender-500' },
  purifying: { label: '净化', emoji: '🧪', badge: 'bg-sky-100 text-sky-700 border-sky-200', dot: 'bg-sky-500' },
  sealed: { label: '封存', emoji: '🔒', badge: 'bg-ink-900/10 text-ink-800 border-ink-900/20', dot: 'bg-ink-700' },
};

export const CONCLUSION_META = {
  match: { label: '相符，可入库', emoji: '✅' },
  mismatch: { label: '异常不符', emoji: '⚠️' },
} as const;

export const EVENT_META: Record<TimelineEventType, { label: string; emoji: string }> = {
  registered: { label: '登记入柜', emoji: '📝' },
  wait_joined: { label: '申请待取', emoji: '🙋' },
  wait_promoted: { label: '自动接替', emoji: '⬆️' },
  wait_cancelled: { label: '撤回待取', emoji: '↩️' },
  loaned: { label: '借出', emoji: '🤲' },
  returned: { label: '原瓶归还', emoji: '📥' },
  transferred: { label: '转交', emoji: '🔁' },
  purify_started: { label: '发起净化', emoji: '🧪' },
  purify_verdict: { label: '净化核对', emoji: '🔍' },
  purify_conflict: { label: '核对冲突', emoji: '⚡' },
  purify_requeued: { label: '返回净化队列', emoji: '🔄' },
  purify_completed: { label: '净化完成', emoji: '✨' },
  sealed: { label: '封存', emoji: '🔒' },
};

// ---------- 工具 ----------
function appendEvent(
  state: ChainState,
  ctx: ActionContext,
  vialId: string,
  type: TimelineEventType,
  payload: Record<string, unknown>,
  clientToken?: string,
): { state: ChainState; event: TimelineEvent } {
  const event: TimelineEvent = {
    id: ctx.genId('evt'),
    seq: state.timeline.length + 1,
    at: ctx.now,
    vialId,
    type,
    payload,
    ...(clientToken ? { clientToken } : {}),
  };
  return { state: { ...state, timeline: [...state.timeline, event] }, event };
}

function patchVial(state: ChainState, vialId: string, patch: Partial<Vial>): ChainState {
  return { ...state, vials: state.vials.map((v) => (v.id === vialId ? { ...v, ...patch } : v)) };
}

const sealedError = '样本已封存，封存后不能恢复，禁止任何状态变化。';

function statusError(status: VialStatus | undefined, actionDesc: string): string {
  if (!status) return '样本不存在，可能已被移除，请刷新后重试。';
  if (status === 'sealed') return sealedError;
  const cur = STATUS_META[status].label;
  return `非法状态变化：样本当前为「${cur}」，${actionDesc}。请先完成当前环节后再操作。`;
}

function vialLoanSeq(state: ChainState, vialId: string): number {
  return state.loans.filter((l) => l.vialId === vialId).length + 1;
}
function vialRoundSeq(state: ChainState, vialId: string): number {
  return state.rounds.filter((r) => r.vialId === vialId).length + 1;
}

// ---------- 主 reducer ----------
export function reduceChain(prev: ChainState, action: ChainAction, ctx: ActionContext) {
  // 幂等：同一 clientToken 重复提交不增加任何记录
  const seen = prev.processedTokens[action.clientToken];
  if (seen) return { state: prev, idempotent: true } as const;

  let state = prev;
  const commit = (
    s: ChainState,
    vialId: string,
    type: TimelineEventType,
    payload: Record<string, unknown>,
  ) => {
    const r = appendEvent(s, ctx, vialId, type, payload, action.clientToken);
    state = {
      ...r.state,
      processedTokens: { ...s.processedTokens, [action.clientToken]: { eventId: r.event.id, at: ctx.now } },
    };
    return r.event;
  };

  switch (action.type) {
    case 'register': {
      if (!action.name.trim()) return { state: prev, error: '样本名称不能为空。' };
      const nums = state.vials
        .map((v) => /^S-(\d+)$/.exec(v.code)?.[1])
        .filter(Boolean)
        .map((n) => Number(n));
      const code = `S-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
      const vial: Vial = {
        id: ctx.genId('vial'),
        code,
        name: action.name.trim(),
        source: action.source?.trim() ?? '',
        smellType: action.smellType?.trim() || '未分类',
        note: action.note?.trim() || undefined,
        registeredAt: ctx.now,
        status: 'in_cabinet',
        currentLoanId: null,
      };
      state = { ...state, vials: [...state.vials, vial] };
      commit(state, vial.id, 'registered', {
        code: vial.code,
        name: vial.name,
        source: vial.source,
        smellType: vial.smellType,
        note: vial.note ?? null,
      });
      return { state };
    }

    case 'request_wait': {
      const vial = state.vials.find((v) => v.id === action.vialId);
      if (!vial) return { state: prev, error: statusError(undefined, '') };
      if (vial.status !== 'in_cabinet') return { state: prev, error: statusError(vial.status, '只有「在柜」样本才能申请待取') };
      if (!action.requester.trim()) return { state: prev, error: '请填写申领人。' };

      state = patchVial(state, vial.id, {
        status: 'waiting',
        waitSince: ctx.now,
        waitRequester: action.requester.trim(),
        waitNote: action.note?.trim() || undefined,
      });
      const position = state.waitQueue.length + 1;
      state = { ...state, waitQueue: [...state.waitQueue, vial.id] };
      commit(state, vial.id, 'wait_joined', {
        requester: action.requester.trim(),
        note: action.note?.trim() || null,
        position,
      });
      return { state };
    }

    case 'cancel_wait': {
      const vial = state.vials.find((v) => v.id === action.vialId);
      if (!vial) return { state: prev, error: statusError(undefined, '') };
      if (vial.status !== 'waiting') return { state: prev, error: statusError(vial.status, '只有「待取」样本可以撤回') };

      const wasHead = state.waitQueue[0] === vial.id;
      state = { ...state, waitQueue: state.waitQueue.filter((id) => id !== vial.id) };
      state = patchVial(state, vial.id, {
        status: 'in_cabinet',
        waitSince: undefined,
        waitRequester: undefined,
        waitNote: undefined,
      });
      commit(state, vial.id, 'wait_cancelled', { requester: vial.waitRequester ?? null });

      // 队首撤回：下一位自动接替，留下交接记录
      if (wasHead && state.waitQueue.length > 0) {
        const nextId = state.waitQueue[0];
        const next = state.vials.find((v) => v.id === nextId);
        commit(state, nextId, 'wait_promoted', {
          requester: next?.waitRequester ?? null,
          reason: '前一位已撤回',
        });
      }
      return { state };
    }

    case 'loan': {
      const vial = state.vials.find((v) => v.id === action.vialId);
      if (!vial) return { state: prev, error: statusError(undefined, '') };
      if (vial.status !== 'waiting') return { state: prev, error: statusError(vial.status, '只有「待取」队首样本可以借出') };
      const idx = state.waitQueue.indexOf(vial.id);
      if (idx > 0) return { state: prev, error: `非法状态变化：待取按登记顺序排队，该样本前面还有 ${idx} 位等待者，请按序领取。` };
      if (!action.holder.trim() || !action.pickupPoint.trim() || !action.purpose.trim()) {
        return { state: prev, error: '借出必须登记持有人、取件点和用途。' };
      }

      const requester = vial.waitRequester ?? null;
      state = { ...state, waitQueue: state.waitQueue.filter((id) => id !== vial.id) };
      const loan: LoanRecord = {
        id: ctx.genId('loan'),
        vialId: vial.id,
        seq: vialLoanSeq(state, vial.id),
        holder: action.holder.trim(),
        pickupPoint: action.pickupPoint.trim(),
        purpose: action.purpose.trim(),
        startedAt: ctx.now,
        endedAt: null,
        endReason: null,
        fromLoanId: null,
      };
      state = { ...state, loans: [...state.loans, loan] };
      state = patchVial(state, vial.id, {
        status: 'on_loan',
        currentLoanId: loan.id,
        waitSince: undefined,
        waitRequester: undefined,
        waitNote: undefined,
      });
      commit(state, vial.id, 'loaned', {
        loanId: loan.id,
        holder: loan.holder,
        pickupPoint: loan.pickupPoint,
        purpose: loan.purpose,
        requester,
      });

      // 借出后队列同样前进，下一位自动接替
      if (state.waitQueue.length > 0) {
        const nextId = state.waitQueue[0];
        const next = state.vials.find((v) => v.id === nextId);
        commit(state, nextId, 'wait_promoted', {
          requester: next?.waitRequester ?? null,
          reason: '前一位已借出',
        });
      }
      return { state };
    }

    case 'return_loan': {
      const vial = state.vials.find((v) => v.id === action.vialId);
      if (!vial) return { state: prev, error: statusError(undefined, '') };
      if (vial.status !== 'on_loan') return { state: prev, error: statusError(vial.status, '只有「借出」样本可以归还') };

      const loan = state.loans.find((l) => l.id === vial.currentLoanId) ?? null;
      if (loan) {
        const closed: LoanRecord = { ...loan, endedAt: ctx.now, endReason: 'returned' };
        state = { ...state, loans: state.loans.map((l) => (l.id === loan.id ? closed : l)) };
      }
      state = patchVial(state, vial.id, { status: 'in_cabinet', currentLoanId: null });
      commit(state, vial.id, 'returned', {
        holder: loan?.holder ?? null,
        pickupPoint: loan?.pickupPoint ?? null,
        note: action.note?.trim() || null,
      });
      return { state };
    }

    case 'transfer': {
      const vial = state.vials.find((v) => v.id === action.vialId);
      if (!vial) return { state: prev, error: statusError(undefined, '') };
      if (vial.status !== 'on_loan') return { state: prev, error: statusError(vial.status, '只有「借出」样本可以转交') };
      if (!action.newHolder.trim() || !action.newPickupPoint.trim() || !action.newPurpose.trim()) {
        return { state: prev, error: '转交必须登记新持有人、取件点和用途。' };
      }
      const old = state.loans.find((l) => l.id === vial.currentLoanId) ?? null;
      if (old && old.holder.trim() === action.newHolder.trim()) {
        return { state: prev, error: '新持有人与当前持有人相同，无需转交（如归还请选择原瓶回柜）。' };
      }

      // 结束旧记录
      if (old) {
        const closed: LoanRecord = { ...old, endedAt: ctx.now, endReason: 'transferred' };
        state = { ...state, loans: state.loans.map((l) => (l.id === old.id ? closed : l)) };
      }
      // 生成新记录
      const next: LoanRecord = {
        id: ctx.genId('loan'),
        vialId: vial.id,
        seq: vialLoanSeq(state, vial.id),
        holder: action.newHolder.trim(),
        pickupPoint: action.newPickupPoint.trim(),
        purpose: action.newPurpose.trim(),
        startedAt: ctx.now,
        endedAt: null,
        endReason: null,
        fromLoanId: old?.id ?? null,
      };
      state = { ...state, loans: [...state.loans, next] };
      state = patchVial(state, vial.id, { currentLoanId: next.id });
      commit(state, vial.id, 'transferred', {
        oldLoanId: old?.id ?? null,
        oldHolder: old?.holder ?? null,
        newLoanId: next.id,
        newHolder: next.holder,
        pickupPoint: next.pickupPoint,
        purpose: next.purpose,
        note: action.note?.trim() || null,
      });
      return { state };
    }

    case 'purify_start': {
      const vial = state.vials.find((v) => v.id === action.vialId);
      if (!vial) return { state: prev, error: statusError(undefined, '') };
      if (vial.status !== 'in_cabinet') return { state: prev, error: statusError(vial.status, '只有「在柜」样本可以发起净化') };

      const round: PurifyRound = {
        id: ctx.genId('rnd'),
        vialId: vial.id,
        seq: vialRoundSeq(state, vial.id),
        startedAt: ctx.now,
        verdicts: [],
        status: 'pending',
      };
      state = { ...state, rounds: [...state.rounds, round] };
      state = patchVial(state, vial.id, { status: 'purifying', activeRoundId: round.id });
      commit(state, vial.id, 'purify_started', { roundId: round.id, roundSeq: round.seq, note: action.note?.trim() || null });
      return { state };
    }

    case 'purify_verdict': {
      const vial = state.vials.find((v) => v.id === action.vialId);
      if (!vial) return { state: prev, error: statusError(undefined, '') };
      if (vial.status !== 'purifying') return { state: prev, error: statusError(vial.status, '样本不在净化中，无法提交核对结论') };
      if (!action.reviewer.trim()) return { state: prev, error: '请填写核对人姓名。' };

      const round = state.rounds.find((r) => r.id === vial.activeRoundId);
      if (!round || round.status !== 'pending') return { state: prev, error: '当前没有等待核对的净化轮次。' };
      if (round.verdicts.some((d) => d.reviewer === action.reviewer.trim())) {
        return { state: prev, error: '该核对人本轮已提交过结论，重复提交不能增加记录。' };
      }

      const verdict = {
        reviewer: action.reviewer.trim(),
        conclusion: action.conclusion,
        note: action.note?.trim() || undefined,
        at: ctx.now,
      };
      let updatedRound: PurifyRound = { ...round, verdicts: [...round.verdicts, verdict] };
      state = { ...state, rounds: state.rounds.map((r) => (r.id === round.id ? updatedRound : r)) };
      commit(state, vial.id, 'purify_verdict', {
        roundId: round.id,
        roundSeq: round.seq,
        reviewer: verdict.reviewer,
        conclusion: verdict.conclusion,
        note: verdict.note ?? null,
      });

      if (updatedRound.verdicts.length < 2) return { state };

      const [a, b] = updatedRound.verdicts;
      if (a.conclusion === b.conclusion) {
        // 两名核对人结论相同 → 完成，样本回柜
        updatedRound = {
          ...updatedRound,
          status: 'completed',
          agreedConclusion: a.conclusion,
          endedAt: ctx.now,
        };
        state = { ...state, rounds: state.rounds.map((r) => (r.id === round.id ? updatedRound : r)) };
        state = patchVial(state, vial.id, { status: 'in_cabinet', activeRoundId: null });
        commit(state, vial.id, 'purify_completed', {
          roundId: round.id,
          roundSeq: round.seq,
          conclusion: a.conclusion,
          reviewers: updatedRound.verdicts.map((d) => d.reviewer),
        });
        return { state };
      }

      // 结论冲突 → 本轮标记冲突，自动返回净化队列（开启新一轮），样本保持净化中
      updatedRound = { ...updatedRound, status: 'conflict', endedAt: ctx.now };
      state = { ...state, rounds: state.rounds.map((r) => (r.id === round.id ? updatedRound : r)) };
      commit(state, vial.id, 'purify_conflict', {
        roundId: round.id,
        roundSeq: round.seq,
        reviewers: updatedRound.verdicts.map((d) => d.reviewer),
        conclusions: updatedRound.verdicts.map((d) => d.conclusion),
      });
      const retry: PurifyRound = {
        id: ctx.genId('rnd'),
        vialId: vial.id,
        seq: vialRoundSeq(state, vial.id),
        startedAt: ctx.now,
        verdicts: [],
        status: 'pending',
      };
      state = { ...state, rounds: [...state.rounds, retry] };
      state = patchVial(state, vial.id, { activeRoundId: retry.id });
      commit(state, vial.id, 'purify_requeued', {
        previousRoundId: round.id,
        previousRoundSeq: round.seq,
        newRoundId: retry.id,
        newRoundSeq: retry.seq,
      });
      return { state };
    }

    case 'seal': {
      const vial = state.vials.find((v) => v.id === action.vialId);
      if (!vial) return { state: prev, error: statusError(undefined, '') };
      if (vial.status === 'sealed') return { state: prev, error: sealedError };
      if (vial.status !== 'in_cabinet') {
        return { state: prev, error: statusError(vial.status, '只有「在柜」样本可以封存；待取请先撤回或借出，借出请先归还，净化请先完成') };
      }
      if (!action.reason.trim()) return { state: prev, error: '请填写封存原因。' };

      state = patchVial(state, vial.id, {
        status: 'sealed',
        sealedAt: ctx.now,
        sealReason: action.reason.trim(),
      });
      commit(state, vial.id, 'sealed', { reason: action.reason.trim() });
      return { state };
    }
  }
}

// ---------- 派生选择器 ----------
export function vialTimeline(state: ChainState, vialId: string): TimelineEvent[] {
  return state.timeline.filter((e) => e.vialId === vialId);
}

export function activeLoanOf(state: ChainState, vial: Vial): LoanRecord | null {
  if (vial.status !== 'on_loan' || !vial.currentLoanId) return null;
  return state.loans.find((l) => l.id === vial.currentLoanId && l.endedAt === null) ?? null;
}

export function activeRoundOf(state: ChainState, vial: Vial): PurifyRound | null {
  if (vial.status !== 'purifying' || !vial.activeRoundId) return null;
  return state.rounds.find((r) => r.id === vial.activeRoundId) ?? null;
}

export function waitPosition(state: ChainState, vialId: string): number {
  const i = state.waitQueue.indexOf(vialId);
  return i === -1 ? 0 : i + 1;
}

export function loanHistoryOf(state: ChainState, vialId: string): LoanRecord[] {
  return state.loans.filter((l) => l.vialId === vialId).sort((a, b) => a.seq - b.seq);
}

export function roundsOf(state: ChainState, vialId: string): PurifyRound[] {
  return state.rounds.filter((r) => r.vialId === vialId).sort((a, b) => a.seq - b.seq);
}
