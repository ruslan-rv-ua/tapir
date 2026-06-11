# Disk Space Threshold Check Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block `start_recording` / `start_all_recordings` when free disk space is below `disk_space_threshold_gb`, and fix the pre-existing bug where recordings always land in `data/recordings/` regardless of the user-configured output directory.

**Architecture:** `free_bytes_on_volume` moves to `portable.rs` (alongside `nearest_existing_dir` that it needs); a pure `below_threshold` helper and an async `check_disk_space` guard are added to `stream_commands.rs`; both recording command handlers call the guard before spawning work; manager.rs is fixed with a one-line change.

**Tech Stack:** Rust 2024 edition, Tauri v2, Windows WinAPI (`GetDiskFreeSpaceExW`), `tokio::task::spawn_blocking`.

---

## Chunk 1: All Changes

### Task 1: Move `free_bytes_on_volume` to `portable.rs`

**Why:** The function is currently private to `settings_commands.rs`. Moving it to `portable.rs` (where `nearest_existing_dir`, its only dependency, already lives) makes it `pub(crate)` accessible to both `settings_commands.rs` and the new guard in `stream_commands.rs`.

**Files:**
- Modify: `src-tauri/src/portable.rs` — add function after line 69; add test inside existing `mod tests` block (after line 103)
- Modify: `src-tauri/src/commands/settings_commands.rs` — remove local function (lines 70–97), update `get_free_space` call site (line 105)

---

- [ ] **Step 1.1: Add the failing test to `portable.rs`**

Open `src-tauri/src/portable.rs`. Inside the **existing** `mod tests` block (currently lines 71–104), add this test **after** the last existing test (`nearest_existing_dir_climbs_to_existing_ancestor`), before the closing `}`:

```rust
    #[test]
    fn free_bytes_on_volume_returns_nonzero() {
        let bytes = free_bytes_on_volume(&std::env::temp_dir()).expect("should succeed");
        assert!(bytes > 0);
    }
```

- [ ] **Step 1.2: Run tests to confirm compile error**

```
cd src-tauri && cargo test --lib portable
```

Expected: compile error — `cannot find function free_bytes_on_volume in this scope`.

- [ ] **Step 1.3: Add `free_bytes_on_volume` to `portable.rs`**

In `src-tauri/src/portable.rs`, add the following function **after** `ensure_data_dirs` (after line 69), before the `#[cfg(test)]` block:

```rust
/// Free bytes available to the caller on the volume hosting `dir`.
/// Climbs to the nearest existing ancestor so a not-yet-created output dir
/// still reports its volume.
pub(crate) fn free_bytes_on_volume(dir: &Path) -> Result<u64, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    use windows::core::PCWSTR;

    let base = nearest_existing_dir(dir)
        .ok_or_else(|| "no existing ancestor directory".to_string())?;
    let wide: Vec<u16> = base
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut free_to_caller: u64 = 0;
    unsafe {
        GetDiskFreeSpaceExW(
            PCWSTR(wide.as_ptr()),
            Some(&mut free_to_caller as *mut u64),
            None,
            None,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(free_to_caller)
}
```

- [ ] **Step 1.4: Run tests to confirm the new test passes**

```
cd src-tauri && cargo test --lib portable
```

Expected: all 5 `portable` tests pass, including `free_bytes_on_volume_returns_nonzero`.

- [ ] **Step 1.5: Update `settings_commands.rs`**

Open `src-tauri/src/commands/settings_commands.rs`.

**Remove** the entire `free_bytes_on_volume` local function — that is, lines 70–97:
```rust
/// Free bytes available to the caller on the volume hosting `dir`.
/// Climbs to the nearest existing ancestor so a not-yet-created output dir
/// still reports its volume.
fn free_bytes_on_volume(dir: &std::path::Path) -> Result<u64, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    use windows::core::PCWSTR;

    let base = crate::portable::nearest_existing_dir(dir)
        .ok_or_else(|| "no existing ancestor directory".to_string())?;
    let wide: Vec<u16> = base
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut free_to_caller: u64 = 0;
    unsafe {
        GetDiskFreeSpaceExW(
            PCWSTR(wide.as_ptr()),
            Some(&mut free_to_caller as *mut u64),
            None,
            None,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(free_to_caller)
}
```

**Update** the `spawn_blocking` call inside `get_free_space` — change `free_bytes_on_volume(&dir)` to `crate::portable::free_bytes_on_volume(&dir)`:

Old (line 105 after deletion shifts):
```rust
    tokio::task::spawn_blocking(move || free_bytes_on_volume(&dir))
```
New:
```rust
    tokio::task::spawn_blocking(move || crate::portable::free_bytes_on_volume(&dir))
```

- [ ] **Step 1.6: Run full Rust test suite**

```
cd src-tauri && cargo test
```

Expected: all tests pass (previous count + 1 new test).

- [ ] **Step 1.7: Commit**

```
git add src-tauri/src/portable.rs src-tauri/src/commands/settings_commands.rs
git commit -m "refactor: move free_bytes_on_volume to portable.rs

The function only depends on nearest_existing_dir which already lives in
portable.rs. Moving it there makes it pub(crate) accessible to other
command modules without cross-module reaching.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Fix `manager.rs` — use the configured output directory

**Why:** `recording_task` always calls `portable::recordings_dir()` (returns `data/recordings/` unconditionally), ignoring `recording_settings.output_dir`. This is a one-line fix that makes the actual write path consistent with `get_free_space` and the upcoming disk-space guard.

**Files:**
- Modify: `src-tauri/src/stream/manager.rs:672`

---

- [ ] **Step 2.1: Change line 672 in `manager.rs`**

In `src-tauri/src/stream/manager.rs`, find line 672:

```rust
        let output_dir = portable::recordings_dir();
```

Change it to:

```rust
        let output_dir = portable::resolve_output_dir(&recording_settings.output_dir);
```

Context for finding the right line — it sits just below this comment:
```rust
        // --- Set up recorder ---
```

- [ ] **Step 2.2: Run full Rust test suite**

```
cd src-tauri && cargo test
```

Expected: all tests pass. The default `output_dir = "recordings"` resolves to the same path as `recordings_dir()`, so no behaviour change for existing users.

- [ ] **Step 2.3: Commit**

```
git add src-tauri/src/stream/manager.rs
git commit -m "fix: recording_task respects configured output_dir

Previously recordings always landed in data/recordings/ regardless of
what the user set in Recording Settings. resolve_output_dir("recordings")
returns the same path for the default, so existing installs are unaffected.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Add disk space guard to `stream_commands.rs`

**Why:** Both `start_recording` and `start_all_recordings` need to refuse early when the configured threshold is exceeded. A pure `below_threshold` helper keeps the comparison logic testable without needing a live AppState. An async `check_disk_space` reads settings and profile sequentially (one lock at a time, matching the rest of the file's style).

**Files:**
- Modify: `src-tauri/src/commands/stream_commands.rs`

---

- [ ] **Step 3.1: Add failing `below_threshold` tests**

Open `src-tauri/src/commands/stream_commands.rs`. Find the **existing** `mod tests` block (starts at line 291). Add three tests at the end, **before** the closing `}` of `mod tests` (currently line 334):

```rust
    #[test]
    fn threshold_zero_is_disabled() {
        assert!(!below_threshold(0, 0));
        assert!(!below_threshold(100, 0));
    }

    #[test]
    fn exact_threshold_is_allowed() {
        assert!(!below_threshold(1_073_741_824, 1)); // free == threshold → allowed
    }

    #[test]
    fn one_byte_under_threshold_blocks() {
        assert!(below_threshold(1_073_741_823, 1)); // one byte short → blocked
    }
```

Note: the existing `mod tests` block already has `use super::*;` on line 293, which will cover `below_threshold` once it exists. No additional `use` line needed.

- [ ] **Step 3.2: Run tests to confirm compile error**

```
cd src-tauri && cargo test --lib commands::stream_commands
```

Expected: compile error — `cannot find function below_threshold in this scope`.

- [ ] **Step 3.3: Add `use log::warn;` and `use crate::portable;` imports**

At the top of `src-tauri/src/commands/stream_commands.rs`, the current imports are:

```rust
use crate::app_state::AppState;
use crate::errors::RadioError;
use crate::profile::{Profile, StreamInfo};
use crate::stream::manager::{StreamState, StreamStatus};
use crate::stream::playlist;
```

Add two new lines:

```rust
use crate::app_state::AppState;
use crate::errors::RadioError;
use crate::portable;
use crate::profile::{Profile, StreamInfo};
use crate::stream::manager::{StreamState, StreamStatus};
use crate::stream::playlist;
use log::warn;
```

- [ ] **Step 3.4: Add `below_threshold` function**

After the `move_blocked_by_state` function (after line 37, before the first `#[tauri::command]`), add:

```rust
fn below_threshold(free_bytes: u64, threshold_gb: u32) -> bool {
    // cast to u64 first — u32::MAX × 1 GiB < u64::MAX, no overflow
    threshold_gb > 0 && free_bytes < (threshold_gb as u64) * 1_073_741_824
}
```

- [ ] **Step 3.5: Run tests to confirm `below_threshold` tests pass**

```
cd src-tauri && cargo test --lib commands::stream_commands
```

Expected: all 6 tests in `stream_commands` pass (3 existing + 3 new).

- [ ] **Step 3.6: Add `check_disk_space` async helper**

Add this function after `below_threshold` (still before the first `#[tauri::command]`):

```rust
async fn check_disk_space(state: &AppState) -> Result<(), RadioError> {
    let threshold_gb = state.settings.read().await.disk_space_threshold_gb;
    if threshold_gb == 0 {
        return Ok(()); // disabled — skip the profile lock entirely
    }

    let output_dir = {
        let profile = state.active_profile.read().await;
        portable::resolve_output_dir(&profile.recording.output_dir)
    };

    let free_bytes = match tokio::task::spawn_blocking(
        move || portable::free_bytes_on_volume(&output_dir)
    ).await {
        Ok(Ok(n))  => n,
        Ok(Err(e)) => { warn!("Disk space check failed: {e}"); return Ok(()); }
        Err(e)     => { warn!("Disk space check failed: {e}"); return Ok(()); }
    };

    if below_threshold(free_bytes, threshold_gb) {
        return Err(RadioError::Other(format!(
            "Not enough disk space: free {:.1} GB, required {} GB",
            free_bytes as f64 / 1_073_741_824.0,
            threshold_gb,
        )));
    }
    Ok(())
}
```

- [ ] **Step 3.7: Guard `start_recording`**

In `start_recording` (search for `pub async fn start_recording`), add the guard as the **very first** statement inside the function body. The function currently opens with:

```rust
pub async fn start_recording(
    stream_id: String,
    state: tauri::State<'_, AppState>,
    _app: tauri::AppHandle,
) -> Result<(), String> {
    let stream = {
```

Insert before `let stream = {`:

```rust
    check_disk_space(&state).await.map_err(|e| e.to_string())?;
```

- [ ] **Step 3.8: Guard `start_all_recordings`**

In `start_all_recordings` (search for `pub async fn start_all_recordings`), add the guard as the **very first** statement. The function currently opens with:

```rust
pub async fn start_all_recordings(state: tauri::State<'_, AppState>) -> Result<usize, String> {
    let (streams, settings) = {
```

Insert before `let (streams, settings) = {`:

```rust
    check_disk_space(&state).await.map_err(|e| e.to_string())?;
```

- [ ] **Step 3.9: Compile check**

```
cd src-tauri && cargo check
```

Expected: no errors, no warnings about unused imports.

- [ ] **Step 3.10: Run full Rust test suite**

```
cd src-tauri && cargo test
```

Expected: all tests pass. Note the new total count (previous + 3 new `below_threshold` tests).

- [ ] **Step 3.11: Commit**

```
git add src-tauri/src/commands/stream_commands.rs
git commit -m "feat: check disk space before starting recording

Guard both start_recording and start_all_recordings with check_disk_space.
Returns an error (surfaced to the user as an error toast) when free space
on the output volume is below disk_space_threshold_gb. threshold=0 disables
the check. Measurement failures are logged at warn and do not block recording
(fail-open).

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Final Verification Checklist

- [ ] `cd src-tauri && cargo test` — all tests pass
- [ ] Manual — `start_recording` guard: set Disk Space Threshold (General Settings) to a value larger than current free space → click record on a single stream → error toast appears: "Not enough disk space: free X.X GB, required Y GB", recording does not start
- [ ] Manual — `start_all_recordings` guard: with threshold still above free space → use "Start All" → same error toast, no streams start recording
- [ ] Manual — disable check: set threshold to 0 → recording starts normally for both single and all-start
- [ ] Manual — output_dir fix: set a custom absolute output directory (e.g. `D:\TestRecordings`) in Recording Settings → start a recording → verify the audio file is created in `D:\TestRecordings\`, **not** in `data\recordings\`
