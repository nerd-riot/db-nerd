import React, { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { getTableSchema } from '../data/schemas';
import { Key, Copy, Code, Terminal } from 'lucide-react';
import { TableIndexDefinition } from '../types';
import { Tooltip } from './Tooltip';
import { useColumnResizer } from '../lib/grid/columnWidth';
import {
  ContextMenuContainer,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuHeader,
  ContextMenuPosition,
} from './ContextMenu';

const INDEX_COLUMNS = ['index_name', 'columns', 'type', 'is_unique', 'is_primary', 'size'] as const;

export const TableIndexesView: React.FC = () => {
  const { selectedTable, activeConnection, liveSchemas, openNewQueryTab, showToast } = useAppStore();
  const liveSchema = activeConnection?.id ? liveSchemas?.[activeConnection.id]?.[selectedTable] : undefined;
  const schemaInfo = liveSchema || getTableSchema(selectedTable);
  const indexes = schemaInfo?.indexes || [];

  const [idxContextPos, setIdxContextPos] = useState<ContextMenuPosition | null>(null);
  const [targetIdx, setTargetIdx] = useState<TableIndexDefinition | null>(null);

  const sampleRows = React.useMemo(() => {
    return indexes.map((idx) => ({
      index_name: idx.name,
      columns: Array.isArray(idx.columns) ? idx.columns.join(', ') : String(idx.columns),
      type: idx.type,
      is_unique: idx.isUnique ? 'YES' : 'NO',
      is_primary: idx.isPrimary ? 'YES' : 'NO',
      size: idx.size || '16 KB',
    }));
  }, [indexes]);

  const {
    handleResizeStart,
    handleAutoFitColumn,
    handleAutoFitAll,
    getColumnWidth,
  } = useColumnResizer({
    columns: INDEX_COLUMNS as unknown as string[],
    sampleRows,
    defaultWidth: 160,
    minWidth: 70,
    maxWidth: 600,
  });

  return (
    <div className="flex-1 flex flex-col bg-slate-100 dark:bg-slate-900/90 text-xs font-mono overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-11 bg-white dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800/90 px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 font-sans">
            <span className="text-slate-500 dark:text-slate-400 font-semibold text-xs">Table</span>
            <span className="font-bold text-slate-800 dark:text-slate-100">{selectedTable}</span>
          </div>
          <span className="text-slate-400">/</span>
          <span className="text-amber-600 dark:text-amber-400 font-semibold font-sans text-xs">Indexes & Constraints</span>
        </div>
        <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
          <span>{indexes.length} index{indexes.length !== 1 ? 'es' : ''} defined</span>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto bg-white dark:bg-slate-950/80">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '48px', minWidth: '48px', maxWidth: '48px' }} />
            {INDEX_COLUMNS.map((col) => (
              <col key={col} style={{ width: `${getColumnWidth(col)}px` }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-950/95 backdrop-blur-md z-10 border-b border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-400 text-left text-[11px]">
            <tr>
              <th
                style={{ width: '48px', minWidth: '48px', maxWidth: '48px' }}
                className="px-2 py-1.5 border-r border-slate-300 dark:border-slate-800/80 text-center text-slate-500 dark:text-slate-600 font-bold cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-900/50 transition-colors"
                onDoubleClick={handleAutoFitAll}
              >
                <Tooltip content="Double-click to fit all columns" side="bottom">
                  <span className="block w-full">#</span>
                </Tooltip>
              </th>
              {INDEX_COLUMNS.map((col) => {
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40 text-[11px]">
            {indexes.map((idx, i) => {
              const isEven = i % 2 === 0;

              return (
                <tr
                  key={idx.name + i}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTargetIdx(idx);
                    setIdxContextPos({ x: e.clientX, y: e.clientY });
                  }}
                  className={`hover:bg-[#f0f7ff] dark:hover:bg-slate-800/40 transition-colors cursor-pointer ${
                    isEven ? 'bg-[#fcfdfd] dark:bg-slate-900/40' : 'bg-white dark:bg-slate-950/60'
                  }`}
                >
                  <td className="w-12 px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 text-center text-slate-500 select-none">
                    {i + 1}
                  </td>
                  <td
                    style={{
                      width: `${getColumnWidth('index_name')}px`,
                      minWidth: `${getColumnWidth('index_name')}px`,
                      maxWidth: `${getColumnWidth('index_name')}px`,
                    }}
                    className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 font-semibold text-slate-800 dark:text-slate-200 truncate"
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      <Key className="w-3 h-3 text-amber-500 dark:text-amber-400 shrink-0" />
                      <span className="truncate">{idx.name}</span>
                    </div>
                  </td>
                  <td
                    style={{
                      width: `${getColumnWidth('columns')}px`,
                      minWidth: `${getColumnWidth('columns')}px`,
                      maxWidth: `${getColumnWidth('columns')}px`,
                    }}
                    className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 text-sky-700 dark:text-sky-300 font-semibold truncate"
                  >
                    <span className="truncate">{idx.columns.join(', ')}</span>
                  </td>
                  <td
                    style={{
                      width: `${getColumnWidth('type')}px`,
                      minWidth: `${getColumnWidth('type')}px`,
                      maxWidth: `${getColumnWidth('type')}px`,
                    }}
                    className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 text-slate-700 dark:text-slate-300 truncate"
                  >
                    <span className="truncate">{idx.type}</span>
                  </td>
                  <td
                    style={{
                      width: `${getColumnWidth('is_unique')}px`,
                      minWidth: `${getColumnWidth('is_unique')}px`,
                      maxWidth: `${getColumnWidth('is_unique')}px`,
                    }}
                    className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 truncate"
                  >
                    {idx.isUnique ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">YES</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">NO</span>
                    )}
                  </td>
                  <td
                    style={{
                      width: `${getColumnWidth('is_primary')}px`,
                      minWidth: `${getColumnWidth('is_primary')}px`,
                      maxWidth: `${getColumnWidth('is_primary')}px`,
                    }}
                    className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 truncate"
                  >
                    {idx.isPrimary ? (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">YES</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">NO</span>
                    )}
                  </td>
                  <td
                    style={{
                      width: `${getColumnWidth('size')}px`,
                      minWidth: `${getColumnWidth('size')}px`,
                      maxWidth: `${getColumnWidth('size')}px`,
                    }}
                    className="px-3 py-1.5 text-slate-500 dark:text-slate-400 truncate"
                  >
                    <span className="truncate">{idx.size || '16 KB'}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Index Context Menu */}
      {idxContextPos && targetIdx && (
        <ContextMenuContainer
          position={idxContextPos}
          onClose={() => {
            setIdxContextPos(null);
            setTargetIdx(null);
          }}
          width={240}
        >
          <ContextMenuHeader title={`Index: ${targetIdx.name}`} />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy Index Name"
            onClick={() => {
              navigator.clipboard.writeText(targetIdx.name);
              showToast(`📋 Copied "${targetIdx.name}"`);
              setIdxContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy Indexed Columns"
            onClick={() => {
              const cols = targetIdx.columns.join(', ');
              navigator.clipboard.writeText(cols);
              showToast(`📋 Copied columns "${cols}"`);
              setIdxContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Code className="w-3.5 h-3.5 text-sky-400" />}
            label="Copy CREATE INDEX SQL"
            onClick={() => {
              const sql = `CREATE ${targetIdx.isUnique ? 'UNIQUE ' : ''}INDEX "${targetIdx.name}" ON "${selectedTable}" USING ${(targetIdx.type || 'btree').toLowerCase()} (${targetIdx.columns.map((c) => `"${c}"`).join(', ')});`;
              navigator.clipboard.writeText(sql);
              showToast(`📋 Copied CREATE INDEX DDL`);
              setIdxContextPos(null);
            }}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Terminal className="w-3.5 h-3.5 text-emerald-400" />}
            label="Open in SQL Editor"
            onClick={() => {
              const sql = `CREATE ${targetIdx.isUnique ? 'UNIQUE ' : ''}INDEX "${targetIdx.name}" ON "${selectedTable}" USING ${(targetIdx.type || 'btree').toLowerCase()} (${targetIdx.columns.map((c) => `"${c}"`).join(', ')});`;
              openNewQueryTab(sql);
              setIdxContextPos(null);
            }}
          />
        </ContextMenuContainer>
      )}
    </div>
  );
};
