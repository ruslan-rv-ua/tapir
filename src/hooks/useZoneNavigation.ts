import { RefObject, useCallback, useEffect, useRef } from 'react';
import { isInModal } from '../lib/shortcutGuard';

/**
 * Every zone the F6 / Tab cycle can visit — the three permanent ones first,
 * then each screen's zones in cycle order.
 *
 * One identifier is spelled in three places that nothing else ties together:
 * the `ZoneEntry` registration, the zone container in the DOM (`data-zone-id`,
 * via ScreenZone / CompositeList or written by hand) and the `exitZone(id, …)`
 * call at the zone boundary. `cycleZone` treats an unknown `fromId` as "no
 * current zone" and restarts from the first zone, so a typo never throws — Tab
 * just lands in the wrong place. This union is what makes such a typo fail at
 * `pnpm typecheck` instead. History: docs/backlog/done/p2-zone-id-union.md.
 *
 * One trap: a handle built inline in `useImperativeHandle(ref, () => ({ id: … }))`
 * widens the literal to `string` before React's `R extends T` constraint is
 * checked, so the error lands on the whole object and names no zone. The five
 * such handles spell the return type — `(): ZoneEntry => ({ … })` — to keep the
 * literal contextually typed; do the same for the next one.
 */
export type ZoneId =
  | 'activity-bar'
  | 'player'
  | 'status-bar'
  | 'streams-toolbar'
  | 'streams-list'
  | 'streams-empty'
  | 'streams-filter-empty'
  | 'wishlist-controls'
  | 'wishlist-list'
  | 'wishlist-matches'
  | 'wishlist-empty'
  | 'browser-search'
  | 'browser-selection'
  | 'browser-results'
  | 'songs-selection'
  | 'songs-filter'
  | 'songs-list'
  | 'schedule-toolbar'
  | 'schedule-list'
  | 'profiles-toolbar'
  | 'profiles-list';

/**
 * Extends the check to hand-written zone containers. `ScreenZone` and
 * `CompositeList` type their own prop, but seven zones put `data-zone-id`
 * straight on an element (`<nav>`, `<footer>`, the player root, the songs
 * filter bar, three empty states). A `data-*` attribute is unchecked only while
 * it is undeclared: declaring it on React's `HTMLAttributes` makes TypeScript
 * check the literal on every intrinsic element — and reject a plain `string`
 * there, which is what forces the two component props onto `ZoneId` as well.
 */
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- merging must repeat React's <T> verbatim
  interface HTMLAttributes<T> {
    'data-zone-id'?: ZoneId;
  }
}

export interface ZoneEntry {
  /** Spelled once more on the zone container's data-zone-id — see ZoneId. */
  id: ZoneId;
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
 * else re-registers. The confirmed case was a Songs rescan that kept the count
 * (commit e00262a, found via a file-log trace).
 *
 * The proxy is created once per component instance and forwards `focus` to
 * whatever `ref.current` holds AT CALL TIME, so the registered entry never
 * goes stale and can sit in an effect's dependency list without re-running it.
 * Both arguments are captured on the first render: `ref` must be the ref
 * object itself, and `id` must match the zone's `data-zone-id`.
 * Only `focus` is forwarded: the zones that own a search field (`focusSearch`)
 * register their handle directly.
 */
export function useZoneProxy(
  id: ZoneId,
  ref: RefObject<Pick<ZoneEntry, 'focus'> | null>,
): ZoneEntry {
  const proxy = useRef<ZoneEntry | null>(null);
  if (proxy.current === null) {
    proxy.current = { id, focus: (dir) => ref.current?.focus(dir) };
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
    // `string`, not `ZoneId`: the F6 handler reads this back out of the DOM.
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
    (fromId: ZoneId, forward: boolean) => {
      if (isInModal()) return;
      cycleZone(fromId, forward);
    },
    [cycleZone],
  );

  return { exitZone };
}
