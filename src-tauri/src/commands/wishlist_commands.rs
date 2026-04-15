use crate::app_state::AppState;
use crate::profile::WishlistEntry;

#[tauri::command]
pub async fn get_wishlist(state: tauri::State<'_, AppState>) -> Result<Vec<WishlistEntry>, String> {
    let profile = state.active_profile.read().await;
    Ok(profile.wishlist.clone())
}

#[tauri::command]
pub async fn add_to_wishlist(
    pattern: String,
    state: tauri::State<'_, AppState>,
) -> Result<WishlistEntry, String> {
    let (entry, snapshot) = {
        let mut profile = state.active_profile.write().await;
        if let Some(existing) = profile.wishlist.iter().find(|e| e.pattern == pattern) {
            return Ok(existing.clone());
        }
        let entry = WishlistEntry {
            pattern: pattern.clone(),
            min_bitrate: None,
            format: None,
            remove_after_record: false,
            add_to_ignorelist_after_record: false,
            added_at: chrono::Local::now().to_rfc3339(),
        };
        profile.wishlist.push(entry.clone());
        (entry, profile.clone())
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    Ok(entry)
}

#[tauri::command]
pub async fn remove_from_wishlist(
    pattern: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let snapshot = {
        let mut profile = state.active_profile.write().await;
        profile.wishlist.retain(|e| e.pattern != pattern);
        profile.clone()
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_wishlist_pattern(
    old_pattern: String,
    new_pattern: String,
    state: tauri::State<'_, AppState>,
) -> Result<WishlistEntry, String> {
    if old_pattern == new_pattern {
        let profile = state.active_profile.read().await;
        return profile.wishlist.iter()
            .find(|e| e.pattern == old_pattern)
            .cloned()
            .ok_or_else(|| format!("Pattern '{}' not found", old_pattern));
    }
    let (entry, snapshot) = {
        let mut profile = state.active_profile.write().await;
        if profile.wishlist.iter().any(|e| e.pattern == new_pattern) {
            return Err(format!("Pattern '{}' already exists", new_pattern));
        }
        let e = profile.wishlist.iter_mut()
            .find(|e| e.pattern == old_pattern)
            .ok_or_else(|| format!("Pattern '{}' not found", old_pattern))?;
        e.pattern = new_pattern;
        let entry = e.clone();
        (entry, profile.clone())
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(entry)
}

#[tauri::command]
pub async fn get_ignorelist(state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    let profile = state.active_profile.read().await;
    Ok(profile.ignorelist.clone())
}

#[tauri::command]
pub async fn add_to_ignorelist(
    pattern: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let snapshot = {
        let mut profile = state.active_profile.write().await;
        if profile.ignorelist.contains(&pattern) {
            return Ok(());
        }
        profile.ignorelist.push(pattern);
        profile.clone()
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_from_ignorelist(
    pattern: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let snapshot = {
        let mut profile = state.active_profile.write().await;
        profile.ignorelist.retain(|p| p != &pattern);
        profile.clone()
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_ignorelist_pattern(
    old_pattern: String,
    new_pattern: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    if old_pattern == new_pattern {
        let profile = state.active_profile.read().await;
        if profile.ignorelist.contains(&old_pattern) { return Ok(()); }
        return Err(format!("Pattern '{}' not found", old_pattern));
    }
    let snapshot = {
        let mut profile = state.active_profile.write().await;
        if profile.ignorelist.contains(&new_pattern) {
            return Err(format!("Pattern '{}' already exists", new_pattern));
        }
        let p = profile.ignorelist.iter_mut()
            .find(|p| **p == old_pattern)
            .ok_or_else(|| format!("Pattern '{}' not found", old_pattern))?;
        *p = new_pattern;
        profile.clone()
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
