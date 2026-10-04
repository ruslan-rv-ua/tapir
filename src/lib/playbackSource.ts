import type { PlaybackSource } from "./tauri";

/**
 * Which kinds of source are LIVE — sound that is going on right now and has no
 * position. Written as a table over every kind rather than as `!== "file"`: a
 * negation would quietly enrol whatever source is added next into the live
 * ones, and nothing here would notice. `playbackSource.test.ts` names all
 * three, so a fourth cannot arrive without an answer.
 */
export const LIVE_BY_SOURCE_TYPE: Record<PlaybackSource["type"], boolean> = {
  stream: true,
  preview: true,
  file: false,
};

/**
 * "Is this live sound?" — the one question every control of the player asks
 * before it acts, and it is NOT the same question as "is this a stream of the
 * profile?".
 *
 * Two paths lead into the live state — the air of a profile stream, and a
 * station played straight from the catalogue without adding it — and the user
 * meets one: no seeking, no pause, the primary control STOPS. What is asked
 * about a profile stream instead (`source.type === "stream"`) is only what a
 * catalogue station never has: an ICY track, a bitrate, a `StreamInfo`.
 *
 * The mirror on the Rust side is `PlaybackSource::is_live` (player/engine.rs);
 * both sides of the IPC give the question exactly one name. Same shape as
 * `muteControl.isSoundOff`: the state a user meets, not the field underneath.
 * Model: CONTEXT.md §«Живе джерело».
 */
export function isLiveSource(source: PlaybackSource | null | undefined): boolean {
  return source ? LIVE_BY_SOURCE_TYPE[source.type] : false;
}

/**
 * "Is this the same source?" — the one answer for every reader of
 * `player-status` that has to tell a switch from a continuation: the
 * announcer ("Playing: B") and the mute cleanup (the toggle resets on a new
 * source, ADR 2026-08-16 §3). Each kind has its own identity — a stream its
 * id, a catalogue station its url, a file its path — and two kinds are never
 * the same. Two copies of this used to drift apart; keep it one.
 */
export function sameSource(a: PlaybackSource | null, b: PlaybackSource | null): boolean {
  if (!a || !b) return a === b;
  if (a.type === "stream" && b.type === "stream") return a.streamId === b.streamId;
  if (a.type === "preview" && b.type === "preview") return a.url === b.url;
  if (a.type === "file" && b.type === "file") return a.path === b.path;
  return false;
}
