import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type React from 'react'; // for React.RefObject and React.KeyboardEvent types

type RovingFocusOptions =
  | { mode: 'composite-exit'; onTabOut: (forward: boolean) => void }
  | { mode: 'mixed-boundary-handoff'; onTabBoundary: (forward: boolean) => void };

/**
 * Roving focus for toolbar-like composite zones.
 * axis: 'horizontal' | 'vertical' — single-axis arrow nav.
 * axis: 'both' — all four arrow keys active simultaneously (bidirectional).
 *
 * composite-exit mode: Tab at ANY element calls onTabOut and stops propagation.
 * mixed-boundary-handoff mode: Tab only at first/last boundary calls onTabBoundary.
 */
export function useRovingFocus(
  refs: React.RefObject<HTMLElement | null>[],
  axis: 'horizontal' | 'vertical' | 'both',
  options: RovingFocusOptions,
) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Pending focus fired in useLayoutEffect so tabIndex DOM update happens first
  const pendingFocusRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending === null) return;
    pendingFocusRef.current = null;
    refs[pending]?.current?.focus();
  });

  const moveTo = useCallback(
    (index: number) => {
      const count = refs.length;
      if (count === 0) return;
      const clamped = Math.max(0, Math.min(index, count - 1));
      activeIndexRef.current = clamped;
      setActiveIndex(clamped);
      pendingFocusRef.current = clamped;
    },
    [refs],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const count = refs.length;
      if (count === 0) return;
      const idx = activeIndexRef.current;

      const isPrev =
        (axis === 'vertical' && e.key === 'ArrowUp') ||
        (axis === 'horizontal' && e.key === 'ArrowLeft') ||
        (axis === 'both' && (e.key === 'ArrowUp' || e.key === 'ArrowLeft'));
      const isNext =
        (axis === 'vertical' && e.key === 'ArrowDown') ||
        (axis === 'horizontal' && e.key === 'ArrowRight') ||
        (axis === 'both' && (e.key === 'ArrowDown' || e.key === 'ArrowRight'));

      if (isPrev) {
        e.preventDefault();
        moveTo(idx - 1);
        return;
      }
      if (isNext) {
        e.preventDefault();
        moveTo(idx + 1);
        return;
      }
      if (e.key === 'Home') { e.preventDefault(); moveTo(0); return; }
      if (e.key === 'End') { e.preventDefault(); moveTo(count - 1); return; }

      if (e.key === 'Tab') {
        const opts = optionsRef.current;
        if (opts.mode === 'composite-exit') {
          e.preventDefault();
          e.stopPropagation();
          opts.onTabOut(!e.shiftKey);
        } else {
          // mixed-boundary-handoff: only exit at first/last
          if (!e.shiftKey && idx === count - 1) {
            e.preventDefault();
            e.stopPropagation();
            opts.onTabBoundary(true);
          } else if (e.shiftKey && idx === 0) {
            e.preventDefault();
            e.stopPropagation();
            opts.onTabBoundary(false);
          }
          // otherwise let native Tab work within the zone
        }
      }
    },
    [refs, axis, moveTo],
  );

  /** Call when this zone receives focus from outside (zone entry). */
  const restoreFocus = useCallback(
    (direction: 'forward' | 'backward') => {
      const count = refs.length;
      if (count === 0) return;
      const idx = activeIndexRef.current;
      const el = refs[idx]?.current;
      if (el) {
        el.focus();
        return;
      }
      // Fallback when remembered element gone
      const fallbackIdx = direction === 'forward' ? 0 : count - 1;
      activeIndexRef.current = fallbackIdx;
      setActiveIndex(fallbackIdx);
      refs[fallbackIdx]?.current?.focus();
    },
    [refs],
  );

  /** Returns 0 for the active roving element, -1 for all others. */
  const getTabIndex = useCallback(
    (index: number): 0 | -1 => (index === activeIndex ? 0 : -1),
    [activeIndex],
  );

  return { onKeyDown, restoreFocus, getTabIndex, moveTo, activeIndex };
}
