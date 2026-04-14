mod app_state;
mod commands;
mod errors;
mod portable;
mod profile;
mod sanitize;
mod settings;
mod stream;
mod tags;

use app_state::AppState;
use settings::GlobalSettings;
use profile::Profile;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            portable::ensure_data_dirs()
                .expect("Failed to create data directories");
            let settings = GlobalSettings::load().expect("Failed to load settings");
            let profile = Profile::load(&settings.active_profile).expect("Failed to load profile");
            let state = AppState::new(settings, profile, app.handle().clone());
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::stream_commands::start_test_recording,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
