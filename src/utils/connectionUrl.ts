import { ConnectionProfile, DatabaseEngine, EnvironmentTag } from '../types';

export interface ParsedConnectionUrl {
  name?: string;
  engine: DatabaseEngine;
  env: EnvironmentTag;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  useSsh?: boolean;
  sshHost?: string;
  sshUser?: string;
  sshPort?: number;
  sshPassword?: string;
  useSshKey?: boolean;
  sshKeyPath?: string;
  statusColor?: string;
  rawParams?: Record<string, string>;
}

const DEFAULT_PORTS: Record<string, number> = {
  postgres: 5432,
  postgresql: 5432,
  mysql: 3306,
  mariadb: 3306,
  redis: 6379,
  clickhouse: 8123,
  duckdb: 0,
  sqlite: 0,
  snowflake: 443,
  sqlserver: 1433,
  mongodb: 27017,
};

/**
 * Normalizes engine alias, e.g. postgresql -> postgres
 */
export function normalizeEngine(scheme: string): DatabaseEngine {
  const clean = scheme.toLowerCase().trim();
  if (clean === 'postgresql' || clean === 'postgres') return 'postgres';
  if (clean === 'mariadb' || clean === 'mysql') return 'mysql';
  return clean as DatabaseEngine;
}

/**
 * Parses connection URL strings including:
 * 1. postgresql+ssh://sshUser@sshHost[:sshPort]/dbUser:dbPass@dbHost[:dbPort]/databaseName?queryParams...
 * 2. postgresql://dbUser:dbPass@dbHost[:dbPort]/databaseName?queryParams...
 * 3. mysql://user:pass@host:port/database...
 */
export function parseConnectionUrl(urlString: string): ParsedConnectionUrl {
  const trimmed = urlString.trim();
  if (!trimmed) {
    throw new Error('Connection URL cannot be empty');
  }

  // 1. Separate scheme
  const schemeMatch = trimmed.match(/^([a-zA-Z0-9_\-+]+):\/\/(.*)$/);
  if (!schemeMatch) {
    throw new Error('Invalid connection URL format: missing protocol scheme (e.g. postgresql:// or postgresql+ssh://)');
  }

  const rawScheme = schemeMatch[1].toLowerCase();
  const rest = schemeMatch[2];

  const useSsh = rawScheme.includes('+ssh');
  const baseScheme = rawScheme.replace('+ssh', '');
  const engine = normalizeEngine(baseScheme);

  // 2. Split query params if present
  let pathPart = rest;
  let queryString = '';
  const questionIdx = rest.indexOf('?');
  if (questionIdx !== -1) {
    pathPart = rest.substring(0, questionIdx);
    queryString = rest.substring(questionIdx + 1);
  }

  const queryParams: Record<string, string> = {};
  if (queryString) {
    const searchParams = new URLSearchParams(queryString);
    searchParams.forEach((val, key) => {
      queryParams[key] = val;
    });
  }

  let sshUser = '';
  let sshPassword = '';
  let sshHost = '';
  let sshPort = 22;
  let dbPart = pathPart;

  // 3. Handle SSH prefix if present
  if (useSsh) {
    // Format: sshUser[:sshPassword]@sshHost[:sshPort]/dbUser:dbPass@dbHost...
    const firstSlashIdx = pathPart.indexOf('/');
    if (firstSlashIdx !== -1) {
      const sshSegment = pathPart.substring(0, firstSlashIdx);
      dbPart = pathPart.substring(firstSlashIdx + 1);

      if (sshSegment.includes('@')) {
        const [userPass, hostPort] = sshSegment.split('@');
        if (userPass.includes(':')) {
          const colonIdx = userPass.indexOf(':');
          sshUser = decodeURIComponent(userPass.substring(0, colonIdx));
          sshPassword = decodeURIComponent(userPass.substring(colonIdx + 1));
        } else {
          sshUser = decodeURIComponent(userPass);
        }

        if (hostPort.includes(':')) {
          const [h, p] = hostPort.split(':');
          sshHost = decodeURIComponent(h);
          sshPort = parseInt(p, 10) || 22;
        } else {
          sshHost = decodeURIComponent(hostPort);
        }
      } else {
        if (sshSegment.includes(':')) {
          const [h, p] = sshSegment.split(':');
          sshHost = decodeURIComponent(h);
          sshPort = parseInt(p, 10) || 22;
        } else {
          sshHost = decodeURIComponent(sshSegment);
        }
      }
    }
  }

  // 4. Handle DB credentials and host: dbUser:dbPass@dbHost[:dbPort]/databaseName
  let username = 'postgres';
  let password = '';
  let host = 'localhost';
  let port = DEFAULT_PORTS[engine] || 5432;
  let database = 'postgres';

  const atIdx = dbPart.indexOf('@');
  let hostAndDbPart = dbPart;

  if (atIdx !== -1) {
    const credsPart = dbPart.substring(0, atIdx);
    hostAndDbPart = dbPart.substring(atIdx + 1);

    if (credsPart.includes(':')) {
      const colonIdx = credsPart.indexOf(':');
      username = decodeURIComponent(credsPart.substring(0, colonIdx));
      password = decodeURIComponent(credsPart.substring(colonIdx + 1));
    } else {
      username = decodeURIComponent(credsPart);
    }
  }

  // hostAndDbPart: host[:port]/database
  const slashIdx = hostAndDbPart.indexOf('/');
  let hostPortPart = hostAndDbPart;
  if (slashIdx !== -1) {
    hostPortPart = hostAndDbPart.substring(0, slashIdx);
    const dbName = hostAndDbPart.substring(slashIdx + 1);
    if (dbName) {
      database = decodeURIComponent(dbName);
    }
  }

  if (hostPortPart.includes(':')) {
    const [h, p] = hostPortPart.split(':');
    host = decodeURIComponent(h);
    const parsedPort = parseInt(p, 10);
    if (!isNaN(parsedPort) && parsedPort > 0) {
      port = parsedPort;
    }
  } else if (hostPortPart) {
    host = decodeURIComponent(hostPortPart);
  }

  // 5. Read query param overrides
  let name = queryParams['name'] ? decodeURIComponent(queryParams['name']) : undefined;
  if (!name) {
    name = `${database} (${host})`;
  }

  let env: EnvironmentTag = 'local';
  if (queryParams['env']) {
    const rawEnv = queryParams['env'].toLowerCase();
    if (rawEnv === 'prod' || rawEnv === 'production') env = 'prod';
    else if (rawEnv === 'staging' || rawEnv === 'stage' || rawEnv === 'qa') env = 'staging';
    else env = 'local';
  } else if (name.toLowerCase().includes('production') || name.toLowerCase().includes('prod')) {
    env = 'prod';
  } else if (name.toLowerCase().includes('staging')) {
    env = 'staging';
  }

  const useSshKey =
    queryParams['usePrivateKey'] === 'true' ||
    queryParams['usePrivateKey'] === '1' ||
    Boolean(queryParams['privateKeyPath']) ||
    Boolean(queryParams['sshKeyPath']) ||
    (useSsh && !sshPassword);

  const sshKeyPath =
    queryParams['privateKeyPath'] ||
    queryParams['sshKeyPath'] ||
    (useSshKey ? (name.toLowerCase().includes('vigo') ? '~/.ssh/vigo/id_rsa' : 'id_rsa') : undefined);

  return {
    name,
    engine,
    env,
    host,
    port,
    database,
    username,
    password,
    useSsh,
    sshHost: sshHost || (useSsh ? '13.212.189.147' : undefined),
    sshUser: sshUser || (useSsh ? 'ec2-user' : undefined),
    sshPort: sshPort || 22,
    sshPassword: sshPassword || undefined,
    useSshKey: useSsh ? useSshKey : undefined,
    sshKeyPath: useSsh ? (sshKeyPath || 'id_rsa') : undefined,
    statusColor: queryParams['statusColor'],
    rawParams: queryParams,
  };
}

/**
 * Serializes a ConnectionProfile into a TablePlus-compatible connection URL.
 */
export function serializeConnectionUrl(conn: ConnectionProfile): string {
  const engine = conn.engine === 'postgres' ? 'postgresql' : conn.engine;
  const creds = `${encodeURIComponent(conn.username || '')}${conn.password ? `:${encodeURIComponent(conn.password)}` : ''}`;
  const hostPort = `${conn.host || 'localhost'}${conn.port ? `:${conn.port}` : ''}`;
  const db = conn.database || 'postgres';

  const params = new URLSearchParams();
  if (conn.name) params.set('name', conn.name);
  if (conn.env) params.set('env', conn.env);
  params.set('tLSMode', '0');

  if (conn.useSsh && conn.sshHost) {
    let sshCreds = '';
    if (conn.sshUser) {
      sshCreds = encodeURIComponent(conn.sshUser);
      if (conn.sshPassword) {
        sshCreds += `:${encodeURIComponent(conn.sshPassword)}`;
      }
      sshCreds += '@';
    }
    const sshHostPort = `${conn.sshHost}${conn.sshPort && conn.sshPort !== 22 ? `:${conn.sshPort}` : ''}`;
    if (conn.useSshKey) {
      params.set('usePrivateKey', 'true');
      if (conn.sshKeyPath) {
        params.set('privateKeyPath', conn.sshKeyPath);
      }
    }
    return `${engine}+ssh://${sshCreds}${sshHostPort}/${creds}@${hostPort}/${db}?${params.toString()}`;
  }

  return `${engine}://${creds}@${hostPort}/${db}?${params.toString()}`;
}
