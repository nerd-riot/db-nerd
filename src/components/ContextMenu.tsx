import React, { useEffect, useRef, createContext, useContext } from 'react';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

const ContextMenuCloseContext = createContext<(() => void) | null>(null);

interface ContextMenuContainerProps {
  position: ContextMenuPosition | null;
  onClose: () => void;
  width?: number;
  className?: string;
  children: React.ReactNode;
}

export const ContextMenuContainer: React.FC<ContextMenuContainerProps> = ({
  position,
  onClose,
  width = 220,
  className = '',
  children,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('contextmenu', handleOutsideClick, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('contextmenu', handleOutsideClick, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!position) return null;

  // Clamping so menu never overflows screen boundaries
  const menuWidth = width;
  const menuEstimatedHeight = 280;
  const screenW = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const screenH = typeof window !== 'undefined' ? window.innerHeight : 800;

  let left = position.x;
  let top = position.y;

  if (left + menuWidth > screenW - 10) {
    left = Math.max(10, screenW - menuWidth - 10);
  }
  if (top + menuEstimatedHeight > screenH - 10) {
    top = Math.max(10, screenH - menuEstimatedHeight - 10);
  }

  return (
    <ContextMenuCloseContext.Provider value={onClose}>
      <div
        ref={menuRef}
        data-context-menu="true"
        style={{ left: `${left}px`, top: `${top}px`, width: `${menuWidth}px` }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className={`fixed z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-300 dark:border-slate-700/80 rounded-xl shadow-2xl p-1 text-xs select-none ring-1 ring-slate-900/5 dark:ring-white/10 animate-in fade-in zoom-in-95 duration-100 font-sans ${className}`}
      >
        {children}
      </div>
    </ContextMenuCloseContext.Provider>
  );
};

export const ContextMenuItem: React.FC<{
  icon?: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  keepOpen?: boolean;
}> = ({ icon, label, shortcut, onClick, danger, disabled, keepOpen = false }) => {
  const closeMenu = useContext(ContextMenuCloseContext);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) {
          onClick();
          if (!keepOpen) {
            closeMenu?.();
          }
        }
      }}
      className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors text-left font-medium ${
        disabled
          ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-slate-500'
          : danger
          ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/20 hover:text-rose-700 dark:hover:text-rose-200 cursor-pointer'
          : 'text-slate-800 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-sky-500/15 hover:text-sky-700 dark:hover:text-sky-300 cursor-pointer'
      }`}
    >
      <div className="flex items-center space-x-2 truncate">
        {icon && <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      {shortcut && (
        <span className="text-[10px] text-slate-500 font-mono ml-2 flex-shrink-0">{shortcut}</span>
      )}
    </button>
  );
};

export const ContextMenuDivider = () => <div className="h-[1px] bg-slate-200 dark:bg-slate-800 my-1 mx-1" />;

export const ContextMenuHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase truncate">
    {title}
  </div>
);
