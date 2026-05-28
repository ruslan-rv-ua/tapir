//! Click and menu-event handlers for the tray icon.

use tauri::AppHandle;
use tauri::tray::{TrayIcon, TrayIconEvent};
use tauri::menu::MenuEvent;

pub fn on_tray_icon_event(_tray: &TrayIcon, _event: TrayIconEvent) {
    // Implemented in Task 9
}

pub fn on_menu_event(_app: &AppHandle, _event: MenuEvent) {
    // Implemented in Task 10
}
