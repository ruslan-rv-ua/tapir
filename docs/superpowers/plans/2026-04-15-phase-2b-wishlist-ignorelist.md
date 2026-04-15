# Phase 2B — Wishlist + Ignorelist + Context Menu — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add wishlist/ignorelist matching during active recording, CRUD IPC commands, a WishlistPanel Activity Bar tab, and a context menu for StreamRow.

**Architecture:** Backend-first. New `wishlist::matcher` module performs wildcard matching against ICY StreamTitle. Integration point: `MetadataChanged` handler in `stream/manager.rs`, before Splitter. Frontend adds WishlistPanel (Activity Bar tab), PatternTable, AddPatternDialog, and StreamRow context menu — all fully NVDA-accessible via React Aria Components.

**Tech Stack:** Rust (Tauri v2), React 19, React Aria Components, Nanostores, Paraglide.js (i18n), Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-04-15-phase-2b-wishlist-ignorelist-design.md`

---

## File Structure

### Backend (Rust)

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src-tauri/src/wishlist/mod.rs` | Module declaration |
| Create | `src-tauri/src/wishlist/matcher.rs` | `wildcard_match()`, `check_track()`, `TrackAction` enum |
| Create | `src-tauri/src/commands/wishlist_commands.rs` | 8 IPC commands for wishlist/ignorelist CRUD |
| Modify | `src-tauri/src/lib.rs` | Register `mod wishlist`, register IPC commands |
| Modify | `src-tauri/src/commands/mod.rs` | Add `pub mod wishlist_commands` |
| Modify | `src-tauri/src/stream/manager.rs` | Integrate `check_track()` in `MetadataChanged` handler |

### Frontend (React/TypeScript)

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/tauri.ts` | Add `WishlistEntry` type, event payload types, 8 IPC wrappers |
| Modify | `src/stores/profile.ts` | Extend `ProfileState` with `wishlist[]` + `ignorelist[]` |
| Create | `src/components/wishlist/WishlistPanel.tsx` | Container: two sections (wishlist + ignorelist) |
| Create | `src/components/wishlist/PatternTable.tsx` | Accessible table for pattern lists |
| Create | `src/components/wishlist/AddPatternDialog.tsx` | Dialog for add/edit pattern |
| Create | `src/components/streams/StreamContextMenu.tsx` | React Aria Menu with all stream actions |
| Modify | `src/components/streams/StreamRow.tsx` | Replace inline edit/delete buttons with context menu + keep Play/Record |
| Modify | `src/components/layout/ActivityBar.tsx` | Enable wishlist tab (disabled → enabled, onClick) |
| Modify | `src/App.tsx` | Render WishlistPanel when active, add event listeners for wishlist-match/track-ignored |
| Modify | `src/i18n/messages/uk.json` | Add ~15 new message keys |
| Modify | `src/i18n/messages/en.json` | Add ~15 new message keys |

---

## Chunk 1: Backend — Matcher Module + Tests

### Task 1: Create `wishlist::matcher` with `wildcard_match()`

**Files:**
- Create: `src-tauri/src/wishlist/mod.rs`
- Create: `src-tauri/src/wishlist/matcher.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create module files**

Create `src-tauri/src/wishlist/mod.rs`:
```rust
pub mod matcher;
```

Create `src-tauri/src/wishlist/matcher.rs`:
```rust
use crate::profile::WishlistEntry;

/// Result of checking a track against ignorelist and wishlist.
#[derive(Debug, Clone, PartialEq)]
pub enum TrackAction {
    /// Track matches an ignorelist pattern — do not record.
    Ignored { pattern: String },
    /// Track matches a wishlist pattern — record and mark.
    WishlistMatch { pattern: String },
    /// No match — normal behavior.
    Normal,
}

/// Case-insensitive wildcard matching.
/// `*` matches zero or more characters; `?` matches exactly one character.
pub fn wildcard_match(pattern: &str, text: &str) -> bool {
    let p: Vec<char> = pattern.to_lowercase().chars().collect();
    let t: Vec<char> = text.to_lowercase().chars().collect();
    let (plen, tlen) = (p.len(), t.len());

    // dp[i][j] = pattern[0..i] matches text[0..j]
    let mut dp = vec![vec![false; tlen + 1]; plen + 1];
    dp[0][0] = true;

    // Leading '*' can match empty text
    for i in 1..=plen {
        if p[i - 1] == '*' {
            dp[i][0] = dp[i - 1][0];
        }
    }

    for i in 1..=plen {
        for j in 1..=tlen {
            if p[i - 1] == '*' {
                // '*' matches zero chars (dp[i-1][j]) or one more char (dp[i][j-1])
                dp[i][j] = dp[i - 1][j] || dp[i][j - 1];
            } else if p[i - 1] == '?' || p[i - 1] == t[j - 1] {
                dp[i][j] = dp[i - 1][j - 1];
            }
        }
    }

    dp[plen][tlen]
}

/// Build a full StreamTitle string for matching.
/// Rules: both empty → None. One empty → use the other. Both present → "artist - title".
pub fn build_stream_title(artist: &str, title: &str) -> Option<String> {
    let a = artist.trim();
    let t = title.trim();
    match (a.is_empty(), t.is_empty()) {
        (true, true) => None,
        (true, false) => Some(t.to_string()),
        (false, true) => Some(a.to_string()),
        (false, false) => Some(format!("{} - {}", a, t)),
    }
}

/// Check a track against per-stream ignorelist, global ignorelist, and wishlist.
/// Precedence: per-stream ignorelist → global ignorelist → wishlist → Normal.
pub fn check_track(
    stream_title: &str,
    per_stream_ignorelist: &[String],
    global_ignorelist: &[String],
    wishlist: &[WishlistEntry],
) -> TrackAction {
    // 1. Per-stream ignorelist
    for pattern in per_stream_ignorelist {
        if wildcard_match(pattern, stream_title) {
            return TrackAction::Ignored { pattern: pattern.clone() };
        }
    }

    // 2. Global ignorelist
    for pattern in global_ignorelist {
        if wildcard_match(pattern, stream_title) {
            return TrackAction::Ignored { pattern: pattern.clone() };
        }
    }

    // 3. Wishlist
    for entry in wishlist {
        if wildcard_match(&entry.pattern, stream_title) {
            return TrackAction::WishlistMatch {
                pattern: entry.pattern.clone(),
            };
        }
    }

    TrackAction::Normal
}
```

Add module declaration to `src-tauri/src/lib.rs` (after `mod tags;`):
```rust
mod wishlist;
```

- [ ] **Step 2: Write unit tests for `wildcard_match()`**

Add at the bottom of `src-tauri/src/wishlist/matcher.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match() {
        assert!(wildcard_match("hello", "hello"));
        assert!(!wildcard_match("hello", "world"));
    }

    #[test]
    fn case_insensitive() {
        assert!(wildcard_match("Tycho", "tycho"));
        assert!(wildcard_match("tycho", "TYCHO"));
    }

    #[test]
    fn star_wildcard() {
        assert!(wildcard_match("*", "anything"));
        assert!(wildcard_match("Tycho*", "Tycho - Dive"));
        assert!(wildcard_match("*Dive", "Tycho - Dive"));
        assert!(wildcard_match("*ycho*", "Tycho - Dive"));
        assert!(!wildcard_match("Bonobo*", "Tycho - Dive"));
    }

    #[test]
    fn question_wildcard() {
        assert!(wildcard_match("?ycho", "Tycho"));
        assert!(!wildcard_match("?ycho", "Tyycho"));
        assert!(wildcard_match("T?cho", "Tycho"));
    }

    #[test]
    fn combined_wildcards() {
        assert!(wildcard_match("*jingle*", "Station Jingle 3"));
        assert!(wildcard_match("*advertisement*", "Some Advertisement Here"));
        assert!(wildcard_match("T?cho - *", "Tycho - Dive"));
    }

    #[test]
    fn empty_strings() {
        assert!(wildcard_match("", ""));
        assert!(wildcard_match("*", ""));
        assert!(!wildcard_match("?", ""));
        assert!(!wildcard_match("a", ""));
    }

    #[test]
    fn build_stream_title_rules() {
        assert_eq!(build_stream_title("Tycho", "Dive"), Some("Tycho - Dive".to_string()));
        assert_eq!(build_stream_title("", "Dive"), Some("Dive".to_string()));
        assert_eq!(build_stream_title("Tycho", ""), Some("Tycho".to_string()));
        assert_eq!(build_stream_title("", ""), None);
        assert_eq!(build_stream_title("  ", "  "), None);
    }
}
```

- [ ] **Step 3: Write unit tests for `check_track()`**

Add to the same `mod tests` block:
```rust
    fn make_wishlist_entry(pattern: &str) -> WishlistEntry {
        WishlistEntry {
            pattern: pattern.to_string(),
            min_bitrate: None,
            format: None,
            remove_after_record: false,
            add_to_ignorelist_after_record: false,
            added_at: "2026-01-01T00:00:00".to_string(),
        }
    }

    #[test]
    fn check_track_normal() {
        let result = check_track("Tycho - Dive", &[], &[], &[]);
        assert_eq!(result, TrackAction::Normal);
    }

    #[test]
    fn check_track_global_ignorelist() {
        let ignorelist = vec!["*jingle*".to_string()];
        let result = check_track("Station Jingle 3", &[], &ignorelist, &[]);
        assert_eq!(result, TrackAction::Ignored { pattern: "*jingle*".to_string() });
    }

    #[test]
    fn check_track_per_stream_ignorelist() {
        let per_stream = vec!["*ad break*".to_string()];
        let result = check_track("Ad Break", &per_stream, &[], &[]);
        assert_eq!(result, TrackAction::Ignored { pattern: "*ad break*".to_string() });
    }

    #[test]
    fn check_track_wishlist_match() {
        let wishlist = vec![make_wishlist_entry("Tycho*")];
        let result = check_track("Tycho - Dive", &[], &[], &wishlist);
        assert_eq!(result, TrackAction::WishlistMatch { pattern: "Tycho*".to_string() });
    }

    #[test]
    fn check_track_ignorelist_beats_wishlist() {
        let ignorelist = vec!["Tycho - Dive".to_string()];
        let wishlist = vec![make_wishlist_entry("Tycho*")];
        let result = check_track("Tycho - Dive", &[], &ignorelist, &wishlist);
        assert_eq!(result, TrackAction::Ignored { pattern: "Tycho - Dive".to_string() });
    }

    #[test]
    fn check_track_per_stream_beats_global() {
        let per_stream = vec!["Tycho*".to_string()];
        let global = vec!["*jingle*".to_string()];
        let wishlist = vec![make_wishlist_entry("Tycho*")];
        let result = check_track("Tycho - Dive", &per_stream, &global, &wishlist);
        assert_eq!(result, TrackAction::Ignored { pattern: "Tycho*".to_string() });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test --lib wishlist`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```
git add src-tauri/src/wishlist/ src-tauri/src/lib.rs
git commit -m "feat(wishlist): add matcher module with wildcard matching and check_track()"
```

---

### Task 2: Integrate matcher into `recording_task`

**Files:**
- Modify: `src-tauri/src/stream/manager.rs:715-748`

- [ ] **Step 1: Add imports at the top of `manager.rs`**

Add after existing `use` statements:
```rust
use crate::wishlist::matcher;
```

- [ ] **Step 2: Add emit functions for new events**

Add near the other `emit_*` functions (around line 280):
```rust
fn emit_wishlist_match(app: &AppHandle, stream_id: &str, artist: &str, title: &str, pattern: &str) {
    let _ = app.emit("wishlist-match", serde_json::json!({
        "streamId": stream_id,
        "artist": artist,
        "title": title,
        "pattern": pattern,
    }));
}

fn emit_track_ignored(app: &AppHandle, stream_id: &str, artist: &str, title: &str, pattern: &str) {
    let _ = app.emit("track-ignored", serde_json::json!({
        "streamId": stream_id,
        "artist": artist,
        "title": title,
        "pattern": pattern,
    }));
}
```

- [ ] **Step 3: Integrate `check_track` into `MetadataChanged` handler**

In the `MetadataChanged` arm of the match statement (~line 715), wrap the existing logic with the track check. The modified handler should:

1. Build the StreamTitle from artist/title
2. Load per-stream ignorelist, global ignorelist, and wishlist from AppState profile
3. Call `matcher::check_track()`
4. If `Ignored` → emit `track-changed` + `track-ignored`, update UI, skip Splitter
5. If `WishlistMatch` → emit `wishlist-match`, then proceed to Splitter normally
6. If `Normal` → existing Splitter logic unchanged

Replace the `Some(ReadEvent::MetadataChanged(artist, title))` arm body:
```rust
Some(ReadEvent::MetadataChanged(artist, title)) => {
    // --- Wishlist/Ignorelist check ---
    let track_action = {
        let stream_title = matcher::build_stream_title(&artist, &title);
        if let Some(ref st) = stream_title {
            let state = app_handle.state::<crate::app_state::AppState>();
            let profile = state.active_profile.read().await;
            let per_stream_ignorelist = profile.streams
                .iter()
                .find(|s| s.id == stream_id)
                .map(|s| s.ignorelist.as_slice())
                .unwrap_or(&[]);
            matcher::check_track(
                st,
                per_stream_ignorelist,
                &profile.ignorelist,
                &profile.wishlist,
            )
        } else {
            matcher::TrackAction::Normal
        }
    };

    match track_action {
        matcher::TrackAction::Ignored { ref pattern } => {
            emit_track_changed(&app_handle, &stream_id, &artist, &title, "");
            update_track_info(&manager, &stream_id, &artist, &title).await;
            emit_track_ignored(&app_handle, &stream_id, &artist, &title, pattern);
            log::info!("[{}] Track ignored ({}): {} - {}", stream_id, pattern, artist, title);
            // Do NOT pass to Splitter — skip recording this track
        }
        matcher::TrackAction::WishlistMatch { ref pattern } => {
            emit_wishlist_match(&app_handle, &stream_id, &artist, &title, pattern);
            log::info!("[{}] Wishlist match ({}): {} - {}", stream_id, pattern, artist, title);
            // Proceed to Splitter as normal
            let meta = connection::TrackMetadata {
                artist: artist.clone(),
                title: title.clone(),
            };
            match spl.on_metadata_change(meta) {
                splitter::SplitAction::Skip => {
                    emit_track_changed(&app_handle, &stream_id, &artist, &title, "");
                    update_track_info(&manager, &stream_id, &artist, &title).await;
                }
                splitter::SplitAction::StartTrack(m) => {
                    if let Ok(file_name) = rec.start_track(&m.artist, &m.title).await {
                        emit_recording_started(&app_handle, &stream_id, &file_name);
                    }
                    emit_track_changed(&app_handle, &stream_id, &m.artist, &m.title, "");
                    update_track_info(&manager, &stream_id, &m.artist, &m.title).await;
                }
                splitter::SplitAction::FinalizeAndStart { completed, new, duration_ms } => {
                    if let Ok(Some(final_path)) = rec.finalize_track(&completed.artist, &completed.title, duration_ms).await {
                        update_tracks_recorded(&manager, &stream_id).await;
                        let file_name = final_path.file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default();
                        emit_recording_completed(&app_handle, &stream_id, &file_name, duration_ms);
                    }
                    if let Ok(file_name) = rec.start_track(&new.artist, &new.title).await {
                        emit_recording_started(&app_handle, &stream_id, &file_name);
                    }
                    emit_track_changed(&app_handle, &stream_id, &new.artist, &new.title, "");
                    update_track_info(&manager, &stream_id, &new.artist, &new.title).await;
                }
            }
        }
        matcher::TrackAction::Normal => {
            // Existing Splitter logic unchanged
            let meta = connection::TrackMetadata {
                artist: artist.clone(),
                title: title.clone(),
            };
            match spl.on_metadata_change(meta) {
                splitter::SplitAction::Skip => {
                    emit_track_changed(&app_handle, &stream_id, &artist, &title, "");
                    update_track_info(&manager, &stream_id, &artist, &title).await;
                }
                splitter::SplitAction::StartTrack(m) => {
                    if let Ok(file_name) = rec.start_track(&m.artist, &m.title).await {
                        emit_recording_started(&app_handle, &stream_id, &file_name);
                    }
                    emit_track_changed(&app_handle, &stream_id, &m.artist, &m.title, "");
                    update_track_info(&manager, &stream_id, &m.artist, &m.title).await;
                }
                splitter::SplitAction::FinalizeAndStart { completed, new, duration_ms } => {
                    if let Ok(Some(final_path)) = rec.finalize_track(&completed.artist, &completed.title, duration_ms).await {
                        update_tracks_recorded(&manager, &stream_id).await;
                        let file_name = final_path.file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default();
                        emit_recording_completed(&app_handle, &stream_id, &file_name, duration_ms);
                    }
                    if let Ok(file_name) = rec.start_track(&new.artist, &new.title).await {
                        emit_recording_started(&app_handle, &stream_id, &file_name);
                    }
                    emit_track_changed(&app_handle, &stream_id, &new.artist, &new.title, "");
                    update_track_info(&manager, &stream_id, &new.artist, &new.title).await;
                }
            }
        }
    }
}
```

> **Note:** The `WishlistMatch` and `Normal` arms have identical Splitter logic. Extract a helper function `handle_splitter_action()` to DRY this up. The helper takes `&AppHandle`, `&str` (stream_id), splitter action, recorder, manager, artist, title and executes the matching logic.

- [ ] **Step 4: Extract helper to reduce duplication**

Add a helper function above the recording_task function:
```rust
async fn handle_splitter_action(
    action: splitter::SplitAction,
    app_handle: &AppHandle,
    stream_id: &str,
    rec: &mut recorder::Recorder,
    manager: &Arc<RwLock<StreamManager>>,
    artist: &str,
    title: &str,
) {
    match action {
        splitter::SplitAction::Skip => {
            emit_track_changed(app_handle, stream_id, artist, title, "");
            update_track_info(manager, stream_id, artist, title).await;
        }
        splitter::SplitAction::StartTrack(m) => {
            if let Ok(file_name) = rec.start_track(&m.artist, &m.title).await {
                emit_recording_started(app_handle, stream_id, &file_name);
            }
            emit_track_changed(app_handle, stream_id, &m.artist, &m.title, "");
            update_track_info(manager, stream_id, &m.artist, &m.title).await;
        }
        splitter::SplitAction::FinalizeAndStart { completed, new, duration_ms } => {
            if let Ok(Some(final_path)) = rec.finalize_track(&completed.artist, &completed.title, duration_ms).await {
                update_tracks_recorded(manager, stream_id).await;
                let file_name = final_path.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                emit_recording_completed(app_handle, stream_id, &file_name, duration_ms);
            }
            if let Ok(file_name) = rec.start_track(&new.artist, &new.title).await {
                emit_recording_started(app_handle, stream_id, &file_name);
            }
            emit_track_changed(app_handle, stream_id, &new.artist, &new.title, "");
            update_track_info(manager, stream_id, &new.artist, &new.title).await;
        }
    }
}
```

Then simplify the `MetadataChanged` handler to use this helper for both `WishlistMatch` and `Normal` arms.

- [ ] **Step 5: Build to verify compilation**

Run: `cd src-tauri && cargo check`
Expected: No errors.

- [ ] **Step 6: Commit**

```
git add src-tauri/src/stream/manager.rs
git commit -m "feat(wishlist): integrate matcher into recording_task MetadataChanged handler"
```

---

## Chunk 2: Backend — IPC Commands

### Task 3: Create wishlist IPC commands

**Files:**
- Create: `src-tauri/src/commands/wishlist_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `wishlist_commands.rs`**

```rust
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
    let entry = WishlistEntry {
        pattern: pattern.clone(),
        min_bitrate: None,
        format: None,
        remove_after_record: false,
        add_to_ignorelist_after_record: false,
        added_at: chrono::Local::now().to_rfc3339(),
    };

    let snapshot = {
        let mut profile = state.active_profile.write().await;
        // Skip duplicates
        if profile.wishlist.iter().any(|e| e.pattern == pattern) {
            return Ok(profile.wishlist.iter().find(|e| e.pattern == pattern).unwrap().clone());
        }
        profile.wishlist.push(entry.clone());
        profile.clone()
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
```

- [ ] **Step 2: Register module in `commands/mod.rs`**

Add line:
```rust
pub mod wishlist_commands;
```

- [ ] **Step 3: Register commands in `lib.rs` invoke_handler**

Add to the `tauri::generate_handler![]` array:
```rust
commands::wishlist_commands::get_wishlist,
commands::wishlist_commands::add_to_wishlist,
commands::wishlist_commands::remove_from_wishlist,
commands::wishlist_commands::update_wishlist_pattern,
commands::wishlist_commands::get_ignorelist,
commands::wishlist_commands::add_to_ignorelist,
commands::wishlist_commands::remove_from_ignorelist,
commands::wishlist_commands::update_ignorelist_pattern,
```

- [ ] **Step 4: Build to verify compilation**

Run: `cd src-tauri && cargo check`
Expected: No errors.

- [ ] **Step 5: Commit**

```
git add src-tauri/src/commands/wishlist_commands.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(wishlist): add IPC commands for wishlist/ignorelist CRUD"
```

---

## Chunk 3: Frontend — Types, Store, i18n

### Task 4: Add TypeScript types and IPC wrappers

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Add types and wrappers to `lib/tauri.ts`**

Add types after existing types:
```typescript
// ── Wishlist/Ignorelist types ─────────────────────────────────────────────

export interface WishlistEntry {
  pattern: string;
  minBitrate: number | null;
  format: "mp3" | "aac" | null;
  removeAfterRecord: boolean;
  addToIgnorelistAfterRecord: boolean;
  addedAt: string;
}

export interface WishlistMatchPayload {
  streamId: string;
  artist: string;
  title: string;
  pattern: string;
}

export interface TrackIgnoredPayload {
  streamId: string;
  artist: string;
  title: string;
  pattern: string;
}
```

Add IPC wrappers after existing wrappers:
```typescript
// ── Wishlist/Ignorelist IPC wrappers ──────────────────────────────────────

export async function getWishlist(): Promise<WishlistEntry[]> {
  return invoke("get_wishlist");
}
export async function addToWishlist(pattern: string): Promise<WishlistEntry> {
  return invoke("add_to_wishlist", { pattern });
}
export async function removeFromWishlist(pattern: string): Promise<void> {
  return invoke("remove_from_wishlist", { pattern });
}
export async function updateWishlistPattern(oldPattern: string, newPattern: string): Promise<WishlistEntry> {
  return invoke("update_wishlist_pattern", { oldPattern, newPattern });
}
export async function getIgnorelist(): Promise<string[]> {
  return invoke("get_ignorelist");
}
export async function addToIgnorelist(pattern: string): Promise<void> {
  return invoke("add_to_ignorelist", { pattern });
}
export async function removeFromIgnorelist(pattern: string): Promise<void> {
  return invoke("remove_from_ignorelist", { pattern });
}
export async function updateIgnorelistPattern(oldPattern: string, newPattern: string): Promise<void> {
  return invoke("update_ignorelist_pattern", { oldPattern, newPattern });
}
```

- [ ] **Step 2: Commit**

```
git add src/lib/tauri.ts
git commit -m "feat(wishlist): add TypeScript types and IPC wrappers"
```

### Task 5: Extend profile store and add i18n messages

**Files:**
- Modify: `src/stores/profile.ts`
- Modify: `src/i18n/messages/uk.json`
- Modify: `src/i18n/messages/en.json`

- [ ] **Step 1: Extend `ProfileState` in `profile.ts`**

```typescript
import { atom } from "nanostores";
import type { RecordingSettings, WishlistEntry } from "../lib/tauri";

export interface ProfileState {
  name: string;
  recording: RecordingSettings;
  wishlist: WishlistEntry[];
  ignorelist: string[];
}

export const $profile = atom<ProfileState | null>(null);
```

- [ ] **Step 2: Add i18n messages to `uk.json`**

Add before the closing `}`:
```json
  "wishlist_tab_label": "Бажане",
  "wishlist_section_title": "Бажані треки",
  "ignorelist_section_title": "Ігноровані треки",
  "add_pattern": "Додати патерн",
  "edit_pattern": "Редагувати патерн",
  "remove_pattern": "Видалити патерн",
  "pattern_label": "Патерн",
  "pattern_hint": "Використовуйте * для будь-яких символів, ? для одного",
  "add_to_wishlist": "Додати до бажаних",
  "add_to_ignorelist": "Додати до ігнорованих",
  "stream_actions": "Дії для {name}",
  "stream_context_menu": "Контекстне меню потоку",
  "announcement_wishlist_match": "Знайдено бажану пісню: {title}",
  "announcement_track_ignored": "Трек ігноровано: {title}",
  "announcement_pattern_added": "Патерн додано: {pattern}",
  "announcement_pattern_updated": "Патерн оновлено: {pattern}",
  "announcement_pattern_removed": "Патерн видалено: {pattern}",
  "column_pattern": "Патерн",
  "column_added_at": "Дата додавання",
  "column_actions": "Дії",
  "empty_wishlist": "Список бажаних треків порожній",
  "empty_ignorelist": "Список ігнорованих треків порожній",
  "confirm_remove_pattern": "Видалити патерн \"{pattern}\"?"
```

- [ ] **Step 3: Add i18n messages to `en.json`**

Add before the closing `}`:
```json
  "wishlist_tab_label": "Wishlist",
  "wishlist_section_title": "Desired tracks",
  "ignorelist_section_title": "Ignored tracks",
  "add_pattern": "Add pattern",
  "edit_pattern": "Edit pattern",
  "remove_pattern": "Remove pattern",
  "pattern_label": "Pattern",
  "pattern_hint": "Use * for any characters, ? for one character",
  "add_to_wishlist": "Add to wishlist",
  "add_to_ignorelist": "Add to ignorelist",
  "stream_actions": "Actions for {name}",
  "stream_context_menu": "Stream context menu",
  "announcement_wishlist_match": "Desired track found: {title}",
  "announcement_track_ignored": "Track ignored: {title}",
  "announcement_pattern_added": "Pattern added: {pattern}",
  "announcement_pattern_updated": "Pattern updated: {pattern}",
  "announcement_pattern_removed": "Pattern removed: {pattern}",
  "column_pattern": "Pattern",
  "column_added_at": "Date added",
  "column_actions": "Actions",
  "empty_wishlist": "Wishlist is empty",
  "empty_ignorelist": "Ignorelist is empty",
  "confirm_remove_pattern": "Remove pattern \"{pattern}\"?"
```

- [ ] **Step 4: Commit**

```
git add src/stores/profile.ts src/i18n/messages/uk.json src/i18n/messages/en.json
git commit -m "feat(wishlist): extend profile store and add i18n messages"
```

---

## Chunk 4: Frontend — WishlistPanel Components

### Task 6: Create AddPatternDialog

**Files:**
- Create: `src/components/wishlist/AddPatternDialog.tsx`

- [ ] **Step 1: Create `AddPatternDialog.tsx`**

```tsx
import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import { useState } from "react";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  /** "wishlist" or "ignorelist" */
  listType: "wishlist" | "ignorelist";
  /** Pre-filled pattern (e.g. from context menu current track) */
  initialPattern?: string;
  /** If set, we're editing an existing pattern */
  editingPattern?: string;
  onSubmit: (pattern: string) => void;
  onClose: () => void;
}

export function AddPatternDialog({ listType, initialPattern, editingPattern, onSubmit, onClose }: Props) {
  const [pattern, setPattern] = useState(editingPattern ?? initialPattern ?? "");
  const isEdit = !!editingPattern;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pattern.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  const title = isEdit ? m.edit_pattern() : m.add_pattern();

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <Modal className="w-96 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none">
        <Dialog className="outline-none">
          <Heading slot="title" className="mb-4 text-lg font-semibold text-slate-100">
            {title}
          </Heading>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              {m.pattern_label()}
              <input
                type="text"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                required
                autoFocus
                aria-describedby="pattern-hint"
                className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:border-blue-500"
              />
            </label>
            <p id="pattern-hint" className="text-xs text-slate-500">
              {m.pattern_hint()}
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
              >
                {m.cancel()}
              </button>
              <button
                type="submit"
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
              >
                {isEdit ? m.save() : m.add_pattern()}
              </button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

- [ ] **Step 2: Commit**

```
git add src/components/wishlist/AddPatternDialog.tsx
git commit -m "feat(wishlist): create AddPatternDialog component"
```

### Task 7: Create PatternTable

**Files:**
- Create: `src/components/wishlist/PatternTable.tsx`

- [ ] **Step 1: Create `PatternTable.tsx`**

```tsx
import { Table, TableHeader, TableBody, Column, Row, Cell } from "react-aria-components";
import { createPortal } from "react-dom";
import { useState } from "react";
import { ConfirmDialog } from "../common/ConfirmDialog";
import * as m from "../../i18n/paraglide/messages";

interface PatternItem {
  pattern: string;
  addedAt?: string; // undefined for ignorelist entries
}

interface Props {
  items: PatternItem[];
  ariaLabel: string;
  showDate: boolean;
  emptyMessage: string;
  onEdit: (pattern: string) => void;
  onRemove: (pattern: string) => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function PatternTable({ items, ariaLabel, showDate, emptyMessage, onEdit, onRemove }: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <>
      <Table aria-label={ariaLabel} className="w-full text-sm">
        <TableHeader>
          <Column isRowHeader className="px-3 py-2 text-left text-xs font-medium text-slate-400">
            {m.column_pattern()}
          </Column>
          {showDate && (
            <Column className="px-3 py-2 text-left text-xs font-medium text-slate-400">
              {m.column_added_at()}
            </Column>
          )}
          <Column className="px-3 py-2 text-right text-xs font-medium text-slate-400">
            {m.column_actions()}
          </Column>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <Row key={item.pattern} className="border-b border-slate-800 hover:bg-slate-800/50">
              <Cell className="px-3 py-2 font-mono text-slate-200">{item.pattern}</Cell>
              {showDate && (
                <Cell className="px-3 py-2 text-slate-400">
                  {item.addedAt ? formatDate(item.addedAt) : "—"}
                </Cell>
              )}
              <Cell className="px-3 py-2 text-right">
                <div className="flex justify-end gap-1">
                  <button
                    onClick={() => onEdit(item.pattern)}
                    aria-label={`${m.edit_pattern()}: ${item.pattern}`}
                    className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => setConfirmDelete(item.pattern)}
                    aria-label={`${m.remove_pattern()}: ${item.pattern}`}
                    className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300"
                  >
                    ✕
                  </button>
                </div>
              </Cell>
            </Row>
          ))}
        </TableBody>
      </Table>
      {confirmDelete && createPortal(
        <ConfirmDialog
          title={m.remove_pattern()}
          message={m.confirm_remove_pattern({ pattern: confirmDelete })}
          onConfirm={() => {
            onRemove(confirmDelete);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />,
        document.body
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```
git add src/components/wishlist/PatternTable.tsx
git commit -m "feat(wishlist): create PatternTable component"
```

### Task 8: Create WishlistPanel

**Files:**
- Create: `src/components/wishlist/WishlistPanel.tsx`

- [ ] **Step 1: Create `WishlistPanel.tsx`**

```tsx
import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { PatternTable } from "./PatternTable";
import { AddPatternDialog } from "./AddPatternDialog";
import { useAnnounce } from "../../hooks/useAnnounce";
import { addToast } from "../../stores/toasts";
import * as tauri from "../../lib/tauri";
import type { WishlistEntry } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

type DialogState =
  | null
  | { mode: "add"; listType: "wishlist" | "ignorelist"; initialPattern?: string }
  | { mode: "edit"; listType: "wishlist" | "ignorelist"; pattern: string };

export function WishlistPanel() {
  const [wishlist, setWishlist] = useState<WishlistEntry[]>([]);
  const [ignorelist, setIgnorelist] = useState<string[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const announce = useAnnounce();

  // Load data on mount
  useEffect(() => {
    tauri.getWishlist().then(setWishlist).catch(console.error);
    tauri.getIgnorelist().then(setIgnorelist).catch(console.error);
  }, []);

  // --- Wishlist handlers ---
  const handleAddWishlist = useCallback(async (pattern: string) => {
    try {
      const entry = await tauri.addToWishlist(pattern);
      setWishlist((prev) => [...prev.filter((e) => e.pattern !== pattern), entry]);
      announce(m.announcement_pattern_added({ pattern }), "polite");
      setDialog(null);
    } catch (err) {
      addToast(String(err), "error");
    }
  }, [announce]);

  const handleEditWishlist = useCallback(async (newPattern: string) => {
    if (!dialog || dialog.mode !== "edit") return;
    try {
      const entry = await tauri.updateWishlistPattern(dialog.pattern, newPattern);
      setWishlist((prev) => prev.map((e) => e.pattern === dialog.pattern ? entry : e));
      announce(m.announcement_pattern_updated({ pattern: newPattern }), "polite");
      setDialog(null);
    } catch (err) {
      addToast(String(err), "error");
    }
  }, [dialog, announce]);

  const handleRemoveWishlist = useCallback(async (pattern: string) => {
    try {
      await tauri.removeFromWishlist(pattern);
      setWishlist((prev) => prev.filter((e) => e.pattern !== pattern));
      announce(m.announcement_pattern_removed({ pattern }), "polite");
    } catch (err) {
      addToast(String(err), "error");
    }
  }, [announce]);

  // --- Ignorelist handlers ---
  const handleAddIgnorelist = useCallback(async (pattern: string) => {
    try {
      await tauri.addToIgnorelist(pattern);
      setIgnorelist((prev) => [...prev.filter((p) => p !== pattern), pattern]);
      announce(m.announcement_pattern_added({ pattern }), "polite");
      setDialog(null);
    } catch (err) {
      addToast(String(err), "error");
    }
  }, [announce]);

  const handleEditIgnorelist = useCallback(async (newPattern: string) => {
    if (!dialog || dialog.mode !== "edit") return;
    try {
      await tauri.updateIgnorelistPattern(dialog.pattern, newPattern);
      setIgnorelist((prev) => prev.map((p) => p === dialog.pattern ? newPattern : p));
      announce(m.announcement_pattern_updated({ pattern: newPattern }), "polite");
      setDialog(null);
    } catch (err) {
      addToast(String(err), "error");
    }
  }, [dialog, announce]);

  const handleRemoveIgnorelist = useCallback(async (pattern: string) => {
    try {
      await tauri.removeFromIgnorelist(pattern);
      setIgnorelist((prev) => prev.filter((p) => p !== pattern));
      announce(m.announcement_pattern_removed({ pattern }), "polite");
    } catch (err) {
      addToast(String(err), "error");
    }
  }, [announce]);

  const handleDialogSubmit = useCallback((pattern: string) => {
    if (!dialog) return;
    if (dialog.mode === "edit") {
      if (dialog.listType === "wishlist") handleEditWishlist(pattern);
      else handleEditIgnorelist(pattern);
    } else {
      if (dialog.listType === "wishlist") handleAddWishlist(pattern);
      else handleAddIgnorelist(pattern);
    }
  }, [dialog, handleAddWishlist, handleEditWishlist, handleAddIgnorelist, handleEditIgnorelist]);

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
      {/* Wishlist section */}
      <section aria-labelledby="wishlist-heading">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="wishlist-heading" className="text-sm font-semibold text-slate-300">
            {m.wishlist_section_title()}
          </h2>
          <button
            onClick={() => setDialog({ mode: "add", listType: "wishlist" })}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
          >
            {m.add_pattern()}
          </button>
        </div>
        <PatternTable
          items={wishlist.map((e) => ({ pattern: e.pattern, addedAt: e.addedAt }))}
          ariaLabel={m.wishlist_section_title()}
          showDate={true}
          emptyMessage={m.empty_wishlist()}
          onEdit={(pattern) => setDialog({ mode: "edit", listType: "wishlist", pattern })}
          onRemove={handleRemoveWishlist}
        />
      </section>

      {/* Ignorelist section */}
      <section aria-labelledby="ignorelist-heading">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="ignorelist-heading" className="text-sm font-semibold text-slate-300">
            {m.ignorelist_section_title()}
          </h2>
          <button
            onClick={() => setDialog({ mode: "add", listType: "ignorelist" })}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
          >
            {m.add_pattern()}
          </button>
        </div>
        <PatternTable
          items={ignorelist.map((p) => ({ pattern: p }))}
          ariaLabel={m.ignorelist_section_title()}
          showDate={false}
          emptyMessage={m.empty_ignorelist()}
          onEdit={(pattern) => setDialog({ mode: "edit", listType: "ignorelist", pattern })}
          onRemove={handleRemoveIgnorelist}
        />
      </section>

      {/* Dialog */}
      {dialog && createPortal(
        <AddPatternDialog
          listType={dialog.listType}
          initialPattern={dialog.mode === "add" ? dialog.initialPattern : undefined}
          editingPattern={dialog.mode === "edit" ? dialog.pattern : undefined}
          onSubmit={handleDialogSubmit}
          onClose={() => setDialog(null)}
        />,
        document.body
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
git add src/components/wishlist/WishlistPanel.tsx
git commit -m "feat(wishlist): create WishlistPanel with CRUD operations"
```

---

## Chunk 5: Frontend — Context Menu + App Integration

### Task 9: Create StreamContextMenu and update StreamRow

**Files:**
- Create: `src/components/streams/StreamContextMenu.tsx`
- Modify: `src/components/streams/StreamRow.tsx`

- [ ] **Step 1: Create `StreamContextMenu.tsx`**

```tsx
import { Menu, MenuItem, MenuTrigger, Popover, Button, Separator } from "react-aria-components";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { $streams, $editStream } from "../../stores/streams";
import { $playerStatus } from "../../stores/player";
import { addToast } from "../../stores/toasts";
import { useStore } from "@nanostores/react";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  stream: StreamInfo;
  status: StreamStatus | undefined;
  onAddToWishlist: (currentTrack: string) => void;
  onAddToIgnorelist: (currentTrack: string) => void;
  onDelete: () => void;
}

export function StreamContextMenu({ stream, status, onAddToWishlist, onAddToIgnorelist, onDelete }: Props) {
  const playerStatus = useStore($playerStatus);
  const state = status?.state ?? "idle";
  const isRecording = state === "recording";
  const isThisStreamPlaying =
    playerStatus.state !== "stopped" &&
    playerStatus.source?.type === "stream" &&
    playerStatus.source.streamId === stream.id;

  const currentTrack = status?.currentTrack
    ? `${status.currentTrack.artist} - ${status.currentTrack.title}`.replace(/^ - | - $/g, "").trim()
    : null;

  const handleAction = async (key: React.Key) => {
    try {
      switch (key) {
        case "play":
          if (isThisStreamPlaying) await tauri.stopPlayback();
          else await tauri.playStream(stream.id);
          break;
        case "record":
          if (isRecording) await tauri.stopRecording(stream.id);
          else await tauri.startRecording(stream.id);
          break;
        case "edit":
          $editStream.set(stream);
          break;
        case "add-wishlist":
          if (currentTrack) onAddToWishlist(currentTrack);
          break;
        case "add-ignorelist":
          if (currentTrack) onAddToIgnorelist(currentTrack);
          break;
        case "delete":
          onDelete();
          break;
      }
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  return (
    <MenuTrigger>
      <Button
        aria-label={m.stream_actions({ name: stream.name })}
        data-context-menu-trigger
        className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300"
      >
        ⋯
      </Button>
      <Popover>
        <Menu
          aria-label={m.stream_context_menu()}
          onAction={handleAction}
          className="min-w-48 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl outline-none"
        >
          <MenuItem
            id="play"
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            {isThisStreamPlaying ? `■ ${m.stop_stream_playback()}` : `▶ ${m.play_stream()}`}
          </MenuItem>
          <MenuItem
            id="record"
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            {isRecording ? `⏹ ${m.stop_recording()}` : `⏺ ${m.start_recording()}`}
          </MenuItem>
          <MenuItem
            id="edit"
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            ✎ {m.edit_stream()}
          </MenuItem>
          {currentTrack && (
            <>
              <MenuItem
                id="add-wishlist"
                className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
              >
                ⊕ {m.add_to_wishlist()}
              </MenuItem>
              <MenuItem
                id="add-ignorelist"
                className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
              >
                ⊖ {m.add_to_ignorelist()}
              </MenuItem>
            </>
          )}
          <Separator className="my-1 border-t border-slate-700" />
          <MenuItem
            id="delete"
            className="cursor-pointer px-3 py-1.5 text-sm text-red-400 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            ✕ {m.remove_stream()}
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
```

- [ ] **Step 2: Update StreamRow to use StreamContextMenu**

Replace the Edit (✎) and Delete (✕) inline buttons in StreamRow with the `StreamContextMenu` component, keeping Play and Record inline buttons. Add right-click on the row and `onContextMenu` / Shift+F10 support.

The changes to `StreamRow.tsx`:

1. Add imports at the top:
```tsx
import { StreamContextMenu } from "./StreamContextMenu";
import { AddPatternDialog } from "../wishlist/AddPatternDialog";
```

2. Add state for pattern dialog inside `StreamRow` function, after existing state:
```tsx
const [patternDialog, setPatternDialog] = useState<{
  listType: "wishlist" | "ignorelist";
  initialPattern: string;
} | null>(null);
```

3. Add right-click handler:
```tsx
const handleContextMenu = (e: React.MouseEvent) => {
  // Let the MenuTrigger handle context menu via React Aria's built-in support
  // React Aria MenuTrigger doesn't natively support right-click, so we trigger
  // programmatically by focusing the ⋯ button and pressing Enter
  e.preventDefault();
  const menuButton = e.currentTarget.querySelector<HTMLButtonElement>('[data-context-menu-trigger]');
  if (menuButton) {
    menuButton.click();
  }
};
```

4. Replace the `<Row>` element to add `onContextMenu`:
```tsx
<Row id={stream.id} className="border-b border-slate-800 hover:bg-slate-800/50" onContextMenu={handleContextMenu}>
```

Note: If React Aria `Row` doesn't support `onContextMenu`, wrap the row content in a `<div onContextMenu={handleContextMenu}>` instead.

5. In the actions `<Cell>`, replace the ✎ and ✕ buttons with `StreamContextMenu`:
```tsx
<Cell>
  <div className="flex gap-1">
    <button
      onClick={handlePlayToggle}
      aria-label={isThisStreamPlaying ? m.stop_stream_playback() : m.play_stream()}
      className={`rounded px-2 py-0.5 text-xs ${
        isThisStreamPlaying
          ? "bg-blue-700 text-white hover:bg-blue-600"
          : "bg-slate-700 text-slate-300 hover:bg-slate-600"
      }`}
    >
      {isThisStreamPlaying ? "■" : "▶"}
    </button>
    <button
      onClick={handleRecordToggle}
      aria-label={isRecording ? m.stop_recording() : m.start_recording()}
      className={`rounded px-2 py-0.5 text-xs ${
        isRecording
          ? "bg-red-700 text-white hover:bg-red-600"
          : "bg-slate-700 text-slate-300 hover:bg-slate-600"
      }`}
    >
      {isRecording ? m.stop_recording() : m.start_recording()}
    </button>
    <StreamContextMenu
      stream={stream}
      status={status}
      onAddToWishlist={(track) => setPatternDialog({ listType: "wishlist", initialPattern: track })}
      onAddToIgnorelist={(track) => setPatternDialog({ listType: "ignorelist", initialPattern: track })}
      onDelete={() => setShowConfirmDelete(true)}
    />
  </div>
</Cell>
```

7. Add the pattern dialog portal after the confirm delete portal:
```tsx
{patternDialog && createPortal(
  <AddPatternDialog
    listType={patternDialog.listType}
    initialPattern={patternDialog.initialPattern}
    onSubmit={async (pattern) => {
      try {
        if (patternDialog.listType === "wishlist") {
          await tauri.addToWishlist(pattern);
        } else {
          await tauri.addToIgnorelist(pattern);
        }
        setPatternDialog(null);
      } catch (err) {
        addToast(String(err), "error");
      }
    }}
    onClose={() => setPatternDialog(null)}
  />,
  document.body
)}
```

8. Remove the now-unused direct `handleDelete` function body — keep `handleDelete` but it's now only called from `ConfirmDialog.onConfirm`.

- [ ] **Step 3: Build frontend to verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```
git add src/components/streams/StreamContextMenu.tsx src/components/streams/StreamRow.tsx
git commit -m "feat(wishlist): add StreamContextMenu and integrate into StreamRow"
```

### Task 10: Enable Activity Bar wishlist tab and wire App.tsx

**Files:**
- Modify: `src/components/layout/ActivityBar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Enable wishlist tab in ActivityBar**

In `ActivityBar.tsx`, change the wishlist entry's `disabled` from `true` to `false`:
```typescript
{ id: "wishlist", icon: Heart, label: m.wishlist_section(), disabled: false },
```

The section buttons currently have no `onClick` handler. Add one to the `<button>` element (line 31):
```tsx
<button
  key={section.id}
  aria-label={section.label}
  aria-current={activeSection === section.id ? "page" : undefined}
  disabled={section.disabled}
  onClick={() => $activeSection.set(section.id)}
  title={...}
```

- [ ] **Step 2: Update App.tsx — render WishlistPanel, add event listeners**

In `App.tsx`:

1. Import `WishlistPanel` and `$activeSection`:
```typescript
import { WishlistPanel } from "./components/wishlist/WishlistPanel";
import { $activeSection } from "./stores/navigation";
import type { WishlistMatchPayload, TrackIgnoredPayload } from "./lib/tauri";
```

2. Use `$activeSection` to conditionally render:
```tsx
const activeSection = useStore($activeSection);
```
(Add `useStore` import from `@nanostores/react` if not already imported)

3. In the return JSX, replace `<StreamsPanel />` with conditional rendering:
```tsx
{activeSection === "streams" && <StreamsPanel />}
{activeSection === "wishlist" && <WishlistPanel />}
```

4. Update `SectionHeader` to use dynamic title:
```tsx
<SectionHeader title={activeSection === "wishlist" ? m.wishlist_section() : m.streams_section()} />
```

5. Add event listeners for `wishlist-match` and `track-ignored`:
```typescript
const handleWishlistMatch = useCallback((payload: WishlistMatchPayload) => {
  announce(m.announcement_wishlist_match({ title: `${payload.artist} — ${payload.title}` }), "assertive");
}, [announce]);

const handleTrackIgnored = useCallback((payload: TrackIgnoredPayload) => {
  announce(m.announcement_track_ignored({ title: `${payload.artist} — ${payload.title}` }), "polite");
}, [announce]);
```

6. Register the event listeners:
```typescript
useTauriEvent<WishlistMatchPayload>("wishlist-match", handleWishlistMatch);
useTauriEvent<TrackIgnoredPayload>("track-ignored", handleTrackIgnored);
```

- [ ] **Step 3: Build to verify everything compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Full build test**

Run: `just build-fast`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```
git add src/components/layout/ActivityBar.tsx src/App.tsx
git commit -m "feat(wishlist): enable wishlist tab, wire WishlistPanel and events in App.tsx"
```

---

## Chunk 6: Verification & Cleanup

### Task 11: Full build and manual verification checklist

- [ ] **Step 1: Run full Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Build the application**

Run: `just build-fast`
Expected: Build succeeds, binary at `src-tauri/target/release-fast/tapir.exe`.

- [ ] **Step 4: Manual testing checklist**

Verify with NVDA:
1. Activity Bar: "Бажане" tab is now clickable, switches to WishlistPanel
2. WishlistPanel: two sections with tables, "Додати" buttons
3. Add a pattern to wishlist via dialog — aria-live announces "Патерн додано: ..."
4. Add a pattern to ignorelist — same announcement
5. Edit a pattern — dialog opens with pre-filled value, announces "Патерн оновлено: ..."
6. Delete a pattern — confirm dialog, then "Патерн видалено: ..."
7. StreamRow: "⋯" button opens context menu, navigable with ↑↓, Escape closes
8. StreamRow: right-click on the row opens the same context menu
9. Context menu: "Додати до бажаних" / "Додати до ігнорованих" opens AddPatternDialog with current track pre-filled
10. Start recording a stream with an ignorelist pattern matching a track. Verify: no new track file is created for the ignored track, `track-ignored` event fires (check DevTools console), stream file continues recording
11. Start recording a stream with a wishlist pattern matching a track. Verify: `wishlist-match` event fires (DevTools console), track is recorded normally

- [ ] **Step 5: Final commit (if any fixes needed)**

```
git add -u
git commit -m "fix(wishlist): address manual testing issues"
```
