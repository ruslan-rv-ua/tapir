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
 * Record: docs/backlog/done/p1-record-action-lies-while-connecting.md.
 *
 * The wording of the refusals lives here too, because «Записати все» shares
 * one of them (the disk threshold) with the row — a second home would drift.
 * Record: docs/backlog/p2-record-refusals-untranslated.md.
 */

import * as tauri from "./tauri";
import type { StreamState } from "./tauri";
import { addToast } from "../stores/toasts";
import { isRecordingLike } from "./streamState";
import * as m from "../i18n/paraglide/messages";

/**
 * What a recording refusal should say, or `null` for «nothing to say».
 *
 * The codes are the IPC contract with `REC_ERR_*` in
 * src-tauri/src/commands/stream_commands.rs:
 *
 * - «already recording» and «nothing to stop» are skips, not failures — the
 *   verdict «Записати все» («пропущено») and the scheduler («потік уже
 *   записувався») already give. They surface only in the race between the
 *   `invoke` and the `recording-status` event that flips the row, and the row
 *   flipping *is* the answer.
 * - the disk threshold is Tapir's own refusal, worded without numbers: the
 *   status bar and the «Вільно» metric already show the free space and flip
 *   to «low» at the same threshold; the log keeps the figures.
 * - a stream missing from the active profile is a toast, not silence: the list
 *   should never have offered that row, and silence would hide that defect.
 *
 * Anything else passes through untouched, like `playRefusalMessage`: hiding it
 * would take away the only detail the user has.
 */
export function recordRefusalMessage(err: unknown): string | null {
  const text = String(err);
  switch (text) {
    case "already_recording":
    case "not_recording":
      return null;
    case "disk_space_low":
      return m.record_refused_disk_space();
    case "stream_not_found":
      return m.stream_not_found_in_profile();
    default:
      return text;
  }
}

/**
 * Answer for a rejected recording command: an error toast when the refusal
 * has something to say, a debug line otherwise. `origin` names the caller in
 * that line — if a row ever stays stale, it is the only evidence the press
 * reached the backend.
 */
export function reportRecordRefusal(err: unknown, origin: string): void {
  const message = recordRefusalMessage(err);
  if (message !== null) addToast(message, "error");
  else console.debug(`${origin}: skipped —`, err);
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
    reportRecordRefusal(err, `toggleRecording(${streamId})`);
  }
}
