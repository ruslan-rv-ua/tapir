import { RefObject, useCallback, useEffect } from 'react';

export interface ZoneEntry {
  /** Must match the element's data-zone-id attribute. */
  id: string;
  /** The root DOM element carrying data-zone-id. */
  readonly el: HTMLElement;
  /** Called to give focus to this zone. */
  focus(direction: 'forward' | 'backward'): void;
}

const MODAL_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [data-modal="true"]';

function isInModal(): boolean {
  return !!document.activeElement?.closest(MODAL_SELECTOR);
}

/**
 * Global zone cycling via F6/Shift+F6.
 *
 * App.tsx calls `useZoneNavigation(orderedZonesRef)` and passes
 * `exitZone` down to each zone so Tab/Shift+Tab at zone boundaries
 * also triggers cycling.
 */
export function useZoneNavigation(orderedZonesRef: RefObject<ZoneEntry[]>) {
  const cycleZone = useCallback(
    (fromId: string | null, forward: boolean) => {
      const zones = orderedZonesRef.current;
      if (!zones || zones.length === 0) return;
      if (!fromId) {
        // No current zone — focus first or last
        const target = zones[forward ? 0 : zones.length - 1];
        target?.focus(forward ? 'forward' : 'backward');
        return;
      }
      const idx = zones.findIndex((z) => z.id === fromId);
      if (idx < 0) {
        const fallback = zones[forward ? 0 : zones.length - 1];
        fallback?.focus(forward ? 'forward' : 'backward');
        return;
      }
      const nextIdx = forward
        ? (idx + 1) % zones.length
        : (idx - 1 + zones.length) % zones.length;
      zones[nextIdx]?.focus(forward ? 'forward' : 'backward');
    },
    [orderedZonesRef],
  );

  // Global F6 / Shift+F6
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'F6') return;
      if (isInModal()) return;
      e.preventDefault();
      e.stopPropagation();
      const zoneEl = document.activeElement?.closest<HTMLElement>('[data-zone-id]');
      const currentId = zoneEl?.dataset.zoneId ?? null;
      cycleZone(currentId, !e.shiftKey);
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [cycleZone]);

  /**
   * Pass this as the `onTabOut` / `exitZone` callback to each zone.
   * Each zone calls exitZone(its own id, forward) when Tab exits the zone boundary.
   */
  const exitZone = useCallback(
    (fromId: string, forward: boolean) => {
      if (isInModal()) return;
      cycleZone(fromId, forward);
    },
    [cycleZone],
  );

  return { exitZone };
}
