# Phase 3F — Profile Manager Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full CRUD profile management (create, rename, delete, duplicate, import/export, switch) with a modal dialog accessible from ActivityBar.

**Architecture:** Backend-first — all business logic in `profile.rs` + `commands/profile_commands.rs`; frontend is a thin presentation layer using React Aria + Nanostores. Profile switch stops all recordings + playback atomically before swapping state.

**Tech Stack:** Rust (Tauri v2), React 19, React Aria Components, Nanostores, Vitest, Paraglide.js i18n.

**Spec:** `docs/superpowers/specs/2026-06-01-phase-3f-profile-manager-design.md`

**Run tests:** `pnpm test` (frontend), `cargo test` (Rust backend — from `src-tauri/`)
**Build:** `just build-fast` (output: `src-tauri/target/release-fast/tapir.exe`)

---

## Chunk 1: Backend Foundation

Files touched:
- Modify: `src-tauri/src/errors.rs`
- Modify: `src-tauri/src/profile.rs` (add types + methods)

---

### Task 1: Add RadioError variants

**Files:**
- Modify: `src-tauri/src/errors.rs`

- [ ] **Step 1: Write the failing test**

Add at the bottom of `src-tauri/src/errors.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_display_prefixes() {
        assert_eq!(RadioError::Conflict("x".into()).to_string(), "Conflict: x");
        assert_eq!(RadioError::Forbidden("x".into()).to_string(), "Forbidden: x");
        assert_eq!(RadioError::InvalidName("x".into()).to_string(), "InvalidName: x");
        assert_eq!(RadioError::InvalidData("x".into()).to_string(), "InvalidData: x");
    }
}
```

- [ ] **Step 2: Run test to confirm it fails**

```
cd src-tauri && cargo test error_display_prefixes
```

Expected: compile error — variants don't exist yet.

- [ ] **Step 3: Add the four variants to `RadioError` in `errors.rs`**

```rust
#[error("Conflict: {0}")]
Conflict(String),

#[error("Forbidden: {0}")]
Forbidden(String),

#[error("InvalidName: {0}")]
InvalidName(String),

#[error("InvalidData: {0}")]
InvalidData(String),
```

- [ ] **Step 4: Run test to confirm it passes**

```
cd src-tauri && cargo test error_display_prefixes
```

Expected: test passes.

- [ ] **Step 5: Commit**

```
git add src-tauri/src/errors.rs
git commit -m "feat(backend): add Conflict/Forbidden/InvalidName/InvalidData RadioError variants"
```

---

### Task 2: Add `ProfileMeta` and `ImportPreview` types to `profile.rs`

**Files:**
- Modify: `src-tauri/src/profile.rs`

- [ ] **Step 1: Write serialization tests**

Add inside a `#[cfg(test)] mod tests` block at the bottom of `profile.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_meta_serializes() {
        let m = ProfileMeta { name: "Test".into(), stream_count: 3, is_active: true };
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains("\"streamCount\":3"));
        assert!(json.contains("\"isActive\":true"));
        assert!(json.contains("\"name\":\"Test\""));
    }

    #[test]
    fn import_preview_serializes() {
        let p = ImportPreview {
            profile_json: "{}".into(),
            suggested_name: "Imported".into(),
            stream_count: 0,
            has_conflict: false,
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"suggestedName\":\"Imported\""));
        assert!(json.contains("\"hasConflict\":false"));
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd src-tauri && cargo test profile_meta_serializes
```

Expected: compile error — types don't exist.

- [ ] **Step 3: Add types to `profile.rs`** (after existing struct definitions, before `impl Profile`):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMeta {
    pub name: String,
    pub stream_count: usize,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub profile_json: String,
    pub suggested_name: String,
    pub stream_count: usize,
    pub has_conflict: bool,
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
cd src-tauri && cargo test profile_meta_serializes
```

- [ ] **Step 5: Commit**

```
git add src-tauri/src/profile.rs
git commit -m "feat(backend): add ProfileMeta and ImportPreview types"
```

---

### Task 3: Add `validate_profile_name` helper

**Files:**
- Modify: `src-tauri/src/profile.rs`

- [ ] **Step 1: Write the failing tests**

Add to the `#[cfg(test)] mod tests` block in `profile.rs`:

```rust
#[test]
fn validate_name_rejects_empty() {
    assert!(validate_profile_name("", &[]).is_err());
}

#[test]
fn validate_name_rejects_too_long() {
    let long = "a".repeat(65);
    assert!(validate_profile_name(&long, &[]).is_err());
}

#[test]
fn validate_name_rejects_default() {
    assert!(validate_profile_name("Default", &[]).is_err());
    assert!(validate_profile_name("default", &[]).is_err());
    assert!(validate_profile_name("DEFAULT", &[]).is_err());
}

#[test]
fn validate_name_rejects_windows_reserved() {
    for name in &["CON", "con", "NUL", "COM1", "LPT9", "PRN", "AUX"] {
        assert!(validate_profile_name(name, &[]).is_err(), "{name} should be rejected");
    }
}

#[test]
fn validate_name_rejects_forbidden_chars() {
    for ch in &['\\', '/', ':', '*', '?', '"', '<', '>', '|'] {
        let name = format!("test{ch}name");
        assert!(validate_profile_name(&name, &[]).is_err(), "char {ch} should be rejected");
    }
}

#[test]
fn validate_name_rejects_leading_trailing_dot_space() {
    assert!(validate_profile_name(" Work", &[]).is_err());
    assert!(validate_profile_name("Work ", &[]).is_err());
    assert!(validate_profile_name(".Work", &[]).is_err());
    assert!(validate_profile_name("Work.", &[]).is_err());
}

#[test]
fn validate_name_rejects_duplicate_case_insensitive() {
    let existing = vec!["Jazz".to_string(), "Rock".to_string()];
    assert!(validate_profile_name("jazz", &existing).is_err());
    assert!(validate_profile_name("JAZZ", &existing).is_err());
}

#[test]
fn validate_name_accepts_valid() {
    assert!(validate_profile_name("My Profile", &[]).is_ok());
    assert!(validate_profile_name("Jazz-2026", &[]).is_ok());
    assert!(validate_profile_name("Work_EU", &[]).is_ok());
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd src-tauri && cargo test validate_name
```

Expected: compile error — function doesn't exist.

- [ ] **Step 3: Implement `validate_profile_name` in `profile.rs`** (add as a free function before `impl Profile`):

```rust
/// Validate a profile name for create/rename/import operations.
/// `existing` = list of existing profile names (for duplicate check, case-insensitive).
pub fn validate_profile_name(name: &str, existing: &[String]) -> Result<(), RadioError> {
    if name.is_empty() {
        return Err(RadioError::InvalidName("Name cannot be empty".into()));
    }
    if name.len() > 64 {
        return Err(RadioError::InvalidName("Name cannot exceed 64 characters".into()));
    }
    if name.starts_with(' ') || name.ends_with(' ') || name.starts_with('.') || name.ends_with('.') {
        return Err(RadioError::InvalidName(
            "Name cannot start or end with a space or dot".into(),
        ));
    }
    let forbidden_chars = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
    if let Some(ch) = name.chars().find(|c| forbidden_chars.contains(c)) {
        return Err(RadioError::InvalidName(format!("Forbidden character: {ch}")));
    }
    let upper = name.to_uppercase();
    let reserved = [
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if reserved.contains(&upper.as_str()) {
        return Err(RadioError::InvalidName(format!("'{name}' is a reserved Windows device name")));
    }
    if name.to_lowercase() == "default" {
        return Err(RadioError::InvalidName("'Default' is a reserved name".into()));
    }
    let lower = name.to_lowercase();
    if existing.iter().any(|e| e.to_lowercase() == lower) {
        return Err(RadioError::Conflict(format!("Profile '{name}' already exists")));
    }
    Ok(())
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
cd src-tauri && cargo test validate_name
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```
git add src-tauri/src/profile.rs
git commit -m "feat(backend): add validate_profile_name with full Windows name rules"
```

---

### Task 4: Add `Profile::list()` method

**Files:**
- Modify: `src-tauri/src/profile.rs`

- [ ] **Step 1: Write tests** (sorting logic):

```rust
#[test]
fn list_sort_puts_default_first() {
    // Test the sort algorithm used by Profile::list()
    let mut metas = vec![
        ProfileMeta { name: "Zebra".into(), stream_count: 0, is_active: false },
        ProfileMeta { name: "Default".into(), stream_count: 0, is_active: true },
        ProfileMeta { name: "Alpha".into(), stream_count: 0, is_active: false },
    ];
    metas.sort_by(|a, b| {
        if a.name == "Default" { return std::cmp::Ordering::Less; }
        if b.name == "Default" { return std::cmp::Ordering::Greater; }
        a.name.cmp(&b.name)
    });
    assert_eq!(metas[0].name, "Default");
    assert_eq!(metas[1].name, "Alpha");
    assert_eq!(metas[2].name, "Zebra");
}
```

> The missing-dir fallback (returning synthetic Default) is verified by integration testing (Task 20 smoke test — running without a profiles dir).

- [ ] **Step 2: Run test to confirm it fails**

```
cd src-tauri && cargo test list_sort_puts_default_first
```

- [ ] **Step 3: Implement `Profile::list(active: &str) -> Result<Vec<ProfileMeta>, RadioError>`** in the `impl Profile` block:

```rust
pub fn list(active: &str) -> Result<Vec<ProfileMeta>, RadioError> {
    let dir = portable::profiles_dir();
    if !dir.exists() {
        return Ok(vec![ProfileMeta {
            name: "Default".to_string(),
            stream_count: 0,
            is_active: active == "Default",
        }]);
    }
    let mut metas: Vec<ProfileMeta> = std::fs::read_dir(&dir)?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().extension().and_then(|s| s.to_str()) == Some("tapirprofile")
        })
        .filter_map(|e| {
            let path = e.path();
            let name = path.file_stem()?.to_str()?.to_string();
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    let stripped = crate::settings::strip_bom(&content);
                    match serde_json::from_str::<Profile>(stripped) {
                        Ok(p) => Some(ProfileMeta {
                            name: name.clone(),
                            stream_count: p.streams.len(),
                            is_active: name == active,
                        }),
                        Err(e) => {
                            log::warn!("Skipping corrupt profile '{name}': {e}");
                            None
                        }
                    }
                }
                Err(e) => {
                    log::warn!("Cannot read profile file '{}': {e}", path.display());
                    None
                }
            }
        })
        .collect();

    metas.sort_by(|a, b| {
        if a.name == "Default" { return std::cmp::Ordering::Less; }
        if b.name == "Default" { return std::cmp::Ordering::Greater; }
        a.name.cmp(&b.name)
    });
    Ok(metas)
}
```

- [ ] **Step 4: Run test**

```
cd src-tauri && cargo test list_sort_puts_default_first
```

- [ ] **Step 5: Commit**

```
git add src-tauri/src/profile.rs
git commit -m "feat(backend): add Profile::list() — skips corrupt files, Default first"
```

---

### Task 5: Add `create`, `rename`, `delete`, `duplicate` methods

**Files:**
- Modify: `src-tauri/src/profile.rs`

- [ ] **Step 1: Write tests**

```rust
#[test]
fn create_rejects_invalid_name() {
    let err = Profile::create("").unwrap_err();
    assert!(err.to_string().starts_with("InvalidName:"), "got: {err}");
}

#[test]
fn create_rejects_forbidden_default_name() {
    let err = Profile::create("Default").unwrap_err();
    assert!(err.to_string().starts_with("InvalidName:"), "got: {err}");
}

#[test]
fn rename_default_is_forbidden() {
    let err = Profile::rename("Default", "Anything").unwrap_err();
    assert!(err.to_string().starts_with("Forbidden:"), "got: {err}");
}

#[test]
fn delete_default_is_forbidden() {
    let err = Profile::delete("Default").unwrap_err();
    assert!(err.to_string().starts_with("Forbidden:"), "got: {err}");
}

#[test]
fn delete_nonexistent_is_not_found() {
    let err = Profile::delete("__nonexistent_profile_xyz__").unwrap_err();
    assert!(err.to_string().to_lowercase().contains("not found") ||
            err.to_string().contains("NotFound"), "got: {err}");
}
```

> **Note on `rename` return type:** `Profile::rename` returns `Result<ProfileMeta>` (not `Result<()>` as in the spec). This intentional deviation avoids a redundant reload in the command layer and passes back the updated meta in one step. The `rename_profile` IPC command relies on this.

- [ ] **Step 2: Run tests**

```
cd src-tauri ; cargo test create_rejects
```

Expected: compile error before Step 3; all pass after.

- [ ] **Step 3: Implement methods in `impl Profile`:**

```rust
pub fn create(name: &str) -> Result<Self, RadioError> {
    let existing = Self::list(name)?.iter().map(|m| m.name.clone()).collect::<Vec<_>>();
    validate_profile_name(name, &existing)?;
    let mut profile = Self::create_default();
    profile.name = name.to_string();
    profile.save()?;
    Ok(profile)
}

pub fn rename(old_name: &str, new_name: &str) -> Result<ProfileMeta, RadioError> {
    if old_name == "Default" {
        return Err(RadioError::Forbidden("Cannot rename 'Default' profile".into()));
    }
    let existing: Vec<String> = Self::list(old_name)?
        .iter()
        .filter(|m| m.name != old_name)
        .map(|m| m.name.clone())
        .collect();
    validate_profile_name(new_name, &existing)?;
    let mut profile = Self::load(old_name)?;
    let old_path = portable::profiles_dir().join(format!("{}.tapirprofile", old_name));
    let new_path = portable::profiles_dir().join(format!("{}.tapirprofile", new_name));
    // Guard against clobbering an existing file that validate missed (e.g. corrupt, unreadable)
    if new_path.exists() {
        return Err(RadioError::Conflict(format!("A profile file named '{new_name}' already exists")));
    }
    profile.name = new_name.to_string();
    let json = serde_json::to_string_pretty(&profile)?;
    std::fs::write(&new_path, &json)?;
    std::fs::remove_file(&old_path)?;
    Ok(ProfileMeta {
        name: new_name.to_string(),
        stream_count: profile.streams.len(),
        is_active: false, // caller must check
    })
}

pub fn delete(name: &str) -> Result<(), RadioError> {
    if name == "Default" {
        return Err(RadioError::Forbidden("Cannot delete 'Default' profile".into()));
    }
    let path = portable::profiles_dir().join(format!("{}.tapirprofile", name));
    if !path.exists() {
        return Err(RadioError::NotFound(format!("Profile '{name}' not found")));
    }
    std::fs::remove_file(&path)?;
    Ok(())
}

pub fn duplicate(src_name: &str, new_name: &str) -> Result<ProfileMeta, RadioError> {
    let existing: Vec<String> = Self::list(src_name)?.iter().map(|m| m.name.clone()).collect();
    validate_profile_name(new_name, &existing)?;
    let mut profile = Self::load(src_name)?;
    profile.name = new_name.to_string();
    // Clear session state — duplicated profile starts fresh
    profile.active_recording_urls = vec![];
    profile.save()?;
    Ok(ProfileMeta {
        name: new_name.to_string(),
        stream_count: profile.streams.len(),
        is_active: false,
    })
}
```

- [ ] **Step 4: Run tests**

```
cd src-tauri ; cargo test
```

Expected: no compile errors; all tests pass.

- [ ] **Step 5: Commit**

```
git add src-tauri/src/profile.rs
git commit -m "feat(backend): add Profile::create/rename/delete/duplicate"
```

---

### Task 6: Add `export_json`, `preview_import_json`, `save_imported` methods

**Files:**
- Modify: `src-tauri/src/profile.rs`

- [ ] **Step 1: Write tests**

```rust
#[test]
fn export_json_strips_all_passwords() {
    let mut profile = Profile::create_default();
    profile.streams.push(StreamInfo {
        id: "1".into(), url: "http://x".into(), name: "X".into(),
        format: None, bitrate: None, icy_name: None, icy_genre: None,
        icy_url: None, ignorelist: vec![], username: Some("user".into()),
        password: Some("hunter2".into()), added_at: "2026-01-01".into(),
    });
    let json = profile.export_json_str();
    assert!(!json.contains("hunter2"), "password must be stripped from export");
    assert!(json.contains("user"), "username may remain");
}

#[test]
fn preview_import_returns_err_for_invalid_json() {
    let result = Profile::preview_import_json("not json at all");
    assert!(matches!(result, Err(RadioError::InvalidData(_))));
}

#[test]
fn preview_import_detects_conflict() {
    let profile = Profile::create_default();
    let json = serde_json::to_string(&profile).unwrap();
    let preview = Profile::preview_import_json_with_existing(&json, &["Default".to_string()]);
    assert!(preview.unwrap().has_conflict);
}

#[test]
fn save_imported_rejects_invalid_name() {
    let profile = Profile::create_default();
    let json = serde_json::to_string(&profile).unwrap();
    let err = Profile::save_imported(&json, "").unwrap_err();
    assert!(err.to_string().starts_with("InvalidName:"), "got: {err}");
}

#[test]
fn save_imported_rejects_invalid_json() {
    let err = Profile::save_imported("not valid json", "ValidName").unwrap_err();
    assert!(err.to_string().starts_with("InvalidData:"), "got: {err}");
}
```

- [ ] **Step 2: Run tests to confirm compile failure**

```
cd src-tauri && cargo test export_json_strips
```

- [ ] **Step 3: Implement methods in `impl Profile`:**

```rust
/// Serialize this profile to JSON with all stream passwords stripped.
pub fn export_json_str(&self) -> String {
    let mut copy = self.clone();
    for stream in &mut copy.streams {
        stream.password = None;
    }
    serde_json::to_string_pretty(&copy).unwrap_or_default()
}

/// Parse JSON and return a preview. Does NOT save, does NOT strip passwords.
pub fn preview_import_json(json: &str) -> Result<ImportPreview, RadioError> {
    let existing = Self::list("").map(|v| v.into_iter().map(|m| m.name).collect::<Vec<_>>())
        .unwrap_or_default();
    Self::preview_import_json_with_existing(json, &existing)
}

pub fn preview_import_json_with_existing(json: &str, existing: &[String]) -> Result<ImportPreview, RadioError> {
    let profile: Profile = serde_json::from_str(json)
        .map_err(|e| RadioError::InvalidData(format!("Cannot parse profile: {e}")))?;
    let has_conflict = existing.iter().any(|e| e.to_lowercase() == profile.name.to_lowercase());
    Ok(ImportPreview {
        profile_json: json.to_string(),
        suggested_name: profile.name.clone(),
        stream_count: profile.streams.len(),
        has_conflict,
    })
}

/// Validate name, strip passwords, override profile name, save.
pub fn save_imported(json: &str, name: &str) -> Result<ProfileMeta, RadioError> {
    let existing: Vec<String> = Self::list("")?.iter().map(|m| m.name.clone()).collect();
    validate_profile_name(name, &existing)?;
    let mut profile: Profile = serde_json::from_str(json)
        .map_err(|e| RadioError::InvalidData(format!("Cannot parse profile: {e}")))?;
    // Strip passwords server-side regardless of what the frontend sends
    for stream in &mut profile.streams {
        stream.password = None;
    }
    profile.name = name.to_string();
    profile.active_recording_urls = vec![];
    profile.save()?;
    Ok(ProfileMeta {
        name: name.to_string(),
        stream_count: profile.streams.len(),
        is_active: false,
    })
}

/// Load profile, strip passwords, return JSON for file export.
pub fn export_json(name: &str) -> Result<String, RadioError> {
    let profile = Self::load(name)?;
    Ok(profile.export_json_str())
}
```

- [ ] **Step 4: Run tests**

```
cd src-tauri && cargo test export_json
```

Expected: all pass.

- [ ] **Step 5: Run full Rust test suite**

```
cd src-tauri && cargo test
```

Expected: all existing + new tests pass.

- [ ] **Step 6: Commit**

```
git add src-tauri/src/profile.rs
git commit -m "feat(backend): add Profile::export_json/preview_import_json/save_imported"
```

---

## Chunk 2: Backend IPC

Files touched:
- Modify: `src-tauri/src/stream/manager.rs` (add `stop_all_async`)
- Create: `src-tauri/src/commands/profile_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

---

### Task 7: Add `stop_all_async` to StreamManager

**Files:**
- Modify: `src-tauri/src/stream/manager.rs`

The existing `stop_all()` cancels tokens but doesn't return the JoinHandles. `switch_profile` needs to join the tasks to prevent concurrent writes to `active_profile`.

- [ ] **Step 1: Write the test**

Add inside the `#[cfg(test)]` block of `manager.rs` (or in a new one):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stop_all_async_returns_handles_for_active_entries() {
        // We can't easily test the full async path here without a full Tauri runtime.
        // Instead, verify the method exists and compiles by calling it.
        // The real contract (tasks terminate) is verified via integration testing.
        // This test just ensures the return type is correct.
        let _: fn(&mut StreamManager) -> Vec<tokio::task::JoinHandle<()>> =
            StreamManager::stop_all_async;
    }
}
```

- [ ] **Step 2: Run test to confirm compile failure**

```
cd src-tauri && cargo test stop_all_async
```

- [ ] **Step 3: Add `stop_all_async` to `StreamManager`**

Add in `impl StreamManager` in `stream/manager.rs`, after `stop_all`:

```rust
/// Cancel all active recording tasks and return their JoinHandles.
/// The caller must await (with timeout) these handles to ensure all tasks
/// have finished before mutating AppState.
pub fn stop_all_async(&mut self) -> Vec<tokio::task::JoinHandle<()>> {
    // Cancel all tokens first, then drain and return handles.
    for entry in self.entries.values() {
        entry.cancel_token.cancel();
    }
    // We need ownership of the handles. Drain the entries map, collect handles,
    // then rebuild without the join handles (entries are done anyway).
    self.entries
        .drain()
        .map(|(_, entry)| entry.join_handle)
        .collect()
}
```

> **Note:** `StreamEntry.join_handle` is currently `#[allow(dead_code)]`. Remove that attribute after this change.

- [ ] **Step 4: Remove `#[allow(dead_code)]` from `join_handle` field**

In `stream/manager.rs`, find:
```rust
#[allow(dead_code)]
join_handle: JoinHandle<()>,
```
Change to:
```rust
join_handle: JoinHandle<()>,
```

- [ ] **Step 5: Run test + full suite**

```
cd src-tauri && cargo test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add src-tauri/src/stream/manager.rs
git commit -m "feat(backend): add StreamManager::stop_all_async() returning JoinHandles"
```

---

### Task 8: Create `profile_commands.rs` — list, create, rename, delete, duplicate

**Files:**
- Create: `src-tauri/src/commands/profile_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/commands/profile_commands.rs`** with the first five commands:

```rust
use tauri::{AppHandle, State};
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
```

- [ ] **Step 2: Add `pub mod profile_commands;` to `commands/mod.rs`**

Append to `src-tauri/src/commands/mod.rs`:
```rust
pub mod profile_commands;
```

- [ ] **Step 3: Register in `lib.rs`**

In the `invoke_handler!` macro in `src-tauri/src/lib.rs`, add after the last `songs_commands` entry:
```rust
commands::profile_commands::list_profiles,
commands::profile_commands::create_profile,
commands::profile_commands::rename_profile,
commands::profile_commands::delete_profile,
commands::profile_commands::duplicate_profile,
```

- [ ] **Step 4: Verify it compiles**

```
cd src-tauri ; cargo build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```
git add src-tauri/src/commands/profile_commands.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(backend): add list/create/rename/delete/duplicate profile IPC commands"
```

---

### Task 9: Add export, begin_import, commit_import commands

**Files:**
- Modify: `src-tauri/src/commands/profile_commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add three commands to `profile_commands.rs`:**

```rust
use crate::profile::ImportPreview;
use tauri::Manager; // for app_handle.dialog()
use tauri_plugin_dialog::{DialogExt, FilePath};

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
```

- [ ] **Step 2: Register in `lib.rs`**

Add to invoke_handler:
```rust
commands::profile_commands::export_profile,
commands::profile_commands::begin_import,
commands::profile_commands::commit_import,
```

- [ ] **Step 3: Verify it compiles**

```
cd src-tauri ; cargo build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
git add src-tauri/src/commands/profile_commands.rs src-tauri/src/lib.rs
git commit -m "feat(backend): add export_profile/begin_import/commit_import IPC commands"
```

---

### Task 10: Add `switch_profile` command

**Files:**
- Modify: `src-tauri/src/commands/profile_commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml` (if `futures` not yet present)

This is the most complex command. Follow the spec's 13-step logic exactly.

- [ ] **Step 1: Add `switch_profile` to `profile_commands.rs`:**

```rust
use crate::settings::GlobalSettings;
use tauri::Emitter;
use tokio::time::Duration;

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
```

- [ ] **Step 2: Check if `futures` is already a dependency, add if needed:**

Run:
```
cd src-tauri && cargo tree -p futures 2>&1 | Select-Object -First 3
```

If output shows `futures v0.3.x`, skip this sub-step. Otherwise add to `src-tauri/Cargo.toml`:
```toml
futures = "0.3"
```

In `src-tauri/Cargo.toml`, check if `futures` is already present. If not, add:
```toml
futures = "0.3"
```

- [ ] **Step 3: Register in `lib.rs`**

Add to invoke_handler:
```rust
commands::profile_commands::switch_profile,
```

- [ ] **Step 4: Verify it compiles**

```
cd src-tauri ; cargo build
```

Expected: no errors.

- [ ] **Step 5: Run full Rust test suite**

```
cd src-tauri && cargo test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add src-tauri/src/commands/profile_commands.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat(backend): add switch_profile IPC command with atomic stop/swap/emit"
```

---

## Chunk 3: Frontend Foundation

Files touched:
- Modify: `src/lib/tauri.ts`
- Create: `src/stores/profileManager.ts`
- Create: `src/stores/wishlist.ts`
- Modify: `src/components/wishlist/WishlistPanel.tsx`
- Create: `src/hooks/useProfileSync.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/ActivityBar.tsx`
- Modify: `src/i18n/messages/uk.json`
- Modify: `src/i18n/messages/en.json`

---

### Task 11: Add types and IPC wrappers to `tauri.ts`

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Write tests for IPC wrappers**

Create `src/lib/tauri.profile.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @tauri-apps/api/core before importing from tauri.ts
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { listProfiles, switchProfile, createProfile, deleteProfile, commitImport } from "./tauri";

beforeEach(() => { vi.clearAllMocks(); });

describe("Profile IPC wrappers", () => {
  it("listProfiles calls list_profiles with no args", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    await listProfiles();
    expect(invoke).toHaveBeenCalledWith("list_profiles");
  });

  it("switchProfile calls switch_profile with name arg", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({});
    await switchProfile("Jazz");
    expect(invoke).toHaveBeenCalledWith("switch_profile", { name: "Jazz" });
  });

  it("createProfile calls create_profile with name arg", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ name: "Jazz", streamCount: 0, isActive: false });
    await createProfile("Jazz");
    expect(invoke).toHaveBeenCalledWith("create_profile", { name: "Jazz" });
  });

  it("deleteProfile calls delete_profile with name arg", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await deleteProfile("Jazz");
    expect(invoke).toHaveBeenCalledWith("delete_profile", { name: "Jazz" });
  });

  it("commitImport calls commit_import with profileJson and name", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ name: "Imported", streamCount: 0, isActive: false });
    await commitImport("{}", "Imported");
    expect(invoke).toHaveBeenCalledWith("commit_import", { profileJson: "{}", name: "Imported" });
  });
});
```

- [ ] **Step 2: Run to confirm tests fail (wrappers not yet imported)**

```
pnpm test -- tauri.profile
```

Expected: import errors or "function not found".

- [ ] **Step 3: Add to `src/lib/tauri.ts`** (append at end):

```typescript
// ── Profile types ─────────────────────────────────────────────────────────

export interface ProfileMeta {
  name: string;
  streamCount: number;
  isActive: boolean;
}

export interface ImportPreview {
  profileJson: string;
  suggestedName: string;
  streamCount: number;
  hasConflict: boolean;
}

export interface ProfileChangedPayload {
  profile: Profile;
}

// ── Profile IPC wrappers ──────────────────────────────────────────────────

export async function listProfiles(): Promise<ProfileMeta[]> {
  return invoke("list_profiles");
}
export async function switchProfile(name: string): Promise<Profile> {
  return invoke("switch_profile", { name });
}
export async function createProfile(name: string): Promise<ProfileMeta> {
  return invoke("create_profile", { name });
}
export async function renameProfile(oldName: string, newName: string): Promise<ProfileMeta> {
  return invoke("rename_profile", { oldName, newName });
}
export async function deleteProfile(name: string): Promise<void> {
  return invoke("delete_profile", { name });
}
export async function duplicateProfile(sourceName: string, newName: string): Promise<ProfileMeta> {
  return invoke("duplicate_profile", { sourceName, newName });
}
export async function exportProfile(name: string): Promise<void> {
  return invoke("export_profile", { name });
}
export async function beginImport(): Promise<ImportPreview | null> {
  return invoke("begin_import");
}
export async function commitImport(profileJson: string, name: string): Promise<ProfileMeta> {
  return invoke("commit_import", { profileJson, name });
}
```

> Note: `Profile` is the full type mirroring the Rust struct. Check if it already exists in `tauri.ts`. If not, add it as a separate step below.

- [ ] **Step 3b: If `Profile` interface does not yet exist in `tauri.ts`, add it:**

```typescript
export interface Profile {
  name: string;
  version: number;
  streams: StreamInfo[];
  wishlist: WishlistEntry[];
  ignorelist: string[];
  scheduledRecordings: unknown[];   // full type TBD when scheduler is implemented
  recording: RecordingSettings;
  playerSession: {
    volume: number;
    lastStreamId: string | null;
    lastFilePosition: null | { path: string; positionMs: number };
  };
  activeRecordingUrls: string[];
  postprocess: unknown;             // PostprocessConfig — type TBD
  savedTracks: unknown[];           // SavedTrack[] — type TBD
}
```

> **Check the actual Rust `Profile` struct** in `src-tauri/src/profile.rs` before adding this. Use `unknown` / `unknown[]` for any fields whose TS shape you don't need yet rather than omitting them — missing required fields cause `tsc` errors when the backend sends them.

- [ ] **Step 4: Run test**

```
pnpm test -- tauri.profile
```

Expected: pass.

- [ ] **Step 5: Commit**

```
git add src/lib/tauri.ts src/lib/tauri.profile.test.ts
git commit -m "feat(frontend): add ProfileMeta/ImportPreview types and profile IPC wrappers"
```

---

### Task 12: Create `profileManager` store

**Files:**
- Create: `src/stores/profileManager.ts`

- [ ] **Step 1: Create `src/stores/profileManager.ts`:**

```typescript
import { atom } from "nanostores";
import type { ProfileMeta } from "../lib/tauri";

export const $profileManagerOpen = atom<boolean>(false);
export const $profileList = atom<ProfileMeta[]>([]);
```

- [ ] **Step 2: Write a quick test**

Create `src/stores/profileManager.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { $profileManagerOpen, $profileList } from "./profileManager";

beforeEach(() => {
  $profileManagerOpen.set(false);
  $profileList.set([]);
});

describe("$profileManagerOpen", () => {
  it("defaults to false", () => {
    expect($profileManagerOpen.get()).toBe(false);
  });
  it("can be set to true", () => {
    $profileManagerOpen.set(true);
    expect($profileManagerOpen.get()).toBe(true);
  });
});

describe("$profileList", () => {
  it("defaults to empty", () => {
    expect($profileList.get()).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test**

```
pnpm test -- profileManager
```

Expected: pass.

- [ ] **Step 4: Commit**

```
git add src/stores/profileManager.ts src/stores/profileManager.test.ts
git commit -m "feat(frontend): add profileManager store ($profileManagerOpen, $profileList)"
```

---

### Task 13: Create `wishlist` Nanostore and lift WishlistPanel state

**Files:**
- Create: `src/stores/wishlist.ts`
- Modify: `src/components/wishlist/WishlistPanel.tsx`

- [ ] **Step 1: Create `src/stores/wishlist.ts`:**

```typescript
import { atom } from "nanostores";
import type { WishlistEntry } from "../lib/tauri";

export const $wishlist = atom<WishlistEntry[]>([]);
export const $ignorelist = atom<string[]>([]);
```

- [ ] **Step 2: Write store test** in `src/stores/wishlist.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { $wishlist, $ignorelist } from "./wishlist";
import type { WishlistEntry } from "../lib/tauri";

function entry(pattern: string): WishlistEntry {
  return { pattern, minBitrate: null, format: null, removeAfterRecord: false, addToIgnorelistAfterRecord: false, addedAt: "2026-01-01" };
}

beforeEach(() => {
  $wishlist.set([]);
  $ignorelist.set([]);
});

describe("$wishlist", () => {
  it("defaults to empty", () => { expect($wishlist.get()).toHaveLength(0); });
  it("stores entries", () => {
    $wishlist.set([entry("Jazz")]);
    expect($wishlist.get()[0].pattern).toBe("Jazz");
  });
});

describe("$ignorelist", () => {
  it("defaults to empty", () => { expect($ignorelist.get()).toHaveLength(0); });
});
```

- [ ] **Step 3: Run store tests**

```
pnpm test -- wishlist
```

Expected: pass (store-only tests don't need Tauri).

- [ ] **Step 4: Update `WishlistPanel.tsx`** to read from `$wishlist`/`$ignorelist` stores instead of local `useState`

In `WishlistPanel.tsx`:
1. Remove `const [wishlist, setWishlist] = useState<WishlistEntry[]>([]);` and `const [ignorelist, setIgnorelist] = useState<string[]>([]);`
2. Import stores: `import { useStore } from "@nanostores/react"; import { $wishlist, $ignorelist } from "../../stores/wishlist";`
3. Add: `const wishlist = useStore($wishlist);` and `const ignorelist = useStore($ignorelist);`
4. Replace all `setWishlist(...)` calls with `$wishlist.set(...)` and `setIgnorelist(...)` with `$ignorelist.set(...)`

> **⚠️ Nanostores `atom.set()` does NOT accept updater callbacks.**  
> If `WishlistPanel.tsx` uses patterns like `setWishlist((prev) => [...prev, entry])`, you must rewrite them to read the current value explicitly:
> ```typescript
> // ❌ Wrong — set() does not accept a callback
> $wishlist.set((prev) => [...prev, entry]);
>
> // ✅ Correct — read current value with .get(), then set new value
> $wishlist.set([...$wishlist.get(), entry]);
>
> // Other common patterns:
> $wishlist.set($wishlist.get().filter((e) => e.pattern !== pattern));
> $wishlist.set($wishlist.get().map((e) => e.pattern === old ? updated : e));
> ```
> Check every call site in `WishlistPanel.tsx` and rewrite any updater callbacks.

5. In the `useEffect` that fetches on mount, populate stores instead of local state:
   ```typescript
   useEffect(() => {
     tauri.getWishlist().then((w) => $wishlist.set(w)).catch(console.error);
     tauri.getIgnorelist().then((i) => $ignorelist.set(i)).catch(console.error);
   }, []);
   ```

- [ ] **Step 5: Build to verify no TypeScript errors**

```
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```
git add src/stores/wishlist.ts src/stores/wishlist.test.ts src/components/wishlist/WishlistPanel.tsx
git commit -m "feat(frontend): lift wishlist/ignorelist to Nanostores ($wishlist, $ignorelist)"
```

---

### Task 14: Create `useProfileSync` hook and register in `App.tsx`

**Files:**
- Create: `src/hooks/useProfileSync.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/hooks/useProfileSync.ts`:**

```typescript
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ProfileChangedPayload } from "../lib/tauri";
import * as tauri from "../lib/tauri";
import { $profile } from "../stores/profile";
import { $streams } from "../stores/streams";
import { $settings } from "../stores/settings";
import { $statuses } from "../stores/streams";
import { $wishlist, $ignorelist } from "../stores/wishlist";
import { $recordingSettings } from "../stores/settings";
import { loadSongs } from "../stores/songs";

export function useProfileSync(): void {
  useEffect(() => {
    const unlisten = listen<ProfileChangedPayload>(
      "profile-changed",
      async (event) => {
        const profile = event.payload.profile;

        // Update stores from profile data
        $profile.set({
          name: profile.name,
          recording: profile.recording,
          wishlist: profile.wishlist,
          ignorelist: profile.ignorelist,
        });
        $streams.set(profile.streams);

        // Partial update settings activeProfile
        const currentSettings = $settings.get();
        if (currentSettings) {
          $settings.set({ ...currentSettings, activeProfile: profile.name });
        }

        // Reset all stream statuses to idle
        $statuses.set({});

        // Wishlist + ignorelist — re-fetch from backend (new active profile)
        try {
          const [wl, il] = await Promise.all([
            tauri.getWishlist(),
            tauri.getIgnorelist(),
          ]);
          $wishlist.set(wl);
          $ignorelist.set(il);
        } catch (e) {
          console.error("useProfileSync: failed to refresh wishlist/ignorelist", e);
        }

        // Songs — re-fetch for new profile's outputDir
        loadSongs();

        // RecordingSettings — re-fetch for new profile's recording config
        try {
          const rec = await tauri.getRecordingSettings();
          $recordingSettings.set(rec);
        } catch (e) {
          console.error("useProfileSync: failed to refresh recording settings", e);
        }
      }
    );
    return () => { unlisten.then((fn) => fn()); };
  }, []);
}
```

> **Check `$statuses` import**: find the actual export name in `src/stores/streams.ts`. If it's `$statuses`, use that; if it's a map atom, adjust accordingly.

- [ ] **Step 2: Verify `$statuses` shape in `src/stores/streams.ts`**

```
grep -n "statuses\|StreamStatus" src/stores/streams.ts
```

Adjust the `$statuses.set({})` call to match the actual type (e.g., `Map`, `Record<string, StreamStatus>`, or array).

- [ ] **Step 3: Register hook in `App.tsx`**

In `AppContent` function body (near the other hooks), add:
```typescript
import { useProfileSync } from "./hooks/useProfileSync";
// ...
useProfileSync();
```

- [ ] **Step 4: TypeScript check**

```
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```
git add src/hooks/useProfileSync.ts src/App.tsx
git commit -m "feat(frontend): add useProfileSync hook — updates all stores on profile-changed"
```

---

### Task 15: Add i18n keys

**Files:**
- Modify: `src/i18n/messages/uk.json`
- Modify: `src/i18n/messages/en.json`

> **Do this task BEFORE Task 16** — ActivityBar and all Profile components use `m.profile_*()` keys. Paraglide must generate them first so `tsc --noEmit` passes in Tasks 16+.

- [ ] **Step 1: Add keys to `uk.json`**

Add the following keys (use the same JSON structure as existing keys in that file):

```json
"profile_manager_title": "Управління профілями",
"profile_manager_open": "Управління профілями",
"profile_list_label": "Профілі",
"profile_switch": "Перемкнутися",
"profile_create": "Новий профіль",
"profile_rename": "Перейменувати",
"profile_delete": "Видалити",
"profile_duplicate": "Дублювати",
"profile_export": "Експортувати",
"profile_import": "Імпортувати",
"profile_new_name_label": "Нова назва",
"profile_close": "Закрити",
"profile_delete_confirm": "Видалити профіль \"{name}\"? Ця дія незворотна.",
"profile_switch_confirm": "Є активні записи. Зупинити їх і перейти до \"{name}\"?",
"profile_conflict_error": "Профіль із такою назвою вже існує",
"profile_invalid_name_error": "Недопустима назва профілю",
"profile_stream_count_hint": "{count} потоків",
"profile_active_badge": "активний"
```

- [ ] **Step 2: Add keys to `en.json`**

```json
"profile_manager_title": "Profile Manager",
"profile_manager_open": "Manage profiles",
"profile_list_label": "Profiles",
"profile_switch": "Switch",
"profile_create": "New profile",
"profile_rename": "Rename",
"profile_delete": "Delete",
"profile_duplicate": "Duplicate",
"profile_export": "Export",
"profile_import": "Import",
"profile_new_name_label": "New name",
"profile_close": "Close",
"profile_delete_confirm": "Delete profile \"{name}\"? This cannot be undone.",
"profile_switch_confirm": "Active recordings exist. Stop them and switch to \"{name}\"?",
"profile_conflict_error": "A profile with this name already exists",
"profile_invalid_name_error": "Invalid profile name",
"profile_stream_count_hint": "{count} streams",
"profile_active_badge": "active"
```

- [ ] **Step 3: Run Paraglide to generate new message functions**

This project uses `@inlang/paraglide-vite` — the plugin compiles at Vite build time. Run it manually to regenerate `src/i18n/paraglide/messages.js`:

```
pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/i18n/paraglide
```

If that command doesn't exist, run a quick build cycle instead:
```
pnpm build 2>&1 | Select-Object -Last 10
```

Either way, verify `src/i18n/paraglide/messages.js` contains `profile_manager_title` before proceeding.

> **Note:** `src/i18n/paraglide/` is in `.gitignore` and the files are generated locally. The existing project convention is to generate them locally and commit the `.json` source files only. Future tests that mock the messages module (all profile tests in this plan do this) do not need the generated files to exist. But **`tsc --noEmit` does require them** — the TypeScript compiler resolves `../../i18n/paraglide/messages` to these files.

- [ ] **Step 4: Verify TypeScript sees the new keys**

```
pnpm exec tsc --noEmit
```

Expected: no errors related to `m.profile_*`.

- [ ] **Step 5: Commit**

```
git add src/i18n/messages/uk.json src/i18n/messages/en.json
git commit -m "feat(i18n): add profile manager keys (uk + en)"
```

---

### Task 16: Update `ActivityBar` — profile card → Button with roving focus

**Files:**
- Modify: `src/components/layout/ActivityBar.tsx`

> **Prerequisite:** Task 15 (i18n keys) must be done first — this component uses `m.profile_manager_open()`.

- [ ] **Step 1: Add a test to `ActivityBar.test.tsx`** (the existing test file):

```typescript
// Add this describe block to src/components/layout/ActivityBar.test.tsx

describe("ActivityBar profile button (added in Task 16)", () => {
  it("renders profile area as a button (not a passive div)", () => {
    const { container } = renderBar();
    const allButtons = container.querySelectorAll("button");
    // ActivityBar should have: 5 nav buttons + 1 settings button + 1 profile button = 7
    // Before this task: 6 buttons. After: 7.
    expect(allButtons.length).toBe(7);
    // The last button is the profile button — must have aria-label with profile name
    const profileBtn = allButtons[allButtons.length - 1];
    expect(profileBtn.getAttribute("aria-label")).toMatch(/default/i);
  });

  it("profile button is wired into roving tabindex (reachable by arrow keys)", () => {
    const { container } = renderBar();
    const nav = container.querySelector("nav")!;
    // Navigate down 6 times from the first button to reach the profile button (index 6)
    for (let i = 0; i < 6; i++) {
      fireEvent.keyDown(nav, { key: "ArrowDown" });
    }
    // Profile button (last, index 6) must now be the active roving item
    const allTabIndices = Array.from(
      nav.querySelectorAll<HTMLButtonElement>("button"),
    ).map((b) => b.getAttribute("tabindex"));
    expect(allTabIndices[6]).toBe("0");
    // Verify all other buttons are out of tab order
    allTabIndices.slice(0, 6).forEach((ti) => expect(ti).toBe("-1"));
  });
});
```

> **Why this approach:** The existing `ActivityBar.test.tsx` renders `ActivityBar` without mocking Paraglide (the compiled `messages.js` exists locally). Adding to the existing file keeps the same convention. Adjust the button count (7) if `ActivityBar.tsx` currently renders a different number.

> **Alternative:** If you want to verify the profile button opens `$profileManagerOpen`, use `fireEvent.click(profileBtn)` and assert `$profileManagerOpen.get() === true`.

- [ ] **Step 2: Modify `ActivityBar.tsx`**

**a)** Add import for `$profileManagerOpen`:
```typescript
import { $profileManagerOpen } from "../../stores/profileManager";
```

**b)** Add `profileRef` alongside `settingsRef`:
```typescript
const profileRef = useRef<HTMLButtonElement | null>(null);
```

**c)** Update `allRefs` to include `profileRef` at index 6:
```typescript
const allRefs = useMemo(
  () => [ref0, ref1, ref2, ref3, ref4, settingsRef, profileRef],
  [],
);
```

**d)** Replace the passive `<div>` profile card (lines ~131–142) with a `<Button>`:
```tsx
<Button
  ref={profileRef}
  aria-label={`${m.profile_manager_open()} — ${settings?.activeProfile ?? "Default"}`}
  excludeFromTabOrder={getTabIndex(6) === -1}
  onPress={() => $profileManagerOpen.set(true)}
  className="flex items-center gap-3 w-full min-h-[58px] px-[14px] py-3 rounded-[18px] border border-slate-700/30 bg-white/[.02] text-slate-400 hover:bg-white/[.05] hover:border-slate-600/50 hover:text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText] transition-colors"
>
  <span className="flex items-center justify-center w-[42px] h-[42px] flex-none rounded-[14px] bg-sky-400/[.12] text-sky-200">
    <User size={20} aria-hidden={true} />
  </span>
  <div className="flex flex-col gap-0.5 min-w-0">
    <strong className="text-sm font-bold text-slate-300 truncate leading-tight">{m.profile_name()}</strong>
    <span className="text-xs text-slate-500 truncate">{settings?.activeProfile ?? "Default"}</span>
  </div>
</Button>
```

- [ ] **Step 3: TypeScript check**

```
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
git add src/components/layout/ActivityBar.tsx src/components/layout/ActivityBar.test.tsx
git commit -m "feat(frontend): convert ActivityBar profile card to Button with roving focus"
```

---

## Chunk 4: Frontend UI

Files touched:
- Create: `src/components/profile/ProfileList.tsx`
- Create: `src/components/profile/ProfileActions.tsx`
- Create: `src/components/profile/ProfileManager.tsx`
- Modify: `src/App.tsx` (mount ProfileManager)

---

### Task 17: Create `ProfileList` component

**Files:**
- Create: `src/components/profile/ProfileList.tsx`

- [ ] **Step 1: Write a render test**

Create `src/components/profile/ProfileList.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ProfileList } from "./ProfileList";
import type { ProfileMeta } from "../../lib/tauri";

// Mock i18n — app uses Ukrainian, tests need predictable text
vi.mock("../../i18n/paraglide/messages", () => ({
  profile_list_label: () => "Profiles",
  profile_active_badge: () => "active",
  profile_stream_count_hint: ({ count }: { count: number }) => `${count} streams`,
}));

const profiles: ProfileMeta[] = [
  { name: "Default", streamCount: 2, isActive: true },
  { name: "Jazz", streamCount: 5, isActive: false },
];

describe("ProfileList", () => {
  it("renders all profiles as radio buttons", () => {
    const { getAllByRole } = render(
      <ProfileList
        profiles={profiles}
        selected="Default"
        onSelect={() => {}}
      />
    );
    const radios = getAllByRole("radio");
    expect(radios).toHaveLength(2);
  });

  it("marks the selected profile as checked", () => {
    const { getAllByRole } = render(
      <ProfileList profiles={profiles} selected="Default" onSelect={() => {}} />
    );
    const radios = getAllByRole("radio");
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pnpm test -- ProfileList
```

- [ ] **Step 3: Create `src/components/profile/ProfileList.tsx`:**

```tsx
import { RadioGroup, Radio } from "react-aria-components";
import type { ProfileMeta } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  profiles: ProfileMeta[];
  selected: string;
  onSelect: (name: string) => void;
}

export function ProfileList({ profiles, selected, onSelect }: Props) {
  return (
    <RadioGroup
      aria-label={m.profile_list_label()}
      value={selected}
      onChange={onSelect}
      className="flex flex-col gap-1"
    >
      {profiles.map((p) => (
        <Radio
          key={p.name}
          value={p.name}
          className="flex items-center gap-2 cursor-pointer rounded px-3 py-2 text-slate-200 hover:bg-white/[.06] data-[selected]:bg-sky-600/20 outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <span className="font-medium">{p.name}</span>
          {p.isActive && (
            <span className="text-xs text-sky-400 ml-1">({m.profile_active_badge()})</span>
          )}
          <span className="text-xs text-slate-500 ml-auto">
            {m.profile_stream_count_hint({ count: p.streamCount })}
          </span>
        </Radio>
      ))}
    </RadioGroup>
  );
}
```

- [ ] **Step 4: Run tests**

```
pnpm test -- ProfileList
```

Expected: pass.

- [ ] **Step 5: Commit**

```
git add src/components/profile/ProfileList.tsx src/components/profile/ProfileList.test.tsx
git commit -m "feat(frontend): add ProfileList RadioGroup component"
```

---

### Task 18: Create `ProfileActions` component

**Files:**
- Create: `src/components/profile/ProfileActions.tsx`

- [ ] **Step 1: Write a test**

Create `src/components/profile/ProfileActions.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ProfileActions } from "./ProfileActions";

// Mock i18n — use English strings for predictable test matchers
vi.mock("../../i18n/paraglide/messages", () => ({
  profile_switch: () => "Switch",
  profile_rename: () => "Rename",
  profile_delete: () => "Delete",
  profile_duplicate: () => "Duplicate",
  profile_export: () => "Export",
  profile_import: () => "Import",
  profile_create: () => "New profile",
}));

describe("ProfileActions", () => {
  const noop = vi.fn();
  const baseProps = {
    selected: "Jazz",
    activeProfile: "Default",
    onSwitch: noop, onRename: noop, onDelete: noop,
    onDuplicate: noop, onExport: noop, onImport: noop, onNew: noop,
  };

  it("disables Switch when selected is active", () => {
    const { getByRole } = render(
      <ProfileActions {...baseProps} selected="Default" activeProfile="Default" />
    );
    expect(getByRole("button", { name: /switch/i })).toBeDisabled();
  });

  it("enables Switch when selected is not active", () => {
    const { getByRole } = render(
      <ProfileActions {...baseProps} selected="Jazz" activeProfile="Default" />
    );
    expect(getByRole("button", { name: /switch/i })).not.toBeDisabled();
  });

  it("disables Rename when selected is Default", () => {
    const { getByRole } = render(
      <ProfileActions {...baseProps} selected="Default" activeProfile="Jazz" />
    );
    expect(getByRole("button", { name: /rename/i })).toBeDisabled();
  });

  it("disables Rename when selected is active", () => {
    const { getByRole } = render(
      <ProfileActions {...baseProps} selected="Default" activeProfile="Default" />
    );
    expect(getByRole("button", { name: /rename/i })).toBeDisabled();
  });

  it("disables Delete when selected is Default", () => {
    const { getByRole } = render(
      <ProfileActions {...baseProps} selected="Default" activeProfile="Jazz" />
    );
    expect(getByRole("button", { name: /delete/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
pnpm test -- ProfileActions
```

- [ ] **Step 3: Create `src/components/profile/ProfileActions.tsx`:**

```tsx
import { Button } from "react-aria-components";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  selected: string;
  activeProfile: string;
  onSwitch: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onImport: () => void;
  onNew: () => void;
}

export function ProfileActions({
  selected, activeProfile,
  onSwitch, onRename, onDelete, onDuplicate, onExport, onImport, onNew,
}: Props) {
  const isActive = selected === activeProfile;
  const isDefault = selected === "Default";

  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Profile actions">
      <ActionButton onPress={onSwitch} isDisabled={isActive}>
        {m.profile_switch()}
      </ActionButton>
      <ActionButton onPress={onRename} isDisabled={isDefault || isActive}>
        {m.profile_rename()}
      </ActionButton>
      <ActionButton onPress={onDuplicate}>{m.profile_duplicate()}</ActionButton>
      <ActionButton onPress={onDelete} isDisabled={isDefault || isActive}>
        {m.profile_delete()}
      </ActionButton>
      <ActionButton onPress={onExport}>{m.profile_export()}</ActionButton>
      <ActionButton onPress={onImport}>{m.profile_import()}</ActionButton>
      <ActionButton onPress={onNew}>{m.profile_create()}</ActionButton>
    </div>
  );
}

function ActionButton({
  children,
  onPress,
  isDisabled,
}: {
  children: React.ReactNode;
  onPress: () => void;
  isDisabled?: boolean;
}) {
  return (
    <Button
      onPress={onPress}
      isDisabled={isDisabled}
      className="w-full px-3 py-1.5 text-sm text-left rounded bg-white/[.04] text-slate-300 hover:bg-white/[.08] disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-blue-400 transition-colors forced-colors:text-[ButtonText] forced-colors:disabled:text-[GrayText]"
    >
      {children}
    </Button>
  );
}
```

- [ ] **Step 4: Run tests**

```
pnpm test -- ProfileActions
```

Expected: pass.

- [ ] **Step 5: Commit**

```
git add src/components/profile/ProfileActions.tsx src/components/profile/ProfileActions.test.tsx
git commit -m "feat(frontend): add ProfileActions component with disabled state logic"
```

---

### Task 19: Create `ProfileManager` modal dialog

**Files:**
- Create: `src/components/profile/ProfileManager.tsx`
- Modify: `src/App.tsx`

This is the largest component. It wires together `ProfileList` + `ProfileActions` and handles all sub-dialog flows.

- [ ] **Step 1: Write integration tests**

Create `src/components/profile/ProfileManager.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileManager } from "./ProfileManager";
import { $profileManagerOpen, $profileList } from "../../stores/profileManager";
import { $settings } from "../../stores/settings";
import type { ProfileMeta } from "../../lib/tauri";

// Mock tauri IPC
vi.mock("../../lib/tauri", () => ({
  listProfiles: vi.fn(async () => [
    { name: "Default", streamCount: 2, isActive: true },
    { name: "Jazz", streamCount: 5, isActive: false },
  ] as ProfileMeta[]),
  switchProfile: vi.fn(async () => ({})),
  deleteProfile: vi.fn(async () => {}),
  createProfile: vi.fn(async (name: string) => ({ name, streamCount: 0, isActive: false })),
}));

// Mock i18n — use English strings for predictable test matchers
vi.mock("../../i18n/paraglide/messages", () => ({
  profile_manager_title: () => "Profile Manager",
  profile_close: () => "Close",
  profile_list_label: () => "Profiles",
  profile_active_badge: () => "active",
  profile_stream_count_hint: ({ count }: { count: number }) => `${count} streams`,
  profile_switch: () => "Switch",
  profile_rename: () => "Rename",
  profile_delete: () => "Delete",
  profile_duplicate: () => "Duplicate",
  profile_export: () => "Export",
  profile_import: () => "Import",
  profile_create: () => "New profile",
}));

describe("ProfileManager", () => {
  beforeEach(() => {
    // Set atom state directly — no need to mock useStore
    $profileManagerOpen.set(true);
    $profileList.set([
      { name: "Default", streamCount: 2, isActive: true },
      { name: "Jazz", streamCount: 5, isActive: false },
    ]);
    $settings.set({ activeProfile: "Default" } as Parameters<typeof $settings.set>[0]);
  });

  it("renders the dialog when open", () => {
    render(<ProfileManager />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows both profiles in the list", async () => {
    render(<ProfileManager />);
    await waitFor(() => {
      expect(screen.getByText("Default")).toBeInTheDocument();
      expect(screen.getByText("Jazz")).toBeInTheDocument();
    });
  });

  it("has a close button", () => {
    render(<ProfileManager />);
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
pnpm test -- ProfileManager
```

- [ ] **Step 3: Create `src/components/profile/ProfileManager.tsx`:**

The component manages: profile list loading, selected item, sub-dialog state, and all action handlers. Sub-dialogs (create/rename/duplicate/delete/switch-confirm/import) are inline `Modal + ModalOverlay + Dialog(role=alertdialog)` matching `ConfirmDialog.tsx` pattern.

```tsx
import { useState, useEffect, useRef } from "react";
import { useStore } from "@nanostores/react";
import {
  Modal, ModalOverlay, Dialog, Heading, Button, TextField, Input, Label,
} from "react-aria-components";
import { X } from "lucide-react";
import { $profileManagerOpen, $profileList } from "../../stores/profileManager";
import { $settings } from "../../stores/settings";
import { ProfileList } from "./ProfileList";
import { ProfileActions } from "./ProfileActions";
import { addToast } from "../../stores/toasts";
import * as tauri from "../../lib/tauri";
import type { ImportPreview } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

type SubDialog =
  | null
  | { type: "create" }
  | { type: "rename" }
  | { type: "duplicate" }
  | { type: "delete" }
  | { type: "switch-confirm" }
  | { type: "import"; preview: ImportPreview };

export function ProfileManager() {
  const isOpen = useStore($profileManagerOpen);
  const profiles = useStore($profileList);
  const settings = useStore($settings);
  const activeProfile = settings?.activeProfile ?? "Default";

  const [selected, setSelected] = useState(activeProfile);
  const [subDialog, setSubDialog] = useState<SubDialog>(null);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const liveRef = useRef<HTMLDivElement>(null);

  // Load profile list when dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setSelected(activeProfile);
    tauri.listProfiles()
      .then((list) => $profileList.set(list))
      .catch((e) => addToast(String(e), "error"));
  }, [isOpen, activeProfile]);

  const close = () => {
    $profileManagerOpen.set(false);
    // Focus restoration: after dialog closes, focus returns to the ActivityBar profile button.
    // The dialog's `onOpenChange` → `close()` is called; React Aria Modal will return focus
    // to the previously focused element automatically. If it doesn't (e.g. keyboard dismiss),
    // manually restore: import `profileButtonRef` from ActivityBar and call
    // `profileButtonRef.current?.focus()` here. Verify with NVDA during manual testing.
  };

  const announce = (msg: string) => {
    if (liveRef.current) liveRef.current.textContent = msg;
  };

  const refreshList = async () => {
    const list = await tauri.listProfiles();
    $profileList.set(list);
  };

  const handleError = (e: unknown, fallbackMsg?: string) => {
    const msg = String(e);
    if (msg.startsWith("Conflict:") || msg.startsWith("InvalidName:")) {
      setNameError(msg.replace(/^(Conflict|InvalidName): /, ""));
    } else {
      addToast(fallbackMsg ?? msg, "error");
    }
  };

  // ── Switch ──────────────────────────────────────────────────────────────

  const handleSwitch = async () => {
    // Check for active recordings
    const active = await tauri.getAllStatuses?.() ?? [];
    const hasRecordings = active.some((s) => s.state === "recording");
    if (hasRecordings) {
      setSubDialog({ type: "switch-confirm" });
      return;
    }
    doSwitch();
  };

  const doSwitch = async () => {
    setBusy(true);
    try {
      await tauri.switchProfile(selected);
      await refreshList();
      announce(m.profile_switch() + ": " + selected);
      setSubDialog(null);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  // ── Create ───────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    setNameError(null);
    setBusy(true);
    try {
      const meta = await tauri.createProfile(nameInput.trim());
      await refreshList();
      setSelected(meta.name);
      announce(m.profile_create() + ": " + meta.name);
      setSubDialog(null);
      setNameInput("");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  // ── Rename ───────────────────────────────────────────────────────────────

  const handleRename = async () => {
    setNameError(null);
    setBusy(true);
    try {
      const meta = await tauri.renameProfile(selected, nameInput.trim());
      await refreshList();
      setSelected(meta.name);
      announce(m.profile_rename() + ": " + meta.name);
      setSubDialog(null);
      setNameInput("");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  // ── Duplicate ─────────────────────────────────────────────────────────────

  const handleDuplicate = async () => {
    setNameError(null);
    setBusy(true);
    try {
      const meta = await tauri.duplicateProfile(selected, nameInput.trim());
      await refreshList();
      setSelected(meta.name);
      announce(m.profile_duplicate() + ": " + meta.name);
      setSubDialog(null);
      setNameInput("");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    setBusy(true);
    try {
      await tauri.deleteProfile(selected);
      await refreshList();
      setSelected("Default");
      announce(m.profile_delete() + ": " + selected);
      setSubDialog(null);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  // ── Export ───────────────────────────────────────────────────────────────

  const handleExport = async () => {
    setBusy(true);
    try {
      await tauri.exportProfile(selected);
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  // ── Import ───────────────────────────────────────────────────────────────

  const handleImport = async () => {
    setBusy(true);
    try {
      const preview = await tauri.beginImport();
      if (!preview) return; // user cancelled
      setNameInput(preview.suggestedName);
      setNameError(preview.hasConflict ? m.profile_conflict_error() : null);
      setSubDialog({ type: "import", preview });
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleCommitImport = async () => {
    if (!subDialog || subDialog.type !== "import") return;
    setNameError(null);
    setBusy(true);
    try {
      const meta = await tauri.commitImport(subDialog.preview.profileJson, nameInput.trim());
      await refreshList();
      setSelected(meta.name);
      announce(m.profile_import() + ": " + meta.name);
      setSubDialog(null);
      setNameInput("");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Live region for screen reader announcements */}
      <div ref={liveRef} aria-live="polite" aria-atomic="true" className="sr-only" />

      <ModalOverlay
        className="fixed inset-0 z-40 flex items-start justify-center pt-16 bg-black/60"
        isOpen={isOpen}
        onOpenChange={(open) => { if (!open) close(); }}
      >
        <Modal className="w-[480px] max-h-[70vh] flex flex-col rounded-lg bg-slate-800 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
          <Dialog
            role="dialog"
            aria-label={m.profile_manager_title()}
            className="flex flex-col h-full outline-none p-6 gap-4"
          >
            <div className="flex items-center justify-between">
              <Heading slot="title" className="text-lg font-semibold text-slate-100">
                {m.profile_manager_title()}
              </Heading>
              <Button
                aria-label={m.profile_close()}
                onPress={close}
                className="text-slate-400 hover:text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
              >
                <X size={18} aria-hidden />
              </Button>
            </div>

            <div className="flex gap-4 flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto">
                <ProfileList
                  profiles={profiles}
                  selected={selected}
                  onSelect={setSelected}
                />
              </div>
              <ProfileActions
                selected={selected}
                activeProfile={activeProfile}
                onSwitch={handleSwitch}
                onRename={() => { setNameInput(selected); setNameError(null); setSubDialog({ type: "rename" }); }}
                onDelete={() => setSubDialog({ type: "delete" })}
                onDuplicate={() => { setNameInput(""); setNameError(null); setSubDialog({ type: "duplicate" }); }}
                onExport={handleExport}
                onImport={handleImport}
                onNew={() => { setNameInput(""); setNameError(null); setSubDialog({ type: "create" }); }}
              />
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>

      {/* Sub-dialogs */}

      {/* Name input dialog (create / rename / duplicate / import) */}
      {(subDialog?.type === "create" || subDialog?.type === "rename" ||
        subDialog?.type === "duplicate" || subDialog?.type === "import") && (
        <ModalOverlay
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          isOpen
          onOpenChange={(open) => { if (!open) { setSubDialog(null); setNameInput(""); } }}
        >
          <Modal className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none">
            <Dialog role="alertdialog" className="outline-none flex flex-col gap-4">
              <Heading slot="title" className="text-base font-semibold text-slate-100">
                {subDialog.type === "create" && m.profile_create()}
                {subDialog.type === "rename" && m.profile_rename()}
                {subDialog.type === "duplicate" && m.profile_duplicate()}
                {subDialog.type === "import" && m.profile_import()}
              </Heading>
              <TextField
                autoFocus
                value={nameInput}
                onChange={(v) => { setNameInput(v); setNameError(null); }}
                isInvalid={!!nameError}
                className="flex flex-col gap-1"
              >
                <Label className="text-sm text-slate-300">{m.profile_new_name_label()}</Label>
                <Input className="rounded bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
                {nameError && (
                  <span role="alert" className="text-xs text-red-400">{nameError}</span>
                )}
              </TextField>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setSubDialog(null); setNameInput(""); }}
                  className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
                >
                  {m.cancel?.() ?? "Cancel"}
                </button>
                <button
                  onClick={() => {
                    if (subDialog.type === "create") handleCreate();
                    else if (subDialog.type === "rename") handleRename();
                    else if (subDialog.type === "duplicate") handleDuplicate();
                    else if (subDialog.type === "import") handleCommitImport();
                  }}
                  disabled={busy || !nameInput.trim()}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  OK
                </button>
              </div>
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}

      {/* Delete confirm */}
      {subDialog?.type === "delete" && (
        <ModalOverlay
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          isOpen
          onOpenChange={(open) => { if (!open) setSubDialog(null); }}
        >
          <Modal className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none">
            <Dialog role="alertdialog" className="outline-none">
              <Heading slot="title" className="text-base font-semibold text-slate-100 mb-3">
                {m.profile_delete()}
              </Heading>
              <p className="text-sm text-slate-400 mb-6">
                {m.profile_delete_confirm({ name: selected })}
              </p>
              <div className="flex justify-end gap-2">
                <button autoFocus onClick={() => setSubDialog(null)}
                  className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700">
                  {m.cancel?.() ?? "Cancel"}
                </button>
                <button onClick={handleDelete} disabled={busy}
                  className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50">
                  {m.profile_delete()}
                </button>
              </div>
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}

      {/* Switch confirm (active recordings) */}
      {subDialog?.type === "switch-confirm" && (
        <ModalOverlay
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          isOpen
          onOpenChange={(open) => { if (!open) setSubDialog(null); }}
        >
          <Modal className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none">
            <Dialog role="alertdialog" className="outline-none">
              <Heading slot="title" className="text-base font-semibold text-slate-100 mb-3">
                {m.profile_switch()}
              </Heading>
              <p className="text-sm text-slate-400 mb-6">
                {m.profile_switch_confirm({ name: selected })}
              </p>
              <div className="flex justify-end gap-2">
                <button autoFocus onClick={() => setSubDialog(null)}
                  className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700">
                  {m.cancel?.() ?? "Cancel"}
                </button>
                <button onClick={doSwitch} disabled={busy}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                  {m.profile_switch()}
                </button>
              </div>
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run tests**

```
pnpm test -- ProfileManager
```

Expected: core tests pass. Fix any TypeScript or import issues found.

- [ ] **Step 5: Mount `ProfileManager` in `App.tsx`**

In `App.tsx` `AppContent` function, after `<SettingsDialog />`:

```tsx
import { ProfileManager } from "./components/profile/ProfileManager";
// ...
<ProfileManager />
```

- [ ] **Step 6: TypeScript check**

```
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run full frontend test suite**

```
pnpm test
```

Expected: all tests pass (or pre-existing failures only).

- [ ] **Step 8: Commit**

```
git add src/components/profile/ProfileManager.tsx src/components/profile/ProfileManager.test.tsx src/App.tsx
git commit -m "feat(frontend): add ProfileManager modal dialog with all sub-dialogs"
```

---

### Task 20: Final integration verification

- [ ] **Step 1: Build the app**

```
just build-fast
```

Expected: build succeeds with no errors.

- [ ] **Step 2: Run full test suite**

```
pnpm test
cd src-tauri ; cargo test
```

Expected: all tests pass.

- [ ] **Step 3: Manual smoke test checklist**

Launch `src-tauri/target/release-fast/tapir.exe` and verify:

**Navigation & accessibility:**
- [ ] ActivityBar profile card is now a focusable button (Tab/arrow reaches it)
- [ ] NVDA announces button with accessible name (e.g. "Manage profiles — Default")
- [ ] Clicking/pressing Enter on profile card opens Profile Manager dialog
- [ ] NVDA announces dialog title "Управління профілями" when it opens
- [ ] Escape closes ProfileManager dialog; focus returns to profile button in ActivityBar
- [ ] All buttons in the dialog are reachable by Tab and announced by NVDA
- [ ] Sub-dialogs (delete confirm, switch confirm) announced as alerts by NVDA

**Profile list:**
- [ ] Profile list shows "Default" first, then others alphabetically
- [ ] "Default" profile has the active badge (NVDA reads it)
- [ ] Switch button is disabled for active profile; enabled for others
- [ ] Rename/Delete disabled for Default profile and active profile

**CRUD operations:**
- [ ] Create new profile → name validation rejects: empty, >64 chars, forbidden chars, "Default"
- [ ] Create new profile → appears in list after creation
- [ ] Rename → profile appears with new name
- [ ] Delete → confirm dialog shown; profile removed after confirm
- [ ] Duplicate → new profile appears with same stream count

**Export / Import:**
- [ ] Export → save dialog opens; exported JSON file has no passwords/credentials
- [ ] Import → open dialog appears; preview shown with editable name; import succeeds

**Switch and store sync:**
- [ ] Switch with no active recordings → switches immediately; ActivityBar shows new profile name
- [ ] Switch with active recordings → confirm dialog appears; cancelling leaves active profile unchanged
- [ ] After switch → `$streams` list updates to new profile's streams
- [ ] After switch → `$settings.activeProfile` updates
- [ ] After switch → wishlist and ignorelist update to new profile's values
- [ ] After switch → active playback stops (no orphaned audio)
- [ ] After switch → `$statuses` resets (no stale recording states)

- [ ] **Step 4: Commit final state**

```
git add -A
git commit -m "feat: Phase 3F Profile Manager — complete implementation"
```

---

## Implementation Notes

### `$statuses` reset shape
Check `src/stores/streams.ts` for the exact type of `$statuses`. It may be `atom<Record<string, StreamStatus>>` or similar. Adjust `$statuses.set({})` in `useProfileSync` accordingly.

### `tauri.getAllStatuses`
Used in `ProfileManager.handleSwitch()` to detect active recordings. This already exists as `getAllStatuses()` in `tauri.ts`. Import and use it.

### `futures` crate availability
Run `cargo tree -p futures` in `src-tauri/` to check if `futures` is already a transitive dependency. If it is, adding it to `Cargo.toml` makes it explicit (preferred). If not, use `tokio::join!` or `futures::future::join_all`.

### Paraglide i18n compilation
If `m.profile_*` keys show TypeScript errors, run the Paraglide compiler first. Check `package.json` for a script like `paraglide:compile` or `i18n:build`. Paraglide may compile on `pnpm dev` automatically.

### Sub-dialog `m.cancel()` key
Check if `cancel` key exists in i18n files. It's used by existing components like `ConfirmDialog.tsx`. If it exists, use `m.cancel()`. If not, use the literal string or add the key.
