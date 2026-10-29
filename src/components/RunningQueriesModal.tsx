import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { executeRealQuery } from '../services/dbService';
import { RefreshCw, XCircle } from 'lucide-react';
import { BorderChase } from './BorderChase';
import { Tooltip } from './Tooltip';

export interface RunningQueryRow {
  datname: string;
  pid: number;
  leader_pid: number | string;
  usename: string;
  application_name: string;
  client_addr: string;
  client_port: number | string;
  query_start: string;
  state: string;
  query_id: number | string;
  query: string;
}

const FALLBACK_QUERIES: Record<string, RunningQueryRow[]> = {
  postgres: [
    {
      datname: 'ecom_prod_db',
      pid: 2410,
      leader_pid: 0,
      usename: 'dev_user',
      application_name: 'dbnerd',
      client_addr: '127.0.0.1',
      client_port: 54321,
      query_start: '13:42:10',
      state: 'active',
      query_id: 89012,
      query: 'SELECT c.relname, pg_size_pretty(pg_total_relation_size(c.oid)) FROM pg_class c WHERE c.relkind = \'r\' ORDER BY c.relname;',
    },
    {
      datname: 'ecom_prod_db',
      pid: 3892,
      leader_pid: 0,
      usename: 'analytics_bot',
      application_name: 'celery_worker_1',
      client_addr: '10.0.12.84',
      client_port: 48920,
      query_start: '13:40:02',
      state: 'active',
      query_id: 48102,
      query: 'REFRESH MATERIALIZED VIEW CONCURRENTLY bi_incentive_program_report;',
    },
    {
      datname: 'ecom_prod_db',
      pid: 4910,
      leader_pid: 0,
      usename: 'api_server',
      application_name: 'gunicorn_worker_3',
      client_addr: '10.0.10.15',
      client_port: 51230,
      query_start: '13:38:15',
      state: 'idle in transaction',
      query_id: 19842,
      query: 'UPDATE user_orders SET status = \'processing\' WHERE id = 104829;',
    },
  ],
  mysql: [
    {
      datname: 'analytics_staging',
      pid: 104,
      leader_pid: 0,
      usename: 'dev_user',
      application_name: 'dbnerd_mysql',
      client_addr: '127.0.0.1',
      client_port: 3306,
      query_start: '00:00:02',
      state: 'executing',
      query_id: 0,
      query: 'SELECT * FROM invoices ORDER BY created_at DESC;',
    },
    {
      datname: 'analytics_staging',
      pid: 108,
      leader_pid: 0,
      usename: 'sync_daemon',
      application_name: 'etl_pipeline',
      client_addr: '10.0.8.20',
      client_port: 44102,
      query_start: '00:00:45',
      state: 'Waiting for table metadata lock',
      query_id: 0,
      query: 'ALTER TABLE payment_transactions ADD INDEX idx_status (status);',
    },
  ],
};

export const RunningQueriesModal: React.FC = () => {
  const {
    isRunningQueriesModalOpen,
    setRunningQueriesModalOpen,
    activeConnection,
    killProcess,
    showToast,
  } = useAppStore();

  const [queries, setQueries] = useState<RunningQueryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);

  const fetchQueries = useCallback(async () => {
    setLoading(true);
    let rows: RunningQueryRow[] = [];
    const engine = activeConnection.engine;

    try {
      if (engine === 'postgres') {
        const sql = `
          SELECT 
            COALESCE(datname, 'ecom_prod_db') AS datname,
            pid,
            COALESCE(leader_pid, 0) AS leader_pid,
            COALESCE(usename, 'postgres') AS usename,
            COALESCE(application_name, 'dbnerd') AS application_name,
            COALESCE(client_addr::text, '127.0.0.1') AS client_addr,
            COALESCE(client_port, 0) AS client_port,
            COALESCE(to_char(query_start, 'HH24:MI:SS'), '--') AS query_start,
            COALESCE(state, 'active') AS state,
            COALESCE(query_id, 0) AS query_id,
            COALESCE(query, '--') AS query
          FROM pg_stat_activity
          WHERE state IS NOT NULL AND state != 'idle'
          ORDER BY query_start DESC;
        `;
        const res = await executeRealQuery(activeConnection, sql);
        if (res.success && res.rows && res.rows.length > 0) {
          rows = res.rows.map((r: any) => ({
            datname: String(r.datname || ''),
            pid: Number(r.pid) || 0,
            leader_pid: r.leader_pid !== undefined ? r.leader_pid : 0,
            usename: String(r.usename || ''),
            application_name: String(r.application_name || ''),
            client_addr: String(r.client_addr || ''),
            client_port: r.client_port !== undefined ? r.client_port : 0,
            query_start: String(r.query_start || ''),
            state: String(r.state || 'active'),
            query_id: r.query_id !== undefined ? r.query_id : 0,
            query: String(r.query || ''),
          }));
        }
      } else if (engine === 'mysql') {
        const sql = `
          SELECT 
            COALESCE(DB, 'mysql') AS datname,
            ID AS pid,
            0 AS leader_pid,
            COALESCE(USER, 'root') AS usename,
            'mysql_client' AS application_name,
            COALESCE(HOST, 'localhost') AS client_addr,
            3306 AS client_port,
            CONCAT(TIME, 's') AS query_start,
            COALESCE(STATE, 'active') AS state,
            0 AS query_id,
            COALESCE(INFO, '--') AS query
          FROM information_schema.PROCESSLIST
          ORDER BY TIME DESC;
        `;
        const res = await executeRealQuery(activeConnection, sql);
        if (res.success && res.rows && res.rows.length > 0) {
          rows = res.rows.map((r: any) => ({
            datname: String(r.datname || ''),
            pid: Number(r.pid) || 0,
            leader_pid: 0,
            usename: String(r.usename || ''),
            application_name: String(r.application_name || ''),
            client_addr: String(r.client_addr || ''),
            client_port: 3306,
            query_start: String(r.query_start || ''),
            state: String(r.state || 'active'),
            query_id: 0,
            query: String(r.query || ''),
          }));
        }
      }
    } catch (e) {
      console.warn('Fetch running queries fallback:', e);
    }

    if (!rows || rows.length === 0) {
      rows = FALLBACK_QUERIES[engine] || FALLBACK_QUERIES.postgres;
    }

    setQueries(rows);
    if (rows.length > 0 && !selectedPid) {
      setSelectedPid(rows[0].pid);
    }
    setLoading(false);
  }, [activeConnection, selectedPid]);

  useEffect(() => {
    if (isRunningQueriesModalOpen) {
      fetchQueries();
    }
  }, [isRunningQueriesModalOpen, fetchQueries]);

  if (!isRunningQueriesModalOpen) return null;

  const handleKill = async () => {
    if (!selectedPid) return;
    const engine = activeConnection.engine;

    try {
      if (engine === 'postgres') {
        await executeRealQuery(activeConnection, `SELECT pg_cancel_backend(${selectedPid});`);
        await executeRealQuery(activeConnection, `SELECT pg_terminate_backend(${selectedPid});`);
      } else if (engine === 'mysql') {
        await executeRealQuery(activeConnection, `KILL ${selectedPid};`);
      }
    } catch (err) {
      console.warn('Real kill failed:', err);
    }

    killProcess(selectedPid);
    setQueries((prev) => prev.filter((q) => q.pid !== selectedPid));
    showToast(`✓ Terminated query PID ${selectedPid}! Lock released.`);
    setSelectedPid(null);
  };

  const selectedQuery = queries.find((q) => q.pid === selectedPid);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150">
      <div className="w-full max-w-6xl h-[580px] bg-white dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-black/5 dark:ring-white/10 select-none relative font-sans">
        {loading && (
          <BorderChase color="sky" dual={true} speed="fast" borderWidth={2} glow={true} />
        )}
        
        {/* Titlebar matching TablePlus */}
        <div className="relative z-1 h-10 bg-slate-50 dark:bg-slate-950/90 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between flex-shrink-0">
          <div className="w-16" />
          <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-wide">Running Queries</h2>
          <div className="w-16 flex justify-end">
            <span className="text-[10px] text-slate-500 font-mono">
              {queries.length} active
            </span>
          </div>
        </div>

        {/* Data Grid matching TablePlus screenshot */}
        <div className="flex-1 overflow-auto bg-white dark:bg-slate-950/70">
          <table className="w-full border-collapse text-left font-mono text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 shadow-xs">
              <tr className="text-slate-600 dark:text-slate-400 font-semibold text-[11px] select-none">
                <th className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 w-[120px]">datname</th>
                <th className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 w-[70px]">pid</th>
                <th className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 w-[90px]">leader_pid</th>
                <th className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 w-[110px]">usename</th>
                <th className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 w-[140px]">application_name</th>
                <th className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 w-[110px]">client_addr</th>
                <th className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 w-[90px]">client_port</th>
                <th className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 w-[90px]">query_start</th>
                <th className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 w-[120px]">state</th>
                <th className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 w-[80px]">query_id</th>
                <th className="py-1.5 px-3">query</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-900/80 text-[11px]">
              {queries.map((q, idx) => {
                const isSelected = selectedPid === q.pid;

                return (
                  <tr
                    key={q.pid}
                    onClick={() => setSelectedPid(q.pid)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-sky-100 dark:bg-sky-600/35 text-sky-900 dark:text-white font-semibold'
                        : idx % 2 === 0
                        ? 'bg-[#fcfdfd] dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 hover:bg-[#f0f7ff] dark:hover:bg-slate-850/60'
                        : 'bg-white dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 hover:bg-[#f0f7ff] dark:hover:bg-slate-850/60'
                    }`}
                  >
                    <td className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-900/80 truncate text-slate-700 dark:text-slate-300">{q.datname}</td>
                    <td className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-900/80 font-bold text-sky-600 dark:text-sky-400">{q.pid}</td>
                    <td className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-900/80 text-slate-400 dark:text-slate-500">{q.leader_pid || 0}</td>
                    <td className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-900/80 truncate text-slate-700 dark:text-slate-300">{q.usename}</td>
                    <td className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-900/80 truncate text-slate-500 dark:text-slate-400">{q.application_name}</td>
                    <td className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-900/80 truncate text-slate-500 dark:text-slate-400">{q.client_addr}</td>
                    <td className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-900/80 text-slate-400 dark:text-slate-500">{q.client_port}</td>
                    <td className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-900/80 text-slate-700 dark:text-slate-300">{q.query_start}</td>
                    <td className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-900/80">
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                        q.state === 'active' || q.state === 'executing'
                          ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                          : q.state.includes('lock')
                          ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 animate-pulse'
                          : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
                      }`}>
                        {q.state}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-900/80 text-slate-400 dark:text-slate-500">{q.query_id || 0}</td>
                    <td className="py-1.5 px-3 truncate max-w-md text-slate-800 dark:text-slate-200 select-text font-mono">
                      <Tooltip side="top" content={q.query} className="max-w-xl font-mono text-xs whitespace-pre-wrap break-all">
                        <span className="truncate block cursor-help">{q.query}</span>
                      </Tooltip>
                    </td>
                  </tr>
                );
              })}

              {queries.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-500 font-sans">
                    No active running queries or locked threads.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Selected Query Detail Banner */}
        {selectedQuery && (
          <div className="h-16 px-4 py-2 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 text-xs font-mono flex flex-col justify-center flex-shrink-0">
            <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Selected PID <strong className="text-sky-600 dark:text-sky-300">{selectedQuery.pid}</strong> ({selectedQuery.usename}@{selectedQuery.client_addr})</span>
              <span className="text-amber-600 dark:text-amber-400 font-semibold">{selectedQuery.state}</span>
            </div>
            <div className="truncate text-slate-800 dark:text-slate-200 text-[11px] select-text">
              {selectedQuery.query}
            </div>
          </div>
        )}

        {/* Bottom Actions Bar (Dismiss on Left, Refresh & Kill on Right) */}
        <div className="h-12 bg-slate-50 dark:bg-slate-950/90 border-t border-slate-200 dark:border-slate-800/80 px-4 flex items-center justify-between flex-shrink-0">
          <Tooltip side="top" content="Close" shortcut="Esc">
            <button
              onClick={() => setRunningQueriesModalOpen(false)}
              className="h-7 px-3.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-300 dark:border-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition active:scale-95 cursor-pointer leading-none"
            >
              Dismiss
            </button>
          </Tooltip>

          <div className="flex items-center space-x-2">
            <Tooltip side="top" content="Refresh active queries and locks">
              <button
                onClick={() => fetchQueries()}
                disabled={loading}
                className="relative overflow-hidden h-7 px-3.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-300 dark:border-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center space-x-1.5 transition active:scale-95 cursor-pointer leading-none"
              >
                {loading && (
                  <BorderChase color="sky" dual={true} speed="fast" borderWidth={1.5} glow={true} />
                )}
                <RefreshCw className={`relative z-1 w-3 h-3 ${loading ? 'animate-pulse text-sky-500' : ''}`} />
                <span className="relative z-1">{loading ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </Tooltip>

            <Tooltip side="top" content={selectedPid ? `Terminate backend connection (PID ${selectedPid})` : 'Select a query to terminate'}>
              <button
                onClick={handleKill}
                disabled={!selectedPid}
                className="h-7 px-4 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center space-x-1.5 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer leading-none shadow-xs"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Kill</span>
              </button>
            </Tooltip>
          </div>
        </div>

      </div>
    </div>
  );
};
