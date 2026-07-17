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

pub fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    use crate::tray::menu::{
        MENU_ID_QUIT, MENU_ID_STOP_ALL, MENU_ID_STOP_PLAYBACK,
        MENU_ID_TOGGLE_PLAYBACK, MENU_ID_TOGGLE_WINDOW,
    };
    match event.id().as_ref() {
        id if id == MENU_ID_TOGGLE_PLAYBACK => spawn_toggle_playback(app),
        id if id == MENU_ID_STOP_PLAYBACK   => spawn_stop_playback(app),
        id if id == MENU_ID_STOP_ALL        => spawn_stop_all(app),
        id if id == MENU_ID_TOGGLE_WINDOW   => toggle_window_visibility(app),
        id if id == MENU_ID_QUIT            => handle_quit(app),
        _ => {}
    }
}

fn spawn_toggle_playback(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Same entry point as Ctrl+Shift+K: stream=stop, file=pause/resume,
        // cold=resume-last, shared debounce.
        crate::playback_control::toggle_playback(&app).await;
    });
}

fn spawn_stop_playback(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Explicit "Зупинити": capture the file position first so a later K
        // resumes where it left off, then stop.
        crate::playback_control::persist_session_snapshot(&app).await;
        let state = app.state::<crate::app_state::AppState>();
        let _ = state.player.stop_playback(&app).await;
    });
}

fn spawn_stop_all(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // П'ятий шлях ручної зупинки (§3.3): та сама точка, що й хоткей stop-all
        let _ = crate::recording_control::stop_all_now(&app).await;
        crate::tray::notify_state_changed(&app);
    });
}

fn handle_quit(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if !crate::tray::notify::confirm_quit_if_recording(&app).await { return; }
        crate::app_state::graceful_shutdown(&app).await;
        app.exit(0);
    });
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
