import { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { X, Search, Copy, Play, Check, ChevronDown, ChevronRight, Terminal, Clock, CheckCircle2 } from 'lucide-react';
import { Tooltip } from './Tooltip';

export const QueryHistoryModal = () => {
  const { isHistoryModalOpen, setHistoryModalOpen, history, openNewQueryTab, showToast } = useAppStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [allExpanded, setAllExpanded] = useState(true);

  if (!isHistoryModalOpen) return null;

  const handleCopy = (id: string, sql: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(sql);
    setCopiedId(id);
    showToast('📋 Copied SQL query to clipboard');
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleRunInEditor = (sql: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    openNewQueryTab(sql);
    setHistoryModalOpen(false);
    showToast('✨ Opened in new SQL Query tab');
  };

  const toggleExpand = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedIds((prev) => ({
      ...prev,
      [id]: prev[id] === undefined ? !allExpanded : !prev[id],
    }));
  };

  const toggleAllExpanded = () => {
    const next = !allExpanded;
    setAllExpanded(next);
    const updated: Record<string, boolean> = {};
    history.forEach((h) => {
      updated[h.id] = next;
    });
    setExpandedIds(updated);
  };

  const filteredHistory = history.filter((item) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      item.sql.toLowerCase().includes(query) ||
      item.connectionName.toLowerCase().includes(query) ||
      item.env.toLowerCase().includes(query)
    );
  });

  return (
    <div 
      className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-100"
      onClick={() => setHistoryModalOpen(false)}
    >
      <div 
        className="w-full max-w-4xl h-[700px] max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-black/5 dark:ring-white/10 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Titlebar */}
        <div className="h-11 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between select-none flex-shrink-0">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
              Query History & Audit Log (⌘H)
            </span>
            <span className="text-[10px] text-slate-500 font-mono px-1.5 py-0.2 bg-slate-200/70 dark:bg-slate-800 rounded-full">
              {filteredHistory.length} entries
            </span>
          </div>
          <Tooltip side="left" content="Close" shortcut="Esc">
            <button
              onClick={() => setHistoryModalOpen(false)}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>

        {/* Search & Actions Toolbar */}
        <div className="p-3 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between space-x-3 flex-shrink-0">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search SQL query history by statement, database or environment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700/60 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 transition pl-8 font-sans shadow-2xs"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-2.5" />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={toggleAllExpanded}
            className="h-8 px-3 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 cursor-pointer shrink-0 shadow-2xs"
          >
            {allExpanded ? <ChevronDown className="w-3.5 h-3.5 text-sky-500" /> : <ChevronRight className="w-3.5 h-3.5 text-sky-500" />}
            <span>{allExpanded ? 'Collapse All' : 'Expand All'}</span>
          </button>
        </div>

        {/* History Cards List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs bg-slate-50/50 dark:bg-slate-950/40 select-text">
          {filteredHistory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-2 py-16">
              <Terminal className="w-8 h-8 opacity-40 text-slate-400" />
              <p className="text-sm font-medium">No matching queries found</p>
              <p className="text-xs text-slate-500">Try a different search query or execute new statements</p>
            </div>
          ) : (
            filteredHistory.map((item) => {
              const isExpanded = expandedIds[item.id] !== undefined ? expandedIds[item.id] : allExpanded;

              return (
                <div
                  key={item.id}
                  onDoubleClick={() => handleRunInEditor(item.sql)}
                  className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 space-y-2.5 hover:border-slate-300 dark:hover:border-slate-700 transition shadow-2xs hover:shadow-xs group cursor-pointer"
                >
                  {/* Header Row */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center space-x-2">
                      <Tooltip side="top" content={isExpanded ? 'Collapse query' : 'Expand query'}>
                        <button
                          onClick={(e) => toggleExpand(item.id, e)}
                          className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      </Tooltip>

                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase border ${
                          item.env === 'prod'
                            ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30'
                            : item.env === 'staging'
                            ? 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                            : 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                        }`}
                      >
                        {item.env}
                      </span>

                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {item.connectionName}
                      </span>
                      <span className="text-slate-300 dark:text-slate-600">•</span>
                      <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px] flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{item.timestamp}</span>
                      </span>
                      <span className="px-2 py-0.2 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 rounded-full text-[10px] font-mono border border-emerald-200 dark:border-emerald-500/30 flex items-center space-x-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span>{item.durationMs}ms</span>
                        <span>•</span>
                        <span>{item.rowsAffected} rows</span>
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-1.5">
                      <Tooltip side="top" content="Copy SQL to Clipboard">
                        <button
                          onClick={(e) => handleCopy(item.id, item.sql, e)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1 transition active:scale-95 cursor-pointer shadow-2xs"
                        >
                          {copiedId === item.id ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedId === item.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      </Tooltip>

                      <Tooltip side="top" content="Open in new Query Editor tab">
                        <button
                          onClick={(e) => handleRunInEditor(item.sql, e)}
                          className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 dark:bg-sky-500/20 dark:hover:bg-sky-500/30 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-500/40 rounded-lg text-xs font-semibold flex items-center space-x-1 transition active:scale-95 cursor-pointer shadow-2xs"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Run in Editor</span>
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  {/* SQL Preview Box - Full Query with comfortable reading height when expanded */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`bg-slate-50 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3 font-mono text-[12px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words select-text leading-relaxed ${
                      !isExpanded ? 'max-h-16 overflow-hidden relative cursor-pointer' : 'max-h-96 overflow-y-auto'
                    }`}
                  >
                    {!isExpanded && (
                      <div
                        onClick={(e) => toggleExpand(item.id, e)}
                        className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-50 dark:to-slate-950/90 flex items-end justify-center pb-0.5"
                      >
                        <span className="text-[10px] text-sky-600 dark:text-sky-400 font-sans font-semibold">
                          Click to expand full query...
                        </span>
                      </div>
                    )}
                    {item.sql}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="h-10 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 select-none">
          <span className="font-mono text-[11px]">
            Tip: Double-click any query card to open immediately in a new SQL tab
          </span>
          <button
            onClick={() => setHistoryModalOpen(false)}
            className="px-3 py-1 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold transition active:scale-95 cursor-pointer shadow-2xs"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
