import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { ScheduleItem } from "./ScheduleItem";
import type { ScheduleDto } from "../../lib/tauri";

const dto: ScheduleDto = {
  id: "s1", streamId: "st1", name: "Evening Jazz", type: "recurring",
  days: [0], date: null, time: "20:00", durationMinutes: 60, enabled: true,
  createdAt: "2026-01-01T00:00:00Z", lastResult: null, nextRun: "2026-06-20T20:00",
} as unknown as ScheduleDto;

it("appends the selected suffix and marks the row selected", () => {
  const { container } = render(
    <ul>
      <ScheduleItem schedule={dto} streamName="X" isActiveRow isSelected selectionCount={1}
        isFocused={(s) => s === "summary"} onToggle={vi.fn()} onAction={vi.fn()} />
    </ul>,
  );
  const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
  expect(li.getAttribute("aria-label")).toMatch(new RegExp(`${m.selection_suffix()}$`));
  expect(li.getAttribute("data-selected")).toBe("true");
});
