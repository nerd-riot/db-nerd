import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { getTableSchema } from '../data/schemas';
import {
  Key,
  Plus,
  FileCode,
  Columns as ColumnsIcon,
  Eye,
  Copy,
  X,
  Filter,
  ChevronLeft,
  ChevronRight,
  Zap,
  ArrowUpAZ,
  ArrowDownZA,
  Columns,
  AlertCircle,
  RefreshCw,
  WrapText,
  Loader2,
  Settings2,
  Check,
} from 'lucide-react';
import { GridRow, ColumnDefinition } from '../types';
import { TableContextMenu } from './TableContextMenu';
import { TableStructureView } from './TableStructureView';
import { TableIndexesView } from './TableIndexesView';
import { ColumnTypeIcon } from './ColumnTypeIcon';
import { BorderChase } from './BorderChase';
import { GridRowItem } from './GridRowItem';
import { DataGridErrorBoundary } from './DataGridErrorBoundary';
import {
  ContextMenuContainer,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuHeader,
  ContextMenuPosition,
} from './ContextMenu';
import {
  isInternalRowKey,
  sortColumnsByDdlConvention,
  deriveColumnsFromRows,
  quoteIdentifier,
  useColumnResizer,
} from '../lib';
import { Tooltip } from './Tooltip';

export const TableGrid: React.FC = () => {
  const {
    rows,
    updateCell,
    insertRow,
    duplicateRow,
    deleteRow,
    selectedTable,
    selectedRowData,
    setSelectedRowData,
    tableViewMode,
    setTableViewMode,
    isFilterBarOpen,
    toggleFilterBar,
    filterWhereText,
    setFilterWhereText,
    filterOrderByText,
    setFilterOrderByText,
    setSelectedStructureColumn,
    isReloading,
    reloadData,
    activeConnection,
    liveSchemas,
    setConnectionModalOpen,
    reconnectActiveConnection,
    showToast,
    gridPage,
    gridPageSize,
    gridTotalCount,
    gridIsEstimatedCount,
    gridIsCounting,
    setGridPageSize,
    goToGridPage,
    fetchTableExactCount,
    pendingEditsCount,
    pendingTableActions,
    removeTableAction,
    triggerAddStructureColumn,
  } = useAppStore();

  const stagedTableAction = useMemo(
    () => pendingTableActions?.find((a) => a.tableName === selectedTable),
    [pendingTableActions, selectedTable]
  );

  const liveSchema = activeConnection?.id ? liveSchemas?.[activeConnection.id]?.[selectedTable] : undefined;
  const schemaInfo = liveSchema || getTableSchema(selectedTable);

  // Dynamically derive and order columns according to DDL convention
  const resolvedColumns: ColumnDefinition[] = useMemo(() => {
    const knownCols = schemaInfo?.columns && schemaInfo.columns.length > 0
      ? schemaInfo.columns.filter((c) => !isInternalRowKey(c.name))
      : [];

    const ddlOrderMap = new Map<string, number>();
    knownCols.forEach((c, idx) => ddlOrderMap.set(c.name, idx));
    const schemaColMap = new Map(knownCols.map((c) => [c.name, c]));

    if (rows.length > 0) {
      const sample = rows[0];
      const derived = deriveColumnsFromRows(sample, schemaColMap, ddlOrderMap);
      return sortColumnsByDdlConvention(derived, ddlOrderMap);
    }

    return sortColumnsByDdlConvention(knownCols, ddlOrderMap);
  }, [selectedTable, rows, schemaInfo, liveSchema]);

  const [editingCell, setEditingCell] = useState<{ id: number | string; field: string } | null>(null);

  // Auto-close cell editor only when transaction is rolled back or committed (pending edits drop from > 0 to 0)
  const prevPendingEditsCountRef = useRef(pendingEditsCount);
  useEffect(() => {
    if (prevPendingEditsCountRef.current > 0 && pendingEditsCount === 0 && editingCell) {
      setEditingCell(null);
    }
    prevPendingEditsCountRef.current = pendingEditsCount;
  }, [pendingEditsCount, editingCell]);

  // Reset editing cell when switching tables or navigating pages
  useEffect(() => {
    setEditingCell(null);
  }, [selectedTable, gridPage]);
  const [contextMenuPos, setContextMenuPos] = useState<ContextMenuPosition | null>(null);
  const [targetContextMenuRows, setTargetContextMenuRows] = useState<GridRow[]>([]);
  const [colContextPos, setColContextPos] = useState<ContextMenuPosition | null>(null);
  const [targetCol, setTargetCol] = useState<any | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [inspectingRow, setInspectingRow] = useState<GridRow | null>(null);
  const [isDdlModalOpen, setIsDdlModalOpen] = useState(false);
  const [isColumnsModalOpen, setIsColumnsModalOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(resolvedColumns.map((c) => c.name))
  );
  const [wrapText, setWrapText] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const [isCountPopoverOpen, setIsCountPopoverOpen] = useState(false);
  const [includeFilterInCount, setIncludeFilterInCount] = useState(true);
  const [isPageSizeMenuOpen, setIsPageSizeMenuOpen] = useState(false);
  const countPopoverRef = useRef<HTMLDivElement>(null);
  const pageSizeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (countPopoverRef.current && !countPopoverRef.current.contains(e.target as Node)) {
        setIsCountPopoverOpen(false);
      }
      if (pageSizeMenuRef.current && !pageSizeMenuRef.current.contains(e.target as Node)) {
        setIsPageSizeMenuOpen(false);
      }
    };
    if (isCountPopoverOpen || isPageSizeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCountPopoverOpen, isPageSizeMenuOpen]);

  // Sync visible columns and reset sort when selectedTable or resolvedColumns keys change
  const resolvedColSignature = useMemo(() => resolvedColumns.map((c) => c.name).join(','), [resolvedColumns]);
  useEffect(() => {
    setVisibleColumns(new Set(resolvedColumns.map((c) => c.name)));
    setSortConfig(null);
  }, [selectedTable, resolvedColSignature]);

  const handleDuplicateRow = (r: GridRow) => {
    duplicateRow(r);
    showToast(`✨ Duplicated row #${r.id}`);
  };

  const handleDeleteRows = (rowsToDelete: GridRow[]) => {
    rowsToDelete.forEach((r) => deleteRow(r.id));
    setSelectedRowIds(new Set());
    if (selectedRowData && rowsToDelete.some((r) => r.id === selectedRowData.id)) {
      setSelectedRowData(null);
    }
    showToast(`🗑️ Marked ${rowsToDelete.length} row(s) for deletion`);
  };

  const handleRowClick = useCallback((row: GridRow, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        if (next.has(row.id)) next.delete(row.id);
        else next.add(row.id);
        return next;
      });
    } else {
      setSelectedRowIds(new Set([row.id]));
    }
    setSelectedRowData(row);
  }, [setSelectedRowData]);

  const handleRowContextMenu = useCallback((row: GridRow, e: React.MouseEvent) => {
    e.preventDefault();
    setSelectedRowIds((prev) => {
      if (!prev.has(row.id)) return new Set([row.id]);
      return prev;
    });
    setSelectedRowData(row);
    setTargetContextMenuRows([row]);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  }, [setSelectedRowData]);

  const startEditing = useCallback((id: number | string, field: string) => {
    setEditingCell({ id, field });
  }, []);

  const handleSaveCell = useCallback((id: number | string, field: string, newVal: any) => {
    updateCell(id, field as keyof GridRow, newVal);
    setEditingCell(null);
  }, [updateCell]);

  const toggleColumnVisibility = (colName: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(colName)) {
        if (next.size > 1) next.delete(colName);
      } else {
        next.add(colName);
      }
      return next;
    });
  };

  const activeCols = useMemo(
    () => resolvedColumns.filter((c) => visibleColumns.has(c.name)),
    [resolvedColumns, visibleColumns]
  );

  const colNames = useMemo(() => activeCols.map((c) => c.name), [activeCols]);
  const pkNames = useMemo(
    () => activeCols.filter((c) => c.isPrimaryKey).map((c) => c.name),
    [activeCols]
  );

  const {
    columnWidths,
    handleResizeStart,
    handleAutoFitColumn,
    handleAutoFitAll,
    getColumnWidth,
  } = useColumnResizer({
    columns: colNames,
    sampleRows: rows,
    pkColumns: pkNames,
    defaultWidth: 150,
  });

  // Sync sortConfig with filterOrderByText when changed externally
  useEffect(() => {
    if (!filterOrderByText) {
      setSortConfig(null);
      return;
    }
    const match = filterOrderByText.trim().match(/^["`]?([a-zA-Z0-9_]+)["`]?\s*(ASC|DESC)?$/i);
    if (match) {
      const col = match[1];
      const dir = (match[2] || 'ASC').toLowerCase() === 'desc' ? 'desc' : 'asc';
      setSortConfig({ col, dir });
    }
  }, [filterOrderByText]);

  // Query-driven sorting: click column header -> re-query database with ORDER BY
  const handleSortColumn = useCallback(
    async (colName: string) => {
      let nextDir: 'asc' | 'desc' | null = null;
      if (!sortConfig || sortConfig.col !== colName) {
        nextDir = 'asc';
      } else if (sortConfig.dir === 'asc') {
        nextDir = 'desc';
      } else {
        nextDir = null;
      }

      const nextConfig = nextDir ? { col: colName, dir: nextDir } : null;
      setSortConfig(nextConfig);

      const quoted = quoteIdentifier(colName, activeConnection?.engine);
      const nextOrderText = nextDir ? `${quoted} ${nextDir.toUpperCase()}` : '';
      setFilterOrderByText(nextOrderText);

      // Execute query with ORDER BY from page 0
      await goToGridPage(0);
      showToast(
        nextConfig
          ? `⚡ Sorted by ${colName} ${nextConfig.dir.toUpperCase()}`
          : 'Cleared sorting'
      );
    },
    [sortConfig, activeConnection, setFilterOrderByText, goToGridPage, showToast]
  );

  const handleSortDirect = useCallback(
    async (colName: string, dir: 'asc' | 'desc' | null) => {
      const nextConfig = dir ? { col: colName, dir } : null;
      setSortConfig(nextConfig);

      const quoted = quoteIdentifier(colName, activeConnection?.engine);
      const nextOrderText = dir ? `${quoted} ${dir.toUpperCase()}` : '';
      setFilterOrderByText(nextOrderText);

      await goToGridPage(0);
      showToast(
        nextConfig
          ? `⚡ Sorted by ${colName} ${nextConfig.dir.toUpperCase()}`
          : 'Cleared sorting'
      );
    },
    [activeConnection, setFilterOrderByText, goToGridPage, showToast]
  );

  // Discriminator timer: prevents double-click auto-fit from triggering single-click sort
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  const handleHeaderCellClick = useCallback(
    (colName: string) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        return;
      }
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        handleSortColumn(colName);
      }, 220);
    },
    [handleSortColumn]
  );

  const handleHeaderCellDoubleClick = useCallback(
    (colName: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      handleAutoFitColumn(colName);
    },
    [handleAutoFitColumn]
  );

  // For real database connections, the database query executes ORDER BY.
  // For offline/mock demo data without active database, fallback to FE sort.
  const processedRows = useMemo(() => {
    let list = rows;
    const isMock = !activeConnection?.id || activeConnection.id === 'demo' || activeConnection.id.startsWith('mock');
    if (isMock && sortConfig) {
      const { col, dir } = sortConfig;
      list = [...list].sort((a, b) => {
        const va = a[col];
        const vb = b[col];
        if (va === vb) return 0;
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        if (typeof va === 'number' && typeof vb === 'number') {
          return dir === 'asc' ? va - vb : vb - va;
        }
        const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
        return dir === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [rows, sortConfig, activeConnection]);

  const effectiveTotalCount = gridTotalCount !== null ? gridTotalCount : rows.length;
  const totalPages = Math.max(1, Math.ceil(effectiveTotalCount / gridPageSize));
  const safePage = Math.min(gridPage, totalPages - 1);
  const paginatedRows = processedRows;

  // Lightweight Virtual Windowing Engine for pinned 120 FPS rendering
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(700);
  const ROW_HEIGHT = 28;
  const OVERSCAN = 10;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    requestAnimationFrame(() => {
      setScrollTop(target.scrollTop);
    });
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const updateHeight = () => {
      if (el) setViewportHeight(el.clientHeight || 700);
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset scroll to top when table or page changes to prevent blank canvas offset
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    setScrollTop(0);
  }, [selectedTable, safePage]);

  const totalRows = paginatedRows.length;
  const visibleStartIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleEndIndex = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
  const virtualRows = paginatedRows.slice(visibleStartIndex, visibleEndIndex);
  const topPadding = visibleStartIndex * ROW_HEIGHT;
  const bottomPadding = Math.max(0, (totalRows - visibleEndIndex) * ROW_HEIGHT);

  const handleApplyFilter = () => {
    const raw = filterOrderByText.trim();
    if (raw) {
      const match = raw.match(/^["`]?([a-zA-Z0-9_]+)["`]?\s*(ASC|DESC)?$/i);
      if (match) {
        const col = match[1];
        const dir = (match[2] || 'ASC').toLowerCase() === 'desc' ? 'desc' : 'asc';
        setSortConfig({ col, dir });
      } else {
        setSortConfig(null);
      }
    } else {
      setSortConfig(null);
    }
    goToGridPage(0);
  };

  return (
    <DataGridErrorBoundary tableName={selectedTable} onReset={() => reloadData(selectedTable)}>
      <div className="flex-1 flex flex-col bg-white dark:bg-slate-900/60 overflow-hidden relative">
      {/* Live Table Reloading Overlay with Border Chase */}
      {isReloading && (
        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs z-30 flex items-center justify-center p-4">
          <div className="relative overflow-hidden bg-slate-900/95 rounded-2xl p-4 shadow-2xl flex items-center gap-3.5 max-w-sm animate-in zoom-in-95 duration-100">
            <BorderChase color="sky" dual={true} speed="fast" borderWidth={2} glow={true} />
            <div className="relative z-1 p-2.5 bg-sky-500/15 rounded-xl border border-sky-500/30 text-sky-400 shrink-0">
              <Zap className="w-5 h-5 animate-pulse" />
            </div>
            <div className="relative z-1 space-y-0.5 font-mono">
              <div className="text-xs font-bold text-slate-100 flex items-center space-x-2">
                <span>Refreshing Data...</span>
                <span className="text-[10px] text-sky-400 bg-sky-500/15 px-1.5 py-0.2 rounded font-sans font-semibold">
                  SYNC
                </span>
              </div>
              <div className="text-[11px] text-slate-400 truncate max-w-[210px]">
                Fetching schema & rows for {selectedTable}...
              </div>
            </div>
          </div>
        </div>
      )}

      {/* If connection is failed, block table interaction and show prominent state */}
      {activeConnection?.connectionStatus === 'failed' && (
        <div className="absolute inset-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm flex items-center justify-center p-6 select-none animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-slate-50 dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 rounded-2xl p-6 shadow-2xl text-center flex flex-col items-center ring-1 ring-rose-500/10">
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-500 mb-4 shadow-sm">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1">
              Database Connection Failed
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
              Cannot reach <span className="font-semibold text-slate-800 dark:text-slate-200">{activeConnection.name}</span> ({activeConnection.host}:{activeConnection.port})
            </p>
            {activeConnection.lastError && (
              <div className="w-full bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/40 rounded-xl p-3 mb-4 text-[11px] font-mono text-rose-700 dark:text-rose-300 text-left break-all">
                {activeConnection.lastError}
              </div>
            )}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-5">
              Tasks and data queries are blocked until this connection is verified.
            </p>
            <div className="flex items-center space-x-3 w-full justify-center">
              <button
                onClick={() => setConnectionModalOpen(true)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              >
                Edit Connection (⌘K)
              </button>
              <button
                onClick={() => reconnectActiveConnection()}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-colors flex items-center space-x-1.5 shadow-md shadow-rose-600/20 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reconnect Workspace (⌘⇧R)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Inline Filter Bar (TablePlus style: WHERE ... ORDER BY ...) */}
      {tableViewMode === 'data' && isFilterBarOpen && (
        <div className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800/80 px-4 py-2 flex items-center justify-between text-xs select-none flex-shrink-0 animate-in fade-in duration-100">
          <div className="flex items-center space-x-2 flex-1 max-w-2xl font-mono text-[11px]">
            <span className="px-1.5 py-0.5 bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/40 rounded font-bold text-[10px]">
              WHERE
            </span>
            <input
              type="text"
              value={filterWhereText}
              onChange={(e) => setFilterWhereText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleApplyFilter();
              }}
              placeholder="e.g. status = 'pending' AND total_amount > 50"
              className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700/70 rounded px-2.5 py-1 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 shadow-2xs font-mono"
            />
            <span className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/40 rounded font-bold text-[10px]">
              ORDER BY
            </span>
            <input
              type="text"
              value={filterOrderByText}
              onChange={(e) => setFilterOrderByText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleApplyFilter();
              }}
              placeholder="e.g. id DESC"
              className="w-28 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700/70 rounded px-2 py-1 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 shadow-2xs font-mono"
            />
            <button
              onClick={handleApplyFilter}
              className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-sans font-semibold transition active:scale-95 flex items-center space-x-1 cursor-pointer shadow-2xs"
            >
              <Zap className="w-3 h-3" />
              <span>Run</span>
            </button>
            <Tooltip side="bottom" content="Clear Filter">
              <button
                onClick={() => {
                  setFilterWhereText('');
                  setFilterOrderByText('');
                  setSortConfig(null);
                  showToast('Filter cleared');
                  setTimeout(() => reloadData(selectedTable), 0);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>

          <div className="flex items-center space-x-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center space-x-1">
              <span>⚡ {processedRows.length} rows</span>
            </span>
          </div>
        </div>
      )}

      {/* Staged Table Action Banner (Truncate / Drop) */}
      {stagedTableAction && (
        <div className="bg-amber-500/10 dark:bg-amber-950/40 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs select-none flex-shrink-0 animate-in fade-in duration-100">
          <div className="flex items-center space-x-2 text-amber-700 dark:text-amber-300 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
            <span>
              Staged <strong className="font-bold uppercase">{stagedTableAction.type}</strong>: Table "{selectedTable}" will be {stagedTableAction.type === 'truncate' ? 'truncated' : 'dropped'}. Changes will only apply when committed.
            </span>
          </div>
          <div className="flex items-center space-x-2 font-mono text-[11px]">
            <span className="text-slate-600 dark:text-slate-400">
              Press <kbd className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 font-bold">⌘S</kbd> to Commit or <kbd className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 font-bold">⌘Z</kbd> to Discard
            </span>
            <Tooltip side="bottom" content="Revert this staged action">
              <button
                onClick={() => removeTableAction(stagedTableAction.id)}
                className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 text-[11px] font-sans font-semibold transition active:scale-95 cursor-pointer ml-1"
              >
                Revert
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Main Workspace Mode View */}
      {tableViewMode === 'structure' ? (
        <TableStructureView />
      ) : tableViewMode === 'index' ? (
        <TableIndexesView />
      ) : (
        /* DATA GRID VIEW (TablePlus Canvas style with Virtual Windowing) */
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto bg-white dark:bg-slate-950/80 text-xs font-mono select-text"
        >
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '48px', minWidth: '48px', maxWidth: '48px' }} />
              {activeCols.map((col) => (
                <col
                  key={col.name}
                  style={{ width: `${getColumnWidth(col.name)}px` }}
                />
              ))}
            </colgroup>
            {/* Header */}
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-950/95 backdrop-blur-md z-10 border-b border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-400 select-none shadow-sm text-[11px]">
              <tr className="text-left font-semibold">
                <th
                  style={{ width: '48px', minWidth: '48px', maxWidth: '48px' }}
                  className="px-2 py-1.5 border-r border-slate-300 dark:border-slate-800/80 text-center text-slate-500 dark:text-slate-600 font-bold cursor-pointer"
                  onDoubleClick={handleAutoFitAll}
                >
                  <Tooltip content="Double-click to fit all columns" side="bottom">
                    <span className="block w-full">#</span>
                  </Tooltip>
                </th>
                {activeCols.map((col) => {
                  const isSorted = sortConfig?.col === col.name;
                  const colWidth = getColumnWidth(col.name);
                  return (
                    <th
                      key={col.name}
                      style={{
                        width: `${colWidth}px`,
                        minWidth: `${colWidth}px`,
                        maxWidth: `${colWidth}px`,
                      }}
                      onClick={() => handleHeaderCellClick(col.name)}
                      onDoubleClick={(e) => handleHeaderCellDoubleClick(col.name, e)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setColContextPos({ x: e.clientX, y: e.clientY });
                        setTargetCol(col);
                      }}
                      className="relative px-2.5 py-1.5 border-r border-slate-300 dark:border-slate-800/80 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-900/60 transition-colors group/th"
                    >
                      <div className="flex items-center justify-between space-x-1.5 truncate pr-2">
                        <div className="flex items-center space-x-1.5 truncate">
                          <ColumnTypeIcon type={col.type} />
                          <span className="text-slate-800 dark:text-slate-200 font-semibold truncate">{col.name}</span>
                          {col.isPrimaryKey && (
                            <Tooltip content="Primary Key" side="top">
                              <span className="inline-flex items-center ml-0.5">
                                <Key className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400/90 flex-shrink-0" />
                              </span>
                            </Tooltip>
                          )}
                        </div>
                        {isSorted && (
                          <span className="text-sky-500 shrink-0">
                            {sortConfig?.dir === 'asc' ? (
                              <ArrowUpAZ className="w-3 h-3" />
                            ) : (
                              <ArrowDownZA className="w-3 h-3" />
                            )}
                          </span>
                        )}
                      </div>

                      {/* Resize Handle with Double-Click Auto-Fit (Excel / TablePlus) */}
                      <Tooltip content="Drag to resize • Double-click to auto-fit" side="top">
                        <div
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleResizeStart(col.name, e);
                          }}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (clickTimerRef.current) {
                              clearTimeout(clickTimerRef.current);
                              clickTimerRef.current = null;
                            }
                            handleAutoFitColumn(col.name);
                          }}
                          className="absolute top-0 right-0 bottom-0 w-4 -mr-2 cursor-col-resize z-20 flex items-center justify-center group/resizer hover:bg-sky-500/20 active:bg-sky-500/40"
                        >
                          <div className="w-[1.5px] h-full bg-slate-300 dark:bg-slate-700/80 group-hover/resizer:bg-sky-500 group-active/resizer:bg-sky-500 transition-colors pointer-events-none" />
                        </div>
                      </Tooltip>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Virtualized Rows */}
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40 text-[11px]">
              {topPadding > 0 && (
                <tr style={{ height: `${topPadding}px` }} aria-hidden="true">
                  <td colSpan={activeCols.length + 1} style={{ padding: 0, border: 0 }} />
                </tr>
              )}

              {virtualRows.map((row, idx) => {
                const index = visibleStartIndex + idx;
                const absoluteIndex = safePage * gridPageSize + index;
                const isSelected = selectedRowIds.has(row.id) || (selectedRowData && selectedRowData.id === row.id);
                const isEven = absoluteIndex % 2 === 0;

                return (
                  <GridRowItem
                    key={row.id ?? absoluteIndex}
                    row={row}
                    absoluteIndex={absoluteIndex}
                    isSelected={isSelected}
                    isEven={isEven}
                    activeCols={activeCols}
                    columnWidths={columnWidths}
                    editingCellField={editingCell && String(editingCell.id) === String(row.id) ? editingCell.field : null}
                    wrapText={wrapText}
                    onRowClick={handleRowClick}
                    onRowContextMenu={handleRowContextMenu}
                    onStartEditing={startEditing}
                    onSaveCell={handleSaveCell}
                    onCancelEditing={() => setEditingCell(null)}
                  />
                );
              })}

              {bottomPadding > 0 && (
                <tr style={{ height: `${bottomPadding}px` }} aria-hidden="true">
                  <td colSpan={activeCols.length + 1} style={{ padding: 0, border: 0 }} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* BOTTOM CONTROL BAR (TablePlus Standard Footer Toolbar) */}
      <div className="h-9 bg-slate-100 dark:bg-slate-950 border-t border-slate-300 dark:border-slate-800/90 px-3 flex items-center justify-between text-xs font-sans select-none flex-shrink-0 z-20">
        {/* Left Segment: [Data] [Structure] [Index] + Mode Actions */}
        <div className="flex items-center space-x-2 h-full">
          {/* View Mode Switcher Pills */}
          <div className="flex items-center bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-0.5 text-[11px] font-semibold h-6">
            <button
              onClick={() => setTableViewMode('data')}
              className={`h-5 px-2.5 rounded-md transition-all duration-100 flex items-center justify-center leading-none cursor-pointer ${
                tableViewMode === 'data'
                  ? 'bg-white dark:bg-sky-500 text-sky-800 dark:text-slate-950 font-bold shadow-xs border border-slate-300/80 dark:border-transparent'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Data
            </button>
            <button
              onClick={() => setTableViewMode('structure')}
              className={`h-5 px-2.5 rounded-md transition-all duration-100 flex items-center justify-center leading-none cursor-pointer ${
                tableViewMode === 'structure'
                  ? 'bg-white dark:bg-sky-500 text-sky-800 dark:text-slate-950 font-bold shadow-xs border border-slate-300/80 dark:border-transparent'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Structure
            </button>
            <button
              onClick={() => setTableViewMode('index')}
              className={`h-5 px-2.5 rounded-md transition-all duration-100 flex items-center justify-center leading-none cursor-pointer ${
                tableViewMode === 'index'
                  ? 'bg-white dark:bg-sky-500 text-sky-800 dark:text-slate-950 font-bold shadow-xs border border-slate-300/80 dark:border-transparent'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Index
            </button>
          </div>

          <div className="h-3.5 w-[1px] bg-slate-300 dark:bg-slate-800 mx-0.5 self-center" />

          {/* Mode-specific Buttons */}
          {tableViewMode === 'data' ? (
            <Tooltip side="top" content="Insert new row" shortcut="+">
              <button
                onClick={insertRow}
                className="h-6 px-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 rounded-md text-[11px] font-semibold transition active:scale-95 flex items-center space-x-1 leading-none cursor-pointer shadow-2xs"
              >
                <Plus className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Row</span>
              </button>
            </Tooltip>
          ) : tableViewMode === 'structure' ? (
            <div className="flex items-center space-x-1.5 h-full">
              <Tooltip side="top" content="Add new column to structure" shortcut="+">
                <button
                  onClick={triggerAddStructureColumn}
                  className="h-6 px-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 rounded-md text-[11px] font-semibold transition active:scale-95 flex items-center space-x-1 leading-none cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span>Column</span>
                </button>
              </Tooltip>
              <button
                onClick={() => showToast('Table Triggers: 0 triggers defined')}
                className="h-6 px-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 rounded-md text-[11px] font-semibold transition flex items-center leading-none cursor-pointer shadow-2xs"
              >
                Triggers
              </button>
              <button
                onClick={() => setIsDdlModalOpen(true)}
                className="h-6 px-2 bg-indigo-100 dark:bg-indigo-500/20 hover:bg-indigo-200 dark:hover:bg-indigo-500/30 border border-indigo-300 dark:border-indigo-500/40 text-indigo-700 dark:text-indigo-300 rounded-md text-[11px] font-semibold transition active:scale-95 flex items-center space-x-1 leading-none cursor-pointer"
              >
                <FileCode className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>DDL</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => showToast('Opened create index wizard')}
              className="h-6 px-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 rounded-md text-[11px] font-semibold transition active:scale-95 flex items-center space-x-1 leading-none cursor-pointer shadow-2xs"
            >
              <Plus className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Index</span>
            </button>
          )}
        </div>

        {/* Center: Row Counter / Stats with TablePlus-style Clickable Count Popover */}
        <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono select-none flex items-center leading-none relative">
          {tableViewMode === 'data' ? (
            selectedRowData || selectedRowIds.size > 0 ? (
              <span className="text-sky-700 dark:text-sky-300 font-semibold">{`${selectedRowIds.size || 1} of ${effectiveTotalCount.toLocaleString()} rows selected`}</span>
            ) : rows.length === 0 ? (
              <span>0 rows</span>
            ) : (
              <div className="relative" ref={countPopoverRef}>
                <Tooltip side="top" content="Click to view row count details or calculate exact count">
                  <button
                    onClick={() => setIsCountPopoverOpen((prev) => !prev)}
                    className="px-2 py-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 transition font-mono font-medium flex items-center space-x-1 cursor-pointer select-none"
                  >
                    <span>{`${safePage * gridPageSize + 1}-${Math.min((safePage + 1) * gridPageSize, effectiveTotalCount)} of ${gridIsEstimatedCount ? '~' : ''}${effectiveTotalCount.toLocaleString()} rows`}</span>
                    {gridIsCounting && (
                      <Loader2 className="w-3 h-3 animate-spin text-amber-500 ml-1 inline-block" />
                    )}
                  </button>
                </Tooltip>

                {/* TablePlus-style Popover (Images 1 & 3) */}
                {isCountPopoverOpen && (
                  <div
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 w-80 bg-[#252526] dark:bg-slate-900 border border-slate-600/60 dark:border-slate-700/90 rounded-2xl shadow-2xl p-4 z-50 text-xs font-sans text-white animate-in zoom-in-95 duration-100 ring-1 ring-black/40"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Arrow */}
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#252526] dark:bg-slate-900 border-r border-b border-slate-600/60 dark:border-slate-700/90 rotate-45" />

                    <div className="text-center font-bold text-sm text-slate-100 mb-2 font-mono tracking-tight">
                      {`${safePage * gridPageSize + 1}-${Math.min((safePage + 1) * gridPageSize, effectiveTotalCount)} of ${gridIsEstimatedCount ? '~' : ''}${effectiveTotalCount.toLocaleString()} rows`}
                    </div>

                    <p className="text-[11px] text-[#f97316] leading-relaxed text-center mb-3">
                      {gridIsEstimatedCount
                        ? 'This is the estimated value, click "Count" to retrieve the exact value. It may affect your server performance'
                        : '✓ Exact row count retrieved from server.'}
                    </p>

                    <label className="flex items-center space-x-2 text-[11px] text-slate-300 mb-3.5 px-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeFilterInCount}
                        onChange={(e) => setIncludeFilterInCount(e.target.checked)}
                        className="w-3.5 h-3.5 rounded bg-slate-800 border-slate-600 text-sky-500 focus:ring-0 cursor-pointer"
                      />
                      <span>Include current filter conditions</span>
                    </label>

                    <button
                      onClick={async () => {
                        await fetchTableExactCount(selectedTable, includeFilterInCount);
                      }}
                      disabled={gridIsCounting}
                      className="w-full py-1.5 px-3 bg-[#333333] hover:bg-[#444444] active:scale-[0.98] border border-slate-600/80 text-slate-100 rounded-lg font-semibold text-xs transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                    >
                      {gridIsCounting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          <span>Counting server records...</span>
                        </>
                      ) : (
                        <span>Count</span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )
          ) : tableViewMode === 'structure' ? (
            <span>{`${resolvedColumns.length} columns, ${schemaInfo.indexes.length} indexes`}</span>
          ) : (
            <span>{`${schemaInfo.indexes.length} indexes, ${schemaInfo.foreignKeys.length} foreign keys`}</span>
          )}
        </div>

        {/* Right: Filters toggle, Columns picker, Pagination */}
        <div className="flex items-center space-x-1.5 h-full">
          {tableViewMode === 'data' && (
            <>
              <Tooltip side="top" content="Toggle WHERE / ORDER BY filter bar">
                <button
                  onClick={toggleFilterBar}
                  className={`h-6 px-2 rounded-md text-[11px] font-semibold border transition flex items-center space-x-1 active:scale-95 leading-none cursor-pointer ${
                    isFilterBarOpen
                      ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-500/40'
                      : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 shadow-2xs'
                  }`}
                >
                  <Filter className="w-3 h-3 shrink-0" />
                  <span>Filters</span>
                </button>
              </Tooltip>

              <Tooltip side="top" content="Choose visible columns">
                <button
                  onClick={() => setIsColumnsModalOpen(!isColumnsModalOpen)}
                  className="h-6 px-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 rounded-md text-[11px] font-semibold transition flex items-center space-x-1 leading-none cursor-pointer shadow-2xs"
                >
                  <ColumnsIcon className="w-3 h-3 shrink-0" />
                  <span>Columns</span>
                </button>
              </Tooltip>

              <Tooltip side="top" content={wrapText ? 'Disable wrapping' : 'Enable wrapping'}>
                <button
                  onClick={() => setWrapText(!wrapText)}
                  className={`h-6 px-2 rounded-md text-[11px] font-semibold border transition flex items-center space-x-1 active:scale-95 leading-none cursor-pointer ${
                    wrapText
                      ? 'bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-500/40'
                      : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 shadow-2xs'
                  }`}
                >
                  <WrapText className="w-3 h-3 shrink-0" />
                  <span>{wrapText ? 'Wrap: On' : 'Wrap'}</span>
                </button>
              </Tooltip>

              <div className="flex items-center space-x-0.5 pl-1 h-6 relative" ref={pageSizeMenuRef}>
                <Tooltip side="top" content="Previous Page" disabled={safePage <= 0 || isReloading}>
                  <button
                    onClick={() => goToGridPage(safePage - 1)}
                    disabled={safePage <= 0 || isReloading}
                    className="h-6 w-6 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default transition"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
                {totalPages > 1 && (
                  <span className="text-[10px] font-mono text-slate-500 px-1 select-none">
                    {safePage + 1}/{totalPages.toLocaleString()}
                  </span>
                )}
                <Tooltip side="top" content="Next Page" disabled={safePage >= totalPages - 1 || rows.length < gridPageSize || isReloading}>
                  <button
                    onClick={() => goToGridPage(safePage + 1)}
                    disabled={safePage >= totalPages - 1 || rows.length < gridPageSize || isReloading}
                    className="h-6 w-6 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default transition"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>

                {/* TablePlus Page Size Gear */}
                <div className="relative">
                  <Tooltip side="top" content={`Page size: ${gridPageSize} rows`}>
                    <button
                      onClick={() => setIsPageSizeMenuOpen((prev) => !prev)}
                      className="h-6 w-6 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded cursor-pointer transition ml-0.5"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                  </Tooltip>

                  {isPageSizeMenuOpen && (
                    <div
                      className="absolute bottom-8 right-0 w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-1 z-50 text-xs font-sans ring-1 ring-black/5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                        Rows Per Page
                      </div>
                      {[50, 100, 200, 300].map((sz) => (
                        <button
                          key={sz}
                          onClick={() => {
                            setGridPageSize(sz);
                            setIsPageSizeMenuOpen(false);
                          }}
                          className={`w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between cursor-pointer transition ${
                            gridPageSize === sz
                              ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 font-semibold'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span>{sz} rows</span>
                          {sz === 300 && <span className="text-[9px] text-slate-400 font-mono">(default / max)</span>}
                          {gridPageSize === sz && <Check className="w-3 h-3 text-sky-500" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Columns Visibility Popup */}
      {isColumnsModalOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsColumnsModalOpen(false)}
        >
          <div
            className="absolute bottom-11 right-12 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-2xl p-2 z-50 text-xs font-sans animate-in zoom-in-95 duration-100 ring-1 ring-black/5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-bold text-slate-800 dark:text-slate-200 px-2 py-1 border-b border-slate-200 dark:border-slate-800 text-[11px]">
              Toggle Columns
            </div>
            <div className="max-h-48 overflow-y-auto py-1 space-y-0.5">
              {resolvedColumns.map((col) => {
                const isVis = visibleColumns.has(col.name);
                return (
                  <label
                    key={col.name}
                    className="flex items-center space-x-2 px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isVis}
                      onChange={() => toggleColumnVisibility(col.name)}
                      className="rounded bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-0"
                    />
                    <span className="truncate text-slate-700 dark:text-slate-300 font-mono text-[11px]">{col.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Raw DDL Modal */}
      {isDdlModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-100"
          onClick={() => setIsDdlModalOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col font-sans ring-1 ring-black/5 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-10 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100">DDL — {selectedTable}</span>
              <button
                onClick={() => setIsDdlModalOpen(false)}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <pre className="p-4 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-emerald-400 font-mono text-xs max-h-96 overflow-auto select-text leading-relaxed border-y border-slate-200 dark:border-slate-800/80">
              {schemaInfo.ddl}
            </pre>
            <div className="h-11 bg-slate-50 dark:bg-slate-950 px-4 flex items-center justify-end space-x-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(schemaInfo.ddl);
                  showToast('📋 Copied DDL script!');
                  setIsDdlModalOpen(false);
                }}
                className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-2xs active:scale-95"
              >
                Copy DDL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right-Click Context Menu */}
      <TableContextMenu
        position={contextMenuPos}
        selectedRows={
          targetContextMenuRows.length > 0
            ? targetContextMenuRows
            : selectedRowIds.size > 0
            ? rows.filter((r) => selectedRowIds.has(r.id))
            : selectedRowData
            ? [selectedRowData]
            : []
        }
        tableName={selectedTable}
        onClose={() => {
          setContextMenuPos(null);
          setTargetContextMenuRows([]);
        }}
        onDuplicateRow={handleDuplicateRow}
        onDeleteRows={handleDeleteRows}
        onQuickLook={(row) => setInspectingRow(row)}
        onToast={showToast}
      />

      {/* Column Header Right-Click Context Menu */}
      {colContextPos && targetCol && (
        <ContextMenuContainer position={colContextPos} onClose={() => setColContextPos(null)}>
          <ContextMenuHeader title={`Column: ${targetCol.name} (${targetCol.type})`} />
          <ContextMenuItem
            icon={<ArrowUpAZ className="w-3.5 h-3.5 text-sky-400" />}
            label={`Sort "${targetCol.name}" ASC (ORDER BY)`}
            onClick={() => handleSortDirect(targetCol.name, 'asc')}
          />
          <ContextMenuItem
            icon={<ArrowDownZA className="w-3.5 h-3.5 text-sky-400" />}
            label={`Sort "${targetCol.name}" DESC (ORDER BY)`}
            onClick={() => handleSortDirect(targetCol.name, 'desc')}
          />
          {(filterOrderByText || sortConfig) && (
            <ContextMenuItem
              icon={<X className="w-3.5 h-3.5 text-slate-400" />}
              label="Clear Sort"
              onClick={() => handleSortDirect(targetCol.name, null)}
            />
          )}
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Columns className="w-3.5 h-3.5 text-emerald-400" />}
            label={`Fit Column "${targetCol.name}" to Content`}
            onClick={() => handleAutoFitColumn(targetCol.name)}
          />
          <ContextMenuItem
            icon={<Columns className="w-3.5 h-3.5 text-emerald-400" />}
            label="Fit All Columns"
            onClick={handleAutoFitAll}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Filter className="w-3.5 h-3.5 text-purple-400" />}
            label={`Filter by "${targetCol.name}"`}
            onClick={() => {
              setFilterWhereText(`${targetCol.name} = ''`);
              if (!isFilterBarOpen) toggleFilterBar();
              showToast(`Filter added: ${targetCol.name}`);
            }}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-300" />}
            label="Copy Column Name"
            shortcut="⌘C"
            onClick={() => {
              navigator.clipboard.writeText(targetCol.name);
              showToast(`Copied "${targetCol.name}" to clipboard`);
            }}
          />
          <ContextMenuItem
            icon={<FileCode className="w-3.5 h-3.5 text-slate-300" />}
            label={`Copy Qualified Name (${selectedTable}.${targetCol.name})`}
            onClick={() => {
              navigator.clipboard.writeText(`"${selectedTable}"."${targetCol.name}"`);
              showToast(`Copied "${selectedTable}"."${targetCol.name}"`);
            }}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Eye className="w-3.5 h-3.5 text-emerald-400" />}
            label="Inspect Column in Structure View"
            onClick={() => {
              setSelectedStructureColumn?.(targetCol);
              setTableViewMode('structure');
            }}
          />
          <ContextMenuItem
            icon={<Columns className="w-3.5 h-3.5 text-slate-400" />}
            label="Hide this Column"
            onClick={() => {
              toggleColumnVisibility(targetCol.name);
              showToast(`Column "${targetCol.name}" hidden`);
            }}
          />
        </ContextMenuContainer>
      )}

      {/* Quick Look Inspector Dialog */}
      {inspectingRow && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-100">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5 dark:ring-white/10 flex flex-col animate-in zoom-in-95 duration-100">
            <div className="h-10 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between select-none">
              <div className="flex items-center space-x-2">
                <Eye className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  Quick Look Inspector — {selectedTable} #{inspectingRow.id}
                </span>
              </div>
              <button
                onClick={() => setInspectingRow(null)}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-4 max-h-[420px] overflow-auto font-mono text-xs text-slate-800 dark:text-sky-300 bg-slate-50 dark:bg-slate-950 select-text leading-relaxed border-y border-slate-200 dark:border-slate-800/80">
              <pre>{JSON.stringify(inspectingRow, null, 2)}</pre>
            </div>
            <div className="h-11 bg-slate-50 dark:bg-slate-950 px-4 flex items-center justify-between select-none">
              <span className="text-[11px] text-slate-500 font-mono">Format: JSON Object</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(inspectingRow, null, 2));
                    showToast('📋 Copied row JSON to clipboard!');
                  }}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold rounded-lg transition flex items-center space-x-1.5 active:scale-95 cursor-pointer shadow-2xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy JSON</span>
                </button>
                <button
                  onClick={() => setInspectingRow(null)}
                  className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg transition active:scale-95 cursor-pointer shadow-2xs"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </DataGridErrorBoundary>
  );
};
