import { forwardRef, useCallback, useImperativeHandle, type ReactElement, type ReactNode, type Ref } from "react";
import {
  useCompositeList,
  type ActionType,
  type ActionModifiers,
  type CompositeListItem,
  type SegmentKind,
  type CompositeSelection,
  type SelectionChange,
  type TrailingStop,
} from "../../../hooks/useCompositeList";
import type { ZoneEntry, ZoneId } from "../../../hooks/useZoneNavigation";

export interface CompositeRowRenderArgs {
  id: string;
  /** This row is the active item (subtle context highlight). */
  isActive: boolean;
  /** Row-bound focus predicate to thread into CompositeRow/Segment/Action. */
  isFocused: (segment: SegmentKind) => boolean;
}

export interface CompositeListProps {
  /** Mirrored to data-zone-id on the zone container and registered as ZoneEntry.id. */
  zoneId: ZoneId;
  ariaLabel: string;
  items: CompositeListItem[];
  /**
   * Identity of the RESULT SET these `items` are — the screen's criteria spelled
   * as one string (a filter chip, a query, a station, a sort order), and `null`
   * for a list that has no criteria to change.
   *
   * Required by type, deliberately: a changed key is what tells the list that the
   * old result set ENDED, so the next entry starts at the first row instead of a
   * row the person can no longer see. It used to be a spoken contract
   * (`resetCursor()`) and only one screen of three remembered it — see
   * docs/decisions/2026-09-06-new-result-set-forgets-the-current-stop.md. A key
   * that appends to the SAME result set ("Load more") must NOT change.
   */
  resultSetKey: string | null;
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
  /**
   * Accessible name for the focusable empty-state region (so Tab/F6 into a
   * row-less list lands there and NVDA announces it). Defaults to `ariaLabel`.
   */
  emptyLabel?: string;
  /**
   * One trailing action stop after the last row ("Load more"). Not a markup
   * slot: the list renders the button, drives Down/Up across the boundary and
   * decides where the cursor goes afterwards — see TrailingStop and
   * docs/decisions/2026-09-03-trailing-stop-crosses-only-on-down.md.
   */
  trailingStop?: TrailingStop;
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
    resultSetKey,
    onTabOut,
    onAction,
    onEmpty,
    renderRow,
    className,
    loading,
    error,
    empty,
    emptyLabel,
    trailingStop,
    imperativeExtra,
    selection,
    onSelectionChange,
  } = props;

  const {
    listRef, emptyRef, trailingRef, onKeyDownCapture, onContextMenu, onClick,
    isFocused, isTrailingFocused, activateTrailing,
    restoreFocus, focusItem, activeItemId,
  } = useCompositeList({ items, resultSetKey, trailingStop, onTabOut, onAction, onEmpty, selection, onSelectionChange });

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
        focus: restoreFocus,
        ...(imperativeExtra ? imperativeExtra({ focusItem: focusItemAndDom }) : {}),
      }) as unknown as H,
    // imperativeExtra is expected to be pure over the `api` argument.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoneId, restoreFocus, focusItemAndDom],
  );

  if (loading != null) return <>{loading}</>;
  if (error != null) return <>{error}</>;
  // Empty state is a focusable zone anchor (carries data-zone-id + tabIndex=-1)
  // so cycleZone can land focus here instead of skipping a row-less list. The
  // onKeyDownCapture handler already routes Tab → onTabOut when there's no active
  // item, so the user can leave the empty zone. Mirrors StreamsPanel's empty zone.
  if (items.length === 0 && empty != null) {
    return (
      <div
        ref={emptyRef}
        data-zone-id={zoneId}
        role="region"
        aria-label={emptyLabel ?? ariaLabel}
        tabIndex={-1}
        className="flex flex-1 flex-col"
        onKeyDownCapture={onKeyDownCapture}
      >
        {empty}
      </div>
    );
  }

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
      {trailingStop && (
        <li>
          <button
            ref={trailingRef}
            type="button"
            data-trailing-stop=""
            // Roving stop, exactly like a row. Never `disabled`: while the batch
            // is in flight the label and aria-busy carry that, because disabling
            // the focused element would drop focus to <body>.
            tabIndex={isTrailingFocused ? 0 : -1}
            aria-busy={trailingStop.busy || undefined}
            onClick={() => void activateTrailing()}
            className="w-full py-2 text-sm text-slate-400 hover:bg-slate-800"
          >
            {trailingStop.label}
          </button>
        </li>
      )}
    </ul>
  );
}

// Generic forwardRef: the cast preserves the <H> type parameter so callers like
// ProfileList can pass a ref to a handle that extends ZoneEntry with extra methods.
export const CompositeList = forwardRef(CompositeListInner) as <H extends ZoneEntry = ZoneEntry>(
  props: CompositeListProps & { ref?: Ref<H> },
) => ReactElement;
