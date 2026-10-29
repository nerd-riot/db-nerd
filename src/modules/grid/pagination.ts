import {
  escapeSqlStringLiteral,
  normalizeDatabaseEngine,
  quoteIdentifier,
  sanitizeFilterClause,
} from '../../lib/security/sqlSanitizer.ts';

export const MAX_GRID_PAGE_SIZE = 300;
export const DEFAULT_GRID_PAGE_SIZE = 300;
export const SUPPORTED_GRID_PAGE_SIZES = [50, 100, 200, 300] as const;

export interface PaginationMetadata {
  page: number;
  pageSize: number;
  offset: number;
  startRow: number;
  endRow: number;
  totalRows: number;
  totalPages: number;
  isEstimated: boolean;
  rangeLabel: string;
  canGoPrev: boolean;
  canGoNext: boolean;
}

/**
 * Computes TablePlus-compatible pagination numbers and display labels
 * (e.g., `1-300 of ~4,781,585 rows` or `301-600 of 4,781,585 rows`).
 */
export function calculatePaginationMeta(
  pageOrParams:
    | number
    | {
        page: number;
        pageSize: number;
        currentRowCount: number;
        totalCount: number | null;
        isEstimated: boolean;
      },
  pageSizeArg?: number,
  totalCountArg?: number | null,
  currentRowCountArg?: number,
  isEstimatedArg?: boolean
): PaginationMetadata {
  const params =
    typeof pageOrParams === 'object'
      ? pageOrParams
      : {
          page: pageOrParams,
          pageSize: pageSizeArg ?? DEFAULT_GRID_PAGE_SIZE,
          totalCount: totalCountArg ?? null,
          currentRowCount: currentRowCountArg ?? 0,
          isEstimated: isEstimatedArg ?? true,
        };

  const pageSize = Math.max(1, params.pageSize || DEFAULT_GRID_PAGE_SIZE);
  const page = Math.max(0, params.page || 0);
  const offset = page * pageSize;
  const currentRowCount = Math.max(0, params.currentRowCount || 0);

  const resolvedTotal =
    params.totalCount !== null && params.totalCount >= 0
      ? Math.max(params.totalCount, currentRowCount > 0 ? offset + currentRowCount : 0)
      : currentRowCount > 0
      ? offset + currentRowCount
      : 0;

  const totalPages = Math.max(1, Math.ceil(resolvedTotal / pageSize));
  const startRow = currentRowCount === 0 ? 0 : offset + 1;
  const endRow = offset + currentRowCount;
  const tilde = params.isEstimated && params.totalCount !== null ? '~' : '';

  const rangeLabel =
    currentRowCount > 0
      ? `${startRow.toLocaleString()}-${endRow.toLocaleString()} of ${tilde}${resolvedTotal.toLocaleString()} rows`
      : `0 of ${tilde}${resolvedTotal.toLocaleString()} rows`;

  return {
    page,
    pageSize,
    offset,
    startRow,
    endRow,
    totalRows: resolvedTotal,
    totalPages,
    isEstimated: params.isEstimated,
    rangeLabel,
    canGoPrev: page > 0,
    canGoNext: page < totalPages - 1 && currentRowCount >= pageSize,
  };
}

/**
 * Builds a safe, server-side paginated SELECT query (`LIMIT <pageSize> OFFSET <offset>`).
 */
export function buildPaginatedSelectSql(params: {
  tableName: string;
  engine?: string;
  page: number;
  pageSize: number;
  whereClause?: string;
  whereText?: string;
  orderByClause?: string;
  orderByText?: string;
}): string {
  const normEngine = normalizeDatabaseEngine(params.engine);
  if (normEngine === 'redis') {
    if (params.tableName && params.tableName !== '__all__' && params.tableName !== '*') {
      const sanitizedKey = params.tableName.replace(/"/g, '\\"');
      return `INSPECT_KEY "${sanitizedKey}"`;
    }
    return 'KEYS *';
  }

  const quotedTable = quoteIdentifier(params.tableName, normEngine);
  const pageSize = Math.max(1, Math.min(MAX_GRID_PAGE_SIZE, Math.floor(params.pageSize || DEFAULT_GRID_PAGE_SIZE)));
  const offset = Math.max(0, Math.floor(params.page || 0) * pageSize);

  const cleanWhere = sanitizeFilterClause(params.whereClause ?? params.whereText ?? '');
  const cleanOrder = sanitizeFilterClause(params.orderByClause ?? params.orderByText ?? '');

  const wherePart = cleanWhere ? ` WHERE ${cleanWhere}` : '';
  const orderPart = cleanOrder ? ` ORDER BY ${cleanOrder}` : '';

  return `SELECT * FROM ${quotedTable}${wherePart}${orderPart} LIMIT ${pageSize} OFFSET ${offset};`;
}

/**
 * Builds a safe `SELECT COUNT(*)` query for TablePlus exact count retrieval.
 */
export function buildExactCountSql(params: {
  tableName: string;
  engine?: string;
  whereClause?: string;
  whereText?: string;
}): string {
  const normEngine = normalizeDatabaseEngine(params.engine);
  if (normEngine === 'redis') {
    if (params.tableName && params.tableName !== '__all__' && params.tableName !== '*') {
      const sanitizedKey = params.tableName.replace(/"/g, '\\"');
      return `INSPECT_KEY "${sanitizedKey}"`;
    }
    return 'DBSIZE';
  }

  const quotedTable = quoteIdentifier(params.tableName, normEngine);
  const cleanWhere = sanitizeFilterClause(params.whereClause ?? params.whereText ?? '');
  const wherePart = cleanWhere ? ` WHERE ${cleanWhere}` : '';
  return `SELECT COUNT(*) AS total_count FROM ${quotedTable}${wherePart};`;
}

/**
 * Builds a fast catalog query to fetch estimated row counts without full table scans.
 */
export function buildEstimatedCountCatalogSql(tableName: string, engine?: string): string {
  const normEngine = normalizeDatabaseEngine(engine);
  const safeTable = escapeSqlStringLiteral(tableName);

  if (normEngine === 'postgres') {
    return `SELECT GREATEST(CASE WHEN c.reltuples > 0 THEN c.reltuples::bigint WHEN COALESCE(s.n_live_tup, 0) > 0 THEN s.n_live_tup ELSE 0 END, 0)::bigint AS estimated_rows FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid WHERE (n.nspname = 'public' OR n.nspname = current_schema()) AND c.relname = '${safeTable}' LIMIT 1;`;
  }
  if (normEngine === 'mysql') {
    return `SELECT COALESCE(TABLE_ROWS, 0) AS estimated_rows FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${safeTable}' LIMIT 1;`;
  }
  return '';
}

/**
 * Formats compact row/size badges for the Sidebar (e.g. `4.8M`, `12.4K`, `320`).
 */
export function formatCompactBadge(estimatedRows?: number, totalSize?: string): string {
  if (estimatedRows !== undefined && estimatedRows > 0) {
    if (estimatedRows >= 1_000_000) {
      return `${(estimatedRows / 1_000_000).toFixed(1)}M`;
    }
    if (estimatedRows >= 1_000) {
      return `${(estimatedRows / 1_000).toFixed(1)}K`;
    }
    return String(estimatedRows);
  }
  if (totalSize && totalSize !== '0 bytes' && totalSize !== '0 B') {
    return totalSize.replace(' bytes', ' B');
  }
  return '0';
}
