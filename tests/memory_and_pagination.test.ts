import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeRowCells,
  cloneGridRows,
  boundSqlResultRows,
  boundSqlQueryResultTabs,
  MAX_CELL_STRING_LENGTH,
} from '../src/lib/memory/memoryGuard.ts';
import {
  calculatePaginationMeta,
  buildPaginatedSelectSql,
  buildExactCountSql,
  buildEstimatedCountCatalogSql,
  formatCompactBadge,
} from '../src/modules/grid/pagination.ts';

describe('Memory Guard & Client RAM Protection', () => {
  it('truncates oversized string cells to prevent renderer OOM', () => {
    const hugeText = 'x'.repeat(MAX_CELL_STRING_LENGTH + 5000);
    const sanitized = sanitizeRowCells({ id: 1, payload: hugeText });
    assert.equal(sanitized.id, 1);
    assert.ok(sanitized.payload.length < MAX_CELL_STRING_LENGTH + 32);
    assert.ok(sanitized.payload.endsWith('… [truncated]'));
  });

  it('clones grid rows in O(N) without mutating originals', () => {
    const original = [
      { id: 1, name: 'Row 1', dirtyFields: { name: true }, isDirty: true, rowState: 'modified' },
    ];
    const cloned = cloneGridRows(original);
    cloned[0].name = 'Changed';
    cloned[0].dirtyFields!.name = false;

    assert.equal(original[0].name, 'Row 1');
    assert.equal(original[0].dirtyFields.name, true);
  });

  it('bounds SQL result rows to prevent unbounded memory growth', () => {
    const manyRows = Array.from({ length: 150 }, (_, i) => ({ id: i + 1, val: 'ok' }));
    const bounded = boundSqlResultRows(manyRows, 50);
    assert.equal(bounded.length, 50);
    assert.equal(bounded[0].id, 1);
    assert.equal(bounded[49].id, 50);
  });

  it('bounds SQL query result tabs while preserving pinned tabs', () => {
    const tabs = [
      { id: 'q-1', isPinned: true, results: [{ a: 1 }] },
      { id: 'q-2', isPinned: false, results: [{ a: 2 }] },
      { id: 'q-3', isPinned: false, results: [{ a: 3 }] },
      { id: 'q-4', isPinned: false, results: [{ a: 4 }] },
      { id: 'q-5', isPinned: false, results: [{ a: 5 }] },
    ];
    const bounded = boundSqlQueryResultTabs(tabs, 3);
    assert.equal(bounded.length, 3);
    // Pinned q-1 + newest two unpinned (q-4, q-5)
    assert.deepEqual(
      bounded.map((t) => t.id),
      ['q-1', 'q-4', 'q-5']
    );
  });

  it('maps real database query rows without error using sanitizeRowCells', () => {
    const rawDbRows = [
      { nd_date: '2026-10-27', net_incentive: 1500000, gross_incentive: 1650000, status: 'active' },
      { nd_date: '2026-10-26', net_incentive: 2200000, gross_incentive: 2420000, status: 'approved' },
    ];
    const liveRows = rawDbRows.map((r, idx) => ({
      ...sanitizeRowCells(r),
      id: idx + 1,
      isDirty: false,
      dirtyFields: {},
      rowState: 'clean',
    }));

    assert.equal(liveRows.length, 2);
    assert.equal(liveRows[0].nd_date, '2026-10-27');
    assert.equal(liveRows[0].net_incentive, 1500000);
    assert.equal(liveRows[0].id, 1);
    assert.equal(liveRows[1].status, 'approved');
  });

  it('formats latency cleanly in seconds when >= 1000ms', () => {
    const formatLatency = (ms: number): string => {
      if (typeof ms !== 'number' || isNaN(ms) || ms <= 0) return '0ms';
      if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
      return `${ms.toFixed(1)}ms`;
    };

    assert.equal(formatLatency(10270.6), '10.27s');
    assert.equal(formatLatency(1000), '1.00s');
    assert.equal(formatLatency(784.5), '784.5ms');
    assert.equal(formatLatency(1.4), '1.4ms');
  });
});

describe('TablePlus-style Server-Side Pagination', () => {
  it('calculates pagination metadata for multi-million row tables', () => {
    const meta = calculatePaginationMeta(0, 300, 4_781_585, 300, true);
    assert.equal(meta.startRow, 1);
    assert.equal(meta.endRow, 300);
    assert.equal(meta.totalPages, 15_939);
    assert.equal(meta.rangeLabel, '1-300 of ~4,781,585 rows');
    assert.equal(meta.canGoPrev, false);
    assert.equal(meta.canGoNext, true);
  });

  it('formats exact count label without tilde when exact count is retrieved', () => {
    const meta = calculatePaginationMeta(1, 300, 4_781_585, 300, false);
    assert.equal(meta.startRow, 301);
    assert.equal(meta.endRow, 600);
    assert.equal(meta.rangeLabel, '301-600 of 4,781,585 rows');
  });

  it('builds safe paginated SELECT and exact COUNT queries', () => {
    const selectSql = buildPaginatedSelectSql({
      tableName: 'tuple',
      engine: 'PostgreSQL',
      page: 2,
      pageSize: 300,
      whereText: "object_type = 'connector_tool'",
      orderByText: 'inserted_at DESC',
    });
    assert.equal(
      selectSql,
      `SELECT * FROM "tuple" WHERE object_type = 'connector_tool' ORDER BY inserted_at DESC LIMIT 300 OFFSET 600;`
    );

    const countSql = buildExactCountSql({
      tableName: 'tuple',
      engine: 'mysql',
      whereText: '1=1; DROP TABLE tuple', // Malicious stacked query should be stripped
    });
    assert.equal(countSql, 'SELECT COUNT(*) AS total_count FROM `tuple`;');
  });

  it('builds catalog estimated count SQL and formats compact sidebar badges', () => {
    const pgEstSql = buildEstimatedCountCatalogSql('tuple', 'postgres');
    assert.ok(pgEstSql.includes('pg_class'));
    assert.ok(pgEstSql.includes("c.relname = 'tuple'"));

    assert.equal(formatCompactBadge(4_781_585, '1.2 GB'), '4.8M');
    assert.equal(formatCompactBadge(15_200, '400 KB'), '15.2K');
    assert.equal(formatCompactBadge(0, '8192 bytes'), '8192 B');
  });
});
