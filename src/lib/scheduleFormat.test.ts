import { describe, it, expect, vi } from "vitest";

vi.mock("../i18n/paraglide/runtime", () => ({ getLocale: () => "uk" }));
vi.mock("../i18n/paraglide/messages", () => ({
  day_short_0: () => "Пн", day_short_1: () => "Вт", day_short_2: () => "Ср",
  day_short_3: () => "Чт", day_short_4: () => "Пт", day_short_5: () => "Сб",
  day_short_6: () => "Нд",
  schedule_days_daily: () => "Щодня",
  schedule_state_enabled: () => "Увімкнено",
  schedule_state_disabled: () => "Вимкнено",
  schedule_result_none: () => "—",
  schedule_result_completed: ({ minutes }: { minutes: string }) => `✓ записано ${minutes} хв`,
  schedule_result_started_late: ({ minutes }: { minutes: string }) => `почато із запізненням, ${minutes} хв`,
  schedule_result_missed: ({ reason }: { reason: string }) => `✗ пропущено (${reason})`,
  schedule_result_stopped_manual: () => "зупинено вручну",
  schedule_result_stopped_profile_switch: () => "зупинено: переключення профілю",
  schedule_result_stopped_app_closing: () => "зупинено: закриття додатка",
  schedule_result_stopped_edited: () => "зупинено: розклад змінено",
  schedule_result_skipped: () => "потік уже записувався",
  schedule_reason_app_not_running: () => "Tapir не працював",
  schedule_reason_start_failed: () => "не вдалося стартувати запис",
  schedule_reason_clock_change: () => "переведення годинника",
  schedule_reason_unsupported_codec: () => "кодек не підтримується",
  profile_switch_scheduled_one: ({ name, end }: { name: string; end: string }) =>
    `Триває плановий запис «${name}» до ${end}. Переключити профіль і зупинити його?`,
  profile_switch_scheduled_item: ({ name, end }: { name: string; end: string }) => `«${name}» до ${end}`,
  profile_switch_scheduled_many: ({ list }: { list: string }) =>
    `Тривають планові записи: ${list}. Переключити профіль і зупинити їх?`,
}));

import {
  endTime, formatDays, formatWhen, formatNextRun,
  lastResultText, missedReasonText, stateText, activeScheduledMessage,
} from "./scheduleFormat";
import type { ScheduleDto, ScheduleResult } from "./tauri";

function dto(over: Partial<ScheduleDto>): ScheduleDto {
  return {
    id: "s1", streamId: "st1", name: "Evening Jazz", type: "recurring",
    days: [0, 1, 2, 3, 4], date: null, time: "20:00", durationMinutes: 120,
    enabled: true, createdAt: "2026-06-12T10:00:00+03:00", lastResult: null,
    nextRun: null, ...over,
  };
}

describe("endTime", () => {
  it("додає тривалість", () => expect(endTime("20:00", 120)).toBe("22:00"));
  it("перехід через північ — за модулем доби", () => expect(endTime("23:30", 60)).toBe("00:30"));
});

describe("formatDays", () => {
  it("колапсить послідовні дні від трьох у діапазон", () =>
    expect(formatDays([0, 1, 2, 3, 4])).toBe("Пн–Пт"));
  it("несуміжні — через кому", () => expect(formatDays([0, 2, 4])).toBe("Пн, Ср, Пт"));
  it("пара днів не колапситься", () => expect(formatDays([5, 6])).toBe("Сб, Нд"));
  it("усі сім — «Щодня»", () => expect(formatDays([0, 1, 2, 3, 4, 5, 6])).toBe("Щодня"));
});

describe("formatWhen", () => {
  it("recurring: дні + діапазон часу", () =>
    expect(formatWhen(dto({}))).toBe("Пн–Пт 20:00–22:00"));
  it("oneshot: локалізована дата + діапазон", () =>
    expect(formatWhen(dto({ type: "oneshot", days: [], date: "2026-06-14" })))
      .toBe("14.06.2026 20:00–22:00"));
});

describe("formatNextRun", () => {
  it("null → «—»", () => expect(formatNextRun(null)).toBe("—"));
  it("день тижня + дата + час", () =>
    // 2026-06-13 — субота
    expect(formatNextRun("2026-06-13T20:00")).toBe("Сб 13.06 20:00"));
});

describe("lastResultText", () => {
  const res = (over: Partial<ScheduleResult>): ScheduleResult => ({
    occurrence: "2026-06-12T20:00", status: "completed", reason: null,
    recordedMinutes: 119, finishedAt: "2026-06-12T22:00:00", ...over,
  });
  it("null → «—»", () => expect(lastResultText(null)).toBe("—"));
  it("completed", () => expect(lastResultText(res({}))).toBe("✓ записано 119 хв"));
  it("startedLate", () =>
    expect(lastResultText(res({ status: "startedLate", recordedMinutes: 80 })))
      .toBe("почато із запізненням, 80 хв"));
  it("missed + reason", () =>
    expect(lastResultText(res({ status: "missed", reason: "appNotRunning", recordedMinutes: 0 })))
      .toBe("✗ пропущено (Tapir не працював)"));
  it("stoppedByUser за кодом причини", () => {
    expect(lastResultText(res({ status: "stoppedByUser", reason: "manualStop" }))).toBe("зупинено вручну");
    expect(lastResultText(res({ status: "stoppedByUser", reason: "profileSwitch" }))).toBe("зупинено: переключення профілю");
    expect(lastResultText(res({ status: "stoppedByUser", reason: "appClosing" }))).toBe("зупинено: закриття додатка");
    expect(lastResultText(res({ status: "stoppedByUser", reason: "scheduleEdited" }))).toBe("зупинено: розклад змінено");
  });
  it("skippedAlreadyRecording", () =>
    expect(lastResultText(res({ status: "skippedAlreadyRecording" }))).toBe("потік уже записувався"));
});

describe("missedReasonText", () => {
  it("мапить коди", () => {
    expect(missedReasonText("appNotRunning")).toBe("Tapir не працював");
    expect(missedReasonText("startFailed")).toBe("не вдалося стартувати запис");
    expect(missedReasonText("clockChange")).toBe("переведення годинника");
    expect(missedReasonText("unsupportedCodec")).toBe("кодек не підтримується");
    expect(missedReasonText(null)).toBe("—");
  });
});

describe("stateText", () => {
  it("enabled/disabled", () => {
    expect(stateText(true)).toBe("Увімкнено");
    expect(stateText(false)).toBe("Вимкнено");
  });
});

describe("activeScheduledMessage", () => {
  const a = (name: string, windowEnd: string) =>
    ({ recordingId: "r1", name, streamId: "st1", windowEnd });
  it("однина: назва + кінець вікна HH:MM", () =>
    expect(activeScheduledMessage([a("Evening Jazz", "2026-06-12T22:05")]))
      .toBe("Триває плановий запис «Evening Jazz» до 22:05. Переключити профіль і зупинити його?"));
  it("множина: перелік", () =>
    expect(activeScheduledMessage([a("A", "2026-06-12T22:05"), a("B", "2026-06-12T23:10")]))
      .toBe("Тривають планові записи: «A» до 22:05, «B» до 23:10. Переключити профіль і зупинити їх?"));
});
