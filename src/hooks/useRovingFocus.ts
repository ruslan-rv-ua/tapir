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
/**
 * A native `disabled` control cannot receive DOM focus, so `.focus()` on it
 * silently no-ops and the screen reader goes quiet. Arrow / Home / End traversal
 * must skip such elements. `aria-disabled` elements stay focusable on purpose
 * (e.g. ActivityBar's unimplemented sections must remain discoverable, FRD
 * §7.2.3), so they are NOT skipped here.
 */
const isFocusable = (el: HTMLElement | null): el is HTMLElement =>
  el !== null && !(el as HTMLButtonElement).disabled;

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
      // No-op when the index is unchanged: setActiveIndex would bail the
      // re-render, so the useLayoutEffect that consumes pendingFocusRef never
      // fires. Scheduling focus here would leave a stale pending entry that
      // hijacks focus on the next unrelated render. Callers that must move DOM
      // focus on entry (e.g. ActivityBar) focus the element directly.
      if (clamped === activeIndexRef.current) return;
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

      // Find the nearest focusable index from `start`, scanning by `step` (no
      // wrap). Returns null if every candidate in that direction is unfocusable,
      // in which case the caller leaves focus where it is.
      const seekFocusable = (start: number, step: number): number | null => {
        for (let i = start; i >= 0 && i < count; i += step) {
          if (isFocusable(refs[i]?.current ?? null)) return i;
        }
        return null;
      };

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
        const target = seekFocusable(idx - 1, -1);
        if (target !== null) moveTo(target);
        return;
      }
      if (isNext) {
        e.preventDefault();
        const target = seekFocusable(idx + 1, 1);
        if (target !== null) moveTo(target);
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        const target = seekFocusable(0, 1);
        if (target !== null) moveTo(target);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        const target = seekFocusable(count - 1, -1);
        if (target !== null) moveTo(target);
        return;
      }

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

      // On entry, land on an actionable control: skip native `disabled` (via
      // isFocusable) AND `aria-disabled` (which arrow traversal keeps, but which
      // is not a sensible entry anchor).
      const isEnabled = (el: HTMLElement | null): el is HTMLElement =>
        isFocusable(el) && !el.hasAttribute('aria-disabled');

      // Try remembered index first, then scan in travel direction for an enabled element
      const startIdx = activeIndexRef.current;
      const indices = direction === 'forward'
        ? [...Array(count).keys()].map((i) => (startIdx + i) % count)
        : [...Array(count).keys()].map((i) => (startIdx - i + count) % count);

      for (const i of indices) {
        const el = refs[i]?.current;
        if (isEnabled(el)) {
          activeIndexRef.current = i;
          setActiveIndex(i);
          el.focus();
          return;
        }
      }
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
