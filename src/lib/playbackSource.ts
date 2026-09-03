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
