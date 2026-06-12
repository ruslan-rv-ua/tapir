import { useCallback } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { useAnnounce } from "./useAnnounce";
import { loadSchedules } from "../stores/schedule";
import { missedReasonText } from "../lib/scheduleFormat";
import type {
  ScheduledCompletedPayload, ScheduledEventPayload, ScheduledMissedPayload,
} from "../lib/tauri";
import * as m from "../i18n/paraglide/messages";

/**
 * Глобальна підписка на події планувальника (§4, §5.5): кожна подія оновлює
 * store (panel рендерить свіжі lastResult/enabled/nextRun без власного рефетчу)
 * і озвучується assertive live region — і коли відкрито діалог
 * (data-live-announcer, див. LiveAnnouncer). StoppedByUser не озвучується:
 * ручну зупинку вже озвучує існуючий recording-флоу.
 */
export function useScheduleEvents(): void {
  const announce = useAnnounce();

  useTauriEvent<ScheduledEventPayload>("scheduled-started", useCallback((p) => {
    void loadSchedules();
    announce(m.scheduled_announce_started({ name: p.name }), "assertive");
  }, [announce]));

  useTauriEvent<ScheduledCompletedPayload>("scheduled-completed", useCallback((p) => {
    void loadSchedules();
    if (p.status !== "stoppedByUser") {
      announce(
        m.scheduled_announce_completed({ name: p.name, minutes: String(p.recordedMinutes) }),
        "assertive",
      );
    }
  }, [announce]));

  useTauriEvent<ScheduledMissedPayload>("scheduled-missed", useCallback((p) => {
    void loadSchedules();
    announce(
      m.scheduled_announce_missed({ name: p.name, reason: missedReasonText(p.reason) }),
      "assertive",
    );
  }, [announce]));

  useTauriEvent<ScheduledEventPayload>("scheduled-skipped", useCallback((p) => {
    void loadSchedules();
    announce(m.scheduled_announce_skipped({ name: p.name }), "assertive");
  }, [announce]));
}
