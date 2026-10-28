import type { QueryHistoryItem, HistoryTtl } from '../../types/index.ts';
import { safeSetLocalStorage } from './sessionPersistence.ts';

export const HISTORY_STORAGE_KEY = 'dbnerd_query_history';
export const MAX_PERSISTED_HISTORY_ITEMS = 500;
export const MAX_PERSISTED_SQL_CHARS = 16_384;

/**
 * Default fallback queries for fresh installs when no previous history exists.
 */
export const DEFAULT_QUERY_HISTORY: QueryHistoryItem[] = [
  {
    id: 'h-demo-1',
    connectionName: 'ecom_prod_db',
    env: 'prod',
    sql: 'SELECT u.id, u.email, COUNT(o.id) AS total_orders\nFROM users u\nLEFT JOIN user_orders o ON u.id = o.user_id\nWHERE u.status = \'active\'\nGROUP BY u.id, u.email\nORDER BY total_orders DESC LIMIT 50;',
    timestamp: 'Yesterday at 14:22:15',
    timestampMs: Date.now() - 86_400_000,
    durationMs: 1.8,
    rowsAffected: 50,
    status: 'success',
    isFavorite: true,
  },
  {
    id: 'h-demo-2',
    connectionName: 'staging-mysql-8',
    env: 'staging',
    sql: 'UPDATE user_orders SET status = \'refunded\', updated_at = NOW() WHERE id = 1035;',
    timestamp: 'Yesterday at 11:05:40',
    timestampMs: Date.now() - 90_000_000,
    durationMs: 4.2,
    rowsAffected: 1,
    status: 'success',
    isFavorite: false,
  },
];

/**
 * Returns TTL duration in milliseconds for a given retention setting.
 */
export function getHistoryTtlMs(ttl?: HistoryTtl): number {
  switch (ttl) {
    case '1-day':
      return 1 * 24 * 60 * 60 * 1000;
    case '7-days':
      return 7 * 24 * 60 * 60 * 1000;
    case '30-days':
      return 30 * 24 * 60 * 60 * 1000;
    case '90-days':
      return 90 * 24 * 60 * 60 * 1000;
    case 'never':
      return Infinity;
    default:
      return 30 * 24 * 60 * 60 * 1000; // Default to 30 days
  }
}

/**
 * Resolves epoch milliseconds for an item.
 * Tries `timestampMs`, falls back to extracting timestamp from `id` (e.g. h-1730000000000-0),
 * or falls back to Date.now().
 */
export function parseItemTimestamp(item: QueryHistoryItem): number {
  if (typeof item.timestampMs === 'number' && Number.isFinite(item.timestampMs)) {
    return item.timestampMs;
  }

  // Attempt to parse epoch from id: "h-1730123456789-0" or "h-1730123456789"
  if (item.id && item.id.startsWith('h-')) {
    const parts = item.id.split('-');
    if (parts.length >= 2) {
      const parsedNum = Number(parts[1]);
      if (Number.isFinite(parsedNum) && parsedNum > 1_000_000_000_000) {
        return parsedNum;
      }
    }
  }

  return Date.now();
}

/**
 * Purges history items older than the TTL.
 * Starred/favorite items are never purged automatically.
 */
export function purgeHistoryByTtl(
  items: QueryHistoryItem[],
  ttl: HistoryTtl = '30-days',
  nowMs = Date.now()
): { kept: QueryHistoryItem[]; purgedCount: number } {
  const ttlMs = getHistoryTtlMs(ttl);
  if (ttlMs === Infinity) {
    return { kept: [...items], purgedCount: 0 };
  }

  const cutoff = nowMs - ttlMs;
  let purgedCount = 0;

  const kept = items.filter((item) => {
    // Starred/favorite queries are protected from automatic TTL purge
    if (item.isFavorite) {
      return true;
    }

    const itemTime = parseItemTimestamp(item);
    if (itemTime < cutoff) {
      purgedCount++;
      return false;
    }

    return true;
  });

  return { kept, purgedCount };
}

/**
 * Persists query history items to localStorage.
 * Truncates SQL bodies longer than MAX_PERSISTED_SQL_CHARS and keeps maximum
 * MAX_PERSISTED_HISTORY_ITEMS to prevent local storage bloat.
 */
export function persistHistory(items: QueryHistoryItem[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const sanitized = (items || []).slice(0, MAX_PERSISTED_HISTORY_ITEMS).map((item) => ({
      ...item,
      sql:
        item.sql && item.sql.length > MAX_PERSISTED_SQL_CHARS
          ? item.sql.slice(0, MAX_PERSISTED_SQL_CHARS)
          : item.sql,
      timestampMs: parseItemTimestamp(item),
    }));

    safeSetLocalStorage(HISTORY_STORAGE_KEY, JSON.stringify(sanitized));
  } catch (err) {
    console.warn('Failed to persist query history:', err);
  }
}

/**
 * Loads persisted query history from localStorage.
 * Runs TTL purge automatically so expired records are trimmed.
 */
export function loadPersistedHistory(ttl: HistoryTtl = '30-days'): QueryHistoryItem[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_QUERY_HISTORY;
  }

  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (raw === null) {
      // First run: save and return default queries
      persistHistory(DEFAULT_QUERY_HISTORY);
      return DEFAULT_QUERY_HISTORY;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    // Purge records older than TTL
    const { kept, purgedCount } = purgeHistoryByTtl(parsed, ttl);
    if (purgedCount > 0) {
      persistHistory(kept);
    }

    return kept;
  } catch (e) {
    console.warn('Failed to load persisted query history:', e);
    return [];
  }
}

/**
 * Clears persisted history. If connectionId is provided, only deletes history
 * belonging to that connection. Otherwise, deletes all history.
 */
export function clearPersistedHistory(connectionId?: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  if (!connectionId) {
    persistHistory([]);
    return;
  }

  try {
    const current = loadPersistedHistory('never');
    const remaining = current.filter((h) => h.connectionId !== connectionId);
    persistHistory(remaining);
  } catch {}
}
