# System Tray (Phase 3A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Windows system tray icon with dynamic context menu, balloon notifications on track change, minimize-to-tray close behavior, and a native MessageBox quit confirmation when recordings are active.

**Architecture:** A new `tray` module owns icon setup, menu rebuild on state changes, and Win32 calls (balloon via Shell_NotifyIconW, quit confirm via MessageBoxW). State changes flow through call sites of existing emitters (`emit("player-status")`, `emit("recording-status")`, `emit("track-changed")`) so the tray reflects state without duplicating it. A shared `graceful_shutdown` is extracted from `lib.rs` so the close button and tray "Вихід" both use the same path.

**Tech Stack:** Tauri 2 (tray + menu APIs), `windows` crate (Win32 features only), tokio, existing Rust modules (`stream::manager`, `player::engine`, `app_state`).

**Spec:** [docs/superpowers/specs/2026-05-28-system-tray-design.md](../specs/2026-05-28-system-tray-design.md)

**Verify commands:**
- Build: `cd C:\dev\Tapir\src-tauri && cargo build --release`
- Lint: `cd C:\dev\Tapir\src-tauri && cargo clippy --all-targets -- -D warnings`
- Unit tests: `cd C:\dev\Tapir\src-tauri && cargo test --lib`
- Manual test: `cd C:\dev\Tapir && pnpm tauri dev` and exercise the acceptance scenarios

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `src-tauri/Cargo.toml` | **Modify** | Add `windows` crate dep with `Win32_Foundation`, `Win32_UI_Shell`, `Win32_UI_WindowsAndMessaging` features |
| `src-tauri/capabilities/default.json` | **Modify** | Add `core:tray:default`, `core:menu:default`, `core:window:allow-set-focus` |
| `src-tauri/src/app_state.rs` | **Modify** | Add `pub async fn graceful_shutdown(&AppHandle)` extracted from `lib.rs` |
| `src-tauri/src/lib.rs` | **Modify** | Call `tray::setup_tray` in `setup`; rewrite `on_window_event(CloseRequested)` to honor `minimize_to_tray` |
| `src-tauri/src/tray/mod.rs` | **Create** | Public API: `setup_tray`, `notify_state_changed`, snapshot types |
| `src-tauri/src/tray/menu.rs` | **Create** | `build_menu`, `tooltip`, `build_now_playing_label` |
| `src-tauri/src/tray/handlers.rs` | **Create** | `on_tray_icon_event`, `on_menu_event`, spawn handlers, `handle_quit` |
| `src-tauri/src/tray/notify.rs` | **Create** | Win32: `show_quit_confirm`, `show_balloon`, `show_balloon_throttled`, message-only window setup |
| `src-tauri/src/stream/manager.rs` | **Modify** | `emit_recording_status` + `emit_track_changed` call `tray::notify_state_changed` / `tray::notify::show_balloon_throttled` |
| `src-tauri/src/player/engine.rs` | **Modify** | Replace inline `emit("player-status", ...)` with helper `emit_player_status` that also notifies tray |

---

## Chunk 1: Foundations (deps, capabilities, shutdown refactor)

### Task 1: Add `windows` crate and tray/menu capabilities

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1.1 — Add `windows` dependency**

In `src-tauri/Cargo.toml`, under `[dependencies]`, after the existing `chrono` line (or in a sensible spot near the bottom of the dependencies), add:

```toml
# Win32 APIs for tray balloon notifications and MessageBox
windows = { version = "0.62", features = [
    "Win32_Foundation",
    "Win32_UI_Shell",
    "Win32_UI_WindowsAndMessaging",
] }
```

- [ ] **Step 1.2 — Add tray/menu permissions**

In `src-tauri/capabilities/default.json`, append three permissions to the `permissions` array (keeping array trailing-comma-free):

```json
{
  "permissions": [
    "core:default",
    "core:window:allow-close",
    "core:window:allow-set-title",
    "core:window:allow-show",
    "core:window:allow-hide",
    "core:window:allow-set-focus",
    "core:event:default",
    "core:tray:default",
    "core:menu:default",
    "dialog:default",
    "log:default",
    "global-shortcut:default",
    "window-state:default"
  ]
}
```

- [ ] **Step 1.3 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS (clean compile, no new warnings beyond pre-existing).

- [ ] **Step 1.4 — Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/capabilities/default.json
git commit -m "feat(tray): add windows crate and tray/menu capabilities for Phase 3A"
```

---

### Task 2: Extract `graceful_shutdown` into `app_state.rs`

This is a pure refactor of existing `lib.rs::on_window_event(CloseRequested)` body into a reusable async function. No behavior changes.

**Files:**
- Modify: `src-tauri/src/app_state.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 2.1 — Add `graceful_shutdown` to `app_state.rs`**

In `src-tauri/src/app_state.rs`, after the `impl AppState { ... }` block, add a new free function (not a method on AppState — keeps the call site simple for `lib.rs` and `tray::handlers`):

```rust
use tauri::AppHandle;
use tauri::Manager;
use crate::stream::manager::StreamState;

/// Stop all recordings, save active URLs, stop player, save volume,
/// then briefly wait for in-flight tasks. Used by close-button shutdown
/// (when minimize_to_tray is false) and by tray "Quit".
pub async fn graceful_shutdown(app: &AppHandle) {
    let state = app.state::<AppState>();

    let mut manager = state.stream_manager.write().await;
    manager.stop_all();
    let active_ids: Vec<String> = manager.get_all_statuses()
        .iter()
        .filter(|s| !matches!(s.state, StreamState::Idle | StreamState::Error))
        .map(|s| s.stream_id.clone())
        .collect();
    drop(manager);

    let profile_read = state.active_profile.read().await;
    let urls: Vec<String> = active_ids.iter()
        .filter_map(|id| profile_read.streams.iter()
            .find(|s| s.id == *id)
            .map(|s| s.url.clone()))
        .collect();
    drop(profile_read);

    let mut profile = state.active_profile.write().await;
    profile.active_recording_urls = urls;
    if let Err(e) = profile.save() {
        log::error!("Failed to save profile on shutdown: {e}");
    }
    drop(profile);

    state.player.stop_session_public().await;
    let volume = state.player.current_volume().await;
    let mut profile = state.active_profile.write().await;
    profile.player_session.volume = volume;
    if let Err(e) = profile.save() {
        log::error!("Failed to save profile volume on shutdown: {e}");
    }
    drop(profile);

    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
}
```

- [ ] **Step 2.2 — Replace `on_window_event` body in `lib.rs`**

In `src-tauri/src/lib.rs`, replace the entire `.on_window_event(...)` closure body with a call to the new function:

```rust
.on_window_event(|window, event| {
    if let tauri::WindowEvent::CloseRequested { .. } = event {
        let app = window.app_handle().clone();
        tauri::async_runtime::block_on(async {
            crate::app_state::graceful_shutdown(&app).await;
        });
    }
})
```

Note: this temporarily preserves the **always-shutdown** behavior. Task 11 modifies this further to honor `minimize_to_tray`.

- [ ] **Step 2.3 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS, no new warnings.

- [ ] **Step 2.4 — Manual smoke test**

Run: `cd C:\dev\Tapir && pnpm tauri dev`
- Start a recording.
- Close the window (X button).
- Expected: window closes, process exits cleanly, profile saved (open `data/profiles/Default.tapirprofile` and confirm `activeRecordingUrls` contains the URL).

- [ ] **Step 2.5 — Commit**

```bash
git add src-tauri/src/app_state.rs src-tauri/src/lib.rs
git commit -m "refactor(shutdown): extract graceful_shutdown to app_state for reuse"
```

---

## Chunk 2: Tray module skeleton + pure menu functions

### Task 3: Create `tray` module skeleton with snapshot type

**Files:**
- Create: `src-tauri/src/tray/mod.rs`
- Create: `src-tauri/src/tray/menu.rs`
- Create: `src-tauri/src/tray/handlers.rs`
- Create: `src-tauri/src/tray/notify.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 3.1 — Create `src-tauri/src/tray/mod.rs`**

```rust
//! System tray: icon, dynamic context menu, balloon notifications, quit confirm.

pub mod menu;
pub mod handlers;
pub mod notify;

use tauri::AppHandle;
use crate::player::engine::PlaybackState;

/// Snapshot of state used to build the tray menu and tooltip.
/// Built once per state change via `build_snapshot`, then passed to `menu::build_menu` / `menu::tooltip`.
#[derive(Debug, Clone)]
pub struct MenuSnapshot {
    pub player_state: PlaybackState,
    pub now_playing_label: Option<String>,
    pub active_recordings: usize,
    pub window_visible: bool,
}

/// Create the tray icon. Call once from `setup()`.
pub fn setup_tray(_app: &AppHandle) -> tauri::Result<()> {
    // Implemented in Task 7
    Ok(())
}

/// Rebuild tray menu and tooltip from current AppState. Fire-and-forget.
pub fn notify_state_changed(_app: &AppHandle) {
    // Implemented in Task 7
}
```

- [ ] **Step 3.2 — Create empty `src-tauri/src/tray/menu.rs`**

```rust
//! Tray menu and tooltip construction (pure functions).

use crate::tray::MenuSnapshot;

/// Build the Windows tray tooltip from a snapshot. Truncated to 127 chars
/// to fit `NOTIFYICONDATA.szTip` (128 incl. NUL).
pub fn tooltip(_snap: &MenuSnapshot) -> String {
    // Implemented in Task 4
    "Tapir".to_string()
}
```

- [ ] **Step 3.3 — Create empty `src-tauri/src/tray/handlers.rs`**

```rust
//! Click and menu-event handlers for the tray icon.
```

- [ ] **Step 3.4 — Create empty `src-tauri/src/tray/notify.rs`**

```rust
//! Win32 helpers: balloon notifications (Shell_NotifyIconW), quit confirm (MessageBoxW).
```

- [ ] **Step 3.5 — Register `tray` module in `lib.rs`**

In `src-tauri/src/lib.rs`, near the top with the other `mod` declarations, add:

```rust
mod tray;
```

- [ ] **Step 3.6 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS. Warnings about unused functions are OK at this stage (will go away as functions are wired up).

- [ ] **Step 3.7 — Commit**

```bash
git add src-tauri/src/tray src-tauri/src/lib.rs
git commit -m "feat(tray): add tray module skeleton with MenuSnapshot type"
```

---

### Task 4: Implement `tray::menu::tooltip` (pure function + unit tests)

**Files:**
- Modify: `src-tauri/src/tray/menu.rs`

- [ ] **Step 4.1 — Write failing tests**

Replace the placeholder in `src-tauri/src/tray/menu.rs` body with:

```rust
//! Tray menu and tooltip construction (pure functions).

use crate::player::engine::PlaybackState;
use crate::tray::MenuSnapshot;

const MAX_TOOLTIP_CHARS: usize = 127;

/// Build the Windows tray tooltip from a snapshot.
pub fn tooltip(snap: &MenuSnapshot) -> String {
    let playing = matches!(snap.player_state, PlaybackState::Playing);
    let station = snap.now_playing_label.as_deref();
    let rec = snap.active_recordings;

    let s = match (playing, station, rec) {
        (false, _, 0)       => "Tapir".to_string(),
        (true, Some(st), 0) => format!("Tapir — ▶ {st}"),
        (false, _, n)       => format!("Tapir — ● {n} записів"),
        (true, Some(st), n) => format!("Tapir — ▶ {st} · ● {n} записів"),
        (true, None, _)     => "Tapir — ▶".to_string(),
    };

    truncate_chars(&s, MAX_TOOLTIP_CHARS)
}

fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max { return s.to_string(); }
    let mut out: String = s.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap(state: PlaybackState, label: Option<&str>, rec: usize) -> MenuSnapshot {
        MenuSnapshot {
            player_state: state,
            now_playing_label: label.map(String::from),
            active_recordings: rec,
            window_visible: false,
        }
    }

    #[test]
    fn idle_shows_just_app_name() {
        assert_eq!(tooltip(&snap(PlaybackState::Stopped, None, 0)), "Tapir");
    }

    #[test]
    fn playing_only_shows_play_arrow_and_station() {
        let s = snap(PlaybackState::Playing, Some("SomaFM"), 0);
        assert_eq!(tooltip(&s), "Tapir — ▶ SomaFM");
    }

    #[test]
    fn recording_only_shows_recording_count() {
        let s = snap(PlaybackState::Stopped, None, 3);
        assert_eq!(tooltip(&s), "Tapir — ● 3 записів");
    }

    #[test]
    fn playing_and_recording_shows_both() {
        let s = snap(PlaybackState::Playing, Some("SomaFM"), 2);
        assert_eq!(tooltip(&s), "Tapir — ▶ SomaFM · ● 2 записів");
    }

    #[test]
    fn paused_does_not_show_play_arrow() {
        let s = snap(PlaybackState::Paused, Some("SomaFM"), 1);
        // Paused → playing == false branch → recording variant
        assert_eq!(tooltip(&s), "Tapir — ● 1 записів");
    }

    #[test]
    fn truncates_long_station_name() {
        let long = "a".repeat(200);
        let s = snap(PlaybackState::Playing, Some(&long), 0);
        let result = tooltip(&s);
        assert!(result.chars().count() <= 127);
        assert!(result.ends_with('…'));
    }

    #[test]
    fn handles_unicode_correctly_in_truncation() {
        // 200 Cyrillic chars should also truncate without panicking on byte boundaries
        let long: String = "Я".repeat(200);
        let s = snap(PlaybackState::Playing, Some(&long), 0);
        let result = tooltip(&s);
        assert!(result.chars().count() <= 127);
    }
}
```

- [ ] **Step 4.2 — Run tests**

Run: `cd C:\dev\Tapir\src-tauri && cargo test --lib tray::menu`
Expected: all 7 tests PASS.

- [ ] **Step 4.3 — Commit**

```bash
git add src-tauri/src/tray/menu.rs
git commit -m "feat(tray): implement tooltip generation with unit tests"
```

---

### Task 5: Implement `build_menu` (Tauri Menu builder)

**Files:**
- Modify: `src-tauri/src/tray/menu.rs`

- [ ] **Step 5.1 — Add menu builder**

Append to `src-tauri/src/tray/menu.rs` (after the existing `truncate_chars` function but before the `#[cfg(test)]` block):

```rust
use tauri::AppHandle;
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder};
use tauri::Wry;

const ID_NOW_PLAYING: &str = "now-playing";
const ID_TOGGLE_PLAYBACK: &str = "toggle-playback";
const ID_STOP_PLAYBACK: &str = "stop-playback";
const ID_RECORDING_INFO: &str = "recording-info";
const ID_STOP_ALL: &str = "stop-all";
const ID_TOGGLE_WINDOW: &str = "toggle-window";
const ID_QUIT: &str = "quit";

pub const MENU_ID_TOGGLE_PLAYBACK: &str = ID_TOGGLE_PLAYBACK;
pub const MENU_ID_STOP_PLAYBACK: &str = ID_STOP_PLAYBACK;
pub const MENU_ID_STOP_ALL: &str = ID_STOP_ALL;
pub const MENU_ID_TOGGLE_WINDOW: &str = ID_TOGGLE_WINDOW;
pub const MENU_ID_QUIT: &str = ID_QUIT;

/// Build the right-click menu from a snapshot.
pub fn build_menu(app: &AppHandle, snap: &MenuSnapshot) -> tauri::Result<Menu<Wry>> {
    let mut builder = MenuBuilder::new(app);

    let show_now_playing = matches!(
        snap.player_state,
        PlaybackState::Playing | PlaybackState::Paused
    ) && snap.now_playing_label.is_some();

    if show_now_playing {
        let label = snap.now_playing_label.as_deref().unwrap_or("");
        let item = MenuItemBuilder::with_id(ID_NOW_PLAYING, format!("Зараз грає: {label}"))
            .enabled(false)
            .build(app)?;
        builder = builder.item(&item).separator();
    }

    let play_label = match snap.player_state {
        PlaybackState::Playing => "Пауза",
        _ => "Грати",
    };
    let toggle_playback = MenuItemBuilder::with_id(ID_TOGGLE_PLAYBACK, play_label)
        .enabled(!matches!(snap.player_state, PlaybackState::Stopped))
        .build(app)?;
    builder = builder.item(&toggle_playback);

    if !matches!(snap.player_state, PlaybackState::Stopped) {
        let stop = MenuItemBuilder::with_id(ID_STOP_PLAYBACK, "Зупинити").build(app)?;
        builder = builder.item(&stop);
    }

    builder = builder.separator();

    if snap.active_recordings > 0 {
        let info = MenuItemBuilder::with_id(
            ID_RECORDING_INFO,
            format!("● Записи: {} активних", snap.active_recordings),
        )
        .enabled(false)
        .build(app)?;
        let stop_all = MenuItemBuilder::with_id(ID_STOP_ALL, "Зупинити всі записи").build(app)?;
        builder = builder.item(&info).item(&stop_all).separator();
    }

    let window_label = if snap.window_visible { "Приховати Tapir" } else { "Показати Tapir" };
    let toggle_window = MenuItemBuilder::with_id(ID_TOGGLE_WINDOW, window_label).build(app)?;
    builder = builder.item(&toggle_window).separator();

    let quit = MenuItemBuilder::with_id(ID_QUIT, "Вихід").build(app)?;
    builder = builder.item(&quit);

    builder.build()
}
```

- [ ] **Step 5.2 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS. (No new tests; this function needs Tauri runtime for testing and is verified manually in Task 9.)

- [ ] **Step 5.3 — Commit**

```bash
git add src-tauri/src/tray/menu.rs
git commit -m "feat(tray): implement dynamic menu builder with conditional items"
```

---

### Task 6: Implement `build_now_playing_label`

**Files:**
- Modify: `src-tauri/src/tray/menu.rs`

- [ ] **Step 6.1 — Add label builder**

Append to `src-tauri/src/tray/menu.rs` (after `build_menu`, before `#[cfg(test)]`):

```rust
use crate::app_state::AppState;
use crate::player::engine::{PlaybackSource, PlayerStatus};
use tauri::Manager;

/// Compose the "Now playing" label for the menu, reading station + track
/// info from AppState. Returns None when nothing is meaningfully playing.
pub async fn build_now_playing_label(
    status: &PlayerStatus,
    app: &AppHandle,
) -> Option<String> {
    if !matches!(status.state, PlaybackState::Playing | PlaybackState::Paused) {
        return None;
    }
    let source = status.source.as_ref()?;
    let state = app.state::<AppState>();
    match source {
        PlaybackSource::Stream { stream_id } => {
            let manager = state.stream_manager.read().await;
            let statuses = manager.get_all_statuses();
            let stream_status = statuses.iter().find(|s| &s.stream_id == stream_id).cloned();
            drop(manager);

            let profile = state.active_profile.read().await;
            let stream_info = profile.streams.iter().find(|s| &s.id == stream_id).cloned();
            drop(profile);

            let station = stream_info.map(|s| s.name).unwrap_or_else(|| stream_id.clone());

            match stream_status.and_then(|s| s.current_track) {
                Some(t) if !t.artist.is_empty() || !t.title.is_empty() => {
                    Some(format!("{station} — {} — {}", t.artist, t.title))
                }
                _ => Some(station),
            }
        }
        PlaybackSource::File { path } => {
            let basename = std::path::Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("?");
            Some(format!("Файл: {basename}"))
        }
    }
}
```

- [ ] **Step 6.2 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS.

- [ ] **Step 6.3 — Commit**

```bash
git add src-tauri/src/tray/menu.rs
git commit -m "feat(tray): build now-playing label from stream/file source"
```

---

## Chunk 3: Lifecycle wiring

### Task 7: Implement `notify_state_changed` and `setup_tray`

**Files:**
- Modify: `src-tauri/src/tray/mod.rs`

- [ ] **Step 7.1 — Replace `mod.rs` body**

Replace `src-tauri/src/tray/mod.rs` body with:

```rust
//! System tray: icon, dynamic context menu, balloon notifications, quit confirm.

pub mod menu;
pub mod handlers;
pub mod notify;

use tauri::{AppHandle, Manager};
use tauri::tray::TrayIconBuilder;
use crate::app_state::AppState;
use crate::player::engine::PlaybackState;
use crate::stream::manager::StreamState;

pub const TRAY_ID: &str = "main";

#[derive(Debug, Clone)]
pub struct MenuSnapshot {
    pub player_state: PlaybackState,
    pub now_playing_label: Option<String>,
    pub active_recordings: usize,
    pub window_visible: bool,
}

/// Create the tray icon and attach handlers. Called once from `setup()` after
/// `app.manage(state)`.
pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let icon = app.default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound("default-window-icon".into()))?;

    let initial = MenuSnapshot {
        player_state: PlaybackState::Stopped,
        now_playing_label: None,
        active_recordings: 0,
        window_visible: false,
    };
    let menu = menu::build_menu(app, &initial)?;
    let tooltip = menu::tooltip(&initial);

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip(tooltip)
        .menu(&menu)
        .on_tray_icon_event(handlers::on_tray_icon_event)
        .on_menu_event(handlers::on_menu_event)
        .build(app)?;

    Ok(())
}

/// Rebuild tray menu and tooltip from current AppState. Fire-and-forget.
pub fn notify_state_changed(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let snap = build_snapshot(&app).await;
        if let Err(e) = apply_snapshot(&app, &snap) {
            log::warn!("Tray: failed to update menu/tooltip: {e}");
        }
    });
}

async fn build_snapshot(app: &AppHandle) -> MenuSnapshot {
    let state = app.state::<AppState>();
    let player_status = state.player.get_status().await;

    let active_recordings = {
        let mgr = state.stream_manager.read().await;
        mgr.get_all_statuses()
            .iter()
            .filter(|s| matches!(
                s.state,
                StreamState::Recording | StreamState::Connecting | StreamState::Reconnecting
            ))
            .count()
    };

    let now_playing_label = menu::build_now_playing_label(&player_status, app).await;

    let window_visible = app
        .get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);

    MenuSnapshot {
        player_state: player_status.state,
        now_playing_label,
        active_recordings,
        window_visible,
    }
}

fn apply_snapshot(app: &AppHandle, snap: &MenuSnapshot) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return Ok(()); };
    let menu = menu::build_menu(app, snap)?;
    tray.set_menu(Some(menu))?;
    tray.set_tooltip(Some(menu::tooltip(snap)))?;
    Ok(())
}
```

- [ ] **Step 7.2 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS. (`handlers::on_tray_icon_event` and `handlers::on_menu_event` may be missing — Task 9/10 add them; if the compile fails on missing names, temporarily add empty stubs to `handlers.rs`:)

```rust
use tauri::AppHandle;
use tauri::tray::{TrayIcon, TrayIconEvent};
use tauri::menu::MenuEvent;

pub fn on_tray_icon_event(_tray: &TrayIcon, _event: TrayIconEvent) {}
pub fn on_menu_event(_app: &AppHandle, _event: MenuEvent) {}
```

Then rerun build until PASS.

- [ ] **Step 7.3 — Commit**

```bash
git add src-tauri/src/tray/mod.rs src-tauri/src/tray/handlers.rs
git commit -m "feat(tray): implement notify_state_changed + setup_tray"
```

---

### Task 8: Wire `setup_tray` into application startup

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 8.1 — Call `setup_tray` in `setup()`**

In `src-tauri/src/lib.rs`, inside the `.setup(|app| { ... })` closure, **after** `app.manage(state);` and **before** the line `let state_ref = app.state::<AppState>();`, insert:

```rust
            tray::setup_tray(app.handle()).expect("Failed to set up system tray");
```

- [ ] **Step 8.2 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS.

- [ ] **Step 8.3 — Manual: tray icon appears**

Run: `cd C:\dev\Tapir && pnpm tauri dev`
- Expected: tray icon appears in Windows notification area.
- Hover: tooltip reads "Tapir".
- Right-click: menu shows "Грати" (disabled), "Показати Tapir", "Вихід".
- Left-click: nothing yet (Task 9).
- Click "Вихід": app exits (graceful_shutdown runs, but no confirm yet — Task 14).

- [ ] **Step 8.4 — Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(tray): create tray icon at startup"
```

---

## Chunk 4: Click and menu event handlers

### Task 9: Implement `on_tray_icon_event` (left-click window toggle)

**Files:**
- Modify: `src-tauri/src/tray/handlers.rs`

- [ ] **Step 9.1 — Replace handlers stub**

Replace `src-tauri/src/tray/handlers.rs` body with:

```rust
//! Click and menu-event handlers for the tray icon.

use tauri::{AppHandle, Manager};
use tauri::menu::MenuEvent;
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconEvent};

pub fn on_tray_icon_event(tray: &TrayIcon, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        toggle_window_visibility(tray.app_handle());
    }
}

pub fn on_menu_event(_app: &AppHandle, _event: MenuEvent) {
    // Implemented in Task 10
}

pub(crate) fn toggle_window_visibility(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return; };
    let visible = window.is_visible().unwrap_or(false);
    if visible {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    crate::tray::notify_state_changed(app);
}
```

- [ ] **Step 9.2 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS.

- [ ] **Step 9.3 — Manual test**

Run: `cd C:\dev\Tapir && pnpm tauri dev`
- Left-click tray icon → main window hides.
- Left-click tray icon → main window shows and is focused.
- Right-click tray → "Приховати Tapir" label updates to "Показати Tapir" after hiding. (Note: menu only rebuilds on toggle — re-open menu to see the new label.)

- [ ] **Step 9.4 — Commit**

```bash
git add src-tauri/src/tray/handlers.rs
git commit -m "feat(tray): left-click toggles main window visibility"
```

---

### Task 10: Implement menu event handlers

**Files:**
- Modify: `src-tauri/src/tray/handlers.rs`

- [ ] **Step 10.1 — Implement `on_menu_event` + spawn helpers**

Replace `on_menu_event` (and only that function) in `src-tauri/src/tray/handlers.rs` with the dispatch implementation, then append the spawn helpers at the bottom of the file:

```rust
pub fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    use crate::tray::menu::{
        MENU_ID_QUIT, MENU_ID_STOP_ALL, MENU_ID_STOP_PLAYBACK,
        MENU_ID_TOGGLE_PLAYBACK, MENU_ID_TOGGLE_WINDOW,
    };
    match event.id().as_ref() {
        id if id == MENU_ID_TOGGLE_PLAYBACK => spawn_toggle_playback(app),
        id if id == MENU_ID_STOP_PLAYBACK   => spawn_stop_playback(app),
        id if id == MENU_ID_STOP_ALL        => spawn_stop_all(app),
        id if id == MENU_ID_TOGGLE_WINDOW   => toggle_window_visibility(app),
        id if id == MENU_ID_QUIT            => handle_quit(app),
        _ => {}
    }
}

fn spawn_toggle_playback(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<crate::app_state::AppState>();
        let status = state.player.get_status().await;
        let _ = match status.state {
            crate::player::engine::PlaybackState::Playing => state.player.pause_playback(&app).await,
            crate::player::engine::PlaybackState::Paused  => state.player.resume_playback(&app).await,
            _ => Ok(()),
        };
    });
}

fn spawn_stop_playback(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<crate::app_state::AppState>();
        let _ = state.player.stop_playback(&app).await;
    });
}

fn spawn_stop_all(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<crate::app_state::AppState>();
        let mut mgr = state.stream_manager.write().await;
        mgr.stop_all();
        drop(mgr);
        crate::tray::notify_state_changed(&app);
    });
}

fn handle_quit(app: &AppHandle) {
    // Implemented in Task 14
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        crate::app_state::graceful_shutdown(&app).await;
        app.exit(0);
    });
}
```

- [ ] **Step 10.2 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS.

- [ ] **Step 10.3 — Manual test (limited — menu won't update until Task 11)**

Run: `cd C:\dev\Tapir && pnpm tauri dev`
- Start playback from main window.
- Right-click tray → "Пауза" item → playback pauses, but menu still says "Пауза" (will rebuild after Task 11).
- Right-click tray → "Зупинити" → playback stops.
- "Зупинити всі записи" — start a recording, then this menu item appears and stops it.
- "Вихід" — exits the app (graceful, no confirm yet).

- [ ] **Step 10.4 — Commit**

```bash
git add src-tauri/src/tray/handlers.rs
git commit -m "feat(tray): wire menu event handlers (play/pause, stop, stop all, quit)"
```

---

### Task 11: Wire `notify_state_changed` into emitter sites + minimize-to-tray close behavior

**Files:**
- Modify: `src-tauri/src/stream/manager.rs`
- Modify: `src-tauri/src/player/engine.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 11.1 — Hook tray notify into recording status emits**

In `src-tauri/src/stream/manager.rs`, modify `emit_recording_status` to also notify the tray (at the bottom, after the existing emit logic — both success and error paths get the same notify so menu always reflects state):

```rust
fn emit_recording_status(app: &AppHandle, stream_id: &str, status: &str, error: Option<String>) {
    debug!("[{}] Emitting recording-status: {}", stream_id, status);
    match app.emit(
        "recording-status",
        RecordingStatusPayload {
            stream_id: stream_id.to_string(),
            status: status.to_string(),
            error,
        },
    ) {
        Ok(_) => debug!("[{}] Event emitted OK", stream_id),
        Err(e) => error!("[{}] Failed to emit event: {}", stream_id, e),
    }
    crate::tray::notify_state_changed(app);
}
```

- [ ] **Step 11.2 — Add `emit_player_status` helper in player engine**

In `src-tauri/src/player/engine.rs`, find a logical spot near the top of the file (just before `impl PlayerEngine { ... }` blocks) and add:

```rust
/// Emit `player-status` to the frontend and notify the tray. All callers
/// inside this module should use this helper instead of calling
/// `app.emit("player-status", ...)` directly.
fn emit_player_status(app: &AppHandle, status: PlayerStatus) {
    if let Err(e) = app.emit("player-status", status) {
        log::warn!("Player: failed to emit player-status: {e}");
    }
    crate::tray::notify_state_changed(app);
}
```

- [ ] **Step 11.3 — Replace all 9 emit("player-status", ...) call sites**

In `src-tauri/src/player/engine.rs`, replace every occurrence matching the pattern below (there are 9 sites — search for `emit("player-status"`):

**Before:**
```rust
if let Err(e) = app.emit("player-status", status) {
    log::warn!("Player: failed to emit player-status: {e}");
}
```
**After:**
```rust
emit_player_status(app, status);
```

For the inline cases that construct `PlayerStatus` inline (e.g. line 188, 222, 322, 783):

**Before:**
```rust
let _ = app_clone.emit("player-status", PlayerStatus {
    state: PlaybackState::Stopped,
    source: None,
    volume: current_volume,
    position_ms: None,
    duration_ms: None,
});
```
**After:**
```rust
emit_player_status(&app_clone, PlayerStatus {
    state: PlaybackState::Stopped,
    source: None,
    volume: current_volume,
    position_ms: None,
    duration_ms: None,
});
```

Adjust borrows (`&app_clone` vs `&app`) per local variable name at each call site. Verify each site after replacement by inspecting the surrounding lines for variable name.

- [ ] **Step 11.4 — Update `on_window_event` for minimize_to_tray**

In `src-tauri/src/lib.rs`, replace the `.on_window_event(...)` closure body with:

```rust
.on_window_event(|window, event| {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let app = window.app_handle().clone();
        let state = app.state::<AppState>();
        let minimize_to_tray = tauri::async_runtime::block_on(async {
            state.settings.read().await.minimize_to_tray
        });

        if minimize_to_tray {
            api.prevent_close();
            let _ = window.hide();
            crate::tray::notify_state_changed(&app);
            return;
        }

        tauri::async_runtime::block_on(async {
            crate::app_state::graceful_shutdown(&app).await;
        });
    }
})
```

- [ ] **Step 11.5 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS, no warnings about unused `emit_player_status`.

- [ ] **Step 11.6 — Manual test**

Run: `cd C:\dev\Tapir && pnpm tauri dev`

Test 1 (default settings, minimize_to_tray=true):
- Close window via X → window hides, process continues, tray icon still present.
- Click tray icon → window restored.

Test 2 (toggle setting):
- Open Settings → uncheck "Згортати у трей" → save.
- Close window → graceful shutdown + exit.

Test 3 (menu updates dynamically):
- Start recording → right-click tray → "● Записи: 1 активних" visible.
- Stop recording → menu refreshes (next right-click) → recording section gone.
- Start playback → tooltip updates to "Tapir — ▶ {station}".

- [ ] **Step 11.7 — Commit**

```bash
git add src-tauri/src/stream/manager.rs src-tauri/src/player/engine.rs src-tauri/src/lib.rs
git commit -m "feat(tray): dynamic menu updates on state changes + minimize-to-tray close"
```

---

## Chunk 5: Win32 quit confirmation

### Task 12: Implement `show_quit_confirm`

**Files:**
- Modify: `src-tauri/src/tray/notify.rs`

- [ ] **Step 12.1 — Add Win32 MessageBox helper**

Replace `src-tauri/src/tray/notify.rs` body with:

```rust
//! Win32 helpers: balloon notifications (Shell_NotifyIconW), quit confirm (MessageBoxW).

use windows::core::HSTRING;
use windows::Win32::UI::WindowsAndMessaging::{
    MessageBoxW, IDYES, MB_DEFBUTTON2, MB_ICONWARNING, MB_SETFOREGROUND, MB_YESNO,
};

/// Show a native Yes/No MessageBox asking whether to quit the app while
/// recordings are active. Returns true if the user confirmed (clicked Yes).
///
/// Uses MB_DEFBUTTON2 so "No" is the default — pressing Enter dismisses safely.
pub fn show_quit_confirm(active_count: usize) -> bool {
    let title = HSTRING::from("Tapir — підтвердження");
    let body = HSTRING::from(format!(
        "Активних записів: {active_count}.\nВийти з програми і зупинити їх?"
    ));
    let result = unsafe {
        MessageBoxW(
            None,
            &body,
            &title,
            MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2 | MB_SETFOREGROUND,
        )
    };
    result == IDYES
}
```

- [ ] **Step 12.2 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS.

- [ ] **Step 12.3 — Commit**

```bash
git add src-tauri/src/tray/notify.rs
git commit -m "feat(tray): native MessageBox quit confirmation via Win32"
```

---

### Task 13: Wire `show_quit_confirm` into `handle_quit`

**Files:**
- Modify: `src-tauri/src/tray/handlers.rs`

- [ ] **Step 13.1 — Update `handle_quit`**

Replace the `handle_quit` function body in `src-tauri/src/tray/handlers.rs` with:

```rust
fn handle_quit(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<crate::app_state::AppState>();
        let active = {
            let mgr = state.stream_manager.read().await;
            mgr.get_all_statuses()
                .iter()
                .filter(|s| matches!(
                    s.state,
                    crate::stream::manager::StreamState::Recording
                        | crate::stream::manager::StreamState::Connecting
                        | crate::stream::manager::StreamState::Reconnecting
                ))
                .count()
        };

        if active > 0 {
            // Win32 MessageBox is blocking; run on a blocking thread to
            // avoid stalling the tokio worker.
            let confirmed = tokio::task::spawn_blocking(move || {
                crate::tray::notify::show_quit_confirm(active)
            })
            .await
            .unwrap_or(false);
            if !confirmed { return; }
        }

        crate::app_state::graceful_shutdown(&app).await;
        app.exit(0);
    });
}
```

- [ ] **Step 13.2 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS.

- [ ] **Step 13.3 — Manual test**

Run: `cd C:\dev\Tapir && pnpm tauri dev`
- Start a recording.
- Right-click tray → "Вихід".
- Expected: native MessageBox "Активних записів: 1. Вийти з програми і зупинити їх?" with Yes/No, No is default.
  - NVDA should announce the message box.
- Click "No" → nothing happens.
- Right-click tray → "Вихід" → MessageBox → click "Yes" → graceful shutdown + exit.
- Restart app, no recording → "Вихід" → exits immediately (no MessageBox).

- [ ] **Step 13.4 — Commit**

```bash
git add src-tauri/src/tray/handlers.rs
git commit -m "feat(tray): confirm quit when recordings are active"
```

---

## Chunk 6: Win32 balloon notifications

### Task 14: Implement message-only window + balloon helper

This task introduces a hidden Win32 window solely as an HWND owner for a separate `NOTIFYICONDATA` used **only** for balloons. We do not display its icon (omit `NIF_ICON` flag); the Tauri tray icon remains the visible one.

**Files:**
- Modify: `src-tauri/src/tray/notify.rs`

- [ ] **Step 14.1 — Add message-only window setup**

Append to `src-tauri/src/tray/notify.rs`:

```rust
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::OnceLock;

use windows::core::PCWSTR;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM, HMODULE};
use windows::Win32::UI::Shell::{
    Shell_NotifyIconW, NIF_INFO, NIF_MESSAGE, NIIF_NONE, NIIF_RESPECT_QUIET_TIME,
    NIM_ADD, NIM_DELETE, NIM_MODIFY, NIN_BALLOONUSERCLICK, NOTIFYICONDATAW,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, GetModuleHandleW, RegisterClassExW,
    HWND_MESSAGE, WINDOW_EX_STYLE, WINDOW_STYLE, WNDCLASSEXW, WNDCLASS_STYLES,
};

const BALLOON_CALLBACK_MSG: u32 = 0x0400 + 1; // WM_APP + 1
const BALLOON_ICON_UID: u32 = 0x7ABE; // arbitrary identifier
const WINDOW_CLASS_NAME: &str = "TapirBalloonWnd";

/// HWND of the hidden message-only window. Set once during setup, read everywhere else.
static BALLOON_HWND: AtomicIsize = AtomicIsize::new(0);
/// AppHandle stash used by WndProc to show the main window on balloon click.
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

/// Initialize the hidden message-only window and register the balloon icon.
/// Must be called once at startup, after tray::setup_tray.
pub fn init_balloon_runtime(app: &tauri::AppHandle) -> anyhow::Result<()> {
    let _ = APP_HANDLE.set(app.clone());
    unsafe {
        let hinstance: HMODULE = GetModuleHandleW(PCWSTR::null())?;
        let class_name: Vec<u16> = WINDOW_CLASS_NAME.encode_utf16().chain(std::iter::once(0)).collect();

        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: WNDCLASS_STYLES(0),
            lpfnWndProc: Some(balloon_wnd_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: hinstance.into(),
            hIcon: Default::default(),
            hCursor: Default::default(),
            hbrBackground: Default::default(),
            lpszMenuName: PCWSTR::null(),
            lpszClassName: PCWSTR(class_name.as_ptr()),
            hIconSm: Default::default(),
        };
        let atom = RegisterClassExW(&wc);
        if atom == 0 {
            // Ignore "class already registered" errors during dev reload.
            log::debug!("RegisterClassExW returned 0 (likely already registered)");
        }

        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            PCWSTR(class_name.as_ptr()),
            PCWSTR::null(),
            WINDOW_STYLE(0),
            0, 0, 0, 0,
            Some(HWND_MESSAGE),
            None,
            Some(hinstance.into()),
            None,
        )?;
        BALLOON_HWND.store(hwnd.0 as isize, Ordering::Release);

        let mut nid = balloon_notify_data(hwnd);
        nid.uFlags = NIF_MESSAGE;
        nid.uCallbackMessage = BALLOON_CALLBACK_MSG;
        let added = Shell_NotifyIconW(NIM_ADD, &nid).as_bool();
        if !added {
            log::warn!("Shell_NotifyIconW(NIM_ADD) for balloon icon failed");
        }
    }
    Ok(())
}

fn balloon_notify_data(hwnd: HWND) -> NOTIFYICONDATAW {
    let mut nid: NOTIFYICONDATAW = unsafe { std::mem::zeroed() };
    nid.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
    nid.hWnd = hwnd;
    nid.uID = BALLOON_ICON_UID;
    nid
}

extern "system" fn balloon_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == BALLOON_CALLBACK_MSG && (lparam.0 as u32) == NIN_BALLOONUSERCLICK {
        if let Some(app) = APP_HANDLE.get() {
            if let Some(window) = tauri::Manager::get_webview_window(app, "main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }
        return LRESULT(0);
    }
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

/// Tear down balloon icon and destroy the hidden window. Called on shutdown
/// (best-effort; OS cleans up regardless).
pub fn shutdown_balloon_runtime() {
    let raw = BALLOON_HWND.swap(0, Ordering::AcqRel);
    if raw == 0 { return; }
    let hwnd = HWND(raw as *mut _);
    unsafe {
        let nid = balloon_notify_data(hwnd);
        let _ = Shell_NotifyIconW(NIM_DELETE, &nid);
        let _ = DestroyWindow(hwnd);
    }
}

/// Display a balloon notification with the given title (e.g. station) and body
/// (e.g. "Artist — Title"). Errors are logged but not propagated.
pub fn show_balloon(title: &str, body: &str) {
    let raw = BALLOON_HWND.load(Ordering::Acquire);
    if raw == 0 {
        log::debug!("show_balloon called before init_balloon_runtime");
        return;
    }
    let hwnd = HWND(raw as *mut _);
    let mut nid = balloon_notify_data(hwnd);
    nid.uFlags = NIF_INFO;
    write_utf16(&mut nid.szInfoTitle, title);
    write_utf16(&mut nid.szInfo, body);
    nid.Anonymous.uTimeout = 5000;
    nid.dwInfoFlags = NIIF_NONE | NIIF_RESPECT_QUIET_TIME;
    unsafe {
        if !Shell_NotifyIconW(NIM_MODIFY, &nid).as_bool() {
            log::warn!("Shell_NotifyIconW(NIM_MODIFY) failed");
        }
    }
}

fn write_utf16(dst: &mut [u16], src: &str) {
    let encoded: Vec<u16> = src.encode_utf16().take(dst.len().saturating_sub(1)).collect();
    for (i, c) in encoded.iter().enumerate() {
        dst[i] = *c;
    }
    dst[encoded.len()] = 0;
}
```

- [ ] **Step 14.2 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS. (Warnings about unused `show_balloon`/`shutdown_balloon_runtime` are temporary — they go away after wiring in Task 15/16.)

- [ ] **Step 14.3 — Commit**

```bash
git add src-tauri/src/tray/notify.rs
git commit -m "feat(tray): Win32 message-only window + Shell_NotifyIconW balloon helper"
```

---

### Task 15: Implement `show_balloon_throttled` + initialize at startup

**Files:**
- Modify: `src-tauri/src/tray/notify.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 15.1 — Add throttled wrapper**

Append to `src-tauri/src/tray/notify.rs` (after the `write_utf16` function):

```rust
use std::sync::atomic::AtomicU64;
use std::time::{SystemTime, UNIX_EPOCH};

static LAST_BALLOON_MS: AtomicU64 = AtomicU64::new(0);
const THROTTLE_MS: u64 = 3000;

/// Show a track-change balloon with global 3-second throttle. Silently
/// skips when called more often than once per `THROTTLE_MS`.
pub fn show_balloon_throttled(station: &str, artist: &str, title: &str) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let last = LAST_BALLOON_MS.load(Ordering::Relaxed);
    if now.saturating_sub(last) < THROTTLE_MS { return; }
    LAST_BALLOON_MS.store(now, Ordering::Relaxed);

    let body = match (artist.is_empty(), title.is_empty()) {
        (false, false) => format!("{artist} — {title}"),
        (true, false)  => title.to_string(),
        (false, true)  => artist.to_string(),
        _ => return,
    };
    show_balloon(station, &body);
}
```

- [ ] **Step 15.2 — Initialize runtime at startup**

In `src-tauri/src/lib.rs`, inside `.setup(|app| { ... })`, after `tray::setup_tray(app.handle()).expect(...)`, add:

```rust
            if let Err(e) = tray::notify::init_balloon_runtime(app.handle()) {
                log::warn!("Failed to initialize balloon runtime: {e}");
            }
```

- [ ] **Step 15.3 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS.

- [ ] **Step 15.4 — Manual smoke test**

Run: `cd C:\dev\Tapir && pnpm tauri dev`
- App launches normally; no extra tray icon (balloon icon stays hidden).
- Verify no Win32-related panics in console.

- [ ] **Step 15.5 — Commit**

```bash
git add src-tauri/src/tray/notify.rs src-tauri/src/lib.rs
git commit -m "feat(tray): throttled balloon helper + runtime init"
```

---

### Task 16: Wire balloon into track-change emit site + respect setting

**Files:**
- Modify: `src-tauri/src/stream/manager.rs`

- [ ] **Step 16.1 — Hook balloon into `emit_track_changed`**

In `src-tauri/src/stream/manager.rs`, modify `emit_track_changed` to look up the stream's station name and call the balloon helper when `show_tray_notifications` is enabled:

```rust
fn emit_track_changed(app: &AppHandle, stream_id: &str, artist: &str, title: &str, album: &str) {
    app.emit(
        "track-changed",
        TrackChangedPayload {
            stream_id: stream_id.to_string(),
            artist: artist.to_string(),
            title: title.to_string(),
            album: album.to_string(),
        },
    )
    .ok();

    // Tray balloon (best-effort, throttled, gated on setting).
    let app_balloon = app.clone();
    let stream_id_owned = stream_id.to_string();
    let artist_owned = artist.to_string();
    let title_owned = title.to_string();
    tauri::async_runtime::spawn(async move {
        let state = app_balloon.state::<crate::app_state::AppState>();
        let settings = state.settings.read().await;
        if !settings.show_tray_notifications { return; }
        drop(settings);

        let profile = state.active_profile.read().await;
        let station = profile.streams.iter()
            .find(|s| s.id == stream_id_owned)
            .map(|s| s.name.clone())
            .unwrap_or_else(|| stream_id_owned.clone());
        drop(profile);

        crate::tray::notify::show_balloon_throttled(&station, &artist_owned, &title_owned);
    });

    // Tray menu refresh so "Зараз грає" reflects new track.
    crate::tray::notify_state_changed(app);
}
```

- [ ] **Step 16.2 — Add Manager import if missing**

If `tauri::Manager` isn't already imported in `src-tauri/src/stream/manager.rs`, add it to the existing `use tauri::...` line:

```rust
use tauri::{AppHandle, Emitter, Manager};
```

(Check the existing line — it may already be present.)

- [ ] **Step 16.3 — Verify build**

Run: `cd C:\dev\Tapir\src-tauri && cargo build`
Expected: PASS.

- [ ] **Step 16.4 — Manual test (requires live stream with ICY metadata)**

Run: `cd C:\dev\Tapir && pnpm tauri dev`
- Settings → confirm "Сповіщення у треї" is enabled (default).
- Start playback of a stream with active ICY metadata (e.g. SomaFM Groove Salad).
- Wait for a track change → balloon appears: title = station, body = "Artist — Title".
- Trigger another change within 3 s (rare — instead toggle to a different station) → first change shows balloon, immediate second doesn't.
- Click on the balloon → main window shows and is focused.
- Settings → disable "Сповіщення у треї" → next track change → no balloon.

- [ ] **Step 16.5 — Commit**

```bash
git add src-tauri/src/stream/manager.rs
git commit -m "feat(tray): balloon notification on track change with throttle + setting gate"
```

---

## Chunk 7: Final verification

### Task 17: Full acceptance test pass

**Files:** none (verification only)

- [ ] **Step 17.1 — Clean build**

Run: `cd C:\dev\Tapir\src-tauri && cargo clean && cargo build --release`
Expected: clean build, no warnings.

- [ ] **Step 17.2 — Clippy**

Run: `cd C:\dev\Tapir\src-tauri && cargo clippy --all-targets -- -D warnings`
Expected: PASS.

- [ ] **Step 17.3 — Unit tests**

Run: `cd C:\dev\Tapir\src-tauri && cargo test --lib`
Expected: all PASS, including the 7 tooltip tests from Task 4.

- [ ] **Step 17.4 — NVDA-friendly manual test sequence**

Run: `cd C:\dev\Tapir && pnpm tauri dev` (use release build path for fully realistic verification: `pnpm tauri build`, then `src-tauri/target/release/tapir.exe`).

Walk through each acceptance scenario from [the spec §Testing](../specs/2026-05-28-system-tray-design.md):

1. Tray appears, tooltip "Tapir".
2. Idle right-click menu: Грати (disabled), Показати/Приховати Tapir, Вихід.
3. Recording menu: ● Записи: N активних + Зупинити всі записи.
4. Playback menu: Зараз грає: …, Пауза, Зупинити.
5. Combined tooltip: "Tapir — ▶ {station} · ● N записів".
6. Left-click toggles window visibility; ActivityBar receives focus on show.
7. Close button (minimizeToTray=true) → hides; (=false) → graceful shutdown.
8. Balloon appears on track change; throttled at 3 s; respects setting.
9. Balloon click → window shows.
10. Quit with recordings → native MessageBox (NVDA-readable) → No is default → Yes shuts down.
11. Quit without recordings → no MessageBox.
12. Disabled "Грати" item cannot be activated when player is stopped.
13. Windows High Contrast — verify tray menu remains readable.
14. NVDA — menu items announce correctly.

- [ ] **Step 17.5 — Mark phase done**

In `docs/implementation-phases.md`:
- Change the §3A row in the summary table from `⬜` to `✅ Complete`.
- Tick all checkbox items under "Критерії Done" in §3A.

- [ ] **Step 17.6 — Final commit**

```bash
git add docs/implementation-phases.md
git commit -m "docs(phases): mark Phase 3A System Tray as complete"
```

---

## Notes for the implementing engineer

- **Tauri tray vs balloon icon split:** Tauri 2 owns the visible tray icon and its menu. Win32 owns a separate, **invisible** icon UID used only for balloons. They don't interfere: removing one does not affect the other. This separation exists because Tauri 2 doesn't expose the HWND of its tray icon, which we need for `NIF_INFO` modifications.
- **Why `block_on` is safe in `on_window_event`:** `CloseRequested` is dispatched on the main UI thread (not a tokio worker), so `tauri::async_runtime::block_on` doesn't deadlock. This pattern is already used in the existing codebase — preserve it.
- **`emit_player_status` helper:** every place in `player::engine.rs` that emits `"player-status"` must now go through this helper. Don't leave any `app.emit("player-status", ...)` calls bypassing it — they'd cause stale tray menus.
- **Balloon icon UID 0x7ABE:** arbitrary; just needs to be stable for the process lifetime (so NIM_MODIFY targets the same record).
- **Fallback if message-only window proves flaky:** swap `show_balloon` body to call `tauri-plugin-notification` and accept "PowerShell" sender in portable mode. Spec acknowledges this risk; pivot is local to `notify.rs`.
- **NVDA testing:** screen reader must be running during the manual test pass — that's the primary accessibility check.

---

## Self-Review

**Spec coverage:**
- ✅ Tray icon, tooltip, dynamic tooltip → Tasks 4, 7, 8
- ✅ Right-click menu with conditional items → Task 5
- ✅ Now-playing label → Task 6
- ✅ Dynamic rebuild on state changes → Task 11
- ✅ Left-click toggle → Task 9
- ✅ Menu event handlers (play/pause, stop, stop all) → Task 10
- ✅ minimizeToTray close behavior → Task 11
- ✅ Quit confirm (Win32 MessageBox) → Tasks 12, 13
- ✅ Balloon notification on track change → Tasks 14, 15, 16
- ✅ Balloon throttle 3s → Task 15
- ✅ Balloon respects showTrayNotifications setting → Task 16
- ✅ Balloon click shows main window → Task 14
- ✅ graceful_shutdown extraction → Task 2

**Type consistency check:**
- `MenuSnapshot` defined in `tray/mod.rs` and used identically in `menu.rs`, `handlers.rs`.
- `emit_player_status` signature: `(app: &AppHandle, status: PlayerStatus)` — used identically at every call site.
- `MENU_ID_*` constants exported from `menu.rs` and imported by `handlers.rs`.
- `notify_state_changed`, `show_balloon`, `show_balloon_throttled` signatures all match between definition and call sites.
- `TRAY_ID = "main"` referenced via the constant in both `setup_tray` and `apply_snapshot`.

**Placeholder scan:** no TBDs, no "implement later", no "add appropriate error handling" — every step has concrete code or an exact command.
