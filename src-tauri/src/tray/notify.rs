//! Native notification helpers: track-change toasts (via tauri-plugin-notification)
//! and the quit-confirm MessageBox.
//!
//! Toast delivery on Windows 10/11 requires a registered AppUserModelID. Going
//! through `tauri-plugin-notification` (which uses `notify-rust` underneath)
//! sets the AUMID to our bundle identifier when running from the built exe,
//! so the toast appears in Action Center and as a banner. The earlier
//! Shell_NotifyIcon balloon approach silently failed for portable builds
//! because Windows 10+ redirects NIF_INFO calls to toasts and drops them when
//! the AUMID is not registered.

use windows::core::HSTRING;
use windows::Win32::UI::WindowsAndMessaging::{
    MessageBoxW, IDYES, MB_DEFBUTTON2, MB_ICONWARNING, MB_SETFOREGROUND, MB_YESNO,
};

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri_plugin_notification::NotificationExt;

/// Register our AppUserModelID under HKCU so Windows treats our toast
/// notifications as coming from a known app. Without this, WinRT silently
/// drops toasts dispatched from portable builds (no installer ⇒ no Start Menu
/// shortcut ⇒ no AUMID registration).
///
/// Idempotent: safe to call on every launch.
pub fn register_aumid(aumid: &str, display_name: &str) {
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;

    let path = format!(r"Software\Classes\AppUserModelId\{aumid}");
    match RegKey::predef(HKEY_CURRENT_USER).create_subkey(&path) {
        Ok((key, disp)) => {
            if let Err(e) = key.set_value("DisplayName", &display_name) {
                log::warn!("register_aumid: failed to set DisplayName: {e}");
            } else {
                log::info!("register_aumid: aumid={aumid} display_name={display_name:?} ({disp:?})");
            }
        }
        Err(e) => log::warn!("register_aumid: failed to create key {path:?}: {e}"),
    }
}

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

static LAST_NOTIFY_MS: AtomicU64 = AtomicU64::new(0);
const THROTTLE_MS: u64 = 3000;

/// Fire-and-forget: gate on `showTrayNotifications`, resolve the station name
/// from the active profile, throttle to one toast per 3 s, and dispatch through
/// `tauri-plugin-notification`. Use this from any track-change emitter
/// (recorder, player) so the rules live in one place.
pub fn notify_track_change(app: &tauri::AppHandle, stream_id: &str, artist: &str, title: &str) {
    let app = app.clone();
    let stream_id = stream_id.to_string();
    let artist = artist.to_string();
    let title = title.to_string();
    tauri::async_runtime::spawn(async move {
        let state = tauri::Manager::state::<crate::app_state::AppState>(&app);
        if !state.settings.read().await.show_tray_notifications { return; }

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let last = LAST_NOTIFY_MS.load(Ordering::Relaxed);
        if now.saturating_sub(last) < THROTTLE_MS { return; }
        LAST_NOTIFY_MS.store(now, Ordering::Relaxed);

        let station = state.active_profile.read().await
            .streams.iter()
            .find(|s| s.id == stream_id)
            .map(|s| s.name.clone())
            .unwrap_or_else(|| stream_id.clone());

        let body = match (artist.is_empty(), title.is_empty()) {
            (false, false) => format!("{artist} — {title}"),
            (true, false)  => title,
            (false, true)  => artist,
            _ => return,
        };

        log::info!("notify_track_change: station={station:?} body={body:?}");
        if let Err(e) = app.notification().builder()
            .title(&station)
            .body(&body)
            .show()
        {
            log::warn!("notify_track_change: failed to show toast: {e}");
        }
    });
}
