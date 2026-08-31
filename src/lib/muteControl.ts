import { $muteState, $playerStatus } from "../stores/player";
import { volumePercent } from "./formatters";
import * as tauri from "./tauri";
import * as m from "../i18n/paraglide/messages";

/**
 * "Sound off" as the user meets it: healthy playback that makes no sound. Two
 * paths lead there — the toggle (`$muteState.muted`) and a volume level brought
 * down to zero — and every surface treats them as ONE state: same icon, same
 * button label, same `aria-pressed`, same `F9` clause, same way out.
 *
 * The two values stay separate underneath because their lifetimes differ: the
 * toggle is cleared by `muteCleanup` on a stop or a new source, the level is a
 * profile session field that survives a restart. So read this predicate, never
 * the `muted` field on its own — a field that is `false` does not mean sound.
 * Model and rejected alternatives:
 * docs/decisions/2026-08-16-silence-is-mute-or-zero-volume.md.
 */
export function isSoundOff(muted: boolean, volume: number): boolean {
  return muted || volume <= 0;
}

/**
 * What the sound is, as a fact: a level in whole percent, or silence. Wording
 * belongs to the caller (App.tsx maps each kind onto an i18n key), the same
 * contract `playbackAnnounce.ts` follows.
 */
export type VolumeAnnouncement =
  | { kind: "level"; percent: number }
  | { kind: "silent" };

/**
 * The answer `Ctrl+Alt+Up/Down` and the `F9` sound clause both give — one
 * decision, so the key and the question can never disagree.
 *
 * Zero is `silent`, not "0%": silence has one name across every surface
 * (docs/decisions/2026-08-16-silence-is-mute-or-zero-volume.md), and a fourth
 * phrasing of it is exactly what that model exists to prevent.
 *
 * It lives here because this module already owns "sound on / sound off" —
 * `isSoundOff` and the level memory are its neighbours, and the same argument
 * that keeps `toggleMute`'s wording out of its three callers keeps this rule
 * out of its two.
 */
export function selectVolumeAnnouncement(volume: number, muted: boolean): VolumeAnnouncement {
  if (isSoundOff(muted, volume)) return { kind: "silent" };
  return { kind: "level", percent: volumePercent(volume) };
}

/**
 * Feed the level memory from a fresh `player-status`.
 *
 * It has to be observed on the status event rather than captured where
 * `setVolume` is called: `Ctrl+Alt+Up/Down` are GLOBAL keys handled in Rust
 * (shortcuts.rs), so the webview never sees that gesture — only its outcome.
 * Zero is deliberately not recorded; that is the whole point of the memory.
 */
export function rememberVolumeLevel(volume: number): void {
  if (volume <= 0) return;
  const state = $muteState.get();
  if (state.savedVolume === volume) return;
  $muteState.set({ ...state, savedVolume: volume });
}

/**
 * Reflect a level this module just committed, without waiting for the
 * `player-status` event to echo it back — the same optimistic write
 * `PlaybackPosition` makes after a seek.
 *
 * Not cosmetic: since the surfaces now read the LEVEL and not just the toggle,
 * a second press that beats the event home would otherwise still see the old
 * zero and raise the volume again instead of silencing it.
 */
function applyLevel(volume: number): void {
  $playerStatus.set({ ...$playerStatus.get(), volume });
}

// Module-level guard shared by the player button and the hotkey — mirrors
// transportControl.ts: only one mute command may be in flight at a time, so a
// held key cannot flip the state twice.
let pending = false;

/**
 * Toggle the player's sound off/on, announce the resulting STATE, keep
 * `$muteState` in sync. Reads the stores directly; safe to call from outside
 * React.
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
    const volume = $playerStatus.get().volume;
    if (isSoundOff(muted, volume)) {
      // One way out for both paths. Reached with a zero level and no toggle,
      // this is the case the old code got backwards: it announced "sound off"
      // to an already-silent player and changed nothing.
      await tauri.setVolume(savedVolume);
      $muteState.set({ muted: false, savedVolume, restoring: false });
      applyLevel(savedVolume);
      // After the await, so "sound on" is never spoken to a still-silent player.
      announce(m.player_unmuted(), "assertive");
    } else {
      await tauri.setVolume(0);
      // The level being silenced is by definition non-zero here, so it is worth
      // remembering — this is the toggle's half of the memory's two feeds.
      $muteState.set({ muted: true, savedVolume: volume, restoring: false });
      applyLevel(0);
      announce(m.player_muted(), "assertive");
    }
  } catch (e) {
    console.error(e);
    announce(m.playback_error(), "assertive");
  } finally {
    pending = false;
  }
}
