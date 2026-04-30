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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  );

  return { listRef, onKeyDown, isFocused, restoreFocus, activeItemId, activeSegment };
}
