import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { Search, Database, Plus, X, RefreshCw } from 'lucide-react';
import { HeartbeatDot } from './HeartbeatDot';

export const OpenDatabaseModal: React.FC = () => {
  const {
    isDatabaseModalOpen,
    setDatabaseModalOpen,
    activeConnection,
    switchActiveDatabase,
    createDatabase,
    liveDatabases,
    fetchLiveDatabases,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newDbName, setNewDbName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const liveList = liveDatabases[activeConnection.id];
  const databases = (liveList && liveList.length > 0)
    ? liveList
    : (activeConnection.databases && activeConnection.databases.length > 0)
    ? activeConnection.databases
    : [activeConnection.database || (activeConnection.engine === 'postgres' ? 'postgres' : 'default')];

  const filtered = databases.filter((db) =>
    db.toLowerCase().includes(search.trim().toLowerCase())
  );

  useEffect(() => {
    if (isDatabaseModalOpen) {
      setSearch('');
      setSelectedIndex(0);
      setIsCreatingNew(false);
      setNewDbName('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      setIsLoading(true);
      fetchLiveDatabases(activeConnection).finally(() => setIsLoading(false));
    }
  }, [isDatabaseModalOpen, activeConnection.id]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  if (!isDatabaseModalOpen) return null;

  const handleOpenSelected = (dbName?: string) => {
    const target = dbName || filtered[selectedIndex] || activeConnection.database;
    if (target) {
      switchActiveDatabase(target);
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newDbName.trim()) {
      createDatabase(newDbName.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isCreatingNew) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < filtered.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleOpenSelected();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDatabaseModalOpen(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-100 select-none"
      onClick={() => setDatabaseModalOpen(false)}
    >
      <div
        className="w-[420px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5 dark:ring-white/10 flex flex-col animate-in zoom-in-95 duration-150 font-sans"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Title Header */}
        <div className="h-10 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 truncate">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Open database</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded font-mono truncate max-w-[160px]">
              {activeConnection.name}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => {
                setIsLoading(true);
                fetchLiveDatabases(activeConnection).finally(() => setIsLoading(false));
              }}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
              title="Refresh databases from server"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-500' : ''}`} />
            </button>
            <button
              onClick={() => setDatabaseModalOpen(false)}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/40">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search for database..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-sans transition-colors"
            />
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-2 pointer-events-none" />
          </div>
        </div>

        {/* Inline Create New Database Form */}
        {isCreatingNew && (
          <form
            onSubmit={handleCreateSubmit}
            className="p-3 bg-slate-50 dark:bg-slate-950/80 border-b border-sky-500/30 space-y-2 animate-in fade-in duration-100"
          >
            <span className="text-[11px] font-bold text-sky-600 dark:text-sky-300">Create New Database</span>
            <input
              type="text"
              placeholder="Database name (e.g. analytics_staging)..."
              value={newDbName}
              onChange={(e) => setNewDbName(e.target.value)}
              autoFocus
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCreatingNew(false)}
                className="px-2.5 py-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newDbName.trim()}
                className="px-3 py-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-[11px] rounded-lg transition active:scale-95"
              >
                Create & Open
              </button>
            </div>
          </form>
        )}

        {/* Database List */}
        <div className="max-h-[300px] min-h-[180px] overflow-y-auto p-1.5 space-y-0.5 text-xs">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No matching database found.
            </div>
          ) : (
            filtered.map((db, idx) => {
              const isSelected = idx === selectedIndex;
              const isActive = db === activeConnection.database;

              return (
                <div
                  key={db}
                  onClick={() => setSelectedIndex(idx)}
                  onDoubleClick={() => handleOpenSelected(db)}
                  className={`px-3 py-1.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors select-none ${
                    isSelected
                      ? 'bg-sky-600 text-white font-semibold shadow-xs'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <Database
                      className={`w-3.5 h-3.5 flex-shrink-0 ${
                        isSelected ? 'text-white fill-white/20' : 'text-sky-600 dark:text-sky-400 fill-sky-500/20'
                      }`}
                    />
                    <span className="truncate">{db}</span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    {isActive && (
                      <span className="flex items-center space-x-1">
                        <HeartbeatDot color="green" size="xs" showWave={false} />
                        <span className={`text-[10px] font-mono uppercase font-semibold ${isSelected ? 'text-white/90' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          ACTIVE
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="h-12 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 px-3.5 flex items-center justify-between">
          <button
            onClick={() => setDatabaseModalOpen(false)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl transition active:scale-95 cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center space-x-2">
            {!isCreatingNew && (
              <button
                onClick={() => setIsCreatingNew(true)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl transition flex items-center space-x-1 active:scale-95 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New...</span>
              </button>
            )}

            <button
              onClick={() => handleOpenSelected()}
              className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl transition shadow-xs active:scale-95 cursor-pointer"
            >
              Open
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
