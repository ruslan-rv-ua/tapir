import { describe, it, expect } from "vitest";
import { parseMinutes, durationBetween, validateForm, toInput } from "./formModel";
import type { ScheduleFormValues } from "./formModel";

const valid: ScheduleFormValues = {
  name: "Evening Jazz", streamId: "st1", type: "recurring",
  days: [4, 0, 2], date: "", timeStart: "20:00", timeEnd: "22:00",
};

describe("parseMinutes", () => {
  it("парсить HH:MM", () => expect(parseMinutes("20:30")).toBe(1230));
  it("відкидає сміття", () => {
    expect(parseMinutes("")).toBeNull();
    expect(parseMinutes("24:00")).toBeNull();
    expect(parseMinutes("9:5")).toBeNull();
  });
});

describe("durationBetween", () => {
  it("звичайний інтервал", () => expect(durationBetween("20:00", "22:00")).toBe(120));
  it("через північ (§5.3): 22:30 → 00:30 = 120 хв", () =>
    expect(durationBetween("22:30", "00:30")).toBe(120));
  it("рівність — невалідно (запис на 0/24 год не підтримується)", () =>
    expect(durationBetween("20:00", "20:00")).toBeNull());
  it("невалідний час — null", () => expect(durationBetween("", "22:00")).toBeNull());
});

describe("validateForm", () => {
  it("валідні значення — без помилок", () => expect(validateForm(valid)).toEqual({}));
  it("порожня назва", () =>
    expect(validateForm({ ...valid, name: "  " }).name).toBe("nameRequired"));
  it("не обрано потік", () =>
    expect(validateForm({ ...valid, streamId: "" }).streamId).toBe("streamRequired"));
  it("recurring без днів", () =>
    expect(validateForm({ ...valid, days: [] }).days).toBe("daysRequired"));
  it("oneshot без дати", () =>
    expect(validateForm({ ...valid, type: "oneshot", days: [], date: "" }).date)
      .toBe("dateRequired"));
  it("oneshot із датою — днів не вимагає", () =>
    expect(validateForm({ ...valid, type: "oneshot", days: [], date: "2026-06-14" }))
      .toEqual({}));
  it("невалідний час", () =>
    expect(validateForm({ ...valid, timeStart: "" }).time).toBe("timeRequired"));
  it("кінець = початку", () =>
    expect(validateForm({ ...valid, timeEnd: "20:00" }).time).toBe("timeEqual"));
});

describe("toInput", () => {
  it("recurring: сортовані дні, date = null, duration з пари часів", () => {
    expect(toInput(valid, true)).toEqual({
      streamId: "st1", name: "Evening Jazz", type: "recurring",
      days: [0, 2, 4], date: null, time: "20:00", durationMinutes: 120, enabled: true,
    });
  });
  it("oneshot: дні порожні, дата збережена", () => {
    const input = toInput(
      { ...valid, type: "oneshot", days: [3], date: "2026-06-14" }, false,
    );
    expect(input.days).toEqual([]);
    expect(input.date).toBe("2026-06-14");
    expect(input.enabled).toBe(false);
  });
});
