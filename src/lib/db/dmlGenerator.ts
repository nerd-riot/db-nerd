import type { GridRow } from '../../types/index.ts';
import { normalizeDatabaseEngine, quoteIdentifier } from '../security/sqlSanitizer.ts';

const INTERNAL_ROW_KEYS = new Set(['isDirty', 'dirtyFields', 'rowState', 'isNewRow']);

/**
 * Formats a JS value into a safe SQL literal for INSERT/UPDATE/DELETE statements.
 */
export function formatSqlLiteralValue(val: unknown, engine?: string): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';

  const isMysql = normalizeDatabaseEngine(engine) === 'mysql';
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val).replace(/\0/g, '').replace(/'/g, "''");
    return isMysql ? `'${jsonStr}'` : `'${jsonStr}'::jsonb`;
  }

  const str = String(val).replace(/\0/g, '').replace(/'/g, "''");
  return `'${str}'`;
}

/**
 * Resolves the primary key column and value for a GridRow.
 */
export function resolveRowPrimaryKey(row: GridRow): { col: string; val: any } {
  for (const candidate of ['id', 'version_id', 'ulid', 'sku', 'code', 'uuid']) {
    if (candidate in row && (row as any)[candidate] !== undefined) {
      return { col: candidate, val: (row as any)[candidate] };
    }
  }
  const firstKey = Object.keys(row).find((k) => !INTERNAL_ROW_KEYS.has(k)) || 'id';
  return { col: firstKey, val: (row as any)[firstKey] };
}

/**
 * Generates a transactional SQL script (`BEGIN TRANSACTION; ... COMMIT;`)
 * for all pending row insertions, updates, and deletions in the active grid.
 */
export function buildPendingTransactionSql(
  rows: GridRow[],
  tableName: string,
  engine?: string
): string {
  if (!tableName || !Array.isArray(rows) || rows.length === 0) {
    return '-- No pending changes in active transaction';
  }

  const quotedTable = quoteIdentifier(tableName, engine);
  const sqlStatements: string[] = [];

  for (const r of rows) {
    if (r.rowState === 'inserted') {
      const dataKeys = Object.keys(r).filter(
        (k) => !INTERNAL_ROW_KEYS.has(k) && (r as any)[k] !== undefined
      );
      if (dataKeys.length === 0) continue;
      const colsList = dataKeys.map((k) => quoteIdentifier(k, engine)).join(', ');
      const valsList = dataKeys.map((k) => formatSqlLiteralValue((r as any)[k], engine)).join(', ');
      sqlStatements.push(`INSERT INTO ${quotedTable} (${colsList}) VALUES (${valsList});`);
    } else if (r.rowState === 'deleted') {
      const pk = resolveRowPrimaryKey(r);
      const quotedPk = quoteIdentifier(pk.col, engine);
      sqlStatements.push(
        `DELETE FROM ${quotedTable} WHERE ${quotedPk} = ${formatSqlLiteralValue(pk.val, engine)};`
      );
    } else if (r.dirtyFields && Object.keys(r.dirtyFields).length > 0) {
      const pk = resolveRowPrimaryKey(r);
      const quotedPk = quoteIdentifier(pk.col, engine);
      const setClauses = Object.keys(r.dirtyFields).map((field) => {
        const val = (r as any)[field];
        return `${quoteIdentifier(field, engine)} = ${formatSqlLiteralValue(val, engine)}`;
      });
      sqlStatements.push(
        `UPDATE ${quotedTable} SET ${setClauses.join(', ')} WHERE ${quotedPk} = ${formatSqlLiteralValue(pk.val, engine)};`
      );
    }
  }

  if (sqlStatements.length === 0) {
    return '-- No pending changes in active transaction';
  }

  return `BEGIN TRANSACTION;\n\n${sqlStatements.join('\n')}\n\nCOMMIT;`;
}
