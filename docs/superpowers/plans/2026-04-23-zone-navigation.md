# Zone-Based Keyboard Navigation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all React Aria `<Table>` components with segment-based composite lists and implement full zone-based keyboard navigation (Tab/F6 zone cycling, roving focus, NVDA-optimized) per `docs/FRD-navigation.md`.

**Architecture:** Approach B — custom hooks + static zone array. Four new hooks manage focus: `useRovingFocus` (toolbar 1D roving), `useFocusBoundary` (form zone Tab-exit), `useCompositeList` (2D list navigation with segments), `useZoneNavigation` (global F6 + zone cycling). App.tsx assembles ordered zones `[activityBar, ...screenZones, player, statusBar]` and dispatches focus on section change.

**Tech Stack:** React 19, TypeScript 5, Tauri v2, Nanostores, React Aria Components (retained for dialogs/sliders/form controls only), Paraglide.js (i18n), Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-04-23-zone-navigation-design.md` (finalized, committed on `feature/nav` branch).

**Verification commands:**
- TypeScript: `npx tsc --noEmit` (paraglide import errors are pre-existing, expected — ignore them)
- Dev server: `just dev`

---

## File Map

### New files
| File | Responsibility |
|------|----------------|
| `src/hooks/useRovingFocus.ts` | 1D roving focus for toolbars/ActivityBar. Two modes: `composite-exit` (Tab always exits) and `mixed-boundary-handoff` (Tab exits only at boundary). |
| `src/hooks/useFocusBoundary.ts` | Form zone Tab-exit detection. Attaches `onKeyDown` to first/last real tabbable element. Exposes `refreshBoundary()` for async DOM changes. Tracks focus memory. |
| `src/hooks/useCompositeList.ts` | 2D roving focus for segment-based lists. Up/Down = items, Left/Right = segments. Handles live reconciliation on item removal. |
| `src/hooks/useZoneNavigation.ts` | Global F6/Shift+F6 zone cycling. Modal guard. |
| `src/components/streams/StreamList.tsx` | Thin wrapper: renders `<ul>` with `useCompositeList`, exposes ZoneEntry via `useImperativeHandle`. |
| `src/components/streams/StreamItem.tsx` | Single stream row with dynamic segments (track/tech/status/actions). Replaces StreamRow. |
| `src/components/browser/StationList.tsx` | Browser results `<ul>` with `useCompositeList`. Replaces StationTable. |
| `src/components/wishlist/PatternList.tsx` | Wishlist/ignorelist `<ul>` with `useCompositeList`. Replaces PatternTable. |

### Modified files
| File | Key changes |
|------|-------------|
| `src/App.tsx` | Zone refs, `onZonesChange` callback, F6/Tab zone wiring, section-change focus |
| `src/components/layout/ActivityBar.tsx` | `useRovingFocus` composite-exit, `aria-disabled` no-op |
| `src/components/layout/StatusBar.tsx` | Focusable segment `<div>` elements, composite zone |
| `src/components/layout/SectionHeader.tsx` | Remove CommandPalette trigger (moved to panels) |
| `src/components/common/CommandPalette.tsx` | `role="dialog"`, `aria-modal`, `aria-label`, focus trap |
| `src/components/player/PlayerPanel.tsx` | Mixed zone: transport `useRovingFocus` mixed-boundary-handoff |
| `src/components/streams/StreamsPanel.tsx` | Zone registration, CommandPalette trigger, empty-state zone |
| `src/components/browser/BrowserPanel.tsx` | Zone registration, CommandPalette trigger, `refreshBoundary` after filter load |
| `src/components/browser/SearchForm.tsx` | `data-zone-id`, `useFocusBoundary` attached |
| `src/components/wishlist/WishlistPanel.tsx` | React Aria Tabs, zone registration, CommandPalette trigger |
| `src/i18n/messages/uk.json` | New zone/segment/accessibility keys |
| `src/i18n/messages/en.json` | Same keys in English |

### Deleted files (at end)
- `src/components/streams/StreamTable.tsx`
- `src/components/streams/StreamRow.tsx`
- `src/components/browser/StationTable.tsx`
- `src/components/wishlist/PatternTable.tsx`

---

## Chunk 1: Core Hooks

### Task 1: `useRovingFocus`

**Files:**
- Create: `src/hooks/useRovingFocus.ts`

**Reference:** spec §3 — two modes, arrow keys, Home/End, Tab intercept.

- [ ] **Step 1: Create the file**

```typescript
// src/hooks/useRovingFocus.ts
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type React from 'react'; // for React.RefObject and React.KeyboardEvent types

type RovingFocusOptions =
  | { mode: 'composite-exit'; onTabOut: (forward: boolean) => void }
  | { mode: 'mixed-boundary-handoff'; onTabBoundary: (forward: boolean) => void };

/**
 * 1D roving focus for toolbar-like composite zones.
 *
 * composite-exit mode: Tab at ANY element calls onTabOut and stops propagation.
 * mixed-boundary-handoff mode: Tab only at first/last boundary calls onTabBoundary.
 */
export function useRovingFocus(
  refs: React.RefObject<HTMLElement | null>[],
  axis: 'horizontal' | 'vertical',
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
      const prevKey = axis === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
      const nextKey = axis === 'horizontal' ? 'ArrowRight' : 'ArrowDown';

      if (e.key === prevKey) {
        e.preventDefault();
        moveTo((idx - 1 + count) % count);
        return;
      }
      if (e.key === nextKey) {
        e.preventDefault();
        moveTo((idx + 1) % count);
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
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```
Expected: No new errors (paraglide errors are pre-existing).

- [ ] **Step 3: Commit**

```
git add src/hooks/useRovingFocus.ts
git commit -m "feat(nav): add useRovingFocus hook (composite-exit + mixed-boundary-handoff)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: `useFocusBoundary`

**Files:**
- Create: `src/hooks/useFocusBoundary.ts`

**Reference:** spec §1 (form zones) — attach `onKeyDown` to first/last real tabbable. `refreshBoundary()` for async DOM changes. Focus memory for re-entry.

- [ ] **Step 1: Create the file**

```typescript
// src/hooks/useFocusBoundary.ts
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
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/hooks/useFocusBoundary.ts
git commit -m "feat(nav): add useFocusBoundary hook (form zone Tab-exit + focus memory)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: `useCompositeList`

**Files:**
- Create: `src/hooks/useCompositeList.ts`

**Reference:** spec §2 — 2D roving focus, segments, live reconciliation, focus memory, pendingFocus pattern.

- [ ] **Step 1: Create the file**

```typescript
// src/hooks/useCompositeList.ts
import { useCallback, useLayoutEffect, useRef, useState, useEffect } from 'react';
import type React from 'react'; // for React.KeyboardEvent type

export type SegmentKind =
  | 'summary'
  | 'track'
  | 'tech'
  | 'status'
  | 'actions'
  | 'metadata'
  | 'conditions';

export type ActionType = 'primary' | 'toggle' | 'delete' | 'contextMenu';

export interface CompositeListItem {
  /** Stable unique identifier. */
  id: string;
  /**
   * Ordered segment kinds available for this item — do NOT include 'summary'.
   * 'summary' is always implicitly first.
   */
  segments: Exclude<SegmentKind, 'summary'>[];
}

interface FocusMemory {
  itemId: string;
  /** Fallback if itemId is no longer in the list. */
  prevIndex: number;
  activeSegment: SegmentKind;
  scrollTop: number;
}

interface UseCompositeListOptions<T extends CompositeListItem> {
  zoneId: string;
  items: T[];
  onTabOut: (forward: boolean) => void;
  onAction: (type: ActionType, itemId: string, segment: SegmentKind) => void;
  /**
   * Called when items becomes empty while list had focus.
   * Parent should switch to empty-state zone.
   */
  onEmpty?: () => void;
}

/**
 * 2D roving focus for segment-based composite lists.
 *
 * DOM convention: every focusable element in the list must carry:
 *   data-item-id="<item.id>"
 *   data-segment="<SegmentKind>"
 *
 * Buttons inside the 'actions' segment must have tabIndex={-1} and be
 * activated via Enter/Space on the segment container, not directly.
 */
export function useCompositeList<T extends CompositeListItem>({
  items,
  onTabOut,
  onAction,
  onEmpty,
}: UseCompositeListOptions<T>) {
  const [activeItemId, setActiveItemId] = useState<string | null>(
    items.length > 0 ? items[0].id : null,
  );
  const [activeSegment, setActiveSegment] = useState<SegmentKind>('summary');

  const memoryRef = useRef<FocusMemory>({
    itemId: items[0]?.id ?? '',
    prevIndex: 0,
    activeSegment: 'summary',
    scrollTop: 0,
  });
  const listRef = useRef<HTMLUListElement | null>(null);
  const pendingFocusRef = useRef<{ itemId: string; segment: SegmentKind } | null>(null);

  // Keep options in refs to avoid stale closure
  const onTabOutRef = useRef(onTabOut);
  onTabOutRef.current = onTabOut;
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const onEmptyRef = useRef(onEmpty);
  onEmptyRef.current = onEmpty;

  // Fire pending focus after DOM updates (tabIndex changes happen during render)
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-item-id="${CSS.escape(pending.itemId)}"][data-segment="${pending.segment}"]`,
    );
    el?.focus();
  });

  // Update focus memory whenever active position changes
  useEffect(() => {
    if (!activeItemId) return;
    const idx = items.findIndex((it) => it.id === activeItemId);
    memoryRef.current = {
      itemId: activeItemId,
      prevIndex: idx >= 0 ? idx : memoryRef.current.prevIndex,
      activeSegment,
      scrollTop: listRef.current?.scrollTop ?? 0,
    };
  }, [activeItemId, activeSegment, items]);

  // Live reconciliation: active item removed while list has focus
  useEffect(() => {
    if (!activeItemId) return;
    const exists = items.some((it) => it.id === activeItemId);
    if (exists) return;
    if (!(listRef.current?.contains(document.activeElement) ?? false)) return;

    if (items.length === 0) {
      onEmptyRef.current?.();
      return;
    }
    const targetIdx = Math.max(
      0,
      Math.min(memoryRef.current.prevIndex, items.length - 1),
    );
    const target = items[targetIdx];
    setActiveItemId(target.id);
    setActiveSegment('summary');
    pendingFocusRef.current = { itemId: target.id, segment: 'summary' };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  function resolveSegments(item: T): SegmentKind[] {
    return ['summary', ...item.segments] as SegmentKind[];
  }

  const moveFocus = useCallback(
    (itemId: string, segment: SegmentKind) => {
      setActiveItemId(itemId);
      setActiveSegment(segment);
      pendingFocusRef.current = { itemId, segment };
    },
    [],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Swallow nothing while inside a modal
      const isInModal = !!document.activeElement?.closest(
        '[role="dialog"], [role="alertdialog"], [data-modal="true"]',
      );
      if (isInModal) return;

      if (!activeItemId) {
        if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          onTabOutRef.current(!e.shiftKey);
        }
        return;
      }

      const currentIdx = items.findIndex((it) => it.id === activeItemId);
      if (currentIdx < 0) return;
      const currentItem = items[currentIdx];
      const allSegments = resolveSegments(currentItem);
      const segIdx = allSegments.indexOf(activeSegment);

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (currentIdx > 0) {
            const prevItem = items[currentIdx - 1];
            const prevSegs = resolveSegments(prevItem);
            const seg = prevSegs.includes(activeSegment) ? activeSegment : 'summary';
            moveFocus(prevItem.id, seg);
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          if (currentIdx < items.length - 1) {
            const nextItem = items[currentIdx + 1];
            const nextSegs = resolveSegments(nextItem);
            const seg = nextSegs.includes(activeSegment) ? activeSegment : 'summary';
            moveFocus(nextItem.id, seg);
          }
          break;

        case 'ArrowLeft':
          e.preventDefault();
          if (segIdx > 0) {
            moveFocus(activeItemId, allSegments[segIdx - 1]);
          }
          // At 'summary' → stay
          break;

        case 'ArrowRight':
          e.preventDefault();
          if (segIdx < allSegments.length - 1) {
            moveFocus(activeItemId, allSegments[segIdx + 1]);
          }
          break;

        case 'Home':
          e.preventDefault();
          if (items.length > 0) moveFocus(items[0].id, 'summary');
          break;

        case 'End':
          e.preventDefault();
          if (items.length > 0) moveFocus(items[items.length - 1].id, 'summary');
          break;

        case 'PageUp': {
          e.preventDefault();
          const container = listRef.current;
          if (!container || items.length === 0) break;
          const firstItemEl = container.querySelector<HTMLElement>('[data-item-id]');
          const itemH = firstItemEl?.offsetHeight || 40;
          const page = Math.max(1, Math.floor(container.clientHeight / itemH));
          const targetIdx = Math.max(0, currentIdx - page);
          moveFocus(items[targetIdx].id, 'summary');
          break;
        }

        case 'PageDown': {
          e.preventDefault();
          const container = listRef.current;
          if (!container || items.length === 0) break;
          const firstItemEl = container.querySelector<HTMLElement>('[data-item-id]');
          const itemH = firstItemEl?.offsetHeight || 40;
          const page = Math.max(1, Math.floor(container.clientHeight / itemH));
          const targetIdx = Math.min(items.length - 1, currentIdx + page);
          moveFocus(items[targetIdx].id, 'summary');
          break;
        }

        case 'Enter':
          e.preventDefault();
          onActionRef.current('primary', activeItemId, activeSegment);
          break;

        case ' ':
          e.preventDefault();
          // 'actions' segment has no toggle semantics — Space fires primary
          if (activeSegment === 'actions') {
            onActionRef.current('primary', activeItemId, activeSegment);
          } else {
            onActionRef.current('toggle', activeItemId, activeSegment);
          }
          break;

        case 'Delete':
          e.preventDefault();
          onActionRef.current('delete', activeItemId, activeSegment);
          break;

        case 'ContextMenu':
          e.preventDefault();
          onActionRef.current('contextMenu', activeItemId, activeSegment);
          break;

        case 'F10':
          if (!e.shiftKey) break;
          e.preventDefault();
          onActionRef.current('contextMenu', activeItemId, activeSegment);
          break;

        case 'Tab':
          e.preventDefault();
          e.stopPropagation();
          onTabOutRef.current(!e.shiftKey);
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeItemId, activeSegment, items, moveFocus],
  );

  /** isFocused(itemId, segment) → true iff this element should have tabIndex=0 */
  const isFocused = useCallback(
    (itemId: string, segment: SegmentKind): boolean =>
      activeItemId === itemId && activeSegment === segment,
    [activeItemId, activeSegment],
  );

  /** Called when zone receives focus from outside (Tab/F6 entry). */
  const restoreFocus = useCallback(
    (direction: 'forward' | 'backward') => {
      if (items.length === 0) return;
      const mem = memoryRef.current;
      const existingIdx = items.findIndex((it) => it.id === mem.itemId);
      let targetIdx: number;
      let targetSeg: SegmentKind;

      if (existingIdx >= 0) {
        targetIdx = existingIdx;
        const item = items[existingIdx];
        const segs = resolveSegments(item);
        targetSeg = segs.includes(mem.activeSegment) ? mem.activeSegment : 'summary';
      } else {
        targetIdx = Math.max(0, Math.min(mem.prevIndex, items.length - 1));
        targetSeg = 'summary';
      }

      const target = items[targetIdx];
      setActiveItemId(target.id);
      setActiveSegment(targetSeg);
      if (listRef.current) listRef.current.scrollTop = mem.scrollTop;
      pendingFocusRef.current = { itemId: target.id, segment: targetSeg };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  );

  return { listRef, onKeyDown, isFocused, restoreFocus, activeItemId, activeSegment };
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/hooks/useCompositeList.ts
git commit -m "feat(nav): add useCompositeList hook (2D segment-based roving focus)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: `useZoneNavigation`

**Files:**
- Create: `src/hooks/useZoneNavigation.ts`

**Reference:** spec §1 — F6/Shift+F6 global handler, modal guard, zone cycling by `data-zone-id`.

- [ ] **Step 1: Create the file**

```typescript
// src/hooks/useZoneNavigation.ts
import { RefObject, useCallback, useEffect, useRef } from 'react';

export interface ZoneEntry {
  /** Must match the element's data-zone-id attribute. */
  id: string;
  /** The root DOM element carrying data-zone-id. */
  readonly el: HTMLElement;
  /** Called to give focus to this zone. */
  focus(direction: 'forward' | 'backward'): void;
}

const MODAL_SELECTOR = '[role="dialog"], [role="alertdialog"], [data-modal="true"]';

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
        // fromId not found — focus first
        zones[0]?.focus('forward');
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
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/hooks/useZoneNavigation.ts
git commit -m "feat(nav): add useZoneNavigation hook (global F6 + exitZone)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: i18n keys

**Files:**
- Modify: `src/i18n/messages/uk.json`
- Modify: `src/i18n/messages/en.json`

**Reference:** spec §7 — complete list of new keys needed.

- [ ] **Step 1: Add keys to uk.json**

Add these entries to the JSON object in `src/i18n/messages/uk.json`:

```json
"zone_activity_bar": "Бокова панель",
"zone_streams_actions": "Дії потоку",
"zone_streams_list": "Список потоків",
"zone_streams_empty": "Потоки відсутні",
"zone_browser_search": "Пошук",
"zone_browser_results": "Результати пошуку",
"zone_wishlist_controls": "Список і дії",
"zone_wishlist_list": "Список патернів",
"zone_player": "Програвач",
"zone_status": "Статус",
"segment_track": "Трек",
"segment_tech": "Технічна інформація",
"segment_status_duration": "Тривалість запису",
"segment_playing": "Відтворюється",
"segment_actions": "Дії",
"segment_metadata": "Метадані",
"segment_conditions": "Умови",
"segment_free_disk": "Вільне місце",
"segment_longest_recording": "Найдовший запис",
"segment_status": "Статус потоку",
"empty_conditions": "без умов",
"command_palette_label": "Командна палітра",
"streams_empty_description": "Список потоків порожній. Натисніть Enter, щоб додати перший потік.",
"wishlist_empty_description": "Список порожній. Натисніть Enter, щоб додати перший патерн."
```

- [ ] **Step 2: Add keys to en.json**

Add these entries to `src/i18n/messages/en.json`:

```json
"zone_activity_bar": "Sidebar",
"zone_streams_actions": "Stream actions",
"zone_streams_list": "Streams list",
"zone_streams_empty": "No streams",
"zone_browser_search": "Search",
"zone_browser_results": "Search results",
"zone_wishlist_controls": "List and actions",
"zone_wishlist_list": "Pattern list",
"zone_player": "Player",
"zone_status": "Status",
"segment_track": "Track",
"segment_tech": "Technical info",
"segment_status_duration": "Recording duration",
"segment_playing": "Playing",
"segment_actions": "Actions",
"segment_metadata": "Metadata",
"segment_conditions": "Conditions",
"segment_free_disk": "Free disk",
"segment_longest_recording": "Longest recording",
"segment_status": "Stream status",
"empty_conditions": "no conditions",
"command_palette_label": "Command palette",
"streams_empty_description": "No streams yet. Press Enter to add the first stream.",
"wishlist_empty_description": "Empty list. Press Enter to add the first pattern."
```

- [ ] **Step 3: Rebuild Paraglide messages**

After editing the JSON files, Paraglide auto-generates TS message functions during `vite dev` / build. If you're not running `just dev`, trigger it manually:

```
npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/i18n/paraglide
```

Then verify TypeScript:

```
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```
git add src/i18n/messages/uk.json src/i18n/messages/en.json src/i18n/paraglide/
git commit -m "feat(nav): add i18n keys for zones, segments, and empty states

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 2: App Infrastructure + CommandPalette + SectionHeader

### Task 6: `ZoneEntry` type + App.tsx zone wiring

**Files:**
- Modify: `src/App.tsx`

**Reference:** spec §1 (zone order, onZonesChange, section-change focus) and `src/App.tsx` (current 199 lines with Ctrl+K/Ctrl+, handlers already present).

Key changes:
1. Import `ZoneEntry` and `useZoneNavigation`
2. Add zone refs for ActivityBar, Player, StatusBar (using `useRef<ZoneEntry | null>`)
3. Add `screenZones` state + `onZonesChange` callback
4. Assemble `orderedZonesRef` from all zones
5. Pass `exitZone(zoneId, forward)` down to each zone component
6. Detect section changes; after new zones register, call `focus('forward')` on first screen zone

- [ ] **Step 1: Add zone navigation to App.tsx (surgical additions only)**

⚠️ **DO NOT rewrite App.tsx**. The existing file (~200 lines) contains critical business logic:
- 11 `useTauriEvent` subscriptions
- `LiveAnnouncer` + `useAnnounce`
- Initial data loading (`getStreams`, `getAllStatuses`, `getSettings`, `getPlayerStatus`)
- Ctrl+K / Ctrl+, keyboard handlers
- `AppContent` + `App` two-function structure (ErrorBoundary wraps AppContent; CommandPalette, SettingsDialog, LiveAnnouncer, ToastContainer live in App)

**Read `src/App.tsx` in full, then make only these specific changes:**

**1. Add new import (after existing imports):**
```tsx
import { useZoneNavigation, type ZoneEntry } from "./hooks/useZoneNavigation";
```
Also add `useState` to the existing React import line (it currently imports only `useEffect, useCallback, useRef`):
```tsx
import { useEffect, useCallback, useRef, useState } from "react";
```

**2. Inside `AppContent` function, after the existing state declarations (e.g. after `const activeSection = useStore($activeSection)`):**
```tsx
// ── Zone navigation ──────────────────────────────────────
// Permanent zones: ActivityBar, Player, StatusBar — never unmount
const activityBarZoneRef = useRef<ZoneEntry | null>(null);
const playerZoneRef = useRef<ZoneEntry | null>(null);
const statusBarZoneRef = useRef<ZoneEntry | null>(null);

// Screen zones from the active panel — registered via onZonesChange
const [screenZones, setScreenZones] = useState<ZoneEntry[]>([]);
const orderedZonesRef = useRef<ZoneEntry[]>([]);

// Keep orderedZonesRef in sync whenever screenZones changes
useEffect(() => {
  orderedZonesRef.current = [
    activityBarZoneRef.current,
    ...screenZones,
    playerZoneRef.current,
    statusBarZoneRef.current,
  ].filter((z): z is ZoneEntry => z !== null);
}, [screenZones]);

const { exitZone } = useZoneNavigation(orderedZonesRef);

// When the section changes, focus first screen zone after zones register
const prevSectionRef = useRef(activeSection);
useEffect(() => {
  if (prevSectionRef.current === activeSection) return;
  prevSectionRef.current = activeSection;
  requestAnimationFrame(() => {
    const firstScreen = orderedZonesRef.current.find(
      (z) => z.id !== "activity-bar" && z.id !== "player" && z.id !== "status-bar"
    );
    firstScreen?.focus("forward");
  });
}, [activeSection]);

const onZonesChange = useCallback((zones: ZoneEntry[]) => {
  setScreenZones(zones);
}, []);
// ── End zone navigation ──────────────────────────────────
```

**3. Update JSX inside `AppContent` return — add only these props (do not restructure the layout):**

Change `<ActivityBar />` to:
```tsx
<ActivityBar
  ref={activityBarZoneRef}
  exitZone={(forward) => exitZone("activity-bar", forward)}
/>
```

Change `<StreamsPanel />` to:
```tsx
<StreamsPanel onZonesChange={onZonesChange} exitZone={exitZone} />
```

Change `<WishlistPanel />` to:
```tsx
<WishlistPanel onZonesChange={onZonesChange} exitZone={exitZone} />
```

Change `<BrowserPanel />` to:
```tsx
<BrowserPanel onZonesChange={onZonesChange} exitZone={exitZone} />
```

Change `<PlayerPanel />` to:
```tsx
<PlayerPanel ref={playerZoneRef} exitZone={(forward) => exitZone("player", forward)} />
```

Change `<StatusBar />` to:
```tsx
<StatusBar ref={statusBarZoneRef} exitZone={(forward) => exitZone("status-bar", forward)} />
```

Change `<SectionHeader title={...} />` to:
```tsx
<SectionHeader section={activeSection} />
```
(Task 8 rewrites SectionHeader to accept `section: Section` instead of `title: string`.)

**4. The `App` function wrapper remains unchanged:**
```tsx
// DO NOT TOUCH — keep ErrorBoundary, CommandPalette, SettingsDialog, LiveAnnouncer, ToastContainer as-is
function App() {
  return (
    <ErrorBoundary>
      <AppContent />
      <CommandPalette />
      <SettingsDialog />
      <LiveAnnouncer />
      <ToastContainer />
    </ErrorBoundary>
  );
}
```

**Notes:**
- `SettingsDialog` reads `$settingsDialogOpen` from store directly — NO props needed.
- `ToastContainer` is the correct component name (NOT `Toaster`).
- ActivityBar, PlayerPanel, StatusBar accept `ref` after Tasks 9–11.
- Panel components accept `onZonesChange` and `exitZone` after Tasks 12–20.
- TypeScript errors for unimplemented components are expected at this stage.

- [ ] **Step 2: Verify TypeScript**

TypeScript errors for unimplemented components are expected at this stage — verify there are no errors in the new hook imports or the wiring logic itself.

- [ ] **Step 3: Commit**

```
git add src/App.tsx
git commit -m "feat(nav): wire zone navigation in App.tsx (zone refs, onZonesChange, section focus)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: CommandPalette modal accessibility

**Files:**
- Modify: `src/components/common/CommandPalette.tsx`

**Reference:** spec §5 — `role="dialog"`, `aria-modal="true"`, `aria-label`, focus trap, opener focus restore.

- [ ] **Step 1: Update CommandPalette.tsx**

Read the full current `src/components/common/CommandPalette.tsx` (already available in context), then apply these changes:

1. Add `openerRef` to capture `document.activeElement` before opening
2. On open (when `isOpen` becomes `true`): store opener
3. On close: restore opener focus
4. Wrap root element with `role="dialog"`, `aria-modal="true"`, `aria-label={m.command_palette_label()}`, `data-modal="true"`
5. Add keyboard trap: when `isOpen`, intercept Tab/Shift+Tab to cycle within the palette (search input ↔ list items)

Key diff to apply to existing CommandPalette.tsx:

```tsx
// ADD: import FocusScope from react-aria-components for focus trap
import { FocusScope } from "react-aria-components";

// ADD: inside component, before return
const openerRef = useRef<Element | null>(null);

// MODIFY: the existing useEffect that resets on open
useEffect(() => {
  if (isOpen) {
    openerRef.current = document.activeElement;
    setQuery("");
    setSelectedIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  } else {
    // Restore opener focus on close
    if (openerRef.current instanceof HTMLElement) {
      openerRef.current.focus();
    }
    openerRef.current = null;
  }
}, [isOpen]);

// MODIFY: wrap the overlay div with FocusScope contain restoreFocus
// and add the required ARIA attributes to the inner content div:
{isOpen && (
  <FocusScope contain restoreFocus>
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={m.command_palette_label()}
        data-modal="true"
        className="w-full max-w-lg rounded-lg bg-slate-800 shadow-2xl border border-slate-700 forced-colors:border-[ButtonText]"
      >
        {/* PRESERVE: copy the exact existing search input and list JSX here —
            DO NOT write {/* ...placeholder... */}. Read CommandPalette.tsx in full
            and reproduce its search input, filtered list rendering, and keyboard
            navigation handlers inside this dialog div. */}
      </div>
    </div>
  </FocusScope>
)}
```

The complete updated file should preserve all existing items logic (allItems, filtered items, keyboard navigation, action execution) while adding the modal semantics and FocusScope wrapper.

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/components/common/CommandPalette.tsx
git commit -m "feat(nav): add role=dialog, aria-modal, focus trap to CommandPalette

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: SectionHeader — remove CommandPalette trigger

**Files:**
- Modify: `src/components/layout/SectionHeader.tsx`

**Reference:** spec §6 (Variant C) — CommandPalette trigger moves to each panel's first zone. SectionHeader keeps only section title + settings button.

- [ ] **Step 1: Update SectionHeader.tsx**

Read current `src/components/layout/SectionHeader.tsx` (24 lines) and remove the CommandPalette trigger button. Keep only the section title. The settings button (Ctrl+,) in ActivityBar is already handled separately, so SectionHeader just renders the heading:

```tsx
// src/components/layout/SectionHeader.tsx
import * as m from "../../i18n/paraglide/messages";
import type { Section } from "../../stores/navigation"; // Section type lives here, NOT in App.tsx

interface Props {
  section: Section;
}

// Section type includes schedule and songs — SECTION_LABELS must be exhaustive
const SECTION_LABELS: Record<Section, () => string> = {
  streams: m.streams_section,
  browser: m.browser_section,
  wishlist: m.wishlist_section,
  schedule: m.schedule_section,
  songs: m.songs_section,
};

export function SectionHeader({ section }: Props) {
  return (
    <header className="flex items-center border-b border-slate-700 px-4 py-2 forced-colors:border-[ButtonText]">
      <h1 className="text-sm font-semibold text-slate-200">
        {SECTION_LABELS[section]()}
      </h1>
    </header>
  );
}
```

**Note:** The current `SectionHeader.tsx` takes `title: string`. This task changes it to `section: Section`. The App.tsx step (Task 6) already updates the call site to `<SectionHeader section={activeSection} />`. The `Section` type is defined in `src/stores/navigation.ts` — import from there, not from `App.tsx`.

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/components/layout/SectionHeader.tsx
git commit -m "feat(nav): remove CommandPalette trigger from SectionHeader (moves to panels)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 3: ActivityBar + StatusBar + PlayerPanel

### Task 9: ActivityBar — roving focus, aria-disabled

**Files:**
- Modify: `src/components/layout/ActivityBar.tsx`

**Reference:** spec §4 (ActivityBar) — `useRovingFocus` vertical composite-exit, `aria-disabled="true"` instead of React Aria `isDisabled`, no-op activation for disabled items, `forwardRef` exposing ZoneEntry.

- [ ] **Step 1: Update ActivityBar.tsx**

Read current `src/components/layout/ActivityBar.tsx` (66 lines). Apply these changes:

1. Convert to `forwardRef<ZoneEntry, { exitZone: (forward: boolean) => void }>` — expose `{ id, el, focus }` via `useImperativeHandle`
2. Keep the existing `useStore($activeSection)` and `$settingsDialogOpen.set(true)` patterns — do NOT convert these to props
3. Keep all 5 sections from the existing SECTIONS array (streams, browser, wishlist, schedule, songs). The first 3 are enabled; schedule and songs remain disabled (phase "3")
4. Keep Lucide React icons: `Radio, Globe, Heart, Calendar, Music, Settings` — do NOT replace with emoji
5. Apply `useRovingFocus` with `mode: 'composite-exit'` to all section buttons + settings button (vertical)
6. Keep `aria-description` on disabled section buttons (existing `m.phase_not_available({phase})` logic)
7. Add `data-zone-id="activity-bar"` to the `<nav>` element
8. Use `m.main_navigation()` for nav `aria-label` (this key already exists — do NOT invent `m.zone_activity_bar()`)

```tsx
// src/components/layout/ActivityBar.tsx — KEY CHANGES (preserve full existing logic)
import { forwardRef, useImperativeHandle, useRef } from "react";
import { Button } from "react-aria-components";
import { Radio, Globe, Heart, Calendar, Music, Settings } from "lucide-react";
import { useStore } from "@nanostores/react";
import { $activeSection, $settingsDialogOpen } from "../../stores/navigation";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { Section } from "../../stores/navigation";
import * as m from "../../i18n/paraglide/messages";

// Copy the existing SECTIONS array verbatim from ActivityBar.tsx — it has 5 items:
// streams (Radio), browser (Globe), wishlist (Heart), schedule (Calendar, disabled, phase "3"),
// songs (Music, disabled, phase "3")
// DO NOT reduce to 3 items.

const SECTIONS = [
  { id: "streams" as Section, label: m.streams_section, Icon: Radio },
  { id: "browser" as Section, label: m.browser_section, Icon: Globe },
  { id: "wishlist" as Section, label: m.wishlist_section, Icon: Heart },
  { id: "schedule" as Section, label: m.schedule_section, Icon: Calendar, disabled: true, phase: "3" },
  { id: "songs" as Section, label: m.songs_section, Icon: Music, disabled: true, phase: "3" },
] as const;

interface Props {
  exitZone: (forward: boolean) => void;
}

export const ActivityBar = forwardRef<ZoneEntry, Props>(({ exitZone }, ref) => {
  const activeSection = useStore($activeSection);
  const navRef = useRef<HTMLElement | null>(null);

  // IMPORTANT: useRef calls must be at the top level — not inside .map()
  // Create one ref per section + one for settings button (6 total):
  const ref0 = useRef<HTMLButtonElement | null>(null);
  const ref1 = useRef<HTMLButtonElement | null>(null);
  const ref2 = useRef<HTMLButtonElement | null>(null);
  const ref3 = useRef<HTMLButtonElement | null>(null);
  const ref4 = useRef<HTMLButtonElement | null>(null);
  const settingsRef = useRef<HTMLButtonElement | null>(null);
  const sectionRefs = [ref0, ref1, ref2, ref3, ref4];
  const allRefs = [...sectionRefs, settingsRef];

  const { onKeyDown, getTabIndex, restoreFocus } = useRovingFocus(
    allRefs,
    "vertical",
    { mode: "composite-exit", onTabOut: exitZone },
  );

  useImperativeHandle(ref, () => ({
    id: "activity-bar",
    get el() { return navRef.current!; },
    focus: restoreFocus,
  }));

  return (
    <nav
      ref={navRef}
      role="navigation"
      aria-label={m.main_navigation()}
      data-zone-id="activity-bar"
      className="flex flex-col gap-1 border-r border-slate-700 p-2 forced-colors:border-[ButtonText]"
      onKeyDown={onKeyDown}
    >
      {SECTIONS.map((sec, i) => (
        <Button
          key={sec.id}
          ref={sectionRefs[i]}
          aria-label={sec.label()}
          aria-pressed={activeSection === sec.id}
          aria-disabled={sec.disabled ? "true" : undefined}
          aria-description={sec.disabled ? m.phase_not_available({ phase: sec.phase! }) : undefined}
          tabIndex={getTabIndex(i)}
          onPress={() => {
            if (sec.disabled) return;
            $activeSection.set(sec.id);
          }}
          className={/* keep existing className logic from the original file */ `
            rounded p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400
            ${activeSection === sec.id
              ? "bg-slate-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-200 forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
            }
            ${sec.disabled ? "cursor-not-allowed opacity-50" : ""}
          `}
        >
          <sec.Icon size={20} />
        </Button>
      ))}
      <div className="mt-auto">
        <Button
          ref={settingsRef}
          aria-label={m.settings_title()}
          tabIndex={getTabIndex(SECTIONS.length)}
          onPress={() => $settingsDialogOpen.set(true)}
          className="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
        >
          <Settings size={20} />
        </Button>
      </div>
    </nav>
  );
});
ActivityBar.displayName = "ActivityBar";
```

**Notes:**
- The only NEW prop is `exitZone` — remove `activeSection`, `onSectionChange`, `onOpenSettings` props that the plan's first draft had; those are handled via stores.
- Verify the exact className strings from the original ActivityBar.tsx and preserve them.

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/components/layout/ActivityBar.tsx
git commit -m "feat(nav): ActivityBar — roving focus, aria-disabled, ZoneEntry ref

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: StatusBar — focusable segments, composite zone

**Files:**
- Modify: `src/components/layout/StatusBar.tsx`

**Reference:** spec §4 (StatusBar) — `data-zone-id="status-bar"`, `useRovingFocus` horizontal, focusable segment `<div>` elements with `aria-label`, inner live region preserved, announce on entry, `forwardRef` ZoneEntry.

- [ ] **Step 1: Update StatusBar.tsx**

Read current `src/components/layout/StatusBar.tsx` (48 lines — `role="status" aria-live="polite"` on footer element). Apply:

1. `forwardRef<ZoneEntry>` + `useImperativeHandle`
2. Change outer `<footer>` to NOT have `role="status"` (move live region to inner hidden `<span>`)
3. Add `data-zone-id="status-bar"` to `<footer>`
4. Create focusable segment `<div tabIndex={getTabIndex(i)} aria-label={...}>` elements
5. `useRovingFocus` horizontal composite-exit on segment refs
6. `announce(m.zone_status(), 'polite')` on entry via `restoreFocus`

```tsx
// src/components/layout/StatusBar.tsx
import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import { useStore } from "@nanostores/react";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { useAnnounce } from "../../hooks/useAnnounce";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { $statuses } from "../../stores/streams"; // ← CORRECT: $statuses from stores/streams
import { formatDuration } from "../../lib/formatters";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  exitZone: (forward: boolean) => void;
}

export const StatusBar = forwardRef<ZoneEntry, Props>(({ exitZone }, ref) => {
  const announce = useAnnounce();
  const statuses = useStore($statuses);
  const [tick, setTick] = useState(0);
  const footerRef = useRef<HTMLElement | null>(null);
  const seg0Ref = useRef<HTMLDivElement | null>(null); // recordings count
  const seg1Ref = useRef<HTMLDivElement | null>(null); // longest recording duration
  const segRefs = [seg0Ref, seg1Ref];

  // Re-read the existing StatusBar.tsx logic for activeStatuses, recordingCount,
  // longestMs, and the plural form computation — copy it verbatim:
  const activeStatuses = Object.values(statuses).filter((s) => s.state === "recording");
  const recordingCount = activeStatuses.length;

  useEffect(() => {
    if (recordingCount === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [recordingCount]);

  const longestMs = activeStatuses.reduce((max, s) => {
    if (!s.recordingStartedAt) return max;
    return Math.max(max, Date.now() - new Date(s.recordingStartedAt).getTime());
  }, 0);

  void tick; // suppress unused warning — triggers re-render

  // Plural form — matches existing StatusBar logic exactly
  const pluralRules = new Intl.PluralRules(document.documentElement.lang || "uk");
  const pluralForm = recordingCount === 0 ? "zero" : pluralRules.select(recordingCount);
  const recordingsText =
    pluralForm === "zero" ? m.recordings_count_zero() :
    pluralForm === "one"  ? m.recordings_count_one({ count: recordingCount }) :
    pluralForm === "few"  ? m.recordings_count_few({ count: recordingCount }) :
    m.recordings_count_many({ count: recordingCount });

  const { onKeyDown, getTabIndex, restoreFocus } = useRovingFocus(
    segRefs,
    "horizontal",
    { mode: "composite-exit", onTabOut: exitZone },
  );

  const restoreFocusWithAnnounce = (direction: 'forward' | 'backward') => {
    announce(m.zone_status(), 'polite');
    restoreFocus(direction);
  };

  useImperativeHandle(ref, () => ({
    id: "status-bar",
    get el() { return footerRef.current!; },
    focus: restoreFocusWithAnnounce,
  }));

  return (
    <footer
      ref={footerRef}
      data-zone-id="status-bar"
      className="flex items-center gap-4 border-t border-slate-700 px-4 py-1.5 text-xs text-slate-400 forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]"
      onKeyDown={onKeyDown}
    >
      {/* Hidden live region for NVDA — must remain */}
      <span role="status" aria-live="polite" className="sr-only" aria-atomic="true" />

      {/* Segment 0: recordings count */}
      <div
        ref={seg0Ref}
        tabIndex={getTabIndex(0)}
        aria-label={`${m.segment_longest_recording()}: ${recordingsText}`}
        className="cursor-default rounded px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
      >
        {recordingsText}
      </div>

      {/* Segment 1: longest recording duration (only shown when recording) */}
      {longestMs > 0 && (
        <div
          ref={seg1Ref}
          tabIndex={getTabIndex(1)}
          aria-label={`${m.segment_longest_recording()}: ${formatDuration(longestMs)}`}
          className="cursor-default rounded px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
        >
          {formatDuration(longestMs)}
        </div>
      )}
    </footer>
  );
});
StatusBar.displayName = "StatusBar";
```

**IMPORTANT notes:**
- Import `$statuses` from `../../stores/streams` — there is NO `stores/status` module.
- The two display segments are: (1) recordings count text using plural forms, (2) longest recording duration (only when `longestMs > 0`).
- Use `m.recordings_count_zero()`, `m.recordings_count_one({count})`, `m.recordings_count_few({count})`, `m.recordings_count_many({count})` — there is NO single `m.recordings_count()` key.
- Do NOT add a "free disk space" segment — StatusBar does not track this.
- The `segRefs` array has at most 2 refs but seg1 only renders conditionally. `useRovingFocus` always receives both refs; `getTabIndex(1)` returns -1 when seg1 is not focused.

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/components/layout/StatusBar.tsx
git commit -m "feat(nav): StatusBar — focusable segments, composite zone, ZoneEntry ref

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 11: PlayerPanel — mixed zone

**Files:**
- Modify: `src/components/player/PlayerPanel.tsx`

**Reference:** spec §4 (Player zone) — mixed zone, transport `useRovingFocus` mixed-boundary-handoff, sub-controls Tab sequence, `forwardRef` ZoneEntry.

- [ ] **Step 1: Update PlayerPanel.tsx**

Read current `src/components/player/PlayerPanel.tsx` (95 lines). Apply:

1. `forwardRef<ZoneEntry, { exitZone: (forward: boolean) => void }>` + `useImperativeHandle`
2. Add `data-zone-id="player"` to root `<div>`
3. Transport controls `<div role="toolbar">`: apply `useRovingFocus` with `mode: 'mixed-boundary-handoff'`:
   - `onTabBoundary(true)` → Tab from last transport button → focus position slider (call `positionSliderRef.current?.focus()`)
   - `onTabBoundary(false)` → Shift+Tab from first transport button → call `exitZone(false)` (exit Player backward)
4. `PlaybackPosition` and `VolumeSlider` are React Aria `Slider` components — they don't accept `onKeyDown` prop. Wrap each with a `<div onKeyDown>` to intercept Tab/Shift+Tab:

```tsx
// Transport toolbar — roving focus with mixed-boundary-handoff
const transportRovingRef = useRef<ReturnType<typeof useRovingFocus> | null>(null);
const playPauseRef = useRef<HTMLButtonElement | null>(null);
const stopRef = useRef<HTMLButtonElement | null>(null);
const positionSliderRef = useRef<HTMLElement | null>(null);
const volumeSliderRef = useRef<HTMLElement | null>(null);
const lastFocusedRef = useRef<'transport' | 'position' | 'volume'>('transport');

const { onKeyDown: transportKeyDown, getTabIndex, restoreFocus: restoreTransport } = useRovingFocus(
  [playPauseRef, stopRef],
  "horizontal",
  {
    mode: "mixed-boundary-handoff",
    onTabBoundary: (forward) => {
      if (forward) {
        lastFocusedRef.current = 'position';
        positionSliderRef.current?.focus();
      } else {
        exitZone(false); // Shift+Tab from first button exits zone backward
      }
    },
  },
);

const handlePositionKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    lastFocusedRef.current = 'volume';
    volumeSliderRef.current?.focus();
  } else if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault();
    lastFocusedRef.current = 'transport';
    restoreTransport('backward'); // return to last transport button
  }
};

const handleVolumeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    exitZone(true); // Tab from volume exits zone forward
  } else if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault();
    lastFocusedRef.current = 'position';
    positionSliderRef.current?.focus();
  }
};

// Focus memory for restoreFocus
const restoreFocusPlayer = (direction: 'forward' | 'backward') => {
  if (direction === 'backward' || lastFocusedRef.current === 'transport') {
    restoreTransport(direction);
  } else if (lastFocusedRef.current === 'position') {
    positionSliderRef.current?.focus();
  } else {
    volumeSliderRef.current?.focus();
  }
};
```

JSX structure:
```tsx
<div ref={playerRootRef} data-zone-id="player" ...>
  <div role="toolbar" aria-label={m.player_panel_label()} onKeyDown={transportKeyDown}>
    <Button ref={playPauseRef} tabIndex={getTabIndex(0)} ...>{/* play/pause */}</Button>
    <Button ref={stopRef} tabIndex={getTabIndex(1)} ...>{/* stop */}</Button>
  </div>
  <span>{/* source label — not focusable */}</span>
  {/* Wrap PlaybackPosition with a div to catch Tab keys */}
  <div ref={positionSliderRef as any} onKeyDown={handlePositionKeyDown} tabIndex={-1}>
    <PlaybackPosition />
  </div>
  {/* Wrap VolumeSlider with a div to catch Tab keys */}
  <div ref={volumeSliderRef as any} onKeyDown={handleVolumeKeyDown} tabIndex={-1}>
    <VolumeSlider />
  </div>
</div>
```

**Notes:**
- The React Aria `Slider` inside `PlaybackPosition`/`VolumeSlider` retains its own Left/Right arrow key handling — only Tab/Shift+Tab is intercepted by the wrapper div.
- Get the `positionSliderRef` by attaching to the wrapper div's `tabIndex={-1}` element (the slider's own focusable input lives inside — `tabIndex={-1}` on wrapper ensures focus() works when nothing inside is focused).

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/components/player/PlayerPanel.tsx
git commit -m "feat(nav): PlayerPanel — mixed zone, transport roving focus, ZoneEntry ref

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 4: Streams Panel

### Task 12: `StreamItem` — segment-based list item

**Files:**
- Create: `src/components/streams/StreamItem.tsx`

**Reference:** spec §4 (Streams screen zones) — dynamic segments, aria-labels, actions segment, context menu, confirm delete, all formerly in `StreamRow.tsx`.

The `StreamItem` renders a single `<li>` with focusable segment elements. Actions (record toggle, play toggle, delete) move from direct button handlers to data attributes. The `onAction` in the parent `StreamList` dispatches them.

- [ ] **Step 1: Create StreamItem.tsx**

```tsx
// src/components/streams/StreamItem.tsx
import { useEffect, useState, useRef } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { formatBitrate, formatDuration } from "../../lib/formatters";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { StreamContextMenu } from "./StreamContextMenu";
import { AddPatternDialog } from "../wishlist/AddPatternDialog";
import { $playerStatus } from "../../stores/player";
import * as m from "../../i18n/paraglide/messages";
import * as tauri from "../../lib/tauri";
import { $streams } from "../../stores/streams";
import { addToast } from "../../stores/toasts";
import { useAnnounce } from "../../hooks/useAnnounce";

export interface StreamItemData {
  id: string;
  /** Dynamic segment list — do NOT include 'summary'. */
  segments: Exclude<SegmentKind, 'summary'>[];
}

/** Compute the segment list for a stream based on its status. */
export function getStreamSegments(status: StreamStatus | undefined): StreamItemData['segments'] {
  const state = status?.state ?? "idle";
  const active = state === "recording" || state === "playing" || state === "connecting" || state === "reconnecting";
  return active ? ["track", "tech", "status", "actions"] : ["track", "tech", "actions"];
}

interface Props {
  stream: StreamInfo;
  status: StreamStatus | undefined;
  isFocused: (segment: 'summary' | SegmentKind) => boolean;
  /** Ref-setter for primary action — called by parent on Enter/Space on 'actions' segment. */
  onPrimaryAction: () => void;
  onContextMenu: () => void;
  onDelete: () => void;
}

export function StreamItem({ stream, status, isFocused, onPrimaryAction, onContextMenu, onDelete }: Props) {
  const state = status?.state ?? "idle";
  const isRecording = state === "recording";
  const playerStatus = useStore($playerStatus);
  const announce = useAnnounce();
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [patternDialog, setPatternDialog] = useState<{ listType: "wishlist" | "ignorelist"; initialPattern: string } | null>(null);
  const [, setTick] = useState(0);
  // NOTE: Do NOT add contextMenuRef — StreamContextMenu is NOT a forwardRef component.
  // It already has data-context-menu-trigger on its internal Button (line 64 of StreamContextMenu.tsx).
  // StreamList queries by [data-context-menu-trigger] attribute directly — no ref needed here.

  const isThisStreamPlaying =
    playerStatus.state !== "stopped" &&
    playerStatus.source?.type === "stream" &&
    playerStatus.source.streamId === stream.id;

  // Update elapsed time display while recording
  useEffect(() => {
    if (!isRecording || !status?.recordingStartedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording, status?.recordingStartedAt]);

  const elapsedMs = status?.recordingStartedAt
    ? Date.now() - new Date(status.recordingStartedAt).getTime()
    : 0;

  const handleRecordToggle = async () => {
    try {
      if (isRecording) await tauri.stopRecording(stream.id);
      else await tauri.startRecording(stream.id);
    } catch (err) { addToast(String(err), "error"); }
  };

  const handlePlayToggle = async () => {
    try {
      if (isThisStreamPlaying) await tauri.stopPlayback();
      else await tauri.playStream(stream.id);
    } catch (err) { addToast(String(err), "error"); }
  };

  const handleDelete = async () => {
    try {
      await tauri.removeStream(stream.id);
      $streams.set($streams.get().filter((s) => s.id !== stream.id));
      addToast(m.stream_removed({ name: stream.name }), "info");
    } catch (err) { addToast(String(err), "error"); }
    setShowConfirmDelete(false);
  };

  // Summary label computation
  const statusParts: string[] = [];
  if (isRecording) statusParts.push(m.status_recording());
  if (isThisStreamPlaying) statusParts.push(m.segment_playing());
  const summaryLabel = statusParts.length > 0
    ? `${statusParts.join(", ")}, ${stream.name}`
    : stream.name;

  // Track label
  const trackLabel = status?.currentTrack
    ? `${m.segment_track()}, ${status.currentTrack.artist} — ${status.currentTrack.title}`
    : `${m.segment_track()}, —`;

  // Tech label
  const techLabel = `${m.segment_tech()}, ${formatBitrate(stream.bitrate)}`;

  // Status label (only when active)
  const statusLabel = isRecording
    ? `${m.segment_status_duration()}, ${formatDuration(elapsedMs)}`
    : `${m.segment_status()}, ${m.segment_playing()}`;

  // Actions label — computed from actual available buttons
  const actionLabels = [
    isThisStreamPlaying ? m.stop_stream_playback() : m.play_stream(),
    isRecording ? m.stop_recording() : m.start_recording(),
    m.stream_context_menu(), // key already exists in uk.json — do NOT use m.context_menu?.()
  ];
  const actionsLabel = `${m.segment_actions()}: ${actionLabels.join(", ")}`;

  const segments = getStreamSegments(status);

  return (
    <li className="border-b border-slate-800 forced-colors:border-[ButtonText]">
      {/* Summary focus point */}
      <div
        data-item-id={stream.id}
        data-segment="summary"
        tabIndex={isFocused("summary") ? 0 : -1}
        aria-label={summaryLabel}
        className="flex items-center px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
      >
        <span className="font-medium text-slate-200">{stream.name}</span>
      </div>

      {/* Segments (hidden visually if not keyboard focused, but always in DOM) */}
      {segments.map((kind) => {
        if (kind === "track") return (
          <div
            key="track"
            data-item-id={stream.id}
            data-segment="track"
            tabIndex={isFocused("track") ? 0 : -1}
            aria-label={trackLabel}
            className="px-3 py-1 text-sm text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
          >
            {status?.currentTrack
              ? `${status.currentTrack.artist} — ${status.currentTrack.title}`
              : "—"}
          </div>
        );

        if (kind === "tech") return (
          <div
            key="tech"
            data-item-id={stream.id}
            data-segment="tech"
            tabIndex={isFocused("tech") ? 0 : -1}
            aria-label={techLabel}
            className="px-3 py-1 text-sm text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
          >
            {formatBitrate(stream.bitrate)}
          </div>
        );

        if (kind === "status") return (
          <div
            key="status"
            data-item-id={stream.id}
            data-segment="status"
            tabIndex={isFocused("status") ? 0 : -1}
            aria-label={statusLabel}
            className="px-3 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
          >
            {isRecording ? formatDuration(elapsedMs) : m.segment_playing()}
          </div>
        );

        if (kind === "actions") return (
          <div
            key="actions"
            data-item-id={stream.id}
            data-segment="actions"
            tabIndex={isFocused("actions") ? 0 : -1}
            aria-label={actionsLabel}
            className="flex gap-1 px-3 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
          >
            <button
              tabIndex={-1}
              onClick={handlePlayToggle}
              aria-label={isThisStreamPlaying ? m.stop_stream_playback() : m.play_stream()}
              className={`rounded px-2 py-0.5 text-xs ${isThisStreamPlaying ? "bg-blue-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]" : "bg-slate-700 text-slate-300 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"}`}
            >
              {isThisStreamPlaying ? "■" : "▶"}
            </button>
            <button
              tabIndex={-1}
              onClick={handleRecordToggle}
              aria-label={isRecording ? m.stop_recording() : m.start_recording()}
              className={`rounded px-2 py-0.5 text-xs ${isRecording ? "bg-red-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]" : "bg-slate-700 text-slate-300 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"}`}
            >
              {isRecording ? m.stop_recording() : m.start_recording()}
            </button>
            <StreamContextMenu
              stream={stream}
              status={status}
              onAddToWishlist={(track) => setPatternDialog({ listType: "wishlist", initialPattern: track })}
              onAddToIgnorelist={(track) => setPatternDialog({ listType: "ignorelist", initialPattern: track })}
              onDelete={() => setShowConfirmDelete(true)}
            />
          </div>
        );

        return null;
      })}

      {showConfirmDelete && createPortal(
        <ConfirmDialog
          title={m.remove_stream()}
          message={m.confirm_delete_stream({ name: stream.name })}
          onConfirm={handleDelete}
          onCancel={() => setShowConfirmDelete(false)}
        />,
        document.body
      )}
      {patternDialog && createPortal(
        <AddPatternDialog
          listType={patternDialog.listType}
          initialPattern={patternDialog.initialPattern}
          onSubmit={async (pattern) => {
            try {
              if (patternDialog.listType === "wishlist") await tauri.addToWishlist(pattern);
              else await tauri.addToIgnorelist(pattern);
              announce(m.announcement_pattern_added({ pattern }), "polite");
              setPatternDialog(null);
            } catch (err) { addToast(String(err), "error"); }
          }}
          onClose={() => setPatternDialog(null)}
        />,
        document.body
      )}
    </li>
  );
}
```

**Notes:**
- `StreamContextMenu` is NOT a forwardRef component — do NOT pass `ref` to it. It already has `data-context-menu-trigger` on its internal Button. `StreamList` will query `[data-context-menu-trigger]` directly.
- The `onPrimaryAction`, `onContextMenu`, `onDelete` props on `StreamItem` are declared in the interface but actions are self-contained inside StreamItem. These props exist for potential parent override — leave them in the interface but StreamItem handles actions internally.
- `m.stream_context_menu()` already exists in uk.json — use it directly (no optional chaining).
- `m.segment_status()` key is added in Task 5 — no optional chaining needed.

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/components/streams/StreamItem.tsx
git commit -m "feat(nav): add StreamItem with segment-based focus model

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 13: `StreamList` — composite list zone

**Files:**
- Create: `src/components/streams/StreamList.tsx`

**Reference:** spec §4 (streams-list zone) — `useCompositeList`, exposes ZoneEntry via `useImperativeHandle`.

- [ ] **Step 1: Create StreamList.tsx**

```tsx
// src/components/streams/StreamList.tsx
import { forwardRef, useImperativeHandle } from "react";
import { useStore } from "@nanostores/react";
import { $streams, $statuses } from "../../stores/streams";
import { useCompositeList } from "../../hooks/useCompositeList";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { StreamItem, getStreamSegments } from "./StreamItem";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { useState } from "react";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  exitZone: (forward: boolean) => void;
  onEmpty: () => void;
}

export const StreamList = forwardRef<ZoneEntry, Props>(({ exitZone, onEmpty }, ref) => {
  const streams = useStore($streams);
  const statuses = useStore($statuses);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Build items with dynamic segments
  const items = streams.map((s) => ({
    id: s.id,
    segments: getStreamSegments(statuses[s.id]),
  }));

  const { listRef, onKeyDown, isFocused, restoreFocus, activeItemId, activeSegment } =
    useCompositeList({
      zoneId: "streams-list",
      items,
      onTabOut: exitZone,
      onEmpty,
      onAction: (type, itemId, segment) => {
        if (type === "delete") {
          setPendingDeleteId(itemId);
          return;
        }
        if (type === "contextMenu") {
          // Trigger the context menu button inside the item
          const menuBtn = listRef.current?.querySelector<HTMLButtonElement>(
            `[data-item-id="${CSS.escape(itemId)}"] [data-context-menu-trigger]`
          );
          menuBtn?.click();
          return;
        }
        if (type === "primary" || (type === "toggle" && segment !== "actions")) {
          // Primary = record toggle (default primary for streams)
          const stream = streams.find((s) => s.id === itemId);
          if (!stream) return;
          const status = statuses[itemId];
          const isRecording = status?.state === "recording";
          const action = segment === "actions" || segment === "summary"
            ? (isRecording ? tauri.stopRecording(itemId) : tauri.startRecording(itemId))
            : Promise.resolve();
          action.catch((err) => addToast(String(err), "error"));
        }
      },
    });

  useImperativeHandle(ref, () => ({
    id: "streams-list",
    get el() { return listRef.current!; },
    focus: restoreFocus,
  }));

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    const streamName = streams.find(s => s.id === pendingDeleteId)?.name ?? "";
    try {
      await tauri.removeStream(pendingDeleteId);
      // Use the statically imported $streams — do NOT use dynamic import() here
      $streams.set($streams.get().filter((s) => s.id !== pendingDeleteId));
      addToast(m.stream_removed({ name: streamName }), "info");
    } catch (err) { addToast(String(err), "error"); }
    setPendingDeleteId(null);
  };

  return (
    <>
      <ul
        ref={listRef}
        data-zone-id="streams-list"
        aria-label={m.zone_streams_list()}
        role="list"
        className="flex-1 overflow-auto"
        onKeyDown={onKeyDown}
      >
        {streams.map((stream) => (
          <StreamItem
            key={stream.id}
            stream={stream}
            status={statuses[stream.id]}
            isFocused={(segment) => isFocused(stream.id, segment)}
            onPrimaryAction={() => {
              const isRecording = statuses[stream.id]?.state === "recording";
              if (isRecording) tauri.stopRecording(stream.id).catch((e) => addToast(String(e), "error"));
              else tauri.startRecording(stream.id).catch((e) => addToast(String(e), "error"));
            }}
            onContextMenu={() => {
              const menuBtn = listRef.current?.querySelector<HTMLButtonElement>(
                `[data-item-id="${CSS.escape(stream.id)}"] [data-context-menu-trigger]`
              );
              menuBtn?.click();
            }}
            onDelete={() => setPendingDeleteId(stream.id)}
          />
        ))}
      </ul>
      {pendingDeleteId && createPortal(
        <ConfirmDialog
          title={m.remove_stream()}
          message={m.confirm_delete_stream({ name: streams.find(s => s.id === pendingDeleteId)?.name ?? "" })}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />,
        document.body
      )}
    </>
  );
});
StreamList.displayName = "StreamList";
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/components/streams/StreamList.tsx
git commit -m "feat(nav): add StreamList with useCompositeList and ZoneEntry ref

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 14: `StreamsPanel` — zone registration, actions zone, empty state

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx`

**Reference:** spec §4 (streams-actions zone, streams-empty zone) — CommandPalette trigger moves here, two zones registered via `onZonesChange`, empty-state zone with CTA + `aria-describedby`.

- [ ] **Step 1: Update StreamsPanel.tsx**

Read current `src/components/streams/StreamsPanel.tsx` (91 lines). Replace `<StreamTable>` with `<StreamList>` and add zone wiring:

```tsx
// src/components/streams/StreamsPanel.tsx — key structural changes

// 1. Accept props: onZonesChange, exitZone
interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

// 2. Use refs for actions zone and list zone
const actionsZoneRef = useRef<HTMLDivElement | null>(null);
const actionsRovingRef = /* useRovingFocus on toolbar buttons */;
const listZoneRef = useRef<ZoneEntry | null>(null);
const streamListRef = useRef<ZoneEntry | null>(null); // from forwardRef on StreamList

// 3. Register zones whenever streams.length changes (empty vs non-empty)
useEffect(() => {
  const streams = $streams.get();
  if (streams.length === 0) {
    // Only the empty-state zone
    onZonesChange([emptyStateZone]);
  } else {
    // Actions zone + list zone
    onZonesChange([actionsZone, streamListRef.current].filter(Boolean));
  }
}, [streams.length]);

// 4. Empty state zone: composite zone with CTA + CommandPalette trigger
// CTA button has autoFocus, aria-describedby pointing to hidden description span

// 5. Actions zone toolbar: CommandPalette trigger + Add Stream + Stop All
// useRovingFocus horizontal composite-exit on these 3 buttons
// data-zone-id="streams-actions"
```

Full structural outline for `StreamsPanel.tsx`:

```tsx
import { forwardRef, useEffect, useImperativeHandle, useRef, useCallback } from "react";
import { useStore } from "@nanostores/react";
import { $streams, $showAddStreamDialog } from "../../stores/streams";
import { $commandPaletteOpen } from "../../stores/navigation";
import { StreamList } from "./StreamList";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

export function StreamsPanel({ onZonesChange, exitZone }: Props) {
  const streams = useStore($streams);
  const isEmpty = streams.length === 0;

  // === Actions zone refs ===
  const actionsZoneRef = useRef<HTMLDivElement | null>(null);
  const paletteBtn = useRef<HTMLButtonElement | null>(null);
  const addBtn = useRef<HTMLButtonElement | null>(null);
  const stopAllBtn = useRef<HTMLButtonElement | null>(null);
  const actionsBtns = [paletteBtn, addBtn, stopAllBtn];

  const { onKeyDown: actionsKeyDown, getTabIndex: actionsTabIndex, restoreFocus: actionsRestore } =
    useRovingFocus(actionsBtns, "horizontal", {
      mode: "composite-exit",
      onTabOut: (forward) => exitZone("streams-actions", forward),
    });

  const actionsZone: ZoneEntry = {
    id: "streams-actions",
    get el() { return actionsZoneRef.current!; },
    focus: actionsRestore,
  };

  // === List zone (forwardRef from StreamList) ===
  const streamListRef = useRef<ZoneEntry | null>(null);

  // === Empty-state zone ===
  const emptyZoneRef = useRef<HTMLDivElement | null>(null);
  const emptyCtaRef = useRef<HTMLButtonElement | null>(null);
  const emptyPaletteBtnRef = useRef<HTMLButtonElement | null>(null);
  const emptyBtns = [emptyPaletteBtnRef, emptyCtaRef];
  const { onKeyDown: emptyKeyDown, getTabIndex: emptyTabIndex, restoreFocus: emptyRestore } =
    useRovingFocus(emptyBtns, "horizontal", {
      mode: "composite-exit",
      onTabOut: (forward) => exitZone("streams-empty", forward),
    });
  const emptyZone: ZoneEntry = {
    id: "streams-empty",
    get el() { return emptyZoneRef.current!; },
    focus: (dir) => {
      if (dir === 'forward') emptyCtaRef.current?.focus();
      else (emptyPaletteBtnRef.current ?? emptyCtaRef.current)?.focus();
    },
  };

  // Register zones whenever empty state changes
  useEffect(() => {
    if (isEmpty) {
      onZonesChange([emptyZone]);
    } else {
      const zones: ZoneEntry[] = [actionsZone];
      if (streamListRef.current) zones.push(streamListRef.current);
      onZonesChange(zones);
    }
  // Re-run when streams go empty/non-empty, or when list zone ref populates
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmpty]);

  const handleStopAll = async () => {
    try { await tauri.stopAllRecordings(); }
    catch (err) { addToast(String(err), "error"); }
  };

  const emptyDescId = "streams-empty-desc";

  return (
    <div className="flex flex-1 flex-col overflow-hidden" role="region" aria-label={m.streams_section()}>
      {isEmpty ? (
        <div
          ref={emptyZoneRef}
          data-zone-id="streams-empty"
          className="flex flex-1 flex-col items-center justify-center gap-4"
          onKeyDown={emptyKeyDown}
        >
          <span id={emptyDescId} className="sr-only">{m.streams_empty_description()}</span>
          <button
            ref={emptyPaletteBtnRef}
            tabIndex={emptyTabIndex(0)}
            aria-label={m.command_palette_label()}
            onClick={() => $commandPaletteOpen.set(true)}
            className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
          >
            {m.command_palette_label()}
          </button>
          <button
            ref={emptyCtaRef}
            tabIndex={emptyTabIndex(1)}
            autoFocus
            aria-describedby={emptyDescId}
            onClick={() => $showAddStreamDialog.set(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
          >
            {m.add_stream()}
          </button>
        </div>
      ) : (
        <>
          {/* Actions toolbar zone */}
          <div
            ref={actionsZoneRef}
            data-zone-id="streams-actions"
            role="toolbar"
            aria-label={m.zone_streams_actions()}
            className="flex items-center gap-2 border-b border-slate-700 px-4 py-2 forced-colors:border-[ButtonText]"
            onKeyDown={actionsKeyDown}
          >
            <button
              ref={paletteBtn}
              tabIndex={actionsTabIndex(0)}
              aria-label={m.command_palette_label()}
              onClick={() => $commandPaletteOpen.set(true)}
              className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              &gt;_
            </button>
            <button
              ref={addBtn}
              tabIndex={actionsTabIndex(1)}
              onClick={() => $showAddStreamDialog.set(true)}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
            >
              {m.add_stream()}
            </button>
            <button
              ref={stopAllBtn}
              tabIndex={actionsTabIndex(2)}
              onClick={handleStopAll}
              className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.stop_all()}
            </button>
          </div>

          {/* List zone */}
          <StreamList
            ref={(zone) => {
              streamListRef.current = zone;
              // Re-register zones whenever StreamList mounts/unmounts
              if (zone) {
                onZonesChange([actionsZone, zone]);
              }
            }}
            exitZone={(forward) => exitZone("streams-list", forward)}
            onEmpty={() => {
              // items went to zero — handled by isEmpty effect above
            }}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/components/streams/StreamsPanel.tsx
git commit -m "feat(nav): StreamsPanel — zone registration, actions toolbar, empty-state zone

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 15: Delete StreamTable and StreamRow

**Files:**
- Delete: `src/components/streams/StreamTable.tsx`
- Delete: `src/components/streams/StreamRow.tsx`

- [ ] **Step 1: Delete files**

```
git rm src/components/streams/StreamTable.tsx src/components/streams/StreamRow.tsx
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git commit -m "feat(nav): remove StreamTable and StreamRow (replaced by StreamList/StreamItem)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 5: Browser Panel

### Task 16: `StationList` — browser results composite zone

**Files:**
- Create: `src/components/browser/StationList.tsx`

**Reference:** spec §4 (Browser screen zones — browser-results) — `useCompositeList`, segments: `['metadata', 'actions']`, add action with live announce. Replaces `StationTable`.

- [ ] **Step 1: Create StationList.tsx**

```tsx
// src/components/browser/StationList.tsx
import { forwardRef, useImperativeHandle, useCallback } from "react";
import { useStore } from "@nanostores/react";
import { $streams } from "../../stores/streams";
import { addStation } from "../../stores/browser";
import { useCompositeList, type SegmentKind } from "../../hooks/useCompositeList";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { StationResult } from "../../lib/tauri";
import { useAnnounce } from "../../hooks/useAnnounce";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  stations: StationResult[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore?: () => void;
  emptyMessage: string;
  exitZone: (forward: boolean) => void;
}

const STATION_SEGMENTS: Exclude<SegmentKind, 'summary'>[] = ["metadata", "actions"];

export const StationList = forwardRef<ZoneEntry, Props>(
  ({ stations, loading, error, hasMore, onLoadMore, emptyMessage, exitZone }, ref) => {
    const streams = useStore($streams);
    const announce = useAnnounce();

    const existingUrls = new Set(streams.map((s) => s.url));
    const isAlreadyAdded = (station: StationResult) =>
      existingUrls.has(station.urlResolved || station.url);

    const items = stations.map((s) => ({ id: s.stationuuid, segments: STATION_SEGMENTS }));

    const { listRef, onKeyDown, isFocused, restoreFocus } = useCompositeList({
      zoneId: "browser-results",
      items,
      onTabOut: exitZone,
      onAction: async (type, itemId, segment) => {
        if (type !== "primary" && !(type === "toggle" && segment !== "actions")) return;
        const station = stations.find((s) => s.stationuuid === itemId);
        if (!station || isAlreadyAdded(station)) return;
        try {
          await addStation(station);
          announce(m.browser_station_added({ name: station.name }), "polite");
        } catch (err) {
          addToast(String(err), "error");
        }
      },
    });

    useImperativeHandle(ref, () => ({
      id: "browser-results",
      get el() { return listRef.current!; },
      focus: restoreFocus,
    }));

    if (loading) return (
      <div role="status" aria-live="polite" className="p-4 text-sm text-slate-400">
        {m.browser_loading()}
      </div>
    );
    if (error) return (
      <div role="alert" className="p-4 text-sm text-red-400">{error}</div>
    );
    if (stations.length === 0) return (
      <div role="status" className="p-4 text-center text-sm text-slate-500">{emptyMessage}</div>
    );

    return (
      <ul
        ref={listRef}
        data-zone-id="browser-results"
        role="list"
        aria-label={m.zone_browser_results()}
        className="flex-1 overflow-auto"
        onKeyDown={onKeyDown}
      >
        {stations.map((station) => {
          const added = isAlreadyAdded(station);
          const metaLabel = `${m.segment_metadata()}: ${[
            station.country,
            station.codec,
            station.bitrate ? `${station.bitrate} кбіт/с` : null,
            station.clickcount ? String(station.clickcount) : null,
          ].filter(Boolean).join(", ")}`;
          const actionsLabel = `${m.segment_actions()}: ${added ? m.browser_added() : m.add_stream()}`;

          return (
            <li key={station.stationuuid} className="border-b border-slate-800 forced-colors:border-[ButtonText]">
              {/* Summary */}
              <div
                data-item-id={station.stationuuid}
                data-segment="summary"
                tabIndex={isFocused(station.stationuuid, "summary") ? 0 : -1}
                aria-label={station.name}
                className="px-3 py-2 font-medium text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                {station.name}
              </div>

              {/* Metadata segment */}
              <div
                data-item-id={station.stationuuid}
                data-segment="metadata"
                tabIndex={isFocused(station.stationuuid, "metadata") ? 0 : -1}
                aria-label={metaLabel}
                className="px-3 py-1 text-sm text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                {[station.country, station.codec, station.bitrate && `${station.bitrate} kbps`].filter(Boolean).join(" · ")}
              </div>

              {/* Actions segment */}
              <div
                data-item-id={station.stationuuid}
                data-segment="actions"
                tabIndex={isFocused(station.stationuuid, "actions") ? 0 : -1}
                aria-label={actionsLabel}
                className="px-3 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                <button
                  tabIndex={-1}
                  disabled={added}
                  aria-label={added ? m.browser_added() : m.add_stream()}
                  onClick={async () => {
                    if (added) return;
                    try {
                      await addStation(station);
                      announce(m.browser_station_added({ name: station.name }), "polite");
                    } catch (err) { addToast(String(err), "error"); }
                  }}
                  className={`rounded px-2 py-0.5 text-xs ${added ? "cursor-not-allowed text-slate-600" : "bg-blue-600 text-white hover:bg-blue-700 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"}`}
                >
                  {added ? m.browser_added() : m.add_stream()}
                </button>
              </div>
            </li>
          );
        })}
        {hasMore && onLoadMore && (
          <li>
            <button
              onClick={onLoadMore}
              className="w-full py-2 text-sm text-slate-400 hover:bg-slate-800"
            >
              {m.browser_load_more()}
            </button>
          </li>
        )}
      </ul>
    );
  },
);
StationList.displayName = "StationList";
```

**Note:** The key `m.browser_added()` exists in uk.json as `"✓ Додано"`. The key `m.browser_load_more()` exists as `"Завантажити ще"`. The key `m.browser_loading()` exists as `"Пошук станцій..."`. Do NOT use optional chaining `?.()` on any of these — they are all confirmed present. Do NOT invent `m.loading`, `m.load_more`, `m.already_added`, or `m.listeners` — those keys do not exist.

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/components/browser/StationList.tsx
git commit -m "feat(nav): add StationList with useCompositeList and ZoneEntry ref

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 17: `BrowserPanel` + `SearchForm` — zone registration + form boundary

**Files:**
- Modify: `src/components/browser/BrowserPanel.tsx`
- Modify: `src/components/browser/SearchForm.tsx`

**Reference:** spec §4 (Browser screen zones — browser-search form zone, browser-results list zone) — `useFocusBoundary` on SearchForm, `refreshBoundary()` after filters load, `onZonesChange`.

- [ ] **Step 1: Update SearchForm.tsx**

Read current `src/components/browser/SearchForm.tsx`. Add:
1. `data-zone-id="browser-search"` on the form container
2. Accept `formRef: RefObject<HTMLDivElement>` + `exitZone` props
3. Apply `useFocusBoundary(formRef, exitZone)` — returns `refreshBoundary`
4. Expose `refreshBoundary` via `forwardRef` if needed, OR simply accept it as a prop

Simplest approach: `SearchForm` accepts `containerRef` and `exitZone` and calls `useFocusBoundary` internally.

```tsx
// SearchForm additions:
interface SearchFormProps {
  containerRef?: React.RefObject<HTMLDivElement | null>;
  exitZone?: (forward: boolean) => void;
  onBoundaryReady?: (refresh: () => void) => void;
}
// Inside component:
const { refreshBoundary } = useFocusBoundary(containerRef ?? internalRef, exitZone ?? (() => {}));
// After filters load:
useEffect(() => { refreshBoundary(); }, [filters]);
// Expose refreshBoundary to parent via onBoundaryReady callback
useEffect(() => { onBoundaryReady?.(refreshBoundary); }, [refreshBoundary]);
```

- [ ] **Step 2: Update BrowserPanel.tsx**

Read the full current `src/components/browser/BrowserPanel.tsx` (61 lines). Apply these changes:

1. Replace `import { StationTable } from "./StationTable"` with `import { StationList } from "./StationList"`
2. Replace `<StationTable ...>` with `<StationList ...>` in JSX
3. Accept `onZonesChange` and `exitZone` props
4. Wire zones: SearchForm container → search zone; StationList ref → results zone

The `useFocusBoundary` approach for SearchForm's `restoreFocus`:

```tsx
// BrowserPanel.tsx additions:
import { useFocusBoundary } from "../../hooks/useFocusBoundary";

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

export function BrowserPanel({ onZonesChange, exitZone }: Props) {
  // ... existing store subscriptions and state (preserve all $searchResults, $searchLoading, etc.)

  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  // useFocusBoundary returns both refreshBoundary AND restoreFocus
  const { refreshBoundary, restoreFocus: searchRestoreFocus } = useFocusBoundary(
    searchContainerRef,
    (forward) => exitZone("browser-search", forward),
  );

  const searchZone: ZoneEntry = {
    id: "browser-search",
    get el() { return searchContainerRef.current!; },
    focus: searchRestoreFocus, // ← restoreFocus from useFocusBoundary — NOT undefined
  };

  const resultsListRef = useRef<ZoneEntry | null>(null);

  // Register zones on mount and whenever results appear/disappear
  useEffect(() => {
    const zones: ZoneEntry[] = [searchZone];
    if (resultsListRef.current) zones.push(resultsListRef.current);
    onZonesChange(zones);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-hidden" role="region" aria-label={m.browser_section()}>
      {/* Search zone — form type */}
      <div ref={searchContainerRef} data-zone-id="browser-search">
        {/* CommandPalette trigger (first element in zone) */}
        <button
          aria-label={m.command_palette_label()}
          onClick={() => $commandPaletteOpen.set(true)}
          className="..."
        >
          &gt;_
        </button>
        <SearchForm
          exitZone={(forward) => exitZone("browser-search", forward)}
          onFiltersReady={refreshBoundary}
        />
      </div>

      {/* Results list zone */}
      <StationList
        ref={(z) => {
          resultsListRef.current = z;
          if (z) onZonesChange([searchZone, z]);
        }}
        stations={useStore($searchResults) or useStore($popularStations) /* whichever is active */}
        loading={...}
        error={...}
        hasMore={...}
        onLoadMore={loadMore}
        emptyMessage={m.browser_empty()}
        exitZone={(forward) => exitZone("browser-results", forward)}
      />
    </div>
  );
}
```

**Important notes:**
- `useFocusBoundary` returns `{ refreshBoundary, restoreFocus }` — both are needed. `restoreFocus` is the `searchZone.focus` function.
- `SearchForm` needs an `onFiltersReady` (or similar) callback that calls `refreshBoundary` after select options load — so the boundary scanner re-discovers newly enabled focusable elements.
- Copy all existing store subscriptions from `BrowserPanel.tsx` verbatim (`$searchResults`, `$searchLoading`, `$searchError`, `$popularStations`, `$popularLoading`, `$popularError`, `$hasMore`, `$isSearchActive`, `loadFilters`, `loadPopularStations`, `loadMore`).
- Delete the `import { StationTable }` line — Task 18 will `git rm` the file.

- [ ] **Step 3: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```
git add src/components/browser/BrowserPanel.tsx src/components/browser/SearchForm.tsx
git commit -m "feat(nav): BrowserPanel/SearchForm — zone registration, form boundary, refreshBoundary

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 18: Delete StationTable

**Files:**
- Delete: `src/components/browser/StationTable.tsx`

- [ ] **Step 1: Delete file**

```
git rm src/components/browser/StationTable.tsx
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git commit -m "feat(nav): remove StationTable (replaced by StationList)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 6: Wishlist Panel

### Task 19: `PatternList` — wishlist/ignorelist composite zone

**Files:**
- Create: `src/components/wishlist/PatternList.tsx`

**Reference:** spec §4 (Wishlist/Ignorelist screen zones — wishlist-list) — segments `['conditions', 'actions']`, edit and delete actions. Replaces `PatternTable`.

- [ ] **Step 1: Create PatternList.tsx**

```tsx
// src/components/wishlist/PatternList.tsx
import { forwardRef, useImperativeHandle, useState } from "react";
import { createPortal } from "react-dom";
import { useCompositeList, type SegmentKind } from "../../hooks/useCompositeList";
import { ConfirmDialog } from "../common/ConfirmDialog";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as m from "../../i18n/paraglide/messages";

interface PatternItem {
  pattern: string;
  addedAt?: string;
}

interface Props {
  items: PatternItem[];
  ariaLabel: string;
  showDate: boolean;
  emptyMessage: string;
  exitZone: (forward: boolean) => void;
  onEmpty: () => void;
  onEdit: (pattern: string) => void;
  onRemove: (pattern: string) => void;
}

const PATTERN_SEGMENTS: Exclude<SegmentKind, 'summary'>[] = ["conditions", "actions"];

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(); }
  catch { return iso; }
}

export const PatternList = forwardRef<ZoneEntry, Props>(
  ({ items, ariaLabel, showDate, emptyMessage, exitZone, onEmpty, onEdit, onRemove }, ref) => {
    const listItems = items.map((item) => ({ id: item.pattern, segments: PATTERN_SEGMENTS }));
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const { listRef, onKeyDown, isFocused, restoreFocus } = useCompositeList({
      zoneId: "wishlist-list",
      items: listItems,
      onTabOut: exitZone,
      onEmpty,
      onAction: (type, itemId, segment) => {
        if (type === "delete") {
          // Show confirmation dialog — do NOT call onRemove directly
          setConfirmDelete(itemId);
          return;
        }
        if (type === "primary" || (type === "toggle" && segment !== "actions")) {
          // Primary = edit
          onEdit(itemId);
        }
      },
    });

    useImperativeHandle(ref, () => ({
      id: "wishlist-list",
      get el() { return listRef.current!; },
      focus: restoreFocus,
    }));

    if (items.length === 0) {
      return (
        <div role="status" className="py-4 text-center text-sm text-slate-500">
          {emptyMessage}
        </div>
      );
    }

    return (
      <>
      <ul
        ref={listRef}
        data-zone-id="wishlist-list"
        role="list"
        aria-label={ariaLabel}
        className="flex-1 overflow-auto"
        onKeyDown={onKeyDown}
      >
        {items.map((item) => {
          const conditionsLabel = showDate && item.addedAt
            ? `${m.segment_conditions()}: ${m.column_added_at()}, ${formatDate(item.addedAt)}`
            : `${m.segment_conditions()}: ${m.empty_conditions()}`; // key added in Task 5
          const actionsLabel = `${m.segment_actions()}: ${m.edit_pattern()}, ${m.remove_pattern()}`;

          return (
            <li key={item.pattern} className="border-b border-slate-800 forced-colors:border-[ButtonText]">
              {/* Summary */}
              <div
                data-item-id={item.pattern}
                data-segment="summary"
                tabIndex={isFocused(item.pattern, "summary") ? 0 : -1}
                aria-label={item.pattern}
                className="px-3 py-2 font-mono text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                {item.pattern}
              </div>

              {/* Conditions segment */}
              <div
                data-item-id={item.pattern}
                data-segment="conditions"
                tabIndex={isFocused(item.pattern, "conditions") ? 0 : -1}
                aria-label={conditionsLabel}
                className="px-3 py-1 text-sm text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                {showDate && item.addedAt ? formatDate(item.addedAt) : "—"}
              </div>

              {/* Actions segment */}
              <div
                data-item-id={item.pattern}
                data-segment="actions"
                tabIndex={isFocused(item.pattern, "actions") ? 0 : -1}
                aria-label={actionsLabel}
                className="flex justify-end gap-1 px-3 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                <button
                  tabIndex={-1}
                  onClick={() => onEdit(item.pattern)}
                  aria-label={`${m.edit_pattern()}: ${item.pattern}`}
                  className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300"
                >
                  ✎
                </button>
                <button
                  tabIndex={-1}
                  onClick={() => setConfirmDelete(item.pattern)}
                  aria-label={`${m.remove_pattern()}: ${item.pattern}`}
                  className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300"
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {/* Confirm delete dialog — mirrors PatternTable's ConfirmDialog pattern */}
      {confirmDelete && createPortal(
        <ConfirmDialog
          title={m.remove_pattern()}
          message={m.confirm_remove_pattern({ pattern: confirmDelete })}
          onConfirm={() => { onRemove(confirmDelete); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />,
        document.body,
      )}
      </>
    );
  },
);
PatternList.displayName = "PatternList";
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/components/wishlist/PatternList.tsx
git commit -m "feat(nav): add PatternList with useCompositeList and ZoneEntry ref

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 20: `WishlistPanel` — tabs, zone registration, CommandPalette trigger

**Files:**
- Modify: `src/components/wishlist/WishlistPanel.tsx`

**Reference:** spec §4 (Wishlist/Ignorelist — wishlist-controls form zone + wishlist-list composite zone) — React Aria `<Tabs>` for Wishlist/Ignorelist switching, `useFocusBoundary` on controls zone, `onZonesChange` prop, CommandPalette trigger in controls zone.

- [ ] **Step 1: Update WishlistPanel.tsx**

The current WishlistPanel renders two vertical sections (Wishlist + Ignorelist). The new version:
1. Wraps with React Aria `<Tabs>` — `<TabList>` contains Wishlist/Ignorelist tabs
2. Controls zone (`data-zone-id="wishlist-controls"`) = TabList + Add button + CommandPalette trigger; form zone type
3. Pattern list zone below = `<PatternList>` for the active tab's items
4. `onZonesChange` registered with both zones

```tsx
// WishlistPanel.tsx structural changes:

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

// Imports to add:
import { Tabs, TabList, Tab, TabPanel } from "react-aria-components";
import { PatternList } from "./PatternList";
import { useFocusBoundary } from "../../hooks/useFocusBoundary";
import { $commandPaletteOpen } from "../../stores/navigation";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";

// Inside component:
const [activeTab, setActiveTab] = useState<"wishlist" | "ignorelist">("wishlist");
const controlsRef = useRef<HTMLDivElement | null>(null);
const patternListRef = useRef<ZoneEntry | null>(null);

const { refreshBoundary, restoreFocus: controlsRestore } = useFocusBoundary(
  controlsRef,
  (forward) => exitZone("wishlist-controls", forward),
);

// Re-discover boundary when tab changes (TabList items change)
useEffect(() => { refreshBoundary(); }, [activeTab, refreshBoundary]);

const controlsZone: ZoneEntry = {
  id: "wishlist-controls",
  get el() { return controlsRef.current!; },
  focus: controlsRestore,
};

// Register zones on mount and when tab changes
useEffect(() => {
  const zones: ZoneEntry[] = [controlsZone];
  if (patternListRef.current) zones.push(patternListRef.current);
  onZonesChange(zones);
}, [activeTab]); // eslint-disable-line

// JSX structure:
return (
  <div className="flex flex-1 flex-col overflow-hidden" role="region" aria-label={m.wishlist_section()}>
    {/* Controls zone — form zone */}
    <div ref={controlsRef} data-zone-id="wishlist-controls" className="border-b border-slate-700 p-2">
      {/* CommandPalette trigger */}
      <button onClick={() => $commandPaletteOpen.set(true)} aria-label={m.command_palette_label()}>
        &gt;_
      </button>
      <Tabs selectedKey={activeTab} onSelectionChange={(k) => setActiveTab(k as "wishlist" | "ignorelist")}>
        <TabList aria-label={m.wishlist_section()}>
          <Tab id="wishlist">{m.wishlist_section_title()}</Tab>
          <Tab id="ignorelist">{m.ignorelist_section_title()}</Tab>
        </TabList>
        <TabPanel id="wishlist">
          {/* Add button for wishlist */}
          <Button onPress={() => setDialog({ mode: "add", listType: "wishlist" })}>
            {m.add_pattern()}
          </Button>
        </TabPanel>
        <TabPanel id="ignorelist">
          <Button onPress={() => setDialog({ mode: "add", listType: "ignorelist" })}>
            {m.add_pattern()}
          </Button>
        </TabPanel>
      </Tabs>
    </div>

    {/* Pattern list zone */}
    {activeTab === "wishlist" && (
      <PatternList
        ref={(z) => { patternListRef.current = z; if (z) onZonesChange([controlsZone, z]); }}
        items={wishlist.map((e) => ({ pattern: e.pattern, addedAt: e.addedAt }))}
        ariaLabel={m.wishlist_section_title()}
        showDate={true}
        emptyMessage={m.empty_wishlist()}
        exitZone={(forward) => exitZone("wishlist-list", forward)}
        onEmpty={() => { /* switch to empty-state zone if needed */ }}
        onEdit={(pattern) => setDialog({ mode: "edit", listType: "wishlist", pattern })}
        onRemove={handleRemoveWishlist}
      />
    )}
    {activeTab === "ignorelist" && (
      <PatternList
        ref={(z) => { patternListRef.current = z; if (z) onZonesChange([controlsZone, z]); }}
        items={ignorelist.map((p) => ({ pattern: p }))}
        ariaLabel={m.ignorelist_section_title()}
        showDate={false}
        emptyMessage={m.empty_ignorelist()}
        exitZone={(forward) => exitZone("wishlist-list", forward)}
        onEmpty={() => {}}
        onEdit={(pattern) => setDialog({ mode: "edit", listType: "ignorelist", pattern })}
        onRemove={handleRemoveIgnorelist}
      />
    )}

    {/* Dialog portal (same as current) */}
    {dialog && createPortal(
      <AddPatternDialog
        listType={dialog.listType}
        initialPattern={dialog.mode === "add" ? dialog.initialPattern : undefined}
        editingPattern={dialog.mode === "edit" ? dialog.pattern : undefined}
        onSubmit={handleDialogSubmit}
        onClose={() => setDialog(null)}
      />,
      document.body
    )}
  </div>
);
```

**IMPORTANT:** Keep all existing data-loading logic (`useEffect` for `getWishlist`/`getIgnorelist`), all handler functions (`handleAddWishlist`, `handleEditWishlist`, `handleRemoveWishlist`, etc.), and the `handleDialogSubmit` dispatch. Keep the `DialogState` type definition, the `dialog` state (`useState<DialogState | null>(null)`), and the `setDialog` setter — these are required for `AddPatternDialog` to work. Only change the rendering structure and add zone wiring.

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add src/components/wishlist/WishlistPanel.tsx
git commit -m "feat(nav): WishlistPanel — tabs, zone registration, CommandPalette trigger

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 21: Delete PatternTable

**Files:**
- Delete: `src/components/wishlist/PatternTable.tsx`

- [ ] **Step 1: Delete file**

```
git rm src/components/wishlist/PatternTable.tsx
```

- [ ] **Step 2: Final TypeScript verification**

```
npx tsc --noEmit
```

Expected: no errors (beyond pre-existing paraglide issues).

- [ ] **Step 3: Final commit**

```
git commit -m "feat(nav): remove PatternTable (replaced by PatternList)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Acceptance Verification

After all tasks are complete, verify against FRD §10:

1. **Zone cycling:** Press Tab in ActivityBar → moves to first screen zone. Press Tab again → moves to Player → StatusBar → wraps to ActivityBar. Press F6 → same cycling in forward direction. Shift+F6 → backward.
2. **No ARIA grid/table:** Search all `.tsx` files — `<Table>`, `<Row>`, `<Cell>` from react-aria-components must not appear in StreamsPanel, BrowserPanel, or WishlistPanel contexts.
3. **List navigation:** Arrow keys Up/Down move between items. Left/Right move between segments. Home/End jump to first/last item. PageUp/PageDown scroll by page.
4. **NVDA announces:** Segments produce correct labels (e.g. "Трек, Tycho — A Walk", "Бітрейт, 256 кбіт/с", "Дії: Відтворити, Почати запис, Меню").
5. **Focus preservation:** Section change → focus moves to first zone of new section. Dialog close → focus returns to opener. Item deletion → focus moves to nearest sibling.
6. **Modal focus trap:** Opening CommandPalette → Tab cycles only within palette. Escape → closes and returns focus to opener.
7. **High contrast:** All focusable elements show visible focus indicator in Windows High Contrast Mode.

```
npx tsc --noEmit
```
