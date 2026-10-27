import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { getRealFunctions } from '../services/dbService';
import { getFunctionsForConnection } from '../data/schemas';
import { FunctionItem } from '../types';
import {
  RefreshCw,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  Terminal,
  FileCode,
} from 'lucide-react';
import { BorderChase } from './BorderChase';
import {
  ContextMenuContainer,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuHeader,
  ContextMenuPosition,
} from './ContextMenu';

export const AllFunctionsView: React.FC = () => {
  const {
    activeConnection,
    openNewQueryTab,
    setSelectedRowData,
    showToast,
    openSessionIds,
  } = useAppStore();

  const [functions, setFunctions] = useState<FunctionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterText, setFilterText] = useState<string>('');
  const [selectedFunctionName, setSelectedFunctionName] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof FunctionItem>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Context Menu
  const [contextPos, setContextPos] = useState<ContextMenuPosition | null>(null);
  const [contextRow, setContextRow] = useState<FunctionItem | null>(null);

  const fetchFunctions = useCallback(async () => {
    const hasActiveSession = Boolean(activeConnection?.id && openSessionIds.includes(activeConnection.id));
    if (!hasActiveSession) {
      setFunctions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let loaded: FunctionItem[] = [];

    try {
      loaded = await getRealFunctions(activeConnection);
    } catch (e) {
      console.warn('Real functions query failed:', e);
    }

    const isMock = Boolean(activeConnection?.id && (activeConnection.id === 'demo' || activeConnection.id.startsWith('mock')));
    if (isMock && (!loaded || loaded.length === 0)) {
      loaded = getFunctionsForConnection(activeConnection.name, activeConnection.engine);
    }

    setFunctions(loaded);
    if (loaded.length > 0) {
      const initial = loaded[0];
      setSelectedFunctionName(initial.name);
      setSelectedRowData(initial);
    }
    setLoading(false);
  }, [activeConnection, openSessionIds, setSelectedRowData]);

  useEffect(() => {
    fetchFunctions();
  }, [fetchFunctions]);

  const handleSort = (field: keyof FunctionItem) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredFunctions = useMemo(() => {
    let result = functions.filter((fn) =>
      fn.name.toLowerCase().includes(filterText.toLowerCase()) ||
      fn.schema.toLowerCase().includes(filterText.toLowerCase()) ||
      fn.kind.toLowerCase().includes(filterText.toLowerCase()) ||
      (fn.comment || '').toLowerCase().includes(filterText.toLowerCase())
    );

    result.sort((a, b) => {
      let valA = String(a[sortField] || '').toLowerCase();
      let valB = String(b[sortField] || '').toLowerCase();

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [functions, filterText, sortField, sortOrder]);

  const handleRowClick = (row: FunctionItem) => {
    setSelectedFunctionName(row.name);
    setSelectedRowData(row);
  };

  const handleRowDoubleClick = (row: FunctionItem) => {
    const ddl = row.definition || `CREATE OR REPLACE FUNCTION ${row.schema}.${row.name}()\nRETURNS text\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  -- Routine implementation\n  RETURN 'ok';\nEND;\n$$;`;
    openNewQueryTab(ddl);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredFunctions.length === 0) return;
    const currentIndex = filteredFunctions.findIndex((f) => f.name === selectedFunctionName);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = Math.min(currentIndex + 1, filteredFunctions.length - 1);
      const nextRow = filteredFunctions[nextIndex];
      setSelectedFunctionName(nextRow.name);
      setSelectedRowData(nextRow);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = Math.max(currentIndex - 1, 0);
      const prevRow = filteredFunctions[prevIndex];
      setSelectedFunctionName(prevRow.name);
      setSelectedRowData(prevRow);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = filteredFunctions.find((f) => f.name === selectedFunctionName);
      if (current) {
        handleRowDoubleClick(current);
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
              placeholder={`Filter ${filteredFunctions.length} functions in ${schemaLabel}...`}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full bg-white dark:bg-slate-950/80 border border-slate-300 dark:border-slate-800 rounded px-2.5 py-1 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500 pl-7 transition-colors font-sans shadow-2xs"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2 top-2" />
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center space-x-1.5">
            <span className="font-semibold text-amber-600 dark:text-amber-400">{filteredFunctions.length}</span>
            <span>functions</span>
            <span>•</span>
            <span className="text-slate-500 dark:text-slate-400 font-medium">Schema: <span className="text-slate-800 dark:text-slate-200 font-semibold">{schemaLabel}</span></span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => fetchFunctions()}
            disabled={loading}
            className="relative overflow-hidden h-6 px-2.5 rounded bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white flex items-center space-x-1.5 text-xs transition active:scale-95 border border-slate-300/80 dark:border-slate-700/60 shadow-2xs"
            title="Refresh Functions List"
          >
            {loading && (
              <BorderChase color="amber" dual={true} speed="fast" borderWidth={1.5} glow={true} />
            )}
            <RefreshCw className={`relative z-1 w-3 h-3 ${loading ? 'animate-pulse text-amber-500 dark:text-amber-400' : ''}`} />
            <span className="relative z-1">{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Functions Data Grid */}
      <div className="flex-1 overflow-auto bg-white dark:bg-slate-950">
        <table className="w-full border-collapse text-left font-mono text-xs">
          {/* Header Row */}
          <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 backdrop-blur shadow-2xs">
            <tr className="text-slate-600 dark:text-slate-400 font-semibold text-[11px] tracking-wide select-none">
              <th
                onClick={() => handleSort('name')}
                className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors w-[280px]"
              >
                <div className="flex items-center justify-between">
                  <span>name</span>
                  {sortField === 'name' ? (
                    sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />
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
                    sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-600 dark:text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-600 dark:text-amber-400" />
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
                    sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-600 dark:text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-600 dark:text-amber-400" />
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
                    sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-600 dark:text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  )}
                </div>
              </th>

              <th
                className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 text-right w-[120px]"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>estimated_row</span>
                </div>
              </th>

              <th
                className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 text-right w-[110px]"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>total_size</span>
                </div>
              </th>

              <th
                className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 text-right w-[110px]"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>data_size</span>
                </div>
              </th>

              <th
                className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800/80 text-right w-[110px]"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>index_size</span>
                </div>
              </th>

              <th
                onClick={() => handleSort('comment')}
                className="py-1.5 px-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span>comment</span>
                  {sortField === 'comment' && (
                    sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-600 dark:text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  )}
                </div>
              </th>
            </tr>
          </thead>

          {/* Grid Rows */}
          <tbody className="divide-y divide-slate-200 dark:divide-slate-900/80">
            {filteredFunctions.map((fn, idx) => {
              const isSelected = selectedFunctionName === fn.name;

              return (
                <tr
                  key={`${fn.schema}.${fn.name}-${idx}`}
                  onClick={() => handleRowClick(fn)}
                  onDoubleClick={() => handleRowDoubleClick(fn)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleRowClick(fn);
                    setContextPos({ x: e.clientX, y: e.clientY });
                    setContextRow(fn);
                  }}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-sky-100/90 dark:bg-sky-600/30 text-sky-950 dark:text-white font-semibold'
                      : idx % 2 === 0
                      ? 'bg-white dark:bg-slate-950/90 text-slate-800 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-900/60'
                      : 'bg-slate-50/70 dark:bg-slate-900/30 text-slate-800 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-900/60'
                  }`}
                >
                  {/* Name with orange {} icon */}
                  <td className="py-1 px-3 border-r border-slate-200 dark:border-slate-900/80 flex items-center space-x-2 truncate">
                    <div className="w-4 h-4 rounded bg-amber-500/10 border border-amber-400/30 flex items-center justify-center flex-shrink-0 text-amber-600 dark:text-amber-400 font-mono font-bold text-[10px]">
                      {'{ }'}
                    </div>
                    <span className="truncate text-slate-900 dark:text-slate-100 font-medium">{fn.name}</span>
                  </td>

                  {/* Schema */}
                  <td className="py-1 px-3 border-r border-slate-200 dark:border-slate-900/80 text-slate-600 dark:text-slate-400 truncate">
                    {fn.schema}
                  </td>

                  {/* Kind */}
                  <td className="py-1 px-3 border-r border-slate-200 dark:border-slate-900/80 text-slate-600 dark:text-slate-400 truncate">
                    {fn.kind}
                  </td>

                  {/* Owner */}
                  <td className="py-1 px-3 border-r border-slate-200 dark:border-slate-900/80 text-slate-600 dark:text-slate-400 truncate">
                    {fn.owner}
                  </td>

                  {/* Estimated Row (Right-Aligned) */}
                  <td className="py-1 px-3 border-r border-slate-200 dark:border-slate-900/80 text-right font-mono text-slate-500">
                    {fn.estimated_row || '--'}
                  </td>

                  {/* Total Size (Right-Aligned) */}
                  <td className="py-1 px-3 border-r border-slate-200 dark:border-slate-900/80 text-right font-mono text-slate-500">
                    {fn.total_size || '--'}
                  </td>

                  {/* Data Size (Right-Aligned) */}
                  <td className="py-1 px-3 border-r border-slate-200 dark:border-slate-900/80 text-right font-mono text-slate-500">
                    {fn.data_size || '--'}
                  </td>

                  {/* Index Size (Right-Aligned) */}
                  <td className="py-1 px-3 border-r border-slate-200 dark:border-slate-900/80 text-right font-mono text-slate-500">
                    {fn.index_size || '--'}
                  </td>

                  {/* Comment */}
                  <td className="py-1 px-3 text-slate-500 truncate">
                    {fn.comment || '--'}
                  </td>
                </tr>
              );
            })}

            {filteredFunctions.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400 dark:text-slate-500 font-sans">
                  No functions matching "{filterText}"
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
            Total Functions: <strong className="text-slate-800 dark:text-slate-200 font-bold">{filteredFunctions.length}</strong>
          </span>
          <span>•</span>
          <span>
            Selected: <strong className="text-amber-600 dark:text-amber-400 font-bold">{selectedFunctionName || '--'}</strong>
          </span>
        </div>

        <div className="flex items-center space-x-3 text-slate-400 dark:text-slate-500">
          <span>Double-click to view routine definition</span>
          <span>•</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">Instance Active</span>
        </div>
      </div>

      {/* Context Menu for Function Row */}
      {contextPos && contextRow && (
        <ContextMenuContainer
          position={contextPos}
          onClose={() => {
            setContextPos(null);
            setContextRow(null);
          }}
          width={220}
        >
          <ContextMenuHeader title={`Function: ${contextRow.name}`} />

          <ContextMenuItem
            icon={<FileCode className="w-3.5 h-3.5 text-amber-400" />}
            label="Open Definition"
            shortcut="↵"
            onClick={() => {
              handleRowDoubleClick(contextRow);
            }}
          />

          <ContextMenuItem
            icon={<Terminal className="w-3.5 h-3.5 text-sky-400" />}
            label="Execute (SELECT func())"
            onClick={() => {
              openNewQueryTab(`SELECT ${contextRow.schema}.${contextRow.name}();`);
            }}
          />

          <ContextMenuDivider />

          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy Function Name"
            onClick={() => {
              navigator.clipboard.writeText(contextRow.name);
              showToast(`Copied function name "${contextRow.name}"`);
            }}
          />

          <ContextMenuItem
            icon={<RefreshCw className="w-3.5 h-3.5 text-emerald-400" />}
            label="Refresh Functions"
            onClick={() => {
              fetchFunctions();
            }}
          />
        </ContextMenuContainer>
      )}
    </div>
  );
};
