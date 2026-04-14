import { atom } from "nanostores";

export type Section = "streams" | "browser" | "wishlist" | "schedule" | "songs";

export const $activeSection = atom<Section>("streams");
