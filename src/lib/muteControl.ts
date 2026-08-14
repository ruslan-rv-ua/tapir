import { $muteState, $playerStatus } from "../stores/player";
import * as tauri from "./tauri";
import * as m from "../i18n/paraglide/messages";

/** Volume to restore when mute was engaged from an already-silent player. */
const FALLBACK_VOLUME = 0.75;

// Module-level guard shared by the player button and the hotkey — mirrors
// transportControl.ts: only one mute command may be in flight at a time, so a
// held key cannot flip the state twice.
let pending = false;

/**
 * Toggle the player's mute, announce the resulting STATE, keep `$muteState` in
 * sync. Reads the stores directly; safe to call from outside React.
 *
 * Unlike the sibling `transportControl.ts`, the wording lives here rather than
 * in the caller: this module already has three callers (the player button,
 * `Ctrl+M`, and later the Rust→webview bridge behind `Ctrl+Shift+U`), and it is
 * exactly their divergence — the button used to announce its own next-action
 * label, "Mute", right after muting — that this module exists to prevent.
 * `announce` stays a parameter so the module never pulls in React.
 */
export async function toggleMute(
  announce: (message: string, priority: "polite" | "assertive") => void,
): Promise<void> {
  if (pending) return;
  // Nothing playing → no-op, exactly like the disabled mute button (and like
  // executeTransportSkip on an idle player). Muting a stopped player would also
  // be undone immediately: applyMuteCleanup restores the volume on a `stopped`
  // status, so the "sound off" announce would be a lie by the next event.
  if ($playerStatus.get().state === "stopped") return;

  pending = true;
  try {
    const { muted, savedVolume } = $muteState.get();
    if (!muted) {
      const volume = $playerStatus.get().volume;
      const restoreTo = volume > 0 ? volume : FALLBACK_VOLUME;
      await tauri.setVolume(0);
      $muteState.set({ muted: true, savedVolume: restoreTo, restoring: false });
      announce(m.player_muted(), "assertive");
    } else {
      await tauri.setVolume(savedVolume);
      $muteState.set({ muted: false, savedVolume, restoring: false });
      announce(m.player_unmuted(), "assertive");
    }
  } catch (e) {
    console.error(e);
    announce(m.playback_error(), "assertive");
  } finally {
    pending = false;
  }
}
