import { getLocale } from "../i18n/paraglide/runtime";
import * as m from "../i18n/paraglide/messages";
import type {
  ActiveScheduled, ScheduleDto, ScheduleResult, ScheduleResultReason,
} from "./tauri";

// Індекси днів — модель §2: 0=Пн..6=Нд.
const DAY_LABELS = [
  m.day_short_0, m.day_short_1, m.day_short_2, m.day_short_3,
  m.day_short_4, m.day_short_5, m.day_short_6,
] as const;

function day(i: number): string {
  return DAY_LABELS[i]?.() ?? String(i);
}

/** Час кінця вікна: початок + тривалість за модулем доби ("23:30"+60 → "00:30"). */
export function endTime(time: string, durationMinutes: number): string {
  const [h, min] = time.split(":").map(Number);
  const total = (h * 60 + min + durationMinutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** «Пн–Пт» / «Пн, Ср, Пт» / «Щодня». Колапс лише для пробігів від 3 днів. */
export function formatDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return m.schedule_days_daily();
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (j - i >= 2) parts.push(`${day(sorted[i])}–${day(sorted[j])}`);
    else for (let k = i; k <= j; k++) parts.push(day(sorted[k]));
    i = j + 1;
  }
  return parts.join(", ");
}

function formatIsoDate(iso: string): string {
  // "2026-06-14" → локалізована коротка дата ("14.06.2026" для uk)
  const d = new Date(`${iso}T00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(getLocale(), {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d);
}

/** Колонка «Коли» (§5.2): «Пн–Пт 20:00–22:00» / «14.06.2026 20:00–22:00». */
export function formatWhen(s: ScheduleDto): string {
  const range = `${s.time}–${endTime(s.time, s.durationMinutes)}`;
  if (s.type === "recurring") return `${formatDays(s.days)} ${range}`;
  return `${s.date ? formatIsoDate(s.date) : "—"} ${range}`;
}

/** Колонка «Наступний запуск»: «Сб 13.06 20:00»; null → «—». */
export function formatNextRun(nextRun: string | null): string {
  if (!nextRun) return "—";
  const d = new Date(nextRun); // без TZ-суфікса → локальний час
  if (Number.isNaN(d.getTime())) return nextRun;
  const dayIdx = (d.getDay() + 6) % 7; // JS: 0=Нд..6=Сб → модель: 0=Пн..6=Нд
  const dm = new Intl.DateTimeFormat(getLocale(), { day: "2-digit", month: "2-digit" }).format(d);
  return `${day(dayIdx)} ${dm} ${nextRun.slice(11, 16)}`;
}

export function missedReasonText(reason: ScheduleResultReason | null): string {
  switch (reason) {
    case "appNotRunning": return m.schedule_reason_app_not_running();
    case "startFailed": return m.schedule_reason_start_failed();
    case "clockChange": return m.schedule_reason_clock_change();
    case "unsupportedCodec": return m.schedule_reason_unsupported_codec();
    default: return m.schedule_result_none();
  }
}

/** Колонка «Останній результат» — рендериться з пари status + reason (§5.2). */
export function lastResultText(r: ScheduleResult | null): string {
  if (!r) return m.schedule_result_none();
  switch (r.status) {
    case "completed":
      return m.schedule_result_completed({ minutes: String(r.recordedMinutes) });
    case "startedLate":
      return m.schedule_result_started_late({ minutes: String(r.recordedMinutes) });
    case "missed":
      return m.schedule_result_missed({ reason: missedReasonText(r.reason) });
    case "stoppedByUser":
      switch (r.reason) {
        case "profileSwitch": return m.schedule_result_stopped_profile_switch();
        case "appClosing": return m.schedule_result_stopped_app_closing();
        case "scheduleEdited": return m.schedule_result_stopped_edited();
        default: return m.schedule_result_stopped_manual();
      }
    case "skippedAlreadyRecording":
      return m.schedule_result_skipped();
  }
}

export function stateText(enabled: boolean): string {
  return enabled ? m.schedule_state_enabled() : m.schedule_state_disabled();
}

/** Текст confirm переключення профілю (§3.5): однина/перелік. */
export function activeScheduledMessage(active: ActiveScheduled[]): string {
  const end = (a: ActiveScheduled) => a.windowEnd.slice(11, 16); // "YYYY-MM-DDTHH:MM" → "HH:MM"
  if (active.length === 1) {
    return m.profile_switch_scheduled_one({ name: active[0].name, end: end(active[0]) });
  }
  const list = active
    .map((a) => m.profile_switch_scheduled_item({ name: a.name, end: end(a) }))
    .join(", ");
  return m.profile_switch_scheduled_many({ list });
}
