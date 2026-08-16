import type { PlayerStatus, PlaybackSource, StreamInfo, StreamStatus, TrackInfo } from "./tauri";

export type PlaybackAnnouncement =
  | { kind: "started"; name: string }
  | { kind: "paused"; name: string }
  | { kind: "resumed"; name: string }
  | { kind: "stopped"; name: string | null }
  | null;

/** A Rust-side "connecting" announce that is still awaiting its outcome. */
export interface PendingConnect {
  name: string;
  /** Epoch ms after which the pending connect is considered stale. */
  until: number;
}

/**
 * Cold-start stream resume announces "Connecting — X" (Rust side) and would
 * then announce "Playing: X" when the connect lands — a duplicate for the same
 * gesture. Suppress the "started" that matches a live pending connect; anything
 * else (different name, expired window) announces normally.
 */
export function suppressesStarted(
  pending: PendingConnect | null,
  announcement: PlaybackAnnouncement,
  now: number,
): boolean {
  return (
    pending !== null &&
    announcement?.kind === "started" &&
    announcement.name === pending.name &&
    now <= pending.until
  );
}

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

/**
 * The one name the app gives a playback source. Every caller that has to say
 * "what is playing" out loud — the player panel's heading, the status-transition
 * announcer, `describePlayback` below — goes through here, so a stream can never
 * be a name in one sentence and an id in the next.
 *
 * `selectPlaybackAnnouncement` keeps taking `nameOf` by injection rather than
 * calling this directly: it stays free of store reads, and App.tsx passes
 * `(s) => sourceName(s, $streams.get())`.
 */
export function sourceName(source: PlaybackSource, streams: StreamInfo[]): string {
  if (source.type === "stream") {
    return streams.find((s) => s.id === source.streamId)?.name ?? source.streamId;
  }
  if (source.type === "preview") return source.name;
  return source.path.split(/[\\/]/).pop() ?? source.path;
}

/**
 * The one way the app renders "artist — title", or null when neither is known.
 *
 * A half-empty track is the common case, not an edge one: the Rust ICY parser
 * only splits on `" - "`, so a station that sends a bare song title arrives as
 * `{ artist: "", title: "So What" }` (stream/connection.rs). Interpolating both
 * unconditionally would speak "— So What" with a dangling dash.
 */
export function trackLabel(track: TrackInfo | null | undefined): string | null {
  if (!track) return null;
  if (!track.artist && !track.title) return null;
  return [track.artist, track.title].filter(Boolean).join(" — ");
}

/**
 * What is playing right now, as facts. Localization belongs to the caller (the
 * F9 handler maps each kind onto an i18n key) — the same contract
 * `PlaybackAnnouncement` follows, and the reason the 3×3 table in the tests can
 * check behaviour without mocking i18n.
 */
export type PlaybackDescription =
  | { kind: "nothing" }
  | { kind: "stream"; station: string; track: string | null }
  | { kind: "preview"; name: string }
  | { kind: "file"; name: string; positionMs: number | null; paused: boolean };

/**
 * Answer "what am I hearing?" on demand (F9), as opposed to
 * `selectPlaybackAnnouncement`, which answers "what just changed?".
 *
 * Total by construction: every state × source pair yields a description, even
 * the two the running app cannot reach (a live stream and a preview have no
 * pause — the player's primary control stops them). `muted` comes back as its
 * own field because it describes the OUTPUT, not the source.
 *
 * `muted` is the sound-off STATE (`muteControl.isSoundOff`), not the toggle
 * field: silence reached by dropping the level to zero gets the same clause.
 */
export function describePlayback(input: {
  status: PlayerStatus;
  statuses: Record<string, StreamStatus>;
  streams: StreamInfo[];
  muted: boolean;
}): { description: PlaybackDescription; muted: boolean } {
  const { status, statuses, streams, muted } = input;
  const source = status.source;

  // A stopped player describes nothing, even when the status still carries the
  // source it stopped on (resume keeps it around).
  if (status.state === "stopped" || !source) {
    return { description: { kind: "nothing" }, muted };
  }

  if (source.type === "stream") {
    // The track lives in the stream's own status, not in $playerStatus; a
    // station that sends no ICY metadata — or only half of one — is a legal
    // case, not a failure, and `trackLabel` collapses both to null.
    return {
      description: {
        kind: "stream",
        station: sourceName(source, streams),
        track: trackLabel(statuses[source.streamId]?.currentTrack),
      },
      muted,
    };
  }

  if (source.type === "preview") {
    return { description: { kind: "preview", name: source.name }, muted };
  }

  return {
    description: {
      kind: "file",
      name: sourceName(source, streams),
      positionMs: status.positionMs,
      paused: status.state === "paused",
    },
    muted,
  };
}
