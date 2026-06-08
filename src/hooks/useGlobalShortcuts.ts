import { useEffect } from "react";
import { matchShortcut, type ShortcutActions } from "../lib/shortcuts";
import { isInModal } from "../lib/shortcutGuard";
import { $activeSection, $commandPaletteOpen, $shortcutsHelpOpen } from "../stores/navigation";
import { $settingsDialogOpen } from "../stores/settings";
import { $showAddStreamDialog } from "../stores/streams";

/**
 * Global Tier-2 webview shortcuts (Alt+digit, Ctrl+K, Ctrl+,, Ctrl+N, F1),
 * dispatched through the pure `matchShortcut` registry.
 *
 * CAPTURE phase, not bubble: react-aria controls (notably the Browser
 * `SearchField`) swallow keydown in the bubble phase, so a bubble-phase window
 * listener misses shortcuts while such a field is focused. Capturing at the
 * window — the same approach `useZoneNavigation` uses for `F6` — lets the global
 * combo win first; a matched hit then `stopPropagation()`s so the focused
 * control does not also act on the key.
 *
 * Suppressed only while a modal/recorder is open (`isInModal`); every combo here
 * is modified or `F1`, so none collide with text entry — they deliberately fire
 * from a focused text field too (KB-14). Key auto-repeat is dropped (KB-06).
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const actions: ShortcutActions = {
      setSection: (s) => $activeSection.set(s),
      toggleCommandPalette: () => $commandPaletteOpen.set(!$commandPaletteOpen.get()),
      toggleSettings: () => $settingsDialogOpen.set(!$settingsDialogOpen.get()),
      openAddStream: () => $showAddStreamDialog.set(true),
      openHelp: () => $shortcutsHelpOpen.set(true),
    };
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isInModal()) return;
      const ctx = { activeSection: $activeSection.get() };
      const hit = matchShortcut(e, ctx);
      if (hit) {
        e.preventDefault();
        e.stopPropagation();
        hit.run?.(actions, ctx);
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, []);
}
