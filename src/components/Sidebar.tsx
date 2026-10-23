import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { getTablesForConnection, getTableSchema, getFunctionsForConnection } from '../data/schemas';
import { ColumnDefinition } from '../types';
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
    truncateTable,
    dropTable,
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
  } = useAppStore();

  const [sidebarTab, setSidebarTab] = useState<'items' | 'queries' | 'history'>('items');
  const [searchFilter, setSearchFilter] = useState('');
  const [isFunctionsOpen, setIsFunctionsOpen] = useState(false);
  const [isTablesOpen, setIsTablesOpen] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const [allHistoryExpanded, setAllHistoryExpanded] = useState(false);

  // Context Menu state
  const [tableContextPos, setTableContextPos] = useState<ContextMenuPosition | null>(null);
  const [targetTable, setTargetTable] = useState<string | null>(null);

  const [queryContextPos, setQueryContextPos] = useState<ContextMenuPosition | null>(null);
  const [targetQuery, setTargetQuery] = useState<{ id: string; title?: string; sql: string } | null>(null);

  useEffect(() => {
    if (activeConnection?.id) {
      fetchLiveTables(activeConnection);
      fetchLiveFunctions(activeConnection);
    }
  }, [activeConnection?.id, activeConnection?.database]);

  const deletedForConn = deletedTables[activeConnection?.id || ''] || [];
  const liveForConn = activeConnection?.id ? liveTables[activeConnection.id] : undefined;
  const connectionTables = (!activeConnection?.id
    ? []
    : (liveForConn && liveForConn.length > 0
        ? liveForConn
        : getTablesForConnection(activeConnection.name, activeConnection.engine)
      )
  ).filter((t) => !deletedForConn.includes(t.name));

  const filteredTables = connectionTables.filter((t) =>
    t.name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const liveFuncsForConn = activeConnection?.id ? liveFunctions[activeConnection.id] : undefined;
  const connectionFunctions = !activeConnection?.id
    ? []
    : (liveFuncsForConn && liveFuncsForConn.length > 0
        ? liveFuncsForConn
        : getFunctionsForConnection(activeConnection.name, activeConnection.engine)
      );

  const filteredFunctions = connectionFunctions.filter((f) =>
    f.name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const filteredQueries = SAVED_QUERIES.filter(
    (q) =>
      q.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      q.desc.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const filteredHistory = history.filter((h) =>
    h.sql.toLowerCase().includes(searchFilter.toLowerCase())
  );

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
          <button
            className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800/80 rounded transition cursor-pointer"
            title="Filter preferences"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleSidebar}
            className="p-1 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-200 dark:hover:bg-slate-800/80 rounded transition cursor-pointer"
            title="Collapse Sidebar (⌘B)"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1 text-xs">
        
        {/* Tab 1: Database Items (Functions & Tables) */}
        {sidebarTab === 'items' && (
          !activeConnection?.id ? (
            <div className="p-4 mx-1 my-3 rounded-xl bg-gradient-to-b from-sky-50/80 to-white dark:from-slate-900/80 dark:to-slate-950/80 border border-sky-200/80 dark:border-sky-500/20 shadow-sm space-y-3 text-center animate-in fade-in duration-200">
              <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 mx-auto flex items-center justify-center shadow-2xs">
                <Database className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">No Connection Active</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Connect to a database to inspect tables, browse live data, and run queries.
                </p>
              </div>
              <button
                onClick={() => setConnectionModalOpen(true)}
                className="w-full py-2 px-3 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-semibold rounded-lg text-xs transition cursor-pointer shadow-sm flex items-center justify-center space-x-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Connection (⌘K)</span>
              </button>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 text-left space-y-2 text-[10px] text-slate-500 dark:text-slate-400">
                <div className="flex items-start space-x-1.5">
                  <span className="text-amber-500 shrink-0">💡</span>
                  <span><strong>Import tools:</strong> Drag &amp; drop TablePlus, DBeaver, or pgAdmin exports to connect instantly.</span>
                </div>
                <div className="flex items-start space-x-1.5">
                  <span className="text-sky-500 shrink-0">⚡</span>
                  <span><strong>Shortcut:</strong> Press <kbd className="px-1 py-0.5 font-mono bg-slate-200 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300 font-bold">⌘K</kbd> to open connection switcher anytime.</span>
                </div>
                <div className="flex items-start space-x-1.5">
                  <span className="text-emerald-500 shrink-0">🛡️</span>
                  <span><strong>Safety guard:</strong> Production databases have 2-step verification for safe queries.</span>
                </div>
              </div>
            </div>
          ) : (
          <div className="space-y-1">
            {/* Functions Group */}
            <div>
              <div
                onClick={() => {
                  openAllFunctionsTab();
                }}
                className={`flex items-center justify-between px-1.5 py-1 text-[11px] font-semibold cursor-pointer rounded transition-colors group ${
                  isAllFunctionsActive
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-900/50 shadow-2xs'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-900/50'
                }`}
                title="Click to view All Functions (Functions.public)"
              >
                <div className="flex items-center space-x-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsFunctionsOpen(!isFunctionsOpen);
                    }}
                    className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition"
                    title={isFunctionsOpen ? "Collapse functions list" : "Expand functions list"}
                  >
                    <ChevronRight
                      className={`w-3.5 h-3.5 transition-transform duration-150 ${
                        isFunctionsOpen ? 'rotate-90' : 'rotate-0'
                      }`}
                    />
                  </button>
                  <span className="group-hover:text-amber-600 dark:group-hover:text-amber-300 transition-colors">Functions</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono pr-1 group-hover:text-slate-700 dark:group-hover:text-slate-400 transition-colors">
                  {filteredFunctions.length}
                </span>
              </div>

              {/* Function List (TablePlus Style) */}
              {isFunctionsOpen && (
                <div className="space-y-0.5 pt-0.5 max-h-60 overflow-y-auto no-scrollbar">
                  {filteredFunctions.map((fn) => {
                    return (
                      <div
                        key={fn.name}
                        onClick={() => {
                          setSelectedRowData(fn);
                        }}
                        onDoubleClick={() => {
                          openAllFunctionsTab();
                        }}
                        title="Click to select • Double-click to open in new tab"
                        className="flex items-center justify-between px-2.5 py-1 rounded cursor-pointer text-xs font-mono transition-colors group hover:bg-slate-200/80 dark:hover:bg-slate-900/70 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <div className="w-3.5 h-3.5 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0 text-amber-600 dark:text-amber-400 font-mono font-bold text-[9px]">
                            {'{ }'}
                          </div>
                          <span className="truncate">{fn.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tables Group */}
            <div>
              <div
                onClick={() => {
                  openAllTableStatsTab();
                }}
                className={`flex items-center justify-between px-1.5 py-1 text-[11px] font-semibold cursor-pointer rounded transition-colors group ${
                  isAllTablesActive
                    ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 font-bold border border-sky-200 dark:border-sky-900/50 shadow-2xs'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-900/50'
                }`}
                title="Click to view All Tables Statistics (Tables.public)"
              >
                <div className="flex items-center space-x-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsTablesOpen(!isTablesOpen);
                    }}
                    className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition"
                    title={isTablesOpen ? "Collapse tables list" : "Expand tables list"}
                  >
                    <ChevronRight
                      className={`w-3.5 h-3.5 transition-transform duration-150 ${
                        isTablesOpen ? 'rotate-90' : 'rotate-0'
                      }`}
                    />
                  </button>
                  <span className="group-hover:text-sky-600 dark:group-hover:text-sky-300 transition-colors">Tables</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono pr-1 group-hover:text-slate-700 dark:group-hover:text-slate-400 transition-colors">
                  {filteredTables.length}
                </span>
              </div>

              {/* Table List (TablePlus Style) */}
              {isTablesOpen && (
                <div className="space-y-0.5 pt-0.5">
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

                    const tooltipParts = [
                      `Table: ${tbl.name}`,
                      tbl.schema ? `Schema: ${tbl.schema}` : null,
                      tbl.estimated_rows !== undefined ? `Rows: ${Number(tbl.estimated_rows).toLocaleString()}` : null,
                      tbl.total_size ? `Size: ${tbl.total_size}` : null,
                      tbl.data_size ? `Data: ${tbl.data_size}` : null,
                      tbl.index_size ? `Index: ${tbl.index_size}` : null,
                      tbl.comment && tbl.comment !== '--' ? `Comment: ${tbl.comment}` : null,
                    ].filter(Boolean);

                    return (
                      <div
                        key={tbl.name}
                        onClick={() => {
                          setSelectedTable(tbl.name);
                          setSelectedRowData(null);
                        }}
                        onDoubleClick={() => {
                          openTableGridTab(tbl.name);
                        }}
                        title={tooltipParts.join(' • ')}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setTableContextPos({ x: e.clientX, y: e.clientY });
                          setTargetTable(tbl.name);
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
          <div className="space-y-1">
            <div className="px-1.5 py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Saved Queries ({filteredQueries.length})
            </div>
            {filteredQueries.map((q) => (
              <div
                key={q.id}
                onDoubleClick={() => openNewQueryTab(q.sql)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setQueryContextPos({ x: e.clientX, y: e.clientY });
                  setTargetQuery({ id: q.id, title: q.title, sql: q.sql });
                }}
                className="p-2 rounded-lg bg-white dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-900/90 border border-slate-200 dark:border-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer transition-all space-y-1 group"
                title="Double-click to open query tab (Right click for options)"
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
            ))}
          </div>
        )}

        {/* Tab 3: Execution History */}
        {sidebarTab === 'history' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1.5 py-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Recent Executions ({filteredHistory.length})
              </span>
              <button
                onClick={() => setAllHistoryExpanded(!allHistoryExpanded)}
                className="text-[10px] text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-sans font-medium cursor-pointer"
              >
                {allHistoryExpanded ? 'Collapse All' : 'Expand All'}
              </button>
            </div>
            {filteredHistory.map((h) => {
              const isExpanded = allHistoryExpanded || !!expandedHistory[h.id];

              return (
                <div
                  key={h.id}
                  onDoubleClick={() => openNewQueryTab(h.sql)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setQueryContextPos({ x: e.clientX, y: e.clientY });
                    setTargetQuery({ id: h.id, title: `Query (${h.durationMs}ms)`, sql: h.sql });
                  }}
                  className="p-2.5 rounded-xl bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-900/90 border border-slate-200 dark:border-slate-800/70 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer transition-all space-y-1.5 group shadow-2xs"
                  title="Double-click to open in new SQL tab • Click expand to view full query"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <div className="flex items-center space-x-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">{h.durationMs}ms</span>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="text-slate-400 dark:text-slate-500">{h.timestamp.replace('Today at ', '')}</span>
                    </div>

                    <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(h.sql);
                          showToast('📋 Copied SQL query to clipboard');
                        }}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                        title="Copy SQL Query"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedHistory((prev) => ({ ...prev, [h.id]: !prev[h.id] }));
                        }}
                        className="px-1.5 py-0.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-[10px] text-sky-600 dark:text-sky-400 font-sans font-medium transition"
                        title={isExpanded ? "Collapse full query" : "Expand to view full query"}
                      >
                        {isExpanded ? 'Collapse' : 'Expand'}
                      </button>
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
              );
            })}
          </div>
        )}

      </div>

      {/* Footer Section: Add Item & Database/Schema Selector Dropdown */}
      <div className="h-9 px-2 border-t border-slate-300 dark:border-slate-800/80 bg-slate-100 dark:bg-slate-950/90 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 flex-shrink-0">
        <button
          onClick={() => openNewQueryTab()}
          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded transition cursor-pointer"
          title="New SQL Query (⌘E / ⌘T)"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {/* TablePlus Database & Schema Switcher Dropdown */}
        <button
          onClick={() => {
            if (!activeConnection?.id) {
              setConnectionModalOpen(true);
            } else {
              setDatabaseModalOpen(true);
            }
          }}
          className="flex items-center space-x-1.5 px-2 py-0.5 hover:bg-slate-200 dark:hover:bg-slate-800/80 rounded text-[11px] font-mono text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition group border border-transparent hover:border-slate-300 dark:hover:border-slate-700/60 cursor-pointer"
          title={!activeConnection?.id ? "Connect Database (⌘K)" : "Switch Database or Schema (⌘O)"}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              !activeConnection?.id
                ? 'bg-slate-400'
                : activeConnection.connectionStatus === 'failed'
                ? 'bg-rose-500 shadow-xs shadow-rose-500/50'
                : 'bg-emerald-500 shadow-xs shadow-emerald-500/50'
            }`}
          />
          <span className="font-semibold text-sky-600 dark:text-sky-400 truncate max-w-[120px]">
            {!activeConnection?.id ? 'No Connection' : (activeConnection.database || 'default')}
          </span>
          {activeConnection?.id && (
            <>
              <span className="text-slate-400 dark:text-slate-500">:</span>
              <span className="text-slate-700 dark:text-slate-300">public</span>
            </>
          )}
          <ChevronDown className="w-3 h-3 text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200 transition-transform" />
        </button>
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
          <ContextMenuHeader title={`Table: ${targetTable}`} />
          <ContextMenuItem
            icon={<TableIcon className="w-3.5 h-3.5 text-sky-400" />}
            label="Open Data (Grid)"
            shortcut="↵"
            onClick={() => {
              setSelectedTable(targetTable);
              openTableGridTab(targetTable);
              setTableViewMode('data');
            }}
          />
          <ContextMenuItem
            icon={<Columns className="w-3.5 h-3.5 text-indigo-400" />}
            label="Open Structure (Schema)"
            onClick={() => {
              setSelectedTable(targetTable);
              openTableSchemaTab(targetTable);
            }}
          />
          <ContextMenuItem
            icon={<RefreshCw className="w-3.5 h-3.5 text-emerald-400" />}
            label="Reload Table Data"
            shortcut="⌘R"
            onClick={() => {
              reloadData(targetTable);
            }}
          />
          <ContextMenuItem
            icon={<Terminal className="w-3.5 h-3.5 text-amber-400" />}
            label="Query in New Tab"
            shortcut="⌘E"
            onClick={() => {
              const limit = settings.defaultQueryLimit || 100;
              openNewQueryTab(`SELECT * FROM ${targetTable} LIMIT ${limit};`);
            }}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy Table Name"
            onClick={() => {
              navigator.clipboard.writeText(targetTable);
              showToast(`📋 Copied "${targetTable}"`);
            }}
          />
          <ContextMenuItem
            icon={<FileCode className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy SELECT Query"
            onClick={() => {
              const limit = settings.defaultQueryLimit || 100;
              const query = `SELECT * FROM ${targetTable} LIMIT ${limit};`;
              navigator.clipboard.writeText(query);
              showToast(`📋 Copied SELECT query for "${targetTable}"`);
            }}
          />
          <ContextMenuItem
            icon={<Code className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy INSERT Template"
            onClick={() => {
              const schema = getTableSchema(targetTable);
              const cols: ColumnDefinition[] = schema?.columns && schema.columns.length > 0
                ? schema.columns
                : [
                    { name: 'id', type: 'integer', isNullable: false },
                    { name: 'name', type: 'varchar', isNullable: false },
                    { name: 'created_at', type: 'timestamp', isNullable: false },
                  ];
              
              const insertCols = cols.filter((c) => !c.defaultValue?.includes('generated always'));
              const colNames = insertCols.map((c) => c.name).join(', ');
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
              
              const insertSql = `INSERT INTO ${targetTable} (${colNames})\nVALUES (${valPlaceholders});`;
              navigator.clipboard.writeText(insertSql);
              showToast(`📋 Copied INSERT template for "${targetTable}"`);
            }}
          />
          <ContextMenuItem
            icon={<Database className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy CREATE TABLE DDL"
            onClick={() => {
              const schema = getTableSchema(targetTable);
              let ddlSql = schema?.ddl;
              if (!ddlSql) {
                const cols = schema?.columns || [];
                const colDefs = cols
                  .map((c) => `  "${c.name}" ${c.type.toUpperCase()}${c.isPrimaryKey ? ' PRIMARY KEY' : ''}${c.isNullable ? '' : ' NOT NULL'}`)
                  .join(',\n');
                ddlSql = `CREATE TABLE "${targetTable}" (\n${colDefs}\n);`;
              }
              navigator.clipboard.writeText(ddlSql.trim());
              showToast(`📋 Copied CREATE TABLE DDL for "${targetTable}"`);
            }}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Sparkles className="w-3.5 h-3.5 text-rose-400" />}
            label="Truncate Table..."
            danger
            onClick={() => {
              const shouldConfirm = settings.confirmDestructive;
              if (!shouldConfirm || confirm(`Are you sure you want to TRUNCATE table "${targetTable}"? All data will be deleted.`)) {
                truncateTable(targetTable);
              }
            }}
          />
          <ContextMenuItem
            icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
            label="Drop Table..."
            danger
            onClick={() => {
              const shouldConfirm = settings.confirmDestructive;
              if (!shouldConfirm || confirm(`Are you sure you want to DROP table "${targetTable}"? This action cannot be undone.`)) {
                dropTable(targetTable);
              }
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

    </aside>
  );
};
