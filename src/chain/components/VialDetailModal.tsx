import Modal from '@/components/Modal';
import TimelineEventText from './TimelineEventText';
import {
  CONCLUSION_META,
  STATUS_META,
  activeLoanOf,
  activeRoundOf,
  loanHistoryOf,
  roundsOf,
  vialTimeline,
  waitPosition,
} from '../chainRules';
import type { ChainState, Vial } from '../chainTypes';
import type { ActionMode } from './ActionModal';
import { formatDate } from '@/utils/helpers';

interface Props {
  isOpen: boolean;
  vial: Vial | null;
  state: ChainState;
  onClose: () => void;
  onAction: (mode: ActionMode, vial: Vial) => void;
}

const sectionTitle = 'font-hand text-lg text-ochre-600 flex items-center gap-2';

export default function VialDetailModal({ isOpen, vial, state, onClose, onAction }: Props) {
  if (!vial) return null;
  const meta = STATUS_META[vial.status];
  const loan = activeLoanOf(state, vial);
  const round = activeRoundOf(state, vial);
  const pos = waitPosition(state, vial.id);
  const history = loanHistoryOf(state, vial.id);
  const rounds = roundsOf(state, vial.id);
  const events = vialTimeline(state, vial.id).slice().reverse();

  const actBtn = 'btn-primary !py-2 !px-3.5 text-sm w-full sm:w-auto';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${vial.code} · ${vial.name}`} maxWidth="max-w-2xl"
      subtitle={`${meta.emoji} ${meta.label} · 登记于 ${formatDate(vial.registeredAt)}`}>
      <div className="space-y-5">
        {/* 当前状态与操作 */}
        <section className="rounded-2xl bg-paper-100/80 border border-paper-300 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`scent-tag border ${meta.badge} !text-sm !px-3 !py-1`}>{meta.emoji} {meta.label}</span>
            <span className="text-xs text-ink-700/55">{vial.source || '来源未填写'} · {vial.smellType}</span>
          </div>
          {vial.note && <p className="text-xs text-ink-700/60 mt-2">登记备注：{vial.note}</p>}

          {vial.status === 'waiting' && (
            <div className="mt-3 text-sm text-ink-700 space-y-1">
              <p>队列位置：{pos === 1 ? <b className="text-ochre-600">队首，可立即借出</b> : <>第 <b className="text-ochre-600">{pos}</b> 位（前面 {pos - 1} 位）</>}</p>
              <p>申领人：{vial.waitRequester} · 申请于 {vial.waitSince ? formatDate(vial.waitSince) : '—'}</p>
              {vial.waitNote && <p className="text-xs text-ink-700/60">说明：{vial.waitNote}</p>}
            </div>
          )}
          {vial.status === 'on_loan' && loan && (
            <div className="mt-3 text-sm text-ink-700 space-y-1">
              <p>当前持有人：<b className="text-lavender-600">{loan.holder}</b></p>
              <p>取件点：{loan.pickupPoint}</p>
              <p>用途：{loan.purpose}</p>
              <p className="text-xs text-ink-700/55">借出时间：{formatDate(loan.startedAt)}</p>
            </div>
          )}
          {vial.status === 'purifying' && round && (
            <div className="mt-3 text-sm text-ink-700 space-y-2">
              <p>第 <b>{round.seq}</b> 轮核对 · 已收到 <b>{round.verdicts.length}/2</b> 份结论</p>
              {round.verdicts.map((d) => (
                <div key={d.reviewer + d.at} className="flex items-center gap-2 text-xs bg-paper-50 rounded-lg border border-paper-300 px-2.5 py-1.5">
                  <span>{CONCLUSION_META[d.conclusion].emoji}</span>
                  <b>{d.reviewer}</b>
                  <span className="text-ink-700/70">{CONCLUSION_META[d.conclusion].label}</span>
                  {d.note && <span className="text-ink-700/50 truncate">· {d.note}</span>}
                </div>
              ))}
              {round.verdicts.length === 1 && <p className="text-xs text-ochre-600">等待第二名核对人提交，结论需一致才能完成。</p>}
            </div>
          )}
          {vial.status === 'abnormal' && (
            <div className="mt-3 space-y-2">
              <div className="rounded-xl bg-brick-400/10 border border-brick-400/40 px-3.5 py-3 text-sm text-brick-600 font-medium">
                🚧 两名核对人一致判定「异常不符」，样本已隔离为异常待处理
              </div>
              <p className="text-xs text-ink-700/70">
                该样本不能回柜、不能预约待取、不能借出。请重新送检净化，或做封存处置。
                {vial.abnormalAt ? ` 隔离于 ${formatDate(vial.abnormalAt)}。` : ''}
              </p>
              {vial.abnormalReason && <p className="text-xs text-ink-700/60">异常说明：{vial.abnormalReason}</p>}
            </div>
          )}
          {vial.status === 'sealed' && (
            <div className="mt-3 text-sm text-ink-700">
              <p>封存原因：{vial.sealReason}</p>
              <p className="text-xs text-ink-700/55 mt-0.5">{vial.sealedAt ? formatDate(vial.sealedAt) : ''} · 封存后不能恢复</p>
            </div>
          )}

          {vial.status !== 'sealed' && (
            <div className="mt-4 flex flex-wrap gap-2">
              {vial.status === 'in_cabinet' && (
                <>
                  <button className={actBtn} onClick={() => onAction('wait', vial)}>🙋 申请待取</button>
                  <button className="btn-secondary !py-2 !px-3.5 text-sm" onClick={() => onAction('purify_start', vial)}>🧪 发起净化</button>
                  <button className="btn-danger !py-2 !px-3.5 text-sm" onClick={() => onAction('seal', vial)}>🔒 封存</button>
                </>
              )}
              {vial.status === 'waiting' && (
                <>
                  <button className={actBtn} disabled={pos !== 1} onClick={() => pos === 1 && onAction('loan', vial)}>
                    🤲 办理借出{pos !== 1 ? '（未轮到）' : ''}
                  </button>
                  <button className="btn-secondary !py-2 !px-3.5 text-sm" onClick={() => onAction('cancel_wait', vial)}>↩️ 撤回待取</button>
                </>
              )}
              {vial.status === 'on_loan' && (
                <>
                  <button className={actBtn} onClick={() => onAction('return', vial)}>📥 原瓶归还</button>
                  <button className="btn-secondary !py-2 !px-3.5 text-sm" onClick={() => onAction('transfer', vial)}>🔁 转交</button>
                </>
              )}
              {vial.status === 'purifying' && (
                <button className={actBtn} disabled={!round || round.verdicts.length >= 2}
                  onClick={() => onAction('verdict', vial)}>
                  🔍 提交核对结论{round && round.verdicts.length >= 2 ? '（本轮已结束）' : ''}
                </button>
              )}
              {vial.status === 'abnormal' && (
                <>
                  <button className={actBtn} onClick={() => onAction('purify_start', vial)}>🔬 重新送检净化</button>
                  <button className="btn-danger !py-2 !px-3.5 text-sm" onClick={() => onAction('seal', vial)}>🔒 封存处置</button>
                </>
              )}
            </div>
          )}
        </section>

        {/* 交接记录 */}
        {history.length > 0 && (
          <section>
            <h3 className={sectionTitle}><span className="w-1.5 h-5 bg-lavender-500 rounded-full" />交接记录</h3>
            <ol className="mt-2 space-y-2">
              {history.map((l) => (
                <li key={l.id} className="rounded-xl border border-paper-300 bg-paper-50 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-paper-200 text-ochre-700">#{l.seq}</span>
                    <b className="text-ink-800">{l.holder}</b>
                    <span className="text-xs text-ink-700/60">{l.pickupPoint}</span>
                    {l.endedAt ? (
                      <span className={`scent-tag text-[10px] ${l.endReason === 'transferred' ? 'bg-ochre-100 text-ochre-600' : 'bg-moss-100 text-moss-600'}`}>
                        {l.endReason === 'transferred' ? '已转交结束' : '已归还结束'}
                      </span>
                    ) : (
                      <span className="scent-tag text-[10px] bg-lavender-300/40 text-lavender-600">持有中</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-700/70 mt-1">用途：{l.purpose}</p>
                  <p className="text-[11px] text-ink-700/45 mt-0.5 font-mono">
                    {formatDate(l.startedAt)}
                    {l.endedAt ? ` → ${formatDate(l.endedAt)}` : ' 起'}
                    {l.fromLoanId ? ' · 由上一条记录转交而来' : ''}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* 净化轮次 */}
        {rounds.length > 0 && (
          <section>
            <h3 className={sectionTitle}><span className="w-1.5 h-5 bg-sky-500 rounded-full" />净化核对轮次</h3>
            <ol className="mt-2 space-y-2">
              {rounds.map((r) => (
                <li key={r.id} className="rounded-xl border border-paper-300 bg-paper-50 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-paper-200 text-ochre-700">第 {r.seq} 轮</span>
                    <span className={`scent-tag text-[10px] ${
                      r.status === 'completed' ? 'bg-moss-100 text-moss-600'
                        : r.status === 'conflict' ? 'bg-brick-400/15 text-brick-600'
                        : r.status === 'abnormal' ? 'bg-brick-400/15 text-brick-600'
                        : 'bg-sky-100 text-sky-700'
                    }`}>
                      {r.status === 'completed' ? '结论一致相符 · 已完成'
                        : r.status === 'conflict' ? '结论冲突 · 已重新排队'
                        : r.status === 'abnormal' ? '一致判定异常 · 样本隔离'
                        : '等待核对'}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {r.verdicts.map((d) => (
                      <div key={d.reviewer + d.at} className="flex flex-wrap items-center gap-2 text-xs text-ink-700">
                        <span>{CONCLUSION_META[d.conclusion].emoji}</span>
                        <b>{d.reviewer}</b>
                        <span className="text-ink-700/65">{CONCLUSION_META[d.conclusion].label}</span>
                        {d.note && <span className="text-ink-700/50">· {d.note}</span>}
                      </div>
                    ))}
                    {r.verdicts.length === 0 && <p className="text-xs text-ink-700/45">等待核对人提交结论</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* 该样本时间线 */}
        <section>
          <h3 className={sectionTitle}><span className="w-1.5 h-5 bg-moss-500 rounded-full" />保管链时间线</h3>
          <div className="mt-2 space-y-3 rounded-2xl border border-paper-300 bg-paper-50/60 p-4 max-h-72 overflow-y-auto">
            {events.map((e) => <TimelineEventText key={e.id} event={e} />)}
          </div>
        </section>
      </div>
    </Modal>
  );
}
