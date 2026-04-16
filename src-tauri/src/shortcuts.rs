use crate::app_state::AppState;
use crate::player::engine::PlaybackState;
use crate::settings::HotkeyMap;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tracing::{info, warn};

/// Register all global shortcuts from the given HotkeyMap.
/// Returns a list of shortcut combos that failed to register.
pub fn register_global_shortcuts(app: &AppHandle, hotkeys: &HotkeyMap) -> Vec<String> {
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();

    let mut failed: Vec<String> = Vec::new();

    let combos = [
        (&hotkeys.toggle_recording, "toggle_recording"),
        (&hotkeys.toggle_playback, "toggle_playback"),
        (&hotkeys.volume_up, "volume_up"),
        (&hotkeys.volume_down, "volume_down"),
        (&hotkeys.toggle_window, "toggle_window"),
    ];

    for (combo, action) in &combos {
        if combo.is_empty() {
            continue;
        }
        let action_name = action.to_string();
        let result = manager.on_shortcut(combo.as_str(), move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                handle_shortcut_action(app, &action_name);
            }
        });
        match result {
            Ok(_) => info!("Registered global shortcut: {} → {}", combo, action),
            Err(e) => {
                warn!("Failed to register shortcut {} for {}: {}", combo, action, e);
                failed.push(combo.to_string());
            }
        }
    }

    failed
}

fn handle_shortcut_action(app: &AppHandle, action: &str) {
    let app = app.clone();
    let action = action.to_string();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        match action.as_str() {
            "toggle_recording" => {
                info!("Global shortcut: toggle_recording (no selected stream context)");
            }
            "toggle_playback" => {
                let status = state.player.get_status().await;
                match status.state {
                    PlaybackState::Playing => { let _ = state.player.pause_playback(&app).await; }
                    PlaybackState::Paused => { let _ = state.player.resume_playback(&app).await; }
                    _ => { info!("Global shortcut: toggle_playback — nothing playing"); }
                }
            }
            "volume_up" => {
                let status = state.player.get_status().await;
                let new_vol = (status.volume + 0.05).min(1.0);
                let _ = state.player.set_volume(new_vol, &app).await;
            }
            "volume_down" => {
                let status = state.player.get_status().await;
                let new_vol = (status.volume - 0.05).max(0.0);
                let _ = state.player.set_volume(new_vol, &app).await;
            }
            "toggle_window" => {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
            _ => warn!("Unknown shortcut action: {}", action),
        }
    });
}
