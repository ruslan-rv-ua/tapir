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
