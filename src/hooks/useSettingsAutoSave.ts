import { useAutoSave } from "./useAutoSave";
import { $settings } from "../stores/settings";
import * as tauri from "../lib/tauri";

/**
 * Debounced save of the global settings — silent.
 *
 * It used to announce «Налаштування програми збережено», and that announcement
 * had no visible carrier: the dialog shows the checkbox, never the write. ADR
 * 2026-08-31 §5 resolves such a fact the other way — drop it. The result of
 * "cleared a checkbox" is the checkbox, and it is on screen; "reached the disk"
 * is internal machinery the app promised to handle itself. The change cannot be
 * lost even by closing the dialog (`useAutoSave` flushes on unmount) and a
 * failure still shouts through a toast.
 *
 * `HotkeysTab` keeps its own save for a different reason: it re-registers the
 * hotkeys afterwards and speaks about the change itself («Гарячу клавішу
 * змінено: …»), not about the write.
 */
export function useSettingsAutoSave() {
  return useAutoSave(async () => {
    const current = $settings.get();
    if (!current) return;
    await tauri.saveSettings(current);
  });
}
