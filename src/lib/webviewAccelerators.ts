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
 * Letter keys that are accelerators only under `Ctrl`/`Cmd` — a bare R or F is
 * just a letter. `alt` is excluded for both: AltGr reports ctrl+alt, and
 * AltGr+letter is a character on several European layouts.
 *
 * `KeyF` opens WebView2's find bar, and the app claims `Ctrl+F` for itself
 * (Tier 2 — focus the current screen's search field). The Tier-2 dispatcher
 * alone would not be enough: it bails out first thing on `isInModal()`, so from
 * any open dialog the key would reach WebView2 and open the find bar. This guard
 * has no such gate — same division of labour as `F5`.
 */
const SUPPRESSED_WITH_CTRL = new Set(["KeyR", "KeyF"]);

/**
 * True for a keystroke whose browser default must be suppressed: the reload
 * family (`F5` any-modifier, `Ctrl`/`Cmd`+`R`) plus `F3` (find next), `F7`
 * (caret browsing — flips NVDA's input mode), `F11` (fullscreen — hides the
 * window frame NVDA tracks) and `Ctrl`/`Cmd`+`F` (find bar).
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
  if (SUPPRESSED_WITH_CTRL.has(e.code)) return (e.ctrlKey || e.metaKey) && !e.altKey;
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
