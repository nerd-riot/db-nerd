import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const MEDIA_DIR = path.join(REPO_ROOT, 'media');

async function main() {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }

  const chromePath =
    process.env.CHROME_BIN ||
    (fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : 'google-chrome');

  const chromeProcess = spawn(
    chromePath,
    [
      '--headless=new',
      '--remote-debugging-port=9227',
      '--no-sandbox',
      '--disable-gpu',
      '--window-size=1360,860',
      'http://localhost:1420',
    ],
    { stdio: 'ignore' }
  );

  const cleanup = () => {
    try {
      chromeProcess.kill();
    } catch (e) {}
  };
  process.on('exit', cleanup);

  console.log('Connecting to Chrome CDP on port 9227...');
  await new Promise((r) => setTimeout(r, 2000));

  let versionData;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9227/json/version');
      versionData = await res.json();
      break;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (!versionData) {
    console.error('Failed to connect to Chrome on 9227');
    cleanup();
    process.exit(1);
  }

  const listRes = await fetch('http://127.0.0.1:9227/json/list');
  const pages = await listRes.json();
  const page = pages.find((p) => p.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  let idCounter = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map((a) => a.value || a.description).join(' ');
      console.log(`  [Browser] ${text}`);
    }
    if (msg.id && pending.has(msg.id)) {
      const resolver = pending.get(msg.id);
      pending.delete(msg.id);
      resolver(msg.result);
    }
  };

  const send = (method, params = {}) => {
    return new Promise((resolve) => {
      const id = idCounter++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  await new Promise((resolve) => {
    if (ws.readyState === WebSocket.OPEN) resolve();
    else ws.onopen = resolve;
  });

  console.log('Initializing CDP protocols...');
  await send('Page.enable');
  await send('DOM.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1360,
    height: 860,
    deviceScaleFactor: 2, // Retina 2x high-res
    mobile: false,
  });

  const capture = async (filename) => {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    if (res && res.data) {
      const filePath = path.join(MEDIA_DIR, filename);
      fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
      console.log(`✅ Saved: ${filePath} (${(res.data.length / 1024).toFixed(0)} KB base64)`);
    }
  };

  const evalJs = async (fnString) => {
    const res = await send('Runtime.evaluate', {
      expression: `(${fnString})()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res && res.exceptionDetails) {
      console.error('CDP Eval Exception:', JSON.stringify(res.exceptionDetails, null, 2));
    }
    return res && res.result ? res.result.value : null;
  };

  // Wait for initial render
  await new Promise((r) => setTimeout(r, 2000));

  // ==========================================
  // INITIAL STORE SEEDING & CONNECTION SETUP
  // ==========================================
  console.log('\n--- Initializing Store & Workspaces ---');
  await evalJs(`async () => {
    const store = window.__APP_STORE__?.getState?.();
    if (!store) return;

    document.documentElement.classList.add('dark');
    store.setThemeMode('dark');

    // 1. Ensure connection groups exist
    if (store.connectionGroups.length === 0) {
      store.addConnectionGroup({ name: 'Production', tag: 'PROD', color: 'rose' });
      store.addConnectionGroup({ name: 'Staging', tag: 'QA', color: 'amber' });
      store.addConnectionGroup({ name: 'Development', tag: 'DEV', color: 'emerald' });
    }
    const prodGroup = store.connectionGroups.find(g => g.tag === 'PROD') || store.connectionGroups[0];

    // 2. Ensure default connections exist
    let pg = store.connections.find(c => c.engine === 'postgres');
    if (!pg) {
      pg = store.addConnection({
        name: 'Primary Aurora DB (us-east-1)',
        groupId: prodGroup?.id || '',
        engine: 'postgres',
        env: 'prod',
        host: 'localhost',
        port: 5432,
        database: 'postgres',
        username: 'postgres',
        active: true,
        latencyMs: 0.8,
        safeMode: 'alert-2',
      });
    }

    let mysql = store.connections.find(c => c.engine === 'mysql');
    if (!mysql) {
      mysql = store.addConnection({
        name: 'Billing & Payments MySQL',
        groupId: prodGroup?.id || '',
        engine: 'mysql',
        env: 'prod',
        host: 'localhost',
        port: 3306,
        database: 'billing_prod',
        username: 'root',
        active: false,
        latencyMs: 1.1,
        safeMode: 'alert-2',
      });
    }

    let sf = store.connections.find(c => c.engine === 'snowflake');
    if (!sf) {
      sf = store.addConnection({
        name: 'Snowflake Enterprise DW',
        groupId: prodGroup?.id || '',
        engine: 'snowflake',
        env: 'prod',
        host: 'xy12345.us-east-1.snowflakecomputing.com',
        port: 443,
        database: 'FINANCE_DW',
        username: 'alex.chen@enterprise.com',
        snowflakeAccount: 'xy12345.us-east-1',
        snowflakeWarehouse: 'ANALYTICS_WH',
        snowflakeSchema: 'PUBLIC',
        snowflakeRole: 'ACCOUNTADMIN',
        snowflakeAuthMethod: 'externalbrowser',
        active: false,
        latencyMs: 1.2,
        safeMode: 'alert-2',
      });
    }

    // Connect to PG
    await store.switchActiveConnection(pg.id);

    // Force all modals closed so studio is unobstructed
    store.setConnectionModalOpen(false);
    store.setSettingsModalOpen(false);
    store.setHistoryModalOpen(false);
    store.setRunningQueriesModalOpen(false);
    store.setDatabaseModalOpen(false);
    store.setReconnectModalOpen(false);
    store.setSqlDiffModalOpen(false);
  }`);
  await new Promise((r) => setTimeout(r, 600));

  // ==========================================
  // 1. HERO PREVIEW: SQL Studio in Dark Mode
  // ==========================================
  console.log('\n--- 1. Capturing Studio Preview (Hero) ---');
  await evalJs(`() => {
    const store = window.__APP_STORE__?.getState?.();
    if (!store) return;

    // Ensure right inspector is open
    if (!store.isRightInspectorOpen) store.toggleRightInspector();
    // Ensure sidebar is open
    if (!store.isSidebarOpen) store.toggleSidebar();

    const sql = \`-- DBNerd High-Performance Studio (PostgreSQL 16)
SELECT 
    o.id,
    o.order_number,
    c.name AS customer_name,
    c.email,
    o.total_amount,
    o.status,
    o.created_at
FROM user_orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'completed'
ORDER BY o.created_at DESC
LIMIT 50;\`;

    store.openNewQueryTab(sql);
    const activeTabId = window.__APP_STORE__.getState().activeTabId;
    if (activeTabId) {
      const sampleCols = ['id', 'order_number', 'customer_name', 'email', 'total_amount', 'status', 'created_at'];
      const sampleRows = [
        { id: 1042, order_number: 'ORD-2026-9041', customer_name: 'Alex Turner', email: 'alex.turner@corp.io', total_amount: 3499.00, status: 'completed', created_at: '2026-10-29 18:24:10' },
        { id: 1041, order_number: 'ORD-2026-9040', customer_name: 'Sarah Connor', email: 'sarah.connor@cyberdyne.net', total_amount: 1599.00, status: 'completed', created_at: '2026-10-29 17:15:00' },
        { id: 1040, order_number: 'ORD-2026-9039', customer_name: 'Khoa Nguyen', email: 'khoa.nguyen@ai.lab', total_amount: 2840.50, status: 'completed', created_at: '2026-10-29 16:02:44' },
        { id: 1039, order_number: 'ORD-2026-9038', customer_name: 'Elena Rostova', email: 'elena.rostova@cyber.eu', total_amount: 450.00, status: 'completed', created_at: '2026-10-29 14:48:12' },
        { id: 1038, order_number: 'ORD-2026-9037', customer_name: 'Marcus Vance', email: 'marcus.vance@tech.co', total_amount: 890.00, status: 'completed', created_at: '2026-10-29 13:30:05' },
        { id: 1037, order_number: 'ORD-2026-9036', customer_name: 'Chloe Bennett', email: 'chloe.b@startup.io', total_amount: 125.00, status: 'completed', created_at: '2026-10-29 11:15:20' },
        { id: 1036, order_number: 'ORD-2026-9035', customer_name: 'David Kim', email: 'david.kim@fintech.net', total_amount: 2100.00, status: 'completed', created_at: '2026-10-29 09:40:11' },
      ];
      window.__APP_STORE__.setState((state) => ({
        sqlTabStates: {
          ...state.sqlTabStates,
          [activeTabId]: {
            ...state.sqlTabStates[activeTabId],
            query: sql,
            lastExecutedQuery: sql,
            results: sampleRows,
            columns: sampleCols,
            durationMs: 0.92,
            rowsCount: sampleRows.length,
            executedAt: 'Just now',
            isExecuting: false,
            activeResultId: 'q-1',
            queryResults: [
              {
                id: 'q-1',
                title: 'Query 1',
                query: sql,
                results: sampleRows,
                columns: sampleCols,
                durationMs: 0.92,
                rowsCount: sampleRows.length,
                executedAt: 'Just now',
                status: 'success',
                isPinned: false,
                statusMessage: 'Query 1 OK: 7 rows retrieved (0.92 ms)',
              },
            ],
          },
        },
      }));
    }
  }`);
  await new Promise((r) => setTimeout(r, 800));
  await capture('studio-preview.png');

  // =========================================================================
  // 2. INLINE CELL EDITING & AUTO UPDATE QUERY MODAL (Latest feature!)
  // =========================================================================
  console.log('\n--- 2. Capturing Inline Cell Editing & UPDATE Modal ---');
  await evalJs(`() => {
    const store = window.__APP_STORE__?.getState?.();
    if (store) {
      store.openTableGridTab('users');
    }
  }`);
  await new Promise((r) => setTimeout(r, 600));

  await evalJs(`() => {
    const cells = Array.from(document.querySelectorAll('td'));
    const targetCell = cells.find(td => td.textContent && td.textContent.includes('sarah.connor@cyberdyne.net'));
    if (targetCell) {
      targetCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    }
  }`);
  await new Promise((r) => setTimeout(r, 500));

  await evalJs(`() => {
    const input = document.querySelector('input:focus') || document.querySelector('input[type="text"]');
    if (input) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, 'sarah.connor@resistance.mil');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    }
  }`);
  await new Promise((r) => setTimeout(r, 600));

  await evalJs(`() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const reviewBtn = buttons.find(b => b.textContent && (b.textContent.includes('Review SQL') || b.textContent.includes('Review & Execute SQL')));
    if (reviewBtn) reviewBtn.click();
  }`);
  await new Promise((r) => setTimeout(r, 800));
  await capture('inline-edit-modal.png');

  // Close the modal
  await evalJs(`() => {
    const store = window.__APP_STORE__?.getState?.();
    if (store) {
      store.setSqlDiffModalOpen(false);
      store.rollbackTransaction();
    }
    const buttons = Array.from(document.querySelectorAll('button'));
    const closeBtn = buttons.find(b => b.textContent && (b.textContent.includes('Close') || b.textContent.includes('Discard All')));
    if (closeBtn) closeBtn.click();
  }`);
  await new Promise((r) => setTimeout(r, 600));

  // ==========================================
  // 3. TABLE CANVAS DATA GRID VIEW
  // ==========================================
  console.log('\n--- 3. Capturing Table Data Grid View ---');
  await evalJs(`() => {
    const store = window.__APP_STORE__?.getState?.();
    if (store) {
      store.setSqlDiffModalOpen(false);
      store.rollbackTransaction();
      store.openTableGridTab('user_orders');
      if (!store.isFilterBarOpen) store.toggleFilterBar();
      store.setFilterWhereText("status = 'shipped' AND total_amount > 50");
      store.setFilterOrderByText("id DESC");
    }
  }`);
  await new Promise((r) => setTimeout(r, 800));
  await capture('table-grid-view.png');

  // ==========================================
  // 4. CONNECTION MANAGER & SSH BASTION
  // ==========================================
  console.log('\n--- 4. Capturing Connection Manager Modal ---');
  await evalJs(`() => {
    const store = window.__APP_STORE__?.getState?.();
    if (store) {
      store.setConnectionModalOpen(true);
    }
  }`);
  await new Promise((r) => setTimeout(r, 500));

  // Select Primary Aurora DB connection to show its SSH bastion config
  await evalJs(`() => {
    const items = Array.from(document.querySelectorAll('div'));
    const pgItem = items.find(el => el.textContent && el.textContent.includes('Primary Aurora DB') && el.getAttribute('draggable') === 'true') ||
                   items.find(el => el.textContent && el.textContent.includes('Primary Aurora DB'));
    if (pgItem) pgItem.click();
  }`);
  await new Promise((r) => setTimeout(r, 400));

  // Expand SSH Bastion section and scroll down slightly
  await evalJs(`() => {
    const checkbox = Array.from(document.querySelectorAll('input[type="checkbox"]')).find(cb => {
      return cb.parentElement && cb.parentElement.textContent.includes('SSH Bastion');
    });
    if (checkbox && !checkbox.checked) {
      checkbox.click();
    }
    const rightPanel = document.querySelector('.overflow-y-auto');
    if (rightPanel) rightPanel.scrollBy({ top: 100, behavior: 'instant' });
  }`);
  await new Promise((r) => setTimeout(r, 800));
  await capture('connection-manager.png');

  // Close connection modal from Step 4
  await evalJs(`() => {
    const store = window.__APP_STORE__?.getState?.();
    if (store) store.setConnectionModalOpen(false);
  }`);
  await new Promise((r) => setTimeout(r, 400));

  // ==========================================
  // 4b. SNOWFLAKE CONNECTOR & BROWSER SSO
  // ==========================================
  console.log('\n--- 4b. Capturing Snowflake Connector Modal ---');
  await evalJs(`() => {
    const store = window.__APP_STORE__?.getState?.();
    if (store) {
      let sf = store.connections.find(c => c.engine === 'snowflake');
      if (!sf) {
        sf = store.addConnection({
          name: 'Snowflake Enterprise DW',
          groupId: store.connectionGroups[0]?.id || '',
          engine: 'snowflake',
          env: 'prod',
          host: 'xy12345.us-east-1.snowflakecomputing.com',
          port: 443,
          database: 'FINANCE_DW',
          username: 'alex.chen@enterprise.com',
          snowflakeAccount: 'xy12345.us-east-1',
          snowflakeWarehouse: 'ANALYTICS_WH',
          snowflakeSchema: 'PUBLIC',
          snowflakeRole: 'ACCOUNTADMIN',
          snowflakeAuthMethod: 'externalbrowser',
          active: false,
          latencyMs: 1.2,
          safeMode: 'alert-2',
        });
      }
      console.log('Snowflake found with id:', sf?.id);
      store.setConnectionModalOpen(true, undefined, sf.id);
    }
  }`);
  await new Promise((r) => setTimeout(r, 600));

  // Also click the Snowflake row in the UI if modal is open
  await evalJs(`() => {
    const spans = Array.from(document.querySelectorAll('span'));
    const sfSpan = spans.find(s => s.textContent && s.textContent.trim() === 'Snowflake Enterprise DW');
    if (sfSpan) {
      console.log('Found sfSpan in DOM, clicking it');
      const row = sfSpan.closest('div[draggable="true"]') || sfSpan;
      row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      row.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      row.click();
    }
  }`);
  await new Promise((r) => setTimeout(r, 600));

  // Reset scroll to top so Snowflake account, warehouse, and SSO section are crisp and fully visible
  await evalJs(`() => {
    const scrollables = Array.from(document.querySelectorAll('.overflow-y-auto'));
    for (const el of scrollables) {
      el.scrollTo({ top: 0, behavior: 'instant' });
    }
  }`);
  await new Promise((r) => setTimeout(r, 500));
  await capture('snowflake-connector.png');

  // Close Connection Modal and switch back to Postgres
  await evalJs(`() => {
    const store = window.__APP_STORE__?.getState?.();
    if (store) {
      store.setConnectionModalOpen(false);
      const pg = store.connections.find(c => c.engine === 'postgres');
      if (pg) {
        window.__APP_STORE__.setState({
          activeConnection: pg,
        });
      }
    }
  }`);
  await new Promise((r) => setTimeout(r, 500));

  // ==========================================
  // 5. PRODUCTION SAFE MODE & CONFIRMATION
  // ==========================================
  console.log('\n--- 5. Capturing Safe Mode Safeguard ---');
  await evalJs(`() => {
    const store = window.__APP_STORE__?.getState?.();
    if (store) {
      store.setConnectionSafeMode(store.activeConnection.id, 'safe-2');
      const sql = "DELETE FROM user_orders WHERE status = 'cancelled';";
      store.openNewQueryTab(sql);
      store.runSqlQuery(store.activeTabId, sql);
    }
  }`);
  await new Promise((r) => setTimeout(r, 800));
  await capture('safe-mode-production.png');

  // Cancel Safe Mode action
  await evalJs(`() => {
    const store = window.__APP_STORE__?.getState?.();
    if (store) {
      store.cancelSafetyAction();
      store.setSqlDiffModalOpen(false);
      store.rollbackTransaction();
    }
  }`);
  await new Promise((r) => setTimeout(r, 500));

  // ==========================================
  // 6. QUERY HISTORY & AUDIT LOG
  // ==========================================
  console.log('\n--- 6. Capturing Query History Modal ---');
  await evalJs(`() => {
    const store = window.__APP_STORE__?.getState?.();
    if (store) {
      store.cancelSafetyAction();
      store.setSqlDiffModalOpen(false);
      store.rollbackTransaction();
      store.setConnectionModalOpen(false);
      window.__APP_STORE__.setState({
        history: [
          {
            id: 'h-1',
            connectionId: store.activeConnection?.id || 'conn-1',
            connectionName: 'Primary Aurora DB (us-east-1)',
            query: "SELECT id, order_number, customer_name, total_amount, status FROM user_orders WHERE status = 'completed' ORDER BY created_at DESC LIMIT 50;",
            durationMs: 0.9,
            rowsCount: 50,
            executedAt: new Date().toISOString(),
            status: 'success',
          },
          {
            id: 'h-2',
            connectionId: store.activeConnection?.id || 'conn-1',
            connectionName: 'Primary Aurora DB (us-east-1)',
            query: "UPDATE users SET email = 'sarah.connor@resistance.mil' WHERE id = 502;",
            durationMs: 1.4,
            rowsCount: 1,
            executedAt: new Date(Date.now() - 3600000).toISOString(),
            status: 'success',
          },
          {
            id: 'h-3',
            connectionId: store.activeConnection?.id || 'conn-1',
            connectionName: 'Primary Aurora DB (us-east-1)',
            query: "SELECT c.id, c.name, COUNT(o.id) as order_count FROM customers c LEFT JOIN user_orders o ON o.customer_id = c.id GROUP BY c.id, c.name HAVING COUNT(o.id) > 5;",
            durationMs: 3.2,
            rowsCount: 18,
            executedAt: new Date(Date.now() - 7200000).toISOString(),
            status: 'success',
          },
          {
            id: 'h-4',
            connectionId: store.activeConnection?.id || 'conn-1',
            connectionName: 'Primary Aurora DB (us-east-1)',
            query: "EXPLAIN ANALYZE SELECT * FROM inventory_logs WHERE warehouse_id = 4 AND created_at >= NOW() - INTERVAL '7 days';",
            durationMs: 2.1,
            rowsCount: 124,
            executedAt: new Date(Date.now() - 14400000).toISOString(),
            status: 'success',
          },
        ]
      });
      store.setHistoryModalOpen(true);
    }
  }`);
  await new Promise((r) => setTimeout(r, 800));
  await capture('query-history.png');

  // Close Query History Modal
  await evalJs(`() => {
    const store = window.__APP_STORE__?.getState?.();
    if (store) {
      store.setHistoryModalOpen(false);
      store.setSqlDiffModalOpen(false);
      store.rollbackTransaction();
    }
  }`);
  await new Promise((r) => setTimeout(r, 500));

  // ==========================================
  // 7. OBSERVABILITY & ACTIVITY MONITOR
  // ==========================================
  console.log('\n--- 7. Capturing Observability Dashboard ---');
  await evalJs(`() => {
    const store = window.__APP_STORE__?.getState?.();
    if (store) {
      store.setHistoryModalOpen(false);
      store.setConnectionModalOpen(false);
      store.setSqlDiffModalOpen(false);
      store.rollbackTransaction();
      const activeId = store.activeConnection?.id || 'conn-1';
      const sampleTables = [
        { name: 'user_orders', count: '1,248,910', schema: 'public', kind: 'table', owner: 'postgres', estimated_rows: 1248910, total_size: '142 MB', data_size: '98 MB', index_size: '44 MB', comment: 'Core transaction records' },
        { name: 'users', count: '45,200', schema: 'public', kind: 'table', owner: 'postgres', estimated_rows: 45200, total_size: '12 MB', data_size: '8 MB', index_size: '4 MB', comment: 'User profiles and credentials' },
        { name: 'order_items', count: '3,890,440', schema: 'public', kind: 'table', owner: 'postgres', estimated_rows: 3890440, total_size: '410 MB', data_size: '280 MB', index_size: '130 MB', comment: 'Line items per order' },
        { name: 'products', count: '8,410', schema: 'public', kind: 'table', owner: 'postgres', estimated_rows: 8410, total_size: '4.8 MB', data_size: '3.2 MB', index_size: '1.6 MB', comment: 'Catalog SKU items' },
        { name: 'inventory_logs', count: '380,120', schema: 'public', kind: 'table', owner: 'postgres', estimated_rows: 380120, total_size: '56 MB', data_size: '40 MB', index_size: '16 MB', comment: 'Audit log of stock movements' },
      ];
      window.__APP_STORE__.setState((state) => ({
        liveTables: {
          ...state.liveTables,
          [activeId]: sampleTables,
        }
      }));
      store.setActiveTab('stats');
      store.openAllTableStatsTab();
    }
  }`);
  await new Promise((r) => setTimeout(r, 800));
  await capture('observability-dashboard.png');

  // ==========================================
  // 8. LIGHT MODE (TablePlus macOS Elegance)
  // ==========================================
  console.log('\n--- 8. Capturing Light Mode ---');
  await evalJs(`() => {
    const store = window.__APP_STORE__?.getState?.();
    if (store) {
      store.setHistoryModalOpen(false);
      store.setConnectionModalOpen(false);
      store.setSqlDiffModalOpen(false);
      store.rollbackTransaction();
      document.documentElement.classList.remove('dark');
      store.setThemeMode('light');
      store.openTableGridTab('user_orders');
    }
  }`);
  await new Promise((r) => setTimeout(r, 800));
  await capture('light-mode.png');

  // Restore dark mode for dev
  await evalJs(`() => {
    const store = window.__APP_STORE__?.getState?.();
    if (store) {
      document.documentElement.classList.add('dark');
      store.setThemeMode('dark');
    }
  }`);

  console.log('\n🎉 All real app snapshots captured successfully into media/!\n');
  cleanup();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
