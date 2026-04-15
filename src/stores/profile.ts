import { atom } from "nanostores";
import type { RecordingSettings, WishlistEntry } from "../lib/tauri";

export interface ProfileState {
  name: string;
  recording: RecordingSettings;
  wishlist: WishlistEntry[];
  ignorelist: string[];
}

export const $profile = atom<ProfileState | null>(null);
