import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  INTERNAL_ROW_KEYS,
  isInternalRowKey,
  getColumnSortWeight,
  sortColumnsByDdlConvention,
  deriveColumnsFromRows,
} from '../src/lib/grid/columnOrdering.ts';
import type { ColumnDefinition } from '../src/types/index.ts';

describe('Column Ordering and Internal Row Keys', () => {
  it('strictly identifies internal row keys and rejects synthetic keys', () => {
    assert.strictEqual(isInternalRowKey('isDirty'), true);
    assert.strictEqual(isInternalRowKey('dirtyFields'), true);
    assert.strictEqual(isInternalRowKey('rowState'), true);
    assert.strictEqual(isInternalRowKey('isNewRow'), true);
    assert.strictEqual(isInternalRowKey('_syntheticId'), true);
    assert.strictEqual(isInternalRowKey('_synthetic_temp_id'), true);
    assert.strictEqual(isInternalRowKey(''), true);
    assert.strictEqual(isInternalRowKey(null as any), true);
    assert.strictEqual(isInternalRowKey(undefined as any), true);

    assert.strictEqual(isInternalRowKey('id'), false);
    assert.strictEqual(isInternalRowKey('brand_id'), false);
    assert.strictEqual(isInternalRowKey('name'), false);
    assert.strictEqual(isInternalRowKey('created_at'), false);
    assert.strictEqual(isInternalRowKey('updated_at'), false);
    assert.strictEqual(isInternalRowKey('deleted_at'), false);
  });

  it('assigns correct sort weights according to standard DDL conventions', () => {
    // Primary key / id: weight -1000
    assert.strictEqual(getColumnSortWeight('id'), -1000);
    assert.strictEqual(getColumnSortWeight('ID'), -1000);
    assert.strictEqual(getColumnSortWeight('custom_col', true), -1000);

    // Business columns: weight 0
    assert.strictEqual(getColumnSortWeight('code'), 0);
    assert.strictEqual(getColumnSortWeight('name'), 0);
    assert.strictEqual(getColumnSortWeight('category'), 0);
    assert.strictEqual(getColumnSortWeight('address'), 0);
    assert.strictEqual(getColumnSortWeight('status'), 0);

    // Created audit columns: weight 500
    assert.strictEqual(getColumnSortWeight('created_at'), 500);
    assert.strictEqual(getColumnSortWeight('createdAt'), 500);
    assert.strictEqual(getColumnSortWeight('created_by'), 500);
    assert.strictEqual(getColumnSortWeight('created_date'), 500);

    // Updated audit columns: weight 600
    assert.strictEqual(getColumnSortWeight('updated_at'), 600);
    assert.strictEqual(getColumnSortWeight('updatedAt'), 600);
    assert.strictEqual(getColumnSortWeight('updated_by'), 600);
    assert.strictEqual(getColumnSortWeight('modified_at'), 600);

    // Deleted audit columns: weight 700
    assert.strictEqual(getColumnSortWeight('deleted_at'), 700);
    assert.strictEqual(getColumnSortWeight('deletedAt'), 700);
    assert.strictEqual(getColumnSortWeight('deleted_by'), 700);
  });

  it('sorts columns by DDL convention (id first ... business in middle ... audit at end)', () => {
    const rawCols: ColumnDefinition[] = [
      { name: 'address', type: 'text', isNullable: true },
      { name: 'deleted_at', type: 'timestamptz', isNullable: true },
      { name: 'code', type: 'varchar(64)', isNullable: false },
      { name: 'updated_at', type: 'timestamptz', isNullable: true },
      { name: 'name', type: 'varchar(255)', isNullable: false },
      { name: '_syntheticId', type: 'bool', isNullable: true },
      { name: 'created_at', type: 'timestamptz', isNullable: true },
      { name: 'isDirty', type: 'bool', isNullable: true },
      { name: 'id', type: 'int8', isNullable: false, isPrimaryKey: true },
      { name: 'status', type: 'varchar(32)', isNullable: false },
      { name: 'dirtyFields', type: 'jsonb', isNullable: true },
    ];

    const sorted = sortColumnsByDdlConvention(rawCols);
    const sortedNames = sorted.map((c) => c.name);

    // _syntheticId, isDirty, dirtyFields must be filtered out
    assert.strictEqual(sortedNames.includes('_syntheticId'), false);
    assert.strictEqual(sortedNames.includes('isDirty'), false);
    assert.strictEqual(sortedNames.includes('dirtyFields'), false);

    // id must be first
    assert.strictEqual(sortedNames[0], 'id');

    // Business attributes must remain in middle in relative order
    const middleCols = sortedNames.slice(1, -3);
    assert.deepStrictEqual(middleCols, ['address', 'code', 'name', 'status']);

    // Audit timestamps must be at the very end in sequence: created_at, updated_at, deleted_at
    const auditCols = sortedNames.slice(-3);
    assert.deepStrictEqual(auditCols, ['created_at', 'updated_at', 'deleted_at']);
  });

  it('preserves database DDL ordinal position when ddlOrderMap is supplied', () => {
    // Suppose database DDL order is: id, code, name, address, status, created_at, updated_at, deleted_at
    const ddlOrderMap = new Map<string, number>([
      ['id', 1],
      ['code', 2],
      ['name', 3],
      ['address', 4],
      ['status', 5],
      ['created_at', 6],
      ['updated_at', 7],
      ['deleted_at', 8],
    ]);

    // Rows from an arbitrary object iteration or unordered query
    const unorderedCols: ColumnDefinition[] = [
      { name: 'status', type: 'varchar', isNullable: true },
      { name: 'deleted_at', type: 'timestamptz', isNullable: true },
      { name: 'address', type: 'text', isNullable: true },
      { name: 'created_at', type: 'timestamptz', isNullable: true },
      { name: 'name', type: 'varchar', isNullable: true },
      { name: 'updated_at', type: 'timestamptz', isNullable: true },
      { name: 'code', type: 'varchar', isNullable: true },
      { name: 'id', type: 'int8', isNullable: false, isPrimaryKey: true },
    ];

    const sorted = sortColumnsByDdlConvention(unorderedCols, ddlOrderMap);
    const names = sorted.map((c) => c.name);

    assert.deepStrictEqual(names, [
      'id',
      'code',
      'name',
      'address',
      'status',
      'created_at',
      'updated_at',
      'deleted_at',
    ]);
  });

  it('derives columns from sample row, hides _syntheticId, and sorts by convention', () => {
    const sampleRow = {
      _syntheticId: true,
      category: 'Electronics',
      updated_by: 'admin',
      id: 101,
      deleted_at: null,
      name: 'Sony WH-1000XM5',
      created_at: '2026-01-01 10:00:00',
      isDirty: false,
      dirtyFields: {},
      rowState: 'clean',
      price: 349.99,
      updated_at: '2026-02-01 12:00:00',
    };

    const derived = deriveColumnsFromRows(sampleRow);
    const names = derived.map((c) => c.name);

    // No internal tracking keys
    assert.strictEqual(names.includes('_syntheticId'), false);
    assert.strictEqual(names.includes('isDirty'), false);
    assert.strictEqual(names.includes('dirtyFields'), false);
    assert.strictEqual(names.includes('rowState'), false);

    // id is at index 0
    assert.strictEqual(names[0], 'id');

    // Business attributes in middle
    assert.strictEqual(names[1], 'category');
    assert.strictEqual(names[2], 'name');
    assert.strictEqual(names[3], 'price');

    // Audit attributes at end
    assert.strictEqual(names.includes('created_at'), true);
    assert.strictEqual(names.includes('updated_by'), true);
    assert.strictEqual(names.includes('updated_at'), true);
    assert.strictEqual(names.includes('deleted_at'), true);

    const endCols = names.slice(-4);
    assert.deepStrictEqual(endCols, ['created_at', 'updated_by', 'updated_at', 'deleted_at']);
  });

  it('handles brands table columns accurately as reported in user screenshot', () => {
    // In user screenshot: brands table had columns:
    // _syntheticId, address, category, code, created_at, created_by, deleted_at, deleted_by, id, name, status, updated_at, updated_by
    const brandsSample = {
      _syntheticId: false,
      address: '123 Market St',
      category: 'Fashion',
      code: 'BRD-001',
      created_at: '2026-01-10T08:00:00Z',
      created_by: 'sysadmin',
      deleted_at: null,
      deleted_by: null,
      id: 42,
      name: 'Zara',
      status: 'active',
      updated_at: '2026-01-15T09:30:00Z',
      updated_by: 'editor',
    };

    const derived = deriveColumnsFromRows(brandsSample);
    const names = derived.map((c) => c.name);

    // _syntheticId must NEVER be present
    assert.strictEqual(names.includes('_syntheticId'), false);

    // id MUST be first
    assert.strictEqual(names[0], 'id');

    // Business columns in relative order
    const businessCols = names.slice(1, 6);
    assert.deepStrictEqual(businessCols, ['address', 'category', 'code', 'name', 'status']);

    // Audit columns at the end
    const auditCols = names.slice(6);
    assert.deepStrictEqual(auditCols, [
      'created_at',
      'created_by',
      'updated_at',
      'updated_by',
      'deleted_at',
      'deleted_by',
    ]);
  });
});
