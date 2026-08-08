import { atom } from "nanostores";
import type { GlobalSettings, ProfileSettings } from "../lib/tauri";

export const $settings = atom<GlobalSettings | null>(null);
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
