import { atom } from "nanostores";

export interface AnnouncerMessage {
  message: string;
  priority: "polite" | "assertive";
}

export const $announcer = atom<AnnouncerMessage | null>(null);

/**
 * Близнюк `addToast()`: модульна функція, а не хук, щоб код у `src/lib/` міг
 * говорити в live region, не смикаючи `.set()` руками. `useAnnounce` — обгортка
 * над нею.
 */
export function announce(
  message: string,
  priority: "polite" | "assertive" = "polite",
): void {
  $announcer.set({ message, priority });
}
