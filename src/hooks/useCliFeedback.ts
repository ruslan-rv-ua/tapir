import { useCallback } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { useAnnounce } from "./useAnnounce";
import { addToast } from "../stores/toasts";
import type { CliFeedbackPayload } from "../lib/tauri";
import * as m from "../i18n/paraglide/messages";

/**
 * Озвучення CLI-зворотного зв'язку (§5, рішення №6 — без мовчазних збоїв).
 * Той самий патерн, що useScheduleEvents: backend шле структурний ключ, фронт
 * локалізує через Paraglide й озвучує. *Added/Removed — polite + success-toast;
 * ActionFailed — assertive + error-toast; not-found / invalid-* / invalid-args —
 * assertive; ignored-flag — polite. Працює і в модалці (data-live-announcer).
 */
export function useCliFeedback(): void {
  const announce = useAnnounce();

  useTauriEvent<CliFeedbackPayload>(
    "cli-feedback",
    useCallback(
      (p) => {
        switch (p.kind) {
          case "wishlist-added": {
            const msg = m.cli_wishlist_added({ pattern: p.pattern });
            announce(msg, "polite");
            addToast(msg, "success");
            break;
          }
          case "wishlist-removed": {
            const msg = m.cli_wishlist_removed({ pattern: p.pattern });
            announce(msg, "polite");
            addToast(msg, "success");
            break;
          }
          case "stream-not-found":
            announce(m.cli_stream_not_found({ needle: p.needle }), "assertive");
            break;
          case "invalid-url":
            announce(m.cli_invalid_url({ needle: p.needle }), "assertive");
            break;
          case "flag-ignored-forwarded":
            announce(m.cli_flag_ignored({ flag: p.flag }), "polite");
            break;
          case "action-failed": {
            const msg = m.cli_action_failed({ action: p.action });
            announce(msg, "assertive");
            addToast(msg, "error");
            break;
          }
          case "invalid-args":
            announce(m.cli_invalid_args(), "assertive");
            break;
        }
      },
      [announce],
    ),
  );
}
