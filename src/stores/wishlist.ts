import { atom } from "nanostores";
import type { WishlistEntry, WishlistMatch } from "../lib/tauri";

export const $wishlist = atom<WishlistEntry[]>([]);
export const $ignorelist = atom<string[]>([]);

/**
 * Журнал збігів — дзеркало кільцевого буфера в Rust (`AppState.match_log`).
 * Сіється командою на монтуванні App і далі росте з події `wishlist-match`;
 * очищається на переключенні профілю разом із рештою профільного стану
 * (useProfileSync). На диск ніщо з цього не йде — журнал сесійний
 * (ADR 2026-08-31 «Носії для подій станції» §6).
 */
export const $wishlistMatches = atom<WishlistMatch[]>([]);

/** Та сама стеля, що в `match_log::MATCH_LOG_CAPACITY`. */
export const MATCH_LOG_CAPACITY = 200;

/**
 * Покласти збіг у дзеркало так само, як його поклав буфер у Rust: найновіший
 * зверху, найстаріший за стелею витісняється. Без цього дзеркало розійшлося б
 * із джерелом рівно після двохсотого збігу за сеанс.
 */
export function prependMatch(current: WishlistMatch[], entry: WishlistMatch): WishlistMatch[] {
  return [entry, ...current].slice(0, MATCH_LOG_CAPACITY);
}

/** Shared multi-select for whichever PatternList tab is mounted (milestone D). */
export const $patternSelection = atom<Set<string>>(new Set());

/** Signal: global Ctrl+N (wishlist) wants the add-pattern dialog opened. */
export const $showAddPatternDialog = atom<boolean>(false);
