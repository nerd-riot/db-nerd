import React from 'react';
import { useAppStore } from '../stores/useAppStore';
import { getTableSchema } from '../data/schemas';
import { Key } from 'lucide-react';

export const TableIndexesView: React.FC = () => {
  const { selectedTable, rows, activeConnection } = useAppStore();
  const schemaInfo = getTableSchema(selectedTable, rows, activeConnection?.engine);


  return (
    <div className="flex-1 flex flex-col bg-slate-100 dark:bg-slate-900/90 text-xs font-mono overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-11 bg-white dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800/90 px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 font-sans">
            <span className="text-slate-500 dark:text-slate-400 font-semibold text-xs">Table</span>
            <span className="font-bold text-slate-800 dark:text-slate-100">{selectedTable}</span>
          </div>
          <span className="text-slate-400">/</span>
          <span className="text-amber-600 dark:text-amber-400 font-semibold font-sans text-xs">Indexes & Constraints</span>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto bg-white dark:bg-slate-950/80">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-950/95 backdrop-blur-md z-10 border-b border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-400 text-left text-[11px]">
            <tr>
              <th className="w-12 px-3 py-2 border-r border-slate-300 dark:border-slate-800/80 text-center font-normal">#</th>
              <th className="w-64 px-3 py-2 border-r border-slate-300 dark:border-slate-800/80 font-normal">index_name</th>
              <th className="w-48 px-3 py-2 border-r border-slate-300 dark:border-slate-800/80 font-normal">columns</th>
              <th className="w-28 px-3 py-2 border-r border-slate-300 dark:border-slate-800/80 font-normal">type</th>
              <th className="w-24 px-3 py-2 border-r border-slate-300 dark:border-slate-800/80 font-normal">is_unique</th>
              <th className="w-24 px-3 py-2 border-r border-slate-300 dark:border-slate-800/80 font-normal">is_primary</th>
              <th className="px-3 py-2 font-normal">size</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40 text-[11px]">
            {schemaInfo.indexes.map((idx, i) => {
              const isEven = i % 2 === 0;

              return (
                <tr
                  key={idx.name}
                  className={`hover:bg-[#f0f7ff] dark:hover:bg-slate-800/40 transition-colors ${
                    isEven ? 'bg-[#fcfdfd] dark:bg-slate-900/40' : 'bg-white dark:bg-slate-950/60'
                  }`}
                >
                  <td className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 text-center text-slate-500 select-none">
                    {i + 1}
                  </td>
                  <td className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 font-semibold text-slate-800 dark:text-slate-200">
                    <div className="flex items-center space-x-1.5">
                      <Key className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                      <span>{idx.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 text-sky-700 dark:text-sky-300 font-semibold">
                    {idx.columns.join(', ')}
                  </td>
                  <td className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 text-slate-700 dark:text-slate-300">
                    {idx.type}
                  </td>
                  <td className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60">
                    {idx.isUnique ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">YES</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">NO</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60">
                    {idx.isPrimary ? (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">YES</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">NO</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">
                    {idx.size || '16 KB'}
                  </td>
                </tr>
              );
            })}

          </tbody>
        </table>
      </div>
    </div>
  );
};
