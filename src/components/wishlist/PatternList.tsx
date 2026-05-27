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

const PATTERN_SEGMENTS: Exclude<SegmentKind, "summary">[] = ["conditions", "action-edit", "action-delete"];

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

    const { listRef, onKeyDownCapture, isFocused, restoreFocus, activeItemId } = useCompositeList({
      zoneId: "wishlist-list",
      items: listItems,
      onTabOut: exitZone,
      onEmpty,
      onAction: (type, itemId, segment) => {
        if (type === "delete") {
          setConfirmDelete(itemId);
          return;
        }
        // Edit/Delete buttons self-activate; Enter/Space on the whole-row summary edits.
        if ((type === "primary" || type === "toggle") && segment === "summary") {
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
          onKeyDownCapture={onKeyDownCapture}
        >
          {items.map((item) => {
            // Value only; the "Умови" type is announced via aria-roledescription.
            const conditionsValue = showDate && item.addedAt
              ? `${m.column_added_at()}, ${formatDate(item.addedAt)}`
              : m.empty_conditions();
            const activeRow = activeItemId === item.pattern;

            return (
              <li
                key={item.pattern}
                // The <li> is the 'summary' (whole-row) focus stop; aria-roledescription
                // makes NVDA read "{pattern}, патерн". Single focus ring via the global
                // [tabindex]:focus-visible rule.
                data-item-id={item.pattern}
                data-segment="summary"
                tabIndex={isFocused(item.pattern, "summary") ? 0 : -1}
                aria-label={item.pattern}
                aria-roledescription={m.item_role_pattern()}
                className={`border-b border-slate-800 forced-colors:border-[ButtonText] ${activeRow ? "bg-slate-800/60" : ""}`}
              >
                {/* Pattern text — visual only; the row's accessible name is on the <li>. */}
                <div className="px-3 py-2 font-mono text-slate-200">
                  {item.pattern}
                </div>

                {/* Conditions segment */}
                <div
                  role="group"
                  data-item-id={item.pattern}
                  data-segment="conditions"
                  tabIndex={isFocused(item.pattern, "conditions") ? 0 : -1}
                  aria-label={conditionsValue}
                  aria-roledescription={m.segment_conditions()}
                  className="px-3 py-1 text-sm text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
                >
                  {showDate && item.addedAt ? formatDate(item.addedAt) : "—"}
                </div>

                {/* Actions — each button is its own focus stop (roving tabIndex). */}
                <div className="flex justify-end gap-1 px-3 py-1">
                  <button
                    data-item-id={item.pattern}
                    data-segment="action-edit"
                    tabIndex={isFocused(item.pattern, "action-edit") ? 0 : -1}
                    onClick={() => onEdit(item.pattern)}
                    aria-label={`${m.edit_pattern()}: ${item.pattern}`}
                    className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
                  >
                    ✎
                  </button>
                  <button
                    data-item-id={item.pattern}
                    data-segment="action-delete"
                    tabIndex={isFocused(item.pattern, "action-delete") ? 0 : -1}
                    onClick={() => setConfirmDelete(item.pattern)}
                    aria-label={`${m.remove_pattern()}: ${item.pattern}`}
                    className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
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
