import type { ScheduleType, ScheduledRecordingInput } from "../../lib/tauri";

export interface ScheduleFormValues {
  name: string;
  streamId: string;
  type: ScheduleType;
  days: number[];
  /** "" — не задано. */
  date: string;
  /** "HH:MM" або "". */
  timeStart: string;
  timeEnd: string;
}

export type FormErrorCode =
  | "nameRequired" | "streamRequired" | "daysRequired"
  | "dateRequired" | "timeRequired" | "timeEqual";

export type FormErrors = Partial<
  Record<"name" | "streamId" | "days" | "date" | "time", FormErrorCode>
>;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseMinutes(time: string): number | null {
  if (!TIME_RE.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Тривалість між початком і кінцем; кінець < початку = через північ (§5.3).
 * 0 (рівність) → null: запис на 0 або 24 години не підтримується (§2).
 */
export function durationBetween(timeStart: string, timeEnd: string): number | null {
  const start = parseMinutes(timeStart);
  const end = parseMinutes(timeEnd);
  if (start == null || end == null) return null;
  const d = (end - start + 1440) % 1440;
  return d === 0 ? null : d;
}

/** Клієнтська валідація §5.3 (коди — компонент мапить на i18n-рядки). */
export function validateForm(v: ScheduleFormValues): FormErrors {
  const errors: FormErrors = {};
  if (!v.name.trim()) errors.name = "nameRequired";
  if (!v.streamId) errors.streamId = "streamRequired";
  if (v.type === "recurring" && v.days.length === 0) errors.days = "daysRequired";
  if (v.type === "oneshot" && !v.date) errors.date = "dateRequired";
  const start = parseMinutes(v.timeStart);
  const end = parseMinutes(v.timeEnd);
  if (start == null || end == null) errors.time = "timeRequired";
  else if (start === end) errors.time = "timeEqual";
  return errors;
}

/** Збирання payload §4. Викликати лише після validateForm без помилок. */
export function toInput(v: ScheduleFormValues, enabled: boolean): ScheduledRecordingInput {
  return {
    streamId: v.streamId,
    name: v.name.trim(),
    type: v.type,
    days: v.type === "recurring" ? [...new Set(v.days)].sort((a, b) => a - b) : [],
    date: v.type === "oneshot" ? v.date : null,
    time: v.timeStart,
    durationMinutes: durationBetween(v.timeStart, v.timeEnd)!,
    enabled,
  };
}
