use crate::app_state::AppState;
use crate::settings::GlobalSettings;

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
    settings.save().map_err(|e| e.to_string())?;
    let mut current = state.settings.write().await;
    *current = settings;
    Ok(())
}
