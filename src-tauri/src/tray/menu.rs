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
        PlaybackSource::Preview { name, .. } => {
            Some(format!("Прев'ю: {name}"))
        }
    }
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
        let long: String = "Я".repeat(200);
        let s = snap(PlaybackState::Playing, Some(&long), 0);
        let result = tooltip(&s);
        assert!(result.chars().count() <= 127);
    }
}
