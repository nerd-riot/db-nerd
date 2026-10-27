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
