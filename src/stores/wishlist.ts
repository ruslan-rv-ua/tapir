import { atom } from "nanostores";
import type { WishlistEntry } from "../lib/tauri";

export const $wishlist = atom<WishlistEntry[]>([]);
export const $ignorelist = atom<string[]>([]);

/** Shared multi-select for whichever PatternList tab is mounted (milestone D). */
export const $patternSelection = atom<Set<string>>(new Set());
