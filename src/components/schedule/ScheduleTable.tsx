import { forwardRef, useMemo } from "react";
import { useStore } from "@nanostores/react";
import { $schedules } from "../../stores/schedule";
import { $streams } from "../../stores/streams";
import { CompositeList } from "../common/composite-list";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { ScheduleItem, getScheduleSegments } from "./ScheduleItem";
import type { ScheduleAction } from "./ScheduleContextMenu";
import * as m from "../../i18n/paraglide/messages";

export interface ScheduleTableHandle extends ZoneEntry {
  /** Сфокусувати рядок розкладу (після add/edit). */
  focusSchedule: (id: string) => void;
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

    const items = useMemo(
      () => schedules.map((s) => ({ id: s.id, segments: getScheduleSegments() })),
      [schedules],
    );

    const streamName = (streamId: string) =>
      streams.find((s) => s.id === streamId)?.name ?? m.schedule_stream_missing();

    const dispatch = (id: string, action: ScheduleAction) => {
      if (action === "edit") onEdit(id);
      else if (action === "toggle") onToggle(id);
      else onDelete(id);
    };

    return (
      <CompositeList<ScheduleTableHandle>
        ref={ref}
        zoneId="schedule-list"
        ariaLabel={m.zone_schedule_list()}
        items={items}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onTabOut={exitZone}
        onEmpty={onEmpty}
        imperativeExtra={({ focusItem }) => ({
          focusSchedule: (id: string) => focusItem(id, "summary"),
        })}
        onAction={(type, itemId, segment) => {
          if (segment !== "summary") return;
          // Рішення 6: Enter = редагувати, Space = toggle, Delete = видалити.
          if (type === "primary") onEdit(itemId);
          else if (type === "toggle") onToggle(itemId);
          else if (type === "delete") onDelete(itemId);
        }}
        renderRow={({ id, isActive, isFocused }) => {
          const schedule = schedules.find((s) => s.id === id)!;
          return (
            <ScheduleItem
              key={id}
              schedule={schedule}
              streamName={streamName(schedule.streamId)}
              isActiveRow={isActive}
              isFocused={isFocused}
              onToggle={() => onToggle(id)}
              onAction={(action) => dispatch(id, action)}
            />
          );
        }}
      />
    );
  },
);
ScheduleTable.displayName = "ScheduleTable";
