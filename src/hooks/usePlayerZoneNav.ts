import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

export interface FocusStop {
  ref: RefObject<HTMLElement | null>;
  enabled: boolean;
}

/**
 * Manages keyboard navigation for the player zone.
 *
 * - Left/Right arrow: move between enabled stops (clamp, no wrap).
 * - Tab/Shift+Tab: exit zone (calls onExitZone).
 * - Home/End: jump to first/last enabled stop.
 * - Sliders call navigate() via their onNavigate callback instead of bubbling arrow keys.
 * - activeIdx stays in sync via focusin listener (click) and stops-change effect (removal/remap).
 */
export function usePlayerZoneNav(
  appRef: RefObject<HTMLElement | null>,
  stops: FocusStop[],
  onExitZone: (forward: boolean) => void,
): {
  onRootKeyDown: (e: React.KeyboardEvent) => void;
  enterZone: (direction: 'forward' | 'backward') => void;
  navigate: (direction: 'prev' | 'next' | 'first' | 'last') => void;
} {
  const [activeIdx, setActiveIdx] = useState(-1);

  // Ref mirrors — always current, safe to read inside effects/callbacks without stale closures.
  const activeIdxRef = useRef(-1);
  // Identity of the previously-focused stop's RefObject — used for remap/removal detection.
  // IMPORTANT: updated imperatively in focusStop and focusin listener, NOT in a useEffect.
  // A useEffect on [activeIdx, stops] would overwrite it with the NEW list's ref before the
  // stops-change remap effect runs, breaking the identity-based remap logic.
  const prevStopRefRef = useRef<RefObject<HTMLElement | null> | null>(null);

  // Keep activeIdxRef in sync (read by callbacks/effects without re-render).
  useEffect(() => {
    activeIdxRef.current = activeIdx;
  }, [activeIdx]);

  /** Focus a stop by index and record it as active. */
  const focusStop = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= stops.length) return;
      stops[idx].ref.current?.focus();
      setActiveIdx(idx);
      activeIdxRef.current = idx;
      // Update prevStopRefRef imperatively here (before any effects run) so the
      // stops-change effect can reliably identify the previously-focused stop by identity.
      prevStopRefRef.current = stops[idx].ref;
    },
    [stops],
  );

  /**
   * Find the nearest enabled stop.
   * 'first'/'last' scan the full list (`from` is ignored for these).
   * 'next'/'prev' start adjacent to `from` and clamp at the boundary (no wrap).
   * Returns -1 if no enabled stop exists.
   */
  const findEnabled = useCallback(
    (from: number, dir: 'prev' | 'next' | 'first' | 'last'): number => {
      if (dir === 'first') return stops.findIndex((s) => s.enabled);
      if (dir === 'last') {
        for (let i = stops.length - 1; i >= 0; i--) if (stops[i].enabled) return i;
        return -1;
      }
      if (dir === 'next') {
        for (let i = from + 1; i < stops.length; i++) if (stops[i].enabled) return i;
        return from; // already at last enabled stop — clamp
      }
      // prev
      for (let i = from - 1; i >= 0; i--) if (stops[i].enabled) return i;
      return from; // already at first enabled stop — clamp
    },
    [stops],
  );

  /** Enter the zone, focusing the first or last enabled stop. */
  const enterZone = useCallback(
    (direction: 'forward' | 'backward') => {
      const idx =
        direction === 'forward'
          ? findEnabled(0, 'first')
          : findEnabled(stops.length - 1, 'last');
      if (idx < 0) {
        onExitZone(direction === 'forward');
        return;
      }
      focusStop(idx);
    },
    [findEnabled, focusStop, onExitZone, stops.length],
  );

  /**
   * Imperative navigation called by sliders via their onNavigate prop.
   * Maps to the same logic as keyboard handling.
   */
  const navigate = useCallback(
    (direction: 'prev' | 'next' | 'first' | 'last') => {
      const from = activeIdxRef.current < 0 ? 0 : activeIdxRef.current;
      const next = findEnabled(from, direction);
      if (next < 0) return;
      focusStop(next);
    },
    [findEnabled, focusStop],
  );

  /** Handles keydown events bubbled from all elements inside role="application". */
  const onRootKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        onExitZone(!e.shiftKey);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigate('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigate('next');
      } else if (e.key === 'Home') {
        e.preventDefault();
        navigate('first');
      } else if (e.key === 'End') {
        e.preventDefault();
        navigate('last');
      }
    },
    [navigate, onExitZone],
  );

  // Sync activeIdx when focus enters any stop via click or programmatic focus.
  useEffect(() => {
    const root = appRef.current;
    if (!root) return;
    const onFocusIn = (e: FocusEvent) => {
      const idx = stops.findIndex(
        (s) => s.ref.current && s.ref.current.contains(e.target as Node),
      );
      if (idx >= 0) {
        setActiveIdx(idx);
        activeIdxRef.current = idx;
        prevStopRefRef.current = stops[idx].ref;
      }
    };
    root.addEventListener('focusin', onFocusIn);
    return () => root.removeEventListener('focusin', onFocusIn);
  }, [appRef, stops]);

  // When stops change: remap activeIdx if active stop moved; move focus if stop gone/disabled.
  useEffect(() => {
    const prevRef = prevStopRefRef.current;
    if (!prevRef || activeIdxRef.current < 0) return;

    // Search for the same RefObject by identity in the new list.
    const newIdx = stops.findIndex((s) => s.ref === prevRef);
    if (newIdx >= 0 && stops[newIdx].enabled) {
      // Stop still present and enabled — remap index without moving DOM focus.
      setActiveIdx(newIdx);
      activeIdxRef.current = newIdx;
      return;
    }

    // Stop gone or disabled — move focus unconditionally (no document.activeElement check;
    // it may already point to <body> before this effect runs).
    const fromIdx = Math.min(activeIdxRef.current, stops.length - 1);
    let target = -1;
    for (let i = fromIdx + 1; i < stops.length; i++) {
      if (stops[i].enabled) { target = i; break; }
    }
    if (target < 0) {
      for (let i = fromIdx - 1; i >= 0; i--) {
        if (stops[i].enabled) { target = i; break; }
      }
    }
    if (target >= 0) {
      focusStop(target);
    } else {
      onExitZone(true);
    }
  // Intentionally suppressed deps:
  // - focusStop: changes only when stops changes (same dep), closure is always in sync.
  // - onExitZone: effect must fire ONLY on stops change; stale closure is acceptable here
  //   because onExitZone is expected to be stable (memoised by the caller, PlayerPanel).
  // prevStopRefRef / activeIdxRef are refs, always current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops]);

  return { onRootKeyDown, enterZone, navigate };
}
