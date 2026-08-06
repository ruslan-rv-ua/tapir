import { useCallback, useLayoutEffect, useRef, useState, useEffect } from 'react';
import type React from 'react'; // for React.KeyboardEvent type
import { isInModal } from '../lib/shortcutGuard';

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
  | 'action-export'
  // Schedule rows
  | 'action-toggle';

export type ActionType = 'primary' | 'toggle' | 'delete' | 'copy' | 'edit';

/**
 * Modifier keys held during an activation key (Enter/Space) or Delete.
 * Lists map these to fixed alternate actions — by app-wide convention
 * Shift+Enter = listen (play/preview), Ctrl+Enter = record (where recording
 * exists), Alt+Enter = hand the item to an external app — regardless of what
 * the plain-Enter primary action is configured to.
 */
export interface ActionModifiers {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

/**
 * True when `el` is a native interactive control that handles its own
 * Enter/Space/click. When such a control is the active focus stop, the hook
 * stays out of the way: it does not preventDefault Enter/Space and does not
 * synthesize an onAction call, letting the browser activate the control.
 */
function modifiers(e: React.KeyboardEvent): ActionModifiers {
  return { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey };
}

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

/** Two-method bridge to the consumer's selection store (atom). */
export interface CompositeSelection {
  /** Event-time snapshot (atom.get). */
  current: () => ReadonlySet<string>;
  /**
   * Delegates to the store's replaceSelection (new Set identity). MUST update the
   * store synchronously: the hook calls `current()` immediately after `replace()`
   * (e.g. to snapshot the range-anchor base), so a deferred/batched update would
   * read stale state. A nanostores `atom.set` satisfies this.
   */
  replace: (next: ReadonlySet<string>) => void;
}

/** Emitted after every selection gesture so the consumer can localize an announce. */
export interface SelectionChange {
  /** single = Ctrl+Space/Ctrl+Click/simple click; group = range/all/clear. */
  kind: "single" | "group";
  /** pointer gestures already moved DOM focus (NVDA reads the row) → caller skips single. */
  via: "key" | "pointer";
  /** New selection size. */
  count: number;
  /** Toggled row (single only). */
  lastId?: string;
  /** Its new state (single only). */
  selected?: boolean;
}

interface UseCompositeListOptions<T extends CompositeListItem> {
  /** Zone identifier — reserved for zone-system registration (Task 4 wires this up). */
  zoneId: string;
  items: T[];
  onTabOut: (forward: boolean) => void;
  onAction: (
    type: ActionType,
    itemId: string,
    segment: SegmentKind,
    modifiers: ActionModifiers,
  ) => void;
  /**
   * Called when items becomes empty while list had focus.
   * Parent should switch to empty-state zone.
   */
  onEmpty?: () => void;
  /** Opt-in: enables the selection layer. Omit → list behaves exactly as before. */
  selection?: CompositeSelection;
  onSelectionChange?: (change: SelectionChange) => void;
}

/** Semantic key intents resolved from a KeyboardEvent (pure; no list state). */
type ActionId =
  | "up" | "down" | "left" | "right"
  | "home" | "end" | "pageup" | "pagedown"
  | "enter" | "space" | "delete" | "edit" | "tab" | "copy" | "selectToggle"
  | "selectRangeUp" | "selectRangeDown" | "selectAll" | "clearSelection";

/**
 * Map a keyboard event to a single list intent, or null to let it bubble.
 * Letters/Space use e.code (Cyrillic-layout safe); navigation/activation keys
 * use e.key. Modifiers for Enter/Space (Shift=listen, Ctrl=record) are NOT
 * encoded here — they ride along via `modifiers(e)` at dispatch time.
 */
function resolveKeyAction(e: React.KeyboardEvent): ActionId | null {
  if (
    (e.code === "Space" || e.key === " ") &&
    (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey
  ) return "selectToggle";
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === "KeyC") return "copy";
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === "KeyA") return "selectAll";
  if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (e.key === "ArrowDown") return "selectRangeDown";
    if (e.key === "ArrowUp") return "selectRangeUp";
  }
  switch (e.key) {
    case "ArrowUp": return "up";
    case "ArrowDown": return "down";
    case "ArrowLeft": return "left";
    case "ArrowRight": return "right";
    case "Home": return "home";
    case "End": return "end";
    case "PageUp": return "pageup";
    case "PageDown": return "pagedown";
    case "Escape": return "clearSelection";
    case "Enter": return "enter";
    case "Delete": return "delete";
    // F2 — desktop "rename/edit" row key (Explorer/VS Code/NVDA convention).
    // Generic intent; each list decides what "edit" means (no-op if it doesn't).
    case "F2": return "edit";
    case "Tab": return "tab";
  }
  if (e.code === "Space" || e.key === " ") return "space";
  return null;
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
  selection,
  onSelectionChange,
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
  // Focus anchor for the empty-state region (rendered instead of the <ul> when
  // there are no rows). Lets restoreFocus land the zone on the empty message so
  // cycleZone doesn't skip a row-less list — see restoreFocus below.
  const emptyRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusRef = useRef<{ itemId: string; segment: SegmentKind } | null>(null);
  // Whether the list currently/recently owns focus. Used by live reconciliation
  // to tell "the active row was removed (recover focus)" apart from "the user
  // tabbed away on purpose (leave focus alone)".
  const hasFocusRef = useRef(false);
  // Whether the user has DELIBERATELY moved within the list (arrow/Home/End/Page,
  // a click, or a programmatic focusItem after a bulk op). Set only by real
  // navigation — NOT by mere focus-in (restoreFocus / a transient focus) and NOT
  // by the mount-time seed. While this is false the active row is kept pinned to
  // the current first row (see the re-seed effect below), so both Tab-entry and a
  // native Tab into the list land on items[0] even after the list reorders.
  const userNavigatedRef = useRef(false);

  // Keep options in refs to avoid stale closure
  const onTabOutRef = useRef(onTabOut);
  onTabOutRef.current = onTabOut;
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const onEmptyRef = useRef(onEmpty);
  onEmptyRef.current = onEmpty;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  // Range anchor (id) + snapshot of the selection when the anchor was (re)set.
  const anchorRef = useRef<string | null>(null);
  const anchorBaseRef = useRef<ReadonlySet<string>>(new Set());

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

  // Keep the active row pinned to the CURRENT first row until the user navigates.
  // The list can reorder after mount — most importantly when the persisted sort
  // order (e.g. "added", newest-first) arrives after the data has already loaded
  // and rendered under the default order. The mount-time seed (items[0] at first
  // render) would otherwise leave the roving tabIndex=0 AND the focus memory on a
  // row that is no longer first, so a Tab into the list — whether via restoreFocus
  // or a native Tab onto the tabIndex=0 stop — lands on the wrong row. Skipped once
  // the user deliberately arrows/clicks (their position wins) and while the list
  // currently holds focus (never yank a live cursor).
  useEffect(() => {
    if (userNavigatedRef.current) return;
    if (items.length === 0) return;
    if (activeItemId === items[0].id) return;
    if (listRef.current?.contains(document.activeElement)) return;
    setActiveItemId(items[0].id);
    setActiveSegment('summary');
  }, [items, activeItemId]);

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

  /** Contiguous ids from `fromId` to `toId` over the current visible items. */
  const rangeIds = useCallback((fromId: string, toId: string): string[] => {
    const i = items.findIndex((it) => it.id === fromId);
    const j = items.findIndex((it) => it.id === toId);
    if (i < 0 || j < 0) return [toId];
    const [lo, hi] = i <= j ? [i, j] : [j, i];
    return items.slice(lo, hi + 1).map((it) => it.id);
  }, [items]);

  /** (Re)set the anchor and snapshot the *current* selection as its base. */
  const setAnchor = useCallback((id: string) => {
    anchorRef.current = id;
    anchorBaseRef.current = new Set(selectionRef.current?.current() ?? []);
  }, []);

  /** Toggle one row's membership; (re)sets the anchor; emits a single change. */
  const toggleSelection = useCallback((id: string, via: "key" | "pointer") => {
    const sel = selectionRef.current;
    if (!sel) return;
    const next = new Set(sel.current());
    const willSelect = !next.has(id);
    if (willSelect) next.add(id);
    else next.delete(id);
    sel.replace(next);
    setAnchor(id); // base snapshot now includes the just-toggled row
    onSelectionChangeRef.current?.({ kind: "single", via, count: next.size, lastId: id, selected: willSelect });
  }, [setAnchor]);

  const moveFocus = useCallback(
    (itemId: string, segment: SegmentKind) => {
      // Any move through here (arrow/Home/End/Page, range-extend, or a
      // programmatic focusItem after a bulk op) is a deliberate position — stop
      // the re-seed effect from pinning the active row to items[0].
      userNavigatedRef.current = true;
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

      // Swallow nothing while inside a modal. Shares shortcutGuard's
      // MODAL_SELECTOR (incl. [aria-modal="true"]) — keep this off the inline
      // literal it used to be, which had drifted and missed aria-modal.
      if (isInModal()) return;

      const action = resolveKeyAction(e);
      if (!action) return;

      if (!activeItemId) {
        if (action === "tab") {
          consume();
          onTabOutRef.current(!e.shiftKey);
        }
        return;
      }

      if (action === "tab") {
        consume();
        onTabOutRef.current(!e.shiftKey);
        return;
      }

      // Ctrl/Cmd+C → generic "copy" for the active row; the consumer decides what
      // to copy. List-scoped on purpose (a registry match would hijack Ctrl+C in
      // text fields across the whole section).
      if (action === "copy") {
        consume();
        onActionRef.current("copy", activeItemId, activeSegment, modifiers(e));
        return;
      }

      const currentIdx = items.findIndex((it) => it.id === activeItemId);
      if (currentIdx < 0) return;
      const currentItem = items[currentIdx];
      const allSegments = resolveSegments(currentItem);
      const segIdx = allSegments.indexOf(activeSegment);

      // Plain row navigation (up/down/home/end/page) re-anchors the selection to
      // the landed row so a following Shift-extend spans from the new cursor, not
      // the old anchor. left/right are within-row moves and deliberately do not
      // re-anchor; Shift-range gestures keep the existing anchor (see Task 6).
      switch (action) {
        case "up": {
          consume();
          if (currentIdx > 0) {
            const id = items[currentIdx - 1].id;
            moveFocus(id, "summary");
            if (selectionRef.current) setAnchor(id);
          }
          break;
        }

        case "down": {
          consume();
          if (currentIdx < items.length - 1) {
            const id = items[currentIdx + 1].id;
            moveFocus(id, "summary");
            if (selectionRef.current) setAnchor(id);
          }
          break;
        }

        case "left":
          consume();
          if (segIdx > 0) moveFocus(activeItemId, allSegments[segIdx - 1]);
          break;

        case "right":
          consume();
          if (segIdx < allSegments.length - 1) moveFocus(activeItemId, allSegments[segIdx + 1]);
          break;

        case "home": {
          consume();
          if (items.length > 0) {
            const id = items[0].id;
            moveFocus(id, "summary");
            if (selectionRef.current) setAnchor(id);
          }
          break;
        }

        case "end": {
          consume();
          if (items.length > 0) {
            const id = items[items.length - 1].id;
            moveFocus(id, "summary");
            if (selectionRef.current) setAnchor(id);
          }
          break;
        }

        case "pageup": {
          consume();
          const container = listRef.current;
          if (!container || items.length === 0) break;
          const firstItemEl = container.querySelector<HTMLElement>("[data-item-id]");
          const itemH = firstItemEl?.offsetHeight || 40;
          const page = Math.max(1, Math.floor(container.clientHeight / itemH));
          const targetIdx = Math.max(0, currentIdx - page);
          const id = items[targetIdx].id;
          moveFocus(id, "summary");
          if (selectionRef.current) setAnchor(id);
          break;
        }

        case "pagedown": {
          consume();
          const container = listRef.current;
          if (!container || items.length === 0) break;
          const firstItemEl = container.querySelector<HTMLElement>("[data-item-id]");
          const itemH = firstItemEl?.offsetHeight || 40;
          const page = Math.max(1, Math.floor(container.clientHeight / itemH));
          const targetIdx = Math.min(items.length - 1, currentIdx + page);
          const id = items[targetIdx].id;
          moveFocus(id, "summary");
          if (selectionRef.current) setAnchor(id);
          break;
        }

        case "selectToggle":
          // Selection toggle for the active row. NOT gated by isNativeControl:
          // it works from any segment incl. an action button, and consume() mutes
          // the native click. No-op (and no consume) when selection is disabled.
          if (!selectionRef.current) break;
          consume();
          toggleSelection(activeItemId, "key");
          break;

        case "selectRangeDown":
        case "selectRangeUp": {
          consume();
          const dir = action === "selectRangeDown" ? 1 : -1;
          const nextIdx = Math.max(0, Math.min(items.length - 1, currentIdx + dir));
          const cursorId = items[nextIdx].id;
          moveFocus(cursorId, "summary");
          const sel = selectionRef.current;
          if (!sel) break; // no adapter → behaves like a plain arrow move
          // Guard: an external clear leaves a stale anchorBase that base ∪ range
          // would resurrect. On an empty selection, anchor to the FOCUSED row
          // (activeItemId — moveFocus above only queues the cursor move, React
          // hasn't flushed it) with an empty base. Explorer-inclusive: the span
          // is {focused row .. cursor}, so the starting row joins the range
          // instead of being silently dropped. Resetting the base still keeps
          // stale rows from outside the span from resurrecting.
          if (sel.current().size === 0) {
            anchorRef.current = activeItemId;
            anchorBaseRef.current = new Set();
          }
          if (anchorRef.current == null) anchorRef.current = cursorId;
          const span = rangeIds(anchorRef.current, cursorId);
          const next = new Set(anchorBaseRef.current);
          for (const id of span) next.add(id);
          sel.replace(next);
          onSelectionChangeRef.current?.({ kind: "group", via: "key", count: next.size });
          break;
        }

        case "selectAll": {
          const sel = selectionRef.current;
          if (!sel) break;
          consume();
          const next = new Set(sel.current());
          const visibleIds = items.map((it) => it.id);
          const allSelected = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
          if (allSelected) visibleIds.forEach((id) => next.delete(id));
          else visibleIds.forEach((id) => next.add(id));
          sel.replace(next);
          onSelectionChangeRef.current?.({ kind: "group", via: "key", count: next.size });
          break;
        }

        case "clearSelection": {
          const sel = selectionRef.current;
          if (sel && sel.current().size > 0) {
            consume();
            sel.replace(new Set());
            anchorRef.current = null;
            anchorBaseRef.current = new Set();
            onSelectionChangeRef.current?.({ kind: "group", via: "key", count: 0 });
          }
          // empty (or no adapter): do NOT consume — Escape is free in the list.
          break;
        }

        case "enter":
          if (isNativeControl(document.activeElement)) break;
          consume();
          onActionRef.current("primary", activeItemId, activeSegment, modifiers(e));
          break;

        case "space":
          if (isNativeControl(document.activeElement)) break;
          consume();
          onActionRef.current("toggle", activeItemId, activeSegment, modifiers(e));
          break;

        case "edit":
          // Single-row edit/rename (e.g. Streams → open AddStreamDialog in edit
          // mode). Unlike "delete" this never fans out to the selection; the
          // consumer routes it by activeItemId. Lists that don't handle "edit"
          // simply ignore it (the consume below still mutes the bare key).
          consume();
          onActionRef.current("edit", activeItemId, activeSegment, modifiers(e));
          break;

        case "delete":
          consume();
          onActionRef.current("delete", activeItemId, activeSegment, modifiers(e));
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeItemId, activeSegment, items, moveFocus, toggleSelection, setAnchor, rangeIds],
  );

  // Delegated mouse selection on the <ul> (only active when `selection` is set),
  // mirroring onContextMenu. All gestures move DOM focus to the clicked row, so
  // NVDA reads it (with the ", виділено" suffix) — that's why single-row pointer
  // changes are emitted via:"pointer" (the consumer must NOT re-announce them).
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      const sel = selectionRef.current;
      if (!sel) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // The row's own controls handle their own clicks.
      if (target.closest("button, a, input, select, textarea")) return;
      const row = target.closest<HTMLElement>("[data-item-id]");
      const id = row?.dataset.itemId;
      if (!id || !items.some((it) => it.id === id)) return;

      // A click is a deliberate position — pin the re-seed effect off.
      userNavigatedRef.current = true;
      // Move active + DOM focus to the clicked row.
      setActiveItemId(id);
      setActiveSegment("summary");
      pendingFocusRef.current = { itemId: id, segment: "summary" };

      if (e.ctrlKey && !e.shiftKey) {
        toggleSelection(id, "pointer");
        return;
      }
      if (e.shiftKey) {
        if (sel.current().size === 0) {
          // Explorer-inclusive (mirrors the keyboard branch): anchor to the
          // PREVIOUSLY-active row so it joins the span, not the clicked id.
          // Read from memoryRef.current (always fresh) — activeItemId is not in
          // this callback's deps, so its closure value would be stale.
          anchorRef.current = memoryRef.current.itemId;
          anchorBaseRef.current = new Set();
        }
        if (anchorRef.current == null) anchorRef.current = id;
        const span = rangeIds(anchorRef.current, id);
        const next = new Set(anchorBaseRef.current);
        for (const x of span) next.add(x);
        sel.replace(next);
        onSelectionChangeRef.current?.({ kind: "group", via: "pointer", count: next.size });
        return;
      }
      // Simple click → collapse to {id}, anchor here.
      sel.replace(new Set([id]));
      setAnchor(id);
      onSelectionChangeRef.current?.({ kind: "single", via: "pointer", count: 1, lastId: id, selected: true });
    },
    [items, rangeIds, setAnchor, toggleSelection],
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
      if (items.length === 0) {
        // No rows to land on. Focus the empty-state region (CompositeList renders
        // it as a focusable [data-zone-id] anchor) so the zone still ACCEPTS focus
        // — otherwise cycleZone sees no focus change and skips the whole list,
        // landing on a later zone (the reported wishlist Tab→status-bar bug).
        // NVDA then reads the empty message. During loading/error there is no
        // emptyRef, so focus declines exactly as before.
        emptyRef.current?.focus();
        return;
      }
      const mem = memoryRef.current;
      let targetIdx: number;
      let targetSeg: SegmentKind;

      if (!userNavigatedRef.current) {
        // The user has never deliberately moved within the list, so there is no
        // real remembered position — the memory is just the (possibly reordered)
        // mount-time seed. Land on the current first visible row. The re-seed
        // effect normally keeps the seed correct already; this is the belt-and
        // -suspenders for the entry path.
        targetIdx = 0;
        targetSeg = 'summary';
      } else {
        const existingIdx = items.findIndex((it) => it.id === mem.itemId);
        if (existingIdx >= 0) {
          targetIdx = existingIdx;
          const item = items[existingIdx];
          const segs = resolveSegments(item);
          targetSeg = segs.includes(mem.activeSegment) ? mem.activeSegment : 'summary';
        } else {
          targetIdx = Math.max(0, Math.min(mem.prevIndex, items.length - 1));
          targetSeg = 'summary';
        }
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

  return { listRef, emptyRef, onKeyDownCapture, onContextMenu, onClick, isFocused, restoreFocus, focusItem, activeItemId, activeSegment };
}
