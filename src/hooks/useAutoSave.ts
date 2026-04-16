import { useRef, useCallback, useEffect } from "react";

/**
 * Debounced auto-save hook. Calls `saveFn` after `delay`ms of inactivity.
 * Returns a trigger function that resets the debounce timer.
 * On unmount, flushes any pending save so the last edit is not lost.
 */
export function useAutoSave(saveFn: () => Promise<void>, delay = 300) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        saveFnRef.current().catch((err) => console.error("Auto-save failed:", err));
      }
    };
  }, []);

  const trigger = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveFnRef.current().catch((err) => console.error("Auto-save failed:", err));
    }, delay);
  }, [delay]);

  return trigger;
}
