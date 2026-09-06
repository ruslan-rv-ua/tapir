import { atom, computed } from "nanostores";
import type { GlobalSettings, ProfileSettings } from "../lib/tauri";

export const $settings = atom<GlobalSettings | null>(null);

/**
 * Whose data is on screen. Split out of $settings so a screen that only needs
 * to know the profile is not re-rendered by every unrelated setting — the
 * streams list reads it as one of the criteria that define its result set.
 */
export const $activeProfile = computed($settings, (s) => s?.activeProfile ?? null);
export const $settingsDialogOpen = atom(false);

/**
 * Редагований зріз **активного** профілю. Наповнюється на старті (`App.tsx`), а
 * не при відкритті діалогу: звідси читають `StatusBar` (поріг диску) і
 * `stores/streams` (сортування), тож `null` до першого відкриття діалогу дав би
 * перший кадр на дефолтах і смикання.
 */
export const $profileSettings = atom<ProfileSettings | null>(null);

/**
 * Ім'я профілю, чий діалог налаштувань відкрито (`null` — закрито). Дзеркало
 * `$settingsDialogOpen`, але зі значенням: діалог монтується на рівні `App`,
 * інакше `Ctrl+Shift+,` працював би лише на екрані профілів.
 */
export const $profileSettingsTarget = atom<string | null>(null);
