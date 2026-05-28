//! Click and menu-event handlers for the tray icon.

use tauri::{AppHandle, Manager};
use tauri::menu::MenuEvent;
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconEvent};

pub fn on_tray_icon_event(tray: &TrayIcon, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        toggle_window_visibility(tray.app_handle());
    }
}

pub fn on_menu_event(_app: &AppHandle, _event: MenuEvent) {
    // Implemented in Task 10
}

pub(crate) fn toggle_window_visibility(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return; };
    let visible = window.is_visible().unwrap_or(false);
    if visible {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    crate::tray::notify_state_changed(app);
}
