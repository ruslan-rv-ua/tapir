import * as m from "../i18n/paraglide/messages";
import type { HotkeyMap } from "./tauri";

/**
 * The eight global hotkeys (CONTEXT.md «Гаряча клавіша»), in the order the
 * Hotkeys tab lists them. Shared by the tab and by the startup notice about a
 * busy combo, so both name an action the same way.
 */
export const HOTKEY_FIELDS: { key: keyof HotkeyMap; label: () => string }[] = [
  { key: "toggleRecording", label: () => m.settings_hotkey_toggle_recording() },
  { key: "togglePlayback", label: () => m.settings_hotkey_toggle_playback() },
  { key: "volumeUp", label: () => m.settings_hotkey_volume_up() },
  { key: "volumeDown", label: () => m.settings_hotkey_volume_down() },
  { key: "toggleWindow", label: () => m.settings_hotkey_toggle_window() },
  { key: "stopAll", label: () => m.settings_hotkey_stop_all() },
  { key: "prevTrack", label: () => m.settings_hotkey_prev_track() },
  { key: "nextTrack", label: () => m.settings_hotkey_next_track() },
];

/** Label of the action the combo is assigned to; null when it is assigned to none. */
export function actionLabelForCombo(hotkeys: HotkeyMap, combo: string): string | null {
  const field = HOTKEY_FIELDS.find((f) => hotkeys[f.key] === combo);
  return field ? field.label() : null;
}
