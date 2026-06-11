# SMTC Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapir стає Windows-медіа-сесією: апаратні медіа-клавіші керують відтворенням, системний оверлей показує станцію і трек (FRD: [2026-06-11-smtc-integration](../../frd/2026-06-11-smtc-integration.md)).

**Architecture:** Новий модуль `src-tauri/src/smtc.rs` володіє всім WinRT/COM; оновлення серіалізуються через один worker-таск (mpsc-канал); кнопки SMTC перевикористовують код-шляхи хоткеїв. Деталі — [спека](../specs/2026-06-11-smtc-integration-design.md) і [ADR](../../decisions/2026-06-11-smtc-via-windows-crate.md).

**Tech Stack:** Rust (Tauri v2, `windows` 0.62 — фічі `Media`/`Foundation`/`Win32_System_WinRT`, tokio, lofty), React 19 + react-aria + Paraglide.

**Гілка:** `feature/smtc-integration` (вже створена від `develop`).

**Гейти:** `cargo test --manifest-path src-tauri/Cargo.toml`, `pnpm test`, `pnpm vite:build`. tsc — НЕ гейт (~51 відома помилка paraglide).

---

### Task 1: Налаштування `smtc_enabled` (Rust)

**Files:**
- Modify: `src-tauri/src/settings.rs`

- [ ] **Step 1: Написати падаючі тести**

У `src-tauri/src/settings.rs`, в кінець `mod tests` (після `legacy_config_without_volume_step_uses_default`):

```rust
    #[test]
    fn smtc_enabled_defaults_to_true() {
        assert!(GlobalSettings::default().smtc_enabled);
    }

    #[test]
    fn legacy_config_without_smtc_field_defaults_to_true() {
        // settings.json, записаний до появи SMTC, мусить завантажитися,
        // а нове поле отримати default (патерн KB-12 / prev_track).
        let json = r#"{"language":"en-US","theme":"auto","activeProfile":"Default"}"#;
        let s: GlobalSettings = serde_json::from_str(json).unwrap();
        assert!(s.smtc_enabled);
    }

    #[test]
    fn smtc_enabled_false_round_trips() {
        let mut s = GlobalSettings::default();
        s.smtc_enabled = false;
        let json = serde_json::to_string(&s).unwrap();
        let back: GlobalSettings = serde_json::from_str(&json).unwrap();
        assert!(!back.smtc_enabled);
    }
```

- [ ] **Step 2: Переконатися, що тести падають**

Run: `cargo test --manifest-path src-tauri/Cargo.toml smtc_enabled`
Expected: COMPILE FAIL — `no field 'smtc_enabled' on type GlobalSettings` (E0609/E0560).

- [ ] **Step 3: Додати поле**

У `GlobalSettings` (після `volume_step_percent`):

```rust
    #[serde(default = "default_true")]
    pub smtc_enabled: bool,
```

У `impl Default for GlobalSettings` (після `volume_step_percent: 5,`):

```rust
            smtc_enabled: true,
```

- [ ] **Step 4: Тести зелені**

Run: `cargo test --manifest-path src-tauri/Cargo.toml smtc_enabled`
Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/settings.rs
git commit -m "feat(smtc): add smtc_enabled setting, default on (FR-7)"
```

---

### Task 2: Спільний debounce для toggle_playback

`toggle_playback` (хоткей) і майбутні SMTC Play/Pause мають ділити один debounce-cell — хоткей + медіа-клавіша в межах 500 мс дають одну дію (NFR FRD §4).

**Files:**
- Modify: `src-tauri/src/shortcuts.rs`

- [ ] **Step 1: Написати падаючий тест**

У `mod tests` файлу `src-tauri/src/shortcuts.rs`:

```rust
    #[test]
    fn toggle_playback_debounce_cell_swallows_repeat() {
        LAST_TOGGLE_PLAYBACK_MS.store(0, Ordering::Relaxed);
        assert!(!recently_fired(&LAST_TOGGLE_PLAYBACK_MS), "first call must pass");
        assert!(recently_fired(&LAST_TOGGLE_PLAYBACK_MS), "repeat must be debounced");
    }
```

- [ ] **Step 2: Переконатися, що падає**

Run: `cargo test --manifest-path src-tauri/Cargo.toml toggle_playback_debounce`
Expected: COMPILE FAIL — `cannot find value LAST_TOGGLE_PLAYBACK_MS`.

- [ ] **Step 3: Додати cell і вантуз у хоткей**

У `src-tauri/src/shortcuts.rs` поряд з наявними cell'ами (рядки ~75-76):

```rust
// Shared with the SMTC Play/Pause handlers (smtc.rs): a hotkey and a media
// key pressed near-simultaneously must yield one action, not a double toggle.
pub(crate) static LAST_TOGGLE_PLAYBACK_MS: AtomicU64 = AtomicU64::new(0);
```

Зробити `recently_fired` видимим для smtc.rs — змінити сигнатуру:

```rust
pub(crate) fn recently_fired(last: &AtomicU64) -> bool {
```

Гілку `"toggle_playback"` у `handle_shortcut_action` обгорнути debounce'ом:

```rust
            "toggle_playback" => {
                if recently_fired(&LAST_TOGGLE_PLAYBACK_MS) {
                    debug!("Global shortcut: toggle_playback ignored (debounce)");
                } else {
                    let status = state.player.get_status().await;
                    match status.state {
                        PlaybackState::Playing => { let _ = state.player.pause_playback(&app).await; }
                        PlaybackState::Paused => { let _ = state.player.resume_playback(&app).await; }
                        _ => { info!("Global shortcut: toggle_playback — nothing playing"); }
                    }
                }
            }
```

- [ ] **Step 4: Тести зелені (всі, не лише новий)**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: усі PASS, нових падінь нема.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/shortcuts.rs
git commit -m "feat(smtc): shared debounce cell for toggle_playback (NFR dedup)"
```

---

### Task 3: Cargo-фічі + smtc.rs — чисті хелпери (TDD)

Метадані, мапінг станів і звірка джерел — чисті функції без COM, повністю юніт-тестовані.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs` (лише `mod smtc;`)
- Create: `src-tauri/src/smtc.rs`

- [ ] **Step 1: Додати фічі windows-crate**

У `src-tauri/Cargo.toml` розширити блок `windows` (і коментар над ним):

```toml
# Win32 APIs for quit-confirm MessageBox, Shell file operations
# (Recycle Bin delete via SHFileOperationW) and the SMTC media session
# (WinRT Media + interop, see src/smtc.rs).
windows = { version = "0.62", features = [
    "Win32_UI_WindowsAndMessaging",
    "Win32_UI_Shell",
    "Win32_Foundation",
    "Win32_Storage_FileSystem",
    "Win32_System_Power",
    "Win32_System_WinRT",
    "Media",
    "Foundation",
] }
```

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: OK (фічі існують; якщо `Media` вимагатиме ще чогось — компілятор підкаже точну назву фічі).

- [ ] **Step 2: Створити smtc.rs з тестами (red)**

Створити `src-tauri/src/smtc.rs`:

```rust
//! System Media Transport Controls (SMTC) integration.
//!
//! Owns all WinRT/COM interop for the Windows media session: hardware media
//! keys (play/pause, headset buttons) and the system media overlay. All
//! updates are serialized through a single worker task — rationale in
//! docs/decisions/2026-06-11-smtc-via-windows-crate.md.
//!
//! Init failure (e.g. Windows N without the Media Feature Pack) leaves the
//! channel unset and every public facade a silent no-op: recording and
//! global hotkeys never depend on SMTC.

use windows::Media::MediaPlaybackStatus;

use crate::player::engine::{PlaybackSource, PlaybackState};

// ── Pure helpers (unit-tested, no COM) ──────────────────────────────────────

/// What the overlay shows. Composition rules: spec §«Метадані (FR-4)».
#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct SmtcMetadata {
    pub title: String,
    pub artist: String,
    pub album: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn live_metadata_with_track_puts_station_in_album() {
        let md = compose_live_metadata("Радіо Київ", Some(("Океан Ельзи", "Обійми")));
        assert_eq!(md.title, "Обійми");
        assert_eq!(md.artist, "Океан Ельзи");
        assert_eq!(md.album, "Радіо Київ");
    }

    #[test]
    fn live_metadata_without_track_shows_station_as_title() {
        let md = compose_live_metadata("Радіо Київ", None);
        assert_eq!(md.title, "Радіо Київ");
        assert_eq!(md.artist, "");
        assert_eq!(md.album, "");
    }

    #[test]
    fn file_metadata_prefers_tags() {
        let md = compose_file_metadata(r"C:\rec\2026\song.mp3", "Artist", "Tagged Title");
        assert_eq!(md.title, "Tagged Title");
        assert_eq!(md.artist, "Artist");
        assert_eq!(md.album, "");
    }

    #[test]
    fn file_metadata_falls_back_to_file_stem() {
        let md = compose_file_metadata(r"C:\rec\2026\Океан Ельзи - Обійми.mp3", "", "");
        assert_eq!(md.title, "Океан Ельзи - Обійми");
        assert_eq!(md.artist, "");
    }

    #[test]
    fn playback_status_mapping() {
        assert_eq!(map_playback_status(&PlaybackState::Playing), MediaPlaybackStatus::Playing);
        assert_eq!(map_playback_status(&PlaybackState::Paused), MediaPlaybackStatus::Paused);
        assert_eq!(map_playback_status(&PlaybackState::Stopped), MediaPlaybackStatus::Closed);
    }

    #[test]
    fn same_source_compares_by_identity_fields() {
        let s1 = PlaybackSource::Stream { stream_id: "a".into() };
        let s2 = PlaybackSource::Stream { stream_id: "a".into() };
        let s3 = PlaybackSource::Stream { stream_id: "b".into() };
        let f = PlaybackSource::File { path: "x.mp3".into() };
        assert!(same_source(Some(&s1), Some(&s2)));
        assert!(!same_source(Some(&s1), Some(&s3)));
        assert!(same_source(None, None));
        assert!(!same_source(Some(&s1), None));
        assert!(!same_source(Some(&s1), Some(&f)));
    }

    #[test]
    fn track_updates_keyed_to_current_source() {
        let stream = PlaybackSource::Stream { stream_id: "a".into() };
        let preview = PlaybackSource::Preview { url: "http://x".into(), name: "X".into() };
        let file = PlaybackSource::File { path: "x.mp3".into() };
        assert!(track_matches_source("a", Some(&stream)));
        assert!(!track_matches_source("b", Some(&stream)));
        assert!(track_matches_source("", Some(&preview))); // прев'ю — порожній id
        assert!(!track_matches_source("a", Some(&preview)));
        assert!(!track_matches_source("", Some(&file)));
        assert!(!track_matches_source("a", None));
    }
}
```

У `src-tauri/src/lib.rs` додати до списку модулів (за абеткою, після `mod shortcuts;`):

```rust
mod smtc;
```

- [ ] **Step 3: Переконатися, що тести падають**

Run: `cargo test --manifest-path src-tauri/Cargo.toml smtc::`
Expected: COMPILE FAIL — `cannot find function compose_live_metadata` (та інші E0425).

- [ ] **Step 4: Реалізувати хелпери**

Додати у `src-tauri/src/smtc.rs` (між `SmtcMetadata` і `mod tests`):

```rust
/// Метадані для станції/прев'ю. `track` = (artist, title) з ICY;
/// title завжди непорожній (гарантія parse_stream_title в engine.rs).
pub(crate) fn compose_live_metadata(station: &str, track: Option<(&str, &str)>) -> SmtcMetadata {
    match track {
        Some((artist, title)) => SmtcMetadata {
            title: title.to_string(),
            artist: artist.to_string(),
            album: station.to_string(),
        },
        None => SmtcMetadata {
            title: station.to_string(),
            ..Default::default()
        },
    }
}

/// Метадані для файлу: теги, fallback — ім'я файлу без розширення.
pub(crate) fn compose_file_metadata(path: &str, tag_artist: &str, tag_title: &str) -> SmtcMetadata {
    let title = if tag_title.is_empty() {
        std::path::Path::new(path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(path)
            .to_string()
    } else {
        tag_title.to_string()
    };
    SmtcMetadata {
        title,
        artist: tag_artist.to_string(),
        album: String::new(),
    }
}

/// FR-1/FR-8: Stopped → Closed (сесію додатково знімає clear_session).
pub(crate) fn map_playback_status(state: &PlaybackState) -> MediaPlaybackStatus {
    match state {
        PlaybackState::Playing => MediaPlaybackStatus::Playing,
        PlaybackState::Paused => MediaPlaybackStatus::Paused,
        PlaybackState::Stopped => MediaPlaybackStatus::Closed,
    }
}

/// Чи це те саме джерело відтворення (зміна джерела скидає ICY-трек).
pub(crate) fn same_source(a: Option<&PlaybackSource>, b: Option<&PlaybackSource>) -> bool {
    match (a, b) {
        (None, None) => true,
        (
            Some(PlaybackSource::Stream { stream_id: x }),
            Some(PlaybackSource::Stream { stream_id: y }),
        ) => x == y,
        (Some(PlaybackSource::File { path: x }), Some(PlaybackSource::File { path: y })) => x == y,
        (
            Some(PlaybackSource::Preview { url: x, .. }),
            Some(PlaybackSource::Preview { url: y, .. }),
        ) => x == y,
        _ => false,
    }
}

/// Чи належить ICY-оновлення (ключоване stream_id) поточному джерелу.
/// Прев'ю несуть порожній stream_id.
pub(crate) fn track_matches_source(stream_id: &str, source: Option<&PlaybackSource>) -> bool {
    match source {
        Some(PlaybackSource::Stream { stream_id: id }) => {
            !stream_id.is_empty() && id == stream_id
        }
        Some(PlaybackSource::Preview { .. }) => stream_id.is_empty(),
        _ => false,
    }
}
```

- [ ] **Step 5: Тести зелені**

Run: `cargo test --manifest-path src-tauri/Cargo.toml smtc::`
Expected: `7 passed`

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/smtc.rs
git commit -m "feat(smtc): pure helpers — metadata composition, status mapping (FR-1, FR-4)"
```

---

### Task 4: smtc.rs — COM-шар, worker, ButtonPressed, init

COM-шар тонкий і свідомо без юніт-тестів; гейт — компіляція + ручна перевірка в Task 8.

**Files:**
- Modify: `src-tauri/src/smtc.rs`
- Modify: `src-tauri/src/lib.rs` (виклик `smtc::init` у setup)

- [ ] **Step 1: Додати фасад, init і обробник кнопок**

У `src-tauri/src/smtc.rs` замінити блок `use` на:

```rust
use std::sync::OnceLock;

use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc::{self, UnboundedSender};
use windows::core::{HSTRING, Ref};
use windows::Foundation::TypedEventHandler;
use windows::Media::{
    MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls,
    SystemMediaTransportControlsButton, SystemMediaTransportControlsButtonPressedEventArgs,
    SystemMediaTransportControlsDisplayUpdater,
};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;

use crate::app_state::AppState;
use crate::player::engine::{PlaybackSource, PlaybackState, PlayerStatus};
```

Після чистих хелперів (перед `mod tests`) додати:

```rust
// ── Facade (no-op until init succeeds) ──────────────────────────────────────

enum SmtcCommand {
    Status(PlayerStatus),
    Track { stream_id: String, artist: String, title: String },
    SetEnabled(bool),
}

static SMTC_TX: OnceLock<UnboundedSender<SmtcCommand>> = OnceLock::new();

fn send(cmd: SmtcCommand) {
    if let Some(tx) = SMTC_TX.get() {
        let _ = tx.send(cmd);
    }
}

/// Дзеркалить перехід стану плеєра в сесію (FR-1, FR-8).
/// Викликається з emit_player_status — єдиного funnel'а станів двигуна.
pub fn sync_status(status: &PlayerStatus) {
    send(SmtcCommand::Status(status.clone()));
}

/// Дзеркалить ICY-трек (FR-4). Для прев'ю stream_id порожній.
pub fn sync_track(stream_id: &str, artist: &str, title: &str) {
    send(SmtcCommand::Track {
        stream_id: stream_id.to_string(),
        artist: artist.to_string(),
        title: title.to_string(),
    });
}

/// Застосовує перемикач Settings → Hotkeys (FR-7).
pub fn set_enabled(enabled: bool) {
    send(SmtcCommand::SetEnabled(enabled));
}

/// Створює SMTC-сесію для головного вікна і запускає worker.
/// Невдача (Windows N без Media Feature Pack тощо) → warn у лог, фасади
/// лишаються мовчазними no-op (graceful-no-op NFR з FRD §4).
pub fn init(app: &AppHandle, enabled: bool) {
    let Some(window) = app.get_webview_window("main") else {
        log::warn!("SMTC: main window not found, integration disabled");
        return;
    };
    let hwnd = match window.hwnd() {
        Ok(h) => h.0 as isize,
        Err(e) => {
            log::warn!("SMTC: cannot get HWND: {e}");
            return;
        }
    };
    let controls = match controls_for_hwnd(hwnd) {
        Ok(c) => c,
        Err(e) => {
            log::warn!("SMTC: init failed (Windows N without Media Feature Pack?): {e}");
            return;
        }
    };

    let app_for_buttons = app.clone();
    let subscribed = controls.ButtonPressed(&TypedEventHandler::new(
        move |_, args: Ref<'_, SystemMediaTransportControlsButtonPressedEventArgs>| {
            if let Some(args) = args.as_ref() {
                handle_button(&app_for_buttons, args.Button()?);
            }
            Ok(())
        },
    ));
    if let Err(e) = subscribed {
        log::warn!("SMTC: ButtonPressed subscription failed: {e}");
        return;
    }

    let (tx, rx) = mpsc::unbounded_channel();
    if SMTC_TX.set(tx).is_err() {
        log::warn!("SMTC: init called twice, ignoring");
        return;
    }
    tauri::async_runtime::spawn(run_worker(app.clone(), controls, rx, enabled));
    log::info!("SMTC: initialized (enabled={enabled})");
}

fn controls_for_hwnd(hwnd: isize) -> windows::core::Result<SystemMediaTransportControls> {
    let interop = windows::core::factory::<
        SystemMediaTransportControls,
        ISystemMediaTransportControlsInterop,
    >()?;
    unsafe { interop.GetForWindow(HWND(hwnd as *mut core::ffi::c_void)) }
}

/// Виконується на WinRT-потоці — тут лише диспетчеризація (FRD §5),
/// решта в tauri::async_runtime, як у обробника хоткеїв.
fn handle_button(app: &AppHandle, button: SystemMediaTransportControlsButton) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        match button {
            SystemMediaTransportControlsButton::Play => {
                if crate::shortcuts::recently_fired(&crate::shortcuts::LAST_TOGGLE_PLAYBACK_MS) {
                    log::debug!("SMTC: play ignored (debounce)");
                    return;
                }
                let _ = state.player.resume_playback(&app).await;
            }
            SystemMediaTransportControlsButton::Pause => {
                if crate::shortcuts::recently_fired(&crate::shortcuts::LAST_TOGGLE_PLAYBACK_MS) {
                    log::debug!("SMTC: pause ignored (debounce)");
                    return;
                }
                let _ = state.player.pause_playback(&app).await;
            }
            // FR-5: Stop зупиняє відтворення, НЕ запис. Без debounce — ідемпотентний.
            SystemMediaTransportControlsButton::Stop => {
                let _ = state.player.stop_playback(&app).await;
            }
            // Рішення «що таке next» живе у webview — той самий міст, що в
            // хоткеїв prev/next (shortcuts.rs). Без debounce: повторні
            // натискання — легітимний спосіб перегортати.
            SystemMediaTransportControlsButton::Next => {
                let _ = app.emit("transport-skip", "next");
            }
            SystemMediaTransportControlsButton::Previous => {
                let _ = app.emit("transport-skip", "prev");
            }
            _ => {}
        }
    });
}

// ── Worker (серіалізує всі COM-оновлення) ───────────────────────────────────

struct WorkerState {
    enabled: bool,
    status: PlayerStatus,
    /// Останній ICY-трек поточного джерела: (artist, title).
    track: Option<(String, String)>,
    /// Теги поточного файлу: (artist, title); порожні, якщо не файл.
    file_tags: (String, String),
}

async fn run_worker(
    app: AppHandle,
    controls: SystemMediaTransportControls,
    mut rx: mpsc::UnboundedReceiver<SmtcCommand>,
    enabled: bool,
) {
    let updater = match controls.DisplayUpdater() {
        Ok(u) => u,
        Err(e) => {
            log::warn!("SMTC: DisplayUpdater unavailable: {e}");
            return;
        }
    };
    if let Err(e) = configure_buttons(&controls) {
        log::warn!("SMTC: button setup failed: {e}");
    }
    let mut state = WorkerState {
        enabled,
        status: PlayerStatus {
            state: PlaybackState::Stopped,
            source: None,
            volume: 0.0,
            position_ms: None,
            duration_ms: None,
        },
        track: None,
        file_tags: (String::new(), String::new()),
    };
    // Сесія стартує знятою (нічого не грає при запуску).
    apply(&app, &controls, &updater, &state).await;

    while let Some(cmd) = rx.recv().await {
        match cmd {
            SmtcCommand::Status(new_status) => {
                if !same_source(state.status.source.as_ref(), new_status.source.as_ref()) {
                    state.track = None;
                    state.file_tags = match &new_status.source {
                        Some(PlaybackSource::File { path }) => {
                            let path = path.clone();
                            tokio::task::spawn_blocking(move || read_file_tags(&path))
                                .await
                                .unwrap_or_default()
                        }
                        _ => (String::new(), String::new()),
                    };
                }
                state.status = new_status;
            }
            SmtcCommand::Track { stream_id, artist, title } => {
                if !track_matches_source(&stream_id, state.status.source.as_ref()) {
                    continue; // stale-оновлення від попереднього джерела
                }
                state.track = Some((artist, title));
            }
            SmtcCommand::SetEnabled(value) => state.enabled = value,
        }
        apply(&app, &controls, &updater, &state).await;
    }
}

fn configure_buttons(controls: &SystemMediaTransportControls) -> windows::core::Result<()> {
    // Усі кнопки завжди активні, коли сесія видима: Rust не знає, чи є
    // сусідній трек (стейт webview) — на межах prev/next мовчки no-op,
    // як і хоткеї Ctrl+Alt+стрілки (спека, «Мапінг стану»).
    controls.SetIsPlayEnabled(true)?;
    controls.SetIsPauseEnabled(true)?;
    controls.SetIsStopEnabled(true)?;
    controls.SetIsNextEnabled(true)?;
    controls.SetIsPreviousEnabled(true)?;
    Ok(())
}

/// Проштовхує стан worker'а в OS-сесію. FR-8: Stopped/вимкнено → повне
/// зняття, Tapir зникає з оверлея, медіа-клавіші — попередньому плеєру.
async fn apply(
    app: &AppHandle,
    controls: &SystemMediaTransportControls,
    updater: &SystemMediaTransportControlsDisplayUpdater,
    state: &WorkerState,
) {
    let result = if !state.enabled || matches!(state.status.state, PlaybackState::Stopped) {
        clear_session(controls, updater)
    } else {
        let metadata = match &state.status.source {
            Some(PlaybackSource::File { path }) => {
                compose_file_metadata(path, &state.file_tags.0, &state.file_tags.1)
            }
            Some(source) => {
                let station = resolve_station(app, source).await;
                let track = state.track.as_ref().map(|(a, t)| (a.as_str(), t.as_str()));
                compose_live_metadata(&station, track)
            }
            None => SmtcMetadata::default(),
        };
        show_session(controls, updater, &state.status.state, &metadata)
    };
    if let Err(e) = result {
        log::warn!("SMTC: update failed: {e}");
    }
}

fn clear_session(
    controls: &SystemMediaTransportControls,
    updater: &SystemMediaTransportControlsDisplayUpdater,
) -> windows::core::Result<()> {
    controls.SetPlaybackStatus(MediaPlaybackStatus::Closed)?;
    updater.ClearAll()?;
    controls.SetIsEnabled(false)?;
    Ok(())
}

fn show_session(
    controls: &SystemMediaTransportControls,
    updater: &SystemMediaTransportControlsDisplayUpdater,
    playback: &PlaybackState,
    metadata: &SmtcMetadata,
) -> windows::core::Result<()> {
    controls.SetIsEnabled(true)?;
    controls.SetPlaybackStatus(map_playback_status(playback))?;
    updater.SetType(MediaPlaybackType::Music)?;
    let music = updater.MusicProperties()?;
    music.SetTitle(&HSTRING::from(metadata.title.as_str()))?;
    music.SetArtist(&HSTRING::from(metadata.artist.as_str()))?;
    music.SetAlbumTitle(&HSTRING::from(metadata.album.as_str()))?;
    updater.Update()?;
    Ok(())
}

/// Назва станції для live-джерел: ім'я потоку з активного профілю (той самий
/// lookup, що в tray/notify.rs), ім'я прев'ю, fallback — сирий stream_id.
async fn resolve_station(app: &AppHandle, source: &PlaybackSource) -> String {
    match source {
        PlaybackSource::Preview { name, .. } => name.clone(),
        PlaybackSource::Stream { stream_id } => {
            let state = app.state::<AppState>();
            let profile = state.active_profile.read().await;
            profile
                .streams
                .iter()
                .find(|s| s.id == *stream_id)
                .map(|s| s.name.clone())
                .unwrap_or_else(|| stream_id.clone())
        }
        PlaybackSource::File { .. } => String::new(),
    }
}

/// (artist, title) з primary-тегу файлу; порожні рядки, якщо тегів нема.
/// Та сама lofty-механіка, що в songs/scanner.rs.
fn read_file_tags(path: &str) -> (String, String) {
    use lofty::file::TaggedFileExt;
    use lofty::prelude::*;

    match lofty::read_from_path(path) {
        Ok(tagged) => match tagged.primary_tag() {
            Some(tag) => (
                tag.artist().map(|c| c.to_string()).unwrap_or_default(),
                tag.title().map(|c| c.to_string()).unwrap_or_default(),
            ),
            None => (String::new(), String::new()),
        },
        Err(e) => {
            log::debug!("SMTC: failed to read tags from {path}: {e}");
            (String::new(), String::new())
        }
    }
}
```

**Якщо компілятор скаржиться** (версії windows-rs відрізняються в дрібницях):
- сигнатура хендлера `TypedEventHandler::new` — подивитися очікувану в повідомленні E0631 (старіші версії приймають `&Option<T>` замість `Ref<'_, T>`; тоді `args.as_ref()` → `args.as_ref()` так само працює);
- `lofty::read_from_path` шлях — звірити з `songs/scanner.rs` (там робочий набір імпортів);
- якщо `tauri::async_runtime::spawn(run_worker(...))` падає через `SystemMediaTransportControls: !Send` — перенести worker на виділений `std::thread` зі `std::sync::mpsc` і `tauri::async_runtime::block_on` для async-lookup'ів (малоймовірно: windows-rs інтерфейси Send+Sync).

- [ ] **Step 2: Виклик init у setup**

У `src-tauri/src/lib.rs`, в `.setup(...)`, замінити рядок `drop(settings);` (після блоку реєстрації хоткеїв) на:

```rust
            let smtc_enabled = settings.smtc_enabled;
            drop(settings);
            smtc::init(app.handle(), smtc_enabled);
```

- [ ] **Step 3: Компіляція і наявні тести**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: усі PASS (нових тестів нема; COM-код компілюється).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/smtc.rs src-tauri/src/lib.rs
git commit -m "feat(smtc): COM session, serialized worker, button handlers (FR-1/2/3/5/8)"
```

---

### Task 5: Хуки двигуна + side effect у save_settings

**Files:**
- Modify: `src-tauri/src/player/engine.rs` (2 рядки)
- Modify: `src-tauri/src/commands/settings_commands.rs`

- [ ] **Step 1: Хук статусу в emit_player_status**

У `src-tauri/src/player/engine.rs`, функція `emit_player_status` (~рядок 70) — додати виклик перед `app.emit`:

```rust
fn emit_player_status(app: &AppHandle, status: PlayerStatus, wake_lock: &WakeLock) {
    wake_lock.set_player(matches!(&status.state, PlaybackState::Playing));
    crate::smtc::sync_status(&status);
    if let Err(e) = app.emit("player-status", status) {
        log::warn!("Player: failed to emit player-status: {e}");
    }
    crate::tray::notify_state_changed(app);
}
```

- [ ] **Step 2: Хук ICY-метаданих**

Там само, в async-writer таску `play_live`, гілка `Some(IcyEvent::Metadata(artist, title))` (~рядок 738) — додати виклик **перед** `if !stream_id_writer.is_empty()`, щоб SMTC отримував метадані і для прев'ю (порожній stream_id), не змінюючи toast/webview-логіку:

```rust
                            Some(IcyEvent::Metadata(artist, title)) => {
                                crate::smtc::sync_track(&stream_id_writer, &artist, &title);
                                // Previews carry an empty stream_id (no profile stream); skip
                                // per-track events/notifications for them.
                                if !stream_id_writer.is_empty() {
```

- [ ] **Step 3: save_settings застосовує перемикач**

`smtc::set_enabled` не потребує AppHandle, тож сигнатура команди не змінюється
(YAGNI). У `src-tauri/src/commands/settings_commands.rs` замінити
`save_settings` на:

```rust
#[tauri::command]
pub async fn save_settings(
    settings: GlobalSettings,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let to_save = settings.clone();
    tokio::task::spawn_blocking(move || to_save.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    let mut current = state.settings.write().await;
    let smtc_changed = current.smtc_enabled != settings.smtc_enabled;
    let smtc_enabled = settings.smtc_enabled;
    *current = settings;
    drop(current);
    // Окремої команди (як register_hotkeys) не треба: тут нема списку
    // помилок для UI, перемикач застосовується мовчки.
    if smtc_changed {
        crate::smtc::set_enabled(smtc_enabled);
    }
    Ok(())
}
```

- [ ] **Step 4: Компіляція і тести**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: усі PASS.

- [ ] **Step 5: Smoke-перевірка (опційно, якщо є аудіо-середовище)**

Run: `just dev` → запустити відтворення станції → відкрити Win+волюм-оверлей.
Expected: Tapir у оверлеї з назвою станції; пауза/стоп прибирає або оновлює стан. Повна ручна перевірка — Task 8.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/player/engine.rs src-tauri/src/commands/settings_commands.rs
git commit -m "feat(smtc): wire engine status/ICY hooks and settings toggle (FR-1/4/7)"
```

---

### Task 6: Фронтенд — interface, i18n, чекбокс у HotkeysTab (TDD)

**Files:**
- Modify: `src/lib/tauri.ts`
- Modify: `src/i18n/messages/uk.json`, `src/i18n/messages/en.json`
- Modify: `src/components/settings/HotkeysTab.tsx`
- Test: `src/components/settings/HotkeysTab.test.tsx`

- [ ] **Step 1: i18n-ключі**

У `src/i18n/messages/uk.json`, після `"settings_hotkeys_reset_done"`:

```json
  "settings_smtc_enabled": "Інтеграція з системними медіа-кнопками",
```

У `src/i18n/messages/en.json`, у тому самому місці:

```json
  "settings_smtc_enabled": "System media keys integration",
```

Перегенерувати paraglide (vite-плагін генерує при збірці):

Run: `pnpm vite:build`
Expected: збірка OK, `m.settings_smtc_enabled` доступний.

- [ ] **Step 2: Interface**

У `src/lib/tauri.ts`, `interface GlobalSettings` — після `volumeStepPercent: number;`:

```ts
  smtcEnabled: boolean;
```

- [ ] **Step 3: Падаючий тест**

У `src/components/settings/HotkeysTab.test.tsx`:

До фікстури `baseSettings` додати (після `prevRestartThresholdMs: 0,`):

```ts
  smtcEnabled: true,
```

Новий describe у кінець файлу:

```tsx
describe("HotkeysTab — SMTC toggle (FR-7)", () => {
  it("toggles smtcEnabled into the settings store", () => {
    const { getByRole } = render(<HotkeysTab />);
    // react-aria Checkbox: accessible name містить префікс ✓-обгортки,
    // тому матчимо регекспом (той самий прийом, що в AudioTab.test.tsx).
    fireEvent.click(
      getByRole("checkbox", { name: new RegExp(m.settings_smtc_enabled()) }),
    );
    expect($settings.get()?.smtcEnabled).toBe(false);
  });
});
```

- [ ] **Step 4: Переконатися, що падає**

Run: `pnpm test`
Expected: новий тест FAIL — `Unable to find an accessible element with the role "checkbox"`. Решта тестів зелені.

- [ ] **Step 5: Чекбокс у HotkeysTab**

У `src/components/settings/HotkeysTab.tsx`:

Додати імпорт (після наявних):

```tsx
import { Checkbox, Label } from "react-aria-components";
```

Додати функцію поряд з `updateHotkey`:

```tsx
  function updateSmtcEnabled(val: boolean) {
    const current = $settings.get();
    if (!current) return;
    $settings.set({ ...current, smtcEnabled: val });
    // save() також викликає registerHotkeys — для чекбокса це зайве, але
    // нешкідливе (ідемпотентна перереєстрація); окремий сейв не вартий коду.
    save();
  }
```

У JSX — першим елементом усередині `<div className="space-y-4">` (перед `{HOTKEY_FIELDS.map(...)}`), патерн чекбоксів GeneralTab:

```tsx
      <Checkbox
        isSelected={settings.smtcEnabled}
        onChange={updateSmtcEnabled}
        className="flex items-center gap-2 text-sm text-slate-300"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">
          {settings.smtcEnabled && <span>✓</span>}
        </div>
        <Label>{m.settings_smtc_enabled()}</Label>
      </Checkbox>
```

- [ ] **Step 6: Тести зелені**

Run: `pnpm test`
Expected: усі PASS, включно з новим.

- [ ] **Step 7: Збірка**

Run: `pnpm vite:build`
Expected: OK.

- [ ] **Step 8: Commit**

```bash
git add src/lib/tauri.ts src/i18n/messages/uk.json src/i18n/messages/en.json src/components/settings/HotkeysTab.tsx src/components/settings/HotkeysTab.test.tsx
git commit -m "feat(smtc): settings toggle in Hotkeys tab (FR-7)"
```

---

### Task 7: Документація

**Files:**
- Modify: `docs/keyboard-shortcuts.md`
- Modify: `docs/frd/2026-06-11-smtc-integration.md`

- [ ] **Step 1: keyboard-shortcuts.md**

Прочитати файл; після секції/приміток Tier 1 додати підсекцію (заголовковий рівень підлаштувати під структуру файлу):

```markdown
### SMTC: системні медіа-клавіші

Апаратні медіа-клавіші (⏯, кнопки гарнітури, Bluetooth-пульти) керують
відтворенням через [SMTC-сесію](frd/2026-06-11-smtc-integration.md)
(`src-tauri/src/smtc.rs`), а не через глобальні хоткеї — ОС маршрутизує їх
кооперативно, нічого не крадучи в інших плеєрів. SMTC **доповнює** Tier 1,
дефолти хоткеїв не змінює; запис через SMTC невиразимий принципово
(toggle_recording / stop_all лишаються тільки хоткеями). Вимикається в
Settings → Hotkeys («Інтеграція з системними медіа-кнопками»). SMTC
Play/Pause ділить debounce-cell із хоткеєм toggle_playback — одночасне
натискання дає одну дію.
```

Оновити дату «Останнє звірення з кодом» (якщо є) на 2026-06-11.

- [ ] **Step 2: FRD — статус і відкриті питання**

У `docs/frd/2026-06-11-smtc-integration.md`:

Статусний рядок змінити на:

```markdown
- **Статус:** реалізовано (2026-06-11), гілка `feature/smtc-integration`.
  Дизайн: [спека](../superpowers/specs/2026-06-11-smtc-integration-design.md),
  [ADR](../decisions/2026-06-11-smtc-via-windows-crate.md).
```

Секцію «## 7. Відкриті питання» замінити на:

```markdown
## 7. Відкриті питання (закрито при реалізації)

- ~~Чи паузити інші медіа-сесії при старті відтворення Tapir~~ — явний
  exclusive mode не потрібен; авто-поведінку ОС перевірено при ручному
  тестуванні (див. критерій приймання 1).
- ~~Поведінка при кількох одночасних прев'ю (Browser)~~ — знято: двигун
  плеєра має одну сесію нараз, прев'ю витісняє попереднє відтворення;
  SMTC дзеркалить усе, що грає (станції, файли, прев'ю).
- FR-6 (обкладинка): відкладено — ліцензійність/кешування favicon'ів
  лишаються відкритими; Cargo-фічу `Storage_Streams` додамо разом з FR-6.
```

- [ ] **Step 3: Commit**

```bash
git add docs/keyboard-shortcuts.md docs/frd/2026-06-11-smtc-integration.md
git commit -m "docs(smtc): keyboard-shortcuts SMTC section, FRD status + closed questions"
```

---

### Task 8: Фінальні гейти + ручна перевірка (FRD §6)

- [ ] **Step 1: Усі автоматичні гейти**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml
pnpm test
pnpm vite:build
```
Expected: усі PASS / збірка OK.

- [ ] **Step 2: Зібрати застосунок для ручної перевірки**

Run: `just build-fast`
Expected: `src-tauri/target/release-fast/tapir.exe`.

- [ ] **Step 3: Ручний чекліст (виконує користувач — потрібні NVDA, гарнітура, Spotify)**

Критерії приймання FRD §6 — пройти всі:

1. Відтворення станції → ⏯ на клавіатурі → пауза; ще раз → продовження. Spotify не реагує.
2. Win+волюм/медіа-оверлей показує назву станції та поточний трек; трек оновлюється зі зміною ICY-метаданих.
3. Prev/next в оверлеї перемикають потік так само, як `Ctrl+Alt+←/→`.
4. Стоп відтворення → Tapir зникає з оверлея; медіа-клавіші повертаються попередньому плеєру.
5. Запис під час усіх сценаріїв вище не переривається і не стартує.
6. NVDA: фокус у будь-якому застосунку, кнопка гарнітури — пауза без зміни фокуса і зайвих озвучень.

Додатково (за дизайном):

7. Прев'ю в Браузері станцій → оверлей показує назву станції з Radio Browser.
8. Відтворення файлу з тегами → оверлей показує artist/title; без тегів — ім'я файлу.
9. Settings → Hotkeys → вимкнути «Інтеграція з системними медіа-кнопками» під час гри → Tapir одразу зникає з оверлея; увімкнути → з'являється зі станом і метаданими.
10. Хоткей `Ctrl+Shift+P` і ⏯ натиснуті майже одночасно → одна дія (не подвійний toggle).

- [ ] **Step 4: Завершення гілки**

Після проходження чеклісту — superpowers:finishing-a-development-branch (merge у `develop` / PR за вибором користувача).

---

## Покриття спеки (самоперевірка)

| Вимога | Task |
|---|---|
| FR-1 сесія дзеркалить PlaybackState | 4, 5 (sync_status з emit_player_status) |
| FR-2 Play/Pause → шлях toggle_playback | 4 (handle_button) + 2 (спільний debounce) |
| FR-3 Next/Prev → transport-skip | 4 (handle_button) |
| FR-4 метадані станція+ICY | 3 (compose), 4 (worker), 5 (sync_track хук) |
| FR-5 Stop → стоп відтворення, не запису | 4 (handle_button Stop) |
| FR-7 налаштування on/off | 1 (поле), 5 (save_settings), 6 (чекбокс) |
| FR-8 зняття сесії на Stopped | 3 (map Closed), 4 (clear_session) |
| NFR дедуплікація команд | 2 + 4 (LAST_TOGGLE_PLAYBACK_MS) |
| NFR graceful no-op (Windows N) | 4 (init-failure → no-op фасади) |
| NFR запис не залежить від SMTC | 4 (SMTC ніде не торкається recording) |
| Прев'ю дзеркалиться | 4 (resolve_station Preview), 5 (sync_track до фільтра) |
| Файли: теги + fallback | 3 (compose_file_metadata), 4 (read_file_tags) |
| Docs | 7 |
| Ручні критерії FRD §6 | 8 |
