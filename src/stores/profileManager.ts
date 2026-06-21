import { atom } from "nanostores";
import type { ProfileMeta } from "../lib/tauri";

export const $profileList = atom<ProfileMeta[]>([]);

/** Multi-select state for the profiles list (milestone D). Keyed by profile name. */
export const $profilesSelection = atom<Set<string>>(new Set());

/** Signal: global Ctrl+N (profiles) wants the create-profile dialog opened. */
export const $showCreateProfileDialog = atom<boolean>(false);
