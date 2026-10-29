import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateAlterTableStatements, buildAlterTableSql } from '../src/lib/db/ddlGenerator.ts';
import type { ColumnDefinition } from '../src/types/index.ts';
import type { StagedColumnDefinition } from '../src/lib/db/ddlGenerator.ts';

describe('DDL Generator (ALTER TABLE)', () => {
  const originalColumns: ColumnDefinition[] = [
    { name: 'id', type: 'int4', isNullable: false, isPrimaryKey: true, defaultValue: 'nextval(\'seq\')' },
    { name: 'email', type: 'varchar(255)', isNullable: false, isPrimaryKey: false, defaultValue: null },
    { name: 'bio', type: 'text', isNullable: true, isPrimaryKey: false, defaultValue: null, comment: 'User biography' },
    { name: 'age', type: 'int4', isNullable: true, isPrimaryKey: false, defaultValue: '0' },
  ];

  it('generates ADD COLUMN statement for new column in PostgreSQL', () => {
    const currentColumns: StagedColumnDefinition[] = [
      ...originalColumns,
      {
        name: 'avatar_url',
        type: 'varchar(500)',
        isNullable: true,
        defaultValue: 'NULL',
        isPrimaryKey: false,
        comment: 'CDN avatar URL',
        _isNew: true,
        _state: 'inserted',
      },
    ];

    const statements = generateAlterTableStatements({
      tableName: 'users',
      originalColumns,
      currentColumns,
      engine: 'postgres',
      schema: 'public',
    });

    assert.strictEqual(statements.length, 2);
    assert.strictEqual(
      statements[0],
      'ALTER TABLE "public"."users" ADD COLUMN "avatar_url" varchar(500);'
    );
    assert.strictEqual(
      statements[1],
      'COMMENT ON COLUMN "public"."users"."avatar_url" IS \'CDN avatar URL\';'
    );
  });

  it('generates ADD COLUMN statement with NOT NULL and DEFAULT in PostgreSQL', () => {
    const currentColumns: StagedColumnDefinition[] = [
      ...originalColumns,
      {
        name: 'status',
        type: 'varchar(50)',
        isNullable: false,
        defaultValue: '\'active\'',
        isPrimaryKey: false,
        _isNew: true,
        _state: 'inserted',
      },
    ];

    const statements = generateAlterTableStatements({
      tableName: 'users',
      originalColumns,
      currentColumns,
      engine: 'postgres',
    });

    assert.strictEqual(statements.length, 1);
    assert.strictEqual(
      statements[0],
      'ALTER TABLE "users" ADD COLUMN "status" varchar(50) DEFAULT \'active\' NOT NULL;'
    );
  });

  it('generates RENAME COLUMN statement in PostgreSQL and MySQL', () => {
    const currentColumns: StagedColumnDefinition[] = originalColumns.map((col) => {
      if (col.name === 'email') {
        return {
          ...col,
          name: 'email_address',
          _originalName: 'email',
          _state: 'modified',
          _dirtyFields: { name: true },
        };
      }
      return col;
    });

    const pgStatements = generateAlterTableStatements({
      tableName: 'users',
      originalColumns,
      currentColumns,
      engine: 'postgres',
    });
    assert.strictEqual(pgStatements[0], 'ALTER TABLE "users" RENAME COLUMN "email" TO "email_address";');

    const mysqlStatements = generateAlterTableStatements({
      tableName: 'users',
      originalColumns,
      currentColumns,
      engine: 'mysql',
    });
    assert.strictEqual(mysqlStatements[0], 'ALTER TABLE `users` RENAME COLUMN `email` TO `email_address`;');
  });

  it('generates ALTER COLUMN TYPE in PostgreSQL', () => {
    const currentColumns: StagedColumnDefinition[] = originalColumns.map((col) => {
      if (col.name === 'age') {
        return {
          ...col,
          type: 'int8',
          _state: 'modified',
          _dirtyFields: { type: true },
        };
      }
      return col;
    });

    const statements = generateAlterTableStatements({
      tableName: 'users',
      originalColumns,
      currentColumns,
      engine: 'postgres',
    });
    assert.strictEqual(
      statements[0],
      'ALTER TABLE "users" ALTER COLUMN "age" TYPE int8 USING "age"::int8;'
    );
  });

  it('generates SET NOT NULL and DROP NOT NULL in PostgreSQL', () => {
    const currentColumns: StagedColumnDefinition[] = originalColumns.map((col) => {
      if (col.name === 'bio') {
        return {
          ...col,
          isNullable: false,
          _state: 'modified',
          _dirtyFields: { isNullable: true },
        };
      }
      return col;
    });

    const statements = generateAlterTableStatements({
      tableName: 'users',
      originalColumns,
      currentColumns,
      engine: 'postgres',
    });
    assert.strictEqual(
      statements[0],
      'ALTER TABLE "users" ALTER COLUMN "bio" SET NOT NULL;'
    );
  });

  it('generates DROP COLUMN in PostgreSQL and MySQL', () => {
    const currentColumns: StagedColumnDefinition[] = originalColumns.map((col) => {
      if (col.name === 'bio') {
        return {
          ...col,
          _isDeleted: true,
          _state: 'deleted',
        };
      }
      return col;
    });

    const pgStatements = generateAlterTableStatements({
      tableName: 'users',
      originalColumns,
      currentColumns,
      engine: 'postgres',
    });
    assert.strictEqual(pgStatements[0], 'ALTER TABLE "users" DROP COLUMN "bio";');

    const mysqlStatements = generateAlterTableStatements({
      tableName: 'users',
      originalColumns,
      currentColumns,
      engine: 'mysql',
    });
    assert.strictEqual(mysqlStatements[0], 'ALTER TABLE `users` DROP COLUMN `bio`;');
  });

  it('builds full ALTER TABLE script wrapped in transaction for PostgreSQL', () => {
    const currentColumns: StagedColumnDefinition[] = [
      ...originalColumns,
      {
        name: 'new_col',
        type: 'text',
        isNullable: true,
        defaultValue: null,
        isPrimaryKey: false,
        _isNew: true,
        _state: 'inserted',
      },
    ];

    const sql = buildAlterTableSql({
      tableName: 'users',
      originalColumns,
      currentColumns,
      engine: 'postgres',
    });

    assert.ok(sql.startsWith('BEGIN TRANSACTION;'));
    assert.ok(sql.includes('ALTER TABLE "users" ADD COLUMN "new_col" text;'));
    assert.ok(sql.endsWith('COMMIT;'));
  });

  it('returns clean message when no changes exist', () => {
    const sql = buildAlterTableSql({
      tableName: 'users',
      originalColumns,
      currentColumns: [...originalColumns],
      engine: 'postgres',
    });
    assert.strictEqual(sql, '-- No pending structure changes');
  });
});
