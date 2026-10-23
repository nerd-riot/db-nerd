import { ColumnDefinition, GridRow, TableSchemaInfo } from '../types';
import { TABLE_SCHEMAS } from '../data/schemas';

const INTERNAL_ROW_KEYS = new Set(['isDirty', 'dirtyFields', 'rowState']);

export function quoteIdentifier(name: string, engine: string = 'postgres'): string {
  const isMySql = engine === 'mysql' || engine === 'mariadb';
  const q = isMySql ? '`' : '"';
  return `${q}${name.split(q).join(q + q)}${q}`;
}

export function formatSqlValue(val: any, engine: string = 'postgres'): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return engine === 'postgres' ? `'${jsonStr}'::jsonb` : `'${jsonStr}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

export function inferTableSchema(
  tableName: string,
  sampleRows: GridRow[] = [],
  engine: string = 'postgres'
): TableSchemaInfo {
  if (TABLE_SCHEMAS[tableName]) {
    return TABLE_SCHEMAS[tableName];
  }

  const firstRow = sampleRows[0];
  const keys = firstRow
    ? Object.keys(firstRow).filter((k) => !INTERNAL_ROW_KEYS.has(k))
    : ['id', 'name', 'created_at'];

  const pkName =
    keys.find((k) => k.toLowerCase() === 'id') ||
    keys.find((k) => k.toLowerCase() === 'ulid') ||
    keys.find((k) => k.toLowerCase().endsWith('_id')) ||
    keys[0] ||
    'id';

  const columns: ColumnDefinition[] = keys.map((key) => {
    const sample = sampleRows.find((r) => r[key] !== null && r[key] !== undefined)?.[key];
    let colType = 'varchar(255)';
    if (typeof sample === 'number') {
      colType = Number.isInteger(sample) ? 'bigint' : 'numeric(12,2)';
    } else if (typeof sample === 'boolean') {
      colType = 'boolean';
    } else if (typeof sample === 'object' && sample !== null) {
      colType = 'jsonb';
    } else if (typeof sample === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sample)) {
      colType = 'timestamptz';
    }
    const isPk = key === pkName;
    const isFk = !isPk && key.toLowerCase().endsWith('_id');
    return {
      name: key,
      type: colType,
      isNullable: !isPk,
      defaultValue: isPk ? 'generated always as identity' : undefined,
      isPrimaryKey: isPk,
      isForeignKey: isFk,
      foreignTable: isFk ? `${key.slice(0, -3)}s` : undefined,
      foreignColumn: isFk ? 'id' : undefined,
    };
  });

  const colDefs = columns
    .map(
      (c) =>
        `    ${quoteIdentifier(c.name, engine)} ${c.type}${c.isPrimaryKey ? ' PRIMARY KEY' : ''}${
          c.isNullable ? '' : ' NOT NULL'
        }`
    )
    .join(',\n');

  return {
    tableName,
    schema: engine === 'mysql' ? 'database' : 'public',
    engine: engine === 'mysql' ? 'MySQL 8.0 (InnoDB)' : 'PostgreSQL 16 (Heap)',
    rowCount: `${sampleRows.length} rows`,
    totalSize: '32 KB (Data: 16 KB, Index: 16 KB)',
    columns,
    indexes: [
      {
        name: `${tableName}_pkey`,
        columns: [pkName],
        type: 'BTREE',
        isUnique: true,
        isPrimary: true,
        size: '16 KB',
      },
    ],
    foreignKeys: [],
    ddl: `CREATE TABLE ${quoteIdentifier(tableName, engine)} (\n${colDefs}\n);`,
  };
}

export function buildPendingTransactionSql(
  rows: GridRow[],
  selectedTable: string,
  engine: string = 'postgres'
): string {
  const schema = inferTableSchema(selectedTable, rows, engine);
  const pkCol = schema.columns.find((c) => c.isPrimaryKey)?.name || 'id';
  const tblQuoted = quoteIdentifier(selectedTable, engine);
  const pkQuoted = quoteIdentifier(pkCol, engine);

  const sqlStatements: string[] = [];

  rows.forEach((r) => {
    const pkVal = r[pkCol] !== undefined ? r[pkCol] : r.id;
    if (r.rowState === 'inserted') {
      const cols = Object.keys(r).filter((k) => !INTERNAL_ROW_KEYS.has(k) && r[k] !== undefined);
      if (cols.length > 0) {
        const colList = cols.map((c) => quoteIdentifier(c, engine)).join(', ');
        const valList = cols.map((c) => formatSqlValue(r[c], engine)).join(', ');
        sqlStatements.push(`INSERT INTO ${tblQuoted} (${colList}) VALUES (${valList});`);
      }
    } else if (r.rowState === 'deleted') {
      sqlStatements.push(`DELETE FROM ${tblQuoted} WHERE ${pkQuoted} = ${formatSqlValue(pkVal, engine)};`);
    } else if (r.dirtyFields && Object.keys(r.dirtyFields).length > 0) {
      const setClauses = Object.keys(r.dirtyFields).map((field) => {
        const val = (r as any)[field];
        return `${quoteIdentifier(field, engine)} = ${formatSqlValue(val, engine)}`;
      });
      sqlStatements.push(
        `UPDATE ${tblQuoted} SET ${setClauses.join(', ')} WHERE ${pkQuoted} = ${formatSqlValue(pkVal, engine)};`
      );
    }
  });

  if (sqlStatements.length === 0) {
    return '-- No pending changes in active transaction';
  }

  return `BEGIN TRANSACTION;\n\n${sqlStatements.join('\n')}\n\nCOMMIT;`;
}

/**
 * Evaluates simple SQL WHERE & ORDER BY clauses against in-memory rows.
 */
export function filterAndSortGridRows(
  rows: GridRow[],
  whereClause: string,
  orderByClause: string
): GridRow[] {
  let result = [...rows];

  const cleanWhere = whereClause.trim().replace(/^WHERE\s+/i, '');
  if (cleanWhere) {
    const conditions = cleanWhere.split(/\s+AND\s+/i);
    result = result.filter((row) =>
      conditions.every((cond) => {
        const trimmed = cond.trim();
        if (!trimmed) return true;

        const isNullMatch = trimmed.match(/^([a-zA-Z0-9_."`]+)\s+IS\s+(NOT\s+)?NULL$/i);
        if (isNullMatch) {
          const col = isNullMatch[1].replace(/["`]/g, '');
          const isNot = Boolean(isNullMatch[2]);
          const val = row[col];
          return isNot ? val !== null && val !== undefined : val === null || val === undefined;
        }

        const opMatch = trimmed.match(
          /^([a-zA-Z0-9_."`]+)\s*(=|!=|<>|>=|<=|>|<|ILIKE|LIKE)\s*(.+)$/i
        );
        if (!opMatch) {
          return Object.entries(row).some(
            ([k, v]) =>
              !INTERNAL_ROW_KEYS.has(k) &&
              String(v ?? '')
                .toLowerCase()
                .includes(trimmed.toLowerCase())
          );
        }

        const col = opMatch[1].replace(/["`]/g, '');
        const op = opMatch[2].toUpperCase();
        const rawTarget = opMatch[3].trim().replace(/^['"]|['"]$/g, '');
        const rowVal = row[col];
        if (rowVal === undefined) return true;

        const numRow = Number(rowVal);
        const numTarget = Number(rawTarget);
        const bothNumbers = !Number.isNaN(numRow) && !Number.isNaN(numTarget) && rawTarget !== '';

        switch (op) {
          case '=':
            return bothNumbers
              ? numRow === numTarget
              : String(rowVal).toLowerCase() === rawTarget.toLowerCase();
          case '!=':
          case '<>':
            return bothNumbers
              ? numRow !== numTarget
              : String(rowVal).toLowerCase() !== rawTarget.toLowerCase();
          case '>':
            return bothNumbers ? numRow > numTarget : String(rowVal) > rawTarget;
          case '<':
            return bothNumbers ? numRow < numTarget : String(rowVal) < rawTarget;
          case '>=':
            return bothNumbers ? numRow >= numTarget : String(rowVal) >= rawTarget;
          case '<=':
            return bothNumbers ? numRow <= numTarget : String(rowVal) <= rawTarget;
          case 'LIKE':
          case 'ILIKE': {
            const regexStr =
              '^' +
              rawTarget
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                .replace(/%/g, '.*')
                .replace(/_/g, '.') +
              '$';
            return new RegExp(regexStr, 'i').test(String(rowVal ?? ''));
          }
          default:
            return true;
        }
      })
    );
  }

  const cleanOrder = orderByClause.trim().replace(/^ORDER\s+BY\s+/i, '');
  if (cleanOrder) {
    const parts = cleanOrder.split(',')[0].trim().split(/\s+/);
    const col = parts[0]?.replace(/["`]/g, '');
    const dir = (parts[1] || 'ASC').toUpperCase() === 'DESC' ? -1 : 1;
    if (col) {
      result.sort((a, b) => {
        const va = a[col];
        const vb = b[col];
        if (va === vb) return 0;
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        if (typeof va === 'number' && typeof vb === 'number') {
          return (va - vb) * dir;
        }
        return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
      });
    }
  }

  return result;
}
