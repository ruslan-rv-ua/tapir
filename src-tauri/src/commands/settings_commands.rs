use crate::app_state::AppState;
use crate::profile::RecordingSettings;
use crate::settings::{GlobalSettings, HotkeyMap};
use crate::shortcuts;

#[tauri::command]
pub async fn get_settings(state: tauri::State<'_, AppState>) -> Result<GlobalSettings, String> {
    let settings = state.settings.read().await;
    Ok(settings.clone())
}

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
    // No separate command needed (unlike register_hotkeys): there is no
    // error list for the UI here, the toggle applies silently.
    if smtc_changed {
        crate::smtc::set_enabled(smtc_enabled);
    }
    Ok(())
}

#[tauri::command]
pub async fn get_recording_settings(
    state: tauri::State<'_, AppState>,
) -> Result<RecordingSettings, String> {
    let profile = state.active_profile.read().await;
    Ok(profile.recording.clone())
}

#[tauri::command]
pub async fn save_recording_settings(
    recording: RecordingSettings,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut snapshot = state.active_profile.read().await.clone();
    snapshot.recording = recording.clone();
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    let mut profile = state.active_profile.write().await;
    profile.recording = recording;
    Ok(())
}

#[tauri::command]
pub async fn register_hotkeys(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let settings = state.settings.read().await;
    let hotkeys = settings.hotkeys.clone();
    drop(settings);
    let failed = shortcuts::register_global_shortcuts(&app, &hotkeys);
    Ok(failed)
}

/// Default Tier-1 hotkey combos. Pure lookup for the Settings → Hotkeys
/// reset button (KB-10): writes nothing, registers nothing.
#[tauri::command]
pub fn default_hotkeys() -> HotkeyMap {
    HotkeyMap::default()
}

#[tauri::command]
pub async fn get_free_space(state: tauri::State<'_, AppState>) -> Result<u64, String> {
    let dir = {
        let profile = state.active_profile.read().await;
        crate::portable::resolve_output_dir(&profile.recording.output_dir)
    };
    tokio::task::spawn_blocking(move || crate::portable::free_bytes_on_volume(&dir))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn open_directory_picker(
    app: tauri::AppHandle,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let result = tokio::task::spawn_blocking(move || {
        let mut builder = app.dialog().file();
        if let Some(path) = default_path {
            builder = builder.set_directory(&path);
        }
        builder.blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(result.map(|p| p.to_string()))
}
