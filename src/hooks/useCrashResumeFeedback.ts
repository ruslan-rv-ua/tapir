import { useCallback } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { useAnnounce } from "./useAnnounce";
import { addToast } from "../stores/toasts";
import * as m from "../i18n/paraglide/messages";
import { getLocale } from "../i18n/paraglide/runtime";
import type { CrashResumeSummary } from "../lib/tauri";

/**
 * Озвучення тихого авто-resume після аварійного завершення (Phase 3K). Той
 * самий патерн, що useAutostartFeedback: backend емітить `crash-resume` лише
 * ПІСЛЯ підписки webview (deferred у frontend_ready), фронт локалізує через
 * Paraglide і озвучує polite + info-toast (data-live-announcer — працює і в
 * модалці). Порожній снапшот → події немає взагалі → тиша.
 */
export function useCrashResumeFeedback(): void {
  const announce = useAnnounce();

  useTauriEvent<CrashResumeSummary>(
    "crash-resume",
    useCallback(
      ({ resumed, total }) => {
        let msg: string;
        if (resumed === total) {
          // Форму множини диктує та сама локаль, що обирає ТЕКСТ, — getLocale().
          // Атрибут <html lang> тут не годиться: index.html віддає "en", а App
          // перезаписує його аж після резолву getSettings(), тобто вже після
          // першого рендеру цього хука. Правила будуємо в обробнику, бо мову
          // міняють без перезавантаження (GeneralTab: setLocale(…, { reload: false })).
          const form = new Intl.PluralRules(getLocale()).select(resumed);
          msg =
            form === "one" ? m.crash_resume_all_one({ count: String(resumed) }) :
            form === "few" ? m.crash_resume_all_few({ count: String(resumed) }) :
            m.crash_resume_all_many({ count: String(resumed) });
        } else {
          msg = m.crash_resume_partial({
            resumed: String(resumed),
            total: String(total),
          });
        }
        announce(msg, "polite");
        addToast(msg, "info");
      },
      [announce],
    ),
  );
}
