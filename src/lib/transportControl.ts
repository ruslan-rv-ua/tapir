import { $playerStatus } from "../stores/player";
import { $playbackNeighbors } from "../stores/playbackNeighbors";
import { $settings } from "../stores/settings";
import { $streams } from "../stores/streams";
import { addToast } from "../stores/toasts";
import { announce } from "../stores/announcer";
import * as tauri from "./tauri";
import { sourceName } from "./playbackAnnounce";
import * as m from "../i18n/paraglide/messages";
import {
  resolveTransportAction,
  type TransportAction,
  type TransportContext,
} from "./playbackTransport";
import type { PlaybackSource } from "./tauri";

export type SkipTrigger = "prev" | "next";

export interface SkipHooks {
  /** Runs after the action is resolved, before the IPC call (focus pre-move).
   *  Deliberately the ONLY hook: feedback lives inside this module, so a caller
   *  without buttons (global hotkey, SMTC) cannot come up mute. */
  beforeExecute?: (action: TransportAction, ctx: TransportContext) => void;
}

/** Parse a transport-skip event payload; null for anything else. */
export function parseSkipTrigger(payload: unknown): SkipTrigger | null {
  return payload === "prev" || payload === "next" ? payload : null;
}

/** The one source a skip failure names — the naming itself is `sourceName`'s. */
function skipTarget(action: TransportAction, ctx: TransportContext): PlaybackSource | null {
  switch (action.kind) {
    case "play-stream": return { type: "stream", streamId: action.id };
    case "play-file":   return { type: "file", path: action.path };
    case "seek-start":  return ctx.source;
    default:            return null;
  }
}

/**
 * One rule for both callers: window focused → in-window toast, otherwise the
 * native HotkeyFeedback toast. Focus, not visibility — NVDA reads the live
 * region only in the foreground window. Both surfaces name the target and a
 * reason from a closed two-key set; the raw error stays in console/log only.
 */
async function reportSkipFailure(
  action: TransportAction,
  ctx: TransportContext,
  err: unknown,
): Promise<void> {
  const target = skipTarget(action, ctx);
  const name = target ? sourceName(target, $streams.get()) : "";
  const reason: tauri.TransportFailureReason =
    String(err) === "unsupported_codec" ? "unsupported" : "error";
  let focused = false;
  try {
    focused = await tauri.isWindowFocused();
  } catch {
    // Can't tell — the native toast works in either window state.
  }
  if (focused) {
    const reasonText =
      reason === "unsupported" ? m.stream_play_unsupported() : m.playback_error();
    addToast(name ? `${name}: ${reasonText}` : reasonText, "error");
  } else {
    await tauri.notifyTransportFailure(name, reason).catch(console.error);
  }
}

// Module-level guard shared by the player buttons and the global hotkey:
// only one transport command may be in flight at a time.
let pending = false;

/**
 * Resolve and execute a prev/next transport action against the current player
 * context. Reads the stores directly; safe to call from outside React.
 * No-op when nothing is playing or the boundary is reached — with failures now
 * speaking (below), that silence itself means "the boundary".
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
        // No toast here, and that's a decision: in the background the EAR
        // answers — the track audibly jumps to the start.
        announce(m.player_restarted(), "assertive");
        break;
      // "stop" cannot occur for prev/next (only auto-advance) — no-op.
    }
    // play-* announce "Playing: {name}" via App.tsx player-status.
  } catch (e) {
    console.error(e);
    await reportSkipFailure(action, ctx, e);
  } finally {
    pending = false;
  }
}
