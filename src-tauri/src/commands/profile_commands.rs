use tauri::State;
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};
use crate::app_state::AppState;
use crate::errors::RadioError;
use crate::profile::{Profile, ProfileMeta, ImportPreview};

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

#[tauri::command]
pub async fn export_profile(name: String, app: AppHandle) -> Result<(), String> {
    let json = Profile::export_json(&name).map_err(|e| e.to_string())?;
    let suggested = format!("{}.tapirprofile", name);
    let path = app
        .dialog()
        .file()
        .set_file_name(&suggested)
        .add_filter("Tapir Profile", &["tapirprofile"])
        .blocking_save_file();
    match path {
        Some(FilePath::Path(p)) => {
            std::fs::write(&p, json).map_err(|e| e.to_string())
        }
        _ => Ok(()), // user cancelled — silent no-op
    }
}

#[tauri::command]
pub async fn begin_import(app: AppHandle) -> Result<Option<ImportPreview>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("Tapir Profile", &["tapirprofile"])
        .blocking_pick_file();
    match path {
        Some(FilePath::Path(p)) => {
            let content = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
            let stripped = crate::settings::strip_bom(&content);
            Profile::preview_import_json(stripped)
                .map(Some)
                .map_err(|e| e.to_string())
        }
        _ => Ok(None), // user cancelled
    }
}

#[tauri::command]
pub async fn commit_import(profile_json: String, name: String) -> Result<ProfileMeta, String> {
    Profile::save_imported(&profile_json, &name).map_err(|e| e.to_string())
}
