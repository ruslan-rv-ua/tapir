use crate::app_state::AppState;
use crate::player::engine::PlaybackState;
use crate::settings::HotkeyMap;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use log::{info, warn, debug};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

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

static LAST_TOGGLE_RECORDING_MS: AtomicU64 = AtomicU64::new(0);
const TOGGLE_RECORDING_DEBOUNCE_MS: u64 = 500;

/// True if `toggle_recording` already fired within the debounce window.
/// Swallows OS key auto-repeat so a held Ctrl+Shift+R can't flap start/stop.
fn recently_toggled_recording() -> bool {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let last = LAST_TOGGLE_RECORDING_MS.load(Ordering::Relaxed);
    if now.saturating_sub(last) < TOGGLE_RECORDING_DEBOUNCE_MS {
        return true;
    }
    // CAS so two near-simultaneous fires can't both pass: only one caller wins
    // the swap; the loser is treated as a repeat (returns true → debounced).
    LAST_TOGGLE_RECORDING_MS
        .compare_exchange(last, now, Ordering::Relaxed, Ordering::Relaxed)
        .is_err()
}

fn handle_shortcut_action(app: &AppHandle, action: &str) {
    let app = app.clone();
    let action = action.to_string();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        match action.as_str() {
            "toggle_recording" => {
                if recently_toggled_recording() {
                    debug!("Global shortcut: toggle_recording ignored (debounce)");
                } else {
                    let outcome = crate::recording_control::toggle_all(state.inner()).await;
                    info!("Global shortcut: toggle_recording → {outcome:?}");
                    crate::tray::notify::notify_recording_toggle(&app, outcome);
                }
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
