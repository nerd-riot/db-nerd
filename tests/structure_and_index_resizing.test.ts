import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  generateAlterTableStatements,
  buildAlterTableSql,
} from '../src/lib/db/ddlGenerator.ts';
import type { StagedColumnDefinition } from '../src/lib/db/ddlGenerator.ts';
import { calculateAutoFitColumnWidth } from '../src/lib/grid/columnWidth.ts';
import type { ColumnDefinition } from '../src/types/index.ts';

describe('Table Indexes & Structure Resizing and Auto-Fit', () => {
  it('calculates auto-fit width for index columns based on sample expressions', () => {
    const sampleIndexes = [
      {
        index_name: 'idx_users_email',
        columns: 'email',
        type: 'btree',
        is_unique: 'YES',
        is_primary: 'NO',
        size: '16 KB',
      },
      {
        index_name: 'idx_complex_json_expression',
        columns: '((metadata ->> \'nested_key\'::text), lower(email))',
        type: 'gin',
        is_unique: 'NO',
        is_primary: 'NO',
        size: '128 KB',
      },
    ];

    const nameWidth = calculateAutoFitColumnWidth('index_name', sampleIndexes, false);
    const colsWidth = calculateAutoFitColumnWidth('columns', sampleIndexes, false);
    const typeWidth = calculateAutoFitColumnWidth('type', sampleIndexes, false);

    assert.ok(nameWidth >= 160, `Expected nameWidth >= 160, got ${nameWidth}`);
    assert.ok(colsWidth >= 220, `Expected colsWidth for long expression >= 220, got ${colsWidth}`);
    assert.ok(typeWidth >= 70, `Expected typeWidth >= 70, got ${typeWidth}`);
  });

  it('calculates auto-fit width for structure columns based on column metadata', () => {
    const sampleStructure = [
      {
        column_name: 'organization_membership_id',
        data_type: 'numeric(18,4)',
        is_nullable: 'NO',
        check: 'NULL',
        column_default: 'nextval(\'org_seq\'::regclass)',
        foreign_key: '→ organizations(id)',
        comment: 'Foreign key to parent organization unit',
      },
    ];

    const colWidth = calculateAutoFitColumnWidth('column_name', sampleStructure, true);
    const defWidth = calculateAutoFitColumnWidth('column_default', sampleStructure, false);
    const fkWidth = calculateAutoFitColumnWidth('foreign_key', sampleStructure, false);

    assert.ok(colWidth >= 180, `Expected colWidth >= 180, got ${colWidth}`);
    assert.ok(defWidth >= 160, `Expected defWidth >= 160, got ${defWidth}`);
    assert.ok(fkWidth >= 140, `Expected fkWidth >= 140, got ${fkWidth}`);
  });
});

describe('Transactional Structure Staging (ALTER TABLE DDL Workflow)', () => {
  const baseSchema: ColumnDefinition[] = [
    { name: 'id', type: 'int4', isNullable: false, isPrimaryKey: true },
    { name: 'username', type: 'varchar(50)', isNullable: false, isPrimaryKey: false },
    { name: 'bio', type: 'text', isNullable: true, isPrimaryKey: false },
  ];

  it('stages adding multiple columns and generates clean DDL script', () => {
    const staged: StagedColumnDefinition[] = [
      ...baseSchema.map((c) => ({ ...c, _originalName: c.name, _state: 'clean' as const })),
      {
        name: 'avatar_url',
        type: 'varchar(500)',
        isNullable: true,
        isPrimaryKey: false,
        _isNew: true,
        _state: 'inserted' as const,
      },
      {
        name: 'is_verified',
        type: 'bool',
        isNullable: false,
        defaultValue: 'false',
        isPrimaryKey: false,
        _isNew: true,
        _state: 'inserted' as const,
      },
    ];

    const stmts = generateAlterTableStatements({
      tableName: 'accounts',
      originalColumns: baseSchema,
      currentColumns: staged,
      engine: 'postgres',
    });

    assert.strictEqual(stmts.length, 2);
    assert.strictEqual(stmts[0], 'ALTER TABLE "accounts" ADD COLUMN "avatar_url" varchar(500);');
    assert.strictEqual(stmts[1], 'ALTER TABLE "accounts" ADD COLUMN "is_verified" bool DEFAULT false NOT NULL;');

    const fullSql = buildAlterTableSql({
      tableName: 'accounts',
      originalColumns: baseSchema,
      currentColumns: staged,
      engine: 'postgres',
    });
    assert.ok(fullSql.startsWith('BEGIN TRANSACTION;'));
    assert.ok(fullSql.endsWith('COMMIT;'));
  });

  it('stages modifying column type, nullability, and default value', () => {
    const staged: StagedColumnDefinition[] = [
      { ...baseSchema[0], _originalName: 'id', _state: 'clean' },
      {
        ...baseSchema[1],
        _originalName: 'username',
        type: 'varchar(100)',
        _state: 'modified',
        _dirtyFields: { type: true },
      },
      {
        ...baseSchema[2],
        _originalName: 'bio',
        isNullable: false,
        defaultValue: '\'No bio provided\'',
        _state: 'modified',
        _dirtyFields: { isNullable: true, defaultValue: true },
      },
    ];

    const stmts = generateAlterTableStatements({
      tableName: 'accounts',
      originalColumns: baseSchema,
      currentColumns: staged,
      engine: 'postgres',
    });

    assert.ok(stmts.some((s) => s.includes('ALTER COLUMN "username" TYPE varchar(100)')));
    assert.ok(stmts.some((s) => s.includes('ALTER COLUMN "bio" SET NOT NULL;')));
    assert.ok(stmts.some((s) => s.includes('ALTER COLUMN "bio" SET DEFAULT \'No bio provided\';')));
  });

  it('stages dropping a column cleanly', () => {
    const staged: StagedColumnDefinition[] = [
      { ...baseSchema[0], _originalName: 'id', _state: 'clean' },
      { ...baseSchema[1], _originalName: 'username', _state: 'clean' },
      {
        ...baseSchema[2],
        _originalName: 'bio',
        _isDeleted: true,
        _state: 'deleted',
      },
    ];

    const stmts = generateAlterTableStatements({
      tableName: 'accounts',
      originalColumns: baseSchema,
      currentColumns: staged,
      engine: 'postgres',
    });

    assert.strictEqual(stmts.length, 1);
    assert.strictEqual(stmts[0], 'ALTER TABLE "accounts" DROP COLUMN "bio";');
  });

  it('stages renaming a column in MySQL dialect', () => {
    const staged: StagedColumnDefinition[] = [
      { ...baseSchema[0], _originalName: 'id', _state: 'clean' },
      {
        ...baseSchema[1],
        name: 'handle',
        _originalName: 'username',
        _state: 'modified',
        _dirtyFields: { name: true },
      },
      { ...baseSchema[2], _originalName: 'bio', _state: 'clean' },
    ];

    const stmts = generateAlterTableStatements({
      tableName: 'accounts',
      originalColumns: baseSchema,
      currentColumns: staged,
      engine: 'mysql',
    });

    assert.strictEqual(stmts.length, 1);
    assert.strictEqual(stmts[0], 'ALTER TABLE `accounts` RENAME COLUMN `username` TO `handle`;');
  });
});
