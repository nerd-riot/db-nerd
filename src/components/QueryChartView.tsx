import React, { useMemo, useState } from 'react';
import {
  BarChart2,
  TrendingUp,
  PieChart,
  AlignLeft,
  ArrowUpDown,
  Eye,
  Sparkles,
  Layers,
  Hash,
  Activity,
} from 'lucide-react';

interface QueryChartViewProps {
  results: Record<string, any>[];
  columns: string[];
}

type ChartType = 'bar' | 'area' | 'horizontal' | 'donut';
type SortMode = 'original' | 'desc' | 'asc';

const PALETTE = [
  { stroke: '#38bdf8', fill: '#0ea5e9', glow: 'rgba(56, 189, 248, 0.35)', badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
  { stroke: '#a855f7', fill: '#9333ea', glow: 'rgba(168, 85, 247, 0.35)', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  { stroke: '#10b981', fill: '#059669', glow: 'rgba(16, 185, 129, 0.35)', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  { stroke: '#f59e0b', fill: '#d97706', glow: 'rgba(245, 158, 11, 0.35)', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  { stroke: '#f43f5e', fill: '#e11d48', glow: 'rgba(244, 63, 94, 0.35)', badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  { stroke: '#6366f1', fill: '#4f46e5', glow: 'rgba(99, 102, 241, 0.35)', badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' },
  { stroke: '#14b8a6', fill: '#0d9488', glow: 'rgba(20, 184, 166, 0.35)', badge: 'bg-teal-500/20 text-teal-300 border-teal-500/40' },
  { stroke: '#ec4899', fill: '#db2777', glow: 'rgba(236, 72, 153, 0.35)', badge: 'bg-pink-500/20 text-pink-300 border-pink-500/40' },
];

function toFiniteNumber(val: any): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'bigint') return Number(val);
  if (typeof val === 'string') {
    const cleaned = val.trim().replace(/^[$,€£¥]+/, '').replace(/,/g, '');
    if (cleaned !== '' && !Number.isNaN(Number(cleaned)) && Number.isFinite(Number(cleaned))) {
      return Number(cleaned);
    }
  }
  return null;
}

function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatShortLabel(val: any, maxLen = 22): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'object') {
    const s = JSON.stringify(val);
    return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
  }
  const str = String(val);
  return str.length > maxLen ? `${str.slice(0, maxLen - 1)}…` : str;
}

export const QueryChartView: React.FC<QueryChartViewProps> = ({ results, columns }) => {
  // Analyze columns into numeric vs dimension columns
  const columnAnalysis = useMemo(() => {
    const sampleSlice = results.slice(0, 100);
    const numericCols: string[] = [];
    const dimensionCols: string[] = [];

    for (const col of columns) {
      let numCount = 0;
      let nonNullCount = 0;
      for (const row of sampleSlice) {
        const v = row[col];
        if (v !== null && v !== undefined && v !== '') {
          nonNullCount++;
          if (toFiniteNumber(v) !== null) {
            numCount++;
          }
        }
      }
      if (nonNullCount > 0 && numCount / nonNullCount >= 0.6) {
        numericCols.push(col);
      } else {
        dimensionCols.push(col);
      }
    }

    // Prefer non-ID numeric columns first (e.g., total_spend, total_orders, amount, count)
    const preferredNumeric = numericCols.filter(
      (c) => !/^(id|.*_id|pk)$/i.test(c)
    );
    const defaultMetrics =
      preferredNumeric.length > 0
        ? preferredNumeric.slice(0, 2)
        : numericCols.slice(0, 1);

    // Prefer readable label columns (email, name, title, status, date, sku)
    const preferredDim =
      dimensionCols.find((c) => /email|name|title|customer|user|product|sku|status|category|type|date|day|month/i.test(c)) ||
      dimensionCols[0] ||
      columns[0] ||
      '';

    return {
      numericCols,
      dimensionCols,
      defaultX: preferredDim,
      defaultY: defaultMetrics,
    };
  }, [results, columns]);

  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xCol, setXCol] = useState<string>('');
  const [selectedYCols, setSelectedYCols] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('original');
  const [maxItems, setMaxItems] = useState<number>(25);
  const [showValues, setShowValues] = useState<boolean>(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [useFrequencyMode, setUseFrequencyMode] = useState<boolean>(false);

  // Sync defaults when columns change
  const activeXCol = xCol && columns.includes(xCol) ? xCol : columnAnalysis.defaultX;
  const activeYCols = useMemo(() => {
    const valid = selectedYCols.filter((c) => columnAnalysis.numericCols.includes(c));
    if (valid.length > 0) return valid;
    return columnAnalysis.defaultY;
  }, [selectedYCols, columnAnalysis]);

  const isFrequencyActive = useFrequencyMode || activeYCols.length === 0;

  // Build chart dataset
  const chartData = useMemo(() => {
    if (!results.length || !activeXCol) return [];

    if (isFrequencyActive) {
      // Group by activeXCol and count occurrences
      const counts = new Map<string, number>();
      for (const row of results) {
        const key = formatShortLabel(row[activeXCol], 32);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      let items = Array.from(counts.entries()).map(([label, count], idx) => ({
        id: idx,
        label,
        rawLabel: label,
        values: { count } as Record<string, number>,
        primaryValue: count,
      }));
      if (sortMode === 'desc') items.sort((a, b) => b.primaryValue - a.primaryValue);
      else if (sortMode === 'asc') items.sort((a, b) => a.primaryValue - b.primaryValue);
      return items.slice(0, maxItems);
    }

    const metricKeys = activeYCols;
    const primaryKey = metricKeys[0];

    let items = results.map((row, idx) => {
      const vals: Record<string, number> = {};
      for (const mKey of metricKeys) {
        vals[mKey] = toFiniteNumber(row[mKey]) ?? 0;
      }
      const rawLabel = row[activeXCol];
      return {
        id: idx,
        label: formatShortLabel(rawLabel, 24),
        rawLabel: rawLabel !== null && rawLabel !== undefined ? String(rawLabel) : `Row #${idx + 1}`,
        values: vals,
        primaryValue: vals[primaryKey] ?? 0,
      };
    });

    if (sortMode === 'desc') {
      items = [...items].sort((a, b) => b.primaryValue - a.primaryValue);
    } else if (sortMode === 'asc') {
      items = [...items].sort((a, b) => a.primaryValue - b.primaryValue);
    }

    return items.slice(0, maxItems);
  }, [results, activeXCol, activeYCols, isFrequencyActive, sortMode, maxItems]);

  const metricSeries = isFrequencyActive ? ['count'] : activeYCols;
  const primaryMetric = metricSeries[0] || 'count';

  // Compute KPI statistics for each active metric
  const kpiStats = useMemo(() => {
    if (!chartData.length) {
      return { sum: 0, avg: 0, max: 0, min: 0, maxLabel: '-', seriesMax: {} as Record<string, number> };
    }
    let sum = 0;
    let max = -Infinity;
    let min = Infinity;
    let maxLabel = '';
    const seriesMax: Record<string, number> = {};

    for (const m of metricSeries) {
      seriesMax[m] = 0;
    }

    for (const d of chartData) {
      const v = d.primaryValue;
      sum += v;
      if (v > max) {
        max = v;
        maxLabel = d.label;
      }
      if (v < min) min = v;

      for (const m of metricSeries) {
        const mv = Math.abs(d.values[m] ?? 0);
        if (mv > (seriesMax[m] || 0)) {
          seriesMax[m] = mv;
        }
      }
    }

    return {
      sum,
      avg: sum / chartData.length,
      max: max === -Infinity ? 0 : max,
      min: min === Infinity ? 0 : min,
      maxLabel,
      seriesMax,
    };
  }, [chartData, metricSeries]);

  const toggleYCol = (col: string) => {
    setUseFrequencyMode(false);
    const current = activeYCols;
    if (current.includes(col)) {
      if (current.length > 1) {
        setSelectedYCols(current.filter((c) => c !== col));
      }
    } else {
      setSelectedYCols([...current, col].slice(0, 3));
    }
  };

  if (results.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-slate-400 select-none">
        <BarChart2 className="w-10 h-10 mb-2 opacity-40 text-sky-400" />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">No Data to Visualize</span>
        <span className="text-xs text-slate-500 mt-1">Run a SQL query that returns rows to generate interactive charts.</span>
      </div>
    );
  }

  // SVG coordinate constants for Bar & Area charts
  const svgWidth = Math.max(680, chartData.length * (metricSeries.length > 1 ? 76 : 56));
  const svgHeight = 250;
  const padLeft = 58;
  const padRight = 24;
  const padTop = 26;
  const padBottom = 48;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  // Global max across selected series (or normalized per series if scale differs by > 20x)
  const rawGlobalMax = Math.max(...Object.values(kpiStats.seriesMax), 1);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => rawGlobalMax * t);

  return (
    <div className="w-full h-full flex flex-col bg-slate-50/60 dark:bg-[#121316] text-slate-800 dark:text-slate-200 select-none overflow-hidden">
      {/* Top Interactive Chart Studio Toolbar */}
      <div className="px-3 py-2 bg-white dark:bg-[#18191d] border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* Left: Chart Type Selector */}
        <div className="flex items-center space-x-2">
          <div className="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-[#23252b] border border-slate-200/80 dark:border-white/5">
            <button
              onClick={() => setChartType('bar')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                chartType === 'bar'
                  ? 'bg-sky-500 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Vertical Column / Multi-Bar Chart"
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Column</span>
            </button>
            <button
              onClick={() => setChartType('area')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                chartType === 'area'
                  ? 'bg-sky-500 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Smooth Area & Trend Line Chart"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Line / Area</span>
            </button>
            <button
              onClick={() => setChartType('horizontal')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                chartType === 'horizontal'
                  ? 'bg-sky-500 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Horizontal Leaderboard & Share Breakdown"
            >
              <AlignLeft className="w-3.5 h-3.5" />
              <span>Leaderboard</span>
            </button>
            <button
              onClick={() => setChartType('donut')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                chartType === 'donut'
                  ? 'bg-sky-500 text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Donut / Distribution Share Chart"
            >
              <PieChart className="w-3.5 h-3.5" />
              <span>Donut</span>
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200 dark:bg-white/10 hidden sm:block" />

          {/* X-Axis Dimension Picker */}
          <div className="flex items-center space-x-1.5 text-[11px]">
            <span className="text-slate-400 font-mono uppercase text-[10px]">X-Axis:</span>
            <select
              value={activeXCol}
              onChange={(e) => setXCol(e.target.value)}
              className="h-6.5 px-2 rounded-md bg-slate-100 dark:bg-[#23252b] border border-slate-300 dark:border-white/10 text-slate-800 dark:text-slate-100 font-mono text-[11px] outline-none focus:border-sky-500 cursor-pointer"
            >
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Y-Axis Metric Pills */}
          <div className="flex items-center space-x-1.5 text-[11px] flex-wrap">
            <span className="text-slate-400 font-mono uppercase text-[10px] flex items-center gap-1">
              <Layers className="w-3 h-3 text-sky-400" />
              <span>Y-Metrics:</span>
            </span>
            {columnAnalysis.numericCols.map((col) => {
              const idx = activeYCols.indexOf(col);
              const isSelected = !isFrequencyActive && idx !== -1;
              const color = PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length];
              return (
                <button
                  key={col}
                  onClick={() => toggleYCol(col)}
                  className={`h-6 px-2 rounded-md font-mono text-[11px] border transition flex items-center space-x-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-sky-500/15 dark:bg-sky-500/20 text-sky-700 dark:text-sky-200 border-sky-500/50 font-semibold shadow-2xs'
                      : 'bg-slate-100 dark:bg-[#23252b] text-slate-600 dark:text-slate-400 border-slate-300/70 dark:border-white/10 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Click to toggle metric series on chart (up to 3)"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: isSelected ? color.stroke : '#64748b' }}
                  />
                  <span>{col}</span>
                </button>
              );
            })}
            <button
              onClick={() => setUseFrequencyMode(!isFrequencyActive)}
              className={`h-6 px-2 rounded-md font-mono text-[11px] border transition flex items-center space-x-1 cursor-pointer ${
                isFrequencyActive
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/50 font-semibold'
                  : 'bg-slate-100 dark:bg-[#23252b] text-slate-500 dark:text-slate-400 border-slate-300/70 dark:border-white/10 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Aggregate & count rows by X-Axis category"
            >
              <Hash className="w-3 h-3" />
              <span>COUNT(*)</span>
            </button>
          </div>
        </div>

        {/* Right: Sort, Limit & Labels */}
        <div className="flex items-center space-x-1.5 text-[11px]">
          <button
            onClick={() =>
              setSortMode((prev) =>
                prev === 'original' ? 'desc' : prev === 'desc' ? 'asc' : 'original'
              )
            }
            className={`h-6.5 px-2 rounded-md border flex items-center space-x-1 transition cursor-pointer ${
              sortMode !== 'original'
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/40 font-semibold'
                : 'bg-slate-100 dark:bg-[#23252b] text-slate-600 dark:text-slate-400 border-slate-300/80 dark:border-white/10 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Cycle Sort Order (Original -> High-to-Low -> Low-to-High)"
          >
            <ArrowUpDown className="w-3 h-3" />
            <span className="font-mono">
              {sortMode === 'original' ? 'Order: SQL' : sortMode === 'desc' ? 'Sort: High↓' : 'Sort: Low↑'}
            </span>
          </button>

          <select
            value={maxItems}
            onChange={(e) => setMaxItems(Number(e.target.value))}
            className="h-6.5 px-2 rounded-md bg-slate-100 dark:bg-[#23252b] border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300 font-mono text-[11px] outline-none cursor-pointer"
            title="Max records plotted"
          >
            <option value={10}>Top 10</option>
            <option value={25}>Top 25</option>
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
          </select>

          <button
            onClick={() => setShowValues(!showValues)}
            className={`h-6.5 px-2 rounded-md border flex items-center space-x-1 transition cursor-pointer ${
              showValues
                ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/40 font-medium'
                : 'bg-slate-100 dark:bg-[#23252b] text-slate-500 border-slate-300/80 dark:border-white/10'
            }`}
            title="Toggle Value Labels on Chart"
          >
            <Eye className="w-3 h-3" />
            <span className="hidden md:inline">Labels</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="px-4 py-2 bg-slate-100/70 dark:bg-[#15161a] border-b border-slate-200/80 dark:border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
        <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white dark:bg-[#1c1e24] border border-slate-200/70 dark:border-white/5 shadow-2xs">
          <div>
            <div className="text-[10px] font-mono uppercase text-slate-400">
              Total ({primaryMetric})
            </div>
            <div className="text-sm font-bold font-mono text-sky-600 dark:text-sky-400">
              {formatCompactNumber(kpiStats.sum)}
            </div>
          </div>
          <Sparkles className="w-4 h-4 text-sky-400/60" />
        </div>

        <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white dark:bg-[#1c1e24] border border-slate-200/70 dark:border-white/5 shadow-2xs">
          <div>
            <div className="text-[10px] font-mono uppercase text-slate-400">
              Average ({primaryMetric})
            </div>
            <div className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {formatCompactNumber(kpiStats.avg)}
            </div>
          </div>
          <Activity className="w-4 h-4 text-emerald-400/60" />
        </div>

        <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white dark:bg-[#1c1e24] border border-slate-200/70 dark:border-white/5 shadow-2xs">
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase text-slate-400 truncate">
              Peak ({kpiStats.maxLabel})
            </div>
            <div className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">
              {formatCompactNumber(kpiStats.max)}
            </div>
          </div>
          <TrendingUp className="w-4 h-4 text-amber-400/60 shrink-0" />
        </div>

        <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white dark:bg-[#1c1e24] border border-slate-200/70 dark:border-white/5 shadow-2xs">
          <div>
            <div className="text-[10px] font-mono uppercase text-slate-400">
              Plotted Records
            </div>
            <div className="text-sm font-bold font-mono text-purple-600 dark:text-purple-400">
              {chartData.length} <span className="text-[11px] font-normal text-slate-400">/ {results.length} rows</span>
            </div>
          </div>
          <BarChart2 className="w-4 h-4 text-purple-400/60" />
        </div>
      </div>

      {/* Main Chart Canvas */}
      <div className="flex-1 overflow-auto p-4 flex flex-col justify-between relative">
        {chartType === 'bar' && (
          <div className="w-full h-full flex flex-col justify-center overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-full min-h-[210px] max-h-[360px] overflow-visible"
            >
              <defs>
                {PALETTE.map((p, i) => (
                  <linearGradient key={i} id={`bar-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={p.stroke} stopOpacity="0.95" />
                    <stop offset="100%" stopColor={p.fill} stopOpacity="0.55" />
                  </linearGradient>
                ))}
              </defs>

              {/* Horizontal Grid Lines & Y-Axis Labels */}
              {yTicks.map((tick, idx) => {
                const y = padTop + plotH - (tick / rawGlobalMax) * plotH;
                return (
                  <g key={idx}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={svgWidth - padRight}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-white/8"
                      strokeDasharray={idx === 0 ? undefined : '4 4'}
                      strokeWidth="1"
                    />
                    <text
                      x={padLeft - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 dark:fill-slate-500 font-mono text-[10px]"
                    >
                      {formatCompactNumber(tick)}
                    </text>
                  </g>
                );
              })}

              {/* Average Reference Line */}
              {kpiStats.avg > 0 && (
                <g>
                  <line
                    x1={padLeft}
                    y1={padTop + plotH - (kpiStats.avg / rawGlobalMax) * plotH}
                    x2={svgWidth - padRight}
                    y2={padTop + plotH - (kpiStats.avg / rawGlobalMax) * plotH}
                    stroke="#10b981"
                    strokeDasharray="3 3"
                    strokeOpacity="0.55"
                    strokeWidth="1"
                  />
                  <text
                    x={svgWidth - padRight - 4}
                    y={padTop + plotH - (kpiStats.avg / rawGlobalMax) * plotH - 4}
                    textAnchor="end"
                    className="fill-emerald-500/80 font-mono text-[9px]"
                  >
                    AVG: {formatCompactNumber(kpiStats.avg)}
                  </text>
                </g>
              )}

              {/* Bars */}
              {chartData.map((d, idx) => {
                const groupWidth = plotW / Math.max(chartData.length, 1);
                const groupX = padLeft + idx * groupWidth;
                const innerPad = Math.max(8, groupWidth * 0.22);
                const availW = Math.max(12, groupWidth - innerPad * 2);
                const singleBarW = Math.min(48, Math.max(6, availW / metricSeries.length - 3));
                const totalBarsW = singleBarW * metricSeries.length + (metricSeries.length - 1) * 3;
                const startX = groupX + (groupWidth - totalBarsW) / 2;
                const isHovered = hoveredIdx === idx;

                return (
                  <g
                    key={d.id}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className="cursor-pointer"
                  >
                    {/* Hover highlight column */}
                    {isHovered && (
                      <rect
                        x={groupX + 2}
                        y={padTop}
                        width={Math.max(4, groupWidth - 4)}
                        height={plotH}
                        rx="6"
                        className="fill-sky-500/8 dark:fill-white/5"
                      />
                    )}

                    {metricSeries.map((mKey, sIdx) => {
                      const val = Math.max(0, d.values[mKey] ?? 0);
                      const seriesDenom =
                        metricSeries.length > 1
                          ? Math.max(kpiStats.seriesMax[mKey] || 1, 1)
                          : rawGlobalMax;
                      const barH = Math.max(3, (val / seriesDenom) * plotH);
                      const x = startX + sIdx * (singleBarW + 3);
                      const y = padTop + plotH - barH;
                      const colorIdx = sIdx % PALETTE.length;

                      return (
                        <g key={mKey}>
                          <rect
                            x={x}
                            y={y}
                            width={singleBarW}
                            height={barH}
                            rx="4"
                            fill={`url(#bar-grad-${colorIdx})`}
                            stroke={PALETTE[colorIdx].stroke}
                            strokeWidth={isHovered ? 1.5 : 0.5}
                            className="transition-all duration-150"
                          />
                          {(showValues || isHovered) && (
                            <text
                              x={x + singleBarW / 2}
                              y={y - 5}
                              textAnchor="middle"
                              className={`font-mono text-[10px] ${
                                isHovered
                                  ? 'fill-slate-900 dark:fill-white font-bold'
                                  : 'fill-slate-600 dark:fill-slate-300'
                              }`}
                            >
                              {formatCompactNumber(d.values[mKey] ?? 0)}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* X-Axis Label */}
                    <text
                      x={groupX + groupWidth / 2}
                      y={padTop + plotH + 18}
                      textAnchor="middle"
                      className={`font-mono text-[10px] ${
                        isHovered
                          ? 'fill-sky-600 dark:fill-sky-400 font-bold'
                          : 'fill-slate-500 dark:fill-slate-400'
                      }`}
                    >
                      {formatShortLabel(d.label, chartData.length > 12 ? 12 : 20)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {chartType === 'area' && (
          <div className="w-full h-full flex flex-col justify-center overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-full min-h-[210px] max-h-[360px] overflow-visible"
            >
              <defs>
                {PALETTE.map((p, i) => (
                  <linearGradient key={i} id={`area-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={p.stroke} stopOpacity="0.45" />
                    <stop offset="100%" stopColor={p.stroke} stopOpacity="0.02" />
                  </linearGradient>
                ))}
              </defs>

              {/* Grid lines */}
              {yTicks.map((tick, idx) => {
                const y = padTop + plotH - (tick / rawGlobalMax) * plotH;
                return (
                  <g key={idx}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={svgWidth - padRight}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-white/8"
                      strokeDasharray={idx === 0 ? undefined : '4 4'}
                    />
                    <text
                      x={padLeft - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 dark:fill-slate-500 font-mono text-[10px]"
                    >
                      {formatCompactNumber(tick)}
                    </text>
                  </g>
                );
              })}

              {/* Area + Line per metric series */}
              {metricSeries.map((mKey, sIdx) => {
                const color = PALETTE[sIdx % PALETTE.length];
                const seriesDenom =
                  metricSeries.length > 1
                    ? Math.max(kpiStats.seriesMax[mKey] || 1, 1)
                    : rawGlobalMax;
                const pts = chartData.map((d, idx) => {
                  const x =
                    chartData.length === 1
                      ? padLeft + plotW / 2
                      : padLeft + (idx / (chartData.length - 1)) * plotW;
                  const val = Math.max(0, d.values[mKey] ?? 0);
                  const y = padTop + plotH - (val / seriesDenom) * plotH;
                  return { x, y, val, label: d.label };
                });

                if (pts.length === 0) return null;
                const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${padTop + plotH} L ${pts[0].x} ${padTop + plotH} Z`;

                return (
                  <g key={mKey}>
                    <path d={areaPath} fill={`url(#area-grad-${sIdx % PALETTE.length})`} />
                    <path
                      d={linePath}
                      fill="none"
                      stroke={color.stroke}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {pts.map((p, idx) => {
                      const isHovered = hoveredIdx === idx;
                      return (
                        <g
                          key={idx}
                          onMouseEnter={() => setHoveredIdx(idx)}
                          onMouseLeave={() => setHoveredIdx(null)}
                          className="cursor-pointer"
                        >
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={isHovered ? 6 : 4}
                            fill={color.stroke}
                            stroke="#0f172a"
                            strokeWidth="2"
                          />
                          {(showValues || isHovered) && (
                            <text
                              x={p.x}
                              y={p.y - 9}
                              textAnchor="middle"
                              className="fill-slate-700 dark:fill-slate-200 font-mono text-[10px] font-semibold"
                            >
                              {formatCompactNumber(p.val)}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* X-Axis Labels */}
              {chartData.map((d, idx) => {
                const x =
                  chartData.length === 1
                    ? padLeft + plotW / 2
                    : padLeft + (idx / (chartData.length - 1)) * plotW;
                return (
                  <text
                    key={d.id}
                    x={x}
                    y={padTop + plotH + 18}
                    textAnchor="middle"
                    className="fill-slate-500 dark:fill-slate-400 font-mono text-[10px]"
                  >
                    {formatShortLabel(d.label, chartData.length > 10 ? 12 : 20)}
                  </text>
                );
              })}
            </svg>
          </div>
        )}

        {chartType === 'horizontal' && (
          <div className="w-full space-y-2 overflow-y-auto pr-1">
            {chartData.map((d, idx) => {
              const pctOfMax = kpiStats.max > 0 ? Math.max(2, (d.primaryValue / kpiStats.max) * 100) : 0;
              const pctOfSum = kpiStats.sum > 0 ? ((d.primaryValue / kpiStats.sum) * 100).toFixed(1) : '0.0';

              return (
                <div
                  key={d.id}
                  className="p-2.5 rounded-lg bg-white dark:bg-[#191b20] border border-slate-200/80 dark:border-white/5 hover:border-sky-500/40 transition"
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span
                        className={`w-5 h-5 rounded text-[10px] font-mono font-bold flex items-center justify-center shrink-0 ${
                          idx === 0
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : idx === 1
                            ? 'bg-slate-400/20 text-slate-300 border border-slate-400/40'
                            : idx === 2
                            ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {d.rawLabel}
                      </span>
                    </div>
                    <div className="flex items-center space-x-3 font-mono text-xs shrink-0">
                      {metricSeries.map((mKey, sIdx) => (
                        <span
                          key={mKey}
                          className="font-semibold"
                          style={{ color: PALETTE[sIdx % PALETTE.length].stroke }}
                        >
                          {mKey}: {formatCompactNumber(d.values[mKey] ?? 0)}
                        </span>
                      ))}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400">
                        {pctOfSum}% of total
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-[#111215] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300"
                      style={{ width: `${pctOfMax}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {chartType === 'donut' && (
          <div className="w-full h-full flex flex-col md:flex-row items-center justify-center gap-8 py-2">
            {/* SVG Donut */}
            <div className="relative w-48 h-48 shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                {(() => {
                  const total = Math.max(kpiStats.sum, 1);
                  const radius = 44;
                  const circumference = 2 * Math.PI * radius;
                  let accum = 0;

                  return chartData.slice(0, 8).map((d, idx) => {
                    const val = Math.max(0, d.primaryValue);
                    const frac = val / total;
                    const dash = frac * circumference;
                    const offset = -accum * circumference;
                    accum += frac;
                    const color = PALETTE[idx % PALETTE.length];

                    return (
                      <circle
                        key={d.id}
                        cx="60"
                        cy="60"
                        r={radius}
                        fill="transparent"
                        stroke={color.stroke}
                        strokeWidth={hoveredIdx === idx ? 16 : 13}
                        strokeDasharray={`${dash} ${circumference}`}
                        strokeDashoffset={offset}
                        onMouseEnter={() => setHoveredIdx(idx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        className="transition-all duration-150 cursor-pointer"
                      />
                    );
                  });
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
                <span className="text-[10px] font-mono uppercase text-slate-400 truncate max-w-full">
                  {hoveredIdx !== null && chartData[hoveredIdx]
                    ? chartData[hoveredIdx].label
                    : `Total ${primaryMetric}`}
                </span>
                <span className="text-base font-bold font-mono text-slate-900 dark:text-white">
                  {hoveredIdx !== null && chartData[hoveredIdx]
                    ? formatCompactNumber(chartData[hoveredIdx].primaryValue)
                    : formatCompactNumber(kpiStats.sum)}
                </span>
              </div>
            </div>

            {/* Breakdown Legend */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full">
              {chartData.slice(0, 8).map((d, idx) => {
                const color = PALETTE[idx % PALETTE.length];
                const pct =
                  kpiStats.sum > 0 ? ((d.primaryValue / kpiStats.sum) * 100).toFixed(1) : '0.0';
                return (
                  <div
                    key={d.id}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className={`px-3 py-2 rounded-lg border flex items-center justify-between text-xs cursor-pointer transition ${
                      hoveredIdx === idx
                        ? 'bg-sky-500/10 border-sky-500/40'
                        : 'bg-white dark:bg-[#191b20] border-slate-200/80 dark:border-white/5'
                    }`}
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color.stroke }}
                      />
                      <span className="font-mono truncate text-slate-700 dark:text-slate-200">
                        {d.label}
                      </span>
                    </div>
                    <div className="font-mono flex items-center space-x-2 shrink-0 ml-2">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {formatCompactNumber(d.primaryValue)}
                      </span>
                      <span className="text-[10px] text-slate-400">({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
