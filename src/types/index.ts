export type DatabaseEngine =
  | 'postgres'
  | 'mysql'
  | 'redis'
  | 'snowflake'
  | 'sqlite'
  | 'clickhouse'
  | 'mongodb'
  | 'duckdb'
  | 'sqlserver'
  | 'redshift'
  | 'mariadb'
  | 'cassandra'
  | 'bigquery'
  | 'dynamodb'
  | 'elasticsearch'
  | 'libsql'
  | 'cloudflare_d1'
  | 'oracle'
  | 'cockroach'
  | 'greenplum'
  | 'vertica'
  | (string & {});
export type EnvironmentTag = 'prod' | 'staging' | 'local';
export type SafetyMode = 'silent' | 'alert-1' | 'alert-2' | 'safe-1' | 'safe-2';

export interface SafetyConfirmationRequest {
  id: string;
  mode: 'alert' | 'safe';
  safeModeLevel: SafetyMode;
  title: string;
  description?: string;
  sqlText: string;
  connectionName: string;
  environment: EnvironmentTag;
  actionLabel?: string;
  isCommit?: boolean;
  resolve: (approved: boolean) => void;
}
export type ThemeMode = 'dark' | 'light' | 'auto';
export type AppThemeId =
  | 'default-dark'
  | 'default-light'
  | 'monokai-pro'
  | 'dracula'
  | 'one-dark'
  | 'material-ocean'
  | 'nord'
  | 'catppuccin-mocha'
  | 'tokyo-night'
  | 'github-dark'
  | 'solarized-dark';
export type RowDensity = 'compact' | 'normal' | 'relaxed';
export type ToastPosition = 'bottom-right' | 'top-right';
export type HistoryTtl = '1-day' | '7-days' | '30-days' | '90-days' | 'never';

export interface UserSettings {
  themeMode: ThemeMode;
  appTheme: AppThemeId;
  editorFontSize: number;
  rowDensity: RowDensity;
  autoFormatSql: boolean;
  confirmDestructive: boolean;
  defaultQueryLimit: number;
  toastPosition?: ToastPosition;
  historyTtl?: HistoryTtl;
}

export interface ConnectionGroup {
  id: string;
  name: string;
  color: string;
  tag: string;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  groupId: string;
  engine: DatabaseEngine;
  env: EnvironmentTag;
  host: string;
  port: number;
  database: string;
  databases?: string[];
  username: string;
  password?: string;
  useSsh?: boolean;
  sshHost?: string;
  sshUser?: string;
  sshPort?: number;
  sshPassword?: string;
  useSshKey?: boolean;
  sshKeyPath?: string;
  sshPassphrase?: string;
  accountIdentifier?: string;
  warehouse?: string;
  snowflakeAccount?: string;
  snowflakeWarehouse?: string;
  snowflakeSchema?: string;
  snowflakeRole?: string;
  snowflakeAuthMethod?: 'externalbrowser' | 'password' | 'keypair';
  snowflakePrivateKey?: string;
  snowflakePassphrase?: string;
  active: boolean;
  latencyMs: number;
  connectionStatus?: 'connected' | 'connecting' | 'failed';
  lastError?: string;
  safeMode?: SafetyMode;
  isHeartbeat?: boolean;
}

export interface HeartbeatMetrics {
  lastLatencyMs: number;
  isHealthy: boolean;
  lastCheckedAt: number | null;
  consecutiveFailures: number;
  lastError?: string;
}

export interface FunctionItem {
  name: string;
  schema: string;
  kind: string;
  owner: string;
  estimated_row?: string | number;
  total_size?: string;
  data_size?: string;
  index_size?: string;
  comment?: string;
  definition?: string;
}

export interface TabItem {
  id: string;
  type: 'grid' | 'schema' | 'sql' | 'stats' | 'connection' | 'default';
  title: string;
  tableName?: string;
  schema?: string;
  database?: string;
  queryId?: number;
  sqlContent?: string;
  canClose?: boolean;
}

export interface SqlQueryResultItem {
  id: string; // e.g. "q-1"
  title: string; // e.g. "Query 1", "Query 2"
  query: string;
  results: any[];
  columns: string[];
  durationMs: number;
  rowsCount: number;
  executedAt: string;
  error?: string;
  status: 'pending' | 'running' | 'success' | 'error';
  isPinned?: boolean;
  statusMessage?: string; // e.g. "Query 4 OK: COMMIT" or "Query 1: 3 rows"
}

export interface PendingQueryEdit {
  rowId: any;
  rowIndex: number;
  field: string;
  originalValue: any;
  newValue: any;
  table: string;
  pkColumn: string;
  pkValue: any;
  generatedSql: string;
}

export interface SqlTabState {
  tabId: string;
  query: string;
  lastExecutedQuery?: string;
  results: any[];
  columns: string[];
  durationMs: number;
  rowsCount: number;
  executedAt?: string;
  isExecuting?: boolean;
  error?: string;
  queryResults?: SqlQueryResultItem[];
  activeResultId?: string;
  activeSchema?: string;
  executionProgress?: {
    current: number;
    total: number;
  };
}

export interface GridRow {
  id: number;
  user_id?: number;
  customer_name?: string;
  product_sku?: string;
  order_details?: Record<string, any>;
  total_amount?: number;
  created_at?: string;
  status?: string;
  [key: string]: any;
  isDirty?: boolean;
  dirtyFields?: Record<string, boolean>;
  rowState?: 'clean' | 'modified' | 'inserted' | 'deleted';
}

export interface PendingChange {
  rowId: number;
  tableName: string;
  field: string;
  oldValue: any;
  newValue: any;
  type: 'update' | 'insert' | 'delete';
}

export interface ProcessItem {
  pid: number;
  user: string;
  clientIp: string;
  duration: string;
  state: 'active' | 'idle in txn' | 'locked';
  query: string;
  isLongRunning?: boolean;
}

export interface QueryHistoryItem {
  id: string;
  connectionId?: string;
  connectionName: string;
  database?: string;
  env: EnvironmentTag;
  sql: string;
  timestamp: string;
  timestampMs?: number;
  durationMs: number;
  rowsAffected: number;
  status: 'success' | 'error';
  errorMessage?: string;
  isFavorite: boolean;
}

export interface ColumnDefinition {
  name: string;
  type: string;
  isNullable: boolean;
  defaultValue?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  foreignTable?: string;
  foreignColumn?: string;
  comment?: string;
}

export interface TableIndexDefinition {
  name: string;
  columns: string[];
  type: 'BTREE' | 'GIN' | 'HASH' | 'GIST';
  isUnique: boolean;
  isPrimary?: boolean;
  size?: string;
}

export interface TableForeignKeyDefinition {
  name: string;
  column: string;
  foreignTable: string;
  foreignColumn: string;
  onUpdate: string;
  onDelete: string;
}

export interface RealTableSummary {
  name: string;
  count: string;
  schema?: string;
  database?: string;
  kind?: string;
  owner?: string;
  estimated_rows?: number;
  total_size?: string;
  data_size?: string;
  index_size?: string;
  total_bytes?: number;
  data_bytes?: number;
  index_bytes?: number;
  comment?: string;
}

export interface TableSchemaInfo {
  tableName: string;
  schema: string;
  engine: string;
  rowCount: string;
  totalSize: string;
  columns: ColumnDefinition[];
  indexes: TableIndexDefinition[];
  foreignKeys: TableForeignKeyDefinition[];
  ddl: string;
}

export interface ConnectionSession {
  connectionId: string;
  tabs: TabItem[];
  activeTabId: string;
  sqlTabStates: Record<string, SqlTabState>;
  selectedTable: string;
  tableViewMode: 'data' | 'structure' | 'index';
  isFilterBarOpen: boolean;
  filterWhereText: string;
  filterOrderByText: string;
  rows: GridRow[];
  originalRows: GridRow[];
  isTransactionOpen: boolean;
  pendingEditsCount: number;
  history: QueryHistoryItem[];
  selectedRowData: any | null;
  selectedStructureColumn: any | null;
  structureSearchColumn: string;
}

export interface PendingTableAction {
  id: string;
  type: 'truncate' | 'delete';
  tableName: string;
  sql: string;
  options?: any;
}

