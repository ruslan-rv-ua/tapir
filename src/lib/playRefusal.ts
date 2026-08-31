import * as m from "../i18n/paraglide/messages";

/**
 * Localized toast for a rejected `play_stream`. The backend refuses a stream
 * whose air Tapir cannot even name with the stable code `unsupported_codec`
 * (ADR 2026-08-31 §7) — the implication is one-directional, so this refusal is
 * never wrong: what Tapir does not record, symphonia does not decode either.
 *
 * Everything else keeps arriving raw: a connection failure already reads as a
 * reason, and replacing it with a generic sentence would cost the user the only
 * detail they have. Mirrors `shellOpenErrorMessage`.
 */
export function playRefusalMessage(err: unknown): string {
  return String(err) === "unsupported_codec" ? m.stream_play_unsupported() : String(err);
}
