import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseConnectionUrl, buildConnectionUrl } from '../src/utils/connectionUrl.ts';
import { parseConnectionImportFile } from '../src/utils/connectionImport.ts';
import { splitSqlStatements, getQueryToExecute, extractTableAndPkFromQuery } from '../src/utils/sqlParser.ts';
import { analyzeSqlSafety, isReadOnlySql } from '../src/utils/sqlSafety.ts';
import { profileToConfig, normalizeSnowflakeAccount } from '../src/services/dbService.ts';

describe('Connection URL Parser & Builder', () => {
  it('parses complex AWS Aurora PostgreSQL URLs with TablePlus query parameters', () => {
    const auroraUrl =
      'postgresql://postgres:gNB1bxiESO36s8A31gZhsnFqbMRrjfAZpTp1ouw2@commonprod-aurora-cluster.cluster-cmilpekm1tcx.us-east-2.rds.amazonaws.com?statusColor=007F3D&env=&name=Notification%20Service&tLSMode=0&usePrivateKey=false&safeModeLevel=0&advancedSafeModeLevel=0&driverVersion=0&lazyload=false';

    const res = parseConnectionUrl(auroraUrl);
    assert.ok(res);
    assert.equal(res.engine, 'postgres');
    assert.equal(res.host, 'commonprod-aurora-cluster.cluster-cmilpekm1tcx.us-east-2.rds.amazonaws.com');
    assert.equal(res.port, 5432);
    assert.equal(res.username, 'postgres');
    assert.equal(res.password, 'gNB1bxiESO36s8A31gZhsnFqbMRrjfAZpTp1ouw2');
    assert.equal(res.database, 'postgres');
    assert.equal(res.name, 'Notification Service');
    assert.equal(res.statusColor, '007F3D');
  });

  it('round-trips connection profiles to and from URLs', () => {
    const url = buildConnectionUrl({
      id: 'conn-1',
      engine: 'mysql',
      host: 'db.staging.internal',
      port: 3306,
      username: 'app_user',
      password: 'p@ss:word/123',
      database: 'orders_db',
      name: 'Staging Orders',
      env: 'staging',
      groupId: 'grp-1',
      active: false,
      latencyMs: 1.0,
    });
    const parsed = parseConnectionUrl(url);
    assert.ok(parsed);
    assert.equal(parsed.engine, 'mysql');
    assert.equal(parsed.host, 'db.staging.internal');
    assert.equal(parsed.port, 3306);
    assert.equal(parsed.username, 'app_user');
    assert.equal(parsed.password, 'p@ss:word/123');
    assert.equal(parsed.database, 'orders_db');
  });

  it('parses Snowflake connection URLs with SSO, Account, Warehouse, and Schema', () => {
    const snowflakeUrl =
      'snowflake://alex.chen%40company.com@xy12345.us-east-1.snowflakecomputing.com:443/ANALYTICS_DB?warehouse=COMPUTE_WH&schema=PUBLIC&role=ACCOUNTADMIN&authenticator=externalbrowser&name=Data%20Warehouse';
    const parsed = parseConnectionUrl(snowflakeUrl);
    assert.ok(parsed);
    assert.equal(parsed.engine, 'snowflake');
    assert.equal(parsed.username, 'alex.chen@company.com');
    assert.equal(parsed.port, 443);
    assert.equal(parsed.database, 'ANALYTICS_DB');
    assert.equal(parsed.snowflakeAccount, 'xy12345.us-east-1');
    assert.equal(parsed.snowflakeWarehouse, 'COMPUTE_WH');
    assert.equal(parsed.snowflakeSchema, 'PUBLIC');
    assert.equal(parsed.snowflakeRole, 'ACCOUNTADMIN');
    assert.equal(parsed.snowflakeAuthMethod, 'externalbrowser');
    assert.equal(parsed.name, 'Data Warehouse');
  });

  it('normalizes Snowflake account identifiers with domains, protocol, or ports', () => {
    assert.equal(normalizeSnowflakeAccount('swa87046-ct57250.snowflakecomputing.com'), 'swa87046-ct57250');
    assert.equal(normalizeSnowflakeAccount('https://swa87046-ct57250.snowflakecomputing.com/'), 'swa87046-ct57250');
    assert.equal(normalizeSnowflakeAccount('http://swa87046-ct57250.snowflakecomputing.com:443/console?t=1'), 'swa87046-ct57250');
    assert.equal(normalizeSnowflakeAccount('xy12345.us-east-1'), 'xy12345.us-east-1');
    assert.equal(normalizeSnowflakeAccount('xy12345.us-east-1.snowflakecomputing.com'), 'xy12345.us-east-1');
    assert.equal(normalizeSnowflakeAccount('  swa87046-ct57250.snowflakecomputing.com  '), 'swa87046-ct57250');

    const cfg = profileToConfig({
      id: 'test-sf',
      engine: 'snowflake',
      host: 'swa87046-ct57250.snowflakecomputing.com',
      port: 443,
      username: 'khoa@goessor.com',
      database: 'DEMO_DB',
      snowflakeAccount: 'swa87046-ct57250.snowflakecomputing.com',
      snowflakeWarehouse: 'COMPUTE_WH',
      snowflakeAuthMethod: 'externalbrowser',
      active: false,
      latencyMs: 1.0,
    });
    assert.equal(cfg.snowflake_account, 'swa87046-ct57250');
  });
});

describe('Multi-Format Connection File Importer', () => {
  it('imports TablePlus Apple Plist XML (.tableplusconnection)', () => {
    const plistXml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>ConnectionName</key>
  <string>Prod Analytics</string>
  <key>Driver</key>
  <string>PostgreSQL</string>
  <key>DatabaseHost</key>
  <string>pg.example.com</string>
  <key>DatabasePort</key>
  <integer>5432</integer>
  <key>DatabaseName</key>
  <string>analytics</string>
  <key>DatabaseUser</key>
  <string>readonly</string>
  <key>Enviroment</key>
  <string>production</string>
</dict>
</plist>`;

    const res = parseConnectionImportFile(plistXml, 'prod.tableplusconnection');
    assert.equal(res.connections.length, 1);
    assert.equal(res.connections[0].name, 'Prod Analytics');
    assert.equal(res.connections[0].engine, 'postgres');
    assert.equal(res.connections[0].host, 'pg.example.com');
    assert.equal(res.connections[0].database, 'analytics');
    assert.equal(res.connections[0].env, 'prod');
  });

  it('imports .env files containing DATABASE_URL and DB_* variables', () => {
    const envContent = `
DATABASE_URL="postgresql://admin:secret@db.prod.io:5432/core_db"
REDIS_URL="redis://:redispass@cache.prod.io:6379/0"
`;
    const res = parseConnectionImportFile(envContent, '.env');
    assert.equal(res.connections.length, 2);
    assert.equal(res.connections[0].engine, 'postgres');
    assert.equal(res.connections[1].engine, 'redis');
  });
});

describe('SQL Statement Parser & Safety Analyzer', () => {
  it('splits multi-statement SQL while ignoring semicolons inside quotes and comments', () => {
    const sql = `
      -- Comment with ; semicolon
      SELECT id, 'a;b;c' AS tag FROM users WHERE active = true;
      /* block ; comment */
      UPDATE users SET last_seen = NOW() WHERE id = 10;
    `;
    const stmts = splitSqlStatements(sql);
    assert.equal(stmts.length, 2);
    assert.ok(stmts[0].trimmedText.includes("SELECT id, 'a;b;c'"));
    assert.ok(stmts[1].trimmedText.startsWith('/* block ; comment */'));

    const updatePos = sql.indexOf('UPDATE') + 3;
    const cursorStmt = getQueryToExecute(sql, updatePos, updatePos);
    assert.equal(cursorStmt.statementIndex, 1);
    assert.equal(cursorStmt.totalStatements, 2);

    const inferred = extractTableAndPkFromQuery('SELECT * FROM "public"."user_orders" LIMIT 10;', ['order_id', 'total']);
    assert.equal(inferred.table, 'user_orders');
    assert.equal(inferred.pkColumn, 'order_id');
  });

  it('classifies read-only vs destructive SQL queries accurately', () => {
    assert.equal(isReadOnlySql('SELECT * FROM users LIMIT 10;'), true);
    assert.equal(isReadOnlySql('EXPLAIN ANALYZE SELECT * FROM orders;'), true);
    assert.equal(isReadOnlySql('DELETE FROM users;'), false);

    const analysis = analyzeSqlSafety('DELETE FROM users; DROP TABLE audit_logs;');
    assert.equal(analysis.isReadOnly, false);
    assert.equal(analysis.hasCriticalIssue, true);
    assert.ok(analysis.issues.some((i) => i.type === 'UNRESTRICTED_DELETE'));
    assert.ok(analysis.issues.some((i) => i.type === 'DROP'));
  });

  it('maps Snowflake connection profile into DbConfigPayload with browser SSO and keypair options', () => {
    const ssoProfile = {
      id: 'conn-sf-1',
      name: 'Snowflake Analytics Prod',
      groupId: 'grp-dw',
      engine: 'snowflake' as const,
      env: 'prod' as const,
      host: 'myorg-myaccount.snowflakecomputing.com',
      port: 443,
      database: 'DW_PROD',
      username: 'analyst@company.com',
      snowflakeAccount: 'myorg-myaccount',
      snowflakeWarehouse: 'ANALYTICS_WH',
      snowflakeSchema: 'PUBLIC',
      snowflakeRole: 'SYSADMIN',
      snowflakeAuthMethod: 'externalbrowser' as const,
      active: true,
      latencyMs: 1.5,
    };

    const ssoPayload = profileToConfig(ssoProfile);
    assert.equal(ssoPayload.engine, 'snowflake');
    assert.equal(ssoPayload.port, 443);
    assert.equal(ssoPayload.username, 'analyst@company.com');
    assert.equal(ssoPayload.snowflake_account, 'myorg-myaccount');
    assert.equal(ssoPayload.snowflake_warehouse, 'ANALYTICS_WH');
    assert.equal(ssoPayload.snowflake_schema, 'PUBLIC');
    assert.equal(ssoPayload.snowflake_role, 'SYSADMIN');
    assert.equal(ssoPayload.snowflake_auth_method, 'externalbrowser');

    const keypairProfile = {
      id: 'conn-sf-2',
      name: 'Snowflake Pipeline Service Account',
      groupId: 'grp-dw',
      engine: 'snowflake' as const,
      env: 'prod' as const,
      host: 'myorg-myaccount.snowflakecomputing.com',
      port: 443,
      database: 'DW_RAW',
      username: 'svc_pipeline',
      snowflakeAccount: 'myorg-myaccount',
      snowflakeWarehouse: 'LOAD_WH',
      snowflakeAuthMethod: 'keypair' as const,
      snowflakePrivateKey: '-----BEGIN ENCRYPTED PRIVATE KEY-----\nMII...',
      snowflakePassphrase: 'test-passphrase',
      active: false,
      latencyMs: 2.0,
    };

    const keypairPayload = profileToConfig(keypairProfile);
    assert.equal(keypairPayload.engine, 'snowflake');
    assert.equal(keypairPayload.username, 'svc_pipeline');
    assert.equal(keypairPayload.snowflake_auth_method, 'keypair');
    assert.equal(keypairPayload.snowflake_private_key, '-----BEGIN ENCRYPTED PRIVATE KEY-----\nMII...');
    assert.equal(keypairPayload.snowflake_passphrase, 'test-passphrase');
  });
});
