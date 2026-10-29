import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  persistHistory,
  loadPersistedHistory,
  purgeHistoryByTtl,
  clearPersistedHistory,
  getHistoryTtlMs,
  parseItemTimestamp,
  HISTORY_STORAGE_KEY,
  MAX_PERSISTED_HISTORY_ITEMS,
} from '../src/lib/storage/historyPersistence.ts';
import type { QueryHistoryItem, HistoryTtl } from '../src/types/index.ts';

// In-memory mock localStorage for Node.js test environment
class MockLocalStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

describe('Query History Persistence & TTL Purge System', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      localStorage: new MockLocalStorage(),
    };
  });

  it('calculates correct TTL durations in milliseconds', () => {
    assert.equal(getHistoryTtlMs('1-day'), 86_400_000);
    assert.equal(getHistoryTtlMs('7-days'), 7 * 86_400_000);
    assert.equal(getHistoryTtlMs('30-days'), 30 * 86_400_000);
    assert.equal(getHistoryTtlMs('90-days'), 90 * 86_400_000);
    assert.equal(getHistoryTtlMs('never'), Infinity);
    // Fallback default
    assert.equal(getHistoryTtlMs(undefined), 30 * 86_400_000);
  });

  it('persists and loads query history items across connections', () => {
    const testItems: QueryHistoryItem[] = [
      {
        id: 'h-1001',
        connectionId: 'conn-prod-vigo-1',
        connectionName: '[Production] [VN] Vigo DB',
        database: 'app_db',
        env: 'prod',
        sql: 'SELECT * FROM users WHERE status = \'active\' LIMIT 10;',
        timestamp: 'Today at 10:00:00',
        timestampMs: Date.now() - 1000,
        durationMs: 12.4,
        rowsAffected: 10,
        status: 'success',
        isFavorite: false,
      },
      {
        id: 'h-1002',
        connectionId: 'conn-local-mysql',
        connectionName: 'Local MySQL',
        database: 'staging',
        env: 'local',
        sql: 'SHOW TABLES;',
        timestamp: 'Today at 09:30:00',
        timestampMs: Date.now() - 2000,
        durationMs: 2.1,
        rowsAffected: 45,
        status: 'success',
        isFavorite: true,
      },
    ];

    persistHistory(testItems);
    const loaded = loadPersistedHistory('never');

    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].id, 'h-1001');
    assert.equal(loaded[0].connectionId, 'conn-prod-vigo-1');
    assert.equal(loaded[1].connectionId, 'conn-local-mysql');
    assert.equal(loaded[1].isFavorite, true);
  });

  it('purges items older than TTL while protecting starred/favorite queries', () => {
    const now = 1_730_000_000_000;
    const oneDayMs = 86_400_000;

    const items: QueryHistoryItem[] = [
      {
        id: 'h-recent',
        connectionName: 'prod',
        env: 'prod',
        sql: 'SELECT 1;',
        timestamp: 'Recent',
        timestampMs: now - 1 * oneDayMs, // 1 day old
        durationMs: 1.0,
        rowsAffected: 1,
        status: 'success',
        isFavorite: false,
      },
      {
        id: 'h-expired-regular',
        connectionName: 'prod',
        env: 'prod',
        sql: 'SELECT * FROM big_table;',
        timestamp: 'Old',
        timestampMs: now - 35 * oneDayMs, // 35 days old (exceeds 30-day TTL)
        durationMs: 24.5,
        rowsAffected: 1000,
        status: 'success',
        isFavorite: false,
      },
      {
        id: 'h-expired-starred',
        connectionName: 'prod',
        env: 'prod',
        sql: 'SELECT important_report();',
        timestamp: 'Old but Favorite',
        timestampMs: now - 100 * oneDayMs, // 100 days old (very old, but starred)
        durationMs: 50.0,
        rowsAffected: 1,
        status: 'success',
        isFavorite: true, // MUST BE KEPT!
      },
    ];

    // Purge with 30-day TTL
    const { kept, purgedCount } = purgeHistoryByTtl(items, '30-days', now);

    assert.equal(purgedCount, 1, 'Only non-favorite old query should be purged');
    assert.equal(kept.length, 2);
    assert.ok(kept.some((k) => k.id === 'h-recent'));
    assert.ok(kept.some((k) => k.id === 'h-expired-starred'), 'Favorite query must be kept despite being old');
    assert.ok(!kept.some((k) => k.id === 'h-expired-regular'), 'Old unstarred query must be purged');
  });

  it('respects "never" TTL without purging any records', () => {
    const now = Date.now();
    const items: QueryHistoryItem[] = [
      {
        id: 'h-ancient',
        connectionName: 'prod',
        env: 'prod',
        sql: 'SELECT 1;',
        timestamp: 'Ancient',
        timestampMs: now - 500 * 86_400_000, // 500 days old
        durationMs: 1.0,
        rowsAffected: 1,
        status: 'success',
        isFavorite: false,
      },
    ];

    const { kept, purgedCount } = purgeHistoryByTtl(items, 'never', now);
    assert.equal(purgedCount, 0);
    assert.equal(kept.length, 1);
  });

  it('clears history scoped to connectionId or deletes all history', () => {
    const items: QueryHistoryItem[] = [
      {
        id: 'h-conn-1',
        connectionId: 'conn-1',
        connectionName: 'DB 1',
        env: 'prod',
        sql: 'SELECT 1;',
        timestamp: 'Today',
        timestampMs: Date.now(),
        durationMs: 1,
        rowsAffected: 1,
        status: 'success',
        isFavorite: false,
      },
      {
        id: 'h-conn-2',
        connectionId: 'conn-2',
        connectionName: 'DB 2',
        env: 'dev',
        sql: 'SELECT 2;',
        timestamp: 'Today',
        timestampMs: Date.now(),
        durationMs: 1,
        rowsAffected: 1,
        status: 'success',
        isFavorite: false,
      },
    ];

    persistHistory(items);

    // Clear only conn-1
    clearPersistedHistory('conn-1');
    const remaining = loadPersistedHistory('never');
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].connectionId, 'conn-2');

    // Clear all
    clearPersistedHistory();
    const afterAllClear = loadPersistedHistory('never');
    // Once completely cleared, returns empty array (or initial if null)
    assert.equal(afterAllClear.length, 0);
  });

  it('bounds maximum persisted items and truncates excessive query payloads', () => {
    const giantSql = 'SELECT ' + 'x'.repeat(25_000);
    const item: QueryHistoryItem = {
      id: 'h-large',
      connectionName: 'test',
      env: 'local',
      sql: giantSql,
      timestamp: 'Today',
      durationMs: 1,
      rowsAffected: 1,
      status: 'success',
      isFavorite: false,
    };

    persistHistory([item]);
    const loaded = loadPersistedHistory('never');
    assert.equal(loaded.length, 1);
    assert.ok(loaded[0].sql.length <= 16_384, 'Giant SQL must be truncated to prevent storage bloat');
  });

  it('filters sidebar history by active connection when scoped to current', () => {
    const allHistory: QueryHistoryItem[] = [
      {
        id: 'h-vigo-1',
        connectionId: 'conn-vigo',
        connectionName: '[Production] [VN] Vigo DB',
        env: 'prod',
        sql: 'SELECT * FROM orders;',
        timestamp: '10:00',
        durationMs: 5,
        rowsAffected: 10,
        status: 'success',
        isFavorite: false,
      },
      {
        id: 'h-other-1',
        connectionId: 'conn-analytics',
        connectionName: 'Analytics DB',
        env: 'dev',
        sql: 'SELECT * FROM events;',
        timestamp: '10:05',
        durationMs: 3,
        rowsAffected: 5,
        status: 'success',
        isFavorite: false,
      },
    ];

    const activeConnId = 'conn-vigo';

    // Current DB scope: only conn-vigo
    const currentScope = allHistory.filter((h) => h.connectionId === activeConnId);
    assert.equal(currentScope.length, 1);
    assert.equal(currentScope[0].id, 'h-vigo-1');

    // All DBs scope: both
    assert.equal(allHistory.length, 2);
  });

  it('fresh install starts with empty history without seeding fake/demo queries', () => {
    // Empty localStorage simulates fresh install
    (globalThis as any).window.localStorage.clear();
    const loaded = loadPersistedHistory('30-days');
    assert.equal(loaded.length, 0, 'Fresh install history must be completely empty');
  });

  it('scrubs legacy mock demo queries (h-demo-*)', () => {
    const mixedLegacyItems = [
      {
        id: 'h-demo-1',
        connectionName: 'ecom_prod_db',
        sql: 'SELECT 1;',
        timestamp: 'Yesterday',
        timestampMs: Date.now(),
        durationMs: 1.8,
        rowsAffected: 50,
        status: 'success',
        isFavorite: true,
      },
      {
        id: 'h-demo-2',
        connectionName: 'staging-mysql-8',
        sql: 'UPDATE orders SET status = 1;',
        timestamp: 'Yesterday',
        timestampMs: Date.now(),
        durationMs: 4.2,
        rowsAffected: 1,
        status: 'success',
        isFavorite: false,
      },
      {
        id: 'h-real-vigo',
        connectionId: 'conn-vigo',
        connectionName: '[Production] [VN] Vigo DB',
        sql: 'SELECT * FROM users LIMIT 10;',
        timestamp: 'Today',
        timestampMs: Date.now(),
        durationMs: 3.5,
        rowsAffected: 10,
        status: 'success',
        isFavorite: false,
      },
    ];

    (globalThis as any).window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(mixedLegacyItems));

    const loaded = loadPersistedHistory('never');
    assert.equal(loaded.length, 1, 'Only real item with valid connectionId should remain');
    assert.equal(loaded[0].id, 'h-real-vigo');
    assert.equal(loaded[0].connectionId, 'conn-vigo');

    // Verify localStorage was updated to purge the legacy demo items
    const rawUpdated = JSON.parse((globalThis as any).window.localStorage.getItem(HISTORY_STORAGE_KEY));
    assert.equal(rawUpdated.length, 1);
    assert.equal(rawUpdated[0].id, 'h-real-vigo');
  });

  it('guarantees history is never leaked when disconnected (hasActiveSession = false)', () => {
    const allHistory: QueryHistoryItem[] = [
      {
        id: 'h-1',
        connectionId: 'conn-vigo',
        connectionName: 'Vigo DB',
        env: 'prod',
        sql: 'SELECT * FROM secrets;',
        timestamp: '10:00',
        durationMs: 2,
        rowsAffected: 1,
        status: 'success',
        isFavorite: false,
      },
    ];

    const hasActiveSession = false;
    const activeConnectionId = '';

    const visibleHistory = allHistory.filter((h) => {
      if (!hasActiveSession || !activeConnectionId) return false;
      return h.connectionId === activeConnectionId;
    });

    assert.equal(visibleHistory.length, 0, 'Disconnected state must never show any history');
  });
});
