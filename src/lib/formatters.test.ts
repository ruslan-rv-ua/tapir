import { describe, it, expect, vi } from "vitest";
import { isLowDiskSpace, formatBytes, formatDate, formatDateTime, formatTime, formatBitrate, volumePercent } from "./formatters";

vi.mock("../i18n/paraglide/messages", () => ({
  codec_unsupported: () => "не підтримується",
}));

const GiB = 1024 ** 3;

describe("isLowDiskSpace", () => {
  it("is false when threshold is 0 (disabled)", () => {
    expect(isLowDiskSpace(0, 0)).toBe(false);
  });
  it("is false when free space is null (unknown)", () => {
    expect(isLowDiskSpace(null, 5)).toBe(false);
  });
  it("is true when free bytes are below threshold", () => {
    expect(isLowDiskSpace(2 * GiB, 5)).toBe(true);
  });
  it("is false when free bytes are at or above threshold", () => {
    expect(isLowDiskSpace(5 * GiB, 5)).toBe(false);
    expect(isLowDiskSpace(6 * GiB, 5)).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats across unit boundaries", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("formatDate / formatDateTime", () => {
  // Midday UTC so the local date never crosses a day/year boundary in any TZ.
  const iso = "2026-06-15T12:00:00Z";

  it("formatDate includes the year and omits the time", () => {
    const out = formatDate(iso);
    expect(out).toContain("2026");
    expect(out).not.toMatch(/\d\d:\d\d/);
  });

  it("formatDateTime includes the time", () => {
    expect(formatDateTime(iso)).toMatch(/\d\d:\d\d/);
  });

  it("returns the raw input for an unparseable date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });
});

describe("formatTime", () => {
  it("keeps the clock and drops the date", () => {
    // Рядок журналу збігів несе час, а не дату: журнал сесійний, тож усе в
    // ньому — сьогоднішнє, і дата була б шумом у кожному рядку.
    // Без якорів навмисно: формат годин дає локаль (під en-US це «12:34 PM»),
    // і перевіряємо ми не її, а те, що дати в рядку немає.
    const out = formatTime("2026-06-15T12:34:00Z");
    expect(out).toMatch(/\d\d:\d\d/);
    expect(out).not.toContain("2026");
    expect(out).not.toMatch(/\d{4}/);
  });

  it("returns the raw input for an unparseable time", () => {
    expect(formatTime("not-a-date")).toBe("not-a-date");
  });
});

describe("formatBitrate", () => {
  it("joins what is known and dashes when nothing is", () => {
    expect(formatBitrate(128, "mp3")).toBe("128 kbps · MP3");
    expect(formatBitrate(128, null)).toBe("128 kbps");
    expect(formatBitrate(null, "aac")).toBe("AAC");
    expect(formatBitrate(null, null)).toBe("—");
  });

  it("names the family and says it is not supported", () => {
    // Видимий носій рядка: те, що Tapir відмовився писати, мусить бути на
    // екрані текстом, а не лише в події (ADR 2026-08-31).
    expect(formatBitrate(128, null, { family: "OGG" })).toBe("128 kbps · OGG · не підтримується");
  });

  it("still says it is not supported when the family has no name", () => {
    expect(formatBitrate(null, null, { family: null })).toBe("не підтримується");
    expect(formatBitrate(96, null, { family: null })).toBe("96 kbps · не підтримується");
  });
});

describe("volumePercent", () => {
  // One rounding for three carriers (ADR 2026-08-31 §6): the number beside the
  // slider, the value the thumb reads out, and the hotkey announce. Rounded in
  // two places they would disagree at exactly the levels a person checks.
  it("turns a 0..1 level into whole percent", () => {
    expect(volumePercent(0)).toBe(0);
    expect(volumePercent(0.45)).toBe(45);
    expect(volumePercent(1)).toBe(100);
  });

  it("rounds rather than truncates, so a step lands on the number the slider shows", () => {
    expect(volumePercent(0.4499)).toBe(45);
    expect(volumePercent(0.055)).toBe(6);
    // Float drift from repeated steps must not read as 44%.
    expect(volumePercent(0.1 + 0.35)).toBe(45);
  });
});
