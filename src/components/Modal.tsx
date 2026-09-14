import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

/** 与 MemoryModal 视觉一致的弹层壳，移动端从顶部展开、可整屏滚动 */
export default function Modal({ isOpen, onClose, title, subtitle, children, maxWidth = 'max-w-xl' }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-3 pt-4 md:p-6 overflow-y-auto">
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative w-full ${maxWidth} bg-paper-50 rounded-3xl shadow-2xl border border-paper-300 animate-slideDown mb-6`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 md:px-6 py-4 border-b border-paper-200 rounded-t-3xl bg-paper-50/95 backdrop-blur">
          <div className="min-w-0">
            <h2 className="font-serif text-xl md:text-2xl font-bold text-ink-800 leading-snug">{title}</h2>
            {subtitle && <p className="text-sm text-ink-700/60 mt-0.5 font-hand text-base">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-ink-700/60 hover:text-ink-800 hover:bg-paper-200 transition-colors shrink-0"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 md:p-6">{children}</div>
      </div>
    </div>
  );
}
