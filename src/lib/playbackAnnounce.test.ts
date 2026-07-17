import { describe, it, expect } from "vitest";
import { selectPlaybackAnnouncement } from "./playbackAnnounce";
import type { PlayerStatus, PlaybackSource } from "./tauri";

const stream = (id = "s1"): PlaybackSource => ({ type: "stream", streamId: id });
const file = (path = "rec/a.mp3"): PlaybackSource => ({ type: "file", path });
const st = (
  state: PlayerStatus["state"],
  source: PlaybackSource | null = null,
): PlayerStatus => ({ state, source, volume: 0.5, positionMs: null, durationMs: null });

const nameOf = (s: PlaybackSource) =>
  s.type === "stream" ? `S:${s.streamId}` : s.type === "file" ? `F:${s.path}` : s.name;

describe("selectPlaybackAnnouncement", () => {
  it("stopped→playing (file) is a started event", () => {
    expect(selectPlaybackAnnouncement(st("stopped"), st("playing", file()), nameOf))
      .toEqual({ kind: "started", name: "F:rec/a.mp3" });
  });

  it("source switch while playing is a started event", () => {
    expect(
      selectPlaybackAnnouncement(st("playing", stream("a")), st("playing", stream("b")), nameOf),
    ).toEqual({ kind: "started", name: "S:b" });
  });

  it("playing→paused (file) is a paused event with name", () => {
    expect(selectPlaybackAnnouncement(st("playing", file()), st("paused", file()), nameOf))
      .toEqual({ kind: "paused", name: "F:rec/a.mp3" });
  });

  it("paused→playing (file) is a resumed event with name", () => {
    expect(selectPlaybackAnnouncement(st("paused", file()), st("playing", file()), nameOf))
      .toEqual({ kind: "resumed", name: "F:rec/a.mp3" });
  });

  it("stream→stopped names the previous source", () => {
    expect(selectPlaybackAnnouncement(st("playing", stream("a")), st("stopped"), nameOf))
      .toEqual({ kind: "stopped", name: "S:a" });
  });

  it("stopped with no prior source yields a nameless stopped", () => {
    expect(selectPlaybackAnnouncement(st("playing"), st("stopped"), nameOf))
      .toEqual({ kind: "stopped", name: null });
  });

  it("volume-only change (playing→playing, same source) is silent", () => {
    expect(selectPlaybackAnnouncement(st("playing", stream("a")), st("playing", stream("a")), nameOf))
      .toBeNull();
  });

  it("no transition (stopped→stopped) is silent", () => {
    expect(selectPlaybackAnnouncement(st("stopped"), st("stopped"), nameOf)).toBeNull();
  });
});
