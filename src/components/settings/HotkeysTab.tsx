import { useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { $settings } from "../../stores/settings";
import { useAutoSave } from "../../hooks/useAutoSave";
import { useAnnounce } from "../../hooks/useAnnounce";
import { KeyRecorder } from "./KeyRecorder";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import type { HotkeyMap } from "../../lib/tauri";
import { findReservedConflict } from "../../lib/reservedShortcuts";
import { HOTKEY_FIELDS } from "../../lib/hotkeyFields";

export function HotkeysTab() {
  const settings = useStore($settings);
  const announce = useAnnounce();
  // Зайняті комбінації — ті, що ОС не віддала Tapir (CONTEXT.md). «Яка призначена»
  // — налаштування, «чи працює зараз» — стан, який знає лише Rust; вкладка не
  // тримає своєї копії між монтуваннями.
  const [busyCombos, setBusyCombos] = useState<string[]>([]);

  // Кожне відкриття вкладки — «перевір ще раз»: Windows не повідомляє, коли
  // комбінацію звільнили, тож зниклий конфлікт видно лише повторній реєстрації.
  // Нічого не зберігає; позначка — носій стану, не подія, тож про вже відоме
  // вкладка мовчить. Нововиявлене — виняток: перше виявлення озвучується, де б
  // воно не сталося (Rust помічає його доставленим саме тому, що вкладка не
  // мовчить), тут ввічливо — вікно у фокусі, людина щойно відкрила вкладку.
  // Відмова IPC лишає рядки без позначки — і без відкинутого проміса.
  useEffect(() => {
    let cancelled = false;
    tauri
      .registerHotkeys()
      .then(({ busy, newlyBusy }) => {
        if (cancelled) return;
        setBusyCombos(busy);
        if (newlyBusy.length > 0) announce(failureText(newlyBusy), "polite");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [announce]);

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
    const { busy, newlyBusy } = await tauri.registerHotkeys();
    setBusyCombos(busy);
    // Щойно змінене — наполегливо, і повторно: та сама комбінація, що провалилась
    // удруге, звучить удруге (позначка в рядку не міняється, тож без каналу
    // оголошень повтор був би німим). Нововиявлене поза touched — ввічливо, як
    // при монтуванні: перше виявлення не мовчить ніде.
    const justFailed = busy.filter((combo) => touched.includes(combo));
    if (justFailed.length > 0) announce(failureText(justFailed), "assertive");
    const discovered = newlyBusy.filter((combo) => !touched.includes(combo));
    if (discovered.length > 0) announce(failureText(discovered), "polite");
  });

  if (!settings) return null;

  function failureText(combos: string[]): string {
    return combos.map((combo) => m.settings_hotkey_registration_failed({ combo })).join(" ");
  }

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
          busy={settings.hotkeys[key] !== "" && busyCombos.includes(settings.hotkeys[key])}
        />
      ))}

      <button
        type="button"
        onClick={resetToDefaults}
        className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
      >
        {m.settings_hotkeys_reset()}
      </button>
    </div>
  );
}
