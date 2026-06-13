# Phase 3E — Single Instance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a second Tapir instance from running; a re-launch activates the existing window (so NVDA announces it) and proxies its argv to the first instance.

**Architecture:** Add `tauri-plugin-single-instance` with a global named mutex (bundle id `ua.ruslanrv.tapir`), registered FIRST in the builder (before the log plugin) so the dying second instance never touches `tapir.log`. An early `AllowSetForegroundWindow(ASFW_ANY)` in `run()` performs the foreground hand-off so the first instance's `set_focus()` is honoured. A new `cli::handle_args` seam receives argv both at startup and from the single-instance callback (groundwork for Phase 3G).

**Tech Stack:** Rust, Tauri v2, `tauri-plugin-single-instance` v2, `windows` crate 0.62 (Win32 `AllowSetForegroundWindow`).

**Spec:** [docs/superpowers/specs/2026-06-13-single-instance-design.md](../specs/2026-06-13-single-instance-design.md)

**Note on testing:** Per spec §6, this phase is OS/process-level glue plus a logging stub — there is **no pure logic to unit-test** (`handle_args` needs `&AppHandle`, `allow_foreground_handoff` is unsafe FFI, `plugin()` just returns a plugin). Intermediate tasks are gated by `cargo check`; final acceptance is the build gates + manual NVDA verification in Task 4. This is intentional, not a coverage gap.

**Branch:** `feature/phase-3e-single-instance` (already created; spec already committed here).

---

### Task 1: Add the single-instance dependency

**Files:**
- Modify: `src-tauri/Cargo.toml` (Tauri Plugins block, after line 25 `tauri-plugin-notification = "2"`)

- [ ] **Step 1: Add the dependency**

In `src-tauri/Cargo.toml`, under the `# Tauri Plugins (Phase 1 only)` block, add a line after `tauri-plugin-notification = "2"`:

```toml
tauri-plugin-single-instance = "2"
```

- [ ] **Step 2: Verify it resolves and compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS — the crate downloads and the project still compiles (the dependency is not used yet; cargo does not warn on unused dependencies).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "build(single-instance): add tauri-plugin-single-instance dependency"
```

---

### Task 2: Create the `cli` argv seam and call it at startup

**Files:**
- Create: `src-tauri/src/cli.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod cli;`; call `cli::handle_args` in `setup()`)

- [ ] **Step 1: Create `src-tauri/src/cli.rs`**

```rust
//! Shared command-line argument handler.
//!
//! Seam for Phase 3G (CLI Arguments). Called both at startup (first instance,
//! with `std::env::args`) and from the single-instance callback (second
//! instance's argv — see `single_instance.rs`). In Phase 3E this only logs; the
//! clap-based parsing and dispatch land in 3G. When parsing arrives, keep the
//! pure `argv -> intent` logic in a separate (unit-testable) function that this
//! `AppHandle`-bound wrapper calls.

use tauri::AppHandle;

/// Handle raw process arguments. Phase 3E: log only (not yet interpreted).
pub fn handle_args(_app: &AppHandle, argv: Vec<String>, cwd: Option<String>) {
    log::info!("CLI args (not yet interpreted, see Phase 3G): argv={argv:?}, cwd={cwd:?}");
}
```

- [ ] **Step 2: Declare the module in `lib.rs`**

In `src-tauri/src/lib.rs`, after the line `mod browser;` (line 19), add:

```rust
mod cli;
```

- [ ] **Step 3: Call the seam at startup in `setup()`**

In `src-tauri/src/lib.rs`, inside the `.setup(move |app| {` closure, immediately after the window show/focus block (after the closing `}` of `if let Some(main_window) = app.get_webview_window("main") { ... }`, currently around line 85), add:

```rust
            // Phase 3E: feed our own argv through the shared CLI seam.
            // No-op beyond logging until Phase 3G fills in parsing.
            crate::cli::handle_args(app.handle(), std::env::args().collect(), None);
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS — `handle_args` is now used by `setup()`, so no dead-code warning.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cli.rs src-tauri/src/lib.rs
git commit -m "feat(cli): add argv handler seam, invoked at startup (Phase 3G groundwork)"
```

---

### Task 3: Create the `single_instance` module and wire it into `run()`

**Files:**
- Create: `src-tauri/src/single_instance.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod single_instance;`; call `allow_foreground_handoff()` first in `run()`; register the plugin FIRST, before the log plugin)

- [ ] **Step 1: Create `src-tauri/src/single_instance.rs`**

```rust
//! Single-instance enforcement + foreground hand-off.
//!
//! A global named mutex (keyed on the bundle identifier `ua.ruslanrv.tapir`)
//! ensures only one Tapir runs per user. A second launch forwards its argv to
//! the first instance and exits; the first instance activates its window so the
//! screen reader announces the focus change.
//!
//! NOTE for Phase 3G: because the mutex key is GLOBAL (not per `--datadir`),
//! `--datadir` will only take effect on the FIRST instance. A second launch with
//! a different `--datadir` forwards its argv to the first instance and exits.
//!
//! Registration order matters: this plugin MUST be added before the log plugin.
//! It detects a duplicate inside its setup hook and calls
//! `cleanup_before_exit()` + `std::process::exit(0)`, so any plugin registered
//! after it never initializes in the dying second instance — keeping the shared
//! `tapir.log` (KeepOne rotation) untouched.

use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Manager, Wry};
use windows::Win32::UI::WindowsAndMessaging::{AllowSetForegroundWindow, ASFW_ANY};

/// Grant any process the right to set the foreground window.
///
/// Call FIRST in `run()`, before `tauri::Builder`, so it runs in BOTH instances.
/// In the second (dying) instance it hands the foreground grant over before the
/// single-instance plugin terminates the process, so the first instance's
/// `set_focus()` is honoured by the OS and the screen reader announces the
/// activation. In the first instance it is a harmless foreground-lock relaxation
/// (the grant that actually enables activation comes only from the second
/// instance). See spec §5.
pub fn allow_foreground_handoff() {
    // SAFETY: a simple Win32 call with no preconditions. ASFW_ANY (u32::MAX)
    // relaxes the foreground lock. The return value (Result<()> or BOOL,
    // depending on the binding) is intentionally ignored.
    let _ = unsafe { AllowSetForegroundWindow(ASFW_ANY) };
}

/// The single-instance plugin, configured to activate the first instance and
/// proxy argv. Register this FIRST (before the log plugin) — see module docs.
pub fn plugin() -> TauriPlugin<Wry> {
    tauri_plugin_single_instance::init(on_second_instance)
}

/// Runs in the FIRST instance when a second is launched. (The second instance
/// never runs this — it exits inside the plugin's setup hook.)
fn on_second_instance(app: &AppHandle, argv: Vec<String>, cwd: String) {
    if let Some(window) = app.get_webview_window("main") {
        // Same proven order as the tray "Show" action (tray/handlers.rs):
        // show -> unminimize -> set_focus; set_focus MUST be last.
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    crate::tray::notify_state_changed(app); // tray menu: visibility changed
    crate::cli::handle_args(app, argv, Some(cwd)); // proxy argv -> Phase 3G seam
}
```

- [ ] **Step 2: Declare the module in `lib.rs`**

In `src-tauri/src/lib.rs`, after the `mod cli;` line you added in Task 2, add:

```rust
mod single_instance;
```

- [ ] **Step 3: Call `allow_foreground_handoff()` first in `run()`**

In `src-tauri/src/lib.rs`, make it the very first statement of `pub fn run() {`, before the `portable::ensure_data_dirs()` line:

```rust
pub fn run() {
    // Phase 3E: relax the foreground lock as early as possible. In a second
    // instance this hands the foreground grant to the first instance before the
    // single-instance plugin terminates this process; in the first instance it
    // is harmless. Must run before tauri::Builder (the plugin would exit a
    // second instance before any later code runs).
    single_instance::allow_foreground_handoff();

    // Create data dirs before anything reads/writes them: the log plugin targets
    // logs_dir() and GlobalSettings::load() may write default settings.json.
    portable::ensure_data_dirs().expect("Failed to create data directories");
```

- [ ] **Step 4: Register the plugin FIRST, before the log plugin**

In `src-tauri/src/lib.rs`, change the start of the builder chain from:

```rust
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
```

to:

```rust
    tauri::Builder::default()
        // MUST be first — before the log plugin. A dying second instance exits
        // inside this plugin's setup hook, so no later plugin (incl. log)
        // initializes in it, keeping tapir.log untouched. See single_instance.rs.
        .plugin(single_instance::plugin())
        .plugin(
            tauri_plugin_log::Builder::new()
```

- [ ] **Step 5: Verify it compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS — `single_instance` and all its references (`tray::notify_state_changed`, `cli::handle_args`, the Win32 symbols) resolve.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/single_instance.rs src-tauri/src/lib.rs
git commit -m "feat(single-instance): global mutex, window activation, foreground hand-off"
```

---

### Task 4: Build gates + manual NVDA verification

No code changes — this task verifies the phase against the Done criteria. It is the real acceptance gate (see plan header).

- [ ] **Step 1: Rust build gate**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: PASS (no errors).

- [ ] **Step 2: Frontend sanity gates (no FE changes, must still pass)**

Run: `pnpm test`
Expected: PASS.

Run: `pnpm vite:build`
Expected: PASS (build succeeds).

- [ ] **Step 3: Produce a release-fast binary for realistic double-launch testing**

Run: `just build-fast`
Expected: `src-tauri/target/release-fast/tapir.exe` is produced.

- [ ] **Step 4: Manual NVDA verification (run with NVDA active)**

Verify each Done criterion by launching `tapir.exe`, then launching it a second time:

1. **Window focused (normal):** First instance visible. Launch the exe again → the first window comes to the foreground and **NVDA announces** the focused element. (Silence would mean the foreground hand-off failed — spec §5.)
2. **From minimized:** Minimize the first window, launch again → it un-minimizes, foregrounds, NVDA announces.
3. **From tray:** Close the first window to tray (with `minimizeToTray` enabled) so it is hidden, launch again → it re-appears, foregrounds, NVDA announces.
4. **argv proxy:** Launch the second instance with extra args, e.g. `tapir.exe --foo bar`. Open `data/logs/tapir.log` → it contains a line `CLI args (not yet interpreted, see Phase 3G): argv=[..., "--foo", "bar"], cwd=Some(...)` written by the **first** instance.
5. **Log integrity:** After several double-launches, `data/logs/tapir.log` is intact (not truncated/corrupted) — confirms the plugin-ordering protection.

- [ ] **Step 5: Record the result**

If all pass, proceed to Task 5. If any fail, debug before marking the phase done (for inconsistent activation, spec §5 names the fork-the-plugin fallback).

---

### Task 5: Mark Phase 3E complete in the docs (gated on Task 4 passing)

**Files:**
- Modify: `docs/implementation-phases.md` (summary table row + Done checklist)
- Modify: `AGENTS.md` (phase status table row)

> **CAUTION:** `AGENTS.md` and `docs/implementation-phases.md` already have unrelated uncommitted edits in the working tree. Use targeted `Edit` (string replacement), not `Write`, and change ONLY the 3E lines below — do not revert the pre-existing edits.

- [ ] **Step 1: Summary table status in `docs/implementation-phases.md`**

Change the 3E row (line ~24):

```
| 3E | Single Instance | Named Mutex (глобальний), фокус 1-ї інстанції, передача argv | ⬜ |
```

to:

```
| 3E | Single Instance | Named Mutex (глобальний), фокус 1-ї інстанції, передача argv | ✅ Complete |
```

- [ ] **Step 2: Done checklist in `docs/implementation-phases.md`**

In the "Критерії «Done»" block for Фаза 3E (lines ~424-428), change every `- [ ]` to `- [x]`:

```
- [x] single-instance зареєстрований першим плагіном (перед log)
- [x] Другий запуск → перша інстанція `unminimize+show+set_focus`, працює і з трею
- [x] NVDA озвучує активацію вікна при другому запуску (foreground-handoff)
- [x] argv другого запуску проксюється у спільний CLI-обробник (готовність до 3G)
- [x] Задокументовано: `--datadir` діє лише на першій інстанції (глобальний ключ)
```

- [ ] **Step 3: Phase status table in `AGENTS.md`**

Change the 3E row (line ~19):

```
| Phase 3E — Single Instance | ⬜ Not started | — |
```

to:

```
| Phase 3E — Single Instance | ✅ Complete | `feature/phase-3e-single-instance` |
```

- [ ] **Step 4: Commit**

```bash
git add docs/implementation-phases.md AGENTS.md
git commit -m "docs(single-instance): mark Phase 3E complete"
```

---

## Done criteria → task mapping

| Done criterion (roadmap) | Task |
|---|---|
| single-instance registered first (before log) | Task 3 Step 4 |
| Second launch → first instance show/unminimize/set_focus, works from tray | Task 3 Step 1; Task 4 Step 4.1-4.3 |
| NVDA announces activation (foreground hand-off) | Task 3 Step 1 (`allow_foreground_handoff`); Task 4 Step 4.1 |
| argv proxied to shared CLI handler | Task 2; Task 3 Step 1; Task 4 Step 4.4 |
| Documented: `--datadir` only affects the first instance | Task 3 Step 1 (module doc); Task 5 Step 2 |
