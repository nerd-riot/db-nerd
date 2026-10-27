import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseConnectionUrl, buildConnectionUrl } from '../src/utils/connectionUrl.ts';
import { parseConnectionImportFile } from '../src/utils/connectionImport.ts';
import { splitSqlStatements, getQueryToExecute, extractTableAndPkFromQuery } from '../src/utils/sqlParser.ts';
import { analyzeSqlSafety, isReadOnlySql } from '../src/utils/sqlSafety.ts';

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
});
