import { describe, it, expect } from "vitest";
import { isLiveSource, LIVE_BY_SOURCE_TYPE } from "./playbackSource";
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
