import * as m from "../i18n/paraglide/messages";

/**
 * Turn the backend's shell-open error code into a localized toast message.
 *
 * `open_song_in_app` rejects with one of the stable codes from
 * `map_shell_error` (src-tauri/src/commands/songs_commands.rs). Anything else —
 * a tokio join error, an unexpected throw — falls back to the generic wording,
 * so the user always gets a spoken reason instead of silence.
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
