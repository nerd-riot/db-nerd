import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordCrashReport,
  getPersistedCrashReports,
  clearPersistedCrashReports,
  exportCrashDiagnostics,
  MAX_CRASH_REPORTS,
  CRASH_STORAGE_KEY,
} from '../src/lib/diagnostics/crashReporter.ts';

// Mock localStorage for node test runner
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

describe('Crash Reporter & Diagnostics Buffer Engine', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      localStorage: new MockLocalStorage(),
      location: { href: 'http://localhost:1420/' },
    };
    (globalThis as any).localStorage = (globalThis as any).window.localStorage;
    clearPersistedCrashReports();
  });

  it('records an Error with stack and metadata', () => {
    const error = new Error('Database connection reset by peer');
    const item = recordCrashReport('error', error, { engine: 'postgres', port: 5432 });

    assert.equal(item.type, 'error');
    assert.equal(item.message, 'Database connection reset by peer');
    assert.ok(item.stack?.includes('Error: Database connection reset by peer'));
    assert.deepEqual(item.meta, { engine: 'postgres', port: 5432 });

    const saved = getPersistedCrashReports();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, item.id);
  });

  it('deduplicates identical crash reports occurring within 5 seconds', () => {
    const error = new Error('Socket timeout exception');
    recordCrashReport('unhandledrejection', error);
    recordCrashReport('unhandledrejection', error);
    recordCrashReport('unhandledrejection', error);

    const saved = getPersistedCrashReports();
    assert.equal(saved.length, 1, 'Identical consecutive errors must be deduplicated');
  });

  it('enforces maximum ring buffer capacity (MAX_CRASH_REPORTS)', () => {
    for (let i = 0; i < MAX_CRASH_REPORTS + 10; i++) {
      recordCrashReport('error', `Unique error message #${i}`);
    }

    const saved = getPersistedCrashReports();
    assert.equal(saved.length, MAX_CRASH_REPORTS);
    // Newest error should be first
    assert.equal(saved[0].message, `Unique error message #${MAX_CRASH_REPORTS + 9}`);
  });

  it('exports formatted diagnostics summary JSON', () => {
    recordCrashReport('boundary', 'Uncaught render error in TableGrid');
    const exportedJson = exportCrashDiagnostics();
    const parsed = JSON.parse(exportedJson);

    assert.equal(parsed.app, 'DB Nerd');
    assert.equal(parsed.reportCount, 1);
    assert.equal(parsed.reports[0].message, 'Uncaught render error in TableGrid');
  });

  it('clears persisted crash reports cleanly', () => {
    recordCrashReport('panic', 'Backend worker aborted');
    assert.equal(getPersistedCrashReports().length, 1);

    clearPersistedCrashReports();
    assert.equal(getPersistedCrashReports().length, 0);
  });
});
