import { describe, it, expect, afterEach } from "vitest";
import { computePlaybackNeighbors, $playbackNeighbors } from "./playbackNeighbors";
import type { StreamInfo, PlaybackSource } from "../lib/tauri";
import type { Song } from "../types/song";
import { $playerStatus } from "./player";
import { $streams } from "./streams";
import { $songs, $songsQuery, $songsStation, $songsSort } from "./songs";

const mkStream = (id: string): StreamInfo => ({
  id,
  url: `http://x/${id}`,
  name: id,
  format: "mp3",
  bitrate: 192,
  icyName: null,
  icyGenre: null,
  icyUrl: null,
  ignorelist: [],
  username: null,
  password: null,
  addedAt: "2026-01-01T00:00:00Z",
});

const mkSong = (path: string): Song => ({
  path,
  fileName: path,
  artist: "a",
  title: path, // title is irrelevant — the function consumes a pre-ordered array
  album: "",
  genre: "",
  station: "st",
  format: "mp3",
  durationMs: 1000,
  sizeBytes: 1000,
  recordedAt: "2026-01-01T00:00:00Z",
  isComplete: true,
});

const streams = [mkStream("s1"), mkStream("s2"), mkStream("s3")];
const songs = [mkSong("a.mp3"), mkSong("b.mp3"), mkSong("c.mp3")];

const streamSrc = (streamId: string): PlaybackSource => ({ type: "stream", streamId });
const fileSrc = (path: string): PlaybackSource => ({ type: "file", path });

describe("computePlaybackNeighbors — no context", () => {
  it("returns both null when source is null", () => {
    expect(computePlaybackNeighbors(null, streams, songs)).toEqual({ prev: null, next: null });
  });

  it("returns both null for a preview source", () => {
    const preview: PlaybackSource = { type: "preview", url: "http://x", name: "X" };
    expect(computePlaybackNeighbors(preview, streams, songs)).toEqual({ prev: null, next: null });
  });
});

describe("computePlaybackNeighbors — stream context", () => {
  it("returns both neighbors in the middle", () => {
    expect(computePlaybackNeighbors(streamSrc("s2"), streams, songs)).toEqual({
      prev: { kind: "stream", id: "s1" },
      next: { kind: "stream", id: "s3" },
    });
  });

  it("clamps prev to null on the first element", () => {
    expect(computePlaybackNeighbors(streamSrc("s1"), streams, songs)).toEqual({
      prev: null,
      next: { kind: "stream", id: "s2" },
    });
  });

  it("clamps next to null on the last element", () => {
    expect(computePlaybackNeighbors(streamSrc("s3"), streams, songs)).toEqual({
      prev: { kind: "stream", id: "s2" },
      next: null,
    });
  });

  it("returns both null for a single-element context", () => {
    expect(computePlaybackNeighbors(streamSrc("only"), [mkStream("only")], songs)).toEqual({
      prev: null,
      next: null,
    });
  });

  it("returns both null when the anchor stream is not in the list", () => {
    expect(computePlaybackNeighbors(streamSrc("gone"), streams, songs)).toEqual({
      prev: null,
      next: null,
    });
  });
});

describe("computePlaybackNeighbors — file context", () => {
  it("returns both neighbors in the middle", () => {
    expect(computePlaybackNeighbors(fileSrc("b.mp3"), streams, songs)).toEqual({
      prev: { kind: "file", path: "a.mp3" },
      next: { kind: "file", path: "c.mp3" },
    });
  });

  it("clamps prev to null on the first element", () => {
    expect(computePlaybackNeighbors(fileSrc("a.mp3"), streams, songs)).toEqual({
      prev: null,
      next: { kind: "file", path: "b.mp3" },
    });
  });

  it("clamps next to null on the last element", () => {
    expect(computePlaybackNeighbors(fileSrc("c.mp3"), streams, songs)).toEqual({
      prev: { kind: "file", path: "b.mp3" },
      next: null,
    });
  });

  it("returns both null for a single-element context", () => {
    expect(computePlaybackNeighbors(fileSrc("only.mp3"), streams, [mkSong("only.mp3")])).toEqual({
      prev: null,
      next: null,
    });
  });

  it("returns both null when the anchor file was filtered out or deleted", () => {
    expect(computePlaybackNeighbors(fileSrc("gone.mp3"), streams, songs)).toEqual({
      prev: null,
      next: null,
    });
  });

  it("uses the given array order (mirrors $filteredSongs sort/filter)", () => {
    const reordered = [mkSong("c.mp3"), mkSong("a.mp3"), mkSong("b.mp3")];
    expect(computePlaybackNeighbors(fileSrc("a.mp3"), streams, reordered)).toEqual({
      prev: { kind: "file", path: "c.mp3" },
      next: { kind: "file", path: "b.mp3" },
    });
  });
});

describe("$playbackNeighbors store wiring", () => {
  afterEach(() => {
    $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null });
    $streams.set([]);
    $songs.set([]);
    $songsQuery.set("");
    $songsStation.set(null);
    $songsSort.set("date");
  });

  it("reflects the correct neighbors through live atom state", () => {
    $streams.set([mkStream("s1"), mkStream("s2"), mkStream("s3")]);
    $playerStatus.set({
      state: "playing",
      source: { type: "stream", streamId: "s2" },
      volume: 0.75,
      positionMs: null,
      durationMs: null,
    });
    expect($playbackNeighbors.get()).toEqual({
      prev: { kind: "stream", id: "s1" },
      next: { kind: "stream", id: "s3" },
    });
  });
});
