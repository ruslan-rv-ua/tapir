import { useCallback } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { useAnnounce } from "./useAnnounce";
import { addToast } from "../stores/toasts";
import * as m from "../i18n/paraglide/messages";
import { plural } from "../lib/plural";
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
          // Форму обирає `plural` — з тієї самої локалі, що й текст, і на кожному
          // виклику, тож мемоїзувати тут нічого (чому саме так — src/lib/plural.ts).
          msg = plural(resumed, {
            one: () => m.crash_resume_all_one({ count: String(resumed) }),
            few: () => m.crash_resume_all_few({ count: String(resumed) }),
            many: () => m.crash_resume_all_many({ count: String(resumed) }),
          });
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
