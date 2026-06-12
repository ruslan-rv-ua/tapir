import { atom } from "nanostores";
import * as tauri from "../lib/tauri";
import type { ScheduleDto } from "../lib/tauri";

/** Розклади активного профілю (ScheduleDto = ScheduledRecording + nextRun). */
export const $schedules = atom<ScheduleDto[]>([]);
export const $schedulesLoading = atom(false);
export const $schedulesError = atom<string | null>(null);

let loadSeq = 0;

/**
 * Рефетч списку (відкриття панелі, події scheduled-*, CRUD).
 * loading вмикається лише для першого завантаження (store порожній):
 * рефетч по події не повинен демонтувати CompositeList — це втрата фокуса
 * посеред навігації. Конкурентні виклики впорядковує loadSeq.
 */
export async function loadSchedules(): Promise<void> {
  const seq = ++loadSeq;
  if ($schedules.get().length === 0) $schedulesLoading.set(true);
  try {
    const list = await tauri.getSchedules();
    if (seq !== loadSeq) return;
    $schedules.set(list);
    $schedulesError.set(null);
  } catch (e) {
    if (seq !== loadSeq) return;
    $schedulesError.set(String(e));
  } finally {
    if (seq === loadSeq) $schedulesLoading.set(false);
  }
}
