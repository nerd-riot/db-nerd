import React from 'react';
import { useAppStore } from '../stores/useAppStore';
import {
  Terminal,
  Table as TableIcon,
  Layers,
  ShieldCheck,
  Zap,
  Database,
} from 'lucide-react';
import { HeartbeatDot } from './HeartbeatDot';
import { BorderChase } from './BorderChase';
import { ConnectorIcon } from './ConnectorIcon';
import appIcon from '../assets/app-icon.png';

export const DefaultWorkspaceView: React.FC = () => {
  const {
    activeConnection,
    openSessionIds,
    setConnectionModalOpen,
    openNewQueryTab,
    openTableGridTab,
    isConnecting,
    triggerConnectingAnimation,
  } = useAppStore();

  const hasNoSessions = openSessionIds.length === 0 || !activeConnection?.id;

  const [imgError, setImgError] = React.useState(false);

  const isPostgres = activeConnection?.engine === 'postgres';
  const isMysql = activeConnection?.engine === 'mysql';
  const isRedis = activeConnection?.engine === 'redis';

  const engineName = isPostgres
    ? 'PostgreSQL 16.15'
    : isMysql
    ? 'MySQL 8.0.46'
    : isRedis
    ? 'Redis 7.4.11'
    : 'Snowflake 8.2';

  const defaultSuggestedTable = isMysql ? 'app_users' : isRedis ? 'cache_keys' : 'users';

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-950 select-none overflow-y-auto relative animate-in fade-in duration-200">
      {/* Background subtle radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-sky-100/40 dark:from-sky-950/20 via-slate-50 dark:via-slate-950 to-slate-50 dark:to-slate-950 pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 max-w-xl w-full flex flex-col items-center text-center space-y-5">
        
        {/* DBNerd Mascot Illustration with Speech Bubble */}
        <div className="relative group flex flex-col items-center">
          {/* Speech Bubble: "DBNerd" */}
          <div
            className={`relative mb-2 px-3.5 py-1 rounded-full text-xs font-mono font-bold shadow-sm flex items-center space-x-1.5 select-none transition-colors ${
              isConnecting
                ? 'bg-sky-50 dark:bg-sky-500/25 border border-sky-300 dark:border-sky-400 text-sky-700 dark:text-sky-200'
                : 'bg-teal-50 dark:bg-teal-500/20 border border-teal-200 dark:border-teal-400/40 text-teal-800 dark:text-teal-200'
            }`}
          >
            <span>DBNerd</span>
            {/* Small speech bubble tail */}
            <div
              className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-50 dark:bg-slate-950 border-r border-b rotate-45 ${
                isConnecting ? 'border-sky-300 dark:border-sky-400' : 'border-teal-200 dark:border-teal-400/40'
              }`}
            />
          </div>

          <div
            className={`w-32 h-32 rounded-3xl bg-gradient-to-b from-white dark:from-slate-900 to-slate-100 dark:to-slate-950 border shadow-xl flex items-center justify-center p-3 ring-1 ring-black/5 dark:ring-white/10 relative overflow-hidden ${
              isConnecting
                ? 'border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.25)] ring-sky-400/30'
                : 'border-slate-200 dark:border-slate-800/80'
            }`}
          >
            {/* Apple-grade Border Chase Highlight Runner */}
            {isConnecting && (
              <BorderChase color="sky" dual={true} speed="fast" borderWidth={2.5} glow={true} />
            )}

            {!imgError ? (
              <img
                src={appIcon}
                alt="DBNerd Mascot"
                className="relative z-1 w-full h-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="relative z-1 w-full h-full flex flex-col items-center justify-center rounded-2xl bg-slate-100/80 dark:bg-slate-800/50">
                <ConnectorIcon engine={activeConnection?.engine || 'postgres'} size="xl" className="w-20 h-20" />
              </div>
            )}
          </div>

          {/* Engine Badge */}
          <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-slate-900 border border-slate-700/80 rounded-full flex items-center space-x-1.5 shadow-md z-10">
            <HeartbeatDot color={hasNoSessions ? 'slate' : isConnecting ? 'amber' : 'green'} size="xs" showWave={!hasNoSessions} />
            <span className="text-[10px] font-mono font-bold text-slate-200 uppercase tracking-wider">
              {hasNoSessions ? 'STANDBY' : activeConnection.engine}
            </span>
          </div>
        </div>

        {/* Database & Connection Header */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-center space-x-2">
            <h1 className="text-base font-bold text-slate-800 dark:text-slate-100 font-mono tracking-tight">
              {hasNoSessions ? 'No Connection Open' : (activeConnection.database || 'default')}
            </h1>
            {!hasNoSessions && (
              <>
                <span className="text-slate-400 dark:text-slate-600 font-mono">/</span>
                <span className="text-xs font-mono text-sky-600 dark:text-sky-400 font-semibold">
                  public
                </span>
              </>
            )}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center space-x-1.5 font-mono">
            {hasNoSessions ? (
              <span>All sessions closed • Press ⌘K to select or connect a database</span>
            ) : (
              <>
                <span>{engineName}</span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span>{activeConnection.host}:{activeConnection.port}</span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center space-x-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>TLSv1.3</span>
                </span>
              </>
            )}
          </p>
        </div>

        {/* Quick Action Tiles */}
        {hasNoSessions ? (
          <div className="w-full max-w-md space-y-3">
            <button
              onClick={() => setConnectionModalOpen(true)}
              className="w-full p-4 rounded-xl bg-sky-50 dark:bg-sky-500/15 hover:bg-sky-100 dark:hover:bg-sky-500/25 border border-sky-300 dark:border-sky-500/40 flex items-center justify-between transition-all duration-150 cursor-pointer group shadow-sm text-left active:scale-[0.98]"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-sky-600 text-white rounded-lg group-hover:scale-105 transition-transform">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-sky-950 dark:text-white block">Open Connection Manager</span>
                  <span className="text-[11px] text-sky-700 dark:text-sky-300">Choose a database connector or import from URL / files</span>
                </div>
              </div>
              <kbd className="px-2 py-1 text-xs font-mono bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-300 border border-sky-200 dark:border-sky-700 rounded-md font-bold shadow-2xs">⌘K</kbd>
            </button>

            {/* Educational Quick Start Chips */}
            <div className="grid grid-cols-3 gap-2 text-left">
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1 shadow-2xs">
                <div className="font-bold text-slate-700 dark:text-slate-200 flex items-center space-x-1">
                  <span>🔌</span>
                  <span>22 Engines</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  Postgres, MySQL, Redis, Snowflake, and more.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1 shadow-2xs">
                <div className="font-bold text-slate-700 dark:text-slate-200 flex items-center space-x-1">
                  <span>🔗</span>
                  <span>URL Import</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  Paste connection string for instant connection.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1 shadow-2xs">
                <div className="font-bold text-slate-700 dark:text-slate-200 flex items-center space-x-1">
                  <span>📁</span>
                  <span>1-Click Sync</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  Import from TablePlus or DBeaver configs.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 w-full max-w-md">
            {/* Action 1: New SQL Console */}
            <button
              onClick={() => openNewQueryTab()}
              className="p-3.5 rounded-xl bg-white dark:bg-slate-900/80 hover:bg-slate-50 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 hover:border-sky-400 dark:hover:border-sky-500/50 flex flex-col items-start transition-all duration-150 cursor-pointer group shadow-2xs text-left active:scale-[0.98]"
            >
              <div className="p-2 bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 rounded-lg group-hover:scale-105 transition-transform mb-2">
                <Terminal className="w-4 h-4" />
              </div>
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-sky-700 dark:group-hover:text-white">New SQL Query</span>
                <kbd className="text-[10px] font-mono text-slate-400 dark:text-slate-500 group-hover:text-sky-600 dark:group-hover:text-sky-300 font-bold">⌘E</kbd>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Write and execute raw SQL statements</span>
            </button>

            {/* Action 2: Open Default Table Grid */}
            <button
              onClick={() => openTableGridTab(defaultSuggestedTable)}
              className="p-3.5 rounded-xl bg-white dark:bg-slate-900/80 hover:bg-slate-50 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-500/50 flex flex-col items-start transition-all duration-150 cursor-pointer group shadow-2xs text-left active:scale-[0.98]"
            >
              <div className="p-2 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-lg group-hover:scale-105 transition-transform mb-2">
                <TableIcon className="w-4 h-4" />
              </div>
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-700 dark:group-hover:text-white">Open Table</span>
                <kbd className="text-[10px] font-mono text-slate-400 dark:text-slate-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-300 font-bold">⌘O</kbd>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Explore {defaultSuggestedTable} data grid</span>
            </button>
          </div>
        )}

        {/* Hype Ping Benchmark & Shortcuts Banner */}
        <div className="w-full max-w-md flex items-center justify-between space-x-2">
          <button
            onClick={() => triggerConnectingAnimation(activeConnection.id)}
            disabled={isConnecting}
            className="relative overflow-hidden flex-1 py-2 px-3 rounded-xl bg-white dark:bg-slate-900/70 hover:bg-slate-50 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 hover:border-sky-400 dark:hover:border-sky-500/40 text-xs font-mono text-sky-700 dark:text-sky-400 flex items-center justify-center space-x-1.5 transition cursor-pointer shadow-2xs group"
            title="Trigger connection handshake animation & ping benchmark"
          >
            {isConnecting && (
              <BorderChase color="sky" dual={true} speed="fast" borderWidth={1.5} glow={true} />
            )}
            <Zap className="relative z-1 w-3.5 h-3.5 fill-current" />
            <span className="relative z-1">⚡ Test Connection & Latency</span>
          </button>
        </div>

        {/* Shortcuts & Navigation Hint Banner */}
        <div className="bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3 w-full max-w-md text-xs text-slate-600 dark:text-slate-400 space-y-1.5 font-sans shadow-2xs">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-700 dark:text-slate-300 font-semibold flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Workspace Navigation</span>
            </span>
            <span className="text-slate-400 dark:text-slate-500 font-mono">TablePlus Native Feel</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-200 dark:border-slate-800/60 font-mono">
            <div className="flex items-center justify-between px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300">
              <span>Switch DB</span>
              <kbd className="text-[10px] text-sky-600 dark:text-sky-400 font-bold">⌘O</kbd>
            </div>
            <div className="flex items-center justify-between px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300">
              <span>Connections</span>
              <kbd className="text-[10px] text-sky-600 dark:text-sky-400 font-bold">⌘K</kbd>
            </div>
            <div className="flex items-center justify-between px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300">
              <span>Toggle Sidebar</span>
              <kbd className="text-[10px] text-sky-600 dark:text-sky-400 font-bold">⌘B</kbd>
            </div>
            <div className="flex items-center justify-between px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300">
              <span>Preferences</span>
              <kbd className="text-[10px] text-sky-600 dark:text-sky-400 font-bold">⌘,</kbd>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center pt-1">
            Double-click any table on the left sidebar to open its data grid tab.
          </p>
        </div>

      </div>
    </div>
  );
};
