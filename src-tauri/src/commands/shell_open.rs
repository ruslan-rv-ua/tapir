//! Handing a path to the Windows shell, shared by the Songs and Streams
//! managers. Lives in its own module so neither commands module has to depend on
//! the other — and so there is exactly one place that initializes an STA.

/// Stable error codes returned by every command that calls [`shell_open`]. Part
/// of the IPC contract: the frontend maps each one to its own localized toast,
/// so do not reword them. Not every caller can produce every code — songs never
/// fail to write, streams never open a file that is already gone.
pub(crate) const SHELL_ERR_NOT_FOUND: &str = "not_found";
pub(crate) const SHELL_ERR_NO_ASSOC: &str = "no_assoc";
pub(crate) const SHELL_ERR_GENERIC: &str = "generic";

/// `ShellExecuteW` returns an HINSTANCE that is really a status code when <= 32.
/// Pure so the mapping is unit-testable without launching anything.
fn map_shell_error(code: isize) -> &'static str {
    match code {
        // SE_ERR_FNF (== ERROR_FILE_NOT_FOUND) and SE_ERR_PNF.
        2 | 3 => SHELL_ERR_NOT_FOUND,
        // SE_ERR_NOASSOC — no app registered for this extension.
        31 => SHELL_ERR_NO_ASSOC,
        _ => SHELL_ERR_GENERIC,
    }
}

/// Hand `path` to the shell's "open" verb — the same thing a double-click in
/// Explorer does, without the argument-escaping class of bugs that `cmd /c start`
/// (and `explorer /select`) drags in.
pub(crate) fn shell_open(path: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{PCWSTR, w};
    use windows::Win32::System::Com::{
        CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
    };
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let wide: Vec<u16> = std::ffi::OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        // ShellExecuteW wants COM initialized as an STA (MSDN Remarks). Tokio's
        // blocking threads carry no apartment, so initialize one here. The thread
        // goes back to the pool afterwards, hence the paired CoUninitialize —
        // but only when we were the ones who initialized it (RPC_E_CHANGED_MODE
        // means someone else owns the apartment; unbalancing it would break them).
        let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
        let owns_com = hr.is_ok();

        let hinst = ShellExecuteW(
            None,
            w!("open"),
            PCWSTR(wide.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        );
        let code = hinst.0 as isize;

        if owns_com {
            CoUninitialize();
        }

        if code > 32 { Ok(()) } else { Err(map_shell_error(code).to_string()) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_error_2_is_file_not_found() {
        assert_eq!(map_shell_error(2), SHELL_ERR_NOT_FOUND);
    }

    #[test]
    fn shell_error_3_is_also_file_not_found() {
        // SE_ERR_PNF — the containing folder is gone. Same story for the user.
        assert_eq!(map_shell_error(3), SHELL_ERR_NOT_FOUND);
    }

    #[test]
    fn shell_error_31_is_no_association() {
        assert_eq!(map_shell_error(31), SHELL_ERR_NO_ASSOC);
    }

    #[test]
    fn other_shell_errors_are_generic() {
        // 5 = SE_ERR_ACCESSDENIED, 0 = out of memory, 32 = the success boundary.
        for code in [0, 5, 8, 32] {
            assert_eq!(map_shell_error(code), SHELL_ERR_GENERIC, "code {code}");
        }
    }
}
