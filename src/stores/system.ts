import { atom } from "nanostores";

/** Free bytes on the recording volume. null = unavailable/unknown. */
export const $freeSpace = atom<number | null>(null);
