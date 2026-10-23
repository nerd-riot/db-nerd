import { DatabaseEngine, EnvironmentTag } from '../types';
import { normalizeEngine } from './connectionUrl';

export interface ImportedConnectionItem {
  id?: string;
  name: string;
  engine: DatabaseEngine;
  env: EnvironmentTag;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  useSsh?: boolean;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshPassword?: string;
  useSshKey?: boolean;
  sshKeyPath?: string;
  groupName?: string;
  sourceTool: 'tableplus' | 'dbeaver' | 'pgadmin' | 'dbnerd' | 'generic';
  rawParams?: Record<string, any>;
}

const DEFAULT_PORTS: Record<string, number> = {
  postgres: 5432,
  mysql: 3306,
  mariadb: 3306,
  redis: 6379,
  clickhouse: 8123,
  duckdb: 0,
  sqlite: 0,
  snowflake: 443,
  sqlserver: 1433,
  mongodb: 27017,
  oracle: 1521,
  cassandra: 9042,
  elasticsearch: 9200,
  cockroach: 26257,
};

function mapDriverToEngine(driver: string): DatabaseEngine {
  if (!driver) return 'postgres';
  const d = driver.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (d.includes('postgres')) return 'postgres';
  if (d.includes('maria')) return 'mariadb';
  if (d.includes('mysql')) return 'mysql';
  if (d.includes('redis')) return 'redis';
  if (d.includes('sqlite')) return 'sqlite';
  if (d.includes('clickhouse')) return 'clickhouse';
  if (d.includes('snowflake')) return 'snowflake';
  if (d.includes('sqlserver') || d.includes('mssql')) return 'sqlserver';
  if (d.includes('mongo')) return 'mongodb';
  if (d.includes('oracle')) return 'oracle';
  if (d.includes('cockroach')) return 'cockroach';
  if (d.includes('duckdb')) return 'duckdb';
  if (d.includes('redshift')) return 'redshift';
  return normalizeEngine(driver);
}

function mapEnv(envVal?: string, host?: string): EnvironmentTag {
  if (!envVal && host) {
    const h = host.toLowerCase();
    if (h.includes('prod') || h.includes('cluster-cmil') || h.includes('aurora-cluster')) return 'prod';
    if (h.includes('staging') || h.includes('stg')) return 'staging';
    if (h.includes('localhost') || h.includes('127.0.0.1')) return 'local';
  }
  if (!envVal) return 'local';
  const e = envVal.toLowerCase();
  if (e.includes('prod') || e === 'red' || e === '007f3d') return 'prod';
  if (e.includes('stag') || e.includes('qa') || e === 'yellow' || e === 'amber') return 'staging';
  return 'local';
}

/**
 * Parses XML Plist (TablePlus plist export format)
 */
function parsePlistXml(xmlText: string): Record<string, string>[] {
  const items: Record<string, string>[] = [];
  try {
    const dictRegex = /<dict>([\s\S]*?)<\/dict>/gi;
    let match: RegExpExecArray | null;
    while ((match = dictRegex.exec(xmlText)) !== null) {
      const dictBody = match[1];
      const dictObj: Record<string, string> = {};
      const keyValRegex = /<key>([^<]+)<\/key>\s*<(string|integer|true|false)>(.*?)<\/\2>/gi;
      let kv: RegExpExecArray | null;
      while ((kv = keyValRegex.exec(dictBody)) !== null) {
        dictObj[kv[1]] = kv[3];
      }
      if (Object.keys(dictObj).length > 0) {
        items.push(dictObj);
      }
    }
  } catch (err) {
    console.warn('Failed to parse plist XML:', err);
  }
  return items;
}

/**
 * Transforms a TablePlus JSON/plist object into an ImportedConnectionItem
 */
function transformTablePlusItem(obj: Record<string, any>): ImportedConnectionItem {
  const driver = obj.Driver || obj.driver || 'PostgreSQL';
  const engine = mapDriverToEngine(driver);
  const host = obj.DatabaseHost || obj.host || obj.Server || 'localhost';
  const port = parseInt(obj.DatabasePort || obj.port || '', 10) || DEFAULT_PORTS[engine] || 5432;
  const username = obj.DatabaseUser || obj.user || obj.username || 'postgres';
  const password = obj.DatabasePassword || obj.password || '';
  const database = obj.DatabaseName || obj.database || 'postgres';
  const name = obj.ConnectionName || obj.name || `${driver} - ${database}`;
  const env = mapEnv(obj.Enviroment || obj.environment || obj.statusColor, host);
  const groupName = obj.GroupName || obj.group || obj.Group || undefined;

  const useSsh = obj.UseSSH === '1' || obj.UseSSH === 1 || obj.useSsh === true;
  const sshHost = obj.SSHHost || obj.sshHost || '';
  const sshPort = parseInt(obj.SSHPort || obj.sshPort || '22', 10) || 22;
  const sshUser = obj.SSHUser || obj.sshUser || '';
  const sshPassword = obj.SSHPassword || obj.sshPassword || '';
  const sshKeyPath = obj.SSHKey || obj.sshKeyPath || '';
  const useSshKey = Boolean(sshKeyPath) || obj.useSshKey === true;

  return {
    id: obj.ID || obj.id || undefined,
    name,
    engine,
    env,
    host,
    port,
    database,
    username,
    password,
    useSsh,
    sshHost,
    sshPort,
    sshUser,
    sshPassword,
    useSshKey,
    sshKeyPath,
    groupName,
    sourceTool: 'tableplus',
    rawParams: obj,
  };
}

/**
 * Main parser entry point: supports TablePlus (*.tableplusconnection, JSON, plist),
 * DBeaver (data-sources.json), pgAdmin 4 (servers.json), and generic DBNerd JSON.
 */
export function parseConnectionFile(content: string, filename?: string): ImportedConnectionItem[] {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('File content is empty');
  }

  const fnLower = (filename || '').toLowerCase();

  // 1. Check if XML/plist
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<plist') || fnLower.endsWith('.plist')) {
    const plistItems = parsePlistXml(trimmed);
    if (plistItems.length > 0) {
      return plistItems.map(transformTablePlusItem);
    }
  }

  // 2. Try JSON parsing
  let parsedJson: any;
  try {
    parsedJson = JSON.parse(trimmed);
  } catch (err: any) {
    // If not standard JSON, check if it's XML or line-delimited
    throw new Error(`Invalid JSON format in file: ${err.message || 'Parse error'}`);
  }

  // CASE A: TablePlus single connection or array
  if (Array.isArray(parsedJson)) {
    return parsedJson.map((item) => {
      if (item.Driver || item.DatabaseHost || item.ConnectionName) {
        return transformTablePlusItem(item);
      }
      // Generic JSON array
      const engine = mapDriverToEngine(item.engine || item.driver || 'postgres');
      return {
        id: item.id,
        name: item.name || `${engine} - ${item.database || 'connection'}`,
        engine,
        env: mapEnv(item.env || item.environment, item.host),
        host: item.host || 'localhost',
        port: parseInt(item.port, 10) || DEFAULT_PORTS[engine] || 5432,
        database: item.database || 'postgres',
        username: item.username || item.user || 'postgres',
        password: item.password || '',
        useSsh: item.useSsh || false,
        sshHost: item.sshHost,
        sshPort: item.sshPort,
        sshUser: item.sshUser,
        sshPassword: item.sshPassword,
        useSshKey: item.useSshKey,
        sshKeyPath: item.sshKeyPath,
        groupName: item.groupName || item.group,
        sourceTool: 'generic',
        rawParams: item,
      };
    });
  }

  // CASE B: Single TablePlus item (e.g. *.tableplusconnection)
  if (parsedJson.Driver || parsedJson.DatabaseHost || parsedJson.ConnectionName) {
    return [transformTablePlusItem(parsedJson)];
  }

  // CASE C: DBeaver data-sources.json
  if (parsedJson.connections && typeof parsedJson.connections === 'object') {
    const results: ImportedConnectionItem[] = [];
    for (const [id, connObj] of Object.entries<any>(parsedJson.connections)) {
      const cfg = connObj.configuration || {};
      const provider = connObj.provider || connObj.driver || 'postgres';
      const engine = mapDriverToEngine(provider);
      const host = cfg.host || cfg.server || 'localhost';
      const port = parseInt(cfg.port, 10) || DEFAULT_PORTS[engine] || 5432;
      const database = cfg.database || 'postgres';
      const username = cfg.user || cfg.username || 'postgres';
      const password = cfg.password || '';
      const name = connObj.name || `${engine} - ${database}`;
      const env = mapEnv(connObj.environment || connObj.folder, host);
      const groupName = connObj.folder || undefined;

      results.push({
        id,
        name,
        engine,
        env,
        host,
        port,
        database,
        username,
        password,
        groupName,
        sourceTool: 'dbeaver',
        rawParams: connObj,
      });
    }
    if (results.length > 0) return results;
  }

  // CASE D: pgAdmin 4 servers.json
  if (parsedJson.Servers && typeof parsedJson.Servers === 'object') {
    const results: ImportedConnectionItem[] = [];
    for (const [id, srv] of Object.entries<any>(parsedJson.Servers)) {
      const name = srv.Name || `pgAdmin Server ${id}`;
      const host = srv.Host || srv.HostAddr || 'localhost';
      const port = parseInt(srv.Port, 10) || 5432;
      const database = srv.MaintenanceDB || 'postgres';
      const username = srv.Username || 'postgres';
      const groupName = srv.Group || undefined;
      const env = mapEnv(srv.Group, host);

      results.push({
        id,
        name,
        engine: 'postgres',
        env,
        host,
        port,
        database,
        username,
        password: '',
        groupName,
        sourceTool: 'pgadmin',
        rawParams: srv,
      });
    }
    if (results.length > 0) return results;
  }

  // CASE E: DBNerd backup format { connections: [...] }
  if (Array.isArray(parsedJson.connections)) {
    return parsedJson.connections.map((c: any) => ({
      ...c,
      engine: mapDriverToEngine(c.engine || 'postgres'),
      sourceTool: 'dbnerd',
    }));
  }

  // CASE F: Single generic connection JSON
  if (parsedJson.host || parsedJson.database || parsedJson.name) {
    const engine = mapDriverToEngine(parsedJson.engine || parsedJson.driver || 'postgres');
    return [
      {
        id: parsedJson.id,
        name: parsedJson.name || `${engine} - ${parsedJson.database || 'database'}`,
        engine,
        env: mapEnv(parsedJson.env || parsedJson.environment, parsedJson.host),
        host: parsedJson.host || 'localhost',
        port: parseInt(parsedJson.port, 10) || DEFAULT_PORTS[engine] || 5432,
        database: parsedJson.database || 'postgres',
        username: parsedJson.username || parsedJson.user || 'postgres',
        password: parsedJson.password || '',
        useSsh: parsedJson.useSsh || false,
        sshHost: parsedJson.sshHost,
        sshPort: parsedJson.sshPort,
        sshUser: parsedJson.sshUser,
        sshPassword: parsedJson.sshPassword,
        useSshKey: parsedJson.useSshKey,
        sshKeyPath: parsedJson.sshKeyPath,
        groupName: parsedJson.groupName || parsedJson.group,
        sourceTool: 'generic',
        rawParams: parsedJson,
      },
    ];
  }

  throw new Error('Unsupported connection file format. Please check file content.');
}
