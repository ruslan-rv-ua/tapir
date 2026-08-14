import { describe, it, expect } from "vitest";
import {
  describePlayback,
  selectPlaybackAnnouncement,
  sourceName,
  suppressesStarted,
} from "./playbackAnnounce";
import type { PlayerStatus, PlaybackSource, StreamInfo, StreamStatus } from "./tauri";

const stream = (id = "s1"): PlaybackSource => ({ type: "stream", streamId: id });
const file = (path = "rec/a.mp3"): PlaybackSource => ({ type: "file", path });
const preview = (name = "Radio X"): PlaybackSource => ({ type: "preview", url: "http://x", name });
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

describe("suppressesStarted", () => {
  const started = { kind: "started" as const, name: "S:a" };
  const pending = { name: "S:a", until: 1_000 };

  it("suppresses the started that matches a live pending connect", () => {
    expect(suppressesStarted(pending, started, 500)).toBe(true);
  });

  it("does not suppress after the pending window expires", () => {
    expect(suppressesStarted(pending, started, 1_001)).toBe(false);
  });

  it("does not suppress a started for a different source", () => {
    expect(suppressesStarted(pending, { kind: "started", name: "S:b" }, 500)).toBe(false);
  });

  it("does not suppress non-started announcements", () => {
    expect(suppressesStarted(pending, { kind: "stopped", name: "S:a" }, 500)).toBe(false);
    expect(suppressesStarted(pending, { kind: "resumed", name: "S:a" }, 500)).toBe(false);
    expect(suppressesStarted(pending, null, 500)).toBe(false);
  });

  it("does nothing without a pending connect", () => {
    expect(suppressesStarted(null, started, 500)).toBe(false);
  });

  it("suppresses the started that follows a cold-start file 'resuming' announce", () => {
    // The Rust side sends the file basename; nameOf() derives the same for a
    // file source, so the generic name+TTL match covers files too.
    const pendingFile = { name: "a.mp3", until: 1_000 };
    expect(suppressesStarted(pendingFile, { kind: "started", name: "a.mp3" }, 500)).toBe(true);
  });
});

const streams: StreamInfo[] = [{
  id: "s1", url: "http://s1", name: "Jazz FM", format: "mp3", bitrate: 128,
  icyName: null, icyGenre: null, icyUrl: null, ignorelist: [],
  username: null, password: null, addedAt: "2026-01-01T00:00:00Z",
}];

describe("sourceName", () => {
  it("names a stream by its stored name", () => {
    expect(sourceName(stream("s1"), streams)).toBe("Jazz FM");
  });

  it("falls back to the stream id when the stream is not in the store", () => {
    expect(sourceName(stream("ghost"), streams)).toBe("ghost");
  });

  it("names a preview by its catalogue name", () => {
    expect(sourceName(preview("Radio X"), streams)).toBe("Radio X");
  });

  it("names a file by its basename", () => {
    expect(sourceName(file("C:\\rec\\Jazz\\a.mp3"), streams)).toBe("a.mp3");
    expect(sourceName(file("rec/a.mp3"), streams)).toBe("a.mp3");
  });
});

describe("describePlayback", () => {
  const statuses: Record<string, StreamStatus> = {
    s1: {
      streamId: "s1", state: "recording",
      currentTrack: { artist: "Miles", title: "So What", album: "", startedAt: "" },
      recordingStartedAt: null, bytesRecorded: 0, tracksRecorded: 0,
      error: null, reconnectAttempt: null, sessionId: 1,
    },
  };

  const describe_ = (
    state: PlayerStatus["state"],
    source: PlaybackSource | null,
    extra: Partial<PlayerStatus> = {},
    muted = false,
  ) => describePlayback({
    status: { ...st(state, source), ...extra },
    statuses,
    streams,
    muted,
  });

  // 3 sources × 3 states. Two of the nine are unreachable in the running app
  // (a live stream and a preview cannot be paused) — they are here so the
  // function stays total and no state can leak `undefined` into speech.
  it("stream playing → station + current track", () => {
    expect(describe_("playing", stream("s1")).description)
      .toEqual({ kind: "stream", station: "Jazz FM", track: "Miles — So What" });
  });

  it("stream playing without ICY metadata → station, no track", () => {
    expect(describePlayback({
      status: st("playing", stream("s1")), statuses: {}, streams, muted: false,
    }).description).toEqual({ kind: "stream", station: "Jazz FM", track: null });
  });

  // The Rust ICY parser only splits on " - ", so a station that sends a bare
  // song title arrives with an empty artist — the common case, not an edge one.
  it("stream playing with an empty artist → title alone, no dangling dash", () => {
    const half: Record<string, StreamStatus> = {
      s1: { ...statuses.s1, currentTrack: { artist: "", title: "So What", album: "", startedAt: "" } },
    };
    expect(describePlayback({
      status: st("playing", stream("s1")), statuses: half, streams, muted: false,
    }).description).toEqual({ kind: "stream", station: "Jazz FM", track: "So What" });
  });

  it("stream playing with an empty artist AND title → no track at all", () => {
    const empty: Record<string, StreamStatus> = {
      s1: { ...statuses.s1, currentTrack: { artist: "", title: "", album: "", startedAt: "" } },
    };
    expect(describePlayback({
      status: st("playing", stream("s1")), statuses: empty, streams, muted: false,
    }).description).toEqual({ kind: "stream", station: "Jazz FM", track: null });
  });

  it("stream paused reads as playing (a broadcast has no pause)", () => {
    expect(describe_("paused", stream("s1")).description)
      .toEqual({ kind: "stream", station: "Jazz FM", track: "Miles — So What" });
  });

  it("stream stopped → nothing", () => {
    expect(describe_("stopped", stream("s1")).description).toEqual({ kind: "nothing" });
  });

  it("preview playing → the catalogue name", () => {
    expect(describe_("playing", preview("Radio X")).description)
      .toEqual({ kind: "preview", name: "Radio X" });
  });

  it("preview paused reads as playing (stops like the air, without a position)", () => {
    expect(describe_("paused", preview("Radio X")).description)
      .toEqual({ kind: "preview", name: "Radio X" });
  });

  it("preview stopped → nothing", () => {
    expect(describe_("stopped", preview("Radio X")).description).toEqual({ kind: "nothing" });
  });

  it("file playing → basename + position", () => {
    expect(describe_("playing", file("rec/a.mp3"), { positionMs: 65_000 }).description)
      .toEqual({ kind: "file", name: "a.mp3", positionMs: 65_000, paused: false });
  });

  it("file paused → paused flag, position kept", () => {
    expect(describe_("paused", file("rec/a.mp3"), { positionMs: 65_000 }).description)
      .toEqual({ kind: "file", name: "a.mp3", positionMs: 65_000, paused: true });
  });

  it("file stopped → nothing, even though the status still carries the source", () => {
    expect(describe_("stopped", file("rec/a.mp3"), { positionMs: 65_000 }).description)
      .toEqual({ kind: "nothing" });
  });

  it("file with an unknown position → positionMs null", () => {
    expect(describe_("playing", file("rec/a.mp3")).description)
      .toEqual({ kind: "file", name: "a.mp3", positionMs: null, paused: false });
  });

  it("nothing playing at all → nothing", () => {
    expect(describe_("stopped", null).description).toEqual({ kind: "nothing" });
  });

  // Mute is a property of the OUTPUT, not of the source — it rides alongside
  // every kind of description, including "nothing".
  it("reports mute alongside each kind of description", () => {
    expect(describe_("playing", stream("s1"), {}, true).muted).toBe(true);
    expect(describe_("playing", preview("Radio X"), {}, true).muted).toBe(true);
    expect(describe_("playing", file("rec/a.mp3"), {}, true).muted).toBe(true);
    expect(describe_("stopped", null, {}, true).muted).toBe(true);
    expect(describe_("playing", stream("s1")).muted).toBe(false);
  });
});
