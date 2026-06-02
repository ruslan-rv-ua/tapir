import { atom } from "nanostores";

export type Section = "streams" | "browser" | "wishlist" | "schedule" | "songs" | "profiles";

export const $activeSection = atom<Section>("streams");
export const $commandPaletteOpen = atom<boolean>(false);
