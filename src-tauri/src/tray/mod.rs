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
