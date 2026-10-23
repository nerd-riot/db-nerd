import { ConnectionGroup, ConnectionProfile, QueryHistoryItem } from '../types';

const GROUPS_STORAGE_KEY = 'db_nerd_connection_groups_v1';
const CONNECTIONS_STORAGE_KEY = 'db_nerd_connections_v1';
const HISTORY_STORAGE_KEY = 'db_nerd_query_history_v1';
const MAX_PERSISTED_HISTORY = 200;

export function loadPersistedGroups(fallback: ConnectionGroup[]): ConnectionGroup[] {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = localStorage.getItem(GROUPS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.warn('Failed to load persisted connection groups:', err);
  }
  return fallback;
}

export function savePersistedGroups(groups: ConnectionGroup[]): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups));
  } catch (err) {
    console.warn('Failed to persist connection groups:', err);
  }
}

export function loadPersistedConnections(fallback: ConnectionProfile[]): ConnectionProfile[] {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = localStorage.getItem(CONNECTIONS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.warn('Failed to load persisted connections:', err);
  }
  return fallback;
}

export function savePersistedConnections(connections: ConnectionProfile[]): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(connections));
  } catch (err) {
    console.warn('Failed to persist connections:', err);
  }
}

export function loadPersistedHistory(fallback: QueryHistoryItem[]): QueryHistoryItem[] {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.warn('Failed to load persisted query history:', err);
  }
  return fallback;
}

export function savePersistedHistory(history: QueryHistoryItem[]): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(0, MAX_PERSISTED_HISTORY))
    );
  } catch (err) {
    console.warn('Failed to persist query history:', err);
  }
}

/**
 * Parses imported JSON or XML connection profile files into ConnectionProfile payloads.
 */
export function parseImportedProfiles(
  content: string,
  defaultGroupId: string
): Omit<ConnectionProfile, 'id'>[] {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('File is empty');
  }

  // 1. JSON format (single profile object or array of profiles)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.connections)
      ? parsed.connections
      : [parsed];

    return items
      .filter((item: any) => item && typeof item === 'object')
      .map((item: any) => ({
        name: String(item.name || item.DatabaseName || `${item.database || 'db'} (${item.host || 'localhost'})`),
        groupId: String(item.groupId || defaultGroupId),
        engine: item.engine || 'postgres',
        env: item.env === 'prod' || item.env === 'staging' ? item.env : 'local',
        host: String(item.host || item.Host || 'localhost'),
        port: Number(item.port || item.Port) || 5432,
        database: String(item.database || item.Database || 'postgres'),
        username: String(item.username || item.User || 'postgres'),
        password: item.password ? String(item.password) : '',
        useSsh: Boolean(item.useSsh || item.sshHost),
        sshHost: item.sshHost ? String(item.sshHost) : '',
        sshPort: Number(item.sshPort) || 22,
        sshUser: item.sshUser ? String(item.sshUser) : '',
        sshPassword: item.sshPassword ? String(item.sshPassword) : '',
        useSshKey: item.useSshKey ?? true,
        sshKeyPath: item.sshKeyPath ? String(item.sshKeyPath) : '',
        active: false,
        latencyMs: 1.0,
        safeMode: item.safeMode || (item.env === 'prod' ? 'alert-2' : 'silent'),
      }));
  }

  // 2. XML format (TablePlus / DBeaver / Navicat style XML)
  if (trimmed.startsWith('<')) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, 'application/xml');
    const parseErr = doc.querySelector('parsererror');
    if (parseErr) {
      throw new Error('Invalid XML format');
    }

    const nodes = Array.from(doc.querySelectorAll('connection, Connection, dict, server'));
    if (nodes.length === 0) {
      throw new Error('No <connection> elements found in XML file');
    }

    return nodes.map((node, idx) => {
      const getAttrOrTag = (names: string[], fallbackVal: string) => {
        for (const n of names) {
          const attr = node.getAttribute(n);
          if (attr) return attr;
          const child = node.querySelector(n);
          if (child?.textContent) return child.textContent.trim();
        }
        return fallbackVal;
      };

      const engine = getAttrOrTag(['engine', 'driver', 'type', 'Driver'], 'postgres').toLowerCase();
      const host = getAttrOrTag(['host', 'Host', 'server'], 'localhost');
      const port = Number(getAttrOrTag(['port', 'Port'], '5432')) || 5432;
      const database = getAttrOrTag(['database', 'Database', 'db'], 'postgres');
      const username = getAttrOrTag(['username', 'user', 'User'], 'postgres');
      const name = getAttrOrTag(['name', 'Name', 'ConnectionName'], `${database} (${host}) #${idx + 1}`);

      return {
        name,
        groupId: defaultGroupId,
        engine,
        env: name.toLowerCase().includes('prod') ? 'prod' : 'local',
        host,
        port,
        database,
        username,
        password: '',
        useSsh: false,
        active: false,
        latencyMs: 1.0,
        safeMode: name.toLowerCase().includes('prod') ? 'alert-2' : 'silent',
      };
    });
  }

  throw new Error('Unsupported file format. Expected JSON or XML connection definitions.');
}
