# Disk Space Threshold Check — Design Spec

**Date:** 2026-06-11  
**Branch:** `feature/disk-space-threshold-check`  
**Phase:** 3 (polish/guard)

---

## Problem

`GlobalSettings.disk_space_threshold_gb` is stored and exposed to the UI, but it is never
checked before a recording starts. A user can unknowingly launch recordings onto a nearly-full
disk, and Tapir only warns visually (status bar / FreeSpaceMetric), never blocks the action.

A related pre-existing bug: `manager.rs` always writes recordings to `portable::recordings_dir()`
(i.e., `data/recordings/`), ignoring `RecordingSettings.output_dir`. This means a custom
output directory set in the UI has no effect, and the free-space UI metric can show the wrong
volume. Both issues are fixed together in this PR.

---

## Goal

1. Enforce the disk-space threshold before any recording task is spawned.
2. Fix the manager to actually use `profile.recording.output_dir` when choosing where to write recordings.

---

## Approach

**Command-layer check, disk utility in `portable.rs`.**

All business logic lives in the Tauri command handlers in `stream_commands.rs`. The low-level
WinAPI helper moves to `portable.rs` (where `nearest_existing_dir` already resides), making
it accessible without cross-module reach into `settings_commands.rs`.

---

## Changes

### 1. `src-tauri/src/portable.rs`

Move `free_bytes_on_volume(dir: &Path) -> Result<u64, String>` from `settings_commands.rs`
into `portable.rs` as `pub(crate)`. The function calls `GetDiskFreeSpaceExW` (via
`nearest_existing_dir` to support not-yet-created output dirs); both helpers belong together.

See §Testing for the test to add inside the **existing** `mod tests` block.

### 2. `src-tauri/src/commands/settings_commands.rs`

Remove the local `free_bytes_on_volume` function entirely. Inline the call in `get_free_space`:

```rust
pub async fn get_free_space(state: tauri::State<'_, AppState>) -> Result<u64, String> {
    let dir = {
        let profile = state.active_profile.read().await;
        crate::portable::resolve_output_dir(&profile.recording.output_dir)
    };
    tokio::task::spawn_blocking(move || crate::portable::free_bytes_on_volume(&dir))
        .await
        .map_err(|e| e.to_string())?
}
```

No behaviour change for this command.

### 3. `src-tauri/src/stream/manager.rs`

Fix the pre-existing bug: `recording_task` ignores `recording_settings.output_dir`.

Change line 672 from:

```rust
let output_dir = portable::recordings_dir();
```

to:

```rust
let output_dir = portable::resolve_output_dir(&recording_settings.output_dir);
```

This makes the actual write path consistent with `get_free_space` and the new disk-space
guard. For the default setting (`output_dir = "recordings"`), `resolve_output_dir` returns
the same `data/recordings/` path as before — no change for existing users.

### 4. `src-tauri/src/commands/stream_commands.rs`

Add `use crate::portable;` to imports.

Add a pure helper for the threshold comparison (testable in isolation):

```rust
fn below_threshold(free_bytes: u64, threshold_gb: u32) -> bool {
    // cast to u64 first — u32::MAX × 1 GiB < u64::MAX, no overflow
    threshold_gb > 0 && free_bytes < (threshold_gb as u64) * 1_073_741_824
}
```

New private async guard (locks acquired sequentially, matching the style of the rest of the file):

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
        Ok(Err(e)) => { log::warn!("Disk space check failed: {e}"); return Ok(()); }
        Err(e)     => { log::warn!("Disk space check failed: {e}"); return Ok(()); }
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

**Fail-open policy:** if the WinAPI call fails (unmapped drive, permission issue), log a warning
and allow recording to proceed. A measurement failure is more likely an environment quirk than
an actual full-disk condition.

Insert the guard as the **first** action in both recording commands:

```rust
pub async fn start_recording(...) -> Result<(), String> {
    check_disk_space(&state).await.map_err(|e| e.to_string())?;
    // ... existing logic unchanged ...
}

pub async fn start_all_recordings(...) -> Result<usize, String> {
    check_disk_space(&state).await.map_err(|e| e.to_string())?;
    // ... existing logic unchanged ...
}
```

`start_all_recordings` performs **one** measurement before the loop — all streams share the
same output volume, so per-stream checks would be redundant.

---

## Error Message

```
Not enough disk space: free 0.4 GB, required 1 GB
```

The frontend already surfaces backend errors from `startRecording` as error toasts
(`addToast(String(err), "error")`). No frontend changes needed.

---

## Threshold Semantics

| `disk_space_threshold_gb` | Behaviour |
|---|---|
| 0 | Check disabled (existing UI description: "0 = вимкнено") |
| N > 0 | Block recording if free bytes < N × 2³⁰ (equality allowed — free == threshold is OK) |

All arithmetic uses binary gibibytes (1 GiB = 2³⁰ = 1,073,741,824 bytes), consistent with
how Windows and most desktop software report storage. The field name `_gb` follows the same
common-but-technically-imprecise convention.

---

## Testing

### Automated

**`portable.rs`:** add to the **existing** `mod tests` block (do not create a new one):
```rust
#[test]
fn free_bytes_on_volume_returns_nonzero() {
    let bytes = free_bytes_on_volume(&std::env::temp_dir()).expect("should succeed");
    assert!(bytes > 0);
}
```

**`stream_commands.rs` — threshold comparison boundaries:** add to the **existing** `mod tests` block:
```rust
use super::below_threshold;

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

Existing `cargo test` suite must continue to pass without changes.

### Manual
1. Set **Disk Space Threshold** to a value larger than the available free space on the output
   volume.
2. Try to start a recording → expect an error toast: "Not enough disk space: free X GB, required Y GB".
3. Set threshold back to 0 → recording starts normally.

---

## Files Changed

| File | Change |
|------|--------|
| `src-tauri/src/portable.rs` | Add `free_bytes_on_volume` + unit test |
| `src-tauri/src/commands/settings_commands.rs` | Remove local `free_bytes_on_volume`, inline call in `get_free_space` |
| `src-tauri/src/stream/manager.rs` | Fix: use `resolve_output_dir` instead of `recordings_dir()` in `recording_task` |
| `src-tauri/src/commands/stream_commands.rs` | Add `portable` import, `below_threshold` helper + tests, `check_disk_space`, call from `start_recording` and `start_all_recordings` |

---

## Out of Scope

- Monitoring disk space **during** an active recording (stop mid-flight when space runs out).
- Frontend i18n for the error string (backend message is English, surfaced raw to toast).
- Cross-platform (Linux/macOS) disk space API — Tapir is Windows-only.
