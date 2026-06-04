import { forwardRef, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CompositeList, CompositeRow, CompositeSegment, CompositeAction } from "../common/composite-list";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { ListCardState } from "../common/ListCard";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { formatDate } from "../../lib/formatters";
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

export const PatternList = forwardRef<ZoneEntry, Props>(
  ({ items, ariaLabel, showDate, emptyMessage, exitZone, onEmpty, onEdit, onRemove }, ref) => {
    const listItems = useMemo(
      () => items.map((item) => ({ id: item.pattern, segments: PATTERN_SEGMENTS })),
      [items],
    );
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    return (
      <>
        <CompositeList
          ref={ref}
          zoneId="wishlist-list"
          ariaLabel={ariaLabel}
          items={listItems}
          className="flex-1 overflow-auto"
          onTabOut={exitZone}
          onEmpty={onEmpty}
          empty={
            <ListCardState role="status">{emptyMessage}</ListCardState>
          }
          onAction={(type, itemId, segment) => {
            if (type === "delete") {
              setConfirmDelete(itemId);
              return;
            }
            // Edit/Delete buttons self-activate; Enter/Space on the whole-row summary edits.
            if ((type === "primary" || type === "toggle") && segment === "summary") {
              onEdit(itemId);
            }
          }}
          renderRow={({ id, isActive, isFocused }) => {
            const item = items.find((it) => it.pattern === id)!;
            // Value only; the "conditions" type is announced via aria-roledescription.
            const conditionsValue =
              showDate && item.addedAt
                ? `${m.column_added_at()}, ${formatDate(item.addedAt)}`
                : m.empty_conditions();
            return (
              <CompositeRow
                key={id}
                itemId={id}
                isFocused={isFocused}
                isActiveRow={isActive}
                label={id}
                roleDescription={m.item_role_pattern()}
                className="border-b border-slate-800 forced-colors:border-[ButtonText]"
                activeClassName="bg-slate-800/60"
              >
                {/* Pattern text — visual only; the row's accessible name is on the <li>. */}
                <div className="px-3 py-2 font-mono text-slate-200">{id}</div>

                <CompositeSegment
                  itemId={id}
                  segment="conditions"
                  isFocused={isFocused}
                  label={conditionsValue}
                  roleDescription={m.segment_conditions()}
                  className="px-3 py-1 text-sm text-slate-400"
                >
                  {showDate && item.addedAt ? formatDate(item.addedAt) : "—"}
                </CompositeSegment>

                <div className="flex justify-end gap-1 px-3 py-1">
                  <CompositeAction
                    itemId={id}
                    segment="action-edit"
                    isFocused={isFocused}
                    onClick={() => onEdit(id)}
                    label={`${m.edit_pattern()}: ${id}`}
                    className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300"
                  >
                    ✎
                  </CompositeAction>
                  <CompositeAction
                    itemId={id}
                    segment="action-delete"
                    isFocused={isFocused}
                    onClick={() => setConfirmDelete(id)}
                    label={`${m.remove_pattern()}: ${id}`}
                    className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300"
                  >
                    ✕
                  </CompositeAction>
                </div>
              </CompositeRow>
            );
          }}
        />
        {confirmDelete &&
          createPortal(
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
