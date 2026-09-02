import { useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { $settings } from "../../stores/settings";
import { useAutoSave } from "../../hooks/useAutoSave";
import { useAnnounce } from "../../hooks/useAnnounce";
import { KeyRecorder } from "./KeyRecorder";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import type { HotkeyMap } from "../../lib/tauri";
import { findReservedConflict } from "../../lib/reservedShortcuts";

const HOTKEY_FIELDS: { key: keyof HotkeyMap; label: () => string }[] = [
  { key: "toggleRecording", label: () => m.settings_hotkey_toggle_recording() },
  { key: "togglePlayback", label: () => m.settings_hotkey_toggle_playback() },
  { key: "volumeUp", label: () => m.settings_hotkey_volume_up() },
  { key: "volumeDown", label: () => m.settings_hotkey_volume_down() },
  { key: "toggleWindow", label: () => m.settings_hotkey_toggle_window() },
  { key: "stopAll", label: () => m.settings_hotkey_stop_all() },
  { key: "prevTrack", label: () => m.settings_hotkey_prev_track() },
  { key: "nextTrack", label: () => m.settings_hotkey_next_track() },
];

export function HotkeysTab() {
  const settings = useStore($settings);
  const announce = useAnnounce();
  const [registrationErrors, setRegistrationErrors] = useState<string[]>([]);

  // Combos the user touched since the last flush. The failure is announced only
  // for these: `registerHotkeys` reports everything currently failing, so
  // without the filter one permanently unavailable combo would shout again
  // after every unrelated edit.
  const touchedRef = useRef<string[]>([]);

  const save = useAutoSave(async () => {
    const current = $settings.get();
    if (!current) return;
    const touched = touchedRef.current;
    touchedRef.current = [];
    await tauri.saveSettings(current);
    const failed = await tauri.registerHotkeys();
    setRegistrationErrors(failed);
    // The block below is plain text, not role="alert": an alert stays silent
    // when the same combo fails twice in a row — nothing in the DOM changes,
    // so there is no insertion to report. The central channel announces every
    // time, including the repeat.
    const justFailed = failed.filter((combo) => touched.includes(combo));
    if (justFailed.length > 0) {
      announce(
        justFailed.map((combo) => m.settings_hotkey_registration_failed({ combo })).join(" "),
        "assertive",
      );
    }
  });

  if (!settings) return null;

  function updateHotkey(key: keyof HotkeyMap, combo: string) {
    const current = $settings.get();
    if (!current) return;
    $settings.set({
      ...current,
      hotkeys: { ...current.hotkeys, [key]: combo },
    });
    if (combo) touchedRef.current = [...touchedRef.current, combo];
    save();
    if (combo) {
      announce(m.settings_hotkey_changed({ combo }), "polite");
    } else {
      // Empty combo only comes from the clear (✕) button.
      announce(m.settings_hotkey_cleared(), "polite");
    }
  }

  async function resetToDefaults() {
    const defaults = await tauri.defaultHotkeys();
    const current = $settings.get();
    if (!current) return;
    $settings.set({ ...current, hotkeys: defaults });
    touchedRef.current = Object.values(defaults).filter(Boolean);
    save();
    announce(m.settings_hotkeys_reset_done(), "polite");
  }

  function validateHotkey(currentKey: keyof HotkeyMap) {
    return (combo: string): string | null => {
      if (!combo) return null;
      // Reserved webview combos win over the Tier-1 duplicate check: the user
      // cannot resolve them by reassigning, so report that first (KB-09).
      const reserved = findReservedConflict(combo);
      if (reserved) return m.settings_hotkey_reserved({ action: reserved() });
      const hotkeys = $settings.get()?.hotkeys;
      if (!hotkeys) return null;
      for (const field of HOTKEY_FIELDS) {
        if (field.key !== currentKey && hotkeys[field.key] === combo) {
          return m.settings_hotkey_duplicate({ action: field.label() });
        }
      }
      return null;
    };
  }

  return (
    <div className="space-y-4">
      {/* The rule the recorder enforces, said once for the eye. Plain text on
          purpose: the refusal inside each row carries it for the screen reader,
          and a describedby would repeat it on every one of the eight buttons. */}
      <p className="text-xs text-slate-500 forced-colors:text-[CanvasText]">
        {m.settings_hotkeys_recorder_hint()}
      </p>
      {HOTKEY_FIELDS.map(({ key, label }) => (
        <KeyRecorder
          key={key}
          label={label()}
          value={settings.hotkeys[key]}
          onChange={(combo) => updateHotkey(key, combo)}
          onValidate={validateHotkey(key)}
        />
      ))}

      <button
        type="button"
        onClick={resetToDefaults}
        className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
      >
        {m.settings_hotkeys_reset()}
      </button>

      {registrationErrors.length > 0 && (
        <div className="mt-4 rounded border border-red-700 bg-red-900/30 p-3">
          {registrationErrors.map((combo) => (
            <p key={combo} className="text-sm text-red-300 forced-colors:text-[CanvasText]">
              {m.settings_hotkey_registration_failed({ combo })}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
