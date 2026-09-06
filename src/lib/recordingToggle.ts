/**
 * The row's record action, as one rule with one home.
 *
 * A recording exists from the «start» command on: connecting and reconnecting
 * are phases of it, not its absence (CONTEXT.md §«Запис і Записи»). Four
 * surfaces offer the same toggle — the row button, its context menu, Enter in
 * the list, the command palette — and every one of them used to decide
 * start-or-stop by its own `state === "recording"`, so for the ≈40 minutes a
 * stream spends reconnecting they all offered to *start* a recording that was
 * already alive, and the backend's refusal reached the toast as English prose.
 * Record: docs/backlog/p1-record-action-lies-while-connecting.md.
 */

import * as tauri from "./tauri";
import type { StreamState } from "./tauri";
import { addToast } from "../stores/toasts";
import { isRecordingLike } from "./streamState";

/** Refusal codes of `start_recording` / `stop_recording` — the IPC contract
 *  with `REC_ERR_*` in src-tauri/src/commands/stream_commands.rs. */
const SKIP_CODES: ReadonlySet<string> = new Set(["already_recording", "not_recording"]);

/**
 * What a recording refusal should say, or `null` for «nothing to say».
 *
 * «Already recording» and «nothing to stop» are skips, not failures — the
 * verdict «Записати все» («пропущено») and the scheduler («потік уже
 * записувався») already give. They surface only in the race between the
 * `invoke` and the `recording-status` event that flips the row, and the row
 * flipping *is* the answer. Anything else passes through untouched, like
 * `playRefusalMessage`: that prose is another record's problem, and hiding it
 * would take away the only detail the user has.
 */
export function recordRefusalMessage(err: unknown): string | null {
  const text = String(err);
  return SKIP_CODES.has(text) ? null : text;
}

/**
 * Start or stop the stream's recording, whichever the state calls for, and
 * answer for the outcome. Stops while the recording is alive in any phase
 * (`isRecordingLike`), starts otherwise — including from `error`, where the
 * backend has already forgotten the entry. Never throws: refusals are either
 * swallowed (see `recordRefusalMessage`) or shown as an error toast, so the
 * caller has nothing to catch and nothing to word.
 */
export async function toggleRecording(streamId: string, state: StreamState | undefined): Promise<void> {
  try {
    if (isRecordingLike(state)) await tauri.stopRecording(streamId);
    else await tauri.startRecording(streamId);
  } catch (err) {
    const message = recordRefusalMessage(err);
    if (message !== null) addToast(message, "error");
  }
}
