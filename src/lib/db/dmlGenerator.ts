import type { GridRow } from '../../types/index.ts';
import { normalizeDatabaseEngine, quoteIdentifier } from '../security/sqlSanitizer.ts';

const INTERNAL_ROW_KEYS = new Set(['isDirty', 'dirtyFields', 'rowState', 'isNewRow', '_syntheticId']);

export interface TruncateTableOptions {
  restartIdentity?: boolean;
  cascade?: boolean;
  ignoreFk?: boolean;
}

export interface DropTableOptions {
  cascade?: boolean;
  ignoreFk?: boolean;
}

/**
 * Builds safe TRUNCATE TABLE statement with engine-specific options:
 * - PostgreSQL: RESTART IDENTITY / CASCADE
 * - MySQL: SET FOREIGN_KEY_CHECKS = 0
 * - SQLite: resets sqlite_sequence
 */
export function buildTruncateTableSql(
  tableName: string,
  engine?: string,
  schema?: string,
  options?: TruncateTableOptions
): string {
  const norm = normalizeDatabaseEngine(engine);
  const qualifiedTable =
    norm === 'postgres' && schema && !tableName.includes('.')
      ? `${schema}.${tableName}`
      : tableName;
  const quotedTable = quoteIdentifier(qualifiedTable, engine);

  if (norm === 'postgres') {
    let sql = `TRUNCATE TABLE ${quotedTable}`;
    if (options?.restartIdentity) {
      sql += ' RESTART IDENTITY';
    }
    if (options?.cascade) {
      sql += ' CASCADE';
    }
    return `${sql};`;
  }

  if (norm === 'mysql') {
    if (options?.ignoreFk || options?.cascade) {
      return `SET FOREIGN_KEY_CHECKS = 0; TRUNCATE TABLE ${quotedTable}; SET FOREIGN_KEY_CHECKS = 1;`;
    }
    return `TRUNCATE TABLE ${quotedTable};`;
  }

  // SQLite / fallback
  if (options?.restartIdentity) {
    return `DELETE FROM ${quotedTable}; DELETE FROM sqlite_sequence WHERE name = '${tableName}';`;
  }
  return `DELETE FROM ${quotedTable};`;
}

/**
 * Builds safe DROP TABLE statement with engine-specific options:
 * - PostgreSQL: DROP TABLE IF EXISTS ... CASCADE
 * - MySQL: SET FOREIGN_KEY_CHECKS = 0
 */
export function buildDropTableSql(
  tableName: string,
  engine?: string,
  schema?: string,
  options?: DropTableOptions
): string {
  const norm = normalizeDatabaseEngine(engine);
  const qualifiedTable =
    norm === 'postgres' && schema && !tableName.includes('.')
      ? `${schema}.${tableName}`
      : tableName;
  const quotedTable = quoteIdentifier(qualifiedTable, engine);

  if (norm === 'postgres') {
    let sql = `DROP TABLE IF EXISTS ${quotedTable}`;
    if (options?.cascade) {
      sql += ' CASCADE';
    }
    return `${sql};`;
  }

  if (norm === 'mysql') {
    if (options?.ignoreFk || options?.cascade) {
      return `SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS ${quotedTable}; SET FOREIGN_KEY_CHECKS = 1;`;
    }
    return `DROP TABLE IF EXISTS ${quotedTable};`;
  }

  return `DROP TABLE IF EXISTS ${quotedTable};`;
}

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
 * Prioritizes explicitly known primaryKeyCol, and ignores synthetic IDs.
 */
export function resolveRowPrimaryKey(
  row: GridRow,
  primaryKeyCol?: string
): { col: string; val: any } {
  // 1. Explicit primary key column passed from database catalog
  if (primaryKeyCol && primaryKeyCol in row && (row as any)[primaryKeyCol] !== undefined) {
    return { col: primaryKeyCol, val: (row as any)[primaryKeyCol] };
  }

  // 2. If row has synthetic ID (generated for row rendering when DB table has no 'id' column)
  const isSynthetic = (row as any)._syntheticId === true;

  // 3. Search common primary key candidates
  const candidates = isSynthetic
    ? ['version_id', 'ulid', 'sku', 'code', 'uuid']
    : ['id', 'version_id', 'ulid', 'sku', 'code', 'uuid'];

  for (const candidate of candidates) {
    if (candidate in row && (row as any)[candidate] !== undefined) {
      return { col: candidate, val: (row as any)[candidate] };
    }
  }

  const excluded = new Set([...INTERNAL_ROW_KEYS, '_syntheticId']);
  if (isSynthetic) excluded.add('id');

  const firstKey = Object.keys(row).find((k) => !excluded.has(k)) || (isSynthetic ? Object.keys(row)[0] : 'id');
  return { col: firstKey, val: (row as any)[firstKey] };
}

/**
 * Generates a transactional SQL script (`BEGIN TRANSACTION; ... COMMIT;`)
 * for all pending row insertions, updates, and deletions in the active grid.
 */
export function buildPendingTransactionSql(
  rows: GridRow[],
  tableName: string,
  engine?: string,
  primaryKeyCol?: string,
  schema?: string
): string {
  if (!tableName || !Array.isArray(rows) || rows.length === 0) {
    return '-- No pending changes in active transaction';
  }

  const norm = normalizeDatabaseEngine(engine);

  if (norm === 'redis') {
    const redisCmds: string[] = [];
    const cleanTable = tableName.replace(/"/g, '\\"');
    for (const r of rows) {
      if (r.rowState === 'inserted') {
        if ('field' in r && 'value' in r) {
          redisCmds.push(`HSET "${cleanTable}" "${String(r.field).replace(/"/g, '\\"')}" "${String(r.value ?? '').replace(/"/g, '\\"')}"`);
        } else if ('member' in r && 'score' in r) {
          redisCmds.push(`ZADD "${cleanTable}" ${Number(r.score) || 0} "${String(r.member).replace(/"/g, '\\"')}"`);
        } else if ('member' in r) {
          redisCmds.push(`SADD "${cleanTable}" "${String(r.member).replace(/"/g, '\\"')}"`);
        } else if ('value' in r) {
          redisCmds.push(`RPUSH "${cleanTable}" "${String(r.value ?? '').replace(/"/g, '\\"')}"`);
        }
      } else if (r.rowState === 'deleted') {
        if ('field' in r) {
          redisCmds.push(`HDEL "${cleanTable}" "${String(r.field).replace(/"/g, '\\"')}"`);
        } else if ('member' in r) {
          if ('score' in r) {
            redisCmds.push(`ZREM "${cleanTable}" "${String(r.member).replace(/"/g, '\\"')}"`);
          } else {
            redisCmds.push(`SREM "${cleanTable}" "${String(r.member).replace(/"/g, '\\"')}"`);
          }
        } else if ('value' in r) {
          redisCmds.push(`LREM "${cleanTable}" 1 "${String(r.value ?? '').replace(/"/g, '\\"')}"`);
        } else {
          redisCmds.push(`DEL "${cleanTable}"`);
        }
      } else if (r.dirtyFields && Object.keys(r.dirtyFields).length > 0) {
        if ('field' in r && 'value' in r) {
          redisCmds.push(`HSET "${cleanTable}" "${String(r.field).replace(/"/g, '\\"')}" "${String(r.value ?? '').replace(/"/g, '\\"')}"`);
        } else if ('member' in r && 'score' in r) {
          redisCmds.push(`ZADD "${cleanTable}" ${Number(r.score) || 0} "${String(r.member).replace(/"/g, '\\"')}"`);
        } else if ('value' in r && 'index' in r) {
          const idx = Math.max(0, Number(r.index) - 1);
          redisCmds.push(`LSET "${cleanTable}" ${idx} "${String(r.value ?? '').replace(/"/g, '\\"')}"`);
        } else if ('value' in r) {
          redisCmds.push(`SET "${cleanTable}" "${String(r.value ?? '').replace(/"/g, '\\"')}"`);
        }
      }
    }
    if (redisCmds.length === 0) {
      return '-- No pending changes in active transaction';
    }
    return redisCmds.join('\n');
  }

  const qualifiedTable =
    norm === 'postgres' && schema && !tableName.includes('.')
      ? `${schema}.${tableName}`
      : tableName;
  const quotedTable = quoteIdentifier(qualifiedTable, engine);
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
      const pk = resolveRowPrimaryKey(r, primaryKeyCol);
      const quotedPk = quoteIdentifier(pk.col, engine);
      sqlStatements.push(
        `DELETE FROM ${quotedTable} WHERE ${quotedPk} = ${formatSqlLiteralValue(pk.val, engine)};`
      );
    } else if (r.dirtyFields && Object.keys(r.dirtyFields).length > 0) {
      const pk = resolveRowPrimaryKey(r, primaryKeyCol);
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

  const isMysql = norm === 'mysql';
  const startTx = isMysql ? 'START TRANSACTION;' : 'BEGIN TRANSACTION;';
  return `${startTx}\n\n${sqlStatements.join('\n')}\n\nCOMMIT;`;
}
