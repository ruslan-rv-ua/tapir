import { useEffect } from "react";
import { isSuppressedAccelerator, keepsNativeContextMenu } from "../lib/webviewAccelerators";

/**
 * Neutralises the WebView2 browser accelerators the app does not want: the
 * reload family (`F5`, `Ctrl+F5`, `Shift+F5`, `Ctrl+R`, `Ctrl+Shift+R`, `Cmd+R`),
 * `F3`/`F7`/`F11`, and the native context menu outside text fields — the menu's
 * Reload item being a second door into the same trap.
 *
 * `preventDefault()` ONLY, never `stopPropagation()` — unlike the neighbouring
 * `useGlobalShortcuts`, which does both. This guard kills a default, it does not
 * claim a key: the event must still reach the app (`F5` becomes "copy to
 * profile" in streams-transfer-hotkeys) and the KeyRecorder (which must still be
 * able to record `F5`/`F3`/`F7`/`F11` as an OS hotkey). Suppressing the default
 * is free: nothing in `src/` reads `defaultPrevented`.
 *
 * CAPTURE phase on `window`, like `useGlobalShortcuts` — react-aria controls
 * swallow keydown while bubbling. Capture is safe here precisely because nothing
 * is stopped: downstream handlers still get the event, already defused.
 *
 * Two deliberate differences from the Tier-2 dispatcher:
 *   - `e.repeat` is NOT dropped. Tier 2 drops it so a held toggle does not
 *     flicker; here every repeat carries its own reload default, so letting one
 *     through would reload the webview on a held `F5`.
 *   - no `isInModal()` gate: a reload from an open dialog is just as destructive.
 *
 * No dev/prod branch either — the behaviour is identical in `pnpm dev`, in
 * vitest and in a release build, so a regression cannot hide until the manual
 * NVDA run. Debug devtools are opened from Rust instead (src-tauri/src/lib.rs).
 */
export function useWebviewGuard(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isSuppressedAccelerator(e)) e.preventDefault();
    };
    const onContextMenu = (e: MouseEvent) => {
      if (!keepsNativeContextMenu(e.target)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("contextmenu", onContextMenu, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("contextmenu", onContextMenu, { capture: true });
    };
  }, []);
}
