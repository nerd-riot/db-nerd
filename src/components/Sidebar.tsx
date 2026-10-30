import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../stores/useAppStore';
import {
  Search,
  Table as TableIcon,
  ChevronRight,
  ChevronDown,
  Plus,
  Terminal,
  SlidersHorizontal,
  CheckCircle2,
  Copy,
  Columns,
  Play,
  FileCode,
  Code,
  Database,
  Trash2,
  Sparkles,
  RefreshCw,
  PanelLeftClose,
  Loader2,
} from 'lucide-react';
import { getTablesForConnection, getTableSchema, getFunctionsForConnection } from '../data/schemas';
import { ColumnDefinition } from '../types';
import { Tooltip } from './Tooltip';
import {
  ContextMenuContainer,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuHeader,
  ContextMenuPosition,
} from './ContextMenu';
import { format as formatSql } from 'sql-formatter';

const SAVED_QUERIES = [
  {
    id: 'q-1',
    title: 'Active Users by Spend',
    desc: 'Top active users ordered by total spend',
    sql: `SELECT u.id, u.email, COUNT(o.id) AS total_orders, SUM(o.total_amount) AS total_spend\nFROM users u\nLEFT JOIN user_orders o ON o.user_id = u.id\nWHERE u.status = 'active'\nGROUP BY u.id, u.email\nORDER BY total_spend DESC LIMIT 50;`,
  },
  {
    id: 'q-2',
    title: 'Tuples by Organisation',
    desc: 'OpenFGA tuple relationship mappings',
    sql: `SELECT store, object_type, object_id, relation, _user\nFROM tuple\nWHERE object_type = 'connector_tool'\nORDER BY inserted_at DESC\nLIMIT 20;`,
  },
  {
    id: 'q-3',
    title: 'Goose Migrations History',
    desc: 'Database schema migration ledger',
    sql: `SELECT id, version_id, is_applied, tstamp\nFROM goose_db_version\nORDER BY id ASC;`,
  },
  {
    id: 'q-4',
    title: 'Process Diagnostics (pg_stat)',
    desc: 'Active running queries and worker processes',
    sql: `SELECT pid, usename, client_addr, state, query_start, query\nFROM pg_stat_activity\nWHERE state != 'idle'\nORDER BY query_start ASC;`,
  },
  {
    id: 'q-5',
    title: 'Reset Session Locks',
    desc: 'Terminate idle in transaction sessions older than 5m',
    sql: `SELECT pg_terminate_backend(pid)\nFROM pg_stat_activity\nWHERE state = 'idle in transaction'\n  AND query_start < NOW() - INTERVAL '5 minutes';`,
  },
];

export const Sidebar = () => {
  const {
    selectedTable,
    setSelectedTable,
    setSelectedRowData,
    openTableGridTab,
    openTableSchemaTab,
    openAllTableStatsTab,
    openAllFunctionsTab,
    openNewQueryTab,
    activeConnection,
    setConnectionModalOpen,
    setDatabaseModalOpen,
    history,
    showToast,
    reloadData,
    openTableActionModal,
    deletedTables,
    settings,
    setTableViewMode,
    liveTables,
    fetchLiveTables,
    liveFunctions,
    fetchLiveFunctions,
    sidebarWidth,
    toggleSidebar,
    tabs,
    activeTabId,
    openSessionIds,
    isConnecting,
  } = useAppStore(
    useShallow((s) => ({
      selectedTable: s.selectedTable,
      setSelectedTable: s.setSelectedTable,
      setSelectedRowData: s.setSelectedRowData,
      openTableGridTab: s.openTableGridTab,
      openTableSchemaTab: s.openTableSchemaTab,
      openAllTableStatsTab: s.openAllTableStatsTab,
      openAllFunctionsTab: s.openAllFunctionsTab,
      openNewQueryTab: s.openNewQueryTab,
      activeConnection: s.activeConnection,
      setConnectionModalOpen: s.setConnectionModalOpen,
      setDatabaseModalOpen: s.setDatabaseModalOpen,
      history: s.history,
      showToast: s.showToast,
      reloadData: s.reloadData,
      openTableActionModal: s.openTableActionModal,
      deletedTables: s.deletedTables,
      settings: s.settings,
      setTableViewMode: s.setTableViewMode,
      liveTables: s.liveTables,
      fetchLiveTables: s.fetchLiveTables,
      liveFunctions: s.liveFunctions,
      fetchLiveFunctions: s.fetchLiveFunctions,
      sidebarWidth: s.sidebarWidth,
      toggleSidebar: s.toggleSidebar,
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      openSessionIds: s.openSessionIds,
      isConnecting: s.isConnecting,
    }))
  );

  const [sidebarTab, setSidebarTab] = useState<'items' | 'queries' | 'history'>('items');
  const [historyScope, setHistoryScope] = useState<'current' | 'all'>('current');
  const [searchFilter, setSearchFilter] = useState('');
  const [isFunctionsOpen, setIsFunctionsOpen] = useState(false);
  const [isTablesOpen, setIsTablesOpen] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const [allHistoryExpanded, setAllHistoryExpanded] = useState(false);

  // Context Menu state
  const [tableContextPos, setTableContextPos] = useState<ContextMenuPosition | null>(null);
  const [targetTable, setTargetTable] = useState<{ name: string; schema?: string } | null>(null);

  const [queryContextPos, setQueryContextPos] = useState<ContextMenuPosition | null>(null);
  const [targetQuery, setTargetQuery] = useState<{ id: string; title?: string; sql: string } | null>(null);

  const [functionContextPos, setFunctionContextPos] = useState<ContextMenuPosition | null>(null);
  const [targetFunction, setTargetFunction] = useState<any | null>(null);

  const hasActiveSession = Boolean(activeConnection?.id && openSessionIds.includes(activeConnection.id));

  useEffect(() => {
    if (hasActiveSession && activeConnection?.id) {
      fetchLiveTables(activeConnection);
      fetchLiveFunctions(activeConnection);
    }
  }, [hasActiveSession, activeConnection?.id, activeConnection?.database]);

  const deletedForConn = deletedTables[activeConnection?.id || ''] || [];
  const isMockConn = !activeConnection?.id || activeConnection.id === 'demo' || activeConnection.id.startsWith('mock');
  const liveForConn = hasActiveSession && activeConnection?.id ? liveTables[activeConnection.id] : undefined;
  const isTablesLoading = Boolean(hasActiveSession && !isMockConn && liveForConn === undefined);
  const connectionTables = (!hasActiveSession
    ? []
    : (liveForConn !== undefined
        ? liveForConn
        : (isMockConn ? getTablesForConnection(activeConnection.name, activeConnection.engine) : [])
      )
  ).filter((t) => !deletedForConn.includes(t.name));

  const searchQuery = searchFilter.trim().toLowerCase();

  const filteredTables = searchQuery
    ? connectionTables.filter((t) => t.name.toLowerCase().includes(searchQuery))
    : connectionTables;

  const liveFuncsForConn = hasActiveSession && activeConnection?.id ? liveFunctions[activeConnection.id] : undefined;
  const isFunctionsLoading = Boolean(hasActiveSession && !isMockConn && liveFuncsForConn === undefined);
  const connectionFunctions = !hasActiveSession
    ? []
    : (liveFuncsForConn !== undefined
        ? liveFuncsForConn
        : (isMockConn ? getFunctionsForConnection(activeConnection.name, activeConnection.engine) : [])
      );

  const filteredFunctions = searchQuery
    ? connectionFunctions.filter((f) => f.name.toLowerCase().includes(searchQuery))
    : connectionFunctions;

  const filteredQueries = !hasActiveSession || !activeConnection?.id
    ? []
    : (searchQuery
        ? SAVED_QUERIES.filter(
            (q) =>
              q.title.toLowerCase().includes(searchQuery) ||
              q.desc.toLowerCase().includes(searchQuery)
          )
        : SAVED_QUERIES);

  const scopedHistory = history.filter((h) => {
    if (!hasActiveSession || !activeConnection?.id) return false;
    if (historyScope === 'current') {
      return h.connectionId === activeConnection.id;
    }
    return true;
  });

  const filteredHistory = searchQuery
    ? scopedHistory.filter((h) => h.sql.toLowerCase().includes(searchQuery))
    : scopedHistory;

  const activeTabObj = tabs.find((t) => t.id === activeTabId);
  const isAllTablesActive = activeTabObj?.type === 'stats' && (activeTabObj?.tableName === '__all_tables__' || activeTabObj?.title.startsWith('Tables.'));
  const isAllFunctionsActive = activeTabObj?.type === 'stats' && (activeTabObj?.tableName === '__all_functions__' || activeTabObj?.title.startsWith('Functions.'));

  return (
    <aside
      style={{ width: `${sidebarWidth}px` }}
      className="bg-slate-50 dark:bg-slate-950/70 border-r border-slate-300 dark:border-slate-800/80 flex flex-col justify-between select-none flex-shrink-0 font-sans h-full"
    >
      
      {/* Top Section: Segmented Switcher & Search */}
      <div className="flex-shrink-0 border-b border-slate-300 dark:border-slate-800/80 p-2 space-y-2">
        {/* TablePlus Style 3-Segment Switcher (Items | Queries | History) */}
        <div className="grid grid-cols-3 gap-0.5 bg-slate-200 dark:bg-slate-900/90 p-0.5 rounded-lg border border-slate-300 dark:border-slate-800 text-[11px] font-semibold">
          <button
            onClick={() => setSidebarTab('items')}
            className={`py-1 rounded-md transition-all duration-150 flex items-center justify-center cursor-pointer ${
              sidebarTab === 'items'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Items
          </button>
          <button
            onClick={() => setSidebarTab('queries')}
            className={`py-1 rounded-md transition-all duration-150 flex items-center justify-center cursor-pointer ${
              sidebarTab === 'queries'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Queries
          </button>
          <button
            onClick={() => setSidebarTab('history')}
            className={`py-1 rounded-md transition-all duration-150 flex items-center justify-center cursor-pointer ${
              sidebarTab === 'history'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            History
          </button>
        </div>

        {/* Search Input Bar & Collapse */}
        <div className="flex items-center space-x-1">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={
                sidebarTab === 'items'
                  ? 'Search for item...'
                  : sidebarTab === 'queries'
                  ? 'Search queries...'
                  : 'Search history...'
              }
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-white dark:bg-slate-900/80 border border-slate-300 dark:border-slate-800 rounded-md px-2 py-1 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors pl-6 font-sans"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-1.5 top-1.5" />
          </div>
          <Tooltip side="bottom" content="Filter preferences">
            <button
              className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800/80 rounded transition cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
          <Tooltip side="bottom" content="Collapse Sidebar" shortcut="⌘B">
            <button
              onClick={toggleSidebar}
              className="p-1 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-200 dark:hover:bg-slate-800/80 rounded transition cursor-pointer"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1 text-xs">
        
        {/* Tab 1: Database Items (Functions & Tables) */}
        {sidebarTab === 'items' && (
          !hasActiveSession ? (
            isConnecting ? (
              <div className="p-4 mx-1 my-6 rounded-xl border border-sky-400/40 dark:border-sky-500/30 bg-sky-50/50 dark:bg-sky-950/20 text-center space-y-2.5 animate-in fade-in duration-200">
                <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-900/40 text-sky-500 mx-auto flex items-center justify-center border border-sky-300 dark:border-sky-700/60 shadow-2xs">
                  <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-xs font-semibold text-sky-900 dark:text-sky-200">Connecting...</h3>
                  <p className="text-[10px] text-sky-600 dark:text-sky-400">
                    Establishing database connection
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 mx-1 my-6 rounded-xl border border-slate-200/60 dark:border-slate-800/60 text-center space-y-2.5 animate-in fade-in duration-200">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-500 mx-auto flex items-center justify-center border border-slate-200 dark:border-slate-800">
                  <Database className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">No Connection</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    Connect to view tables & functions
                  </p>
                </div>
                <button
                  onClick={() => setConnectionModalOpen(true)}
                  className="w-full py-1.5 px-2 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-500/30 rounded-lg text-xs font-medium transition cursor-pointer flex items-center justify-center space-x-1"
                >
                  <span>Connect (⌘K)</span>
                </button>
              </div>
            )
          ) : (
          <div className="space-y-1">
            {/* Functions Group */}
            <div>
              <Tooltip side="right" content="View All Functions" shortcut="Functions.public">
                <div
                  onClick={() => {
                    openAllFunctionsTab();
                  }}
                  className={`flex items-center justify-between px-1.5 py-1 text-[11px] font-semibold cursor-pointer rounded transition-colors group ${
                    isAllFunctionsActive
                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-900/50 shadow-2xs'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-center space-x-1">
                    <Tooltip side="bottom" content={isFunctionsOpen ? "Collapse functions list" : "Expand functions list"}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsFunctionsOpen(!isFunctionsOpen);
                        }}
                        className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition"
                      >
                        <ChevronRight
                          className={`w-3.5 h-3.5 transition-transform duration-150 ${
                            isFunctionsOpen ? 'rotate-90' : 'rotate-0'
                          }`}
                        />
                      </button>
                    </Tooltip>
                    <span className="group-hover:text-amber-600 dark:group-hover:text-amber-300 transition-colors">Functions</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono pr-1 group-hover:text-slate-700 dark:group-hover:text-slate-400 transition-colors">
                    {filteredFunctions.length}
                  </span>
                </div>
              </Tooltip>

              {/* Function List (TablePlus Style) */}
              {isFunctionsOpen && (
                <div className="space-y-0.5 pt-0.5 max-h-60 overflow-y-auto no-scrollbar">
                  {isFunctionsLoading && (
                    <div className="px-2.5 py-1.5 flex items-center space-x-2 text-[10px] text-slate-500 font-mono animate-pulse">
                      <div className="w-2 h-2 rounded-full border border-amber-500 border-t-transparent animate-spin" />
                      <span>Loading functions...</span>
                    </div>
                  )}
                  {filteredFunctions.map((fn) => {
                    return (
                      <Tooltip
                        key={fn.name}
                        side="right"
                        content={`Function: ${fn.name}`}
                        description="Click to select • Double-click to open in tab"
                      >
                        <div
                          onClick={() => {
                            setSelectedRowData(fn);
                          }}
                          onDoubleClick={() => {
                            openAllFunctionsTab();
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFunctionContextPos({ x: e.clientX, y: e.clientY });
                            setTargetFunction(fn);
                          }}
                          className="flex items-center justify-between px-2.5 py-1 rounded cursor-pointer text-xs font-mono transition-colors group hover:bg-slate-200/80 dark:hover:bg-slate-900/70 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <div className="w-3.5 h-3.5 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0 text-amber-600 dark:text-amber-400 font-mono font-bold text-[9px]">
                              {'{ }'}
                            </div>
                            <span className="truncate">{fn.name}</span>
                          </div>
                        </div>
                      </Tooltip>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tables Group */}
            <div>
              <Tooltip side="right" content="View All Tables Statistics" shortcut="Tables.public">
                <div
                  onClick={() => {
                    openAllTableStatsTab();
                  }}
                  className={`flex items-center justify-between px-1.5 py-1 text-[11px] font-semibold cursor-pointer rounded transition-colors group ${
                    isAllTablesActive
                      ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 font-bold border border-sky-200 dark:border-sky-900/50 shadow-2xs'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-center space-x-1">
                    <Tooltip side="bottom" content={isTablesOpen ? "Collapse tables list" : "Expand tables list"}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsTablesOpen(!isTablesOpen);
                        }}
                        className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition"
                      >
                        <ChevronRight
                          className={`w-3.5 h-3.5 transition-transform duration-150 ${
                            isTablesOpen ? 'rotate-90' : 'rotate-0'
                          }`}
                        />
                      </button>
                    </Tooltip>
                    <span className="group-hover:text-sky-600 dark:group-hover:text-sky-300 transition-colors">Tables</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono pr-1 group-hover:text-slate-700 dark:group-hover:text-slate-400 transition-colors">
                    {isTablesLoading ? '...' : filteredTables.length}
                  </span>
                </div>
              </Tooltip>

              {/* Table List (TablePlus Style) */}
              {isTablesOpen && (
                <div className="space-y-0.5 pt-0.5">
                  {isTablesLoading && (
                    <div className="px-2.5 py-1.5 flex items-center space-x-2 text-[10px] text-slate-500 font-mono animate-pulse">
                      <div className="w-2 h-2 rounded-full border border-sky-500 border-t-transparent animate-spin" />
                      <span>Loading tables...</span>
                    </div>
                  )}
                  {filteredTables.map((tbl: any) => {
                    const isSelected = selectedTable === tbl.name;
                    const displayBadge =
                      tbl.count && tbl.count !== 'live'
                        ? tbl.count
                        : tbl.estimated_rows !== undefined && tbl.estimated_rows >= 0
                        ? (tbl.estimated_rows >= 1_000_000
                            ? `${(tbl.estimated_rows / 1_000_000).toFixed(1)}M`
                            : tbl.estimated_rows >= 1_000
                            ? `${(tbl.estimated_rows / 1_000).toFixed(1)}K`
                            : `${tbl.estimated_rows}`)
                        : (tbl.total_size || '0');

                    return (
                      <Tooltip
                        key={tbl.schema ? `${tbl.schema}.${tbl.name}` : tbl.name}
                        side="right"
                        delay={150}
                        content={
                          <div className="flex flex-col space-y-1 py-0.5 text-left min-w-[170px]">
                            <div className="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-1">
                              <span className="font-semibold text-slate-100 text-xs truncate max-w-[150px]">{tbl.name}</span>
                              {tbl.schema && (
                                <span className="text-[9px] px-1 py-0.2 rounded font-mono bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                  {tbl.schema}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-mono text-slate-300">
                              {tbl.estimated_rows !== undefined && (
                                <div><span className="text-slate-400">Rows:</span> {Number(tbl.estimated_rows).toLocaleString()}</div>
                              )}
                              {tbl.total_size && (
                                <div><span className="text-slate-400">Size:</span> {tbl.total_size}</div>
                              )}
                              {tbl.data_size && (
                                <div><span className="text-slate-400">Data:</span> {tbl.data_size}</div>
                              )}
                              {tbl.index_size && (
                                <div><span className="text-slate-400">Index:</span> {tbl.index_size}</div>
                              )}
                            </div>
                            {tbl.comment && tbl.comment !== '--' && (
                              <div className="text-[10px] text-slate-400 italic truncate max-w-[200px]">
                                {tbl.comment}
                              </div>
                            )}
                            <div className="pt-0.5 text-[10px] text-slate-400/80 italic">
                              Double-click to open • Right-click for options
                            </div>
                          </div>
                        }
                      >
                        <div
                          onClick={() => {
                            openTableGridTab(tbl.name, tbl.schema);
                          }}
                          onDoubleClick={() => {
                            openTableGridTab(tbl.name, tbl.schema);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setTableContextPos({ x: e.clientX, y: e.clientY });
                            setTargetTable({ name: tbl.name, schema: tbl.schema });
                          }}
                          className={`flex items-center justify-between px-2.5 py-1 rounded cursor-pointer text-xs font-mono transition-colors group ${
                            isSelected
                              ? 'bg-sky-100 dark:bg-slate-800/90 text-sky-900 dark:text-slate-100 font-semibold shadow-xs border border-sky-300/60 dark:border-slate-700/80'
                              : 'hover:bg-slate-200/80 dark:hover:bg-slate-900/70 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-200 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <TableIcon
                              className={`w-3.5 h-3.5 flex-shrink-0 ${
                                isSelected ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-400'
                              }`}
                            />
                            <span className="truncate">{tbl.name}</span>
                          </div>
                        <div className="flex items-center space-x-1.5 flex-shrink-0">
                          {tbl.total_size && displayBadge !== tbl.total_size && (
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono hidden group-hover:inline">
                              {tbl.total_size}
                            </span>
                          )}
                          <span className={`text-[10px] font-mono px-1 py-0.2 rounded ${
                            isSelected
                              ? 'bg-sky-200/60 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 font-semibold'
                              : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                          }`}>
                            {displayBadge}
                          </span>
                        </div>
                      </div>
                    </Tooltip>
                  );
                })}
                </div>
              )}
            </div>
          </div>
          )
        )}

        {/* Tab 2: Saved Queries */}
        {sidebarTab === 'queries' && (
          !hasActiveSession ? (
            <div className="p-4 mx-1 my-6 rounded-xl border border-slate-200/60 dark:border-slate-800/60 text-center space-y-2.5 animate-in fade-in duration-200">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-500 mx-auto flex items-center justify-center border border-slate-200 dark:border-slate-800">
                <Terminal className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">No Connection</h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  Connect to view saved queries
                </p>
              </div>
              <button
                onClick={() => setConnectionModalOpen(true, 'catalog')}
                className="mt-2 w-full py-1.5 px-3 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-semibold text-xs transition cursor-pointer"
              >
                Connect (⌘K)
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="px-1.5 py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Saved Queries ({filteredQueries.length})
              </div>
              {filteredQueries.map((q) => (
                <Tooltip
                  key={q.id}
                  side="right"
                  content={q.title}
                  description="Double-click to open query tab • Right-click for options"
                >
                  <div
                    onDoubleClick={() => openNewQueryTab(q.sql)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setQueryContextPos({ x: e.clientX, y: e.clientY });
                      setTargetQuery({ id: q.id, title: q.title, sql: q.sql });
                    }}
                    className="p-2 rounded-lg bg-white dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-900/90 border border-slate-200 dark:border-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer transition-all space-y-1 group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 truncate">
                        <Terminal className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 group-hover:scale-110 transition-transform flex-shrink-0" />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-slate-950 dark:group-hover:text-white truncate">
                          {q.title}
                        </span>
                      </div>
                      <span className="text-[9px] px-1 py-0.2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-slate-600 dark:text-slate-500 font-mono">
                        SQL
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{q.desc}</p>
                  </div>
                </Tooltip>
              ))}
            </div>
          )
        )}

        {/* Tab 3: Execution History */}
        {sidebarTab === 'history' && (
          !hasActiveSession ? (
            <div className="p-4 mx-1 my-6 rounded-xl border border-slate-200/60 dark:border-slate-800/60 text-center space-y-2.5 animate-in fade-in duration-200">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-500 mx-auto flex items-center justify-center border border-slate-200 dark:border-slate-800">
                <FileCode className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">No Connection</h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  Connect to view execution history
                </p>
              </div>
              <button
                onClick={() => setConnectionModalOpen(true, 'catalog')}
                className="mt-2 w-full py-1.5 px-3 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-semibold text-xs transition cursor-pointer"
              >
                Connect (⌘K)
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1.5 py-1">
                <div className="flex items-center space-x-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Recent ({filteredHistory.length})
                  </span>
                  {activeConnection?.id && (
                    <div className="inline-flex rounded-md p-0.5 bg-slate-200/80 dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 text-[9px] font-medium">
                      <Tooltip side="top" content={`Show queries for ${activeConnection.name}`}>
                        <button
                          onClick={() => setHistoryScope('current')}
                          className={`px-1.5 py-0.5 rounded transition cursor-pointer ${
                            historyScope === 'current'
                              ? 'bg-white dark:bg-sky-500 text-sky-900 dark:text-slate-950 font-bold shadow-2xs'
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          Active DB
                        </button>
                      </Tooltip>
                      <Tooltip side="top" content="Show queries across all databases">
                        <button
                          onClick={() => setHistoryScope('all')}
                          className={`px-1.5 py-0.5 rounded transition cursor-pointer ${
                            historyScope === 'all'
                              ? 'bg-white dark:bg-sky-500 text-sky-900 dark:text-slate-950 font-bold shadow-2xs'
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          All
                        </button>
                      </Tooltip>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setAllHistoryExpanded(!allHistoryExpanded)}
                  className="text-[10px] text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-sans font-medium cursor-pointer"
                >
                  {allHistoryExpanded ? 'Collapse All' : 'Expand All'}
                </button>
              </div>

              {filteredHistory.length === 0 && (
                <div className="py-6 px-3 text-center text-slate-400 dark:text-slate-500 text-xs space-y-1.5">
                  <div>No executions recorded for {activeConnection?.name || 'this session'}.</div>
                  {historyScope === 'current' && history.some((h) => h.connectionId && h.connectionId !== activeConnection?.id) && (
                    <button
                      onClick={() => setHistoryScope('all')}
                      className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline cursor-pointer font-medium block mx-auto"
                    >
                      View queries across other databases
                    </button>
                  )}
                </div>
              )}
              {filteredHistory.map((h) => {
                const isExpanded = allHistoryExpanded || !!expandedHistory[h.id];

                return (
                  <Tooltip
                    key={h.id}
                    side="right"
                    content="Double-click to open in new SQL tab"
                    description="Click expand to view full query"
                  >
                    <div
                      onDoubleClick={() => openNewQueryTab(h.sql)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setQueryContextPos({ x: e.clientX, y: e.clientY });
                        setTargetQuery({ id: h.id, title: `Query (${h.durationMs}ms)`, sql: h.sql });
                      }}
                      className="p-2.5 rounded-xl bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-900/90 border border-slate-200 dark:border-slate-800/70 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer transition-all space-y-1.5 group shadow-2xs"
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                        <div className="flex items-center space-x-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold">{h.durationMs}ms</span>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <span className="text-slate-400 dark:text-slate-500">{h.timestamp.replace('Today at ', '')}</span>
                        </div>

                        <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <Tooltip side="top" content="Copy SQL Query">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(h.sql);
                                showToast('📋 Copied SQL query to clipboard');
                              }}
                              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </Tooltip>
                          <Tooltip side="top" content={isExpanded ? "Collapse full query" : "Expand to view full query"}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedHistory((prev) => ({ ...prev, [h.id]: !prev[h.id] }));
                              }}
                              className="px-1.5 py-0.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-[10px] text-sky-600 dark:text-sky-400 font-sans font-medium transition"
                            >
                              {isExpanded ? 'Collapse' : 'Expand'}
                            </button>
                          </Tooltip>
                        </div>
                      </div>

                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedHistory((prev) => ({ ...prev, [h.id]: !prev[h.id] }));
                        }}
                        className={`font-mono text-[11px] text-slate-800 dark:text-slate-200 leading-relaxed bg-slate-50 dark:bg-slate-950/70 p-2 rounded-lg border border-slate-200 dark:border-slate-800/80 transition-all ${
                          isExpanded
                            ? 'whitespace-pre-wrap break-words max-h-72 overflow-y-auto select-text font-normal'
                            : 'line-clamp-2 cursor-pointer'
                        }`}
                      >
                        {h.sql}
                      </div>
                    </div>
                  </Tooltip>
                );
              })}
            </div>
          )
        )}

      </div>

      {/* Footer Section: Add Item & Database/Schema Selector Dropdown */}
      <div className="h-9 px-2 border-t border-slate-300 dark:border-slate-800/80 bg-slate-100 dark:bg-slate-950/90 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 flex-shrink-0">
        <Tooltip side="top" content="New SQL Query" shortcut="⌘T">
          <button
            onClick={() => openNewQueryTab()}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </Tooltip>

        {/* TablePlus Database & Schema Switcher Dropdown */}
        <Tooltip
          side="top"
          content={!hasActiveSession ? "Connect Database" : "Switch Database or Schema"}
          shortcut={!hasActiveSession ? "⌘K" : "⌘O"}
        >
          <button
            onClick={() => {
              if (!activeConnection?.id) {
                setConnectionModalOpen(true);
              } else {
                setDatabaseModalOpen(true);
              }
            }}
            className="flex items-center space-x-1.5 px-2 py-0.5 hover:bg-slate-200 dark:hover:bg-slate-800/80 rounded text-[11px] font-mono text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition group border border-transparent hover:border-slate-300 dark:hover:border-slate-700/60 cursor-pointer"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                !hasActiveSession
                  ? 'bg-slate-400'
                  : activeConnection.connectionStatus === 'failed'
                  ? 'bg-rose-500 shadow-xs shadow-rose-500/50'
                  : 'bg-emerald-500 shadow-xs shadow-emerald-500/50'
              }`}
            />
            <span className="font-semibold text-sky-600 dark:text-sky-400 truncate max-w-[120px]">
              {!hasActiveSession ? 'No Connection' : (activeConnection.database || 'default')}
            </span>
            {hasActiveSession && (
              <>
                <span className="text-slate-400 dark:text-slate-500">:</span>
                <span className="text-slate-700 dark:text-slate-300">public</span>
              </>
            )}
            <ChevronDown className="w-3 h-3 text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200 transition-transform" />
          </button>
        </Tooltip>
      </div>

      {/* Table Context Menu */}
      {tableContextPos && targetTable && (
        <ContextMenuContainer
          position={tableContextPos}
          onClose={() => {
            setTableContextPos(null);
            setTargetTable(null);
          }}
          width={240}
        >
          <ContextMenuHeader title={`Table: ${targetTable.schema ? `${targetTable.schema}.${targetTable.name}` : targetTable.name}`} />
          <ContextMenuItem
            icon={<TableIcon className="w-3.5 h-3.5 text-sky-400" />}
            label="Open Data (Grid)"
            shortcut="↵"
            onClick={() => {
              setSelectedTable(targetTable.name);
              openTableGridTab(targetTable.name, targetTable.schema);
              setTableViewMode('data');
            }}
          />
          <ContextMenuItem
            icon={<Columns className="w-3.5 h-3.5 text-indigo-400" />}
            label="Open Structure (Schema)"
            onClick={() => {
              setSelectedTable(targetTable.name);
              openTableSchemaTab(targetTable.name, targetTable.schema);
            }}
          />
          <ContextMenuItem
            icon={<RefreshCw className="w-3.5 h-3.5 text-emerald-400" />}
            label="Reload Table Data"
            shortcut="⌘R"
            onClick={() => {
              reloadData(targetTable.name);
            }}
          />
          <ContextMenuItem
            icon={<Terminal className="w-3.5 h-3.5 text-amber-400" />}
            label="Query in New Tab"
            shortcut="⌘E"
            onClick={() => {
              const limit = settings.defaultQueryLimit || 100;
              const qualified = targetTable.schema ? `"${targetTable.schema}"."${targetTable.name}"` : `"${targetTable.name}"`;
              openNewQueryTab(`SELECT * FROM ${qualified} LIMIT ${limit};`);
            }}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy Table Name"
            onClick={() => {
              const qualified = targetTable.schema ? `"${targetTable.schema}"."${targetTable.name}"` : targetTable.name;
              navigator.clipboard.writeText(qualified);
              showToast(`📋 Copied "${qualified}"`);
            }}
          />
          <ContextMenuItem
            icon={<FileCode className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy SELECT Query"
            onClick={() => {
              const limit = settings.defaultQueryLimit || 100;
              const qualified = targetTable.schema ? `"${targetTable.schema}"."${targetTable.name}"` : `"${targetTable.name}"`;
              const query = `SELECT * FROM ${qualified} LIMIT ${limit};`;
              navigator.clipboard.writeText(query);
              showToast(`📋 Copied SELECT query for "${targetTable.name}"`);
            }}
          />
          <ContextMenuItem
            icon={<Code className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy INSERT Template"
            onClick={() => {
              const schema = getTableSchema(targetTable.name);
              const cols: ColumnDefinition[] = schema?.columns && schema.columns.length > 0
                ? schema.columns
                : [
                    { name: 'id', type: 'integer', isNullable: false },
                    { name: 'name', type: 'varchar', isNullable: false },
                    { name: 'created_at', type: 'timestamp', isNullable: false },
                  ];
              
              const insertCols = cols.filter((c) => !c.defaultValue?.includes('generated always'));
              const colNames = insertCols.map((c) => `"${c.name}"`).join(', ');
              const valPlaceholders = insertCols
                .map((c) => {
                  const type = (c.type || '').toLowerCase();
                  if (type.includes('int') || type.includes('serial')) return '1';
                  if (type.includes('bool')) return 'TRUE';
                  if (type.includes('json')) return "'{}'::jsonb";
                  if (type.includes('time') || type.includes('date')) return "'2026-10-22 18:30:00'";
                  if (type.includes('num') || type.includes('float') || type.includes('dec')) return '99.99';
                  return "'sample_value'";
                })
                .join(', ');
              
              const qualified = targetTable.schema ? `"${targetTable.schema}"."${targetTable.name}"` : `"${targetTable.name}"`;
              const insertSql = `INSERT INTO ${qualified} (${colNames})\nVALUES (${valPlaceholders});`;
              navigator.clipboard.writeText(insertSql);
              showToast(`📋 Copied INSERT template for "${targetTable.name}"`);
            }}
          />
          <ContextMenuItem
            icon={<Database className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy CREATE TABLE DDL"
            onClick={() => {
              const schema = getTableSchema(targetTable.name);
              let ddlSql = schema?.ddl;
              const qualified = targetTable.schema ? `"${targetTable.schema}"."${targetTable.name}"` : `"${targetTable.name}"`;
              if (!ddlSql) {
                const cols = schema?.columns || [];
                const colDefs = cols
                  .map((c) => `  "${c.name}" ${c.type.toUpperCase()}${c.isPrimaryKey ? ' PRIMARY KEY' : ''}${c.isNullable ? '' : ' NOT NULL'}`)
                  .join(',\n');
                ddlSql = `CREATE TABLE ${qualified} (\n${colDefs}\n);`;
              }
              navigator.clipboard.writeText(ddlSql.trim());
              showToast(`📋 Copied CREATE TABLE DDL for "${targetTable.name}"`);
            }}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Sparkles className="w-3.5 h-3.5 text-rose-400" />}
            label="Truncate Table..."
            danger
            onClick={() => {
              openTableActionModal('truncate', targetTable.name);
            }}
          />
          <ContextMenuItem
            icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
            label="Drop Table..."
            danger
            onClick={() => {
              openTableActionModal('delete', targetTable.name);
            }}
          />
        </ContextMenuContainer>
      )}

      {/* Saved Query / History Context Menu */}
      {queryContextPos && targetQuery && (
        <ContextMenuContainer
          position={queryContextPos}
          onClose={() => {
            setQueryContextPos(null);
            setTargetQuery(null);
          }}
          width={220}
        >
          <ContextMenuHeader title={targetQuery.title || 'SQL Query'} />
          <ContextMenuItem
            icon={<Play className="w-3.5 h-3.5 text-emerald-400" />}
            label="Open in New Query Tab"
            shortcut="⌘E"
            onClick={() => {
              openNewQueryTab(targetQuery.sql);
              setQueryContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy SQL"
            shortcut="⌘C"
            onClick={() => {
              navigator.clipboard.writeText(targetQuery.sql);
              showToast('📋 Copied SQL query to clipboard');
              setQueryContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Sparkles className="w-3.5 h-3.5 text-sky-400" />}
            label="Copy Formatted SQL"
            onClick={() => {
              try {
                const formatted = formatSql(targetQuery.sql, {
                  language: 'postgresql',
                  keywordCase: 'upper',
                  dataTypeCase: 'upper',
                  functionCase: 'upper',
                  tabWidth: 2,
                });
                navigator.clipboard.writeText(formatted);
                showToast('✨ Copied beautified SQL to clipboard');
              } catch {
                navigator.clipboard.writeText(targetQuery.sql);
                showToast('📋 Copied SQL to clipboard');
              }
              setQueryContextPos(null);
            }}
          />
        </ContextMenuContainer>
      )}

      {/* Function Context Menu */}
      {functionContextPos && targetFunction && (
        <ContextMenuContainer
          position={functionContextPos}
          onClose={() => {
            setFunctionContextPos(null);
            setTargetFunction(null);
          }}
          width={230}
        >
          <ContextMenuHeader title={`Function: ${targetFunction.name}`} />
          <ContextMenuItem
            icon={<Code className="w-3.5 h-3.5 text-amber-400" />}
            label="Inspect Function"
            onClick={() => {
              setSelectedRowData(targetFunction);
              setFunctionContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<FileCode className="w-3.5 h-3.5 text-sky-400" />}
            label="Open All Functions Overview"
            onClick={() => {
              openAllFunctionsTab();
              setFunctionContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Terminal className="w-3.5 h-3.5 text-emerald-400" />}
            label="Open in SQL Editor"
            shortcut="⌘E"
            onClick={() => {
              const sql = targetFunction.definition || `SELECT ${targetFunction.name}();`;
              openNewQueryTab(sql);
              setFunctionContextPos(null);
            }}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy Function Name"
            onClick={() => {
              navigator.clipboard.writeText(targetFunction.name);
              showToast(`📋 Copied "${targetFunction.name}"`);
              setFunctionContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy SELECT Call"
            onClick={() => {
              const callSql = `SELECT ${targetFunction.name}();`;
              navigator.clipboard.writeText(callSql);
              showToast(`📋 Copied "${callSql}"`);
              setFunctionContextPos(null);
            }}
          />
        </ContextMenuContainer>
      )}

    </aside>
  );
};
