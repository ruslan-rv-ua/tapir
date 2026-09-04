use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tokio::time::Duration;
use crate::app_state::AppState;
use crate::errors::RadioError;
use crate::profile::{
    ImportPreview, Profile, ProfileMeta, ProfileSettingsPatch, ProfileSettingsView,
};
use crate::store::Commit;

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

/// The editable slice of `name` — the active profile from memory, an inactive
/// one from disk. `Profile::load` is what refuses an unknown name (`NotFound`
/// for anything but `Default`).
#[tauri::command]
pub async fn get_profile_settings(
    name: String,
    state: State<'_, AppState>,
) -> Result<ProfileSettingsView, String> {
    {
        let profile = state.active_profile.read().await;
        if profile.name == name {
            return Ok(profile.settings_view());
        }
    }
    tokio::task::spawn_blocking(move || Profile::load(&name).map(|p| p.settings_view()))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Apply `patch` to `name`. Active profile → `commit_profile` (the in-memory
/// copy is the source of truth; loading from disk would clobber fresher state).
/// Inactive → read-patch-write off the async executor.
///
/// A profile that does not exist is **not** created: `Profile::load` returns
/// `NotFound`. Auto-save is debounced 300 ms, so «profile deleted → a pending
/// patch lands on disk» is a real window, and this rule closes it regardless of
/// what the UI does.
#[tauri::command]
pub async fn update_profile_settings(
    name: String,
    patch: ProfileSettingsPatch,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let active_name = {
        let profile = state.active_profile.read().await;
        profile.name.clone()
    };

    if name == active_name {
        state
            .commit_profile(move |profile| {
                profile.apply_settings_patch(patch);
                Commit::Save(())
            })
            .await
            .map_err(|e| e.to_string())
    } else {
        tokio::task::spawn_blocking(move || {
            let mut profile = Profile::load(&name)?;
            profile.apply_settings_patch(patch);
            crate::profile_store::save_detached(&profile)
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
    }
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
        futures_util::future::join_all(handles),
    ).await;

    // Step 6-7: save volume to old profile (still the active one at this point)
    {
        let volume = state.player.current_volume().await;
        let committed = state
            .commit_profile(|profile| {
                profile.player_session.volume = volume;
                Commit::Save(())
            })
            .await;
        if let Err(e) = committed {
            log::warn!("Could not save old profile on switch: {e}");
        }
    }

    // Step 8: load new profile
    let new_profile = Profile::load(&name).map_err(|e| e.to_string())?;

    // Step 9: save settings with rollback on failure.
    // IMPORTANT: capture old_active BEFORE mutating.
    {
        let old_active = state.settings.read().await.active_profile.clone();
        let committed = state
            .commit_settings(|settings| {
                settings.active_profile = name.clone();
                Commit::Save(())
            })
            .await;
        if let Err(e) = committed {
            // Відкат — на відміну від решти комітів, де розбіжність лікує
            // наступний успішний запис. Тут чекати нема на що: `active_profile`
            // читається лише при старті, а розійшовшись, відправив би застосунок
            // у профіль, якого користувач не вибирав. Запис невдалий, тож на
            // диску вже старе значення — `Skip` повертає пам'ять до нього, не
            // намагаючись писати вдруге.
            let _ = state
                .commit_settings(|settings| {
                    settings.active_profile = old_active;
                    Commit::Skip(())
                })
                .await;
            return Err(e.to_string());
        }
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

    // Журнал збігів профільний разом із вішлістом — те, що спіймав минулий
    // профіль, у новому не значить нічого. Зупинка запису його НЕ чистить:
    // сеанс той самий.
    state.match_log.write().await.clear();

    // Step 12: emit profile-changed
    if let Err(e) = app.emit("profile-changed", ProfileChangedPayload { profile: new_profile.clone() }) {
        log::warn!("Could not emit profile-changed: {e}");
    }

    Ok(new_profile)
}

/// Names actually removed + which of the two undeletable profiles were among the
/// requested. The skips are reported separately because their reasons differ:
/// the active profile becomes deletable after a switch, `Default` never does.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkDeleteProfiles {
    pub deleted: Vec<String>,
    pub skipped_active: bool,
    pub skipped_default: bool,
}

/// Split requested names into (deletable, active requested, `Default` requested).
/// A name falls in exactly one bucket, and `active` is checked first: when
/// `Default` is the active profile — the usual case — "active profile skipped"
/// is the reason the user can act on. Pure; unit-testable without Tauri state.
fn partition_deletable_profiles(names: &[String], active: &str) -> (Vec<String>, bool, bool) {
    let mut to_delete = Vec::new();
    let mut skipped_active = false;
    let mut skipped_default = false;
    for n in names {
        if n == active { skipped_active = true; }
        else if n == "Default" { skipped_default = true; }
        else { to_delete.push(n.clone()); }
    }
    (to_delete, skipped_active, skipped_default)
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
    let (to_delete, skipped_active, skipped_default) = partition_deletable_profiles(&names, &active);
    let mut deleted = Vec::new();
    for name in to_delete {
        // Best-effort per profile; a single failure doesn't abort the batch.
        if Profile::delete(&name).is_ok() {
            deleted.push(name);
        }
    }
    Ok(BulkDeleteProfiles { deleted, skipped_active, skipped_default })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partition_excludes_active() {
        let names = vec!["Jazz".to_string(), "Default".to_string(), "News".to_string()];
        let (to_delete, skipped_active, skipped_default) =
            partition_deletable_profiles(&names, "Default");
        assert_eq!(to_delete, vec!["Jazz".to_string(), "News".to_string()]);
        assert!(skipped_active);
        // "Default" was the active profile, so it lands in one bucket, not both.
        assert!(!skipped_default);
    }

    #[test]
    fn partition_reports_no_skip_when_active_absent() {
        let names = vec!["Jazz".to_string()];
        let (to_delete, skipped_active, skipped_default) =
            partition_deletable_profiles(&names, "Default");
        assert_eq!(to_delete, vec!["Jazz".to_string()]);
        assert!(!skipped_active);
        assert!(!skipped_default);
    }

    // Without this bucket the batch reported "profiles removed: 0" and no reason:
    // `Profile::delete` refuses "Default" and the loop swallows the failure.
    #[test]
    fn partition_excludes_default_when_another_profile_is_active() {
        let names = vec!["Default".to_string(), "Jazz".to_string()];
        let (to_delete, skipped_active, skipped_default) =
            partition_deletable_profiles(&names, "Rock");
        assert_eq!(to_delete, vec!["Jazz".to_string()]);
        assert!(!skipped_active);
        assert!(skipped_default);
    }
}
