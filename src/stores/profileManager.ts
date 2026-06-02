import { atom } from "nanostores";
import type { ProfileMeta } from "../lib/tauri";

export const $profileList = atom<ProfileMeta[]>([]);
