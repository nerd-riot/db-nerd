import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTruncateTableSql,
  buildDropTableSql,
  resolveRowPrimaryKey,
  buildPendingTransactionSql,
} from '../src/lib/db/dmlGenerator.ts';
import type { GridRow } from '../src/types/index.ts';

describe('Truncate & Drop SQL Builder (TablePlus Style)', () => {
  it('builds PostgreSQL TRUNCATE statement with RESTART IDENTITY and CASCADE options', () => {
    // 1. Bare truncate with schema qualification
    const sql1 = buildTruncateTableSql('invoice_sellouts', 'postgres', 'public', {
      restartIdentity: false,
      cascade: false,
    });
    assert.equal(sql1, 'TRUNCATE TABLE "public"."invoice_sellouts";');

    // 2. TablePlus default: Restart identity = true
    const sql2 = buildTruncateTableSql('invoice_sellouts', 'postgres', 'public', {
      restartIdentity: true,
      cascade: false,
    });
    assert.equal(sql2, 'TRUNCATE TABLE "public"."invoice_sellouts" RESTART IDENTITY;');

    // 3. User checks Cascade = true (resolves FK constraint blocks on foreign tables)
    const sql3 = buildTruncateTableSql('invoice_sellouts', 'postgres', 'public', {
      restartIdentity: true,
      cascade: true,
    });
    assert.equal(sql3, 'TRUNCATE TABLE "public"."invoice_sellouts" RESTART IDENTITY CASCADE;');

    // 4. Cascade only
    const sql4 = buildTruncateTableSql('invoice_sellouts', 'postgres', 'public', {
      restartIdentity: false,
      cascade: true,
    });
    assert.equal(sql4, 'TRUNCATE TABLE "public"."invoice_sellouts" CASCADE;');
  });

  it('builds MySQL TRUNCATE statement with SET FOREIGN_KEY_CHECKS bypass', () => {
    // 1. Normal MySQL TRUNCATE
    const sql1 = buildTruncateTableSql('orders', 'mysql', 'ecommerce', {
      ignoreFk: false,
      cascade: false,
    });
    assert.equal(sql1, 'TRUNCATE TABLE `orders`;');

    // 2. MySQL with foreign key bypass
    const sql2 = buildTruncateTableSql('orders', 'mysql', 'ecommerce', {
      ignoreFk: true,
    });
    assert.equal(
      sql2,
      'SET FOREIGN_KEY_CHECKS = 0; TRUNCATE TABLE `orders`; SET FOREIGN_KEY_CHECKS = 1;'
    );
  });

  it('builds SQLite TRUNCATE and resets sqlite_sequence', () => {
    const sql = buildTruncateTableSql('order_items', 'sqlite', undefined, {
      restartIdentity: true,
    });
    assert.equal(
      sql,
      "DELETE FROM \"order_items\"; DELETE FROM sqlite_sequence WHERE name = 'order_items';"
    );
  });

  it('builds PostgreSQL DROP TABLE statement with CASCADE', () => {
    // 1. Normal drop
    const sql1 = buildDropTableSql('job_trackings', 'postgres', 'public', {
      cascade: false,
    });
    assert.equal(sql1, 'DROP TABLE IF EXISTS "public"."job_trackings";');

    // 2. Drop with CASCADE (drops dependent FKs/views)
    const sql2 = buildDropTableSql('job_trackings', 'postgres', 'public', {
      cascade: true,
    });
    assert.equal(sql2, 'DROP TABLE IF EXISTS "public"."job_trackings" CASCADE;');
  });

  it('builds MySQL DROP TABLE statement with ignoreFk', () => {
    const sql1 = buildDropTableSql('job_trackings', 'mysql', 'ecommerce', {
      ignoreFk: true,
    });
    assert.equal(
      sql1,
      'SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS `job_trackings`; SET FOREIGN_KEY_CHECKS = 1;'
    );
  });
});

describe('Primary Key Resolution & Grid Row Deletion', () => {
  it('uses catalog primaryKeyCol when provided, ignoring synthetic IDs', () => {
    const row: GridRow = {
      id: 105, // Synthetic grid row counter
      _syntheticId: true,
      order_uuid: 'ord_9988aabb',
      total_amount: 500,
      rowState: 'deleted',
    };

    const pk = resolveRowPrimaryKey(row, 'order_uuid');
    assert.equal(pk.col, 'order_uuid');
    assert.equal(pk.val, 'ord_9988aabb');
  });

  it('ignores synthetic id when primaryKeyCol is not passed, searching candidate PKs', () => {
    const row: GridRow = {
      id: 1, // Synthetic id
      _syntheticId: true,
      sku: 'SKU-APPLE-M3',
      name: 'MacBook Pro',
      rowState: 'deleted',
    };

    const pk = resolveRowPrimaryKey(row);
    assert.equal(pk.col, 'sku');
    assert.equal(pk.val, 'SKU-APPLE-M3');
  });

  it('uses real native id when _syntheticId is false or undefined', () => {
    const row: GridRow = {
      id: '2b22ceba-ea97-468a-b322-4ff0b8e8e136',
      name: 'Batch #42',
      rowState: 'deleted',
    };

    const pk = resolveRowPrimaryKey(row);
    assert.equal(pk.col, 'id');
    assert.equal(pk.val, '2b22ceba-ea97-468a-b322-4ff0b8e8e136');
  });

  it('builds schema-qualified transactional DELETE statements for Postgres', () => {
    const rows: GridRow[] = [
      {
        id: '2b22ceba-ea97-468a-b322-4ff0b8e8e136',
        distributor_id: 'dist-01',
        rowState: 'deleted',
      },
    ];

    const sql = buildPendingTransactionSql(rows, 'picklists', 'postgres', 'id', 'public');
    assert.match(sql, /BEGIN TRANSACTION;/);
    assert.match(
      sql,
      /DELETE FROM "public"\."picklists" WHERE "id" = '2b22ceba-ea97-468a-b322-4ff0b8e8e136';/
    );
    assert.match(sql, /COMMIT;/);
  });
});
