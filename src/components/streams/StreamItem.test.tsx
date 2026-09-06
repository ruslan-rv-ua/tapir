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
  unsupportedCodec: null,
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

function renderItem(stream = mkStream(), status?: StreamStatus, focusedSeg = "summary") {
  return render(
    <ul>
      <StreamItem
        stream={stream}
        status={status}
        isActiveRow
        isFocused={(seg) => seg === focusedSeg}
        onDelete={() => {}}
        onCopyToProfile={() => {}}
        onMoveToProfile={() => {}}
        onCopyUrl={() => {}}
        onOpenInPlayer={() => {}}
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

  it("carries the refusal in the row, as text, not just in a toast", () => {
    // Видимий носій (ADR 2026-08-31): те, що Tapir цього не пише, мусить бути
    // на екрані й з холодного старту, а не жити в події, яку вже показали.
    const { container } = renderItem(
      mkStream({ format: null, unsupportedCodec: { family: "OGG" }, bitrate: 128 }),
    );
    const tech = container.querySelector('[data-segment="tech"]')!;
    expect(tech.textContent).toBe(`128 kbps · OGG · ${m.codec_unsupported()}`);
    expect(tech.getAttribute("aria-label")).toContain("OGG");
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
    currentTrack: { artist: "A", title: "B", album: "", startedAt: "2026-01-01T00:00:00Z", ignored: false },
    recordingStartedAt: null,
    bytesRecorded: 0,
    tracksRecorded: 0,
    error: null,
    reconnectAttempt: null, reconnectMaxRetries: null,
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

  it("marks an ignored track in the row itself, visibly and in the label", () => {
    // Рутинна подія станції дістає позначку на місці, а не оголошення
    // (ADR 2026-08-31 «Носії для подій станції» §3, §4). Позначка мусить бути
    // текстом на екрані — сама лише aria-мітка носієм не рахується.
    const { container } = renderItem(
      mkStream(),
      mkStatus({
        state: "recording",
        recordingStartedAt: "2026-01-01T00:00:00Z",
        currentTrack: { artist: "A", title: "B", album: "", startedAt: "", ignored: true },
      }),
    );
    const track = container.querySelector('[data-segment="track"]')!;
    const qualified = m.segment_track_ignored({ track: "A — B" });
    expect(track.textContent).toBe(qualified);
    expect(track.getAttribute("aria-label")).toBe(qualified);
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

describe("StreamItem — the record action while the recording is only connecting", () => {
  // A recording exists from the start command on; connecting and reconnecting
  // are its phases (CONTEXT.md §«Запис і Записи»). For the ≈40 minutes of a
  // reconnect the row used to offer to *start* it — and the backend's English
  // refusal landed in the toast.
  const record = (container: HTMLElement) =>
    container.querySelector<HTMLButtonElement>('button[data-segment="action-record"]')!;
  const row = (container: HTMLElement) => container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
  const mkPhase = (state: StreamStatus["state"]): StreamStatus => ({
    streamId: "s1", state, currentTrack: null, recordingStartedAt: null,
    bytesRecorded: 0, tracksRecorded: 0, error: null,
    reconnectAttempt: state === "reconnecting" ? 1 : null,
    reconnectMaxRetries: state === "reconnecting" ? 10 : null,
    sessionId: 0,
  });

  it.each(["connecting", "reconnecting"] as const)("stops the recording while %s, never starts it again", (state) => {
    const { container } = renderItem(mkStream(), mkPhase(state));
    fireEvent.click(record(container));
    expect(tauri.stopRecording).toHaveBeenCalledWith("s1");
    expect(tauri.startRecording).not.toHaveBeenCalled();
  });

  it.each(["connecting", "reconnecting"] as const)("reads «Зупинити запис» with the stream's name while %s", (state) => {
    const { container } = renderItem(mkStream(), mkPhase(state));
    const btn = record(container);
    expect(btn.getAttribute("aria-label")).toBe(m.stop_recording_named({ name: "Radio Paradise" }));
    expect(btn.textContent).toContain(m.stop_recording());
  });

  it.each(["connecting", "reconnecting"] as const)(
    "paints the row amber while %s — the phase shows, the button still codes the action",
    (state) => {
      const { container } = renderItem(mkStream(), mkPhase(state));
      expect(row(container).className).toMatch(/border-l-amber-500/);
      expect(row(container).className).not.toMatch(/border-l-red-500/);
      // Red like while recording: two colours under one word would make the
      // user wonder whether it is still the same action.
      expect(record(container).className).toMatch(/bg-red-700/);
    },
  );

  it("keeps the red fill for the phase in which bytes are flowing", () => {
    const { container } = renderItem(mkStream(), mkPhase("recording"));
    expect(row(container).className).toMatch(/border-l-red-500/);
    expect(row(container).className).not.toMatch(/amber/);
  });

  it("gives an errored row no fill — the recording is gone, not paused", () => {
    const { container } = renderItem(mkStream(), { ...mkPhase("error"), error: "station_unreachable" });
    expect(row(container).className).not.toMatch(/border-l-(red|amber)-500/);
  });
});

describe("StreamItem — reconnecting counter display", () => {
  const mkReconnecting = (
    reconnectAttempt: number | null,
    reconnectMaxRetries: number | null,
  ): StreamStatus => ({
    streamId: "s1",
    state: "reconnecting",
    currentTrack: null,
    recordingStartedAt: null,
    bytesRecorded: 0,
    tracksRecorded: 0,
    error: null,
    reconnectAttempt,
    reconnectMaxRetries,
    sessionId: 0,
  });

  it("shows 'Attempt N of M' with both numbers taken from the status itself", () => {
    // reconnect-max-in-status: the ceiling rides with the status, from the
    // settings snapshot the backend's reconnect loop actually lives by — the
    // row has no other input for it (no prop, no profile settings).
    const { container } = renderItem(mkStream(), mkReconnecting(3, 10));
    const statusCell = container.querySelector('[data-segment="status"]')!;
    expect(statusCell.textContent).toMatch(/attempt 3 of 10|спроба 3 з 10/i);
  });

  it("falls back to 'Reconnecting...' when the status carries no ceiling", () => {
    // A counter without its ceiling would be the bare "Attempt N" that ADR
    // 2026-08-13 removed from the domain.
    const { container } = renderItem(mkStream(), mkReconnecting(5, null));
    const statusCell = container.querySelector('[data-segment="status"]')!;
    expect(statusCell.textContent).toMatch(/reconnecting|перепідключення/i);
    expect(statusCell.textContent).not.toMatch(/attempt|спроба/i);
  });

  it("falls back to 'Reconnecting...' when reconnectAttempt is null", () => {
    const { container } = renderItem(mkStream(), mkReconnecting(null, 10));
    const statusCell = container.querySelector('[data-segment="status"]')!;
    expect(statusCell.textContent).toMatch(/reconnecting|перепідключення/i);
  });
});

describe("StreamItem — error state accessibility (D9)", () => {
  const mkFailed = (error: StreamStatus["error"] = "station_unreachable"): StreamStatus => ({
    streamId: "s1",
    state: "error",
    currentTrack: null,
    recordingStartedAt: null,
    bytesRecorded: 0,
    tracksRecorded: 0,
    error,
    reconnectAttempt: null, reconnectMaxRetries: null,
    sessionId: 0,
  });

  it("includes error label in the row aria-label so NVDA announces it", () => {
    const { container } = renderItem(mkStream(), mkFailed());
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toMatch(/error|помилка/i);
    expect(li.getAttribute("aria-label")).toContain("Radio Paradise");
  });

  it("spends the status segment on the reason, not on «Очікування»", () => {
    // The segment had no `error` branch at all and fell through to the idle
    // wording, so the row read «Помилка, Radio Paradise … Очікування». Repeating
    // «Помилка» there would just say the same word twice a second apart — the
    // reason is what the segment is for (ADR 2026-09-06 §5).
    const { container } = renderItem(mkStream(), mkFailed("station_unreachable"));
    const statusCell = container.querySelector('[data-segment="status"]')!;
    expect(statusCell.textContent).toMatch(/станція не відповідає|station is not responding/i);
    expect(statusCell.textContent).not.toMatch(/очікування|idle/i);
  });

  it("tells the disk apart from the station", () => {
    const { container } = renderItem(mkStream(), mkFailed("disk_write_failed"));
    const statusCell = container.querySelector('[data-segment="status"]')!;
    expect(statusCell.textContent).toMatch(/записати на диск|write to disk/i);
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
    reconnectAttempt: null, reconnectMaxRetries: null,
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
    const { container } = renderItem(mkStream(), mkSt("error", { error: "station_unreachable" }));
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
          onDelete={() => {}}
          onCopyToProfile={() => {}}
          onMoveToProfile={() => {}}
          onCopyUrl={() => {}}
          onOpenInPlayer={() => {}}
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
