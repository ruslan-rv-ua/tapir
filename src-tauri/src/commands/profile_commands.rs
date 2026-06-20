use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tokio::time::Duration;
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

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfileChangedPayload {
    profile: Profile,
}

#[tauri::command]
pub async fn switch_profile(
    name: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Profile, String> {
    // Step 1: no-op if already active
    {
        let profile = state.active_profile.read().await;
        if profile.name == name {
            return Ok(profile.clone());
        }
    }

    // Phase 3D §3.5: зафіксувати StoppedByUser(ProfileSwitch) у СТАРИЙ профіль
    // і скинути ledger/активні входження ДО зупинки записів (статуси ще живі).
    // Confirm-діалог — Фаза 3; поки що переключення зупиняє без підтвердження.
    crate::scheduler::timer::on_profile_switch(&app).await;

    // Steps 3-5: stop recordings + playback, join tasks (timeout 2s)
    let handles = {
        let mut manager = state.stream_manager.write().await;
        manager.stop_all_async()
    };
    state.player.stop_playback(&app).await.map_err(|e| e.to_string())?;
    let _ = tokio::time::timeout(
        Duration::from_secs(2),
        futures::future::join_all(handles),
    ).await;

    // Step 6-7: save volume + urls to old profile
    {
        let volume = state.player.current_volume().await;
        let mut profile = state.active_profile.write().await;
        profile.player_session.volume = volume;
        profile.active_recording_urls = vec![];
        if let Err(e) = profile.save() {
            log::warn!("Could not save old profile on switch: {e}");
        }
    }

    // Step 8: load new profile
    let new_profile = Profile::load(&name).map_err(|e| e.to_string())?;

    // Step 9: save settings with rollback on failure.
    // IMPORTANT: capture old_active BEFORE mutating; drop the lock BEFORE step 10.
    {
        let mut settings = state.settings.write().await;
        let old_active = settings.active_profile.clone(); // for rollback
        settings.active_profile = name.clone();
        if let Err(e) = settings.save() {
            settings.active_profile = old_active; // revert — keeps disk+memory consistent
            return Err(e.to_string());
        }
        drop(settings); // must release lock before step 10 to avoid deadlock
    }

    // Step 10: apply new volume
    if let Err(e) = state.player.set_volume(new_profile.player_session.volume, &app).await {
        log::warn!("Could not set volume after switch: {e}");
    }

    // Step 11: swap AppState
    {
        let mut profile = state.active_profile.write().await;
        *profile = new_profile.clone();
    }

    // Step 12: emit profile-changed
    if let Err(e) = app.emit("profile-changed", ProfileChangedPayload { profile: new_profile.clone() }) {
        log::warn!("Could not emit profile-changed: {e}");
    }

    Ok(new_profile)
}

/// Names actually removed + whether the active profile was among the requested.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkDeleteProfiles {
    pub deleted: Vec<String>,
    pub skipped_active: bool,
}

/// Split requested names into (deletable, whether the active was requested).
/// Pure; unit-testable without Tauri state.
fn partition_deletable_profiles(names: &[String], active: &str) -> (Vec<String>, bool) {
    let mut to_delete = Vec::new();
    let mut skipped_active = false;
    for n in names {
        if n == active { skipped_active = true; } else { to_delete.push(n.clone()); }
    }
    (to_delete, skipped_active)
}

#[tauri::command]
pub async fn delete_profiles(
    names: Vec<String>,
    state: State<'_, AppState>,
) -> Result<BulkDeleteProfiles, String> {
    let active = {
        let profile = state.active_profile.read().await;
        profile.name.clone()
    };
    let (to_delete, skipped_active) = partition_deletable_profiles(&names, &active);
    let mut deleted = Vec::new();
    for name in to_delete {
        // Best-effort per profile; a single failure doesn't abort the batch.
        if Profile::delete(&name).is_ok() {
            deleted.push(name);
        }
    }
    Ok(BulkDeleteProfiles { deleted, skipped_active })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partition_excludes_active() {
        let names = vec!["Jazz".to_string(), "Default".to_string(), "News".to_string()];
        let (to_delete, skipped_active) = partition_deletable_profiles(&names, "Default");
        assert_eq!(to_delete, vec!["Jazz".to_string(), "News".to_string()]);
        assert!(skipped_active);
    }

    #[test]
    fn partition_reports_no_skip_when_active_absent() {
        let names = vec!["Jazz".to_string()];
        let (to_delete, skipped_active) = partition_deletable_profiles(&names, "Default");
        assert_eq!(to_delete, vec!["Jazz".to_string()]);
        assert!(!skipped_active);
    }
}
