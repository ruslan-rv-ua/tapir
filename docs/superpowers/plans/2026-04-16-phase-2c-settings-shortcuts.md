# Phase 2C — SettingsDialog + Shortcuts + Window State — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a modal SettingsDialog with 5 tabs (General, Recording, Reconnection, Hotkeys, Audio), global shortcuts via `tauri-plugin-global-shortcut`, and window state persistence via `tauri-plugin-window-state`.

**Architecture:** Backend-first. New `shortcuts` module handles global hotkey registration. Four new IPC commands: `get_recording_settings`, `save_recording_settings`, `register_hotkeys`, `open_directory_picker`. Frontend adds SettingsDialog as a modal overlay with React Aria Tabs, auto-save via debounced IPC, and KeyRecorder for hotkey editing. All UI fully NVDA-accessible.

**Tech Stack:** Rust (Tauri v2), React 19, React Aria Components, Nanostores, Paraglide.js (i18n), Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-04-16-phase-2c-settings-shortcuts-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src-tauri/src/shortcuts.rs` | Global shortcut registration/unregistration via `tauri-plugin-global-shortcut` |
| `src/components/settings/SettingsDialog.tsx` | Modal dialog shell with React Aria Tabs |
| `src/components/settings/GeneralTab.tsx` | Language, theme, tray (disabled), notifications (disabled), track in title, double-click action, disk threshold |
| `src/components/settings/RecordingTab.tsx` | Output dir (with Browse), file name templates, stream file options, min track duration, auto-correct |
| `src/components/settings/ReconnectionTab.tsx` | Max retries, interval, backoff multiplier, max interval |
| `src/components/settings/HotkeysTab.tsx` | List of KeyRecorder components for each hotkey |
| `src/components/settings/AudioTab.tsx` | Output device select + refresh |
| `src/components/settings/KeyRecorder.tsx` | Captures keyboard shortcut combo, validates duplicates |
| `src/hooks/useAutoSave.ts` | Debounced auto-save hook (300ms) |

### Modified Files

| File | Changes |
|------|---------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-global-shortcut`, `tauri-plugin-window-state` |
| `src-tauri/capabilities/default.json` | Add `global-shortcut:default`, `window-state:default` permissions |
| `src-tauri/src/lib.rs` | Register plugins, register new commands, call `register_global_shortcuts` in setup |
| `src-tauri/src/commands/mod.rs` | (no changes needed — settings_commands already declared) |
| `src-tauri/src/commands/settings_commands.rs` | Add `save_recording_settings`, `register_hotkeys`, `open_directory_picker` |
| `src/lib/tauri.ts` | Sync `GlobalSettings` interface, add `HotkeyMap`, `RecordingSettings`, `ReconnectConfig` types, add IPC wrappers |
| `src/stores/settings.ts` | Add `$settingsDialogOpen`, `$recordingSettings` atoms |
| `src/components/layout/ActivityBar.tsx` | Enable Settings button |
| `src/App.tsx` | Add Ctrl+, handler, render `<SettingsDialog>`, apply theme on load |
| `src/i18n/messages/uk.json` | Add ~45 new keys |
| `src/i18n/messages/en.json` | Add ~45 new keys |

---

## Chunk 1: Backend Infrastructure

### Task 1: Add Tauri Plugins to Cargo.toml

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add plugin dependencies**

Add after existing plugin lines (line 22):

```toml
tauri-plugin-global-shortcut = "2"
tauri-plugin-window-state = "2"
```

- [ ] **Step 2: Run cargo check**

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: compiles successfully (plugins downloaded, no errors).

- [ ] **Step 3: Commit**

```powershell
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(phase-2c): add global-shortcut and window-state plugins"
```

---

### Task 2: Add Capabilities and Register Plugins

**Files:**
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add permissions to capabilities**

In `src-tauri/capabilities/default.json`, add to the `permissions` array:

```json
"global-shortcut:default",
"window-state:default"
```

- [ ] **Step 2: Register plugins in lib.rs**

In `src-tauri/src/lib.rs`, add plugin registrations after `.plugin(tauri_plugin_dialog::init())`:

```rust
.plugin(tauri_plugin_global_shortcut::Builder::new().build())
.plugin(tauri_plugin_window_state::Builder::new().build())
```

Add to the top of `lib.rs` (if not auto-imported):

```rust
mod shortcuts;
```

- [ ] **Step 3: Run cargo check**

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: compiles (shortcuts module will be created next, so comment out `mod shortcuts` if needed, or create empty file first).

- [ ] **Step 4: Commit**

```powershell
git add src-tauri/capabilities/default.json src-tauri/src/lib.rs
git commit -m "feat(phase-2c): register global-shortcut and window-state plugins"
```

---

### Task 3: Create shortcuts.rs Module

**Files:**
- Create: `src-tauri/src/shortcuts.rs`

- [ ] **Step 1: Create the shortcuts module**

```rust
use crate::app_state::AppState;
use crate::player::engine::PlaybackState;
use crate::settings::HotkeyMap;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tracing::{info, warn};

/// Register all global shortcuts from the given HotkeyMap.
/// Returns a list of shortcut combos that failed to register.
pub fn register_global_shortcuts(app: &AppHandle, hotkeys: &HotkeyMap) -> Vec<String> {
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();

    let mut failed: Vec<String> = Vec::new();

    let combos = [
        (&hotkeys.toggle_recording, "toggle_recording"),
        (&hotkeys.toggle_playback, "toggle_playback"),
        (&hotkeys.volume_up, "volume_up"),
        (&hotkeys.volume_down, "volume_down"),
        (&hotkeys.toggle_window, "toggle_window"),
    ];

    for (combo, action) in &combos {
        if combo.is_empty() {
            continue;
        }
            let action_name = action.to_string();
        let result = manager.on_shortcut(combo.as_str(), move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                handle_shortcut_action(app, &action_name);
            }
        });
        match result {
            Ok(_) => info!("Registered global shortcut: {} → {}", combo, action),
            Err(e) => {
                warn!("Failed to register shortcut {} for {}: {}", combo, action, e);
                failed.push(combo.to_string());
            }
        }
    }

    failed
}

fn handle_shortcut_action(app: &AppHandle, action: &str) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        match action {
            "toggle_recording" => {
                // Phase 2C: no-op if no stream selected
                // Would need selected stream info from frontend — skip for now
                info!("Global shortcut: toggle_recording (no selected stream context)");
            }
            "toggle_playback" => {
                let status = state.player.get_status().await;
                match status.state {
                    PlaybackState::Playing => { let _ = state.player.pause_playback(&app).await; }
                    PlaybackState::Paused => { let _ = state.player.resume_playback(&app).await; }
                    _ => { info!("Global shortcut: toggle_playback — nothing playing"); }
                }
            }
            "volume_up" => {
                let status = state.player.get_status().await;
                let new_vol = (status.volume + 0.05).min(1.0);
                let _ = state.player.set_volume(new_vol, &app).await;
            }
            "volume_down" => {
                let status = state.player.get_status().await;
                let new_vol = (status.volume - 0.05).max(0.0);
                let _ = state.player.set_volume(new_vol, &app).await;
            }
            "toggle_window" => {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
            _ => warn!("Unknown shortcut action: {}", action),
        }
    });
}
```

**Note:** `toggle_recording` requires knowing which stream is selected — this is frontend state. For Phase 2C, the hotkey is registered but acts as no-op without frontend coordination. A future enhancement can bridge this via a Tauri event from frontend to tell the backend the selected stream. Alternatively, implement it to toggle the first recording stream or all streams. **Check with the user** if this needs a different approach, or proceed with no-op + TODO.

- [ ] **Step 2: Verify the shortcuts module compiles**

The code uses the verified PlayerEngine API:
- `state.player.get_status().await` → returns `PlayerStatus { state: PlaybackState, volume: f32, ... }`
- `state.player.pause_playback(&app).await` → `Result<()>`
- `state.player.resume_playback(&app).await` → `Result<()>`
- `state.player.set_volume(f32, &app).await` → `Result<()>`
- `PlaybackState` is an enum: `Stopped | Playing | Paused` (match, not string comparison)

All methods require `&AppHandle` as second parameter (except `get_status`).

- [ ] **Step 3: Run cargo check**

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

Fix any compilation errors (method names, types).

- [ ] **Step 4: Commit**

```powershell
git add src-tauri/src/shortcuts.rs src-tauri/src/lib.rs
git commit -m "feat(phase-2c): add shortcuts module with global hotkey registration"
```

---

### Task 4: Add New IPC Commands

**Files:**
- Modify: `src-tauri/src/commands/settings_commands.rs`
- Modify: `src-tauri/src/lib.rs` (register new commands)

- [ ] **Step 1: Add save_recording_settings and get_recording_settings commands**

Append to `settings_commands.rs`:

```rust
use crate::profile::RecordingSettings;
use crate::shortcuts;

#[tauri::command]
pub async fn get_recording_settings(
    state: tauri::State<'_, AppState>,
) -> Result<RecordingSettings, String> {
    let profile = state.active_profile.read().await;
    Ok(profile.recording.clone())
}

#[tauri::command]
pub async fn save_recording_settings(
    recording: RecordingSettings,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut profile = state.active_profile.write().await;
    profile.recording = recording;
    let snapshot = profile.clone();
    drop(profile);
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Add register_hotkeys command**

Append to `settings_commands.rs`:

```rust
#[tauri::command]
pub async fn register_hotkeys(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let settings = state.settings.read().await;
    let hotkeys = settings.hotkeys.clone();
    drop(settings);
    let failed = shortcuts::register_global_shortcuts(&app, &hotkeys);
    Ok(failed)
}
```

- [ ] **Step 3: Add open_directory_picker command**

Append to `settings_commands.rs`:

```rust
#[tauri::command]
pub async fn open_directory_picker(
    app: tauri::AppHandle,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let mut builder = app.dialog().file();
    if let Some(path) = default_path {
        builder = builder.set_directory(&path);
    }
    let result = builder.blocking_pick_folder();
    Ok(result.map(|p| p.to_string()))
}
```

- [ ] **Step 4: Register commands in lib.rs**

Add the four new commands to the `generate_handler!` macro in `lib.rs`:

```rust
commands::settings_commands::get_recording_settings,
commands::settings_commands::save_recording_settings,
commands::settings_commands::register_hotkeys,
commands::settings_commands::open_directory_picker,
```

- [ ] **Step 5: Register shortcuts at startup**

In `lib.rs`, inside `.setup(|app| { ... })`, after `app.manage(state);`, add:

```rust
let state_ref = app.state::<AppState>();
let settings = tauri::async_runtime::block_on(state_ref.settings.read());
let failed = shortcuts::register_global_shortcuts(app.handle(), &settings.hotkeys);
if !failed.is_empty() {
    tracing::warn!("Failed to register shortcuts: {:?}", failed);
}
drop(settings);
```

- [ ] **Step 6: Run cargo check**

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

Fix any compilation errors. Pay attention to:
- `Profile` must have `pub recording: RecordingSettings` field (it does)
- `Profile::save()` must exist (it does)
- `DialogExt` import for file dialog
- `blocking_pick_folder()` API — may differ, check `tauri-plugin-dialog` v2 docs

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/src/commands/settings_commands.rs src-tauri/src/lib.rs
git commit -m "feat(phase-2c): add IPC commands for recording settings, hotkeys, directory picker"
```

---

## Chunk 2: Frontend Foundation

### Task 5: Sync TypeScript Types

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Update GlobalSettings interface**

Replace the existing `GlobalSettings` interface with the complete version matching Rust:

```typescript
export interface HotkeyMap {
  toggleRecording: string;
  togglePlayback: string;
  volumeUp: string;
  volumeDown: string;
  toggleWindow: string;
}

export interface GlobalSettings {
  language: string;
  theme: "auto" | "dark" | "light";
  activeProfile: string;
  outputDevice: string | null;
  minimizeToTray: boolean;
  showTrayNotifications: boolean;
  showTrackInTitle: boolean;
  diskSpaceThresholdGb: number;
  doubleClickAction: "record" | "play";
  bandwidthLimitKbps: number;
  autostart: boolean;
  hotkeys: HotkeyMap;
  logRotation: boolean;
  logMaxSizeMb: number;
}
```

Remove `windowWidth`, `windowHeight`, `windowMaximized` if they exist.

- [ ] **Step 2: Verify RecordingSettings and ReconnectConfig types**

These types already exist in `tauri.ts` (~lines 40-58). Verify they match the Rust structs. If they already match, no changes needed. If not, update them to:

```typescript
export interface ReconnectConfig {
  maxRetries: number;
  retryIntervalSecs: number;
  backoffMultiplier: number;
  maxIntervalSecs: number;
}

export interface RecordingSettings {
  outputDir: string;
  fileNameTemplate: string;
  incompleteFileNameTemplate: string;
  streamFileNameTemplate: string;
  saveStreamFile: boolean;
  deleteStreamFileOnStop: boolean;
  skipFirstIncompleteTrack: boolean;
  skipShortTracksMs: number;
  autoCorrectCase: boolean;
  reconnect: ReconnectConfig;
}
```

- [ ] **Step 3: Add IPC wrapper functions**

```typescript
export async function getRecordingSettings(): Promise<RecordingSettings> {
  return invoke("get_recording_settings");
}

export async function saveRecordingSettings(recording: RecordingSettings): Promise<void> {
  return invoke("save_recording_settings", { recording });
}

export async function registerHotkeys(): Promise<string[]> {
  return invoke("register_hotkeys");
}

export async function openDirectoryPicker(defaultPath?: string): Promise<string | null> {
  return invoke("open_directory_picker", { defaultPath: defaultPath ?? null });
}
```

- [ ] **Step 4: Verify no TS errors**

Check that existing code that uses `GlobalSettings` (like `App.tsx`, `stores/settings.ts`) still compiles. The new fields are additive except for removed `windowWidth/windowHeight/windowMaximized`. Search for usages of removed fields and remove them:

```powershell
cd C:\dev\Tapir && npx tsc --noEmit 2>&1 | Select-Object -First 30
```

Fix any TypeScript errors.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/tauri.ts
git commit -m "feat(phase-2c): sync TypeScript types with Rust (GlobalSettings, RecordingSettings, HotkeyMap)"
```

---

### Task 6: Add i18n Keys

**Files:**
- Modify: `src/i18n/messages/uk.json`
- Modify: `src/i18n/messages/en.json`

- [ ] **Step 1: Add Ukrainian keys**

Add these keys to `uk.json` (maintain alphabetical order if the file uses it, otherwise append before the closing `}`):

```json
"settings_title": "Налаштування",
"settings_close": "Закрити налаштування",
"settings_tab_general": "Загальні",
"settings_tab_recording": "Запис",
"settings_tab_reconnection": "Перепідключення",
"settings_tab_hotkeys": "Гарячі клавіші",
"settings_tab_audio": "Аудіо",

"settings_language": "Мова",
"settings_theme": "Тема",
"settings_theme_auto": "Автоматична",
"settings_theme_dark": "Темна",
"settings_theme_light": "Світла",
"settings_minimize_to_tray": "Згортати до tray замість закриття",
"settings_show_tray_notifications": "Сповіщення при зміні треку",
"settings_disabled_tray": "Доступно після реалізації System Tray",
"settings_show_track_in_title": "Показувати назву треку в заголовку вікна",
"settings_double_click_action": "Дія при подвійному кліку на потоці",
"settings_double_click_record": "Запис",
"settings_double_click_play": "Відтворення",
"settings_disk_threshold": "Поріг диску (ГБ)",
"settings_disk_threshold_desc": "Зупинити запис при низькому місці на диску. 0 = вимкнено",

"settings_output_dir": "Папка для записів",
"settings_output_dir_browse": "Огляд",
"settings_file_template": "Шаблон імені треку",
"settings_incomplete_template": "Шаблон неповного файлу",
"settings_stream_template": "Шаблон файлу потоку",
"settings_template_help": "Плейсхолдери: %s = станція, %a = виконавець, %t = трек, %d = дата, %time = час",
"settings_save_stream_file": "Зберігати файл потоку",
"settings_delete_stream_on_stop": "Видаляти файл потоку після зупинки",
"settings_skip_first_incomplete": "Пропускати перший неповний трек",
"settings_min_track_duration": "Мінімальна тривалість треку (сек)",
"settings_auto_correct_case": "Автокорекція регістру",

"settings_max_retries": "Максимум спроб перепідключення",
"settings_max_retries_desc": "0 = необмежено",
"settings_retry_interval": "Інтервал між спробами (сек)",
"settings_backoff_multiplier": "Множник backoff",
"settings_max_interval": "Максимальний інтервал (сек)",

"settings_hotkey_toggle_recording": "Запис (toggle)",
"settings_hotkey_toggle_playback": "Відтворення (toggle)",
"settings_hotkey_volume_up": "Гучність +",
"settings_hotkey_volume_down": "Гучність −",
"settings_hotkey_toggle_window": "Показати/сховати вікно",
"settings_hotkey_press_to_change": "Натисніть щоб змінити",
"settings_hotkey_press_keys": "Натисніть клавіші...",
"settings_hotkey_clear": "Очистити хоткей",
"settings_hotkey_duplicate": "Цю комбінацію вже використано для: {action}",
"settings_hotkey_changed": "Хоткей змінено: {combo}",
"settings_hotkey_registration_failed": "Не вдалося зареєструвати хоткей {combo}",

"settings_output_device": "Пристрій виведення",
"settings_output_device_default": "Системний за замовчуванням",
"settings_output_device_refresh": "Оновити список пристроїв",

"settings_save_error": "Помилка збереження налаштувань"
```

- [ ] **Step 2: Add English keys**

Add corresponding keys to `en.json`:

```json
"settings_title": "Settings",
"settings_close": "Close settings",
"settings_tab_general": "General",
"settings_tab_recording": "Recording",
"settings_tab_reconnection": "Reconnection",
"settings_tab_hotkeys": "Hotkeys",
"settings_tab_audio": "Audio",

"settings_language": "Language",
"settings_theme": "Theme",
"settings_theme_auto": "Automatic",
"settings_theme_dark": "Dark",
"settings_theme_light": "Light",
"settings_minimize_to_tray": "Minimize to tray instead of closing",
"settings_show_tray_notifications": "Notifications on track change",
"settings_disabled_tray": "Available after System Tray implementation",
"settings_show_track_in_title": "Show track name in window title",
"settings_double_click_action": "Action on double-click on stream",
"settings_double_click_record": "Record",
"settings_double_click_play": "Play",
"settings_disk_threshold": "Disk threshold (GB)",
"settings_disk_threshold_desc": "Stop recording when disk space is low. 0 = disabled",

"settings_output_dir": "Recording folder",
"settings_output_dir_browse": "Browse",
"settings_file_template": "Track file name template",
"settings_incomplete_template": "Incomplete file template",
"settings_stream_template": "Stream file template",
"settings_template_help": "Placeholders: %s = station, %a = artist, %t = track, %d = date, %time = time",
"settings_save_stream_file": "Save stream file",
"settings_delete_stream_on_stop": "Delete stream file on stop",
"settings_skip_first_incomplete": "Skip first incomplete track",
"settings_min_track_duration": "Minimum track duration (sec)",
"settings_auto_correct_case": "Auto-correct case",

"settings_max_retries": "Max reconnection attempts",
"settings_max_retries_desc": "0 = unlimited",
"settings_retry_interval": "Retry interval (sec)",
"settings_backoff_multiplier": "Backoff multiplier",
"settings_max_interval": "Max interval (sec)",

"settings_hotkey_toggle_recording": "Recording (toggle)",
"settings_hotkey_toggle_playback": "Playback (toggle)",
"settings_hotkey_volume_up": "Volume up",
"settings_hotkey_volume_down": "Volume down",
"settings_hotkey_toggle_window": "Show/hide window",
"settings_hotkey_press_to_change": "Press to change",
"settings_hotkey_press_keys": "Press keys...",
"settings_hotkey_clear": "Clear hotkey",
"settings_hotkey_duplicate": "This combination is already used for: {action}",
"settings_hotkey_changed": "Hotkey changed: {combo}",
"settings_hotkey_registration_failed": "Failed to register hotkey {combo}",

"settings_output_device": "Output device",
"settings_output_device_default": "System default",
"settings_output_device_refresh": "Refresh device list",

"settings_save_error": "Error saving settings"
```

- [ ] **Step 3: Run Paraglide compile**

```powershell
cd C:\dev\Tapir && npx @inlang/paraglide-js compile --project ./project.inlang
```

Verify the compile succeeds and generates typed message functions.

- [ ] **Step 4: Commit**

```powershell
git add src/i18n/
git commit -m "feat(phase-2c): add i18n keys for SettingsDialog (uk + en)"
```

---

### Task 7: Create Stores and useAutoSave Hook

**Files:**
- Modify: `src/stores/settings.ts`
- Create: `src/hooks/useAutoSave.ts`

- [ ] **Step 1: Extend settings store**

The file `src/stores/settings.ts` already exists with a `$settings` atom. Add the new atoms alongside it. The final file should contain:

```typescript
import { atom } from "nanostores";
import type { GlobalSettings, RecordingSettings } from "../lib/tauri";

export const $settings = atom<GlobalSettings | null>(null);
export const $settingsDialogOpen = atom(false);
export const $recordingSettings = atom<RecordingSettings | null>(null);
```

**Note:** `$settings` already exists — just add the import for `RecordingSettings` and the two new atoms.

- [ ] **Step 2: Create useAutoSave hook**

Create `src/hooks/useAutoSave.ts`:

```typescript
import { useRef, useCallback } from "react";

/**
 * Debounced auto-save hook. Calls `saveFn` after `delay`ms of inactivity.
 * Returns a trigger function that resets the debounce timer.
 */
export function useAutoSave(saveFn: () => Promise<void>, delay = 300) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  const trigger = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveFnRef.current().catch((err) => console.error("Auto-save failed:", err));
    }, delay);
  }, [delay]);

  return trigger;
}
```

- [ ] **Step 3: Verify TS compiles**

```powershell
cd C:\dev\Tapir && npx tsc --noEmit 2>&1 | Select-Object -First 20
```

- [ ] **Step 4: Commit**

```powershell
git add src/stores/settings.ts src/hooks/useAutoSave.ts
git commit -m "feat(phase-2c): add settings stores and useAutoSave hook"
```

---

## Chunk 3: SettingsDialog Shell and Tabs (General, Recording, Reconnection)

### Task 8: Create SettingsDialog Shell

**Files:**
- Create: `src/components/settings/SettingsDialog.tsx`

- [ ] **Step 1: Create the dialog with Tabs**

```tsx
import { useEffect, useState } from "react";
import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $settings, $settingsDialogOpen, $recordingSettings } from "../../stores/settings";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import { GeneralTab } from "./GeneralTab";
import { RecordingTab } from "./RecordingTab";
import { ReconnectionTab } from "./ReconnectionTab";
import { HotkeysTab } from "./HotkeysTab";
import { AudioTab } from "./AudioTab";

export function SettingsDialog() {
  const isOpen = useStore($settingsDialogOpen);
  const settings = useStore($settings);
  const recordingSettings = useStore($recordingSettings);

  useEffect(() => {
    if (isOpen) {
      tauri.getRecordingSettings().then((rec) => {
        $recordingSettings.set(rec);
      });
    }
  }, [isOpen]);

  if (!isOpen || !settings) return null;

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) $settingsDialogOpen.set(false); }}
      isDismissable
    >
      <Modal className="flex h-[80vh] w-[90vw] max-w-3xl flex-col rounded-lg bg-slate-800 shadow-2xl outline-none">
        <Dialog aria-label={m.settings_title()} className="flex h-full flex-col outline-none">
          <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
            <Heading slot="title" className="text-lg font-semibold text-slate-100">
              {m.settings_title()}
            </Heading>
            <button
              onClick={() => $settingsDialogOpen.set(false)}
              aria-label={m.settings_close()}
              className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            >
              ✕
            </button>
          </div>
          <Tabs className="flex flex-1 flex-col overflow-hidden">
            <TabList aria-label={m.settings_title()} className="flex gap-1 border-b border-slate-700 px-6">
              <Tab id="general" className="cursor-pointer border-b-2 border-transparent px-3 py-2 text-sm text-slate-400 outline-none hover:text-slate-200 selected:border-blue-400 selected:text-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400">
                {m.settings_tab_general()}
              </Tab>
              <Tab id="recording" className="cursor-pointer border-b-2 border-transparent px-3 py-2 text-sm text-slate-400 outline-none hover:text-slate-200 selected:border-blue-400 selected:text-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400">
                {m.settings_tab_recording()}
              </Tab>
              <Tab id="reconnection" className="cursor-pointer border-b-2 border-transparent px-3 py-2 text-sm text-slate-400 outline-none hover:text-slate-200 selected:border-blue-400 selected:text-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400">
                {m.settings_tab_reconnection()}
              </Tab>
              <Tab id="hotkeys" className="cursor-pointer border-b-2 border-transparent px-3 py-2 text-sm text-slate-400 outline-none hover:text-slate-200 selected:border-blue-400 selected:text-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400">
                {m.settings_tab_hotkeys()}
              </Tab>
              <Tab id="audio" className="cursor-pointer border-b-2 border-transparent px-3 py-2 text-sm text-slate-400 outline-none hover:text-slate-200 selected:border-blue-400 selected:text-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400">
                {m.settings_tab_audio()}
              </Tab>
            </TabList>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <TabPanel id="general"><GeneralTab /></TabPanel>
              <TabPanel id="recording"><RecordingTab /></TabPanel>
              <TabPanel id="reconnection"><ReconnectionTab /></TabPanel>
              <TabPanel id="hotkeys"><HotkeysTab /></TabPanel>
              <TabPanel id="audio"><AudioTab /></TabPanel>
            </div>
          </Tabs>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

**Note:** This creates the shell. Tab components will be created in subsequent tasks. Create placeholder stubs for each tab first so the file compiles.

- [ ] **Step 2: Create placeholder tab stubs**

Create stub files for each tab so SettingsDialog compiles:

`GeneralTab.tsx`, `RecordingTab.tsx`, `ReconnectionTab.tsx`, `HotkeysTab.tsx`, `AudioTab.tsx` — each with:

```tsx
export function GeneralTab() {
  return <div>General tab placeholder</div>;
}
```

(Replace `GeneralTab` with each tab's name.)

- [ ] **Step 3: Verify TS compiles**

```powershell
cd C:\dev\Tapir && npx tsc --noEmit 2>&1 | Select-Object -First 20
```

- [ ] **Step 4: Commit**

```powershell
git add src/components/settings/
git commit -m "feat(phase-2c): add SettingsDialog shell with tabs and placeholder stubs"
```

---

### Task 9: Create GeneralTab

**Files:**
- Modify: `src/components/settings/GeneralTab.tsx`

- [ ] **Step 1: Implement GeneralTab**

```tsx
import { useStore } from "@nanostores/react";
import { Checkbox, Label, Select, SelectValue, ListBox, ListBoxItem, Popover, Button, NumberField, Input, Group } from "react-aria-components";
import { $settings } from "../../stores/settings";
import { useAutoSave } from "../../hooks/useAutoSave";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import { setLanguageTag } from "../../i18n/paraglide/runtime";
import type { GlobalSettings } from "../../lib/tauri";

export function GeneralTab() {
  const settings = useStore($settings);
  if (!settings) return null;

  const save = useAutoSave(async () => {
    const current = $settings.get();
    if (current) await tauri.saveSettings(current);
  });

  function update(patch: Partial<GlobalSettings>) {
    const current = $settings.get();
    if (!current) return;
    const updated = { ...current, ...patch };
    $settings.set(updated);
    if (patch.language) {
      setLanguageTag(patch.language === "uk-UA" ? "uk" : "en");
      document.documentElement.lang = patch.language === "uk-UA" ? "uk" : "en";
    }
    if (patch.theme) {
      applyTheme(patch.theme);
    }
    save();
  }

  return (
    <div className="space-y-6">
      {/* Language */}
      <Select
        selectedKey={settings.language}
        onSelectionChange={(key) => update({ language: key as string })}
      >
        <Label className="block text-sm font-medium text-slate-300">{m.settings_language()}</Label>
        <Button className="mt-1 flex w-48 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400">
          <SelectValue />
          <span aria-hidden="true">▼</span>
        </Button>
        <Popover className="w-48 rounded border border-slate-600 bg-slate-700 shadow-lg">
          <ListBox className="outline-none">
            <ListBoxItem id="uk-UA" className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600">Українська</ListBoxItem>
            <ListBoxItem id="en-US" className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600">English</ListBoxItem>
          </ListBox>
        </Popover>
      </Select>

      {/* Theme */}
      <Select
        selectedKey={settings.theme}
        onSelectionChange={(key) => update({ theme: key as GlobalSettings["theme"] })}
      >
        <Label className="block text-sm font-medium text-slate-300">{m.settings_theme()}</Label>
        <Button className="mt-1 flex w-48 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400">
          <SelectValue />
          <span aria-hidden="true">▼</span>
        </Button>
        <Popover className="w-48 rounded border border-slate-600 bg-slate-700 shadow-lg">
          <ListBox className="outline-none">
            <ListBoxItem id="auto" className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600">{m.settings_theme_auto()}</ListBoxItem>
            <ListBoxItem id="dark" className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600">{m.settings_theme_dark()}</ListBoxItem>
            <ListBoxItem id="light" className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600">{m.settings_theme_light()}</ListBoxItem>
          </ListBox>
        </Popover>
      </Select>

      {/* Minimize to tray (disabled) */}
      <Checkbox
        isSelected={settings.minimizeToTray}
        isDisabled
        className="flex items-center gap-2 text-sm text-slate-500"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">
          {settings.minimizeToTray && <span>✓</span>}
        </div>
        <Label>{m.settings_minimize_to_tray()}</Label>
        <span className="text-xs text-slate-600">({m.settings_disabled_tray()})</span>
      </Checkbox>

      {/* Show tray notifications (disabled) */}
      <Checkbox
        isSelected={settings.showTrayNotifications}
        isDisabled
        className="flex items-center gap-2 text-sm text-slate-500"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">
          {settings.showTrayNotifications && <span>✓</span>}
        </div>
        <Label>{m.settings_show_tray_notifications()}</Label>
        <span className="text-xs text-slate-600">({m.settings_disabled_tray()})</span>
      </Checkbox>

      {/* Show track in title */}
      <Checkbox
        isSelected={settings.showTrackInTitle}
        onChange={(val) => update({ showTrackInTitle: val })}
        className="flex items-center gap-2 text-sm text-slate-300"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">
          {settings.showTrackInTitle && <span>✓</span>}
        </div>
        <Label>{m.settings_show_track_in_title()}</Label>
      </Checkbox>

      {/* Double click action */}
      <Select
        selectedKey={settings.doubleClickAction}
        onSelectionChange={(key) => update({ doubleClickAction: key as GlobalSettings["doubleClickAction"] })}
      >
        <Label className="block text-sm font-medium text-slate-300">{m.settings_double_click_action()}</Label>
        <Button className="mt-1 flex w-48 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400">
          <SelectValue />
          <span aria-hidden="true">▼</span>
        </Button>
        <Popover className="w-48 rounded border border-slate-600 bg-slate-700 shadow-lg">
          <ListBox className="outline-none">
            <ListBoxItem id="record" className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600">{m.settings_double_click_record()}</ListBoxItem>
            <ListBoxItem id="play" className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600">{m.settings_double_click_play()}</ListBoxItem>
          </ListBox>
        </Popover>
      </Select>

      {/* Disk threshold */}
      <NumberField
        value={settings.diskSpaceThresholdGb}
        onChange={(val) => update({ diskSpaceThresholdGb: val })}
        minValue={0}
        maxValue={100}
      >
        <Label className="block text-sm font-medium text-slate-300">{m.settings_disk_threshold()}</Label>
        <Group className="mt-1 flex w-32">
          <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
        </Group>
        <p className="mt-1 text-xs text-slate-500">{m.settings_disk_threshold_desc()}</p>
      </NumberField>
    </div>
  );
}

function applyTheme(theme: string) {
  const html = document.documentElement;
  html.removeAttribute("data-theme");
  if (theme === "dark" || theme === "light") {
    html.setAttribute("data-theme", theme);
  }
  // "auto" → remove attribute, let prefers-color-scheme handle it
}
```

**Important:** The exact React Aria Components API for Checkbox, Select, etc. may differ. Check imports and props against the version in `node_modules/react-aria-components`. Key things to verify:
- `Checkbox` `onChange` prop name (might be `onChange` or event-based)
- `Select` `onSelectionChange` callback type
- `NumberField` `onChange` callback type
- Whether `Popover` needs a `placement` prop

- [ ] **Step 2: Verify TS compiles**

```powershell
cd C:\dev\Tapir && npx tsc --noEmit 2>&1 | Select-Object -First 20
```

- [ ] **Step 3: Commit**

```powershell
git add src/components/settings/GeneralTab.tsx
git commit -m "feat(phase-2c): implement GeneralTab (language, theme, checkboxes, selects)"
```

---

### Task 10: Create RecordingTab

**Files:**
- Modify: `src/components/settings/RecordingTab.tsx`

- [ ] **Step 1: Implement RecordingTab**

The `get_recording_settings` IPC was added in Task 4 and the TS wrapper in Task 5. The `SettingsDialog` loads recording settings into `$recordingSettings` on open (Task 8). This tab simply reads from the store.

```tsx
import { useStore } from "@nanostores/react";
import { TextField, Label, Input, Checkbox, NumberField, Group } from "react-aria-components";
import { $recordingSettings } from "../../stores/settings";
import { useAutoSave } from "../../hooks/useAutoSave";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import type { RecordingSettings } from "../../lib/tauri";

export function RecordingTab() {
  const recording = useStore($recordingSettings);

  const save = useAutoSave(async () => {
    const current = $recordingSettings.get();
    if (current) await tauri.saveRecordingSettings(current);
  });

  if (!recording) return <div className="text-sm text-slate-500">Loading...</div>;

  function update(patch: Partial<RecordingSettings>) {
    const current = $recordingSettings.get();
    if (!current) return;
    $recordingSettings.set({ ...current, ...patch });
    save();
  }

  async function handleBrowse() {
    const dir = await tauri.openDirectoryPicker(recording?.outputDir);
    if (dir) update({ outputDir: dir });
  }

  return (
    <div className="space-y-6">
      {/* Output directory */}
      <div>
        <Label className="block text-sm font-medium text-slate-300">{m.settings_output_dir()}</Label>
        <div className="mt-1 flex gap-2">
          <TextField value={recording.outputDir} onChange={(val) => update({ outputDir: val })} className="flex-1">
            <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
          </TextField>
          <button
            onClick={handleBrowse}
            className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600"
          >
            {m.settings_output_dir_browse()}
          </button>
        </div>
      </div>

      {/* File templates */}
      <TextField value={recording.fileNameTemplate} onChange={(val) => update({ fileNameTemplate: val })}>
        <Label className="block text-sm font-medium text-slate-300">{m.settings_file_template()}</Label>
        <Input className="mt-1 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
        <p className="mt-1 text-xs text-slate-500">{m.settings_template_help()}</p>
      </TextField>

      <TextField value={recording.incompleteFileNameTemplate} onChange={(val) => update({ incompleteFileNameTemplate: val })}>
        <Label className="block text-sm font-medium text-slate-300">{m.settings_incomplete_template()}</Label>
        <Input className="mt-1 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
      </TextField>

      <TextField value={recording.streamFileNameTemplate} onChange={(val) => update({ streamFileNameTemplate: val })}>
        <Label className="block text-sm font-medium text-slate-300">{m.settings_stream_template()}</Label>
        <Input className="mt-1 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
      </TextField>

      {/* Checkboxes */}
      <Checkbox isSelected={recording.saveStreamFile} onChange={(val) => update({ saveStreamFile: val })} className="flex items-center gap-2 text-sm text-slate-300">
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">{recording.saveStreamFile && <span>✓</span>}</div>
        <Label>{m.settings_save_stream_file()}</Label>
      </Checkbox>

      <Checkbox isSelected={recording.deleteStreamFileOnStop} onChange={(val) => update({ deleteStreamFileOnStop: val })} className="flex items-center gap-2 text-sm text-slate-300">
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">{recording.deleteStreamFileOnStop && <span>✓</span>}</div>
        <Label>{m.settings_delete_stream_on_stop()}</Label>
      </Checkbox>

      <Checkbox isSelected={recording.skipFirstIncompleteTrack} onChange={(val) => update({ skipFirstIncompleteTrack: val })} className="flex items-center gap-2 text-sm text-slate-300">
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">{recording.skipFirstIncompleteTrack && <span>✓</span>}</div>
        <Label>{m.settings_skip_first_incomplete()}</Label>
      </Checkbox>

      {/* Min track duration (display in seconds, store as ms) */}
      <NumberField
        value={recording.skipShortTracksMs / 1000}
        onChange={(val) => update({ skipShortTracksMs: val * 1000 })}
        minValue={0}
      >
        <Label className="block text-sm font-medium text-slate-300">{m.settings_min_track_duration()}</Label>
        <Group className="mt-1 flex w-32">
          <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
        </Group>
      </NumberField>

      <Checkbox isSelected={recording.autoCorrectCase} onChange={(val) => update({ autoCorrectCase: val })} className="flex items-center gap-2 text-sm text-slate-300">
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">{recording.autoCorrectCase && <span>✓</span>}</div>
        <Label>{m.settings_auto_correct_case()}</Label>
      </Checkbox>
    </div>
  );
}
```

**Implementer notes:** 
- The `TextField` `onChange` prop in React Aria may not work like standard `onChange`. Check the RAC API — it might need `value` + `onInput` or a controlled pattern.
- Verify the `Checkbox` `onChange` callback signature.

- [ ] **Step 3: Verify TS compiles**

- [ ] **Step 4: Commit**

```powershell
git add src/components/settings/RecordingTab.tsx
git commit -m "feat(phase-2c): implement RecordingTab (output dir, templates, options)"
```

---

### Task 11: Create ReconnectionTab

**Files:**
- Modify: `src/components/settings/ReconnectionTab.tsx`

- [ ] **Step 1: Implement ReconnectionTab**

```tsx
import { useStore } from "@nanostores/react";
import { NumberField, Label, Input, Group } from "react-aria-components";
import { $recordingSettings } from "../../stores/settings";
import { useAutoSave } from "../../hooks/useAutoSave";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import type { ReconnectConfig } from "../../lib/tauri";

export function ReconnectionTab() {
  const recording = useStore($recordingSettings);

  const save = useAutoSave(async () => {
    const current = $recordingSettings.get();
    if (current) await tauri.saveRecordingSettings(current);
  });

  if (!recording) return null;

  function update(patch: Partial<ReconnectConfig>) {
    const current = $recordingSettings.get();
    if (!current) return;
    $recordingSettings.set({
      ...current,
      reconnect: { ...current.reconnect, ...patch },
    });
    save();
  }

  const r = recording.reconnect;

  return (
    <div className="space-y-6">
      <NumberField value={r.maxRetries} onChange={(val) => update({ maxRetries: val })} minValue={0}>
        <Label className="block text-sm font-medium text-slate-300">{m.settings_max_retries()}</Label>
        <Group className="mt-1 flex w-32">
          <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
        </Group>
        <p className="mt-1 text-xs text-slate-500">{m.settings_max_retries_desc()}</p>
      </NumberField>

      <NumberField value={r.retryIntervalSecs} onChange={(val) => update({ retryIntervalSecs: val })} minValue={1}>
        <Label className="block text-sm font-medium text-slate-300">{m.settings_retry_interval()}</Label>
        <Group className="mt-1 flex w-32">
          <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
        </Group>
      </NumberField>

      <NumberField value={r.backoffMultiplier} onChange={(val) => update({ backoffMultiplier: val })} minValue={1} step={0.1}>
        <Label className="block text-sm font-medium text-slate-300">{m.settings_backoff_multiplier()}</Label>
        <Group className="mt-1 flex w-32">
          <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
        </Group>
      </NumberField>

      <NumberField value={r.maxIntervalSecs} onChange={(val) => update({ maxIntervalSecs: val })} minValue={1}>
        <Label className="block text-sm font-medium text-slate-300">{m.settings_max_interval()}</Label>
        <Group className="mt-1 flex w-32">
          <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
        </Group>
      </NumberField>
    </div>
  );
}
```

- [ ] **Step 2: Verify TS compiles**

- [ ] **Step 3: Commit**

```powershell
git add src/components/settings/ReconnectionTab.tsx
git commit -m "feat(phase-2c): implement ReconnectionTab (retries, interval, backoff)"
```

---

## Chunk 4: Hotkeys Tab, Audio Tab, KeyRecorder

### Task 12: Create KeyRecorder Component

**Files:**
- Create: `src/components/settings/KeyRecorder.tsx`

- [ ] **Step 1: Implement KeyRecorder**

```tsx
import { useState, useCallback, useRef } from "react";
import { Button, Label } from "react-aria-components";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  label: string;
  value: string;
  onChange: (combo: string) => void;
  onValidate?: (combo: string) => string | null; // returns error message or null
}

export function KeyRecorder({ label, value, onChange, onValidate }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keysRef = useRef<Set<string>>(new Set());

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isRecording) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      setIsRecording(false);
      keysRef.current.clear();
      return;
    }

    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.shiftKey) parts.push("Shift");
    if (e.altKey) parts.push("Alt");
    if (e.metaKey) parts.push("Super");

    const key = e.key;
    // Don't include modifier-only keys
    if (!["Control", "Shift", "Alt", "Meta"].includes(key)) {
      // Normalize key names
      const normalized = key === "ArrowUp" ? "Up"
        : key === "ArrowDown" ? "Down"
        : key === "ArrowLeft" ? "Left"
        : key === "ArrowRight" ? "Right"
        : key.length === 1 ? key.toUpperCase()
        : key;
      parts.push(normalized);

      const combo = parts.join("+");
      const validationError = onValidate?.(combo);
      if (validationError) {
        setError(validationError);
      } else {
        setError(null);
        onChange(combo);
      }
      setIsRecording(false);
      keysRef.current.clear();
    }
  }, [isRecording, onChange, onValidate]);

  const handleClear = () => {
    setError(null);
    onChange("");
  };

  return (
    <div role="group" aria-label={label} className="flex items-center gap-3">
      <Label className="w-48 text-sm text-slate-300">{label}</Label>
      <Button
        aria-label={`${label}: ${value || m.settings_hotkey_clear()}. ${m.settings_hotkey_press_to_change()}`}
        onPress={() => { setIsRecording(true); setError(null); }}
        onKeyDown={handleKeyDown}
        className="min-w-36 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400"
      >
        {isRecording ? m.settings_hotkey_press_keys() : value || "—"}
      </Button>
      <Button
        aria-label={m.settings_hotkey_clear()}
        onPress={handleClear}
        className="rounded border border-slate-600 bg-slate-700 px-2 py-2 text-sm text-slate-400 hover:text-slate-200 outline-none focus:ring-2 focus:ring-blue-400"
      >
        ✕
      </Button>
      {error && (
        <span role="alert" className="text-xs text-red-400">{error}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TS compiles**

- [ ] **Step 3: Commit**

```powershell
git add src/components/settings/KeyRecorder.tsx
git commit -m "feat(phase-2c): implement KeyRecorder component for hotkey capture"
```

---

### Task 13: Create HotkeysTab

**Files:**
- Modify: `src/components/settings/HotkeysTab.tsx`

- [ ] **Step 1: Implement HotkeysTab**

```tsx
import { useState } from "react";
import { useStore } from "@nanostores/react";
import { $settings } from "../../stores/settings";
import { useAutoSave } from "../../hooks/useAutoSave";
import { KeyRecorder } from "./KeyRecorder";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import type { HotkeyMap } from "../../lib/tauri";

const HOTKEY_FIELDS: { key: keyof HotkeyMap; label: () => string }[] = [
  { key: "toggleRecording", label: () => m.settings_hotkey_toggle_recording() },
  { key: "togglePlayback", label: () => m.settings_hotkey_toggle_playback() },
  { key: "volumeUp", label: () => m.settings_hotkey_volume_up() },
  { key: "volumeDown", label: () => m.settings_hotkey_volume_down() },
  { key: "toggleWindow", label: () => m.settings_hotkey_toggle_window() },
];

export function HotkeysTab() {
  const settings = useStore($settings);
  const [registrationErrors, setRegistrationErrors] = useState<string[]>([]);

  const save = useAutoSave(async () => {
    const current = $settings.get();
    if (!current) return;
    await tauri.saveSettings(current);
    const failed = await tauri.registerHotkeys();
    setRegistrationErrors(failed);
  });

  if (!settings) return null;

  function updateHotkey(key: keyof HotkeyMap, combo: string) {
    const current = $settings.get();
    if (!current) return;
    $settings.set({
      ...current,
      hotkeys: { ...current.hotkeys, [key]: combo },
    });
    save();
  }

  function validateHotkey(currentKey: keyof HotkeyMap) {
    return (combo: string): string | null => {
      if (!combo) return null;
      const hotkeys = $settings.get()?.hotkeys;
      if (!hotkeys) return null;
      for (const field of HOTKEY_FIELDS) {
        if (field.key !== currentKey && hotkeys[field.key] === combo) {
          return m.settings_hotkey_duplicate({ action: field.label() });
        }
      }
      return null;
    };
  }

  return (
    <div className="space-y-4">
      {HOTKEY_FIELDS.map(({ key, label }) => (
        <KeyRecorder
          key={key}
          label={label()}
          value={settings.hotkeys[key]}
          onChange={(combo) => updateHotkey(key, combo)}
          onValidate={validateHotkey(key)}
        />
      ))}

      {registrationErrors.length > 0 && (
        <div role="alert" className="mt-4 rounded border border-red-700 bg-red-900/30 p-3">
          {registrationErrors.map((combo) => (
            <p key={combo} className="text-sm text-red-300">
              {m.settings_hotkey_registration_failed({ combo })}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TS compiles**

- [ ] **Step 3: Commit**

```powershell
git add src/components/settings/HotkeysTab.tsx
git commit -m "feat(phase-2c): implement HotkeysTab with KeyRecorder and duplicate validation"
```

---

### Task 14: Create AudioTab

**Files:**
- Modify: `src/components/settings/AudioTab.tsx`

- [ ] **Step 1: Implement AudioTab**

```tsx
import { useEffect, useState } from "react";
import { Select, SelectValue, Label, Button, Popover, ListBox, ListBoxItem } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $settings } from "../../stores/settings";
import { useAutoSave } from "../../hooks/useAutoSave";
import * as tauri from "../../lib/tauri";
import type { AudioDevice } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

export function AudioTab() {
  const settings = useStore($settings);
  const [devices, setDevices] = useState<AudioDevice[]>([]);

  const loadDevices = async () => {
    const devs = await tauri.listOutputDevices();
    setDevices(devs);
  };

  useEffect(() => { loadDevices(); }, []);

  const save = useAutoSave(async () => {
    const current = $settings.get();
    if (current) await tauri.saveSettings(current);
  });

  if (!settings) return null;

  async function handleDeviceChange(deviceName: string) {
    const name = deviceName === "__default__" ? null : deviceName;
    await tauri.setOutputDevice(name);
    const current = $settings.get();
    if (current) {
      $settings.set({ ...current, outputDevice: name });
      save();
    }
  }

  const selectedKey = settings.outputDevice ?? "__default__";

  return (
    <div className="space-y-6">
      <Select
        selectedKey={selectedKey}
        onSelectionChange={(key) => handleDeviceChange(key as string)}
      >
        <Label className="block text-sm font-medium text-slate-300">{m.settings_output_device()}</Label>
        <Button className="mt-1 flex w-80 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400">
          <SelectValue />
          <span aria-hidden="true">▼</span>
        </Button>
        <Popover className="w-80 rounded border border-slate-600 bg-slate-700 shadow-lg">
          <ListBox className="max-h-60 overflow-y-auto outline-none">
            <ListBoxItem id="__default__" className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600">
              {m.settings_output_device_default()}
            </ListBoxItem>
            {devices.map((dev) => (
              <ListBoxItem key={dev.name} id={dev.name} className="cursor-pointer px-3 py-2 text-sm text-slate-100 outline-none hover:bg-slate-600 focus:bg-slate-600">
                {dev.name}
              </ListBoxItem>
            ))}
          </ListBox>
        </Popover>
      </Select>

      <button
        onClick={loadDevices}
        className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600"
        aria-label={m.settings_output_device_refresh()}
      >
        {m.settings_output_device_refresh()}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TS compiles**

- [ ] **Step 3: Commit**

```powershell
git add src/components/settings/AudioTab.tsx
git commit -m "feat(phase-2c): implement AudioTab (output device selection)"
```

---

## Chunk 5: Integration (ActivityBar, App.tsx, Window State)

### Task 15: Enable Settings Button in ActivityBar

**Files:**
- Modify: `src/components/layout/ActivityBar.tsx`

- [ ] **Step 1: Enable the Settings button**

The Settings button is a **standalone button** in the `<div className="mt-auto">` block at the bottom of ActivityBar (lines 58-67), NOT in the `sections` array. Update it to:
1. Remove `disabled`
2. Import `$settingsDialogOpen` from `../../stores/settings`
3. On click: `$settingsDialogOpen.set(true)`
4. Update `aria-label` to use i18n: `m.settings_title()`
5. Remove "(coming soon)" title
6. Update className to enable interactive styles (remove `cursor-not-allowed text-slate-600`, add hover styles matching other buttons)

The updated button block:

```tsx
import { $settingsDialogOpen } from "../../stores/settings";

// In the <div className="mt-auto"> block:
<button
  onClick={() => $settingsDialogOpen.set(true)}
  aria-label={m.settings_title()}
  className="flex h-10 w-10 items-center justify-center rounded text-slate-400 hover:bg-slate-700 hover:text-slate-200"
>
  <Settings size={20} aria-hidden={true} />
</button>
```

- [ ] **Step 2: Verify TS compiles**

- [ ] **Step 3: Commit**

```powershell
git add src/components/layout/ActivityBar.tsx
git commit -m "feat(phase-2c): enable Settings button in ActivityBar"
```

---

### Task 16: Integrate SettingsDialog into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add Ctrl+, keyboard handler**

In `App.tsx`, find the existing `Ctrl+K` handler and add a similar one for `Ctrl+,`:

```typescript
if ((e.ctrlKey || e.metaKey) && e.key === ",") {
  e.preventDefault();
  $settingsDialogOpen.set(!$settingsDialogOpen.get());
}
```

Add inside the existing keyboard handler function or create a new one alongside it.

- [ ] **Step 2: Render SettingsDialog**

Import and render `<SettingsDialog />` in the App component's JSX. Place it inside the `<ErrorBoundary>` wrapper, alongside `<CommandPalette />` (after `<CommandPalette />`):

```tsx
import { SettingsDialog } from "./components/settings/SettingsDialog";
import { $settingsDialogOpen } from "./stores/settings";

// In the JSX, after <CommandPalette />:
<SettingsDialog />
```

- [ ] **Step 3: Apply theme on load**

In the existing `getSettings().then(...)` callback in `App.tsx`, add theme application:

```typescript
tauri.getSettings().then((settings) => {
  $settings.set(settings);
  document.documentElement.lang = settings.language === "uk-UA" ? "uk" : "en";
  // Apply theme
  if (settings.theme !== "auto") {
    document.documentElement.setAttribute("data-theme", settings.theme);
  }
});
```

- [ ] **Step 4: Verify TS compiles**

```powershell
cd C:\dev\Tapir && npx tsc --noEmit 2>&1 | Select-Object -First 20
```

- [ ] **Step 5: Commit**

```powershell
git add src/App.tsx
git commit -m "feat(phase-2c): integrate SettingsDialog with Ctrl+, shortcut and theme"
```

---

### Task 17: Verify Window State Configuration

**Files:**
- Verify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Check window visibility setting**

The `tauri-plugin-window-state` plugin (added in Task 2) restores window position and size on startup. For proper flow, the main window should start as `visible: false`, the plugin restores state, then `App.tsx` calls `window.show()`.

Check `src-tauri/tauri.conf.json` → `app.windows[0]`. If `visible` is not set to `false`, the window will flash before state is restored. If `App.tsx` already calls `getCurrentWindow().show()` after init (it does), then setting `visible: false` is safe.

Verify this is already the case. If not, set `"visible": false` in the window config.

- [ ] **Step 2: Commit (if changes needed)**

```powershell
git add src-tauri/tauri.conf.json
git commit -m "feat(phase-2c): set window visible:false for window-state plugin"
```

---

### Task 18: Build Verification

- [ ] **Step 1: Run full build**

```powershell
just build-fast
```

Expected: builds successfully, producing `src-tauri/target/release-fast/tapir.exe`.

- [ ] **Step 2: Fix any build errors**

If errors occur, fix them and re-run. Common issues:
- Unused imports in Rust
- Missing `use` statements
- TypeScript type mismatches
- React Aria Components API differences

- [ ] **Step 3: Manual smoke test**

Launch the built EXE and verify:
1. Settings button (⚙️) in ActivityBar is clickable
2. Ctrl+, opens the settings dialog
3. Tabs are navigable with arrow keys
4. Fields display correct values
5. Changes save (close and reopen to verify)
6. Global hotkeys work (Ctrl+Shift+H to hide/show window)
7. NVDA can read all elements

- [ ] **Step 4: Final commit (if any fixes needed)**

```powershell
git add -A
git commit -m "fix(phase-2c): build fixes and adjustments"
```

---

## Summary

| Chunk | Tasks | Focus |
|-------|-------|-------|
| 1 | 1–4 | Backend: plugins, capabilities, shortcuts.rs, IPC commands |
| 2 | 5–7 | Frontend foundation: TS types, i18n, stores, useAutoSave |
| 3 | 8–11 | SettingsDialog shell, GeneralTab, RecordingTab, ReconnectionTab |
| 4 | 12–14 | KeyRecorder, HotkeysTab, AudioTab |
| 5 | 15–18 | Integration: ActivityBar, App.tsx, window state verification, build |
