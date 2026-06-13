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
