import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { $streams, $statuses } from "../../stores/streams";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { StreamInfo } from "../../lib/tauri";
import { StreamList } from "./StreamList";

vi.mock("../../lib/tauri", () => ({
  playStream: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue(undefined),
  removeStream: vi.fn().mockResolvedValue(undefined),
  addToWishlist: vi.fn().mockResolvedValue(undefined),
  addToIgnorelist: vi.fn().mockResolvedValue(undefined),
}));

const mkStream = (id: string, name: string): StreamInfo => ({
  id,
  url: `http://x/${id}`,
  name,
  format: "mp3",
  bitrate: 192,
  icyName: null,
  icyGenre: null,
  icyUrl: null,
  ignorelist: [],
  username: null,
  password: null,
  addedAt: "2026-01-01T00:00:00Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  $statuses.set({});
  $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo"), mkStream("c", "Charlie")]);
});

function renderList() {
  const ref = createRef<ZoneEntry>();
  const exitZone = vi.fn();
  const onEmpty = vi.fn();
  const utils = render(<StreamList ref={ref} exitZone={exitZone} onEmpty={onEmpty} />);
  return { ref, exitZone, onEmpty, ...utils };
}

const activeAttrs = () => {
  const ae = document.activeElement;
  return {
    id: ae?.getAttribute("data-item-id") ?? null,
    seg: ae?.getAttribute("data-segment") ?? null,
  };
};

describe("StreamList — integration with composite-list navigation", () => {
  it("renders one row per stream, each described as a stream", () => {
    const { container } = renderList();
    const rows = container.querySelectorAll('li[data-segment="summary"]');
    expect(rows).toHaveLength(3);
    rows.forEach((li) =>
      expect(li.getAttribute("aria-roledescription")).toMatch(/потік|stream/i),
    );
  });

  it("focuses the first row on zone entry, then ArrowDown moves to the next row", () => {
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    expect(activeAttrs()).toEqual({ id: "a", seg: "summary" });

    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(activeAttrs()).toEqual({ id: "b", seg: "summary" });
  });

  it("Right drills into the row's segments/buttons; Down returns to the next row's summary", () => {
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(activeAttrs()).toEqual({ id: "a", seg: "track" });

    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(activeAttrs()).toEqual({ id: "b", seg: "summary" });
  });

  it("Tab exits the zone forward", () => {
    const { ref, exitZone } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(exitZone).toHaveBeenCalledWith(true);
  });

  it("exposes the list as an application region (NVDA focus mode)", () => {
    const { container } = renderList();
    const ul = container.querySelector("ul")!;
    expect(ul.getAttribute("role")).toBe("application");
    expect(ul.getAttribute("data-zone-id")).toBe("streams-list");
    expect(ul.getAttribute("aria-label")).toBeTruthy();
  });
});
