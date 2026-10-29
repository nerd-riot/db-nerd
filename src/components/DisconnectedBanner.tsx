import React from 'react';
import { useAppStore } from '../stores/useAppStore';
import { Unplug, RefreshCw } from 'lucide-react';
import { Tooltip } from './Tooltip';

export const DisconnectedBanner: React.FC = () => {
  const {
    activeConnection,
    isReconnecting,
    reconnectActiveConnection,
    setReconnectModalOpen,
  } = useAppStore();

  const isFailed = activeConnection.connectionStatus === 'failed';

  if (!isFailed) return null;

  const envTag = (activeConnection.env || 'staging').toUpperCase();
  const dbName = activeConnection.database || activeConnection.name;

  return (
    <Tooltip side="bottom" content="Click banner to reconnect" shortcut="⌘⇧R">
      <div
        role="banner"
        data-testid="disconnected-banner"
        className="w-full bg-[#c53030] hover:bg-[#b02b2b] text-white px-4 py-1.5 flex items-center justify-between font-mono text-xs select-none shadow-md transition-colors cursor-pointer border-b border-red-800/60 z-30 flex-shrink-0 animate-in fade-in slide-in-from-top-1 duration-200"
        onClick={() => reconnectActiveConnection()}
      >
      <div className="flex items-center space-x-2 truncate">
        {isReconnecting ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0 text-white" />
        ) : (
          <Unplug className="w-3.5 h-3.5 shrink-0 text-white/90 animate-pulse" />
        )}
        <span className="font-bold tracking-wide">{envTag}</span>
        <span className="opacity-60">|</span>
        <span className="truncate">
          Database <span className="font-bold">'{dbName}'</span> is disconnected!{' '}
          <span className="underline underline-offset-2 font-medium opacity-95">
            {isReconnecting ? `Reconnecting to '${dbName}'...` : 'Tap to reconnect...'}
          </span>
        </span>
      </div>

      <div className="flex items-center space-x-2 shrink-0 pl-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setReconnectModalOpen(true);
          }}
          className="px-2 py-0.5 rounded bg-black/25 hover:bg-black/40 text-[10px] font-sans font-semibold text-white/95 border border-white/20 transition cursor-pointer"
        >
          Details (⌘⇧R)
        </button>
      </div>
    </div>
    </Tooltip>
  );
};
