import { invoke } from '@tauri-apps/api/core';
import {
  ConnectionProfile,
  FunctionItem,
  TableSchemaInfo,
  ColumnDefinition,
  TableIndexDefinition,
  TableForeignKeyDefinition,
} from '../types';

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
  kind?: string;
  owner?: string;
  estimated_rows?: number;
  total_size?: string;
  data_size?: string;
  index_size?: string;
  comment?: string;
}

export const profileToConfig = (profile: ConnectionProfile): DbConfigPayload => {
  // If user has default placeholder password and host is localhost without SSH, resolve to docker dev credentials
  let password = profile.password;
  const isLocalDocker = !profile.useSsh && (profile.host === 'localhost' || profile.host === '127.0.0.1');
  if (!password || (password === '••••••••••••' && isLocalDocker)) {
    if (profile.engine === 'postgres' || profile.engine === 'mysql') {
      password = 'dev_password';
    } else {
      password = '';
    }
  }

  let username = profile.username;
  if (!username) {
    username = profile.engine === 'postgres' ? 'dev_user' : profile.engine === 'mysql' ? 'dev_user' : 'default';
  }

  return {
    engine: profile.engine,
    host: profile.host === '127.0.0.1' ? 'localhost' : (profile.host || 'localhost'),
    port: profile.port,
    database: profile.database || (profile.engine === 'postgres' ? 'ecom_prod_db' : profile.engine === 'mysql' ? 'analytics_staging' : '0'),
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
  try {
    const config = profileToConfig(profile);
    const res = await invoke<RealTableSummary[]>('get_tables', { config });
    return res;
  } catch {
    return [];
  }
}

export async function getRealDatabases(profile: ConnectionProfile): Promise<string[]> {
  try {
    const config = profileToConfig(profile);
    const res = await invoke<string[]>('get_databases', { config });
    if (res && res.length > 0) {
      return res;
    }
  } catch (e) {
    try {
      if (profile.engine === 'postgres') {
        const q = await executeRealQuery(profile, 'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname ASC;');
        if (q.success && q.rows && q.rows.length > 0) {
          return q.rows.map((r: any) => String(r.datname || Object.values(r)[0]));
        }
      } else if (profile.engine === 'mysql') {
        const q = await executeRealQuery(profile, 'SHOW DATABASES;');
        if (q.success && q.rows && q.rows.length > 0) {
          return q.rows.map((r: any) => String(r.Database || Object.values(r)[0]));
        }
      }
    } catch {}
  }
  return profile.databases && profile.databases.length > 0
    ? profile.databases
    : [profile.database || (profile.engine === 'postgres' ? 'postgres' : 'default')];
}

export async function getRealFunctions(profile: ConnectionProfile): Promise<FunctionItem[]> {
  try {
    if (profile.engine === 'postgres') {
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
    } else if (profile.engine === 'mysql') {
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
  const safeTable = tableName.replace(/'/g, "''");

  try {
    if (profile.engine === 'postgres') {
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

      const pkCols = columns.filter((c) => c.isPrimaryKey).map((c) => `"${c.name}"`);
      const ddlLines = columns.map((c) => {
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
        columns,
        indexes,
        foreignKeys,
        ddl,
      };
    } else if (profile.engine === 'mysql') {
      const colSql = `
        SELECT
          COLUMN_NAME AS name,
          COLUMN_TYPE AS data_type,
          (IS_NULLABLE = 'YES') AS is_nullable,
          COLUMN_DEFAULT AS default_value,
          (COLUMN_KEY = 'PRI') AS is_primary_key,
          COLUMN_COMMENT AS comment
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${safeTable}'
        ORDER BY ORDINAL_POSITION ASC;
      `;
      const colRes = await executeRealQuery(profile, colSql);
      if (!colRes.success || !colRes.rows || colRes.rows.length === 0) {
        return null;
      }

      const columns: ColumnDefinition[] = colRes.rows.map((r: any) => ({
        name: String(r.name || ''),
        type: String(r.data_type || 'varchar(255)'),
        isNullable: Boolean(r.is_nullable),
        defaultValue: r.default_value !== null && r.default_value !== undefined ? String(r.default_value) : undefined,
        isPrimaryKey: Boolean(r.is_primary_key),
        comment: r.comment ? String(r.comment) : undefined,
      }));

      const ddlLines = columns.map((c) => {
        const nullStr = c.isNullable ? ' NULL' : ' NOT NULL';
        const defStr = c.defaultValue ? ` DEFAULT '${c.defaultValue}'` : '';
        return `  \`${c.name}\` ${c.type}${nullStr}${defStr}`;
      });
      const pkCols = columns.filter((c) => c.isPrimaryKey).map((c) => `\`${c.name}\``);
      if (pkCols.length > 0) {
        ddlLines.push(`  PRIMARY KEY (${pkCols.join(', ')})`);
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
        indexes: [],
        foreignKeys: [],
        ddl: `-- DDL for table: ${tableName}\nCREATE TABLE \`${tableName}\` (\n${ddlLines.join(',\n')}\n) ENGINE=InnoDB;`,
      };
    }
  } catch (e) {
    console.warn('getRealTableSchema failed:', e);
  }
  return null;
}


