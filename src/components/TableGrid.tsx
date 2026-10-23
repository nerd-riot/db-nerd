import React, { useState, useMemo } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { getTableSchema } from '../data/schemas';
import { filterAndSortGridRows, quoteIdentifier } from '../utils/gridDataUtils';
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
} from 'lucide-react';
import { GridRow } from '../types';
import { TableContextMenu } from './TableContextMenu';
import { TableStructureView } from './TableStructureView';
import { TableIndexesView } from './TableIndexesView';
import { ColumnTypeIcon } from './ColumnTypeIcon';
import { BorderChase } from './BorderChase';
import { InlineCellEditor } from './InlineCellEditor';
import {
  ContextMenuContainer,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuHeader,
  ContextMenuPosition,
} from './ContextMenu';

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
    activeConnection,
    setConnectionModalOpen,
    reconnectActiveConnection,
    openNewQueryTab,
    settings,
    showToast,
  } = useAppStore();

  const schemaInfo = getTableSchema(selectedTable, rows, activeConnection?.engine);

  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<ContextMenuPosition | null>(null);
  const [targetContextMenuRows, setTargetContextMenuRows] = useState<GridRow[]>([]);
  const [colContextPos, setColContextPos] = useState<ContextMenuPosition | null>(null);
  const [targetCol, setTargetCol] = useState<any | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [inspectingRow, setInspectingRow] = useState<GridRow | null>(null);
  const [isDdlModalOpen, setIsDdlModalOpen] = useState(false);
  const [isColumnsModalOpen, setIsColumnsModalOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(schemaInfo.columns.map((c) => c.name))
  );
  const [wrapText, setWrapText] = useState(false);
  const [appliedWhere, setAppliedWhere] = useState('');
  const [appliedOrderBy, setAppliedOrderBy] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Sync visible columns when selectedTable or inferred columns change
  React.useEffect(() => {
    setVisibleColumns(new Set(schemaInfo.columns.map((c) => c.name)));
    setAppliedWhere('');
    setAppliedOrderBy('');
    setCurrentPage(1);
  }, [selectedTable, schemaInfo.columns.length]);

  const filteredRows = useMemo(
    () => filterAndSortGridRows(rows, appliedWhere, appliedOrderBy),
    [rows, appliedWhere, appliedOrderBy]
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredRows, currentPage, pageSize]
  );

  const densityPaddingClass =
    settings.rowDensity === 'compact'
      ? 'px-2.5 py-0.5 text-[10.5px]'
      : settings.rowDensity === 'relaxed'
      ? 'px-3 py-2.5 text-xs'
      : 'px-3 py-1.5 text-[11px]';

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

  const handleRowClick = (row: GridRow, e: React.MouseEvent) => {
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
  };

  const startEditing = (id: number, field: string) => {
    // Prevent editing the primary key directly
    if (field === 'id' && schemaInfo.columns.find((c) => c.name === 'id')?.isPrimaryKey) return;
    setEditingCell({ id, field });
  };

  const handleSaveCell = (id: number, field: string, newVal: any) => {
    updateCell(id, field as keyof GridRow, newVal);
    if (selectedRowData && selectedRowData.id === id) {
      setSelectedRowData({ ...selectedRowData, [field]: newVal });
    }
    setEditingCell(null);
  };

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

  const activeCols = schemaInfo.columns.filter((c) => visibleColumns.has(c.name));

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-900/60 overflow-hidden relative">
      {/* Live Table Reloading Overlay with Border Chase */}
      {isReloading && (
        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs z-30 flex items-center justify-center p-4">
          <div className="relative overflow-hidden bg-slate-900/95 border border-sky-500/50 rounded-2xl p-4 shadow-2xl flex items-center space-x-3.5 max-w-sm ring-1 ring-sky-400/20 animate-in zoom-in-95 duration-100">
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
                if (e.key === 'Enter') {
                  setAppliedWhere(filterWhereText);
                  setAppliedOrderBy(filterOrderByText);
                  setCurrentPage(1);
                }
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
                if (e.key === 'Enter') {
                  setAppliedWhere(filterWhereText);
                  setAppliedOrderBy(filterOrderByText);
                  setCurrentPage(1);
                }
              }}
              placeholder="e.g. id DESC"
              className="w-28 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700/70 rounded px-2 py-1 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 shadow-2xs font-mono"
            />
            <button
              onClick={() => {
                setAppliedWhere(filterWhereText);
                setAppliedOrderBy(filterOrderByText);
                setCurrentPage(1);
                const matched = filterAndSortGridRows(rows, filterWhereText, filterOrderByText);
                showToast(`⚡ Filter applied (${matched.length} of ${rows.length} records returned)`);
              }}
              className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-sans font-semibold transition active:scale-95 flex items-center space-x-1 cursor-pointer shadow-2xs"
            >
              <Zap className="w-3 h-3" />
              <span>Run</span>
            </button>
            <button
              onClick={() => {
                setFilterWhereText('');
                setFilterOrderByText('');
                setAppliedWhere('');
                setAppliedOrderBy('');
                setCurrentPage(1);
                showToast('Filter cleared');
              }}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition cursor-pointer"
              title="Clear Filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center space-x-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center space-x-1">
              <span>⚡ 1.2ms</span>
            </span>
          </div>
        </div>
      )}

      {/* Main Workspace Mode View */}
      {tableViewMode === 'structure' ? (
        <TableStructureView />
      ) : tableViewMode === 'index' ? (
        <TableIndexesView />
      ) : (
        /* DATA GRID VIEW (TablePlus Canvas style) */
        <div className="flex-1 overflow-auto bg-white dark:bg-slate-950/80 text-xs font-mono select-text">
          <table className="w-full border-collapse">
            {/* Header */}
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-950/95 backdrop-blur-md z-10 border-b border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-400 select-none shadow-sm text-[11px]">
              <tr className="text-left font-semibold">
                <th className="w-12 px-3 py-2 border-r border-slate-300 dark:border-slate-800/80 text-center text-slate-500 dark:text-slate-600 font-bold">#</th>
                {activeCols.map((col) => (
                  <th
                    key={col.name}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setColContextPos({ x: e.clientX, y: e.clientY });
                      setTargetCol(col);
                    }}
                    className="px-3 py-2 border-r border-slate-300 dark:border-slate-800/80 min-w-[130px] cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-900/60 transition-colors"
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      <ColumnTypeIcon type={col.type} />
                      <span className="text-slate-800 dark:text-slate-200 font-semibold truncate">{col.name}</span>
                      {col.isPrimaryKey && (
                        <span title="Primary Key" className="inline-flex items-center ml-0.5">
                          <Key className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400/90 flex-shrink-0" />
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Rows */}
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40 text-[11px]">
              {paginatedRows.map((row, index) => {
                const isSelected = selectedRowIds.has(row.id) || (selectedRowData && selectedRowData.id === row.id);
                const isEven = index % 2 === 0;
                const displayIndex = (currentPage - 1) * pageSize + index + 1;

                return (
                  <tr
                    key={row.id ?? index}
                    onClick={(e) => handleRowClick(row, e)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      let nextSelected = selectedRowIds;
                      if (!selectedRowIds.has(row.id)) {
                        nextSelected = new Set([row.id]);
                        setSelectedRowIds(nextSelected);
                      }
                      setSelectedRowData(row);
                      const matched = filteredRows.filter((r) => nextSelected.has(r.id));
                      setTargetContextMenuRows(matched.length > 0 ? matched : [row]);
                      setContextMenuPos({ x: e.clientX, y: e.clientY });
                    }}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#eff6ff] dark:bg-sky-600/30 text-[#1d4ed8] dark:text-white font-medium shadow-2xs border-y border-[#dbeafe] dark:border-sky-500/30'
                        : isEven
                        ? 'bg-[#fcfdfd] dark:bg-slate-900/40 hover:bg-[#f0f7ff] dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                        : 'bg-white dark:bg-slate-950/60 hover:bg-[#f0f7ff] dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {/* Row Index */}
                    <td className={`${densityPaddingClass} border-r border-slate-200 dark:border-slate-800/60 text-center text-slate-500 dark:text-slate-500 select-none font-medium`}>
                      {displayIndex}
                    </td>

                    {/* Columns */}
                    {activeCols.map((col) => {
                      const val = row[col.name];
                      const isEditing = editingCell?.id === row.id && editingCell?.field === col.name;
                      const isDirty = row.dirtyFields?.[col.name];

                      return (
                        <td
                          key={col.name}
                          onDoubleClick={() => startEditing(row.id, col.name)}
                          className={`${densityPaddingClass} border-r border-slate-200 dark:border-slate-800/60 relative ${
                            isEditing
                              ? 'overflow-visible'
                              : wrapText
                              ? 'whitespace-pre-wrap break-words min-w-[120px] max-w-lg align-top'
                              : 'truncate max-w-xs'
                          } ${isDirty ? 'bg-amber-500/15' : ''}`}
                        >
                          {/* Dirty indicator dot */}
                          {isDirty && (
                            <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 bg-rose-500 rounded-full" />
                          )}

                          {isEditing ? (
                            <InlineCellEditor
                              col={col}
                              initialValue={val}
                              onSave={(newVal) => handleSaveCell(row.id, col.name, newVal)}
                              onCancel={() => setEditingCell(null)}
                            />
                          ) : val === null || val === undefined ? (
                            <span className="text-slate-400 dark:text-slate-500 italic select-none font-mono">NULL</span>
                          ) : typeof val === 'boolean' ? (
                            <span className="text-slate-700 dark:text-slate-300 font-medium">{val ? 'TRUE' : 'FALSE'}</span>
                          ) : typeof val === 'object' ? (
                            <span className={`font-mono text-slate-700 dark:text-slate-300 ${wrapText ? 'whitespace-pre-wrap break-words leading-relaxed select-text' : 'truncate block'}`}>
                              {JSON.stringify(val)}
                            </span>
                          ) : (
                            <span className={`text-slate-800 dark:text-slate-200 ${wrapText ? 'whitespace-pre-wrap break-words leading-relaxed select-text' : 'truncate block'}`}>
                              {String(val)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

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
            <button
              onClick={insertRow}
              className="h-6 px-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 rounded-md text-[11px] font-semibold transition active:scale-95 flex items-center space-x-1 leading-none cursor-pointer shadow-2xs"
              title="Insert new row (+)"
            >
              <Plus className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Row</span>
            </button>
          ) : tableViewMode === 'structure' ? (
            <div className="flex items-center space-x-1.5 h-full">
              <button
                onClick={() => {
                  const tbl = quoteIdentifier(selectedTable, activeConnection?.engine);
                  openNewQueryTab(`ALTER TABLE ${tbl}\nADD COLUMN new_column varchar(255);`);
                }}
                className="h-6 px-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 rounded-md text-[11px] font-semibold transition active:scale-95 flex items-center space-x-1 leading-none cursor-pointer shadow-2xs"
              >
                <Plus className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0" />
                <span>Column</span>
              </button>
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
              onClick={() => {
                const tbl = quoteIdentifier(selectedTable, activeConnection?.engine);
                const firstCol = schemaInfo.columns[0]?.name || 'id';
                openNewQueryTab(`CREATE INDEX idx_${selectedTable}_${firstCol}\nON ${tbl} (${quoteIdentifier(firstCol, activeConnection?.engine)});`);
              }}
              className="h-6 px-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 rounded-md text-[11px] font-semibold transition active:scale-95 flex items-center space-x-1 leading-none cursor-pointer shadow-2xs"
            >
              <Plus className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Index</span>
            </button>
          )}
        </div>

        {/* Center: Row Counter / Stats */}
        <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono select-none flex items-center leading-none">
          {tableViewMode === 'data' ? (
            selectedRowData || selectedRowIds.size > 0 ? (
              <span className="text-sky-700 dark:text-sky-300 font-semibold">{`${selectedRowIds.size || 1} of ${filteredRows.length} rows selected`}</span>
            ) : (
              <span>{`${filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredRows.length)} of ${filteredRows.length} rows`}</span>
            )
          ) : tableViewMode === 'structure' ? (
            <span>{`${schemaInfo.columns.length} columns, ${schemaInfo.indexes.length} indexes`}</span>
          ) : (
            <span>{`${schemaInfo.indexes.length} indexes, ${schemaInfo.foreignKeys.length} foreign keys`}</span>
          )}
        </div>

        {/* Right: Filters toggle, Columns picker, Pagination */}
        <div className="flex items-center space-x-1.5 h-full">
          {tableViewMode === 'data' && (
            <>
              <button
                onClick={toggleFilterBar}
                className={`h-6 px-2 rounded-md text-[11px] font-semibold border transition flex items-center space-x-1 active:scale-95 leading-none cursor-pointer ${
                  isFilterBarOpen
                    ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-500/40'
                    : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 shadow-2xs'
                }`}
                title="Toggle WHERE / ORDER BY filter bar"
              >
                <Filter className="w-3 h-3 shrink-0" />
                <span>Filters</span>
              </button>

              <button
                onClick={() => setIsColumnsModalOpen(!isColumnsModalOpen)}
                className="h-6 px-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 rounded-md text-[11px] font-semibold transition flex items-center space-x-1 leading-none cursor-pointer shadow-2xs"
                title="Choose visible columns"
              >
                <ColumnsIcon className="w-3 h-3 shrink-0" />
                <span>Columns</span>
              </button>

              <button
                onClick={() => setWrapText(!wrapText)}
                className={`h-6 px-2 rounded-md text-[11px] font-semibold border transition flex items-center space-x-1 active:scale-95 leading-none cursor-pointer ${
                  wrapText
                    ? 'bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-500/40'
                    : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 shadow-2xs'
                }`}
                title="Toggle text wrapping across multiple lines"
              >
                <WrapText className="w-3 h-3 shrink-0" />
                <span>{wrapText ? 'Wrap: On' : 'Wrap'}</span>
              </button>

              <div className="flex items-center space-x-0.5 pl-1 h-6">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-6 w-6 flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500 cursor-pointer disabled:cursor-not-allowed"
                  disabled={currentPage <= 1}
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-6 w-6 flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500 cursor-pointer disabled:cursor-not-allowed"
                  disabled={currentPage >= totalPages}
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Columns Visibility Popup */}
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
              {schemaInfo.columns.map((col) => {
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
            label={`Sort "${targetCol.name}" ASC`}
            onClick={() => {
              const orderExpr = `${targetCol.name} ASC`;
              setFilterOrderByText(orderExpr);
              setAppliedOrderBy(orderExpr);
              showToast(`⚡ Sorted by ${targetCol.name} ASC`);
            }}
          />
          <ContextMenuItem
            icon={<ArrowDownZA className="w-3.5 h-3.5 text-sky-400" />}
            label={`Sort "${targetCol.name}" DESC`}
            onClick={() => {
              const orderExpr = `${targetCol.name} DESC`;
              setFilterOrderByText(orderExpr);
              setAppliedOrderBy(orderExpr);
              showToast(`⚡ Sorted by ${targetCol.name} DESC`);
            }}
          />
          {filterOrderByText && (
            <ContextMenuItem
              icon={<X className="w-3.5 h-3.5 text-slate-400" />}
              label="Clear Sort"
              onClick={() => {
                setFilterOrderByText('');
                setAppliedOrderBy('');
                showToast('Cleared sorting');
              }}
            />
          )}
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
  );
};
