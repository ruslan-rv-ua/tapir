// src/components/schedule/ScheduleTable.test.tsx
import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act, waitFor } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $schedules, $scheduleSelection } from "../../stores/schedule";
import { $streams } from "../../stores/streams";
import { $announcer } from "../../stores/announcer";
import { replaceSelection } from "../../stores/selection";
import type { ScheduleDto } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { ScheduleTable, type ScheduleTableHandle } from "./ScheduleTable";

vi.mock("../../lib/tauri", () => ({ deleteSchedules: vi.fn().mockResolvedValue(2) }));

const dto = (id: string): ScheduleDto => ({
  id, streamId: "st1", name: id, type: "recurring", days: [0], date: null,
  time: "20:00", durationMinutes: 60, enabled: true, createdAt: "2026-01-01T00:00:00Z",
  lastResult: null, nextRun: null,
} as unknown as ScheduleDto);

beforeEach(() => {
  vi.clearAllMocks();
  $streams.set([]);
  $schedules.set([dto("a"), dto("b"), dto("c")]);
  replaceSelection($scheduleSelection, new Set());
});

it("bulk-deletes the selection, mutates the store once, and announces the count", async () => {
  replaceSelection($scheduleSelection, new Set(["b", "c"]));
  const ref = createRef<ScheduleTableHandle>();
  const { getByText } = render(
    <ScheduleTable ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} onToggle={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />,
  );
  act(() => ref.current!.requestBulkDelete());
  fireEvent.click(getByText(m.schedule_action_delete()));
  await waitFor(() => expect(tauri.deleteSchedules).toHaveBeenCalledWith(["b", "c"]));
  await waitFor(() => expect($schedules.get().map((s) => s.id)).toEqual(["a"]));
  expect($announcer.get()?.message).toBe(m.schedules_removed_bulk({ count: 2 }));
});
