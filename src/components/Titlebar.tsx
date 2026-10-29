import { useShallow } from 'zustand/react/shallow';
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
  FileCode,
  RotateCcw,
  Check,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { HeartbeatDot } from './HeartbeatDot';
import { LedMatrixBanner } from './LedMatrixBanner';
import { BorderChase } from './BorderChase';
import { SafetyModeSelector } from './SafetyModeSelector';
import { IS_BETA } from '../config/channel';
import { Tooltip } from './Tooltip';

export const Titlebar = () => {
  const {
    activeConnection,
    openSessionIds,
    setConnectionModalOpen,
    setDatabaseModalOpen,
    setRunningQueriesModalOpen,
    setSqlDiffModalOpen,
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
  } = useAppStore(
    useShallow((s) => ({
      activeConnection: s.activeConnection,
      openSessionIds: s.openSessionIds,
      setConnectionModalOpen: s.setConnectionModalOpen,
      setDatabaseModalOpen: s.setDatabaseModalOpen,
      setRunningQueriesModalOpen: s.setRunningQueriesModalOpen,
      setSqlDiffModalOpen: s.setSqlDiffModalOpen,
      pendingEditsCount: s.pendingEditsCount,
      commitTransaction: s.commitTransaction,
      rollbackTransaction: s.rollbackTransaction,
      isRightInspectorOpen: s.isRightInspectorOpen,
      toggleRightInspector: s.toggleRightInspector,
      isSidebarOpen: s.isSidebarOpen,
      toggleSidebar: s.toggleSidebar,
      isBottomPanelOpen: s.isBottomPanelOpen,
      toggleBottomPanel: s.toggleBottomPanel,
      isFilterBarOpen: s.isFilterBarOpen,
      toggleFilterBar: s.toggleFilterBar,
      openNewQueryTab: s.openNewQueryTab,
      isReloading: s.isReloading,
      reloadData: s.reloadData,
      setSettingsModalOpen: s.setSettingsModalOpen,
      sqlTabStates: s.sqlTabStates,
      getPendingSQL: s.getPendingSQL,
      requestSafetyConfirmation: s.requestSafetyConfirmation,
      showToast: s.showToast,
    }))
  );

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
    rollbackTransaction();
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
        {IS_BETA && (
          <Tooltip side="bottom" content="DBNerd Beta Build Channel" description="Active test & development channel">
            <span 
              className="no-drag h-5 px-1.5 flex items-center rounded text-[9px] font-mono font-black uppercase tracking-wider bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40 shrink-0 shadow-2xs select-none"
            >
              BETA
            </span>
          </Tooltip>
        )}

        {/* Sidebar Toggle */}
        <Tooltip side="bottom" content="Toggle Sidebar" shortcut="⌘B">
          <button
            onClick={toggleSidebar}
            className={`no-drag h-7 w-7 flex items-center justify-center rounded-lg border transition shrink-0 cursor-pointer ${
              isSidebarOpen
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700/80 shadow-xs'
                : 'bg-white/80 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border-slate-300 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            {isSidebarOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
          </button>
        </Tooltip>

        {/* Safety Mode Selector Capsule (TablePlus Style) */}
        <div className="shrink-0">
          <SafetyModeSelector />
        </div>

        {/* Connection Switcher Pill */}
        <Tooltip side="bottom" content="Connections Manager" shortcut="⌘K">
          <button
            onClick={() => setConnectionModalOpen(true)}
            className="no-drag h-7 px-2 sm:px-2.5 flex items-center space-x-1.5 bg-white dark:bg-slate-900/90 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700/80 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white transition shadow-xs group active:scale-[0.98] shrink-0 leading-none cursor-pointer min-w-0"
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
        </Tooltip>

        {/* SQL Query Console Capsule (TablePlus Style) */}
        <Tooltip side="bottom" content="New SQL Query" shortcut="⌘T">
          <button
            onClick={() => openNewQueryTab()}
            className="no-drag h-7 px-2 sm:px-2.5 flex items-center space-x-1.5 bg-white dark:bg-slate-900/90 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 rounded-lg text-xs font-bold text-sky-700 dark:text-sky-300 hover:text-sky-900 dark:hover:text-white transition group shadow-xs active:scale-95 shrink-0 leading-none cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 group-hover:scale-110 transition-transform shrink-0" />
            <span className="font-mono text-[11px] leading-none hidden 2xl:inline">SQL</span>
          </button>
        </Tooltip>

        {/* Inline Filter Bar Toggle */}
        <Tooltip side="bottom" content="Toggle Inline Filters (WHERE / ORDER BY)">
          <button
            onClick={toggleFilterBar}
            className={`no-drag h-7 w-7 hidden 2xl:flex items-center justify-center rounded-lg border transition shrink-0 cursor-pointer ${
              isFilterBarOpen
                ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-500/50 shadow-xs'
                : 'bg-white/80 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border-slate-300 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
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
            <Tooltip side="bottom" content="Review Pending SQL Diff">
              <button
                onClick={() => setSqlDiffModalOpen(true)}
                className="no-drag h-7 px-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition flex items-center space-x-1 leading-none shrink-0 cursor-pointer"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Review SQL</span>
              </button>
            </Tooltip>
            <Tooltip side="bottom" content="Discard Uncommitted Edits" shortcut="⌘Z">
              <button
                onClick={handleDiscard}
                className="no-drag h-7 px-2 text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition flex items-center space-x-1 leading-none shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Discard</span>
              </button>
            </Tooltip>
            <Tooltip side="bottom" content="Commit Changes to Database" shortcut="⌘S">
              <button
                onClick={handleCommit}
                className="no-drag h-7 px-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs rounded-lg transition flex items-center space-x-1.5 shadow-md shadow-sky-500/20 active:scale-95 leading-none shrink-0 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Commit</span>
                <kbd className="px-1 py-0.5 bg-black/20 rounded text-[9px] font-mono text-white font-extrabold leading-none">⌘S</kbd>
              </button>
            </Tooltip>
          </div>
        )}

        {/* Running Query Cancel Action (Only appears when queries are executing) */}
        {isAnyQueryRunning && (
          <Tooltip side="bottom" content="Active Query Running — Click to View / Cancel" shortcut="⌘.">
            <button
              onClick={() => setRunningQueriesModalOpen(true)}
              className="no-drag h-7 px-2.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 cursor-pointer shadow-2xs"
            >
              <XCircle className="w-3.5 h-3.5 animate-spin text-rose-500" />
              <span className="font-mono text-[11px]">Cancel</span>
            </button>
          </Tooltip>
        )}

        {/* Sharp Unified Toolbar Segmented Cluster (h-7 matching height) */}
        <div className="flex items-center bg-slate-200/90 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700/80 rounded-lg p-0.5 space-x-0.5 shadow-xs">
          {/* Reload Data */}
          <Tooltip side="bottom" content="Reload Schema & Refresh" shortcut="⌘R">
            <button
              onClick={() => reloadData()}
              className={`no-drag relative overflow-hidden h-6 w-6 flex items-center justify-center rounded hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition active:scale-95 cursor-pointer ${
                isReloading ? 'text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-950/40' : ''
              }`}
            >
              {isReloading && (
                <BorderChase color="sky" dual={true} speed="fast" borderWidth={1.5} glow={true} />
              )}
              <RefreshCw className={`relative z-1 w-3.5 h-3.5 ${isReloading ? 'text-sky-600 dark:text-sky-400 animate-pulse' : ''}`} />
            </button>
          </Tooltip>

          {/* Preferences & Settings */}
          <Tooltip side="bottom" content="Settings & Themes" shortcut="⌘,">
            <button
              onClick={() => setSettingsModalOpen(true)}
              className="no-drag h-6 w-6 flex items-center justify-center rounded hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition active:scale-95 cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </Tooltip>

          {/* Toggle Bottom Console / Query Log Panel */}
          <Tooltip side="bottom" content="Toggle Bottom Console Panel" shortcut="⌘J">
            <button
              onClick={toggleBottomPanel}
              className={`no-drag h-6 w-6 flex items-center justify-center rounded transition active:scale-95 cursor-pointer ${
                isBottomPanelOpen
                  ? 'bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 shadow-2xs font-bold'
                  : 'hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {isBottomPanelOpen ? <PanelBottomClose className="w-3.5 h-3.5" /> : <PanelBottom className="w-3.5 h-3.5" />}
            </button>
          </Tooltip>

          {/* Toggle Right Inspector Panel */}
          <Tooltip side="bottom" content="Toggle Right Inspector Panel" shortcut="⌘I">
            <button
              onClick={toggleRightInspector}
              className={`no-drag h-6 w-6 flex items-center justify-center rounded transition active:scale-95 cursor-pointer ${
                isRightInspectorOpen
                  ? 'bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 shadow-2xs font-bold'
                  : 'hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {isRightInspectorOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRight className="w-3.5 h-3.5" />}
            </button>
          </Tooltip>
        </div>
      </div>
    </header>
  );
};
