# Phase 3F — Profile Manager Design

**Date:** 2026-06-01  
**Status:** Approved  
**Scope:** Full CRUD for profiles — create, rename, delete, duplicate, import/export, switch

> **Supersedes:** The Phase 3F stub in `docs/implementation-phases.md` references a
> `ProfileSwitcher.tsx` popover/placeholder. This spec replaces that with a modal dialog
> opened from the ActivityBar profile card. The `ProfileSwitcher` component is not needed.

---

## 1. Overview

Phase 3F adds a Profile Manager to Tapir. Profiles are independent data sets stored in
`data/profiles/{name}.tapirprofile`. Each profile contains its own streams, wishlist, ignorelist,
scheduled recordings, and recording settings.

The user manages profiles via a modal dialog opened from the profile card in ActivityBar.

---

## 2. Backend

### 2.1. New types in `profile.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMeta {
    pub name: String,
    pub stream_count: usize,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub profile_json: String, // raw parsed JSON — passwords stripped at save_imported time (server-side)
    pub suggested_name: String,
    pub stream_count: usize,
    pub has_conflict: bool,
}
```

> `ProfileMeta.path` is omitted — the frontend has no use for the filesystem path.

### 2.2. New methods on `Profile`

| Method | Behaviour |
|--------|-----------|
| `Profile::list(active: &str) -> Result<Vec<ProfileMeta>>` | Scan `data/profiles/*.tapirprofile`. Corrupt/unreadable files are logged and skipped (never fail the whole list). Return alphabetically sorted, "Default" always first. |
| `Profile::create(name: &str) -> Result<Self>` | Clone from `create_default()`, set `name`, call `save()`. |
| `Profile::rename(old: &str, new: &str) -> Result<()>` | Validate `new` name, rename file, update `name` field inside JSON. |
| `Profile::delete(name: &str) -> Result<()>` | Delete file. Err if `name == "Default"`. |
| `Profile::duplicate(src: &str, new_name: &str) -> Result<ProfileMeta>` | Load `src`, set `name = new_name`, save. |
| `Profile::export_json(name: &str) -> Result<String>` | Load profile, set all `stream.password = None`, serialize to pretty JSON. |
| `Profile::preview_import_json(json: &str) -> Result<ImportPreview>` | Parse JSON, detect name conflict, return preview without saving. Passwords are NOT stripped here — stripping happens at save time. Returns `RadioError::InvalidData` for unparseable content. |
| `Profile::save_imported(json: &str, name: &str) -> Result<ProfileMeta>` | Validate `name`, deserialize `json`, **strip all stream passwords** (`password = None`), override `profile.name = name`, save file. Password stripping is enforced server-side regardless of frontend input. |

**Name validation rules** (shared helper `validate_profile_name`):
- Not empty, ≤ 64 characters
- Characters: letters, digits, spaces, `-`, `_` only (no `\ / : * ? " < > |`)
- No leading or trailing spaces or dots (Windows silently trims them)
- Not a Windows reserved device name (case-insensitive): `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`
- Not equal to "Default" (for create/rename/import — "Default" is reserved)
- Not a duplicate of any existing profile name (case-insensitive)

### 2.3. New `RadioError` variants

```rust
Conflict(String),    // name already taken
Forbidden(String),   // operation not allowed (Default, active profile)
InvalidName(String), // validation failure
InvalidData(String), // corrupt/unparseable profile file
```

### 2.4. New `commands/profile_commands.rs`

| IPC command | Arguments | Returns | Notes |
|-------------|-----------|---------|-------|
| `list_profiles` | — | `Vec<ProfileMeta>` | |
| `switch_profile` | `name: String` | `Profile` (new active) | Stop all recordings, save old, load new, update settings + AppState, emit `profile-changed` event. No-op if `name == active`. |
| `create_profile` | `name: String` | `ProfileMeta` | |
| `rename_profile` | `oldName, newName: String` | `ProfileMeta` | Cannot rename "Default". Cannot rename the active profile. |
| `delete_profile` | `name: String` | `()` | Cannot delete Default. Cannot delete active profile. |
| `duplicate_profile` | `sourceName, newName: String` | `ProfileMeta` | |
| `export_profile` | `name: String` | `()` | Opens a `tauri-plugin-dialog` save dialog with suggested filename `{name}.tapirprofile`, writes stripped JSON. Silent no-op if user cancels. |
| `begin_import` | — | `Option<ImportPreview>` | Opens an open dialog (`*.tapirprofile`). Parses file, returns preview (`hasConflict` signals name clash). Does NOT save and does NOT strip passwords — passwords are stripped later by `save_imported`. Returns `None` (not an error) if user cancels dialog. Returns `Err(RadioError::InvalidData)` for corrupt/unparseable files. |
| `commit_import` | `profileJson: String, name: String` | `ProfileMeta` | Validates `name`, saves profile. Returns `RadioError::Conflict` if name still taken, `RadioError::InvalidName` for bad names. |

### 2.5. `switch_profile` logic

```
1. If name == active_profile → return Ok(current profile)
2. Record old_name = active_profile.name (for rollback reference)
3. Let handles = stream_manager.stop_all()
   // stop_all() MUST be enhanced to return Vec<JoinHandle<()>> so that recording
   // tasks can be joined. This prevents any task from writing to active_profile
  // after the swap (step 11). If the existing stop_all() is fire-and-forget,
   // Phase 3F must add stop_all_async() → Vec<JoinHandle<()>>.
4. player.stop_playback(app_handle).await
  // Use stop_playback (not stop_session_public) — it internally calls emit_player_status
  // which emits "player-status" AND calls tray::notify_state_changed. This keeps frontend
  // and tray in sync immediately after stop.
5. join_all(handles).await (timeout 2s)
  // Await all recording task handles. After this point, no recording task is
  // running — no concurrent writes to active_profile are possible.
6. Save current volume to old profile → profile.player_session.volume = player.current_volume()
7. Save active_recording_urls = [] to old profile → profile.save()
  // If save fails: log warning, continue (old profile data is still in AppState)
8. Load new profile: Profile::load(name)
  // If load fails: return Err immediately. AppState still holds old profile (data intact —
  // user can retry switch or restart). Frontend and tray are already consistent because
  // stop_playback in step 4 already emitted the stopped status.
9. Update GlobalSettings.active_profile = name → settings.save()
  // If settings.save() fails: return Err immediately. AppState still holds old profile (disk
  // and memory remain consistent). Frontend sees an error toast. User can retry.
  // NOTE: set_volume is intentionally deferred to step 10, AFTER save succeeds, to avoid
  // leaving the player at the new profile's volume when the switch is rolled back.
10. Apply new profile's player volume: player.set_volume(new_profile.player_session.volume, app_handle).await
   // If volume fails: log warning, continue (non-critical)
   // set_volume already emits "player-status" and notifies tray via the engine helper.
11. Update AppState.active_profile = new profile
   // Only update AppState AFTER settings.save() succeeds — this keeps disk and memory in sync.
12. Emit "profile-changed" event with payload `{ profile: <full Profile> }`
   // Payload shape matches data-models.md ProfileChangedPayload: `{ profile: Profile }`
13. Return new Profile
```

**Scheduler on switch:** The new profile's `scheduled_recordings` field is loaded into memory
as part of the `Profile` struct but no scheduler reload occurs — that is Phase 3D's responsibility.
Phase 3F does not interact with the scheduler subsystem.

**Frontend `profile-changed` event handler** — registered in `App.tsx` as a `useProfileSync` hook. On event received:

| Store | Update |
|-------|--------|
| `$profile` | Set to `{ name, recording, wishlist, ignorelist }` from `event.payload.profile` |
| `$streams` | Set to `event.payload.profile.streams` |
| `$settings` | Set `activeProfile` to `profile.name` (partial update) |
| `$statuses` | Reset all stream statuses to idle (recordings were stopped during switch) |
| `$playerStatus` | Not updated here — backend emits a separate `player-status` event after `set_volume`, which the existing listener handles |
| `$songs` | Call `loadSongs()` — songs come from the new profile's `outputDir`, so the list must be re-fetched |
| `$recordingSettings` | Call `get_recording_settings()` IPC and set store — the new profile has its own recording config (outputDir, name template, reconnect params) |

**Wishlist/Ignorelist refresh:** `WishlistPanel` and other panels that hold local copies of
wishlist/ignorelist data must re-fetch on `profile-changed`. Phase 3F adds a `profile-changed`
listener **in `App.tsx`** that calls `get_wishlist()` and `get_ignorelist()` and updates
whatever stores or re-render triggers those panels use. If wishlist/ignorelist are currently
stored as local component state, Phase 3F must lift them into Nanostores
(`$wishlist`, `$ignorelist`) and update `WishlistPanel` to read from those stores.
This is a prerequisite for correct multi-profile behaviour.

The hook uses `listen("profile-changed", (event) => handler(event.payload.profile))` and returns the unlisten function for cleanup. Payload type: `ProfileChangedPayload = { profile: Profile }` (matching `docs/data-models.md`).

### 2.6. Error transport

Tauri IPC serializes `Err(RadioError)` as a plain string via `Display`. The frontend receives
error strings and distinguishes error types by prefix:

| `RadioError` variant | Display string prefix | Frontend action |
|---------------------|----------------------|-----------------|
| `Conflict(msg)` | `"Conflict: …"` | Show inline error in name TextField |
| `Forbidden(msg)` | `"Forbidden: …"` | Show toast notification |
| `InvalidName(msg)` | `"InvalidName: …"` | Show inline error in name TextField |
| `InvalidData(msg)` | `"InvalidData: …"` | Show toast notification |

All profile command wrappers in `tauri.ts` catch thrown errors. Components using name input
(create/rename/duplicate/import-conflict) inspect the error string prefix and set an inline
`validationError` state on the TextField. All other errors are shown as toast notifications
via the existing toast/notification mechanism.

The new `RadioError` variants must implement `Display` with the matching prefix:
```rust
#[error("Conflict: {0}")]
Conflict(String),
#[error("Forbidden: {0}")]
Forbidden(String),
#[error("InvalidName: {0}")]
InvalidName(String),
#[error("InvalidData: {0}")]
InvalidData(String),
```

### 2.7. Register commands in `lib.rs`

Add all profile commands to `invoke_handler!` and add `pub mod profile_commands;` to `commands/mod.rs`.

---

## 3. Frontend

### 3.1. File structure

```
src/
  components/profile/
    ProfileManager.tsx      — modal dialog (React Aria Modal + Dialog)
    ProfileList.tsx         — RadioGroup list of profiles
    ProfileActions.tsx      — action buttons panel
  stores/
    profileManager.ts       — $profileManagerOpen, $profileList atoms
    wishlist.ts             — $wishlist, $ignorelist atoms (created or lifted here if not yet Nanostores)
  lib/
    tauri.ts                — append ProfileMeta, ImportPreview types + IPC wrappers
  i18n/messages/
    uk.json                 — ~15 new keys
    en.json                 — ~15 new keys
```

### 3.2. ActivityBar change

The passive profile card (`<div>`) becomes a `<Button>` (React Aria):
- `aria-label`: `{m.profile_manager_open()} — {settings?.activeProfile ?? "Default"}`
  (null guard required: `$settings` is `null` until async load completes on first render)
- `onPress`: `$profileManagerOpen.set(true)`

**Roving focus integration:** The new button must join the existing `useRovingFocus` group in
`ActivityBar.tsx`. Concretely:
- Add `profileRef = useRef<HTMLButtonElement>(null)` alongside the existing `settingsRef`
- Append `profileRef` to `allRefs` (currently `[ref0…ref4, settingsRef]` → becomes
  `[ref0…ref4, settingsRef, profileRef]`)
- Pass `profileRef` to the new `<Button ref={profileRef} excludeFromTabOrder={getTabIndex(6) === -1} …>`
- This makes the profile button reachable via arrow-key navigation and Tab exit, same as
  the Settings button above it.

### 3.3. ProfileManager layout

```
ProfileManager (Modal + Dialog)
  aria-label: m.profile_manager_title()

  Heading: "Управління профілями"

  ProfileList (RadioGroup)
    aria-label: m.profile_list_label()
    RadioButton × N  — value=name, label=name + streamCount hint
    Initial selection: active profile

  ProfileActions
    [Перемкнутися]  — disabled when selected == active
    [Перейменувати] — disabled when selected == "Default" || selected == active
    [Дублювати]
    [Видалити]      — disabled when selected == "Default" || selected == active
    [Експортувати]
    [Імпортувати]   — always enabled
    [Новий профіль]

  [×] close button  aria-label: m.close()
```

### 3.4. Inline dialogs (alert dialogs)

- **Rename / Create / Duplicate**: small alert dialog with `<TextField>` for the new name
  - Shows validation error inline if backend returns `RadioError::Conflict` or `RadioError::InvalidName`
- **Delete confirm**: "Видалити профіль '{name}'? Ця дія незворотна."
- **Switch confirm** (when active recordings): "Є активні записи. Зупинити їх і перейти до профілю '{name}'?"
- **Import**: After `begin_import` returns a preview, always show a confirmation dialog with an
  editable `<TextField>` pre-filled with `suggestedName`. The user can change the name before
  confirming. If the name is invalid or conflicted, show inline validation error — user must fix
  before confirming. This handles invalid/reserved names (`Default`, forbidden chars, duplicates)
  in one unified step without a separate conflict-only dialog.

These are rendered as `Modal + ModalOverlay + Dialog` components, with `<Dialog role="alertdialog">` — the same pattern as the existing `ConfirmDialog.tsx` component. There is no separate `AlertDialog` export in this codebase; `role="alertdialog"` is set on the `Dialog` element directly.

### 3.5. Stores

**New store** (`src/stores/profileManager.ts`):
```ts
export const $profileManagerOpen = atom<boolean>(false);
export const $profileList = atom<ProfileMeta[]>([]);
```

`ProfileManager` fetches `list_profiles` when `isOpen` becomes true and after every mutating operation.

**Existing stores updated by `useProfileSync` hook on `profile-changed` event:**
- `$profile` (`src/stores/profile.ts`) — `ProfileState` with `name`, `recording`, `wishlist`, `ignorelist`
- `$streams` — set from `profile.streams`
- `$wishlist` — set from `get_wishlist()` IPC call (or from `profile.wishlist` if already a Nanostore); **Phase 3F must ensure this is a Nanostore** so panels re-render on profile switch
- `$ignorelist` — same as `$wishlist` above
- `$settings` — `activeProfile` field updated (partial merge)

### 3.6. `tauri.ts` additions

```ts
export interface ProfileMeta {
  name: string;
  streamCount: number;
  isActive: boolean;
}

export interface ImportPreview {
  profileJson: string;
  suggestedName: string;
  streamCount: number;
  hasConflict: boolean;
}

export async function listProfiles(): Promise<ProfileMeta[]>
export async function switchProfile(name: string): Promise<Profile>
export async function createProfile(name: string): Promise<ProfileMeta>
export async function renameProfile(oldName: string, newName: string): Promise<ProfileMeta>
export async function deleteProfile(name: string): Promise<void>
export async function duplicateProfile(sourceName: string, newName: string): Promise<ProfileMeta>
export async function exportProfile(name: string): Promise<void>
export async function beginImport(): Promise<ImportPreview | null>  // null = user cancelled
export async function commitImport(profileJson: string, name: string): Promise<ProfileMeta>
```

The `Profile` type mirrors the Rust struct (all fields of `profile.rs`).

### 3.7. i18n keys (uk + en)

| Key | Ukrainian | English |
|-----|-----------|---------|
| `profile_manager_title` | Управління профілями | Profile Manager |
| `profile_manager_open` | Управління профілями | Manage profiles |
| `profile_list_label` | Профілі | Profiles |
| `profile_switch` | Перемкнутися | Switch |
| `profile_create` | Новий профіль | New profile |
| `profile_rename` | Перейменувати | Rename |
| `profile_delete` | Видалити | Delete |
| `profile_duplicate` | Дублювати | Duplicate |
| `profile_export` | Експортувати | Export |
| `profile_import` | Імпортувати | Import |
| `profile_new_name_label` | Нова назва | New name |
| `profile_close` | Закрити | Close |
| `profile_delete_confirm` | Видалити профіль "{name}"? Ця дія незворотна. | Delete profile "{name}"? This cannot be undone. |
| `profile_switch_confirm` | Є активні записи. Зупинити їх і перейти до "{name}"? | Active recordings exist. Stop them and switch to "{name}"? |
| `profile_conflict_error` | Профіль із такою назвою вже існує | A profile with this name already exists |
| `profile_invalid_name_error` | Недопустима назва профілю | Invalid profile name |
| `profile_stream_count_hint` | {count} потоків | {count} streams |
| `profile_active_badge` | активний | active |

---

## 4. Accessibility

- `ProfileList` uses `RadioGroup` + `Radio` from React Aria — NVDA reads each profile as a radio button with state.
- Action buttons are standard `Button` components — no dropdowns.
- **ProfileManager itself** uses `Modal + Dialog` (ARIA `role="dialog"`) — the same pattern as `SettingsDialog`.
- **Sub-dialogs** (rename, create, delete confirm, switch confirm, import confirm) use `Modal + ModalOverlay + Dialog` with `<Dialog role="alertdialog">` — the same pattern as `ConfirmDialog.tsx`. There is no `AlertDialog` export; `role="alertdialog"` is set directly on the `Dialog` element. NVDA announces these as alerts.
- The profile card button in ActivityBar has a descriptive `aria-label` including the active profile name.
- No drag-and-drop, no visual-only indicators.

**Live announcements** (`aria-live="polite"` region in ProfileManager):
- After create: "Профіль '{name}' створено"
- After rename: "Профіль перейменовано на '{name}'"
- After delete: "Профіль '{name}' видалено"
- After switch: "Активний профіль: '{name}'"
- After import: "Профіль '{name}' імпортовано"
- On error (toast): error message is announced

**Focus behaviour after operations:**

| Operation | Focus after |
|-----------|-------------|
| Create / Duplicate / Import | Newly created profile in the RadioGroup list |
| Rename | Same profile (now with new name) |
| Delete | "Default" profile (always present) |
| Switch | Dialog stays open; selected radio stays on the (now-active) profile |

**Dialog close behaviour:**
- `×` button and Escape close ProfileManager.
- Successful Switch does NOT auto-close (user may want further operations).
- Successful Create / Rename / Delete / Import / Export does NOT auto-close.

---

## 5. Criteria for Done

- [ ] `list_profiles` returns all `.tapirprofile` files in `data/profiles/`
- [ ] Create new profile (validates name, saves)
- [ ] Rename profile (not Default, not active)
- [ ] Delete profile (not Default, not active, confirm dialog)
- [ ] Duplicate profile
- [ ] Export profile (passwords stripped, save dialog)
- [ ] Import profile: begin_import opens dialog, returns preview; commit_import saves with final name; conflict prompts rename
- [ ] Corrupt .tapirprofile files in list are skipped with log warning (no crash)
- [ ] Switch profile — stops recordings, saves old, loads new, emits event
- [ ] Switch with active recordings — confirm dialog shown
- [ ] ProfileManager opens from ActivityBar profile button
- [ ] ProfileManager lists profiles, shows active
- [ ] ActivityBar profile card shows current profile name after switch
- [ ] All operations accessible via NVDA
- [ ] `profile-changed` event updates `$profile`, `$streams`, `$wishlist`, `$ignorelist`, `$settings.activeProfile`
- [ ] Switch also stops active playback (stream + file)

---

## 6. Out of Scope for Phase 3F

- Per-profile audio device (Phase 3I)
- Profile-level hotkeys
- Cloud sync / backup
- Profile password lock
- **Scheduler reload on profile switch** — `scheduled_recordings` in the new profile is stored in memory but the scheduler subsystem (Phase 3D) is not activated. Phase 3D will implement scheduler reload on switch.
