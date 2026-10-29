import { describe, it } from 'node:test';
import assert from 'node:assert';

// Pure logic helper mirroring Tooltip's collision and positioning calculations
interface Rect {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
}

interface ComputeTooltipCoordsOptions {
  triggerRect: Rect;
  tooltipWidth: number;
  tooltipHeight: number;
  side: 'top' | 'bottom' | 'left' | 'right';
  align: 'start' | 'center' | 'end';
  offset: number;
  viewportWidth: number;
  viewportHeight: number;
  padding?: number;
}

export function computeTooltipPosition({
  triggerRect,
  tooltipWidth,
  tooltipHeight,
  side,
  align,
  offset,
  viewportWidth,
  viewportHeight,
  padding = 8,
}: ComputeTooltipCoordsOptions) {
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
      left = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;
    }
  } else if (targetSide === 'bottom') {
    top = triggerRect.bottom + offset;
    if (align === 'start') {
      left = triggerRect.left;
    } else if (align === 'end') {
      left = triggerRect.right - tooltipWidth;
    } else {
      left = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;
    }
  } else if (targetSide === 'left') {
    left = triggerRect.left - tooltipWidth - offset;
    if (align === 'start') {
      top = triggerRect.top;
    } else if (align === 'end') {
      top = triggerRect.bottom - tooltipHeight;
    } else {
      top = triggerRect.top + triggerRect.height / 2 - tooltipHeight / 2;
    }
  } else if (targetSide === 'right') {
    left = triggerRect.right + offset;
    if (align === 'start') {
      top = triggerRect.top;
    } else if (align === 'end') {
      top = triggerRect.bottom - tooltipHeight;
    } else {
      top = triggerRect.top + triggerRect.height / 2 - tooltipHeight / 2;
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

  return { top, left, actualSide: targetSide };
}

describe('macOS Native-Grade Tooltip Positioning & Guard Engine', () => {
  it('correctly calculates bottom centered position for top toolbar buttons', () => {
    const res = computeTooltipPosition({
      triggerRect: { top: 10, left: 100, bottom: 38, right: 128, width: 28, height: 28 },
      tooltipWidth: 80,
      tooltipHeight: 28,
      side: 'bottom',
      align: 'center',
      offset: 6,
      viewportWidth: 1440,
      viewportHeight: 900,
    });

    assert.strictEqual(res.actualSide, 'bottom');
    assert.strictEqual(res.top, 44); // 38 + 6
    assert.strictEqual(res.left, 74); // 100 + 14 - 40
  });

  it('auto-flips from bottom to top when trigger is near the bottom edge', () => {
    const res = computeTooltipPosition({
      triggerRect: { top: 870, left: 200, bottom: 895, right: 230, width: 30, height: 25 },
      tooltipWidth: 100,
      tooltipHeight: 30,
      side: 'bottom',
      align: 'center',
      offset: 6,
      viewportWidth: 1440,
      viewportHeight: 900,
    });

    assert.strictEqual(res.actualSide, 'top');
    assert.strictEqual(res.top, 870 - 30 - 6); // 834
  });

  it('auto-flips from top to bottom when trigger is at the very top edge', () => {
    const res = computeTooltipPosition({
      triggerRect: { top: 5, left: 200, bottom: 25, right: 230, width: 30, height: 20 },
      tooltipWidth: 100,
      tooltipHeight: 30,
      side: 'top',
      align: 'center',
      offset: 6,
      viewportWidth: 1440,
      viewportHeight: 900,
    });

    assert.strictEqual(res.actualSide, 'bottom');
    assert.strictEqual(res.top, 31); // 25 + 6
  });

  it('auto-flips from left to right when trigger is at the left rail (ConnectionRail)', () => {
    const res = computeTooltipPosition({
      triggerRect: { top: 100, left: 4, bottom: 152, right: 56, width: 52, height: 52 },
      tooltipWidth: 200,
      tooltipHeight: 80,
      side: 'left',
      align: 'center',
      offset: 6,
      viewportWidth: 1440,
      viewportHeight: 900,
    });

    assert.strictEqual(res.actualSide, 'right');
    assert.strictEqual(res.left, 56 + 6); // 62
  });

  it('clamps tooltip within viewport boundaries when aligned trigger is near the right edge', () => {
    const res = computeTooltipPosition({
      triggerRect: { top: 10, left: 1400, bottom: 38, right: 1435, width: 35, height: 28 },
      tooltipWidth: 120,
      tooltipHeight: 28,
      side: 'bottom',
      align: 'center',
      offset: 6,
      viewportWidth: 1440,
      viewportHeight: 900,
      padding: 8,
    });

    assert.strictEqual(res.actualSide, 'bottom');
    // clamped: 1440 - 120 - 8 = 1312
    assert.strictEqual(res.left, 1312);
  });

  it('clamps tooltip within viewport boundaries when trigger is near the left edge', () => {
    const res = computeTooltipPosition({
      triggerRect: { top: 10, left: 2, bottom: 38, right: 30, width: 28, height: 28 },
      tooltipWidth: 120,
      tooltipHeight: 28,
      side: 'bottom',
      align: 'center',
      offset: 6,
      viewportWidth: 1440,
      viewportHeight: 900,
      padding: 8,
    });

    assert.strictEqual(res.actualSide, 'bottom');
    // clamped to minimum padding of 8
    assert.strictEqual(res.left, 8);
  });
});
