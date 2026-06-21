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
