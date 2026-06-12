use crate::app_state::AppState;
use crate::player::engine::PlaybackState;
use crate::settings::HotkeyMap;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use log::{info, warn, debug};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Register all global shortcuts from the given HotkeyMap.
/// Returns a list of shortcut combos that failed to register.
pub fn register_global_shortcuts(app: &AppHandle, hotkeys: &HotkeyMap) -> Vec<String> {
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();
    VOLUME_UP_HELD.store(false, Ordering::Relaxed);
    VOLUME_DOWN_HELD.store(false, Ordering::Relaxed);

    let mut failed: Vec<String> = Vec::new();

    let combos = [
        (&hotkeys.toggle_recording, "toggle_recording"),
        (&hotkeys.toggle_playback, "toggle_playback"),
        (&hotkeys.volume_up, "volume_up"),
        (&hotkeys.volume_down, "volume_down"),
        (&hotkeys.toggle_window, "toggle_window"),
        (&hotkeys.stop_all, "stop_all"),
        (&hotkeys.prev_track, "prev_track"),
        (&hotkeys.next_track, "next_track"),
    ];

    for (combo, action) in &combos {
        if combo.is_empty() {
            continue;
        }
        let action_name = action.to_string();
        let is_volume = action_name == "volume_up" || action_name == "volume_down";
        let result = manager.on_shortcut(combo.as_str(), move |app, _shortcut, event| {
            if is_volume {
                let dir: i8 = if action_name == "volume_up" { 1 } else { -1 };
                let held = volume_held_flag(&action_name);
                match event.state {
                    ShortcutState::Pressed => {
                        if !held.swap(true, Ordering::Relaxed) {
                            let app = app.clone();
                            tauri::async_runtime::spawn(async move {
                                apply_volume_change(&app, dir).await;
                                tokio::time::sleep(Duration::from_millis(VOLUME_REPEAT_INITIAL_DELAY_MS)).await;
                                while held.load(Ordering::Relaxed) {
                                    apply_volume_change(&app, dir).await;
                                    tokio::time::sleep(Duration::from_millis(VOLUME_REPEAT_INTERVAL_MS)).await;
                                }
                            });
                        }
                    }
                    ShortcutState::Released => {
                        held.store(false, Ordering::Relaxed);
                    }
                }
            } else if event.state == ShortcutState::Pressed {
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
static LAST_STOP_ALL_MS: AtomicU64 = AtomicU64::new(0);
// Shared with the SMTC Play/Pause handlers (smtc.rs): a hotkey and a media
// key pressed near-simultaneously must yield one action, not a double toggle.
pub(crate) static LAST_TOGGLE_PLAYBACK_MS: AtomicU64 = AtomicU64::new(0);
const SHORTCUT_DEBOUNCE_MS: u64 = 500;

static VOLUME_UP_HELD: AtomicBool = AtomicBool::new(false);
static VOLUME_DOWN_HELD: AtomicBool = AtomicBool::new(false);

const VOLUME_REPEAT_INITIAL_DELAY_MS: u64 = 350;
const VOLUME_REPEAT_INTERVAL_MS: u64 = 80;

fn volume_held_flag(action: &str) -> &'static AtomicBool {
    if action == "volume_up" { &VOLUME_UP_HELD } else { &VOLUME_DOWN_HELD }
}

async fn apply_volume_change(app: &AppHandle, direction: i8) {
    let state = app.state::<AppState>();
    let step = state.settings.read().await.volume_step_percent as f32 / 100.0;
    let status = state.player.get_status().await;
    let new_vol = if direction > 0 {
        (status.volume + step).min(1.0)
    } else {
        (status.volume - step).max(0.0)
    };
    let _ = state.player.set_volume(new_vol, app).await;
}

/// True if the action behind `last` already fired within the debounce window.
/// Swallows OS key auto-repeat so a held combo can't flap the action. Each
/// action gets its own cell: debouncing one must not swallow another.
pub(crate) fn recently_fired(last: &AtomicU64) -> bool {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let prev = last.load(Ordering::Relaxed);
    if now.saturating_sub(prev) < SHORTCUT_DEBOUNCE_MS {
        return true;
    }
    // CAS so two near-simultaneous fires can't both pass: only one caller wins
    // the swap; the loser is treated as a repeat (returns true → debounced).
    last.compare_exchange(prev, now, Ordering::Relaxed, Ordering::Relaxed)
        .is_err()
}

fn handle_shortcut_action(app: &AppHandle, action: &str) {
    let app = app.clone();
    let action = action.to_string();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        match action.as_str() {
            "toggle_recording" => {
                if recently_fired(&LAST_TOGGLE_RECORDING_MS) {
                    debug!("Global shortcut: toggle_recording ignored (debounce)");
                } else {
                    let outcome = crate::recording_control::toggle_all(&app).await;
                    info!("Global shortcut: toggle_recording → {outcome:?}");
                    crate::tray::notify::notify_recording_toggle(&app, outcome);
                }
            }
            "stop_all" => {
                if recently_fired(&LAST_STOP_ALL_MS) {
                    debug!("Global shortcut: stop_all ignored (debounce)");
                } else {
                    let stopped = crate::recording_control::stop_all_now(&app).await;
                    info!("Global shortcut: stop_all → stopped {stopped}");
                    crate::tray::notify::notify_stop_all(&app, stopped);
                }
            }
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
            // Transport decisions (what "next" means) live in the webview:
            // neighbors derive from stream order and the filtered songs list.
            // Rust only bridges the OS hotkey to a webview event.
            "prev_track" => { let _ = app.emit("transport-skip", "prev"); }
            "next_track" => { let _ = app.emit("transport-skip", "next"); }
            _ => warn!("Unknown shortcut action: {}", action),
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recently_fired_debounces_second_call() {
        static CELL: AtomicU64 = AtomicU64::new(0);
        assert!(!recently_fired(&CELL), "first call must pass");
        assert!(recently_fired(&CELL), "immediate repeat must be debounced");
    }

    #[test]
    fn volume_held_flags_are_distinct() {
        assert!(!std::ptr::eq(
            volume_held_flag("volume_up"),
            volume_held_flag("volume_down"),
        ));
    }

    #[test]
    fn volume_held_swap_prevents_double_spawn() {
        let flag = volume_held_flag("volume_up");
        flag.store(false, Ordering::Relaxed);
        // First Pressed: flag was false → swap returns false → spawn proceeds
        assert!(!flag.swap(true, Ordering::Relaxed));
        // Spurious second Pressed: flag still true → swap returns true → spawn skipped
        assert!(flag.swap(true, Ordering::Relaxed));
        flag.store(false, Ordering::Relaxed); // restore module-level static
    }

    #[test]
    fn toggle_playback_debounce_cell_swallows_repeat() {
        LAST_TOGGLE_PLAYBACK_MS.store(0, Ordering::Relaxed);
        assert!(!recently_fired(&LAST_TOGGLE_PLAYBACK_MS), "first call must pass");
        assert!(recently_fired(&LAST_TOGGLE_PLAYBACK_MS), "repeat must be debounced");
    }
}
