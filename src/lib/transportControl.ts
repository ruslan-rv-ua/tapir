import { $playerStatus } from "../stores/player";
import { $playbackNeighbors } from "../stores/playbackNeighbors";
import { $settings } from "../stores/settings";
import * as tauri from "./tauri";
import {
  resolveTransportAction,
  type TransportAction,
  type TransportContext,
} from "./playbackTransport";

export type SkipTrigger = "prev" | "next";

export interface SkipHooks {
  /** Runs after the action is resolved, before the IPC call (focus pre-move). */
  beforeExecute?: (action: TransportAction, ctx: TransportContext) => void;
  /** seek-start completed (panel announces "player restarted"). */
  onSeekStart?: () => void;
  /** IPC failed (panel announces playback error). */
  onError?: () => void;
}

/** Parse a transport-skip event payload; null for anything else. */
export function parseSkipTrigger(payload: unknown): SkipTrigger | null {
  return payload === "prev" || payload === "next" ? payload : null;
}

// Module-level guard shared by the player buttons and the global hotkey:
// only one transport command may be in flight at a time.
let pending = false;

/**
 * Resolve and execute a prev/next transport action against the current player
 * context. Reads the stores directly; safe to call from outside React.
 * No-op when nothing is playing or the boundary is reached.
 */
export async function executeTransportSkip(
  trigger: SkipTrigger,
  hooks?: SkipHooks,
): Promise<void> {
  if (pending) return;
  const status = $playerStatus.get();
  const ctx: TransportContext = {
    source: status.source,
    positionMs: status.positionMs,
    neighbors: $playbackNeighbors.get(),
    prevRestartThresholdMs: $settings.get()?.prevRestartThresholdMs ?? 0,
  };
  const action = resolveTransportAction(trigger, ctx);
  if (action.kind === "none") return;
  pending = true;
  try {
    hooks?.beforeExecute?.(action, ctx);
    switch (action.kind) {
      case "play-stream": await tauri.playStream(action.id); break;
      case "play-file":   await tauri.playSavedSong(action.path); break;
      case "seek-start":
        await tauri.seekPlayback(0);
        hooks?.onSeekStart?.();
        break;
      // "stop" cannot occur for prev/next (only auto-advance) — no-op.
    }
    // play-* announce "Playing: {name}" via App.tsx player-status.
  } catch (e) {
    console.error(e);
    hooks?.onError?.();
  } finally {
    pending = false;
  }
}
