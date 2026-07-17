import type { PlayerStatus, PlaybackSource } from "./tauri";

export type PlaybackAnnouncement =
  | { kind: "started"; name: string }
  | { kind: "paused"; name: string }
  | { kind: "resumed"; name: string }
  | { kind: "stopped"; name: string | null }
  | null;

function sameSource(a: PlaybackSource | null, b: PlaybackSource | null): boolean {
  if (!a || !b) return a === b;
  if (a.type !== b.type) return false;
  if (a.type === "stream" && b.type === "stream") return a.streamId === b.streamId;
  if (a.type === "file" && b.type === "file") return a.path === b.path;
  if (a.type === "preview" && b.type === "preview") return a.url === b.url;
  return false;
}

/**
 * Pick the single NVDA announcement for a player-status transition. Central
 * source of truth for pause/resume/stop/start — a UI button press and a global
 * hotkey both arrive here via `player-status`, so each yields exactly one
 * announce. Cold-start "connecting"/"unavailable" are NOT here — they come from
 * the Rust `player-announce` event (the webview can't derive them).
 */
export function selectPlaybackAnnouncement(
  prev: PlayerStatus,
  next: PlayerStatus,
  nameOf: (source: PlaybackSource) => string,
): PlaybackAnnouncement {
  const startedToPlaying = prev.state === "stopped" && next.state === "playing";
  const switchedWhilePlaying =
    next.state === "playing" && prev.state === "playing" && !sameSource(prev.source, next.source);

  if (startedToPlaying || switchedWhilePlaying) {
    return next.source ? { kind: "started", name: nameOf(next.source) } : null;
  }
  if (prev.state === "playing" && next.state === "paused") {
    return next.source ? { kind: "paused", name: nameOf(next.source) } : null;
  }
  if (prev.state === "paused" && next.state === "playing") {
    return next.source ? { kind: "resumed", name: nameOf(next.source) } : null;
  }
  if (prev.state !== "stopped" && next.state === "stopped") {
    return { kind: "stopped", name: prev.source ? nameOf(prev.source) : null };
  }
  return null;
}
