import * as m from "../i18n/paraglide/messages";

/**
 * Localized toast for a rejected `play_stream`. The backend refuses with a
 * stable code in two cases, and words neither itself:
 *
 * - `unsupported_codec` — a stream whose air Tapir cannot even name
 *   (ADR 2026-08-31 §7). The implication is one-directional, so this refusal
 *   is never wrong: what Tapir does not record, symphonia does not decode
 *   either.
 * - `stream_not_found` — the row outlived a profile switch or a delete. The
 *   same code, and the same key, as the recording side (`recordRefusalMessage`):
 *   one fact, one wording.
 *
 * Everything else keeps arriving raw: a connection failure already reads as a
 * reason, and replacing it with a generic sentence would cost the user the only
 * detail they have. Mirrors `shellOpenErrorMessage`.
 */
export function playRefusalMessage(err: unknown): string {
  const text = String(err);
  switch (text) {
    case "unsupported_codec":
      return m.stream_play_unsupported();
    case "stream_not_found":
      return m.stream_not_found_in_profile();
    default:
      return text;
  }
}
