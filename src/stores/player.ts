import { atom } from "nanostores";
import type { PlayerStatus } from "../lib/tauri";

export const $playerStatus = atom<PlayerStatus>({
  state: "stopped",
  source: null,
  volume: 0.75,
  positionMs: null,
  durationMs: null,
});

export interface MuteState {
  muted: boolean;
  savedVolume: number;  // volume to restore on unmute (0.0–1.0)
  restoring: boolean;   // true while setVolume is in-flight during unexpected-stop restore
}

export const $muteState = atom<MuteState>({ muted: false, savedVolume: 0.75, restoring: false });
