import { atom, computed } from "nanostores";
import type { Song } from "../types/song";
import * as tauri from "../lib/tauri";

export type SongsSort = "date" | "title" | "artist" | "size";

export const $songs = atom<Song[]>([]);
export const $songsLoading = atom<boolean>(false);
export const $songsError = atom<string | null>(null);

export const $songsQuery = atom<string>("");
export const $songsStation = atom<string | null>(null);
export const $songsSort = atom<SongsSort>("date");

/** Multi-select state for the songs list (milestone D). Keyed by song path. */
export const $songsSelection = atom<Set<string>>(new Set());

export const $songsStations = computed($songs, (songs) =>
  Array.from(new Set(songs.map((s) => s.station))).sort()
);

export const $filteredSongs = computed(
  [$songs, $songsQuery, $songsStation, $songsSort],
  (songs, q, station, sort) => {
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = songs.filter((s) => {
      if (station && s.station !== station) return false;
      if (tokens.length > 0) {
        const haystack = `${s.artist} ${s.title} ${s.album}`.toLowerCase();
        if (!tokens.every((t) => haystack.includes(t))) return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "title":  return a.title.localeCompare(b.title);
        case "artist": return a.artist.localeCompare(b.artist);
        case "size":   return b.sizeBytes - a.sizeBytes;
        case "date":   return b.recordedAt.localeCompare(a.recordedAt);
      }
    });
  }
);

export async function loadSongs(): Promise<void> {
  $songsLoading.set(true);
  $songsError.set(null);
  try {
    const songs = await tauri.listSavedSongs();
    $songs.set(songs);
  } catch (e) {
    $songsError.set(String(e));
    $songs.set([]);
  } finally {
    $songsLoading.set(false);
  }
}

export function replaceSongByPath(updated: Song, oldPath?: string): void {
  const key = oldPath ?? updated.path;
  $songs.set($songs.get().map((s) => (s.path === key ? updated : s)));
}

export function removeSongByPath(path: string): void {
  $songs.set($songs.get().filter((s) => s.path !== path));
}

/** Bulk variant of removeSongByPath: drop every listed path in one update. */
export function removeSongsByPaths(paths: string[]): void {
  const drop = new Set(paths);
  $songs.set($songs.get().filter((s) => !drop.has(s.path)));
}
