import { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { X, Check, Copy, Terminal, Play } from 'lucide-react';

export const SqlDiffModal = () => {
  const { isSqlDiffModalOpen, setSqlDiffModalOpen, getPendingSQL, commitTransaction, pendingEditsCount } = useAppStore();
  const [copied, setCopied] = useState(false);

  if (!isSqlDiffModalOpen) return null;

  const sqlText = getPendingSQL();

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCommitNow = async () => {
    const result = await commitTransaction();
    if (result.count > 0) {
      alert(`✅ Transaction Committed Successfully!\n\nExecuted ${result.count} statements.\nAll locks released.`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-100">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-black/5 dark:ring-white/10 font-sans">
        
        {/* Header */}
        <div className="h-11 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between select-none">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Pending Changes — SQL Preview</span>
            <span className="text-[10px] px-2 py-0.5 bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 rounded font-mono font-bold">
              {pendingEditsCount} Pending
            </span>
          </div>
          <button
            onClick={() => setSqlDiffModalOpen(false)}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* SQL Diff Code Box */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 font-mono text-xs overflow-y-auto max-h-[380px] select-text">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-2 font-sans flex items-center justify-between">
            <span>Generated atomic transaction statements ready to execute:</span>
            <button
              onClick={handleCopy}
              className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-[10px] font-semibold flex items-center space-x-1 cursor-pointer active:scale-95"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy SQL'}</span>
            </button>
          </div>

          <pre className="text-sky-800 dark:text-sky-300 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-lg p-3 overflow-x-auto leading-relaxed shadow-2xs font-mono">
            {sqlText}
          </pre>
        </div>

        {/* Footer */}
        <div className="h-12 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between select-none">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Press <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded text-[10px] text-slate-700 dark:text-slate-300 font-mono">⌘S</kbd> to Commit or <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded text-[10px] text-slate-700 dark:text-slate-300 font-mono">⌘Z</kbd> to Rollback
          </span>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSqlDiffModalOpen(false)}
              className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleCommitNow}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center space-x-1.5 shadow-xs active:scale-95 cursor-pointer"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Commit Now (⌘S)</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
