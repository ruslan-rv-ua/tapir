# Design: Wake Lock — Prevent Windows Sleep During Playback and Recording

**Date:** 2026-06-10  
**Branch:** `feature/wake-lock-prevent-sleep`  
**Status:** Approved

---

## Problem

When Tapir is recording a radio stream or playing audio, Windows can put the computer to sleep, interrupting both operations. Users (including screen reader users who rely on audio feedback) expect the system to remain awake while Tapir is actively working.

---

## Requirements

- Prevent Windows system sleep while:
  - Audio is being **played** (state `Playing`)
  - A stream is **recording** (state `Recording`, `Connecting`, or `Reconnecting`)
- Allow Windows to sleep when:
  - Playback is **paused** or **stopped**
  - **No** recordings are active
- Do **not** prevent the display from turning off (only system sleep is blocked)
- **Fully automatic** — no user-facing settings or toggle
- Windows-only (Tapir is Windows-only by design)

---

## Architecture

### Win32 API

Uses [`SetThreadExecutionState`](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-setthreadexecutionstate) from `Win32_System_Power`:

| Call | Effect |
|------|--------|
| `SetThreadExecutionState(ES_CONTINUOUS \| ES_SYSTEM_REQUIRED)` | Prevent system sleep |
| `SetThreadExecutionState(ES_CONTINUOUS)` | Release the lock, allow sleep |

### New module: `wake_lock.rs`

A thread-safe, zero-cost guard around the Win32 call:

```rust
pub struct WakeLock {
    active: AtomicBool,
}

impl WakeLock {
    pub fn new() -> Self
    pub fn set(&self, prevent_sleep: bool)  // idempotent, logs changes
}
```

- `set()` is **idempotent**: no-op if the requested state matches the current state.
- If `SetThreadExecutionState` returns 0 (failure), logs `warn!` but does not panic.
- Stored in `AppState` as `Arc<WakeLock>`.

### Helper: `sync_wake_lock(app: &AppHandle)`

Located in `app_state.rs`. Reads both subsystem states and updates the lock:

```
is_playing  = player.get_status().state == Playing
is_recording = any stream in {Recording, Connecting, Reconnecting}
wake_lock.set(is_playing || is_recording)
```

### Call sites

`sync_wake_lock` is called after every command that can change relevant state:

| Command | File |
|---------|------|
| `start_recording` | `commands/stream_commands.rs` |
| `stop_recording` | `commands/stream_commands.rs` |
| `stop_all_recordings` | `commands/stream_commands.rs` |
| `play_stream` | `commands/player_commands.rs` |
| `play_file` | `commands/player_commands.rs` |
| `play_preview` | `commands/player_commands.rs` |
| `pause` | `commands/player_commands.rs` |
| `resume` | `commands/player_commands.rs` |
| `stop` (player) | `commands/player_commands.rs` |

### Graceful shutdown

Windows automatically releases all `ES_CONTINUOUS` flags when a process exits. No explicit `set(false)` call is needed on shutdown.

---

## Files Changed

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `Win32_System_Power` to `windows` crate features |
| `src-tauri/src/wake_lock.rs` | **New** — `WakeLock` struct |
| `src-tauri/src/lib.rs` | Add `mod wake_lock;` |
| `src-tauri/src/app_state.rs` | Add `wake_lock: Arc<WakeLock>` field + `sync_wake_lock()` fn |
| `src-tauri/src/commands/stream_commands.rs` | Call `sync_wake_lock` after recording state changes |
| `src-tauri/src/commands/player_commands.rs` | Call `sync_wake_lock` after player state changes |

---

## Out of Scope

- UI indicator showing wake lock status
- Settings toggle to disable wake lock
- Cross-platform support (Windows only)
- Preventing display from turning off

---

## Testing

Manual verification:
1. Start recording a stream → set Windows sleep timeout to 1 min → verify system does not sleep.
2. Stop all recordings, pause player → verify system sleeps normally.
3. Start file playback → verify system does not sleep.
4. Pause playback → verify system can sleep.
