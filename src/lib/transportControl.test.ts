import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as tauri from "./tauri";
import { executeTransportSkip, parseSkipTrigger } from "./transportControl";
import { $playerStatus } from "../stores/player";
import { $streams } from "../stores/streams";
import { $songs, $songsQuery, $songsStation, $songsSort } from "../stores/songs";
import { $settings } from "../stores/settings";
import type { GlobalSettings, StreamInfo } from "./tauri";
import type { Song } from "../types/song";

// Stub the Tauri IPC layer — there is no backend in jsdom.
vi.mock("./tauri", () => ({
  playStream: vi.fn().mockResolvedValue(undefined),
  playSavedSong: vi.fn().mockResolvedValue(undefined),
  seekPlayback: vi.fn().mockResolvedValue(undefined),
}));

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

const baseSettings: GlobalSettings = {
  language: "en-US", theme: "auto", activeProfile: "Default", outputDevice: null,
  minimizeToTray: true, showTrackInTitle: true, doubleClickAction: "play",
  autostart: false, autostartMinimized: true, prevRestartThresholdMs: 0,
  hotkeys: {
    toggleRecording: "", togglePlayback: "", volumeUp: "", volumeDown: "", toggleWindow: "", stopAll: "", prevTrack: "", nextTrack: "",
  },
  logMaxSizeMb: 10, logLevel: "info",
};

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
function playingFile(path: string, positionMs: number | null = null) {
  $songs.set([mkSong("a.mp3", "A"), mkSong("b.mp3", "B"), mkSong("c.mp3", "C")]);
  $songsSort.set("title");
  $playerStatus.set({
    state: "playing",
    source: { type: "file", path },
    volume: 0.75,
    positionMs,
    durationMs: null,
  });
}

beforeEach(() => vi.clearAllMocks());

afterEach(() => {
  $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null });
  $streams.set([]);
  $songs.set([]);
  $songsQuery.set("");
  $songsStation.set(null);
  $songsSort.set("date");
  $settings.set(null);
});

describe("parseSkipTrigger", () => {
  it("accepts prev and next", () => {
    expect(parseSkipTrigger("prev")).toBe("prev");
    expect(parseSkipTrigger("next")).toBe("next");
  });

  it("rejects anything else", () => {
    expect(parseSkipTrigger("up")).toBeNull();
    expect(parseSkipTrigger(5)).toBeNull();
    expect(parseSkipTrigger(null)).toBeNull();
    expect(parseSkipTrigger(undefined)).toBeNull();
  });
});

describe("executeTransportSkip — action dispatch", () => {
  it("next plays the next stream", async () => {
    playingStream("s2");
    await executeTransportSkip("next");
    expect(tauri.playStream).toHaveBeenCalledWith("s3");
  });

  it("prev plays the previous file in filtered order", async () => {
    playingFile("b.mp3");
    await executeTransportSkip("prev");
    expect(tauri.playSavedSong).toHaveBeenCalledWith("a.mp3");
  });

  it("prev past the restart threshold seeks to 0 and fires onSeekStart", async () => {
    $settings.set({ ...baseSettings, prevRestartThresholdMs: 3000 });
    playingFile("b.mp3", 5000);
    const onSeekStart = vi.fn();
    await executeTransportSkip("prev", { onSeekStart });
    expect(tauri.seekPlayback).toHaveBeenCalledWith(0);
    expect(tauri.playSavedSong).not.toHaveBeenCalled();
    expect(onSeekStart).toHaveBeenCalled();
  });

  it("is a no-op at the list boundary", async () => {
    playingStream("s3");
    await executeTransportSkip("next");
    expect(tauri.playStream).not.toHaveBeenCalled();
  });

  it("is a no-op when nothing is playing", async () => {
    await executeTransportSkip("next");
    expect(tauri.playStream).not.toHaveBeenCalled();
    expect(tauri.playSavedSong).not.toHaveBeenCalled();
  });
});

describe("executeTransportSkip — pending guard and hooks", () => {
  it("blocks a second call while the first is in flight, then releases", async () => {
    playingStream("s2");
    let resolveFirst!: () => void;
    // Once: the follow-up third call must fall back to the resolved default,
    // otherwise it would hang on a fresh never-resolved promise.
    vi.mocked(tauri.playStream).mockImplementationOnce(
      () => new Promise<void>((res) => { resolveFirst = res; }),
    );
    const first = executeTransportSkip("next");
    const second = executeTransportSkip("next");
    await second;
    expect(tauri.playStream).toHaveBeenCalledTimes(1); // second call blocked
    resolveFirst();
    await first;
    await executeTransportSkip("next");
    expect(tauri.playStream).toHaveBeenCalledTimes(2); // guard released
  });

  it("calls beforeExecute with the resolved action before dispatch", async () => {
    playingStream("s2");
    const beforeExecute = vi.fn();
    await executeTransportSkip("next", { beforeExecute });
    expect(beforeExecute).toHaveBeenCalledWith(
      { kind: "play-stream", id: "s3" },
      expect.objectContaining({ positionMs: null }),
    );
  });

  it("on failure calls onError and releases the guard", async () => {
    playingStream("s2");
    vi.mocked(tauri.playStream).mockRejectedValueOnce(new Error("IPC fail"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    await executeTransportSkip("next", { onError });
    expect(onError).toHaveBeenCalled();
    await executeTransportSkip("next");
    expect(tauri.playStream).toHaveBeenCalledTimes(2); // guard released after error
    consoleSpy.mockRestore();
  });
});
