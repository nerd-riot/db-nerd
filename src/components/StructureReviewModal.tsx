import React from 'react';
import { Copy, Check, X, FileCode, AlertTriangle } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface StructureReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  sqlText: string;
  tableName: string;
  engine: string;
  pendingCount: number;
  onApply: () => void;
  onDiscard: () => void;
  isApplying?: boolean;
}

export const StructureReviewModal: React.FC<StructureReviewModalProps> = ({
  isOpen,
  onClose,
  sqlText,
  tableName,
  engine,
  pendingCount,
  onApply,
  onDiscard,
  isApplying = false,
}) => {
  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlText);
  };

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-100 font-sans select-none">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5 dark:ring-white/10 flex flex-col animate-in zoom-in-95 duration-100 max-h-[85vh]">
        {/* Header */}
        <div className="h-12 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <FileCode className="w-4 h-4 text-sky-500" />
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Review Staged Structure Changes — {tableName}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              {engine}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              The following <strong>{pendingCount} DDL statement{pendingCount !== 1 ? 's' : ''}</strong> will be executed against the database table.
            </span>
          </div>
          <span className="font-mono text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
            Transactional DDL
          </span>
        </div>

        {/* Code Content */}
        <div className="p-4 flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800">
          <pre className="font-mono text-xs text-slate-800 dark:text-sky-300 leading-relaxed select-text whitespace-pre-wrap break-all p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-inner">
            {sqlText}
          </pre>
        </div>

        {/* Footer Actions */}
        <div className="h-14 bg-slate-50 dark:bg-slate-950 px-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2">
            <Tooltip content="Copy generated SQL statements to clipboard" side="top">
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition active:scale-95 flex items-center space-x-1.5 cursor-pointer shadow-2xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy SQL</span>
              </button>
            </Tooltip>
            <Tooltip content="Discard all uncommitted structure modifications" side="top">
              <button
                type="button"
                onClick={() => {
                  onDiscard();
                  onClose();
                }}
                className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/20 rounded-lg text-xs font-semibold transition active:scale-95 cursor-pointer"
              >
                Discard
              </button>
            </Tooltip>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-xs font-medium transition cursor-pointer"
            >
              Cancel
            </button>
            <Tooltip content="Apply DDL statements to database table" shortcut="⌘S" side="top">
              <button
                type="button"
                disabled={isApplying}
                onClick={async () => {
                  await onApply();
                  onClose();
                }}
                className="px-4 py-1.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs rounded-lg transition active:scale-95 flex items-center space-x-1.5 shadow-md shadow-sky-500/20 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{isApplying ? 'Applying...' : 'Apply Changes'}</span>
                <kbd className="px-1 py-0.2 rounded bg-black/20 text-[9px] font-mono">⌘S</kbd>
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
};
