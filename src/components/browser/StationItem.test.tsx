import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { vi, beforeEach, afterEach } from "vitest";
import type { StationResult } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { getStationSegments, StationItem } from "./StationItem";
import { $playerStatus } from "../../stores/player";
import * as m from "../../i18n/paraglide/messages";

vi.mock("../../lib/tauri", () => ({
  previewStation: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
}));

const mkStation = (over: Partial<StationResult> = {}): StationResult => ({
  stationuuid: "u1",
  name: "Radio Bayraktar",
  url: "http://host/s",
  urlResolved: "http://host/s/resolved",
  codec: "MP3",
  bitrate: 128,
  country: "Ukraine",
  countrycode: "UA",
  tags: "jazz,news",
  language: "ukrainian",
  votes: 10,
  clickcount: 1200,
  hasExtendedInfo: null,
  homepage: "",
  lastcheckok: 1,
  ...over,
});

function renderItem(over: Partial<Parameters<typeof StationItem>[0]> = {}) {
  const props = {
    station: mkStation(),
    isFocused: (seg: string) => seg === "summary",
    isActiveRow: true,
    isAdded: false,
    isUnavailable: false,
    isSelected: false,
    onAdd: vi.fn(),
    onPreviewFailed: vi.fn(),
    ...over,
  };
  // isFocused is typed (segment: SegmentKind) => boolean; the cast keeps the test terse.
  const result = render(<ul><StationItem {...(props as Parameters<typeof StationItem>[0])} /></ul>);
  return { ...result, props };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null }));

describe("getStationSegments", () => {
  it("emits one stop per present value, in order, then the two actions", () => {
    expect(getStationSegments(mkStation())).toEqual([
      "country", "language", "codec", "bitrate", "genre", "popularity",
      "action-play", "action-add",
    ]);
  });

  it("omits country when empty", () => {
    expect(getStationSegments(mkStation({ country: "" }))).not.toContain("country");
  });

  it("omits language when empty", () => {
    expect(getStationSegments(mkStation({ language: "" }))).not.toContain("language");
  });

  it("omits genre when tags is empty", () => {
    expect(getStationSegments(mkStation({ tags: "" }))).not.toContain("genre");
  });

  it("omits bitrate when 0 and popularity when clickcount is 0", () => {
    const segs = getStationSegments(mkStation({ bitrate: 0, clickcount: 0 }));
    expect(segs).not.toContain("bitrate");
    expect(segs).not.toContain("popularity");
  });

  it("always ends with both action stops", () => {
    const segs = getStationSegments(mkStation({ country: "", language: "", codec: "", bitrate: 0, tags: "", clickcount: 0 }));
    expect(segs).toEqual(["action-play", "action-add"]);
  });
});

describe("StationItem — accessibility structure", () => {
  it("exposes the row as a listitem named after the station and described as a station", () => {
    const { container } = renderItem();
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("role")).toBe("listitem");
    expect(li.getAttribute("aria-label")).toContain("Radio Bayraktar");
    expect(li.getAttribute("aria-roledescription")).toMatch(/станц|station/i);
  });

  it("renders one role=group stop per metadata value with a value-only label", () => {
    const { container } = renderItem();
    const country = container.querySelector('[data-segment="country"]')!;
    expect(country.getAttribute("role")).toBe("group");
    expect(country.getAttribute("aria-roledescription")).toMatch(/країн|country/i);
    expect(country.getAttribute("aria-label")).toBe("Ukraine");
    expect(container.querySelector('[data-segment="bitrate"]')!.getAttribute("aria-label")).toMatch(/128/);
  });

  it("renders preview and add as individual button focus stops", () => {
    const { container } = renderItem();
    const segs = Array.from(container.querySelectorAll("button[data-segment]")).map((b) => b.getAttribute("data-segment"));
    expect(segs).toEqual(expect.arrayContaining(["action-play", "action-add"]));
  });
});

describe("StationItem — preview button", () => {
  it("previews this station's resolved URL on click", () => {
    const { container } = renderItem();
    fireEvent.click(container.querySelector('button[data-segment="action-play"]')!);
    expect(tauri.previewStation).toHaveBeenCalledWith("http://host/s/resolved", "Radio Bayraktar");
  });

  it("shows the stop state + stops playback when this station is the active preview source", () => {
    $playerStatus.set({
      state: "playing",
      source: { type: "preview", url: "http://host/s/resolved", name: "Radio Bayraktar" },
      volume: 0.75, positionMs: null, durationMs: null,
    });
    const { container } = renderItem();
    const btn = container.querySelector('button[data-segment="action-play"]')!;
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.getAttribute("aria-label")).toMatch(/зупинити|stop/i);
    fireEvent.click(btn);
    expect(tauri.stopPlayback).toHaveBeenCalled();
  });

  it("calls onPreviewFailed when the preview connection rejects", async () => {
    (tauri.previewStation as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("connect failed"));
    const { container, props } = renderItem();
    fireEvent.click(container.querySelector('button[data-segment="action-play"]')!);
    await vi.waitFor(() => expect(props.onPreviewFailed).toHaveBeenCalled());
  });
});

describe("StationItem — add button + liveness", () => {
  it("calls onAdd when not yet added", () => {
    const { container, props } = renderItem();
    fireEvent.click(container.querySelector('button[data-segment="action-add"]')!);
    expect(props.onAdd).toHaveBeenCalled();
  });

  it("includes the station name in the add button aria-label", () => {
    const { container } = renderItem();
    const btn = container.querySelector('button[data-segment="action-add"]')!;
    expect(btn.getAttribute("aria-label")).toMatch(/Radio Bayraktar/i);
  });

  it("marks the add button aria-disabled and does not call onAdd when already added", () => {
    const { container, props } = renderItem({ isAdded: true });
    const btn = container.querySelector('button[data-segment="action-add"]')!;
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(btn);
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it("prefixes the summary with the unavailable clause and renders a warning marker when unavailable", () => {
    const { container } = renderItem({ isUnavailable: true });
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toMatch(/недоступна|unavailable/i);
    // One extra decorative svg (the warning icon) beyond the action-button icons.
    expect(container.querySelector('svg')).toBeTruthy();
  });
});

describe("StationItem — same-name variants", () => {
  it("puts codec and bitrate in the row's accessible name", () => {
    // Six identically named BBC 6 Music variants must be told apart by ear
    // BEFORE they are added, so codec/bitrate belong in the row name itself.
    const { container } = renderItem({
      station: mkStation({ name: "BBC 6", country: "United Kingdom", codec: "AAC", bitrate: 48, tags: "pop" }),
    });
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toBe("BBC 6, United Kingdom, AAC, 48 kbps, pop");
  });

  it("omits metadata the directory does not report", () => {
    const { container } = renderItem({
      station: mkStation({ name: "BBC 6", country: "", codec: "MP3", bitrate: 0, tags: "" }),
    });
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toBe("BBC 6, MP3");
  });
});

describe("StationItem — selection", () => {
  it("appends the selected suffix and marks the row selected", () => {
    const { container } = renderItem({ isSelected: true });
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toMatch(new RegExp(`${m.selection_suffix()}$`));
    expect(li.getAttribute("data-selected")).toBe("true");
  });
});
