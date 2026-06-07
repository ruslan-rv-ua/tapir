/**
 * Fixed (non-configurable) webview key combos — Tier 2 + Tier 2′ in
 * docs/keyboard-shortcuts.md — that Settings → Hotkeys must refuse to assign.
 *
 * A Tier-1 OS hotkey is registered globally and intercepts its combo before it
 * reaches the App.tsx webview listener, so binding an OS hotkey to one of these
 * would silently shadow the webview action (e.g. the command palette). The
 * Hotkeys tab validates against this list and hard-blocks such a combo (KB-09).
 *
 * Strings are in the exact accelerator format KeyRecorder's `codeToToken`
 * produces: modifier order Ctrl→Shift→Alt→Super, tokens like "Up"/"F6", no
 * spaces. `label()` is deferred because paraglide messages read the active
 * locale at call time. Keep this list in sync with the registry.
 */
import * as m from "../i18n/paraglide/messages";

export const RESERVED_WEBVIEW_COMBOS: ReadonlyArray<{
  combo: string;
  label: () => string;
}> = [
  // Tier 2 — global webview toggles (App.tsx listener)
  { combo: "Ctrl+K", label: () => m.command_palette_label() },
  // Ctrl+, is currently unreachable via KeyRecorder (codeToToken("Comma") === null);
  // listed for intent + future-proofing if codeToToken later supports punctuation.
  { combo: "Ctrl+,", label: () => m.settings_title() },
  { combo: "Alt+1", label: () => m.streams_section() },
  { combo: "Alt+2", label: () => m.browser_section() },
  { combo: "Alt+3", label: () => m.wishlist_section() },
  { combo: "Alt+4", label: () => m.schedule_section() },
  { combo: "Alt+5", label: () => m.songs_section() },
  { combo: "Alt+0", label: () => m.profiles_section() },
  { combo: "Ctrl+N", label: () => m.add_stream() },
  // Tier 2′ — named navigation/control keys (own handlers, not in the listener)
  { combo: "F6", label: () => m.settings_hotkey_action_zone_nav() },
  { combo: "Shift+F6", label: () => m.settings_hotkey_action_zone_nav() },
  { combo: "Shift+F10", label: () => m.settings_hotkey_action_row_menu() },
];

/**
 * Returns the conflicting reserved entry's label getter, or null if `combo`
 * is free. Pure — exact string match against the canonical accelerator format.
 */
export function findReservedConflict(combo: string): (() => string) | null {
  const hit = RESERVED_WEBVIEW_COMBOS.find((r) => r.combo === combo);
  return hit ? hit.label : null;
}
