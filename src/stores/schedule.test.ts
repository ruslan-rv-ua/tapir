import { describe, it, expect, vi, beforeEach } from "vitest";
import * as tauri from "../lib/tauri";
import { $schedules, $schedulesLoading, $schedulesError, loadSchedules } from "./schedule";
import type { ScheduleDto } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({ getSchedules: vi.fn(async () => []) }));

const dto = (id: string): ScheduleDto => ({
  id, streamId: "st1", name: id, type: "recurring", days: [0], date: null,
  time: "20:00", durationMinutes: 60, enabled: true,
  createdAt: "2026-06-12T10:00:00+03:00", lastResult: null, nextRun: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  $schedules.set([]);
  $schedulesError.set(null);
  $schedulesLoading.set(false);
});

describe("loadSchedules", () => {
  it("кладе список у $schedules", async () => {
    vi.mocked(tauri.getSchedules).mockResolvedValueOnce([dto("a"), dto("b")]);
    await loadSchedules();
    expect($schedules.get().map((s) => s.id)).toEqual(["a", "b"]);
    expect($schedulesLoading.get()).toBe(false);
  });

  it("помилка → $schedulesError, список не чіпається", async () => {
    $schedules.set([dto("old")]);
    vi.mocked(tauri.getSchedules).mockRejectedValueOnce(new Error("boom"));
    await loadSchedules();
    expect($schedulesError.get()).toContain("boom");
    expect($schedules.get().map((s) => s.id)).toEqual(["old"]);
  });

  it("loading вмикається лише коли store порожній (рефетч не демонтує список)", async () => {
    $schedules.set([dto("a")]);
    let seenLoading = false;
    const unsub = $schedulesLoading.listen((v) => { if (v) seenLoading = true; });
    vi.mocked(tauri.getSchedules).mockResolvedValueOnce([dto("a")]);
    await loadSchedules();
    unsub();
    expect(seenLoading).toBe(false);
  });

  it("пізніша відповідь не перетирається ранішою (guard послідовності)", async () => {
    let resolveFirst!: (v: ScheduleDto[]) => void;
    vi.mocked(tauri.getSchedules)
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce([dto("new")]);
    const first = loadSchedules();
    const second = loadSchedules();
    await second;
    resolveFirst([dto("stale")]);
    await first;
    expect($schedules.get().map((s) => s.id)).toEqual(["new"]);
  });
});
