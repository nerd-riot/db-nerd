import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';
export type TooltipAlign = 'start' | 'center' | 'end';

export interface TooltipProps {
  content: React.ReactNode;
  shortcut?: string;
  description?: string;
  side?: TooltipSide;
  align?: TooltipAlign;
  delay?: number;
  offset?: number;
  disabled?: boolean;
  hideOnClick?: boolean;
  className?: string;
  children: React.ReactElement;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  shortcut,
  description,
  side = 'top',
  align = 'center',
  delay = 120,
  offset = 6,
  disabled = false,
  hideOnClick = true,
  className = '',
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; actualSide: TooltipSide }>({
    top: 0,
    left: 0,
    actualSide: side,
  });

  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;

    // Use measured dimensions or fallback estimates before layout
    const tooltipWidth = tooltipEl ? tooltipEl.offsetWidth : 160;
    const tooltipHeight = tooltipEl ? tooltipEl.offsetHeight : 32;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;

    let targetSide = side;

    // Auto flip if overflowing screen edge
    if (targetSide === 'top' && triggerRect.top - tooltipHeight - offset < padding) {
      targetSide = 'bottom';
    } else if (targetSide === 'bottom' && triggerRect.bottom + tooltipHeight + offset > viewportHeight - padding) {
      targetSide = 'top';
    } else if (targetSide === 'left' && triggerRect.left - tooltipWidth - offset < padding) {
      targetSide = 'right';
    } else if (targetSide === 'right' && triggerRect.right + tooltipWidth + offset > viewportWidth - padding) {
      targetSide = 'left';
    }

    let top = 0;
    let left = 0;

    if (targetSide === 'top') {
      top = triggerRect.top - tooltipHeight - offset;
      if (align === 'start') {
        left = triggerRect.left;
      } else if (align === 'end') {
        left = triggerRect.right - tooltipWidth;
      } else {
        left = triggerRect.left + (triggerRect.width / 2) - (tooltipWidth / 2);
      }
    } else if (targetSide === 'bottom') {
      top = triggerRect.bottom + offset;
      if (align === 'start') {
        left = triggerRect.left;
      } else if (align === 'end') {
        left = triggerRect.right - tooltipWidth;
      } else {
        left = triggerRect.left + (triggerRect.width / 2) - (tooltipWidth / 2);
      }
    } else if (targetSide === 'left') {
      left = triggerRect.left - tooltipWidth - offset;
      if (align === 'start') {
        top = triggerRect.top;
      } else if (align === 'end') {
        top = triggerRect.bottom - tooltipHeight;
      } else {
        top = triggerRect.top + (triggerRect.height / 2) - (tooltipHeight / 2);
      }
    } else if (targetSide === 'right') {
      left = triggerRect.right + offset;
      if (align === 'start') {
        top = triggerRect.top;
      } else if (align === 'end') {
        top = triggerRect.bottom - tooltipHeight;
      } else {
        top = triggerRect.top + (triggerRect.height / 2) - (tooltipHeight / 2);
      }
    }

    // Horizontal clamping within viewport
    if (left + tooltipWidth > viewportWidth - padding) {
      left = viewportWidth - tooltipWidth - padding;
    }
    if (left < padding) {
      left = padding;
    }

    // Vertical clamping within viewport
    if (top + tooltipHeight > viewportHeight - padding) {
      top = viewportHeight - tooltipHeight - padding;
    }
    if (top < padding) {
      top = padding;
    }

    setCoords({ top, left, actualSide: targetSide });
  }, [side, align, offset]);

  const handleMouseEnter = useCallback(() => {
    if (disabled || !content) return;
    clearTimers();

    showTimerRef.current = setTimeout(() => {
      calculatePosition();
      setIsOpen(true);
      // Trigger smooth opacity & scale transition on next frame
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    }, delay);
  }, [disabled, content, clearTimers, delay, calculatePosition]);

  const handleMouseLeave = useCallback(() => {
    clearTimers();
    setIsVisible(false);
    hideTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  }, [clearTimers]);

  const handleImmediateClose = useCallback(() => {
    clearTimers();
    setIsVisible(false);
    setIsOpen(false);
  }, [clearTimers]);

  // Recalculate position when tooltip mounts or contents resize
  useEffect(() => {
    if (isOpen) {
      calculatePosition();
      const handleResize = () => calculatePosition();
      const handleScroll = () => handleImmediateClose();
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);
      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [isOpen, calculatePosition, handleImmediateClose]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  // If content is empty or disabled, just return the child without wrapping behavior
  if (disabled || !content) {
    return children;
  }

  // Clone child to intercept mouse events without requiring an extra DOM wrapper
  const child = children as React.ReactElement<any>;
  const triggerProps: Record<string, any> = {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const existingRef = (child as any).ref;
      if (typeof existingRef === 'function') {
        existingRef(node);
      } else if (existingRef && typeof existingRef === 'object') {
        existingRef.current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      child.props.onMouseEnter?.(e);
      handleMouseEnter();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      child.props.onMouseLeave?.(e);
      handleMouseLeave();
    },
    onMouseDown: (e: React.MouseEvent) => {
      child.props.onMouseDown?.(e);
      if (hideOnClick) {
        handleImmediateClose();
      }
    },
    onClick: (e: React.MouseEvent) => {
      child.props.onClick?.(e);
      if (hideOnClick) {
        handleImmediateClose();
      }
    },
  };

  const clonedChild = React.cloneElement(child, triggerProps);

  return (
    <>
      {clonedChild}
      {isOpen &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
            }}
            className={`fixed z-[99999] pointer-events-none select-none transition-all duration-150 ease-out ${
              isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
            } ${className}`}
          >
            <div className="bg-slate-900/95 dark:bg-slate-950/95 text-slate-100 border border-slate-700/80 shadow-2xl backdrop-blur-md rounded-lg px-2.5 py-1.5 text-xs font-sans flex items-center gap-2 max-w-sm">
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 font-medium text-slate-100">
                    {content}
                  </div>
                  {shortcut && (
                    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700/70 shadow-xs flex-shrink-0">
                      {shortcut}
                    </kbd>
                  )}
                </div>
                {description && (
                  <span className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    {description}
                  </span>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default Tooltip;
