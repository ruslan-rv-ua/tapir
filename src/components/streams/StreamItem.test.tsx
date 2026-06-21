import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { StreamItem } from "./StreamItem";
import { $playerStatus } from "../../stores/player";
import * as m from "../../i18n/paraglide/messages";

// Stub the Tauri IPC layer — there is no backend in jsdom.
vi.mock("../../lib/tauri", () => ({
  playStream: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue(undefined),
  addToWishlist: vi.fn().mockResolvedValue(undefined),
  addToIgnorelist: vi.fn().mockResolvedValue(undefined),
}));

const mkStream = (over: Partial<StreamInfo> = {}): StreamInfo => ({
  id: "s1",
  url: "http://x/s1",
  name: "Radio Paradise",
  format: "mp3",
  bitrate: 192,
  icyName: null,
  icyGenre: null,
  icyUrl: null,
  ignorelist: [],
  username: null,
  password: null,
  addedAt: "2026-01-01T00:00:00Z",
  ...over,
});

function renderItem(stream = mkStream(), status?: StreamStatus, focusedSeg = "summary", maxRetries = 0) {
  return render(
    <ul>
      <StreamItem
        stream={stream}
        status={status}
        isActiveRow
        isFocused={(seg) => seg === focusedSeg}
        maxRetries={maxRetries}
        onDelete={() => {}}
        onCopyToProfile={() => {}}
        onMoveToProfile={() => {}}
        onCopyUrl={() => {}}
      />
    </ul>,
  );
}

beforeEach(() => vi.clearAllMocks());

afterEach(() => {
  $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null });
});

describe("StreamItem — accessibility structure", () => {
  it("exposes the row as a listitem named after the stream and described as a stream (no bare 'section')", () => {
    const { container } = renderItem();
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]');
    expect(li).toBeTruthy();
    // Explicit role="listitem": under the list's role="application" parent the
    // <li>'s implicit listitem role is dropped, leaving NVDA with nothing to
    // announce. The explicit role keeps the row announceable.
    expect(li!.getAttribute("role")).toBe("listitem");
    expect(li!.getAttribute("aria-label")).toContain("Radio Paradise");
    expect(li!.getAttribute("aria-roledescription")).toMatch(/потік|stream/i);
    // The <li> itself is the focus stop (tabIndex 0 while summary is active).
    expect(li!.tabIndex).toBe(0);
  });

  it("renders info cells as role=group with a roledescription and a value-only label", () => {
    const { container } = renderItem();
    const tech = container.querySelector('[data-segment="tech"]')!;
    expect(tech.getAttribute("role")).toBe("group");
    expect(tech.getAttribute("aria-roledescription")).toMatch(/бітрейт|bitrate/i);
    // Value only — the segment type lives in aria-roledescription, not the label.
    expect(tech.getAttribute("aria-label")).toMatch(/192/);
  });

  it("renders each action as its own button focus stop", () => {
    const { container } = renderItem();
    const segs = Array.from(container.querySelectorAll("button[data-segment]")).map((b) =>
      b.getAttribute("data-segment"),
    );
    expect(segs).toEqual(
      expect.arrayContaining(["action-play", "action-record", "action-menu"]),
    );
  });
});

describe("StreamItem — last-played track presentation", () => {
  const mkStatus = (over: Partial<StreamStatus> = {}): StreamStatus => ({
    streamId: "s1",
    state: "idle",
    currentTrack: { artist: "A", title: "B", album: "", startedAt: "2026-01-01T00:00:00Z" },
    recordingStartedAt: null,
    bytesRecorded: 0,
    tracksRecorded: 0,
    error: null,
    reconnectAttempt: null,
    sessionId: 0,
    ...over,
  });

  it("labels a track as last-played and dims it when the stream is idle and not playing", () => {
    const { container } = renderItem(mkStream(), mkStatus());
    const track = container.querySelector('[data-segment="track"]')!;
    expect(track.getAttribute("aria-label")).toMatch(/last played|востаннє/i);
    expect(track.getAttribute("aria-label")).toMatch(/A — B/);
    expect(track.className).toMatch(/italic/);
    expect(track.className).toMatch(/text-slate-500/);
  });

  it("labels a track as current (no prefix, not italic) while recording", () => {
    const { container } = renderItem(mkStream(), mkStatus({ state: "recording", recordingStartedAt: "2026-01-01T00:00:00Z" }));
    const track = container.querySelector('[data-segment="track"]')!;
    expect(track.getAttribute("aria-label")).toBe("A — B");
    expect(track.className).not.toMatch(/italic/);
    expect(track.className).toMatch(/text-slate-400/);
  });
});

describe("StreamItem — action buttons activate Tauri commands", () => {
  it("Play starts playback for the stream", () => {
    const { container } = renderItem();
    fireEvent.click(container.querySelector('button[data-segment="action-play"]')!);
    expect(tauri.playStream).toHaveBeenCalledWith("s1");
  });

  it("Record starts recording for an idle stream", () => {
    const { container } = renderItem();
    fireEvent.click(container.querySelector('button[data-segment="action-record"]')!);
    expect(tauri.startRecording).toHaveBeenCalledWith("s1");
  });
});

describe("StreamItem — reconnecting counter display", () => {
  const mkReconnecting = (reconnectAttempt: number | null): StreamStatus => ({
    streamId: "s1",
    state: "reconnecting",
    currentTrack: null,
    recordingStartedAt: null,
    bytesRecorded: 0,
    tracksRecorded: 0,
    error: null,
    reconnectAttempt,
    sessionId: 0,
  });

  it("shows 'Attempt N of max' in status cell and icon tooltip when maxRetries > 0", () => {
    const { container } = renderItem(mkStream(), mkReconnecting(3), "summary", 10);
    const statusCell = container.querySelector('[data-segment="status"]')!;
    expect(statusCell.textContent).toMatch(/attempt 3 of 10|спроба 3 з 10/i);
  });

  it("shows 'Attempt N' without max when maxRetries is 0 (unlimited)", () => {
    const { container } = renderItem(mkStream(), mkReconnecting(5), "summary", 0);
    const statusCell = container.querySelector('[data-segment="status"]')!;
    expect(statusCell.textContent).toMatch(/attempt 5|спроба 5/i);
    expect(statusCell.textContent).not.toMatch(/of \d|з \d/i);
  });

  it("falls back to 'Reconnecting...' when reconnectAttempt is null", () => {
    const { container } = renderItem(mkStream(), mkReconnecting(null), "summary", 10);
    const statusCell = container.querySelector('[data-segment="status"]')!;
    expect(statusCell.textContent).toMatch(/reconnecting|перепідключення/i);
  });
});

describe("StreamItem — error state accessibility (D9)", () => {
  it("includes error label in the row aria-label so NVDA announces it", () => {
    const status: StreamStatus = {
      streamId: "s1",
      state: "error",
      currentTrack: null,
      recordingStartedAt: null,
      bytesRecorded: 0,
      tracksRecorded: 0,
      error: "Connection refused",
      reconnectAttempt: null,
      sessionId: 0,
    };
    const { container } = renderItem(mkStream(), status);
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toMatch(/error|помилка/i);
    expect(li.getAttribute("aria-label")).toContain("Radio Paradise");
  });
});

describe("StreamItem — inline icon slots (D1–D2)", () => {
  const mkSt = (state: StreamStatus["state"], over: Partial<StreamStatus> = {}): StreamStatus => ({
    streamId: "s1",
    state,
    currentTrack: null,
    recordingStartedAt: state === "recording" ? "2026-01-01T00:00:00Z" : null,
    bytesRecorded: 0,
    tracksRecorded: 0,
    error: null,
    reconnectAttempt: null,
    sessionId: 0,
    ...over,
  });

  it("renders both slot containers in idle state with no icons", () => {
    const { container } = renderItem(mkStream(), mkSt("idle"));
    expect(container.querySelector('[data-slot="record"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="play"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="record"] svg')).toBeFalsy();
    expect(container.querySelector('[data-slot="play"] svg')).toBeFalsy();
  });

  it("shows record icon in R-slot and no play icon when recording", () => {
    const { container } = renderItem(mkStream(), mkSt("recording"));
    expect(container.querySelector('[data-slot="record"] svg')).toBeTruthy();
    expect(container.querySelector('[data-slot="play"] svg')).toBeFalsy();
  });

  it("shows connecting icon in R-slot when connecting", () => {
    const { container } = renderItem(mkStream(), mkSt("connecting"));
    expect(container.querySelector('[data-slot="record"] svg')).toBeTruthy();
    expect(container.querySelector('[data-slot="play"] svg')).toBeFalsy();
  });

  it("shows reconnecting icon in R-slot when reconnecting", () => {
    const { container } = renderItem(mkStream(), mkSt("reconnecting", { reconnectAttempt: 1 }));
    expect(container.querySelector('[data-slot="record"] svg')).toBeTruthy();
    expect(container.querySelector('[data-slot="play"] svg')).toBeFalsy();
  });

  it("shows error icon in R-slot when in error state", () => {
    const { container } = renderItem(mkStream(), mkSt("error", { error: "Connection refused" }));
    expect(container.querySelector('[data-slot="record"] svg')).toBeTruthy();
    expect(container.querySelector('[data-slot="play"] svg')).toBeFalsy();
  });

  it("shows play icon in P-slot when this stream is playing", () => {
    $playerStatus.set({
      state: "playing",
      source: { type: "stream", streamId: "s1" },
      volume: 0.75,
      positionMs: null,
      durationMs: null,
    });
    const { container } = renderItem(mkStream(), mkSt("idle"));
    expect(container.querySelector('[data-slot="record"] svg')).toBeFalsy();
    expect(container.querySelector('[data-slot="play"] svg')).toBeTruthy();
  });

  it("shows both icons when recording and playing simultaneously", () => {
    $playerStatus.set({
      state: "playing",
      source: { type: "stream", streamId: "s1" },
      volume: 0.75,
      positionMs: null,
      durationMs: null,
    });
    const { container } = renderItem(mkStream(), mkSt("recording"));
    expect(container.querySelector('[data-slot="record"] svg')).toBeTruthy();
    expect(container.querySelector('[data-slot="play"] svg')).toBeTruthy();
  });

  it("shows both icons when connecting and playing simultaneously", () => {
    $playerStatus.set({
      state: "playing",
      source: { type: "stream", streamId: "s1" },
      volume: 0.75,
      positionMs: null,
      durationMs: null,
    });
    const { container } = renderItem(mkStream(), mkSt("connecting"));
    expect(container.querySelector('[data-slot="record"] svg')).toBeTruthy();
    expect(container.querySelector('[data-slot="play"] svg')).toBeTruthy();
  });

  it("shows both icons when reconnecting and playing simultaneously", () => {
    $playerStatus.set({
      state: "playing",
      source: { type: "stream", streamId: "s1" },
      volume: 0.75,
      positionMs: null,
      durationMs: null,
    });
    const { container } = renderItem(mkStream(), mkSt("reconnecting", { reconnectAttempt: 1 }));
    expect(container.querySelector('[data-slot="record"] svg')).toBeTruthy();
    expect(container.querySelector('[data-slot="play"] svg')).toBeTruthy();
  });

  it("does not use role='img' on slot containers (D8: slots are aria-hidden)", () => {
    const { container } = renderItem(mkStream(), mkSt("recording"));
    expect(container.querySelector('[role="img"]')).toBeFalsy();
  });

  it("slot containers have aria-hidden attribute (D8)", () => {
    const { container } = renderItem(mkStream(), mkSt("recording"));
    expect(container.querySelector('[data-slot="record"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector('[data-slot="play"]')?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("StreamItem — selection presentation", () => {
  const renderSelected = (isSelected: boolean) =>
    render(
      <ul>
        <StreamItem
          stream={mkStream({ name: "Radio Paradise" })}
          status={undefined}
          isActiveRow={false}
          isSelected={isSelected}
          isFocused={(seg) => seg === "summary"}
          maxRetries={0}
          onDelete={() => {}}
          onCopyToProfile={() => {}}
          onMoveToProfile={() => {}}
          onCopyUrl={() => {}}
        />
      </ul>,
    );

  it("appends the ', виділено' suffix to the row's accessible name when selected", () => {
    const { container } = renderSelected(true);
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toBe(`Radio Paradise, ${m.selection_suffix()}`);
    expect(li.getAttribute("data-selected")).toBe("true");
  });

  it("no suffix and no data-selected when not selected", () => {
    const { container } = renderSelected(false);
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toBe("Radio Paradise");
    expect(li.getAttribute("data-selected")).toBeNull();
  });
});
