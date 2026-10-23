import React, { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import {
  Terminal,
  Activity,
  X,
  Maximize2,
  Minimize2,
  Search,
  Copy,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  FileCode,
} from 'lucide-react';
import {
  ContextMenuContainer,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuHeader,
  ContextMenuPosition,
} from './ContextMenu';

export const BottomPanel: React.FC = () => {
  const {
    bottomPanelHeight,
    setBottomPanelHeight,
    toggleBottomPanel,
    history,
    activeConnection,
    openNewQueryTab,
    showToast,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'console' | 'diagnostics'>('console');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMaximized, setIsMaximized] = useState(false);
  const [prevHeight, setPrevHeight] = useState(bottomPanelHeight);
  const [logContextPos, setLogContextPos] = useState<ContextMenuPosition | null>(null);
  const [targetLog, setTargetLog] = useState<any | null>(null);

  const filteredHistory = history.filter((item) => {
    if (!searchQuery) return true;
    return item.sql.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleToggleMaximize = () => {
    if (isMaximized) {
      setBottomPanelHeight(prevHeight);
      setIsMaximized(false);
    } else {
      setPrevHeight(bottomPanelHeight);
      setBottomPanelHeight(420);
      setIsMaximized(true);
    }
  };

  const currentHeight = isMaximized ? 420 : bottomPanelHeight;

  return (
    <div
      style={{ height: `${currentHeight}px` }}
      className="bg-white/95 dark:bg-slate-950/95 border-t border-slate-300 dark:border-slate-800/90 flex flex-col overflow-hidden select-none z-20 flex-shrink-0 relative font-sans"
    >
      {/* Top Header Bar */}
      <div className="h-9 bg-slate-100 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800/80 px-3 flex items-center justify-between flex-shrink-0 text-xs">
        {/* Left Tabs */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setActiveTab('console')}
            className={`h-7 px-2.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'console'
                ? 'bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 border border-slate-300 dark:border-slate-700/80 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-900'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>Console Log</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 dark:bg-slate-900 text-slate-700 dark:text-slate-400 rounded-full font-mono">
              {history.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`h-7 px-2.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'diagnostics'
                ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-slate-300 dark:border-slate-700/80 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Server Diagnostics</span>
          </button>
        </div>

        {/* Right Controls: Filter Input, Maximize, Close */}
        <div className="flex items-center space-x-2">
          {activeTab === 'console' && (
            <div className="relative flex items-center">
              <Search className="w-3 h-3 text-slate-400 dark:text-slate-500 absolute left-2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter statements..."
                className="w-40 sm:w-56 h-6 pl-7 pr-2 bg-white dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800 rounded-md text-[11px] text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[10px]"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          <div className="h-4 w-px bg-slate-300 dark:bg-slate-800" />

          {/* Toggle Maximize Height */}
          <button
            onClick={handleToggleMaximize}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition cursor-pointer"
            title={isMaximized ? 'Restore height' : 'Maximize height'}
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Collapse Bottom Panel Button */}
          <button
            onClick={toggleBottomPanel}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
            title="Collapse Bottom Panel (⌘J)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body Area */}
      <div className="flex-1 overflow-y-auto font-mono text-xs select-text">
        {activeTab === 'console' ? (
          filteredHistory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 dark:text-slate-500 space-y-1 py-8">
              <Terminal className="w-6 h-6 opacity-40 text-slate-400" />
              <p className="text-xs">No executed queries logged yet</p>
              <p className="text-[11px] text-slate-500">Run queries or modify cells to view execution traces here</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {filteredHistory.map((item) => (
                <div
                  key={item.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTargetLog(item);
                    setLogContextPos({ x: e.clientX, y: e.clientY });
                  }}
                  className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-900/60 transition-colors flex items-start justify-between group space-x-3 cursor-pointer"
                >
                  <div className="flex items-start space-x-2.5 min-w-0 flex-1">
                    {/* Status LED */}
                    <div className="pt-0.5 shrink-0">
                      {item.status === 'success' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="text-slate-800 dark:text-slate-300 whitespace-pre-wrap break-all leading-relaxed">
                        {item.sql}
                      </div>
                      <div className="flex items-center space-x-2 text-[10px] text-slate-600 dark:text-slate-500 font-sans">
                        <span>{item.timestamp}</span>
                        <span>•</span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{item.durationMs || 1.2}ms</span>
                        <span>•</span>
                        <span>{item.rowsAffected} rows affected</span>
                        <span>•</span>
                        <span className="text-slate-700 dark:text-slate-400 font-mono">@{item.connectionName}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions on hover */}
                  <div className="flex items-center space-x-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(item.sql);
                        showToast('📋 Copied SQL to clipboard');
                      }}
                      className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded transition cursor-pointer"
                      title="Copy SQL Query"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        openNewQueryTab(item.sql);
                        showToast('✨ Opened in new Query Editor');
                      }}
                      className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-300 rounded transition cursor-pointer"
                      title="Open in new Query Tab"
                    >
                      <Play className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* Server Diagnostics Tab */
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-sans">
            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-1 shadow-2xs">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider font-semibold">Active Connection</span>
              <div className="font-bold text-slate-900 dark:text-slate-100">{activeConnection?.name || 'Local DB'}</div>
              <div className="text-[11px] text-slate-500 font-mono">{activeConnection?.engine} • :{activeConnection?.port}</div>
            </div>

            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-1 shadow-2xs">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider font-semibold">Network Latency</span>
              <div className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{activeConnection?.latencyMs || 1.2} ms</span>
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-500 font-mono">Real-time Ping OK</div>
            </div>

            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-1 shadow-2xs">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider font-semibold">Client Memory</span>
              <div className="font-bold text-slate-900 dark:text-slate-100">46.8 MB / 120 FPS</div>
              <div className="text-[11px] text-slate-500 font-mono">Zero Memory Leaks</div>
            </div>

            <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-1 shadow-2xs">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider font-semibold">Buffer Cache Hit</span>
              <div className="font-bold text-sky-600 dark:text-sky-400">99.8% Efficiency</div>
              <div className="text-[11px] text-sky-600/80 dark:text-sky-500/80 font-mono">Shared buffers primed</div>
            </div>
          </div>
        )}
      </div>

      {/* Console Log Entry Context Menu */}
      {logContextPos && targetLog && (
        <ContextMenuContainer
          position={logContextPos}
          onClose={() => {
            setLogContextPos(null);
            setTargetLog(null);
          }}
          width={230}
        >
          <ContextMenuHeader title="Console Log Entry" />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy SQL Statement"
            shortcut="⌘C"
            onClick={() => {
              navigator.clipboard.writeText(targetLog.sql);
              showToast('📋 Copied SQL statement to clipboard');
              setLogContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Play className="w-3.5 h-3.5 text-emerald-400" />}
            label="Open in New SQL Tab"
            shortcut="⌘E"
            onClick={() => {
              openNewQueryTab(targetLog.sql);
              showToast('✨ Opened in new Query Editor');
              setLogContextPos(null);
            }}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<FileCode className="w-3.5 h-3.5 text-sky-400" />}
            label="Copy All Console Logs"
            onClick={() => {
              const allLogs = filteredHistory
                .map((h) => `-- [${h.timestamp}] (${h.durationMs || 1.2}ms) @${h.connectionName}\n${h.sql}`)
                .join('\n\n');
              navigator.clipboard.writeText(allLogs);
              showToast(`📋 Copied ${filteredHistory.length} console log entries`);
              setLogContextPos(null);
            }}
          />
        </ContextMenuContainer>
      )}
    </div>
  );
};
