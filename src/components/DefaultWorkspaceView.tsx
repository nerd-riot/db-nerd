import React, { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import {
  Terminal,
  Table as TableIcon,
  Layers,
  ShieldCheck,
  Zap,
  Database,
  Plus,
  ArrowRight,
  Search,
  Trash2,
  Cpu,
  Lock,
} from 'lucide-react';
import { HeartbeatDot } from './HeartbeatDot';
import { BorderChase } from './BorderChase';
import { ConnectorIcon } from './ConnectorIcon';
import { ConnectionProfile } from '../types';
import appIcon from '../assets/app-icon.png';

export const DefaultWorkspaceView: React.FC = () => {
  const {
    activeConnection,
    openSessionIds,
    connections,
    switchActiveConnection,
    setConnectionModalOpen,
    deleteConnection,
    openNewQueryTab,
    openTableGridTab,
    isConnecting,
    triggerConnectingAnimation,
    showToast,
  } = useAppStore();

  const [imgError, setImgError] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');

  const hasActiveSession = Boolean(activeConnection?.id && openSessionIds.includes(activeConnection.id));

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

  const getEnvBadgeColor = (env: string) => {
    switch (env) {
      case 'prod':
        return 'bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-400';
      case 'staging':
        return 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400';
      case 'dev':
        return 'bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-400';
      default:
        return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400';
    }
  };

  const filteredConnections = connections.filter((c) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.engine.toLowerCase().includes(q) ||
      (c.host || '').toLowerCase().includes(q) ||
      (c.database || '').toLowerCase().includes(q)
    );
  });

  const handleDeleteConnection = (e: React.MouseEvent, conn: ConnectionProfile) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete connection "${conn.name}"?`)) {
      deleteConnection(conn.id);
      showToast(`🗑️ Deleted connection "${conn.name}"`);
    }
  };

  // ==========================================
  // CASE 1: NO ACTIVE CONNECTION (HOME PAGE)
  // ==========================================
  if (!hasActiveSession) {
    return (
      <div className="flex-1 flex flex-col items-center justify-start p-6 md:p-8 bg-slate-50 dark:bg-slate-950 select-none overflow-y-auto relative animate-in fade-in duration-200">
        {/* Subtle radial ambient glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-100/40 dark:from-sky-950/25 via-slate-50 dark:via-slate-950 to-slate-50 dark:to-slate-950 pointer-events-none" />

        {/* Home Container */}
        <div className="relative z-10 max-w-2xl w-full flex flex-col items-center space-y-6 pt-2 pb-12">
          
          {/* Hero Branding Section */}
          <div className="flex flex-col items-center text-center space-y-3">
            {/* Mascot Icon */}
            <div className="relative group">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-b from-white dark:from-slate-900 to-slate-100 dark:to-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl flex items-center justify-center p-2.5 ring-1 ring-black/5 dark:ring-white/10 relative overflow-hidden group-hover:scale-105 transition-transform duration-200">
                {!imgError ? (
                  <img
                    src={appIcon}
                    alt="DBNerd Mascot"
                    className="relative z-1 w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)]"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <Database className="w-10 h-10 text-sky-500" />
                )}
              </div>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-900 border border-slate-700/80 rounded-full flex items-center space-x-1 shadow-md z-10">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-mono font-bold text-slate-200 uppercase tracking-wider">
                  v1.2.0
                </span>
              </div>
            </div>

            {/* App Introduction Title & Description */}
            <div className="space-y-1.5 pt-1">
              <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center justify-center space-x-2">
                <span>DBNerd</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono font-semibold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                  Native IDE
                </span>
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
                Fast, native-speed, lightweight database client built with Tauri & Rust.
                TablePlus-compatible workflows & shortcuts, bounded RAM footprint (&lt;50MB), and safe transaction staging.
              </p>
            </div>

            {/* Feature Highlights Pills */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
              <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 flex items-center space-x-1 shadow-2xs">
                <Zap className="w-3 h-3 text-amber-500" />
                <span>Rust Streaming Core</span>
              </span>
              <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 flex items-center space-x-1 shadow-2xs">
                <Cpu className="w-3 h-3 text-sky-500" />
                <span>Memory Guard (&lt;50MB RAM)</span>
              </span>
              <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 flex items-center space-x-1 shadow-2xs">
                <ShieldCheck className="w-3 h-3 text-emerald-500" />
                <span>Safe Mode &amp; DML Staging</span>
              </span>
              <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 flex items-center space-x-1 shadow-2xs">
                <Layers className="w-3 h-3 text-purple-500" />
                <span>TablePlus Shortcuts</span>
              </span>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="grid grid-cols-2 gap-3 w-full">
            <button
              onClick={() => setConnectionModalOpen(true)}
              className="p-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white flex items-center justify-between transition-all duration-150 cursor-pointer group shadow-md shadow-sky-500/20 active:scale-[0.98]"
            >
              <div className="flex items-center space-x-3 text-left">
                <div className="p-2 bg-white/20 rounded-lg group-hover:scale-105 transition-transform">
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <span className="text-xs font-bold block leading-tight">Create New Connection</span>
                  <span className="text-[10px] text-sky-100 opacity-90">PostgreSQL, MySQL, Redis, Snowflake</span>
                </div>
              </div>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-black/20 text-white rounded font-bold">⌘K</kbd>
            </button>

            <button
              onClick={() => setConnectionModalOpen(true)}
              className="p-3.5 rounded-xl bg-white dark:bg-slate-900/80 hover:bg-slate-50 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 flex items-center justify-between transition-all duration-150 cursor-pointer group shadow-2xs text-left active:scale-[0.98]"
            >
              <div className="flex items-center space-x-3 text-left">
                <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg group-hover:scale-105 transition-transform">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block leading-tight">Import Connection</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">TablePlus file (.tableplusconnection) or .env</span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Saved Connections Section (Quick Connect) */}
          <div className="w-full space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-2">
                <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider font-mono">
                  Saved Connections
                </h2>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {connections.length}
                </span>
              </div>

              {connections.length > 3 && (
                <div className="relative w-44">
                  <input
                    type="text"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    placeholder="Filter connections..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 pl-6 focus:outline-none focus:border-sky-500 font-sans"
                  />
                  <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                </div>
              )}
            </div>

            {connections.length === 0 ? (
              <div className="p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-center space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No saved connections yet. Click above to add your first database.
                </p>
              </div>
            ) : filteredConnections.length === 0 ? (
              <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No connection matches &quot;{filterQuery}&quot;.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {filteredConnections.map((conn) => {
                  const envColorClass = getEnvBadgeColor(conn.env);
                  return (
                    <div
                      key={conn.id}
                      onClick={() => switchActiveConnection(conn.id)}
                      className="group p-3 rounded-xl bg-white dark:bg-slate-900/90 hover:bg-sky-50/50 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 hover:border-sky-400 dark:hover:border-sky-500/50 flex items-center justify-between transition-all duration-150 cursor-pointer shadow-2xs active:scale-[0.99]"
                    >
                      {/* Left: Engine Icon & Connection Info */}
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform border border-slate-200 dark:border-slate-700/60">
                          <ConnectorIcon engine={conn.engine} size="sm" />
                        </div>

                        <div className="min-w-0 flex-1 text-left space-y-0.5">
                          <div className="flex items-center space-x-2 truncate">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-sky-600 dark:group-hover:text-sky-300 transition-colors">
                              {conn.name}
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase border ${envColorClass}`}>
                              {conn.env}
                            </span>
                            {conn.useSsh && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase bg-purple-500/10 border border-purple-500/30 text-purple-600 dark:text-purple-400 flex items-center space-x-0.5">
                                <Lock className="w-2.5 h-2.5" />
                                <span>SSH</span>
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                            <span>{conn.engine}</span>
                            <span className="mx-1 opacity-40">•</span>
                            <span>{conn.host}:{conn.port}</span>
                            <span className="mx-1 opacity-40">•</span>
                            <span className="text-slate-700 dark:text-slate-300 font-semibold">{conn.database || 'default'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center space-x-2 flex-shrink-0 pl-3">
                        <button
                          onClick={(e) => handleDeleteConnection(e, conn)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                          title="Delete Connection"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => switchActiveConnection(conn.id)}
                          className="h-7 px-3 bg-sky-50 dark:bg-sky-500/15 hover:bg-sky-600 dark:hover:bg-sky-500 text-sky-700 dark:text-sky-300 hover:text-white rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer border border-sky-300 dark:border-sky-500/30 hover:border-transparent active:scale-95 leading-none"
                        >
                          <span>Connect</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Keyboard Shortcuts Reference Guide */}
          <div className="bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 w-full text-xs text-slate-600 dark:text-slate-400 space-y-2 font-sans shadow-2xs">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-700 dark:text-slate-300 font-semibold flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>TablePlus Muscle Memory Shortcuts</span>
              </span>
              <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px]">macOS Native</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
              <div className="flex items-center justify-between px-2 py-1 rounded bg-slate-100 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300">
                <span>Connect</span>
                <kbd className="text-[10px] text-sky-600 dark:text-sky-400 font-bold">⌘K</kbd>
              </div>
              <div className="flex items-center justify-between px-2 py-1 rounded bg-slate-100 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300">
                <span>SQL Query</span>
                <kbd className="text-[10px] text-sky-600 dark:text-sky-400 font-bold">⌘E / ⌘T</kbd>
              </div>
              <div className="flex items-center justify-between px-2 py-1 rounded bg-slate-100 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300">
                <span>Switch DB</span>
                <kbd className="text-[10px] text-sky-600 dark:text-sky-400 font-bold">⌘O</kbd>
              </div>
              <div className="flex items-center justify-between px-2 py-1 rounded bg-slate-100 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300">
                <span>Sidebar</span>
                <kbd className="text-[10px] text-sky-600 dark:text-sky-400 font-bold">⌘B</kbd>
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // ==========================================
  // CASE 2: ACTIVE CONNECTION (WORKSPACE VIEW)
  // ==========================================
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
            <HeartbeatDot color={isConnecting ? 'amber' : 'green'} size="xs" showWave={true} />
            <span className="text-[10px] font-mono font-bold text-slate-200 uppercase tracking-wider">
              {activeConnection.engine}
            </span>
          </div>
        </div>

        {/* Database & Connection Header */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-center space-x-2">
            <h1 className="text-base font-bold text-slate-800 dark:text-slate-100 font-mono tracking-tight">
              {activeConnection.database || 'default'}
            </h1>
            <span className="text-slate-400 dark:text-slate-600 font-mono">/</span>
            <span className="text-xs font-mono text-sky-600 dark:text-sky-400 font-semibold">
              public
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center space-x-1.5 font-mono">
            <span>{engineName}</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span>{activeConnection.host}:{activeConnection.port}</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center space-x-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span>TLSv1.3</span>
            </span>
          </p>
        </div>

        {/* Quick Action Tiles */}
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
            <span className="relative z-1">⚡ Test Connection &amp; Latency</span>
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
