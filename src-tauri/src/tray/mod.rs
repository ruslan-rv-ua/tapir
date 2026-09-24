//! System tray: icon, dynamic context menu, toast notifications, quit confirm.

pub mod menu;
pub mod handlers;
pub mod notify;

use tauri::{AppHandle, Manager};
use tauri::tray::TrayIconBuilder;
use crate::app_state::AppState;
use crate::player::engine::{PlaybackState, PlayerStatus};
use crate::stream::manager::StreamState;

pub const TRAY_ID: &str = "main";

/// How the tray renders playback — a **display model**, derived from
/// `PlayerStatus` and the profile's last source, not a mirror of either.
/// `PlaybackState` alone cannot decide a tray item: the menu stops live sound
/// and pauses a file, so it must know the source as well, and when nothing
/// plays it resumes the last source, so it must know whether there is one.
/// Pairing these as separate fields would spell combinations that do not exist
/// — "paused live sound" is unreachable (`PlaybackSource::is_live`: every
/// primary control stops live), and a last source only matters while nothing
/// plays. These five variants are exactly the situations the menu draws.
///
/// Model: CONTEXT.md §«Живе джерело», §«Головна кнопка і останнє джерело».
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MenuPlayback {
    /// Nothing is playing, and the profile has no last source: nothing for the
    /// primary item to resume.
    NoLastSource,
    /// Nothing is playing, and the profile has a last source — perhaps a stale
    /// one, which only the press finds out. The primary item resumes it.
    LastSource,
    /// Live sound — the air of a profile stream, or a station played straight
    /// from the catalogue. Stops; never pauses.
    Live,
    /// A saved file, playing.
    FilePlaying,
    /// A saved file, paused at a position.
    FilePaused,
}

impl MenuPlayback {
    /// Read the display model off a live player status and whether the active
    /// profile has a last source (`PlayerSession::has_last_source`). The one
    /// place the tray asks `is_live()`.
    pub fn from_status(status: &PlayerStatus, has_last_source: bool) -> Self {
        match (&status.state, status.source.as_ref()) {
            // A source implies an active session, so `Stopped` means nothing
            // plays whatever the source says — the invariant `decide_toggle`
            // relies on. ("Live" is reserved here for the domain sense two lines
            // down.)
            (PlaybackState::Stopped, _) | (_, None) => {
                if has_last_source { Self::LastSource } else { Self::NoLastSource }
            }
            (_, Some(source)) if source.is_live() => Self::Live,
            (PlaybackState::Playing, _) => Self::FilePlaying,
            (PlaybackState::Paused, _) => Self::FilePaused,
        }
    }
}

/// Everything the tray draws, read off `AppState` once per rebuild. A display
/// model throughout — a ready label, a count, two booleans — not a mirror of
/// any one subsystem's state.
#[derive(Debug, Clone)]
pub struct MenuSnapshot {
    pub playback: MenuPlayback,
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

    // A placeholder: the real state is read off `AppState` asynchronously, and
    // this runs on the setup thread. It is replaced right below.
    let initial = MenuSnapshot {
        playback: MenuPlayback::NoLastSource,
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

    // The placeholder greys "Play" even when the profile has a last source to
    // resume, and the next change of state may be a long way off: a window
    // shown at startup does not rebuild the menu. Read the real state now.
    notify_state_changed(app);

    Ok(())
}

/// Rebuild tray menu and tooltip from current AppState. Fire-and-forget.
///
/// Fire-and-forget is the dangerous half: the work runs in a spawned task, and
/// release builds are compiled with `panic = "abort"`, so a panic in here takes
/// the whole process down — before the log plugin has written a line, which is
/// what made this a silent instant death (backlog
/// minimized-start-crashes-release-build). Hence: this refresh may be called
/// from anywhere, at any moment, INCLUDING before `setup` has managed the state
/// — and it must then leave quietly rather than assume.
pub fn notify_state_changed(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(snap) = build_snapshot(&app).await else { return };
        if let Err(e) = apply_snapshot(&app, &snap) {
            log::warn!("Tray: failed to update menu/tooltip: {e}");
        }
    });
}

/// Whether the main window is in the foreground — visible **and** focused. The
/// question behind every choice between the window's surface and the system's
/// (ADR 2026-09-01 §3): NVDA reads live regions only in the foreground window,
/// so a visible window without focus counts as background. Ask it once the
/// answer is known, not when the action starts: a connect may take seconds, and
/// the person may have switched windows meanwhile.
pub fn window_in_foreground(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
        .unwrap_or(false)
}

/// `None` when there is no `AppState` yet — the caller ran before `setup`
/// managed it. `try_state`, not `state`: the latter panics, and a panic here is
/// fatal (see [`notify_state_changed`]).
async fn build_snapshot(app: &AppHandle) -> Option<MenuSnapshot> {
    let Some(state) = app.try_state::<AppState>() else {
        log::warn!("Tray: menu refresh before AppState is managed — skipped");
        return None;
    };
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

    // Session fields only — no disk, no lookup of the stream in the profile:
    // the menu is built ahead of the click, so a stale last source can only be
    // told at the press (tray-cannot-resume-last §3).
    let has_last_source = state.active_profile.read().await.player_session.has_last_source();

    let window_visible = app
        .get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);

    Some(MenuSnapshot {
        playback: MenuPlayback::from_status(&player_status, has_last_source),
        now_playing_label,
        active_recordings,
        window_visible,
    })
}

fn apply_snapshot(app: &AppHandle, snap: &MenuSnapshot) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return Ok(()); };
    let menu = menu::build_menu(app, snap)?;
    tray.set_menu(Some(menu))?;
    tray.set_tooltip(Some(menu::tooltip(snap)))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::player::engine::PlaybackSource;

    fn status(state: PlaybackState, source: Option<PlaybackSource>) -> PlayerStatus {
        PlayerStatus { state, source, volume: 1.0, position_ms: None, duration_ms: None }
    }

    /// Порядок армів у `from_status` компілятор **не** стереже: арм із `is_live()`
    /// має охоронця, тож підняти над ним `Playing` можна, і всі гейти лишаться
    /// зеленими — а ефір знову дістане «Пауза». Це рівно той дефект, заради якого
    /// заведено запис, тож кожен вид джерела названо тут поіменно.
    #[test]
    fn from_status_names_every_source_kind() {
        let stream = PlaybackSource::Stream { stream_id: "s1".into() };
        let preview = PlaybackSource::Preview { url: "http://x".into(), name: "X".into() };
        let file = PlaybackSource::File { path: "rec/a.mp3".into() };

        // Записане останнє джерело важить лише тоді, коли не грає нічого: те,
        // що грає, пункт трея називає однаково, є що продовжити чи ні.
        for has_last_source in [false, true] {
            // Обидва шляхи до живого звуку дають один стан — у цьому вся правка.
            let air = status(PlaybackState::Playing, Some(stream.clone()));
            assert_eq!(MenuPlayback::from_status(&air, has_last_source), MenuPlayback::Live);
            let from_catalogue = status(PlaybackState::Playing, Some(preview.clone()));
            assert_eq!(
                MenuPlayback::from_status(&from_catalogue, has_last_source),
                MenuPlayback::Live
            );

            // Файл — протилежність: у нього є позиція, тож пауза лишається законною.
            let playing = status(PlaybackState::Playing, Some(file.clone()));
            assert_eq!(
                MenuPlayback::from_status(&playing, has_last_source),
                MenuPlayback::FilePlaying
            );
            let paused = status(PlaybackState::Paused, Some(file.clone()));
            assert_eq!(
                MenuPlayback::from_status(&paused, has_last_source),
                MenuPlayback::FilePaused
            );
        }

        // Не грає нічого — і стан розпадається на два за тим, чи є що продовжити
        // (запис tray-cannot-resume-last §3).
        let nothing = status(PlaybackState::Stopped, None);
        assert_eq!(MenuPlayback::from_status(&nothing, false), MenuPlayback::NoLastSource);
        assert_eq!(MenuPlayback::from_status(&nothing, true), MenuPlayback::LastSource);
    }
}
