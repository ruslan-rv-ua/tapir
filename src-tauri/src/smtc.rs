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

// ── Pure helpers (unit-tested, no COM) ──────────────────────────────────────

/// What the overlay shows. Composition rules: spec §«Метадані (FR-4)».
#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct SmtcMetadata {
    pub title: String,
    pub artist: String,
    pub album: String,
}

/// Metadata for a station/preview. `track` = (artist, title) from ICY;
/// title is always non-empty (guaranteed by `connection::split_stream_title`).
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

/// Metadata for a file: tags, falling back to the file name without extension.
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

/// FR-1/FR-8: Stopped → Closed (clear_session additionally tears the session down).
pub(crate) fn map_playback_status(state: &PlaybackState) -> MediaPlaybackStatus {
    match state {
        PlaybackState::Playing => MediaPlaybackStatus::Playing,
        PlaybackState::Paused => MediaPlaybackStatus::Paused,
        PlaybackState::Stopped => MediaPlaybackStatus::Closed,
    }
}

/// Whether two playback sources are the same (a source change resets the ICY track).
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

/// Whether an ICY update (keyed by stream_id) belongs to the current source.
/// Previews carry an empty stream_id.
pub(crate) fn track_matches_source(stream_id: &str, source: Option<&PlaybackSource>) -> bool {
    match source {
        Some(PlaybackSource::Stream { stream_id: id }) => {
            !stream_id.is_empty() && id == stream_id
        }
        Some(PlaybackSource::Preview { .. }) => stream_id.is_empty(),
        _ => false,
    }
}

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

/// Mirrors a player state transition into the session (FR-1, FR-8).
/// Called from emit_player_status — the single funnel of engine states.
pub fn sync_status(status: &PlayerStatus) {
    send(SmtcCommand::Status(status.clone()));
}

/// Mirrors an ICY track update (FR-4). Previews carry an empty stream_id.
pub fn sync_track(stream_id: &str, artist: &str, title: &str) {
    send(SmtcCommand::Track {
        stream_id: stream_id.to_string(),
        artist: artist.to_string(),
        title: title.to_string(),
    });
}

/// Applies the Settings → Hotkeys toggle (FR-7).
pub fn set_enabled(enabled: bool) {
    send(SmtcCommand::SetEnabled(enabled));
}

/// Creates the SMTC session for the main window and starts the worker.
/// Failure (Windows N without Media Feature Pack etc.) → warn in the log,
/// facades stay silent no-ops (graceful-no-op NFR from the FRD §4).
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

/// Runs on a WinRT thread — only dispatching here (FRD §5),
/// the rest in tauri::async_runtime, like the hotkey handler.
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
                // Live sound can't be meaningfully paused — the buffer goes
                // stale and you lag the broadcast on resume — so Pause stops it,
                // consistent with the primary player control, Ctrl+Shift+K and
                // the tray toggle. A station played from the catalogue counts as
                // live too (`is_live`), which is why this asks the predicate and
                // not the `Stream` variant. Files pause normally.
                let status = state.player.get_status().await;
                if status.source.as_ref().is_some_and(PlaybackSource::is_live) {
                    let _ = state.player.stop_playback(&app).await;
                } else {
                    let _ = state.player.pause_playback(&app).await;
                }
            }
            // FR-5: Stop stops playback, NOT recording. No debounce — idempotent.
            SystemMediaTransportControlsButton::Stop => {
                let _ = state.player.stop_playback(&app).await;
            }
            // The "what is next" decision lives in the webview — same bridge
            // as the prev/next hotkeys (shortcuts.rs). No debounce: repeated
            // presses are the legitimate way to skip several tracks.
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

// ── Worker (serializes all COM updates) ─────────────────────────────────────

struct WorkerState {
    enabled: bool,
    status: PlayerStatus,
    /// Last ICY track of the current source: (artist, title).
    track: Option<(String, String)>,
    /// Tags of the currently playing file: (artist, title); empty when not a file.
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
    // The session starts torn down (nothing plays at app startup).
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
                    continue; // stale update from a previous source
                }
                state.track = Some((artist, title));
            }
            SmtcCommand::SetEnabled(value) => state.enabled = value,
        }
        apply(&app, &controls, &updater, &state).await;
    }
}

fn configure_buttons(controls: &SystemMediaTransportControls) -> windows::core::Result<()> {
    // All buttons stay enabled whenever the session is visible: Rust does not
    // know whether a neighbouring track exists (webview state) — at the list
    // boundary prev/next are silent no-ops, exactly like the Ctrl+Alt+arrow
    // hotkeys (spec, "Мапінг стану").
    controls.SetIsPlayEnabled(true)?;
    controls.SetIsPauseEnabled(true)?;
    controls.SetIsStopEnabled(true)?;
    controls.SetIsNextEnabled(true)?;
    controls.SetIsPreviousEnabled(true)?;
    Ok(())
}

/// Pushes the worker state into the OS session. FR-8: a Stopped (or disabled)
/// session is fully torn down so Tapir vanishes from the overlay and media
/// keys return to the previous player.
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

/// Station display name for live sources: stream name from the active profile
/// (same lookup as tray/notify.rs), preview name, fallback — raw stream id.
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

/// (artist, title) from the file's primary tag; empty strings when missing.
/// Same lofty mechanics as songs/scanner.rs.
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
        assert!(track_matches_source("", Some(&preview))); // previews carry an empty id
        assert!(!track_matches_source("a", Some(&preview)));
        assert!(!track_matches_source("", Some(&file)));
        assert!(!track_matches_source("a", None));
    }
}
