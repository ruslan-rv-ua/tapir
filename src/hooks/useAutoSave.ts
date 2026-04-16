import { useRef, useCallback, useEffect } from "react";
import { addToast } from "../stores/toasts";
import * as m from "../i18n/paraglide/messages";

/**
 * Debounced auto-save hook. Calls `saveFn` after `delay`ms of inactivity.
 * Returns a trigger function that resets the debounce timer.
 * On unmount, flushes any pending save so the last edit is not lost.
 */
export function useAutoSave(saveFn: () => Promise<void>, delay = 300) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  const handleError = useCallback((err: unknown) => {
    console.error("Auto-save failed:", err);
    addToast(m.settings_save_error(), "error");
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        saveFnRef.current().catch(handleError);
      }
    };
  }, [handleError]);

  const trigger = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveFnRef.current().catch(handleError);
    }, delay);
  }, [delay, handleError]);

  return trigger;
}
