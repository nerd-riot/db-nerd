import type { GridRow, SqlQueryResultItem } from '../../types/index.ts';

/** Maximum rows kept in client state for a single grid page */
export const MAX_CLIENT_GRID_ROWS = 1_000;

/** Maximum rows kept in client state per SQL result tab */
export const MAX_CLIENT_SQL_RESULT_ROWS = 2_000;

/** Maximum SQL result sub-tabs kept per SQL editor tab */
export const MAX_SQL_RESULT_TABS = 10;

/** Maximum characters per string cell in client memory (32 KB) */
export const MAX_CLIENT_CELL_CHARS = 32_768;
export const MAX_CELL_STRING_LENGTH = MAX_CLIENT_CELL_CHARS;

/** Maximum open background session snapshots kept in memory */
export const MAX_IN_MEMORY_SESSIONS = 12;

/**
 * Truncates oversized string fields on a row object so large TEXT/JSONB blobs
 * never exhaust renderer heap memory.
 */
export function sanitizeRowCells<T extends Record<string, any>>(row: T): T {
  let mutated = false;
  const copy: Record<string, any> = { ...row };
  for (const key of Object.keys(copy)) {
    const val = copy[key];
    if (typeof val === 'string' && val.length > MAX_CLIENT_CELL_CHARS) {
      copy[key] = val.slice(0, MAX_CLIENT_CELL_CHARS) + '… [truncated]';
      mutated = true;
    }
  }
  return (mutated ? copy : row) as T;
}

/**
 * Fast O(N) clone of GridRow[] without expensive `JSON.parse(JSON.stringify(rows))`
 * serialization spikes. Clones row wrapper and `dirtyFields` map while sharing
 * immutable primitive cell values.
 */
export function cloneGridRows(rows: GridRow[], maxRows = MAX_CLIENT_GRID_ROWS): GridRow[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const limit = Math.min(rows.length, maxRows);
  const out = new Array<GridRow>(limit);
  for (let i = 0; i < limit; i++) {
    const r = sanitizeRowCells(rows[i]);
    out[i] = {
      ...r,
      dirtyFields: r.dirtyFields ? { ...r.dirtyFields } : {},
    };
  }
  return out;
}

/**
 * Bounds SQL query result rows to `MAX_CLIENT_SQL_RESULT_ROWS` and truncates huge strings.
 */
export function boundSqlResultRows(rows: any[], maxRows = MAX_CLIENT_SQL_RESULT_ROWS): any[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const limit = Math.min(rows.length, maxRows);
  const out = new Array(limit);
  for (let i = 0; i < limit; i++) {
    const item = rows[i];
    out[i] = item && typeof item === 'object' ? sanitizeRowCells(item) : item;
  }
  return out;
}

/**
 * Evicts oldest unpinned SQL result tabs when the total exceeds `MAX_SQL_RESULT_TABS`
 * and bounds each result's row array so running many queries never leaks client RAM.
 */
export function boundSqlQueryResultTabs(
  results: SqlQueryResultItem[],
  maxTabs = MAX_SQL_RESULT_TABS
): SqlQueryResultItem[] {
  if (!Array.isArray(results) || results.length === 0) return [];

  const bounded = results.map((item) => ({
    ...item,
    results: boundSqlResultRows(item.results),
  }));

  if (bounded.length <= maxTabs) {
    return bounded;
  }

  const pinned = bounded.filter((r) => r.isPinned);
  const unpinned = bounded.filter((r) => !r.isPinned);
  const allowedUnpinnedCount = Math.max(1, maxTabs - pinned.length);
  const keptUnpinned = unpinned.slice(-allowedUnpinnedCount);

  return [...pinned.slice(-maxTabs), ...keptUnpinned].slice(-maxTabs);
}

/**
 * Formats a raw byte count into human-readable TablePlus size string:
 * - 0: "0 bytes"
 * - < 1 KB: "X bytes"
 * - < 1 MB: "X KB" (rounded or 1 decimal if small)
 * - < 1 GB: "X MB" (e.g. "834 MB", "779 MB", "449 MB")
 * - >= 1 GB: "X.XX GB" (e.g. "1.04 GB", "5.94 GB", "6.72 GB")
 * - >= 1 TB: "X.XX TB"
 */
export function formatByteSize(bytes: number | string | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes === '' || bytes === '--') return '--';
  const n = typeof bytes === 'number' ? bytes : parseFloat(String(bytes));
  if (isNaN(n) || n <= 0) return '0 bytes';

  const KB = 1024;
  const MB = 1024 * 1024;
  const GB = 1024 * 1024 * 1024;
  const TB = 1024 * 1024 * 1024 * 1024;

  const trimZero = (v: string, unit: string) => {
    const trimmed = v.replace(/\.0+$/, '').replace(/(\.[0-9])0$/, '$1');
    return `${trimmed} ${unit}`;
  };

  if (n >= TB) {
    const val = n / TB;
    return val >= 10 ? trimZero(val.toFixed(1), 'TB') : trimZero(val.toFixed(2), 'TB');
  }
  if (n >= GB) {
    const val = n / GB;
    return val >= 10 ? trimZero(val.toFixed(1), 'GB') : trimZero(val.toFixed(2), 'GB');
  }
  if (n >= MB) {
    const val = n / MB;
    return val >= 10 ? `${Math.round(val)} MB` : trimZero(val.toFixed(1), 'MB');
  }
  if (n >= KB) {
    const val = n / KB;
    return `${Math.round(val)} KB`;
  }
  return `${Math.round(n)} bytes`;
}

/**
 * Parses size strings like "5.94 GB", "834 MB", "96 KB", "8192 bytes" back to raw bytes for accurate numeric sorting.
 */
export function parseSizeToBytes(sizeStr: string | number | null | undefined): number {
  if (typeof sizeStr === 'number') return isFinite(sizeStr) ? Math.round(sizeStr) : 0;
  if (!sizeStr || sizeStr === '--') return 0;

  const s = String(sizeStr).trim().toLowerCase();
  const num = parseFloat(s);
  if (isNaN(num)) return 0;

  if (s.endsWith('tb')) return Math.round(num * 1024 * 1024 * 1024 * 1024);
  if (s.endsWith('gb')) return Math.round(num * 1024 * 1024 * 1024);
  if (s.endsWith('mb')) return Math.round(num * 1024 * 1024);
  if (s.endsWith('kb') || s.endsWith('k') || s.endsWith('kib')) return Math.round(num * 1024);
  if (s.endsWith('bytes') || s.endsWith('b')) return Math.round(num);

  return Math.round(num);
}
