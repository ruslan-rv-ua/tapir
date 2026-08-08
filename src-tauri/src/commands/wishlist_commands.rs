use crate::app_state::AppState;
use crate::profile::WishlistEntry;
use crate::store::Commit;

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
    state
        .commit_profile(|profile| {
            // Патерн уже є — повертаємо наявний запис і не пишемо нічого.
            if let Some(existing) = profile.wishlist.iter().find(|e| e.pattern == pattern) {
                return Commit::Skip(existing.clone());
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
            Commit::Save(entry)
        })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_from_wishlist(
    pattern: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state
        .commit_profile(|profile| {
            profile.wishlist.retain(|e| e.pattern != pattern);
            Commit::Save(())
        })
        .await
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
    // Відмова мутації їде значенням, а не раннім поверненням: замикання не може
    // вийти з команди, і саме тому воно й не пише нічого при відмові.
    state
        .commit_profile(|profile| {
            if profile.wishlist.iter().any(|e| e.pattern == new_pattern) {
                return Commit::Skip(Err(format!("Pattern '{}' already exists", new_pattern)));
            }
            let Some(e) = profile.wishlist.iter_mut().find(|e| e.pattern == old_pattern) else {
                return Commit::Skip(Err(format!("Pattern '{}' not found", old_pattern)));
            };
            e.pattern = new_pattern;
            Commit::Save(Ok(e.clone()))
        })
        .await
        .map_err(|e| e.to_string())?
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
    state
        .commit_profile(|profile| {
            if profile.ignorelist.contains(&pattern) {
                return Commit::Skip(());
            }
            profile.ignorelist.push(pattern);
            Commit::Save(())
        })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_from_ignorelist(
    pattern: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state
        .commit_profile(|profile| {
            profile.ignorelist.retain(|p| p != &pattern);
            Commit::Save(())
        })
        .await
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
    state
        .commit_profile(|profile| {
            if profile.ignorelist.contains(&new_pattern) {
                return Commit::Skip(Err(format!("Pattern '{}' already exists", new_pattern)));
            }
            let Some(p) = profile.ignorelist.iter_mut().find(|p| **p == old_pattern) else {
                return Commit::Skip(Err(format!("Pattern '{}' not found", old_pattern)));
            };
            *p = new_pattern;
            Commit::Save(Ok(()))
        })
        .await
        .map_err(|e| e.to_string())?
}

/// Remove every string equal to one in `ids`; returns how many were removed.
/// Pure over the vector — unit-testable without Tauri state.
fn retain_patterns(patterns: &mut Vec<String>, ids: &std::collections::HashSet<String>) -> usize {
    let before = patterns.len();
    patterns.retain(|p| !ids.contains(p));
    before - patterns.len()
}

#[tauri::command]
pub async fn remove_from_wishlist_bulk(
    patterns: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<u32, String> {
    let ids: std::collections::HashSet<String> = patterns.into_iter().collect();
    let removed = state
        .commit_profile(|profile| {
            let before = profile.wishlist.len();
            profile.wishlist.retain(|e| !ids.contains(&e.pattern));
            Commit::Save(before - profile.wishlist.len())
        })
        .await
        .map_err(|e| e.to_string())?;
    Ok(removed as u32)
}

#[tauri::command]
pub async fn remove_from_ignorelist_bulk(
    patterns: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<u32, String> {
    let ids: std::collections::HashSet<String> = patterns.into_iter().collect();
    let removed = state
        .commit_profile(|profile| Commit::Save(retain_patterns(&mut profile.ignorelist, &ids)))
        .await
        .map_err(|e| e.to_string())?;
    Ok(removed as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retain_patterns_removes_listed_and_counts() {
        let mut v = vec!["*ad*".to_string(), "*jingle*".to_string(), "*promo*".to_string()];
        let ids: std::collections::HashSet<String> =
            ["*ad*".to_string(), "*promo*".to_string()].into_iter().collect();
        let removed = retain_patterns(&mut v, &ids);
        assert_eq!(removed, 2);
        assert_eq!(v, vec!["*jingle*".to_string()]);
    }
}
