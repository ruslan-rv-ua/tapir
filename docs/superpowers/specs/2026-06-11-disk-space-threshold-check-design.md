# Disk Space Threshold Check — Design Spec

**Date:** 2026-06-11  
**Branch:** `feature/disk-space-threshold-check`  
**Phase:** 3 (polish/guard)

---

## Problem

`GlobalSettings.disk_space_threshold_gb` is stored and exposed to the UI, but it is never
checked before a recording starts. A user can unknowingly launch recordings onto a nearly-full
disk, and Tapir only warns visually (status bar / FreeSpaceMetric), never blocks the action.

---

## Goal

Add a single backend guard that returns a user-visible error when the output volume's free
space is below the configured threshold, before any recording task is spawned.

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
into `portable.rs` as `pub(crate)`. The function calls `GetDiskFreeSpaceExW` via
`nearest_existing_dir`; both helpers belong together.

Add a unit test:

```rust
#[test]
fn free_bytes_on_volume_returns_nonzero() {
    let tmp = std::env::temp_dir();
    let bytes = free_bytes_on_volume(&tmp).expect("should succeed");
    assert!(bytes > 0);
}
```

### 2. `src-tauri/src/commands/settings_commands.rs`

Replace the now-moved body of `free_bytes_on_volume` with a one-line delegation to
`portable::free_bytes_on_volume`, or inline the call into `get_free_space()` directly:

```rust
pub async fn get_free_space(state: ...) -> Result<u64, String> {
    let dir = { ... };
    tokio::task::spawn_blocking(move || portable::free_bytes_on_volume(&dir))
        .await.map_err(|e| e.to_string())?
}
```

No behaviour change.

### 3. `src-tauri/src/commands/stream_commands.rs`

New private async helper:

```rust
async fn check_disk_space(state: &AppState) -> Result<(), RadioError> {
    let (threshold_gb, output_dir) = {
        let settings = state.settings.read().await;
        let profile  = state.active_profile.read().await;
        let dir      = portable::resolve_output_dir(&profile.recording.output_dir);
        (settings.disk_space_threshold_gb, dir)
    };

    if threshold_gb == 0 {
        return Ok(()); // disabled
    }

    let free_bytes = match tokio::task::spawn_blocking(
        move || portable::free_bytes_on_volume(&output_dir)
    ).await {
        Ok(Ok(n))  => n,
        Ok(Err(e)) => { log::warn!("Disk space check failed: {e}"); return Ok(()); }
        Err(e)     => { log::warn!("Disk space check failed: {e}"); return Ok(()); }
    };

    let threshold_bytes = (threshold_gb as u64) * 1_073_741_824;
    if free_bytes < threshold_bytes {
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
and allow recording to proceed. Blocking on measurement failure would be more disruptive than
recording on a disk that might be full.

Insert the guard as the **first** action in both recording commands:

```rust
pub async fn start_recording(...) -> Result<(), String> {
    check_disk_space(&state).await.map_err(|e| e.to_string())?;
    // ... existing logic ...
}

pub async fn start_all_recordings(...) -> Result<usize, String> {
    check_disk_space(&state).await.map_err(|e| e.to_string())?;
    // ... existing logic ...
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
| N > 0 | Block recording if free bytes < N × 2³⁰ |

---

## Testing

### Automated
- `portable.rs` unit test: `free_bytes_on_volume` on `temp_dir()` → returns > 0.
- Existing `cargo test` suite must continue to pass.

### Manual
1. Set **Disk Space Threshold** to a value larger than the available free space on the output
   volume.
2. Try to start a recording → expect an error toast with "Not enough disk space: free X GB,
   required Y GB".
3. Set threshold back to 0 → recording starts normally.

---

## Files Changed

| File | Change |
|------|--------|
| `src-tauri/src/portable.rs` | Add `free_bytes_on_volume` + unit test |
| `src-tauri/src/commands/settings_commands.rs` | Remove local `free_bytes_on_volume`, delegate to `portable` |
| `src-tauri/src/commands/stream_commands.rs` | Add `check_disk_space`, call from `start_recording` and `start_all_recordings` |

---

## Out of Scope

- Monitoring disk space **during** an active recording (stop mid-flight when space runs out).
- Frontend i18n for the error string (backend message is English, surfaced raw to toast).
- Cross-platform (Linux/macOS) disk space API — Tapir is Windows-only.
