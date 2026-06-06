import type { PlaybackSource } from "./tauri";
import type { PlaybackNeighbors, NeighborTarget } from "../stores/playbackNeighbors";

export type TransportAction =
  | { kind: "play-stream"; id: string }
  | { kind: "play-file"; path: string }
  | { kind: "seek-start" }
  | { kind: "stop" }
  | { kind: "none" };

export type TransportTrigger = "prev" | "next" | "auto-advance";

export interface TransportContext {
  source: PlaybackSource | null;
  positionMs: number | null;
  neighbors: PlaybackNeighbors;
  prevRestartThresholdMs: number;
}

function toPlay(target: NeighborTarget): TransportAction {
  return target.kind === "stream"
    ? { kind: "play-stream", id: target.id }
    : { kind: "play-file", path: target.path };
}

/**
 * Decide what a transport trigger does in the current context. Pure: takes the
 * already-computed neighbors, never reads stores.
 * - next: play next neighbor, else none (button disabled).
 * - auto-advance: play next neighbor, else stop (end of list).
 * - prev: restart the current file if played past the threshold, else play the
 *   previous neighbor, else none.
 */
export function resolveTransportAction(
  trigger: TransportTrigger,
  ctx: TransportContext,
): TransportAction {
  const { source, positionMs, neighbors, prevRestartThresholdMs } = ctx;

  if (trigger === "next") {
    return neighbors.next ? toPlay(neighbors.next) : { kind: "none" };
  }
  if (trigger === "auto-advance") {
    return neighbors.next ? toPlay(neighbors.next) : { kind: "stop" };
  }

  // prev
  if (
    source?.type === "file" &&
    prevRestartThresholdMs > 0 &&
    positionMs !== null &&
    positionMs > prevRestartThresholdMs
  ) {
    return { kind: "seek-start" };
  }
  return neighbors.prev ? toPlay(neighbors.prev) : { kind: "none" };
}

/** Decide what happens when a file ends naturally. */
export function resolveEndedAction(
  autoAdvance: boolean,
  neighbors: PlaybackNeighbors,
): TransportAction {
  if (!autoAdvance) return { kind: "stop" };
  return resolveTransportAction("auto-advance", {
    source: null,
    positionMs: null,
    neighbors,
    prevRestartThresholdMs: 0,
  });
}
