import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateAutoFitColumnWidth,
  estimateInitialColumnWidths,
  measureTextWidth,
} from '../src/lib/grid/columnWidth.ts';
import { buildPaginatedSelectSql } from '../src/modules/grid/pagination.ts';
import { quoteIdentifier } from '../src/lib/security/sqlSanitizer.ts';

describe('TablePlus & Excel-Style Column Resize & Auto-Fit Engine', () => {
  it('calculates optimal auto-fit width for short content and clamps to minimum', () => {
    const colName = 'id';
    const sampleRows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const width = calculateAutoFitColumnWidth(colName, sampleRows, false, {
      minWidth: 70,
      maxWidth: 600,
    });

    assert.ok(width >= 70, `Width ${width} should be >= minWidth 70`);
    assert.ok(width <= 150, `Width ${width} should be compact for short numbers`);
  });

  it('calculates auto-fit width expanding to fit full UUIDs without truncation', () => {
    const colName = 'user_uuid';
    const sampleRows = [
      { user_uuid: 'fd9cbc08-e732-454d-8e91-9bda8aa6a782' },
      { user_uuid: '934ea277-3850-4fc1-a9f8-be70876bb062' },
    ];

    const width = calculateAutoFitColumnWidth(colName, sampleRows, true, {
      minWidth: 70,
      maxWidth: 650,
    });

    // 36 characters of UUID + padding + margins requires ~260-320px
    assert.ok(
      width >= 250,
      `Auto-fit width ${width} should be wide enough (>= 250px) to show full 36-char UUID`
    );
    assert.ok(
      width <= 400,
      `Auto-fit width ${width} should be bounded under 400px`
    );
  });

  it('clamps extremely wide content to maxWidth', () => {
    const colName = 'payload_json';
    const longString = 'x'.repeat(2000);
    const sampleRows = [{ payload_json: longString }];

    const width = calculateAutoFitColumnWidth(colName, sampleRows, false, {
      minWidth: 70,
      maxWidth: 500,
    });

    assert.strictEqual(width, 500, 'Width must be clamped to specified maxWidth');
  });

  it('estimates initial column widths cleanly based on data types and names', () => {
    const columns = [
      { name: 'id', type: 'integer', isPrimaryKey: true },
      { name: 'session_token', type: 'uuid' },
      { name: 'is_active', type: 'boolean' },
      { name: 'created_at', type: 'timestamptz' },
      { name: 'email', type: 'varchar' },
    ];

    const widths = estimateInitialColumnWidths(columns);

    assert.ok(widths.id >= 200, 'Primary key id column gets ample initial space');
    assert.ok(widths.session_token >= 200, 'UUID column gets wide initial space');
    assert.ok(widths.is_active <= 120, 'Boolean column gets narrow compact space');
    assert.ok(widths.created_at >= 180, 'Timestamp column gets proper date/time space');
    assert.ok(widths.email >= 200, 'Email column gets proper width');
  });

  it('measures text width safely in SSR/node environments without throwing', () => {
    const text = 'SELECT * FROM users;';
    const measured = measureTextWidth(text);
    assert.ok(measured > 0, 'Text measurement returns positive width');
  });
});

describe('Query-Driven ORDER BY Sorting Across Pagination & Filters', () => {
  it('generates server-side SELECT query with ORDER BY ASC', () => {
    const sql = buildPaginatedSelectSql({
      tableName: 'customers',
      engine: 'postgres',
      page: 0,
      pageSize: 300,
      orderByText: '"email" ASC',
    });

    assert.strictEqual(
      sql,
      'SELECT * FROM "customers" ORDER BY "email" ASC LIMIT 300 OFFSET 0;'
    );
  });

  it('preserves ORDER BY when moving to next page (page 1, page 2)', () => {
    const page1Sql = buildPaginatedSelectSql({
      tableName: 'customers',
      engine: 'postgres',
      page: 1,
      pageSize: 300,
      orderByText: '"created_at" DESC',
    });

    assert.strictEqual(
      page1Sql,
      'SELECT * FROM "customers" ORDER BY "created_at" DESC LIMIT 300 OFFSET 300;',
      'Page 1 retains ORDER BY with offset 300'
    );

    const page2Sql = buildPaginatedSelectSql({
      tableName: 'customers',
      engine: 'postgres',
      page: 2,
      pageSize: 300,
      orderByText: '"created_at" DESC',
    });

    assert.strictEqual(
      page2Sql,
      'SELECT * FROM "customers" ORDER BY "created_at" DESC LIMIT 300 OFFSET 600;',
      'Page 2 retains ORDER BY with offset 600'
    );
  });

  it('preserves both WHERE filter and ORDER BY sorting together across pages', () => {
    const sql = buildPaginatedSelectSql({
      tableName: 'orders',
      engine: 'postgres',
      page: 1,
      pageSize: 100,
      whereText: "status = 'completed'",
      orderByText: '"total_amount" DESC',
    });

    assert.strictEqual(
      sql,
      'SELECT * FROM "orders" WHERE status = \'completed\' ORDER BY "total_amount" DESC LIMIT 100 OFFSET 100;'
    );
  });

  it('quotes identifiers safely for PostgreSQL and MySQL in ORDER BY clauses', () => {
    const pgCol = quoteIdentifier('user_name', 'postgres');
    const myCol = quoteIdentifier('user_name', 'mysql');

    assert.strictEqual(pgCol, '"user_name"');
    assert.strictEqual(myCol, '`user_name`');

    const pgOrder = `${pgCol} ASC`;
    const myOrder = `${myCol} DESC`;

    const pgSql = buildPaginatedSelectSql({
      tableName: 'users',
      engine: 'postgres',
      page: 0,
      pageSize: 50,
      orderByText: pgOrder,
    });

    assert.strictEqual(pgSql, 'SELECT * FROM "users" ORDER BY "user_name" ASC LIMIT 50 OFFSET 0;');

    const mySql = buildPaginatedSelectSql({
      tableName: 'users',
      engine: 'mysql',
      page: 0,
      pageSize: 50,
      orderByText: myOrder,
    });

    assert.strictEqual(mySql, 'SELECT * FROM `users` ORDER BY `user_name` DESC LIMIT 50 OFFSET 0;');
  });
});
