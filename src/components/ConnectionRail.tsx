import React, { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { Database, Plus, X, RefreshCw, Pencil, Copy, LogOut } from 'lucide-react';
import { HeartbeatDot } from './HeartbeatDot';
import { BorderChase } from './BorderChase';
import {
  ContextMenuContainer,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuHeader,
  ContextMenuPosition,
} from './ContextMenu';
import { ConnectionProfile } from '../types';
import { ConnectorIcon } from './ConnectorIcon';

export const ConnectionRail: React.FC = () => {
  const {
    connections,
    openSessionIds,
    activeConnection,
    isConnecting,
    switchActiveConnection,
    closeSession,
    setConnectionModalOpen,
    reloadData,
    showToast,
    addConnection,
  } = useAppStore();

  const [contextPos, setContextPos] = useState<ContextMenuPosition | null>(null);
  const [targetConn, setTargetConn] = useState<ConnectionProfile | null>(null);

  // Filter connections that are currently in openSessionIds
  const openConnections = openSessionIds
    .map((id) => connections.find((c) => c.id === id))
    .filter((c): c is ConnectionProfile => Boolean(c));

  const getEnvColor = (env: string): 'red' | 'amber' | 'green' => {
    if (env === 'prod') return 'red';
    if (env === 'staging') return 'amber';
    return 'green';
  };

  if (openConnections.length === 0) {
    return null;
  }

  return (
    <aside className="w-16 bg-slate-100 dark:bg-[#070b14] border-r border-slate-300 dark:border-slate-800/90 flex flex-col justify-between items-center py-2.5 select-none flex-shrink-0 z-20">
      {/* Top: List of Open Connection Workspaces */}
      <div className="w-full flex flex-col items-center space-y-2">
        {openConnections.map((conn) => {
          const isActive = activeConnection?.id === conn.id;
          const envColor = getEnvColor(conn.env);

          return (
            <div key={conn.id} className="relative group w-full flex justify-center px-1.5">
              {/* Active Indicator Bar on left edge */}
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-1 bg-sky-600 dark:bg-sky-400 rounded-r-md shadow-[0_0_8px_rgba(56,189,248,0.9)]" />
              )}

              {/* Connection Switcher Capsule */}
              <button
                onClick={() => switchActiveConnection(conn.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextPos({ x: e.clientX, y: e.clientY });
                  setTargetConn(conn);
                }}
                className={`w-13 h-13 rounded-xl flex flex-col items-center justify-center p-1 transition-all duration-150 cursor-pointer relative ${
                  isActive
                    ? 'bg-sky-100 dark:bg-sky-500/20 border border-sky-400 dark:border-sky-500/50 shadow-md shadow-sky-500/10 text-sky-950 dark:text-white'
                    : 'hover:bg-slate-200/80 dark:hover:bg-slate-900/90 text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-200 border border-slate-300 dark:border-slate-800/60 hover:border-slate-400 dark:hover:border-slate-700/80'
                }`}
                title={`${conn.name} (${conn.engine}) • ${conn.database} • ${conn.host}:${conn.port}`}
              >
                {/* Border Chase Highlight: stays strictly along the 4 borders of the squircle ("hiệu ứng đuổi bắt") */}
                {isActive && isConnecting && (
                  <BorderChase color="sky" dual={true} speed="fast" borderWidth={2} glow={true} />
                )}

                {/* Engine Icon & Status LED */}
                <div className="relative z-1 flex items-center justify-center mb-0.5">
                  <ConnectorIcon engine={conn.engine} size="sm" />
                  <span className="absolute -bottom-1 -right-1">
                    <HeartbeatDot color={envColor} size="xs" showWave={isActive} />
                  </span>
                </div>

                {/* Connection Name - truncated cleanly without ugly wrap */}
                <span className="relative z-1 text-[10px] font-semibold truncate max-w-[48px] text-center tracking-tight leading-tight block">
                  {conn.name}
                </span>

                {/* Quick Close Button (appears on hover) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeSession(conn.id);
                  }}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-slate-200 dark:bg-slate-800 hover:bg-rose-600 text-slate-600 dark:text-slate-400 hover:text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-[9px] shadow-sm cursor-pointer z-10"
                  title={`Close session "${conn.name}"`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </button>
            </div>
          );
        })}
      </div>

      {/* Bottom: Add Connection (+) Button */}
      <div className="w-full flex flex-col items-center pt-2 border-t border-slate-300 dark:border-slate-800/80 space-y-1.5">
        <button
          onClick={() => setConnectionModalOpen(true)}
          className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900/70 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-800 hover:border-sky-500/50 text-slate-700 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-300 flex items-center justify-center transition-all duration-150 cursor-pointer group shadow-sm active:scale-95"
          title="Open Connection Manager (⌘K)"
        >
          <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
        </button>
        <span className="text-[9px] font-mono text-slate-600 dark:text-slate-500 uppercase tracking-widest font-semibold">
          {openConnections.length} open
        </span>
      </div>

      {/* Right-Click Context Menu on Connection Capsule */}
      {contextPos && targetConn && (
        <ContextMenuContainer position={contextPos} onClose={() => setContextPos(null)} width={230}>
          <ContextMenuHeader title={`Session: ${targetConn.name}`} />
          <ContextMenuItem
            icon={<Database className="w-3.5 h-3.5 text-sky-400" />}
            label={`Switch to "${targetConn.name}"`}
            onClick={() => {
              switchActiveConnection(targetConn.id);
              setContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<RefreshCw className="w-3.5 h-3.5 text-emerald-400" />}
            label="Reload Connection Data"
            shortcut="⌘R"
            onClick={() => {
              switchActiveConnection(targetConn.id);
              reloadData();
              setContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
            label="Duplicate Session Profile"
            onClick={() => {
              const { id: _, ...rest } = targetConn;
              const newConn = addConnection({
                ...rest,
                name: `${targetConn.name} (Copy)`,
                active: false,
              });
              switchActiveConnection(newConn.id);
              showToast(`Created duplicate session "${newConn.name}"`);
              setContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Pencil className="w-3.5 h-3.5 text-amber-400" />}
            label="Edit Connection Settings..."
            onClick={() => {
              setConnectionModalOpen(true);
              setContextPos(null);
            }}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<LogOut className="w-3.5 h-3.5 text-rose-400" />}
            label="Disconnect / Close Session"
            danger
            onClick={() => {
              closeSession(targetConn.id);
              setContextPos(null);
            }}
          />
        </ContextMenuContainer>
      )}
    </aside>
  );
};
