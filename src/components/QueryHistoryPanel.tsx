import React, { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import {
  Search,
  Copy,
  Check,
  Play,
  Terminal,
  Clock,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ExternalLink,
} from 'lucide-react';

interface QueryHistoryPanelProps {
  onRunQuery?: (sql: string) => void;
  onInsertQuery?: (sql: string) => void;
}

export const QueryHistoryPanel: React.FC<QueryHistoryPanelProps> = ({
  onRunQuery,
  onInsertQuery,
}) => {
  const { history, clearHistory, openNewQueryTab, showToast } = useAppStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, sql: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(sql);
    setCopiedId(id);
    showToast('📋 Copied SQL query to clipboard', 'info');
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleRun = (sql: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (onRunQuery) {
      onRunQuery(sql);
    } else {
      openNewQueryTab(sql);
      showToast('✨ Running query in new tab', 'info');
    }
  };

  const handleOpenNewTab = (sql: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    openNewQueryTab(sql);
    showToast('✨ Opened query in new tab', 'info');
  };

  const filteredHistory = history.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) {
      return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.sql.toLowerCase().includes(q) ||
      item.connectionName.toLowerCase().includes(q) ||
      item.env.toLowerCase().includes(q) ||
      (item.errorMessage && item.errorMessage.toLowerCase().includes(q))
    );
  });

  const successCount = history.filter((h) => h.status === 'success').length;
  const errorCount = history.filter((h) => h.status === 'error').length;

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-[#141517] font-sans text-xs select-none">
      {/* Header Toolbar */}
      <div className="p-3 bg-slate-50 dark:bg-[#18191c] border-b border-slate-200 dark:border-white/10 flex items-center justify-between space-x-3 shrink-0">
        <div className="flex items-center space-x-2 flex-1">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search query history (SQL statement, database, error)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-[#121315] border border-slate-300 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 transition pl-8"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-2" />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter Segmented Controls */}
          <div className="inline-flex rounded-lg p-0.5 bg-slate-200/80 dark:bg-black/30 border border-slate-300/60 dark:border-white/5 text-[11px] font-medium">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-0.5 rounded-md transition cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-white/15 text-slate-900 dark:text-white font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All ({history.length})
            </button>
            <button
              onClick={() => setStatusFilter('success')}
              className={`px-2.5 py-0.5 rounded-md transition cursor-pointer flex items-center space-x-1 ${
                statusFilter === 'success'
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-emerald-500'
              }`}
            >
              <span>Success</span>
              <span className="text-[10px] font-mono">({successCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('error')}
              className={`px-2.5 py-0.5 rounded-md transition cursor-pointer flex items-center space-x-1 ${
                statusFilter === 'error'
                  ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-rose-500'
              }`}
            >
              <span>Errors</span>
              <span className="text-[10px] font-mono">({errorCount})</span>
            </button>
          </div>
        </div>

        {/* Clear History Button */}
        {history.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm('Clear all query history for this session?')) {
                clearHistory();
                showToast('🗑️ Query history cleared', 'info');
              }
            }}
            className="px-2.5 py-1 text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 transition flex items-center space-x-1 text-[11px] cursor-pointer"
            title="Clear all query history"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* History Items List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 select-text">
        {filteredHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-2 py-16">
            <Clock className="w-8 h-8 opacity-40 text-slate-400" />
            <p className="text-sm font-medium">No queries recorded yet</p>
            <p className="text-xs text-slate-500">
              Queries executed in this session will appear here with execution time and row counts.
            </p>
          </div>
        ) : (
          filteredHistory.map((item) => {
            const isSuccess = item.status === 'success';

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-[#18191c] border border-slate-200 dark:border-white/10 rounded-xl p-3.5 space-y-2.5 hover:border-slate-300 dark:hover:border-white/20 transition-all shadow-xs group"
              >
                {/* Meta Header */}
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center space-x-2">
                    {/* Status Pill */}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border flex items-center space-x-1 ${
                        isSuccess
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                      }`}
                    >
                      {isSuccess ? (
                        <CheckCircle2 className="w-2.5 h-2.5 stroke-[2.5]" />
                      ) : (
                        <AlertCircle className="w-2.5 h-2.5 stroke-[2.5]" />
                      )}
                      <span>{isSuccess ? 'Success' : 'Error'}</span>
                    </span>

                    {/* Environment Pill */}
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${
                        item.env === 'prod'
                          ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30'
                          : item.env === 'staging'
                          ? 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                          : 'bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30'
                      }`}
                    >
                      {item.env}
                    </span>

                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[160px]">
                      {item.connectionName}
                    </span>

                    <span className="text-slate-400 dark:text-slate-600">•</span>

                    <span className="text-slate-500 font-mono text-[11px]">{item.timestamp}</span>
                  </div>

                  {/* Right: Metrics & Actions */}
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {item.durationMs || 1.2} ms
                    </span>
                    <span className="text-slate-400 dark:text-slate-600">•</span>
                    <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                      {item.rowsAffected} {item.rowsAffected === 1 ? 'row' : 'rows'}
                    </span>

                    {/* Action Buttons */}
                    <div className="flex items-center space-x-1 pl-2">
                      <button
                        onClick={(e) => handleRun(item.sql, e)}
                        className="p-1 text-slate-500 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-white/10 rounded-md transition cursor-pointer"
                        title="Re-run query in editor"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>

                      {onInsertQuery && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onInsertQuery(item.sql);
                            showToast('📝 Inserted query into editor', 'info');
                          }}
                          className="p-1 text-slate-500 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-white/10 rounded-md transition cursor-pointer"
                          title="Insert query into SQL Editor"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={(e) => handleOpenNewTab(item.sql, e)}
                        className="p-1 text-slate-500 dark:text-slate-400 hover:text-sky-500 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-white/10 rounded-md transition cursor-pointer"
                        title="Open query in new tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={(e) => handleCopy(item.id, item.sql, e)}
                        className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 rounded-md transition cursor-pointer"
                        title="Copy SQL to clipboard"
                      >
                        {copiedId === item.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* SQL Code Box */}
                <div className="rounded-lg bg-slate-900 dark:bg-[#0e0f11] border border-slate-300/40 dark:border-white/5 p-3 font-mono text-xs text-sky-200 select-text overflow-x-auto leading-relaxed">
                  <pre className="whitespace-pre-wrap">{item.sql}</pre>
                </div>

                {/* Error Box (if any) */}
                {item.errorMessage && (
                  <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 font-mono text-[11px] leading-relaxed">
                    <span className="font-bold">Error: </span>
                    {item.errorMessage}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
