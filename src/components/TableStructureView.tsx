import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { getTableSchema } from '../data/schemas';
import {
  Search,
  Key,
  Copy,
  Code,
  Filter,
  Terminal,
  Plus,
  Trash2,
  RotateCcw,
  Check,
  FileCode,
} from 'lucide-react';
import { ColumnDefinition, QueryHistoryItem } from '../types';
import { ColumnTypeIcon } from './ColumnTypeIcon';
import { ColumnTypePicker } from './ColumnTypePicker';
import { StructureReviewModal } from './StructureReviewModal';
import { Tooltip } from './Tooltip';
import { HeartbeatDot } from './HeartbeatDot';
import { useColumnResizer } from '../lib/grid/columnWidth';
import {
  StagedColumnDefinition,
  buildAlterTableSql,
  generateAlterTableStatements,
} from '../lib/db/ddlGenerator';
import { executeRealQuery } from '../services/dbService';
import { metadataCache } from '../lib/cache/lruCache';
import { persistHistory } from '../lib/storage/historyPersistence';
import {
  isInternalRowKey,
  sortColumnsByDdlConvention,
} from '../lib';
import {
  ContextMenuContainer,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuHeader,
  ContextMenuPosition,
} from './ContextMenu';

const STRUCTURE_COLUMNS = [
  'column_name',
  'data_type',
  'is_nullable',
  'check',
  'column_default',
  'foreign_key',
  'comment',
] as const;

export const TableStructureView: React.FC = () => {
  const {
    selectedTable,
    activeConnection,
    liveSchemas,
    structureSearchColumn,
    setStructureSearchColumn,
    selectedStructureColumn,
    setSelectedStructureColumn,
    setTableViewMode,
    isFilterBarOpen,
    toggleFilterBar,
    setFilterWhereText,
    openNewQueryTab,
    showToast,
    fetchLiveTableSchema,
    structureAddColumnTrigger,
    history,
    requestSafetyConfirmation,
  } = useAppStore();

  const liveSchema = activeConnection?.id ? liveSchemas?.[activeConnection.id]?.[selectedTable] : undefined;
  const schemaInfo = liveSchema || getTableSchema(selectedTable);

  const sortedColumns = useMemo(() => {
    const raw = schemaInfo?.columns && schemaInfo.columns.length > 0 ? schemaInfo.columns : [];
    const known = raw.filter((c) => !isInternalRowKey(c.name));
    const ddlOrderMap = new Map<string, number>();
    known.forEach((c, idx) => ddlOrderMap.set(c.name, idx));
    return sortColumnsByDdlConvention(known, ddlOrderMap);
  }, [schemaInfo]);

  const [columns, setColumns] = useState<StagedColumnDefinition[]>([]);
  const [tableNameInput, setTableNameInput] = useState(selectedTable);
  const [colContextPos, setColContextPos] = useState<ContextMenuPosition | null>(null);
  const [targetCol, setTargetCol] = useState<StagedColumnDefinition | null>(null);
  const [targetColIdx, setTargetColIdx] = useState<number | null>(null);

  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [focusedColIdx, setFocusedColIdx] = useState<number | null>(null);

  const newColInputRef = useRef<HTMLInputElement>(null);
  const prevTriggerRef = useRef(structureAddColumnTrigger);

  // Sync columns with sortedColumns on selectedTable or schema change
  useEffect(() => {
    const initialized: StagedColumnDefinition[] = sortedColumns.map((col) => ({
      ...col,
      _originalName: col.name,
      _state: 'clean',
      _isNew: false,
      _isDeleted: false,
      _dirtyFields: {},
    }));
    setColumns(initialized);
    setTableNameInput(selectedTable);
    if (initialized.length > 0 && !selectedStructureColumn) {
      setSelectedStructureColumn(initialized[0]);
    }
  }, [selectedTable, sortedColumns]);

  // Compute pending structure changes
  const pendingChanges = useMemo(() => {
    return columns.filter(
      (c) => c._state === 'inserted' || c._state === 'modified' || c._state === 'deleted'
    );
  }, [columns]);
  const pendingCount = pendingChanges.length;

  // Handle adding new column
  const handleAddNewColumn = () => {
    let baseName = 'new_column';
    let counter = 1;
    while (columns.some((c) => c.name.toLowerCase() === baseName.toLowerCase())) {
      baseName = `new_column_${counter++}`;
    }
    const newCol: StagedColumnDefinition = {
      name: baseName,
      type: 'varchar(255)',
      isNullable: true,
      defaultValue: undefined,
      isPrimaryKey: false,
      comment: '',
      _originalName: baseName,
      _isNew: true,
      _state: 'inserted',
      _dirtyFields: {},
    };
    setColumns((prev) => [...prev, newCol]);
    setSelectedStructureColumn(newCol);
    setFocusedColIdx(columns.length);
    showToast(`➕ Added new column "${baseName}"`);
  };

  // Watch for external trigger from TableGrid footer
  useEffect(() => {
    if (structureAddColumnTrigger > prevTriggerRef.current) {
      handleAddNewColumn();
      prevTriggerRef.current = structureAddColumnTrigger;
    }
  }, [structureAddColumnTrigger]);

  // Auto-focus newly added column
  useEffect(() => {
    if (focusedColIdx !== null && newColInputRef.current) {
      newColInputRef.current.focus();
      newColInputRef.current.select();
      setFocusedColIdx(null);
    }
  }, [columns.length, focusedColIdx]);

  // Update a column field and calculate dirtiness against base schema
  const handleUpdateCol = (idx: number, field: keyof ColumnDefinition, val: any) => {
    setColumns((prev) => {
      const next = [...prev];
      const target = { ...next[idx] };
      (target as any)[field] = val;

      if (!target._isNew) {
        const origName = target._originalName || target.name;
        const orig = sortedColumns.find((c) => c.name === origName);
        if (orig) {
          const isNameChanged = target.name !== orig.name;
          const isTypeChanged = target.type !== orig.type;
          const isNullableChanged = target.isNullable !== orig.isNullable;
          const isDefaultChanged = (target.defaultValue || '') !== (orig.defaultValue || '');
          const isCommentChanged = (target.comment || '') !== (orig.comment || '');

          const isModified =
            isNameChanged ||
            isTypeChanged ||
            isNullableChanged ||
            isDefaultChanged ||
            isCommentChanged;

          target._state = isModified ? 'modified' : 'clean';
          target._dirtyFields = {
            name: isNameChanged,
            type: isTypeChanged,
            isNullable: isNullableChanged,
            defaultValue: isDefaultChanged,
            comment: isCommentChanged,
          };
        }
      }
      next[idx] = target;
      return next;
    });
  };

  // Delete / Drop column
  const handleDeleteCol = (idx: number) => {
    setColumns((prev) => {
      const target = prev[idx];
      if (target._isNew) {
        return prev.filter((_, i) => i !== idx);
      }
      const next = [...prev];
      next[idx] = {
        ...target,
        _isDeleted: true,
        _state: 'deleted',
      };
      return next;
    });
    showToast('🗑️ Marked column for deletion (staged)');
  };

  // Revert column back to original
  const handleRevertCol = (idx: number) => {
    setColumns((prev) => {
      const target = prev[idx];
      if (target._isNew) {
        return prev.filter((_, i) => i !== idx);
      }
      const origName = target._originalName || target.name;
      const orig = sortedColumns.find((c) => c.name === origName);
      if (!orig) return prev;
      const next = [...prev];
      next[idx] = {
        ...orig,
        _originalName: orig.name,
        _state: 'clean',
        _isDeleted: false,
        _isNew: false,
        _dirtyFields: {},
      };
      return next;
    });
    showToast('↺ Reverted column changes');
  };

  // Discard all staged changes
  const handleDiscardAll = () => {
    const reverted: StagedColumnDefinition[] = sortedColumns.map((col) => ({
      ...col,
      _originalName: col.name,
      _state: 'clean',
      _isNew: false,
      _isDeleted: false,
      _dirtyFields: {},
    }));
    setColumns(reverted);
    setTableNameInput(selectedTable);
    showToast('↺ Discarded all uncommitted structure changes');
  };

  // Generate DDL SQL text
  const pendingSqlText = useMemo(() => {
    return buildAlterTableSql({
      tableName: selectedTable,
      originalColumns: sortedColumns,
      currentColumns: columns,
      engine: activeConnection?.engine || 'postgres',
      schema: liveSchema?.schema || 'public',
    });
  }, [selectedTable, sortedColumns, columns, activeConnection?.engine, liveSchema?.schema]);

  // Apply changes to database
  const handleApplyChanges = async () => {
    if (pendingCount === 0) return;

    if (!pendingSqlText || pendingSqlText.startsWith('--')) {
      showToast('⚠️ No pending structure changes');
      return;
    }

    const approved = await requestSafetyConfirmation({
      sqlText: pendingSqlText,
      title: 'Authorize Structure Alteration',
      actionLabel: 'Apply DDL Changes (⌘S)',
      isCommit: true,
    });
    if (!approved) {
      showToast('🛑 DDL changes cancelled by user');
      return;
    }

    setIsApplying(true);
    try {
      if (activeConnection?.id && activeConnection.id !== 'demo') {
        const statements = generateAlterTableStatements({
          tableName: selectedTable,
          originalColumns: sortedColumns,
          currentColumns: columns,
          engine: activeConnection?.engine || 'postgres',
          schema: liveSchema?.schema || 'public',
        });

        // Execute statements sequentially
        for (const stmt of statements) {
          const res = await executeRealQuery(activeConnection, stmt);
          if (!res.success && res.error) {
            showToast(`❌ DDL execution failed: ${res.error}`);
            setIsApplying(false);
            return;
          }
        }
      }

      // Evict schema cache
      const connId = activeConnection?.id || '';
      metadataCache.schemas.deleteByPrefix(`${connId}:`);
      metadataCache.tables.deleteByPrefix(`${connId}:`);

      // Refresh live schema from database
      if (fetchLiveTableSchema && selectedTable) {
        await fetchLiveTableSchema(selectedTable, activeConnection);
      }

      // If demo or mock, update liveSchemas directly in store
      if (connId) {
        const committedCols: ColumnDefinition[] = columns
          .filter((c) => !c._isDeleted)
          .map(({ _isNew, _isDeleted, _state, _dirtyFields, _originalName, ...clean }) => clean);

        useAppStore.setState((state) => ({
          liveSchemas: {
            ...state.liveSchemas,
            [connId]: {
              ...(state.liveSchemas[connId] || {}),
              [selectedTable]: {
                ...(state.liveSchemas[connId]?.[selectedTable] || schemaInfo),
                columns: committedCols,
              },
            },
          },
        }));
      }

      // Add DDL execution to query history
      const nowMs = Date.now();
      const newHistoryItem: QueryHistoryItem = {
        id: `h-${nowMs}`,
        connectionId: activeConnection?.id || '',
        connectionName: activeConnection?.name || 'Local',
        database: activeConnection?.database || '',
        env: activeConnection?.env || 'local',
        sql: pendingSqlText,
        timestamp: `Today at ${new Date(nowMs).toTimeString().slice(0, 8)}`,
        timestampMs: nowMs,
        durationMs: 4.8,
        rowsAffected: pendingCount,
        status: 'success',
        isFavorite: false,
      };
      persistHistory([newHistoryItem, ...history]);

      showToast(`✓ Applied ${pendingCount} structure change(s) to "${selectedTable}"`);
    } catch (err: any) {
      showToast(`❌ Failed to apply structure changes: ${err?.message || err}`);
    } finally {
      setIsApplying(false);
    }
  };

  // Keyboard shortcuts (⌘S, ⌘Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;
      if (isCmd && e.key.toLowerCase() === 's') {
        if (pendingCount > 0) {
          e.preventDefault();
          e.stopPropagation();
          handleApplyChanges();
        }
      } else if (isCmd && e.key.toLowerCase() === 'z') {
        if (pendingCount > 0) {
          e.preventDefault();
          e.stopPropagation();
          handleDiscardAll();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingCount, pendingSqlText, columns]);

  // Column Resizer setup
  const sampleRows = useMemo(() => {
    return columns.map((col) => ({
      column_name: col.name,
      data_type: col.type,
      is_nullable: col.isNullable ? 'YES' : 'NO',
      check: 'NULL',
      column_default: col.defaultValue || 'NULL',
      foreign_key: col.isForeignKey ? `→ ${col.foreignTable}(${col.foreignColumn})` : 'EMPTY',
      comment: col.comment || '',
    }));
  }, [columns]);

  const {
    handleResizeStart,
    handleAutoFitColumn,
    handleAutoFitAll,
    getColumnWidth,
  } = useColumnResizer({
    columns: STRUCTURE_COLUMNS as unknown as string[],
    sampleRows,
    defaultWidth: 150,
    minWidth: 65,
    maxWidth: 550,
  });

  const primaryKeyCol = columns.find((c) => c.isPrimaryKey && !c._isDeleted)?.name || 'id';

  const filteredColumns = columns.filter((col) =>
    col.name.toLowerCase().includes(structureSearchColumn.trim().toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col bg-slate-100 dark:bg-slate-900/90 text-xs font-mono overflow-hidden select-none">
      {/* Top Header: Table Name, Primary Key, Add Column, Search */}
      <div className="h-11 bg-white dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800/90 px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-3">
          {/* Table Name Field */}
          <div className="flex items-center space-x-1.5 font-sans">
            <span className="text-slate-500 dark:text-slate-400 font-semibold text-xs">Name</span>
            <input
              type="text"
              value={tableNameInput}
              onChange={(e) => setTableNameInput(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-sky-500/70 rounded-md px-2.5 py-1 text-slate-800 dark:text-slate-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 w-44 shadow-2xs"
            />
          </div>

          {/* Primary Key Badge */}
          <div className="flex items-center space-x-1.5 font-sans">
            <span className="text-slate-500 dark:text-slate-400 font-semibold text-xs">Primary</span>
            <span className="px-2 py-0.5 bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-600/60 text-sky-700 dark:text-sky-300 font-mono text-xs rounded-md font-semibold flex items-center space-x-1 shadow-2xs">
              <Key className="w-3 h-3 text-sky-600 dark:text-sky-400" />
              <span>{primaryKeyCol}</span>
            </span>
          </div>

          {/* + Add Column Button */}
          <Tooltip side="bottom" content="Add new column to structure" shortcut="+">
            <button
              onClick={handleAddNewColumn}
              className="px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-sans font-semibold transition active:scale-95 flex items-center space-x-1.5 cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <span>Add Column</span>
            </button>
          </Tooltip>
        </div>

        {/* Search for Column Input */}
        <div className="relative font-sans">
          <input
            type="text"
            placeholder="Search for column..."
            value={structureSearchColumn}
            onChange={(e) => setStructureSearchColumn(e.target.value)}
            className="w-56 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors shadow-2xs"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-2 pointer-events-none" />
        </div>
      </div>

      {/* Transactional Pending Structure Changes Banner */}
      {pendingCount > 0 && (
        <div className="bg-amber-500/10 dark:bg-amber-950/40 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs select-none flex-shrink-0 animate-in fade-in duration-100">
          <div className="flex items-center space-x-2 text-amber-800 dark:text-amber-200 font-sans font-semibold">
            <HeartbeatDot color="amber" size="xs" showWave={true} />
            <span>
              <strong>{pendingCount}</strong> uncommitted structure change{pendingCount !== 1 ? 's' : ''} on "{selectedTable}"
            </span>
          </div>
          <div className="flex items-center space-x-2 font-mono text-[11px]">
            <span className="text-slate-500 dark:text-slate-400 font-sans hidden md:inline">
              Press <kbd className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 font-bold font-mono">⌘S</kbd> to Apply or <kbd className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 font-bold font-mono">⌘Z</kbd> to Discard
            </span>
            <Tooltip side="bottom" content="Review generated ALTER TABLE DDL">
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(true)}
                className="h-6 px-2.5 rounded-md bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 font-sans font-semibold transition active:scale-95 cursor-pointer flex items-center space-x-1 shadow-2xs"
              >
                <FileCode className="w-3.5 h-3.5 text-sky-500" />
                <span>Review SQL</span>
              </button>
            </Tooltip>
            <Tooltip side="bottom" content="Discard all uncommitted structure changes" shortcut="⌘Z">
              <button
                type="button"
                onClick={handleDiscardAll}
                className="h-6 px-2.5 rounded-md bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-500/30 font-sans font-semibold transition active:scale-95 cursor-pointer flex items-center space-x-1 shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Discard</span>
              </button>
            </Tooltip>
            <Tooltip side="bottom" content="Apply DDL statements to database" shortcut="⌘S">
              <button
                type="button"
                disabled={isApplying}
                onClick={handleApplyChanges}
                className="h-6 px-3 rounded-md bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-sans font-bold transition active:scale-95 cursor-pointer shadow-md flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{isApplying ? 'Applying...' : 'Apply Changes'}</span>
                <kbd className="px-1 py-0.2 rounded bg-black/20 text-[9px] font-mono">⌘S</kbd>
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Structure Columns Grid */}
      <div className="flex-1 overflow-auto bg-white dark:bg-slate-950/80">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '48px', minWidth: '48px', maxWidth: '48px' }} />
            {STRUCTURE_COLUMNS.map((col) => (
              <col key={col} style={{ width: `${getColumnWidth(col)}px` }} />
            ))}
            <col style={{ width: '48px', minWidth: '48px', maxWidth: '48px' }} />
          </colgroup>

          {/* Table Header */}
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-950/95 backdrop-blur-md z-10 border-b border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-400 text-left text-[11px]">
            <tr>
              {/* Row # */}
              <th
                style={{ width: '48px', minWidth: '48px', maxWidth: '48px' }}
                className="px-2 py-1.5 border-r border-slate-300 dark:border-slate-800/80 text-center text-slate-500 dark:text-slate-600 font-bold cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-900/50 transition-colors"
                onDoubleClick={handleAutoFitAll}
              >
                <Tooltip content="Double-click to fit all columns" side="bottom">
                  <span className="block w-full">#</span>
                </Tooltip>
              </th>

              {/* Data Columns */}
              {STRUCTURE_COLUMNS.map((col) => {
                const width = getColumnWidth(col);
                return (
                  <th
                    key={col}
                    style={{
                      width: `${width}px`,
                      minWidth: `${width}px`,
                      maxWidth: `${width}px`,
                    }}
                    className="relative px-3 py-2 border-r border-slate-300 dark:border-slate-800/80 font-normal truncate group/th select-none"
                  >
                    <span className="truncate block font-semibold text-slate-700 dark:text-slate-300">{col}</span>

                    {/* Resize Handle with Double-Click Auto-Fit */}
                    <Tooltip content="Drag to resize • Double-click to auto-fit" side="top">
                      <div
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleResizeStart(col, e);
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAutoFitColumn(col);
                        }}
                        className="absolute top-0 right-0 bottom-0 w-4 -mr-2 cursor-col-resize z-20 flex items-center justify-center group/resizer hover:bg-sky-500/20 active:bg-sky-500/40"
                      >
                        <div className="w-[1.5px] h-full bg-slate-300 dark:bg-slate-700/80 group-hover/resizer:bg-sky-500 group-active/resizer:bg-sky-500 transition-colors pointer-events-none" />
                      </div>
                    </Tooltip>
                  </th>
                );
              })}

              {/* Actions Header */}
              <th
                style={{ width: '48px', minWidth: '48px', maxWidth: '48px' }}
                className="px-2 py-2 text-center font-normal text-slate-400 select-none"
              >
                —
              </th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40 text-[11px]">
            {filteredColumns.map((col, idx) => {
              const isSelected = selectedStructureColumn?.name === col.name;
              const isEven = idx % 2 === 0;

              // Row staging states
              const isNew = col._state === 'inserted' || col._isNew;
              const isModified = col._state === 'modified';
              const isDeleted = col._state === 'deleted' || col._isDeleted;

              return (
                <tr
                  key={col._originalName || col.name + idx}
                  onClick={() => setSelectedStructureColumn(col)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedStructureColumn(col);
                    setTargetCol(col);
                    setTargetColIdx(idx);
                    setColContextPos({ x: e.clientX, y: e.clientY });
                  }}
                  className={`group/row transition-colors cursor-pointer ${
                    isDeleted
                      ? 'bg-rose-500/10 dark:bg-rose-950/20 opacity-60 line-through border-l-4 border-l-rose-500'
                      : isNew
                      ? 'bg-emerald-500/10 dark:bg-emerald-950/20 border-l-4 border-l-emerald-500 font-semibold'
                      : isModified
                      ? 'bg-amber-500/10 dark:bg-amber-950/20 border-l-4 border-l-amber-500 font-semibold'
                      : isSelected
                      ? 'bg-[#eff6ff] dark:bg-sky-500/20 text-[#1d4ed8] dark:text-white font-semibold shadow-2xs border-l-2 border-l-sky-500'
                      : isEven
                      ? 'bg-[#fcfdfd] dark:bg-slate-900/40 hover:bg-[#f0f7ff] dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200'
                      : 'bg-white dark:bg-slate-950/60 hover:bg-[#f0f7ff] dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {/* # Index */}
                  <td className="w-12 px-2 py-1.5 border-r border-slate-200 dark:border-slate-800/60 text-center text-slate-500 select-none">
                    <div className="flex items-center justify-center space-x-1">
                      <span>{idx + 1}</span>
                      {isNew && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      )}
                      {isModified && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      )}
                      {isDeleted && (
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                      )}
                    </div>
                  </td>

                  {/* Column Name */}
                  <td
                    style={{
                      width: `${getColumnWidth('column_name')}px`,
                      minWidth: `${getColumnWidth('column_name')}px`,
                      maxWidth: `${getColumnWidth('column_name')}px`,
                    }}
                    className="px-2.5 py-1 border-r border-slate-200 dark:border-slate-800/60 font-semibold text-slate-800 dark:text-slate-200 truncate"
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      <ColumnTypeIcon type={col.type} size={12} />
                      <input
                        ref={idx === columns.length - 1 && isNew ? newColInputRef : undefined}
                        type="text"
                        disabled={isDeleted}
                        value={col.name}
                        onChange={(e) => handleUpdateCol(idx, 'name', e.target.value)}
                        className={`w-full bg-transparent border border-transparent focus:border-sky-500/70 focus:bg-white dark:focus:bg-slate-900 rounded px-1 text-slate-800 dark:text-slate-100 font-mono text-xs focus:outline-none transition-colors ${
                          col._dirtyFields?.name ? 'text-amber-600 dark:text-amber-400 font-bold' : ''
                        }`}
                      />
                      {isNew && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-sans font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 shrink-0">
                          NEW
                        </span>
                      )}
                      {isModified && !isNew && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-sans font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 shrink-0">
                          MOD
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Data Type (Custom Type Picker) */}
                  <td
                    style={{
                      width: `${getColumnWidth('data_type')}px`,
                      minWidth: `${getColumnWidth('data_type')}px`,
                      maxWidth: `${getColumnWidth('data_type')}px`,
                    }}
                    className="px-2 py-1 border-r border-slate-200 dark:border-slate-800/60 text-slate-700 dark:text-slate-300"
                  >
                    <ColumnTypePicker
                      disabled={isDeleted}
                      value={col.type}
                      onChange={(newType) => handleUpdateCol(idx, 'type', newType)}
                    />
                  </td>

                  {/* Is Nullable (Segmented Badge / Toggle) */}
                  <td
                    style={{
                      width: `${getColumnWidth('is_nullable')}px`,
                      minWidth: `${getColumnWidth('is_nullable')}px`,
                      maxWidth: `${getColumnWidth('is_nullable')}px`,
                    }}
                    className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60"
                  >
                    <Tooltip
                      content={
                        col.isNullable
                          ? 'Nullable (allows NULL values) — Click to set NOT NULL'
                          : 'NOT NULL (disallows NULL values) — Click to set Nullable'
                      }
                      side="top"
                    >
                      <button
                        type="button"
                        disabled={isDeleted}
                        onClick={() => handleUpdateCol(idx, 'isNullable', !col.isNullable)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition cursor-pointer select-none inline-flex items-center space-x-1 ${
                          col.isNullable
                            ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        <span>{col.isNullable ? 'YES' : 'NO'}</span>
                      </button>
                    </Tooltip>
                  </td>

                  {/* Check Constraint */}
                  <td
                    style={{
                      width: `${getColumnWidth('check')}px`,
                      minWidth: `${getColumnWidth('check')}px`,
                      maxWidth: `${getColumnWidth('check')}px`,
                    }}
                    className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 text-slate-400 italic truncate"
                  >
                    NULL
                  </td>

                  {/* Column Default */}
                  <td
                    style={{
                      width: `${getColumnWidth('column_default')}px`,
                      minWidth: `${getColumnWidth('column_default')}px`,
                      maxWidth: `${getColumnWidth('column_default')}px`,
                    }}
                    className="px-2 py-1 border-r border-slate-200 dark:border-slate-800/60 text-slate-700 dark:text-slate-300 truncate"
                  >
                    <input
                      type="text"
                      disabled={isDeleted}
                      value={col.defaultValue ?? ''}
                      placeholder="NULL"
                      onChange={(e) => handleUpdateCol(idx, 'defaultValue', e.target.value)}
                      className={`w-full bg-transparent border border-transparent focus:border-sky-500/70 focus:bg-white dark:focus:bg-slate-900 rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none transition-colors ${
                        !col.defaultValue || col.defaultValue === 'NULL'
                          ? 'text-slate-400 italic placeholder-slate-400 dark:placeholder-slate-600'
                          : 'text-slate-800 dark:text-slate-200'
                      }`}
                    />
                  </td>

                  {/* Foreign Key */}
                  <td
                    style={{
                      width: `${getColumnWidth('foreign_key')}px`,
                      minWidth: `${getColumnWidth('foreign_key')}px`,
                      maxWidth: `${getColumnWidth('foreign_key')}px`,
                    }}
                    className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 text-slate-500 truncate"
                  >
                    {col.isForeignKey ? (
                      <span className="text-sky-700 dark:text-sky-400 font-semibold truncate block">{`→ ${col.foreignTable}(${col.foreignColumn})`}</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-600">EMPTY</span>
                    )}
                  </td>

                  {/* Comment */}
                  <td
                    style={{
                      width: `${getColumnWidth('comment')}px`,
                      minWidth: `${getColumnWidth('comment')}px`,
                      maxWidth: `${getColumnWidth('comment')}px`,
                    }}
                    className="px-2 py-1 text-slate-600 dark:text-slate-400 truncate"
                  >
                    <input
                      type="text"
                      disabled={isDeleted}
                      placeholder="Comment..."
                      value={col.comment || ''}
                      onChange={(e) => handleUpdateCol(idx, 'comment', e.target.value)}
                      className="w-full bg-transparent border border-transparent focus:border-sky-500/70 focus:bg-white dark:focus:bg-slate-900 rounded px-1.5 py-0.5 placeholder-slate-400 dark:placeholder-slate-600 text-slate-700 dark:text-slate-300 text-xs focus:outline-none transition-colors"
                    />
                  </td>

                  {/* Row Actions: Revert or Drop */}
                  <td
                    style={{ width: '48px', minWidth: '48px', maxWidth: '48px' }}
                    className="px-2 py-1 text-center select-none"
                  >
                    <div className="flex items-center justify-center space-x-1">
                      {isModified || isNew || isDeleted ? (
                        <Tooltip content="Revert changes to this column" side="left">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRevertCol(idx);
                            }}
                            className="p-1 rounded text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      ) : (
                        <Tooltip content="Drop / Delete column (staged)" side="left">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCol(idx);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition opacity-0 group-hover/row:opacity-100 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Review SQL Modal */}
      <StructureReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        sqlText={pendingSqlText}
        tableName={selectedTable}
        engine={activeConnection?.engine || 'postgres'}
        pendingCount={pendingCount}
        onApply={handleApplyChanges}
        onDiscard={handleDiscardAll}
        isApplying={isApplying}
      />

      {/* Column Structure Context Menu */}
      {colContextPos && targetCol && (
        <ContextMenuContainer
          position={colContextPos}
          onClose={() => {
            setColContextPos(null);
            setTargetCol(null);
            setTargetColIdx(null);
          }}
          width={240}
        >
          <ContextMenuHeader title={`Column: ${targetCol.name}`} />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy Column Name"
            onClick={() => {
              navigator.clipboard.writeText(targetCol.name);
              showToast(`📋 Copied "${targetCol.name}"`);
              setColContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
            label={`Copy Type (${targetCol.type})`}
            onClick={() => {
              navigator.clipboard.writeText(targetCol.type);
              showToast(`📋 Copied type "${targetCol.type}"`);
              setColContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Code className="w-3.5 h-3.5 text-sky-400" />}
            label="Copy Column DDL"
            onClick={() => {
              const ddl = `"${targetCol.name}" ${targetCol.type.toUpperCase()}${targetCol.isPrimaryKey ? ' PRIMARY KEY' : ''}${targetCol.isNullable ? '' : ' NOT NULL'}${targetCol.defaultValue && targetCol.defaultValue !== 'NULL' ? ` DEFAULT ${targetCol.defaultValue}` : ''}`;
              navigator.clipboard.writeText(ddl);
              showToast(`📋 Copied DDL for "${targetCol.name}"`);
              setColContextPos(null);
            }}
          />
          <ContextMenuDivider />
          {targetColIdx !== null && (
            <ContextMenuItem
              icon={<Trash2 className="w-3.5 h-3.5 text-rose-500" />}
              label="Drop Column (Staged)"
              onClick={() => {
                handleDeleteCol(targetColIdx);
                setColContextPos(null);
              }}
            />
          )}
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Filter className="w-3.5 h-3.5 text-emerald-400" />}
            label="Filter by Column in Data Grid"
            onClick={() => {
              setTableViewMode('data');
              if (!isFilterBarOpen) {
                toggleFilterBar();
              }
              setFilterWhereText(`"${targetCol.name}" = `);
              setColContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Terminal className="w-3.5 h-3.5 text-amber-400" />}
            label="Query Distinct Values in SQL Tab"
            onClick={() => {
              openNewQueryTab(`SELECT "${targetCol.name}", COUNT(*) AS count\nFROM "${selectedTable}"\nGROUP BY "${targetCol.name}"\nORDER BY count DESC\nLIMIT 100;`);
              setColContextPos(null);
            }}
          />
        </ContextMenuContainer>
      )}
    </div>
  );
};
