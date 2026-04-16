import { atom } from "nanostores";
import type { GlobalSettings, RecordingSettings } from "../lib/tauri";

export const $settings = atom<GlobalSettings | null>(null);
export const $settingsDialogOpen = atom(false);
export const $recordingSettings = atom<RecordingSettings | null>(null);
