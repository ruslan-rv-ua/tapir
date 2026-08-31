import { describe, it, expect, vi } from "vitest";
import { isLowDiskSpace, formatBytes, formatDate, formatDateTime, formatBitrate } from "./formatters";

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
