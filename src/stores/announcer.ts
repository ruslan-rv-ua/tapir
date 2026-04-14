import { atom } from "nanostores";

export interface AnnouncerMessage {
  message: string;
  priority: "polite" | "assertive";
}

export const $announcer = atom<AnnouncerMessage | null>(null);
