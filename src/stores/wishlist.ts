import { atom } from "nanostores";
import type { WishlistEntry } from "../lib/tauri";

export const $wishlist = atom<WishlistEntry[]>([]);
export const $ignorelist = atom<string[]>([]);
