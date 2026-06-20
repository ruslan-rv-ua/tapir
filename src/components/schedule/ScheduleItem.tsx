import { Calendar, CalendarOff } from "lucide-react";
import type { ScheduleDto } from "../../lib/tauri";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { CompositeRow, CompositeSegment, CompositeAction } from "../common/composite-list";
import { ScheduleContextMenu, type ScheduleAction } from "./ScheduleContextMenu";
import {
  formatNextRun, formatWhen, lastResultText, stateText,
} from "../../lib/scheduleFormat";
import * as m from "../../i18n/paraglide/messages";

/** Стопи Left/Right після summary — однакові для всіх рядків. */
export function getScheduleSegments(): Exclude<SegmentKind, "summary">[] {
  return ["track", "tech", "action-toggle", "action-menu"];
}

interface Props {
  schedule: ScheduleDto;
  /** Назва потоку активного профілю; «потік видалено» для осиротілих. */
  streamName: string;
  isActiveRow: boolean;
  isSelected?: boolean;
  selectionCount?: number;
  isFocused: (segment: "summary" | SegmentKind) => boolean;
  onToggle: () => void;
  onAction: (action: ScheduleAction) => void;
}

export function ScheduleItem({
  schedule, streamName, isActiveRow, isSelected = false, selectionCount = 0, isFocused, onToggle, onAction,
}: Props) {
  const when = formatWhen(schedule);
  const next = formatNextRun(schedule.nextRun);
  const result = lastResultText(schedule.lastResult);
  const state = stateText(schedule.enabled);

  // Усі «колонки» §5.2 в одному a11y-імені рядка — NVDA читає один чистий label.
  const fullSummaryLabel = m.schedule_row_summary({
    name: schedule.name, state, stream: streamName, when, next, result,
  });
  const summaryLabel = isSelected ? `${fullSummaryLabel}, ${m.selection_suffix()}` : fullSummaryLabel;

  // role="group" озвучує лише aria-label — без нього drill-down на рядок 2 німий.
  const techLabel = [
    streamName, when, m.schedule_next_run_label({ when: next }), result,
  ].join(", ");

  return (
    <CompositeRow
      itemId={schedule.id}
      isFocused={isFocused}
      isActiveRow={isActiveRow}
      label={summaryLabel}
      selected={isSelected}
      roleDescription={m.item_role_schedule()}
      className="border-b border-slate-800 px-3 py-2 data-[selected=true]:bg-sky-900/40 data-[selected=true]:ring-1 data-[selected=true]:ring-inset data-[selected=true]:ring-sky-400/40 forced-colors:data-[selected=true]:bg-[Highlight] forced-colors:data-[selected=true]:text-[HighlightText]"
      activeClassName="bg-slate-800/40"
    >
      {/* Рядок 1: іконка стану + назва, кнопки праворуч. */}
      <div className="flex items-center gap-2">
        <CompositeSegment
          itemId={schedule.id}
          segment="track"
          isFocused={isFocused}
          label={schedule.name}
          className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-100"
        >
          {schedule.enabled ? (
            <Calendar size={14} aria-hidden className="flex-none text-slate-500" />
          ) : (
            <CalendarOff size={14} aria-hidden className="flex-none text-slate-600" />
          )}
          <span className={schedule.enabled ? "truncate" : "truncate text-slate-500"}>
            {schedule.name}
          </span>
        </CompositeSegment>

        <div className="ml-auto flex flex-none gap-1">
          {/* A11y-ім'я — дієслово дії (як play/stop у SongItem): із aria-pressed
              NVDA озвучує «Вимкнути, натиснуто» — дія + стан без дублю.
              Видимий текст лишається колонкою «Стан» (§5.2). */}
          <CompositeAction
            itemId={schedule.id}
            segment="action-toggle"
            isFocused={isFocused}
            onClick={onToggle}
            label={schedule.enabled ? m.schedule_action_disable() : m.schedule_action_enable()}
            ariaPressed={schedule.enabled}
            className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 forced-colors:text-[ButtonText]"
          >
            {state}
          </CompositeAction>

          <ScheduleContextMenu
            schedule={schedule}
            menuFocused={isFocused("action-menu")}
            selectionCount={selectionCount}
            onAction={onAction}
          />
        </div>
      </div>

      {/* Рядок 2: потік · коли · наступний запуск · останній результат. */}
      <CompositeSegment
        itemId={schedule.id}
        segment="tech"
        isFocused={isFocused}
        label={techLabel}
        className="mt-1 flex items-center gap-1 text-xs text-slate-400"
      >
        <span className="min-w-0 flex-1 truncate">
          {streamName} · {when}
        </span>
        <span className="flex-none whitespace-nowrap">
          {" · "}{next}{" · "}{result}
        </span>
      </CompositeSegment>
    </CompositeRow>
  );
}
