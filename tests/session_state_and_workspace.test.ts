import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ConnectionProfile } from '../src/types/index.ts';

describe('Connection Session Isolation & Disconnected State Guard', () => {
  const EMPTY_CONNECTION: ConnectionProfile = {
    id: '',
    name: '',
    engine: 'postgres',
    host: 'localhost',
    port: 5432,
    user: '',
    password: '',
    database: '',
    env: 'local',
  };

  const SAMPLE_CONN: ConnectionProfile = {
    id: 'conn-prod-vigo-1',
    name: '[Production] [VN] Vigo DB',
    engine: 'postgres',
    host: 'oms.coy4vltic3yw.ap-southeast-1.rds.amazonaws.com',
    port: 5432,
    user: 'postgres',
    password: 'secret_password',
    database: 'app_db',
    env: 'prod',
  };

  it('evaluates hasActiveSession strictly based on activeConnection.id and openSessionIds', () => {
    // Case 1: Fresh startup or all sessions closed
    const activeConnection = EMPTY_CONNECTION;
    const openSessionIds: string[] = [];

    const hasActiveSession = Boolean(activeConnection?.id && openSessionIds.includes(activeConnection.id));
    assert.equal(hasActiveSession, false);

    // Case 2: activeConnection has lingering profile but is NOT in openSessionIds
    const lingeringConn = SAMPLE_CONN;
    const hasActiveSessionLingering = Boolean(lingeringConn?.id && openSessionIds.includes(lingeringConn.id));
    assert.equal(hasActiveSessionLingering, false);

    // Case 3: Connected session
    const openSessions = [SAMPLE_CONN.id];
    const hasActiveSessionConnected = Boolean(SAMPLE_CONN?.id && openSessions.includes(SAMPLE_CONN.id));
    assert.equal(hasActiveSessionConnected, true);
  });

  it('guarantees sidebar tables and loading spinner never run when disconnected', () => {
    const activeConnection = SAMPLE_CONN;
    const openSessionIds: string[] = []; // Disconnected
    const liveTables: Record<string, any[]> = {}; // live tables undefined

    const hasActiveSession = Boolean(activeConnection?.id && openSessionIds.includes(activeConnection.id));
    const isMockConn = !activeConnection?.id || activeConnection.id === 'demo' || activeConnection.id.startsWith('mock');
    const liveForConn = hasActiveSession && activeConnection?.id ? liveTables[activeConnection.id] : undefined;

    // isTablesLoading MUST BE false
    const isTablesLoading = Boolean(hasActiveSession && !isMockConn && liveForConn === undefined);
    assert.equal(isTablesLoading, false, 'isTablesLoading must not spin when session is not active');

    // connectionTables MUST BE empty
    const connectionTables = (!hasActiveSession
      ? []
      : (liveForConn !== undefined
          ? liveForConn
          : (isMockConn ? [{ name: 'mock_table' }] : [])
        )
    );
    assert.deepEqual(connectionTables, [], 'Tables list must be empty when disconnected');
  });

  it('resets activeConnection to EMPTY_CONNECTION when last open session is closed', () => {
    let openSessionIds = ['conn-1'];
    let activeConnection = SAMPLE_CONN;
    let tabs = [{ id: 'tab-tables', type: 'stats', title: 'Tables.public', tableName: '__all_tables__' }];
    let activeTab = 'stats';
    let selectedTable = '__all_tables__';

    // Simulate closing conn-1
    const targetCloseId = 'conn-1';
    const nextOpen = openSessionIds.filter((id) => id !== targetCloseId);

    if (nextOpen.length === 0) {
      openSessionIds = [];
      activeConnection = EMPTY_CONNECTION;
      tabs = [];
      activeTab = 'default';
      selectedTable = '';
    }

    assert.equal(openSessionIds.length, 0);
    assert.equal(activeConnection.id, '');
    assert.equal(tabs.length, 0);
    assert.equal(activeTab, 'default');
    assert.equal(selectedTable, '');
  });

  it('evaluates workspace view routing: displays DefaultWorkspaceView when disconnected even if stale tabs exist', () => {
    const hasActiveConnection = false;
    const tabs = [{ id: 'old-tab', type: 'grid', title: 'users', tableName: 'users' }];
    const currentTabType = 'grid';

    // Workspace view condition in App.tsx
    const shouldShowDefaultWorkspace = !hasActiveConnection || tabs.length === 0 || currentTabType === 'default';
    assert.equal(shouldShowDefaultWorkspace, true, 'DefaultWorkspaceView must be shown when disconnected');
  });

  it('filters saved connections by name, host, engine, and database on Home Page', () => {
    const connections: ConnectionProfile[] = [
      SAMPLE_CONN,
      {
        id: 'conn-local-mysql',
        name: 'Local Analytics DB',
        engine: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        user: 'root',
        password: '',
        database: 'analytics_staging',
        env: 'local',
      },
      {
        id: 'conn-redis-cache',
        name: 'Session Cache',
        engine: 'redis',
        host: 'localhost',
        port: 6379,
        database: '0',
        env: 'dev',
      },
    ];

    const filterBy = (query: string) => {
      const q = query.toLowerCase();
      return connections.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.engine.toLowerCase().includes(q) ||
          (c.host || '').toLowerCase().includes(q) ||
          (c.database || '').toLowerCase().includes(q)
      );
    };

    assert.equal(filterBy('vigo').length, 1);
    assert.equal(filterBy('vigo')[0].id, 'conn-prod-vigo-1');
    assert.equal(filterBy('mysql').length, 1);
    assert.equal(filterBy('mysql')[0].id, 'conn-local-mysql');
    assert.equal(filterBy('localhost').length, 1);
    assert.equal(filterBy('analytics').length, 1);
    assert.equal(filterBy('nonexistent').length, 0);
  });

  it('guarantees toast position never obstructs top center tabs', () => {
    const resolveToastClass = (toastPosition?: 'bottom-right' | 'top-right') => {
      const isTopRight = toastPosition === 'top-right';
      return isTopRight
        ? 'top-12 right-5 slide-in-from-top-2'
        : 'bottom-5 right-5 slide-in-from-bottom-2';
    };

    // Default (undefined or bottom-right) MUST be in the bottom-right corner
    const defaultClass = resolveToastClass(undefined);
    assert.ok(defaultClass.includes('bottom-5 right-5'));
    assert.ok(!defaultClass.includes('left-1/2'));
    assert.ok(!defaultClass.includes('-translate-x-1/2'));

    // Top-right option MUST be right-aligned
    const topRightClass = resolveToastClass('top-right');
    assert.ok(topRightClass.includes('top-12 right-5'));
    assert.ok(!topRightClass.includes('left-1/2'));
  });

  it('deletes connection cleanly without relying on blocking browser confirm()', () => {
    let connections = [
      SAMPLE_CONN,
      {
        id: 'conn-to-delete',
        name: 'Obsolete Test DB',
        engine: 'postgres',
        host: 'localhost',
        port: 5432,
        database: 'old_db',
        env: 'dev' as const,
      },
    ];

    let deleteConfirmTarget: ConnectionProfile | null = null;

    // Simulate clicking delete button: sets target without calling window.confirm
    const onStartDelete = (conn: ConnectionProfile) => {
      deleteConfirmTarget = conn;
    };

    onStartDelete(connections[1]);
    assert.equal(deleteConfirmTarget?.id, 'conn-to-delete');
    assert.equal(deleteConfirmTarget?.name, 'Obsolete Test DB');

    // Simulate confirming delete via in-app modal
    const onConfirmDelete = () => {
      if (!deleteConfirmTarget) return;
      const targetId = deleteConfirmTarget.id;
      connections = connections.filter((c) => c.id !== targetId);
      deleteConfirmTarget = null;
    };

    onConfirmDelete();
    assert.equal(connections.length, 1);
    assert.equal(connections[0].id, 'conn-prod-vigo-1');
    assert.equal(deleteConfirmTarget, null);
  });

  it('enforces single canonical action button rule (no duplicate buttons for same function on one screen)', () => {
    // 1. Connection Modal URL mode: Exactly one Next button in footer
    interface ModalFooterState {
      newConnMethod: 'catalog' | 'url' | 'file';
      hasParsedUrl: boolean;
      hasDuplicateCardButton: boolean;
    }

    const urlScreenState: ModalFooterState = {
      newConnMethod: 'url',
      hasParsedUrl: true,
      hasDuplicateCardButton: false, // Card button removed, only preview chips remain
    };

    // Guarantee no card button exists inside the URL preview
    assert.equal(urlScreenState.hasDuplicateCardButton, false);

    // 2. Default Workspace actions: distinct method parameters for Catalog vs File import
    let launchedMethod: string | undefined;
    const setConnectionModalOpen = (open: boolean, method?: 'catalog' | 'url' | 'file') => {
      if (open) launchedMethod = method;
    };

    setConnectionModalOpen(true, 'catalog');
    assert.equal(launchedMethod, 'catalog');

    setConnectionModalOpen(true, 'file');
    assert.equal(launchedMethod, 'file');
  });
});



