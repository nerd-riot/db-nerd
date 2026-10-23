import { useEffect, useState } from 'react';
import { useAppStore } from './stores/useAppStore';
import { Titlebar } from './components/Titlebar';
import { ConnectionRail } from './components/ConnectionRail';
import { Sidebar } from './components/Sidebar';
import { TableGrid } from './components/TableGrid';
import { SqlEditor } from './components/SqlEditor';
import { Observability } from './components/Observability';
import { ConnectionModal } from './components/ConnectionModal';
import { OpenDatabaseModal } from './components/OpenDatabaseModal';
import { QueryHistoryModal } from './components/QueryHistoryModal';
import { RunningQueriesModal } from './components/RunningQueriesModal';
import { SqlDiffModal } from './components/SqlDiffModal';
import { SettingsModal } from './components/SettingsModal';
import { TableSchemaView } from './components/TableSchemaView';
import { DefaultWorkspaceView } from './components/DefaultWorkspaceView';
import { AllTableStatsView } from './components/AllTableStatsView';
import { AllFunctionsView } from './components/AllFunctionsView';
import { RightInspector } from './components/RightInspector';
import { BottomPanel } from './components/BottomPanel';
import { HeartbeatDot } from './components/HeartbeatDot';
import { DisconnectedBanner } from './components/DisconnectedBanner';
import { DisconnectedModal } from './components/DisconnectedModal';
import { SafetyVerificationModal } from './components/SafetyVerificationModal';
import { heartbeatService } from './services/heartbeatService';
import { Table, Terminal, Activity, FileCode, RotateCcw, Check, Columns, Plus, X, ChevronLeft, ChevronRight, CheckCircle2, ArrowRight, CopyPlus, Edit3, Copy, Code, AlertCircle, AlertTriangle, Info, Scissors, ClipboardPaste, Trash2, Database, SlidersHorizontal, PanelLeft, PanelRight, PanelBottom } from 'lucide-react';
import {
  ContextMenuContainer,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuHeader,
  ContextMenuPosition,
} from './components/ContextMenu';
import { getThemeDefinition } from './themes/themeRegistry';
import { AppThemeId } from './types';
import './App.css';

const updateReactInputValue = (el: HTMLInputElement | HTMLTextAreaElement, newValue: string) => {
  const prototype =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, newValue);
  } else {
    el.value = newValue;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

const elHasText = (el?: HTMLInputElement | HTMLTextAreaElement | null) =>
  Boolean(el && el.value && el.value.length > 0);

export function App() {
  const {
    tabs,
    activeTabId,
    setActiveTabId,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    closeAllTabs,
    duplicateTab,
    openNewQueryTab,
    renameTab,
    activeTab,
    isTransactionOpen,
    pendingEditsCount,
    isSidebarOpen,
    toggleSidebar,
    sidebarWidth,
    setSidebarWidth,
    isRightInspectorOpen,
    toggleRightInspector,
    rightInspectorWidth,
    setRightInspectorWidth,
    isBottomPanelOpen,
    bottomPanelHeight,
    setBottomPanelHeight,
    setConnectionModalOpen,
    setDatabaseModalOpen,
    setHistoryModalOpen,
    setSqlDiffModalOpen,
    settings,
    setSettingsModalOpen,
    updateResolvedTheme,
    commitTransaction,
    rollbackTransaction,
    toast,
    toastMessage,
    showToast,
    reloadData,
    sqlTabStates,
  } = useAppStore();

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [tabContextPos, setTabContextPos] = useState<ContextMenuPosition | null>(null);
  const [targetTabId, setTargetTabId] = useState<string | null>(null);
  const [globalContextMenu, setGlobalContextMenu] = useState<{
    position: ContextMenuPosition;
    type: 'input' | 'selection' | 'workspace';
    inputElement?: HTMLInputElement | HTMLTextAreaElement;
    selectedText?: string;
  } | null>(null);

  if (typeof window !== 'undefined') {
    (window as any).useAppStore = useAppStore;
  }

  useEffect(() => {
    const handleGlobalContextMenu = (e: MouseEvent) => {
      // If a component already handled the right-click and called e.preventDefault(),
      // close our global fallback menu and do nothing else.
      if (e.defaultPrevented) {
        setGlobalContextMenu(null);
        return;
      }

      // Always suppress WebKit's native browser context menu ("Reload" / "Inspect Element")
      e.preventDefault();

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Ignore right-clicks inside an already open custom context menu
      if (target.closest('[data-context-menu="true"]')) {
        return;
      }

      // 1. Check if right-clicked on an input or textarea
      const inputEl = target.closest('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null;
      if (inputEl && inputEl.type !== 'checkbox' && inputEl.type !== 'radio' && inputEl.type !== 'file') {
        inputEl.focus();
        const selected = inputEl.value.substring(inputEl.selectionStart || 0, inputEl.selectionEnd || 0);
        setGlobalContextMenu({
          position: { x: e.clientX, y: e.clientY },
          type: 'input',
          inputElement: inputEl,
          selectedText: selected,
        });
        return;
      }

      // 2. Check if there is non-empty text selection on the page
      const pageSelection = window.getSelection()?.toString().trim() || '';
      if (pageSelection) {
        setGlobalContextMenu({
          position: { x: e.clientX, y: e.clientY },
          type: 'selection',
          selectedText: pageSelection,
        });
        return;
      }

      // 3. Otherwise, show the native-feeling Workspace Context Menu
      setGlobalContextMenu({
        position: { x: e.clientX, y: e.clientY },
        type: 'workspace',
      });
    };

    window.addEventListener('contextmenu', handleGlobalContextMenu);
    return () => window.removeEventListener('contextmenu', handleGlobalContextMenu);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘B: Toggle Sidebar
      if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleSidebar();
      }
      // ⌘I: Toggle Right Inspector
      if ((e.metaKey || e.ctrlKey) && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        useAppStore.getState().toggleRightInspector();
      }
      // ⌘J: Toggle Bottom Console Panel
      if ((e.metaKey || e.ctrlKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        useAppStore.getState().toggleBottomPanel();
      }
      // ⇧⌘Enter: Run All Queries in Active Tab
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'Enter' || e.code === 'Enter')) {
        const activeTab = useAppStore.getState().tabs.find((t) => t.id === useAppStore.getState().activeTabId);
        if (activeTab?.type === 'sql') {
          e.preventDefault();
          e.stopPropagation();
          useAppStore.getState().runSqlQuery(activeTab.id, undefined, { mode: 'all' });
          return;
        }
      }
      // ⌘. : Cancel Active Query Execution
      if ((e.metaKey || e.ctrlKey) && (e.key === '.' || e.code === 'Period')) {
        const activeTab = useAppStore.getState().tabs.find((t) => t.id === useAppStore.getState().activeTabId);
        if (activeTab?.type === 'sql') {
          e.preventDefault();
          e.stopPropagation();
          useAppStore.getState().cancelSqlQuery(activeTab.id);
          return;
        }
      }
      // ⌘⇧R: Reconnect Workspace (TablePlus shortcut)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        e.stopPropagation();
        useAppStore.getState().reconnectActiveConnection();
        return;
      }
      // ⌘R: Reload Data (Table or Query)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        reloadData();
      }
      // ⌘O: Open Database Switcher
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        setDatabaseModalOpen(true);
      }
      // ⌘T or ⌘E: New SQL Query Tab (TablePlus standard)
      if ((e.metaKey || e.ctrlKey) && (e.key === 't' || e.key === 'T' || e.code === 'KeyT' || e.key === 'e' || e.key === 'E' || e.code === 'KeyE')) {
        e.preventDefault();
        e.stopPropagation();
        openNewQueryTab();
      }
      // ⌘W: Close Active Tab, or if out of tabs, Close Active Connection (TablePlus Standard)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'w' || e.key === 'W' || e.code === 'KeyW')) {
        e.preventDefault();
        e.stopPropagation();
        const state = useAppStore.getState();
        const {
          tabs,
          activeTabId,
          activeConnection,
          closeTab,
          closeSession,
          isConnectionModalOpen,
          setConnectionModalOpen,
          openSessionIds,
        } = state;

        // If connection modal is open and there are open sessions, ⌘W closes the modal
        if (isConnectionModalOpen && openSessionIds.length > 0) {
          setConnectionModalOpen(false);
          return;
        }

        // 1. If there are tabs open in current connection, close the active tab
        if (tabs.length > 0 && activeTabId) {
          closeTab(activeTabId);
          return;
        }

        // 2. If out of tabs (hết tab), close the current active connection
        if (activeConnection?.id && openSessionIds.includes(activeConnection.id)) {
          closeSession(activeConnection.id);
          return;
        }

        // 3. If all connections closed, open connection list modal
        if (openSessionIds.length === 0 && !isConnectionModalOpen) {
          setConnectionModalOpen(true);
        }
      }
      // ⌘K: Connection Manager
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        e.stopPropagation();
        setConnectionModalOpen(true);
      }
      // ⌘H: Query History
      if ((e.metaKey || e.ctrlKey) && (e.key === 'h' || e.key === 'H')) {
        const activeTab = useAppStore.getState().tabs.find((t) => t.id === useAppStore.getState().activeTabId);
        if (activeTab?.type === 'sql') {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        setHistoryModalOpen(true);
      }
      // ⌘S: Commit Transaction
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        const state = useAppStore.getState();
        const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
        if (activeTab?.type === 'sql' && state.pendingEditsCount === 0) {
          return;
        }
        e.preventDefault();
        if (state.pendingEditsCount > 0) {
          commitTransaction();
        }
      }
      // ⌘Z: Rollback Transaction (when not in input/textarea)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        if (useAppStore.getState().pendingEditsCount > 0) {
          e.preventDefault();
          if (confirm("Rollback transaction and discard all uncommitted edits?")) {
            rollbackTransaction();
          }
        }
      }
      // ⌘, : Preferences & Settings
      if ((e.metaKey || e.ctrlKey) && (e.key === ',' || e.code === 'Comma')) {
        e.preventDefault();
        setSettingsModalOpen(true);
      }
      // ⌘1 - ⌘9: Switch directly to tab index
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        const tabIndex = parseInt(e.key, 10) - 1;
        const currentTabs = useAppStore.getState().tabs;
        if (currentTabs[tabIndex]) {
          e.preventDefault();
          setActiveTabId(currentTabs[tabIndex].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  // Adaptive zero-burn Heartbeat Monitor Lifecycle
  useEffect(() => {
    heartbeatService.start();
    return () => {
      heartbeatService.stop();
    };
  }, []);

  // Synchronize Theme Mode & Custom Themes (Monokai, Dracula, One Dark, Material, etc.)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlTheme = urlParams.get('theme');

    const applyTheme = () => {
      let activeThemeId: AppThemeId = settings.appTheme || 'default-dark';
      if (urlTheme) {
        if (urlTheme === 'light') activeThemeId = 'default-light';
        else if (urlTheme === 'dark') activeThemeId = 'default-dark';
        else if (urlTheme === 'auto') activeThemeId = 'default-dark';
        else {
          const def = getThemeDefinition(urlTheme);
          activeThemeId = def.id;
        }
      }

      const themeDef = getThemeDefinition(activeThemeId);
      let resolvedCategory: 'dark' | 'light' = themeDef.category;

      if (settings.themeMode === 'auto' && !urlTheme) {
        const isDeviceDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        resolvedCategory = isDeviceDark ? 'dark' : 'light';
        if (!isDeviceDark && themeDef.category === 'dark') {
          activeThemeId = 'default-light';
        }
      }

      updateResolvedTheme(resolvedCategory);

      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(resolvedCategory);
      document.documentElement.setAttribute('data-theme', activeThemeId);
    };

    applyTheme();

    const urlView = urlParams.get('view');
    const urlTab = urlParams.get('tab');
    if (urlView === 'default' || urlTab === 'empty') {
      useAppStore.getState().closeAllTabs();
    } else if (urlTab) {
      const stateTabs = useAppStore.getState().tabs;
      const found = stateTabs.find(
        (t) =>
          t.id === urlTab ||
          t.title.toLowerCase() === urlTab.toLowerCase() ||
          t.tableName?.toLowerCase() === urlTab.toLowerCase()
      );
      if (found) {
        useAppStore.getState().setActiveTabId(found.id);
      } else {
        useAppStore.getState().setSelectedTable(urlTab);
        useAppStore.getState().openTableGridTab(urlTab);
      }
    }
    const urlMode = urlParams.get('mode');
    if (urlMode === 'structure' || urlMode === 'index' || urlMode === 'data') {
      useAppStore.getState().setTableViewMode(urlMode);
    }
    const urlSettings = urlParams.get('settings');
    if (urlSettings === 'open' || urlSettings === 'true') {
      useAppStore.getState().setSettingsModalOpen(true);
    }
    const urlModal = urlParams.get('modal');
    if (urlModal === 'connection' || urlModal === 'conn') {
      useAppStore.getState().setConnectionModalOpen(true);
    } else if (urlModal === 'disconnected') {
      useAppStore.getState().setReconnectModalOpen(true);
    }

    const urlStatus = urlParams.get('status');
    if (urlStatus === 'disconnected' || urlStatus === 'failed') {
      useAppStore.getState().updateHeartbeat(0, false, "Connection to database failed: Connection refused (os error 61)");
    }

    const mediaQuery = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mediaQuery) {
      const handleChange = () => {
        if (!urlTheme && useAppStore.getState().settings.themeMode === 'auto') {
          applyTheme();
        }
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [settings.themeMode, settings.appTheme]);

  const activeTabObj = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const currentTabType = activeTabObj?.type || activeTab;

  const activeTabIndex = tabs.findIndex((t) => t.id === activeTabId);
  const canGoBack = activeTabIndex > 0;
  const canGoForward = activeTabIndex >= 0 && activeTabIndex < tabs.length - 1;

  const handlePrevTab = () => {
    if (canGoBack) setActiveTabId(tabs[activeTabIndex - 1].id);
  };

  const handleNextTab = () => {
    if (canGoForward) setActiveTabId(tabs[activeTabIndex + 1].id);
  };

  const startRename = (tabId: string, currentTitle: string) => {
    setEditingTabId(tabId);
    setEditingTitle(currentTitle);
  };

  const saveRename = () => {
    if (editingTabId && editingTitle.trim()) {
      renameTab(editingTabId, editingTitle.trim());
    }
    setEditingTabId(null);
  };

  // Left Sidebar Resizing
  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.min(500, Math.max(160, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Right Inspector Resizing
  const handleInspectorResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightInspectorWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.min(650, Math.max(220, startWidth + delta));
      setRightInspectorWidth(newWidth);
    };

    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Bottom Panel Resizing
  const handleBottomPanelResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = bottomPanelHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const newHeight = Math.min(550, Math.max(100, startHeight + delta));
      setBottomPanelHeight(newHeight);
    };

    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 dark:bg-[#0a0f1d] text-slate-900 dark:text-slate-100 overflow-hidden font-sans select-none relative">
      
      {/* Native macOS Titlebar */}
      <Titlebar />

      {/* TablePlus Disconnected Banner */}
      <DisconnectedBanner />

      {/* Transaction Alert Banner with Smooth Expand/Collapse & Heartbeat LED */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-240 ease-[cubic-bezier(0.16,1,0.3,1)] z-20 ${
          isTransactionOpen && pendingEditsCount > 0
            ? 'grid-rows-[1fr] opacity-100'
            : 'grid-rows-[0fr] opacity-0 pointer-events-none'
        }`}
      >
        <div className="overflow-hidden">
          <div className="h-8 bg-amber-500/15 border-b border-amber-500/40 px-4 flex items-center justify-between text-xs select-none backdrop-blur-md">
            <div className="flex items-center space-x-2">
              <HeartbeatDot color="amber" size="sm" showWave={true} />
              <span className="font-bold text-amber-300 leading-none">Active Transaction Open</span>
              <span className="text-amber-200/80 leading-none">
                • TxID: #891024 • {pendingEditsCount} uncommitted edit{pendingEditsCount > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setSqlDiffModalOpen(true)}
                className="h-6 px-2 hover:bg-slate-800 text-amber-300 rounded font-medium text-[11px] flex items-center space-x-1.5 transition-colors leading-none cursor-pointer"
              >
                <FileCode className="w-3 h-3 shrink-0" />
                <span>Review SQL</span>
              </button>
              <button
                onClick={() => {
                  if (confirm("Rollback transaction?")) rollbackTransaction();
                }}
                className="h-6 px-2 hover:bg-slate-800 text-slate-300 rounded font-medium text-[11px] flex items-center space-x-1.5 transition-colors active:scale-95 leading-none cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 shrink-0" />
                <span>Rollback (⌘Z)</span>
              </button>
              <button
                onClick={async () => {
                  await commitTransaction();
                }}
                className="h-6 px-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold rounded text-[11px] flex items-center space-x-1.5 shadow-sm transition-all active:scale-95 leading-none cursor-pointer"
              >
                <Check className="w-3 h-3 stroke-[3] shrink-0" />
                <span>Commit (⌘S)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Workspace Split (Rail + Sidebar + Main) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Connection Switcher Rail (TablePlus style) */}
        <ConnectionRail />

        {/* Sidebar (Collapsible with ⌘B and Resizable) */}
        {isSidebarOpen ? (
          <>
            <Sidebar />
            <div
              onMouseDown={handleSidebarResizeStart}
              onDoubleClick={() => setSidebarWidth(240)}
              className="w-1 hover:w-1.5 bg-slate-800/80 hover:bg-sky-500/60 active:bg-sky-500 cursor-col-resize transition-all duration-100 relative group flex-shrink-0 z-20 select-none"
              title="Drag to resize sidebar • Double-click to reset (240px)"
            >
              <div className="absolute top-1/2 -translate-y-1/2 -left-1 -right-1 h-8 rounded-full bg-sky-400/0 group-hover:bg-sky-400/40 transition-colors pointer-events-none flex items-center justify-center">
                <div className="w-0.5 h-3 bg-sky-300 rounded-full opacity-0 group-hover:opacity-100" />
              </div>
            </div>
          </>
        ) : (
          <button
            onClick={toggleSidebar}
            className="w-4 hover:w-5 bg-slate-100 dark:bg-slate-900/90 hover:bg-slate-200 dark:hover:bg-slate-800 border-r border-slate-300 dark:border-slate-800 text-slate-500 hover:text-sky-600 dark:hover:text-sky-300 flex items-center justify-center transition-all cursor-pointer group flex-shrink-0 z-10"
            title="Expand Sidebar (⌘B)"
          >
            <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-900/40">
          
          {/* Dynamic Multi-Tab Bar (TablePlus Style Capsule Tabs) */}
          <div className="h-10 bg-slate-100/90 dark:bg-slate-950/70 border-b border-slate-300 dark:border-slate-800/80 flex items-center justify-between px-2 select-none flex-shrink-0">
            <div className="flex items-center space-x-1.5 h-full overflow-x-auto no-scrollbar py-1">
              
              {/* Tab History Navigation (< >) */}
              <div className="flex items-center bg-slate-200 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-800/80 rounded-md p-0.5 mr-1 flex-shrink-0 h-7">
                <button
                  onClick={handlePrevTab}
                  disabled={!canGoBack}
                  className={`h-6 w-6 flex items-center justify-center rounded hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition ${!canGoBack ? 'opacity-30 cursor-not-allowed' : 'active:scale-95'}`}
                  title="Previous Tab"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleNextTab}
                  disabled={!canGoForward}
                  className={`h-6 w-6 flex items-center justify-center rounded hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition ${!canGoForward ? 'opacity-30 cursor-not-allowed' : 'active:scale-95'}`}
                  title="Next Tab"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Dynamic Open Tabs */}
              {tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                let icon = <Table className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />;
                if (tab.type === 'schema') icon = <Columns className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />;
                if (tab.type === 'sql') icon = <Terminal className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
                if (tab.type === 'stats') {
                  if (tab.tableName === '__all_tables__' || tab.title.startsWith('Tables.')) {
                    icon = <Table className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />;
                  } else if (tab.tableName === '__all_functions__' || tab.title.startsWith('Functions.')) {
                    icon = <Code className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
                  } else {
                    icon = <Activity className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />;
                  }
                }

                return (
                  <div
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startRename(tab.id, tab.title);
                    }}
                    onMouseDown={(e) => {
                      if (e.button === 1 && tab.canClose !== false) {
                        e.preventDefault();
                        closeTab(tab.id);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTabContextPos({ x: e.clientX, y: e.clientY });
                      setTargetTabId(tab.id);
                    }}
                    className={`group h-7 px-2.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer select-none max-w-[220px] flex-shrink-0 border ${
                      isActive
                        ? 'bg-white dark:bg-slate-800/90 border-slate-300 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 shadow-xs font-semibold'
                        : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800/50'
                    }`}
                    title={`${tab.title} (Double-click to rename)`}
                  >
                    {icon}
                    {editingTabId === tab.id ? (
                      <input
                        type="text"
                        value={editingTitle}
                        autoFocus
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={saveRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename();
                          if (e.key === 'Escape') setEditingTabId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-sky-500 rounded px-1 py-0 text-xs w-24 outline-none font-sans"
                      />
                    ) : (
                      <span className="truncate">{tab.title}</span>
                    )}
                    {tab.canClose !== false && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTab(tab.id);
                        }}
                        className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-rose-500 rounded transition opacity-0 group-hover:opacity-100 ml-0.5"
                        title="Close Tab (⌘W)"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* New Tab Button (+) */}
              <button
                onClick={() => openNewQueryTab()}
                className="h-7 w-7 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 flex items-center justify-center transition active:scale-95 border border-transparent hover:border-slate-300 dark:hover:border-slate-700/60 flex-shrink-0"
                title="New SQL Query Tab (⌘T / ⌘E)"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>

            </div>

            {/* Right Controls: Engine Stats */}
            <div className="flex items-center space-x-2 flex-shrink-0 pl-2 h-full">
              <div className="text-[11px] text-slate-600 dark:text-slate-500 font-mono hidden md:flex items-center space-x-2 leading-none">
                <span>Tabs: <strong className="text-slate-800 dark:text-slate-300">{tabs.length}</strong></span>
                <span>•</span>
                <span>RAM: <strong className="text-slate-800 dark:text-slate-300">46.8 MB</strong></span>
                <span>•</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-bold">120 FPS</span>
              </div>
            </div>
          </div>

          {/* Active Tab View */}
          <div className="flex-1 flex overflow-hidden">
            {tabs.length === 0 || currentTabType === 'default' ? (
              <DefaultWorkspaceView />
            ) : (
              <>
                {currentTabType === 'grid' && <TableGrid key={activeTabObj?.tableName || 'grid'} />}
                {currentTabType === 'schema' && <TableSchemaView key={activeTabObj?.tableName || 'schema'} />}
                {currentTabType === 'sql' && <SqlEditor key={activeTabId} />}
                {currentTabType === 'stats' && (
                  activeTabObj?.tableName === '__all_tables__' || activeTabObj?.title.startsWith('Tables.') ? (
                    <AllTableStatsView key={activeTabId} />
                  ) : activeTabObj?.tableName === '__all_functions__' || activeTabObj?.title.startsWith('Functions.') ? (
                    <AllFunctionsView key={activeTabId} />
                  ) : (
                    <Observability key={activeTabId} />
                  )
                )}
              </>
            )}
          </div>

          {/* Global Bottom Console / Query Log Panel (Collapsible & Resizable) */}
          {isBottomPanelOpen && (
            <>
              {/* Bottom Splitter Handle */}
              <div
                onMouseDown={handleBottomPanelResizeStart}
                onDoubleClick={() => setBottomPanelHeight(190)}
                className="h-1 hover:h-1.5 bg-slate-800/80 hover:bg-sky-500/60 active:bg-sky-500 cursor-row-resize transition-all duration-100 relative group flex-shrink-0 z-20 select-none"
                title="Drag to resize console • Double-click to reset (190px)"
              >
                <div className="absolute left-1/2 -translate-x-1/2 -top-1 -bottom-1 w-12 rounded-full bg-sky-400/0 group-hover:bg-sky-400/40 transition-colors pointer-events-none flex items-center justify-center">
                  <div className="h-0.5 w-6 bg-sky-300 rounded-full opacity-0 group-hover:opacity-100" />
                </div>
              </div>
              <BottomPanel />
            </>
          )}

        </main>

        {/* Right Inspector Panel (Collapsible with ⌘I and Resizable) */}
        {isRightInspectorOpen ? (
          <>
            <div
              onMouseDown={handleInspectorResizeStart}
              onDoubleClick={() => setRightInspectorWidth(320)}
              className="w-1 hover:w-1.5 bg-slate-800/80 hover:bg-sky-500/60 active:bg-sky-500 cursor-col-resize transition-all duration-100 relative group flex-shrink-0 z-20 select-none"
              title="Drag to resize inspector • Double-click to reset (320px)"
            >
              <div className="absolute top-1/2 -translate-y-1/2 -left-1 -right-1 h-8 rounded-full bg-sky-400/0 group-hover:bg-sky-400/40 transition-colors pointer-events-none flex items-center justify-center">
                <div className="w-0.5 h-3 bg-sky-300 rounded-full opacity-0 group-hover:opacity-100" />
              </div>
            </div>
            <RightInspector />
          </>
        ) : (
          <button
            onClick={toggleRightInspector}
            className="w-4 hover:w-5 bg-slate-100 dark:bg-slate-900/90 hover:bg-slate-200 dark:hover:bg-slate-800 border-l border-slate-300 dark:border-slate-800 text-slate-500 hover:text-sky-600 dark:hover:text-sky-300 flex items-center justify-center transition-all cursor-pointer group flex-shrink-0 z-10"
            title="Expand Right Inspector (⌘I)"
          >
            <ChevronLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
          </button>
        )}
      </div>

      {/* Global Floating Toast - Modern Top-Center Mac Pill */}
      {(toast || toastMessage) && (() => {
        const activeToast = toast || {
          message: toastMessage || '',
          type: (toastMessage?.includes('❌') || toastMessage?.toLowerCase().includes('fail') || toastMessage?.toLowerCase().includes('error'))
            ? ('error' as const)
            : (toastMessage?.includes('⚠️') || toastMessage?.toLowerCase().includes('warn'))
            ? ('warning' as const)
            : ('success' as const),
          id: 0,
        };

        const isError = activeToast.type === 'error';
        const isWarning = activeToast.type === 'warning';
        const isInfo = activeToast.type === 'info';

        return (
          <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none select-none max-w-[90vw] animate-in fade-in slide-in-from-top-4 duration-150">
            <div
              className={`px-4 py-2 rounded-xl shadow-2xl border flex items-center space-x-2.5 text-xs font-medium backdrop-blur-xl ring-1 ${
                isError
                  ? 'bg-rose-950/90 dark:bg-rose-950/95 text-rose-100 border-rose-500/50 ring-rose-500/30 shadow-rose-950/40'
                  : isWarning
                  ? 'bg-amber-950/90 dark:bg-amber-950/95 text-amber-100 border-amber-500/50 ring-amber-500/30 shadow-amber-950/40'
                  : isInfo
                  ? 'bg-sky-950/90 dark:bg-sky-950/95 text-sky-100 border-sky-500/50 ring-sky-500/30 shadow-sky-950/40'
                  : 'bg-slate-900/90 dark:bg-[#18191c]/95 text-slate-100 border-emerald-500/40 ring-emerald-500/20 shadow-black/40'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                  isError
                    ? 'bg-rose-500/20 text-rose-400'
                    : isWarning
                    ? 'bg-amber-500/20 text-amber-400'
                    : isInfo
                    ? 'bg-sky-500/20 text-sky-400'
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}
              >
                {isError ? (
                  <AlertCircle className="w-3 h-3 stroke-[2.5]" />
                ) : isWarning ? (
                  <AlertTriangle className="w-3 h-3 stroke-[2.5]" />
                ) : isInfo ? (
                  <Info className="w-3 h-3 stroke-[2.5]" />
                ) : (
                  <CheckCircle2 className="w-3 h-3 stroke-[2.5]" />
                )}
              </div>
              <span className="font-sans leading-relaxed text-xs">{activeToast.message}</span>
            </div>
          </div>
        );
      })()}

      {/* Tab Context Menu */}
      {tabContextPos && targetTabId && (() => {
        const targetTab = tabs.find((t) => t.id === targetTabId);
        if (!targetTab) return null;
        const targetIdx = tabs.findIndex((t) => t.id === targetTabId);
        const hasTabsToRight = targetIdx < tabs.length - 1;
        const hasOtherTabs = tabs.length > 1;

        return (
          <ContextMenuContainer
            position={tabContextPos}
            onClose={() => {
              setTabContextPos(null);
              setTargetTabId(null);
            }}
            width={220}
          >
            <ContextMenuHeader title={`Tab: ${targetTab.title}`} />
            {targetTab.canClose !== false && (
              <ContextMenuItem
                icon={<X className="w-3.5 h-3.5 text-rose-400" />}
                label="Close Tab"
                shortcut="⌘W"
                onClick={() => {
                  closeTab(targetTab.id);
                  setTabContextPos(null);
                }}
              />
            )}
            <ContextMenuItem
              icon={<X className="w-3.5 h-3.5 text-slate-400" />}
              label="Close Other Tabs"
              disabled={!hasOtherTabs}
              onClick={() => {
                closeOtherTabs(targetTab.id);
                setTabContextPos(null);
              }}
            />
            <ContextMenuItem
              icon={<ArrowRight className="w-3.5 h-3.5 text-slate-400" />}
              label="Close Tabs to the Right"
              disabled={!hasTabsToRight}
              onClick={() => {
                closeTabsToRight(targetTab.id);
                setTabContextPos(null);
              }}
            />
            <ContextMenuItem
              icon={<X className="w-3.5 h-3.5 text-rose-400" />}
              label="Close All Tabs"
              danger
              onClick={() => {
                closeAllTabs();
                setTabContextPos(null);
              }}
            />
            <ContextMenuDivider />
            <ContextMenuItem
              icon={<CopyPlus className="w-3.5 h-3.5 text-sky-400" />}
              label="Duplicate Tab"
              shortcut="⌘D"
              onClick={() => {
                duplicateTab(targetTab.id);
                setTabContextPos(null);
              }}
            />
            <ContextMenuItem
              icon={<Edit3 className="w-3.5 h-3.5 text-slate-400" />}
              label="Rename Tab..."
              onClick={() => {
                startRename(targetTab.id, targetTab.title);
                setTabContextPos(null);
              }}
            />
            <ContextMenuItem
              icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
              label={targetTab.type === 'sql' ? 'Copy SQL Content' : 'Copy Tab Title'}
              onClick={() => {
                if (targetTab.type === 'sql') {
                  const query = sqlTabStates[targetTab.id]?.query || '';
                  navigator.clipboard.writeText(query);
                  showToast('📋 Copied SQL content to clipboard');
                } else {
                  navigator.clipboard.writeText(targetTab.title);
                  showToast(`📋 Copied "${targetTab.title}" to clipboard`);
                }
                setTabContextPos(null);
              }}
            />
          </ContextMenuContainer>
        );
      })()}

      {/* Global Context Menu (Input / Selection / Workspace Fallback) */}
      {globalContextMenu && (
        <ContextMenuContainer
          position={globalContextMenu.position}
          onClose={() => setGlobalContextMenu(null)}
          width={240}
        >
          {globalContextMenu.type === 'input' && globalContextMenu.inputElement ? (
            <>
              <ContextMenuHeader title="Edit Field" />
              <ContextMenuItem
                icon={<Scissors className="w-3.5 h-3.5 text-slate-400" />}
                label="Cut"
                shortcut="⌘X"
                disabled={!globalContextMenu.selectedText || globalContextMenu.inputElement.readOnly || globalContextMenu.inputElement.disabled}
                onClick={() => {
                  const el = globalContextMenu.inputElement!;
                  const start = el.selectionStart || 0;
                  const end = el.selectionEnd || 0;
                  const selected = el.value.substring(start, end);
                  if (selected) {
                    navigator.clipboard.writeText(selected);
                    const nextVal = el.value.substring(0, start) + el.value.substring(end);
                    updateReactInputValue(el, nextVal);
                    el.focus();
                    el.setSelectionRange(start, start);
                  }
                  setGlobalContextMenu(null);
                }}
              />
              <ContextMenuItem
                icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
                label="Copy"
                shortcut="⌘C"
                disabled={!elHasText(globalContextMenu.inputElement)}
                onClick={() => {
                  const el = globalContextMenu.inputElement!;
                  const textToCopy = globalContextMenu.selectedText || el.value;
                  if (textToCopy) {
                    navigator.clipboard.writeText(textToCopy);
                    showToast('📋 Copied to clipboard');
                  }
                  setGlobalContextMenu(null);
                }}
              />
              <ContextMenuItem
                icon={<ClipboardPaste className="w-3.5 h-3.5 text-sky-400" />}
                label="Paste"
                shortcut="⌘V"
                disabled={globalContextMenu.inputElement.readOnly || globalContextMenu.inputElement.disabled}
                onClick={async () => {
                  const el = globalContextMenu.inputElement!;
                  try {
                    const clip = await navigator.clipboard.readText();
                    if (clip !== undefined) {
                      const start = el.selectionStart ?? el.value.length;
                      const end = el.selectionEnd ?? el.value.length;
                      const nextVal = el.value.substring(0, start) + clip + el.value.substring(end);
                      updateReactInputValue(el, nextVal);
                      el.focus();
                      const cursor = start + clip.length;
                      el.setSelectionRange(cursor, cursor);
                    }
                  } catch {
                    showToast('⚠️ Use ⌘V to paste from system clipboard');
                  }
                  setGlobalContextMenu(null);
                }}
              />
              <ContextMenuItem
                icon={<Check className="w-3.5 h-3.5 text-emerald-400" />}
                label="Select All"
                shortcut="⌘A"
                disabled={!elHasText(globalContextMenu.inputElement)}
                onClick={() => {
                  const el = globalContextMenu.inputElement!;
                  el.focus();
                  el.select();
                  setGlobalContextMenu(null);
                }}
              />
              <ContextMenuDivider />
              <ContextMenuItem
                icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
                label="Clear Field"
                danger
                disabled={!elHasText(globalContextMenu.inputElement) || globalContextMenu.inputElement.readOnly || globalContextMenu.inputElement.disabled}
                onClick={() => {
                  const el = globalContextMenu.inputElement!;
                  updateReactInputValue(el, '');
                  el.focus();
                  setGlobalContextMenu(null);
                }}
              />
            </>
          ) : (
            <>
              {globalContextMenu.type === 'selection' && globalContextMenu.selectedText && (
                <>
                  <ContextMenuHeader title="Selected Text" />
                  <ContextMenuItem
                    icon={<Copy className="w-3.5 h-3.5 text-sky-400" />}
                    label="Copy Selection"
                    shortcut="⌘C"
                    onClick={() => {
                      navigator.clipboard.writeText(globalContextMenu.selectedText!);
                      showToast('📋 Copied selection to clipboard');
                      setGlobalContextMenu(null);
                    }}
                  />
                  <ContextMenuItem
                    icon={<Terminal className="w-3.5 h-3.5 text-emerald-400" />}
                    label="Open Selection in SQL Tab"
                    shortcut="⌘E"
                    onClick={() => {
                      openNewQueryTab(globalContextMenu.selectedText!);
                      setGlobalContextMenu(null);
                    }}
                  />
                  <ContextMenuDivider />
                </>
              )}
              <ContextMenuHeader title="DBNerd Workspace" />
              <ContextMenuItem
                icon={<Terminal className="w-3.5 h-3.5 text-amber-400" />}
                label="New SQL Query Tab"
                shortcut="⌘T"
                onClick={() => {
                  openNewQueryTab();
                  setGlobalContextMenu(null);
                }}
              />
              <ContextMenuItem
                icon={<RotateCcw className="w-3.5 h-3.5 text-emerald-400" />}
                label="Reload Data"
                shortcut="⌘R"
                onClick={() => {
                  reloadData();
                  setGlobalContextMenu(null);
                }}
              />
              <ContextMenuItem
                icon={<Database className="w-3.5 h-3.5 text-sky-400" />}
                label="Switch Database..."
                shortcut="⌘O"
                onClick={() => {
                  setDatabaseModalOpen(true);
                  setGlobalContextMenu(null);
                }}
              />
              <ContextMenuItem
                icon={<Plus className="w-3.5 h-3.5 text-indigo-400" />}
                label="Connection Manager..."
                shortcut="⌘K"
                onClick={() => {
                  setConnectionModalOpen(true);
                  setGlobalContextMenu(null);
                }}
              />
              <ContextMenuDivider />
              <ContextMenuItem
                icon={<PanelLeft className="w-3.5 h-3.5 text-slate-400" />}
                label={isSidebarOpen ? 'Hide Left Sidebar' : 'Show Left Sidebar'}
                shortcut="⌘B"
                onClick={() => {
                  toggleSidebar();
                  setGlobalContextMenu(null);
                }}
              />
              <ContextMenuItem
                icon={<PanelRight className="w-3.5 h-3.5 text-slate-400" />}
                label={isRightInspectorOpen ? 'Hide Right Inspector' : 'Show Right Inspector'}
                shortcut="⌘I"
                onClick={() => {
                  toggleRightInspector();
                  setGlobalContextMenu(null);
                }}
              />
              <ContextMenuItem
                icon={<PanelBottom className="w-3.5 h-3.5 text-slate-400" />}
                label={isBottomPanelOpen ? 'Hide Bottom Console' : 'Show Bottom Console'}
                shortcut="⌘J"
                onClick={() => {
                  useAppStore.getState().toggleBottomPanel();
                  setGlobalContextMenu(null);
                }}
              />
              <ContextMenuDivider />
              <ContextMenuItem
                icon={<SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />}
                label="Preferences & Themes..."
                shortcut="⌘,"
                onClick={() => {
                  setSettingsModalOpen(true);
                  setGlobalContextMenu(null);
                }}
              />
            </>
          )}
        </ContextMenuContainer>
      )}

      {/* Global Modals */}
      <ConnectionModal />
      <OpenDatabaseModal />
      <QueryHistoryModal />
      <RunningQueriesModal />
      <SqlDiffModal />
      <SettingsModal />
      <DisconnectedModal />
      <SafetyVerificationModal />

    </div>
  );
}

export default App;
