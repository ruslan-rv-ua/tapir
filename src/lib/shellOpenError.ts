import * as m from "../i18n/paraglide/messages";

/**
 * Localized toast messages for the two commands that hand something to the
 * Windows shell. Both reject with a stable code from
 * `src-tauri/src/commands/shell_open.rs`, but they can't share one mapping: the
 * code SETS differ, and `no_assoc` means different things (a song has no app for
 * its audio format; a stream has no app for playlists at all). Anything
 * unrecognized — a tokio join error, an unexpected throw — falls back to the
 * generic wording, so the user always gets a spoken reason instead of silence.
 */
export function shellOpenErrorMessage(err: unknown): string {
  switch (String(err)) {
    case "not_found":
      return m.songs_open_not_found();
    case "no_assoc":
      return m.songs_open_no_assoc();
    default:
      return m.songs_open_failed();
  }
}

/**
 * The stream variant (`open_stream_in_app`). `not_found` is unreachable here —
 * the playlist was just written — while `write_failed` is new: keeping it apart
 * from `no_assoc` is the whole point, since one says "install VLC" and the other
 * says "check the disk".
 */
export function streamOpenErrorMessage(err: unknown): string {
  switch (String(err)) {
    case "no_assoc":
      return m.stream_open_no_assoc();
    case "write_failed":
      return m.stream_open_write_failed();
    default:
      return m.stream_open_failed();
  }
}

/**
 * The project-page variant (`open_project_page`). One wording for every code:
 * the address is a constant `https:` URL, so `not_found` cannot happen and
 * `no_assoc` ("no browser at all") calls for the same action as anything else —
 * open the address by hand. It is on screen, right above the button.
 */
export function projectPageOpenErrorMessage(): string {
  return m.about_open_failed();
}
