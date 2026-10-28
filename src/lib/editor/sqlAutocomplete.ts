import type { ConnectionProfile, RealTableSummary, TableSchemaInfo } from '../../types/index.ts';
import { TABLE_SCHEMAS } from '../../data/schemas.ts';
import { isInternalRowKey } from '../grid/columnOrdering.ts';

export interface SchemaCompletionItem {
  label: string;
  type: string;
  detail?: string;
  info?: string;
  boost?: number;
}

export interface SqlSchemaBuildResult {
  schema: Record<string, SchemaCompletionItem[]>;
  tableNames: string[];
  isRealConnection: boolean;
}

/**
 * Builds a dynamic SQL schema completion mapping scoped exclusively to the active database connection.
 * When connected to a real database (e.g. PostgreSQL/MySQL/RDS/Aurora), only tables and columns
 * from the live database are included. Mock tables (tuple, store, user_orders, etc.) are strictly excluded.
 */
export function buildSqlSchemaForConnection(
  conn: ConnectionProfile | undefined | null,
  liveTables: Record<string, RealTableSummary[]> | undefined | null,
  liveSchemas: Record<string, Record<string, TableSchemaInfo>> | undefined | null
): SqlSchemaBuildResult {
  const isDemo = Boolean(conn && (conn.id === 'demo' || conn.id.startsWith('mock')));

  if (isDemo) {
    // Only in offline / demo exploration mode: fall back to built-in demo schemas
    const schema: Record<string, SchemaCompletionItem[]> = {};
    Object.entries(TABLE_SCHEMAS).forEach(([tbl, info]) => {
      schema[tbl] = info.columns
        .filter((c) => !isInternalRowKey(c.name))
        .map((c) => ({
          label: c.name,
          type: c.isPrimaryKey ? 'keyword' : 'property',
          detail: `${c.type}${c.isPrimaryKey ? ' (PK)' : c.isForeignKey ? ' (FK)' : ''}`,
          info: c.comment || (c.defaultValue ? `Default: ${c.defaultValue}` : undefined),
          boost: c.isPrimaryKey ? 99 : 50,
        }));
    });

    return {
      schema,
      tableNames: Object.keys(schema),
      isRealConnection: false,
    };
  }

  // If no connection is active at all, return empty schema
  if (!conn) {
    return {
      schema: {},
      tableNames: [],
      isRealConnection: false,
    };
  }

  // Real Database Mode: ONLY use tables that actually exist in the live database!
  const connId = conn.id;
  const tables = (liveTables && liveTables[connId]) || [];
  const schemas = (liveSchemas && liveSchemas[connId]) || {};
  const schema: Record<string, SchemaCompletionItem[]> = {};

  for (const t of tables) {
    const tblName = t.name;
    if (!tblName || isInternalRowKey(tblName)) continue;

    const tableInfo = schemas[tblName];
    if (tableInfo && Array.isArray(tableInfo.columns) && tableInfo.columns.length > 0) {
      schema[tblName] = tableInfo.columns
        .filter((c) => !isInternalRowKey(c.name))
        .map((c) => ({
          label: c.name,
          type: c.isPrimaryKey ? 'keyword' : 'property',
          detail: `${c.type}${c.isPrimaryKey ? ' (PK)' : c.isForeignKey ? ' (FK)' : ''}`,
          info: c.comment || (c.defaultValue ? `Default: ${c.defaultValue}` : undefined),
          boost: c.isPrimaryKey ? 99 : 50,
        }));
    } else {
      // Table exists in the database catalog; column definitions may be fetched on demand
      schema[tblName] = [];
    }
  }

  return {
    schema,
    tableNames: Object.keys(schema),
    isRealConnection: true,
  };
}

/**
 * Resolves a table name or SQL alias (e.g. "FROM products p" -> "p" resolves to "products").
 */
export function getTableForAlias(
  docText: string,
  aliasOrName: string,
  schema: Record<string, any>
): string | null {
  if (schema[aliasOrName]) return aliasOrName;

  // Match: FROM [schema.]table [AS] alias  or  JOIN [schema.]table [AS] alias
  const regex = new RegExp(
    `(?:FROM|JOIN)\\s+(?:["\`]?([a-zA-Z0-9_]+)["\`]?\\.)?["\`]?([a-zA-Z0-9_]+)["\`]?\\s+(?:AS\\s+)?${aliasOrName}\\b`,
    'i'
  );
  const match = docText.match(regex);
  if (match) {
    const directTable = match[2];
    if (schema[directTable]) return directTable;
    if (match[1] && schema[`${match[1]}.${directTable}`]) return `${match[1]}.${directTable}`;
  }

  return null;
}

export interface CustomCompletionQueryContext {
  pos: number;
  textBefore: string;
  fullDoc: string;
}

/**
 * Custom autocomplete provider for SQL table and column completion:
 * 1. Dot navigation: e.g. "products." or "p." -> suggests columns of the resolved table.
 * 2. Clause navigation: e.g. "FROM " or "JOIN " -> suggests only tables belonging to the connection.
 */
export function getCustomSqlCompletions(
  context: CustomCompletionQueryContext,
  schema: Record<string, SchemaCompletionItem[]>,
  tableNames: string[]
): { from: number; options: any[]; validFor?: RegExp } | null {
  const { pos, textBefore, fullDoc } = context;

  // 1. Triggered on typing after a dot: e.g. products. or p. or orders.
  const dotMatch = textBefore.match(/([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z0-9_]*)$/);
  if (dotMatch) {
    const [_, tableOrAlias, prefix] = dotMatch;
    const actualTable = getTableForAlias(fullDoc, tableOrAlias, schema);

    if (actualTable && schema[actualTable] && schema[actualTable].length > 0) {
      return {
        from: pos - prefix.length,
        options: schema[actualTable],
        validFor: /^[a-zA-Z0-9_]*$/,
      };
    }
  }

  // 2. Triggered on FROM / JOIN / INTO / UPDATE / TABLE to suggest connection table names.
  // We inspect both current line and cross-line context before cursor.
  const lookbackText = fullDoc.slice(Math.max(0, pos - 120), pos);
  const fromJoinMatch = lookbackText.match(/(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+([a-zA-Z0-9_]*)$/i);
  if (fromJoinMatch) {
    const prefix = fromJoinMatch[1];
    const tableOptions = tableNames.map((tbl) => ({
      label: tbl,
      type: 'type',
      detail: 'table',
      boost: 90,
    }));
    return {
      from: pos - prefix.length,
      options: tableOptions,
    };
  }

  return null;
}
