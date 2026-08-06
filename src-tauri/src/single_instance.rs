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
//! `tapir.log` untouched. This matters because the log plugin rotates at
//! initialization too, not only on write: a second instance that reached it
//! could rotate the shared file out from under the first.

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
fn on_second_instance(app: &AppHandle, argv: Vec<String>, _cwd: String) {
    if let Some(window) = app.get_webview_window("main") {
        // Same proven order as the tray "Show" action (tray/handlers.rs):
        // show -> unminimize -> set_focus; set_focus MUST be last. Done
        // synchronously, before the spawn, while the foreground grant is valid.
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    crate::tray::notify_state_changed(app); // tray menu: visibility changed

    // Phase 3G: do NOT block the callback. It runs on the UI thread under the
    // second instance's synchronous SendMessageW(WM_COPYDATA) (spec 3E §5) — the
    // second instance is blocked until we return. Action execution (async, holds
    // manager/player locks) goes to the runtime so the callback returns instantly.
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match crate::cli::parse(&argv) {
            Ok(cli) => {
                crate::cli::execute(
                    &app,
                    crate::cli::plan(cli, crate::cli::CliContext::Forwarded),
                )
                .await
            }
            Err(e) => {
                use clap::error::ErrorKind::*;
                match e.kind() {
                    // help/version have nowhere to print (no console) — stay
                    // silent (NVDA already announced the window activation).
                    DisplayHelp | DisplayHelpOnMissingArgumentOrSubcommand
                    | DisplayVersion => {}
                    // A real parse-error: announce "invalid arguments". This is
                    // where the first instance voices it — the second forwarded
                    // raw argv and never exited on its own parse.
                    _ => crate::cli::feedback(&app, crate::cli::CliFeedback::InvalidArgs),
                }
            }
        }
    });
}
