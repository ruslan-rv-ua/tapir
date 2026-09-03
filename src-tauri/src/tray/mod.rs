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
/// `PlayerStatus`, not a mirror of it. `PlaybackState` alone cannot decide a
/// tray item: the menu stops live sound and pauses a file, so it must know the
/// source as well. Pairing the two as separate fields would spell six
/// combinations where only four exist — "paused live sound" is unreachable
/// (`PlaybackSource::is_live`: every primary control stops live). These four
/// variants are exactly the situations the menu draws.
///
/// Model: CONTEXT.md §«Живе джерело».
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MenuPlayback {
    /// Nothing is playing.
    Idle,
    /// Live sound — the air of a profile stream, or a station played straight
    /// from the catalogue. Stops; never pauses.
    Live,
    /// A saved file, playing.
    FilePlaying,
    /// A saved file, paused at a position.
    FilePaused,
}

impl MenuPlayback {
    /// Read the display model off a live player status. The one place the tray
    /// asks `is_live()`.
    pub fn from_status(status: &PlayerStatus) -> Self {
        match (&status.state, status.source.as_ref()) {
            // A source implies an active session, so `Stopped` means idle
            // whatever the source says — the invariant `decide_toggle` relies
            // on. ("Live" is reserved here for the domain sense two lines down.)
            (PlaybackState::Stopped, _) | (_, None) => Self::Idle,
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

    let initial = MenuSnapshot {
        playback: MenuPlayback::Idle,
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
        playback: MenuPlayback::from_status(&player_status),
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

        // Обидва шляхи до живого звуку дають один стан — у цьому вся правка.
        let air = status(PlaybackState::Playing, Some(stream));
        assert_eq!(MenuPlayback::from_status(&air), MenuPlayback::Live);
        let from_catalogue = status(PlaybackState::Playing, Some(preview));
        assert_eq!(MenuPlayback::from_status(&from_catalogue), MenuPlayback::Live);

        // Файл — протилежність: у нього є позиція, тож пауза лишається законною.
        let playing = status(PlaybackState::Playing, Some(file.clone()));
        assert_eq!(MenuPlayback::from_status(&playing), MenuPlayback::FilePlaying);
        let paused = status(PlaybackState::Paused, Some(file));
        assert_eq!(MenuPlayback::from_status(&paused), MenuPlayback::FilePaused);

        let nothing = status(PlaybackState::Stopped, None);
        assert_eq!(MenuPlayback::from_status(&nothing), MenuPlayback::Idle);
    }
}
