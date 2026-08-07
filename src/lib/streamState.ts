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
