import { RefObject, useCallback, useEffect, useRef } from 'react';
import { isInModal } from '../lib/shortcutGuard';

export interface ZoneEntry {
  /** Must match the element's data-zone-id attribute. */
  id: string;
  /** Called to give focus to this zone. */
  focus(direction: 'forward' | 'backward'): void;
  /**
   * Present ONLY on zones that own a text search field: puts focus in that
   * field (and selects its text if focus is already there). `Ctrl+F` picks the
   * first zone that has one — see useGlobalShortcuts.
   *
   * Deliberately not folded into `focus`: that one restores the zone's
   * last-touched control (useFocusBoundary.restoreFocus), which for a filter bar
   * is as likely to be the sort <select> as the search input.
   */
  focusSearch?(): void;
}

/**
 * A stable `ZoneEntry` that stands in for a zone whose handle comes and goes.
 *
 * Why a proxy rather than the handle itself: a list zone unmounts while
 * loading/empty/errored and remounts with a NEW handle whenever its items
 * change or its tab switches, and a permanent zone can rebuild its entry too
 * (PlayerPanel does on every playback change). Zone-registration effects run
 * on a coarse dependency — `songs.length`, `activeTab`, `hasRows` — so a change
 * that keeps that dependency equal never re-registers. Register the raw handle
 * and App is left holding a dead `ZoneEntry` whose `focus()` no-ops:
 * `cycleZone` skips it, and the zone is unreachable by F6/Tab until something
 * else re-registers. The confirmed case was a Songs rescan that kept the count;
 * history in docs/backlog/done/p1-wishlist-stale-list-ref.md.
 *
 * The proxy is created once per component instance and forwards `focus` to
 * whatever `target.current` holds AT CALL TIME, so the registered entry never
 * goes stale and can sit in an effect's dependency list without re-running it.
 * `id` is read on the first render and must match the zone's `data-zone-id`.
 * Only `focus` is forwarded: the zones that own a search field (`focusSearch`)
 * register their handle directly.
 */
export function useZoneProxy(
  id: string,
  target: RefObject<Pick<ZoneEntry, 'focus'> | null>,
): ZoneEntry {
  const proxy = useRef<ZoneEntry | null>(null);
  if (proxy.current === null) {
    proxy.current = { id, focus: (dir) => target.current?.focus(dir) };
  }
  return proxy.current;
}

/**
 * Global zone cycling via F6/Shift+F6.
 *
 * App.tsx calls `useZoneNavigation(orderedZonesRef)` and passes
 * `exitZone` down to each zone so Tab/Shift+Tab at zone boundaries
 * also triggers cycling.
 *
 * `cycleZone` does NOT assume the next zone will accept focus. A zone can
 * decline it: an empty/hidden list, the Player while nothing is playing, or a
 * briefly-stale ZoneEntry left behind by an unmount/remount. After asking a
 * zone to focus, we check whether `document.activeElement` actually moved; if
 * not, we advance to the zone after it, bounded by one full lap. This is the
 * single place that guarantees F6 makes progress — individual zones therefore
 * no longer need to self-skip (see PlayerPanel.restoreFocusPlayer).
 */
export function useZoneNavigation(orderedZonesRef: RefObject<ZoneEntry[]>) {
  const cycleZone = useCallback(
    (fromId: string | null, forward: boolean) => {
      const zones = orderedZonesRef.current;
      if (!zones || zones.length === 0) return;
      const dir = forward ? 'forward' : 'backward';

      // Index of the zone we're leaving. With no current zone, sit just before
      // the first (forward) / after the last (backward) so step 1 lands there.
      let fromIdx: number;
      if (!fromId) {
        fromIdx = forward ? -1 : zones.length;
      } else {
        const idx = zones.findIndex((z) => z.id === fromId);
        fromIdx = idx < 0 ? (forward ? -1 : zones.length) : idx;
      }

      const activeBefore = document.activeElement;
      // Ask each subsequent zone to focus, in order, until one actually does.
      for (let step = 1; step <= zones.length; step++) {
        const offset = forward ? step : -step;
        const nextIdx = (((fromIdx + offset) % zones.length) + zones.length) % zones.length;
        zones[nextIdx]?.focus(dir);
        if (document.activeElement !== activeBefore) return;
      }
      // No zone accepted focus — leave it where it was.
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
