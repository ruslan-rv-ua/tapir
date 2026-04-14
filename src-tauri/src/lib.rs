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
            commands::stream_commands::get_streams,
            commands::stream_commands::add_stream,
            commands::stream_commands::remove_stream,
            commands::stream_commands::update_stream,
            commands::stream_commands::start_recording,
            commands::stream_commands::stop_recording,
            commands::stream_commands::stop_all_recordings,
            commands::stream_commands::get_stream_status,
            commands::stream_commands::get_all_statuses,
            commands::settings_commands::get_settings,
            commands::settings_commands::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
