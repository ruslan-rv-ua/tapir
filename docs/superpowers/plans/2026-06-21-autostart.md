# Autostart (Підфаза 3I-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Tapir register itself in `HKCU\…\Run` so it launches at Windows login (optionally minimized to tray), with an accessible two-toggle UI and silent self-healing when the EXE is moved.

**Architecture:** A manual `winreg` autostart module (`src-tauri/src/autostart.rs`) splits a unit-tested pure core (build/parse/reconcile) from a thin impure winreg shell (read/write/delete + `apply`/`reconcile_on_startup`), mirroring the pure/impure split in `cli.rs`. A new `sync_autostart` IPC command applies the registry change immediately with **explicit** args (avoiding the 300 ms debounced-persist race). Startup reconciliation runs before `AppState::new`; an EXE-move deactivation is announced via a one-shot `StartupNotice` drained in `frontend_ready` (same deferred-emit gate as `cli::StartupPlan`). The frontend adds an "Autostart" section to `GeneralTab` with optimistic-update-and-revert, plus a `useAutostartFeedback` hook.

**Tech Stack:** Rust (Tauri v2, `winreg` 0.55 — already a dependency), React 19 + react-aria-components, nanostores, Paraglide i18n, Vitest, `cargo test`.

## Global Constraints

- Branch: `feature/3i-2-autostart`. Slug: `autostart`.
- No new dependencies. `winreg = "0.55"` is already in `src-tauri/Cargo.toml`; `clap`/`--minimize` (Phase 3G) already exist.
- Registry scope is **HKCU only** (`Software\Microsoft\Windows\CurrentVersion\Run`), value name `Tapir`. No HKLM, no admin rights.
- All path comparisons are **case-insensitive** (Windows): use `str::eq_ignore_ascii_case`.
- The registered exe is **always quoted** (paths contain spaces); `--minimize` is appended only when minimized.
- Backend never sends finished UI strings — the frontend localizes via Paraglide. Backend autostart errors surface to the UI for announce + revert; startup-reconcile errors are **logged only** (never block startup, never announced).
- No announcement on every autostart launch.
- Gates (run from repo root `c:\dev\Tapir`): `cargo test --manifest-path src-tauri/Cargo.toml`, `pnpm test`, `pnpm vite:build`. `tsc` has ~51 pre-existing untyped-Paraglide errors and is **not** a gate.
- i18n: edit `src/i18n/messages/{uk,en}.json`, then regenerate the Paraglide output by running `pnpm vite:build` (the `@inlang/paraglide-js` vite plugin compiles `src/i18n/paraglide/` as part of the build). Never hand-edit generated files under `src/i18n/paraglide/`.

---

## File Structure

**Backend (`src-tauri/src/`)**
- `autostart.rs` — **new**. Pure core (`build_run_command`, `exe_path_from_command`, `reconcile`/`Reconcile`) + impure winreg shell (`read/write/delete_run_value`, `apply`, `reconcile_on_startup`) + `StartupNotice` managed-state.
- `settings.rs` — **modify**. Add `autostart_minimized: bool` field (`default_true`, `Default = true`) + tests.
- `lib.rs` — **modify**. Register `mod autostart;`; in `setup`, reconcile before `AppState::new`; register `sync_autostart` in `invoke_handler`.
- `commands/settings_commands.rs` — **modify**. Add the `sync_autostart` command.
- `commands/app_commands.rs` — **modify**. In `frontend_ready`, drain `StartupNotice` and emit `autostart-deactivated`; add `Emitter` import.

**Frontend (`src/`)**
- `lib/tauri.ts` — **modify**. Add `autostartMinimized: boolean` to `GlobalSettings`; add `syncAutostart` wrapper.
- `components/settings/GeneralTab.tsx` — **modify**. Add the "Autostart" section (two checkboxes).
- `components/settings/GeneralTab.test.tsx` — **new**. Behaviour tests for the section.
- `hooks/useAutostartFeedback.ts` — **new**. `autostart-deactivated` → announce + toast.
- `hooks/useAutostartFeedback.test.tsx` — **new**.
- `App.tsx` — **modify**. Wire `useAutostartFeedback()` next to `useCliFeedback()`.
- `i18n/messages/{uk,en}.json` — **modify**. 7 new keys.
- Test fixtures — **modify** (add `autostartMinimized: true`): `components/settings/HotkeysTab.test.tsx`, `components/settings/AudioTab.test.tsx`, `components/player/PlayerPanel.test.tsx`, `components/streams/StreamList.test.tsx`, `lib/transportControl.test.ts`.

**Docs**
- `docs/data-models.md` — **modify**. Document `autostartMinimized` next to `autostart`.

---

### Task 1: Settings field `autostart_minimized`

**Files:**
- Modify: `src-tauri/src/settings.rs`
- Modify: `docs/data-models.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `GlobalSettings.autostart_minimized: bool` (camelCase JSON `autostartMinimized`), default `true`.

- [ ] **Step 1: Write the failing tests**

Add to the `#[cfg(test)] mod tests` block in `src-tauri/src/settings.rs` (after `sort_by_round_trips`):

```rust
    #[test]
    fn autostart_minimized_defaults_to_true() {
        assert!(GlobalSettings::default().autostart_minimized);
    }

    #[test]
    fn legacy_config_without_autostart_minimized_defaults_to_true() {
        // A settings.json written before this field existed must still load,
        // with the new field taking its default (KB-12 / smtc pattern).
        let json = r#"{"language":"en-US","theme":"auto","activeProfile":"Default"}"#;
        let s: GlobalSettings = serde_json::from_str(json).unwrap();
        assert!(s.autostart_minimized);
    }

    #[test]
    fn autostart_minimized_false_round_trips() {
        let mut s = GlobalSettings::default();
        s.autostart_minimized = false;
        let json = serde_json::to_string(&s).unwrap();
        let back: GlobalSettings = serde_json::from_str(&json).unwrap();
        assert!(!back.autostart_minimized);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml autostart_minimized`
Expected: compile error — `no field autostart_minimized on type GlobalSettings`.

- [ ] **Step 3: Add the field**

In `src-tauri/src/settings.rs`, add the field to the `GlobalSettings` struct immediately after the existing `autostart` field (line 35):

```rust
    #[serde(default)]
    pub autostart: bool,
    #[serde(default = "default_true")]
    pub autostart_minimized: bool,
```

Add it to the `impl Default for GlobalSettings` block immediately after `autostart: false,` (line 189):

```rust
            autostart: false,
            autostart_minimized: true,
```

(`default_true` already exists at line 170 — do not redefine it.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml autostart_minimized`
Expected: 3 passed.

- [ ] **Step 5: Document in `docs/data-models.md`**

Edit the TS-interface block — after `  autostart: boolean;` add:

```
  autostart: boolean;
  autostartMinimized: boolean;
```

Edit the Rust-struct block — after `    pub autostart: bool,` add:

```
    pub autostart: bool,
    pub autostart_minimized: bool,
```

Edit the example-JSON block — after the line `  "autostart": false,` (the one inside the full JSON example near the end of the file) add:

```
  "autostart": false,
  "autostartMinimized": true,
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/settings.rs docs/data-models.md
git commit -m "feat(autostart): add autostart_minimized setting (default true)"
```

---

### Task 2: `autostart` module — pure core + winreg shell + StartupNotice

**Files:**
- Create: `src-tauri/src/autostart.rs`
- Modify: `src-tauri/src/lib.rs` (register `mod autostart;`)

**Interfaces:**
- Consumes: `crate::errors::RadioError`; `winreg`; `std::env::current_exe`.
- Produces (used by Tasks 3 & 4):
  - `pub fn apply(enabled: bool, minimized: bool) -> Result<(), RadioError>`
  - `pub fn reconcile_on_startup(autostart: bool, minimized: bool) -> bool` (returns `true` only on EXE-move deactivation)
  - `pub struct StartupNotice` with `pub fn moved() -> Self` and `pub fn take(&self) -> Option<()>`

- [ ] **Step 1: Register the module**

In `src-tauri/src/lib.rs`, add `mod autostart;` immediately after `mod app_state;` (line 1):

```rust
mod app_state;
mod autostart;
mod commands;
```

- [ ] **Step 2: Write the module with pure core, impure shell, and failing unit tests**

Create `src-tauri/src/autostart.rs`:

```rust
//! Windows autostart (Підфаза 3I-2): a `HKCU\…\Run` entry that launches Tapir
//! at login, optionally with `--minimize` (start in tray, NVDA-friendly via the
//! Phase 3G show→focus→hide sequence in `lib.rs setup`).
//!
//! Manual `winreg` (not `tauri-plugin-autostart`): the registered command is
//! conditional on the `autostart_minimized` toggle, and we compare the stored
//! path against `current_exe()` to self-heal / deactivate on EXE move. A pure
//! core (build/parse/reconcile — unit-tested) is split from a thin winreg shell
//! (read/write/delete + `apply`/`reconcile_on_startup` — verified manually with
//! NVDA), the same split as `cli.rs`.

use crate::errors::RadioError;

/// HKCU subkey holding per-user autostart entries.
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
/// Our value name under that key.
const VALUE_NAME: &str = "Tapir";

// ───────────────────────── pure core (unit-tested) ─────────────────────────

/// Build the `Run` command. The exe is ALWAYS quoted (the path may contain
/// spaces); `minimized` appends ` --minimize` (start in tray).
fn build_run_command(exe: &str, minimized: bool) -> String {
    if minimized {
        format!("\"{exe}\" --minimize")
    } else {
        format!("\"{exe}\"")
    }
}

/// Extract the exe path from a stored `Run` value. Handles a leading quote (our
/// own writes are quoted) and, for unquoted values, takes the first
/// whitespace-delimited token. Returns the path WITHOUT quotes, or `None` for an
/// empty / empty-quotes / unterminated-quote value.
fn exe_path_from_command(value: &str) -> Option<String> {
    let v = value.trim();
    if v.is_empty() {
        return None;
    }
    if let Some(rest) = v.strip_prefix('"') {
        match rest.find('"') {
            Some(end) if end > 0 => Some(rest[..end].to_string()),
            _ => None, // empty quotes or unterminated quote → unparseable
        }
    } else {
        v.split_whitespace().next().map(str::to_string)
    }
}

/// Case-insensitive compare (Windows paths). ASCII-only folding is enough: any
/// non-ASCII (e.g. a Cyrillic username) comes from the same `current_exe()`
/// source on both sides, so it already matches byte-for-byte.
fn eq_ic(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b)
}

/// The action `reconcile` decides for the `Run` entry.
#[derive(Debug, PartialEq, Eq)]
enum Reconcile {
    /// Nothing to do.
    None,
    /// (Re)write the value with this exact command.
    Write(String),
    /// `autostart=false` but an entry exists — remove it (silent).
    DeleteStale,
    /// The registered exe ≠ current — EXE moved; remove, flip flag, announce.
    DisableMoved,
}

/// Pure decision: compare desired `(autostart, minimized, current_exe)` against
/// the `registered` value. All path comparisons are case-insensitive.
fn reconcile(
    autostart: bool,
    minimized: bool,
    current_exe: &str,
    registered: Option<&str>,
) -> Reconcile {
    let desired = build_run_command(current_exe, minimized);
    match registered {
        None => {
            if autostart {
                Reconcile::Write(desired)
            } else {
                Reconcile::None
            }
        }
        Some(reg) => {
            if !autostart {
                return Reconcile::DeleteStale;
            }
            match exe_path_from_command(reg) {
                Some(e) if eq_ic(&e, current_exe) => {
                    if eq_ic(reg, &desired) {
                        Reconcile::None
                    } else {
                        Reconcile::Write(desired) // minimized flag changed
                    }
                }
                Some(_) => Reconcile::DisableMoved, // a DIFFERENT path → moved
                None => Reconcile::Write(desired),  // unparseable → silent self-heal
            }
        }
    }
}

// ──────────────────── impure winreg shell (manual verify) ───────────────────

/// `current_exe()` as a String. Both `apply` and `reconcile_on_startup` build
/// the command from this same source, so a value stored by `apply` equals the
/// value rebuilt at startup (otherwise reconcile would issue a spurious Write).
fn current_exe_string() -> Result<String, RadioError> {
    Ok(std::env::current_exe()?.to_string_lossy().into_owned())
}

/// Read the `Run` value. `None` if the key or value is absent.
fn read_run_value() -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let run = RegKey::predef(HKEY_CURRENT_USER).open_subkey(RUN_KEY).ok()?;
    run.get_value::<String, _>(VALUE_NAME).ok()
}

/// Write (create or overwrite) the `Run` value.
fn write_run_value(command: &str) -> Result<(), RadioError> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let (run, _) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(RUN_KEY)?;
    run.set_value(VALUE_NAME, &command)?;
    log::info!("autostart: wrote Run value {command:?}");
    Ok(())
}

/// Delete the `Run` value. `Ok` if it is already absent.
fn delete_run_value() -> Result<(), RadioError> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
    use winreg::RegKey;
    let run = match RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(RUN_KEY, KEY_SET_VALUE)
    {
        Ok(k) => k,
        Err(_) => return Ok(()), // no key → nothing to delete
    };
    match run.delete_value(VALUE_NAME) {
        Ok(()) => {
            log::info!("autostart: deleted Run value");
            Ok(())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

/// Drive the `Run` entry to match `(enabled, minimized)`. Called from the
/// `sync_autostart` IPC command. `enabled=false` → delete; `enabled=true` →
/// write `current_exe` (± `--minimize`). Errors propagate so the UI can
/// announce + revert.
pub fn apply(enabled: bool, minimized: bool) -> Result<(), RadioError> {
    if !enabled {
        return delete_run_value();
    }
    let exe = current_exe_string()?;
    write_run_value(&build_run_command(&exe, minimized))
}

/// Called once in `setup`. Reads the `Run` value, runs `reconcile`, performs the
/// action. Returns `true` ONLY on `DisableMoved` (caller flips `autostart=false`,
/// persists, and defers an NVDA announcement). All winreg errors are logged only
/// — startup is never blocked.
pub fn reconcile_on_startup(autostart: bool, minimized: bool) -> bool {
    let exe = match current_exe_string() {
        Ok(e) => e,
        Err(e) => {
            log::warn!("autostart: current_exe() failed, skipping reconcile: {e}");
            return false;
        }
    };
    let registered = read_run_value();
    match reconcile(autostart, minimized, &exe, registered.as_deref()) {
        Reconcile::None => false,
        Reconcile::Write(cmd) => {
            if let Err(e) = write_run_value(&cmd) {
                log::warn!("autostart: startup write failed: {e}");
            }
            false
        }
        Reconcile::DeleteStale => {
            if let Err(e) = delete_run_value() {
                log::warn!("autostart: startup delete (stale) failed: {e}");
            }
            false
        }
        Reconcile::DisableMoved => {
            if let Err(e) = delete_run_value() {
                log::warn!("autostart: startup delete (moved) failed: {e}");
            }
            log::info!("autostart: registered exe differs from current — deactivating");
            true
        }
    }
}

/// One-shot startup notice that an EXE move deactivated autostart, drained from
/// `frontend_ready` (deferred so the announcement is not emitted before the
/// webview subscribes — same gate as `cli::StartupPlan`). `take()` is one-shot
/// (reload-safe).
pub struct StartupNotice(std::sync::Mutex<Option<()>>);

impl StartupNotice {
    pub fn moved() -> Self {
        Self(std::sync::Mutex::new(Some(())))
    }
    pub fn take(&self) -> Option<()> {
        self.0.lock().unwrap().take()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_command_quotes_exe_without_minimize() {
        assert_eq!(
            build_run_command(r"C:\a b\tapir.exe", false),
            r#""C:\a b\tapir.exe""#
        );
    }

    #[test]
    fn build_command_appends_minimize() {
        assert_eq!(
            build_run_command(r"C:\a b\tapir.exe", true),
            r#""C:\a b\tapir.exe" --minimize"#
        );
    }

    #[test]
    fn parse_quoted_path_with_args() {
        assert_eq!(
            exe_path_from_command(r#""C:\a b\tapir.exe" --minimize"#).as_deref(),
            Some(r"C:\a b\tapir.exe")
        );
    }

    #[test]
    fn parse_quoted_path_no_args() {
        assert_eq!(
            exe_path_from_command(r#""C:\x\tapir.exe""#).as_deref(),
            Some(r"C:\x\tapir.exe")
        );
    }

    #[test]
    fn parse_unquoted_takes_first_token() {
        assert_eq!(
            exe_path_from_command(r"C:\x\tapir.exe").as_deref(),
            Some(r"C:\x\tapir.exe")
        );
    }

    #[test]
    fn parse_empty_or_garbage_is_none() {
        assert_eq!(exe_path_from_command(""), None);
        assert_eq!(exe_path_from_command("   "), None);
        assert_eq!(exe_path_from_command("\"\""), None); // empty quotes
        assert_eq!(exe_path_from_command("\"unterminated"), None);
    }

    const EXE: &str = r"C:\app\tapir.exe";

    // ── full reconcile table (7 rows) ──

    #[test]
    fn reconcile_absent_enabled_writes() {
        // row: true / absent → Write (silent self-heal)
        assert_eq!(
            reconcile(true, false, EXE, None),
            Reconcile::Write(r#""C:\app\tapir.exe""#.to_string())
        );
    }

    #[test]
    fn reconcile_absent_disabled_is_none() {
        // row: false / absent → None
        assert_eq!(reconcile(false, false, EXE, None), Reconcile::None);
    }

    #[test]
    fn reconcile_matching_command_is_none() {
        // row: true / exe==current, command matches → None
        assert_eq!(
            reconcile(true, false, EXE, Some(r#""C:\app\tapir.exe""#)),
            Reconcile::None
        );
    }

    #[test]
    fn reconcile_case_insensitive_path_match_is_none() {
        // same row, different drive-letter/path case → still a match
        assert_eq!(
            reconcile(true, false, EXE, Some(r#""c:\APP\TAPIR.EXE""#)),
            Reconcile::None
        );
    }

    #[test]
    fn reconcile_minimized_changed_rewrites() {
        // row: true / exe==current, command differs (minimized flipped) → Write
        assert_eq!(
            reconcile(true, true, EXE, Some(r#""C:\app\tapir.exe""#)),
            Reconcile::Write(r#""C:\app\tapir.exe" --minimize"#.to_string())
        );
    }

    #[test]
    fn reconcile_moved_exe_disables() {
        // row: true / exe ≠ current → DisableMoved
        assert_eq!(
            reconcile(true, true, EXE, Some(r#""D:\other\tapir.exe" --minimize"#)),
            Reconcile::DisableMoved
        );
    }

    #[test]
    fn reconcile_unparseable_value_self_heals() {
        // row: true / unparseable value (exe not parsed) → Write (silent)
        assert_eq!(
            reconcile(true, false, EXE, Some("\"\"")),
            Reconcile::Write(r#""C:\app\tapir.exe""#.to_string())
        );
    }

    #[test]
    fn reconcile_disabled_with_entry_deletes() {
        // row: false / present → DeleteStale
        assert_eq!(
            reconcile(false, false, EXE, Some(r#""C:\app\tapir.exe""#)),
            Reconcile::DeleteStale
        );
    }

    #[test]
    fn startup_notice_take_is_one_shot() {
        let n = StartupNotice::moved();
        assert_eq!(n.take(), Some(()));
        assert_eq!(n.take(), None, "second take must be empty (reload-safe)");
    }
}
```

- [ ] **Step 3: Run the unit tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml autostart::tests`
Expected: 15 passed (2 build + 4 parse + 7-row reconcile table + case-insensitive variant + one-shot). Confirm no `dead_code` warnings (every private fn is reachable from `pub apply`/`reconcile_on_startup`).

- [ ] **Step 4: Verify the whole crate still compiles**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all tests pass (no regressions).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/autostart.rs src-tauri/src/lib.rs
git commit -m "feat(autostart): winreg autostart module (pure reconcile core + shell)"
```

---

### Task 3: IPC command `sync_autostart`

**Files:**
- Modify: `src-tauri/src/commands/settings_commands.rs`
- Modify: `src-tauri/src/lib.rs` (register in `invoke_handler`)

**Interfaces:**
- Consumes: `crate::autostart::apply` (Task 2).
- Produces: tauri command `sync_autostart(enabled: bool, minimized: bool) -> Result<(), String>` (frontend invoke name `"sync_autostart"`, args `{ enabled, minimized }`).

- [ ] **Step 1: Add the command**

Append to `src-tauri/src/commands/settings_commands.rs` (after `open_directory_picker`):

```rust
/// Привести реєстр `Run` у відповідність до (enabled, minimized). Frontend
/// передає значення ЯВНО (не читаємо `state.settings`): `useAutoSave` дебаунсить
/// persist на 300 мс, тож стан тут був би застарілим — явні аргументи усувають
/// гонку. Окрема команда (а не як SMTC у `save_settings`), бо реєстровий запис
/// може впасти, і незрячий користувач має почути про це: помилка повертається у
/// фронт для оголошення + revert. `spawn_blocking` — winreg це блокувальний I/O.
#[tauri::command]
pub async fn sync_autostart(enabled: bool, minimized: bool) -> Result<(), String> {
    tokio::task::spawn_blocking(move || crate::autostart::apply(enabled, minimized))
        .await
        .map_err(|e| e.to_string())?
        .map_err(Into::into)
}
```

(`From<RadioError> for String` exists in `errors.rs`, so `.map_err(Into::into)` resolves `RadioError → String`.)

- [ ] **Step 2: Register the command**

In `src-tauri/src/lib.rs`, add to the `tauri::generate_handler![…]` list, immediately after `commands::settings_commands::save_settings,` (line 241):

```rust
            commands::settings_commands::save_settings,
            commands::settings_commands::sync_autostart,
```

- [ ] **Step 3: Verify it compiles and tests pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: compiles cleanly, all tests pass. (No new unit test — this is thin orchestration over the already-tested `apply`; the real path is exercised in manual NVDA verification.)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/settings_commands.rs src-tauri/src/lib.rs
git commit -m "feat(autostart): sync_autostart IPC command (explicit args, spawn_blocking)"
```

---

### Task 4: Startup reconciliation + deferred deactivation announce

**Files:**
- Modify: `src-tauri/src/lib.rs` (`setup`)
- Modify: `src-tauri/src/commands/app_commands.rs` (`frontend_ready`)

**Interfaces:**
- Consumes: `crate::autostart::{reconcile_on_startup, StartupNotice}` (Task 2).
- Produces: backend event `autostart-deactivated` (empty payload), emitted once from `frontend_ready` after the webview subscribes.

- [ ] **Step 1: Reconcile before `AppState::new`**

In `src-tauri/src/lib.rs`, the `setup` closure currently has (line 152):

```rust
            let settings = initial_settings;
            let profile = Profile::load(&settings.active_profile).expect("Failed to load profile");
```

Change to:

```rust
            let mut settings = initial_settings;
            // Підфаза 3I-2: звірити реєстр Run з current_exe() ДО AppState::new
            // (воно споживає settings). DisableMoved → скинути прапорець,
            // персистити, і відкласти оголошення до frontend_ready (webview ще
            // не підписаний на події — той самий гейт, що StartupPlan/scheduler).
            let moved = autostart::reconcile_on_startup(
                settings.autostart,
                settings.autostart_minimized,
            );
            if moved {
                settings.autostart = false;
                let _ = settings.save();
                app.manage(autostart::StartupNotice::moved());
            }
            let profile = Profile::load(&settings.active_profile).expect("Failed to load profile");
```

- [ ] **Step 2: Drain the notice and emit from `frontend_ready`**

In `src-tauri/src/commands/app_commands.rs`, change the import on line 2:

```rust
use tauri::Manager;
```

to:

```rust
use tauri::{Emitter, Manager};
```

Then, inside `frontend_ready`, after the `StartupPlan` drain block (after its closing `}` and before `Ok(())`), add:

```rust
    // Підфаза 3I-2: якщо при старті виявлено переміщення EXE — оголосити ОДИН раз.
    // Deferred сюди (як StartupPlan): емісія до підписки webview = втрачене
    // оголошення. take() робить це ідемпотентним на reload.
    if let Some(notice) = app.try_state::<crate::autostart::StartupNotice>() {
        if notice.take().is_some() {
            let _ = app.emit("autostart-deactivated", ());
        }
    }

    Ok(())
```

- [ ] **Step 3: Verify it compiles and tests pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: compiles cleanly (no unused-import warning for `Emitter`), all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/commands/app_commands.rs
git commit -m "feat(autostart): startup reconcile + deferred EXE-move deactivation announce"
```

---

### Task 5: Frontend plumbing — type, binding, i18n, fixtures

**Files:**
- Modify: `src/lib/tauri.ts`
- Modify: `src/i18n/messages/uk.json`, `src/i18n/messages/en.json`
- Modify: `src/components/settings/HotkeysTab.test.tsx`, `src/components/settings/AudioTab.test.tsx`, `src/components/player/PlayerPanel.test.tsx`, `src/components/streams/StreamList.test.tsx`, `src/lib/transportControl.test.ts`

**Interfaces:**
- Produces (used by Tasks 6 & 7):
  - `GlobalSettings.autostartMinimized: boolean`
  - `syncAutostart(enabled: boolean, minimized: boolean): Promise<void>` (invokes `"sync_autostart"`)
  - i18n keys: `settings_section_autostart`, `settings_autostart`, `settings_autostart_minimized`, `autostart_enabled`, `autostart_disabled`, `autostart_error`, `autostart_deactivated_moved`

- [ ] **Step 1: Add the type field and IPC wrapper in `src/lib/tauri.ts`**

In the `GlobalSettings` interface, after `autostart: boolean;` (line 87) add:

```ts
  autostart: boolean;
  autostartMinimized: boolean;
```

After the `saveSettings` wrapper (line 168-170) add:

```ts
export async function syncAutostart(enabled: boolean, minimized: boolean): Promise<void> {
  return invoke("sync_autostart", { enabled, minimized });
}
```

- [ ] **Step 2: Add the 7 i18n keys to both message files**

In `src/i18n/messages/uk.json`, after the line `"settings_minimize_to_tray": "Згортати до tray замість закриття",` add:

```json
  "settings_section_autostart": "Автозапуск",
  "settings_autostart": "Запускати разом із Windows",
  "settings_autostart_minimized": "Запускати мінімізованим",
  "autostart_enabled": "Автозапуск увімкнено",
  "autostart_disabled": "Автозапуск вимкнено",
  "autostart_error": "Не вдалося змінити автозапуск",
  "autostart_deactivated_moved": "Автозапуск вимкнено: виявлено переміщення застосунку",
```

In `src/i18n/messages/en.json`, after the line `"settings_minimize_to_tray": "Minimize to tray instead of closing",` add:

```json
  "settings_section_autostart": "Autostart",
  "settings_autostart": "Launch with Windows",
  "settings_autostart_minimized": "Launch minimized",
  "autostart_enabled": "Autostart enabled",
  "autostart_disabled": "Autostart disabled",
  "autostart_error": "Could not change autostart",
  "autostart_deactivated_moved": "Autostart disabled: the app was moved",
```

- [ ] **Step 3: Regenerate Paraglide output**

Run: `pnpm vite:build`
Expected: build succeeds; the Paraglide vite plugin writes the 7 new message functions into `src/i18n/paraglide/`. (This also serves as the build gate.) Confirm the new functions exist:

Run: `pnpm exec vitest run src/components/settings/AudioTab.test.tsx`
Expected: still passes (proves the regenerated messages module imports cleanly).

- [ ] **Step 4: Add `autostartMinimized: true` to the 5 existing fixtures**

In each `baseSettings` object, add `autostartMinimized: true,` immediately after the `autostart: false,` entry:

- `src/components/settings/HotkeysTab.test.tsx` (line 37): change

```ts
  autostart: false,
```
to
```ts
  autostart: false,
  autostartMinimized: true,
```

- `src/components/settings/AudioTab.test.tsx` (line 27): change

```ts
  autostart: false,
```
to
```ts
  autostart: false,
  autostartMinimized: true,
```

- `src/components/player/PlayerPanel.test.tsx` (line 20): change

```ts
  autostart: false, autoAdvance: true, prevRestartThresholdMs: 0,
```
to
```ts
  autostart: false, autostartMinimized: true, autoAdvance: true, prevRestartThresholdMs: 0,
```

- `src/components/streams/StreamList.test.tsx` (line 56): change

```ts
  autostart: false, autoAdvance: false, prevRestartThresholdMs: 0,
```
to
```ts
  autostart: false, autostartMinimized: true, autoAdvance: false, prevRestartThresholdMs: 0,
```

- `src/lib/transportControl.test.ts` (line 52): change

```ts
  autostart: false, autoAdvance: true, prevRestartThresholdMs: 0,
```
to
```ts
  autostart: false, autostartMinimized: true, autoAdvance: true, prevRestartThresholdMs: 0,
```

- [ ] **Step 5: Run the full frontend suite**

Run: `pnpm test`
Expected: all tests pass (the new required field is satisfied in every fixture).

- [ ] **Step 6: Commit**

```bash
git add src/lib/tauri.ts src/i18n/messages/uk.json src/i18n/messages/en.json src/i18n/paraglide src/components/settings/HotkeysTab.test.tsx src/components/settings/AudioTab.test.tsx src/components/player/PlayerPanel.test.tsx src/components/streams/StreamList.test.tsx src/lib/transportControl.test.ts
git commit -m "feat(autostart): frontend type, syncAutostart binding, i18n keys, fixtures"
```

---

### Task 6: GeneralTab "Autostart" section

**Files:**
- Modify: `src/components/settings/GeneralTab.tsx`
- Create: `src/components/settings/GeneralTab.test.tsx`

**Interfaces:**
- Consumes: `settings.autostart`, `settings.autostartMinimized`, `tauri.syncAutostart`, `m.settings_section_autostart`/`m.settings_autostart`/`m.settings_autostart_minimized`/`m.autostart_enabled`/`m.autostart_disabled`/`m.autostart_error` (Task 5), `useAnnounce`, `addToast`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Create `src/components/settings/GeneralTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import * as m from "../../i18n/paraglide/messages";
import { GeneralTab } from "./GeneralTab";
import { $settings } from "../../stores/settings";
import type { GlobalSettings } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  saveSettings: vi.fn().mockResolvedValue(undefined),
  syncAutostart: vi.fn().mockResolvedValue(undefined),
}));

const baseSettings: GlobalSettings = {
  language: "en-US",
  theme: "auto",
  activeProfile: "Default",
  outputDevice: null,
  minimizeToTray: false,
  showTrayNotifications: true,
  showTrackInTitle: true,
  diskSpaceThresholdGb: 1,
  doubleClickAction: "play",
  sortBy: "name",
  bandwidthLimitKbps: 0,
  autostart: false,
  autostartMinimized: true,
  autoAdvance: true,
  prevRestartThresholdMs: 0,
  smtcEnabled: true,
  hotkeys: {
    toggleRecording: "", togglePlayback: "", volumeUp: "", volumeDown: "",
    toggleWindow: "", stopAll: "", prevTrack: "", nextTrack: "",
  },
  logRotation: true,
  logMaxSizeMb: 10,
  logLevel: "info",
};

beforeEach(() => {
  vi.clearAllMocks();
  $settings.set(baseSettings);
});

afterEach(() => {
  $settings.set(null);
});

function autostartCheckbox(getByRole: ReturnType<typeof render>["getByRole"]) {
  return getByRole("checkbox", { name: new RegExp(m.settings_autostart()) });
}
function minimizedCheckbox(getByRole: ReturnType<typeof render>["getByRole"]) {
  return getByRole("checkbox", { name: new RegExp(m.settings_autostart_minimized()) });
}

describe("GeneralTab — Autostart", () => {
  it("enabling 'Launch with Windows' writes the store and calls syncAutostart(true, minimized)", () => {
    const { getByRole } = render(<GeneralTab />);
    fireEvent.click(autostartCheckbox(getByRole));
    expect($settings.get()?.autostart).toBe(true);
    expect(tauri.syncAutostart).toHaveBeenCalledWith(true, true);
  });

  it("'Launch minimized' is disabled while autostart is off", () => {
    const { getByRole } = render(<GeneralTab />);
    expect(minimizedCheckbox(getByRole)).toBeDisabled();
  });

  it("'Launch minimized' is enabled when autostart is on", () => {
    $settings.set({ ...baseSettings, autostart: true });
    const { getByRole } = render(<GeneralTab />);
    expect(minimizedCheckbox(getByRole)).not.toBeDisabled();
  });

  it("reverts the optimistic update when syncAutostart rejects", async () => {
    (tauri.syncAutostart as Mock).mockRejectedValueOnce(new Error("registry blocked"));
    const { getByRole } = render(<GeneralTab />);
    fireEvent.click(autostartCheckbox(getByRole));
    // optimistic flip happened synchronously…
    expect($settings.get()?.autostart).toBe(true);
    // …then the rejected promise reverts it.
    await waitFor(() => expect($settings.get()?.autostart).toBe(false));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/components/settings/GeneralTab.test.tsx`
Expected: FAIL — no Autostart checkboxes found (`Unable to find an accessible element with the role "checkbox" and name …`).

- [ ] **Step 3: Add the section to `GeneralTab.tsx`**

Add two imports at the top of `src/components/settings/GeneralTab.tsx` (after the `logLevel` import on line 22):

```tsx
import { isVerbose, toggleVerbose } from "../../lib/logLevel";
import { useAnnounce } from "../../hooks/useAnnounce";
import { addToast } from "../../stores/toasts";
```

Inside the `GeneralTab` component, after `const settings = useStore($settings);` and the null guard (line 25-26), add:

```tsx
  const settings = useStore($settings);
  if (!settings) return null;

  const announce = useAnnounce();
```

Insert the new section between the Behavior section's closing `</div>` (line 200) and the Logging section's opening `<div>` (line 202):

```tsx
      </div>

      {/* Section: Autostart */}
      <div className="space-y-3 border-t border-slate-700 pt-4">
        <h3 className="text-sm font-semibold text-slate-200">{m.settings_section_autostart()}</h3>

      {/* Launch with Windows */}
      <Checkbox
        isSelected={settings.autostart}
        onChange={async (val) => {
          update({ autostart: val }); // optimistic + debounced persist
          try {
            await tauri.syncAutostart(val, settings.autostartMinimized);
            announce(val ? m.autostart_enabled() : m.autostart_disabled(), "polite");
          } catch {
            update({ autostart: !val }); // revert — never lie to NVDA
            announce(m.autostart_error(), "assertive");
            addToast(m.autostart_error(), "error");
          }
        }}
        className="flex items-center gap-2 text-sm text-slate-300"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">
          {settings.autostart && <span>✓</span>}
        </div>
        <Label>{m.settings_autostart()}</Label>
      </Checkbox>

      {/* Launch minimized — disabled while autostart is off (an inert control
          confuses a screen-reader user) */}
      <Checkbox
        isSelected={settings.autostartMinimized}
        isDisabled={!settings.autostart}
        onChange={async (val) => {
          update({ autostartMinimized: val });
          try {
            // autostart is always true here (else this control is disabled)
            await tauri.syncAutostart(settings.autostart, val);
          } catch {
            update({ autostartMinimized: !val }); // revert
            announce(m.autostart_error(), "assertive");
            addToast(m.autostart_error(), "error");
          }
        }}
        className="flex items-center gap-2 text-sm text-slate-300 data-[disabled]:opacity-50"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">
          {settings.autostartMinimized && <span>✓</span>}
        </div>
        <Label>{m.settings_autostart_minimized()}</Label>
      </Checkbox>
      </div>

      {/* Logging */}
```

(The trailing `{/* Logging */}` comment marks where the existing Logging section continues — do not duplicate it; it shows the insertion point.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/components/settings/GeneralTab.test.tsx`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/GeneralTab.tsx src/components/settings/GeneralTab.test.tsx
git commit -m "feat(autostart): GeneralTab Autostart section (optimistic update + revert)"
```

---

### Task 7: `useAutostartFeedback` hook + App wiring

**Files:**
- Create: `src/hooks/useAutostartFeedback.ts`
- Create: `src/hooks/useAutostartFeedback.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: backend event `autostart-deactivated` (Task 4); `m.autostart_deactivated_moved` (Task 5); `useTauriEvent`, `useAnnounce`, `addToast`.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useAutostartFeedback.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { $announcer } from "../stores/announcer";
import { $toasts } from "../stores/toasts";

type Handler = (e: { payload: unknown }) => void;
const handlers = new Map<string, Handler>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: Handler) => {
    handlers.set(event, cb);
    return () => handlers.delete(event);
  }),
}));

vi.mock("../i18n/paraglide/messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../i18n/paraglide/messages")>();
  return { ...actual, autostart_deactivated_moved: () => "moved-msg" };
});

import { useAutostartFeedback } from "./useAutostartFeedback";

function Host() {
  useAutostartFeedback();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  $announcer.set(null);
  $toasts.set([]);
});

describe("useAutostartFeedback", () => {
  it("autostart-deactivated → polite announce + info toast", async () => {
    render(<Host />);
    await vi.waitFor(() => expect(handlers.has("autostart-deactivated")).toBe(true));
    handlers.get("autostart-deactivated")!({ payload: undefined });
    expect($announcer.get()).toEqual({ message: "moved-msg", priority: "polite" });
    expect(
      $toasts.get().some((t) => t.message === "moved-msg" && t.type === "info"),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/hooks/useAutostartFeedback.test.tsx`
Expected: FAIL — `Cannot find module './useAutostartFeedback'`.

- [ ] **Step 3: Create the hook**

Create `src/hooks/useAutostartFeedback.ts`:

```ts
import { useCallback } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { useAnnounce } from "./useAnnounce";
import { addToast } from "../stores/toasts";
import * as m from "../i18n/paraglide/messages";

/**
 * Озвучення тихої деактивації автозапуску при старті (EXE переміщено). Той самий
 * патерн, що useCliFeedback: backend емітить порожню подію `autostart-deactivated`
 * лише ПІСЛЯ підписки webview (deferred у frontend_ready), фронт локалізує через
 * Paraglide й озвучує polite + info-toast. Працює і в модалці (data-live-announcer).
 */
export function useAutostartFeedback(): void {
  const announce = useAnnounce();

  useTauriEvent<void>(
    "autostart-deactivated",
    useCallback(() => {
      const msg = m.autostart_deactivated_moved();
      announce(msg, "polite");
      addToast(msg, "info");
    }, [announce]),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/hooks/useAutostartFeedback.test.tsx`
Expected: 1 passed.

- [ ] **Step 5: Wire it into `App.tsx`**

Add the import after the `useCliFeedback` import (line 22):

```tsx
import { useCliFeedback } from "./hooks/useCliFeedback";
import { useAutostartFeedback } from "./hooks/useAutostartFeedback";
```

Call it after `useCliFeedback();` (line 315):

```tsx
  useCliFeedback();
  useAutostartFeedback();
```

- [ ] **Step 6: Run the full frontend suite**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useAutostartFeedback.ts src/hooks/useAutostartFeedback.test.tsx src/App.tsx
git commit -m "feat(autostart): useAutostartFeedback hook for EXE-move deactivation announce"
```

---

### Task 8: Final gates + manual NVDA verification

**Files:** none (verification + backlog bookkeeping only).

- [ ] **Step 1: Run all automated gates**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
pnpm test
pnpm vite:build
```
Expected: all green. (Ignore the ~51 pre-existing untyped-Paraglide `tsc` errors — `tsc` is not a gate.)

- [ ] **Step 2: Build the real app and verify with NVDA (cannot be unit-tested)**

Run: `pnpm build` (produces the actual EXE).

Then manually confirm each backlog acceptance criterion:
- Toggle "Launch with Windows" in Settings → General is reachable and operable with NVDA.
- Enabling it creates `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\Tapir` = `"…\tapir.exe"` (or `… --minimize` when "Launch minimized" is on). Verify with `reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v Tapir`.
- Disabling it removes the value.
- Restart Windows (or log off/on) with autostart on + minimized → Tapir launches to the tray icon only; NVDA attaches (Phase 3G show→focus→hide).
- Move/rename the EXE, relaunch → the `Run` value is removed silently, `autostart` flips to `false` in `settings.json`, and NVDA announces "Автозапуск вимкнено: виявлено переміщення застосунку" once.
- "Launch minimized" is disabled (greyed, NVDA reports unavailable) while "Launch with Windows" is off.
- After a normal restart, both toggles reflect the persisted state.

- [ ] **Step 3: Mark the backlog item done**

Update `docs/backlog/p2-autostart.md` acceptance checkboxes (or remove the item if your convention is to delete completed backlog entries — match the surrounding files), then:

```bash
git add docs/backlog/p2-autostart.md
git commit -m "docs(backlog): mark autostart (3I-2) complete"
```

> After this task, use **superpowers:finishing-a-development-branch** to decide how to integrate `feature/3i-2-autostart` (note: per project convention, local `main` is the initial commit only — do not auto-merge; ask the user how they integrate).

---

## Notes / known edge cases (from the design spec — already handled by the code above)

- **Multiple EXE copies / dev runs.** `DisableMoved` removes a `Run` value pointing at a different copy. A `just dev`/`pnpm dev` debug build has a different `current_exe()` than a real build, so launching dev with `autostart=true` persisted from a real build will delete the real `Run` entry and reset the flag. Expected (different exe); just be aware during development.
- **Self-heal.** A failed earlier write (e.g. enterprise policy blocks `Run`) leaves `autostart=true` with no entry; `reconcile_on_startup` re-writes (`Write` row). If `apply` fails live, the UI reverts the toggle (Task 6), keeping persisted state consistent with reality.
- **Persist/sync race.** `sync_autostart` takes explicit args (not `state.settings`) precisely because `useAutoSave` debounces persist by 300 ms; any rare divergence is realigned by `reconcile_on_startup` at next launch.
