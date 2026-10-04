import { $muteState } from "../stores/player";
import { sameSource } from "./playbackSource";
import * as tauri from "./tauri";
import type { PlayerStatus } from "./tauri";

export interface MuteCleanupFlags {
  /** prev.state === "stopped" && payload.state === "playing" */
  stateChangedToPlaying: boolean;
  /** payload.state === "playing" and the source is not `sameSource` as before */
  sourceChangedWhilePlaying: boolean;
}

/**
 * The transition flags `applyMuteCleanup` acts on, read off two consecutive
 * `player-status` payloads. The source comparison is `sameSource` — the same
 * one the announcer uses — so whatever is announced as "Playing: B" also gets
 * the sound back.
 */
export function muteCleanupFlags(prev: PlayerStatus, next: PlayerStatus): MuteCleanupFlags {
  return {
    stateChangedToPlaying: prev.state === "stopped" && next.state === "playing",
    sourceChangedWhilePlaying: next.state === "playing" && !sameSource(prev.source, next.source),
  };
}

/**
 * Reconciles `$muteState` with a fresh `player-status` event.
 *
 * `$muteState.restoring` is a validity token for the in-flight `setVolume()`: any
 * synchronous setter that writes `restoring: false` invalidates a still-pending
 * restore, so its `.then()`/`.catch()` becomes a no-op. Every async branch here
 * therefore sets `restoring: true` before dispatching and re-checks it on settle.
 */
export function applyMuteCleanup(payload: PlayerStatus, flags: MuteCleanupFlags): void {
  // Case 1: keyboard shortcut raised volume while muted — clear mute UI
  if ($muteState.get().muted && !$muteState.get().restoring && payload.volume > 0) {
    const { savedVolume } = $muteState.get();
    $muteState.set({ muted: false, savedVolume, restoring: false });
  }

  // Case 2: new source started (stopped→playing or source switch) while muted
  // Resume (paused→playing) intentionally excluded — user paused while muted, they
  // expect to stay muted on resume.
  // restoring flag prevents a stale .then() from clobbering fresh mute state when
  // player-status events arrive faster than setVolume settles.
  if ((flags.stateChangedToPlaying || flags.sourceChangedWhilePlaying) && $muteState.get().muted) {
    const { savedVolume } = $muteState.get();
    $muteState.set({ muted: true, savedVolume, restoring: true });
    tauri.setVolume(savedVolume)
      .then(() => {
        if ($muteState.get().restoring) {
          $muteState.set({ muted: false, savedVolume, restoring: false });
        }
      })
      .catch((e) => {
        if ($muteState.get().restoring) {
          console.error("mute restore failed on new source:", e);
          $muteState.set({ muted: true, savedVolume, restoring: false });
        }
      });
  }

  // Unexpected stop while muted — restore volume.
  // restoring flag prevents re-entry if setVolume itself emits another stopped event.
  if (payload.state === "stopped" && $muteState.get().muted && !$muteState.get().restoring) {
    const { savedVolume } = $muteState.get();
    $muteState.set({ muted: true, savedVolume, restoring: true });
    tauri.setVolume(savedVolume)
      .then(() => {
        if ($muteState.get().restoring) {
          $muteState.set({ muted: false, savedVolume, restoring: false });
        }
      })
      .catch((e) => {
        if ($muteState.get().restoring) {
          console.error("mute restore failed:", e);
          $muteState.set({ muted: true, savedVolume, restoring: false });
        }
      });
  }
}
