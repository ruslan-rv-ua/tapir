# Phase 3F — Profile Manager Design

**Date:** 2026-06-01  
**Status:** Approved  
**Scope:** Full CRUD for profiles — create, rename, delete, duplicate, import/export, switch

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
    pub profile_json: String, // stripped of passwords, not yet saved
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
| `Profile::preview_import_json(json: &str) -> Result<ImportPreview>` | Parse JSON, strip passwords, detect name conflict, return preview without saving. Returns `RadioError::InvalidData` for unparseable content. |
| `Profile::save_imported(json: &str, name: &str) -> Result<ProfileMeta>` | Validate `name`, deserialize `json`, override `profile.name = name`, save file. |

**Name validation rules** (shared helper `validate_profile_name`):
- Not empty, ≤ 64 characters
- Characters: letters, digits, spaces, `-`, `_` only (no `\ / : * ? " < > |`)
- Not equal to "Default" (for create/rename/import)
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
| `rename_profile` | `oldName, newName: String` | `ProfileMeta` | Cannot rename Default. Cannot rename the active profile (must switch away first). |
| `delete_profile` | `name: String` | `()` | Cannot delete Default. Cannot delete active profile. |
| `duplicate_profile` | `sourceName, newName: String` | `ProfileMeta` | |
| `export_profile` | `name: String` | `()` | Opens a `tauri-plugin-dialog` save dialog with suggested filename `{name}.tapirprofile`, writes stripped JSON. Silent no-op if user cancels. |
| `begin_import` | — | `ImportPreview` | Opens an open dialog (`*.tapirprofile`). Parses file, strips passwords, returns preview (json + name + streamCount + hasConflict). Does NOT save. Returns `RadioError::InvalidData` for corrupt/unparseable files. Silent no-op (returns `None`) if user cancels dialog. |
| `commit_import` | `profileJson: String, name: String` | `ProfileMeta` | Validates `name`, saves profile. Returns `RadioError::Conflict` if name still taken, `RadioError::InvalidName` for bad names. |

### 2.5. `switch_profile` logic

```
1. If name == active_profile → return Ok(current profile)
2. stream_manager.stop_all()
3. Wait ~500ms for in-flight I/O (same pattern as graceful_shutdown)
4. Save current volume to old profile → profile.player_session.volume = player.current_volume()
5. Save active_recording_urls = [] to old profile → profile.save()
6. Load new profile: Profile::load(name)?
7. Apply new profile's player volume: player.set_volume(new_profile.player_session.volume)
8. Update AppState.active_profile = new profile
9. Update GlobalSettings.active_profile = name → settings.save()
10. Emit "profile-changed" event with full Profile payload
11. Return new Profile
```

**Frontend `profile-changed` event handler** (registered in `App.tsx` or `useProfileSync` hook):
- Update `$profile` store (name, recording, wishlist, ignorelist)
- Re-fetch `$streams` from `profile.streams`
- Re-fetch `$wishlist` from `profile.wishlist`
- Re-fetch `$ignorelist` from `profile.ignorelist`
- Update `$settings.activeProfile` to match new profile name
- Update player volume display (via existing `$playerStatus` or direct volume update)

### 2.6. Register commands in `lib.rs`

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
  lib/
    tauri.ts                — append ProfileMeta type + IPC wrappers
  i18n/messages/
    uk.json                 — ~15 new keys
    en.json                 — ~15 new keys
```

### 3.2. ActivityBar change

The passive profile card (`<div>`) becomes a `<Button>` (React Aria):
- `aria-label`: `{m.profile_manager_open()} — {settings.activeProfile}`
- `onPress`: `$profileManagerOpen.set(true)`

### 3.3. ProfileManager layout

```
ProfileManager (Modal + Dialog)
  aria-label: m.profile_manager_title()

  Heading: "Управління профілями"

  ProfileList (RadioGroup)
    aria-label: m.profile_list_label()
    RadioButton × N  — value=name, label=name + streamCount hint

  ProfileActions
    [Перемкнутися]  — disabled when selected == active
    [Перейменувати] — disabled when selected == "Default"
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
- **Import conflict**: "Профіль '{name}' вже існує. Введіть нову назву:" (TextField)

These are rendered as React Aria `AlertDialog` components.

### 3.5. Store

```ts
// src/stores/profileManager.ts
export const $profileManagerOpen = atom<boolean>(false);
export const $profileList = atom<ProfileMeta[]>([]);
```

`ProfileManager` fetches `list_profiles` when `isOpen` becomes true and after every mutating operation.

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
- All dialogs use `AlertDialog` (React Aria) — NVDA announces them as alerts.
- The profile card button in ActivityBar has a descriptive `aria-label` including the active profile name.
- No drag-and-drop, no visual-only indicators.

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
- [ ] `profile-changed` event updates frontend state ($profile / $settings store)

---

## 6. Out of Scope for Phase 3F

- Per-profile audio device (Phase 3I)
- Profile-level hotkeys
- Cloud sync / backup
- Profile password lock
