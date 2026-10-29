import React, { useState, useRef, useEffect } from 'react';
import { ColumnTypeIcon } from './ColumnTypeIcon';
import { ChevronDown, Check, Search, Plus } from 'lucide-react';

interface ColumnTypePickerProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}

interface TypeGroup {
  name: string;
  types: string[];
}

const TYPE_GROUPS: TypeGroup[] = [
  {
    name: 'Text & Strings',
    types: ['varchar(255)', 'text', 'varchar(100)', 'varchar(500)', 'char(10)'],
  },
  {
    name: 'Integers & Numbers',
    types: ['int4', 'int8', 'int2', 'numeric(12,2)', 'numeric(18,4)', 'float8', 'serial', 'bigserial'],
  },
  {
    name: 'Date & Time',
    types: ['timestamp', 'timestamptz', 'date', 'time'],
  },
  {
    name: 'Boolean',
    types: ['bool'],
  },
  {
    name: 'JSON & Binary',
    types: ['jsonb', 'json', 'uuid', 'bytea'],
  },
];

export const ColumnTypePicker: React.FC<ColumnTypePickerProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const term = searchTerm.trim().toLowerCase();

  const filteredGroups = TYPE_GROUPS.map((group) => ({
    name: group.name,
    types: group.types.filter((t) => t.toLowerCase().includes(term)),
  })).filter((group) => group.types.length > 0);

  const exactMatch = TYPE_GROUPS.some((g) =>
    g.types.some((t) => t.toLowerCase() === term)
  );

  const handleSelect = (selected: string) => {
    onChange(selected);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left w-full" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className={`w-full flex items-center justify-between px-2 py-1 rounded bg-transparent hover:bg-slate-200/60 dark:hover:bg-slate-800/80 border border-transparent hover:border-slate-300 dark:hover:border-slate-700/80 text-xs font-mono transition cursor-pointer select-none group ${
          isOpen ? 'bg-slate-200/80 dark:bg-slate-800 border-sky-500/50 ring-1 ring-sky-500/30' : ''
        }`}
      >
        <div className="flex items-center space-x-1.5 truncate">
          <ColumnTypeIcon type={value} size={12} />
          <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">{value}</span>
        </div>
        <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 shrink-0 ml-1 opacity-70" />
      </button>

      {/* Floating Popover Dropdown */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full mt-1 w-64 max-h-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col ring-1 ring-black/5 dark:ring-white/10 animate-in fade-in zoom-in-95 duration-100 font-sans"
        >
          {/* Search Input */}
          <div className="p-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
            <div className="relative">
              <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (searchTerm.trim()) {
                      handleSelect(searchTerm.trim());
                    }
                  }
                }}
                placeholder="Search or custom type..."
                className="w-full pl-7 pr-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-md text-xs font-mono text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Type Options List */}
          <div className="flex-1 overflow-auto p-1.5 space-y-2 text-xs">
            {/* Custom type option if not an exact match */}
            {term && !exactMatch && (
              <button
                type="button"
                onClick={() => handleSelect(searchTerm.trim())}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 font-mono text-xs font-semibold cursor-pointer transition text-left"
              >
                <div className="flex items-center space-x-1.5">
                  <Plus className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  <span>Use custom: <strong className="font-bold underline">{searchTerm.trim()}</strong></span>
                </div>
                <span className="text-[10px] text-sky-500 font-sans">Press ↵</span>
              </button>
            )}

            {filteredGroups.map((group) => (
              <div key={group.name} className="space-y-0.5">
                <div className="px-2 py-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {group.name}
                </div>
                {group.types.map((t) => {
                  const isSelected = t.toLowerCase() === value.toLowerCase();
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleSelect(t)}
                      className={`w-full flex items-center justify-between px-2 py-1 rounded-md text-xs font-mono transition cursor-pointer text-left ${
                        isSelected
                          ? 'bg-sky-500 text-white font-bold'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <ColumnTypeIcon type={t} size={12} />
                        <span className="truncate">{t}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}

            {filteredGroups.length === 0 && !term && (
              <div className="p-3 text-center text-xs text-slate-400">No types available</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
