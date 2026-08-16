import { atom } from "nanostores";
import type { PlayerStatus } from "../lib/tauri";

export const $playerStatus = atom<PlayerStatus>({
  state: "stopped",
  source: null,
  volume: 0.75,
  positionMs: null,
  durationMs: null,
});

/**
 * Seed of the level memory below. The volume level survives a restart (it is a
 * profile session field), `$muteState` does not — so a cold start with a zero
 * level in the profile finds the memory empty. This constant is the explicit
 * fallback for exactly that case, and for no other.
 */
export const FALLBACK_VOLUME = 0.75;

export interface MuteState {
  muted: boolean;
  /**
   * The level to come back to when the sound is turned back on (0.0–1.0): the
   * last non-zero level seen, fed by BOTH ways into silence — the mute toggle
   * and a plain level change that reached zero (`rememberVolumeLevel`).
   */
  savedVolume: number;
  restoring: boolean;   // true while setVolume is in-flight during unexpected-stop restore
}

export const $muteState = atom<MuteState>({
  muted: false,
  savedVolume: FALLBACK_VOLUME,
  restoring: false,
});
