import { useAppStore } from '../stores/useAppStore';
import {
  RefreshCw,
  PanelRight,
  PanelRightClose,
  PanelLeft,
  PanelLeftClose,
  PanelBottom,
  PanelBottomClose,
  Terminal,
  Database,
  Filter,
  Sliders,
  XCircle,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { HeartbeatDot } from './HeartbeatDot';
import { LedMatrixBanner } from './LedMatrixBanner';
import { BorderChase } from './BorderChase';
import { SafetyModeSelector } from './SafetyModeSelector';

export const Titlebar = () => {
  const {
    activeConnection,
    openSessionIds,
    setConnectionModalOpen,
    setDatabaseModalOpen,
    setRunningQueriesModalOpen,
    pendingEditsCount,
    commitTransaction,
    rollbackTransaction,
    isRightInspectorOpen,
    toggleRightInspector,
    isSidebarOpen,
    toggleSidebar,
    isBottomPanelOpen,
    toggleBottomPanel,
    isFilterBarOpen,
    toggleFilterBar,
    openNewQueryTab,
    isReloading,
    reloadData,
    setSettingsModalOpen,
    sqlTabStates,
    getPendingSQL,
    requestSafetyConfirmation,
    showToast,
  } = useAppStore();

  const isAnyQueryRunning = Object.values(sqlTabStates).some((s) => Boolean((s as any).isExecuting || (s as any).isRunning));

  const handleCommit = async () => {
    const sqlText = getPendingSQL();
    if (!sqlText || sqlText.startsWith('--')) {
      showToast('⚠️ No pending changes in active transaction');
      return;
    }

    const approved = await requestSafetyConfirmation({
      sqlText,
      title: 'Confirm Transaction Commit',
      actionLabel: 'Commit Changes (⌘S)',
      isCommit: true,
    });
    if (!approved) return;

    await commitTransaction();
  };

  const handleDiscard = () => {
    if (confirm("Discard all pending uncommitted edits in active transaction?")) {
      rollbackTransaction();
    }
  };

  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest('button, input, select, textarea, kbd, a')) {
      try {
        const appWindow = getCurrentWindow();
        await appWindow.startDragging();
      } catch (err) {
        console.error('Failed to start dragging window:', err);
      }
    }
  };

  const handleDoubleClick = async (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('button, input, select, textarea, kbd, a')) {
      try {
        const appWindow = getCurrentWindow();
        await appWindow.toggleMaximize();
      } catch (err) {
        console.error('Failed to toggle maximize window:', err);
      }
    }
  };

  return (
    <header 
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      className="drag-region titlebar-grid bg-slate-100/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-300 dark:border-slate-800/80 px-3 select-none z-30 flex-shrink-0 cursor-default"
    >
      {/* Left: Window Controls spacer + Sidebar Toggle + Connection Selector + SQL Capsule + Filter Toggle */}
      <div className="titlebar-left pl-[70px] space-x-1.5 pointer-events-auto">
        {/* Sidebar Toggle */}
        <button
          onClick={toggleSidebar}
          className={`no-drag h-7 w-7 flex items-center justify-center rounded-lg border transition shrink-0 cursor-pointer ${
            isSidebarOpen
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700/80 shadow-xs'
              : 'bg-white/80 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border-slate-300 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
          title="Toggle Sidebar (⌘B)"
        >
          {isSidebarOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
        </button>

        {/* Safety Mode Selector Capsule (TablePlus Style) */}
        <div className="shrink-0">
          <SafetyModeSelector />
        </div>

        {/* Connection Switcher Pill */}
        <button
          onClick={() => setConnectionModalOpen(true)}
          className="no-drag h-7 px-2 sm:px-2.5 flex items-center space-x-1.5 bg-white dark:bg-slate-900/90 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700/80 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white transition shadow-xs group active:scale-[0.98] shrink-0 leading-none cursor-pointer min-w-0"
          title="Connections (⌘K)"
        >
          <HeartbeatDot 
            color={openSessionIds.length === 0 ? 'slate' : activeConnection.connectionStatus === 'failed' ? 'red' : activeConnection.env === 'prod' ? 'red' : activeConnection.env === 'staging' ? 'amber' : 'green'} 
            size="xs" 
            showWave={openSessionIds.length > 0 && activeConnection.connectionStatus !== 'failed'} 
          />
          <Database className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0" />
          <span className="font-mono text-[11px] font-bold truncate max-w-[55px] sm:max-w-[75px] 2xl:max-w-[115px] leading-none text-slate-800 dark:text-slate-200">
            {openSessionIds.length === 0 ? 'No Connection' : activeConnection.name}
          </span>
        </button>

        {/* SQL Query Console Capsule (TablePlus Style) */}
        <button
          onClick={() => openNewQueryTab()}
          className="no-drag h-7 px-2 sm:px-2.5 flex items-center space-x-1.5 bg-white dark:bg-slate-900/90 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 rounded-lg text-xs font-bold text-sky-700 dark:text-sky-300 hover:text-sky-900 dark:hover:text-white transition group shadow-xs active:scale-95 shrink-0 leading-none cursor-pointer"
          title="SQL Query (⌘E / ⌘T)"
        >
          <Terminal className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 group-hover:scale-110 transition-transform shrink-0" />
          <span className="font-mono text-[11px] leading-none hidden 2xl:inline">SQL</span>
        </button>

        {/* Inline Filter Bar Toggle */}
        <button
          onClick={toggleFilterBar}
          className={`no-drag h-7 w-7 hidden 2xl:flex items-center justify-center rounded-lg border transition shrink-0 cursor-pointer ${
            isFilterBarOpen
              ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-500/50 shadow-xs'
              : 'bg-white/80 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border-slate-300 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
          title="Toggle Inline Filters (WHERE / ORDER BY)"
        >
          <Filter className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Center: TablePlus Iconic LED Dot-Matrix Banner with Live Telemetry */}
      <div className="titlebar-center px-2 pointer-events-auto">
        <LedMatrixBanner onOpenDatabaseModal={() => setDatabaseModalOpen(true)} />
      </div>

      {/* Right: Clean, un-cluttered actions matching TablePlus */}
      <div className="titlebar-right space-x-1.5 pointer-events-auto">
        {pendingEditsCount > 0 && (
          <div className="flex items-center space-x-1.5 animate-in fade-in">
            <div className="h-7 px-2 bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-semibold flex items-center space-x-1 leading-none shrink-0">
              <HeartbeatDot color="amber" size="xs" showWave={true} />
              <span>{pendingEditsCount}</span>
            </div>
            <button
              onClick={handleDiscard}
              className="no-drag h-7 px-2.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition flex items-center leading-none shrink-0 cursor-pointer"
              title="Discard Uncommitted Edits (⌘Z)"
            >
              Discard
            </button>
            <button
              onClick={handleCommit}
              className="no-drag h-7 px-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs rounded-lg transition flex items-center space-x-1.5 shadow-md shadow-sky-500/20 active:scale-95 leading-none shrink-0 cursor-pointer"
              title="Commit Changes (⌘S)"
            >
              <span>Commit</span>
              <kbd className="px-1 py-0.5 bg-black/20 rounded text-[9px] font-mono text-white font-extrabold leading-none">⌘S</kbd>
            </button>
          </div>
        )}

        {/* Running Query Cancel Action (Only appears when queries are executing) */}
        {isAnyQueryRunning && (
          <button
            onClick={() => setRunningQueriesModalOpen(true)}
            className="no-drag h-7 px-2.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 cursor-pointer shadow-2xs"
            title="Active Query Running — Click to View / Cancel (⌘.)"
          >
            <XCircle className="w-3.5 h-3.5 animate-spin text-rose-500" />
            <span className="font-mono text-[11px]">Cancel</span>
          </button>
        )}

        {/* Sharp Unified Toolbar Segmented Cluster (h-7 matching height) */}
        <div className="flex items-center bg-slate-200/90 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700/80 rounded-lg p-0.5 space-x-0.5 shadow-xs">
          {/* Reload Data */}
          <button
            onClick={() => reloadData()}
            className={`no-drag relative overflow-hidden h-6 w-6 flex items-center justify-center rounded hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition active:scale-95 cursor-pointer ${
              isReloading ? 'text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-950/40' : ''
            }`}
            title="Reload Schema & Refresh (⌘R)"
          >
            {isReloading && (
              <BorderChase color="sky" dual={true} speed="fast" borderWidth={1.5} glow={true} />
            )}
            <RefreshCw className={`relative z-1 w-3.5 h-3.5 ${isReloading ? 'text-sky-600 dark:text-sky-400 animate-pulse' : ''}`} />
          </button>

          {/* Preferences & Settings */}
          <button
            onClick={() => setSettingsModalOpen(true)}
            className="no-drag h-6 w-6 flex items-center justify-center rounded hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition active:scale-95 cursor-pointer"
            title="Settings & Themes (⌘,)"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>

          {/* Toggle Bottom Console / Query Log Panel */}
          <button
            onClick={toggleBottomPanel}
            className={`no-drag h-6 w-6 flex items-center justify-center rounded transition active:scale-95 cursor-pointer ${
              isBottomPanelOpen
                ? 'bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 shadow-2xs font-bold'
                : 'hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
            title="Toggle Bottom Console Panel (⌘J)"
          >
            {isBottomPanelOpen ? <PanelBottomClose className="w-3.5 h-3.5" /> : <PanelBottom className="w-3.5 h-3.5" />}
          </button>

          {/* Toggle Right Inspector Panel */}
          <button
            onClick={toggleRightInspector}
            className={`no-drag h-6 w-6 flex items-center justify-center rounded transition active:scale-95 cursor-pointer ${
              isRightInspectorOpen
                ? 'bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 shadow-2xs font-bold'
                : 'hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
            title="Toggle Right Inspector Panel (⌘I)"
          >
            {isRightInspectorOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </header>
  );
};
