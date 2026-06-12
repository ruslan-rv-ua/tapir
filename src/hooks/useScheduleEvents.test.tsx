import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { $announcer } from "../stores/announcer";
import * as tauri from "../lib/tauri";

type Handler = (e: { payload: unknown }) => void;
const handlers = new Map<string, Handler>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: Handler) => {
    handlers.set(event, cb);
    return () => handlers.delete(event);
  }),
}));

vi.mock("../lib/tauri", () => ({ getSchedules: vi.fn(async () => []) }));

vi.mock("../i18n/paraglide/messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../i18n/paraglide/messages")>();
  return {
    ...actual,
    scheduled_announce_started: ({ name }: { name: string }) => `started ${name}`,
    scheduled_announce_completed: ({ name, minutes }: { name: string; minutes: string }) =>
      `completed ${name} ${minutes}`,
    scheduled_announce_missed: ({ name, reason }: { name: string; reason: string }) =>
      `missed ${name}: ${reason}`,
    scheduled_announce_skipped: ({ name }: { name: string }) => `skipped ${name}`,
    schedule_reason_app_not_running: () => "Tapir не працював",
    schedule_reason_start_failed: () => "не вдалося стартувати запис",
    schedule_reason_clock_change: () => "переведення годинника",
    schedule_result_none: () => "—",
  };
});

import { useScheduleEvents } from "./useScheduleEvents";

function Host() {
  useScheduleEvents();
  return null;
}

const base = { recordingId: "r1", streamId: "st1", name: "Jazz" };

async function fire(event: string, payload: unknown) {
  handlers.get(event)!({ payload });
  // дочекатися мікротасок refetch
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  $announcer.set(null);
});

describe("useScheduleEvents", () => {
  it("started → assertive announce + refetch", async () => {
    render(<Host />);
    await vi.waitFor(() => expect(handlers.has("scheduled-started")).toBe(true));
    await fire("scheduled-started", base);
    expect($announcer.get()).toEqual({ message: "started Jazz", priority: "assertive" });
    expect(tauri.getSchedules).toHaveBeenCalled();
  });

  it("completed → announce із хвилинами", async () => {
    render(<Host />);
    await vi.waitFor(() => expect(handlers.has("scheduled-completed")).toBe(true));
    await fire("scheduled-completed", { ...base, status: "startedLate", recordedMinutes: 80 });
    expect($announcer.get()).toEqual({ message: "completed Jazz 80", priority: "assertive" });
  });

  it("completed зі статусом stoppedByUser → store оновлюється, announce НЕМає (§4)", async () => {
    render(<Host />);
    await vi.waitFor(() => expect(handlers.has("scheduled-completed")).toBe(true));
    await fire("scheduled-completed", { ...base, status: "stoppedByUser", recordedMinutes: 15 });
    expect($announcer.get()).toBeNull();
    expect(tauri.getSchedules).toHaveBeenCalled();
  });

  it("missed → announce з локалізованою причиною", async () => {
    render(<Host />);
    await vi.waitFor(() => expect(handlers.has("scheduled-missed")).toBe(true));
    await fire("scheduled-missed", { ...base, reason: "appNotRunning" });
    expect($announcer.get()).toEqual({
      message: "missed Jazz: Tapir не працював",
      priority: "assertive",
    });
  });

  it("skipped → announce", async () => {
    render(<Host />);
    await vi.waitFor(() => expect(handlers.has("scheduled-skipped")).toBe(true));
    await fire("scheduled-skipped", base);
    expect($announcer.get()).toEqual({ message: "skipped Jazz", priority: "assertive" });
  });
});
