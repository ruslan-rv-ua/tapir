import { describe, it, expect } from "vitest";
import { resolveTransportAction, resolveEndedAction } from "./playbackTransport";
import type { TransportContext } from "./playbackTransport";
import type { PlaybackNeighbors } from "../stores/playbackNeighbors";
import type { PlaybackSource } from "./tauri";

const fileSrc = (path: string): PlaybackSource => ({ type: "file", path });
const streamSrc = (id: string): PlaybackSource => ({ type: "stream", streamId: id });

const nb = (over: Partial<PlaybackNeighbors> = {}): PlaybackNeighbors => ({
  prev: null, next: null, ...over,
});

const ctx = (over: Partial<TransportContext> = {}): TransportContext => ({
  source: null, positionMs: null, neighbors: nb(), prevRestartThresholdMs: 0, ...over,
});

describe("resolveTransportAction — next", () => {
  it("plays the next neighbor", () => {
    expect(resolveTransportAction("next", ctx({ neighbors: nb({ next: { kind: "file", path: "b" } }) })))
      .toEqual({ kind: "play-file", path: "b" });
  });
  it("is none at the end", () => {
    expect(resolveTransportAction("next", ctx())).toEqual({ kind: "none" });
  });
});

describe("resolveTransportAction — auto-advance", () => {
  it("plays the next neighbor", () => {
    expect(resolveTransportAction("auto-advance", ctx({ neighbors: nb({ next: { kind: "file", path: "b" } }) })))
      .toEqual({ kind: "play-file", path: "b" });
  });
  it("stops at the end of the list", () => {
    expect(resolveTransportAction("auto-advance", ctx())).toEqual({ kind: "stop" });
  });
});

describe("resolveTransportAction — prev (no threshold)", () => {
  it("plays the previous neighbor", () => {
    expect(resolveTransportAction("prev", ctx({ neighbors: nb({ prev: { kind: "stream", id: "s1" } }) })))
      .toEqual({ kind: "play-stream", id: "s1" });
  });
  it("is none with no previous", () => {
    expect(resolveTransportAction("prev", ctx())).toEqual({ kind: "none" });
  });
});

describe("resolveTransportAction — prev (restart threshold)", () => {
  it("seeks to start when a file played past the threshold", () => {
    expect(resolveTransportAction("prev", ctx({
      source: fileSrc("a"), positionMs: 4000, prevRestartThresholdMs: 3000,
      neighbors: nb({ prev: { kind: "file", path: "z" } }),
    }))).toEqual({ kind: "seek-start" });
  });
  it("goes to previous when below the threshold", () => {
    expect(resolveTransportAction("prev", ctx({
      source: fileSrc("a"), positionMs: 1000, prevRestartThresholdMs: 3000,
      neighbors: nb({ prev: { kind: "file", path: "z" } }),
    }))).toEqual({ kind: "play-file", path: "z" });
  });
  it("seeks to start even on the first track when past the threshold", () => {
    expect(resolveTransportAction("prev", ctx({
      source: fileSrc("a"), positionMs: 9000, prevRestartThresholdMs: 3000, neighbors: nb(),
    }))).toEqual({ kind: "seek-start" });
  });
  it("ignores the threshold for stream sources", () => {
    expect(resolveTransportAction("prev", ctx({
      source: streamSrc("s2"), positionMs: 9000, prevRestartThresholdMs: 3000,
      neighbors: nb({ prev: { kind: "stream", id: "s1" } }),
    }))).toEqual({ kind: "play-stream", id: "s1" });
  });
  it("treats null position as below the threshold", () => {
    expect(resolveTransportAction("prev", ctx({
      source: fileSrc("a"), positionMs: null, prevRestartThresholdMs: 3000,
      neighbors: nb({ prev: { kind: "file", path: "z" } }),
    }))).toEqual({ kind: "play-file", path: "z" });
  });
});

describe("resolveEndedAction", () => {
  it("stops when autoAdvance is off", () => {
    expect(resolveEndedAction(false, nb({ next: { kind: "file", path: "b" } }))).toEqual({ kind: "stop" });
  });
  it("plays next when autoAdvance is on and a next exists", () => {
    expect(resolveEndedAction(true, nb({ next: { kind: "file", path: "b" } }))).toEqual({ kind: "play-file", path: "b" });
  });
  it("stops at the end of the list when autoAdvance is on", () => {
    expect(resolveEndedAction(true, nb())).toEqual({ kind: "stop" });
  });
});
