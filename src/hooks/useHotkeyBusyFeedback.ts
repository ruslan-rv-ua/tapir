import { useCallback } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { useAnnounce } from "./useAnnounce";
import { addToast } from "../stores/toasts";
import { $settings } from "../stores/settings";
import { actionLabelForCombo } from "../lib/hotkeyFields";
import * as m from "../i18n/paraglide/messages";

/**
 * Репліка при старті про нові зайняті комбінації
 * (hotkey-registration-silent-at-startup). Backend емітить `hotkeys-busy` після
 * ПЕРШОГО ПОКАЗУ вікна (`hotkey_busy::BusyNotice`), не у `frontend_ready`: старт
 * згорнутим інакше ковтає її. Одноразовість і пам'ять «уже повідомлено» — на боці
 * Rust; тут лише текст.
 *
 * По одній репліці на комбінацію, з назвою дії — людина має знати, ЩО не спрацює,
 * не заглядаючи в діалог. polite + `warning`: Tapir працює, не працює одна клавіша.
 * Комбінація без дії (налаштування змінились між реєстрацією і реплікою) мовчить:
 * казати «„…“ не спрацює» нема про що.
 */
export function useHotkeyBusyFeedback(): void {
  const announce = useAnnounce();

  useTauriEvent<string[]>(
    "hotkeys-busy",
    useCallback(
      (combos) => {
        // Порожньо лише до першого завантаження, а подія приходить після
        // frontend_ready, який App.tsx кличе вже після $settings.set — мовчання
        // тут означало б зламаний порядок старту, не звичайний стан.
        const hotkeys = $settings.get()?.hotkeys;
        if (!hotkeys) return;
        for (const combo of combos) {
          const action = actionLabelForCombo(hotkeys, combo);
          if (!action) continue;
          const msg = m.hotkey_busy_at_startup({ combo, action });
          announce(msg, "polite");
          addToast(msg, "warning");
        }
      },
      [announce],
    ),
  );
}
