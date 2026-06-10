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

Uses [`SetThreadExecutionState`](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-setthreadexecutionstate) from `Win32_System_Power`.

`SetThreadExecutionState` is **thread-scoped**: the set and clear calls must happen on the **same OS thread**. Since Tapir uses a Tokio async runtime where tasks can run on any thread, all Win32 calls must be dispatched to a single dedicated OS thread.

| Call | Effect |
|------|--------|
| `SetThreadExecutionState(ES_CONTINUOUS \| ES_SYSTEM_REQUIRED)` | Prevent system sleep |
| `SetThreadExecutionState(ES_CONTINUOUS)` | Release the lock, allow sleep |

### New module: `wake_lock.rs`

Two `AtomicBool` flags track player and recording activity independently. A background OS thread applies Win32 calls; it reads the atomics **fresh on each notification**, so it always sees the latest value regardless of notification order.

```rust
pub struct WakeLock {
    player_active: Arc<AtomicBool>,
    recording_active: Arc<AtomicBool>,
    notify_tx: std::sync::mpsc::Sender<()>,  // unbounded — never blocks or drops
}

impl WakeLock {
    /// Spawns background OS thread.
    pub fn new() -> Self

    /// Called by PlayerEngine at every player state transition.
    pub fn set_player(&self, active: bool)

    /// Called by StreamManager when recording activity changes.
    pub fn set_recording(&self, active: bool)
}
```

**`set_player` / `set_recording`** store to the atomic then send `()` to the unbounded channel (ping). They always return immediately.

**Background thread** (spawned in `new()`):
```
let mut applied = false;
for _ in notify_rx {               // blocks until a ping; exits when Sender is dropped
    let desired = player_active.load(SeqCst) || recording_active.load(SeqCst);
    if desired != applied {        // idempotent: call Win32 only on actual change
        let ret = SetThreadExecutionState(if desired { ES_CONTINUOUS | ES_SYSTEM_REQUIRED }
                                         else       { ES_CONTINUOUS });
        if ret == 0 {
            log::warn!("SetThreadExecutionState failed");
            // Do NOT update `applied` on failure, so the next genuine
            // state-change will retry the call.
        } else {
            applied = desired;
        }
    }
}
```

**Why this is race-free:** the background thread reads the *current* atomic value, not the value carried in the channel message. Even if two concurrent stores (A: `true`, B: `false`) interleave their notifications, the thread reads the LATEST value of the atomic when processing each ping. The last store always determines the final state.

**Unbounded channel**: `std::sync::mpsc::channel::<()>()`. `send(())` never blocks and never drops. The channel holds at most one ping per pending state-change; since pings carry no data (the state lives in atomics), backpressure is not a concern.

**`WakeLock::new()` thread spawn failure**: panics with a clear message. Thread spawn failure on Windows is catastrophic (equivalent to OOM); graceful propagation adds no practical value.

When `WakeLock` is dropped, the `Sender` is closed → `for _ in notify_rx` loop exits → thread terminates.

### Integration points

Wake lock state is updated **at the point of state transition** inside each engine — not at the command layer. This ensures all code paths (commands, tray handlers, shortcuts, reconnect loops, natural playback end) are covered uniformly.

#### PlayerEngine (`player/engine.rs`)

- Add `wake_lock: Arc<WakeLock>` field to `PlayerEngine`, set in constructor.
- The existing `emit_player_status` free function is the call site for most player state changes. Add a `wake_lock: &WakeLock` parameter:

```rust
fn emit_player_status(app: &AppHandle, status: PlayerStatus, wake_lock: &WakeLock) {
    wake_lock.set_player(matches!(status.state, PlaybackState::Playing));
    let _ = app.emit("player-status", status);
    crate::tray::notify_state_changed(app);
}
```

**Natural file end**: when a file finishes, the engine emits `player-ended` (see engine.rs comment: "we intentionally do NOT emit Stopped here"). This means `emit_player_status` is NOT called on natural end. To release the wake lock without depending on the frontend, the `progress_task` calls `wake_lock.set_player(false)` directly before emitting `player-ended`:

```rust
// In progress_task, file variant:
if ended_naturally {
    wake_lock_clone.set_player(false);  // release before frontend sees the event
    let _ = app_clone.emit("player-ended", ...);
}
```

`wake_lock_clone` is an `Arc<WakeLock>` moved into the task (cloned from `self.wake_lock` before spawning).

**Live stream unexpected end**: the `play_live` progress_task already calls `emit_player_status` with `Stopped` when the HTTP stream dies (`writer_done` signal). After adding the `&WakeLock` parameter, `emit_player_status` will call `set_player(false)` automatically. The live stream progress_task captures `Arc<WakeLock>` (cloned from `self.wake_lock`) to pass to `emit_player_status`.

This covers all player state transitions: play, pause, resume, stop, live stream end, and natural file end — without depending on the frontend for cleanup.

#### StreamManager (`stream/manager.rs`)

- Add `wake_lock: Arc<WakeLock>` field to `StreamManager`, set in constructor.
- State changes go through dedicated helper functions: `update_state`, `update_state_reconnecting`, `update_state_recording`, `update_state_error`. Each is modified to accept `&WakeLock`, compute `any_active` from all entries, and call `wake_lock.set_recording(any_active)` **while still holding the write lock** (before it is released). Since `set_recording` only stores to an `AtomicBool` and sends to an unbounded channel, both non-blocking, calling it under the lock is safe and eliminates the stale-snapshot race:

```rust
async fn update_state(
    manager: &Arc<RwLock<StreamManager>>,
    stream_id: &str,
    state: StreamState,
    wake_lock: &WakeLock,
) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.state = state;
        entry.status.error = None;
    }
    let any_active = guard.entries.values().any(|e| is_active_state(&e.status.state));
    wake_lock.set_recording(any_active);  // called under the write lock
}  // guard released here

fn is_active_state(s: &StreamState) -> bool {
    matches!(s, StreamState::Recording | StreamState::Connecting | StreamState::Reconnecting)
}
```

The same pattern applies to `update_state_reconnecting`, `update_state_recording`, `update_state_error`.

Because `set_recording` is called under the write lock, all state updates and their corresponding wake lock stores are fully serialized — no stale snapshots can overwrite a newer update.

**`stop_all_async()`**: this method cancels all tokens and **drains `entries`** (removes all entries before tasks finish). Because entries are removed before any `update_state_*` call from within those tasks, `any_active` would compute as 0 even if old tasks still run — but the cancelled tasks exit without useful state updates anyway. To ensure the wake lock is released immediately, `stop_all_async()` calls `self.wake_lock.set_recording(false)` directly after draining entries:

```rust
pub fn stop_all_async(&mut self) -> Vec<JoinHandle<()>> {
    for entry in self.entries.values() {
        entry.cancel_token.cancel();
    }
    let handles = self.entries.drain().map(|(_, e)| e.join_handle).collect();
    self.wake_lock.set_recording(false);  // entries gone, no active recordings remain
    handles
}
```

### AppState

`AppState::new()` creates `Arc<WakeLock>` and passes it to both `PlayerEngine::new()` and `StreamManager::new()`. Both engines store `Arc<WakeLock>` as a field, keeping it alive for the lifetime of the app. `AppState` does not need to hold a separate copy.

### Graceful shutdown

Windows automatically releases all `ES_CONTINUOUS` flags when a process exits. The background thread exits when `WakeLock` is dropped (channel sender closed).

---

## Files Changed

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `Win32_System_Power` to `windows` crate features |
| `src-tauri/src/wake_lock.rs` | **New** — `WakeLock` with two flags and background OS thread |
| `src-tauri/src/lib.rs` | Add `mod wake_lock;` |
| `src-tauri/src/app_state.rs` | Create `Arc<WakeLock>`, pass to both engine constructors |
| `src-tauri/src/player/engine.rs` | Add `wake_lock: Arc<WakeLock>` field; add `&WakeLock` param to `emit_player_status` |
| `src-tauri/src/stream/manager.rs` | Add `wake_lock: Arc<WakeLock>` field; add `&WakeLock` param to all `update_state_*` helpers; add `is_active_state` helper; add `set_recording(false)` call in `stop_all_async` |

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
2. Stop all recordings, player stopped → verify system sleeps normally.
3. Start file playback → verify system does not sleep.
4. Pause playback → verify system can sleep.
5. Let a file play to its natural end → verify system can sleep afterwards.
6. Start recording + start file playback → pause playback → verify system stays awake (recording still active).
7. Stop recording while playback is paused → verify system can sleep.
8. Simulate recording connection error (invalid URL) → verify system can sleep after error state.
9. Start 2 recordings simultaneously → stop 1 → verify system still does not sleep (other recording active).
10. Switch profile (triggers `stop_all_async`) → verify system can sleep after profile switch completes.
