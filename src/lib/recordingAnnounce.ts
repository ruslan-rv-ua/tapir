import type { FailureReason, RecordingStatusPayload } from "./tauri";
import * as m from "../i18n/paraglide/messages";

/**
 * What a `recording-status` event is worth saying out loud. Mirrors
 * `selectPlaybackAnnouncement` on the player side: the selector stays free of
 * i18n and of the store, so the mapping can be read — and tested — on its own.
 *
 * That separation is not cosmetic here. The branch that spoke about a failed
 * stream lived inline in `App.tsx` and was **dead for the life of the app**: its
 * condition could not be true, because the backend never sent `error`. Nothing
 * could notice, because there was nothing to point a test at.
 */
export type RecordingEvent =
  | { kind: "started" }
  | { kind: "stopped" }
  | { kind: "failed"; reason: FailureReason };

/**
 * The cause a reason-less `error` falls back to. A backend that emits `error`
 * without one has a defect, but silence would hide the single event this whole
 * surface exists for — and «диск» is the narrower claim of the two, so the
 * broader one is the safe default. Named once: three sites defaulted by hand
 * before, which is how a rule quietly becomes three rules.
 */
export const DEFAULT_FAILURE_REASON: FailureReason = "station_unreachable";

export interface RecordingSpeech {
  message: string;
  priority: "polite" | "assertive";
  /** Toast variant for the same text, or `null` when speech is the whole answer. */
  toast: "success" | "error" | null;
}

/**
 * The transitions Tapir speaks about — and, just as deliberately, the ones it
 * does not. `connecting` and `reconnecting` are silent: while attempts are still
 * running the row itself carries the fact («Спроба N з M») and the «Потребує
 * уваги» metric counts the stream from the first drop. A toast per attempt gave
 * ten pop-ups over ~40 minutes without once saying the stream had given up
 * (ADR 2026-09-06 §4).
 */
export function selectRecordingAnnouncement(
  payload: RecordingStatusPayload,
): RecordingEvent | null {
  switch (payload.status) {
    case "recording":
      return { kind: "started" };
    case "stopped":
      return { kind: "stopped" };
    case "error":
      return { kind: "failed", reason: payload.error ?? DEFAULT_FAILURE_REASON };
    default:
      return null;
  }
}

/**
 * The user-facing text of a give-up cause. Also fills the row's status segment,
 * which is why it takes the nullable field straight from the status: the row has
 * no business re-deciding what a missing reason means.
 */
export function failureReasonText(reason: FailureReason | null | undefined): string {
  return (reason ?? DEFAULT_FAILURE_REASON) === "disk_write_failed"
    ? m.failure_disk_write()
    : m.failure_station_unreachable();
}

/**
 * Render an event: what to say, how loudly, and whether it also needs a toast.
 *
 * Everything here is `polite`. `assertive` is the right to interrupt NVDA
 * mid-sentence, and accessibility.md §1.4 grants it to *responses to a user
 * action*; a give-up arrives ≈40 minutes after the last thing the user did.
 * Ten streams dropped by one outage would otherwise mean ten interruptions.
 */
export function describeRecording(event: RecordingEvent, name: string): RecordingSpeech {
  switch (event.kind) {
    case "started":
      return { message: m.recording_started({ name }), priority: "polite", toast: "success" };
    case "stopped":
      // Announce only — the row returns to «Очікування» by itself.
      return { message: m.recording_stopped({ name }), priority: "polite", toast: null };
    case "failed":
      return {
        message: m.stream_failed({ name, reason: failureReasonText(event.reason) }),
        priority: "polite",
        toast: "error",
      };
  }
}
