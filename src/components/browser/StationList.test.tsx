import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { StationResult } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { $streams } from "../../stores/streams";
import { $playerStatus } from "../../stores/player";
import { StationList } from "./StationList";

vi.mock("../../lib/tauri", () => ({
  previewStation: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
  addStationFromBrowser: vi.fn().mockResolvedValue(undefined),
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

const stations = () => [
  mkStation(),
  mkStation({ stationuuid: "u2", name: "Second", url: "http://h2", urlResolved: "http://h2/r" }),
];

beforeEach(() => {
  vi.clearAllMocks();
  $streams.set([]);
  $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null });
});

function renderList() {
  const ref = createRef<ZoneEntry>();
  const utils = render(
    <StationList
      ref={ref}
      stations={stations()}
      loading={false}
      error={null}
      hasMore={false}
      emptyMessage="empty"
      exitZone={vi.fn()}
    />,
  );
  act(() => ref.current!.focus("forward"));
  return utils;
}

describe("StationList — row activation", () => {
  it("plain Enter on a row adds the station", () => {
    renderList();
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(tauri.addStationFromBrowser).toHaveBeenCalledWith(
      expect.objectContaining({ stationuuid: "u1" }),
    );
    expect(tauri.previewStation).not.toHaveBeenCalled();
  });

  it("Shift+Enter toggles the preview instead of adding", () => {
    renderList();
    fireEvent.keyDown(document.activeElement!, { key: "Enter", shiftKey: true });
    expect(tauri.previewStation).toHaveBeenCalledWith("http://host/s/resolved", "Radio Bayraktar");
    expect(tauri.addStationFromBrowser).not.toHaveBeenCalled();
  });

  it("Shift+Enter stops the preview when this station is already previewing", () => {
    $playerStatus.set({
      state: "playing",
      source: { type: "preview", url: "http://host/s/resolved", name: "Radio Bayraktar" },
      volume: 0.75, positionMs: null, durationMs: null,
    });
    renderList();
    fireEvent.keyDown(document.activeElement!, { key: "Enter", shiftKey: true });
    expect(tauri.stopPlayback).toHaveBeenCalled();
    expect(tauri.addStationFromBrowser).not.toHaveBeenCalled();
  });

  it("Ctrl+Enter does nothing in the browser (no recording here)", () => {
    renderList();
    fireEvent.keyDown(document.activeElement!, { key: "Enter", ctrlKey: true });
    expect(tauri.addStationFromBrowser).not.toHaveBeenCalled();
    expect(tauri.previewStation).not.toHaveBeenCalled();
  });

  it("advertises Shift+Enter on the row via aria-keyshortcuts", () => {
    const { container } = renderList();
    const li = container.querySelector('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-keyshortcuts")).toBe("Shift+Enter");
  });
});
