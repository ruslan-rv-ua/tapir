import { RefObject, useCallback, useEffect, useRef } from 'react';

/**
 * Tabbable element query — excludes hidden, aria-hidden, invisible, and portal-based elements.
 * Does NOT use [tabindex="-1"] (already excluded by CSS selector).
 */
const TABBABLE =
  'a[href]:not([disabled]), button:not([disabled]), input:not([disabled]),' +
  ' select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getTabbable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) =>
      !el.closest('[hidden]') &&
      el.getAttribute('aria-hidden') !== 'true' &&
      getComputedStyle(el).display !== 'none' &&
      getComputedStyle(el).visibility !== 'hidden',
  );
}

/**
 * Form zone Tab-exit boundary.
 *
 * Attaches keydown handlers to the first and last real tabbable elements so that:
 *   - Shift+Tab on the first element calls exitZone(false)
 *   - Tab on the last element calls exitZone(true)
 *
 * Call refreshBoundary() after async DOM changes (e.g. filters loaded, tab switch).
 * Also tracks focus memory for restoreFocus(direction).
 */
export function useFocusBoundary(
  containerRef: RefObject<HTMLElement | null>,
  exitZone: (forward: boolean) => void,
): { refreshBoundary: () => void; restoreFocus: (direction: 'forward' | 'backward') => void } {
  const cleanupRef = useRef<() => void>(() => {});
  const exitZoneRef = useRef(exitZone);
  exitZoneRef.current = exitZone;
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // Track which element inside the zone was last focused
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement && container.contains(e.target)) {
        lastFocusedRef.current = e.target;
      }
    };
    container.addEventListener('focusin', onFocusIn);
    return () => container.removeEventListener('focusin', onFocusIn);
  }, [containerRef]);

  const refreshBoundary = useCallback(() => {
    cleanupRef.current(); // remove previous handlers
    const container = containerRef.current;
    if (!container) return;
    const tabbable = getTabbable(container);
    if (tabbable.length === 0) return;

    const first = tabbable[0];
    const last = tabbable[tabbable.length - 1];

    const handleFirst = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        exitZoneRef.current(false);
      }
    };
    const handleLast = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        exitZoneRef.current(true);
      }
    };

    first.addEventListener('keydown', handleFirst);
    last.addEventListener('keydown', handleLast);

    cleanupRef.current = () => {
      first.removeEventListener('keydown', handleFirst);
      last.removeEventListener('keydown', handleLast);
    };
  }, [containerRef]);

  // Attach on mount and re-attach on DOM change
  useEffect(() => {
    refreshBoundary();
    return () => cleanupRef.current();
  }, [refreshBoundary]);

  const restoreFocus = useCallback(
    (direction: 'forward' | 'backward') => {
      const container = containerRef.current;
      if (!container) return;
      // Restore to last known element if still within container
      const last = lastFocusedRef.current;
      if (last && container.contains(last)) {
        last.focus();
        return;
      }
      // Fallback
      const tabbable = getTabbable(container);
      if (!tabbable.length) return;
      if (direction === 'forward') {
        tabbable[0].focus();
      } else {
        tabbable[tabbable.length - 1].focus();
      }
    },
    [containerRef],
  );

  return { refreshBoundary, restoreFocus };
}
