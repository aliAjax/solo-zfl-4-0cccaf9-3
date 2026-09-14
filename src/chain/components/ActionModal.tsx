import { useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { useChainStore } from '../chainStore';
import { newClientToken } from '@/utils/helpers';
import { CONCLUSION_META } from '../chainRules';
import { SMELL_TYPES } from '@/utils/constants';
import type { PurifyConclusion, Vial } from '../chainTypes';

export type ActionMode =
  | 'register'
  | 'wait'
  | 'cancel_wait'
  | 'loan'
  | 'return'
  | 'transfer'
  | 'purify_start'
  | 'verdict'
  | 'seal';

const MODE_TITLE: Record<ActionMode, { title: string; subtitle: string; emoji: string }> = {
  register: { title: '登记新样本瓶', subtitle: '登记后默认在柜', emoji: '📝' },
  wait: { title: '申请待取', subtitle: '按登记顺序排队，撤回后由下一位自动接替', emoji: '🙋' },
  cancel_wait: { title: '撤回待取', subtitle: '撤回后样本回柜，下一位自动接替', emoji: '↩️' },
  loan: { title: '办理借出', subtitle: '须登记持有人、取件点和用途', emoji: '🤲' },
  return: { title: '原瓶归还', subtitle: '确认封签完好后归还回柜', emoji: '📥' },
  transfer: { title: '转交持有人', subtitle: '生成新交接记录并结束旧记录', emoji: '🔁' },
  purify_start: { title: '发起净化', subtitle: '双人一致相符才完成回柜；一致异常则隔离待处理，冲突将重新排队', emoji: '🧪' },
  verdict: { title: '提交净化核对结论', subtitle: '两名核对人不得为同一人', emoji: '🔍' },
  seal: { title: '封存样本', subtitle: '封存后不能恢复，请谨慎确认', emoji: '🔒' },
};

interface Props {
  mode: ActionMode;
  vial: Vial | null;
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string, kind?: 'ok' | 'warn') => void;
}

export default function ActionModal({ mode, vial, isOpen, onClose, onToast }: Props) {
  const dispatch = useChainStore((s) => s.dispatch);
  const currentHolder = useChainStore((s) =>
    vial?.currentLoanId ? s.state.loans.find((l) => l.id === vial.currentLoanId)?.holder ?? '—' : '—',
  );
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [smellType, setSmellType] = useState(SMELL_TYPES[0].label);
  const [requester, setRequester] = useState('');
  const [holder, setHolder] = useState(vial?.waitRequester ?? '');
  const [pickup, setPickup] = useState('');
  const [purpose, setPurpose] = useState('');
  const [newHolder, setNewHolder] = useState('');
  const [newPickup, setNewPickup] = useState('');
  const [newPurpose, setNewPurpose] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [conclusion, setConclusion] = useState<PurifyConclusion>('match');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // 每次打开只生成一个 token：重复点击 / 刷新式重放都不会增加第二条记录
  const tokenRef = useRef('');
  if (isOpen && !tokenRef.current) tokenRef.current = newClientToken();
  if (!isOpen && tokenRef.current) tokenRef.current = '';

  const meta = MODE_TITLE[mode];
  const title = mode === 'purify_start' && vial?.status === 'abnormal' ? '🔬 异常样本重新送检' : `${meta.emoji} ${meta.title}`;

  const close = () => {
    setError('');
    setSubmitting(false);
    setNote('');
    onClose();
  };

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenRef.current) tokenRef.current = newClientToken();
    if (submitting) return;
    setSubmitting(true);
    const token = tokenRef.current;
    let res: { error?: string; idempotent?: boolean } = { error: '未知操作' };

    switch (mode) {
      case 'register':
        res = dispatch({ type: 'register', clientToken: token, name, source, smellType, note });
        break;
      case 'wait':
        if (vial) res = dispatch({ type: 'request_wait', clientToken: token, vialId: vial.id, requester, note });
        break;
      case 'cancel_wait':
        if (vial) res = dispatch({ type: 'cancel_wait', clientToken: token, vialId: vial.id });
        break;
      case 'loan':
        if (vial) res = dispatch({ type: 'loan', clientToken: token, vialId: vial.id, holder, pickupPoint: pickup, purpose });
        break;
      case 'return':
        if (vial) res = dispatch({ type: 'return_loan', clientToken: token, vialId: vial.id, note });
        break;
      case 'transfer':
        if (vial)
          res = dispatch({
            type: 'transfer',
            clientToken: token,
            vialId: vial.id,
            newHolder,
            newPickupPoint: newPickup,
            newPurpose,
            note,
          });
        break;
      case 'purify_start':
        if (vial) res = dispatch({ type: 'purify_start', clientToken: token, vialId: vial.id, note });
        break;
      case 'verdict':
        if (vial) res = dispatch({ type: 'purify_verdict', clientToken: token, vialId: vial.id, reviewer, conclusion, note });
        break;
      case 'seal':
        if (vial) res = dispatch({ type: 'seal', clientToken: token, vialId: vial.id, reason });
        break;
    }

    if (res.idempotent) {
      close();
      onToast('该操作已提交过，重复提交不会增加记录', 'warn');
      return;
    }
    if (res.error) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    close();
    onToast('操作已记录，时间线不可改写');
  };

  const labelCls = 'block text-sm font-medium text-ink-700 mb-1.5';

  return (
    <Modal isOpen={isOpen} onClose={close} title={title} subtitle={subtitle(vial, vial?.status === 'abnormal' && mode === 'purify_start' ? '异常隔离样本重新进入净化核对，结果将记入时间线' : meta.subtitle)}>
      <form onSubmit={handle} className="space-y-4">
        {mode === 'register' && (
          <>
            <div>
              <label className={labelCls}>样本名称 *</label>
              <input className="scent-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：老衣柜樟木香" required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>来源 / 采集地点</label>
                <input className="scent-input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="例如：外婆家东厢房" />
              </div>
              <div>
                <label className={labelCls}>气味类型</label>
                <select className="scent-select" value={smellType} onChange={(e) => setSmellType(e.target.value)}>
                  {SMELL_TYPES.map((t) => (
                    <option key={t.value} value={t.label}>
                      {t.emoji} {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>备注</label>
              <textarea className="scent-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </>
        )}

        {mode === 'wait' && (
          <>
            <div>
              <label className={labelCls}>申领人 *</label>
              <input className="scent-input" value={requester} onChange={(e) => setRequester(e.target.value)} placeholder="谁来取这瓶样本？" required />
            </div>
            <div>
              <label className={labelCls}>申请说明</label>
              <textarea className="scent-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="用途或期望取件时间（可选）" />
            </div>
          </>
        )}

        {mode === 'cancel_wait' && (
          <div className="rounded-xl bg-paper-100 border border-paper-300 p-4 text-sm text-ink-700">
            确认撤回 <b className="font-mono text-ochre-700">{vial?.code}</b>「{vial?.name}」的待取申请？
            撤回后样本回到在柜；若它是队首，<b>下一位将自动接替</b>并在时间线留下交接记录。
          </div>
        )}

        {mode === 'loan' && (
          <>
            <div>
              <label className={labelCls}>持有人 *</label>
              <input className="scent-input" value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="实际领取并保管的人" required />
            </div>
            <div>
              <label className={labelCls}>取件点 *</label>
              <input className="scent-input" value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="例如：前门收发室" required />
            </div>
            <div>
              <label className={labelCls}>用途 *</label>
              <textarea className="scent-textarea" rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="借出做什么？预计多久？" required />
            </div>
          </>
        )}

        {mode === 'return' && (
          <div>
            <label className={labelCls}>归还备注</label>
            <textarea className="scent-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：封签完好，原瓶回柜" />
          </div>
        )}

        {mode === 'transfer' && (
          <>
            <div className="rounded-xl bg-paper-100 border border-paper-300 px-3 py-2 text-xs text-ink-700/70">
              当前持有人：<b>{currentHolder}</b>
              ，转交后其交接记录将结束。
            </div>
            <div>
              <label className={labelCls}>新持有人 *</label>
              <input className="scent-input" value={newHolder} onChange={(e) => setNewHolder(e.target.value)} placeholder="转交给谁？" required />
            </div>
            <div>
              <label className={labelCls}>取件点 *</label>
              <input className="scent-input" value={newPickup} onChange={(e) => setNewPickup(e.target.value)} placeholder="新持有人在哪取件？" required />
            </div>
            <div>
              <label className={labelCls}>用途 *</label>
              <textarea className="scent-textarea" rows={2} value={newPurpose} onChange={(e) => setNewPurpose(e.target.value)} placeholder="新持有人的使用目的" required />
            </div>
            <div>
              <label className={labelCls}>交接备注</label>
              <textarea className="scent-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：当面交接并核验封签完整" />
            </div>
          </>
        )}

        {mode === 'purify_start' && (
          <div>
            {vial?.status === 'abnormal' && (
              <div className="mb-3 rounded-xl bg-brick-400/10 border border-brick-400/40 px-3.5 py-2.5 text-xs text-brick-600">
                该样本此前双人一致判定异常、处于隔离。重新送检将开启新一轮核对。
              </div>
            )}
            <label className={labelCls}>净化原因 / 备注</label>
            <textarea className="scent-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：读者反映气味偏淡；发起后等待两名核对人结论" />
          </div>
        )}

        {mode === 'verdict' && (
          <>
            <div>
              <label className={labelCls}>核对人姓名 *</label>
              <input className="scent-input" value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="本轮第一位/第二位核对人" required />
            </div>
            <div>
              <label className={labelCls}>核对结论 *</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(CONCLUSION_META) as PurifyConclusion[]).map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setConclusion(c)}
                    className={`py-3 rounded-xl text-sm font-medium border transition-all ${
                      conclusion === c
                        ? c === 'match'
                          ? 'bg-moss-500 text-paper-50 border-moss-500'
                          : 'bg-brick-500 text-paper-50 border-brick-500'
                        : 'bg-paper-100 text-ink-700 border-paper-200 hover:bg-paper-200'
                    }`}
                  >
                    {CONCLUSION_META[c].emoji} {CONCLUSION_META[c].label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-ink-700/50 mt-1.5">两人一致相符 → 净化完成回柜；一致异常 → 隔离待处理（不可预约 / 借出）；结论冲突 → 自动返回净化队列重新核对。</p>
            </div>
            <div>
              <label className={labelCls}>核对备注</label>
              <textarea className="scent-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </>
        )}

        {mode === 'seal' && (
          <>
            <div className="rounded-xl bg-brick-400/10 border border-brick-400/40 p-3 text-sm text-brick-600">
              {vial?.status === 'abnormal'
                ? '⚠️ 对异常待处理样本做封存处置：封存为终态，之后不能恢复、不能再送检或借出。'
                : '⚠️ 封存为终态操作，封存后不能恢复，也不能再借出或净化。'}
            </div>
            <div>
              <label className={labelCls}>{vial?.status === 'abnormal' ? '封存处置原因 *' : '封存原因 *'}</label>
              <textarea className="scent-textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={vial?.status === 'abnormal' ? '例如：复检确认变质，按异常样本封存处置' : '例如：活性成分衰减，长期保存不再出库'} required />
            </div>
          </>
        )}

        {error && (
          <div className="rounded-xl bg-brick-400/10 border border-brick-400/40 px-4 py-3 text-sm text-brick-600 flex items-start gap-2">
            <span className="shrink-0">⛔</span>
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-paper-200">
          <button type="button" onClick={close} className="btn-secondary">
            取消
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={`btn-primary disabled:opacity-50 ${mode === 'seal' ? '!bg-ink-800 hover:!bg-ink-900' : ''}`}
          >
            {submitting ? '提交中…' : mode === 'seal' ? '确认封存' : '确认提交'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function subtitle(vial: Vial | null, fallback: string): string {
  if (!vial) return fallback;
  return `${vial.code} · ${vial.name} — ${fallback}`;
}
