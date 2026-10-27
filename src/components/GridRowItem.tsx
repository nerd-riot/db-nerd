import React, { memo } from 'react';
import { GridRow, ColumnDefinition } from '../types';
import { InlineCellEditor } from './InlineCellEditor';
import { safeFormatCellValue } from '../lib/memory/memoryGuard';

export interface GridRowItemProps {
  row: GridRow;
  absoluteIndex: number;
  isSelected: boolean;
  isEven: boolean;
  activeCols: ColumnDefinition[];
  editingCellField: string | null;
  wrapText: boolean;
  onRowClick: (row: GridRow, e: React.MouseEvent) => void;
  onRowContextMenu: (row: GridRow, e: React.MouseEvent) => void;
  onStartEditing: (id: number | string, colName: string) => void;
  onSaveCell: (id: number | string, colName: string, newVal: any) => void;
  onCancelEditing: () => void;
}

export const GridRowItem = memo<GridRowItemProps>(
  ({
    row,
    absoluteIndex,
    isSelected,
    isEven,
    activeCols,
    editingCellField,
    wrapText,
    onRowClick,
    onRowContextMenu,
    onStartEditing,
    onSaveCell,
    onCancelEditing,
  }) => {
    return (
      <tr
        onClick={(e) => onRowClick(row, e)}
        onContextMenu={(e) => onRowContextMenu(row, e)}
        className={`cursor-pointer transition-colors ${
          isSelected
            ? 'bg-[#eff6ff] dark:bg-sky-600/30 text-[#1d4ed8] dark:text-white font-medium shadow-2xs border-y border-[#dbeafe] dark:border-sky-500/30'
            : isEven
            ? 'bg-[#fcfdfd] dark:bg-slate-900/40 hover:bg-[#f0f7ff] dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
            : 'bg-white dark:bg-slate-950/60 hover:bg-[#f0f7ff] dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
        }`}
        style={{ height: '28px' }}
      >
        {/* Row Index */}
        <td className="px-3 py-1 border-r border-slate-200 dark:border-slate-800/60 text-center text-slate-500 dark:text-slate-500 select-none font-medium text-[11px] h-7">
          {absoluteIndex + 1}
        </td>

        {/* Columns */}
        {activeCols.map((col) => {
          const val = row[col.name];
          const isEditing = editingCellField === col.name;
          const isDirty = row.dirtyFields?.[col.name];

          return (
            <td
              key={col.name}
              onDoubleClick={() => onStartEditing(row.id, col.name)}
              className={`px-3 py-1 border-r border-slate-200 dark:border-slate-800/60 relative text-[11px] h-7 ${
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
                  onSave={(newVal) => onSaveCell(row.id, col.name, newVal)}
                  onCancel={onCancelEditing}
                />
              ) : val === null || val === undefined ? (
                <span className="text-slate-400 dark:text-slate-500 italic select-none font-mono">
                  NULL
                </span>
              ) : typeof val === 'boolean' ? (
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  {val ? 'TRUE' : 'FALSE'}
                </span>
              ) : (
                <span
                  className={`text-slate-800 dark:text-slate-200 ${
                    wrapText
                      ? 'whitespace-pre-wrap break-words leading-relaxed select-text'
                      : 'truncate block'
                  }`}
                >
                  {safeFormatCellValue(val)}
                </span>
              )}
            </td>
          );
        })}
      </tr>
    );
  },
  (prev, next) => {
    // Return true if props are equal (skip re-render)
    if (prev.isSelected !== next.isSelected) return false;
    if (prev.isEven !== next.isEven) return false;
    if (prev.absoluteIndex !== next.absoluteIndex) return false;
    if (prev.wrapText !== next.wrapText) return false;
    if (prev.editingCellField !== next.editingCellField) return false;
    if (prev.activeCols !== next.activeCols) return false;
    if (prev.row === next.row) return true;

    // Check row dirty or field changes
    if (prev.row.isDirty !== next.row.isDirty) return false;
    if (prev.row.id !== next.row.id) return false;

    for (let i = 0; i < prev.activeCols.length; i++) {
      const colName = prev.activeCols[i].name;
      if (prev.row[colName] !== next.row[colName]) return false;
      if (prev.row.dirtyFields?.[colName] !== next.row.dirtyFields?.[colName]) return false;
    }

    return true;
  }
);
GridRowItem.displayName = 'GridRowItem';
