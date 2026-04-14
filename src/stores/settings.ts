import { atom } from "nanostores";
import type { GlobalSettings } from "../lib/tauri";

export const $settings = atom<GlobalSettings | null>(null);
