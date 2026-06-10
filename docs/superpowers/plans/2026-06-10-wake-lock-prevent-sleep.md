# Wake Lock — Prevent Windows Sleep Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Windows from sleeping while Tapir is recording a radio stream or playing audio.

**Architecture:** A new `wake_lock.rs` module holds `WakeLock` — two `AtomicBool` flags (player, recording) and a background OS thread that calls `SetThreadExecutionState`. `PlayerEngine` and `StreamManager` each receive an `Arc<WakeLock>` at construction and call `set_player`/`set_recording` at every state transition, under the existing synchronization primitives to avoid races.

**Tech Stack:** Rust, `windows` crate (already in use), `std::sync::mpsc`, `std::sync::atomic`

---

## Chunk 1: WakeLock module + Cargo.toml

### File map

| File | Action |
|------|--------|
| `src-tauri/Cargo.toml` | Add `Win32_System_Power` to `windows` features |
| `src-tauri/src/wake_lock.rs` | **New** — `WakeLock` struct |
| `src-tauri/src/lib.rs` | Add `mod wake_lock;` |

---

### Task 1: Add Win32_System_Power to Cargo.toml

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1.1: Add feature to `windows` crate**

In `src-tauri/Cargo.toml`, find the `windows` dependency block and add `"Win32_System_Power"`:

```toml
windows = { version = "0.62", features = [
    "Win32_UI_WindowsAndMessaging",
    "Win32_UI_Shell",
    "Win32_Foundation",
    "Win32_Storage_FileSystem",
    "Win32_System_Power",
] }
```

- [ ] **Step 1.2: Verify it compiles**

```powershell
cd src-tauri; cargo check 2>&1 | Select-String "^error"
```

Expected: no errors.

---

### Task 2: Create `wake_lock.rs`

**Files:**
- Create: `src-tauri/src/wake_lock.rs`

- [ ] **Step 2.1: Write the module**

Create `src-tauri/src/wake_lock.rs`:

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use windows::Win32::System::Power::{
    SetThreadExecutionState, ES_CONTINUOUS, ES_SYSTEM_REQUIRED, EXECUTION_STATE,
};

pub struct WakeLock {
    player_active: Arc<AtomicBool>,
    recording_active: Arc<AtomicBool>,
    notify_tx: std::sync::mpsc::Sender<()>,
}

impl WakeLock {
    /// Create a new WakeLock and spawn the background OS thread.
    ///
    /// Panics if the OS thread cannot be spawned (catastrophic, equivalent to OOM).
    pub fn new() -> Self {
        let player_active = Arc::new(AtomicBool::new(false));
        let recording_active = Arc::new(AtomicBool::new(false));
        let (notify_tx, notify_rx) = std::sync::mpsc::channel::<()>();

        let p = player_active.clone();
        let r = recording_active.clone();

        std::thread::Builder::new()
            .name("wake-lock".into())
            .spawn(move || {
                let mut applied = false;
                for _ in notify_rx {
                    let desired =
                        p.load(Ordering::SeqCst) || r.load(Ordering::SeqCst);
                    if desired != applied {
                        let flags: EXECUTION_STATE = if desired {
                            ES_CONTINUOUS | ES_SYSTEM_REQUIRED
                        } else {
                            ES_CONTINUOUS
                        };
                        // SAFETY: SetThreadExecutionState is safe to call from any thread.
                        let ret = unsafe { SetThreadExecutionState(flags) };
                        if ret == EXECUTION_STATE(0) {
                            log::warn!("WakeLock: SetThreadExecutionState failed");
                            // Do not update `applied` on failure so the next genuine
                            // state-change triggers a retry.
                        } else {
                            applied = desired;
                            log::debug!("WakeLock: prevent_sleep={desired}");
                        }
                    }
                }
                // notify_rx closed (WakeLock dropped) — thread exits cleanly.
            })
            .expect("WakeLock: failed to spawn background thread");

        Self {
            player_active,
            recording_active,
            notify_tx,
        }
    }

    /// Notify the background thread that player activity changed.
    /// `active = true` → player is Playing; `false` → Paused or Stopped.
    pub fn set_player(&self, active: bool) {
        self.player_active.store(active, Ordering::SeqCst);
        let _ = self.notify_tx.send(());
    }

    /// Notify the background thread that recording activity changed.
    /// `active = true` → at least one stream is Recording/Connecting/Reconnecting.
    pub fn set_recording(&self, active: bool) {
        self.recording_active.store(active, Ordering::SeqCst);
        let _ = self.notify_tx.send(());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wake_lock_new_does_not_panic() {
        let _wl = WakeLock::new();
        // Thread spawned, channel created — no panic.
    }

    #[test]
    fn set_player_stores_active_flag() {
        let wl = WakeLock::new();
        assert!(!wl.player_active.load(Ordering::SeqCst));
        wl.set_player(true);
        assert!(wl.player_active.load(Ordering::SeqCst));
        wl.set_player(false);
        assert!(!wl.player_active.load(Ordering::SeqCst));
    }

    #[test]
    fn set_recording_stores_active_flag() {
        let wl = WakeLock::new();
        assert!(!wl.recording_active.load(Ordering::SeqCst));
        wl.set_recording(true);
        assert!(wl.recording_active.load(Ordering::SeqCst));
        wl.set_recording(false);
        assert!(!wl.recording_active.load(Ordering::SeqCst));
    }

    #[test]
    fn drop_cleans_up_background_thread() {
        let wl = WakeLock::new();
        wl.set_player(true);
        drop(wl); // Sender dropped → notify_rx closed → thread exits
        // No panic, no hang.
    }
}
```

- [ ] **Step 2.2: Register module in lib.rs**

Open `src-tauri/src/lib.rs`. Add `mod wake_lock;` alongside the other module declarations (keep alphabetical order):

```rust
// existing modules ...
mod wake_lock;
// existing modules ...
```

Exact placement: after `mod tray;` and before `mod wishlist;`:

```rust
mod tray;
mod wake_lock;
mod wishlist;
```

- [ ] **Step 2.3: Run the WakeLock tests**

The `wake_lock` module has no dependency on `PlayerEngine` or `AppState`, so these tests compile and pass independently before any other changes.

```powershell
cd src-tauri; cargo test wake_lock 2>&1
```

Expected output (4 tests):
```
test wake_lock::tests::drop_cleans_up_background_thread ... ok
test wake_lock::tests::set_player_stores_active_flag ... ok
test wake_lock::tests::set_recording_stores_active_flag ... ok
test wake_lock::tests::wake_lock_new_does_not_panic ... ok

test result: ok. 4 passed; 0 failed
```

- [ ] **Step 2.4: Commit**

```powershell
cd C:\dev\Tapir
git add src-tauri/Cargo.toml src-tauri/src/wake_lock.rs src-tauri/src/lib.rs
git commit -m "feat(wake-lock): add WakeLock module with background OS thread

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 2: PlayerEngine integration

### File map

| File | Action |
|------|--------|
| `src-tauri/src/player/engine.rs` | Add `wake_lock` field; update `emit_player_status`; update `play_file` progress_task; update `play_live` progress_task |

> **Background:** `PlayerEngine` has a free function `emit_player_status(app, status)` that is called at every player state transition (play, pause, resume, stop, device switch, live stream death). Adding `&WakeLock` to its signature covers all those paths. Natural file end is a special case: the engine intentionally does NOT call `emit_player_status` on file end (per comment in code), so we add a direct `wake_lock.set_player(false)` call in the `play_file` progress_task before emitting `player-ended`. Live stream unexpected end: the `play_live` progress_task already calls `emit_player_status(Stopped)` via `writer_done` branch — it just needs `Arc<WakeLock>` captured.

---

### Task 3: Add `wake_lock` field to `PlayerEngine`

**Files:**
- Modify: `src-tauri/src/player/engine.rs`

- [ ] **Step 3.1: Add import**

At the top of `engine.rs`, after existing `use` statements, add:

```rust
use crate::wake_lock::WakeLock;
```

- [ ] **Step 3.2: Add field to `PlayerEngine` struct**

Find the `PlayerEngine` struct (around line 94):

```rust
pub struct PlayerEngine {
    session: Arc<Mutex<Option<PlaybackSession>>>,
    volume: Arc<Mutex<f32>>,
    output_device_name: Arc<Mutex<Option<String>>>,
}
```

Add `wake_lock` field:

```rust
pub struct PlayerEngine {
    session: Arc<Mutex<Option<PlaybackSession>>>,
    volume: Arc<Mutex<f32>>,
    output_device_name: Arc<Mutex<Option<String>>>,
    wake_lock: Arc<WakeLock>,
}
```

- [ ] **Step 3.3: Update `PlayerEngine::new()` to accept and store `WakeLock`**

Find the `new` method:

```rust
pub fn new(initial_volume: f32, initial_device: Option<String>) -> Result<Self> {
    DeviceSinkBuilder::open_default_sink()
        .context("Failed to open audio output stream")?;
    Ok(Self {
        session: Arc::new(Mutex::new(None)),
        volume: Arc::new(Mutex::new(initial_volume.clamp(0.0, 1.0))),
        output_device_name: Arc::new(Mutex::new(initial_device)),
    })
}
```

Change to:

```rust
pub fn new(initial_volume: f32, initial_device: Option<String>, wake_lock: Arc<WakeLock>) -> Result<Self> {
    DeviceSinkBuilder::open_default_sink()
        .context("Failed to open audio output stream")?;
    Ok(Self {
        session: Arc::new(Mutex::new(None)),
        volume: Arc::new(Mutex::new(initial_volume.clamp(0.0, 1.0))),
        output_device_name: Arc::new(Mutex::new(initial_device)),
        wake_lock,
    })
}
```

- [ ] **Step 3.4: Update `emit_player_status` free function**

Find:

```rust
fn emit_player_status(app: &AppHandle, status: PlayerStatus) {
    if let Err(e) = app.emit("player-status", status) {
        log::warn!("Player: failed to emit player-status: {e}");
    }
    crate::tray::notify_state_changed(app);
}
```

Change to:

```rust
fn emit_player_status(app: &AppHandle, status: PlayerStatus, wake_lock: &WakeLock) {
    wake_lock.set_player(matches!(&status.state, PlaybackState::Playing));
    if let Err(e) = app.emit("player-status", status) {
        log::warn!("Player: failed to emit player-status: {e}");
    }
    crate::tray::notify_state_changed(app);
}
```

- [ ] **Step 3.5: Fix all call sites of `emit_player_status`**

Search for all `emit_player_status(` calls in `engine.rs`. There are **8 total call sites**: 7 in regular `impl PlayerEngine` methods, and 1 inside the `play_live` progress_task closure (handled in Task 5).

For the **7 method-level call sites** (where `self` is available):
- `play_file` (end of method, after creating session)
- `stop_playback`
- `pause_playback`
- `resume_playback`
- `set_volume`
- `set_output_device`
- `play_live` (end of method, after creating session)

Change each occurrence from:

```rust
emit_player_status(app, status);
```

to:

```rust
emit_player_status(app, status, &self.wake_lock);
```

(For `set_output_device` which passes an inline `PlayerStatus { ... }`, same change applies.)

The **8th call site** — inside the `play_live` progress_task closure (the `writer_done` branch) — is handled in Task 5. Do NOT fix it here.

- [ ] **Step 3.6: Compile check — expect exactly 2 remaining errors**

```powershell
cd src-tauri; cargo check 2>&1 | Select-String "^error"
```

Expected: exactly 2 compile errors remain:
1. The `play_live` progress_task closure (`writer_done` branch) — handled in Task 5
2. `AppState::new` constructor call — handled in Chunk 3

No errors should remain in the 7 method-level call sites fixed above.

---

### Task 4: Handle natural file end in `play_file` progress_task

**Files:**
- Modify: `src-tauri/src/player/engine.rs`

> **Background:** The `play_file` method spawns a `progress_task` that checks `player_clone.empty()`. When the file plays to the end (`ended_naturally = true`), the code emits `player-ended` directly (intentionally skips `emit_player_status`). We add `wake_lock.set_player(false)` before emitting `player-ended`.

- [ ] **Step 4.1: Capture `Arc<WakeLock>` in `play_file`**

In the `play_file` method, before `let progress_task = tokio::spawn(...)`, add:

```rust
let wake_lock_for_task = self.wake_lock.clone();
```

- [ ] **Step 4.2: Move `wake_lock_for_task` into the task and call `set_player(false)` on natural end**

Find the `if ended_naturally {` block inside the `play_file` progress_task (currently at the end of the task body):

```rust
if ended_naturally {
    if let Err(e) = app_clone.emit("player-ended", PlayerEndedPayload { path: path_for_end }) {
        log::warn!("Player: failed to emit player-ended: {e}");
    }
}
```

The `progress_task` must capture `wake_lock_for_task`. Change `tokio::spawn(async move {` to ensure `wake_lock_for_task` is in scope (it will be captured automatically since it is defined before the spawn). Update the `if ended_naturally` block:

```rust
if ended_naturally {
    // Release the wake lock before the frontend sees the event,
    // so system-sleep is re-allowed without depending on the frontend.
    wake_lock_for_task.set_player(false);
    if let Err(e) = app_clone.emit("player-ended", PlayerEndedPayload { path: path_for_end }) {
        log::warn!("Player: failed to emit player-ended: {e}");
    }
}
```

- [ ] **Step 4.3: Compile check**

```powershell
cd src-tauri; cargo check 2>&1 | Select-String "^error"
```

Expected: no errors related to `play_file` or the file-end path. The same 2 remaining errors from Step 3.6 (play_live writer_done closure + AppState::new) are still expected at this point.

---

### Task 5: Handle live stream unexpected end in `play_live` progress_task

**Files:**
- Modify: `src-tauri/src/player/engine.rs`

> **Background:** `play_live` is used by both `play_stream` and `preview`. Its progress_task has two branches:
> - `cancel_live.cancelled()` → user-initiated stop, `stop_playback` will call `emit_player_status` ← no action needed here
> - `writer_done.cancelled()` → stream died unexpectedly → task calls `emit_player_status(Stopped)` ← this call needs `&WakeLock`

- [ ] **Step 5.1: Capture `Arc<WakeLock>` in `play_live`**

In `play_live`, before `let progress_task = tokio::spawn(...)`, add:

```rust
let wake_lock_for_task = self.wake_lock.clone();
```

- [ ] **Step 5.2: Pass to `emit_player_status` in the `writer_done` branch**

Find the live stream progress_task:

```rust
let progress_task = tokio::spawn(async move {
    tokio::select! {
        _ = cancel_live.cancelled() => {
            // User-initiated stop — stop_playback already emits player-status.
        }
        _ = writer_done.cancelled() => {
            tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
            let current_volume = *volume_arc.lock().await;
            emit_player_status(&app_live, PlayerStatus {
                state: PlaybackState::Stopped,
                source: None,
                volume: current_volume,
                position_ms: None,
                duration_ms: None,
            });
        }
    }
});
```

The `wake_lock_for_task` will be captured automatically. Update the `writer_done` branch call:

```rust
emit_player_status(&app_live, PlayerStatus {
    state: PlaybackState::Stopped,
    source: None,
    volume: current_volume,
    position_ms: None,
    duration_ms: None,
}, &wake_lock_for_task);
```

- [ ] **Step 5.3: Compile check — only `AppState::new` error remains**

```powershell
cd src-tauri; cargo check 2>&1 | Select-String "^error"
```

Expected: no errors in `engine.rs`. Only one error remains — `AppState::new` still uses the old `PlayerEngine::new` constructor — handled in Chunk 3.

- [ ] **Step 5.4: Commit PlayerEngine changes**

```powershell
cd C:\dev\Tapir
git add src-tauri/src/player/engine.rs
git commit -m "feat(wake-lock): integrate WakeLock into PlayerEngine`n`nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

> **Note:** The binary will not compile cleanly until `AppState::new` is updated in Task 7. `cargo check` is used here to verify correctness of the engine changes before moving on.

---

## Chunk 3: StreamManager + AppState integration

### File map

| File | Action |
|------|--------|
| `src-tauri/src/stream/manager.rs` | Add `wake_lock` field; update `update_state_*` helpers; update `stop_all_async` |
| `src-tauri/src/app_state.rs` | Create `Arc<WakeLock>`; pass to both engines |

---

### Task 6: Add `wake_lock` to `StreamManager` and update state helpers

**Files:**
- Modify: `src-tauri/src/stream/manager.rs`

> **Background:** `StreamManager` has four state-update free functions (`update_state`, `update_state_reconnecting`, `update_state_recording`, `update_state_error`) and one method (`stop_all_async`). Each function that changes `StreamState` must also call `wake_lock.set_recording(any_active)` while still holding the write lock (to avoid stale-snapshot races). `stop_all_async` drains all entries directly — it calls `set_recording(false)` after the drain.
>
> The `update_state_*` functions access `wake_lock` via the guard (`guard.wake_lock`), so they need no extra parameter — `wake_lock` is a field on `StreamManager`.

- [ ] **Step 6.1: Add import**

At the top of `manager.rs`, add:

```rust
use crate::wake_lock::WakeLock;
```

- [ ] **Step 6.2: Add `wake_lock` field to `StreamManager`**

Find:

```rust
pub struct StreamManager {
    app_handle: AppHandle,
    entries: HashMap<String, StreamEntry>,
}
```

Change to:

```rust
pub struct StreamManager {
    app_handle: AppHandle,
    entries: HashMap<String, StreamEntry>,
    wake_lock: Arc<WakeLock>,
}
```

- [ ] **Step 6.3: Update `StreamManager::new()` to accept `Arc<WakeLock>`**

Find:

```rust
pub fn new(app_handle: AppHandle) -> Self {
    Self {
        app_handle,
        entries: HashMap::new(),
    }
}
```

Change to:

```rust
pub fn new(app_handle: AppHandle, wake_lock: Arc<WakeLock>) -> Self {
    Self {
        app_handle,
        entries: HashMap::new(),
        wake_lock,
    }
}
```

- [ ] **Step 6.4: Add `is_active_state` helper**

After the last `emit_*` helper function (around line 367), before `update_state`:

```rust
fn is_active_state(s: &StreamState) -> bool {
    matches!(
        s,
        StreamState::Recording | StreamState::Connecting | StreamState::Reconnecting
    )
}
```

- [ ] **Step 6.5: Update `update_state`**

Find:

```rust
async fn update_state(manager: &Arc<RwLock<StreamManager>>, stream_id: &str, state: StreamState) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.state = state;
        entry.status.error = None;
    }
}
```

Change to:

```rust
async fn update_state(manager: &Arc<RwLock<StreamManager>>, stream_id: &str, state: StreamState) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.state = state;
        entry.status.error = None;
    }
    let any_active = guard.entries.values().any(|e| is_active_state(&e.status.state));
    guard.wake_lock.set_recording(any_active);
}
```

- [ ] **Step 6.6: Update `update_state_reconnecting`**

Find:

```rust
async fn update_state_reconnecting(
    manager: &Arc<RwLock<StreamManager>>,
    stream_id: &str,
    attempt: u32,
) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.state = StreamState::Reconnecting;
        entry.status.reconnect_attempt = Some(attempt);
    }
}
```

Change to:

```rust
async fn update_state_reconnecting(
    manager: &Arc<RwLock<StreamManager>>,
    stream_id: &str,
    attempt: u32,
) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.state = StreamState::Reconnecting;
        entry.status.reconnect_attempt = Some(attempt);
    }
    let any_active = guard.entries.values().any(|e| is_active_state(&e.status.state));
    guard.wake_lock.set_recording(any_active);
}
```

- [ ] **Step 6.7: Update `update_state_recording`**

Find:

```rust
async fn update_state_recording(
    manager: &Arc<RwLock<StreamManager>>,
    stream_id: &str,
    started_at: &str,
) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.state = StreamState::Recording;
        entry.status.recording_started_at = Some(started_at.to_string());
    }
}
```

Change to:

```rust
async fn update_state_recording(
    manager: &Arc<RwLock<StreamManager>>,
    stream_id: &str,
    started_at: &str,
) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.state = StreamState::Recording;
        entry.status.recording_started_at = Some(started_at.to_string());
    }
    let any_active = guard.entries.values().any(|e| is_active_state(&e.status.state));
    guard.wake_lock.set_recording(any_active);
}
```

- [ ] **Step 6.8: Update `update_state_error`**

Find:

```rust
async fn update_state_error(
    manager: &Arc<RwLock<StreamManager>>,
    stream_id: &str,
    error: &str,
) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.state = StreamState::Error;
        entry.status.error = Some(error.to_string());
    }
}
```

Change to:

```rust
async fn update_state_error(
    manager: &Arc<RwLock<StreamManager>>,
    stream_id: &str,
    error: &str,
) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.state = StreamState::Error;
        entry.status.error = Some(error.to_string());
    }
    let any_active = guard.entries.values().any(|e| is_active_state(&e.status.state));
    guard.wake_lock.set_recording(any_active);
}
```

- [ ] **Step 6.9: Update `stop_all_async`**

Find:

```rust
pub fn stop_all_async(&mut self) -> Vec<tokio::task::JoinHandle<()>> {
    for entry in self.entries.values() {
        entry.cancel_token.cancel();
    }
    self.entries
        .drain()
        .map(|(_, entry)| entry.join_handle)
        .collect()
}
```

Change to:

```rust
pub fn stop_all_async(&mut self) -> Vec<tokio::task::JoinHandle<()>> {
    for entry in self.entries.values() {
        entry.cancel_token.cancel();
    }
    let handles = self.entries
        .drain()
        .map(|(_, entry)| entry.join_handle)
        .collect();
    // All entries drained — no active recordings remain.
    self.wake_lock.set_recording(false);
    handles
}
```

- [ ] **Step 6.10: Compile check for manager**

```powershell
cd src-tauri; cargo check 2>&1 | Select-String "^error"
```

Expected: errors only from `AppState::new` (not yet updated) — no errors in `manager.rs`.

---

### Task 7: Update `AppState` to create and pass `Arc<WakeLock>`

**Files:**
- Modify: `src-tauri/src/app_state.rs`

- [ ] **Step 7.1: Add import**

At the top of `app_state.rs`, add:

```rust
use crate::wake_lock::WakeLock;
```

- [ ] **Step 7.2: Update `AppState::new()` to create `WakeLock` and pass it**

Find the `AppState::new()` method:

```rust
pub fn new(
    settings: GlobalSettings,
    profile: Profile,
    app_handle: tauri::AppHandle,
) -> anyhow::Result<Self> {
    let player = PlayerEngine::new(
        profile.player_session.volume,
        settings.output_device.clone(),
    )?;
    let browser_client = Arc::new(tokio::sync::OnceCell::new());
    Ok(Self {
        stream_manager: Arc::new(RwLock::new(StreamManager::new(app_handle))),
        settings: Arc::new(RwLock::new(settings)),
        active_profile: Arc::new(RwLock::new(profile)),
        player: Arc::new(player),
        browser_client,
    })
}
```

Change to:

```rust
pub fn new(
    settings: GlobalSettings,
    profile: Profile,
    app_handle: tauri::AppHandle,
) -> anyhow::Result<Self> {
    let wake_lock = Arc::new(WakeLock::new());
    let player = PlayerEngine::new(
        profile.player_session.volume,
        settings.output_device.clone(),
        wake_lock.clone(),
    )?;
    let browser_client = Arc::new(tokio::sync::OnceCell::new());
    Ok(Self {
        stream_manager: Arc::new(RwLock::new(StreamManager::new(app_handle, wake_lock))),
        settings: Arc::new(RwLock::new(settings)),
        active_profile: Arc::new(RwLock::new(profile)),
        player: Arc::new(player),
        browser_client,
    })
}
```

- [ ] **Step 7.3: Full compile check**

```powershell
cd src-tauri; cargo check 2>&1 | Select-String "^error"
```

Expected: **no errors**.

- [ ] **Step 7.4: Run full test suite**

```powershell
cd src-tauri; cargo test 2>&1
```

Expected: all existing tests pass (no regressions). The 4 new wake_lock tests also pass.

- [ ] **Step 7.5: Fast build to verify binary compiles**

```powershell
cd C:\dev\Tapir; just build-fast 2>&1 | Select-Object -Last 5
```

Expected: last lines contain `Finished` with no errors.

- [ ] **Step 7.6: Commit StreamManager + AppState changes**

```powershell
cd C:\dev\Tapir
git add src-tauri/src/stream/manager.rs src-tauri/src/app_state.rs
git commit -m "feat(wake-lock): integrate WakeLock into StreamManager and AppState

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Manual Testing Checklist

After the build succeeds, run `just build-fast`, launch `tapir.exe`, and verify manually:

- [ ] Start recording a stream → set Windows sleep timeout to 1 min → verify system does not sleep
- [ ] Stop all recordings, player stopped → verify system can sleep normally
- [ ] Start file playback → verify system does not sleep
- [ ] Pause playback → verify system can sleep
- [ ] Let a file play to its natural end → verify system can sleep afterwards
- [ ] Start recording + start file playback → pause playback → verify system stays awake (recording still active)
- [ ] Stop recording while playback is paused → verify system can sleep
- [ ] Simulate recording connection error (invalid URL) → verify system can sleep after error state
- [ ] Start 2 recordings simultaneously → stop 1 → verify system still does not sleep (other recording active)
- [ ] Switch profile (triggers `stop_all_async`) → verify system can sleep after profile switch completes
