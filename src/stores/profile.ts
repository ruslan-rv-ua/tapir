import { atom } from "nanostores";
import type { RecordingSettings } from "../lib/tauri";

export interface ProfileState {
  name: string;
  recording: RecordingSettings;
}

export const $profile = atom<ProfileState | null>(null);
