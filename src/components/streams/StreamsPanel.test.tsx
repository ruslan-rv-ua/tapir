import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { $streams, $statuses, $streamFilter } from "../../stores/streams";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import { StreamsPanel } from "./StreamsPanel";

// No backend in jsdom — stub the Tauri IPC layer.
vi.mock("../../lib/tauri", () => ({
  playStream: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue(undefined),
  stopAllRecordings: vi.fn().mockResolvedValue(undefined),
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

const mkStatus = (id: string, state: StreamStatus["state"]): StreamStatus => ({
  streamId: id,
  state,
  currentTrack: null,
  recordingStartedAt: null,
  bytesRecorded: 0,
  tracksRecorded: 0,
  error: null,
  reconnectAttempt: null,
});

function renderPanel() {
  return render(<StreamsPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
}

// The chip group is the one role="group" whose buttons carry aria-pressed
// (StreamItem cells are also role="group" but contain no pressed buttons).
function chipButtons(container: HTMLElement) {
  const groups = Array.from(container.querySelectorAll('[role="group"]'));
  const group = groups.find((g) => g.querySelector("button[aria-pressed]"));
  return {
    group,
    chips: group
      ? Array.from(group.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"))
      : [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  $statuses.set({});
  $streamFilter.set("all");
  $streams.set([mkStream("a", "Alpha")]);
});

describe("StreamsPanel — filter state persistence", () => {
  it("reads the active filter from the store after remount", () => {
    const { unmount } = renderPanel();
    act(() => $streamFilter.set("errors"));
    unmount();

    const { container } = renderPanel();
    const pressed = container.querySelector('button[aria-pressed="true"]')!;
    expect(pressed.textContent).toMatch(/помилк|error/i);
  });
});

describe("StreamsPanel — filter chip group semantics", () => {
  it("wraps the three chips in a single labelled group", () => {
    const { container } = renderPanel();
    const { group, chips } = chipButtons(container);
    expect(group).toBeTruthy();
    expect(group!.getAttribute("aria-label")).toMatch(/фільтр потоків|stream filter/i);
    expect(chips).toHaveLength(3);
  });

  it("keeps the Stop-all button outside the group", () => {
    const { container } = renderPanel();
    const { group } = chipButtons(container);
    const texts = Array.from(group!.querySelectorAll("button")).map((b) => b.textContent);
    expect(texts.some((t) => /зупинити|stop all/i.test(t ?? ""))).toBe(false);
  });
});

describe("StreamsPanel — chip counts", () => {
  beforeEach(() => {
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo"), mkStream("c", "Charlie")]);
    $statuses.set({
      a: mkStatus("a", "recording"),
      b: mkStatus("b", "error"),
      c: mkStatus("c", "error"),
    });
  });

  it("shows a visual count badge (hidden from AT) on recording and errors chips", () => {
    const { container } = renderPanel();
    const { chips } = chipButtons(container);
    const [, rec, err] = chips; // order: all, recording, errors
    const recBadge = rec.querySelector('[aria-hidden="true"]');
    const errBadge = err.querySelector('[aria-hidden="true"]');
    expect(recBadge?.textContent).toBe("1");
    expect(errBadge?.textContent).toBe("2");
  });

  it("folds the count into the chip aria-label with a comma; All has no numeric label", () => {
    const { container } = renderPanel();
    const { chips } = chipButtons(container);
    const [all, rec, err] = chips;
    expect(all.getAttribute("aria-label")).toBeNull();
    expect(rec.getAttribute("aria-label")).toMatch(/,\s*1$/);
    expect(err.getAttribute("aria-label")).toMatch(/,\s*2$/);
  });

  it("still shows a 0 badge on counted chips when nothing matches; All stays bare", () => {
    // 0 is a real count and must render (count !== null); "All" (count === null)
    // never shows a badge or numeric label. Guards against a truthy-check regression.
    $statuses.set({});
    const { container } = renderPanel();
    const { chips } = chipButtons(container);
    const [all, rec, err] = chips;
    expect(rec.querySelector('[aria-hidden="true"]')?.textContent).toBe("0");
    expect(err.querySelector('[aria-hidden="true"]')?.textContent).toBe("0");
    expect(rec.getAttribute("aria-label")).toMatch(/,\s*0$/);
    expect(all.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(all.getAttribute("aria-label")).toBeNull();
  });
});
