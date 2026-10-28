import type { SqlTabState, TabItem } from '../../types/index.ts';

/** Maximum characters per SQL query persisted in localStorage (64 KB) */
const MAX_PERSISTED_SQL_CHARS = 65_536;

/** Maximum tabs persisted per connection session */
const MAX_PERSISTED_TABS = 25;

export interface PersistedSessionTabs {
  tabs: TabItem[];
  activeTabId: string;
  selectedTable: string;
  sqlQueries?: Record<string, string>;
}

/**
 * Safely writes to localStorage with QuotaExceededError protection.
 */
export function safeSetLocalStorage(key: string, value: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Persists open tab metadata and SQL editor text (excluding heavy result sets!)
 * for a given connection ID.
 */
export function persistSessionTabs(
  connId: string,
  tabs: TabItem[],
  activeTabId: string,
  selectedTable: string,
  sqlTabStates: Record<string, SqlTabState>
): void {
  if (!connId) return;
  const boundedTabs = (tabs || []).slice(0, MAX_PERSISTED_TABS);
  const keptIds = new Set(boundedTabs.map((t) => t.id));
  const sqlQueries: Record<string, string> = {};

  for (const [tId, sState] of Object.entries(sqlTabStates || {})) {
    if (keptIds.has(tId) && sState?.query) {
      sqlQueries[tId] =
        sState.query.length > MAX_PERSISTED_SQL_CHARS
          ? sState.query.slice(0, MAX_PERSISTED_SQL_CHARS)
          : sState.query;
    }
  }

  safeSetLocalStorage(
    `dbnerd_session_tabs_${connId}`,
    JSON.stringify({
      tabs: boundedTabs,
      activeTabId,
      selectedTable,
      sqlQueries,
    })
  );
}

/**
 * Loads persisted session tabs for a connection ID.
 */
export function loadSessionTabs(connId: string): PersistedSessionTabs | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage && connId) {
      const raw = window.localStorage.getItem(`dbnerd_session_tabs_${connId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.tabs)) return parsed;
      }
    }
  } catch {}
  return null;
}

/**
 * Removes persisted session tab storage when a connection is deleted.
 */
export function removeSessionTabsStorage(connId: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage && connId) {
      window.localStorage.removeItem(`dbnerd_session_tabs_${connId}`);
    }
  } catch {}
}
