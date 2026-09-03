import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRef } from "react";
import { render, fireEvent } from "@testing-library/react";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import { $announcer } from "../../stores/announcer";
import { $toasts } from "../../stores/toasts";
import { $settings } from "../../stores/settings";
import { PlayerPanel } from "./PlayerPanel";
import { $muteState, $playerStatus } from "../../stores/player";
import { $streams } from "../../stores/streams";
import { $songs, $songsQuery, $songsStation, $songsSort } from "../../stores/songs";
import type { GlobalSettings, StreamInfo } from "../../lib/tauri";
import type { Song } from "../../types/song";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";

const baseSettings: GlobalSettings = {
  language: "en-US", theme: "auto", activeProfile: "Default", outputDevice: null,
  minimizeToTray: true, showTrackInTitle: true, doubleClickAction: "play",
  autostart: false, autostartMinimized: true, prevRestartThresholdMs: 0,
  hotkeys: {
    toggleRecording: "", togglePlayback: "", volumeUp: "", volumeDown: "", toggleWindow: "", stopAll: "", prevTrack: "", nextTrack: "",
  },
  logMaxSizeMb: 10, logLevel: "info",
};

// Stub the Tauri IPC layer — there is no backend in jsdom.
vi.mock("../../lib/tauri", () => ({
  playStream: vi.fn().mockResolvedValue(undefined),
  playSavedSong: vi.fn().mockResolvedValue(undefined),
  setVolume: vi.fn().mockResolvedValue(undefined),
  pausePlayback: vi.fn().mockResolvedValue(undefined),
  resumePlayback: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
  seekPlayback: vi.fn().mockResolvedValue(undefined),
  notifyTransportFailure: vi.fn().mockResolvedValue(undefined),
  // A clicked panel button implies a focused window.
  isWindowFocused: vi.fn().mockResolvedValue(true),
}));

// Isolate prev/next logic from the slider children (which mount react-aria sliders).
vi.mock("./VolumeSlider", () => ({ VolumeSlider: () => null }));
vi.mock("./PlaybackPosition", () => ({ PlaybackPosition: () => null }));

const mkStream = (id: string): StreamInfo => ({
  id,
  url: `http://x/${id}`,
  name: id,
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
});

const mkSong = (path: string, title: string): Song => ({
  path,
  fileName: path,
  artist: "a",
  title,
  album: "",
  genre: "",
  station: "st",
  format: "mp3",
  durationMs: 0,
  sizeBytes: 1000,
  recordedAt: "2026-01-01T00:00:00Z",
  isComplete: true,
});

function renderPanel() {
  const ref = createRef<ZoneEntry>();
  return render(<PlayerPanel ref={ref} exitZone={() => {}} />);
}

/** Drive a 3-stream context with the given stream playing. */
function playingStream(streamId: string) {
  $streams.set([mkStream("s1"), mkStream("s2"), mkStream("s3")]);
  $playerStatus.set({
    state: "playing",
    source: { type: "stream", streamId },
    volume: 0.75,
    positionMs: null,
    durationMs: null,
  });
}

/** Drive a 3-file context (title-sorted A,B,C) with the given path playing. */
function playingFile(path: string) {
  $songs.set([mkSong("a.mp3", "A"), mkSong("b.mp3", "B"), mkSong("c.mp3", "C")]);
  $songsSort.set("title");
  $playerStatus.set({
    state: "playing",
    source: { type: "file", path },
    volume: 0.75,
    positionMs: null,
    durationMs: null,
  });
}

/** A catalogue station playing straight from the Browser, added to nothing. */
function playingPreview() {
  $streams.set([]);
  $playerStatus.set({
    state: "playing",
    source: { type: "preview", url: "http://x/live", name: "Radio X" },
    volume: 0.75,
    positionMs: null,
    durationMs: null,
  });
}

beforeEach(() => vi.clearAllMocks());

afterEach(() => {
  $muteState.set({ muted: false, savedVolume: 0.75, restoring: false });
  $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null });
  $streams.set([]);
  $songs.set([]);
  $songsQuery.set("");
  $songsStation.set(null);
  $songsSort.set("date");
  $settings.set(null);
  $announcer.set(null);
  $toasts.set([]);
});

describe("PlayerPanel — prev/next enabled states", () => {
  it("disables both when nothing is playing", () => {
    const { getByRole } = renderPanel();
    expect(getByRole("button", { name: m.player_prev() })).toBeDisabled();
    expect(getByRole("button", { name: m.player_next() })).toBeDisabled();
  });

  it("enables both in the middle of a stream context", () => {
    playingStream("s2");
    const { getByRole } = renderPanel();
    expect(getByRole("button", { name: m.player_prev() })).toBeEnabled();
    expect(getByRole("button", { name: m.player_next() })).toBeEnabled();
  });

  it("disables prev on the first stream, next on the last", () => {
    playingStream("s1");
    const first = renderPanel();
    expect(first.getByRole("button", { name: m.player_prev() })).toBeDisabled();
    expect(first.getByRole("button", { name: m.player_next() })).toBeEnabled();
    first.unmount();

    playingStream("s3");
    const last = renderPanel();
    expect(last.getByRole("button", { name: m.player_prev() })).toBeEnabled();
    expect(last.getByRole("button", { name: m.player_next() })).toBeDisabled();
  });
});

describe("PlayerPanel — prev/next dispatch", () => {
  it("starts the next stream via playStream", () => {
    playingStream("s2");
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.player_next() }));
    expect(tauri.playStream).toHaveBeenCalledWith("s3");
  });

  it("starts the previous file via playSavedSong (filtered order)", () => {
    playingFile("b.mp3");
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.player_prev() }));
    expect(tauri.playSavedSong).toHaveBeenCalledWith("a.mp3");
  });
});

describe("PlayerPanel — prev/next race guard", () => {
  it("ignores a second press while a transition is in flight, then releases", async () => {
    let release: () => void = () => {};
    // Once: later presses fall back to the resolved default. The pending guard
    // is module-level now — a press left in flight here would leak a locked
    // guard into every later test in this file.
    vi.mocked(tauri.playStream).mockImplementationOnce(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    playingStream("s2");
    const { getByRole } = renderPanel();
    const next = getByRole("button", { name: m.player_next() });
    fireEvent.click(next);
    fireEvent.click(next);
    expect(tauri.playStream).toHaveBeenCalledTimes(1); // second press blocked

    release();                 // settle the in-flight call
    await Promise.resolve();   // let the executor's finally run (add more flushes if needed)
    await Promise.resolve();
    fireEvent.click(next);
    expect(tauri.playStream).toHaveBeenCalledTimes(2); // guard released
    await Promise.resolve();   // settle the second call before the next test
    await Promise.resolve();
  });
});

describe("PlayerPanel — primary transport is source-aware", () => {
  it("stops a live stream from the primary control (never pauses)", () => {
    playingStream("s2");
    const { getByRole, queryByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.stop_stream_playback() }));
    expect(tauri.stopPlayback).toHaveBeenCalledTimes(1);
    expect(tauri.pausePlayback).not.toHaveBeenCalled();
    // No redundant second Stop button while a stream plays.
    expect(queryByRole("button", { name: m.stop() })).toBeNull();
  });

  it("pauses a file from the primary control", () => {
    playingFile("b.mp3");
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.pause() }));
    expect(tauri.pausePlayback).toHaveBeenCalledTimes(1);
    expect(tauri.stopPlayback).not.toHaveBeenCalled();
    // A file keeps its dedicated Stop button.
    expect(getByRole("button", { name: m.stop() })).toBeEnabled();
  });
});

describe("PlayerPanel — a catalogue station is live sound, like the air", () => {
  // The defect this closes: the panel asked "is it a stream?" and a station
  // played from the catalogue answered no, so it was offered a Pause — and the
  // Pause worked. The buffer went stale while the station carried on.
  it("stops from the primary control, and never offers a pause", () => {
    playingPreview();
    const { getByRole, queryByRole } = renderPanel();
    expect(queryByRole("button", { name: m.pause() })).toBeNull();
    fireEvent.click(getByRole("button", { name: m.stop_stream_playback() }));
    expect(tauri.stopPlayback).toHaveBeenCalledTimes(1);
    expect(tauri.pausePlayback).not.toHaveBeenCalled();
  });

  it("has no second Stop button, exactly like the air", () => {
    playingPreview();
    const { queryByRole } = renderPanel();
    expect(queryByRole("button", { name: m.stop() })).toBeNull();
  });

  it("carries the LIVE badge — the one mark both live paths share", () => {
    playingPreview();
    const { getByText } = renderPanel();
    expect(getByText(m.live_stream_short())).toBeInTheDocument();
  });

  // "—" means "not here yet". A catalogue station has no StreamInfo to take a
  // bitrate from and never will, so the row shows the badge alone rather than
  // a dash that can never become a number (record §2).
  it("shows no placeholder it can never fill", () => {
    playingPreview();
    const { getByText, getByRole } = renderPanel();
    const row = getByText(m.live_stream_short()).closest("[tabindex]")!;
    expect(row).toHaveAttribute("tabindex", "-1");
    expect(row.textContent).toBe(m.live_stream_short());
    // Neither the track nor the bitrate leaves a dash behind: a catalogue
    // station gets no `track-changed` and no `StreamInfo`, ever.
    expect(getByRole("group", { name: m.player_now_playing() }).textContent)
      .not.toContain("—");
  });

  it("keeps the bitrate for a profile stream, which does have one", () => {
    playingStream("s2");
    const { getByText } = renderPanel();
    expect(getByText("192 kbps · MP3")).toBeInTheDocument();
    expect(getByText(m.live_stream_short())).toBeInTheDocument();
  });
});

describe("PlayerPanel — boundary focus", () => {
  it("anchors focus to Play/Pause when a skip lands on the last element", () => {
    playingStream("s2"); // next → s3 (last); the Next button will disable
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.player_next() }));
    // For a live stream the central control is the Stop action (pause is
    // meaningless); it's still the focus anchor at a transport boundary.
    expect(document.activeElement).toBe(getByRole("button", { name: m.stop_stream_playback() }));
  });
});

describe("PlayerPanel — mute button", () => {
  it("mutes the output and announces the resulting STATE, not the command name", async () => {
    playingStream("s2");
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.player_mute_action() }));
    await vi.waitFor(() => expect(tauri.setVolume).toHaveBeenCalledWith(0));
    expect($muteState.get().muted).toBe(true);
    // The bug this closes: the button used to speak its own next-action label
    // ("Mute") right after muting, contradicting the label it had just flipped to.
    // m.player_muted() is the same text useGlobalShortcuts asserts for Ctrl+M —
    // both go through muteControl.toggleMute, so they cannot drift apart.
    expect($announcer.get()?.message).toBe(m.player_muted());
    expect($announcer.get()?.message).not.toBe(m.player_mute_action());
    expect($announcer.get()?.priority).toBe("assertive");
  });

  it("unmutes on the second press and announces the opposite state", async () => {
    playingStream("s2");
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.player_mute_action() }));
    await vi.waitFor(() => expect($muteState.get().muted).toBe(true));
    fireEvent.click(getByRole("button", { name: m.player_unmute_action() }));
    await vi.waitFor(() => expect($muteState.get().muted).toBe(false));
    expect(tauri.setVolume).toHaveBeenLastCalledWith(0.75);
    expect($announcer.get()?.message).toBe(m.player_unmuted());
  });

  it("reads as pressed at a zero level, with `muted` never having been set", () => {
    playingStream("s2");
    $playerStatus.set({ ...$playerStatus.get(), volume: 0 });
    const { getByRole } = renderPanel();
    // Label, state and (with it) the icon all come from the one predicate: the
    // button used to offer "Mute" while the player was already silent.
    const button = getByRole("button", { name: m.player_unmute_action() });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("raises the sound from a zero level on the first press", async () => {
    playingStream("s2");
    $playerStatus.set({ ...$playerStatus.get(), volume: 0 });
    $muteState.set({ muted: false, savedVolume: 0.6, restoring: false });
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.player_unmute_action() }));
    await vi.waitFor(() => expect(tauri.setVolume).toHaveBeenCalledWith(0.6));
    expect($announcer.get()?.message).toBe(m.player_unmuted());
  });
});

describe("PlayerPanel — prev/next error handling", () => {
  it("raises a visible toast naming the target when the skip IPC rejects — and does not announce twice", async () => {
    vi.mocked(tauri.playStream).mockRejectedValueOnce(new Error("IPC fail"));
    playingStream("s2");
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.player_next() }));
    await vi.waitFor(() => {
      expect($toasts.get()[0]?.message).toBe(`s3: ${m.playback_error()}`);
    });
    // ToastContainer is a live region already; the panel's own assertive
    // announce would be a duplicate (record §2), so it is gone.
    expect($announcer.get()?.message).not.toBe(m.playback_error());
  });
});

describe("PlayerPanel — prev restart threshold", () => {
  function playingFileAt(path: string, positionMs: number, thresholdMs: number) {
    $songs.set([mkSong("a.mp3", "A"), mkSong("b.mp3", "B"), mkSong("c.mp3", "C")]);
    $songsSort.set("title");
    $settings.set({ ...baseSettings, prevRestartThresholdMs: thresholdMs });
    $playerStatus.set({
      state: "playing", source: { type: "file", path }, volume: 0.75,
      positionMs, durationMs: 200000,
    });
  }

  it("restarts the current track (seek 0) instead of going to previous, past the threshold", () => {
    playingFileAt("b.mp3", 5000, 3000);
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.player_prev() }));
    expect(tauri.seekPlayback).toHaveBeenCalledWith(0);
    expect(tauri.playSavedSong).not.toHaveBeenCalled();
  });

  it("goes to the previous track when below the threshold", () => {
    playingFileAt("b.mp3", 1000, 3000);
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.player_prev() }));
    expect(tauri.playSavedSong).toHaveBeenCalledWith("a.mp3");
    expect(tauri.seekPlayback).not.toHaveBeenCalled();
  });

  it("enables Prev on the first track once played past the threshold", () => {
    playingFileAt("a.mp3", 5000, 3000); // first track, no previous neighbor
    const { getByRole } = renderPanel();
    expect(getByRole("button", { name: m.player_prev() })).toBeEnabled();
  });

  it("announces a restart when seeking past the threshold", async () => {
    playingFileAt("b.mp3", 5000, 3000);
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.player_prev() }));
    await vi.waitFor(() => {
      expect($announcer.get()?.message).toBe(m.player_restarted());
    });
  });
});
