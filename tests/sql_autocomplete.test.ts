import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSqlSchemaForConnection,
  getTableForAlias,
  getCustomSqlCompletions,
} from '../src/lib/editor/sqlAutocomplete.ts';
import type { ConnectionProfile, RealTableSummary, TableSchemaInfo } from '../src/types/index.ts';

describe('SQL Autocomplete Dynamic Scoping Engine', () => {
  const liveConnection: ConnectionProfile = {
    id: 'conn-prod-aws-aurora',
    name: '[Production] [VN] Main RDS',
    engine: 'postgres',
    env: 'prod',
    host: 'rds-aurora-prod.internal',
    port: 5432,
    database: 'app_db',
    username: 'app_user',
    active: true,
    latencyMs: 15,
  };

  const demoConnection: ConnectionProfile = {
    id: 'demo',
    name: 'Demo Workspace',
    engine: 'postgres',
    env: 'local',
    host: 'localhost',
    port: 5432,
    database: 'demo_db',
    username: 'demo_user',
    active: true,
    latencyMs: 1,
  };

  const liveTables: Record<string, RealTableSummary[]> = {
    'conn-prod-aws-aurora': [
      { name: 'brands', count: '1,420' },
      { name: 'outlets', count: '890' },
      { name: 'customers', count: '54,200' },
      { name: 'invoices', count: '128,400' },
    ],
  };

  const liveSchemas: Record<string, Record<string, TableSchemaInfo>> = {
    'conn-prod-aws-aurora': {
      brands: {
        tableName: 'brands',
        schema: 'public',
        engine: 'postgres',
        rowCount: '1,420',
        totalSize: '2.4 MB',
        columns: [
          { name: 'id', type: 'uuid', isPrimaryKey: true },
          { name: 'name', type: 'varchar(255)', isPrimaryKey: false },
          { name: 'code', type: 'varchar(50)', isPrimaryKey: false },
          { name: '_syntheticId', type: 'varchar', isPrimaryKey: false }, // Internal key to exclude
          { name: 'created_at', type: 'timestamptz', isPrimaryKey: false },
        ],
        indexes: [],
        foreignKeys: [],
        ddl: 'CREATE TABLE brands (...);',
      },
      outlets: {
        tableName: 'outlets',
        schema: 'public',
        engine: 'postgres',
        rowCount: '890',
        totalSize: '1.1 MB',
        columns: [
          { name: 'outlet_id', type: 'bigint', isPrimaryKey: true },
          { name: 'brand_id', type: 'uuid', isPrimaryKey: false, isForeignKey: true },
          { name: 'address', type: 'text', isPrimaryKey: false },
        ],
        indexes: [],
        foreignKeys: [],
        ddl: 'CREATE TABLE outlets (...);',
      },
    },
  };

  it('strictly excludes mock tables (tuple, store, assertion, etc.) when connected to a real database', () => {
    const result = buildSqlSchemaForConnection(liveConnection, liveTables, liveSchemas);

    assert.equal(result.isRealConnection, true);
    assert.deepEqual(result.tableNames.sort(), ['brands', 'customers', 'invoices', 'outlets']);

    // Ensure mock tables are completely absent
    const mockTables = ['tuple', 'store', 'assertion', 'authorization_model', 'user_orders', 'goose_db_version'];
    for (const mockTbl of mockTables) {
      assert.equal(
        mockTbl in result.schema,
        false,
        `Mock table "${mockTbl}" must NOT be suggested in autocomplete for live database connection!`
      );
      assert.equal(
        result.tableNames.includes(mockTbl),
        false,
        `Mock table "${mockTbl}" must NOT be in tableNames list for live database connection!`
      );
    }

    // Verify brands schema details
    const brandCols = result.schema.brands;
    assert.ok(brandCols);
    assert.equal(brandCols.length, 4); // 'id', 'name', 'code', 'created_at' (_syntheticId excluded)
    assert.equal(brandCols.some((c) => c.label === '_syntheticId'), false);

    const idCol = brandCols.find((c) => c.label === 'id');
    assert.ok(idCol);
    assert.equal(idCol.type, 'keyword');
    assert.equal(idCol.detail, 'uuid (PK)');
    assert.equal(idCol.boost, 99);

    const nameCol = brandCols.find((c) => c.label === 'name');
    assert.ok(nameCol);
    assert.equal(nameCol.type, 'property');
    assert.equal(nameCol.detail, 'varchar(255)');
  });

  it('returns empty schema when disconnected (conn is null or undefined)', () => {
    const nullResult = buildSqlSchemaForConnection(null, liveTables, liveSchemas);
    assert.equal(nullResult.isRealConnection, false);
    assert.deepEqual(nullResult.tableNames, []);
    assert.deepEqual(nullResult.schema, {});

    const undefResult = buildSqlSchemaForConnection(undefined, liveTables, liveSchemas);
    assert.equal(undefResult.isRealConnection, false);
    assert.deepEqual(undefResult.tableNames, []);
    assert.deepEqual(undefResult.schema, {});
  });

  it('provides demo mock tables only when explicitly in demo mode (conn.id === "demo")', () => {
    const demoResult = buildSqlSchemaForConnection(demoConnection, {}, {});
    assert.equal(demoResult.isRealConnection, false);
    assert.ok(demoResult.tableNames.length > 0);
    assert.ok('users' in demoResult.schema);
  });

  it('handles live database with no cached schema without error', () => {
    const result = buildSqlSchemaForConnection(liveConnection, liveTables, {});
    assert.equal(result.isRealConnection, true);
    assert.deepEqual(result.tableNames.sort(), ['brands', 'customers', 'invoices', 'outlets']);
    assert.deepEqual(result.schema.customers, []);
  });

  describe('Alias Resolution (getTableForAlias)', () => {
    const schema = {
      brands: [{ label: 'id', type: 'keyword' }, { label: 'name', type: 'property' }],
      outlets: [{ label: 'outlet_id', type: 'keyword' }, { label: 'brand_id', type: 'property' }],
    };

    it('resolves direct table name', () => {
      assert.equal(getTableForAlias('SELECT * FROM brands', 'brands', schema), 'brands');
      assert.equal(getTableForAlias('SELECT * FROM unknown', 'unknown', schema), null);
    });

    it('resolves standard alias (FROM table alias)', () => {
      const doc = 'SELECT b.id FROM brands b WHERE b.name = "test"';
      assert.equal(getTableForAlias(doc, 'b', schema), 'brands');
    });

    it('resolves explicit AS alias (FROM table AS alias)', () => {
      const doc = 'SELECT o.address FROM outlets AS o JOIN brands AS b ON o.brand_id = b.id';
      assert.equal(getTableForAlias(doc, 'o', schema), 'outlets');
      assert.equal(getTableForAlias(doc, 'b', schema), 'brands');
    });

    it('resolves quoted and schema-qualified tables', () => {
      const doc = 'SELECT b.name FROM "public"."brands" AS b';
      assert.equal(getTableForAlias(doc, 'b', schema), 'brands');
    });
  });

  describe('Clause and Dot SQL Completions (getCustomSqlCompletions)', () => {
    const schema = {
      brands: [
        { label: 'id', type: 'keyword', detail: 'uuid (PK)' },
        { label: 'name', type: 'property', detail: 'varchar' },
        { label: 'code', type: 'property', detail: 'varchar' },
      ],
      outlets: [
        { label: 'outlet_id', type: 'keyword', detail: 'bigint (PK)' },
        { label: 'address', type: 'property', detail: 'text' },
      ],
    };
    const tableNames = ['brands', 'outlets'];

    it('suggests connection table names on FROM clause', () => {
      const doc = 'SELECT * FROM ';
      const completions = getCustomSqlCompletions(
        { pos: doc.length, textBefore: 'SELECT * FROM ', fullDoc: doc },
        schema,
        tableNames
      );

      assert.ok(completions);
      assert.equal(completions.from, doc.length);
      const labels = completions.options.map((o) => o.label);
      assert.deepEqual(labels, ['brands', 'outlets']);
      assert.equal(labels.includes('tuple'), false);
      assert.equal(labels.includes('store'), false);
    });

    it('suggests connection table names on JOIN clause', () => {
      const doc = 'SELECT * FROM brands b JOIN ';
      const completions = getCustomSqlCompletions(
        { pos: doc.length, textBefore: 'SELECT * FROM brands b JOIN ', fullDoc: doc },
        schema,
        tableNames
      );

      assert.ok(completions);
      assert.deepEqual(completions.options.map((o) => o.label), ['brands', 'outlets']);
    });

    it('suggests connection table names when FROM is on previous line in multiline query', () => {
      const doc = 'SELECT *\nFROM\n  ';
      const completions = getCustomSqlCompletions(
        { pos: doc.length, textBefore: '  ', fullDoc: doc },
        schema,
        tableNames
      );

      assert.ok(completions);
      assert.deepEqual(completions.options.map((o) => o.label), ['brands', 'outlets']);
    });

    it('suggests column completions after typing table name and dot (brands.)', () => {
      const doc = 'SELECT brands.';
      const completions = getCustomSqlCompletions(
        { pos: doc.length, textBefore: 'SELECT brands.', fullDoc: doc },
        schema,
        tableNames
      );

      assert.ok(completions);
      const labels = completions.options.map((o) => o.label);
      assert.deepEqual(labels, ['id', 'name', 'code']);
    });

    it('suggests column completions after typing alias and dot (b.)', () => {
      const doc = 'SELECT b. FROM brands AS b';
      const completions = getCustomSqlCompletions(
        { pos: 9, textBefore: 'SELECT b.', fullDoc: doc },
        schema,
        tableNames
      );

      assert.ok(completions);
      const labels = completions.options.map((o) => o.label);
      assert.deepEqual(labels, ['id', 'name', 'code']);
    });

    it('returns null when cursor is not after dot or clause keyword', () => {
      const doc = 'SELECT 123';
      const completions = getCustomSqlCompletions(
        { pos: doc.length, textBefore: 'SELECT 123', fullDoc: doc },
        schema,
        tableNames
      );

      assert.equal(completions, null);
    });
  });
});
