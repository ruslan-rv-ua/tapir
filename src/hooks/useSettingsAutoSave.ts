import { useAutoSave } from "./useAutoSave";
import { useAnnounce } from "./useAnnounce";
import { $settings } from "../stores/settings";
import * as tauri from "../lib/tauri";
import * as m from "../i18n/paraglide/messages";

/**
 * Debounced save of the global settings — announced, like the profile dialog's.
 *
 * The settings dialog has no visual feedback either: «Зміни зберігаються
 * автоматично» is a static line, not a confirmation, so without the
 * announcement a screen reader user has no way to tell whether a change reached
 * the disk. Same promise `ProfileSettingsDialog` makes, same wording shape —
 * with «програми» in it, because which settings were saved is the one thing the
 * two messages must not blur (ADR 2026-08-08, global/profile boundary).
 *
 * `HotkeysTab` deliberately keeps its own save: it re-registers the hotkeys
 * afterwards and already speaks per change («Гарячу клавішу змінено: …»), so a
 * generic "saved" on top would only crowd it.
 */
export function useSettingsAutoSave() {
  const announce = useAnnounce();
  return useAutoSave(async () => {
    const current = $settings.get();
    if (!current) return;
    await tauri.saveSettings(current);
    announce(m.settings_saved(), "polite");
  });
}
