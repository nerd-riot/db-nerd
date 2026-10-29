import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar as CalendarIcon,
  Clock,
  Zap,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  ToggleLeft,
  ToggleRight,
  Hash,
  Sparkles,
} from 'lucide-react';
import { ColumnDefinition } from '../types';
import { resolveColumnTypeCategory } from './ColumnTypeIcon';
import { Tooltip } from './Tooltip';

interface InlineCellEditorProps {
  col: ColumnDefinition;
  initialValue: any;
  onSave: (value: any) => void;
  onCancel: () => void;
}

export const InlineCellEditor: React.FC<InlineCellEditorProps> = ({
  col,
  initialValue,
  onSave,
  onCancel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Type categorization
  const { category } = resolveColumnTypeCategory(col.type, initialValue);

  // Formatted string representation for the input
  const formatInitial = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  const [textValue, setTextValue] = useState<string>(formatInitial(initialValue));
  const [showPopover, setShowPopover] = useState<boolean>(true);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; placeAbove?: boolean }>({
    top: 0,
    left: 0,
  });

  // Boolean keyboard selection index: 0 = TRUE, 1 = FALSE, 2 = NULL
  const [boolSelectedIndex, setBoolSelectedIndex] = useState<number>(
    initialValue === true ? 0 : initialValue === false ? 1 : 2
  );

  // Calendar state
  const parseDateFromText = (str: string): Date => {
    const d = new Date(str);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  const [calDate, setCalDate] = useState<Date>(() => parseDateFromText(textValue));
  const [calViewYear, setCalViewYear] = useState<number>(() => calDate.getFullYear());
  const [calViewMonth, setCalViewMonth] = useState<number>(() => calDate.getMonth());

  // Position calculation for the floating popover
  const updatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const popoverWidth = category === 'datetime' || category === 'date' ? 260 : category === 'number' ? 230 : 200;
    const popoverEstimatedHeight = category === 'datetime' || category === 'date' ? 290 : 160;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    let left = rect.left;
    if (left + popoverWidth > screenW - 12) {
      left = Math.max(12, screenW - popoverWidth - 12);
    }

    let top = rect.bottom + 4;
    let placeAbove = false;
    if (top + popoverEstimatedHeight > screenH - 12) {
      top = Math.max(12, rect.top - popoverEstimatedHeight - 4);
      placeAbove = true;
    }

    setPopoverPos({ top, left, placeAbove });
  };

  useLayoutEffect(() => {
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, []);

  useEffect(() => {
    // Auto-focus input on mount
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  // Outside click listener
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      handleCommit();
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [textValue, category]);

  // Cast value according to column category before saving
  const handleCommit = (overrideVal?: any) => {
    const raw = overrideVal !== undefined ? overrideVal : textValue.trim();

    if (raw === '' || raw === 'NULL' || raw === 'null' || raw === null) {
      onSave(null);
      return;
    }

    if (category === 'boolean') {
      if (typeof raw === 'boolean') {
        onSave(raw);
        return;
      }
      const lower = String(raw).toLowerCase();
      if (lower === 'true' || lower === 't' || lower === '1') {
        onSave(true);
      } else if (lower === 'false' || lower === 'f' || lower === '0') {
        onSave(false);
      } else {
        onSave(null);
      }
      return;
    }

    if (category === 'number') {
      if (typeof raw === 'number') {
        onSave(raw);
        return;
      }
      const num = Number(raw);
      onSave(isNaN(num) ? raw : num);
      return;
    }

    // Default string / date / other types
    onSave(raw);
  };

  // Keyboard Navigation inside editor
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (category === 'boolean') {
        if (boolSelectedIndex === 0) handleCommit(true);
        else if (boolSelectedIndex === 1) handleCommit(false);
        else handleCommit(null);
      } else {
        handleCommit();
      }
      return;
    }

    // Boolean shortcuts
    if (category === 'boolean') {
      if (e.key === 't' || e.key === 'T' || e.key === '1') {
        e.preventDefault();
        setTextValue('TRUE');
        setBoolSelectedIndex(0);
        handleCommit(true);
        return;
      }
      if (e.key === 'f' || e.key === 'F' || e.key === '0') {
        e.preventDefault();
        setTextValue('FALSE');
        setBoolSelectedIndex(1);
        handleCommit(false);
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setTextValue('NULL');
        setBoolSelectedIndex(2);
        handleCommit(null);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setBoolSelectedIndex((prev) => (prev > 0 ? prev - 1 : 2));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setBoolSelectedIndex((prev) => (prev < 2 ? prev + 1 : 0));
        return;
      }
    }

    // Number stepper keyboard shortcuts
    if (category === 'number') {
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleStep(step);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleStep(-step);
        return;
      }
    }
  };

  // Number Stepper Helper
  const handleStep = (delta: number) => {
    const curNum = Number(textValue);
    const base = isNaN(curNum) ? 0 : curNum;
    const nextVal = base + delta;
    setTextValue(String(nextVal));
  };

  // Date/Time Helpers
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

  const applyCalendarDay = (day: number) => {
    const year = calViewYear;
    const month = calViewMonth;
    const newDateStr = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    setCalDate(new Date(year, month, day));

    if (category === 'date') {
      setTextValue(newDateStr);
      handleCommit(newDateStr);
    } else {
      // Retain time if present
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
    }
  };

  // Days in selected calendar month
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(calViewYear, calViewMonth, 1).getDay(); // 0 = Sun
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  return (
    <div ref={containerRef} className="relative w-full flex items-center">
      {/* Inline input container */}
      <div className="relative w-full flex items-center bg-white dark:bg-slate-900 border border-sky-500 rounded px-1.5 py-0.5 shadow-xs ring-1 ring-sky-500/30">
        <input
          ref={inputRef}
          type="text"
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent text-slate-900 dark:text-slate-100 font-mono text-[11px] focus:outline-none pr-7"
          placeholder={category === 'boolean' ? 'TRUE / FALSE' : col.isNullable ? 'NULL' : ''}
        />

        {/* Right Action Icons inside the cell editor */}
        <div className="absolute right-1 flex items-center space-x-0.5">
          {/* Boolean Quick Toggle Button */}
          {category === 'boolean' && (
            <Tooltip side="top" content="Click to toggle TRUE / FALSE">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const nextVal = textValue.toUpperCase() === 'TRUE' ? 'FALSE' : 'TRUE';
                  setTextValue(nextVal);
                  handleCommit(nextVal === 'TRUE');
                }}
                className="p-0.5 rounded text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition cursor-pointer"
              >
                {textValue.toUpperCase() === 'TRUE' ? (
                  <ToggleRight className="w-4 h-4 text-emerald-500" />
                ) : (
                  <ToggleLeft className="w-4 h-4 text-slate-400" />
                )}
              </button>
            </Tooltip>
          )}

          {/* Number Stepper (▲ / ▼) */}
          {category === 'number' && (
            <div className="flex flex-col -space-y-0.5">
              <Tooltip side="left" content="Increment (+1, Shift for +10)">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleStep(e.shiftKey ? 10 : 1);
                  }}
                  className="p-0.5 rounded hover:bg-sky-500/20 text-slate-400 hover:text-sky-500 transition cursor-pointer"
                >
                  <ChevronUp className="w-2.5 h-2.5" />
                </button>
              </Tooltip>
              <Tooltip side="left" content="Decrement (-1, Shift for -10)">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleStep(e.shiftKey ? -10 : -1);
                  }}
                  className="p-0.5 rounded hover:bg-sky-500/20 text-slate-400 hover:text-sky-500 transition cursor-pointer"
                >
                  <ChevronDown className="w-2.5 h-2.5" />
                </button>
              </Tooltip>
            </div>
          )}

          {/* DateTime Calendar Toggle */}
          {(category === 'datetime' || category === 'date' || category === 'time') && (
            <Tooltip side="left" content="Toggle Calendar & Suggestions">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShowPopover((prev) => !prev);
                }}
                className="p-0.5 rounded text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition cursor-pointer"
              >
                <CalendarIcon className="w-3.5 h-3.5 text-sky-400" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* FLOATING SUGGESTIONS POPOVER (PORTAL TO DOCUMENT BODY) */}
      {showPopover &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              top: `${popoverPos.top}px`,
              left: `${popoverPos.left}px`,
            }}
            className="fixed z-[9999] bg-white dark:bg-slate-900/98 backdrop-blur-2xl border border-slate-300 dark:border-slate-700/80 rounded-xl shadow-2xl p-2 text-xs font-sans ring-1 ring-black/5 dark:ring-white/10 animate-in fade-in zoom-in-95 duration-100 select-none"
          >
            {/* 1. BOOLEAN DROPDOWN */}
            {category === 'boolean' && (
              <div className="w-48 space-y-1">
                <div className="px-2 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1">
                  <span>Select Boolean</span>
                  <span className="font-mono text-[9px] text-sky-600 dark:text-sky-400">Keys: [T] [F]</span>
                </div>

                {/* TRUE Option */}
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleCommit(true);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left transition cursor-pointer ${
                    boolSelectedIndex === 0 || textValue.toUpperCase() === 'TRUE'
                      ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-500/30'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="font-mono font-bold text-[11px]">TRUE</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">T / 1</span>
                </button>

                {/* FALSE Option */}
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleCommit(false);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left transition cursor-pointer ${
                    boolSelectedIndex === 1 || textValue.toUpperCase() === 'FALSE'
                      ? 'bg-rose-500/15 text-rose-800 dark:text-rose-300 font-semibold border border-rose-500/30'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span className="font-mono font-bold text-[11px]">FALSE</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">F / 0</span>
                </button>

                {/* NULL Option */}
                {col.isNullable && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleCommit(null);
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left transition cursor-pointer ${
                      boolSelectedIndex === 2 || textValue === 'NULL' || textValue === ''
                        ? 'bg-slate-500/15 text-slate-800 dark:text-slate-300 font-medium border border-slate-500/30'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                      <span className="font-mono italic text-[11px]">NULL</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">N / ⌫</span>
                  </button>
                )}
              </div>
            )}

            {/* 2. NUMBER STEPPER & PRESETS */}
            {category === 'number' && (
              <div className="w-56 space-y-2">
                <div className="px-1 text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1">
                  <span className="flex items-center space-x-1">
                    <Hash className="w-3 h-3 text-sky-400" />
                    <span>Quick Stepper</span>
                  </span>
                  <span className="text-[9px] font-mono text-slate-500">▲/▼ keys</span>
                </div>

                {/* Stepper buttons row */}
                <div className="grid grid-cols-4 gap-1">
                  <Tooltip side="top" content="Subtract 10">
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleStep(-10);
                      }}
                      className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-sky-500/20 text-slate-700 dark:text-slate-200 font-mono text-[11px] rounded transition cursor-pointer text-center"
                    >
                      -10
                    </button>
                  </Tooltip>
                  <Tooltip side="top" content="Subtract 1">
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleStep(-1);
                      }}
                      className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-sky-500/20 text-slate-700 dark:text-slate-200 font-mono text-[11px] rounded transition cursor-pointer text-center"
                    >
                      -1
                    </button>
                  </Tooltip>
                  <Tooltip side="top" content="Add 1">
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleStep(1);
                      }}
                      className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-sky-500/20 text-slate-700 dark:text-slate-200 font-mono text-[11px] rounded transition cursor-pointer text-center"
                    >
                      +1
                    </button>
                  </Tooltip>
                  <Tooltip side="top" content="Add 10">
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleStep(10);
                      }}
                      className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-sky-500/20 text-slate-700 dark:text-slate-200 font-mono text-[11px] rounded transition cursor-pointer text-center"
                    >
                      +10
                    </button>
                  </Tooltip>
                </div>

                {/* Quick Values */}
                <div className="flex items-center space-x-1.5 pt-1 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setTextValue('0');
                    }}
                    className="flex-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[10px] rounded transition cursor-pointer text-center"
                  >
                    Set 0
                  </button>
                  {col.isNullable && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleCommit(null);
                      }}
                      className="flex-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 font-mono italic text-[10px] rounded transition cursor-pointer text-center"
                    >
                      NULL
                    </button>
                  )}
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleCommit();
                    }}
                    className="px-2.5 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-[10px] rounded transition cursor-pointer flex items-center space-x-1"
                  >
                    <span>Done</span>
                    <CornerDownLeft className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            )}

            {/* 3. DATE & TIME CALENDAR (Clean, Compact, Not Messy) */}
            {(category === 'datetime' || category === 'date' || category === 'time') && (
              <div className="w-64 space-y-2">
                {/* Presets Row */}
                <div className="flex items-center space-x-1 pb-1.5 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const nowStr = category === 'date' ? getTodayDate() : getNowTimestamp();
                      setTextValue(nowStr);
                      handleCommit(nowStr);
                    }}
                    className="px-2 py-0.5 bg-sky-500/15 border border-sky-500/30 text-sky-600 dark:text-sky-300 rounded font-semibold text-[10px] hover:bg-sky-500/25 transition cursor-pointer flex items-center space-x-1 shrink-0"
                  >
                    <Zap className="w-2.5 h-2.5 text-sky-400" />
                    <span>NOW()</span>
                  </button>

                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const todayStr = getTodayDate();
                      if (category === 'date') {
                        setTextValue(todayStr);
                        handleCommit(todayStr);
                      } else {
                        setTextValue(`${todayStr} 00:00:00`);
                      }
                    }}
                    className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-[10px] hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer shrink-0"
                  >
                    Today
                  </button>

                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const y = new Date();
                      y.setDate(y.getDate() - 1);
                      const yStr = `${y.getFullYear()}-${pad2(y.getMonth() + 1)}-${pad2(y.getDate())}`;
                      setTextValue(category === 'date' ? yStr : `${yStr} 00:00:00`);
                    }}
                    className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-[10px] hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer shrink-0"
                  >
                    -1d
                  </button>

                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const t = new Date();
                      t.setDate(t.getDate() + 1);
                      const tStr = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
                      setTextValue(category === 'date' ? tStr : `${tStr} 00:00:00`);
                    }}
                    className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-[10px] hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer shrink-0"
                  >
                    +1d
                  </button>

                  {col.isNullable && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleCommit(null);
                      }}
                      className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-400 font-mono italic rounded text-[10px] hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer shrink-0"
                    >
                      NULL
                    </button>
                  )}
                </div>

                {/* Mini Month Calendar */}
                <div className="space-y-1">
                  {/* Calendar Month & Year Bar */}
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {monthNames[calViewMonth]} {calViewYear}
                    </span>
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (calViewMonth === 0) {
                            setCalViewMonth(11);
                            setCalViewYear((y) => y - 1);
                          } else {
                            setCalViewMonth((m) => m - 1);
                          }
                        }}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (calViewMonth === 11) {
                            setCalViewMonth(0);
                            setCalViewYear((y) => y + 1);
                          } else {
                            setCalViewMonth((m) => m + 1);
                          }
                        }}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Day Names Grid */}
                  <div className="grid grid-cols-7 gap-1 text-[10px] font-semibold text-slate-400 text-center">
                    <span>Su</span>
                    <span>Mo</span>
                    <span>Tu</span>
                    <span>We</span>
                    <span>Th</span>
                    <span>Fr</span>
                    <span>Sa</span>
                  </div>

                  {/* Days Numbers Grid */}
                  <div className="grid grid-cols-7 gap-1 text-[11px] font-mono text-center">
                    {/* Empty padding days */}
                    {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                      <div key={`empty-${i}`} className="h-6" />
                    ))}
                    {/* Day numbers */}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const dayNum = i + 1;
                      const isCurrentSelected =
                        calDate.getFullYear() === calViewYear &&
                        calDate.getMonth() === calViewMonth &&
                        calDate.getDate() === dayNum;

                      return (
                        <button
                          key={`day-${dayNum}`}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applyCalendarDay(dayNum);
                          }}
                          className={`h-6 rounded flex items-center justify-center transition cursor-pointer ${
                            isCurrentSelected
                              ? 'bg-sky-500 text-slate-950 font-bold shadow-xs'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-sky-500/20 hover:text-sky-400'
                          }`}
                        >
                          {dayNum}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time Presets (if datetime or time) */}
                {(category === 'datetime' || category === 'time') && (
                  <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px]">
                    <div className="flex items-center space-x-1 text-slate-500 dark:text-slate-400">
                      <Clock className="w-3 h-3 text-sky-400" />
                      <span>Time:</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const datePart = textValue.split(' ')[0] || getTodayDate();
                          setTextValue(`${datePart} 00:00:00`);
                        }}
                        className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-mono cursor-pointer"
                      >
                        00:00:00
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const datePart = textValue.split(' ')[0] || getTodayDate();
                          setTextValue(`${datePart} 12:00:00`);
                        }}
                        className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-mono cursor-pointer"
                      >
                        12:00:00
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const datePart = textValue.split(' ')[0] || getTodayDate();
                          setTextValue(`${datePart} 23:59:59`);
                        }}
                        className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-mono cursor-pointer"
                      >
                        23:59:59
                      </button>
                    </div>
                  </div>
                )}

                {/* Bottom Action Footer */}
                <div className="pt-1 flex items-center justify-end space-x-1.5 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onCancel();
                    }}
                    className="px-2 py-0.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[10px] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleCommit();
                    }}
                    className="px-2.5 py-0.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-[10px] rounded transition cursor-pointer flex items-center space-x-1"
                  >
                    <span>Apply</span>
                    <CornerDownLeft className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            )}

            {/* 4. OTHER TYPES SUGGESTIONS (UUID / JSON / Text) */}
            {category !== 'boolean' &&
              category !== 'number' &&
              category !== 'datetime' &&
              category !== 'date' &&
              category !== 'time' && (
                <div className="w-52 space-y-1">
                  <div className="px-1 text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1">
                    <span>Suggestions</span>
                    <span className="font-mono text-[9px] text-slate-500">{col.type}</span>
                  </div>

                  {category === 'uuid' && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const uuid =
                          typeof crypto !== 'undefined' && crypto.randomUUID
                            ? crypto.randomUUID()
                            : '00000000-0000-0000-0000-000000000000';
                        setTextValue(uuid);
                        handleCommit(uuid);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg flex items-center space-x-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-sky-500/15 hover:text-sky-400 transition cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-sky-400" />
                      <span className="font-mono text-[10px]">gen_random_uuid()</span>
                    </button>
                  )}

                  {category === 'json' && (
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setTextValue('{}');
                          handleCommit('{}');
                        }}
                        className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-mono text-[11px] rounded text-center cursor-pointer"
                      >
                        {'{ }'}
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setTextValue('[]');
                          handleCommit('[]');
                        }}
                        className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-mono text-[11px] rounded text-center cursor-pointer"
                      >
                        [ ]
                      </button>
                    </div>
                  )}

                  {col.isNullable && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleCommit(null);
                      }}
                      className="w-full px-2 py-1 rounded text-left text-slate-400 font-mono italic text-[10px] hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      Set NULL
                    </button>
                  )}
                </div>
              )}
          </div>,
          document.body
        )}
    </div>
  );
};
