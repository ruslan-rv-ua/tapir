import { computed } from "nanostores";
import type { PlaybackSource, StreamInfo } from "../lib/tauri";
import type { Song } from "../types/song";
import { $playerStatus } from "./player";
import { $visibleStreams } from "./streams";
import { $filteredSongs } from "./songs";

export type NeighborTarget =
  | { kind: "stream"; id: string }
  | { kind: "file"; path: string };

export interface PlaybackNeighbors {
  prev: NeighborTarget | null;
  next: NeighborTarget | null;
}

// Frozen + shared: returning one reference keeps the computed store's equality
// check stable (no spurious notifications) and prevents accidental mutation.
const NONE: PlaybackNeighbors = Object.freeze({ prev: null, next: null });

/**
 * Compute the previous/next transport targets for the current playback context.
 * Context is the stream list (source.type === "stream") or the filtered songs
 * list (source.type === "file"). Returns null on a side to mean "disabled":
 * no source, preview, anchor not in the list, single element, or a boundary.
 * Pure — order comes entirely from the passed arrays.
 */
export function computePlaybackNeighbors(
  source: PlaybackSource | null,
  streams: StreamInfo[],
  songs: Song[],
): PlaybackNeighbors {
  if (!source) return NONE;

  if (source.type === "stream") {
    const idx = streams.findIndex((s) => s.id === source.streamId);
    if (idx === -1) return NONE;
    return {
      prev: idx > 0 ? { kind: "stream", id: streams[idx - 1].id } : null,
      next: idx < streams.length - 1 ? { kind: "stream", id: streams[idx + 1].id } : null,
    };
  }

  if (source.type === "file") {
    const idx = songs.findIndex((s) => s.path === source.path);
    if (idx === -1) return NONE;
    return {
      prev: idx > 0 ? { kind: "file", path: songs[idx - 1].path } : null,
      next: idx < songs.length - 1 ? { kind: "file", path: songs[idx + 1].path } : null,
    };
  }

  return NONE; // preview
}

/**
 * Live neighbor descriptor for the current player status. Reads $visibleStreams
 * (filtered + sorted on-screen order), NOT raw insertion-order $streams, so
 * Ctrl+Alt+Left/Right step through streams in the order the list shows them.
 */
export const $playbackNeighbors = computed(
  [$playerStatus, $visibleStreams, $filteredSongs],
  (status, streams, songs) => computePlaybackNeighbors(status.source, streams, songs),
);
