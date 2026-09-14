import { Lock } from 'lucide-react';
import type { ChainState, Vial } from '../chainTypes';
import { STATUS_META, activeLoanOf, activeRoundOf, waitPosition } from '../chainRules';

interface Props {
  vial: Vial;
  state: ChainState;
  onOpen: (vial: Vial) => void;
}

export default function VialCard({ vial, state, onOpen }: Props) {
  const meta = STATUS_META[vial.status];
  const loan = activeLoanOf(state, vial);
  const round = activeRoundOf(state, vial);
  const pos = vial.status === 'waiting' ? waitPosition(state, vial.id) : 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(vial)}
      className={`w-full text-left bg-paper-50/90 rounded-2xl border p-4 shadow-paper hover:shadow-paper-hover hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 ${
        vial.status === 'sealed' ? 'border-ink-900/15' : 'border-paper-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-paper-200 text-ochre-700 font-semibold">
              {vial.code}
            </span>
            <span className={`scent-tag border ${meta.badge}`}>
              <span>{meta.emoji}</span>
              {meta.label}
            </span>
          </div>
          <h3 className="font-serif text-lg font-bold text-ink-800 mt-2 truncate">{vial.name}</h3>
          <p className="text-xs text-ink-700/55 mt-0.5 truncate">{vial.source || '来源未填写'} · {vial.smellType}</p>
        </div>
        {vial.status === 'sealed' && <Lock className="w-4 h-4 text-ink-700/40 shrink-0 mt-1" />}
      </div>

      <div className="mt-3 space-y-1 text-xs text-ink-700/75">
        {vial.status === 'waiting' && (
          <p>
            {pos === 1 ? (
              <span className="inline-flex items-center gap-1 text-ochre-600 font-medium">👑 队首，可借出 / 撤回</span>
            ) : (
              <>排队第 <b className="text-ochre-600">{pos}</b> 位 · 申领人 {vial.waitRequester}</>
            )}
          </p>
        )}
        {vial.status === 'on_loan' && loan && (
          <p className="truncate">持有人 <b className="text-lavender-600">{loan.holder}</b> · {loan.pickupPoint}</p>
        )}
        {vial.status === 'purifying' && round && (
          <p className="text-sky-700">
            第 {round.seq} 轮核对 · 已收 {round.verdicts.length}/2 份结论
            {round.verdicts.length === 1 && '，等待第二人'}
          </p>
        )}
        {vial.status === 'sealed' && vial.sealReason && (
          <p className="truncate text-ink-700/55">封存原因：{vial.sealReason}</p>
        )}
      </div>
    </button>
  );
}
