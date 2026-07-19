import { forwardRef, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import { $patternSelection } from "../../stores/wishlist";
import { replaceSelection } from "../../stores/selection";
import { useListSelection } from "../../hooks/useListSelection";
import { useAnnounce } from "../../hooks/useAnnounce";
import { computeBulkFocusTarget } from "../../lib/bulkFocus";
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
  /** Bulk: backend + store update done by the parent; returns count removed. */
  onBulkRemove: (patterns: string[]) => Promise<number>;
}

export type PatternListHandle = ZoneEntry & { requestBulkRemove: () => void };

const PATTERN_SEGMENTS: Exclude<SegmentKind, "summary">[] = ["conditions", "action-edit", "action-delete"];

export const PatternList = forwardRef<PatternListHandle, Props>(
  ({ items, ariaLabel, showDate, emptyMessage, exitZone, onEmpty, onEdit, onRemove, onBulkRemove }, ref) => {
    const listItems = useMemo(
      () => items.map((item) => ({ id: item.pattern, segments: PATTERN_SEGMENTS })),
      [items],
    );
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const selectedSet = useStore($patternSelection);
    const announce = useAnnounce();
    const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
    const pendingBulkFocusRef = useRef<string | null>(null);
    const [bulkSeq, setBulkSeq] = useState(0);
    const focusItemRef = useRef<((id: string, segment?: SegmentKind) => void) | null>(null);

    const resolveName = useCallback((p: string) => p, []);
    const { selectionAdapter, onSelectionChange } = useListSelection<PatternItem>({
      $selection: $patternSelection,
      announce,
      resolveName,
      allItems: items,
      getId: (it) => it.pattern,
    });

    // Programmatic focus after a bulk remove — fires after listItems and bulkSeq update.
    useLayoutEffect(() => {
      const t = pendingBulkFocusRef.current;
      if (!t) return;
      pendingBulkFocusRef.current = null;
      focusItemRef.current?.(t, "summary");
    }, [listItems, bulkSeq]);

    const handleConfirmBulkRemove = async () => {
      const patterns = [...$patternSelection.get()];
      if (patterns.length === 0) { setBulkConfirmOpen(false); return; }
      const visible = items.map((it) => ({ id: it.pattern })); // snapshot before await
      const removedIds = new Set(patterns); // no skip semantics for patterns
      try {
        const removed = await onBulkRemove(patterns); // parent mutates the store
        replaceSelection($patternSelection, new Set());
        const target = computeBulkFocusTarget(visible, removedIds);
        if (target === null) onEmpty();
        else pendingBulkFocusRef.current = target;
        setBulkSeq((n) => n + 1);
        announce(m.patterns_removed_bulk({ count: removed }), "polite");
      } catch (_err) {
        // parent toasts + rethrows; on failure we skip the success announce and just close
      }
      setBulkConfirmOpen(false);
    };

    const imperativeExtra = useCallback(
      ({ focusItem }: { focusItem: (id: string, segment?: SegmentKind) => void }) => {
        focusItemRef.current = focusItem;
        return { requestBulkRemove: () => setBulkConfirmOpen(true) };
      },
      [],
    );

    return (
      <>
        <CompositeList<PatternListHandle>
          ref={ref}
          imperativeExtra={imperativeExtra}
          zoneId="wishlist-list"
          ariaLabel={ariaLabel}
          items={listItems}
          className="flex-1 overflow-auto"
          onTabOut={exitZone}
          onEmpty={onEmpty}
          selection={selectionAdapter}
          onSelectionChange={onSelectionChange}
          emptyLabel={emptyMessage}
          empty={
            <ListCardState role="status">
              {emptyMessage}
            </ListCardState>
          }
          onAction={(type, itemId, segment) => {
            if (type === "delete") {
              if ($patternSelection.get().size > 0) setBulkConfirmOpen(true);
              else setConfirmDelete(itemId); // existing single confirm
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
            const isSelected = selectedSet.has(id);
            return (
              <CompositeRow
                key={id}
                itemId={id}
                isFocused={isFocused}
                isActiveRow={isActive}
                label={isSelected ? `${id}, ${m.selection_suffix()}` : id}
                selected={isSelected}
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
                    onClick={() => {
                      if ($patternSelection.get().has(id)) setBulkConfirmOpen(true);
                      else { replaceSelection($patternSelection, new Set([id])); setConfirmDelete(id); }
                    }}
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
        {bulkConfirmOpen &&
          createPortal(
            <ConfirmDialog
              title={m.remove_pattern()}
              confirmLabel={m.remove_pattern()}
              message={m.confirm_delete_selected_patterns({ count: selectedSet.size })}
              onConfirm={handleConfirmBulkRemove}
              onCancel={() => setBulkConfirmOpen(false)}
            />,
            document.body,
          )}
      </>
    );
  },
);
PatternList.displayName = "PatternList";
