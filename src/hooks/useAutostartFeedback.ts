import { useCallback } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { useAnnounce } from "./useAnnounce";
import { addToast } from "../stores/toasts";
import * as m from "../i18n/paraglide/messages";

/**
 * Озвучення тихої деактивації автозапуску при старті (EXE переміщено). Той самий
 * патерн, що useCliFeedback: backend емітить порожню подію `autostart-deactivated`
 * лише ПІСЛЯ підписки webview (deferred у frontend_ready), фронт локалізує через
 * Paraglide й озвучує polite + info-toast. Працює і в модалці (data-live-announcer).
 */
export function useAutostartFeedback(): void {
  const announce = useAnnounce();

  useTauriEvent<void>(
    "autostart-deactivated",
    useCallback(() => {
      const msg = m.autostart_deactivated_moved();
      announce(msg, "polite");
      addToast(msg, "info");
    }, [announce]),
  );
}
