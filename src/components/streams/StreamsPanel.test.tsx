import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
import * as tauri from "../../lib/tauri";
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
  startAllRecordings: vi.fn().mockResolvedValue(0),
  removeStream: vi.fn().mockResolvedValue(undefined),
  addToWishlist: vi.fn().mockResolvedValue(undefined),
  addToIgnorelist: vi.fn().mockResolvedValue(undefined),
  beginStreamImport: vi.fn().mockResolvedValue(null),
}));

// ImportStreamsDialog uses useTauriEvent; stub it so jsdom doesn't try to call
// the Tauri event bridge (which doesn't exist in the test environment).
vi.mock("../../hooks/useTauriEvent", () => ({ useTauriEvent: vi.fn() }));

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
  it("renders the visible section title as a level-1 heading", () => {
    renderPanel();

    expect(screen.getByRole("heading", { level: 1, name: /потоки|streams/i })).toBeTruthy();
  });

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

  it("shows a visual count badge (hidden from AT) on every chip", () => {
    const { container } = renderPanel();
    const { chips } = chipButtons(container);
    const [all, rec, err] = chips; // order: all, recording, errors
    expect(all.querySelector('[aria-hidden="true"]')?.textContent).toBe("3"); // total streams
    expect(rec.querySelector('[aria-hidden="true"]')?.textContent).toBe("1");
    expect(err.querySelector('[aria-hidden="true"]')?.textContent).toBe("2");
  });

  it("folds the count into every chip aria-label with a comma", () => {
    const { container } = renderPanel();
    const { chips } = chipButtons(container);
    const [all, rec, err] = chips;
    expect(all.getAttribute("aria-label")).toMatch(/,\s*3$/); // total streams
    expect(rec.getAttribute("aria-label")).toMatch(/,\s*1$/);
    expect(err.getAttribute("aria-label")).toMatch(/,\s*2$/);
  });

  it("still shows a 0 badge on a counted filter with no matches", () => {
    // 0 is a real count and must render. "All" tracks the total stream count
    // (3 here) independently of statuses. Guards a truthy-check regression.
    $statuses.set({});
    const { container } = renderPanel();
    const { chips } = chipButtons(container);
    const [all, rec, err] = chips;
    expect(all.querySelector('[aria-hidden="true"]')?.textContent).toBe("3");
    expect(rec.querySelector('[aria-hidden="true"]')?.textContent).toBe("0");
    expect(err.querySelector('[aria-hidden="true"]')?.textContent).toBe("0");
    expect(rec.getAttribute("aria-label")).toMatch(/,\s*0$/);
  });
});

describe("StreamsPanel — record all", () => {
  it("renders the Record-all primary button", () => {
    renderPanel();
    expect(
      screen.getByRole("button", { name: /записати все|record all/i }),
    ).toBeTruthy();
  });

  it("calls startAllRecordings when clicked", async () => {
    renderPanel();
    const btn = screen.getByRole("button", { name: /записати все|record all/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(tauri.startAllRecordings).toHaveBeenCalledOnce();
  });

  it("disables Record-all when every stream is already active", () => {
    $streams.set([mkStream("a", "Alpha")]);
    $statuses.set({ a: mkStatus("a", "recording") });
    renderPanel();
    const btn = screen.getByRole("button", {
      name: /записати все|record all/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("enables Record-all when a stream is idle or errored", () => {
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo")]);
    $statuses.set({ a: mkStatus("a", "recording"), b: mkStatus("b", "error") });
    renderPanel();
    const btn = screen.getByRole("button", {
      name: /записати все|record all/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});

describe("StreamsPanel — stop button label", () => {
  it("labels the stop button as stopping recording", () => {
    $streams.set([mkStream("a", "Alpha")]);
    $statuses.set({ a: mkStatus("a", "recording") });
    renderPanel();
    expect(
      screen.getByRole("button", { name: /^зупинити запис$|^stop recording$/i }),
    ).toBeTruthy();
  });
});
