import { useCallback, useLayoutEffect, useRef, useState, useEffect } from 'react';
import type React from 'react'; // for React.KeyboardEvent type

export type SegmentKind =
  | 'summary'
  | 'track'
  | 'tech'
  | 'status'
  | 'metadata'
  | 'country'
  | 'language'
  | 'codec'
  | 'bitrate'
  | 'genre'
  | 'popularity'
  | 'conditions'
  // Per-button action stops — each action button is its own focus stop,
  // reached via Left/Right and activated natively (Enter/Space/click).
  | 'action-play'
  | 'action-record'
  | 'action-menu' // streams / profiles
  | 'action-add' // browser results
  | 'action-edit'
  | 'action-delete' // wishlist / ignorelist / profiles
  // Profile rows
  | 'action-switch'
  | 'action-duplicate'
  | 'action-rename'
  | 'action-export';

export type ActionType = 'primary' | 'toggle' | 'delete';

/**
 * True when `el` is a native interactive control that handles its own
 * Enter/Space/click. When such a control is the active focus stop, the hook
 * stays out of the way: it does not preventDefault Enter/Space and does not
 * synthesize an onAction call, letting the browser activate the control.
 */
function isNativeControl(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === 'BUTTON' ||
    tag === 'INPUT' ||
    tag === 'SELECT' ||
    tag === 'TEXTAREA' ||
    (tag === 'A' && el.hasAttribute('href')) ||
    el.isContentEditable
  );
}

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
  /** Zone identifier — reserved for zone-system registration (Task 4 wires this up). */
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
 * DOM convention: every focus stop in the list must carry:
 *   data-item-id="<item.id>"
 *   data-segment="<SegmentKind>"
 * and a roving tabIndex (0 when active, -1 otherwise).
 *
 * Action buttons are first-class focus stops: render them as native <button>
 * elements with their own data-segment (e.g. 'action-play') and roving tabIndex.
 * They self-activate on Enter/Space/click; the hook only drives roving + arrow
 * navigation for them and will not synthesize onAction for activation keys while
 * a native control is focused.
 *
 * Vertical movement (Up/Down/Home/End/PageUp/PageDown) always lands on the
 * target item's 'summary' (whole-row) stop — the active segment is not carried
 * across rows.
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
  // Whether the list currently/recently owns focus. Used by live reconciliation
  // to tell "the active row was removed (recover focus)" apart from "the user
  // tabbed away on purpose (leave focus alone)".
  const hasFocusRef = useRef(false);

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

  // Track focus ownership of the list (focusin bubbles from any descendant).
  useEffect(() => {
    const ul = listRef.current;
    if (!ul) return;
    const onFocusIn = () => {
      hasFocusRef.current = true;
    };
    ul.addEventListener('focusin', onFocusIn);
    return () => ul.removeEventListener('focusin', onFocusIn);
  }, []);

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

  // Live reconciliation: active item removed while list has/had focus
  useEffect(() => {
    if (!activeItemId) return;
    const exists = items.some((it) => it.id === activeItemId);
    if (exists) return;

    const ae = document.activeElement;
    const focusInList = listRef.current?.contains(ae) ?? false;
    // The user deliberately moved to another (still-connected) element outside
    // the list — don't steal their focus back.
    if (!focusInList && ae && ae !== document.body && ae.isConnected) return;
    // The list never held focus (e.g. async data load on mount) — don't grab it.
    // When the active row is removed, focus falls to <body> or a detached node,
    // which are both treated as recoverable here.
    if (!focusInList && !hasFocusRef.current) return;

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

  /** Programmatically move focus to a specific item's segment (default summary). */
  const focusItem = useCallback(
    (itemId: string, segment: SegmentKind = 'summary') => {
      if (!items.some((it) => it.id === itemId)) return;
      moveFocus(itemId, segment);
    },
    [items, moveFocus],
  );

  // Attached in the CAPTURE phase (see return value) so navigation keys are
  // handled before any descendant control reacts — notably the React Aria menu
  // trigger, which would otherwise open its menu on Up/Down.
  const onKeyDownCapture = useCallback(
    (e: React.KeyboardEvent) => {
      // Fully consume a key: stop the default action and prevent it from
      // reaching descendant controls or window-level handlers.
      const consume = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      // Swallow nothing while inside a modal
      const isInModal = !!document.activeElement?.closest(
        '[role="dialog"], [role="alertdialog"], [data-modal="true"]',
      );
      if (isInModal) return;

      if (!activeItemId) {
        if (e.key === 'Tab') {
          consume();
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
          consume();
          // Vertical move always returns to the whole-row summary of the target.
          if (currentIdx > 0) moveFocus(items[currentIdx - 1].id, 'summary');
          break;

        case 'ArrowDown':
          consume();
          if (currentIdx < items.length - 1) moveFocus(items[currentIdx + 1].id, 'summary');
          break;

        case 'ArrowLeft':
          consume();
          if (segIdx > 0) {
            moveFocus(activeItemId, allSegments[segIdx - 1]);
          }
          // At 'summary' → stay
          break;

        case 'ArrowRight':
          consume();
          if (segIdx < allSegments.length - 1) {
            moveFocus(activeItemId, allSegments[segIdx + 1]);
          }
          break;

        case 'Home':
          consume();
          if (items.length > 0) moveFocus(items[0].id, 'summary');
          break;

        case 'End':
          consume();
          if (items.length > 0) moveFocus(items[items.length - 1].id, 'summary');
          break;

        case 'PageUp': {
          consume();
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
          consume();
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
          // On an action button let the native click fire — don't consume.
          if (isNativeControl(document.activeElement)) break;
          consume();
          onActionRef.current('primary', activeItemId, activeSegment);
          break;

        case ' ':
          // Space activates a focused button natively; otherwise it toggles.
          if (isNativeControl(document.activeElement)) break;
          consume();
          onActionRef.current('toggle', activeItemId, activeSegment);
          break;

        case 'Delete':
          consume();
          onActionRef.current('delete', activeItemId, activeSegment);
          break;

        case 'Tab':
          consume();
          onTabOutRef.current(!e.shiftKey);
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeItemId, activeSegment, items, moveFocus],
  );

  // Single source of truth for the per-row context menu: WebView2 emits a
  // `contextmenu` event for right-click, the Menu key, AND Shift+F10. Handling
  // it here suppresses the native menu and opens the row's own menu for all three.
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Always suppress the native WebView2 menu inside the list — a role=application
      // list has no selectable text or inputs, so the native menu shows nothing useful.
      e.preventDefault();

      const row = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-item-id]');
      const itemId = row?.dataset.itemId;
      if (!itemId || !items.some((it) => it.id === itemId)) return; // empty list space → just suppress

      // Make the row active WITHOUT queuing programmatic focus (no pendingFocusRef):
      // React Aria owns focus once the menu opens, and a pending focus would fight it.
      setActiveItemId(itemId);
      setActiveSegment('summary');

      // Open the menu, anchored to this row's ⋯ trigger (shared DOM convention).
      const trigger = listRef.current?.querySelector<HTMLElement>(
        `[data-item-id="${CSS.escape(itemId)}"][data-context-menu-trigger]`,
      );
      trigger?.click();
    },
    [items],
  );

  /** isFocused(itemId, segment) → true iff this element should have tabIndex=0 */
  const isFocused = useCallback(
    (itemId: string, segment: SegmentKind): boolean =>
      activeItemId === itemId && activeSegment === segment,
    [activeItemId, activeSegment],
  );

  /** Called when zone receives focus from outside (Tab/F6 entry). */
  const restoreFocus = useCallback(
    (_direction: 'forward' | 'backward') => {
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
      // Focus immediately: React bails out of re-render when state values haven't changed
      // (user returns to the same position), so useLayoutEffect would never fire in that case.
      // tabIndex=-1 elements are still focusable programmatically.
      const el = listRef.current?.querySelector<HTMLElement>(
        `[data-item-id="${CSS.escape(target.id)}"][data-segment="${targetSeg}"]`,
      );
      el?.focus();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  );

  return { listRef, onKeyDownCapture, onContextMenu, isFocused, restoreFocus, focusItem, activeItemId, activeSegment };
}
