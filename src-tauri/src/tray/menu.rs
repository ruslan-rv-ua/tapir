//! Tray menu and tooltip construction (pure functions).

use crate::tray::MenuSnapshot;

/// Build the Windows tray tooltip from a snapshot. Truncated to 127 chars
/// to fit `NOTIFYICONDATA.szTip` (128 incl. NUL).
pub fn tooltip(_snap: &MenuSnapshot) -> String {
    // Implemented in Task 4
    "Tapir".to_string()
}
