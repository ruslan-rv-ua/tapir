import { atom } from "nanostores";

export interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

export const $toasts = atom<Toast[]>([]);

export function addToast(message: string, type: Toast["type"] = "info"): void {
  const id = `${Date.now()}-${Math.random()}`;
  $toasts.set([...$toasts.get(), { id, message, type }]);
  setTimeout(() => removeToast(id), 4000);
}

export function removeToast(id: string): void {
  $toasts.set($toasts.get().filter((t) => t.id !== id));
}
