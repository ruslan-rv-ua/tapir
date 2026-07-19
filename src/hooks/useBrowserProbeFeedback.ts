import { useCallback } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { useAnnounce } from "./useAnnounce";
import { addToast } from "../stores/toasts";
import * as m from "../i18n/paraglide/messages";
import type { BrowserProbeSummary } from "../lib/tauri";

/**
 * Озвучення фонової перевірки потоків, доданих зі Stream Browser. Той самий
 * патерн, що useAutostartFeedback: backend probe-ить після збереження і емітить
 * `browser-station-probe-result` ЛИШЕ коли є невдачі — успішний батч не
 * породжує події взагалі, тож NVDA не заливає потік «все гаразд» при масовому
 * додаванні. Одна невдача називає станцію, кілька — згортаються у підсумок.
 * Станції залишаються у профілі: probe тут — підказка, не вирок.
 */
export function useBrowserProbeFeedback(): void {
  const announce = useAnnounce();

  useTauriEvent<BrowserProbeSummary>(
    "browser-station-probe-result",
    useCallback(
      ({ checked, failed }) => {
        if (failed.length === 0) return; // backend shouldn't emit this, but stay quiet if it does
        const msg =
          failed.length === 1
            ? m.browser_probe_failed_one({ name: failed[0] })
            : m.browser_probe_failed_many({
                count: String(failed.length),
                checked: String(checked),
              });
        announce(msg, "polite");
        addToast(msg, "info");
      },
      [announce],
    ),
  );
}
