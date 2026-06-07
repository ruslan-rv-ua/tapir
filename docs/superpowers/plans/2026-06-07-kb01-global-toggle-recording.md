# KB-01 Global `toggle_recording` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the global `Ctrl+Shift+R` hotkey actually toggle recording for the whole active profile (start-all / stop-all), announced to NVDA via a Windows toast — working even when Tapir is backgrounded.

**Architecture:** All logic lives in Rust, invoked from the existing global-shortcut handler. A new `recording_control` module holds a pure decision (`decide`), a pure active-count helper (`count_active`/`is_active`), and an async orchestrator (`toggle_all`) that reuses the manager's existing `start_all`/`stop_all`. A new `notify::notify_recording_toggle` shows the toast (hardcoded Ukrainian, bypassing `show_tray_notifications`). The manager already emits per-stream `recording-status` events, so the frontend UI and foreground live-region speech keep working unchanged.

**Tech Stack:** Rust, Tauri v2, `tauri-plugin-notification` (already wired, AUMID registered), `tauri-plugin-global-shortcut` (already wired). No frontend changes. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-06-07-kb01-global-toggle-recording-design.md](../specs/2026-06-07-kb01-global-toggle-recording-design.md)

---

## File Structure

- **Create:** `src-tauri/src/recording_control.rs` — toggle decision (`decide`), active-recording counting (`is_active`, `count_active`), and the async `toggle_all` orchestrator. Owns the `ToggleAction` and `ToggleOutcome` types.
- **Modify:** `src-tauri/src/lib.rs` — register `mod recording_control;`.
- **Modify:** `src-tauri/src/tray/notify.rs` — add `plural_streams` (UK plural helper) and `notify_recording_toggle` (the toast); refactor `confirm_quit_if_recording` to reuse `count_active`.
- **Modify:** `src-tauri/src/shortcuts.rs` — implement the `toggle_recording` branch + a 500 ms auto-repeat debounce.

**Notes on commands:** run from the repo root `c:\dev\Tapir`. Rust crate lives in `src-tauri/` (package `tapir`, lib `tapir_lib`), so all cargo commands use `--manifest-path src-tauri/Cargo.toml`.

---

### Task 1: `recording_control` — pure decision + active-count logic

**Files:**
- Create: `src-tauri/src/recording_control.rs`
- Modify: `src-tauri/src/lib.rs:6` (add module declaration)
- Test: inline `#[cfg(test)] mod tests` in `recording_control.rs`

- [ ] **Step 1: Register the module**

In `src-tauri/src/lib.rs`, add the module declaration after the `mod profile;` line (line 6):

```rust
mod profile;
mod recording_control;
mod sanitize;
```

- [ ] **Step 2: Write the failing tests against stubbed bodies**

Create `src-tauri/src/recording_control.rs` with the types/signatures present but every body `todo!()`, and the full test module. This compiles (so tests run) but the pure helpers panic when called — the red phase:

```rust
//! Global recording toggle: decide start-vs-stop and orchestrate the manager.
//!
//! Used by the global `toggle_recording` shortcut. The pure helpers
//! (`is_active`, `count_active`, `decide`) are unit-tested; `toggle_all` is
//! thin orchestration over `StreamManager::{start_all, stop_all}` and is
//! exercised via manual/integration runs.

use crate::app_state::AppState;
use crate::stream::manager::{StreamState, StreamStatus};

/// Result of a toggle, used to build the NVDA toast.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToggleOutcome {
    /// `n` streams were newly started.
    Started(usize),
    /// `n` streams were active and got stopped.
    Stopped(usize),
    /// Start was requested but the active profile has nothing to start.
    NothingToStart,
}

/// Which direction the toggle goes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToggleAction {
    Start,
    Stop,
}

/// A stream counts as "active" while a recording task is in flight:
/// recording, connecting, or reconnecting. `Error` streams have no live task
/// (they are dropped from the manager's `entries`), so they are not active and
/// `start_all` will restart them.
pub fn is_active(_state: &StreamState) -> bool {
    todo!()
}

/// Count how many of the given statuses are active (see [`is_active`]).
pub fn count_active(_statuses: &[StreamStatus]) -> usize {
    todo!()
}

/// Toggle rule: if anything is active, one press stops everything; otherwise
/// it starts everything in the active profile.
pub fn decide(_active_count: usize) -> ToggleAction {
    todo!()
}

/// Toggle recording for the whole active profile. Reads the manager to decide,
/// then reuses `stop_all` / `start_all`. Returns the outcome for the toast.
/// (Implemented in Task 3 — left stubbed here.)
pub async fn toggle_all(_state: &AppState) -> ToggleOutcome {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_active_covers_in_flight_states_only() {
        assert!(is_active(&StreamState::Recording));
        assert!(is_active(&StreamState::Connecting));
        assert!(is_active(&StreamState::Reconnecting));
        assert!(!is_active(&StreamState::Idle));
        assert!(!is_active(&StreamState::Error));
    }

    #[test]
    fn decide_stops_when_anything_active() {
        assert_eq!(decide(1), ToggleAction::Stop);
        assert_eq!(decide(5), ToggleAction::Stop);
    }

    #[test]
    fn decide_starts_when_nothing_active() {
        assert_eq!(decide(0), ToggleAction::Start);
    }

    fn status(state: StreamState) -> StreamStatus {
        StreamStatus {
            stream_id: "x".to_string(),
            state,
            current_track: None,
            recording_started_at: None,
            bytes_recorded: 0,
            tracks_recorded: 0,
            error: None,
            reconnect_attempt: None,
        }
    }

    #[test]
    fn count_active_counts_only_in_flight() {
        let statuses = vec![
            status(StreamState::Recording),
            status(StreamState::Connecting),
            status(StreamState::Reconnecting),
            status(StreamState::Idle),
            status(StreamState::Error),
        ];
        assert_eq!(count_active(&statuses), 3);
    }

    #[test]
    fn count_active_empty_is_zero() {
        assert_eq!(count_active(&[]), 0);
    }
}
```

- [ ] **Step 3: Run the tests — verify they FAIL**

Run: `cargo test --manifest-path src-tauri/Cargo.toml recording_control`
Expected: the crate compiles, but the 4 pure-logic tests FAIL with panics `not yet implemented` (from the `todo!()` bodies). If it does not compile, fix the compile errors first, then re-run to confirm the red phase.

- [ ] **Step 4: Implement the pure helpers (green phase)**

Replace the three pure bodies (leave `toggle_all`'s `todo!()` — it is implemented in Task 3):

```rust
pub fn is_active(state: &StreamState) -> bool {
    matches!(
        state,
        StreamState::Recording | StreamState::Connecting | StreamState::Reconnecting
    )
}

pub fn count_active(statuses: &[StreamStatus]) -> usize {
    statuses.iter().filter(|s| is_active(&s.state)).count()
}

pub fn decide(active_count: usize) -> ToggleAction {
    if active_count > 0 {
        ToggleAction::Stop
    } else {
        ToggleAction::Start
    }
}
```

- [ ] **Step 5: Run the full unit-test suite — verify GREEN**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (existing tests + the 5 new ones). `toggle_all`'s `todo!()` is never called by any test, so it does not panic.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/recording_control.rs src-tauri/src/lib.rs
git commit -m "feat(recording): pure toggle decision + active-count helpers"
```

---

### Task 2: Reuse `count_active` in `confirm_quit_if_recording` (DRY)

**Files:**
- Modify: `src-tauri/src/tray/notify.rs:71-93`

- [ ] **Step 1: Replace the inline active-count filter**

In `src-tauri/src/tray/notify.rs`, inside `confirm_quit_if_recording`, replace the `let active = { ... };` block (the one that does `.filter(|s| matches!(...))`) with a call to the shared helper:

```rust
    let active = {
        let mgr = state.stream_manager.read().await;
        crate::recording_control::count_active(&mgr.get_all_statuses())
    };
```

Leave the rest of the function (`if active == 0 { return true; }`, the `spawn_blocking` MessageBox) unchanged.

- [ ] **Step 2: Build — verify it compiles**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: compiles with no warnings about an unused `StreamState` import (this function used the fully-qualified `crate::stream::manager::StreamState`, so there is no import line to remove).

- [ ] **Step 3: Run tests — verify green**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (behavior unchanged; this is a refactor).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/tray/notify.rs
git commit -m "refactor(tray): reuse count_active in confirm_quit_if_recording"
```

---

### Task 3: Implement `toggle_all` orchestration

**Files:**
- Modify: `src-tauri/src/recording_control.rs` (replace the `todo!()` body)

- [ ] **Step 1: Implement `toggle_all`**

In `src-tauri/src/recording_control.rs`, replace the `toggle_all` body:

```rust
pub async fn toggle_all(state: &AppState) -> ToggleOutcome {
    let active = {
        let mgr = state.stream_manager.read().await;
        count_active(&mgr.get_all_statuses())
    };

    match decide(active) {
        ToggleAction::Stop => {
            let mut mgr = state.stream_manager.write().await;
            mgr.stop_all();
            ToggleOutcome::Stopped(active)
        }
        ToggleAction::Start => {
            let (streams, settings) = {
                let profile = state.active_profile.read().await;
                (profile.streams.clone(), profile.recording.clone())
            };
            let mgr_arc = state.stream_manager.clone();
            let mut mgr = mgr_arc.write().await;
            let started = mgr.start_all(streams, settings, mgr_arc.clone());
            if started == 0 {
                ToggleOutcome::NothingToStart
            } else {
                ToggleOutcome::Started(started)
            }
        }
    }
}
```

- [ ] **Step 2: Build — verify it compiles**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: compiles cleanly (no more `todo!()`/unused-variable warnings in `recording_control`).

- [ ] **Step 3: Run tests — verify green**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (unit tests unchanged; `toggle_all` is now real but still not unit-tested — it's verified by build here and manually in Task 6).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/recording_control.rs
git commit -m "feat(recording): toggle_all orchestrates start_all/stop_all"
```

---

### Task 4: Toast helper + Ukrainian plural

**Files:**
- Modify: `src-tauri/src/tray/notify.rs` (add `plural_streams`, `notify_recording_toggle`, and a test module)
- Test: inline `#[cfg(test)] mod tests` in `notify.rs`

- [ ] **Step 1: Add the toast helper, plural helper, and tests**

In `src-tauri/src/tray/notify.rs`, add the import near the existing `use tauri_plugin_notification::NotificationExt;`:

```rust
use crate::recording_control::ToggleOutcome;
```

Then append to the end of the file:

```rust
/// Ukrainian plural for "потік": 1 → потік; 2–4 → потоки; 0, 5–20, … → потоків.
fn plural_streams(n: usize) -> &'static str {
    let n100 = n % 100;
    let n10 = n % 10;
    if n10 == 1 && n100 != 11 {
        "потік"
    } else if (2..=4).contains(&n10) && !(12..=14).contains(&n100) {
        "потоки"
    } else {
        "потоків"
    }
}

/// Show the NVDA-readable toast for a global recording toggle.
///
/// Intentionally bypasses `show_tray_notifications`: this is the *only* feedback
/// for a backgrounded hotkey, not ambient track chatter, so it must always fire.
/// Strings are Ukrainian-only, matching the other native surfaces here.
pub fn notify_recording_toggle(app: &tauri::AppHandle, outcome: ToggleOutcome) {
    let body = match outcome {
        ToggleOutcome::Started(n) => format!("Запис розпочато: {n} {}", plural_streams(n)),
        ToggleOutcome::Stopped(n) => format!("Запис зупинено: {n} {}", plural_streams(n)),
        ToggleOutcome::NothingToStart => "Немає потоків для запису".to_string(),
    };

    log::info!("notify_recording_toggle: {body:?}");
    if let Err(e) = app
        .notification()
        .builder()
        .title("Tapir")
        .body(&body)
        .show()
    {
        log::warn!("notify_recording_toggle: failed to show toast: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plural_streams_singular() {
        assert_eq!(plural_streams(1), "потік");
        assert_eq!(plural_streams(21), "потік");
        assert_eq!(plural_streams(101), "потік");
    }

    #[test]
    fn plural_streams_few() {
        assert_eq!(plural_streams(2), "потоки");
        assert_eq!(plural_streams(3), "потоки");
        assert_eq!(plural_streams(4), "потоки");
        assert_eq!(plural_streams(22), "потоки");
    }

    #[test]
    fn plural_streams_many() {
        assert_eq!(plural_streams(0), "потоків");
        assert_eq!(plural_streams(5), "потоків");
        assert_eq!(plural_streams(11), "потоків");
        assert_eq!(plural_streams(12), "потоків");
        assert_eq!(plural_streams(14), "потоків");
        assert_eq!(plural_streams(25), "потоків");
    }
}
```

- [ ] **Step 2: Run the new tests — verify green**

Run: `cargo test --manifest-path src-tauri/Cargo.toml plural_streams`
Expected: the 3 `plural_streams_*` tests PASS.

- [ ] **Step 3: Build — verify the toast helper compiles**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/tray/notify.rs
git commit -m "feat(tray): recording-toggle toast + UK plural helper"
```

---

### Task 5: Wire into the global shortcut + auto-repeat debounce

**Files:**
- Modify: `src-tauri/src/shortcuts.rs` (imports, debounce helper, `toggle_recording` branch)

- [ ] **Step 1: Add imports and the debounce helper**

In `src-tauri/src/shortcuts.rs`, change the log import (line 6) from:

```rust
use log::{info, warn};
```

to:

```rust
use log::{info, warn, debug};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
```

Then add, just above `fn handle_shortcut_action` (line 46):

```rust
static LAST_TOGGLE_RECORDING_MS: AtomicU64 = AtomicU64::new(0);
const TOGGLE_RECORDING_DEBOUNCE_MS: u64 = 500;

/// True if `toggle_recording` already fired within the debounce window.
/// Swallows OS key auto-repeat so a held Ctrl+Shift+R can't flap start/stop.
fn recently_toggled_recording() -> bool {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let last = LAST_TOGGLE_RECORDING_MS.load(Ordering::Relaxed);
    if now.saturating_sub(last) < TOGGLE_RECORDING_DEBOUNCE_MS {
        return true;
    }
    LAST_TOGGLE_RECORDING_MS.store(now, Ordering::Relaxed);
    false
}
```

- [ ] **Step 2: Replace the `toggle_recording` branch**

In `handle_shortcut_action`, replace the existing branch (lines 52-54):

```rust
            "toggle_recording" => {
                info!("Global shortcut: toggle_recording (no selected stream context)");
            }
```

with:

```rust
            "toggle_recording" => {
                if recently_toggled_recording() {
                    debug!("Global shortcut: toggle_recording ignored (debounce)");
                } else {
                    let outcome = crate::recording_control::toggle_all(state.inner()).await;
                    info!("Global shortcut: toggle_recording → {outcome:?}");
                    crate::tray::notify::notify_recording_toggle(&app, outcome);
                }
            }
```

> `state` here is the `tauri::State<AppState>` obtained at the top of the spawned task; `state.inner()` yields the `&AppState` that `toggle_all` expects. `app` is the cloned `AppHandle` already in scope.

- [ ] **Step 3: Build — verify it compiles**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: compiles cleanly, no unused-import warnings (`debug`, `AtomicU64`, `Ordering`, `SystemTime`, `UNIX_EPOCH` are all now used).

- [ ] **Step 4: Run tests — verify green**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/shortcuts.rs
git commit -m "feat(shortcuts): global toggle_recording starts/stops all + toast"
```

---

### Task 6: Full verification + docs

**Files:**
- Modify: `docs/keyboard-shortcuts-backlog.md` (mark KB-01 done)
- Modify: `docs/keyboard-shortcuts.md` (confirm `toggle_recording` behavior is recorded)

- [ ] **Step 1: Rust gates**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
```
Expected: tests PASS; clippy reports no new warnings in `recording_control.rs`, `tray/notify.rs`, `shortcuts.rs`.

- [ ] **Step 2: Frontend regression gates**

No frontend code changed, but confirm nothing is broken (per `typecheck-paraglide-gotchas`: the real gates are `pnpm test` + `pnpm vite:build`, not `tsc`):
```bash
pnpm test
pnpm vite:build
```
Expected: PASS.

- [ ] **Step 3: Manual acceptance with NVDA (the real "Готово коли")**

Build/run the app (`pnpm tauri dev` or the project's run skill) with NVDA active, with at least 2 streams in the active profile:

1. **Tapir focused** — press `Ctrl+Shift+R`: recordings start; NVDA reads the toast "Запис розпочато: N {потік/потоки/потоків}"; the Streams panel shows the rows going to recording.
2. **Press again** (focused): everything stops; NVDA reads "Запис зупинено: N …".
3. **Background test** — switch to another app (e.g. a browser) so Tapir is not foreground; press `Ctrl+Shift+R`: recording toggles and NVDA still reads the toast.
4. **Auto-repeat** — hold `Ctrl+Shift+R` briefly: it toggles once, not repeatedly (debounce).
5. **Empty-profile edge** (optional) — with a profile that has no streams, press once: NVDA reads "Немає потоків для запису", no error.

If any scenario fails, debug before marking the backlog item done.

- [ ] **Step 4: Mark KB-01 done in the backlog**

In `docs/keyboard-shortcuts-backlog.md`, change the KB-01 heading from `☐` to `[x]` (matching the legend in the file header), e.g.:

```markdown
### [x] KB-01 · 🐞 Глобальний `toggle_recording` нічого не робить
```

- [ ] **Step 5: Record behavior in the shortcuts registry**

In `docs/keyboard-shortcuts.md`, ensure the `toggle_recording` / `Ctrl+Shift+R` entry states it toggles the whole active profile (start-all / stop-all) with a Windows-toast announcement, linking [recording_control.rs](../src-tauri/src/recording_control.rs) and [shortcuts.rs](../src-tauri/src/shortcuts.rs). (Match the existing table/list format of that file.)

- [ ] **Step 6: Commit docs**

```bash
git add docs/keyboard-shortcuts-backlog.md docs/keyboard-shortcuts.md
git commit -m "docs(shortcuts): mark KB-01 done; record global toggle_recording behavior"
```

---

## Self-Review notes

- **Spec coverage:** target = start-all/stop-all (Task 3 `toggle_all`); toggle rule "anything active → stop" (Task 1 `decide` + `is_active`/`count_active`, Task 3); Windows toast announcement bypassing `show_tray_notifications` (Task 4); immediate stop, no confirm (Task 3 calls `stop_all` directly — no dialog); 500 ms auto-repeat debounce (Task 5); empty-profile `NothingToStart` (Task 3 + Task 4 toast); DRY reuse of active-count (Task 2); KB-02 left as a separate bug (noted, not touched); manual NVDA acceptance (Task 6). All spec sections map to a task.
- **Placeholder scan:** the only `todo!()` is in Task 1 and is explicitly resolved in Task 3; all code steps show full code.
- **Type consistency:** `ToggleOutcome` / `ToggleAction` defined in Task 1, consumed unchanged in Tasks 3–5; `count_active(&[StreamStatus])` defined in Task 1, reused in Tasks 2 & 3; `notify_recording_toggle(&AppHandle, ToggleOutcome)` defined in Task 4, called in Task 5; `toggle_all(&AppState) -> ToggleOutcome` signature consistent across Tasks 1, 3, 5.
