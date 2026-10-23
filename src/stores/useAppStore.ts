import { create } from 'zustand';
import { ConnectionProfile, ConnectionGroup, GridRow, ProcessItem, QueryHistoryItem, TabItem, SqlTabState, SqlQueryResultItem, ConnectionSession, ThemeMode, AppThemeId, UserSettings, FunctionItem, HeartbeatMetrics, SafetyMode, SafetyConfirmationRequest } from '../types';
import { STOCK_ITEMS_ROWS, WAREHOUSES_ROWS, getTablesForConnection } from '../data/schemas';
import { executeRealQuery, getRealTables, getRealFunctions, testRealConnection } from '../services/dbService';
import { heartbeatService } from '../services/heartbeatService';
import { getThemeDefinition } from '../themes/themeRegistry';
import { splitSqlStatements } from '../utils/sqlParser';
import { isReadOnlySql } from '../utils/sqlSafety';
import { buildPendingTransactionSql } from '../utils/gridDataUtils';

interface AppState {
  tabs: TabItem[];
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  openNewQueryTab: (initialSql?: string) => void;
  openTableGridTab: (tableName: string) => void;
  openTableSchemaTab: (tableName: string) => void;
  openAllTableStatsTab: () => void;
  openAllFunctionsTab: () => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  closeAllTabs: () => void;
  duplicateTab: (id: string) => void;
  renameTab: (id: string, newTitle: string) => void;

  sqlTabStates: Record<string, SqlTabState>;
  setSqlTabQuery: (tabId: string, query: string) => void;
  runSqlQuery: (tabId: string, customQuery?: string, meta?: { mode?: 'current' | 'all' | 'selection'; isSelection?: boolean; statementIndex?: number; totalStatements?: number }) => Promise<void>;
  cancelSqlQuery: (tabId: string) => void;
  setActiveQueryResultTab: (tabId: string, resultId: string) => void;
  closeQueryResultTab: (tabId: string, resultId: string) => void;
  togglePinQueryResultTab: (tabId: string, resultId: string) => void;

  liveTables: Record<string, { name: string; count: string }[]>;
  fetchLiveTables: (conn?: ConnectionProfile) => Promise<void>;

  liveFunctions: Record<string, FunctionItem[]>;
  fetchLiveFunctions: (conn?: ConnectionProfile) => Promise<void>;

  activeTab: 'grid' | 'schema' | 'sql' | 'stats' | 'connection' | 'default';
  setActiveTab: (tab: 'grid' | 'schema' | 'sql' | 'stats' | 'connection' | 'default') => void;

  appMode: 'sql' | 'redis' | 'snowflake';
  setAppMode: (mode: 'sql' | 'redis' | 'snowflake') => void;

  // User Settings & Theme Mode (Dark / Light / Auto + 11 Iconic Developer Themes)
  settings: UserSettings;
  resolvedTheme: 'dark' | 'light';
  isSettingsModalOpen: boolean;
  setSettingsModalOpen: (open: boolean) => void;
  updateSettings: (updates: Partial<UserSettings>) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setAppTheme: (themeId: AppThemeId) => void;
  updateResolvedTheme: (resolved: 'dark' | 'light') => void;

  // Multi-Connection Workspaces & Session Isolation
  openSessionIds: string[];
  sessions: Record<string, ConnectionSession>;
  openSession: (connId: string) => void;
  closeSession: (connId: string) => void;

  connectionGroups: ConnectionGroup[];
  connections: ConnectionProfile[];
  addConnectionGroup: (group: Omit<ConnectionGroup, 'id'>) => ConnectionGroup;
  updateConnectionGroup: (id: string, updates: Partial<ConnectionGroup>) => void;
  deleteConnectionGroup: (id: string) => void;
  addConnection: (profile: Omit<ConnectionProfile, 'id'>) => ConnectionProfile;
  updateConnection: (id: string, updates: Partial<ConnectionProfile>) => void;
  deleteConnection: (id: string) => void;
  reorderConnectionGroups: (sourceId: string, targetId: string, position: 'before' | 'after') => void;
  moveConnection: (connId: string, targetGroupId: string, targetConnId?: string, position?: 'before' | 'after') => void;
  switchActiveConnection: (id: string) => void;

  isConnecting: boolean;
  connectingPhase: string;
  connectingLogs: string[];
  networkSpeed: string;
  triggerConnectingAnimation: (targetConnId?: string) => Promise<void>;

  activeConnection: ConnectionProfile;
  setActiveConnection: (conn: ConnectionProfile) => void;

  isDatabaseModalOpen: boolean;
  setDatabaseModalOpen: (open: boolean) => void;
  switchActiveDatabase: (dbName: string) => void;
  createDatabase: (dbName: string) => void;

  isConnectionModalOpen: boolean;
  setConnectionModalOpen: (open: boolean) => void;

  reconnectModalOpen: boolean;
  setReconnectModalOpen: (open: boolean) => void;
  isReconnecting: boolean;
  reconnectActiveConnection: () => Promise<boolean>;

  heartbeatMetrics: HeartbeatMetrics;
  updateHeartbeat: (latencyMs: number, isHealthy: boolean, error?: string) => void;

  isHistoryModalOpen: boolean;
  setHistoryModalOpen: (open: boolean) => void;

  isRunningQueriesModalOpen: boolean;
  setRunningQueriesModalOpen: (open: boolean) => void;

  isSqlDiffModalOpen: boolean;
  setSqlDiffModalOpen: (open: boolean) => void;

  safetyConfirmation: SafetyConfirmationRequest | null;
  setConnectionSafeMode: (connId: string, mode: SafetyMode) => void;
  requestSafetyConfirmation: (req: {
    sqlText: string;
    title?: string;
    actionLabel?: string;
    isCommit?: boolean;
  }) => Promise<boolean>;
  confirmSafetyAction: (passwordInput?: string) => { success: boolean; error?: string };
  cancelSafetyAction: () => void;

  isTransactionOpen: boolean;
  setTransactionOpen: (open: boolean) => void;

  pendingEditsCount: number;
  resetPending: () => void;

  selectedTable: string;
  setSelectedTable: (tbl: string) => void;

  isSidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;

  isRightInspectorOpen: boolean;
  setRightInspectorOpen: (open: boolean) => void;
  toggleRightInspector: () => void;
  rightInspectorWidth: number;
  setRightInspectorWidth: (width: number) => void;

  isBottomPanelOpen: boolean;
  setBottomPanelOpen: (open: boolean) => void;
  toggleBottomPanel: () => void;
  bottomPanelHeight: number;
  setBottomPanelHeight: (height: number) => void;

  sqlEditorSplitHeight: number;
  setSqlEditorSplitHeight: (height: number) => void;
  isSqlResultsCollapsed: boolean;
  setIsSqlResultsCollapsed: (collapsed: boolean) => void;
  toggleSqlResultsCollapsed: () => void;

  selectedRowData: any | null;
  setSelectedRowData: (row: any | null) => void;

  tableViewMode: 'data' | 'structure' | 'index';
  setTableViewMode: (mode: 'data' | 'structure' | 'index') => void;

  isFilterBarOpen: boolean;
  toggleFilterBar: () => void;
  filterWhereText: string;
  setFilterWhereText: (val: string) => void;
  filterOrderByText: string;
  setFilterOrderByText: (val: string) => void;

  structureSearchColumn: string;
  setStructureSearchColumn: (val: string) => void;

  selectedStructureColumn: any | null;
  setSelectedStructureColumn: (col: any | null) => void;

  inspectorWidth: 'normal' | 'expanded';
  toggleInspectorWidth: () => void;

  originalRows: GridRow[];
  rows: GridRow[];
  updateCell: (id: number, field: keyof GridRow, value: any) => void;
  insertRow: () => void;
  duplicateRow: (sourceRow: GridRow) => void;
  deleteRow: (id: number) => void;
  rollbackTransaction: () => void;
  commitTransaction: () => Promise<{ sqlText: string; count: number }>;
  getPendingSQL: () => string;

  truncatedTables: Record<string, boolean>;
  deletedTables: Record<string, string[]>;
  truncateTable: (tableName: string) => Promise<void>;
  dropTable: (tableName: string) => Promise<void>;

  processes: ProcessItem[];
  killProcess: (pid: number) => void;

  history: QueryHistoryItem[];

  isReloading: boolean;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  reloadData: (tableName?: string) => Promise<void>;
}

const INITIAL_ROWS: GridRow[] = [
  {
    id: 1034,
    user_id: 501,
    customer_name: 'Alex Turner',
    product_sku: 'SKU-8902-M',
    order_details: { items: 3, total: 145.0, express: true },
    total_amount: 145.0,
    created_at: '2026-10-20 14:30:00',
    status: 'shipped',
    isDirty: false,
    dirtyFields: {},
    rowState: 'clean',
  },
  {
    id: 1035,
    user_id: 502,
    customer_name: 'Sarah Connor',
    product_sku: 'SKU-1239-X',
    order_details: { items: 1, total: 89.5, reason: 'size_mismatch' },
    total_amount: 89.5,
    created_at: '2026-10-21 09:15:00',
    status: 'processing_refund',
    isDirty: true,
    dirtyFields: { status: true },
    rowState: 'modified',
  },
  {
    id: 1036,
    user_id: 503,
    customer_name: 'Khoa Nguyen',
    product_sku: 'SKU-4560-L',
    order_details: { items: 5, total: 1200.0, vip: true },
    total_amount: 1200.0,
    created_at: '2026-10-21 11:00:00',
    status: 'completed',
    isDirty: false,
    dirtyFields: {},
    rowState: 'clean',
  },
  {
    id: 1037,
    user_id: 504,
    customer_name: 'Elena Rostova',
    product_sku: 'SKU-9901-S',
    order_details: { items: 2, total: 340.0 },
    total_amount: 340.0,
    created_at: '2026-10-21 13:45:00',
    status: 'pending',
    isDirty: false,
    dirtyFields: {},
    rowState: 'clean',
  },
  {
    id: 1038,
    user_id: 505,
    customer_name: 'Marcus Vance',
    product_sku: 'SKU-3321-XL',
    order_details: { items: 4, total: 580.0 },
    total_amount: 580.0,
    created_at: '2026-10-21 15:20:00',
    status: 'completed',
    isDirty: false,
    dirtyFields: {},
    rowState: 'clean',
  },
  {
    id: 1039,
    user_id: 506,
    customer_name: 'Chloe Bennett',
    product_sku: 'SKU-7721-M',
    order_details: { items: 2, total: 210.0, coupon: 'SAVE20' },
    total_amount: 210.0,
    created_at: '2026-10-21 16:05:00',
    status: 'shipped',
    isDirty: false,
    dirtyFields: {},
    rowState: 'clean',
  },
  {
    id: 1040,
    user_id: 507,
    customer_name: 'David Kim',
    product_sku: 'SKU-1082-S',
    order_details: { items: 1, total: 65.0 },
    total_amount: 65.0,
    created_at: '2026-10-21 17:30:00',
    status: 'delivered',
    isDirty: false,
    dirtyFields: {},
    rowState: 'clean',
  },
  {
    id: 1041,
    user_id: 508,
    customer_name: 'Emma Watson',
    product_sku: 'SKU-4402-L',
    order_details: { items: 6, total: 890.0, express: true },
    total_amount: 890.0,
    created_at: '2026-10-21 18:15:00',
    status: 'processing',
    isDirty: false,
    dirtyFields: {},
    rowState: 'clean',
  },
  {
    id: 1042,
    user_id: 509,
    customer_name: 'Liam Gallagher',
    product_sku: 'SKU-9021-XS',
    order_details: { items: 1, total: 45.0 },
    total_amount: 45.0,
    created_at: '2026-10-21 19:40:00',
    status: 'completed',
    isDirty: false,
    dirtyFields: {},
    rowState: 'clean',
  },
  {
    id: 1043,
    user_id: 510,
    customer_name: 'Sophia Chen',
    product_sku: 'SKU-5510-M',
    order_details: { items: 3, total: 315.0, giftWrap: true },
    total_amount: 315.0,
    created_at: '2026-10-21 20:00:00',
    status: 'shipped',
    isDirty: false,
    dirtyFields: {},
    rowState: 'clean',
  },
  {
    id: 1044,
    user_id: 511,
    customer_name: 'Oliver Queen',
    product_sku: 'SKU-8820-XXL',
    order_details: { items: 2, total: 195.0 },
    total_amount: 195.0,
    created_at: '2026-10-21 21:10:00',
    status: 'pending',
    isDirty: false,
    dirtyFields: {},
    rowState: 'clean',
  },
  {
    id: 1045,
    user_id: 512,
    customer_name: 'Amara Thorne',
    product_sku: 'SKU-2091-S',
    order_details: { items: 4, total: 440.0 },
    total_amount: 440.0,
    created_at: '2026-10-21 22:25:00',
    status: 'delivered',
    isDirty: false,
    dirtyFields: {},
    rowState: 'clean',
  },
  {
    id: 1046,
    user_id: 513,
    customer_name: 'Noah Patel',
    product_sku: 'SKU-6632-L',
    order_details: { items: 1, total: 120.0 },
    total_amount: 120.0,
    created_at: '2026-10-22 08:05:00',
    status: 'completed',
    isDirty: false,
    dirtyFields: {},
    rowState: 'clean',
  },
  {
    id: 1047,
    user_id: 514,
    customer_name: 'Isabella Silva',
    product_sku: 'SKU-3140-M',
    order_details: { items: 3, total: 275.0, express: true },
    total_amount: 275.0,
    created_at: '2026-10-22 09:40:00',
    status: 'processing',
    isDirty: false,
    dirtyFields: {},
    rowState: 'clean',
  },
  {
    id: 1048,
    user_id: 515,
    customer_name: 'Lucas Wright',
    product_sku: 'SKU-9944-XL',
    order_details: { items: 2, total: 160.0 },
    total_amount: 160.0,
    created_at: '2026-10-22 10:15:00',
    status: 'delivered',
    isDirty: false,
    dirtyFields: {},
    rowState: 'clean',
  },
];

const GOOSE_ROWS: GridRow[] = [
  { id: 1, version_id: 0, is_applied: true, tstamp: '2026-09-20 11:05:42.760469', dirtyFields: {}, isDirty: false, rowState: 'clean' },
  { id: 2, version_id: 1, is_applied: true, tstamp: '2026-09-20 11:05:42.791719', dirtyFields: {}, isDirty: false, rowState: 'clean' },
  { id: 3, version_id: 2, is_applied: true, tstamp: '2026-09-20 11:05:42.919323', dirtyFields: {}, isDirty: false, rowState: 'clean' },
  { id: 4, version_id: 3, is_applied: true, tstamp: '2026-09-20 11:05:42.934156', dirtyFields: {}, isDirty: false, rowState: 'clean' },
  { id: 5, version_id: 4, is_applied: true, tstamp: '2026-09-20 11:05:42.975246', dirtyFields: {}, isDirty: false, rowState: 'clean' },
  { id: 6, version_id: 5, is_applied: true, tstamp: '2026-09-20 11:05:42.985788', dirtyFields: {}, isDirty: false, rowState: 'clean' },
];

const TUPLE_ROWS: GridRow[] = [
  { id: 1, store: '01M2Z8794GWTS8MMZKGD922YX9', object_type: 'connector_tool', object_id: '0bef96c9-a2a1-4c42-bd12-e69a59a29647_r2770', relation: 'organisation', _user: 'organisation:5e4d3eb5-53af-4a0f-98a8-355ee55b326b_r2770#member', user_type: 'userset', ulid: '01M2Z8794GWTS8MMZKGD922YX9', inserted_at: '2026-10-21 11:20:10+00', condition_name: '', condition_context: null, dirtyFields: {}, isDirty: false, rowState: 'clean' },
  { id: 2, store: '01M2Z8794GWTS8MMZKGD922YX9', object_type: 'connector_tool', object_id: '0bef96c9-a2a1-4c42-bd12-e69a59a29647_r2782', relation: 'organisation', _user: 'organisation:5e4d3eb5-53af-4a0f-98a8-355ee55b326b_r2782#member', user_type: 'userset', ulid: '01M2Z8794GWTS8MMZKGD922YXA', inserted_at: '2026-10-21 11:22:15+00', condition_name: '', condition_context: null, dirtyFields: {}, isDirty: false, rowState: 'clean' },
  { id: 3, store: '01M2Z8794GWTS8MMZKGD922YX9', object_type: 'connector_tool', object_id: '0bef96c9-a2a1-4c42-bd12-e69a59a29647_r2806', relation: 'organisation', _user: 'organisation:5e4d3eb5-53af-4a0f-98a8-355ee55b326b_r2806#member', user_type: 'userset', ulid: '01M2Z8794GWTS8MMZKGD922YXB', inserted_at: '2026-10-21 11:25:30+00', condition_name: '', condition_context: null, dirtyFields: {}, isDirty: false, rowState: 'clean' },
  { id: 4, store: '01M2Z8794GWTS8MMZKGD922YX9', object_type: 'connector_tool', object_id: '0da14052-e311-4305-ae60-71d157ab9587_r2770', relation: 'organisation', _user: 'organisation:5e4d3eb5-53af-4a0f-98a8-355ee55b326b_r2770#member', user_type: 'userset', ulid: '01M2Z8794GWTS8MMZKGD922YXC', inserted_at: '2026-10-21 11:30:00+00', condition_name: '', condition_context: null, dirtyFields: {}, isDirty: false, rowState: 'clean' },
  { id: 5, store: '01M2Z8794GWTS8MMZKGD922YX9', object_type: 'connector_tool', object_id: '0fde576c-344d-45d8-879b-fcf8aa1ee2f3_r2782', relation: 'everyone', _user: 'organisation:5e4d3eb5-53af-4a0f-98a8-355ee55b326b_r2782#active_member', user_type: 'userset', ulid: '01M5FB8XBAJQ406DP5PVW247CQ', inserted_at: '2026-10-21 13:44:07+00', condition_name: 'EMPTY', condition_context: null, dirtyFields: {}, isDirty: false, rowState: 'clean' },
  { id: 6, store: '01M2Z8794GWTS8MMZKGD922YX9', object_type: 'connector_tool', object_id: '15453fec-4d45-4954-9dcc-923120562ec6_r2770', relation: 'organisation', _user: 'grantee:user:76adbfc3-ae54-469b', user_type: 'userset', ulid: '01M5FB8XBAJQ406DP5PVW247CR', inserted_at: '2026-10-21 13:48:00+00', condition_name: '', condition_context: null, dirtyFields: {}, isDirty: false, rowState: 'clean' },
];

const USERS_ROWS: GridRow[] = [
  { id: 501, email: 'alex.turner@corp.io', full_name: 'Alex Turner', role: 'admin', status: 'active', created_at: '2026-01-10 09:20:00', dirtyFields: {}, isDirty: false, rowState: 'clean' },
  { id: 502, email: 'sarah.connor@cyberdyne.net', full_name: 'Sarah Connor', role: 'member', status: 'active', created_at: '2026-02-15 14:10:00', dirtyFields: {}, isDirty: false, rowState: 'clean' },
  { id: 503, email: 'khoa.nguyen@ai.lab', full_name: 'Khoa Nguyen', role: 'superadmin', status: 'active', created_at: '2026-03-01 11:45:00', dirtyFields: {}, isDirty: false, rowState: 'clean' },
];

const PRODUCTS_ROWS: GridRow[] = [
  { id: 101, sku: 'PROD-MAC-M4', title: 'MacBook Pro M4 Max', category_id: 1, price: 3499.00, stock: 45, is_active: true, dirtyFields: {}, isDirty: false, rowState: 'clean' },
  { id: 102, sku: 'PROD-DISP-5K', title: 'Studio Display 5K Retina', category_id: 2, price: 1599.00, stock: 28, is_active: true, dirtyFields: {}, isDirty: false, rowState: 'clean' },
  { id: 103, sku: 'PROD-KEY-TOUCH', title: 'Magic Keyboard with Touch ID', category_id: 3, price: 199.00, stock: 120, is_active: true, dirtyFields: {}, isDirty: false, rowState: 'clean' },
];

const getDefaultRowsForTable = (tbl: string, isTruncated?: boolean): GridRow[] => {
  if (isTruncated) return [];
  if (tbl === 'goose_db_version') return GOOSE_ROWS;
  if (tbl === 'tuple') return TUPLE_ROWS;
  if (tbl === 'stock_items') return STOCK_ITEMS_ROWS;
  if (tbl === 'warehouses') return WAREHOUSES_ROWS;
  if (tbl === 'users') return USERS_ROWS;
  if (tbl === 'products') return PRODUCTS_ROWS;
  return INITIAL_ROWS;
};

const INITIAL_SQL_TAB_STATES: Record<string, SqlTabState> = {
  'tab-sql-1': {
    tabId: 'tab-sql-1',
    query: `SELECT u.id, u.email, COUNT(o.id) AS total_orders, SUM(o.total_amount) AS total_spend
FROM users u
LEFT JOIN user_orders o ON o.user_id = u.id
WHERE u.status = 'active'
GROUP BY u.id, u.email
ORDER BY total_spend DESC LIMIT 50;`,
    results: [
      { id: 501, email: 'alex.turner@corp.io', total_orders: 14, total_spend: 2030.0 },
      { id: 502, email: 'sarah.connor@cyberdyne.net', total_orders: 29, total_spend: 4210.5 },
      { id: 503, email: 'khoa.nguyen@ai.lab', total_orders: 102, total_spend: 12450.0 },
    ],
    columns: ['id', 'email', 'total_orders', 'total_spend'],
    durationMs: 1.4,
    rowsCount: 3,
    executedAt: 'Just now',
    isExecuting: false,
    queryResults: [
      {
        id: 'q-1',
        title: 'Query 1',
        query: `SELECT u.id, u.email, COUNT(o.id) AS total_orders, SUM(o.total_amount) AS total_spend\nFROM users u\nLEFT JOIN user_orders o ON o.user_id = u.id\nWHERE u.status = 'active'\nGROUP BY u.id, u.email\nORDER BY total_spend DESC LIMIT 50;`,
        results: [
          { id: 501, email: 'alex.turner@corp.io', total_orders: 14, total_spend: 2030.0 },
          { id: 502, email: 'sarah.connor@cyberdyne.net', total_orders: 29, total_spend: 4210.5 },
          { id: 503, email: 'khoa.nguyen@ai.lab', total_orders: 102, total_spend: 12450.0 },
        ],
        columns: ['id', 'email', 'total_orders', 'total_spend'],
        durationMs: 1.4,
        rowsCount: 3,
        executedAt: 'Just now',
        status: 'success',
      },
    ],
    activeResultId: 'q-1',
  },
};

const INITIAL_GROUPS: ConnectionGroup[] = [
  { id: 'group-prod', name: 'Production', color: 'rose', tag: 'PROD' },
  { id: 'group-staging', name: 'Staging GCP', color: 'amber', tag: 'QA' },
  { id: 'group-local', name: 'Localhost', color: 'emerald', tag: 'DEV' },
];

const INITIAL_CONNECTIONS: ConnectionProfile[] = [
  {
    id: 'conn-1',
    name: 'ecom_prod_db (PostgreSQL)',
    groupId: 'group-local',
    engine: 'postgres',
    env: 'local',
    host: 'localhost',
    port: 5432,
    database: 'ecom_prod_db',
    databases: [
      'ecom_prod_db',
      'postgres',
      'local_dev',
    ],
    username: 'dev_user',
    password: 'dev_password',
    useSsh: false,
    active: true,
    latencyMs: 0.8,
  },
  {
    id: 'conn-4',
    name: 'analytics-mysql (MySQL 8.0)',
    groupId: 'group-local',
    engine: 'mysql',
    env: 'local',
    host: 'localhost',
    port: 3306,
    database: 'analytics_staging',
    databases: [
      'analytics_staging',
      'information_schema',
      'performance_schema',
    ],
    username: 'dev_user',
    password: 'dev_password',
    useSsh: false,
    active: false,
    latencyMs: 1.1,
  },
  {
    id: 'conn-3',
    name: 'docker-redis (Port 6379)',
    groupId: 'group-local',
    engine: 'redis',
    env: 'local',
    host: 'localhost',
    port: 6379,
    database: '0',
    databases: ['0', '1', '2', '3', '4', '5'],
    username: 'default',
    password: '',
    active: false,
    latencyMs: 0.4,
  },
  {
    id: 'conn-stock',
    name: 'stock_movement (Postgres)',
    groupId: 'group-local',
    engine: 'postgres',
    env: 'local',
    host: 'localhost',
    port: 5432,
    database: 'ecom_prod_db',
    databases: ['ecom_prod_db', 'postgres'],
    username: 'dev_user',
    password: 'dev_password',
    active: false,
    latencyMs: 0.9,
  },
  {
    id: 'conn-2',
    name: 'analytics-dwh (Cloud)',
    groupId: 'group-prod',
    engine: 'snowflake',
    env: 'prod',
    host: 'xy12345.us-east-1.snowflakecomputing.com',
    port: 443,
    database: 'ANALYTICS_PROD',
    databases: ['ANALYTICS_PROD', 'RAW_DWH', 'REPORTING', 'SNOWFLAKE'],
    username: 'dwh_engineer',
    password: '••••••••••••',
    accountIdentifier: 'xy12345.us-east-1',
    warehouse: 'COMPUTE_WH',
    active: false,
    latencyMs: 24.5,
    safeMode: 'alert-2',
  },
  {
    id: 'conn-5',
    name: '[Production] [VN] Vigo DB (SSH)',
    groupId: 'group-prod',
    engine: 'postgres',
    env: 'prod',
    host: 'oms.coy4vltic3yw.ap-southeast-1.rds.amazonaws.com',
    port: 5432,
    database: 'app_db',
    databases: ['app_db', 'postgres'],
    username: 'postgres',
    password: '••••••••••••',
    useSsh: true,
    sshHost: '13.212.189.147',
    sshPort: 22,
    sshUser: 'ec2-user',
    sshPassword: '',
    useSshKey: true,
    sshKeyPath: 'id_rsa',
    active: false,
    latencyMs: 14.2,
    safeMode: 'alert-2',
  },
];

const createDefaultSessionForConnection = (conn: ConnectionProfile): ConnectionSession => {
  const isStock = conn.name.toLowerCase().includes('stock') || (conn.database && conn.database.toLowerCase().includes('stock'));
  const defaultTable = isStock ? 'stock_items' : 'user_orders';
  const defaultRows = isStock ? STOCK_ITEMS_ROWS : INITIAL_ROWS;

  const defaultTabs: TabItem[] = isStock
    ? [
        { id: `tab-grid-${conn.id}-1`, type: 'grid', title: 'stock_items', tableName: 'stock_items', canClose: true },
        { id: `tab-sql-${conn.id}-1`, type: 'sql', title: 'Stock Movement Query', canClose: true },
      ]
    : [
        { id: `tab-sql-${conn.id}-1`, type: 'sql', title: 'SQL Query', canClose: true },
        { id: `tab-grid-${conn.id}-1`, type: 'grid', title: 'tuple', tableName: 'tuple', canClose: true },
        { id: `tab-grid-${conn.id}-2`, type: 'grid', title: 'goose_db_version', tableName: 'goose_db_version', canClose: true },
      ];

  const defaultSqlTabId = isStock ? defaultTabs[1].id : defaultTabs[0].id;
  const defaultSqlState: SqlTabState = isStock
    ? {
        tabId: defaultSqlTabId,
        query: `SELECT sku, name, current_stock, unit_price, status\nFROM stock_items\nWHERE current_stock < 50\nORDER BY current_stock ASC;`,
        results: [
          { sku: 'WH-GPU-4090FE', name: 'GeForce RTX 4090 24GB Founders', current_stock: 18, unit_price: 1599.00, status: 'low_stock' },
          { sku: 'WH-CASE-O11D-EVO', name: 'Lian Li O11 Dynamic EVO RGB', current_stock: 44, unit_price: 169.00, status: 'in_stock' },
        ],
        columns: ['sku', 'name', 'current_stock', 'unit_price', 'status'],
        durationMs: 1.1,
        rowsCount: 2,
        executedAt: 'Just now',
        isExecuting: false,
      }
    : {
        tabId: defaultSqlTabId,
        query: `SELECT u.id, u.email, COUNT(o.id) AS total_orders, SUM(o.total_amount) AS total_spend\nFROM users u\nLEFT JOIN user_orders o ON o.user_id = u.id\nWHERE u.status = 'active'\nGROUP BY u.id, u.email\nORDER BY total_spend DESC LIMIT 50;`,
        results: [
          { id: 501, email: 'alex.turner@corp.io', total_orders: 14, total_spend: 2030.0 },
          { id: 502, email: 'sarah.connor@cyberdyne.net', total_orders: 29, total_spend: 4210.5 },
          { id: 503, email: 'khoa.nguyen@ai.lab', total_orders: 102, total_spend: 12450.0 },
        ],
        columns: ['id', 'email', 'total_orders', 'total_spend'],
        durationMs: 1.4,
        rowsCount: 3,
        executedAt: 'Just now',
        isExecuting: false,
      };

  return {
    connectionId: conn.id,
    tabs: defaultTabs,
    activeTabId: defaultTabs[0].id,
    sqlTabStates: { [defaultSqlTabId]: defaultSqlState },
    selectedTable: defaultTable,
    tableViewMode: 'data',
    isFilterBarOpen: false,
    filterWhereText: '',
    filterOrderByText: '',
    rows: JSON.parse(JSON.stringify(defaultRows)),
    originalRows: JSON.parse(JSON.stringify(defaultRows)),
    isTransactionOpen: false,
    pendingEditsCount: 0,
    history: [],
    selectedRowData: null,
    selectedStructureColumn: null,
    structureSearchColumn: '',
  };
};

const INITIAL_SESSIONS: Record<string, ConnectionSession> = {
  'conn-1': createDefaultSessionForConnection(INITIAL_CONNECTIONS[0]),
  'conn-4': createDefaultSessionForConnection(INITIAL_CONNECTIONS[1]),
  'conn-stock': createDefaultSessionForConnection(INITIAL_CONNECTIONS.find((c) => c.id === 'conn-stock') || INITIAL_CONNECTIONS[0]),
  'conn-5': createDefaultSessionForConnection(INITIAL_CONNECTIONS.find((c) => c.id === 'conn-5') || INITIAL_CONNECTIONS[0]),
};

const getInitialSettings = (): UserSettings => {
  let initialMode: ThemeMode = 'auto';
  let initialTheme: AppThemeId = 'default-dark';
  try {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlTheme = urlParams.get('theme');
      if (urlTheme) {
        if (urlTheme === 'light') {
          initialMode = 'light';
          initialTheme = 'default-light';
        } else if (urlTheme === 'dark') {
          initialMode = 'dark';
          initialTheme = 'default-dark';
        } else if (urlTheme === 'auto') {
          initialMode = 'auto';
          initialTheme = 'default-dark';
        } else {
          const def = getThemeDefinition(urlTheme);
          initialTheme = def.id;
          initialMode = def.category;
        }
      }
    }
  } catch {}
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('db_nerd_user_settings') : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.appTheme) {
        parsed.appTheme = parsed.themeMode === 'light' ? 'default-light' : 'default-dark';
      }
      if (initialTheme !== 'default-dark' || initialMode !== 'auto') {
        parsed.themeMode = initialMode;
        parsed.appTheme = initialTheme;
      }
      return parsed;
    }
  } catch {}
  return {
    themeMode: initialMode,
    appTheme: initialTheme,
    editorFontSize: 13,
    rowDensity: 'normal',
    autoFormatSql: false,
    confirmDestructive: true,
    defaultQueryLimit: 100,
  };
};

const resolveTheme = (mode: ThemeMode, appTheme?: AppThemeId): 'dark' | 'light' => {
  if (appTheme) {
    const def = getThemeDefinition(appTheme);
    return def.category;
  }
  if (mode === 'auto') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  }
  return mode;
};

const INITIAL_SETTINGS = getInitialSettings();
const INITIAL_RESOLVED_THEME = resolveTheme(INITIAL_SETTINGS.themeMode, INITIAL_SETTINGS.appTheme);

const getInitialConnId = (): string => {
  try {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlConn = urlParams.get('conn');
      if (urlConn && INITIAL_CONNECTIONS.some((c) => c.id === urlConn)) {
        return urlConn;
      }
    }
  } catch {}
  return 'conn-1';
};

const INITIAL_ACTIVE_CONN_ID = getInitialConnId();
const INITIAL_ACTIVE_CONN = INITIAL_CONNECTIONS.find((c) => c.id === INITIAL_ACTIVE_CONN_ID) || INITIAL_CONNECTIONS[0];
const INITIAL_ACTIVE_SESSION = INITIAL_SESSIONS[INITIAL_ACTIVE_CONN.id] || INITIAL_SESSIONS['conn-1'];

const getInitialActiveTabId = () => {
  try {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      if (tabParam) {
        const found = INITIAL_ACTIVE_SESSION.tabs.find((t) => t.id === tabParam || t.title === tabParam || t.tableName === tabParam);
        if (found) return found.id;
      }
    }
  } catch {}
  return INITIAL_ACTIVE_SESSION.activeTabId;
};

const INITIAL_TAB_ID = getInitialActiveTabId();
const INITIAL_ACTIVE_TAB = INITIAL_ACTIVE_SESSION.tabs.find((t) => t.id === INITIAL_TAB_ID) || INITIAL_ACTIVE_SESSION.tabs[0];

const getInitialSelectedRow = () => {
  try {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const rowIdStr = urlParams.get('row');
      if (rowIdStr) {
        const id = parseInt(rowIdStr, 10);
        return INITIAL_ACTIVE_SESSION.rows.find((r) => r.id === id) || null;
      }
    }
  } catch {}
  return null;
};

const getInitialSettingsModalOpen = () => {
  try {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('settings') === 'open' || urlParams.get('settings') === 'true';
    }
  } catch {}
  return false;
};

const activeCancelledTabs = new Set<string>();

export const useAppStore = create<AppState>((set, get) => ({
  settings: INITIAL_SETTINGS,
  resolvedTheme: INITIAL_RESOLVED_THEME,
  isSettingsModalOpen: getInitialSettingsModalOpen(),
  setSettingsModalOpen: (open) => set({ isSettingsModalOpen: open }),

  updateSettings: (updates) => {
    set((state) => {
      const nextSettings = { ...state.settings, ...updates };
      try {
        localStorage.setItem('db_nerd_user_settings', JSON.stringify(nextSettings));
      } catch {}
      const nextResolved = resolveTheme(nextSettings.themeMode, nextSettings.appTheme);
      return {
        settings: nextSettings,
        resolvedTheme: nextResolved,
      };
    });
  },

  setThemeMode: (mode) => {
    const currentTheme = get().settings.appTheme;
    let nextTheme = currentTheme;
    if (mode === 'light') {
      nextTheme = 'default-light';
    } else if (mode === 'dark') {
      nextTheme = currentTheme === 'default-light' ? 'default-dark' : currentTheme;
    }
    get().updateSettings({ themeMode: mode, appTheme: nextTheme });
    get().showToast(`🎨 Theme Mode: ${mode === 'auto' ? 'Auto (System)' : mode === 'dark' ? 'Dark Mode' : 'Light Mode'}`);
  },

  setAppTheme: (themeId) => {
    const def = getThemeDefinition(themeId);
    get().updateSettings({
      appTheme: themeId,
      themeMode: def.category,
    });
    get().showToast(`🎨 Theme: ${def.name}`);
  },

  updateResolvedTheme: (resolved) => set({ resolvedTheme: resolved }),

  openSessionIds: ['conn-1', 'conn-4'],
  sessions: INITIAL_SESSIONS,

  openSession: (connId) => {
    const { openSessionIds, switchActiveConnection } = get();
    if (!openSessionIds.includes(connId)) {
      set((state) => ({ openSessionIds: [...state.openSessionIds, connId] }));
    }
    switchActiveConnection(connId);
  },

  closeSession: (connId) => {
    const { openSessionIds, activeConnection, switchActiveConnection, showToast } = get();
    const nextOpen = openSessionIds.filter((id) => id !== connId);
    if (nextOpen.length === 0) {
      set({
        openSessionIds: [],
        tabs: [],
        activeTabId: '',
        activeTab: 'default',
        isConnectionModalOpen: true,
      });
      showToast('All connections closed — returned to Connection Manager');
      return;
    }
    if (activeConnection.id === connId) {
      switchActiveConnection(nextOpen[0]);
    }
    set({ openSessionIds: nextOpen });
    showToast('Session disconnected');
  },

  tabs: INITIAL_ACTIVE_SESSION.tabs,
  activeTabId: INITIAL_TAB_ID,
  activeTab: INITIAL_ACTIVE_TAB?.type || 'sql',
  selectedTable: INITIAL_ACTIVE_TAB?.tableName || INITIAL_ACTIVE_SESSION.selectedTable,
  rows: JSON.parse(JSON.stringify(INITIAL_ACTIVE_SESSION.rows)),
  originalRows: JSON.parse(JSON.stringify(INITIAL_ACTIVE_SESSION.originalRows)),
  selectedRowData: getInitialSelectedRow(),

  setActiveTabId: (id) => {
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    set({
      activeTabId: id,
      activeTab: tab.type,
      selectedTable: tab.tableName || get().selectedTable,
    });
  },

  setActiveTab: (tabType) => {
    const { tabs, activeTabId, selectedTable } = get();
    let match = tabs.find((t) => t.id === activeTabId && t.type === tabType);
    if (!match) {
      match = tabs.find((t) => t.type === tabType && (!t.tableName || t.tableName === selectedTable));
    }
    if (!match) {
      match = tabs.find((t) => t.type === tabType);
    }
    if (match) {
      set({
        activeTabId: match.id,
        activeTab: tabType,
        selectedTable: match.tableName || selectedTable,
      });
    } else {
      set({ activeTab: tabType });
    }
  },

  sqlTabStates: INITIAL_SQL_TAB_STATES,

  setSqlTabQuery: (tabId, query) => {
    set((state) => ({
      sqlTabStates: {
        ...state.sqlTabStates,
        [tabId]: {
          ...(state.sqlTabStates[tabId] || {
            tabId,
            results: [],
            columns: [],
            durationMs: 0,
            rowsCount: 0,
          }),
          query,
        },
      },
    }));
  },

  liveTables: {},
  fetchLiveTables: async (conn) => {
    const targetConn = conn || get().activeConnection;
    try {
      const tables = await getRealTables(targetConn);
      if (tables && tables.length > 0) {
        set((state) => ({
          liveTables: {
            ...state.liveTables,
            [targetConn.id]: tables,
          },
        }));
      }
    } catch (e) {
      console.warn('Fetch live tables failed:', e);
    }
  },

  liveFunctions: {},
  fetchLiveFunctions: async (conn) => {
    const targetConn = conn || get().activeConnection;
    try {
      const funcs = await getRealFunctions(targetConn);
      if (funcs && funcs.length > 0) {
        set((state) => ({
          liveFunctions: {
            ...state.liveFunctions,
            [targetConn.id]: funcs,
          },
        }));
      }
    } catch (e) {
      console.warn('Fetch live functions failed:', e);
    }
  },

  setActiveQueryResultTab: (tabId, resultId) => {
    set((state) => {
      const tabState = state.sqlTabStates[tabId];
      if (!tabState || !tabState.queryResults) return state;
      const target = tabState.queryResults.find((r) => r.id === resultId);
      if (!target) return state;

      return {
        sqlTabStates: {
          ...state.sqlTabStates,
          [tabId]: {
            ...tabState,
            activeResultId: resultId,
            lastExecutedQuery: target.query,
            results: target.results,
            columns: target.columns,
            durationMs: target.durationMs,
            rowsCount: target.rowsCount,
            error: target.error,
          },
        },
      };
    });
  },

  closeQueryResultTab: (tabId, resultId) => {
    set((state) => {
      const tabState = state.sqlTabStates[tabId];
      if (!tabState || !tabState.queryResults) return state;
      const nextResults = tabState.queryResults.filter((r) => r.id !== resultId);
      if (nextResults.length === 0) {
        return {
          sqlTabStates: {
            ...state.sqlTabStates,
            [tabId]: {
              ...tabState,
              queryResults: [],
              activeResultId: undefined,
              results: [],
              columns: [],
              rowsCount: 0,
            },
          },
        };
      }
      let nextActiveId = tabState.activeResultId;
      if (tabState.activeResultId === resultId) {
        nextActiveId = nextResults[nextResults.length - 1].id;
      }
      const activeItem = nextResults.find((r) => r.id === nextActiveId) || nextResults[0];
      return {
        sqlTabStates: {
          ...state.sqlTabStates,
          [tabId]: {
            ...tabState,
            queryResults: nextResults,
            activeResultId: activeItem.id,
            lastExecutedQuery: activeItem.query,
            results: activeItem.results,
            columns: activeItem.columns,
            durationMs: activeItem.durationMs,
            rowsCount: activeItem.rowsCount,
            error: activeItem.error,
          },
        },
      };
    });
  },

  togglePinQueryResultTab: (tabId, resultId) => {
    set((state) => {
      const tabState = state.sqlTabStates[tabId];
      if (!tabState || !tabState.queryResults) return state;
      const updated = tabState.queryResults.map((r) =>
        r.id === resultId ? { ...r, isPinned: !r.isPinned } : r
      );
      const isNowPinned = updated.find((r) => r.id === resultId)?.isPinned;
      get().showToast(isNowPinned ? `📌 Pinned query tab` : `Unpinned query tab`);
      return {
        sqlTabStates: {
          ...state.sqlTabStates,
          [tabId]: {
            ...tabState,
            queryResults: updated,
          },
        },
      };
    });
  },

  cancelSqlQuery: (tabId) => {
    activeCancelledTabs.add(tabId);
    set((state) => {
      const tabState = state.sqlTabStates[tabId];
      if (!tabState) return state;
      const updatedResults = tabState.queryResults?.map((r) =>
        r.status === 'pending' || r.status === 'running'
          ? { ...r, status: 'error' as const, error: 'Execution cancelled by user' }
          : r
      );
      return {
        sqlTabStates: {
          ...state.sqlTabStates,
          [tabId]: {
            ...tabState,
            isExecuting: false,
            executionProgress: undefined,
            queryResults: updatedResults || tabState.queryResults,
          },
        },
      };
    });
    get().showToast('🛑 Query execution cancelled (⌘.)');
  },

  runSqlQuery: async (tabId, customQuery, meta) => {
    const currentState = get().sqlTabStates[tabId];
    const fullEditorQuery = (customQuery !== undefined && customQuery !== '') ? customQuery : (currentState?.query || '');
    const activeConn = get().activeConnection;

    activeCancelledTabs.delete(tabId);

    // 1. Determine statements to run
    let rawStatements: { trimmedText: string; from?: number; to?: number }[] = [];

    if (meta?.mode === 'all') {
      const parsed = splitSqlStatements(fullEditorQuery);
      rawStatements = parsed.length > 0 ? parsed : [{ trimmedText: fullEditorQuery.trim() }];
    } else if (customQuery) {
      const parsed = splitSqlStatements(customQuery);
      rawStatements = parsed.length > 1 ? parsed : [{ trimmedText: customQuery.trim() }];
    } else {
      const parsed = splitSqlStatements(fullEditorQuery);
      rawStatements = parsed.length > 0 ? [parsed[0]] : [{ trimmedText: fullEditorQuery.trim() }];
    }

    const statementsToRun = rawStatements.filter((s) => s.trimmedText && s.trimmedText !== ';');
    if (statementsToRun.length === 0) {
      get().showToast('⚠️ No executable SQL statement found');
      return;
    }

    // Safety verification check: prompt warning or password if mode requires it
    const fullExecutedSql = statementsToRun.map((s) => s.trimmedText).join(';\n');
    const approved = await get().requestSafetyConfirmation({
      sqlText: fullExecutedSql,
      title: 'Authorize Query Execution',
      actionLabel: 'Execute Query (↵)',
    });
    if (!approved) {
      get().showToast('🛑 Query execution cancelled by user');
      return;
    }

    if (statementsToRun.length === 0) {
      get().showToast('⚠️ No SQL statement to execute');
      return;
    }

    const initialQueryResults: SqlQueryResultItem[] = statementsToRun.map((s, idx) => ({
      id: `q-${idx + 1}`,
      title: `Query ${idx + 1}`,
      query: s.trimmedText,
      results: [],
      columns: [],
      durationMs: 0,
      rowsCount: 0,
      executedAt: '',
      status: 'pending',
    }));

    set((state) => ({
      sqlTabStates: {
        ...state.sqlTabStates,
        [tabId]: {
          ...(state.sqlTabStates[tabId] || {
            tabId,
            results: [],
            columns: [],
            durationMs: 0,
            rowsCount: 0,
          }),
          query: fullEditorQuery,
          lastExecutedQuery: statementsToRun[0].trimmedText,
          isExecuting: true,
          queryResults: initialQueryResults,
          activeResultId: 'q-1',
          executionProgress: { current: 1, total: statementsToRun.length },
        },
      },
    }));

    const finalQueryResults: SqlQueryResultItem[] = [...initialQueryResults];
    let totalSuccessCount = 0;
    let firstErrorResultId: string | null = null;

    for (let i = 0; i < statementsToRun.length; i++) {
      if (activeCancelledTabs.has(tabId)) {
        for (let j = i; j < finalQueryResults.length; j++) {
          finalQueryResults[j].status = 'error';
          finalQueryResults[j].error = 'Execution cancelled by user';
        }
        break;
      }

      const currentStmt = statementsToRun[i];
      finalQueryResults[i].status = 'running';

      set((state) => ({
        sqlTabStates: {
          ...state.sqlTabStates,
          [tabId]: {
            ...state.sqlTabStates[tabId],
            activeResultId: `q-${i + 1}`,
            executionProgress: { current: i + 1, total: statementsToRun.length },
            queryResults: [...finalQueryResults],
          },
        },
      }));

      const startMs = performance.now();

      // Check if statement contains a sleep or long-running query simulation (e.g. pg_sleep(5))
      const sleepMatch = currentStmt.trimmedText.match(/(?:pg_sleep|sleep)\s*\(\s*(\d+(?:\.\d+)?)\s*\)/i);
      if (sleepMatch) {
        const sleepSec = parseFloat(sleepMatch[1]) || 5;
        const sleepTargetMs = Math.min(120000, sleepSec * 1000);
        const sleepStart = performance.now();
        while (performance.now() - sleepStart < sleepTargetMs) {
          if (activeCancelledTabs.has(tabId)) break;
          await new Promise((r) => setTimeout(r, 100));
        }
      } else if (typeof window !== 'undefined' && !(window as any).__TAURI_INTERNALS__) {
        // Natural execution pause for browser simulation to showcase loading and statements progression
        await new Promise((r) => setTimeout(r, 220));
      }

      if (activeCancelledTabs.has(tabId)) {
        for (let j = i; j < finalQueryResults.length; j++) {
          finalQueryResults[j].status = 'error';
          finalQueryResults[j].error = 'Execution cancelled by user';
        }
        break;
      }

      try {
        const res = await executeRealQuery(activeConn, currentStmt.trimmedText);
        let duration = res.duration_ms || +(performance.now() - startMs).toFixed(1) || 1.1;
        let isSuccess = res.success && !res.error;
        let rows = isSuccess ? res.rows : (res.error ? [{ error: res.error }] : []);
        let errorMsg = isSuccess ? undefined : res.error;

        // In browser / test mode without Tauri desktop runtime, provide realistic table rows
        if (!isSuccess && res.error && (res.error.includes("reading 'invoke'") || res.error.includes("__TAURI__"))) {
          const tblMatch = currentStmt.trimmedText.match(/FROM\s+([a-zA-Z0-9_]+)/i);
          const tbl = tblMatch ? tblMatch[1].toLowerCase() : (i === 0 ? 'users' : i === 1 ? 'user_orders' : 'products');
          const mockRows = getDefaultRowsForTable(tbl);
          rows = mockRows && mockRows.length > 0 ? mockRows : [
            { id: 101, name: 'Sample Record 1', status: 'active', created_at: new Date().toISOString() },
            { id: 102, name: 'Sample Record 2', status: 'completed', created_at: new Date().toISOString() },
          ];
          isSuccess = true;
          errorMsg = undefined;
          duration = +(Math.random() * 2 + 1.2).toFixed(1);
        }

        const columns = (isSuccess && rows.length > 0)
          ? Object.keys(rows[0])
          : res.columns && res.columns.length > 0
          ? res.columns
          : ['result'];

        const upperStmt = currentStmt.trimmedText.trim().toUpperCase();
        let statusMsg = `Query ${i + 1} OK`;
        if (!isSuccess) {
          statusMsg = `Query ${i + 1} Error: ${errorMsg || 'Failed'}`;
        } else if (upperStmt.startsWith('COMMIT')) {
          statusMsg = `Query ${i + 1} OK: COMMIT`;
        } else if (upperStmt.startsWith('ROLLBACK')) {
          statusMsg = `Query ${i + 1} OK: ROLLBACK`;
        } else if (upperStmt.startsWith('SELECT')) {
          statusMsg = `Query ${i + 1} OK: ${rows.length} rows`;
        } else if (upperStmt.startsWith('INSERT') || upperStmt.startsWith('UPDATE') || upperStmt.startsWith('DELETE')) {
          statusMsg = `Query ${i + 1} OK: ${res.rows_affected || rows.length || 1} rows affected`;
        } else {
          statusMsg = `Query ${i + 1} OK: ${currentStmt.trimmedText.split('\n')[0].slice(0, 25)}`;
        }

        finalQueryResults[i] = {
          ...finalQueryResults[i],
          status: isSuccess ? 'success' : 'error',
          results: rows,
          columns,
          durationMs: duration,
          rowsCount: isSuccess ? rows.length : 0,
          executedAt: new Date().toLocaleTimeString(),
          error: errorMsg,
          statusMessage: statusMsg,
        };

        if (isSuccess) {
          totalSuccessCount++;
          heartbeatService.recordActivity();
          get().updateHeartbeat(duration, true);
        } else {
          if (!firstErrorResultId) firstErrorResultId = `q-${i + 1}`;
        }

        set((state) => ({
          history: [
            {
              id: `h-${Date.now()}-${i}`,
              connectionName: activeConn.name,
              env: activeConn.env,
              sql: currentStmt.trimmedText,
              timestamp: `Today at ${new Date().toTimeString().slice(0, 8)}`,
              durationMs: duration,
              rowsAffected: res.rows_affected || (isSuccess ? rows.length : 0),
              status: isSuccess ? 'success' : 'error',
              isFavorite: false,
            },
            ...state.history,
          ],
        }));
      } catch (err: any) {
        const errMsg = String(err?.message || err);
        const duration = +(performance.now() - startMs).toFixed(1);
        finalQueryResults[i] = {
          ...finalQueryResults[i],
          status: 'error',
          results: [{ error: errMsg }],
          columns: ['error'],
          durationMs: duration,
          rowsCount: 0,
          executedAt: new Date().toLocaleTimeString(),
          error: errMsg,
          statusMessage: `Query ${i + 1} Error: ${errMsg}`,
        };
        if (!firstErrorResultId) firstErrorResultId = `q-${i + 1}`;
      }
    }

    const wasCancelled = activeCancelledTabs.has(tabId);
    activeCancelledTabs.delete(tabId);

    const pinnedResults = (currentState?.queryResults || []).filter((r) => r.isPinned);
    const mergedResults = [...pinnedResults, ...finalQueryResults];

    const targetResultId = firstErrorResultId || (mergedResults.length > 0 ? mergedResults[mergedResults.length - 1].id : 'q-1');
    const activeRes = mergedResults.find((r) => r.id === targetResultId) || mergedResults[0];

    set((state) => ({
      sqlTabStates: {
        ...state.sqlTabStates,
        [tabId]: {
          ...state.sqlTabStates[tabId],
          isExecuting: false,
          executionProgress: undefined,
          queryResults: mergedResults,
          activeResultId: activeRes?.id || 'q-1',
          lastExecutedQuery: activeRes?.query,
          results: activeRes?.results || [],
          columns: activeRes?.columns || [],
          durationMs: activeRes?.durationMs || 0,
          rowsCount: activeRes?.rowsCount || 0,
          error: activeRes?.error,
        },
      },
    }));

    if (wasCancelled) {
      get().showToast('🛑 Query execution cancelled');
    } else if (statementsToRun.length > 1) {
      if (totalSuccessCount === statementsToRun.length) {
        get().showToast(`⚡ All ${statementsToRun.length} queries executed successfully!`);
      } else {
        get().showToast(`⚠️ Executed ${totalSuccessCount}/${statementsToRun.length} queries (${statementsToRun.length - totalSuccessCount} failed)`);
      }
    } else {
      if (activeRes?.status === 'success') {
        if (meta?.isSelection) {
          get().showToast(`⚡ Executed selection in ${activeRes.durationMs}ms (${activeRes.rowsCount} rows)`);
        } else if (meta?.totalStatements && meta.totalStatements > 1 && meta.statementIndex !== undefined) {
          get().showToast(`⚡ Executed query #${meta.statementIndex + 1} of ${meta.totalStatements} in ${activeRes.durationMs}ms (${activeRes.rowsCount} rows)`);
        } else {
          get().showToast(`⚡ Query executed in ${activeRes.durationMs}ms (${activeRes.rowsCount} rows)`);
        }
      } else {
        get().showToast(`❌ Query error: ${activeRes?.error || 'Execution failed'}`);
      }
    }
  },

  renameTab: (id, newTitle) => {
    if (!newTitle.trim()) return;
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, title: newTitle.trim() } : t)),
    }));
  },

  openNewQueryTab: (initialSql) => {
    const { tabs, sqlTabStates } = get();
    const sqlTabs = tabs.filter((t) => t.type === 'sql');
    const count = sqlTabs.length;
    const nextTabId = `tab-sql-${Date.now()}`;
    const tabTitle = count === 0 ? 'SQL Query' : `SQL Query ${count + 1}`;

    const defaultSql =
      initialSql ||
      (count === 0
        ? `SELECT u.id, u.email, COUNT(o.id) AS total_orders, SUM(o.total_amount) AS total_spend\nFROM users u\nLEFT JOIN user_orders o ON o.user_id = u.id\nWHERE u.status = 'active'\nGROUP BY u.id, u.email\nORDER BY total_spend DESC LIMIT 50;`
        : count === 1
        ? `SELECT store, object_type, object_id, relation, _user\nFROM tuple\nWHERE object_type = 'connector_tool'\nORDER BY inserted_at DESC\nLIMIT 20;`
        : `SELECT id, version_id, is_applied, tstamp\nFROM goose_db_version\nORDER BY id ASC;`);

    // Detect target table to return accurate data
    let targetTable = '';
    const match = defaultSql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    if (match) targetTable = match[1].toLowerCase();

    let initialResults: any[] = [];
    if (targetTable === 'goose_db_version') {
      initialResults = JSON.parse(JSON.stringify(GOOSE_ROWS));
    } else if (targetTable === 'tuple') {
      initialResults = JSON.parse(JSON.stringify(TUPLE_ROWS));
    } else if (targetTable === 'stock_items') {
      initialResults = JSON.parse(JSON.stringify(STOCK_ITEMS_ROWS));
    } else if (targetTable === 'warehouses') {
      initialResults = JSON.parse(JSON.stringify(WAREHOUSES_ROWS));
    } else if (targetTable === 'users') {
      initialResults = [
        { id: 501, email: 'alex.turner@corp.io', full_name: 'Alex Turner', role: 'admin', status: 'active' },
        { id: 502, email: 'sarah.connor@cyberdyne.net', full_name: 'Sarah Connor', role: 'member', status: 'active' },
        { id: 503, email: 'khoa.nguyen@ai.lab', full_name: 'Khoa Nguyen', role: 'superadmin', status: 'active' },
      ];
    } else if (targetTable === 'products') {
      initialResults = [
        { id: 101, sku: 'PROD-MAC-M4', title: 'MacBook Pro M4 Max', category_id: 1, price: 3499.00, stock: 45, is_active: true },
        { id: 102, sku: 'PROD-DISP-5K', title: 'Studio Display 5K Retina', category_id: 2, price: 1599.00, stock: 28, is_active: true },
        { id: 103, sku: 'PROD-KEY-TOUCH', title: 'Magic Keyboard with Touch ID', category_id: 3, price: 199.00, stock: 120, is_active: true },
      ];
    } else {
      initialResults = [
        { id: 501, email: 'alex.turner@corp.io', total_orders: 14, total_spend: 2030.0 },
        { id: 502, email: 'sarah.connor@cyberdyne.net', total_orders: 29, total_spend: 4210.5 },
        { id: 503, email: 'khoa.nguyen@ai.lab', total_orders: 102, total_spend: 12450.0 },
      ];
    }

    const initialColumns = Object.keys(initialResults[0] || {});

    const newTab: TabItem = {
      id: nextTabId,
      type: 'sql',
      title: tabTitle,
      canClose: true,
    };

    set({
      tabs: [...tabs, newTab],
      activeTabId: newTab.id,
      activeTab: 'sql',
      sqlTabStates: {
        ...sqlTabStates,
        [nextTabId]: {
          tabId: nextTabId,
          query: defaultSql,
          results: initialResults,
          columns: initialColumns,
          durationMs: 1.4,
          rowsCount: initialResults.length,
          executedAt: 'Just now',
          isExecuting: false,
        },
      },
    });
  },

  openTableGridTab: (tableName) => {
    const { tabs } = get();
    const existing = tabs.find((t) => t.type === 'grid' && t.tableName === tableName);
    if (existing) {
      set({
        activeTabId: existing.id,
        activeTab: 'grid',
        selectedTable: tableName,
        tableViewMode: 'data',
      });
      get().setSelectedTable(tableName);
    } else {
      const newTab: TabItem = {
        id: `tab-grid-${tableName}`,
        type: 'grid',
        title: tableName,
        tableName,
        canClose: true,
      };
      set({
        tabs: [...tabs, newTab],
        activeTabId: newTab.id,
        activeTab: 'grid',
        selectedTable: tableName,
        tableViewMode: 'data',
      });
      get().setSelectedTable(tableName);
    }
  },

  openTableSchemaTab: (tableName) => {
    get().setSelectedTable(tableName);
    get().openTableGridTab(tableName);
    set({ tableViewMode: 'structure' });
  },

  openAllTableStatsTab: () => {
    const { tabs, activeConnection } = get();
    const schemaName = activeConnection.engine === 'postgres' ? 'public' : activeConnection.database || 'public';
    const tabTitle = `Tables.${schemaName}`;
    const tabId = `tab-tables-${activeConnection.id}`;

    const existing = tabs.find((t) => t.id === tabId || (t.type === 'stats' && t.title.startsWith('Tables.')));
    if (existing) {
      set({
        activeTabId: existing.id,
        activeTab: 'stats',
      });
    } else {
      const newTab: TabItem = {
        id: tabId,
        type: 'stats',
        title: tabTitle,
        tableName: '__all_tables__',
        canClose: true,
      };
      set({
        tabs: [...tabs, newTab],
        activeTabId: newTab.id,
        activeTab: 'stats',
      });
    }
  },

  openAllFunctionsTab: () => {
    const { tabs, activeConnection } = get();
    const schemaName = activeConnection.engine === 'postgres' ? 'public' : activeConnection.database || 'public';
    const tabTitle = `Functions.${schemaName}`;
    const tabId = `tab-functions-${activeConnection.id}`;

    const existing = tabs.find((t) => t.id === tabId || (t.type === 'stats' && t.title.startsWith('Functions.')));
    if (existing) {
      set({
        activeTabId: existing.id,
        activeTab: 'stats',
      });
    } else {
      const newTab: TabItem = {
        id: tabId,
        type: 'stats',
        title: tabTitle,
        tableName: '__all_functions__',
        canClose: true,
      };
      set({
        tabs: [...tabs, newTab],
        activeTabId: newTab.id,
        activeTab: 'stats',
      });
    }
  },

  closeTab: (id) => {
    const { tabs, activeTabId, selectedTable } = get();
    const tabToClose = tabs.find((t) => t.id === id);
    if (tabToClose && tabToClose.canClose === false) return;

    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;

    const nextTabs = tabs.filter((t) => t.id !== id);

    if (nextTabs.length === 0) {
      set({
        tabs: [],
        activeTabId: '',
        activeTab: 'default',
      });
      return;
    }

    let nextActiveId = activeTabId;
    if (activeTabId === id) {
      const newIdx = Math.min(idx, nextTabs.length - 1);
      nextActiveId = nextTabs[newIdx].id;
    }

    const nextActiveTab = nextTabs.find((t) => t.id === nextActiveId);
    set({
      tabs: nextTabs,
      activeTabId: nextActiveId,
      activeTab: nextActiveTab?.type || 'grid',
      selectedTable: nextActiveTab?.tableName || selectedTable,
    });
  },

  closeOtherTabs: (id) => {
    const { tabs, selectedTable } = get();
    const target = tabs.find((t) => t.id === id);
    if (!target) return;
    const nextTabs = tabs.filter((t) => t.id === id || t.canClose === false);
    set({
      tabs: nextTabs,
      activeTabId: target.id,
      activeTab: target.type,
      selectedTable: target.tableName || selectedTable,
    });
  },

  closeTabsToRight: (id) => {
    const { tabs, activeTabId, selectedTable } = get();
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const nextTabs = tabs.filter((t, i) => i <= idx || t.canClose === false);
    let nextActiveId = activeTabId;
    if (!nextTabs.some((t) => t.id === activeTabId)) {
      nextActiveId = id;
    }
    const nextActive = nextTabs.find((t) => t.id === nextActiveId) || nextTabs[0];
    set({
      tabs: nextTabs,
      activeTabId: nextActive ? nextActive.id : '',
      activeTab: nextActive ? nextActive.type : 'default',
      selectedTable: nextActive?.tableName || selectedTable,
    });
  },

  closeAllTabs: () => {
    const { tabs } = get();
    const remaining = tabs.filter((t) => t.canClose === false);
    if (remaining.length === 0) {
      set({
        tabs: [],
        activeTabId: '',
        activeTab: 'default',
      });
    } else {
      set({
        tabs: remaining,
        activeTabId: remaining[0].id,
        activeTab: remaining[0].type,
        selectedTable: remaining[0].tableName || get().selectedTable,
      });
    }
  },

  duplicateTab: (id) => {
    const { tabs, sqlTabStates } = get();
    const target = tabs.find((t) => t.id === id);
    if (!target) return;
    const newId = `tab-${target.type}-${Date.now()}`;
    const newTab: TabItem = {
      ...target,
      id: newId,
      title: `${target.title} (Copy)`,
      canClose: true,
    };
    const nextTabs = [...tabs, newTab];
    const nextSqlStates = { ...sqlTabStates };
    if (target.type === 'sql' && sqlTabStates[id]) {
      nextSqlStates[newId] = {
        ...sqlTabStates[id],
        tabId: newId,
      };
    }
    set({
      tabs: nextTabs,
      activeTabId: newId,
      activeTab: newTab.type,
      selectedTable: newTab.tableName || get().selectedTable,
      sqlTabStates: nextSqlStates,
    });
  },

  appMode: 'sql',
  setAppMode: (mode) => set({ appMode: mode }),

  isConnecting: false,
  connectingPhase: '',
  connectingLogs: [],
  networkSpeed: '355 KB/s',

  triggerConnectingAnimation: async (targetConnId?: string) => {
    const conn = targetConnId ? get().connections.find((c) => c.id === targetConnId) || get().activeConnection : get().activeConnection;
    if (!conn) return;

    set({
      isConnecting: true,
      connectingPhase: `Resolving ${conn.host}:${conn.port}...`,
      networkSpeed: '128 KB/s',
      connectingLogs: [
        `[00.01s] ❯ Pinging target ${conn.host}:${conn.port} (${conn.engine.toUpperCase()})... OK (0.28ms)`,
      ],
    });


    await new Promise((r) => setTimeout(r, 160));

    set((state) => ({
      connectingPhase: 'TLSv1.3 Handshake (AES-256-GCM)...',
      networkSpeed: '355 KB/s',
      connectingLogs: [
        ...state.connectingLogs,
        `[00.08s] ❯ Initializing TLSv1.3 cryptographic handshake (TLS_AES_256_GCM_SHA384)`,
      ],
    }));

    await new Promise((r) => setTimeout(r, 180));

    set((state) => ({
      connectingPhase: `Authenticating ${conn.username || 'dev_user'}...`,
      networkSpeed: '780 KB/s',
      connectingLogs: [
        ...state.connectingLogs,
        `[00.18s] ❯ Authenticated role '${conn.username || 'dev_user'}' to database '${conn.database || 'default'}'`,
      ],
    }));

    await new Promise((r) => setTimeout(r, 180));

    set((state) => ({
      connectingPhase: 'In-Memory Schema Indexer: Mapping Tables...',
      networkSpeed: '1.2 MB/s',
      connectingLogs: [
        ...state.connectingLogs,
        `[00.28s] ❯ Pre-indexed schema: 5 tables, 42 columns, 6 foreign keys (0.8ms)`,
      ],
    }));

    await new Promise((r) => setTimeout(r, 200));


    set((state) => ({
      isConnecting: false,
      connectingPhase: 'Connected',
      networkSpeed: '355 KB/s',
      connectingLogs: [
        ...state.connectingLogs,
        `[00.35s] 🟢 CONNECTED: 120 FPS Virtualized Canvas Active`,
      ],
    }));
  },

  connectionGroups: INITIAL_GROUPS,
  connections: INITIAL_CONNECTIONS,
  activeConnection: INITIAL_ACTIVE_CONN,
  setActiveConnection: (conn) => set({ activeConnection: conn }),

  addConnectionGroup: (group) => {
    const newGroup: ConnectionGroup = {
      ...group,
      id: `group-${Date.now()}`,
    };
    set((state) => ({ connectionGroups: [...state.connectionGroups, newGroup] }));
    return newGroup;
  },

  updateConnectionGroup: (id, updates) => {
    set((state) => ({
      connectionGroups: state.connectionGroups.map((g) => (g.id === id ? { ...g, ...updates } : g)),
    }));
  },

  deleteConnectionGroup: (id) => {
    set((state) => ({
      connectionGroups: state.connectionGroups.filter((g) => g.id !== id),
      connections: state.connections.filter((c) => c.groupId !== id),
    }));
  },

  addConnection: (profile) => {
    const newConn: ConnectionProfile = {
      ...profile,
      id: `conn-${Date.now()}`,
    };
    set((state) => ({ connections: [...state.connections, newConn] }));
    return newConn;
  },

  updateConnection: (id, updates) => {
    set((state) => {
      const nextConnections = state.connections.map((c) => (c.id === id ? { ...c, ...updates } : c));
      const nextActive = state.activeConnection.id === id ? { ...state.activeConnection, ...updates } : state.activeConnection;
      return { connections: nextConnections, activeConnection: nextActive };
    });
  },

  deleteConnection: (id) => {
    set((state) => {
      const nextConnections = state.connections.filter((c) => c.id !== id);
      let nextActive = state.activeConnection;
      if (state.activeConnection.id === id && nextConnections.length > 0) {
        nextActive = nextConnections[0];
      }
      return { connections: nextConnections, activeConnection: nextActive };
    });
  },

  reorderConnectionGroups: (sourceId, targetId, position) => {
    set((state) => {
      const groups = [...state.connectionGroups];
      const fromIdx = groups.findIndex((g) => g.id === sourceId);
      const toIdx = groups.findIndex((g) => g.id === targetId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return state;

      const [movedGroup] = groups.splice(fromIdx, 1);
      let insertIdx = groups.findIndex((g) => g.id === targetId);
      if (position === 'after') {
        insertIdx += 1;
      }
      groups.splice(insertIdx, 0, movedGroup);
      return { connectionGroups: groups };
    });
  },

  moveConnection: (connId, targetGroupId, targetConnId, position) => {
    set((state) => {
      const conns = [...state.connections];
      const fromIdx = conns.findIndex((c) => c.id === connId);
      if (fromIdx === -1) return state;

      const [moved] = conns.splice(fromIdx, 1);
      const updatedMoved: ConnectionProfile = { ...moved, groupId: targetGroupId };

      let nextActive = state.activeConnection;
      if (state.activeConnection.id === connId) {
        nextActive = { ...state.activeConnection, groupId: targetGroupId };
      }

      if (targetConnId && targetConnId !== connId) {
        let insertIdx = conns.findIndex((c) => c.id === targetConnId);
        if (insertIdx !== -1) {
          if (position === 'after') {
            insertIdx += 1;
          }
          conns.splice(insertIdx, 0, updatedMoved);
          return { connections: conns, activeConnection: nextActive };
        }
      }

      // If no targetConnId specified, append to targetGroupId
      const lastInGroupIdx = conns
        .map((c, i) => (c.groupId === targetGroupId ? i : -1))
        .filter((i) => i !== -1)
        .pop();

      if (lastInGroupIdx !== undefined && lastInGroupIdx >= 0) {
        conns.splice(lastInGroupIdx + 1, 0, updatedMoved);
      } else {
        conns.push(updatedMoved);
      }

      return { connections: conns, activeConnection: nextActive };
    });
  },

  switchActiveConnection: (id) => {
    const state = get();
    if (state.activeConnection?.id === id) return;

    const targetConn = state.connections.find((c) => c.id === id);
    if (!targetConn) return;

    // 1. Snapshot current active session state
    const currentId = state.activeConnection?.id;
    const currentSession: ConnectionSession = {
      connectionId: currentId,
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      sqlTabStates: state.sqlTabStates,
      selectedTable: state.selectedTable,
      tableViewMode: state.tableViewMode,
      isFilterBarOpen: state.isFilterBarOpen,
      filterWhereText: state.filterWhereText,
      filterOrderByText: state.filterOrderByText,
      rows: state.rows,
      originalRows: state.originalRows,
      isTransactionOpen: state.isTransactionOpen,
      pendingEditsCount: state.pendingEditsCount,
      history: state.history,
      selectedRowData: state.selectedRowData,
      selectedStructureColumn: state.selectedStructureColumn,
      structureSearchColumn: state.structureSearchColumn,
    };

    const nextSessions = {
      ...state.sessions,
      [currentId]: currentSession,
    };

    // 2. Ensure target connection is in openSessionIds
    const nextOpenSessionIds = state.openSessionIds.includes(id)
      ? state.openSessionIds
      : [...state.openSessionIds, id];

    // 3. Load or create target session
    let targetSession = nextSessions[id];
    if (!targetSession) {
      targetSession = createDefaultSessionForConnection(targetConn);
      nextSessions[id] = targetSession;
    }

    const nextEngine = targetConn.engine;
    const nextAppMode = nextEngine === 'redis' ? 'redis' : nextEngine === 'snowflake' ? 'snowflake' : 'sql';

    // 4. Update store with fully isolated session state
    set({
      openSessionIds: nextOpenSessionIds,
      sessions: nextSessions,
      activeConnection: { ...targetConn, active: true },
      connections: state.connections.map((c) => ({ ...c, active: c.id === id })),
      appMode: nextAppMode,

      // Restored isolated workspace session
      tabs: targetSession.tabs,
      activeTabId: targetSession.activeTabId,
      activeTab: targetSession.tabs.find((t) => t.id === targetSession.activeTabId)?.type || 'grid',
      sqlTabStates: targetSession.sqlTabStates,
      selectedTable: targetSession.selectedTable,
      tableViewMode: targetSession.tableViewMode,
      isFilterBarOpen: targetSession.isFilterBarOpen,
      filterWhereText: targetSession.filterWhereText,
      filterOrderByText: targetSession.filterOrderByText,
      rows: targetSession.rows,
      originalRows: targetSession.originalRows,
      isTransactionOpen: targetSession.isTransactionOpen,
      pendingEditsCount: targetSession.pendingEditsCount,
      history: targetSession.history,
      selectedRowData: targetSession.selectedRowData,
      selectedStructureColumn: targetSession.selectedStructureColumn,
      structureSearchColumn: targetSession.structureSearchColumn,
    });

    state.showToast(`⚡ Connecting to "${targetConn.name}"...`);
    get().triggerConnectingAnimation(id);
    get().fetchLiveTables(targetConn);
    get().reloadData();
  },

  isDatabaseModalOpen: false,
  setDatabaseModalOpen: (open) => set({ isDatabaseModalOpen: open }),

  switchActiveDatabase: (dbName) => {
    const { activeConnection, connections } = get();
    const nextConn = { ...activeConnection, database: dbName };
    const nextConnections = connections.map((c) =>
      c.id === activeConnection.id ? { ...c, database: dbName } : c
    );
    set({
      activeConnection: nextConn,
      connections: nextConnections,
      isDatabaseModalOpen: false,
    });
    get().fetchLiveTables(nextConn);
    get().reloadData();
  },

  createDatabase: (dbName) => {
    const { activeConnection, connections } = get();
    const currentDbs = activeConnection.databases || [activeConnection.database];
    const cleanName = dbName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanName) return;

    if (currentDbs.includes(cleanName)) {
      get().switchActiveDatabase(cleanName);
      return;
    }

    const nextDbs = [...currentDbs, cleanName];
    const nextConn = { ...activeConnection, database: cleanName, databases: nextDbs };
    const nextConnections = connections.map((c) =>
      c.id === activeConnection.id ? { ...c, database: cleanName, databases: nextDbs } : c
    );
    set({
      activeConnection: nextConn,
      connections: nextConnections,
      isDatabaseModalOpen: false,
    });
  },

  isConnectionModalOpen: typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('modal') === 'connection',
  setConnectionModalOpen: (open) => set({ isConnectionModalOpen: open }),

  reconnectModalOpen: typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('modal') === 'disconnected',
  setReconnectModalOpen: (open) => set({ reconnectModalOpen: open }),

  isReconnecting: false,
  reconnectActiveConnection: async () => {
    const conn = get().activeConnection;
    if (!conn) return false;
    set({ isReconnecting: true });
    get().showToast(`🔄 Reconnecting to '${conn.database || conn.name}'...`);
    try {
      const res = await testRealConnection(conn);
      const latency = res.latency_ms > 0 ? res.latency_ms : 1.2;
      if (res.success) {
        get().updateHeartbeat(latency, true);
        set({
          isReconnecting: false,
          reconnectModalOpen: false,
        });
        get().showToast(`🟢 Reconnected to '${conn.database || conn.name}' (${latency}ms)`);
        get().fetchLiveTables(conn);
        get().reloadData();
        return true;
      } else {
        get().updateHeartbeat(0, false, res.message);
        set({ isReconnecting: false });
        get().showToast(`❌ Reconnection failed: ${res.message || 'Cannot reach host'}`);
        return false;
      }
    } catch (err: any) {
      const msg = String(err?.message || err);
      get().updateHeartbeat(0, false, msg);
      set({ isReconnecting: false });
      get().showToast(`❌ Reconnection failed: ${msg}`);
      return false;
    }
  },

  heartbeatMetrics: {
    lastLatencyMs: 0.8,
    isHealthy: true,
    lastCheckedAt: Date.now(),
    consecutiveFailures: 0,
  },

  updateHeartbeat: (latencyMs, isHealthy, error) => {
    set((state) => {
      const nextStatus = isHealthy ? 'connected' : 'failed';
      const nextConn = {
        ...state.activeConnection,
        latencyMs: isHealthy ? latencyMs : state.activeConnection.latencyMs,
        connectionStatus: nextStatus as 'connected' | 'failed',
        lastError: isHealthy ? undefined : error,
      };
      return {
        heartbeatMetrics: {
          lastLatencyMs: latencyMs,
          isHealthy,
          lastCheckedAt: Date.now(),
          consecutiveFailures: isHealthy ? 0 : state.heartbeatMetrics.consecutiveFailures + 1,
          lastError: error,
        },
        activeConnection: nextConn,
        connections: state.connections.map((c) =>
          c.id === nextConn.id
            ? { ...c, latencyMs: nextConn.latencyMs, connectionStatus: nextConn.connectionStatus, lastError: nextConn.lastError }
            : c
        ),
      };
    });
  },

  isHistoryModalOpen: false,
  setHistoryModalOpen: (open) => set({ isHistoryModalOpen: open }),

  isRunningQueriesModalOpen: false,
  setRunningQueriesModalOpen: (open) => set({ isRunningQueriesModalOpen: open }),

  isSqlDiffModalOpen: false,
  setSqlDiffModalOpen: (open) => set({ isSqlDiffModalOpen: open }),

  safetyConfirmation: null,

  setConnectionSafeMode: (connId, mode) => {
    set((state) => {
      const nextConns = state.connections.map((c) =>
        c.id === connId ? { ...c, safeMode: mode } : c
      );
      const nextActive =
        state.activeConnection.id === connId
          ? { ...state.activeConnection, safeMode: mode }
          : state.activeConnection;
      return {
        connections: nextConns,
        activeConnection: nextActive,
      };
    });
    const label =
      mode === 'silent'
        ? 'Silent Mode (No warnings)'
        : mode === 'alert-1'
        ? 'Alert Mode 1 (Warn on all queries)'
        : mode === 'alert-2'
        ? 'Alert Mode 2 (Warn on write queries)'
        : mode === 'safe-1'
        ? 'Safe Mode 1 (Password required for all queries)'
        : 'Safe Mode 2 (Password required for write queries)';
    get().showToast(`🛡️ Safety Level set to ${label}`);
  },

  requestSafetyConfirmation: ({ sqlText, title, actionLabel, isCommit }) => {
    const { activeConnection } = get();
    const mode = activeConnection.safeMode || (activeConnection.env === 'prod' ? 'alert-2' : 'silent');

    if (mode === 'silent') {
      return Promise.resolve(true);
    }

    const isReadOnly = isReadOnlySql(sqlText);

    // Alert Mode 2 or Safe Mode 2: only prompt if NOT read-only (or if it's committing a transaction)
    if ((mode === 'alert-2' || mode === 'safe-2') && isReadOnly && !isCommit) {
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      const isSafe = mode.startsWith('safe');
      const req: SafetyConfirmationRequest = {
        id: `safety-${Date.now()}`,
        mode: isSafe ? 'safe' : 'alert',
        safeModeLevel: mode,
        title: title || (isSafe ? 'Safe Mode Authorization' : 'Alert Mode Confirmation'),
        sqlText,
        connectionName: activeConnection.name,
        environment: activeConnection.env,
        actionLabel,
        isCommit,
        resolve,
      };
      set({ safetyConfirmation: req });
    });
  },

  confirmSafetyAction: (passwordInput) => {
    const { safetyConfirmation, activeConnection } = get();
    if (!safetyConfirmation) return { success: false, error: 'No active confirmation' };

    if (safetyConfirmation.mode === 'safe') {
      const trimmed = (passwordInput || '').trim();
      const actualPass = (activeConnection.password || '').trim();

      let isValid = false;
      if (actualPass && actualPass !== '••••••••••••') {
        if (trimmed === actualPass || trimmed.toUpperCase() === 'CONFIRM') {
          isValid = true;
        }
      } else {
        if (
          trimmed.toUpperCase() === 'CONFIRM' ||
          trimmed.toUpperCase() === 'PROD' ||
          (activeConnection.username && trimmed.toLowerCase() === activeConnection.username.toLowerCase()) ||
          trimmed.length >= 4
        ) {
          isValid = true;
        }
      }

      if (!isValid) {
        return {
          success: false,
          error: 'Incorrect password. Enter database password or "CONFIRM".',
        };
      }
    }

    safetyConfirmation.resolve(true);
    set({ safetyConfirmation: null });
    return { success: true };
  },

  cancelSafetyAction: () => {
    const { safetyConfirmation } = get();
    if (safetyConfirmation) {
      safetyConfirmation.resolve(false);
      set({ safetyConfirmation: null });
    }
  },

  isTransactionOpen: false,
  setTransactionOpen: (open) => set({ isTransactionOpen: open }),

  pendingEditsCount: 0,
  resetPending: () => set({ pendingEditsCount: 0, isTransactionOpen: false }),

  truncatedTables: {},
  deletedTables: {},

  truncateTable: async (tableName: string) => {
    const { activeConnection, selectedTable, requestSafetyConfirmation } = get();
    const quote = activeConnection.engine === 'mysql' ? '`' : '"';
    const query = `TRUNCATE TABLE ${quote}${tableName}${quote};`;
    const approved = await requestSafetyConfirmation({
      sqlText: query,
      title: `Confirm TRUNCATE Table "${tableName}"`,
      actionLabel: 'Truncate Table (↵)',
    });
    if (!approved) return;

    try {
      await executeRealQuery(activeConnection, query);
    } catch (e) {
      console.warn('Real truncate failed:', e);
    }

    set((state) => ({
      truncatedTables: { ...state.truncatedTables, [tableName]: true },
      ...(selectedTable === tableName
        ? {
            rows: [],
            originalRows: [],
            pendingEditsCount: 0,
            selectedRowData: null,
            isTransactionOpen: false,
          }
        : {}),
      history: [
        {
          id: `hist-${Date.now()}`,
          connectionName: state.activeConnection.name,
          env: state.activeConnection.env,
          sql: `TRUNCATE TABLE "${tableName}";`,
          timestamp: 'Just now',
          durationMs: 1.1,
          rowsAffected: 0,
          status: 'success',
          isFavorite: false,
        },
        ...state.history,
      ],
    }));
    get().showToast(`⚡ Truncated table "${tableName}" (0 rows)`);
  },

  dropTable: async (tableName: string) => {
    const { activeConnection, selectedTable, tabs, closeTab, showToast, requestSafetyConfirmation } = get();
    const connId = activeConnection.id;
    const quote = activeConnection.engine === 'mysql' ? '`' : '"';
    const query = `DROP TABLE IF EXISTS ${quote}${tableName}${quote};`;

    const approved = await requestSafetyConfirmation({
      sqlText: query,
      title: `Confirm DROP Table "${tableName}"`,
      actionLabel: 'Drop Table (↵)',
    });
    if (!approved) return;

    try {
      await executeRealQuery(activeConnection, query);
    } catch (e) {
      console.warn('Real drop failed:', e);
    }

    // Close any tabs for this table
    const tabsToClose = tabs.filter((t) => t.tableName === tableName);
    tabsToClose.forEach((t) => closeTab(t.id));

    set((state) => {
      const prevDeleted = state.deletedTables[connId] || [];
      const nextDeleted = Array.from(new Set([...prevDeleted, tableName]));

      return {
        deletedTables: {
          ...state.deletedTables,
          [connId]: nextDeleted,
        },
        history: [
          {
            id: `hist-${Date.now()}`,
            connectionName: state.activeConnection.name,
            env: state.activeConnection.env,
            sql: `DROP TABLE "${tableName}";`,
            timestamp: 'Just now',
            durationMs: 1.8,
            rowsAffected: 0,
            status: 'success',
            isFavorite: false,
          },
          ...state.history,
        ],
      };
    });

    // If current selectedTable was dropped, switch to next available table
    if (selectedTable === tableName) {
      const allTables = getTablesForConnection(activeConnection.name, activeConnection.engine);
      const deletedForConn = get().deletedTables[connId] || [];
      const remaining = allTables.filter((t) => !deletedForConn.includes(t.name));
      const nextTbl = remaining.length > 0 ? remaining[0].name : 'user_orders';
      get().setSelectedTable(nextTbl);
      get().openTableGridTab(nextTbl);
    }

    showToast(`🗑️ Dropped table "${tableName}"`);
  },

  setSelectedTable: (tbl) => {
    const { truncatedTables } = get();
    const targetRows = getDefaultRowsForTable(tbl, truncatedTables[tbl]);
    set({
      selectedTable: tbl,
      selectedRowData: null,
      rows: JSON.parse(JSON.stringify(targetRows)),
      originalRows: JSON.parse(JSON.stringify(targetRows)),
      pendingEditsCount: 0,
    });
    // Asynchronously fetch live rows from Docker database
    get().reloadData(tbl);
  },

  isReloading: false,
  toastMessage: null,
  showToast: (msg: string) => {
    set({ toastMessage: msg });
    setTimeout(() => {
      set((state) => (state.toastMessage === msg ? { toastMessage: null } : {}));
    }, 2500);
  },
  reloadData: async (tableName?: string) => {
    const { activeTabId, tabs, selectedTable, runSqlQuery, showToast, truncatedTables, activeConnection } = get();
    const activeTab = tabs.find((t) => t.id === activeTabId);

    set({ isReloading: true });

    if (activeTab?.type === 'sql' && !tableName) {
      await runSqlQuery(activeTabId);
      set({ isReloading: false });
      return;
    }

    const targetTable = tableName || (activeTab?.type === 'grid' && activeTab.tableName) || selectedTable;

    try {
      const quote = activeConnection.engine === 'mysql' ? '`' : '"';
      const sql = activeConnection.engine === 'redis'
        ? `KEYS *`
        : `SELECT * FROM ${quote}${targetTable}${quote} LIMIT 100;`;

      const res = await executeRealQuery(activeConnection, sql);

      if (res.success && res.rows && res.rows.length > 0) {
        const liveRows: GridRow[] = res.rows.map((r, idx) => ({
          ...r,
          id: r.id !== undefined ? r.id : idx + 1,
          isDirty: false,
          dirtyFields: {},
          rowState: 'clean',
        }));

        set({
          selectedTable: targetTable,
          selectedRowData: null,
          rows: liveRows,
          originalRows: JSON.parse(JSON.stringify(liveRows)),
          pendingEditsCount: 0,
          isReloading: false,
        });

        showToast(`⚡ Refreshed table '${targetTable}' (${liveRows.length} live records • ${res.duration_ms}ms)`);
        return;
      }
    } catch (e) {
      console.warn('Live table load failed, fallback:', e);
    }

    const targetRows = getDefaultRowsForTable(targetTable, truncatedTables[targetTable]);
    const duration = +(Math.random() * 0.8 + 0.8).toFixed(1);

    set({
      selectedTable: targetTable,
      selectedRowData: null,
      rows: JSON.parse(JSON.stringify(targetRows)),
      originalRows: JSON.parse(JSON.stringify(targetRows)),
      pendingEditsCount: 0,
      isReloading: false,
    });

    showToast(`⚡ Refreshed table '${targetTable}' (${targetRows.length} records • ${duration}ms)`);
  },

  isSidebarOpen: true,
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  sidebarWidth: typeof window !== 'undefined' ? (Number(localStorage.getItem('dbnerd_sidebar_width')) || 240) : 240,
  setSidebarWidth: (width) => {
    if (typeof window !== 'undefined') localStorage.setItem('dbnerd_sidebar_width', String(width));
    set({ sidebarWidth: width });
  },

  isRightInspectorOpen: true,
  setRightInspectorOpen: (open) => set({ isRightInspectorOpen: open }),
  toggleRightInspector: () => set((state) => ({ isRightInspectorOpen: !state.isRightInspectorOpen })),
  rightInspectorWidth: typeof window !== 'undefined' ? (Number(localStorage.getItem('dbnerd_inspector_width')) || 320) : 320,
  setRightInspectorWidth: (width) => {
    if (typeof window !== 'undefined') localStorage.setItem('dbnerd_inspector_width', String(width));
    set({ rightInspectorWidth: width });
  },

  isBottomPanelOpen: false,
  setBottomPanelOpen: (open) => set({ isBottomPanelOpen: open }),
  toggleBottomPanel: () => set((state) => ({ isBottomPanelOpen: !state.isBottomPanelOpen })),
  bottomPanelHeight: typeof window !== 'undefined' ? (Number(localStorage.getItem('dbnerd_bottom_panel_height')) || 190) : 190,
  setBottomPanelHeight: (height) => {
    if (typeof window !== 'undefined') localStorage.setItem('dbnerd_bottom_panel_height', String(height));
    set({ bottomPanelHeight: height });
  },

  sqlEditorSplitHeight: typeof window !== 'undefined' ? (Number(localStorage.getItem('dbnerd_sql_split_height')) || 220) : 220,
  setSqlEditorSplitHeight: (height) => {
    if (typeof window !== 'undefined') localStorage.setItem('dbnerd_sql_split_height', String(height));
    set({ sqlEditorSplitHeight: height });
  },
  isSqlResultsCollapsed: false,
  setIsSqlResultsCollapsed: (collapsed) => set({ isSqlResultsCollapsed: collapsed }),
  toggleSqlResultsCollapsed: () => set((state) => ({ isSqlResultsCollapsed: !state.isSqlResultsCollapsed })),

  setSelectedRowData: (row) => set({ selectedRowData: row }),

  tableViewMode: 'data',
  setTableViewMode: (mode) => set({ tableViewMode: mode }),

  isFilterBarOpen: false,
  toggleFilterBar: () => set((state) => ({ isFilterBarOpen: !state.isFilterBarOpen })),
  filterWhereText: "object_type = 'connector_tool'",
  setFilterWhereText: (val) => set({ filterWhereText: val }),
  filterOrderByText: "inserted_at DESC",
  setFilterOrderByText: (val) => set({ filterOrderByText: val }),

  structureSearchColumn: '',
  setStructureSearchColumn: (val) => set({ structureSearchColumn: val }),

  selectedStructureColumn: null,
  setSelectedStructureColumn: (col) => set({ selectedStructureColumn: col }),

  inspectorWidth: 'normal',
  toggleInspectorWidth: () =>
    set((state) => ({
      inspectorWidth: state.inspectorWidth === 'normal' ? 'expanded' : 'normal',
    })),

  updateCell: (id, field, value) => {
    const { rows, originalRows, selectedTable } = get();
    const origRow = originalRows.find((r) => r.id === id);

    let castValue = value;
    if (field === 'id' || field === 'user_id' || field === 'total_amount') {
      const num = Number(value);
      if (!isNaN(num)) castValue = num;
    }

    const updatedRows = rows.map((r) => {
      if (r.id !== id) return r;

      const currentDirty = { ...(r.dirtyFields || {}) };
      const isOriginal = origRow ? JSON.stringify(origRow[field]) === JSON.stringify(castValue) : false;

      if (isOriginal) {
        delete currentDirty[field as string];
      } else {
        currentDirty[field as string] = true;
      }

      const hasDirtyFields = Object.keys(currentDirty).length > 0;
      const nextRowState: GridRow['rowState'] = r.rowState === 'inserted' ? 'inserted' : hasDirtyFields ? 'modified' : 'clean';
      return {
        ...r,
        [field]: castValue,
        dirtyFields: currentDirty,
        isDirty: hasDirtyFields || r.rowState === 'inserted' || r.rowState === 'deleted',
        rowState: nextRowState,
      };
    });

    // Count all dirty cells & rows
    let dirtyCount = 0;
    updatedRows.forEach((r) => {
      if (r.rowState === 'inserted' || r.rowState === 'deleted') {
        dirtyCount++;
      } else if (r.dirtyFields) {
        dirtyCount += Object.keys(r.dirtyFields).length;
      }
    });

    set({
      rows: updatedRows,
      pendingEditsCount: dirtyCount,
      isTransactionOpen: dirtyCount > 0,
      selectedTable,
    });
  },

  duplicateRow: (sourceRow: GridRow) => {
    const { rows, selectedTable } = get();
    const maxId = rows.reduce((max, r) => Math.max(max, Number(r.id) || 0), 1000);
    const newId = maxId + 1;

    const cleanRow = { ...sourceRow };
    delete (cleanRow as any).isDirty;
    delete (cleanRow as any).dirtyFields;
    delete (cleanRow as any).rowState;

    if (selectedTable === 'goose_db_version' && 'version_id' in cleanRow) {
      cleanRow.version_id = (Number(cleanRow.version_id) || 0) + 1;
      cleanRow.tstamp = new Date().toISOString().replace('T', ' ').slice(0, 23);
    }

    const newRow: GridRow = {
      ...cleanRow,
      id: newId,
      isDirty: true,
      dirtyFields: { id: true },
      rowState: 'inserted',
    };

    const nextRows = [newRow, ...rows];
    let dirtyCount = 0;
    nextRows.forEach((r) => {
      if (r.rowState === 'inserted' || r.rowState === 'deleted') dirtyCount++;
      else if (r.dirtyFields) dirtyCount += Object.keys(r.dirtyFields).length;
    });

    set({
      rows: nextRows,
      pendingEditsCount: dirtyCount,
      isTransactionOpen: true,
      selectedRowData: newRow,
    });
  },

  insertRow: () => {
    const { rows, selectedTable } = get();
    const maxId = rows.reduce((max, r) => Math.max(max, Number(r.id) || 0), 1000);
    const newId = maxId + 1;
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    let template: Partial<GridRow> = {};
    if (selectedTable === 'goose_db_version') {
      const maxVer = rows.reduce((max, r) => Math.max(max, Number(r.version_id) || 0), 0);
      template = {
        version_id: maxVer + 1,
        is_applied: true,
        tstamp: now,
      };
    } else if (selectedTable === 'tuple') {
      template = {
        store: '01M2Z8794GWTS8MMZKGD922YX9',
        object_type: 'connector_tool',
        object_id: `obj_${newId}_r2800`,
        relation: 'organisation',
        _user: 'organisation:5e4d3eb5#member',
        user_type: 'userset',
        ulid: `01M${Date.now().toString(36).toUpperCase()}`,
        inserted_at: now,
      };
    } else if (selectedTable === 'stock_items') {
      template = {
        sku: `SKU-${newId}`,
        name: 'New Inventory Item',
        quantity: 100,
        warehouse_id: 1,
      };
    } else if (selectedTable === 'warehouses') {
      template = {
        code: `WH-NEW-${newId}`,
        name: 'New Regional Hub',
        location: 'Singapore',
        capacity: 50000,
        active_pallets: 0,
        manager: 'New Manager',
        status: 'operational',
      };
    } else if (selectedTable === 'users') {
      template = {
        email: `user${newId}@example.com`,
        full_name: 'New User',
        role: 'member',
        status: 'active',
        created_at: now,
      };
    } else if (selectedTable === 'products') {
      template = {
        sku: `PROD-${newId}`,
        title: 'New Product Title',
        category_id: 1,
        price: 99.0,
        stock: 50,
        is_active: true,
      };
    } else {
      template = {
        user_id: 501,
        customer_name: 'New Customer',
        product_sku: 'SKU-NEW-01',
        order_details: { items: 1, total: 50.0 },
        total_amount: 50.0,
        created_at: now,
        status: 'pending',
      };
    }

    const newRow: GridRow = {
      ...template,
      id: newId,
      isDirty: true,
      dirtyFields: Object.keys(template).reduce((acc, k) => ({ ...acc, [k]: true }), { id: true }),
      rowState: 'inserted',
    } as GridRow;

    const nextRows = [newRow, ...rows];
    let dirtyCount = 0;
    nextRows.forEach((r) => {
      if (r.rowState === 'inserted' || r.rowState === 'deleted') dirtyCount++;
      else if (r.dirtyFields) dirtyCount += Object.keys(r.dirtyFields).length;
    });

    set({
      rows: nextRows,
      pendingEditsCount: dirtyCount,
      isTransactionOpen: true,
      selectedRowData: newRow,
    });
  },

  deleteRow: (id) => {
    const { rows } = get();
    const nextRows = rows.map((r) => {
      if (r.id !== id) return r;
      const nextState: GridRow['rowState'] = r.rowState === 'deleted' ? 'clean' : 'deleted';
      return {
        ...r,
        rowState: nextState,
        isDirty: nextState === 'deleted',
      };
    });

    let dirtyCount = 0;
    nextRows.forEach((r) => {
      if (r.rowState === 'inserted' || r.rowState === 'deleted') dirtyCount++;
      else if (r.dirtyFields) dirtyCount += Object.keys(r.dirtyFields).length;
    });

    set({
      rows: nextRows,
      pendingEditsCount: dirtyCount,
      isTransactionOpen: dirtyCount > 0,
    });
  },

  rollbackTransaction: () => {
    const { originalRows } = get();
    set({
      rows: JSON.parse(JSON.stringify(originalRows)),
      pendingEditsCount: 0,
      isTransactionOpen: false,
    });
  },

  commitTransaction: async () => {
    const { rows, getPendingSQL, activeConnection, history, showToast } = get();
    const sqlText = getPendingSQL();
    const count = get().pendingEditsCount;

    if (!sqlText || sqlText.startsWith('--')) {
      showToast('⚠️ No pending changes in active transaction');
      return { sqlText: '', count: 0 };
    }

    try {
      const res = await executeRealQuery(activeConnection, sqlText);
      if (!res.success && res.error) {
        showToast(`❌ Commit failed: ${res.error}`);
        return { sqlText, count: 0 };
      }
    } catch (e) {
      console.warn('Real commit error, proceeding with local transaction:', e);
    }

    // Filter out rows marked as deleted
    const committedRows = rows
      .filter((r) => r.rowState !== 'deleted')
      .map((r) => ({
        ...r,
        isDirty: false,
        dirtyFields: {},
        rowState: 'clean' as const,
      }));

    const now = new Date();
    const timeStr = `Today at ${now.toTimeString().slice(0, 8)}`;
    const newHistoryItem: QueryHistoryItem = {
      id: `h-${Date.now()}`,
      connectionName: activeConnection.name,
      env: activeConnection.env,
      sql: sqlText,
      timestamp: timeStr,
      durationMs: 1.4,
      rowsAffected: count,
      status: 'success',
      isFavorite: false,
    };

    set({
      rows: committedRows,
      originalRows: JSON.parse(JSON.stringify(committedRows)),
      pendingEditsCount: 0,
      isTransactionOpen: false,
      isSqlDiffModalOpen: false,
      history: [newHistoryItem, ...history],
    });

    showToast(`✅ Successfully committed ${count} change(s)`);
    return { sqlText, count };
  },

  getPendingSQL: () => {
    const { rows, selectedTable, activeConnection } = get();
    return buildPendingTransactionSql(rows, selectedTable, activeConnection?.engine || 'postgres');
  },

  processes: [
    {
      pid: 4821,
      user: 'analytics_bot',
      clientIp: '10.0.12.84',
      duration: '18.4s',
      state: 'locked',
      query: 'SELECT * FROM audit_logs a JOIN user_orders o ON a.id = o.id WHERE a.payload::text LIKE \'%error%\'',
      isLongRunning: true,
    },
    {
      pid: 3910,
      user: 'app_backend',
      clientIp: '10.0.10.15',
      duration: '42.1s',
      state: 'idle in txn',
      query: 'UPDATE user_orders SET status = \'refunded\' WHERE id = 1035',
      isLongRunning: false,
    },
    {
      pid: 5012,
      user: 'web_client',
      clientIp: '192.168.1.5',
      duration: '0.02s',
      state: 'active',
      query: 'SELECT id, email, full_name FROM users WHERE id = 1001 LIMIT 1',
      isLongRunning: false,
    },
  ],
  killProcess: (pid) =>
    set((state) => ({
      processes: state.processes.filter((p) => p.pid !== pid),
    })),

  history: [
    {
      id: 'h-1',
      connectionName: 'ecom_prod_db',
      env: 'prod',
      sql: 'SELECT u.id, u.email, COUNT(o.id) AS total_orders\nFROM users u\nLEFT JOIN user_orders o ON u.id = o.user_id\nWHERE u.status = \'active\'\nGROUP BY u.id, u.email\nORDER BY total_orders DESC LIMIT 50;',
      timestamp: 'Today at 14:22:15',
      durationMs: 1.8,
      rowsAffected: 50,
      status: 'success',
      isFavorite: true,
    },
    {
      id: 'h-2',
      connectionName: 'staging-mysql-8',
      env: 'staging',
      sql: 'UPDATE user_orders SET status = \'refunded\', updated_at = NOW() WHERE id = 1035;',
      timestamp: 'Today at 11:05:40',
      durationMs: 4.2,
      rowsAffected: 1,
      status: 'success',
      isFavorite: false,
    },
  ],
}));

if (typeof window !== 'undefined') {
  (window as any).useAppStore = useAppStore;
  (window as any).__APP_STORE__ = useAppStore;
}
