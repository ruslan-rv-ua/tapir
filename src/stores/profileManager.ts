import { atom } from "nanostores";
import type { ProfileMeta } from "../lib/tauri";

export const $profileManagerOpen = atom<boolean>(false);
export const $profileList = atom<ProfileMeta[]>([]);
