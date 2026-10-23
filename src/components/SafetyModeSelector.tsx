import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../stores/useAppStore';
import { SafetyMode } from '../types';
import { Unlock, Check } from 'lucide-react';

export const SafetyModeSelector: React.FC = () => {
  const { activeConnection, setConnectionSafeMode } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const currentMode: SafetyMode =
    activeConnection?.safeMode || (activeConnection?.env === 'prod' ? 'alert-2' : 'silent');

  const updatePosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const left = Math.max(10, Math.min(rect.left, window.innerWidth - 650));
      setMenuPos({
        top: rect.bottom + 6,
        left,
      });
    }
  };

  const toggleDropdown = () => {
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen((prev) => !prev);
  };

  // Close on outside click, window resize, scroll, or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleWindowEvents = () => {
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleWindowEvents);
    window.addEventListener('scroll', handleWindowEvents, true);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleWindowEvents);
      window.removeEventListener('scroll', handleWindowEvents, true);
    };
  }, [isOpen]);

  const handleSelect = (mode: SafetyMode) => {
    if (activeConnection?.id) {
      setConnectionSafeMode(activeConnection.id, mode);
    }
    setIsOpen(false);
  };

  const renderIconForMode = (mode: SafetyMode) => {
    switch (mode) {
      case 'silent':
        return <Unlock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200" />;
      case 'alert-1':
        return <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0 inline-block shadow-xs" />;
      case 'alert-2':
        return <span className="w-2.5 h-2.5 rounded-full border-2 border-amber-400 shrink-0 inline-block" />;
      case 'safe-1':
        return <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0 inline-block shadow-xs" />;
      case 'safe-2':
        return <span className="w-2.5 h-2.5 rounded-full border-2 border-rose-500 shrink-0 inline-block" />;
      default:
        return <Unlock className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="relative inline-flex items-center">
      {/* TablePlus Iconic Capsule Lock Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleDropdown}
        className={`no-drag h-7 px-2.5 flex items-center justify-center space-x-1.5 rounded-lg border transition-all cursor-pointer shadow-xs active:scale-95 group leading-none ${
          isOpen
            ? 'bg-slate-200 dark:bg-slate-800 border-slate-400 dark:border-slate-600'
            : currentMode === 'silent'
            ? 'bg-white dark:bg-slate-900/90 hover:bg-slate-200 dark:hover:bg-slate-800 border-slate-300 dark:border-slate-700/80 text-slate-600 dark:text-slate-300'
            : currentMode.startsWith('alert')
            ? 'bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border-amber-300 dark:border-amber-700/80 text-amber-600 dark:text-amber-300'
            : 'bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border-rose-300 dark:border-rose-700/80 text-rose-600 dark:text-rose-300'
        }`}
        title={`Safety Mode: ${currentMode} (Click to change)`}
      >
        {renderIconForMode(currentMode)}
      </button>

      {/* TablePlus Pixel-Perfect Safety Level Dropdown Menu (Rendered via Portal to avoid overflow clipping) */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              top: `${menuPos.top}px`,
              left: `${menuPos.left}px`,
            }}
            className="fixed z-[9999] w-max min-w-[630px] bg-[#222326]/98 dark:bg-[#1a1b1e]/98 text-slate-200 border border-white/10 rounded-xl shadow-2xl p-1.5 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-100 font-sans text-[12px] leading-snug select-none"
          >
            {/* Silent Mode */}
            <button
              type="button"
              onClick={() => handleSelect('silent')}
              className="w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md hover:bg-white/10 dark:hover:bg-white/10 text-left cursor-pointer transition-colors group"
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                {currentMode === 'silent' && <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />}
              </span>
              <Unlock className="w-3.5 h-3.5 text-slate-400 group-hover:text-white shrink-0" />
              <span className="text-slate-200 group-hover:text-white font-medium whitespace-nowrap">
                Silent Mode - Send queries to the server without any warnings
              </span>
            </button>

            {/* Alert Mode 1 */}
            <button
              type="button"
              onClick={() => handleSelect('alert-1')}
              className="w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md hover:bg-white/10 dark:hover:bg-white/10 text-left cursor-pointer transition-colors group"
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                {currentMode === 'alert-1' && <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />}
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0 inline-block mx-0.5" />
              <span className="text-slate-200 group-hover:text-white font-medium whitespace-nowrap">
                Alert Mode 1 - Warn before sending queries to the server
              </span>
            </button>

            {/* Alert Mode 2 */}
            <button
              type="button"
              onClick={() => handleSelect('alert-2')}
              className="w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md hover:bg-white/10 dark:hover:bg-white/10 text-left cursor-pointer transition-colors group"
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                {currentMode === 'alert-2' && <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />}
              </span>
              <span className="w-2.5 h-2.5 rounded-full border-2 border-amber-400 shrink-0 inline-block mx-0.5" />
              <span className="text-slate-200 group-hover:text-white font-medium whitespace-nowrap">
                Alert Mode 2 - Warn before sending queries to the server except SELECT/EXPLAIN/SHOW queries
              </span>
            </button>

            {/* Subtle Divider */}
            <div className="my-1 border-t border-white/10" />

            {/* Safe Mode 1 */}
            <button
              type="button"
              onClick={() => handleSelect('safe-1')}
              className="w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md hover:bg-white/10 dark:hover:bg-white/10 text-left cursor-pointer transition-colors group"
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                {currentMode === 'safe-1' && <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />}
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0 inline-block mx-0.5" />
              <span className="text-slate-200 group-hover:text-white font-medium whitespace-nowrap">
                Safe Mode 1 - Prompt for password before sending queries to the server
              </span>
            </button>

            {/* Safe Mode 2 */}
            <button
              type="button"
              onClick={() => handleSelect('safe-2')}
              className="w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md hover:bg-white/10 dark:hover:bg-white/10 text-left cursor-pointer transition-colors group"
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                {currentMode === 'safe-2' && <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />}
              </span>
              <span className="w-2.5 h-2.5 rounded-full border-2 border-rose-500 shrink-0 inline-block mx-0.5" />
              <span className="text-slate-200 group-hover:text-white font-medium whitespace-nowrap">
                Safe Mode 2 - Prompt for password before sending queries to the server except SELECT/EXPLAIN/SHOW queries
              </span>
            </button>
          </div>,
          document.body
        )}
    </div>
  );
};
