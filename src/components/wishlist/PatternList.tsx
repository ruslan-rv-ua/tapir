import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
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

const PATTERN_SEGMENTS: Exclude<SegmentKind, "summary">[] = ["conditions", "actions"];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export const PatternList = forwardRef<ZoneEntry, Props>(
  ({ items, ariaLabel, showDate, emptyMessage, exitZone, onEmpty, onEdit, onRemove }, ref) => {
    const listItems = useMemo(
      () => items.map((item) => ({ id: item.pattern, segments: PATTERN_SEGMENTS })),
      [items],
    );
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const { listRef, onKeyDown, isFocused, restoreFocus } = useCompositeList({
      zoneId: "wishlist-list",
      items: listItems,
      onTabOut: exitZone,
      onEmpty,
      onAction: (type, itemId, segment) => {
        if (type === "delete") {
          setConfirmDelete(itemId);
          return;
        }
        if (type === "primary" || (type === "toggle" && segment !== "actions")) {
          onEdit(itemId);
        }
      },
    });

    useImperativeHandle(ref, () => ({
      id: "wishlist-list",
      get el() {
        return listRef.current!;
      },
      focus: restoreFocus,
    }), [restoreFocus]);

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
              : `${m.segment_conditions()}: ${m.empty_conditions()}`;
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
        {confirmDelete && createPortal(
          <ConfirmDialog
            title={m.remove_pattern()}
            message={m.confirm_remove_pattern({ pattern: confirmDelete })}
            onConfirm={() => {
              onRemove(confirmDelete);
              setConfirmDelete(null);
            }}
            onCancel={() => setConfirmDelete(null)}
          />,
          document.body,
        )}
      </>
    );
  },
);
PatternList.displayName = "PatternList";
