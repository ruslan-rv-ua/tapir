import * as m from "../i18n/paraglide/messages";

/**
 * Localized toast for a rejected `play_stream`, `preview_station` or
 * `play_saved_song`. The backend refuses with a stable code and words none of
 * them itself; the detail
 * (the whole error chain) is in the log, not in the toast (ADR 2026-09-06 §5):
 *
 * - `unsupported_codec` — a stream whose air Tapir cannot even name
 *   (ADR 2026-08-31 §7). The implication is one-directional, so this refusal
 *   is never wrong: what Tapir does not record, symphonia does not decode
 *   either.
 * - `stream_not_found` — the row outlived a profile switch or a delete. The
 *   same code, and the same key, as the recording side (`recordRefusalMessage`):
 *   one fact, one wording.
 * - `play_failed` — connected, but the air never became sound: probe timeout,
 *   a format symphonia cannot decode (AAC+), a decoder-init panic. One code,
 *   because all three lead to the same action — another station, or the help.
 * - `connect_failed` — the station did not answer. The browser's health-check
 *   key: one fact, one wording. The only refusal that says "try later".
 * - `output_unavailable` — the output device would not open (the Audio tab of
 *   Settings). Live and file alike: the wording names no source.
 * - `file_not_found` — the track is no longer where the list saw it (`NotFound`
 *   and nothing else). The `Alt+Enter` key (`shellOpenErrorMessage`): one fact,
 *   one wording.
 * - `file_play_failed` — any other refusal of a file: access denied, held by
 *   another program, broken or not audio at all.
 *
 * Anything else passes through untouched. Mirrors `shellOpenErrorMessage`.
 */
/**
 * Whether a live-play refusal means the station did not answer — the only one
 * that earns a browser row the **Unavailable** mark. A station that answered
 * but would not play (AAC+) is on the air and records fine.
 */
export function isStationUnreachable(err: unknown): boolean {
  return String(err) === "connect_failed";
}

export function playRefusalMessage(err: unknown): string {
  const text = String(err);
  switch (text) {
    case "unsupported_codec":
      return m.stream_play_unsupported();
    case "stream_not_found":
      return m.stream_not_found_in_profile();
    case "play_failed":
      return m.stream_play_failed();
    case "connect_failed":
      return m.failure_station_unreachable();
    case "output_unavailable":
      return m.stream_play_output_unavailable();
    case "file_not_found":
      return m.songs_open_not_found();
    case "file_play_failed":
      return m.file_play_failed();
    default:
      return text;
  }
}
