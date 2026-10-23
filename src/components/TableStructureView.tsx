import React, { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { getTableSchema } from '../data/schemas';
import { Search, Key, Copy, Code, Filter, Terminal } from 'lucide-react';
import { ColumnDefinition } from '../types';
import { ColumnTypeIcon } from './ColumnTypeIcon';
import {
  ContextMenuContainer,
  ContextMenuItem,
  ContextMenuDivider,
  ContextMenuHeader,
  ContextMenuPosition,
} from './ContextMenu';

const DATA_TYPES = [
  'int4',
  'int8',
  'varchar(255)',
  'text',
  'bool',
  'timestamp',
  'timestamptz',
  'jsonb',
  'numeric(12,2)',
  'uuid',
  'bytea',
  'serial',
  'bigserial',
];

export const TableStructureView: React.FC = () => {
  const {
    selectedTable,
    structureSearchColumn,
    setStructureSearchColumn,
    selectedStructureColumn,
    setSelectedStructureColumn,
    setTableViewMode,
    isFilterBarOpen,
    toggleFilterBar,
    setFilterWhereText,
    openNewQueryTab,
    showToast,
  } = useAppStore();
  const schemaInfo = getTableSchema(selectedTable);

  const [columns, setColumns] = useState<ColumnDefinition[]>(schemaInfo.columns);
  const [tableNameInput, setTableNameInput] = useState(selectedTable);
  const [colContextPos, setColContextPos] = useState<ContextMenuPosition | null>(null);
  const [targetCol, setTargetCol] = useState<ColumnDefinition | null>(null);

  // Sync columns if selectedTable changes
  React.useEffect(() => {
    setColumns(schemaInfo.columns);
    setTableNameInput(selectedTable);
    if (schemaInfo.columns.length > 0) {
      setSelectedStructureColumn(schemaInfo.columns[0]);
    }
  }, [selectedTable]);

  const primaryKeyCol = columns.find((c) => c.isPrimaryKey)?.name || 'id';

  const filteredColumns = columns.filter((col) =>
    col.name.toLowerCase().includes(structureSearchColumn.trim().toLowerCase())
  );

  const handleUpdateCol = (idx: number, field: keyof ColumnDefinition, val: any) => {
    setColumns((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };


  return (
    <div className="flex-1 flex flex-col bg-slate-100 dark:bg-slate-900/90 text-xs font-mono overflow-hidden select-none">
      {/* Top Header: Name, Primary, Search */}
      <div className="h-11 bg-white dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800/90 px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-3">
          {/* Table Name Field */}
          <div className="flex items-center space-x-1.5 font-sans">
            <span className="text-slate-500 dark:text-slate-400 font-semibold text-xs">Name</span>
            <input
              type="text"
              value={tableNameInput}
              onChange={(e) => setTableNameInput(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-sky-500/70 rounded-md px-2.5 py-1 text-slate-800 dark:text-slate-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 w-44 shadow-2xs"
            />
          </div>

          {/* Primary Key Badge */}
          <div className="flex items-center space-x-1.5 font-sans">
            <span className="text-slate-500 dark:text-slate-400 font-semibold text-xs">Primary</span>
            <span className="px-2 py-0.5 bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-600/60 text-sky-700 dark:text-sky-300 font-mono text-xs rounded-md font-semibold flex items-center space-x-1 shadow-2xs">
              <Key className="w-3 h-3 text-sky-600 dark:text-sky-400" />
              <span>{primaryKeyCol}</span>
            </span>
          </div>
        </div>

        {/* Search for Column Input */}
        <div className="relative font-sans">
          <input
            type="text"
            placeholder="Search for column..."
            value={structureSearchColumn}
            onChange={(e) => setStructureSearchColumn(e.target.value)}
            className="w-56 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors shadow-2xs"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-2 pointer-events-none" />
        </div>
      </div>

      {/* Structure Columns Grid */}
      <div className="flex-1 overflow-auto bg-white dark:bg-slate-950/80">
        <table className="w-full border-collapse">
          {/* Table Header */}
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-950/95 backdrop-blur-md z-10 border-b border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-400 text-left text-[11px]">
            <tr>
              <th className="w-12 px-3 py-2 border-r border-slate-300 dark:border-slate-800/80 text-center font-normal">#</th>
              <th className="w-48 px-3 py-2 border-r border-slate-300 dark:border-slate-800/80 font-normal">column_name</th>
              <th className="w-36 px-3 py-2 border-r border-slate-300 dark:border-slate-800/80 font-normal">data_type</th>
              <th className="w-28 px-3 py-2 border-r border-slate-300 dark:border-slate-800/80 font-normal">is_nullable</th>
              <th className="w-28 px-3 py-2 border-r border-slate-300 dark:border-slate-800/80 font-normal">check</th>
              <th className="w-36 px-3 py-2 border-r border-slate-300 dark:border-slate-800/80 font-normal">column_default</th>
              <th className="w-36 px-3 py-2 border-r border-slate-300 dark:border-slate-800/80 font-normal">foreign_key</th>
              <th className="px-3 py-2 font-normal">comment</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/40 text-[11px]">
            {filteredColumns.map((col, idx) => {
              const isSelected = selectedStructureColumn?.name === col.name;
              const isEven = idx % 2 === 0;

              return (
                <tr
                  key={col.name + idx}
                  onClick={() => setSelectedStructureColumn(col)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedStructureColumn(col);
                    setTargetCol(col);
                    setColContextPos({ x: e.clientX, y: e.clientY });
                  }}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#eff6ff] dark:bg-sky-500/20 text-[#1d4ed8] dark:text-white font-semibold shadow-2xs border-l-2 border-l-sky-500'
                      : isEven
                      ? 'bg-[#fcfdfd] dark:bg-slate-900/40 hover:bg-[#f0f7ff] dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200'
                      : 'bg-white dark:bg-slate-950/60 hover:bg-[#f0f7ff] dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {/* # Index */}
                  <td className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 text-center text-slate-500 select-none">
                    {idx + 1}
                  </td>

                  {/* Column Name */}
                  <td className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 font-semibold text-slate-800 dark:text-slate-200">
                    <div className="flex items-center space-x-1.5">
                      <ColumnTypeIcon type={col.type} size={12} />
                      <input
                        type="text"
                        value={col.name}
                        onChange={(e) => handleUpdateCol(idx, 'name', e.target.value)}
                        className="w-full bg-transparent border-0 focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-800/60 rounded px-1 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </td>

                  {/* Data Type Dropdown */}
                  <td className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 text-slate-700 dark:text-slate-300">
                    <div className="flex items-center justify-between group cursor-pointer">
                      <select
                        value={col.type}
                        onChange={(e) => handleUpdateCol(idx, 'type', e.target.value)}
                        className="bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer w-full"
                      >
                        {DATA_TYPES.map((dt) => (
                          <option key={dt} value={dt} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                            {dt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>

                  {/* Is Nullable */}
                  <td className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 text-slate-700 dark:text-slate-300">
                    <select
                      value={col.isNullable ? 'YES' : 'NO'}
                      onChange={(e) => handleUpdateCol(idx, 'isNullable', e.target.value === 'YES')}
                      className="bg-transparent text-slate-800 dark:text-slate-300 focus:outline-none cursor-pointer"
                    >
                      <option value="NO" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                        NO
                      </option>
                      <option value="YES" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                        YES
                      </option>
                    </select>
                  </td>

                  {/* Check Constraint */}
                  <td className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 text-slate-400 italic">
                    NULL
                  </td>

                  {/* Column Default */}
                  <td className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 text-slate-700 dark:text-slate-300">
                    <input
                      type="text"
                      value={col.defaultValue || 'NULL'}
                      onChange={(e) => handleUpdateCol(idx, 'defaultValue', e.target.value)}
                      className={`w-full bg-transparent border-0 focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-800/60 rounded px-1 ${
                        !col.defaultValue || col.defaultValue === 'NULL' ? 'text-slate-400 italic' : 'text-slate-800 dark:text-slate-200'
                      }`}
                    />
                  </td>

                  {/* Foreign Key */}
                  <td className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800/60 text-slate-500">
                    {col.isForeignKey ? (
                      <span className="text-sky-700 dark:text-sky-400 font-semibold">{`→ ${col.foreignTable}(${col.foreignColumn})`}</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-600">EMPTY</span>
                    )}
                  </td>

                  {/* Comment */}
                  <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400 truncate">
                    <input
                      type="text"
                      placeholder="Comment..."
                      value={col.comment || ''}
                      onChange={(e) => handleUpdateCol(idx, 'comment', e.target.value)}
                      className="w-full bg-transparent border-0 focus:outline-none focus:bg-slate-800/60 rounded px-1 placeholder-slate-600 text-slate-400"
                    />
                  </td>
                </tr>
              );
            })}

          </tbody>
        </table>
      </div>

      {/* Column Structure Context Menu */}
      {colContextPos && targetCol && (
        <ContextMenuContainer
          position={colContextPos}
          onClose={() => {
            setColContextPos(null);
            setTargetCol(null);
          }}
          width={240}
        >
          <ContextMenuHeader title={`Column: ${targetCol.name}`} />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
            label="Copy Column Name"
            onClick={() => {
              navigator.clipboard.writeText(targetCol.name);
              showToast(`📋 Copied "${targetCol.name}"`);
              setColContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5 text-slate-400" />}
            label={`Copy Type (${targetCol.type})`}
            onClick={() => {
              navigator.clipboard.writeText(targetCol.type);
              showToast(`📋 Copied type "${targetCol.type}"`);
              setColContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Code className="w-3.5 h-3.5 text-sky-400" />}
            label="Copy Column DDL"
            onClick={() => {
              const ddl = `"${targetCol.name}" ${targetCol.type.toUpperCase()}${targetCol.isPrimaryKey ? ' PRIMARY KEY' : ''}${targetCol.isNullable ? '' : ' NOT NULL'}${targetCol.defaultValue && targetCol.defaultValue !== 'NULL' ? ` DEFAULT ${targetCol.defaultValue}` : ''}`;
              navigator.clipboard.writeText(ddl);
              showToast(`📋 Copied DDL for "${targetCol.name}"`);
              setColContextPos(null);
            }}
          />
          <ContextMenuDivider />
          <ContextMenuItem
            icon={<Filter className="w-3.5 h-3.5 text-emerald-400" />}
            label="Filter by Column in Data Grid"
            onClick={() => {
              setTableViewMode('data');
              if (!isFilterBarOpen) {
                toggleFilterBar();
              }
              setFilterWhereText(`"${targetCol.name}" = `);
              setColContextPos(null);
            }}
          />
          <ContextMenuItem
            icon={<Terminal className="w-3.5 h-3.5 text-amber-400" />}
            label="Query Distinct Values in SQL Tab"
            onClick={() => {
              openNewQueryTab(`SELECT "${targetCol.name}", COUNT(*) AS count\nFROM "${selectedTable}"\nGROUP BY "${targetCol.name}"\nORDER BY count DESC\nLIMIT 100;`);
              setColContextPos(null);
            }}
          />
        </ContextMenuContainer>
      )}
    </div>
  );
};
