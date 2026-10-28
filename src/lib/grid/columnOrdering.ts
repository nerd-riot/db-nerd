import type { ColumnDefinition } from '../../types/index.ts';

/**
 * Internal client-side row tracking keys that must never be treated as data columns.
 */
export const INTERNAL_ROW_KEYS = new Set<string>([
  'isDirty',
  'dirtyFields',
  'rowState',
  'isNewRow',
  '_syntheticId',
]);

/**
 * Checks if a given field name is an internal client-side row key.
 */
export function isInternalRowKey(key: string | undefined | null): boolean {
  if (!key) return true;
  return INTERNAL_ROW_KEYS.has(key) || key.startsWith('_synthetic');
}

/**
 * Returns a numeric sort weight for a column name.
 * Lower weights float to the beginning, higher weights sink to the end.
 *
 * Convention:
 * - Primary Key / 'id' columns: -1000 (always first)
 * - Secondary ID identifiers (uuid, ulid): -500 (if no explicit PK)
 * - Business / normal columns: 0 (retain DDL / ordinal order)
 * - Created audit timestamps / authors: 500
 * - Updated audit timestamps / authors: 600
 * - Deleted audit timestamps / authors: 700
 */
export function getColumnSortWeight(colName: string, isPrimaryKey = false): number {
  if (isPrimaryKey) return -1000;
  const raw = String(colName || '').trim().toLowerCase();
  const clean = raw.replace(/[-_]/g, '');

  // 1. Primary surrogate / sequential ID
  if (raw === 'id' || clean === 'id') {
    return -1000;
  }

  // 2. Created timestamps and authors (500)
  if (
    raw === 'created_at' ||
    raw === 'createdat' ||
    raw === 'created_date' ||
    raw === 'createddate' ||
    raw === 'created_time' ||
    raw === 'createdtime' ||
    raw === 'created_by' ||
    raw === 'createdby' ||
    raw === 'created_on' ||
    raw === 'creation_time'
  ) {
    return 500;
  }

  // 3. Updated / modified timestamps and authors (600)
  if (
    raw === 'updated_at' ||
    raw === 'updatedat' ||
    raw === 'updated_date' ||
    raw === 'updateddate' ||
    raw === 'updated_time' ||
    raw === 'updatedtime' ||
    raw === 'updated_by' ||
    raw === 'updatedby' ||
    raw === 'updated_on' ||
    raw === 'modified_at' ||
    raw === 'modifiedat' ||
    raw === 'modified_by' ||
    raw === 'modifiedby' ||
    raw === 'modification_time'
  ) {
    return 600;
  }

  // 4. Deleted / archived / soft-delete timestamps and authors (700)
  if (
    raw === 'deleted_at' ||
    raw === 'deletedat' ||
    raw === 'deleted_date' ||
    raw === 'deleteddate' ||
    raw === 'deleted_time' ||
    raw === 'deletedtime' ||
    raw === 'deleted_by' ||
    raw === 'deletedby' ||
    raw === 'deleted_on'
  ) {
    return 700;
  }

  return 0;
}

/**
 * Sorts columns following standard database DDL conventions:
 * 1. Primary Key / 'id' columns first (weight < 0)
 * 2. General business columns in their natural DDL / ordinal position order (weight == 0)
 * 3. Audit lifecycle columns at the end: created_at (500) -> updated_at (600) -> deleted_at (700)
 *
 * Also strictly strips out any internal row state keys (e.g. _syntheticId, isDirty, dirtyFields, rowState, isNewRow).
 */
export function sortColumnsByDdlConvention<T extends { name: string; isPrimaryKey?: boolean }>(
  columns: T[],
  ddlOrderMap?: Map<string, number>
): T[] {
  if (!Array.isArray(columns) || columns.length === 0) return [];

  // 1. Strictly filter out internal row keys
  const validCols = columns.filter((c) => c && !isInternalRowKey(c.name));

  // 2. Stable sort by weight and DDL/original index
  return validCols
    .map((col, originalIndex) => ({
      col,
      originalIndex,
      ddlIndex: ddlOrderMap?.has(col.name) ? ddlOrderMap.get(col.name)! : originalIndex,
      weight: getColumnSortWeight(col.name, col.isPrimaryKey),
    }))
    .sort((a, b) => {
      if (a.weight !== b.weight) {
        return a.weight - b.weight;
      }
      // Within the same weight tier, preserve DDL order if known, else original list order
      return a.ddlIndex - b.ddlIndex || a.originalIndex - b.originalIndex;
    })
    .map((item) => item.col);
}

/**
 * Dynamically derives ColumnDefinition[] from a sample row object,
 * using known schema definitions when available, and sorting according to DDL convention.
 */
export function deriveColumnsFromRows(
  sample: Record<string, any> | undefined | null,
  schemaColMap?: Map<string, ColumnDefinition>,
  ddlOrderMap?: Map<string, number>
): ColumnDefinition[] {
  if (!sample || typeof sample !== 'object') return [];
  const keys = Object.keys(sample).filter((k) => !isInternalRowKey(k));

  const cols: ColumnDefinition[] = keys.map((key) => {
    const existing = schemaColMap?.get(key);
    if (existing) return existing;

    const val = sample[key];
    let inferredType = 'VARCHAR(255)';
    if (typeof val === 'number') {
      inferredType = Number.isInteger(val) ? 'INT8' : 'NUMERIC(12,2)';
    } else if (typeof val === 'boolean') {
      inferredType = 'BOOL';
    } else if (val !== null && typeof val === 'object') {
      inferredType = 'JSONB';
    } else if (key.endsWith('_at') || key.includes('date') || key === 'tstamp') {
      inferredType = 'TIMESTAMPTZ';
    }

    return {
      name: key,
      type: inferredType,
      isNullable: key !== 'id',
      defaultValue: key === 'id' ? 'AUTO' : undefined,
      isPrimaryKey: key === 'id' || key === 'version_id' || key === 'ulid',
      comment: '',
    };
  });

  return sortColumnsByDdlConvention(cols, ddlOrderMap);
}
