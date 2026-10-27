import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { executeRealQuery } from '../services/dbService';
import {
  Table as TableIcon,
  RefreshCw,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  ExternalLink,
  Code,
  Layers,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { BorderChase } from './BorderChase';
import {
  ContextMenuContainer,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuHeader,
  ContextMenuPosition,
} from './ContextMenu';
import { formatByteSize, parseSizeToBytes } from '../lib/memory/memoryGuard';

export interface TableStatRow {
  name: string;
  schema: string;
  kind: string;
  owner: string;
  estimated_row: number | string;
  total_size: string;
  data_size: string;
  index_size: string;
  comment: string;
  total_bytes?: number;
  data_bytes?: number;
  index_bytes?: number;
}

const FALLBACK_STATS: Record<string, TableStatRow[]> = {
  postgres: [
    { name: 'agents', schema: 'public', kind: 'TABLE', owner: 'postgres', estimated_row: 27, total_size: '73 KB', data_size: '8 KB', index_size: '65 KB', comment: '--' },
    { name: 'audit_logs', schema: 'public', kind: 'TABLE', owner: 'postgres', estimated_row: 637, total_size: '8 MB', data_size: '8 MB', index_size: '106 KB', comment: 'Audit ledger' },
    { name: 'auto_procurement_configs', schema: 'public', kind: 'TABLE', owner: 'postgres', estimated_row: 1344, total_size: '507 KB', data_size: '335 KB', index_size: '172 KB', comment: '--' },
    { name: 'bi_bank_transactions', schema: 'public', kind: 'TABLE', owner: 'postgres', estimated_row: -1, total_size: '32 KB', data_size: '16 KB', index_size: '16 KB', comment: '--' },
    { name: 'bi_customers', schema: 'public', kind: 'TABLE', owner: 'postgres', estimated_row: 38110, total_size: '66 MB', data_size: '39 MB', index_size: '26 MB', comment: 'Master customer index' },
    { name: 'bi_distributor_fee_config', schema: 'public', kind: 'TABLE', owner: 'postgres', estimated_row: 23681, total_size: '11 MB', data_size: '6 MB', index_size: '5 MB', comment: '--' },
    { name: 'bi_ims_master_data', schema: 'public', kind: 'TABLE', owner: 'postgres', estimated_row: 37, total_size: '251 MB', data_size: '131 KB', index_size: '251 MB', comment: '--' },
    { name: 'bi_incentive_group_config', schema: 'public', kind: 'TABLE', owner: 'postgres', estimated_row: 182, total_size: '589 KB', data_size: '573 KB', index_size: '16 KB', comment: '--' },
    { name: 'bi_incentive_group_user', schema: 'public', kind: 'TABLE', owner: 'postgres', estimated_row: 61380, total_size: '36 MB', data_size: '28 MB', index_size: '7 MB', comment: '--' },
    { name: 'bi_incentive_group_user_histories', schema: 'public', kind: 'TABLE', owner: 'postgres', estimated_row: 2536709, total_size: '616 MB', data_size: '313 MB', index_size: '303 MB', comment: '--' },
    { name: 'bi_incentive_program_config', schema: 'public', kind: 'TABLE', owner: 'postgres', estimated_row: 592, total_size: '1 MB', data_size: '1 MB', index_size: '122 KB', comment: '--' },
    { name: 'bi_incentive_program_config_into_skus', schema: 'public', kind: 'TABLE', owner: 'postgres', estimated_row: 174, total_size: '10 MB', data_size: '4 MB', index_size: '6 MB', comment: '--' },
    { name: 'bi_incentive_program_group', schema: 'public', kind: 'TABLE', owner: 'postgres', estimated_row: 852, total_size: '245 KB', data_size: '114 KB', index_size: '131 KB', comment: '--' },
    { name: 'bi_incentive_program_report', schema: 'public', kind: 'TABLE', owner: 'postgres', estimated_row: 4599217, total_size: '3.26 GB', data_size: '2.39 GB', index_size: '872 MB', comment: 'Monthly aggregate report' },
    { name: 'bi_invoice', schema: 'public', kind: 'TABLE', owner: 'postgres', estimated_row: 6173, total_size: '51 MB', data_size: '50 MB', index_size: '303 KB', comment: '--' },
    { name: 'bi_invoice_data', schema: 'public', kind: 'TABLE', owner: 'postgres', estimated_row: 49933, total_size: '17 MB', data_size: '10 MB', index_size: '6 MB', comment: '--' },
    { name: 'goose_db_version', schema: 'public', kind: 'TABLE', owner: 'dev_user', estimated_row: 4, total_size: '24 KB', data_size: '8 KB', index_size: '16 KB', comment: 'Schema migrations' },
    { name: 'stock_items', schema: 'public', kind: 'TABLE', owner: 'dev_user', estimated_row: 120, total_size: '40 KB', data_size: '8 KB', index_size: '32 KB', comment: 'Inventory SKUs' },
    { name: 'tuple', schema: 'public', kind: 'TABLE', owner: 'dev_user', estimated_row: 15, total_size: '24 KB', data_size: '8 KB', index_size: '16 KB', comment: 'Relationship tuples' },
    { name: 'user_orders', schema: 'public', kind: 'TABLE', owner: 'dev_user', estimated_row: 350, total_size: '32 KB', data_size: '8 KB', index_size: '16 KB', comment: 'Customer orders' },
    { name: 'users', schema: 'public', kind: 'TABLE', owner: 'dev_user', estimated_row: 125, total_size: '48 KB', data_size: '8 KB', index_size: '32 KB', comment: 'User profiles' },
    { name: 'warehouses', schema: 'public', kind: 'TABLE', owner: 'dev_user', estimated_row: 12, total_size: '48 KB', data_size: '8 KB', index_size: '32 KB', comment: 'Fulfillment centers' },
  ],
  mysql: [
    { name: 'app_users', schema: 'analytics_staging', kind: 'BASE TABLE', owner: 'dev_user', estimated_row: 3, total_size: '32 KB', data_size: '16 KB', index_size: '16 KB', comment: 'Analytics users' },
    { name: 'coupons', schema: 'analytics_staging', kind: 'BASE TABLE', owner: 'dev_user', estimated_row: 3, total_size: '32 KB', data_size: '16 KB', index_size: '16 KB', comment: 'Discount codes' },
    { name: 'invoices', schema: 'analytics_staging', kind: 'BASE TABLE', owner: 'dev_user', estimated_row: 3, total_size: '32 KB', data_size: '16 KB', index_size: '16 KB', comment: 'Billing entries' },
    { name: 'payment_transactions', schema: 'analytics_staging', kind: 'BASE TABLE', owner: 'dev_user', estimated_row: 3, total_size: '32 KB', data_size: '16 KB', index_size: '16 KB', comment: 'Payment audit log' },
    { name: 'settings', schema: 'analytics_staging', kind: 'BASE TABLE', owner: 'dev_user', estimated_row: 3, total_size: '16 KB', data_size: '16 KB', index_size: '0 KB', comment: 'Global settings' },
  ],
};

const formatNumber = (val: number | string): string => {
  if (typeof val === 'number') {
    if (val === -1) return '-1';
    return val.toLocaleString();
  }
  const n = parseInt(String(val), 10);
  return isNaN(n) ? String(val) : (n === -1 ? '-1' : n.toLocaleString());
};

export const AllTableStatsView: React.FC = () => {
  const {
    activeConnection,
    openTableGridTab,
    openTableSchemaTab,
    openNewQueryTab,
    setSelectedRowData,
    showToast,
    openTableActionModal,
    openSessionIds,
  } = useAppStore();

  const [stats, setStats] = useState<TableStatRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterText, setFilterText] = useState<string>('');
  const [selectedRowName, setSelectedRowName] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof TableStatRow>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Context Menu
  const [contextPos, setContextPos] = useState<ContextMenuPosition | null>(null);
  const [contextRow, setContextRow] = useState<TableStatRow | null>(null);

  const fetchStats = useCallback(async () => {
    const hasActiveSession = Boolean(activeConnection?.id && openSessionIds.includes(activeConnection.id));
    if (!hasActiveSession) {
      setStats([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const engine = activeConnection.engine;
    let loadedStats: TableStatRow[] = [];

    try {
      if (engine === 'postgres') {
        const query = `
          SELECT 
            c.relname AS name,
            n.nspname AS schema,
            CASE c.relkind 
              WHEN 'r' THEN 'TABLE' 
              WHEN 'v' THEN 'VIEW' 
              WHEN 'm' THEN 'MATERIALIZED VIEW' 
              WHEN 'p' THEN 'PARTITIONED'
              ELSE 'OTHER' 
            END AS kind,
            pg_catalog.pg_get_userbyid(c.relowner) AS owner,
            CASE
              WHEN c.reltuples > 0 THEN c.reltuples::bigint
              WHEN COALESCE(s.n_live_tup, 0) > 0 THEN s.n_live_tup
              ELSE 0
            END AS estimated_row,
            pg_total_relation_size(c.oid) AS total_bytes,
            pg_table_size(c.oid) AS data_bytes,
            pg_indexes_size(c.oid) AS index_bytes,
            COALESCE(d.description, '--') AS comment
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
          LEFT JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = 0
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p')
          ORDER BY c.relname ASC;
        `;
        const res = await executeRealQuery(activeConnection, query);
        if (res.success && res.rows && res.rows.length > 0) {
          loadedStats = res.rows.map((r: any) => {
            const totalBytes = Number(r.total_bytes ?? 0);
            const dataBytes = Number(r.data_bytes ?? 0);
            const indexBytes = Number(r.index_bytes ?? 0);
            return {
              name: String(r.name || ''),
              schema: String(r.schema || 'public'),
              kind: String(r.kind || 'TABLE'),
              owner: String(r.owner || 'postgres'),
              estimated_row: r.estimated_row !== undefined ? Number(r.estimated_row) : 0,
              total_size: formatByteSize(totalBytes),
              data_size: formatByteSize(dataBytes),
              index_size: formatByteSize(indexBytes),
              comment: String(r.comment || '--'),
              total_bytes: totalBytes,
              data_bytes: dataBytes,
              index_bytes: indexBytes,
            };
          });
        }
      } else if (engine === 'mysql') {
        const query = `
          SELECT 
            TABLE_NAME AS name,
            TABLE_SCHEMA AS \`schema\`,
            TABLE_TYPE AS kind,
            'dev_user' AS owner,
            COALESCE(TABLE_ROWS, 0) AS estimated_row,
            (COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0)) AS total_bytes,
            COALESCE(DATA_LENGTH, 0) AS data_bytes,
            COALESCE(INDEX_LENGTH, 0) AS index_bytes,
            COALESCE(TABLE_COMMENT, '--') AS comment
          FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
          ORDER BY TABLE_NAME ASC;
        `;
        const res = await executeRealQuery(activeConnection, query);
        if (res.success && res.rows && res.rows.length > 0) {
          loadedStats = res.rows.map((r: any) => {
            const totalBytes = Number(r.total_bytes ?? 0);
            const dataBytes = Number(r.data_bytes ?? 0);
            const indexBytes = Number(r.index_bytes ?? 0);
            return {
              name: String(r.name || ''),
              schema: String(r.schema || activeConnection.database || 'mysql'),
              kind: String(r.kind || 'BASE TABLE'),
              owner: String(r.owner || 'dev_user'),
              estimated_row: r.estimated_row !== undefined ? Number(r.estimated_row) : 0,
              total_size: formatByteSize(totalBytes),
              data_size: formatByteSize(dataBytes),
              index_size: formatByteSize(indexBytes),
              comment: String(r.comment || '--'),
              total_bytes: totalBytes,
              data_bytes: dataBytes,
              index_bytes: indexBytes,
            };
          });
        }
      }
    } catch (e) {
      console.warn('Live table stats query fallback:', e);
    }

    const isMock = Boolean(activeConnection?.id && (activeConnection.id === 'demo' || activeConnection.id.startsWith('mock')));
    if (isMock && (!loadedStats || loadedStats.length === 0)) {
      loadedStats = FALLBACK_STATS[engine] || FALLBACK_STATS.postgres;
    }

    setStats(loadedStats);
    if (loadedStats.length > 0 && !selectedRowName) {
      setSelectedRowName(loadedStats[0].name);
      setSelectedRowData(loadedStats[0]);
    }
    setLoading(false);
  }, [activeConnection, openSessionIds, selectedRowName, setSelectedRowData]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleSort = (field: keyof TableStatRow) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredStats = useMemo(() => {
    let result = stats.filter((row) =>
      row.name.toLowerCase().includes(filterText.toLowerCase()) ||
      row.schema.toLowerCase().includes(filterText.toLowerCase()) ||
      row.kind.toLowerCase().includes(filterText.toLowerCase()) ||
      row.comment.toLowerCase().includes(filterText.toLowerCase())
    );

    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'estimated_row') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else if (sortField === 'total_size') {
        valA = a.total_bytes ?? parseSizeToBytes(a.total_size);
        valB = b.total_bytes ?? parseSizeToBytes(b.total_size);
      } else if (sortField === 'data_size') {
        valA = a.data_bytes ?? parseSizeToBytes(a.data_size);
        valB = b.data_bytes ?? parseSizeToBytes(b.data_size);
      } else if (sortField === 'index_size') {
        valA = a.index_bytes ?? parseSizeToBytes(a.index_size);
        valB = b.index_bytes ?? parseSizeToBytes(b.index_size);
      } else {
        valA = String(valA || '').toLowerCase();
        valB = String(valB || '').toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [stats, filterText, sortField, sortOrder]);

  const handleRowDoubleClick = (tableName: string) => {
    openTableGridTab(tableName);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredStats.length === 0) return;
    const currentIndex = filteredStats.findIndex((r) => r.name === selectedRowName);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = Math.min(currentIndex + 1, filteredStats.length - 1);
      const nextRow = filteredStats[nextIndex];
      setSelectedRowName(nextRow.name);
      setSelectedRowData(nextRow);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = Math.max(currentIndex - 1, 0);
      const prevRow = filteredStats[prevIndex];
      setSelectedRowName(prevRow.name);
      setSelectedRowData(prevRow);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedRowName) {
        openTableGridTab(selectedRowName);
      }
    }
  };

  const schemaLabel = activeConnection.engine === 'postgres' ? 'public' : activeConnection.database || 'public';

  return (
    <div
      className="flex-1 flex flex-col bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 select-none overflow-hidden font-sans outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Top Filter and Actions Bar */}
      <div className="h-9 px-3 bg-slate-50/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800/90 flex items-center justify-between flex-shrink-0 text-xs">
        <div className="flex items-center space-x-2.5">
          <div className="relative w-64">
            <input
              type="text"
              placeholder={`Filter ${filteredStats.length} tables in ${schemaLabel}...`}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full bg-white dark:bg-slate-950/80 border border-slate-300 dark:border-slate-800 rounded px-2.5 py-1 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 pl-7 transition-colors font-sans shadow-2xs"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2 top-2" />
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center space-x-1.5">
            <span className="font-semibold text-sky-600 dark:text-sky-400">{filteredStats.length}</span>
            <span>tables</span>
            <span>•</span>
            <span className="text-slate-500 dark:text-slate-400 font-medium">Schema: <span className="text-slate-800 dark:text-slate-200 font-semibold">{schemaLabel}</span></span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => fetchStats()}
            disabled={loading}
            className="relative overflow-hidden h-6 px-2.5 rounded bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white flex items-center space-x-1.5 text-xs transition active:scale-95 border border-slate-300/80 dark:border-slate-700/60 shadow-2xs"
            title="Refresh Table Statistics"
          >
            {loading && (
              <BorderChase color="sky" dual={true} speed="fast" borderWidth={1.5} glow={true} />
            )}
            <RefreshCw className={`relative z-1 w-3 h-3 ${loading ? 'animate-pulse text-sky-500 dark:text-sky-400' : ''}`} />
            <span className="relative z-1">{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Statistics Data Grid */}
      <div className="flex-1 overflow-auto bg-white dark:bg-slate-950">
        <table className="w-full border-collapse text-left font-mono text-xs">
          {/* Header Row */}
          <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 backdrop-blur shadow-2xs">
            <tr className="text-slate-600 dark:text-slate-400 font-semibold text-[11px] tracking-wide select-none">
              <th
                onClick={() => handleSort('name')}
                className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors w-[260px]"
              >
                <div className="flex items-center justify-between">
                  <span>name</span>
                  {sortField === 'name' ? (
                    sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-sky-400" /> : <ArrowDown className="w-3 h-3 text-sky-400" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-50" />
                  )}
                </div>
              </th>

              <th
                onClick={() => handleSort('schema')}
                className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors w-[100px]"
              >
                <div className="flex items-center justify-between">
                  <span>schema</span>
                  {sortField === 'schema' && (
                    sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-sky-600 dark:text-sky-400" /> : <ArrowDown className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                  )}
                </div>
              </th>

              <th
                onClick={() => handleSort('kind')}
                className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors w-[110px]"
              >
                <div className="flex items-center justify-between">
                  <span>kind</span>
                  {sortField === 'kind' && (
                    sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-sky-600 dark:text-sky-400" /> : <ArrowDown className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                  )}
                </div>
              </th>

              <th
                onClick={() => handleSort('owner')}
                className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors w-[110px]"
              >
                <div className="flex items-center justify-between">
                  <span>owner</span>
                  {sortField === 'owner' && (
                    sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-sky-600 dark:text-sky-400" /> : <ArrowDown className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                  )}
                </div>
              </th>

              <th
                onClick={() => handleSort('estimated_row')}
                className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors text-right w-[120px]"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>estimated_row</span>
                  {sortField === 'estimated_row' && (
                    sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-sky-600 dark:text-sky-400" /> : <ArrowDown className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                  )}
                </div>
              </th>

              <th
                onClick={() => handleSort('total_size')}
                className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors text-right w-[110px]"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>total_size</span>
                  {sortField === 'total_size' && (
                    sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-sky-600 dark:text-sky-400" /> : <ArrowDown className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                  )}
                </div>
              </th>

              <th
                onClick={() => handleSort('data_size')}
                className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors text-right w-[110px]"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>data_size</span>
                  {sortField === 'data_size' && (
                    sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-sky-600 dark:text-sky-400" /> : <ArrowDown className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                  )}
                </div>
              </th>

              <th
                onClick={() => handleSort('index_size')}
                className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors text-right w-[110px]"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>index_size</span>
                  {sortField === 'index_size' && (
                    sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-sky-600 dark:text-sky-400" /> : <ArrowDown className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                  )}
                </div>
              </th>

              <th
                onClick={() => handleSort('comment')}
                className="py-1.5 px-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span>comment</span>
                  {sortField === 'comment' && (
                    sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-sky-600 dark:text-sky-400" /> : <ArrowDown className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                  )}
                </div>
              </th>
            </tr>
          </thead>

          {/* Grid Rows */}
          <tbody className="divide-y divide-slate-200 dark:divide-slate-900/80">
            {filteredStats.map((row, idx) => {
              const isSelected = selectedRowName === row.name;

              return (
                <tr
                  key={row.name}
                  onClick={() => {
                    setSelectedRowName(row.name);
                    setSelectedRowData(row);
                  }}
                  onDoubleClick={() => handleRowDoubleClick(row.name)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedRowName(row.name);
                    setContextPos({ x: e.clientX, y: e.clientY });
                    setContextRow(row);
                  }}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-sky-100/90 dark:bg-sky-600/30 text-sky-950 dark:text-white font-semibold'
                      : idx % 2 === 0
                      ? 'bg-white dark:bg-slate-950/90 text-slate-800 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-900/60'
                      : 'bg-slate-50/70 dark:bg-slate-900/30 text-slate-800 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-900/60'
                  }`}
                >
                  {/* Name with table icon */}
                  <td className="py-1 px-3 border-r border-slate-200 dark:border-slate-900/80 flex items-center space-x-2 truncate">
                    <div className="w-4 h-4 rounded bg-sky-500/10 border border-sky-400/20 flex items-center justify-center flex-shrink-0">
                      <TableIcon className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                    </div>
                    <span className="truncate text-slate-900 dark:text-slate-100 font-medium">{row.name}</span>
                  </td>

                  {/* Schema */}
                  <td className="py-1 px-3 border-r border-slate-200 dark:border-slate-900/80 text-slate-600 dark:text-slate-400 truncate">
                    {row.schema}
                  </td>

                  {/* Kind */}
                  <td className="py-1 px-3 border-r border-slate-200 dark:border-slate-900/80 text-slate-600 dark:text-slate-400 truncate">
                    {row.kind}
                  </td>

                  {/* Owner */}
                  <td className="py-1 px-3 border-r border-slate-200 dark:border-slate-900/80 text-slate-600 dark:text-slate-400 truncate">
                    {row.owner}
                  </td>

                  {/* Estimated Row (Right-Aligned) */}
                  <td className="py-1 px-3 border-r border-slate-200 dark:border-slate-900/80 text-right font-mono text-slate-800 dark:text-slate-200">
                    {formatNumber(row.estimated_row)}
                  </td>

                  {/* Total Size (Right-Aligned) */}
                  <td className="py-1 px-3 border-r border-slate-200 dark:border-slate-900/80 text-right font-mono text-slate-700 dark:text-slate-300 font-medium">
                    {row.total_size}
                  </td>

                  {/* Data Size (Right-Aligned) */}
                  <td className="py-1 px-3 border-r border-slate-200 dark:border-slate-900/80 text-right font-mono text-slate-600 dark:text-slate-400">
                    {row.data_size}
                  </td>

                  {/* Index Size (Right-Aligned) */}
                  <td className="py-1 px-3 border-r border-slate-200 dark:border-slate-900/80 text-right font-mono text-slate-600 dark:text-slate-400">
                    {row.index_size}
                  </td>

                  {/* Comment */}
                  <td className="py-1 px-3 text-slate-500 truncate">
                    {row.comment}
                  </td>
                </tr>
              );
            })}

            {filteredStats.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400 dark:text-slate-500 font-sans">
                  No tables matching "{filterText}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Status Bar */}
      <div className="h-6 px-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono select-none flex-shrink-0">
        <div className="flex items-center space-x-3">
          <span>
            Total Tables: <strong className="text-slate-800 dark:text-slate-200 font-bold">{filteredStats.length}</strong>
          </span>
          <span>•</span>
          <span>
            Selected: <strong className="text-sky-600 dark:text-sky-400 font-bold">{selectedRowName || '--'}</strong>
          </span>
        </div>

        <div className="flex items-center space-x-3 text-slate-400 dark:text-slate-500">
          <span>Double-click row to open table data</span>
          <span>•</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">Connected</span>
        </div>
      </div>

      {/* Context Menu for Table Row */}
      {contextPos && contextRow && (
        <ContextMenuContainer
          position={contextPos}
          onClose={() => {
            setContextPos(null);
            setContextRow(null);
          }}
          width={220}
        >
          <ContextMenuHeader title={`Table: ${contextRow.name}`} />

          <ContextMenuItem
            icon={<ExternalLink className="w-3.5 h-3.5 text-sky-400" />}
            label="Open Table"
            shortcut="↵"
            onClick={() => {
              openTableGridTab(contextRow.name);
            }}
          />

          <ContextMenuItem
            icon={<Layers className="w-3.5 h-3.5 text-indigo-400" />}
            label="View Structure"
            onClick={() => {
              openTableSchemaTab(contextRow.name);
            }}
          />

          <ContextMenuItem
            icon={<Code className="w-3.5 h-3.5 text-amber-400" />}
            label="Query Table (SELECT * )"
            onClick={() => {
              openNewQueryTab(`SELECT * FROM ${contextRow.name} LIMIT 50;`);
            }}
          />

          <ContextMenuDivider />

          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy Table Name"
            onClick={() => {
              navigator.clipboard.writeText(contextRow.name);
              showToast(`Copied table name "${contextRow.name}"`);
            }}
          />

          <ContextMenuItem
            icon={<RefreshCw className="w-3.5 h-3.5 text-emerald-400" />}
            label="Refresh Stats"
            onClick={() => {
              fetchStats();
            }}
          />

          <ContextMenuDivider />

          <ContextMenuItem
            icon={<Sparkles className="w-3.5 h-3.5 text-rose-400" />}
            label="Truncate Table..."
            danger
            onClick={() => {
              openTableActionModal('truncate', contextRow.name);
            }}
          />

          <ContextMenuItem
            icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
            label="Drop Table..."
            danger
            onClick={() => {
              openTableActionModal('delete', contextRow.name);
            }}
          />
        </ContextMenuContainer>
      )}
    </div>
  );
};
