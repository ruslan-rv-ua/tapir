# System Tray (Phase 3A) — Design Spec

**Date:** 2026-05-28
**Status:** Approved
**Scope:** System tray icon, minimize-to-tray, dynamic context menu, balloon notifications on track change, quit confirmation when recordings are active.
**Phase reference:** [implementation-phases.md §3A](../../implementation-phases.md)
**Architecture reference:** [architecture.md §11](../../architecture.md)

---

## Problem

Tapir is a long-running recording application. Users expect to:
1. Keep recordings going while the main window is hidden.
2. Access basic controls (play/pause, stop all, show window, quit) without raising the main window.
3. See current state (playing station, recording count) at a glance via tray tooltip.
4. Receive balloon notifications when a track changes during playback.
5. Be protected from accidentally killing active recordings on quit.

The current build has no tray icon. Closing the window triggers a full shutdown — there is no background mode, no quick controls, no surfacing of state outside the main window.

---

## Goals

1. Tray icon present from startup with a dynamic tooltip reflecting playback and recording state.
2. Right-click context menu showing only state-relevant items (no clutter; conditional sections).
3. Left-click toggles main window visibility.
4. `minimizeToTray` setting controls close-button behavior (hide vs. shutdown).
5. Balloon notifications on track change, throttled to 3 seconds.
6. Native Win32 `MessageBox` confirmation when quitting from tray with active recordings.
7. No regressions to the existing graceful-shutdown path.
8. NVDA-friendly throughout (menu items, balloon, message box).

---

## Architecture

### Module structure

```
src-tauri/src/
├── tray/
│   ├── mod.rs        — pub fn setup_tray, notify_state_changed, shutdown_tray
│   ├── menu.rs       — build_menu(snapshot) → Menu, tooltip(snapshot) → String
│   ├── handlers.rs   — on_tray_icon_event, on_menu_event
│   └── notify.rs     — Win32: show_balloon_throttled, show_quit_confirm
```

### Integration points

| File | Change |
|------|--------|
| `Cargo.toml` | add `windows = { version = "0.62", features = ["Win32_Foundation", "Win32_UI_Shell", "Win32_UI_WindowsAndMessaging"] }` |
| `capabilities/default.json` | add `core:tray:default`, `core:menu:default`, `core:window:allow-set-focus` |
| `lib.rs` | call `tray::setup_tray(app.handle())?` in `setup()` after `app.manage(state)`; modify `on_window_event(CloseRequested)` |
| `app_state.rs` | extract `pub async fn graceful_shutdown(&AppHandle)` from existing `on_window_event` logic |
| `stream/manager.rs` | after each `emit("recording-status"|"stream-error"|…)` → call `tray::notify_state_changed(&app)` |
| `player/engine.rs` | after each `emit("player-status", …)` → call `tray::notify_state_changed(&app)` |
| `stream/splitter.rs` (or wherever `track-changed` is emitted) | call `tray::notify::show_balloon_throttled(app, station, artist, title)` when settings.show_tray_notifications |

### Snapshot model

```rust
pub struct MenuSnapshot {
    pub player_state: PlaybackState,        // Stopped | Playing | Paused
    pub now_playing_label: Option<String>,  // "Station — Artist — Title" or "Файл: name.mp3"
    pub active_recordings: usize,
    pub window_visible: bool,
}
```

`notify_state_changed(app)` is a fire-and-forget call that spawns a tokio task. The task builds a `MenuSnapshot` from `AppState` (player.get_status, stream_manager statuses, window visibility) and calls `tray.set_menu(...)` + `tray.set_tooltip(...)`.

### Data flow

```
Backend state change
  │
  ├─ emit("player-status" | "recording-status" | …) → Frontend
  │
  └─ tray::notify_state_changed(&app)
       │
       └─ tokio::spawn → build_snapshot(app) → apply_snapshot(app)
                                                  │
                                                  ├─ menu::build_menu(snapshot)
                                                  ├─ menu::tooltip(snapshot)
                                                  └─ tray.set_menu, tray.set_tooltip

Tray icon click (left)
  └─ handlers::on_tray_icon_event → toggle_window_visibility → notify_state_changed

Tray menu item click
  └─ handlers::on_menu_event → spawn_* async handlers → AppState mutations

Window close (close button)
  └─ on_window_event(CloseRequested) →
       if settings.minimize_to_tray → prevent_close + window.hide + notify_state_changed
       else                          → graceful_shutdown + exit

Track change in stream::splitter
  └─ if settings.show_tray_notifications →
       tray::notify::show_balloon_throttled(app, station, artist, title)
```

---

## Components

### 1. `tray::setup_tray(app: &AppHandle) -> tauri::Result<()>`

Creates the tray icon with the initial (idle) menu:

```rust
let icon = app.default_window_icon()
    .ok_or_else(|| tauri::Error::AssetNotFound("default-window-icon".into()))?
    .clone();

let snap = MenuSnapshot {
    player_state: PlaybackState::Stopped,
    now_playing_label: None,
    active_recordings: 0,
    window_visible: false,
};

TrayIconBuilder::with_id("main")
    .icon(icon)
    .tooltip("Tapir")
    .menu(&menu::build_menu(app, &snap)?)
    .on_tray_icon_event(handlers::on_tray_icon_event)
    .on_menu_event(handlers::on_menu_event)
    .build(app)?;
```

Tray icon source: `app.default_window_icon()` (Tauri-bundled `icons/icon.ico`). No extra asset.

### 2. `tray::notify_state_changed(app: &AppHandle)`

Synchronous, fire-and-forget:

```rust
pub fn notify_state_changed(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let snap = build_snapshot(&app).await;
        if let Err(e) = apply_snapshot(&app, &snap) {
            log::warn!("Failed to update tray: {e}");
        }
    });
}
```

`build_snapshot` reads:
- `state.player.get_status().await` — playback state, source
- `state.stream_manager.read().await` → count statuses with `Recording | Connecting | Reconnecting`
- `state.active_profile.read().await` — to map `PlaybackSource::Stream { stream_id }` → station name
- `app.get_webview_window("main").is_visible()` — for "Show/Hide" label

`apply_snapshot` calls `tray.set_menu(Some(new_menu))` and `tray.set_tooltip(Some(...))`.

### 3. `tray::menu::tooltip(snapshot)`

```rust
pub fn tooltip(snap: &MenuSnapshot) -> String {
    let playing = matches!(snap.player_state, PlaybackState::Playing);
    let station = snap.now_playing_label.as_deref();
    let rec = snap.active_recordings;

    let s = match (playing, station, rec) {
        (false, _, 0)       => "Tapir".into(),
        (true, Some(st), 0) => format!("Tapir — ▶ {st}"),
        (false, _, n)       => format!("Tapir — ● {n} записів"),
        (true, Some(st), n) => format!("Tapir — ▶ {st} · ● {n} записів"),
        (true, None, _)     => "Tapir — ▶".into(),
    };
    truncate_to_chars(&s, 127)
}
```

Windows `NOTIFYICONDATA.szTip` limit: 128 chars including NUL → max 127 display chars. Truncation by char, not byte, to avoid splitting UTF-8.

### 4. `tray::menu::build_menu(app, snapshot)`

Items (UK strings, order top to bottom):

| ID | Label | Type | Condition |
|----|-------|------|-----------|
| `now-playing` | "Зараз грає: {label}" | MenuItem (disabled) | `player_state ∈ {Playing, Paused}` and `now_playing_label.is_some()` |
| (sep) | — | Separator | after `now-playing` |
| `toggle-playback` | "Пауза" if Playing, else "Грати" | MenuItem | enabled iff `player_state != Stopped` |
| `stop-playback` | "Зупинити" | MenuItem | `player_state != Stopped` |
| (sep) | — | Separator | always |
| `recording-info` | "● Записи: {n} активних" | MenuItem (disabled) | `active_recordings > 0` |
| `stop-all` | "Зупинити всі записи" | MenuItem | `active_recordings > 0` |
| (sep) | — | Separator | if recording section shown |
| `toggle-window` | "Приховати Tapir" if visible, else "Показати Tapir" | MenuItem | always |
| (sep) | — | Separator | always |
| `quit` | "Вихід" | MenuItem | always |

`toggle-playback` is always present in the menu (predictable position); disabled state is used when `player_state == Stopped`. (The architecture doc mentions "lastStreamId != null" as the enable condition; we interpret this as `player_state != Stopped` to avoid tracking extra state that isn't needed.)

### 5. `tray::menu::build_now_playing_label`

```rust
async fn build_now_playing_label(status: &PlayerStatus, state: &AppState) -> Option<String> {
    let source = status.source.as_ref()?;
    if !matches!(status.state, PlaybackState::Playing | PlaybackState::Paused) {
        return None;
    }
    match source {
        PlaybackSource::Stream { stream_id } => {
            let mgr = state.stream_manager.read().await;
            let stream_status = mgr.get_all_statuses()
                .into_iter()
                .find(|s| &s.stream_id == stream_id)?;
            let profile = state.active_profile.read().await;
            let stream_info = profile.streams.iter().find(|s| &s.id == stream_id)?;
            let station = stream_info.name.clone();
            match &stream_status.current_track {
                Some(t) if !t.artist.is_empty() || !t.title.is_empty() => {
                    Some(format!("{} — {} — {}", station, t.artist, t.title))
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

### 6. `tray::handlers::on_tray_icon_event`

Left-click (button up) → toggle main window:

```rust
pub fn on_tray_icon_event(tray: &TrayIcon, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event {
        toggle_window_visibility(tray.app_handle());
    }
}

fn toggle_window_visibility(app: &AppHandle) {
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

Right-click is handled automatically by Tauri (opens the attached menu).

### 7. `tray::handlers::on_menu_event`

```rust
pub fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "toggle-playback" => spawn_toggle_playback(app),
        "stop-playback"   => spawn_stop_playback(app),
        "stop-all"        => spawn_stop_all(app),
        "toggle-window"   => toggle_window_visibility(app),
        "quit"            => handle_quit(app),
        _ => {}
    }
}
```

Each `spawn_*` clones `AppHandle` and runs the operation in a tokio task (because `MenuEvent` callback is sync but our state access is async).

`spawn_stop_playback` additionally emits `player-status` and calls `notify_state_changed` (since `stop_session_public` is silent — does not emit on its own).

### 8. `tray::handlers::handle_quit`

```rust
fn handle_quit(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let active = {
            let mgr = state.stream_manager.read().await;
            mgr.get_all_statuses().iter()
                .filter(|s| matches!(s.state,
                    StreamState::Recording | StreamState::Connecting | StreamState::Reconnecting))
                .count()
        };
        if active > 0 {
            if !crate::tray::notify::show_quit_confirm(active) {
                return;
            }
        }
        crate::app_state::graceful_shutdown(&app).await;
        app.exit(0);
    });
}
```

### 9. `app_state::graceful_shutdown`

Extracted from existing `lib.rs::on_window_event(CloseRequested)`:

```rust
pub async fn graceful_shutdown(app: &AppHandle) {
    let state = app.state::<AppState>();

    // 1. Stop all recordings
    let mut mgr = state.stream_manager.write().await;
    mgr.stop_all();
    let active_ids: Vec<String> = mgr.get_all_statuses().iter()
        .filter(|s| !matches!(s.state, StreamState::Idle | StreamState::Error))
        .map(|s| s.stream_id.clone())
        .collect();
    drop(mgr);

    // 2. Save active URLs to profile
    let profile_read = state.active_profile.read().await;
    let urls: Vec<String> = active_ids.iter()
        .filter_map(|id| profile_read.streams.iter().find(|s| s.id == *id).map(|s| s.url.clone()))
        .collect();
    drop(profile_read);

    let mut profile = state.active_profile.write().await;
    profile.active_recording_urls = urls;
    let _ = profile.save().inspect_err(|e| log::error!("Failed to save profile on shutdown: {e}"));
    drop(profile);

    // 3. Stop player, save volume
    state.player.stop_session_public().await;
    let volume = state.player.current_volume().await;
    let mut profile = state.active_profile.write().await;
    profile.player_session.volume = volume;
    let _ = profile.save().inspect_err(|e| log::error!("Failed to save profile volume on shutdown: {e}"));
    drop(profile);

    // 4. Wait for in-flight tasks
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
}
```

Both `on_window_event` (when not minimizing to tray) and `handle_quit` call this function. Single source of truth for shutdown logic.

### 10. `lib.rs::on_window_event` (new behavior)

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

Note: tray "Вихід" always performs full shutdown (it bypasses `on_window_event` entirely — it calls `graceful_shutdown` directly then `app.exit(0)`, which terminates the app without firing further `CloseRequested` events, so `graceful_shutdown` is not double-invoked). The `minimize_to_tray` setting only affects the close button, not the tray quit.

### 11. `tray::notify::show_quit_confirm`

```rust
use windows::Win32::UI::WindowsAndMessaging::{
    MessageBoxW, MB_YESNO, MB_ICONWARNING, MB_DEFBUTTON2, MB_SETFOREGROUND, IDYES,
};
use windows::core::HSTRING;

pub fn show_quit_confirm(active: usize) -> bool {
    let title = HSTRING::from("Tapir — підтвердження");
    let body  = HSTRING::from(format!(
        "Активних записів: {active}.\nВийти з програми і зупинити їх?"
    ));
    let result = unsafe {
        MessageBoxW(None, &body, &title,
            MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2 | MB_SETFOREGROUND)
    };
    result == IDYES
}
```

- `MB_DEFBUTTON2` → "No" is default (safe).
- `MB_SETFOREGROUND` → raises above other windows.
- `None` parent → standalone; works even when main window is hidden.
- Native MessageBox is read by NVDA automatically.

### 12. `tray::notify::show_balloon_throttled`

```rust
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static LAST_BALLOON_MS: AtomicU64 = AtomicU64::new(0);
const THROTTLE_MS: u64 = 3000;

pub fn show_balloon_throttled(app: &AppHandle, station: &str, artist: &str, title: &str) {
    let now = SystemTime::now().duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64).unwrap_or(0);
    let last = LAST_BALLOON_MS.load(Ordering::Relaxed);
    if now.saturating_sub(last) < THROTTLE_MS { return; }
    LAST_BALLOON_MS.store(now, Ordering::Relaxed);

    let body = match (artist.is_empty(), title.is_empty()) {
        (false, false) => format!("{artist} — {title}"),
        (true, false)  => title.to_string(),
        (false, true)  => artist.to_string(),
        _ => return,
    };
    let _ = show_balloon(app, station, &body);
}
```

### 13. `tray::notify::show_balloon` (Win32 implementation)

Tauri 2 does not expose the HWND of the tray icon, so we cannot attach a balloon to Tauri's NOTIFYICONDATA directly. The chosen approach:

1. Create a **hidden message-only window** (`HWND_MESSAGE` parent) during `tray::setup_tray`.
2. Register a separate `NOTIFYICONDATA` bound to that hwnd. The icon is set with `uFlags` excluding `NIF_ICON` (so it stays invisible) but `NIF_INFO` is used for balloon display.
3. The message-only window's WndProc intercepts `NIN_BALLOONUSERCLICK` (sent as our chosen `uCallbackMessage`) and posts a request to show the main window.
4. On shutdown, send `NIM_DELETE` to clean up.

This decouples balloon display from the Tauri tray icon (which keeps its right-click menu).

**Fallback (if message-only window approach proves problematic during implementation):** swap to `tauri-plugin-notification` and accept the "PowerShell" sender label in portable mode. This trade-off is acknowledged here and re-evaluated in the implementation phase.

Body content:
- `szInfoTitle` — station name (max 64 chars, truncate)
- `szInfo` — "Artist — Title" (max 256 chars, truncate)
- `dwInfoFlags = NIIF_NONE | NIIF_RESPECT_QUIET_TIME`
- `uTimeout = 5000` (ignored on Win10+, kept for compatibility)

---

## Settings interaction

| Setting | Effect |
|---------|--------|
| `minimizeToTray` (default `true`) | When `true`: close button hides window. When `false`: close button performs graceful shutdown + exit. Tray icon is always present regardless. |
| `showTrayNotifications` (default `true`) | When `false`: `show_balloon_throttled` returns immediately without invoking Win32. |

Both settings live in `GlobalSettings` (already present). Read at the moment of use, not cached — supports live toggling.

---

## Error handling

| Failure mode | Handling |
|--------------|----------|
| `setup_tray` fails (no icon, capabilities missing) | Log error; app continues without tray. Bubbled up from `setup()` callback. |
| `tray_by_id("main")` returns `None` during `notify_state_changed` | Silent no-op (process is shutting down). |
| `set_menu` / `set_tooltip` fails | Log warning; menu becomes stale until next event. No retry. |
| `graceful_shutdown` task panics | Default Tauri behavior (logs panic). `app.exit(0)` still runs. |
| `Shell_NotifyIconW` returns failure | Log warning; balloon silently fails. Future track changes try again. |
| Window-state plugin restores hidden window on startup with no tray icon | Tray icon is unconditionally created in `setup` — user can always recover the window. |

---

## Localization

UK only for Phase 3A. All labels are hard-coded constants in `tray/menu.rs` and `tray/notify.rs`. EN translations are deferred to a future i18n pass (Phase 3I or separate). Rationale: Paraglide.js is frontend-only; introducing a parallel Rust i18n system for a single feature is premature.

---

## Testing

### Build & lint
- `cargo build --release` succeeds with no new warnings.
- `cargo clippy --all-targets` passes.

### Manual NVDA-friendly test plan

1. **Tray appears** — launch `tapir.exe`. Verify icon in notification area. Hover → tooltip "Tapir".
2. **Idle right-click menu** — items: "Грати" (disabled), "Приховати Tapir", "Вихід". No "Зараз грає", no "Стоп", no "Записи".
3. **Recording menu** — start a recording → right-click → "● Записи: 1 активних" (disabled) + "Зупинити всі записи".
4. **Playback menu** — start playback → right-click → "Зараз грає: {station}", "Пауза", "Зупинити".
5. **Combined state** — playback + recording → tooltip "Tapir — ▶ {station} · ● 1 записів".
6. **Left-click toggle** — left-click on tray → window hides. Left-click again → window shows and gets focus. Verify ActivityBar receives focus.
7. **Close button (minimizeToTray=true)** — Alt+F4 or X → window hides, process keeps running, recordings continue.
8. **Close button (minimizeToTray=false)** — toggle setting → Alt+F4 → graceful shutdown + exit.
9. **Track-change balloon** — playback with ICY metadata → balloon appears with station title + "Artist — Title". Second track change within 3 s → no balloon. After 3 s → new balloon.
10. **Balloon click** — click on balloon → window shows and gets focus.
11. **Quit with recordings** — recordings active → tray "Вихід" → native MessageBox "Активних записів: 1. Вийти?". NVDA reads dialog. "No" (default) → no action. "Yes" → graceful shutdown + exit.
12. **Quit without recordings** — tray "Вихід" → graceful shutdown + exit immediately (no MessageBox).
13. **Disabled toggle-playback** — idle state → "Грати" menu item is keyboard-greyed (disabled). Cannot be activated.
14. **High contrast / NVDA** — open Windows High Contrast → tray menu still readable; NVDA announces each menu item correctly.

### Not testing (out of scope)
- Automated end-to-end (Tauri webdriver) for tray — Tauri 2 has no stable tray testing harness.
- Unit tests for `notify_state_changed` — heavily integration-dependent on Tauri runtime. Manual test plan substitutes.

---

## Out of scope (deferred)

- English localization of tray strings.
- Per-state custom icons (red dot when recording, etc.). Tooltip dynamism suffices for Phase 3A.
- Submenu listing all profile streams ("Грати станцію …" / "Записати станцію …").
- Volume slider in tray menu.
- Custom balloon icon (uses app icon).
- Tray icon double-click handler — single left-click suffices.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Tauri 2 does not expose tray icon HWND → can't attach balloon directly | Create hidden message-only window with separate NOTIFYICONDATA. Fallback to `tauri-plugin-notification` (accepting "PowerShell" sender) if implementation proves problematic. |
| Windows "Focus Assist" / "Do Not Disturb" suppresses balloons | Accepted. `NIIF_RESPECT_QUIET_TIME` is standard behavior; users opt in via setting. |
| `graceful_shutdown` extraction breaks existing close-window path | Single source of truth + both code paths tested manually (items 7, 8, 11, 12). |
| Tray rebuild during shutdown causes race | `notify_state_changed` spawn — `tray_by_id` returns `None` after exit, safe no-op. |
| `windows` crate bloats binary | Restricted features keep size to ~150 KB. Acceptable. |
| Tray icon "stuck" after process crash | Windows OS auto-cleans on process exit. Optional: `NIM_DELETE` on graceful shutdown via Drop impl. |

---

## Acceptance criteria (from implementation-phases.md §3A)

- [ ] Іконка у systemtray з tooltip.
- [ ] Right-click — контекстне меню зі специфікованими пунктами (Now Playing, Play/Pause, Stop, Recording info, Stop all, Show/Hide, Quit).
- [ ] Меню динамічно оновлюється при зміні стану (player-status, recording-status, window visibility).
- [ ] Left-click — toggle видимості вікна.
- [ ] `minimizeToTray` setting працює (close button → hide).
- [ ] Balloon tip при зміні треку (throttle 3 s, respects `showTrayNotifications`).
- [ ] Confirm dialog (native MessageBox) при exit з активними записами.

---

## References

- [implementation-phases.md §3A](../../implementation-phases.md)
- [architecture.md §11 — System Tray](../../architecture.md)
- Tauri 2 tray docs: https://v2.tauri.app/learn/system-tray/
- Windows Shell_NotifyIconW: https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shell_notifyiconw
