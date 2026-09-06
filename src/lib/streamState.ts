import type { StreamState } from "./tauri";

/**
 * States in which the backend holds an in-flight recording task for the stream
 * (`recording_control.rs::is_active`). The Rust mirror of this predicate is
 * `move_blocked_by_state` in `commands/stream_commands.rs` — keep them in step.
 *
 * `error` is deliberately absent: an errored entry lingers through the reconnect
 * retries, and treating it as active would lock the user out of the very stream
 * that needs attention. Playback is not a recording state either (R4) — a caller
 * that also cares about the player must say so itself.
 */
const RECORDING_LIKE: ReadonlySet<string> = new Set(["recording", "connecting", "reconnecting"]);

/** Whether the backend is currently recording, or trying to. An absent status
 *  means the manager has never heard of the stream — idle. */
export function isRecordingLike(state: StreamState | undefined): boolean {
  return RECORDING_LIKE.has(state ?? "idle");
}

/**
 * The «Потребує уваги» bucket: streams that gave up **and** streams still
 * fighting to reconnect. One predicate behind both the filter chip and the
 * metric — they were two names for one number even before this widened it
 * (ADR 2026-09-06 §2).
 *
 * `reconnecting` belongs here because `error` alone would show zero for the
 * ~40 minutes between the first drop and the last retry: the stream is not
 * broken yet, but it is exactly what the user wants surfaced. A stream Tapir
 * refuses to record (foreign codec) is deliberately absent — its carrier is the
 * codec mark on the stream itself, and the fact is unclearable (§7).
 */
const NEEDS_ATTENTION: ReadonlySet<string> = new Set(["error", "reconnecting"]);

/** Whether the stream belongs in the «Потребує уваги» bucket. */
export function needsAttention(state: StreamState | undefined): boolean {
  return NEEDS_ATTENTION.has(state ?? "idle");
}
