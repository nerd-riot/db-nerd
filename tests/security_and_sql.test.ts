import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDatabaseEngine,
  quoteIdentifier,
  escapeSqlStringLiteral,
  sanitizeFilterClause,
  maskConnectionUrl,
} from '../src/lib/security/sqlSanitizer.ts';
import {
  formatSqlLiteralValue,
  resolveRowPrimaryKey,
  buildPendingTransactionSql,
} from '../src/lib/db/dmlGenerator.ts';

describe('SQL Sanitizer & Security Guards', () => {
  it('normalizes database engine names accurately', () => {
    assert.equal(normalizeDatabaseEngine('PostgreSQL'), 'postgres');
    assert.equal(normalizeDatabaseEngine('postgres'), 'postgres');
    assert.equal(normalizeDatabaseEngine('Aurora-PostgreSQL'), 'postgres');
    assert.equal(normalizeDatabaseEngine('MariaDB'), 'mysql');
    assert.equal(normalizeDatabaseEngine('MySQL'), 'mysql');
    assert.equal(normalizeDatabaseEngine('Redis'), 'redis');
    assert.equal(normalizeDatabaseEngine('Valkey'), 'redis');
    assert.equal(normalizeDatabaseEngine('Snowflake'), 'snowflake');
  });

  it('quotes SQL identifiers safely and prevents identifier breakout', () => {
    assert.equal(quoteIdentifier('users', 'postgres'), '"users"');
    assert.equal(quoteIdentifier('users', 'mysql'), '`users`');
    assert.equal(quoteIdentifier('public.user_orders', 'postgres'), '"public"."user_orders"');
    assert.equal(quoteIdentifier('evil"table', 'postgres'), '"evil""table"');
    assert.equal(quoteIdentifier('evil`table', 'mysql'), '`evil``table`');
  });

  it('escapes SQL string literals and strips null bytes', () => {
    assert.equal(escapeSqlStringLiteral("O'Reilly"), "O''Reilly");
    assert.equal(escapeSqlStringLiteral("a\0b'c"), "ab''c");
  });

  it('sanitizes filter clauses and blocks stacked query injection', () => {
    assert.equal(sanitizeFilterClause("status = 'active' AND id > 10"), "status = 'active' AND id > 10");
    assert.equal(sanitizeFilterClause("note = 'a;b'"), "note = 'a;b'");
    // Stacked query attempt outside quotes must be rejected
    assert.equal(sanitizeFilterClause("1=1; DROP TABLE users"), '');
    // Comment injection attempt outside quotes must be rejected
    assert.equal(sanitizeFilterClause("1=1 -- bypass"), '');
    assert.equal(sanitizeFilterClause("1=1 /* comment */"), '');
  });

  it('masks passwords in connection URLs for safe logging', () => {
    const raw = 'postgresql://postgres:gNB1bxiESO36s8A31gZh@commonprod-aurora.rds.amazonaws.com:5432/prod';
    const masked = maskConnectionUrl(raw);
    assert.ok(!masked.includes('gNB1bxiESO36s8A31gZh'));
    assert.ok(masked.includes('postgres:••••••••@commonprod-aurora.rds.amazonaws.com'));
  });
});

describe('DML Transaction SQL Generator', () => {
  it('formats literals for PostgreSQL and MySQL', () => {
    assert.equal(formatSqlLiteralValue(null, 'postgres'), 'NULL');
    assert.equal(formatSqlLiteralValue(42, 'postgres'), '42');
    assert.equal(formatSqlLiteralValue(true, 'postgres'), 'TRUE');
    assert.equal(formatSqlLiteralValue({ a: 1 }, 'postgres'), `'{"a":1}'::jsonb`);
    assert.equal(formatSqlLiteralValue({ a: 1 }, 'mysql'), `'{"a":1}'`);
  });

  it('resolves primary keys and builds transactional INSERT/UPDATE/DELETE SQL', () => {
    const rows = [
      {
        id: 101,
        email: "alice's@example.com",
        role: 'admin',
        rowState: 'inserted' as const,
        isDirty: true,
        dirtyFields: { id: true, email: true, role: true },
      },
      {
        id: 102,
        email: 'bob@example.com',
        role: 'owner',
        rowState: 'modified' as const,
        isDirty: true,
        dirtyFields: { role: true },
      },
      {
        id: 103,
        email: 'charlie@example.com',
        role: 'member',
        rowState: 'deleted' as const,
        isDirty: true,
      },
    ];

    assert.deepEqual(resolveRowPrimaryKey(rows[0]), { col: 'id', val: 101 });

    const sql = buildPendingTransactionSql(rows, 'users', 'postgres');
    assert.ok(sql.startsWith('BEGIN TRANSACTION;'));
    assert.ok(sql.includes(`INSERT INTO "users" ("id", "email", "role") VALUES (101, 'alice''s@example.com', 'admin');`));
    assert.ok(sql.includes(`UPDATE "users" SET "role" = 'owner' WHERE "id" = 102;`));
    assert.ok(sql.includes(`DELETE FROM "users" WHERE "id" = 103;`));
    assert.ok(sql.endsWith('COMMIT;'));
  });
});
