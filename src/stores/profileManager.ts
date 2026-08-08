import { atom } from "nanostores";
import type { ProfileMeta } from "../lib/tauri";

export const $profileList = atom<ProfileMeta[]>([]);

/** Multi-select state for the profiles list (milestone D). Keyed by profile name. */
export const $profilesSelection = atom<Set<string>>(new Set());

/** Signal: global Ctrl+N (profiles) wants the create-profile dialog opened. */
export const $showCreateProfileDialog = atom<boolean>(false);

/**
 * Signal: focus must land back in the profiles list. Bumped when the
 * profile-settings dialog is force-closed (its target was deleted or renamed) —
 * the dialog lives at `App` level, the list does not, so the request travels
 * through the store. A counter, not a boolean: two force-closes in a row must
 * each move focus.
 */
export const $focusProfileList = atom<number>(0);
