import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Calendar as CalendarIcon,
  Zap,
  Check,
  X,
  Sparkles,
  KeyRound,
  Maximize2,
  AlertCircle,
} from 'lucide-react';
import { ColumnDefinition } from '../types';
import { ColumnTypeIcon, resolveColumnTypeCategory } from './ColumnTypeIcon';
import { Tooltip } from './Tooltip';

export interface InspectorFieldEditorProps {
  field: string;
  value: any;
  colDef?: ColumnDefinition;
  isDirty?: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (newVal: any) => void;
  onDiscard: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

const getNowTimestamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}:${pad2(d.getSeconds())}`;
};

const getTodayDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const getYesterdayDate = () => {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return `${y.getFullYear()}-${pad2(y.getMonth() + 1)}-${pad2(y.getDate())}`;
};

const getTypeBadgeClass = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes('int') || t.includes('num') || t.includes('serial') || t.includes('float') || t.includes('money')) {
    return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40';
  }
  if (t.includes('date') || t.includes('time')) {
    return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40';
  }
  if (t.includes('bool')) {
    return 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/40';
  }
  if (t.includes('json') || t.includes('uuid')) {
    return 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/40';
  }
  return 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/40';
};

export const InspectorFieldEditor: React.FC<InspectorFieldEditorProps> = ({
  field,
  value,
  colDef,
  isDirty = false,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onDiscard,
  onContextMenu,
}) => {
  const colType =
    colDef?.type ||
    (typeof value === 'number'
      ? 'int'
      : typeof value === 'boolean'
      ? 'bool'
      : typeof value === 'object' && value !== null
      ? 'json'
      : 'text');

  const { category } = resolveColumnTypeCategory(colType, value);

  // Stringified representation for input/textarea
  const formatVal = (v: any): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'object') return JSON.stringify(v, null, isExpanded ? 2 : undefined);
    return String(v);
  };

  const [textValue, setTextValue] = useState<string>(() => formatVal(value));
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Sync internal text state with external row changes
  useEffect(() => {
    setTextValue(formatVal(value));
    if (category === 'json' && typeof value === 'object' && value !== null) {
      setJsonError(null);
    }
  }, [value, isExpanded, category]);

  // Calendar view state
  const parseDateFromVal = (str: string): Date => {
    const d = new Date(str);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  const [calDate, setCalDate] = useState<Date>(() => parseDateFromVal(textValue));
  const [calViewYear, setCalViewYear] = useState<number>(() => calDate.getFullYear());
  const [calViewMonth, setCalViewMonth] = useState<number>(() => calDate.getMonth());

  // Step helper for numeric fields
  const handleStep = (delta: number) => {
    const curNum = Number(textValue);
    const base = isNaN(curNum) ? 0 : curNum;
    const nextVal = base + delta;
    setTextValue(String(nextVal));
    onUpdate(nextVal);
  };

  // Date picker selection
  const applyCalendarDay = (day: number) => {
    const year = calViewYear;
    const month = calViewMonth;
    const newDateStr = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    setCalDate(new Date(year, month, day));

    if (category === 'date') {
      setTextValue(newDateStr);
      onUpdate(newDateStr);
    } else {
      let timePart = '00:00:00';
      if (textValue && textValue.includes(' ')) {
        const parts = textValue.split(' ');
        if (parts[1]) timePart = parts[1];
      } else if (textValue && textValue.includes('T')) {
        const parts = textValue.split('T');
        if (parts[1]) timePart = parts[1];
      }
      const fullTs = `${newDateStr} ${timePart}`;
      setTextValue(fullTs);
      onUpdate(fullTs);
    }
    setShowCalendar(false);
  };

  const isNull = value === null || value === undefined;

  return (
    <div
      onContextMenu={onContextMenu}
      className={`space-y-1.5 group p-2 rounded-xl transition-colors ${
        isDirty
          ? 'bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/30 ring-1 ring-amber-500/20'
          : 'bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60'
      }`}
    >
      {/* Field Header */}
      <div className="flex items-center justify-between cursor-pointer select-none">
        <div onClick={onToggleExpand} className="flex items-center space-x-1.5 truncate flex-1 mr-2">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          )}
          {isDirty && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0 ring-2 ring-amber-400/40" />
          )}
          <ColumnTypeIcon type={colType} sampleValue={value} size={12} />
          <span className="font-mono font-semibold text-xs text-slate-800 dark:text-slate-200 truncate group-hover:text-sky-600 dark:group-hover:text-sky-300 transition-colors">
            {field}
          </span>
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          {isDirty && (
            <Tooltip content={`Discard edits to "${field}"`} shortcut="Esc" side="left">
              <button
                type="button"
                onClick={onDiscard}
                className="px-1.5 py-0.5 rounded text-[10px] text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center space-x-0.5 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Discard</span>
              </button>
            </Tooltip>
          )}

          <span
            className={`text-[10px] font-mono px-1.5 py-0.2 rounded border font-medium ${getTypeBadgeClass(
              colType
            )}`}
          >
            {colType}
          </span>
        </div>
      </div>

      {/* Type-Aware Quick Control Bar (Consistent with InlineCellEditor) */}
      <div className="flex items-center flex-wrap gap-1 pt-0.5 pb-1 border-b border-slate-200/60 dark:border-slate-800/60">
        {/* 1. BOOLEAN SELECTOR */}
        {category === 'boolean' && (
          <div className="flex items-center space-x-1 w-full">
            <button
              type="button"
              onClick={() => {
                setTextValue('TRUE');
                onUpdate(true);
              }}
              className={`flex-1 py-1 rounded-md text-[11px] font-mono font-bold flex items-center justify-center space-x-1 transition cursor-pointer ${
                value === true
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300/80 dark:border-slate-700'
              }`}
            >
              <Check className="w-3 h-3 stroke-[3]" />
              <span>TRUE</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTextValue('FALSE');
                onUpdate(false);
              }}
              className={`flex-1 py-1 rounded-md text-[11px] font-mono font-bold flex items-center justify-center space-x-1 transition cursor-pointer ${
                value === false
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300/80 dark:border-slate-700'
              }`}
            >
              <X className="w-3 h-3 stroke-[3]" />
              <span>FALSE</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTextValue('');
                onUpdate(null);
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono italic transition cursor-pointer ${
                isNull
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 font-semibold'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 border border-slate-300/80 dark:border-slate-700'
              }`}
            >
              NULL
            </button>
          </div>
        )}

        {/* 2. DATETIME / DATE PRESETS & CALENDAR PICKER */}
        {(category === 'datetime' || category === 'date' || category === 'time') && (
          <div className="flex items-center space-x-1 w-full overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => {
                const nowStr = category === 'date' ? getTodayDate() : getNowTimestamp();
                setTextValue(nowStr);
                onUpdate(nowStr);
              }}
              className="px-2 py-0.5 rounded text-[10px] bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-600 dark:text-sky-300 font-semibold transition cursor-pointer flex items-center space-x-1 shrink-0"
            >
              <Zap className="w-2.5 h-2.5 text-sky-400" />
              <span>NOW()</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const today = getTodayDate();
                const v = category === 'date' ? today : `${today} 00:00:00`;
                setTextValue(v);
                onUpdate(v);
              }}
              className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium transition cursor-pointer shrink-0"
            >
              Today
            </button>

            <button
              type="button"
              onClick={() => {
                const y = getYesterdayDate();
                const v = category === 'date' ? y : `${y} 00:00:00`;
                setTextValue(v);
                onUpdate(v);
              }}
              className="px-1.5 py-0.5 rounded text-[10px] bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium transition cursor-pointer shrink-0"
            >
              -1d
            </button>

            <button
              type="button"
              onClick={() => setShowCalendar((prev) => !prev)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition cursor-pointer flex items-center space-x-1 shrink-0 ${
                showCalendar
                  ? 'bg-sky-500 text-slate-950 border-sky-400 font-bold shadow-xs'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-300/80 dark:border-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              <CalendarIcon className="w-3 h-3 text-sky-400" />
              <span>Calendar</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTextValue('');
                onUpdate(null);
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-mono italic border transition cursor-pointer shrink-0 ml-auto ${
                isNull
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 font-semibold'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-300/80 dark:border-slate-700 text-slate-400'
              }`}
            >
              NULL
            </button>
          </div>
        )}

        {/* 3. NUMBER STEPPER CONTROLS */}
        {category === 'number' && (
          <div className="flex items-center space-x-1 w-full">
            <button
              type="button"
              onClick={() => handleStep(-10)}
              className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-800 hover:bg-sky-500/20 border border-slate-300/80 dark:border-slate-700 font-mono text-slate-700 dark:text-slate-300 transition cursor-pointer"
            >
              -10
            </button>
            <button
              type="button"
              onClick={() => handleStep(-1)}
              className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-800 hover:bg-sky-500/20 border border-slate-300/80 dark:border-slate-700 font-mono text-slate-700 dark:text-slate-300 transition cursor-pointer"
            >
              -1
            </button>
            <button
              type="button"
              onClick={() => handleStep(1)}
              className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-800 hover:bg-sky-500/20 border border-slate-300/80 dark:border-slate-700 font-mono text-slate-700 dark:text-slate-300 transition cursor-pointer"
            >
              +1
            </button>
            <button
              type="button"
              onClick={() => handleStep(10)}
              className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-800 hover:bg-sky-500/20 border border-slate-300/80 dark:border-slate-700 font-mono text-slate-700 dark:text-slate-300 transition cursor-pointer"
            >
              +10
            </button>
            <button
              type="button"
              onClick={() => {
                setTextValue('0');
                onUpdate(0);
              }}
              className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300/80 dark:border-slate-700 font-mono text-slate-700 dark:text-slate-300 transition cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => {
                setTextValue('');
                onUpdate(null);
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-mono italic border transition cursor-pointer ml-auto ${
                isNull
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 font-semibold'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-300/80 dark:border-slate-700 text-slate-400'
              }`}
            >
              NULL
            </button>
          </div>
        )}

        {/* 4. JSON TOOLS */}
        {category === 'json' && (
          <div className="flex items-center space-x-1.5 w-full">
            <button
              type="button"
              onClick={() => {
                try {
                  const parsed = JSON.parse(textValue);
                  const formatted = JSON.stringify(parsed, null, 2);
                  setTextValue(formatted);
                  onUpdate(parsed);
                  setJsonError(null);
                } catch (e: any) {
                  setJsonError('Invalid JSON format');
                }
              }}
              className="px-2 py-0.5 rounded text-[10px] bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-600 dark:text-purple-300 font-medium transition cursor-pointer flex items-center space-x-1"
            >
              <Sparkles className="w-2.5 h-2.5 text-purple-400" />
              <span>Format JSON</span>
            </button>

            <button
              type="button"
              onClick={() => {
                try {
                  const parsed = JSON.parse(textValue);
                  const minified = JSON.stringify(parsed);
                  setTextValue(minified);
                  onUpdate(parsed);
                  setJsonError(null);
                } catch {
                  setJsonError('Invalid JSON format');
                }
              }}
              className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium transition cursor-pointer"
            >
              Minify
            </button>

            <button
              type="button"
              onClick={() => {
                setTextValue('');
                onUpdate(null);
                setJsonError(null);
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-mono italic border transition cursor-pointer ml-auto ${
                isNull
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 font-semibold'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-300/80 dark:border-slate-700 text-slate-400'
              }`}
            >
              NULL
            </button>
          </div>
        )}

        {/* 5. UUID CONTROLS */}
        {category === 'uuid' && (
          <div className="flex items-center space-x-1.5 w-full">
            <button
              type="button"
              onClick={() => {
                const newUuid = crypto.randomUUID();
                setTextValue(newUuid);
                onUpdate(newUuid);
              }}
              className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-600 dark:text-indigo-300 font-medium transition cursor-pointer flex items-center space-x-1"
            >
              <KeyRound className="w-2.5 h-2.5 text-indigo-400" />
              <span>Generate UUID</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTextValue('');
                onUpdate(null);
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-mono italic border transition cursor-pointer ml-auto ${
                isNull
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 font-semibold'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-300/80 dark:border-slate-700 text-slate-400'
              }`}
            >
              NULL
            </button>
          </div>
        )}

        {/* 6. GENERAL TEXT / OTHER CONTROLS */}
        {category !== 'boolean' &&
          category !== 'datetime' &&
          category !== 'date' &&
          category !== 'time' &&
          category !== 'number' &&
          category !== 'json' &&
          category !== 'uuid' && (
            <div className="flex items-center space-x-1.5 w-full">
              <button
                type="button"
                onClick={() => {
                  setTextValue('');
                  onUpdate(null);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-mono italic border transition cursor-pointer ${
                  isNull
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 font-semibold'
                    : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-300/80 dark:border-slate-700 text-slate-400'
                }`}
              >
                Set NULL
              </button>

              <button
                type="button"
                onClick={() => {
                  setTextValue('');
                  onUpdate('');
                }}
                className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300/80 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer font-mono"
              >
                Empty ''
              </button>
            </div>
          )}
      </div>

      {/* Embedded Calendar Widget (When 'Calendar' is clicked) */}
      {showCalendar && (
        <div className="p-2.5 bg-white dark:bg-slate-900 border border-sky-500/40 rounded-xl shadow-lg space-y-2 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => {
                if (calViewMonth === 0) {
                  setCalViewMonth(11);
                  setCalViewYear((y) => y - 1);
                } else {
                  setCalViewMonth((m) => m - 1);
                }
              }}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              &larr;
            </button>
            <span className="font-semibold text-slate-800 dark:text-slate-100 font-mono text-[11px]">
              {new Date(calViewYear, calViewMonth).toLocaleString('default', { month: 'short' })} {calViewYear}
            </span>
            <button
              type="button"
              onClick={() => {
                if (calViewMonth === 11) {
                  setCalViewMonth(0);
                  setCalViewYear((y) => y + 1);
                } else {
                  setCalViewMonth((m) => m + 1);
                }
              }}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              &rarr;
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-slate-400">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <span key={d} className="font-semibold">
                {d}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px]">
            {Array.from({ length: new Date(calViewYear, calViewMonth, 1).getDay() }).map((_, i) => (
              <span key={`empty-${i}`} className="p-1" />
            ))}
            {Array.from({ length: new Date(calViewYear, calViewMonth + 1, 0).getDate() }).map((_, i) => {
              const day = i + 1;
              const isToday =
                new Date().getDate() === day &&
                new Date().getMonth() === calViewMonth &&
                new Date().getFullYear() === calViewYear;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => applyCalendarDay(day)}
                  className={`p-1 rounded hover:bg-sky-500 hover:text-slate-950 transition cursor-pointer ${
                    isToday
                      ? 'bg-sky-500/20 text-sky-600 dark:text-sky-300 font-bold border border-sky-500/30'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* JSON Error Banner */}
      {jsonError && (
        <div className="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-[10px] font-mono flex items-center space-x-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{jsonError}</span>
        </div>
      )}

      {/* Main Field Editor Input / Textarea */}
      {isExpanded ? (
        <div className="relative">
          <textarea
            rows={category === 'json' ? 5 : textValue.length > 50 ? 4 : 3}
            value={textValue}
            placeholder={isNull ? 'NULL (empty)' : ''}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onDiscard();
              }
            }}
            onChange={(e) => {
              const str = e.target.value;
              setTextValue(str);
              if (str.trim() === '' || str.trim() === 'NULL') {
                onUpdate(null);
                return;
              }
              if (category === 'number') {
                const n = Number(str);
                onUpdate(!isNaN(n) ? n : str);
              } else if (category === 'json') {
                try {
                  const obj = JSON.parse(str);
                  onUpdate(obj);
                  setJsonError(null);
                } catch {
                  onUpdate(str);
                  setJsonError('Invalid JSON');
                }
              } else {
                onUpdate(str);
              }
            }}
            className={`w-full bg-white dark:bg-slate-900 border rounded-lg p-2 font-mono text-[11px] focus:outline-none focus:border-sky-500 select-text leading-relaxed shadow-2xs transition-colors ${
              isNull
                ? 'text-slate-400 dark:text-slate-500 italic placeholder:text-slate-400 dark:placeholder:text-slate-500'
                : 'text-slate-900 dark:text-slate-100'
            } ${
              isDirty
                ? 'border-amber-500/70 ring-1 ring-amber-500/30'
                : 'border-slate-300 dark:border-slate-700/80'
            }`}
          />
        </div>
      ) : (
        <div className="relative flex items-center">
          <input
            type="text"
            value={textValue}
            placeholder={isNull ? 'NULL (empty)' : ''}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onDiscard();
              } else if (category === 'number') {
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  handleStep(e.shiftKey ? 10 : 1);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  handleStep(e.shiftKey ? -10 : -1);
                }
              }
            }}
            onChange={(e) => {
              const str = e.target.value;
              setTextValue(str);
              if (str.trim() === '' || str.trim() === 'NULL') {
                onUpdate(null);
                return;
              }
              if (category === 'number') {
                const n = Number(str);
                onUpdate(!isNaN(n) ? n : str);
              } else {
                onUpdate(str);
              }
            }}
            className={`w-full bg-white dark:bg-slate-900 border rounded-lg px-2.5 py-1 font-mono text-[11px] focus:outline-none focus:border-sky-500 select-text truncate pr-6 shadow-2xs transition-colors ${
              isNull
                ? 'text-slate-400 dark:text-slate-500 italic placeholder:text-slate-400 dark:placeholder:text-slate-500'
                : 'text-slate-900 dark:text-slate-100'
            } ${
              isDirty
                ? 'border-amber-500/70 ring-1 ring-amber-500/30'
                : 'border-slate-300 dark:border-slate-700/80'
            }`}
          />

          <Tooltip content="Expand field view" side="left">
            <button
              type="button"
              onClick={onToggleExpand}
              className="absolute right-1.5 top-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
};
