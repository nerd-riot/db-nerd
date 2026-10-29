import React, { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { Activity, Database, Zap, Cpu, Server } from 'lucide-react';
import { HeartbeatDot } from './HeartbeatDot';
import { BorderChase } from './BorderChase';
import { Tooltip } from './Tooltip';

export const Observability: React.FC = () => {
  const { processes, killProcess, showToast, heartbeatMetrics, activeConnection } = useAppStore();
  const [confirmPid, setConfirmPid] = useState<number | null>(null);

  const handleKill = (pid: number) => {
    if (confirmPid === pid) {
      killProcess(pid);
      showToast(`✓ Process PID ${pid} cancelled! Lock released.`);
      setConfirmPid(null);
    } else {
      setConfirmPid(pid);
      setTimeout(() => setConfirmPid(null), 3000);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-950 overflow-hidden font-sans">
      
      {/* Top 4 Metrics Cards */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800/80 select-none flex-shrink-0">
        
        {/* Card 1: Buffer Cache Hit Ratio */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center space-x-1.5">
              <Cpu className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Cache Hit Ratio</span>
            </span>
            <span className="px-1.5 py-0.2 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 rounded text-[10px] font-bold">
              HEALTHY
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">99.6%</div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full" style={{ width: '99.6%' }} />
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex justify-between font-mono">
            <span>RAM Reads: 4.8M</span>
            <span>Disk I/O: 18.2k</span>
          </div>
        </div>

        {/* Card 2: Connection Pool */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center space-x-1.5">
              <Server className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>Connection Pool</span>
            </span>
            <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">18.6%</span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
            28 <span className="text-xs font-normal text-slate-500">/ 150</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-sky-500 h-full rounded-full" style={{ width: '18.6%' }} />
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex justify-between font-mono">
            <span>Active: 6</span>
            <span>Idle in Pool: 22</span>
          </div>
        </div>

        {/* Card 3: Database Size */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center space-x-1.5">
              <Database className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Database Size</span>
            </span>
            <span className="text-purple-600 dark:text-purple-400 font-mono text-[10px] font-bold">SSD</span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
            14.2 <span className="text-sm font-normal text-slate-500">GB</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
            <div className="bg-sky-500 h-full" style={{ width: '71%' }} />
            <div className="bg-purple-500 h-full" style={{ width: '27%' }} />
            <div className="bg-amber-500 h-full" style={{ width: '2%' }} />
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex justify-between font-mono">
            <span className="text-sky-600 dark:text-sky-400">Data: 10.1G</span>
            <span className="text-purple-600 dark:text-purple-400">Index: 3.8G</span>
          </div>
        </div>

        {/* Card 4: Throughput */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="flex items-center space-x-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Throughput (TPS)</span>
            </span>
            <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px] flex items-center space-x-1.5">
              <HeartbeatDot 
                color={heartbeatMetrics.isHealthy ? 'green' : 'red'} 
                size="xs" 
                showWave={heartbeatMetrics.isHealthy} 
              />
              <span>{heartbeatMetrics.isHealthy ? `${heartbeatMetrics.lastLatencyMs || activeConnection.latencyMs || 0.8}ms ping` : 'Disconnected'}</span>
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
            1,420 <span className="text-xs font-normal text-slate-500">tps</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-amber-500 h-full rounded-full" style={{ width: '62%' }} />
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex justify-between font-mono">
            <span>QPS: 4,890 /s</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">0% Rollback</span>
          </div>
        </div>

      </div>

      {/* Processlist Header */}
      <div className="p-3 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs select-none flex-shrink-0">
        <div className="flex items-center space-x-2">
          <HeartbeatDot color="green" size="xs" showWave={true} />
          <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-slate-800 dark:text-slate-200 font-bold">Live Processlist & Running Queries (Kill Query)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="relative overflow-hidden px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono font-bold flex items-center space-x-1.5 shadow-2xs">
            <BorderChase color="emerald" dual={true} speed="slow" borderWidth={1.5} glow={true} />
            <span className="relative z-1 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="relative z-1">STREAMING PG_STAT</span>
          </div>
          <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">{processes.length} threads</span>
        </div>
      </div>

      {/* Processlist Table */}
      <div className="flex-1 overflow-auto text-xs font-mono select-text bg-white dark:bg-transparent">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-950/95 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-left select-none text-[11px]">
            <tr>
              <th className="p-2.5 pl-4 border-r border-slate-200 dark:border-slate-800/80 w-24">PID</th>
              <th className="p-2.5 border-r border-slate-200 dark:border-slate-800/80 w-28">User</th>
              <th className="p-2.5 border-r border-slate-200 dark:border-slate-800/80 w-32">Client IP</th>
              <th className="p-2.5 border-r border-slate-200 dark:border-slate-800/80 w-24">Duration</th>
              <th className="p-2.5 border-r border-slate-200 dark:border-slate-800/80 w-36">State</th>
              <th className="p-2.5 border-r border-slate-200 dark:border-slate-800/80 flex-1">Query SQL</th>
              <th className="p-2.5 pr-4 text-right w-28">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-[11px]">
            {processes.map((proc, idx) => (
              <tr 
                key={proc.pid}
                className={`transition ${
                  proc.isLongRunning
                    ? 'bg-rose-50/70 dark:bg-rose-950/20 hover:bg-rose-100/70 dark:hover:bg-rose-950/30 border-l-2 border-l-rose-500'
                    : idx % 2 === 0
                    ? 'bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    : 'bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                }`}
              >
                <td className="p-2.5 pl-4 border-r border-slate-200 dark:border-slate-800/60 font-bold text-sky-700 dark:text-sky-400">{proc.pid}</td>
                <td className="p-2.5 border-r border-slate-200 dark:border-slate-800/60 text-slate-800 dark:text-slate-200">{proc.user}</td>
                <td className="p-2.5 border-r border-slate-200 dark:border-slate-800/60 text-slate-600 dark:text-slate-400">{proc.clientIp}</td>
                <td className={`p-2.5 border-r border-slate-200 dark:border-slate-800/60 font-bold ${proc.isLongRunning ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                  {proc.duration}
                </td>
                <td className="p-2.5 border-r border-slate-200 dark:border-slate-800/60">
                  <span className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    proc.state === 'locked'
                      ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40'
                      : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                  }`}>
                    <HeartbeatDot color={proc.state === 'locked' ? 'red' : 'green'} size="xs" showWave={proc.state === 'locked'} />
                    <span>{proc.state}</span>
                  </span>
                </td>
                <td className="p-2.5 border-r border-slate-200 dark:border-slate-800/60 text-slate-800 dark:text-slate-300 truncate max-w-md">
                  <Tooltip side="top" content={proc.query} className="max-w-xl font-mono text-xs whitespace-pre-wrap break-all">
                    <span className="truncate block cursor-help">{proc.query}</span>
                  </Tooltip>
                </td>
                <td className="p-2.5 pr-4 text-right select-none">
                  <button
                    onClick={() => handleKill(proc.pid)}
                    className={`px-2.5 py-1 text-white font-bold text-[11px] rounded-lg shadow-2xs transition active:scale-95 cursor-pointer ${
                      confirmPid === proc.pid
                        ? 'bg-rose-700 ring-2 ring-rose-400 animate-pulse'
                        : 'bg-rose-600 hover:bg-rose-500'
                    }`}
                  >
                    {confirmPid === proc.pid ? 'Confirm Kill?' : 'Kill Query'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
};
