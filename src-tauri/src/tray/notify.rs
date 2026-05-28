//! Win32 helpers: balloon notifications (Shell_NotifyIconW), quit confirm (MessageBoxW).

use windows::core::HSTRING;
use windows::Win32::UI::WindowsAndMessaging::{
    MessageBoxW, IDYES, MB_DEFBUTTON2, MB_ICONWARNING, MB_SETFOREGROUND, MB_YESNO,
};

/// Show a native Yes/No MessageBox asking whether to quit the app while
/// recordings are active. Returns true if the user confirmed (clicked Yes).
///
/// Uses `MB_DEFBUTTON2` so "No" is the default — pressing Enter dismisses safely.
pub fn show_quit_confirm(active_count: usize) -> bool {
    let title = HSTRING::from("Tapir — підтвердження");
    let body = HSTRING::from(format!(
        "Активних записів: {active_count}.\nВийти з програми і зупинити їх?"
    ));
    let result = unsafe {
        MessageBoxW(
            None,
            &body,
            &title,
            MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2 | MB_SETFOREGROUND,
        )
    };
    result == IDYES
}
