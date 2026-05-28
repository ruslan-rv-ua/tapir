//! System tray: icon, dynamic context menu, toast notifications, quit confirm.

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
