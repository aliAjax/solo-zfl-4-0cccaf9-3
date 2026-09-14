import type { TimelineEvent } from '../chainTypes';
import { CONCLUSION_META, EVENT_META } from '../chainRules';
import { formatDate } from '@/utils/helpers';

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 单条时间线的中文叙述 */
export default function TimelineEventText({ event }: { event: TimelineEvent }) {
  const p = event.payload;
  let text = '';
  switch (event.type) {
    case 'registered':
      text = `登记入柜，瓶号 ${str(p.code)}「${str(p.name)}」，来源：${str(p.source) || '未填写'}，气味：${str(p.smellType)}`;
      break;
    case 'wait_joined':
      text = `${str(p.requester)} 申请待取，排入第 ${Number(p.position)} 位${p.note ? `（${str(p.note)}）` : ''}`;
      break;
    case 'wait_promoted':
      text = `前一位${str(p.reason)}，${str(p.requester) || '下一位等待者'} 自动接替为队首`;
      break;
    case 'wait_cancelled':
      text = `撤回待取申请，样本回柜${p.requester ? `（申请人：${str(p.requester)}）` : ''}`;
      break;
    case 'loaned':
      text = `借出给 ${str(p.holder)}，取件点：${str(p.pickupPoint)}，用途：${str(p.purpose)}`;
      break;
    case 'returned':
      text = `${str(p.holder)} 原瓶归还回柜${p.note ? `（${str(p.note)}）` : ''}`;
      break;
    case 'transferred':
      text = `${str(p.oldHolder)} 转交给 ${str(p.newHolder)}，新取件点：${str(p.newPickupPoint)}，用途：${str(p.newPurpose)}；旧交接记录结束、生成新记录`;
      break;
    case 'purify_started':
      text = `发起净化（第 ${Number(p.roundSeq)} 轮核对）${p.note ? `：${str(p.note)}` : ''}`;
      break;
    case 'purify_verdict': {
      const c = p.conclusion === 'match' ? CONCLUSION_META.match.label : CONCLUSION_META.mismatch.label;
      text = `核对人 ${str(p.reviewer)} 结论：${c}${p.note ? `（${str(p.note)}）` : ''}`;
      break;
    }
    case 'purify_conflict':
      text = `两名核对人结论不一致，本轮（第 ${Number(p.roundSeq)} 轮）标记冲突，样本返回净化队列等待重新核对`;
      break;
    case 'purify_requeued':
      text = `返回净化队列，开启第 ${Number(p.newRoundSeq)} 轮核对`;
      break;
    case 'purify_completed': {
      const c = p.conclusion === 'match' ? CONCLUSION_META.match.label : CONCLUSION_META.mismatch.label;
      text = `两名核对人结论一致（${c}），净化完成，样本回柜`;
      break;
    }
    case 'sealed':
      text = `封存样本：${str(p.reason)}。封存后不能恢复`;
      break;
  }
  const meta = EVENT_META[event.type];
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className="w-8 h-8 rounded-full bg-paper-100 border border-paper-300 flex items-center justify-center text-sm">
          {meta.emoji}
        </div>
      </div>
      <div className="min-w-0 pb-1">
        <p className="text-sm text-ink-800 leading-relaxed">{text}</p>
        <p className="text-[11px] text-ink-700/45 mt-0.5 font-mono">
          #{event.seq} · {formatDate(event.at)}
        </p>
      </div>
    </div>
  );
}
