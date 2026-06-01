use tauri::State;
use crate::app_state::AppState;
use crate::errors::RadioError;
use crate::profile::{Profile, ProfileMeta};

#[tauri::command]
pub async fn list_profiles(state: State<'_, AppState>) -> Result<Vec<ProfileMeta>, String> {
    let profile = state.active_profile.read().await;
    let active_name = profile.name.clone();
    drop(profile);
    Profile::list(&active_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_profile(name: String) -> Result<ProfileMeta, String> {
    Profile::create(&name).map(|p| ProfileMeta {
        name: p.name,
        stream_count: p.streams.len(),
        is_active: false,
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_profile(
    old_name: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<ProfileMeta, String> {
    let profile = state.active_profile.read().await;
    let active = profile.name.clone();
    drop(profile);
    if old_name == active {
        return Err(RadioError::Forbidden("Cannot rename the active profile".into()).to_string());
    }
    Profile::rename(&old_name, &new_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_profile(name: String, state: State<'_, AppState>) -> Result<(), String> {
    let profile = state.active_profile.read().await;
    let active = profile.name.clone();
    drop(profile);
    if name == active {
        return Err(RadioError::Forbidden("Cannot delete the active profile".into()).to_string());
    }
    Profile::delete(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn duplicate_profile(
    source_name: String,
    new_name: String,
) -> Result<ProfileMeta, String> {
    Profile::duplicate(&source_name, &new_name).map_err(|e| e.to_string())
}
