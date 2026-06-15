import { forwardRef, useCallback, useImperativeHandle, type ReactElement, type ReactNode, type Ref } from "react";
import {
  useCompositeList,
  type ActionType,
  type ActionModifiers,
  type CompositeListItem,
  type SegmentKind,
  type CompositeSelection,
  type SelectionChange,
} from "../../../hooks/useCompositeList";
import type { ZoneEntry } from "../../../hooks/useZoneNavigation";

export interface CompositeRowRenderArgs {
  id: string;
  /** This row is the active item (subtle context highlight). */
  isActive: boolean;
  /** Row-bound focus predicate to thread into CompositeRow/Segment/Action. */
  isFocused: (segment: SegmentKind) => boolean;
}

export interface CompositeListProps {
  zoneId: string;
  ariaLabel: string;
  items: CompositeListItem[];
  onTabOut: (forward: boolean) => void;
  onAction: (
    type: ActionType,
    itemId: string,
    segment: SegmentKind,
    modifiers: ActionModifiers,
  ) => void;
  onEmpty?: () => void;
  renderRow: (row: CompositeRowRenderArgs) => ReactNode;
  className?: string;
  /** Render instead of the <ul> while async data loads. */
  loading?: ReactNode;
  /** Render instead of the <ul> on error. */
  error?: ReactNode;
  /** Render instead of the <ul> when items is empty. */
  empty?: ReactNode;
  /** Render after the rows, inside the <ul> (e.g. a "Load more" control). */
  footer?: ReactNode;
  /** Augment the imperative handle with extra methods (must be pure over `api`). */
  imperativeExtra?: (api: {
    focusItem: (itemId: string, segment?: SegmentKind) => void;
  }) => object;
  /** Opt-in selection adapter (atom bridge). Omit → no selection layer. */
  selection?: CompositeSelection;
  onSelectionChange?: (change: SelectionChange) => void;
}

function CompositeListInner<H extends ZoneEntry = ZoneEntry>(
  props: CompositeListProps,
  ref: Ref<H>,
): ReactElement {
  const {
    zoneId,
    ariaLabel,
    items,
    onTabOut,
    onAction,
    onEmpty,
    renderRow,
    className,
    loading,
    error,
    empty,
    footer,
    imperativeExtra,
    selection,
    onSelectionChange,
  } = props;

  const { listRef, onKeyDownCapture, onContextMenu, onClick, isFocused, restoreFocus, focusItem, activeItemId } =
    useCompositeList({ zoneId, items, onTabOut, onAction, onEmpty, selection, onSelectionChange });

  /**
   * Wraps focusItem so that the DOM element is focused immediately, even when
   * React bails out of a re-render because state values haven't changed (e.g.
   * calling focusItem("a", "summary") when "a"/summary is already active).
   * The hook's useLayoutEffect only fires when state actually changes, so
   * without this fallback programmatic focus would be silently swallowed.
   */
  const focusItemAndDom = useCallback(
    (itemId: string, segment: SegmentKind = "summary") => {
      focusItem(itemId, segment);
      // Immediately focus the DOM element as a fallback for the bail-out case.
      const el = listRef.current?.querySelector<HTMLElement>(
        `[data-item-id="${CSS.escape(itemId)}"][data-segment="${CSS.escape(segment)}"]`,
      );
      el?.focus();
    },
    [focusItem, listRef],
  );

  useImperativeHandle(
    ref,
    () =>
      ({
        id: zoneId,
        get el() {
          return listRef.current!;
        },
        focus: restoreFocus,
        ...(imperativeExtra ? imperativeExtra({ focusItem: focusItemAndDom }) : {}),
      }) as unknown as H,
    // imperativeExtra is expected to be pure over the `api` argument.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoneId, restoreFocus, focusItemAndDom],
  );

  if (loading != null) return <>{loading}</>;
  if (error != null) return <>{error}</>;
  if (items.length === 0 && empty != null) return <>{empty}</>;

  // The <ul> adds py-1 so each row's focus outline (global rule in styles.css:
  // outline-offset 2px + 2px width) isn't clipped at the scroll container's
  // top/bottom edges — without it the first row loses its top line and the last
  // row its bottom line. Left/right are intentionally clipped to horizontal lines.
  return (
    <ul
      ref={listRef}
      data-zone-id={zoneId}
      role="application"
      aria-label={ariaLabel}
      className={`py-1 scroll-py-1 ${className}`}
      onKeyDownCapture={onKeyDownCapture}
      onContextMenu={onContextMenu}
      onClick={onClick}
    >
      {items.map((it) =>
        renderRow({
          id: it.id,
          isActive: activeItemId === it.id,
          isFocused: (segment) => isFocused(it.id, segment),
        }),
      )}
      {footer}
    </ul>
  );
}

// Generic forwardRef: the cast preserves the <H> type parameter so callers like
// ProfileList can pass a ref to a handle that extends ZoneEntry with extra methods.
export const CompositeList = forwardRef(CompositeListInner) as <H extends ZoneEntry = ZoneEntry>(
  props: CompositeListProps & { ref?: Ref<H> },
) => ReactElement;
