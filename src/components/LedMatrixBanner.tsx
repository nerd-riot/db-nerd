import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { ShieldCheck } from 'lucide-react';
import { BorderChase } from './BorderChase';

interface LedMatrixBannerProps {
  onOpenDatabaseModal: () => void;
}

export const LedMatrixBanner: React.FC<LedMatrixBannerProps> = ({ onOpenDatabaseModal }) => {
  const {
    activeConnection,
    openSessionIds,
    setConnectionModalOpen,
    selectedTable,
    isConnecting,
    connectingConnId,
    connections,
    isReconnecting,
    reconnectActiveConnection,
    networkSpeed,
    resolvedTheme,
    sqlTabStates,
    activeTabId,
    tabs,
  } = useAppStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [speedDisplay, setSpeedDisplay] = useState(networkSpeed || '355 KB/s');
  const [showTooltip, setShowTooltip] = useState(false);

  const currentTabState = sqlTabStates[activeTabId];
  const executionProgress = currentTabState?.executionProgress;

  const connectingTargetConn = connections.find((c) => c.id === connectingConnId);

  const env = activeConnection.env; // 'prod' | 'staging' | 'dev'

  const engineLabel =
    activeConnection.engine === 'postgres'
      ? 'PostgreSQL 17.7'
      : activeConnection.engine === 'mysql'
      ? 'MySQL 8.0.36'
      : activeConnection.engine === 'snowflake'
      ? 'Snowflake 8.2'
      : 'Redis 7.2';

  const envTag = env === 'prod' ? 'PROD' : env === 'staging' ? 'STAGING' : 'LOCAL';

  // Fluctuate speed slightly to mimic live network stream like TablePlus
  useEffect(() => {
    const interval = setInterval(() => {
      if (isConnecting) {
        const speeds = ['142 KB/s', '428 KB/s', '890 KB/s', '1.4 MB/s', '620 KB/s'];
        setSpeedDisplay(speeds[Math.floor(Math.random() * speeds.length)]);
      } else {
        const base = env === 'prod' ? 355 : env === 'staging' ? 240 : 180;
        const jitter = Math.floor(Math.random() * 40) - 20;
        setSpeedDisplay(`${base + jitter} KB/s`);
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [isConnecting, env]);

  // High-performance Canvas LED Matrix renderer (recreates TablePlus exact visual)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let t = 0;

    // Fixed dot spacing
    const dotSpacing = 3.5;
    const dotRadius = 1.1;

    const render = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 2;

      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cols = Math.floor(width / dotSpacing);
      const rows = Math.floor(height / dotSpacing);

      // Speed of the scan wave
      const waveSpeed = isConnecting ? 0.08 : 0.02;
      t += waveSpeed;

      // Color paletting matching TablePlus screenshot
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * dotSpacing + dotSpacing / 2;
          const y = r * dotSpacing + dotSpacing / 2;

          // Wave equation across the matrix
          const wavePhase = (c / cols) * 4 - t;
          const waveIntensity = Math.sin(wavePhase);
          const noise = Math.sin(c * 12.9898 + r * 78.233 + t * 0.5) * 43758.5453;
          const randomVal = noise - Math.floor(noise);

          let rCol = 0;
          let gCol = 0;
          let bCol = 0;
          let alpha = 0.3;

          if (env === 'prod') {
            // Ruby red matrix with occasional amber/green sparkles (TablePlus exact look)
            if (randomVal > 0.94) {
              // Green sparkle
              rCol = 34;
              gCol = 197;
              bCol = 94;
              alpha = 0.75;
            } else if (randomVal > 0.86) {
              // Amber/orange sparkle
              rCol = 245;
              gCol = 158;
              bCol = 11;
              alpha = 0.8;
            } else {
              // Deep crimson to neon red
              const isBright = waveIntensity > 0.3 || randomVal > 0.6;
              rCol = isBright ? 239 : 140;
              gCol = isBright ? 68 : 20;
              bCol = isBright ? 68 : 20;
              alpha = isBright ? 0.75 + waveIntensity * 0.25 : 0.25;
            }
          } else if (env === 'staging') {
            // Cyber Amber / Gold Matrix
            if (randomVal > 0.92) {
              rCol = 56;
              gCol = 189;
              bCol = 248;
              alpha = 0.8;
            } else {
              const isBright = waveIntensity > 0.3 || randomVal > 0.55;
              rCol = isBright ? 245 : 180;
              gCol = isBright ? 158 : 90;
              bCol = isBright ? 11 : 10;
              alpha = isBright ? 0.8 + waveIntensity * 0.2 : 0.3;
            }
          } else {
            // Emerald Matrix / Digital Phosphor
            if (randomVal > 0.92) {
              rCol = 56;
              gCol = 189;
              bCol = 248;
              alpha = 0.8;
            } else {
              const isBright = waveIntensity > 0.3 || randomVal > 0.55;
              rCol = isBright ? 16 : 4;
              gCol = isBright ? 185 : 110;
              bCol = isBright ? 129 : 60;
              alpha = isBright ? 0.8 + waveIntensity * 0.2 : 0.3;
            }
          }

          if (isConnecting) {
            // Electric pulse effect during connection
            const pulse = (Math.sin(t * 3 + c * 0.1) + 1) / 2;
            alpha = Math.min(1, alpha + pulse * 0.4);
          }

          const isLight = resolvedTheme === 'light';
          const finalAlpha = isLight
            ? Math.max(0.08, Math.min(0.22, alpha * 0.3))
            : Math.max(0.15, Math.min(1, alpha));

          ctx.fillStyle = `rgba(${rCol}, ${gCol}, ${bCol}, ${finalAlpha})`;
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [env, isConnecting, resolvedTheme]);

  const isFailed = activeConnection.connectionStatus === 'failed';

  const hasNoSessions = openSessionIds.length === 0;

  const handleClick = () => {
    if (hasNoSessions) {
      setConnectionModalOpen(true);
      return;
    }
    if (isFailed) {
      reconnectActiveConnection();
    } else {
      onOpenDatabaseModal();
    }
  };

  const activeTabTitle = tabs.find((t) => t.id === activeTabId)?.title;

  return (
    <div className="flex items-center justify-center pointer-events-auto min-w-0 max-w-full select-none">
      {/* TablePlus Iconic LED Dot-Matrix Capsule */}
      <button
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`no-drag relative h-7 px-2.5 sm:px-3.5 rounded-full text-xs font-mono font-semibold transition-all active:scale-[0.98] flex items-center justify-between overflow-hidden cursor-pointer border min-w-0 max-w-full w-auto group shadow-2xs dark:shadow-md ${
          isConnecting
            ? 'bg-sky-950/70 border-sky-400 text-sky-100 shadow-md ring-1 ring-sky-400/40'
            : isFailed
            ? 'bg-[#c53030] dark:bg-[#c53030] border-red-400 text-white hover:bg-[#b02b2b]'
            : env === 'prod'
            ? 'bg-[#c53030] dark:bg-[#c53030] border-red-500/80 text-white hover:bg-[#b02b2b] shadow-sm'
            : env === 'staging'
            ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-500/60 hover:border-amber-300 dark:hover:border-amber-400'
            : 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/60 hover:border-emerald-300 dark:hover:border-emerald-400'
        }`}
      >
        {/* Apple-grade Border Chase Highlight Runner */}
        {isConnecting && (
          <BorderChase color="sky" dual={true} speed="fast" borderWidth={1.5} glow={true} />
        )}

        {/* HTML5 Canvas LED Dot Matrix Layer */}
        {!isFailed && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none opacity-80"
          />
        )}

        {/* Ambient Gradient Overlay for text legibility */}
        {!isFailed && (
          <div
            className={`absolute inset-0 pointer-events-none ${
              env === 'prod'
                ? 'bg-gradient-to-r from-red-700/80 via-red-600/40 to-red-700/80 dark:from-[#b91c1c]/80 dark:via-[#991b1b]/50 dark:to-[#b91c1c]/80'
                : env === 'staging'
                ? 'bg-gradient-to-r from-amber-50/90 via-amber-100/40 to-amber-50/90 dark:from-amber-950/80 dark:via-yellow-950/40 dark:to-amber-950/80'
                : 'bg-gradient-to-r from-emerald-50/90 via-emerald-100/40 to-emerald-50/90 dark:from-emerald-950/80 dark:via-teal-950/40 dark:to-emerald-950/80'
            }`}
          />
        )}

        {/* Connecting High-Energy Scan Beam */}
        {isConnecting && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="w-1/3 h-full bg-gradient-to-r from-transparent via-white/50 to-transparent blur-sm animate-[led-sweep_0.8s_linear_infinite]" />
          </div>
        )}

        {/* Monospace High-Contrast Foreground Content */}
        {isFailed ? (
          <div className="relative z-10 flex items-center justify-between w-full space-x-2 sm:space-x-3 text-white leading-none font-mono text-[11px] min-w-0">
            <div className="flex items-center space-x-1.5 truncate min-w-0 flex-1">
              <span className="font-extrabold tracking-wider shrink-0">{envTag}</span>
              <span className="opacity-60 shrink-0">|</span>
              <span className="truncate">
                <span className="hidden sm:inline">Database '{activeConnection.database || activeConnection.name}' is disconnected! </span>
                <span className="sm:hidden">Offline! </span>
                <span className="underline underline-offset-2 opacity-95">
                  {isReconnecting ? 'Reconnecting...' : 'Tap to reconnect'}
                </span>
              </span>
            </div>
            <span className="text-[10px] bg-black/30 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">
              {isReconnecting ? 'Reconnecting' : 'Offline'}
            </span>
          </div>
        ) : executionProgress ? (
          <div className="relative z-10 flex items-center justify-between w-full space-x-2 sm:space-x-3 text-white leading-none font-mono text-[11px] min-w-0">
            <div className="flex items-center space-x-1.5 truncate min-w-0 flex-1">
              <span className="font-extrabold tracking-wider text-amber-300 dark:text-amber-400 shrink-0">{envTag}</span>
              <span className="opacity-40 shrink-0">|</span>
              <span className="font-bold text-white tracking-wide truncate">
                <span className="hidden sm:inline">Statements: </span>
                <span className="sm:hidden">Stmt: </span>
                {executionProgress.current}/{executionProgress.total}
              </span>
            </div>
            <div className="flex items-center space-x-1.5 shrink-0 pl-1.5 sm:pl-2">
              <span className="text-[10px] font-mono font-bold text-white/90 bg-black/40 px-1.5 py-0.5 rounded leading-none border border-white/10 shadow-2xs">
                {speedDisplay}
              </span>
            </div>
          </div>
        ) : (
          <div className={`relative z-10 flex items-center justify-between w-full space-x-2 sm:space-x-3 leading-none min-w-0 ${
            env === 'prod' ? 'text-white [text-shadow:_0_1px_2px_rgba(0,0,0,0.6)]' : 'text-slate-800 dark:text-white dark:[text-shadow:_0_1px_3px_rgba(0,0,0,0.9)]'
          }`}>
            {/* TablePlus Standard Formatted Connection Banner */}
            <div className="flex items-center space-x-1 sm:space-x-1.5 truncate text-[11px] min-w-0 flex-1">
              {hasNoSessions ? (
                isConnecting ? (
                  <>
                    <span className="font-extrabold tracking-wider shrink-0 text-sky-400 animate-pulse">CONNECTING</span>
                    <span className="opacity-40 shrink-0">|</span>
                    <span className="truncate font-bold text-sky-300">
                      Connecting to &quot;{connectingTargetConn?.name || 'database'}&quot;...
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-extrabold tracking-wider shrink-0 text-slate-400 dark:text-slate-500">STANDBY</span>
                    <span className="opacity-40 shrink-0">|</span>
                    <span className="truncate font-bold text-slate-600 dark:text-slate-300">
                      No Active Connection • Tap to open (⌘K)
                    </span>
                  </>
                )
              ) : isConnecting ? (
                <>
                  <span className="font-extrabold tracking-wider shrink-0 text-sky-400 animate-pulse">CONNECTING</span>
                  <span className="opacity-40 shrink-0">|</span>
                  <span className="truncate font-bold text-sky-200">
                    Connecting to &quot;{connectingTargetConn?.name || activeConnection.name}&quot;...
                  </span>
                </>
              ) : (
                <>
                  {/* Env Tag: Always visible */}
                  <span className={`font-extrabold tracking-wider shrink-0 ${env === 'prod' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{envTag}</span>
                  <span className="opacity-40 shrink-0">|</span>

                  {/* Engine: on 2xl+ */}
                  <span className="hidden 2xl:inline shrink-0">{engineLabel}</span>
                  <span className="opacity-40 hidden 2xl:inline shrink-0">:</span>

                  {/* TLSv1.3: only on 2xl */}
                  <span className="hidden 2xl:inline shrink-0">TLSv1.3</span>
                  <span className="opacity-40 hidden 2xl:inline shrink-0">:</span>

                  {/* SSH tag if enabled */}
                  {activeConnection.useSsh && (
                    <>
                      <span className="shrink-0 font-bold hidden lg:inline">SSH</span>
                      <span className="opacity-40 hidden lg:inline shrink-0">:</span>
                    </>
                  )}

                  {/* Connection name */}
                  <span className={`truncate max-w-[70px] sm:max-w-[95px] xl:max-w-[130px] font-bold shrink-0 ${env === 'prod' ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>
                    {activeConnection.name}
                  </span>

                  {/* Database name on sm+ */}
                  <span className="opacity-40 shrink-0 hidden sm:inline">:</span>
                  <span className={`underline underline-offset-2 truncate max-w-[60px] sm:max-w-[85px] xl:max-w-[110px] hidden sm:inline ${
                    env === 'prod' ? 'decoration-white/60 text-white' : 'decoration-slate-400/50 dark:decoration-white/50'
                  }`}>
                    {activeConnection.database || 'postgres'}
                  </span>

                  {/* Tab/Table title on 2xl+ */}
                  <span className="opacity-40 shrink-0 hidden 2xl:inline">:</span>
                  <span className={`truncate max-w-[80px] xl:max-w-[120px] hidden 2xl:inline ${
                    env === 'prod' ? 'text-rose-100 font-medium' : 'text-slate-600 dark:text-slate-300'
                  }`}>
                    {activeTabTitle || `public.${selectedTable}`}
                  </span>
                </>
              )}
            </div>

            {/* Right Speed Meter */}
            <div className="hidden lg:flex items-center space-x-1.5 shrink-0 pl-1.5 sm:pl-2">
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded leading-none shadow-2xs border ${
                env === 'prod'
                  ? 'text-white bg-black/30 border-white/20'
                  : 'text-slate-700 dark:text-white/90 bg-white/80 dark:bg-black/35 border-slate-200 dark:border-white/10'
              }`}>
                {hasNoSessions ? '0 KB/s' : speedDisplay}
              </span>
            </div>
          </div>
        )}
      </button>

      {/* Hover Telemetry Quick Popover */}
      {showTooltip && (
        <div className="absolute top-9 left-1/2 -translate-x-1/2 w-64 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700/90 rounded-xl shadow-2xl p-3 z-50 text-[11px] font-mono text-slate-700 dark:text-slate-300 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800 mb-2">
            <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Connection Health</span>
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold">
              ONLINE
            </span>
          </div>
          <div className="space-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Latency:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">0.8ms (Direct Socket)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Cipher:</span>
              <span className="text-slate-700 dark:text-slate-300">TLS_AES_256_GCM</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Buffer Hit Ratio:</span>
              <span className="text-sky-600 dark:text-sky-400 font-bold">99.8%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Throughput:</span>
              <span className="text-amber-600 dark:text-amber-300 font-bold">{speedDisplay}</span>
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>{isFailed ? 'Tap to reconnect' : 'Click to switch database / schema'}</span>
            <kbd className="font-mono bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 rounded text-[9px] text-slate-700 dark:text-slate-300 shadow-2xs font-semibold">
              {isFailed ? '⌘⇧R' : '⌘O'}
            </kbd>
          </div>
        </div>
      )}
    </div>
  );
};
