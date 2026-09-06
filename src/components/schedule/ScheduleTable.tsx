import { forwardRef, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import { $schedules, $scheduleSelection } from "../../stores/schedule";
import { $streams } from "../../stores/streams";
import { replaceSelection } from "../../stores/selection";
import { CompositeList } from "../common/composite-list";
import { ConfirmDialog } from "../common/ConfirmDialog";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { useListSelection } from "../../hooks/useListSelection";
import { useAnnounce } from "../../hooks/useAnnounce";
import { computeBulkFocusTarget } from "../../lib/bulkFocus";
import { ScheduleItem, getScheduleSegments } from "./ScheduleItem";
import type { ScheduleAction } from "./ScheduleContextMenu";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import type { ScheduleDto } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

export interface ScheduleTableHandle extends ZoneEntry {
  /** Сфокусувати рядок розкладу (після add/edit). */
  focusSchedule: (id: string) => void;
  /** Запустити bulk-delete для поточного вибору. */
  requestBulkDelete: () => void;
}

interface Props {
  exitZone: (forward: boolean) => void;
  onEmpty: () => void;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export const ScheduleTable = forwardRef<ScheduleTableHandle, Props>(
  ({ exitZone, onEmpty, onToggle, onEdit, onDelete }, ref) => {
    const schedules = useStore($schedules);
    const streams = useStore($streams);
    const selectedSet = useStore($scheduleSelection);
    const announce = useAnnounce();

    const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
    const pendingBulkFocusRef = useRef<string | null>(null);
    const [bulkSeq, setBulkSeq] = useState(0);
    const focusItemRef = useRef<((id: string, segment?: SegmentKind) => void) | null>(null);

    const resolveName = useCallback(
      (id: string) => schedules.find((s) => s.id === id)?.name ?? "",
      [schedules],
    );
    const { selectionAdapter, onSelectionChange } = useListSelection<ScheduleDto>({
      $selection: $scheduleSelection,
      announce,
      resolveName,
      allItems: schedules,
      getId: (s) => s.id,
    });

    const items = useMemo(
      () => schedules.map((s) => ({ id: s.id, segments: getScheduleSegments() })),
      [schedules],
    );

    // Programmatic focus after a bulk delete.
    useLayoutEffect(() => {
      const t = pendingBulkFocusRef.current;
      if (!t) return;
      pendingBulkFocusRef.current = null;
      focusItemRef.current?.(t, "summary");
    }, [items, bulkSeq]);

    const handleConfirmBulkDelete = async () => {
      const ids = [...$scheduleSelection.get()];
      if (ids.length === 0) { setBulkConfirmOpen(false); return; }
      const visible = schedules; // snapshot before await (focus index, A8)
      const removedIds = new Set(ids); // no skip for schedule delete
      try {
        const removed = await tauri.deleteSchedules(ids);
        $schedules.set($schedules.get().filter((s) => !removedIds.has(s.id)));
        replaceSelection($scheduleSelection, new Set());
        const target = computeBulkFocusTarget(visible, removedIds);
        if (target === null) onEmpty();
        else pendingBulkFocusRef.current = target;
        setBulkSeq((n) => n + 1);
        announce(m.schedules_removed_bulk({ count: removed }), "polite");
      } catch (err) {
        addToast(String(err), "error");
      }
      setBulkConfirmOpen(false);
    };

    const imperativeExtra = useCallback(
      ({ focusItem }: { focusItem: (id: string, segment?: SegmentKind) => void }) => {
        // Stash the latest focusItem; the handle is rebuilt on items change, so this
        // ref always points at a focusItem that knows the post-delete item set.
        focusItemRef.current = focusItem;
        return {
          focusSchedule: (id: string) => focusItem(id, "summary"),
          requestBulkDelete: () => setBulkConfirmOpen(true),
        };
      },
      [],
    );

    const streamName = (streamId: string) =>
      streams.find((s) => s.id === streamId)?.name ?? m.schedule_stream_missing();

    const dispatch = (id: string, action: ScheduleAction) => {
      if (action === "edit") onEdit(id);
      else if (action === "toggle") onToggle(id);
      else {
        // ⋯-menu delete: Explorer model — inside selection → bulk; outside → single.
        if ($scheduleSelection.get().has(id)) setBulkConfirmOpen(true);
        else { replaceSelection($scheduleSelection, new Set([id])); onDelete(id); }
      }
    };

    return (
      <>
        <CompositeList<ScheduleTableHandle>
          ref={ref}
          imperativeExtra={imperativeExtra}
          zoneId="schedule-list"
          // No criteria to change: this list is never replaced under the person,
          // only added to and taken from. See CompositeList's resultSetKey.
          resultSetKey={null}
          ariaLabel={m.zone_schedule_list()}
          items={items}
          className="flex-1 overflow-y-auto overflow-x-hidden"
          onTabOut={exitZone}
          onEmpty={onEmpty}
          selection={selectionAdapter}
          onSelectionChange={onSelectionChange}
          onAction={(type, itemId, segment) => {
            if (type === "delete") {
              // Keyboard Delete: whole selection if any, else single (delegated to panel).
              if ($scheduleSelection.get().size > 0) setBulkConfirmOpen(true);
              else onDelete(itemId);
              return;
            }
            if (segment !== "summary") return;
            // Рішення 6: Enter = редагувати, Space = toggle.
            if (type === "primary") onEdit(itemId);
            else if (type === "toggle") onToggle(itemId);
          }}
          renderRow={({ id, isActive, isFocused }) => {
            const schedule = schedules.find((s) => s.id === id)!;
            return (
              <ScheduleItem
                key={id}
                schedule={schedule}
                streamName={streamName(schedule.streamId)}
                isActiveRow={isActive}
                isSelected={selectedSet.has(id)}
                selectionCount={selectedSet.has(id) ? selectedSet.size : 0}
                isFocused={isFocused}
                onToggle={() => onToggle(id)}
                onAction={(action) => dispatch(id, action)}
              />
            );
          }}
        />
        {bulkConfirmOpen &&
          createPortal(
            <ConfirmDialog
              title={m.schedule_confirm_delete_title()}
              message={m.confirm_delete_selected_schedules({ count: selectedSet.size })}
              confirmLabel={m.schedule_action_delete()}
              onConfirm={handleConfirmBulkDelete}
              onCancel={() => setBulkConfirmOpen(false)}
            />,
            document.body,
          )}
      </>
    );
  },
);
ScheduleTable.displayName = "ScheduleTable";
