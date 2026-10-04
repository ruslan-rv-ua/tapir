import { describe, it, expect } from "vitest";
import { isLiveSource, LIVE_BY_SOURCE_TYPE, sameSource } from "./playbackSource";
import type { PlaybackSource } from "./tauri";

const stream: PlaybackSource = { type: "stream", streamId: "s1" };
const preview: PlaybackSource = { type: "preview", url: "http://x/live", name: "Radio X" };
const file: PlaybackSource = { type: "file", path: "rec/a.mp3" };

describe("isLiveSource", () => {
  // The whole point of this file. The table is total by type, but nothing
  // compiles it: `pnpm vite:build` is plain `vite build` with no `tsc`, and
  // `tsc` itself carries old paraglide errors — so the compiler is not the one
  // who notices a kind of source nobody answered for. This list is.
  it("answers for every kind of source, by name", () => {
    expect(Object.keys(LIVE_BY_SOURCE_TYPE).sort()).toEqual(["file", "preview", "stream"]);
  });

  it("a stream from the profile is live", () => {
    expect(isLiveSource(stream)).toBe(true);
  });

  // The two paths into one state: a station played straight from the catalogue
  // behaves like the air — no position, no pause — even though it is not a
  // stream of the profile. CONTEXT.md §«Живе джерело».
  it("a station played from the catalogue is live", () => {
    expect(isLiveSource(preview)).toBe(true);
  });

  it("a saved file is not live", () => {
    expect(isLiveSource(file)).toBe(false);
  });

  it("nothing playing is not live", () => {
    expect(isLiveSource(null)).toBe(false);
    expect(isLiveSource(undefined)).toBe(false);
  });
});

describe("sameSource", () => {
  // One notion of "the same source" for every caller: the announcer and the
  // mute cleanup used to keep a copy each, and the copies drifted apart (the
  // cleanup's had no `url` branch, so preview → preview kept the sound off).
  it("a stream is identified by its id", () => {
    expect(sameSource(stream, { type: "stream", streamId: "s1" })).toBe(true);
    expect(sameSource(stream, { type: "stream", streamId: "s2" })).toBe(false);
  });

  it("a catalogue station is identified by its url", () => {
    expect(sameSource(preview, { type: "preview", url: "http://x/live", name: "Other name" })).toBe(true);
    expect(sameSource(preview, { type: "preview", url: "http://y/live", name: "Radio X" })).toBe(false);
  });

  it("a file is identified by its path", () => {
    expect(sameSource(file, { type: "file", path: "rec/a.mp3" })).toBe(true);
    expect(sameSource(file, { type: "file", path: "rec/b.mp3" })).toBe(false);
  });

  it("different kinds are never the same", () => {
    expect(sameSource(stream, preview)).toBe(false);
    expect(sameSource(preview, file)).toBe(false);
    expect(sameSource(file, stream)).toBe(false);
  });

  it("nothing equals only nothing", () => {
    expect(sameSource(null, null)).toBe(true);
    expect(sameSource(null, stream)).toBe(false);
    expect(sameSource(preview, null)).toBe(false);
  });
});
