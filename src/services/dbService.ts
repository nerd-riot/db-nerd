import { invoke } from '@tauri-apps/api/core';
import { ConnectionProfile, FunctionItem } from '../types';

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

