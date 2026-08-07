/**
 * Pure predicates for the WebView2 accelerator guard (see useWebviewGuard.ts).
 *
 * WebView2 ships a full set of browser accelerators the app knows nothing about;
 * the reload family (`F5` and friends) silently re-mounts the whole UI — focus,
 * list position, F6 zone state and open dialogs all vanish with no announcement,
 * which for a screen-reader user is the worst class of bug. These predicates say
 * *what* to neutralise; the hook does the neutralising.
 *
 * Same "pure module + hook" split as `lib/shortcuts.ts` ↔ `hooks/useGlobalShortcuts.ts`.
 */

import { isTextEntryTarget } from "./shortcutGuard";

/**
 * Function keys whose WebView2 default is unwanted, matched with NO regard for
 * modifiers: every `F5` variant is a reload, and naming them one by one would
 * leave a hole on the one nobody guessed (`Ctrl+Shift+F5`). The price is zero —
 * `preventDefault()` on a combo without a default does nothing, and nothing in
 * `src/` reads `defaultPrevented`.
 *
 * `F4` is deliberately absent: `Alt+F4` closes the window and is a system key,
 * not a browser accelerator. `F12` is dead in a Tauri release build.
 */
const SUPPRESSED_CODES = new Set(["F3", "F5", "F7", "F11"]);

/**
 * True for a keystroke whose browser default must be suppressed: the reload
 * family (`F5` any-modifier, `Ctrl`/`Cmd`+`R`) plus `F3` (find next), `F7`
 * (caret browsing — flips NVDA's input mode) and `F11` (fullscreen — hides the
 * window frame NVDA tracks).
 *
 * Matching is on `e.code` per convention 1 of docs/keyboard-shortcuts.md: on a
 * Cyrillic layout `e.key` for the physical R is «к».
 *
 * Zoom (`Ctrl+Plus`/`Minus`/`0`) is intentionally NOT here, so enabling zoom
 * later (webview-zoom-hotkeys) needs no change to this guard.
 */
export function isSuppressedAccelerator(
  e: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey">,
): boolean {
  if (SUPPRESSED_CODES.has(e.code)) return true;
  // `KeyR` is the one entry where the modifier is what makes the key an
  // accelerator — a bare R is just a letter. `alt` excluded: AltGr reports
  // ctrl+alt, and AltGr+R is a character on several layouts.
  if (e.code === "KeyR") return (e.ctrlKey || e.metaKey) && !e.altKey;
  return false;
}

/**
 * True when the native context menu is worth keeping — i.e. the event target is
 * a text-entry field (or sits inside one), where the menu offers a real Paste.
 * Everywhere else WebView2's menu only offers browser items, Reload included.
 *
 * Walks up from the event target rather than reading `document.activeElement`:
 * inside a `contenteditable` the target is a nested node, and a right-click does
 * not necessarily move focus. Every step delegates to the existing
 * `isTextEntryTarget` allowlist — no second dictionary of editable types.
 */
export function keepsNativeContextMenu(target: EventTarget | null): boolean {
  for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
    if (isTextEntryTarget(el)) return true;
  }
  return false;
}
