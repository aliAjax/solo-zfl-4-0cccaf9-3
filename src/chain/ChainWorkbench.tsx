import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ClipboardList,
  ListOrdered,
  Plus,
  RotateCcw,
  ScrollText,
  Search,
} from 'lucide-react';
import { useChainStore } from './chainStore';
import type { Vial, VialStatus } from './chainTypes';
import VialCard from './components/VialCard';
import VialDetailModal from './components/VialDetailModal';
import ActionModal, { type ActionMode } from './components/ActionModal';
import TimelineEventText from './components/TimelineEventText';

type Tab = 'vials' | 'queue' | 'timeline';

const FILTERS: { key: VialStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'in_cabinet', label: '🗄️ 在柜' },
  { key: 'waiting', label: '⏳ 待取' },
  { key: 'on_loan', label: '🤲 借出' },
  { key: 'purifying', label: '🧪 净化' },
  { key: 'sealed', label: '🔒 封存' },
];

export default function ChainWorkbench() {
  const chain = useChainStore((s) => s.state);
  const initIfEmpty = useChainStore((s) => s.initIfEmpty);
  const resetDemo = useChainStore((s) => s.resetDemo);

  const [tab, setTab] = useState<Tab>('vials');
  const [filter, setFilter] = useState<VialStatus | 'all'>('all');
  const [keyword, setKeyword] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [action, setAction] = useState<{ mode: ActionMode; vialId: string | null } | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'warn' } | null>(null);
  const [actionNonce, setActionNonce] = useState(0);

  useEffect(() => {
    initIfEmpty();
  }, [initIfEmpty]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (msg: string, kind: 'ok' | 'warn' = 'ok') => setToast({ msg, kind });

  const vialById = useMemo(() => new Map(chain.vials.map((v) => [v.id, v])), [chain.vials]);
  const detailVial = detailId ? vialById.get(detailId) ?? null : null;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: chain.vials.length };
    for (const v of chain.vials) c[v.status] = (c[v.status] ?? 0) + 1;
    return c;
  }, [chain.vials]);

  const visibleVials = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return chain.vials.filter((v) => {
      if (filter !== 'all' && v.status !== filter) return false;
      if (kw && !`${v.code} ${v.name} ${v.source} ${v.smellType}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [chain.vials, filter, keyword]);

  const openDetail = (v: Vial) => setDetailId(v.id);
  const openAction = (mode: ActionMode, vial: Vial | null) => {
    setAction({ mode, vialId: vial?.id ?? null });
    setActionNonce((n) => n + 1);
  };

  const handleReset = () => {
    if (window.confirm('重置演示数据？当前所有变更将被覆盖。')) {
      resetDemo();
      setDetailId(null);
      showToast('演示数据已重置');
    }
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'vials', label: '样本', icon: <ClipboardList className="w-4 h-4" /> },
    { key: 'queue', label: `待取队列 ${chain.waitQueue.length ? `(${chain.waitQueue.length})` : ''}`, icon: <ListOrdered className="w-4 h-4" /> },
    { key: 'timeline', label: `时间线 (${chain.timeline.length})`, icon: <ScrollText className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen">
      {/* 顶部 */}
      <header className="pt-8 pb-5 md:pt-12 md:pb-7">
        <div className="container max-w-5xl">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-ink-700/60 hover:text-ochre-600 transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" /> 返回气味档案
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="font-serif text-3xl md:text-4xl font-bold text-ink-800">
                样本<span className="text-ochre-500">保管链</span>工作台
              </h1>
              <p className="mt-1.5 font-hand text-lg text-ink-700/70">
                在柜 · 待取 · 借出 · 净化 · 封存，流转全程留痕
              </p>
            </div>
            <div className="flex gap-2 self-start sm:self-auto">
              <button onClick={() => openAction('register', null)} className="btn-primary inline-flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> 登记样本
              </button>
              <button onClick={handleReset} className="btn-ghost !px-3" title="重置演示数据" aria-label="重置演示数据">
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="mt-5 h-px w-full" style={{ background: 'linear-gradient(90deg, transparent 0%, #CBB993 20%, #CBB993 80%, transparent 100%)' }} />
        </div>
      </header>

      <main className="container max-w-5xl pb-24">
        {/* 标签页 */}
        <div className="flex gap-1.5 p-1 rounded-2xl bg-paper-200/70 border border-paper-300 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 min-w-max inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all whitespace-nowrap ${
                tab === t.key ? 'bg-paper-50 text-ochre-700 shadow-paper' : 'text-ink-700/65 hover:text-ink-800'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* 样本页 */}
        {tab === 'vials' && (
          <div className="mt-5 animate-fadeInUp">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      filter === f.key
                        ? 'bg-ochre-500 text-paper-50 border-ochre-500'
                        : 'bg-paper-50 text-ink-700/70 border-paper-300 hover:bg-paper-200'
                    }`}
                  >
                    {f.label} {counts[f.key] != null && <span className="opacity-60">{counts[f.key]}</span>}
                  </button>
                ))}
              </div>
              <div className="relative sm:w-64 sm:ml-auto">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-700/40" />
                <input
                  className="scent-input !py-2 !pl-9 text-sm"
                  placeholder="搜索瓶号 / 名称 / 来源"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </div>
            </div>

            {visibleVials.length === 0 ? (
              <div className="mt-8 bg-paper-50/70 rounded-3xl border-2 border-dashed border-paper-400 py-16 text-center">
                <div className="text-5xl mb-3">🧫</div>
                <p className="text-ink-700/60 text-sm">没有符合条件的样本{keyword ? '，换个关键词试试' : ''}</p>
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {visibleVials.map((v) => (
                  <VialCard key={v.id} vial={v} state={chain} onOpen={openDetail} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 待取队列页 */}
        {tab === 'queue' && (
          <div className="mt-5 animate-fadeInUp">
            <div className="rounded-2xl bg-paper-50/80 border border-paper-300 p-4 mb-4 text-sm text-ink-700/70">
              待取按登记顺序排队；仅队首可办理借出。撤回或借出后，由下一位自动接替，并在时间线留下交接记录。
            </div>
            {chain.waitQueue.length === 0 ? (
              <div className="bg-paper-50/70 rounded-3xl border-2 border-dashed border-paper-400 py-16 text-center">
                <div className="text-5xl mb-3">🕊️</div>
                <p className="text-ink-700/60 text-sm">当前没有待取样本，在柜样本可申请待取</p>
              </div>
            ) : (
              <ol className="space-y-2.5">
                {chain.waitQueue.map((id, i) => {
                  const v = vialById.get(id);
                  if (!v) return null;
                  return (
                    <li
                      key={id}
                      className={`flex items-center gap-3 rounded-2xl border p-3.5 ${
                        i === 0 ? 'border-ochre-300 bg-ochre-50/60 shadow-paper' : 'border-paper-300 bg-paper-50/80'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-serif font-bold text-lg shrink-0 ${
                        i === 0 ? 'bg-ochre-500 text-paper-50' : 'bg-paper-200 text-ochre-700'
                      }`}>
                        {i + 1}
                      </div>
                      <button type="button" className="flex-1 min-w-0 text-left" onClick={() => openDetail(v)}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-ochre-700">{v.code}</span>
                          <span className="font-serif font-bold text-ink-800 truncate">{v.name}</span>
                          {i === 0 && <span className="scent-tag text-[10px] bg-ochre-100 text-ochre-600 shrink-0">队首可取</span>}
                        </div>
                        <p className="text-xs text-ink-700/60 mt-0.5 truncate">
                          申领人 {v.waitRequester}
                          {v.waitSince ? ` · ${new Date(v.waitSince).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                        </p>
                      </button>
                      {i === 0 ? (
                        <button className="btn-primary !py-2 !px-3 text-sm shrink-0" onClick={() => openAction('loan', v)}>借出</button>
                      ) : null}
                      <button className="btn-secondary !py-2 !px-3 text-sm shrink-0" onClick={() => openAction('cancel_wait', v)}>撤回</button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}

        {/* 时间线页 */}
        {tab === 'timeline' && (
          <div className="mt-5 animate-fadeInUp">
            <div className="rounded-2xl bg-paper-50/80 border border-paper-300 p-4 mb-4 text-sm text-ink-700/70 flex items-start gap-2">
              <span>🔐</span>
              <span>时间线只追加、不可改写；每次操作一条记录，重复提交不会产生新记录。共 {chain.timeline.length} 条。</span>
            </div>
            <div className="rounded-2xl border border-paper-300 bg-paper-50/60 p-4 md:p-5 space-y-4">
              {chain.timeline.slice().reverse().map((e) => {
                const v = vialById.get(e.vialId);
                return (
                  <div key={e.id}>
                    {v && (
                      <button
                        type="button"
                        onClick={() => openDetail(v)}
                        className="mb-1 inline-flex items-center gap-1.5 text-xs text-ochre-700 hover:text-ochre-600"
                      >
                        <span className="font-mono px-1.5 py-0.5 rounded bg-paper-200 font-semibold">{v.code}</span>
                        <span className="truncate max-w-[12rem] sm:max-w-xs">{v.name}</span>
                      </button>
                    )}
                    <TimelineEventText event={e} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* 详情与操作弹层 */}
      <VialDetailModal
        isOpen={!!detailVial}
        vial={detailVial}
        state={chain}
        onClose={() => setDetailId(null)}
        onAction={(mode, v) => openAction(mode, v)}
      />
      {action && (
        <ActionModal
          key={actionNonce}
          mode={action.mode}
          vial={action.vialId ? vialById.get(action.vialId) ?? null : null}
          isOpen
          onClose={() => setAction(null)}
          onToast={showToast}
        />
      )}

      {/* 提示条 */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] animate-slideDown w-max max-w-[92vw]">
          <div className={`rounded-full px-4 py-2.5 text-sm shadow-paper-hover border ${
            toast.kind === 'ok'
              ? 'bg-moss-500 text-paper-50 border-moss-600'
              : 'bg-ochre-500 text-paper-50 border-ochre-600'
          }`}>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
