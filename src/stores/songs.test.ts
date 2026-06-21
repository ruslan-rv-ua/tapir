import { describe, expect, it, beforeEach } from "vitest";
import {
  $songs, $songsQuery, $songsStation, $songsSort, $filteredSongs, $songsStations,
  removeSongsByPaths,
} from "./songs";
import type { Song } from "../types/song";

function song(over: Partial<Song>): Song {
  return {
    path: "/x.mp3", fileName: "x.mp3",
    artist: "", title: "", album: "", genre: "",
    station: "Default", format: "mp3",
    durationMs: 0, sizeBytes: 0, recordedAt: "2026-01-01T00:00:00",
    isComplete: true,
    ...over,
  };
}

beforeEach(() => {
  $songs.set([]);
  $songsQuery.set("");
  $songsStation.set(null);
  $songsSort.set("date");
});

describe("$filteredSongs", () => {
  it("returns all songs when no filters set", () => {
    $songs.set([song({ title: "A" }), song({ title: "B" })]);
    expect($filteredSongs.get()).toHaveLength(2);
  });

  it("filters by station", () => {
    $songs.set([song({ station: "X" }), song({ station: "Y" })]);
    $songsStation.set("Y");
    expect($filteredSongs.get().map((s) => s.station)).toEqual(["Y"]);
  });

  it("filters by query case-insensitive across artist/title/album", () => {
    $songs.set([
      song({ artist: "Tycho", title: "Walk" }),
      song({ artist: "Boards of Canada", title: "Roygbiv" }),
      song({ album: "Selected Ambient Works" }),
    ]);
    $songsQuery.set("ambient");
    expect($filteredSongs.get()).toHaveLength(1);
  });

  it("matches multi-word queries with AND across artist/title/album", () => {
    $songs.set([
      song({ artist: "Tycho", title: "Ambient Walk", album: "" }),
      song({ artist: "Tycho", title: "Sunset", album: "" }),
      song({ artist: "Other", title: "Ambient Theme", album: "" }),
    ]);
    $songsQuery.set("tycho ambient");
    const result = $filteredSongs.get();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Ambient Walk");
  });

  it("treats extra whitespace in query as a single separator", () => {
    $songs.set([song({ artist: "Tycho", title: "Walk" })]);
    $songsQuery.set("  tycho   walk  ");
    expect($filteredSongs.get()).toHaveLength(1);
  });

  it("sorts by date desc by default", () => {
    $songs.set([
      song({ recordedAt: "2026-01-01T00:00:00", title: "old" }),
      song({ recordedAt: "2026-06-01T00:00:00", title: "new" }),
    ]);
    expect($filteredSongs.get().map((s) => s.title)).toEqual(["new", "old"]);
  });

  it("sorts by title ascending", () => {
    $songs.set([song({ title: "Beta" }), song({ title: "Alpha" })]);
    $songsSort.set("title");
    expect($filteredSongs.get().map((s) => s.title)).toEqual(["Alpha", "Beta"]);
  });

  it("sorts by artist ascending", () => {
    $songs.set([song({ artist: "Zoe" }), song({ artist: "Adam" })]);
    $songsSort.set("artist");
    expect($filteredSongs.get().map((s) => s.artist)).toEqual(["Adam", "Zoe"]);
  });

  it("sorts by size descending", () => {
    $songs.set([
      song({ sizeBytes: 100, title: "small" }),
      song({ sizeBytes: 1000, title: "big" }),
    ]);
    $songsSort.set("size");
    expect($filteredSongs.get().map((s) => s.title)).toEqual(["big", "small"]);
  });
});

describe("$songsStations", () => {
  it("returns unique sorted station list", () => {
    $songs.set([
      song({ station: "B" }), song({ station: "A" }), song({ station: "B" }),
    ]);
    expect($songsStations.get()).toEqual(["A", "B"]);
  });
});

describe("removeSongsByPaths", () => {
  it("removes every listed path in one update", () => {
    $songs.set([song({ path: "a.mp3" }), song({ path: "b.mp3" }), song({ path: "c.mp3" })]);
    removeSongsByPaths(["a.mp3", "c.mp3"]);
    expect($songs.get().map((s) => s.path)).toEqual(["b.mp3"]);
  });
});
