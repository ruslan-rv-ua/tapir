mod app_state;
mod commands;
mod errors;
mod portable;
mod profile;
mod sanitize;
mod settings;
mod stream;

use app_state::AppState;
use settings::GlobalSettings;
use profile::Profile;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            portable::ensure_data_dirs()
                .expect("Failed to create data directories");
            Ok(())
        })
        .manage({
            let settings = GlobalSettings::load().expect("Failed to load settings");
            let profile = Profile::load(&settings.active_profile).expect("Failed to load profile");
            AppState::new(settings, profile)
        })
        .invoke_handler(tauri::generate_handler![
            commands::stream_commands::start_test_recording,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
