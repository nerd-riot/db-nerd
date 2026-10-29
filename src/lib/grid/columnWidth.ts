import { useState, useCallback, useRef, useEffect } from 'react';
import { safeFormatCellValue } from '../memory/memoryGuard.ts';

let offscreenCanvas: HTMLCanvasElement | null = null;
let offscreenCtx: CanvasRenderingContext2D | null = null;

/**
 * Measures the exact pixel width of text rendered in a specific font.
 * Uses an offscreen HTML5 Canvas context for microsecond performance and 100% accuracy.
 * Falls back to character-width approximation in test/SSR environments without DOM Canvas.
 */
export function measureTextWidth(
  text: string,
  font: string = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
): number {
  if (!text) return 0;
  if (typeof document === 'undefined') {
    return text.length * 7.5;
  }

  try {
    if (!offscreenCanvas) {
      offscreenCanvas = document.createElement('canvas');
      offscreenCtx = offscreenCanvas.getContext('2d');
    }
    if (offscreenCtx) {
      offscreenCtx.font = font;
      return offscreenCtx.measureText(text).width;
    }
  } catch {
    // Canvas context acquisition failed, fallback to approximation
  }

  return text.length * 7.5;
}

export interface AutoFitOptions {
  minWidth?: number;
  maxWidth?: number;
  headerFont?: string;
  cellFont?: string;
  sampleRowCount?: number;
}

const DEFAULT_MIN_WIDTH = 70;
const DEFAULT_MAX_WIDTH = 650;
const HEADER_FONT = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const CELL_FONT = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

/**
 * Calculates the optimal column width (in pixels) to fit all visible/sample content,
 * exactly like Excel and TablePlus double-click column separator behavior.
 */
export function calculateAutoFitColumnWidth(
  colName: string,
  sampleRows: any[] = [],
  isPrimaryKey = false,
  options: AutoFitOptions = {}
): number {
  const minWidth = options.minWidth ?? DEFAULT_MIN_WIDTH;
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
  const headerFont = options.headerFont ?? HEADER_FONT;
  const cellFont = options.cellFont ?? CELL_FONT;
  const sampleLimit = options.sampleRowCount ?? 120;

  // 1. Measure header: Icon (16px) + margin (6px) + Title + Sort indicator (16px) + PK (14px) + padding (24px)
  const titleWidth = measureTextWidth(colName, headerFont);
  const headerExtra = 16 + 6 + 16 + (isPrimaryKey ? 16 : 0) + 28;
  const headerNeededWidth = titleWidth + headerExtra;

  // 2. Measure sample row cell values
  let maxCellNeededWidth = 0;
  const rowsToScan = sampleRows.slice(0, sampleLimit);

  for (let i = 0; i < rowsToScan.length; i++) {
    const row = rowsToScan[i];
    if (!row) continue;
    const val = row[colName];

    let displayStr = '';
    if (val === null || val === undefined) {
      displayStr = 'NULL';
    } else if (typeof val === 'boolean') {
      displayStr = val ? 'TRUE' : 'FALSE';
    } else if (typeof val === 'object') {
      displayStr = safeFormatCellValue(val);
    } else {
      displayStr = String(val);
    }

    // Limit scanned string length for performance
    const truncatedStr = displayStr.length > 200 ? displayStr.slice(0, 200) : displayStr;
    const cellWidth = measureTextWidth(truncatedStr, cellFont);
    if (cellWidth > maxCellNeededWidth) {
      maxCellNeededWidth = cellWidth;
    }
  }

  // Cell padding (px-2.5 = 20px) + margin for dirty indicator / ellipsis buffer (16px)
  const cellNeededWidth = maxCellNeededWidth > 0 ? maxCellNeededWidth + 36 : 0;

  // 3. Optimal width is the maximum of header and cell width, clamped to [minWidth, maxWidth]
  const optimal = Math.max(headerNeededWidth, cellNeededWidth);
  return Math.min(maxWidth, Math.max(minWidth, Math.ceil(optimal)));
}

/**
 * Computes reasonable initial column widths for a list of columns
 * based on column names, data types, and sample rows.
 */
export function estimateInitialColumnWidths(
  columns: { name: string; type?: string; isPrimaryKey?: boolean }[] | string[],
  sampleRows: any[] = []
): Record<string, number> {
  const result: Record<string, number> = {};

  const normalizedCols = columns.map((col) =>
    typeof col === 'string'
      ? { name: col, type: undefined, isPrimaryKey: col.toLowerCase() === 'id' }
      : col
  );

  for (const col of normalizedCols) {
    const nameLower = col.name.toLowerCase();
    const typeLower = (col.type || '').toLowerCase();

    // Check specific known patterns for fast good initial sizing
    if (nameLower === 'id' && !col.isPrimaryKey) {
      result[col.name] = 80;
    } else if (col.isPrimaryKey || nameLower.includes('uuid') || nameLower.includes('guid') || typeLower.includes('uuid') || typeLower.includes('guid')) {
      result[col.name] = 240;
    } else if (nameLower.includes('email') || typeLower.includes('email') || nameLower.includes('url')) {
      result[col.name] = 220;
    } else if (nameLower.includes('created') || nameLower.includes('updated') || typeLower.includes('time') || typeLower.includes('date')) {
      result[col.name] = 190;
    } else if (typeLower.includes('bool') || nameLower.startsWith('is_') || nameLower.startsWith('has_')) {
      result[col.name] = 90;
    } else if (typeLower.includes('int') || typeLower.includes('float') || typeLower.includes('numeric')) {
      result[col.name] = 110;
    } else if (sampleRows.length > 0) {
      // Auto-fit sample if rows available
      result[col.name] = calculateAutoFitColumnWidth(col.name, sampleRows, col.isPrimaryKey, { maxWidth: 320 });
    } else {
      const estimated = Math.max(120, col.name.length * 9 + 50);
      result[col.name] = Math.min(260, estimated);
    }
  }

  return result;
}

export interface UseColumnResizerProps {
  columns: string[];
  sampleRows?: any[];
  pkColumns?: string[];
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
}

/**
 * Reusable hook providing TablePlus & Excel-grade column resizing:
 * - Interactive mouse dragging with global cursor capture
 * - Double-click separator auto-fit to content
 * - Auto-fit all columns helper
 */
export function useColumnResizer({
  columns,
  sampleRows = [],
  pkColumns = [],
  defaultWidth = 150,
  minWidth = DEFAULT_MIN_WIDTH,
  maxWidth = DEFAULT_MAX_WIDTH,
}: UseColumnResizerProps) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizingCol, setResizingCol] = useState<string | null>(null);

  const startDragRef = useRef<{
    colName: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  // Initialize missing column widths when columns change
  useEffect(() => {
    if (columns.length === 0) return;
    setColumnWidths((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const col of columns) {
        if (next[col] === undefined) {
          const isPk = pkColumns.includes(col) || col.toLowerCase() === 'id';
          next[col] = calculateAutoFitColumnWidth(col, sampleRows, isPk, {
            minWidth,
            maxWidth: 320,
          });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [columns, sampleRows, pkColumns, minWidth]);

  const handleResizeStart = useCallback(
    (colName: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const currentWidth = columnWidths[colName] || defaultWidth;
      startDragRef.current = {
        colName,
        startX: e.clientX,
        startWidth: currentWidth,
      };
      setResizingCol(colName);

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!startDragRef.current) return;
        const delta = moveEvent.clientX - startDragRef.current.startX;
        const newWidth = Math.min(maxWidth, Math.max(minWidth, Math.round(startDragRef.current.startWidth + delta)));
        setColumnWidths((prev) => ({
          ...prev,
          [startDragRef.current!.colName]: newWidth,
        }));
      };

      const handleMouseUp = () => {
        startDragRef.current = null;
        setResizingCol(null);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [columnWidths, defaultWidth, minWidth, maxWidth]
  );

  const handleAutoFitColumn = useCallback(
    (colName: string) => {
      const isPk = pkColumns.includes(colName) || colName.toLowerCase() === 'id';
      const optimalWidth = calculateAutoFitColumnWidth(colName, sampleRows, isPk, {
        minWidth,
        maxWidth,
      });
      setColumnWidths((prev) => ({
        ...prev,
        [colName]: optimalWidth,
      }));
    },
    [sampleRows, pkColumns, minWidth, maxWidth]
  );

  const handleAutoFitAll = useCallback(() => {
    const nextWidths: Record<string, number> = {};
    for (const col of columns) {
      const isPk = pkColumns.includes(col) || col.toLowerCase() === 'id';
      nextWidths[col] = calculateAutoFitColumnWidth(col, sampleRows, isPk, {
        minWidth,
        maxWidth,
      });
    }
    setColumnWidths(nextWidths);
  }, [columns, sampleRows, pkColumns, minWidth, maxWidth]);

  const getColumnWidth = useCallback(
    (colName: string) => columnWidths[colName] || defaultWidth,
    [columnWidths, defaultWidth]
  );

  return {
    columnWidths,
    setColumnWidths,
    resizingCol,
    handleResizeStart,
    handleAutoFitColumn,
    handleAutoFitAll,
    getColumnWidth,
  };
}
