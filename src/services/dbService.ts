import { invoke } from '@tauri-apps/api/core';
import type {
  ConnectionProfile,
  FunctionItem,
  TableSchemaInfo,
  ColumnDefinition,
  TableIndexDefinition,
  TableForeignKeyDefinition,
} from '../types/index.ts';
import { escapeSqlStringLiteral, normalizeDatabaseEngine } from '../lib/security/sqlSanitizer.ts';
import { sortColumnsByDdlConvention } from '../lib/grid/columnOrdering.ts';

export interface DbConfigPayload {
  engine: string;
  host: string;
  port: number;
  database: string;
  username?: string;
  password?: string;
  use_ssh?: boolean;
  ssh_host?: string;
  ssh_user?: string;
  ssh_port?: number;
  ssh_password?: string;
  use_ssh_key?: boolean;
  ssh_key_path?: string;
  ssh_passphrase?: string;
  snowflake_account?: string;
  snowflake_warehouse?: string;
  snowflake_schema?: string;
  snowflake_role?: string;
  snowflake_auth_method?: string;
  snowflake_private_key?: string;
  snowflake_passphrase?: string;
}

export interface RealQueryResult {
  success: boolean;
  columns: string[];
  rows: any[];
  duration_ms: number;
  rows_affected: number;
  error?: string;
}

export interface RealTestResult {
  success: boolean;
  message: string;
  latency_ms: number;
  version?: string;
}

export interface RealTableSummary {
  name: string;
  count: string;
  schema?: string;
  database?: string;
  kind?: string;
  owner?: string;
  estimated_rows?: number;
  total_size?: string;
  data_size?: string;
  index_size?: string;
  total_bytes?: number;
  data_bytes?: number;
  index_bytes?: number;
  comment?: string;
}

export function normalizeSnowflakeAccount(raw?: string): string {
  if (!raw) return '';
  let s = raw.trim();
  s = s.replace(/^https?:\/\//i, '');
  s = s.split('/')[0].split('?')[0];
  s = s.split(':')[0];
  s = s.replace(/\.snowflakecomputing\.com$/i, '');
  return s.trim();
}

export const profileToConfig = (profile: ConnectionProfile): DbConfigPayload => {
  const normalizedEngine = normalizeDatabaseEngine(profile.engine);
  // If user has default placeholder password and host is localhost without SSH, resolve to docker dev credentials
  let password = profile.password;
  const isLocalDocker = !profile.useSsh && (profile.host === 'localhost' || profile.host === '127.0.0.1');
  if (!password || (password === '••••••••••••' && isLocalDocker)) {
    if (normalizedEngine === 'postgres' || normalizedEngine === 'mysql') {
      password = 'dev_password';
    } else {
      password = '';
    }
  }

  let username = profile.username;
  if (!username && normalizedEngine !== 'snowflake') {
    username = normalizedEngine === 'postgres' ? 'dev_user' : normalizedEngine === 'mysql' ? 'dev_user' : 'default';
  }

  const rawSnowflakeAccount = profile.snowflakeAccount || profile.accountIdentifier || (normalizedEngine === 'snowflake' ? profile.host : '');

  return {
    engine: normalizedEngine,
    host: profile.host === '127.0.0.1' ? 'localhost' : (profile.host || 'localhost'),
    port: Number(profile.port) || (normalizedEngine === 'mysql' ? 3306 : normalizedEngine === 'redis' ? 6379 : normalizedEngine === 'snowflake' ? 443 : 5432),
    database: profile.database || (normalizedEngine === 'postgres' ? 'postgres' : (normalizedEngine === 'mysql' || normalizedEngine === 'snowflake') ? '' : '0'),
    username,
    password,
    use_ssh: profile.useSsh,
    ssh_host: profile.sshHost,
    ssh_user: profile.sshUser,
    ssh_port: profile.sshPort,
    ssh_password: profile.sshPassword,
    use_ssh_key: profile.useSshKey,
    ssh_key_path: profile.sshKeyPath,
    ssh_passphrase: profile.sshPassphrase,
    snowflake_account: normalizeSnowflakeAccount(rawSnowflakeAccount),
    snowflake_warehouse: profile.snowflakeWarehouse || profile.warehouse,
    snowflake_schema: profile.snowflakeSchema,
    snowflake_role: profile.snowflakeRole,
    snowflake_auth_method: profile.snowflakeAuthMethod || 'externalbrowser',
    snowflake_private_key: profile.snowflakePrivateKey,
    snowflake_passphrase: profile.snowflakePassphrase,
  };
};

export async function testRealConnection(profile: ConnectionProfile): Promise<RealTestResult> {
  const isTauri = typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
  
  if (isTauri) {
    try {
      const config = profileToConfig(profile);
      const res = await invoke<RealTestResult>('test_connection', { config });
      return res;
    } catch (err: any) {
      return {
        success: false,
        message: String(err?.message || err),
        latency_ms: 0,
      };
    }
  }

  // Web browser fallback simulation:
  // Non-localhost or dummy remote hosts cannot be reached directly without backend proxy
  const host = (profile.host || '').toLowerCase().trim();
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  
  await new Promise((r) => setTimeout(r, 600));

  if (!isLocal || !profile.port || profile.port <= 0 || host.includes('dummy') || host.includes('fake') || host.includes('rds.amazonaws.com') || host.includes('invalid') || profile.useSsh) {
    return {
      success: false,
      message: `Connection failed: Unable to connect to host "${profile.host}:${profile.port}". Network timed out or host unreachable.`,
      latency_ms: 0,
    };
  }

  return {
    success: true,
    message: `Connected successfully to ${profile.engine} at ${profile.host}:${profile.port}`,
    latency_ms: +(Math.random() * 1.5 + 0.8).toFixed(1),
  };
}

export async function closeRealConnection(profile: ConnectionProfile): Promise<void> {
  const isTauri = typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
  if (!isTauri) return;
  try {
    const config = profileToConfig(profile);
    await invoke('close_connection', { config });
  } catch {
    // Ignore close errors
  }
}

export async function executeRealQuery(profile: ConnectionProfile, query: string): Promise<RealQueryResult> {
  const isTauri = typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
  if (!isTauri) {
    return {
      success: false,
      columns: ['info'],
      rows: [{ info: 'Running in web mode' }],
      duration_ms: 0,
      rows_affected: 0,
      error: 'Tauri native backend is not attached in browser mode.',
    };
  }
  try {
    const config = profileToConfig(profile);
    const res = await invoke<RealQueryResult>('execute_query', { config, query });
    return res;
  } catch (err: any) {
    return {
      success: false,
      columns: ['error'],
      rows: [{ error: String(err?.message || err) }],
      duration_ms: 0,
      rows_affected: 0,
      error: String(err?.message || err),
    };
  }
}

export async function getRealTables(profile: ConnectionProfile): Promise<RealTableSummary[]> {
  const isTauri = typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
  if (!isTauri) return [];
  try {
    const config = profileToConfig(profile);
    const res = await invoke<RealTableSummary[]>('get_tables', { config });
    return res;
  } catch {
    return [];
  }
}

export async function getRealDatabases(profile: ConnectionProfile): Promise<string[]> {
  const isTauri = typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
  if (!isTauri) {
    return profile.databases && profile.databases.length > 0
      ? profile.databases
      : [profile.database || (normalizeDatabaseEngine(profile.engine) === 'postgres' ? 'postgres' : 'default')];
  }
  try {
    const config = profileToConfig(profile);
    const res = await invoke<string[]>('get_databases', { config });
    if (res && res.length > 0) {
      return res;
    }
  } catch (e) {
    try {
      const normEngine = normalizeDatabaseEngine(profile.engine);
      if (normEngine === 'postgres') {
        const q = await executeRealQuery(profile, 'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname ASC;');
        if (q.success && q.rows && q.rows.length > 0) {
          return q.rows.map((r: any) => String(r.datname || Object.values(r)[0]));
        }
      } else if (normEngine === 'mysql') {
        const q = await executeRealQuery(profile, 'SHOW DATABASES;');
        if (q.success && q.rows && q.rows.length > 0) {
          return q.rows.map((r: any) => String(r.Database || Object.values(r)[0]));
        }
      } else if (normEngine === 'snowflake') {
        const q = await executeRealQuery(profile, 'SHOW DATABASES;');
        if (q.success && q.rows && q.rows.length > 0) {
          return q.rows.map((r: any) => String(r.name || r.NAME || Object.values(r)[0]));
        }
      }
    } catch {}
  }
  return profile.databases && profile.databases.length > 0
    ? profile.databases
    : [profile.database || (normalizeDatabaseEngine(profile.engine) === 'postgres' ? 'postgres' : 'default')];
}

export async function getRealFunctions(profile: ConnectionProfile): Promise<FunctionItem[]> {
  try {
    const normEngine = normalizeDatabaseEngine(profile.engine);
    if (normEngine === 'postgres') {
      const sql = `
        SELECT 
          p.proname AS name,
          n.nspname AS schema,
          CASE p.prokind
            WHEN 'f' THEN 'function'
            WHEN 'p' THEN 'procedure'
            WHEN 'a' THEN 'aggregate'
            WHEN 'w' THEN 'window'
            ELSE 'function'
          END AS kind,
          pg_catalog.pg_get_userbyid(p.proowner) AS owner,
          '--' AS estimated_row,
          '--' AS total_size,
          '--' AS data_size,
          '--' AS index_size,
          COALESCE(d.description, '--') AS comment,
          COALESCE(pg_get_functiondef(p.oid), '') AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        LEFT JOIN pg_description d ON d.objoid = p.oid
        WHERE n.nspname = 'public'
        ORDER BY p.proname ASC;
      `;
      const res = await executeRealQuery(profile, sql);
      if (res.success && res.rows && res.rows.length > 0) {
        return res.rows.map((r: any) => ({
          name: String(r.name || ''),
          schema: String(r.schema || 'public'),
          kind: String(r.kind || 'function'),
          owner: String(r.owner || 'postgres'),
          estimated_row: '--',
          total_size: '--',
          data_size: '--',
          index_size: '--',
          comment: String(r.comment || '--'),
          definition: String(r.definition || ''),
        }));
      }
    } else if (normEngine === 'mysql') {
      const sql = `
        SELECT 
          ROUTINE_NAME AS name,
          ROUTINE_SCHEMA AS \`schema\`,
          LOWER(ROUTINE_TYPE) AS kind,
          DEFINER AS owner,
          '--' AS estimated_row,
          '--' AS total_size,
          '--' AS data_size,
          '--' AS index_size,
          COALESCE(ROUTINE_COMMENT, '--') AS comment,
          COALESCE(ROUTINE_DEFINITION, '') AS definition
        FROM information_schema.ROUTINES
        WHERE ROUTINE_SCHEMA = DATABASE()
        ORDER BY ROUTINE_NAME ASC;
      `;
      const res = await executeRealQuery(profile, sql);
      if (res.success && res.rows && res.rows.length > 0) {
        return res.rows.map((r: any) => ({
          name: String(r.name || ''),
          schema: String(r.schema || profile.database || 'mysql'),
          kind: String(r.kind || 'function'),
          owner: String(r.owner || 'root'),
          estimated_row: '--',
          total_size: '--',
          data_size: '--',
          index_size: '--',
          comment: String(r.comment || '--'),
          definition: String(r.definition || ''),
        }));
      }
    } else if (normEngine === 'snowflake') {
      const sql = `
        SELECT
          FUNCTION_NAME AS name,
          FUNCTION_SCHEMA AS schema,
          'function' AS kind,
          COALESCE(FUNCTION_OWNER, '') AS owner,
          '--' AS estimated_row,
          '--' AS total_size,
          '--' AS data_size,
          '--' AS index_size,
          COALESCE(COMMENT, '--') AS comment,
          '' AS definition
        FROM INFORMATION_SCHEMA.FUNCTIONS
        WHERE FUNCTION_SCHEMA != 'INFORMATION_SCHEMA'
        ORDER BY FUNCTION_SCHEMA ASC, FUNCTION_NAME ASC;
      `;
      const res = await executeRealQuery(profile, sql);
      if (res.success && res.rows && res.rows.length > 0) {
        return res.rows.map((r: any) => ({
          name: String(r.name || r.NAME || ''),
          schema: String(r.schema || r.SCHEMA || 'PUBLIC'),
          kind: String(r.kind || r.KIND || 'function'),
          owner: String(r.owner || r.OWNER || 'snowflake'),
          estimated_row: '--',
          total_size: '--',
          data_size: '--',
          index_size: '--',
          comment: String(r.comment || r.COMMENT || '--'),
          definition: String(r.definition || r.DEFINITION || ''),
        }));
      }
    }
    return [];
  } catch (e) {
    console.warn('getRealFunctions failed:', e);
    return [];
  }
}

export async function getRealTableSchema(
  profile: ConnectionProfile,
  tableName: string,
  summary?: RealTableSummary
): Promise<TableSchemaInfo | null> {
  if (!tableName || tableName.startsWith('__')) return null;
  const safeTable = escapeSqlStringLiteral(tableName);
  const normEngine = normalizeDatabaseEngine(profile.engine);

  try {
    if (normEngine === 'postgres') {
      const colSql = `
        SELECT
          c.column_name AS name,
          CASE
            WHEN c.data_type = 'character varying' AND c.character_maximum_length IS NOT NULL
              THEN 'varchar(' || c.character_maximum_length || ')'
            WHEN c.data_type = 'numeric' AND c.numeric_precision IS NOT NULL
              THEN 'numeric(' || c.numeric_precision || ',' || COALESCE(c.numeric_scale, 0) || ')'
            ELSE c.udt_name
          END AS data_type,
          (c.is_nullable = 'YES') AS is_nullable,
          c.column_default AS default_value,
          COALESCE(pk.is_pk, false) AS is_primary_key,
          fk.foreign_table_name AS foreign_table,
          fk.foreign_column_name AS foreign_column,
          fk.constraint_name AS fk_name,
          COALESCE(pgd.description, '') AS comment
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT kcu.column_name, true AS is_pk
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          WHERE tc.table_schema = 'public'
            AND tc.table_name = '${safeTable}'
            AND tc.constraint_type = 'PRIMARY KEY'
        ) pk ON pk.column_name = c.column_name
        LEFT JOIN (
          SELECT
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name,
            tc.constraint_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
          WHERE tc.table_schema = 'public'
            AND tc.table_name = '${safeTable}'
            AND tc.constraint_type = 'FOREIGN KEY'
        ) fk ON fk.column_name = c.column_name
        LEFT JOIN pg_catalog.pg_class cl
          ON cl.relname = c.table_name
          AND cl.relnamespace = (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = 'public' LIMIT 1)
        LEFT JOIN pg_catalog.pg_description pgd
          ON pgd.objoid = cl.oid AND pgd.objsubid = c.ordinal_position
        WHERE c.table_schema = 'public' AND c.table_name = '${safeTable}'
        ORDER BY c.ordinal_position ASC;
      `;

      const idxSql = `
        SELECT
          i.relname AS index_name,
          UPPER(am.amname) AS index_type,
          ix.indisunique AS is_unique,
          ix.indisprimary AS is_primary,
          pg_size_pretty(pg_relation_size(i.oid)) AS index_size,
          pg_get_indexdef(i.oid) AS index_def
        FROM pg_index ix
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_am am ON am.oid = i.relam
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND t.relname = '${safeTable}'
        ORDER BY ix.indisprimary DESC, i.relname ASC;
      `;

      const [colRes, idxRes] = await Promise.all([
        executeRealQuery(profile, colSql),
        executeRealQuery(profile, idxSql),
      ]);

      if (!colRes.success || !colRes.rows || colRes.rows.length === 0) {
        return null;
      }

      const columns: ColumnDefinition[] = [];
      const foreignKeys: TableForeignKeyDefinition[] = [];
      const seenCols = new Set<string>();

      for (const r of colRes.rows) {
        const colName = String(r.name || '');
        if (!colName || seenCols.has(colName)) continue;
        seenCols.add(colName);

        const isFk = Boolean(r.foreign_table);
        columns.push({
          name: colName,
          type: String(r.data_type || 'text'),
          isNullable: Boolean(r.is_nullable),
          defaultValue: r.default_value ? String(r.default_value) : undefined,
          isPrimaryKey: Boolean(r.is_primary_key),
          isForeignKey: isFk,
          foreignTable: isFk ? String(r.foreign_table) : undefined,
          foreignColumn: isFk ? String(r.foreign_column || 'id') : undefined,
          comment: r.comment ? String(r.comment) : undefined,
        });

        if (isFk) {
          foreignKeys.push({
            name: String(r.fk_name || `fk_${tableName}_${colName}`),
            column: colName,
            foreignTable: String(r.foreign_table),
            foreignColumn: String(r.foreign_column || 'id'),
            onUpdate: 'NO ACTION',
            onDelete: 'NO ACTION',
          });
        }
      }

      const indexes: TableIndexDefinition[] = [];
      const indexDdls: string[] = [];
      if (idxRes.success && Array.isArray(idxRes.rows)) {
        for (const ir of idxRes.rows) {
          const idxName = String(ir.index_name || '');
          const def = String(ir.index_def || '');
          if (def) indexDdls.push(`${def};`);
          const colMatch = def.match(/\(([^)]+)\)/);
          const idxCols = colMatch
            ? colMatch[1].split(',').map((s) => s.trim())
            : ['id'];
          const rawType = String(ir.index_type || 'BTREE').toUpperCase();
          const idxType: TableIndexDefinition['type'] =
            rawType === 'GIN' || rawType === 'HASH' || rawType === 'GIST'
              ? rawType
              : 'BTREE';
          indexes.push({
            name: idxName,
            columns: idxCols,
            type: idxType,
            isUnique: Boolean(ir.is_unique),
            isPrimary: Boolean(ir.is_primary),
            size: ir.index_size ? String(ir.index_size) : undefined,
          });
        }
      }

      const sortedColumns = sortColumnsByDdlConvention(columns);
      const pkCols = sortedColumns.filter((c) => c.isPrimaryKey).map((c) => `"${c.name}"`);
      const ddlLines = sortedColumns.map((c) => {
        const nullStr = c.isNullable ? '' : ' NOT NULL';
        const defStr = c.defaultValue ? ` DEFAULT ${c.defaultValue}` : '';
        return `  "${c.name}" ${c.type}${nullStr}${defStr}`;
      });
      if (pkCols.length > 0) {
        ddlLines.push(`  PRIMARY KEY (${pkCols.join(', ')})`);
      }

      const ddl = `-- DDL for table: public.${tableName}\nCREATE TABLE public."${tableName}" (\n${ddlLines.join(',\n')}\n);\n${
        indexDdls.length > 0 ? '\n' + indexDdls.join('\n') : ''
      }`;

      const estRows = summary?.estimated_rows ?? 0;
      const totalSize = summary?.total_size || '16 KB';
      const dataSize = summary?.data_size || totalSize;
      const idxSize = summary?.index_size || '0 KB';

      return {
        tableName,
        schema: summary?.schema || 'public',
        engine: 'PostgreSQL (Heap)',
        rowCount: `${estRows.toLocaleString()} rows`,
        totalSize: `${totalSize} (Data: ${dataSize}, Index: ${idxSize})`,
        columns: sortedColumns,
        indexes,
        foreignKeys,
        ddl,
      };
    } else if (normEngine === 'mysql') {
      const colSql = `
        SELECT
          c.COLUMN_NAME AS name,
          c.COLUMN_TYPE AS data_type,
          (c.IS_NULLABLE = 'YES') AS is_nullable,
          c.COLUMN_DEFAULT AS default_value,
          (c.COLUMN_KEY = 'PRI') AS is_primary_key,
          c.COLUMN_COMMENT AS comment,
          kcu.REFERENCED_TABLE_NAME AS foreign_table,
          kcu.REFERENCED_COLUMN_NAME AS foreign_column,
          kcu.CONSTRAINT_NAME AS fk_name
        FROM information_schema.COLUMNS c
        LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
          ON kcu.TABLE_SCHEMA = c.TABLE_SCHEMA
          AND kcu.TABLE_NAME = c.TABLE_NAME
          AND kcu.COLUMN_NAME = c.COLUMN_NAME
          AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
        WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = '${safeTable}'
        ORDER BY c.ORDINAL_POSITION ASC;
      `;

      const idxSql = `
        SELECT
          INDEX_NAME AS index_name,
          COLUMN_NAME AS column_name,
          NON_UNIQUE AS non_unique,
          INDEX_TYPE AS index_type,
          SEQ_IN_INDEX AS seq_in_index
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${safeTable}'
        ORDER BY INDEX_NAME, SEQ_IN_INDEX ASC;
      `;

      const ddlSql = `SHOW CREATE TABLE \`${safeTable}\`;`;

      const [colRes, idxRes, ddlRes] = await Promise.all([
        executeRealQuery(profile, colSql),
        executeRealQuery(profile, idxSql),
        executeRealQuery(profile, ddlSql),
      ]);

      if (!colRes.success || !colRes.rows || colRes.rows.length === 0) {
        return null;
      }

      const foreignKeys: TableForeignKeyDefinition[] = [];
      const rawColumns: ColumnDefinition[] = colRes.rows.map((r: any) => {
        const isFk = Boolean(r.foreign_table);
        if (isFk) {
          foreignKeys.push({
            name: String(r.fk_name || `fk_${tableName}_${r.name}`),
            column: String(r.name),
            foreignTable: String(r.foreign_table),
            foreignColumn: String(r.foreign_column || 'id'),
            onUpdate: 'RESTRICT',
            onDelete: 'RESTRICT',
          });
        }
        return {
          name: String(r.name || ''),
          type: String(r.data_type || 'varchar(255)'),
          isNullable: Boolean(r.is_nullable),
          defaultValue: r.default_value !== null && r.default_value !== undefined ? String(r.default_value) : undefined,
          isPrimaryKey: Boolean(r.is_primary_key),
          isForeignKey: isFk,
          foreignTable: isFk ? String(r.foreign_table) : undefined,
          foreignColumn: isFk ? String(r.foreign_column || 'id') : undefined,
          comment: r.comment ? String(r.comment) : undefined,
        };
      });
      const columns: ColumnDefinition[] = sortColumnsByDdlConvention(rawColumns);

      const indexMap = new Map<string, {
        name: string;
        columns: string[];
        type: TableIndexDefinition['type'];
        isUnique: boolean;
        isPrimary: boolean;
      }>();

      if (idxRes.success && Array.isArray(idxRes.rows)) {
        for (const ir of idxRes.rows) {
          const idxName = String(ir.index_name || '');
          if (!idxName) continue;
          const colName = String(ir.column_name || '');
          const nonUnique = Number(ir.non_unique ?? 1);
          const rawType = String(ir.index_type || 'BTREE').toUpperCase();
          const idxType: TableIndexDefinition['type'] =
            rawType === 'HASH' || rawType === 'FULLTEXT' || rawType === 'SPATIAL' ? (rawType as any) : 'BTREE';

          if (!indexMap.has(idxName)) {
            indexMap.set(idxName, {
              name: idxName,
              columns: colName ? [colName] : [],
              type: idxType,
              isUnique: nonUnique === 0,
              isPrimary: idxName === 'PRIMARY',
            });
          } else if (colName) {
            indexMap.get(idxName)!.columns.push(colName);
          }
        }
      }
      const indexes: TableIndexDefinition[] = Array.from(indexMap.values());

      let ddl = '';
      if (ddlRes.success && ddlRes.rows && ddlRes.rows.length > 0) {
        const row0 = ddlRes.rows[0];
        const serverDdl = row0['Create Table'] || row0['create table'] || Object.values(row0)[1];
        if (serverDdl && typeof serverDdl === 'string') {
          ddl = `-- Server DDL for table: ${tableName}\n${serverDdl};`;
        }
      }

      if (!ddl) {
        const ddlLines = columns.map((c) => {
          const nullStr = c.isNullable ? ' NULL' : ' NOT NULL';
          const defStr = c.defaultValue ? ` DEFAULT '${c.defaultValue}'` : '';
          return `  \`${c.name}\` ${c.type}${nullStr}${defStr}`;
        });
        const pkCols = columns.filter((c) => c.isPrimaryKey).map((c) => `\`${c.name}\``);
        if (pkCols.length > 0) {
          ddlLines.push(`  PRIMARY KEY (${pkCols.join(', ')})`);
        }
        ddl = `-- DDL for table: ${tableName}\nCREATE TABLE \`${tableName}\` (\n${ddlLines.join(',\n')}\n) ENGINE=InnoDB;`;
      }

      const estRows = summary?.estimated_rows ?? 0;
      const totalSize = summary?.total_size || '16 KB';
      const dataSize = summary?.data_size || totalSize;
      const idxSize = summary?.index_size || '0 KB';

      return {
        tableName,
        schema: summary?.schema || profile.database || 'mysql',
        engine: 'MySQL (InnoDB)',
        rowCount: `${estRows.toLocaleString()} rows`,
        totalSize: `${totalSize} (Data: ${dataSize}, Index: ${idxSize})`,
        columns,
        indexes,
        foreignKeys,
        ddl,
      };
    } else if (normEngine === 'redis') {
      const [typeRes, ttlRes, memRes] = await Promise.all([
        executeRealQuery(profile, `TYPE "${safeTable}"`),
        executeRealQuery(profile, `TTL "${safeTable}"`),
        executeRealQuery(profile, `MEMORY USAGE "${safeTable}"`),
      ]);

      const rawType = String(typeRes.rows?.[0]?.result ?? typeRes.rows?.[0]?.value ?? 'string').toLowerCase();
      const ttl = Number(ttlRes.rows?.[0]?.result ?? ttlRes.rows?.[0]?.value ?? -1);
      const memBytes = Number(memRes.rows?.[0]?.result ?? memRes.rows?.[0]?.value ?? 0);

      let countCmd = '';
      if (rawType === 'hash') countCmd = `HLEN "${safeTable}"`;
      else if (rawType === 'set') countCmd = `SCARD "${safeTable}"`;
      else if (rawType === 'zset') countCmd = `ZCARD "${safeTable}"`;
      else if (rawType === 'list') countCmd = `LLEN "${safeTable}"`;
      else if (rawType === 'string') countCmd = `STRLEN "${safeTable}"`;

      let itemCount = 0;
      if (countCmd) {
        const countRes = await executeRealQuery(profile, countCmd);
        itemCount = Number(countRes.rows?.[0]?.result ?? countRes.rows?.[0]?.value ?? 0);
      }

      let columns: ColumnDefinition[] = [];
      if (rawType === 'hash') {
        columns = [
          { name: 'id', type: 'integer', isPrimaryKey: true, isNullable: false },
          { name: 'field', type: 'string', isPrimaryKey: false, isNullable: false },
          { name: 'value', type: 'string', isPrimaryKey: false, isNullable: true },
        ];
      } else if (rawType === 'zset') {
        columns = [
          { name: 'id', type: 'integer', isPrimaryKey: true, isNullable: false },
          { name: 'rank', type: 'integer', isPrimaryKey: false, isNullable: false },
          { name: 'member', type: 'string', isPrimaryKey: false, isNullable: false },
          { name: 'score', type: 'float', isPrimaryKey: false, isNullable: false },
        ];
      } else if (rawType === 'set') {
        columns = [
          { name: 'id', type: 'integer', isPrimaryKey: true, isNullable: false },
          { name: 'member', type: 'string', isPrimaryKey: false, isNullable: false },
        ];
      } else if (rawType === 'list') {
        columns = [
          { name: 'id', type: 'integer', isPrimaryKey: true, isNullable: false },
          { name: 'index', type: 'integer', isPrimaryKey: false, isNullable: false },
          { name: 'value', type: 'string', isPrimaryKey: false, isNullable: true },
        ];
      } else {
        columns = [
          { name: 'id', type: 'integer', isPrimaryKey: true, isNullable: false },
          { name: 'key', type: 'string', isPrimaryKey: false, isNullable: false },
          { name: 'type', type: 'string', isPrimaryKey: false, isNullable: false },
          { name: 'ttl', type: 'integer', isPrimaryKey: false, isNullable: false },
          { name: 'value', type: 'string', isPrimaryKey: false, isNullable: true },
        ];
      }

      const ttlLabel = ttl === -1 ? 'Persistent (No Expiry)' : ttl === -2 ? 'Key Not Found / Expired' : `${ttl}s`;
      const memLabel = memBytes > 0 ? (memBytes >= 1024 ? `${(memBytes / 1024).toFixed(1)} KB` : `${memBytes} B`) : '0 B';

      const ddl = `-- Redis Key: ${tableName}
-- Structure Type: ${rawType.toUpperCase()}
-- Expiration (TTL): ${ttlLabel}
-- Memory Footprint: ${memLabel} (${memBytes} bytes)
-- Elements / Length: ${itemCount.toLocaleString()} items
-- Engine: Redis In-Memory KV Store`;

      return {
        tableName,
        schema: 'redis',
        engine: `Redis (${rawType.toUpperCase()})`,
        rowCount: `${itemCount.toLocaleString()} item(s)`,
        totalSize: `${memLabel} (TTL: ${ttlLabel})`,
        columns,
        indexes: [],
        foreignKeys: [],
        ddl,
      };
    } else if (normEngine === 'snowflake') {
      const targetSchema = summary?.schema;
      const targetDb = summary?.database || (profile.database && profile.database !== '0' ? profile.database : undefined);
      const schemaFilter = targetSchema ? `AND c.TABLE_SCHEMA = '${escapeSqlStringLiteral(targetSchema)}'` : '';
      const dbFilter = targetDb ? `AND c.TABLE_CATALOG = '${escapeSqlStringLiteral(targetDb)}'` : '';
      const colSql = `
        SELECT
          c.COLUMN_NAME AS name,
          c.DATA_TYPE AS data_type,
          (c.IS_NULLABLE = 'YES') AS is_nullable,
          c.COLUMN_DEFAULT AS default_value,
          COALESCE(c.COMMENT, '') AS comment
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_NAME = '${safeTable}'
        ${schemaFilter}
        ${dbFilter}
        ORDER BY c.ORDINAL_POSITION ASC;
      `;

      const quotedObj = targetDb && targetSchema
        ? `"${targetDb}"."${targetSchema}"."${tableName}"`
        : targetSchema
        ? `"${targetSchema}"."${tableName}"`
        : `"${tableName}"`;

      const ddlSql = `SELECT GET_DDL('TABLE', '${quotedObj}') AS ddl;`;
      const pkSql = `SHOW PRIMARY KEYS IN ${quotedObj};`;

      const [colRes, ddlRes, pkRes] = await Promise.all([
        executeRealQuery(profile, colSql),
        executeRealQuery(profile, ddlSql).catch(() => ({ success: false, rows: [] } as any)),
        executeRealQuery(profile, pkSql).catch(() => ({ success: false, rows: [] } as any)),
      ]);

      if (!colRes.success || !colRes.rows || colRes.rows.length === 0) {
        return null;
      }

      const pkCols = new Set<string>();
      if (pkRes.success && pkRes.rows && pkRes.rows.length > 0) {
        for (const r of pkRes.rows) {
          const colName = String(r.column_name || r.COLUMN_NAME || '');
          if (colName) pkCols.add(colName.toLowerCase());
        }
      }

      const columns: ColumnDefinition[] = colRes.rows.map((r: any) => {
        const name = String(r.name || r.NAME || '');
        return {
          name,
          type: String(r.data_type || r.DATA_TYPE || 'VARCHAR'),
          isNullable: Boolean(r.is_nullable ?? (r.IS_NULLABLE === 'YES')),
          defaultValue: r.default_value !== null && r.default_value !== undefined ? String(r.default_value) : undefined,
          isPrimaryKey: pkCols.has(name.toLowerCase()),
          isForeignKey: false,
          comment: r.comment ? String(r.comment) : undefined,
        };
      });

      let ddl = '';
      if (ddlRes.success && ddlRes.rows && ddlRes.rows.length > 0) {
        const row0 = ddlRes.rows[0];
        ddl = String(row0.ddl || row0.DDL || Object.values(row0)[0] || '');
      }

      if (!ddl) {
        const ddlLines = columns.map((c) => {
          const nullStr = c.isNullable ? '' : ' NOT NULL';
          const defStr = c.defaultValue ? ` DEFAULT ${c.defaultValue}` : '';
          return `  "${c.name}" ${c.type}${nullStr}${defStr}`;
        });
        const pkColsArr = columns.filter((c) => c.isPrimaryKey).map((c) => `"${c.name}"`);
        if (pkColsArr.length > 0) {
          ddlLines.push(`  PRIMARY KEY (${pkColsArr.join(', ')})`);
        }
        ddl = `-- DDL for table: ${quotedObj}\nCREATE TABLE ${quotedObj} (\n${ddlLines.join(',\n')}\n);`;
      }

      const estRows = summary?.estimated_rows ?? 0;
      const totalSize = summary?.total_size || '0 bytes';

      return {
        tableName,
        schema: targetSchema || summary?.schema || 'PUBLIC',
        engine: 'Snowflake Cloud Data Warehouse',
        rowCount: `${estRows.toLocaleString()} rows`,
        totalSize,
        columns,
        indexes: [],
        foreignKeys: [],
        ddl,
      };
    }
  } catch (e) {
    console.warn('getRealTableSchema failed:', e);
  }
  return null;
}


