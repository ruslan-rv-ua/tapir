import { describe, it, expect } from "vitest";
import { windowTitleLabel } from "./windowTitle";
import type { PlaybackSource, StreamStatus, TrackInfo } from "./tauri";

const streamSrc = (streamId: string): PlaybackSource => ({ type: "stream", streamId });
const fileSrc = (path: string): PlaybackSource => ({ type: "file", path });
const previewSrc = (name: string): PlaybackSource => ({ type: "preview", url: "http://x", name });

const track = (over: Partial<TrackInfo> = {}): TrackInfo => ({
  artist: "", title: "", album: "", startedAt: "", ignored: false, ...over,
});

const statusWith = (streamId: string, currentTrack: TrackInfo | null): Record<string, StreamStatus> => ({
  [streamId]: {
    streamId, state: "playing", currentTrack, recordingStartedAt: null,
    bytesRecorded: 0, tracksRecorded: 0, error: null, reconnectAttempt: null, reconnectMaxRetries: null, sessionId: 1,
  },
});

describe("windowTitleLabel — no source", () => {
  it("returns null when nothing is playing", () => {
    expect(windowTitleLabel(null, {})).toBeNull();
  });
});

describe("windowTitleLabel — stream", () => {
  it("joins artist and title with an em dash", () => {
    const s = statusWith("s1", track({ artist: "Тарас Петриненко", title: "Моя земля" }));
    expect(windowTitleLabel(streamSrc("s1"), s)).toBe("Тарас Петриненко — Моя земля");
  });
  it("shows just the title when artist is missing", () => {
    expect(windowTitleLabel(streamSrc("s1"), statusWith("s1", track({ title: "Моя земля" })))).toBe("Моя земля");
  });
  it("shows just the artist when title is missing", () => {
    expect(windowTitleLabel(streamSrc("s1"), statusWith("s1", track({ artist: "Тарас Петриненко" })))).toBe("Тарас Петриненко");
  });
  it("returns null when there is no current track", () => {
    expect(windowTitleLabel(streamSrc("s1"), statusWith("s1", null))).toBeNull();
  });
  it("returns null when artist and title are both empty", () => {
    expect(windowTitleLabel(streamSrc("s1"), statusWith("s1", track()))).toBeNull();
  });
  it("returns null when the stream has no status entry", () => {
    expect(windowTitleLabel(streamSrc("s1"), {})).toBeNull();
  });
});

describe("windowTitleLabel — file", () => {
  it("strips a Windows directory and extension", () => {
    expect(windowTitleLabel(fileSrc("C:\\rec\\2026-06-15_Радіо Промінь.mp3"), {})).toBe("2026-06-15_Радіо Промінь");
  });
  it("strips a POSIX directory and extension", () => {
    expect(windowTitleLabel(fileSrc("/home/u/rec/song.aac"), {})).toBe("song");
  });
  it("keeps a bare file name without a directory", () => {
    expect(windowTitleLabel(fileSrc("track.m4a"), {})).toBe("track");
  });
  it("keeps a name that has no extension", () => {
    expect(windowTitleLabel(fileSrc("C:\\rec\\noext"), {})).toBe("noext");
  });
});

describe("windowTitleLabel — preview", () => {
  it("uses the preview name", () => {
    expect(windowTitleLabel(previewSrc("Radio Promin"), {})).toBe("Radio Promin");
  });
  it("returns null for an empty preview name", () => {
    expect(windowTitleLabel(previewSrc(""), {})).toBeNull();
  });
});
