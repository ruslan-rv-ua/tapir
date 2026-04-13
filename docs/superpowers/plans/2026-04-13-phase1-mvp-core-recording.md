# Phase 1 — MVP: Core Recording — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully functional Tauri v2 desktop app that records internet radio streams with ICY metadata-based track splitting, ID3/M4A tagging, and full keyboard/screen reader accessibility.

**Architecture:** Tauri v2 (Rust backend + React 19 frontend). Backend owns all state via `AppState` with `tokio::sync::RwLock`. Each recording stream runs as an independent `tokio::spawn` task (Hybrid C pattern). Frontend is a thin presentation layer synced via IPC commands and events. Nanostores for reactive state. React Aria for accessible components.

**Tech Stack:** Tauri 2.x, Rust (tokio, reqwest, icy-metadata, lofty, serde), React 19, React Aria Components, Tailwind CSS v4, Nanostores, Paraglide.js, Vite 8, lucide-react.

**Strategy:** Two stages — Walking Skeleton (Tasks 1-4) validates end-to-end architecture, then Tasks 5-17 build full Phase 1 scope.

**Spec:** `docs/superpowers/specs/2026-04-13-phase1-mvp-core-recording-design.md`

---

## File Structure

### Rust Backend (`src-tauri/src/`)

| File | Responsibility |
|------|---------------|
| `main.rs` | Entry point, `windows_subsystem` attribute |
| `lib.rs` | Tauri Builder setup, plugin registration, command handlers |
| `app_state.rs` | `AppState` struct — central container holding `Arc<RwLock<...>>` refs |
| `portable.rs` | `base_dir()`, `data_dir()`, path builders, directory creation |
| `errors.rs` | `RadioError` enum via `thiserror` |
| `settings.rs` | Read/write `data/settings.json`, defaults, BOM strip |
| `profile.rs` | Read/write `.tapirprofile`, Default profile creation |
| `sanitize.rs` | Filename template rendering (`%a`, `%t`, etc.), forbidden chars, collisions, case correction |
| `stream/mod.rs` | Re-exports for stream module |
| `stream/connection.rs` | HTTP connection with ICY headers via `reqwest` + `icy-metadata` |
| `stream/format.rs` | Format detection (MP3/AAC) via content-type + magic bytes |
| `stream/playlist.rs` | PLS/M3U parser (~30 lines each) |
| `stream/splitter.rs` | Track splitting logic by ICY metadata changes |
| `stream/recorder.rs` | File writer — stream file + track files, `_incomplete` rename |
| `stream/manager.rs` | `StreamManager` — coordinates recordings, reconnect, status |
| `tags/mod.rs` | Re-exports for tags module |
| `tags/writer.rs` | ID3v2/M4A tag writing via `lofty` |
| `commands/mod.rs` | Re-exports for command handlers |
| `commands/stream_commands.rs` | IPC: `get_streams`, `add_stream`, `remove_stream`, `update_stream`, `start_recording`, `stop_recording`, `stop_all_recordings`, `get_stream_status`, `get_all_statuses` |
| `commands/settings_commands.rs` | IPC: `get_settings`, `save_settings` |

### Frontend (`src/`)

| File | Responsibility |
|------|---------------|
| `main.tsx` | React entry, mount App |
| `App.tsx` | Root layout: ActivityBar + content. Init Tauri event listeners |
| `components/layout/ActivityBar.tsx` | Left sidebar: section icons, profile switcher placeholder |
| `components/layout/SectionHeader.tsx` | Top bar: section title + Ctrl+K trigger |
| `components/layout/StatusBar.tsx` | Bottom bar: recording count, disk space, longest recording |
| `components/streams/StreamsPanel.tsx` | Toolbar + StreamTable or empty state |
| `components/streams/StreamTable.tsx` | React Aria TableView — sortable, accessible grid |
| `components/streams/StreamRow.tsx` | Row: status icon, name, track, bitrate, duration |
| `components/streams/AddStreamDialog.tsx` | Modal: add/edit stream (URL + name) |
| `components/common/CommandPalette.tsx` | Ctrl+K overlay: fuzzy search actions + streams |
| `components/common/ToastContainer.tsx` | Bottom-right toast notifications |
| `components/common/LiveAnnouncer.tsx` | `sr-only` aria-live containers (polite + assertive) |
| `components/common/ConfirmDialog.tsx` | Confirmation modal for destructive actions |
| `components/common/ErrorBoundary.tsx` | React error boundary |
| `stores/streams.ts` | `$streams` atom + `$statuses` map |
| `stores/profile.ts` | `$profile` atom — active profile data |
| `stores/settings.ts` | `$settings` atom — global settings |
| `stores/navigation.ts` | `$navigation` atom — active section, command palette |
| `stores/toasts.ts` | `$toasts` atom — toast queue |
| `stores/announcer.ts` | `$announcer` atom — screen reader queue |
| `hooks/useTauriEvent.ts` | `listen()` wrapper with cleanup |
| `hooks/useAnnounce.ts` | Announce via LiveAnnouncer |
| `lib/tauri.ts` | Typed `invoke()` wrappers |
| `lib/formatters.ts` | Duration, bitrate, date formatting |
| `styles.css` | Tailwind v4 entry + custom properties |

### i18n

| File | Responsibility |
|------|---------------|
| `src/i18n/messages/uk.json` | Ukrainian UI strings |
| `src/i18n/messages/en.json` | English UI strings (stubs initially) |

---

## Stage 1: Walking Skeleton (Tasks 1-4)

> Validates end-to-end architecture: Tauri IPC ↔ Rust ↔ reqwest ↔ file I/O. After this stage, the app can connect to a real radio stream URL and save raw bytes to a file.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
- Create: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
- Create: `src-tauri/capabilities/default.json`
- Create: `src/main.tsx`, `src/App.tsx`, `src/styles.css`
- Create: `justfile`

- [ ] **Step 1: Scaffold Tauri project**

```bash
pnpm create tauri-app tapir-scaffold --template react-ts --manager pnpm
```

Move generated files into the project root (`c:\dev\Tapir`). Keep `src-tauri/icons/` that already exists.

- [ ] **Step 2: Adapt `package.json` to match `docs/tech-stack.md`**

Replace the generated `package.json` with the version from `docs/tech-stack.md` (§ package.json). Key changes:
- `name: "tapir"`, `version: "0.1.0"`
- Add dependencies: `react-aria-components`, `lucide-react`, `nanostores`, `@nanostores/react`
- Add devDependencies: `@tailwindcss/vite`, `tailwindcss`
- Set `packageManager: "pnpm@10.32.1"`
- Scripts: `dev`, `build`, `vite:dev`, `vite:build`

**Phase 1 plugin trimming:** Only include `@tauri-apps/plugin-log` and `@tauri-apps/plugin-dialog` from the JS plugin packages. Remove `@tauri-apps/plugin-cli`, `@tauri-apps/plugin-global-shortcut`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-http`, `@tauri-apps/plugin-notification`, `@tauri-apps/plugin-shell`, `@tauri-apps/plugin-window-state`, `@tauri-apps/plugin-autostart`.

- [ ] **Step 3: Adapt `src-tauri/Cargo.toml` to match `docs/tech-stack.md`**

Replace with the version from `docs/tech-stack.md` (§ Cargo.toml). Key changes:
- Phase 1 plugins only: `tauri-plugin-log`, `tauri-plugin-dialog`. Remove all other plugin crates.
- Keep all streaming/audio crates: `reqwest`, `icy-metadata`, `stream-download`, `lofty`
- Keep async/error/misc: `tokio`, `futures-util`, `bytes`, `serde`, `serde_json`, `thiserror`, `anyhow`, `chrono`, `sys-locale`, `tracing`, `log`
- Add: `nanoid = "0.4"`, `tokio-util = { version = "0.7", features = ["rt"] }`
- Remove: `rodio` (Phase 2), `windows` (Phase 4)
- Keep release profiles as specified

- [ ] **Step 4: Adapt `src-tauri/tauri.conf.json` to match `docs/tech-stack.md`**

Replace with the version from `docs/tech-stack.md` (§ tauri.conf.json). Key changes:
- `productName: "Tapir"`, `version: "0.1.0"`, `identifier: "com.tapir.app"`
- Window: `visible: false`, `decorations: true`, 900x650, min 640x480
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`
- Remove `plugins.cli` section (Phase 4)
- Bundle targets: `["nsis"]`

- [ ] **Step 5: Adapt `src-tauri/capabilities/default.json`**

Phase 1 minimal capabilities:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default permissions for Tapir",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-close",
    "core:window:allow-set-title",
    "core:window:allow-show",
    "core:window:allow-hide",
    "core:event:default",
    "dialog:default",
    "log:default"
  ]
}
```

- [ ] **Step 6: Create `src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tapir_lib::run();
}
```

- [ ] **Step 7: Create minimal `src-tauri/src/lib.rs`**

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Will be expanded in later tasks
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 8: Setup Tailwind CSS v4 in `vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
```

- [ ] **Step 9: Create `src/styles.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 10: Create minimal `src/App.tsx`**

```tsx
function App() {
  return (
    <div className="flex h-screen bg-slate-950 text-slate-200">
      <main className="flex-1 flex items-center justify-center">
        <p>Tapir — Walking Skeleton</p>
      </main>
    </div>
  );
}

export default App;
```

- [ ] **Step 11: Create `src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 12: Create `justfile`**

Copy from `docs/tech-stack.md` (§ justfile).

- [ ] **Step 13: Install dependencies and verify build**

```bash
pnpm install
```

Run: `pnpm tauri dev`
Expected: Window opens showing "Tapir — Walking Skeleton" with dark background. No console window in release mode.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: scaffold Tauri v2 project with React 19 + Tailwind CSS v4"
```

---

### Task 2: Portable Infrastructure + Error Types

**Files:**
- Create: `src-tauri/src/portable.rs`
- Create: `src-tauri/src/errors.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/errors.rs`**

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RadioError {
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Format error: {0}")]
    Format(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Invalid URL: {0}")]
    InvalidUrl(String),

    #[error("{0}")]
    Other(String),
}

impl From<RadioError> for String {
    fn from(e: RadioError) -> String {
        e.to_string()
    }
}
```

- [ ] **Step 2: Create `src-tauri/src/portable.rs`**

```rust
use std::path::PathBuf;
use tracing::info;

/// Returns the directory containing the EXE.
/// In dev mode, falls back to the current directory.
pub fn base_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().expect("Cannot determine current directory"))
}

/// Returns the data directory: `base_dir()/data/`
pub fn data_dir() -> PathBuf {
    base_dir().join("data")
}

pub fn settings_path() -> PathBuf {
    data_dir().join("settings.json")
}

pub fn profiles_dir() -> PathBuf {
    data_dir().join("profiles")
}

pub fn recordings_dir() -> PathBuf {
    data_dir().join("recordings")
}

pub fn logs_dir() -> PathBuf {
    data_dir().join("logs")
}

/// Creates all required data directories if they don't exist.
pub fn ensure_data_dirs() -> Result<(), std::io::Error> {
    let dirs = [data_dir(), profiles_dir(), recordings_dir(), logs_dir()];
    for dir in &dirs {
        if !dir.exists() {
            std::fs::create_dir_all(dir)?;
            info!("Created directory: {}", dir.display());
        }
    }
    Ok(())
}
```

- [ ] **Step 3: Register modules in `lib.rs`**

Add `mod portable;` and `mod errors;` to `lib.rs`. Call `portable::ensure_data_dirs()` inside `setup()`:

```rust
mod errors;
mod portable;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            portable::ensure_data_dirs()
                .expect("Failed to create data directories");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Verify build and directory creation**

Run: `pnpm tauri dev`
Expected: `data/`, `data/profiles/`, `data/recordings/`, `data/logs/` directories created next to the EXE (or in the dev working directory).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/portable.rs src-tauri/src/errors.rs src-tauri/src/lib.rs
git commit -m "feat: add portable path helpers and RadioError type"
```

---

### Task 3: Settings + Profile + Data Models

**Files:**
- Create: `src-tauri/src/settings.rs`
- Create: `src-tauri/src/profile.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/settings.rs`**

Implement `GlobalSettings` struct with all fields from `data-models.md` §1, `Default` impl, `load()` with BOM strip, and `save()` with atomic write (write to `.tmp` then rename):

```rust
use crate::errors::RadioError;
use crate::portable;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

// Structs: GlobalSettings, Theme, DoubleClickAction, HotkeyMap
// Copy exact field definitions from data-models.md §1 Rust struct section.
// Add #[serde(default)] on all fields for forward compatibility.

/// Strip UTF-8 BOM if present (Windows Notepad adds this).
fn strip_bom(s: &str) -> &str {
    s.strip_prefix('\u{FEFF}').unwrap_or(s)
}

impl GlobalSettings {
    pub fn load() -> Result<Self, RadioError> {
        let path = portable::settings_path();
        if !path.exists() {
            let settings = Self::default();
            settings.save()?;
            info!("Created default settings at {}", path.display());
            return Ok(settings);
        }
        let content = std::fs::read_to_string(&path)?;
        let content = strip_bom(&content);
        let settings: Self = serde_json::from_str(content)?;
        Ok(settings)
    }

    pub fn save(&self) -> Result<(), RadioError> {
        let path = portable::settings_path();
        let tmp_path = path.with_extension("json.tmp");
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(&tmp_path, &json)?;
        std::fs::rename(&tmp_path, &path)?;
        Ok(())
    }
}

impl Default for GlobalSettings {
    fn default() -> Self {
        // Use defaults from data-models.md §6 (settings.json defaults).
        // Detect language via sys-locale:
        let language = sys_locale::get_locale()
            .filter(|l| l.starts_with("uk"))
            .map(|_| "uk-UA".to_string())
            .unwrap_or_else(|| "en-US".to_string());
        // ... fill all fields with defaults
        Self { language, /* ... */ }
    }
}
```

Full struct fields — copy verbatim from `docs/data-models.md` §1 Rust struct.

- [ ] **Step 2: Create `src-tauri/src/profile.rs`**

Implement `Profile` struct with nested types (`StreamInfo`, `RecordingSettings`, etc.) from `data-models.md` §2-3. Include `load()`, `save()` with atomic write, and `create_default()`:

```rust
use crate::errors::RadioError;
use crate::portable;
use crate::settings::strip_bom;  // reuse BOM strip (make it pub)
use serde::{Deserialize, Serialize};

// Structs: Profile, StreamInfo, AudioFormat, RecordingSettings, ReconnectConfig,
//          PostprocessConfig, PlayerSession, FilePosition, WishlistEntry,
//          ScheduledRecording, ScheduleType, SavedTrack
// Copy exact field definitions from data-models.md §2-3 Rust structs.
// Add #[serde(default)] on all fields.

impl Profile {
    pub fn load(name: &str) -> Result<Self, RadioError> {
        let path = portable::profiles_dir().join(format!("{}.tapirprofile", name));
        if !path.exists() {
            if name == "Default" {
                let profile = Self::create_default();
                profile.save()?;
                return Ok(profile);
            }
            return Err(RadioError::NotFound(format!("Profile '{}' not found", name)));
        }
        let content = std::fs::read_to_string(&path)?;
        let content = strip_bom(&content);
        let profile: Self = serde_json::from_str(content)?;
        Ok(profile)
    }

    pub fn save(&self) -> Result<(), RadioError> {
        let path = portable::profiles_dir().join(format!("{}.tapirprofile", self.name));
        let tmp_path = path.with_extension("tapirprofile.tmp");
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(&tmp_path, &json)?;
        std::fs::rename(&tmp_path, &path)?;
        Ok(())
    }

    pub fn create_default() -> Self {
        // Use defaults from data-models.md §6 (Default.tapirprofile)
        Self {
            name: "Default".to_string(),
            version: 1,
            streams: vec![],
            // ... all other fields with defaults
        }
    }
}
```

Full struct fields — copy verbatim from `docs/data-models.md` §2-3 Rust structs.

- [ ] **Step 3: Register modules in `lib.rs`, load settings and profile in `setup()`**

```rust
mod errors;
mod portable;
mod profile;
mod settings;

use settings::GlobalSettings;
use profile::Profile;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            portable::ensure_data_dirs()?;
            let settings = GlobalSettings::load()
                .expect("Failed to load settings");
            let profile = Profile::load(&settings.active_profile)
                .expect("Failed to load profile");
            tracing::info!("Loaded profile: {}", profile.name);
            tracing::info!("Streams in profile: {}", profile.streams.len());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Verify build — settings and profile creation**

Run: `pnpm tauri dev`
Expected: `data/settings.json` and `data/profiles/Default.tapirprofile` created with correct defaults. Log output shows loaded profile name.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/settings.rs src-tauri/src/profile.rs src-tauri/src/lib.rs
git commit -m "feat: add settings and profile management with BOM strip and atomic writes"
```

---

### Task 4: Walking Skeleton — Minimal Recording IPC

**Files:**
- Create: `src-tauri/src/app_state.rs`
- Create: `src-tauri/src/stream/mod.rs`
- Create: `src-tauri/src/stream/connection.rs`
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/stream_commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/App.tsx`

This task proves the end-to-end path: frontend button → IPC → Rust → reqwest GET → file write. No track splitting, no metadata — just raw bytes to a file.

- [ ] **Step 1: Create `src-tauri/src/app_state.rs`**

```rust
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::settings::GlobalSettings;
use crate::profile::Profile;

pub struct AppState {
    pub settings: Arc<RwLock<GlobalSettings>>,
    pub active_profile: Arc<RwLock<Profile>>,
    // stream_manager added in Task 10
    // player and scheduler are absent in Phase 1 — they will be added as fields
    // directly in later phases (no no-op stubs needed; AppState is internal, not
    // an external API, so adding fields is a non-breaking change).
}

impl AppState {
    pub fn new(settings: GlobalSettings, profile: Profile) -> Self {
        Self {
            settings: Arc::new(RwLock::new(settings)),
            active_profile: Arc::new(RwLock::new(profile)),
        }
    }
}
```

- [ ] **Step 2: Create `src-tauri/src/stream/mod.rs` and `src-tauri/src/stream/connection.rs`**

Minimal connection that performs HTTP GET with ICY header and returns a byte stream:

```rust
// stream/connection.rs
use crate::errors::RadioError;
use reqwest::Client;
use futures_util::StreamExt;
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tracing::info;

pub async fn record_to_file(url: &str, output_path: &Path) -> Result<(), RadioError> {
    let client = Client::new();
    let response = client
        .get(url)
        .header("Icy-MetaData", "1")
        .header("User-Agent", "Tapir/0.1.0")
        .send()
        .await?;

    info!("Connected to {}, status: {}", url, response.status());

    let mut file = File::create(output_path).await
        .map_err(RadioError::Io)?;
    let mut stream = response.bytes_stream();
    let mut total_bytes: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let bytes = chunk?;
        file.write_all(&bytes).await.map_err(RadioError::Io)?;
        total_bytes += bytes.len() as u64;
    }

    info!("Recorded {} bytes to {}", total_bytes, output_path.display());
    Ok(())
}
```

```rust
// stream/mod.rs
pub mod connection;
```

- [ ] **Step 3: Create `src-tauri/src/commands/mod.rs` and `src-tauri/src/commands/stream_commands.rs`**

Minimal IPC command — just a `start_test_recording` that saves raw bytes:

```rust
// commands/stream_commands.rs
use crate::stream::connection;
use crate::portable;

#[tauri::command]
pub async fn start_test_recording(url: String) -> Result<String, String> {
    let output_path = portable::recordings_dir().join("test_recording.mp3");
    tokio::spawn(async move {
        if let Err(e) = connection::record_to_file(&url, &output_path).await {
            tracing::error!("Recording failed: {}", e);
        }
    });
    Ok("Recording started".to_string())
}
```

```rust
// commands/mod.rs
pub mod stream_commands;
```

- [ ] **Step 4: Wire up AppState and commands in `lib.rs`**

```rust
mod app_state;
mod commands;
mod errors;
mod portable;
mod profile;
mod settings;
mod stream;

use app_state::AppState;
use settings::GlobalSettings;
use profile::Profile;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            portable::ensure_data_dirs()?;
            Ok(())
        })
        .manage({
            let settings = GlobalSettings::load().expect("Failed to load settings");
            let profile = Profile::load(&settings.active_profile).expect("Failed to load profile");
            AppState::new(settings, profile)
        })
        .invoke_handler(tauri::generate_handler![
            commands::stream_commands::start_test_recording,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Update `src/App.tsx` with test recording button**

```tsx
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

function App() {
  const [status, setStatus] = useState("idle");
  const testUrl = "https://ice5.somafm.com/groovesalad-128-mp3";

  const handleRecord = async () => {
    setStatus("recording...");
    try {
      const result = await invoke("start_test_recording", { url: testUrl });
      setStatus(String(result));
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-200">
      <h1 className="text-2xl font-bold">Tapir — Walking Skeleton</h1>
      <p className="text-slate-400">URL: {testUrl}</p>
      <button
        onClick={handleRecord}
        className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
      >
        Start Test Recording
      </button>
      <p className="text-sm text-slate-400">Status: {status}</p>
    </div>
  );
}

export default App;
```

- [ ] **Step 6: Verify end-to-end — click Record → file created**

Run: `pnpm tauri dev`
1. Click "Start Test Recording"
2. Wait 5-10 seconds, then close the window (the stream is infinite)
3. Check `data/recordings/test_recording.mp3` exists and is > 0 bytes
4. Verify the file plays in a media player (raw MP3 bytes with interleaved ICY metadata — may have glitches, that's expected at this stage)

Expected: File exists with recorded audio data. Architecture validated: Tauri IPC → Rust → reqwest → file I/O.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/app_state.rs src-tauri/src/stream/ src-tauri/src/commands/ src-tauri/src/lib.rs src/App.tsx
git commit -m "feat: walking skeleton — end-to-end recording via IPC"
```

---

## Stage 2: Full Phase 1 Scope (Tasks 5-17)

> Builds on the Walking Skeleton to deliver the complete MVP with ICY metadata parsing, track splitting, tagging, full UI, and accessibility.

---

### Task 5: Stream Connection with ICY Metadata

**Files:**
- Rewrite: `src-tauri/src/stream/connection.rs`
- Create: `src-tauri/src/stream/format.rs`

- [ ] **Step 1: Rewrite `stream/connection.rs` — proper ICY connection**

Replace the minimal connection with a full implementation using `icy-metadata` crate. The connection should:
- Send `Icy-MetaData: 1` header
- Parse ICY response headers: `icy-name`, `icy-genre`, `icy-url`, `icy-br`, `content-type`, `icy-metaint`
- Return a struct `IcyConnection` holding the parsed headers and the byte stream
- Implement ICY metadata encoding: try UTF-8 first, fallback to latin-1, apply NFC normalization (as per `architecture.md` §5.1.1)

```rust
pub struct IcyConnection {
    pub icy_name: Option<String>,
    pub icy_genre: Option<String>,
    pub icy_url: Option<String>,
    pub bitrate: Option<u32>,
    pub content_type: Option<String>,
    pub stream: IcyStream,  // the actual byte stream with metadata extraction
}

pub struct TrackMetadata {
    pub artist: String,
    pub title: String,
}
```

Reference `docs/architecture.md` §5.1.1 for the `decode_icy_metadata` algorithm.

- [ ] **Step 2: Create `stream/format.rs` — format detection**

Detect audio format from content-type header and magic bytes:

```rust
use crate::profile::AudioFormat;

pub fn detect_from_content_type(content_type: &str) -> Option<AudioFormat> {
    match content_type {
        "audio/mpeg" | "audio/mp3" => Some(AudioFormat::Mp3),
        "audio/aac" | "audio/aacp" | "audio/x-aac" => Some(AudioFormat::Aac),
        _ => None,
    }
}

pub fn detect_from_magic_bytes(bytes: &[u8]) -> Option<AudioFormat> {
    if bytes.len() < 2 { return None; }
    // MP3: sync word 0xFF followed by 0xFB, 0xF3, or 0xF2
    if bytes[0] == 0xFF && (bytes[1] & 0xE0 == 0xE0) {
        return Some(AudioFormat::Mp3);
    }
    // AAC ADTS: sync word 0xFF followed by 0xF1 or 0xF9
    if bytes[0] == 0xFF && (bytes[1] == 0xF1 || bytes[1] == 0xF9) {
        return Some(AudioFormat::Aac);
    }
    None
}
```

- [ ] **Step 3: Update `stream/mod.rs`**

```rust
pub mod connection;
pub mod format;
```

- [ ] **Step 4: Verify — connect to test stream and log ICY headers**

Write a temporary test in `start_test_recording` that connects, logs ICY headers, and reads a few metadata blocks. Verify artist/title changes are detected.

Run: `pnpm tauri dev`
Expected: Logs show ICY headers (icy-name, icy-br) and metadata changes (StreamTitle=...).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/stream/
git commit -m "feat: ICY connection with metadata parsing and format detection"
```

---

### Task 6: Filename Sanitization

**Files:**
- Create: `src-tauri/src/sanitize.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `sanitize.rs`**

Implement template rendering, forbidden character replacement, trailing dots/spaces trim, collision avoidance, and case correction:

```rust
use chrono::Local;
use std::path::{Path, PathBuf};

/// Render filename template with metadata placeholders.
/// %a = artist, %t = title, %s = station, %n = track number,
/// %d = date (YYYY-MM-DD), %time = time (HH-MM-SS)
pub fn render_template(
    template: &str,
    artist: &str,
    title: &str,
    station: &str,
    track_number: u32,
) -> String { /* ... */ }

/// Replace Windows-forbidden characters: \ / : * ? " < > | → _
/// Trim trailing dots and spaces from each path component.
pub fn sanitize_filename(name: &str) -> String { /* ... */ }

/// Title Case correction: "artist - title" → "Artist - Title"
pub fn auto_correct_case(s: &str) -> String { /* ... */ }

/// If file already exists, append _2, _3, etc.
pub fn resolve_collision(path: &Path) -> PathBuf { /* ... */ }

/// Full pipeline: render → sanitize → case correct → resolve collision
pub fn build_track_path(
    output_dir: &Path,
    template: &str,
    artist: &str,
    title: &str,
    station: &str,
    track_number: u32,
    auto_correct: bool,
    extension: &str,
) -> PathBuf { /* ... */ }
```

- [ ] **Step 2: Register module in `lib.rs`**

Add `mod sanitize;`

- [ ] **Step 3: Verify with manual test — template rendering and sanitization**

Test these cases manually or with a temporary test:
- `%a - %t` with artist `Artist/Name` → `Artist_Name - Title`
- Collision: create file, call again → `_2` suffix
- Case correction: `"unknown artist - untitled"` → `"Unknown Artist - Untitled"`
- Trailing dots: `"name..."` → `"name"`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/sanitize.rs src-tauri/src/lib.rs
git commit -m "feat: filename template rendering with sanitization and collision avoidance"
```

---

### Task 7: Playlist Parsing

**Files:**
- Create: `src-tauri/src/stream/playlist.rs`
- Modify: `src-tauri/src/stream/mod.rs`

- [ ] **Step 1: Create `stream/playlist.rs`**

```rust
use crate::errors::RadioError;

/// Parse PLS playlist, return first stream URL.
pub fn parse_pls(content: &str) -> Result<String, RadioError> {
    for line in content.lines() {
        let line = line.trim();
        if let Some(url) = line.strip_prefix("File1=") {
            if !url.is_empty() {
                return Ok(url.to_string());
            }
        }
    }
    Err(RadioError::Format("No File1= entry found in PLS".to_string()))
}

/// Parse M3U playlist, return first stream URL.
pub fn parse_m3u(content: &str) -> Result<String, RadioError> {
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        return Ok(line.to_string());
    }
    Err(RadioError::Format("No stream URL found in M3U".to_string()))
}

/// Detect playlist type by URL extension or content-type, fetch and parse.
pub async fn resolve_playlist_url(url: &str) -> Result<String, RadioError> {
    let lower = url.to_lowercase();
    if !lower.ends_with(".pls") && !lower.ends_with(".m3u") && !lower.ends_with(".m3u8") {
        return Ok(url.to_string()); // Not a playlist — return as-is
    }

    let client = reqwest::Client::new();
    let content = client.get(url).send().await?.text().await?;

    if lower.ends_with(".pls") {
        parse_pls(&content)
    } else {
        parse_m3u(&content)
    }
}
```

- [ ] **Step 2: Update `stream/mod.rs`**

```rust
pub mod connection;
pub mod format;
pub mod playlist;
```

- [ ] **Step 3: Verify — resolve a SomaFM PLS URL**

Test with `https://somafm.com/groovesalad.pls` → should resolve to a direct `ice*.somafm.com` URL.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/stream/playlist.rs src-tauri/src/stream/mod.rs
git commit -m "feat: PLS and M3U playlist parsing"
```

---

### Task 8: Tags Writer

**Files:**
- Create: `src-tauri/src/tags/mod.rs`
- Create: `src-tauri/src/tags/writer.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `tags/writer.rs`**

Write ID3v2 tags for MP3 and M4A (iTunes ilst) tags for AAC files using `lofty`:

```rust
use crate::errors::RadioError;
use crate::profile::AudioFormat;
use lofty::prelude::*;
use lofty::tag::{Tag, TagType, Accessor};
use std::path::Path;

pub fn write_tags(
    path: &Path,
    format: &AudioFormat,
    artist: &str,
    title: &str,
    album: &str,
    station: &str,
) -> Result<(), RadioError> {
    let tag_type = match format {
        AudioFormat::Mp3 => TagType::Id3v2,
        AudioFormat::Aac => TagType::Mp4Ilst,
    };

    let mut tag = Tag::new(tag_type);
    tag.set_artist(artist.to_string());
    tag.set_title(title.to_string());
    if !album.is_empty() {
        tag.set_album(album.to_string());
    }
    // Station name as comment
    tag.set_comment(format!("Recorded from: {}", station));

    tag.save_to_path(path, lofty::config::WriteOptions::default())
        .map_err(|e| RadioError::Format(format!("Failed to write tags: {}", e)))?;

    Ok(())
}
```

- [ ] **Step 2: Create `tags/mod.rs`**

```rust
pub mod writer;
```

- [ ] **Step 3: Register module in `lib.rs`**

Add `mod tags;`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/tags/ src-tauri/src/lib.rs
git commit -m "feat: ID3v2 and M4A tag writer via lofty"
```

---

### Task 9: Track Splitter + Recorder

**Files:**
- Create: `src-tauri/src/stream/splitter.rs`
- Create: `src-tauri/src/stream/recorder.rs`
- Modify: `src-tauri/src/stream/mod.rs`

- [ ] **Step 1: Create `stream/splitter.rs`**

Implement track splitting logic from spec §3.3:

```rust
use crate::stream::connection::TrackMetadata;

pub struct SplitterConfig {
    pub skip_first_incomplete_track: bool,
    pub skip_short_tracks_ms: u32,
}

pub enum SplitAction {
    /// Start writing to a new track file
    StartTrack(TrackMetadata),
    /// Finalize current track, start new one
    FinalizeAndStart {
        completed: TrackMetadata,
        new: TrackMetadata,
        duration_ms: u64,
    },
    /// Skip this segment (first incomplete or too short)
    Skip,
}

pub struct Splitter {
    config: SplitterConfig,
    current_metadata: Option<TrackMetadata>,
    is_first_track: bool,
    track_start_time: Option<std::time::Instant>,
}

impl Splitter {
    pub fn new(config: SplitterConfig) -> Self { /* ... */ }

    /// Called when new metadata arrives. Returns what action to take.
    pub fn on_metadata_change(&mut self, new_meta: TrackMetadata) -> SplitAction { /* ... */ }
}
```

- [ ] **Step 2: Create `stream/recorder.rs`**

File writer that manages stream file + current track file. Handles `_incomplete` suffix and rename on finalization:

```rust
use crate::errors::RadioError;
use crate::profile::{AudioFormat, RecordingSettings};
use crate::sanitize;
use crate::tags;
use std::path::{Path, PathBuf};
use tokio::fs::File;
use tokio::io::AsyncWriteExt;

pub struct Recorder {
    stream_file: Option<File>,
    track_file: Option<File>,
    track_incomplete_path: Option<PathBuf>,
    track_final_path: Option<PathBuf>,
    output_dir: PathBuf,
    settings: RecordingSettings,
    format: AudioFormat,
    station_name: String,
    track_number: u32,
}

impl Recorder {
    pub fn new(output_dir: PathBuf, settings: RecordingSettings, format: AudioFormat, station_name: String) -> Self { /* ... */ }

    /// Write bytes to stream file (always) and track file (if active)
    pub async fn write_bytes(&mut self, bytes: &[u8]) -> Result<(), RadioError> { /* ... */ }

    /// Start a new track file using incomplete template
    pub async fn start_track(&mut self, artist: &str, title: &str) -> Result<(), RadioError> { /* ... */ }

    /// Finalize current track: flush, write tags, rename from _incomplete to final name
    pub async fn finalize_track(&mut self, artist: &str, title: &str, duration_ms: u64) -> Result<Option<PathBuf>, RadioError> { /* ... */ }

    /// Close all files (on stop/shutdown)
    pub async fn close(&mut self) -> Result<(), RadioError> { /* ... */ }
}
```

Key behaviors:
- Track files are created with `incompleteFileNameTemplate` → renamed to `fileNameTemplate` on finalization
- If `duration_ms < skip_short_tracks_ms` → delete the file instead of renaming
- Stream file uses `streamFileNameTemplate`
- Collision avoidance via `sanitize::resolve_collision`
- Tags written via `tags::writer::write_tags` on finalization

- [ ] **Step 3: Update `stream/mod.rs`**

```rust
pub mod connection;
pub mod format;
pub mod playlist;
pub mod recorder;
pub mod splitter;
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/stream/
git commit -m "feat: track splitter and file recorder with _incomplete lifecycle"
```

---

### Task 10: Stream Manager

**Files:**
- Create: `src-tauri/src/stream/manager.rs`
- Modify: `src-tauri/src/app_state.rs`
- Modify: `src-tauri/src/stream/mod.rs`

- [ ] **Step 1: Create `stream/manager.rs`**

Central coordinator for all active recordings. Implements the Hybrid C architecture:

```rust
use crate::errors::RadioError;
use crate::profile::{StreamInfo, RecordingSettings, Profile};
use crate::stream::{connection, recorder, splitter, format};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use tokio::task::JoinHandle;

// Runtime-only types (not persisted)
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamStatus {
    pub stream_id: String,
    pub state: StreamState,
    pub current_track: Option<TrackInfo>,
    pub recording_started_at: Option<String>,
    pub bytes_recorded: u64,
    pub tracks_recorded: u32,
    pub error: Option<String>,
    pub reconnect_attempt: Option<u32>,
}

// ... StreamState enum, TrackInfo struct (from data-models.md §4.1)

struct StreamEntry {
    info: StreamInfo,
    status: StreamStatus,
    cancel_token: CancellationToken,
    join_handle: JoinHandle<()>,
}

pub struct StreamManager {
    entries: HashMap<String, StreamEntry>,
    app_handle: AppHandle,
}

impl StreamManager {
    pub fn new(app_handle: AppHandle) -> Self { /* ... */ }

    pub fn start_recording(
        &mut self,
        stream_info: StreamInfo,
        recording_settings: RecordingSettings,
        manager_ref: Arc<RwLock<Self>>,
    ) -> Result<(), RadioError> {
        // 1. Create CancellationToken
        // 2. Create StreamEntry with idle status
        // 3. tokio::spawn(recording_task(...))
        // 4. Store entry in self.entries
    }

    pub fn stop_recording(&mut self, stream_id: &str) -> Result<(), RadioError> {
        // Cancel token, entry will be cleaned up when task finishes
    }

    pub fn stop_all(&mut self) {
        // Cancel all tokens
    }

    pub fn get_status(&self, stream_id: &str) -> Option<StreamStatus> { /* ... */ }
    pub fn get_all_statuses(&self) -> Vec<StreamStatus> { /* ... */ }
    pub fn get_all_stream_info(&self) -> Vec<StreamInfo> { /* ... */ }
}
```

The `recording_task` function (spawned per stream):

```rust
async fn recording_task(
    stream_info: StreamInfo,
    recording_settings: RecordingSettings,
    cancel_token: CancellationToken,
    app_handle: AppHandle,
    manager: Arc<RwLock<StreamManager>>,
) {
    // 1. Update status → connecting
    // 2. Connect via connection::connect()
    // 3. Detect format
    // 4. Create Recorder and Splitter
    // 5. Read loop:
    //    - tokio::select! { cancel_token.cancelled() => break, chunk = stream.next() => process }
    //    - On metadata change → splitter.on_metadata_change() → recorder actions
    //    - Update status in manager (brief write lock)
    //    - Emit IPC events via app_handle
    // 6. On error → reconnect loop with exponential backoff
    // 7. On cancel → recorder.close(), update status → stopped
}
```

- [ ] **Step 2: Update `app_state.rs` — add StreamManager**

```rust
use crate::stream::manager::StreamManager;

pub struct AppState {
    pub stream_manager: Arc<RwLock<StreamManager>>,
    pub settings: Arc<RwLock<GlobalSettings>>,
    pub active_profile: Arc<RwLock<Profile>>,
}
```

- [ ] **Step 3: Update `stream/mod.rs`**

Add `pub mod manager;`

- [ ] **Step 4: Update `lib.rs` — initialize StreamManager in setup**

In `setup()`, create `StreamManager::new(app.handle().clone())` and store it in `AppState`.

- [ ] **Step 5: Verify — start recording a real stream with track splitting**

Test with SomaFM Groove Salad. Wait for a track change. Verify:
- Stream file created continuously
- Track files created with `_incomplete` suffix
- On metadata change: previous track renamed, tags written
- Logs show metadata changes

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/stream/manager.rs src-tauri/src/app_state.rs src-tauri/src/stream/mod.rs src-tauri/src/lib.rs
git commit -m "feat: StreamManager with per-stream tasks, reconnect, and track splitting"
```

---

### Task 11: IPC Commands (Full)

**Files:**
- Rewrite: `src-tauri/src/commands/stream_commands.rs`
- Create: `src-tauri/src/commands/settings_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Rewrite `commands/stream_commands.rs`**

Replace the test command with full IPC commands from spec §4.1:

```rust
#[tauri::command]
pub async fn get_streams(state: tauri::State<'_, AppState>) -> Result<Vec<StreamInfo>, String> { /* read from profile */ }

#[tauri::command]
pub async fn add_stream(url: String, name: Option<String>, state: tauri::State<'_, AppState>) -> Result<StreamInfo, String> {
    // 1. Resolve PLS/M3U via playlist::resolve_playlist_url
    // 2. Create StreamInfo with nanoid, resolved URL
    // 3. Add to profile.streams
    // 4. Save profile
    // 5. Return StreamInfo
}

#[tauri::command]
pub async fn remove_stream(stream_id: String, state: tauri::State<'_, AppState>) -> Result<(), String> { /* ... */ }

#[tauri::command]
pub async fn update_stream(stream_id: String, name: String, state: tauri::State<'_, AppState>) -> Result<StreamInfo, String> { /* ... */ }

#[tauri::command]
pub async fn start_recording(stream_id: String, state: tauri::State<'_, AppState>, app: tauri::AppHandle) -> Result<(), String> { /* ... */ }

#[tauri::command]
pub async fn stop_recording(stream_id: String, state: tauri::State<'_, AppState>) -> Result<(), String> { /* ... */ }

#[tauri::command]
pub async fn stop_all_recordings(state: tauri::State<'_, AppState>) -> Result<(), String> { /* ... */ }

#[tauri::command]
pub async fn get_stream_status(stream_id: String, state: tauri::State<'_, AppState>) -> Result<StreamStatus, String> { /* ... */ }

#[tauri::command]
pub async fn get_all_statuses(state: tauri::State<'_, AppState>) -> Result<Vec<StreamStatus>, String> { /* ... */ }
```

- [ ] **Step 2: Create `commands/settings_commands.rs`**

```rust
#[tauri::command]
pub async fn get_settings(state: tauri::State<'_, AppState>) -> Result<GlobalSettings, String> { /* ... */ }

#[tauri::command]
pub async fn save_settings(settings: GlobalSettings, state: tauri::State<'_, AppState>) -> Result<(), String> { /* ... */ }
```

- [ ] **Step 3: Update `commands/mod.rs` and register all commands in `lib.rs`**

```rust
.invoke_handler(tauri::generate_handler![
    commands::stream_commands::get_streams,
    commands::stream_commands::add_stream,
    commands::stream_commands::remove_stream,
    commands::stream_commands::update_stream,
    commands::stream_commands::start_recording,
    commands::stream_commands::stop_recording,
    commands::stream_commands::stop_all_recordings,
    commands::stream_commands::get_stream_status,
    commands::stream_commands::get_all_statuses,
    commands::settings_commands::get_settings,
    commands::settings_commands::save_settings,
])
```

- [ ] **Step 4: Verify — invoke commands from browser devtools**

In devtools console:
```js
await window.__TAURI__.core.invoke('add_stream', { url: 'https://ice5.somafm.com/groovesalad-128-mp3' })
await window.__TAURI__.core.invoke('get_streams')
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/ src-tauri/src/lib.rs
git commit -m "feat: full IPC command handlers for streams and settings"
```

---

### Task 12: Graceful Shutdown

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add shutdown handler in `lib.rs` setup**

```rust
.on_window_event(|window, event| {
    if let tauri::WindowEvent::CloseRequested { .. } = event {
        let app = window.app_handle().clone();
        tauri::async_runtime::block_on(async {
            let state = app.state::<AppState>();
            // 1. Stop all recordings
            let mut manager = state.stream_manager.write().await;
            manager.stop_all();
            // 2. Save active recording URLs to profile (URLs, not IDs — per data-models.md §2)
            let active_ids: Vec<String> = manager.get_all_statuses()
                .iter()
                .filter(|s| s.state != StreamState::Idle && s.state != StreamState::Error)
                .map(|s| s.stream_id.clone())
                .collect();
            // Map stream IDs to URLs via StreamInfo
            let profile_read = state.active_profile.read().await;
            let urls: Vec<String> = active_ids.iter()
                .filter_map(|id| profile_read.streams.iter().find(|s| s.id == *id).map(|s| s.url.clone()))
                .collect();
            drop(profile_read);
            let mut profile = state.active_profile.write().await;
            profile.active_recording_urls = urls;
            let _ = profile.save();
            // 3. Wait for tasks to finish (with timeout)
            drop(manager);
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        });
    }
})
```

- [ ] **Step 2: Verify — start recording, close window, check files saved**

Run: `pnpm tauri dev`
1. Add a stream, start recording
2. Close the window
3. Verify `_incomplete` files are saved (not deleted)
4. Verify `activeRecordingUrls` is populated in the profile file

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: graceful shutdown with active recording URL persistence"
```

---

### Task 13: Frontend Stores + Hooks + Lib

**Files:**
- Create: `src/stores/streams.ts`
- Create: `src/stores/profile.ts`
- Create: `src/stores/settings.ts`
- Create: `src/stores/navigation.ts`
- Create: `src/stores/toasts.ts`
- Create: `src/stores/announcer.ts`
- Create: `src/hooks/useTauriEvent.ts`
- Create: `src/hooks/useAnnounce.ts`
- Create: `src/lib/tauri.ts`
- Create: `src/lib/formatters.ts`

- [ ] **Step 1: Create `src/lib/tauri.ts` — typed invoke wrappers**

```typescript
import { invoke } from "@tauri-apps/api/core";
// Type imports from a shared types file or inline

export async function getStreams(): Promise<StreamInfo[]> {
  return invoke("get_streams");
}
export async function addStream(url: string, name?: string): Promise<StreamInfo> {
  return invoke("add_stream", { url, name });
}
export async function removeStream(streamId: string): Promise<void> {
  return invoke("remove_stream", { streamId });
}
export async function updateStream(streamId: string, name: string): Promise<StreamInfo> {
  return invoke("update_stream", { streamId, name });
}
export async function startRecording(streamId: string): Promise<void> {
  return invoke("start_recording", { streamId });
}
export async function stopRecording(streamId: string): Promise<void> {
  return invoke("stop_recording", { streamId });
}
export async function stopAllRecordings(): Promise<void> {
  return invoke("stop_all_recordings");
}
export async function getStreamStatus(streamId: string): Promise<StreamStatus> {
  return invoke("get_stream_status", { streamId });
}
export async function getAllStatuses(): Promise<StreamStatus[]> {
  return invoke("get_all_statuses");
}
export async function getSettings(): Promise<GlobalSettings> {
  return invoke("get_settings");
}
export async function saveSettings(settings: GlobalSettings): Promise<void> {
  return invoke("save_settings", { settings });
}
```

Include TypeScript type definitions for `StreamInfo`, `StreamStatus`, `GlobalSettings`, `Profile`, etc. — matching the Rust structs from `data-models.md`.

- [ ] **Step 2: Create `src/lib/formatters.ts`**

```typescript
export function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatBitrate(kbps: number | null): string {
  if (kbps == null) return "—";
  return `${kbps} kbps`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

- [ ] **Step 3: Create stores — `streams.ts`, `settings.ts`, `profile.ts`, `navigation.ts`, `toasts.ts`, `announcer.ts`**

Each store is a Nanostores atom or map. Example for `streams.ts`:

```typescript
import { atom, map } from "nanostores";
import type { StreamInfo, StreamStatus } from "../lib/tauri";

export const $streams = atom<StreamInfo[]>([]);
export const $statuses = map<Record<string, StreamStatus>>({});

export function updateStreamStatus(streamId: string, status: Partial<StreamStatus>) {
  $statuses.setKey(streamId, { ...$statuses.get()[streamId], ...status } as StreamStatus);
}
```

- [ ] **Step 4: Create hooks — `useTauriEvent.ts`, `useAnnounce.ts`**

```typescript
// hooks/useTauriEvent.ts
import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
  useEffect(() => {
    let unlisten: UnlistenFn;
    listen<T>(event, (e) => handler(e.payload)).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [event, handler]);
}
```

```typescript
// hooks/useAnnounce.ts
import { $announcer } from "../stores/announcer";

export function useAnnounce() {
  return (message: string, priority: "polite" | "assertive" = "polite") => {
    $announcer.set({ message, priority });
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add src/stores/ src/hooks/ src/lib/
git commit -m "feat: frontend stores, hooks, typed IPC wrappers, and formatters"
```

---

### Task 14: Paraglide.js i18n Setup

**Files:**
- Create: `src/i18n/messages/uk.json`
- Create: `src/i18n/messages/en.json`
- Modify: `vite.config.ts`
- Modify: `package.json` (add paraglide dependencies)

- [ ] **Step 1: Install Paraglide.js**

```bash
pnpm add @inlang/paraglide-js
pnpm add -D @inlang/paraglide-vite
```

- [ ] **Step 2: Create message files**

`src/i18n/messages/uk.json`:
```json
{
  "app_name": "Tapir",
  "streams_section": "Потоки",
  "browser_section": "Браузер",
  "wishlist_section": "Вішліст",
  "schedule_section": "Розклад",
  "songs_section": "Пісні",
  "add_stream": "Додати потік",
  "start_recording": "Почати запис",
  "stop_recording": "Зупинити запис",
  "stop_all": "Зупинити всі",
  "remove_stream": "Видалити потік",
  "stream_url": "URL потоку",
  "stream_name": "Назва (опціонально)",
  "cancel": "Скасувати",
  "save": "Зберегти",
  "delete": "Видалити",
  "confirm_delete_stream": "Видалити потік \"{name}\"?",
  "select_stream": "Вибрати потік: {name}",
  "status_idle": "Очікування",
  "status_connecting": "Підключення...",
  "status_recording": "REC",
  "status_reconnecting": "Перепідключення...",
  "status_error": "Помилка",
  "recording_started": "Запис розпочато: {name}",
  "recording_stopped": "Запис зупинено: {name}",
  "connection_error": "Помилка з'єднання: {name}",
  "reconnecting": "Перепідключення: {name}, спроба {attempt}",
  "stream_added": "Потік додано: {name}",
  "stream_removed": "Потік видалено: {name}",
  "welcome_first_run": "Ласкаво просимо до Tapir. Натисніть Enter щоб додати перший потік.",
  "empty_state_title": "Потоків ще немає",
  "empty_state_description": "Додайте перший потік для запису.",
  "recordings_count": "{count, plural, one {# запис} few {# записи} many {# записів} other {# записів}}",
  "free_space": "Вільно: {space}",
  "main_navigation": "Головна навігація",
  "command_palette_placeholder": "Введіть команду або назву потоку...",
  "phase_not_available": "Буде доступно у Фазі {phase}",
  "column_name": "Назва",
  "column_track": "Поточний трек",
  "column_bitrate": "Бітрейт",
  "column_duration": "Тривалість",
  "column_status": "Статус"
}
```

`src/i18n/messages/en.json`: Same keys with English translations.

- [ ] **Step 3: Configure Paraglide in `vite.config.ts`**

```typescript
import paraglide from "@inlang/paraglide-vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    paraglide({
      project: "./project.inlang",
      outdir: "./src/i18n/paraglide",
    }),
  ],
  // ...
});
```

Create `project.inlang/settings.json`:

```json
{
  "$schema": "https://inlang.com/schema/project-settings",
  "sourceLanguageTag": "uk",
  "languageTags": ["uk", "en"],
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/message-lint-rule-empty-pattern@latest/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/message-lint-rule-missing-translation@latest/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@latest/dist/index.js"
  ],
  "plugin.inlang.messageFormat": {
    "pathPattern": "./src/i18n/messages/{languageTag}.json"
  }
}
```

- [ ] **Step 4: Verify — import and use a translated string**

```tsx
import * as m from "./i18n/paraglide/messages";
// Use: m.app_name()
```

- [ ] **Step 5: Commit**

```bash
git add src/i18n/ vite.config.ts project.inlang/ package.json pnpm-lock.yaml
git commit -m "feat: Paraglide.js i18n setup with Ukrainian and English messages"
```

---

### Task 15: Core UI Components

**Files:**
- Rewrite: `src/App.tsx`
- Create: `src/components/layout/ActivityBar.tsx`
- Create: `src/components/layout/SectionHeader.tsx`
- Create: `src/components/layout/StatusBar.tsx`
- Create: `src/components/common/LiveAnnouncer.tsx`
- Create: `src/components/common/ToastContainer.tsx`
- Create: `src/components/common/ErrorBoundary.tsx`

- [ ] **Step 1: Create `LiveAnnouncer.tsx`**

Two `sr-only` aria-live containers. Subscribes to `$announcer` store:

```tsx
import { useStore } from "@nanostores/react";
import { $announcer } from "../../stores/announcer";
import { useEffect, useRef } from "react";

export function LiveAnnouncer() {
  const announcement = useStore($announcer);
  const politeRef = useRef<HTMLDivElement>(null);
  const assertiveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!announcement.message) return;
    const ref = announcement.priority === "assertive" ? assertiveRef : politeRef;
    if (ref.current) {
      ref.current.textContent = "";
      // Force re-announcement by clearing then setting
      requestAnimationFrame(() => {
        if (ref.current) ref.current.textContent = announcement.message;
      });
    }
  }, [announcement]);

  return (
    <>
      <div ref={politeRef} aria-live="polite" aria-atomic="true" className="sr-only" />
      <div ref={assertiveRef} aria-live="assertive" aria-atomic="true" className="sr-only" />
    </>
  );
}
```

- [ ] **Step 2: Create `ToastContainer.tsx`**

Bottom-right positioned. Auto-dismiss after 5 seconds:

```tsx
import { useStore } from "@nanostores/react";
import { $toasts, removeToast } from "../../stores/toasts";
import { useEffect } from "react";

export function ToastContainer() {
  const toasts = useStore($toasts);

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2" role="log" aria-live="polite">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `ErrorBoundary.tsx`**

Standard React error boundary with fallback UI.

- [ ] **Step 4: Create `ActivityBar.tsx`**

Left sidebar with lucide-react icons. Only "Streams" (Radio) is active. Others show tooltip with phase info. `aria-current="page"` on active section. Profile switcher placeholder at bottom (disabled):

```tsx
import { Radio, Globe, Heart, Calendar, Music, Settings } from "lucide-react";
import * as m from "../../i18n/paraglide/messages";
// ...
<nav role="navigation" aria-label={m.main_navigation()}>
  {sections.map(section => (
    <button
      key={section.id}
      aria-current={activeSection === section.id ? "page" : undefined}
      disabled={section.disabled}
      title={section.disabled ? m.phase_not_available({ phase: section.phase }) : section.label}
      // ...
    >
      <section.icon aria-hidden="true" size={20} />
    </button>
  ))}
</nav>
```

- [ ] **Step 5: Create `SectionHeader.tsx`**

Top bar: section title (h1) + Ctrl+K button:

```tsx
export function SectionHeader({ title }: { title: string }) {
  return (
    <header className="flex items-center justify-between border-b border-slate-700 px-4 py-2">
      <h1 className="text-lg font-semibold">{title}</h1>
      <button aria-label="Command Palette (Ctrl+K)" /* ... */>
        <Search aria-hidden="true" size={16} />
      </button>
    </header>
  );
}
```

- [ ] **Step 6: Create `StatusBar.tsx`**

Bottom bar showing recording count, free disk space, longest recording. `role="status"`, `aria-live="polite"`:

```tsx
export function StatusBar() {
  // Subscribe to $statuses to compute active recording count and longest duration
  return (
    <footer role="status" aria-live="polite" className="border-t border-slate-700 px-4 py-1.5 text-xs text-slate-400">
      {/* recording count | free space | longest recording */}
    </footer>
  );
}
```

- [ ] **Step 7: Rewrite `App.tsx` — full layout**

```tsx
import { ActivityBar } from "./components/layout/ActivityBar";
import { SectionHeader } from "./components/layout/SectionHeader";
import { StatusBar } from "./components/layout/StatusBar";
import { StreamsPanel } from "./components/streams/StreamsPanel";
import { LiveAnnouncer } from "./components/common/LiveAnnouncer";
import { ToastContainer } from "./components/common/ToastContainer";
import { ErrorBoundary } from "./components/common/ErrorBoundary";

function App() {
  // On mount: load settings, streams, subscribe to Tauri events
  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-slate-950 text-slate-200">
        <ActivityBar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <SectionHeader title="Потоки" />
          <StreamsPanel />
          <StatusBar />
        </div>
      </div>
      <LiveAnnouncer />
      <ToastContainer />
    </ErrorBoundary>
  );
}
```

Initialize Tauri event listeners in `useEffect` on mount: subscribe to `recording-status`, `track-changed`, `stream-error`, `recording-started`, `recording-completed` → update stores.

- [ ] **Step 8: Verify — layout renders correctly**

Run: `pnpm tauri dev`
Expected: ActivityBar on left (48px), SectionHeader at top, empty content area, StatusBar at bottom. Only "Streams" icon is active.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx src/components/
git commit -m "feat: core layout — ActivityBar, SectionHeader, StatusBar, LiveAnnouncer, ToastContainer"
```

---

### Task 16: Streams UI — Table, Dialog, Empty State

**Files:**
- Create: `src/components/streams/StreamsPanel.tsx`
- Create: `src/components/streams/StreamTable.tsx`
- Create: `src/components/streams/StreamRow.tsx`
- Create: `src/components/streams/AddStreamDialog.tsx`
- Create: `src/components/common/ConfirmDialog.tsx`

- [ ] **Step 1: Create `StreamsPanel.tsx`**

Container with toolbar and conditional rendering (table vs empty state):

```tsx
export function StreamsPanel() {
  const streams = useStore($streams);
  const [showAddDialog, setShowAddDialog] = useState(false);

  if (streams.length === 0) {
    return <EmptyState onAdd={() => setShowAddDialog(true)} />;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Toolbar onAdd={() => setShowAddDialog(true)} /* ... */ />
      <StreamTable />
      {showAddDialog && <AddStreamDialog onClose={() => setShowAddDialog(false)} />}
    </div>
  );
}
```

Empty state: text + CTA button with autoFocus. First-run LiveAnnouncer announcement.

- [ ] **Step 2: Create `StreamTable.tsx` with React Aria TableView**

```tsx
import { Cell, Column, Row, Table, TableBody, TableHeader } from "react-aria-components";

export function StreamTable() {
  const streams = useStore($streams);
  const statuses = useStore($statuses);

  return (
    <Table aria-label="Потоки" sortDescriptor={sortDescriptor} onSortChange={setSortDescriptor}>
      <TableHeader>
        <Column id="select" width={40}>{/* checkbox */}</Column>
        <Column id="status" width={60}>{m.column_status()}</Column>
        <Column id="name" isRowHeader allowsSorting>{m.column_name()}</Column>
        <Column id="track">{m.column_track()}</Column>
        <Column id="bitrate" allowsSorting>{m.column_bitrate()}</Column>
        <Column id="duration">{m.column_duration()}</Column>
      </TableHeader>
      <TableBody items={sortedStreams}>
        {(stream) => <StreamRow stream={stream} status={statuses[stream.id]} />}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: Create `StreamRow.tsx`**

Row with status icon, checkbox with `aria-label="Вибрати потік: {name}"`, formatted data:

```tsx
export function StreamRow({ stream, status }: Props) {
  return (
    <Row id={stream.id}>
      <Cell>
        <input
          type="checkbox"
          aria-label={m.select_stream({ name: stream.name })}
        />
      </Cell>
      <Cell><StatusIcon state={status?.state ?? "idle"} /></Cell>
      <Cell>{stream.name}</Cell>
      <Cell>{status?.currentTrack ? `${status.currentTrack.artist} — ${status.currentTrack.title}` : "—"}</Cell>
      <Cell>{formatBitrate(stream.bitrate)}</Cell>
      <Cell>{status?.recordingStartedAt ? formatDuration(/* elapsed */) : "—"}</Cell>
    </Row>
  );
}
```

Status icon: idle (grey dot), connecting (yellow pulse), recording (red pulse + "REC"), reconnecting (yellow), error (red).

- [ ] **Step 4: Create `AddStreamDialog.tsx`**

React Aria Modal with focus trap. Fields: URL (required), Name (optional). Dual-mode (add/edit):

```tsx
import { Dialog, DialogTrigger, Modal, ModalOverlay } from "react-aria-components";

export function AddStreamDialog({ onClose, editStream }: Props) {
  return (
    <ModalOverlay className="fixed inset-0 z-50 bg-black/60">
      <Modal className="...">
        <Dialog aria-labelledby="dialog-title">
          <h2 id="dialog-title">{editStream ? "Редагувати потік" : m.add_stream()}</h2>
          <form onSubmit={handleSubmit}>
            <label>{m.stream_url()}<input type="url" required autoFocus /></label>
            <label>{m.stream_name()}<input type="text" /></label>
            <div className="flex gap-2">
              <button type="button" onClick={onClose}>{m.cancel()}</button>
              <button type="submit">{m.save()}</button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

- [ ] **Step 5: Create `ConfirmDialog.tsx`**

Generic confirmation dialog for destructive actions:

```tsx
export function ConfirmDialog({ title, message, onConfirm, onCancel }: Props) {
  return (
    <ModalOverlay>
      <Modal>
        <Dialog aria-labelledby="confirm-title" role="alertdialog">
          <h2 id="confirm-title">{title}</h2>
          <p>{message}</p>
          <div className="flex gap-2">
            <button onClick={onCancel} autoFocus>{m.cancel()}</button>
            <button onClick={onConfirm} className="bg-red-600">{m.delete()}</button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

- [ ] **Step 6: Wire keyboard handlers in `StreamsPanel`**

- `Delete` key → ConfirmDialog for selected stream
- `Enter` key → start/stop recording for selected stream

- [ ] **Step 7: Verify — full streams workflow**

Run: `pnpm tauri dev`
1. Empty state shown with CTA button
2. Click "Додати потік" → dialog opens with focus trap
3. Enter URL → stream appears in table
4. Click record → status changes, track info updates
5. Delete stream → confirm dialog → stream removed
6. Keyboard navigation works (Tab, Arrow, Enter, Space, Escape, Delete)

- [ ] **Step 8: Commit**

```bash
git add src/components/streams/ src/components/common/ConfirmDialog.tsx
git commit -m "feat: StreamTable, AddStreamDialog, empty state, and ConfirmDialog"
```

---

### Task 17: Command Palette + Final Integration

**Files:**
- Create: `src/components/common/CommandPalette.tsx`
- Modify: `src/App.tsx` — Ctrl+K handler, Tauri event subscriptions, first-run announcement

- [ ] **Step 1: Create `CommandPalette.tsx`**

Ctrl+K overlay with fuzzy search. `role="combobox"` + `role="listbox"`:

```tsx
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const streams = useStore($streams);

  const actions = [
    { id: "add", label: m.add_stream(), action: () => { /* open dialog */ } },
    { id: "start", label: m.start_recording(), action: () => { /* ... */ } },
    { id: "stop", label: m.stop_recording(), action: () => { /* ... */ } },
    { id: "stopAll", label: m.stop_all(), action: () => { /* ... */ } },
  ];

  const results = filterByQuery(query, [...actions, ...streams.map(/* ... */)]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-center pt-20" onClick={onClose}>
      <div className="w-[560px] bg-slate-800 rounded-lg shadow-2xl overflow-hidden" role="combobox">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={m.command_palette_placeholder()}
          className="w-full bg-transparent border-b border-slate-600 p-4 text-slate-200 outline-none"
          autoFocus
        />
        <ul role="listbox" className="max-h-80 overflow-y-auto">
          {results.map((result, i) => (
            <li
              key={result.id}
              role="option"
              aria-selected={i === selectedIndex}
              onClick={() => executeResult(result)}
              className="px-5 py-2.5 cursor-pointer hover:bg-blue-600/20"
            >
              {result.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire Ctrl+K in `App.tsx`**

```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "k") {
      e.preventDefault();
      $navigation.set({ ...$navigation.get(), commandPaletteOpen: !$navigation.get().commandPaletteOpen });
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);
```

- [ ] **Step 3: Add Tauri event subscriptions in `App.tsx`**

Subscribe to all backend events on mount and update stores + LiveAnnouncer:

```tsx
useTauriEvent<RecordingStatusPayload>("recording-status", (payload) => {
  updateStreamStatus(payload.streamId, { state: payload.status, error: payload.error });
  if (payload.status === "recording") announce(m.recording_started({ name: getStreamName(payload.streamId) }), "assertive");
  if (payload.status === "stopped") announce(m.recording_stopped({ name: getStreamName(payload.streamId) }), "assertive");
});

useTauriEvent<TrackChangedPayload>("track-changed", (payload) => {
  updateStreamStatus(payload.streamId, { currentTrack: { artist: payload.artist, title: payload.title } });
  announce(`${payload.artist} — ${payload.title}`, "polite");
});

useTauriEvent<StreamErrorPayload>("stream-error", (payload) => {
  addToast({ type: "error", message: payload.message });
  announce(m.connection_error({ name: getStreamName(payload.streamId) }), "assertive");
});
```

- [ ] **Step 4: Add first-run announcement**

```tsx
useEffect(() => {
  getStreams().then((streams) => {
    $streams.set(streams);
    if (streams.length === 0) {
      announce(m.welcome_first_run(), "assertive");
    }
  });
}, []);
```

- [ ] **Step 5: Set `<html lang="...">` based on settings**

```tsx
useEffect(() => {
  getSettings().then((settings) => {
    $settings.set(settings);
    document.documentElement.lang = settings.language === "uk-UA" ? "uk" : "en";
  });
}, []);
```

- [ ] **Step 6: Final end-to-end verification**

Run: `pnpm tauri dev`

Verify all Done Criteria from spec §9:
1. Add stream by URL (direct and PLS)
2. Record one or multiple streams simultaneously
3. Track splitting by ICY metadata
4. Tags written on finalization
5. Reconnection on disconnect (test: disconnect network briefly)
6. Files in `data/recordings/` with correct template
7. Full keyboard navigation
8. Screen reader announces track changes and recording status
9. Focus trap in dialogs
10. Portable structure works
11. UI strings via Paraglide.js
12. Empty state with CTA
13. First-run announcement
14. `aria-label` on checkboxes
15. `aria-current="page"` on ActivityBar

- [ ] **Step 7: Commit**

```bash
git add src/
git commit -m "feat: Command Palette, Tauri event integration, first-run announcement, i18n"
```

---

## Summary

| Stage | Tasks | What it delivers |
|-------|-------|-----------------|
| Walking Skeleton | 1-4 | Scaffold + portable paths + settings/profile + end-to-end recording IPC |
| Full Phase 1 | 5-17 | ICY connection, format detection, playlist parsing, tags, splitter, recorder, StreamManager, full IPC, graceful shutdown, stores/hooks, i18n, layout, StreamTable, AddStreamDialog, CommandPalette, accessibility |
