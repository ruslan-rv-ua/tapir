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

use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::OnceLock;

use windows::core::PCWSTR;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM, HMODULE};
use windows::Win32::UI::Shell::{
    Shell_NotifyIconW, NIF_INFO, NIF_MESSAGE, NIIF_NONE, NIIF_RESPECT_QUIET_TIME,
    NIM_ADD, NIM_DELETE, NIM_MODIFY, NIN_BALLOONUSERCLICK, NOTIFYICONDATAW,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, RegisterClassExW,
    HWND_MESSAGE, WINDOW_EX_STYLE, WINDOW_STYLE, WNDCLASSEXW, WNDCLASS_STYLES,
};

const BALLOON_CALLBACK_MSG: u32 = 0x0400 + 1; // WM_APP + 1
const BALLOON_ICON_UID: u32 = 0x7ABE;
const WINDOW_CLASS_NAME: &str = "TapirBalloonWnd";

/// HWND of the hidden message-only window. Set once during setup, read everywhere else.
static BALLOON_HWND: AtomicIsize = AtomicIsize::new(0);
/// AppHandle stash used by WndProc to show the main window on balloon click.
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

/// Initialize the hidden message-only window and register the balloon icon.
/// Must be called once at startup, after `tray::setup_tray`.
pub fn init_balloon_runtime(app: &tauri::AppHandle) -> anyhow::Result<()> {
    let _ = APP_HANDLE.set(app.clone());
    unsafe {
        let hinstance: HMODULE = GetModuleHandleW(PCWSTR::null())?;
        let class_name: Vec<u16> = WINDOW_CLASS_NAME.encode_utf16().chain(std::iter::once(0)).collect();

        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: WNDCLASS_STYLES(0),
            lpfnWndProc: Some(balloon_wnd_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: hinstance.into(),
            hIcon: Default::default(),
            hCursor: Default::default(),
            hbrBackground: Default::default(),
            lpszMenuName: PCWSTR::null(),
            lpszClassName: PCWSTR(class_name.as_ptr()),
            hIconSm: Default::default(),
        };
        let atom = RegisterClassExW(&wc);
        if atom == 0 {
            log::debug!("RegisterClassExW returned 0 (likely already registered)");
        }

        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            PCWSTR(class_name.as_ptr()),
            PCWSTR::null(),
            WINDOW_STYLE(0),
            0, 0, 0, 0,
            Some(HWND_MESSAGE),
            None,
            Some(hinstance.into()),
            None,
        )?;
        BALLOON_HWND.store(hwnd.0 as isize, Ordering::Release);

        let mut nid = balloon_notify_data(hwnd);
        nid.uFlags = NIF_MESSAGE;
        nid.uCallbackMessage = BALLOON_CALLBACK_MSG;
        let added = Shell_NotifyIconW(NIM_ADD, &nid).as_bool();
        if !added {
            log::warn!("Shell_NotifyIconW(NIM_ADD) for balloon icon failed");
        }
    }
    Ok(())
}

fn balloon_notify_data(hwnd: HWND) -> NOTIFYICONDATAW {
    let mut nid: NOTIFYICONDATAW = unsafe { std::mem::zeroed() };
    nid.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
    nid.hWnd = hwnd;
    nid.uID = BALLOON_ICON_UID;
    nid
}

extern "system" fn balloon_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == BALLOON_CALLBACK_MSG && (lparam.0 as u32) == NIN_BALLOONUSERCLICK {
        if let Some(app) = APP_HANDLE.get() {
            if let Some(window) = tauri::Manager::get_webview_window(app, "main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }
        return LRESULT(0);
    }
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

/// Tear down balloon icon and destroy the hidden window. Best-effort.
#[allow(dead_code)]
pub fn shutdown_balloon_runtime() {
    let raw = BALLOON_HWND.swap(0, Ordering::AcqRel);
    if raw == 0 { return; }
    let hwnd = HWND(raw as *mut _);
    unsafe {
        let nid = balloon_notify_data(hwnd);
        let _ = Shell_NotifyIconW(NIM_DELETE, &nid);
        let _ = DestroyWindow(hwnd);
    }
}

/// Display a balloon notification with the given title (e.g. station) and body
/// (e.g. "Artist — Title"). Errors are logged but not propagated.
pub fn show_balloon(title: &str, body: &str) {
    let raw = BALLOON_HWND.load(Ordering::Acquire);
    if raw == 0 {
        log::debug!("show_balloon called before init_balloon_runtime");
        return;
    }
    let hwnd = HWND(raw as *mut _);
    let mut nid = balloon_notify_data(hwnd);
    nid.uFlags = NIF_INFO;
    write_utf16(&mut nid.szInfoTitle, title);
    write_utf16(&mut nid.szInfo, body);
    nid.Anonymous.uTimeout = 5000;
    nid.dwInfoFlags = NIIF_NONE | NIIF_RESPECT_QUIET_TIME;
    unsafe {
        if !Shell_NotifyIconW(NIM_MODIFY, &nid).as_bool() {
            log::warn!("Shell_NotifyIconW(NIM_MODIFY) failed");
        }
    }
}

fn write_utf16(dst: &mut [u16], src: &str) {
    let encoded: Vec<u16> = src.encode_utf16().take(dst.len().saturating_sub(1)).collect();
    for (i, c) in encoded.iter().enumerate() {
        dst[i] = *c;
    }
    dst[encoded.len()] = 0;
}
