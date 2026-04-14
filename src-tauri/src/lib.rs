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
use crate::stream::manager::StreamState;

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
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle().clone();
                tauri::async_runtime::block_on(async {
                    let state = app.state::<AppState>();
                    // 1. Stop all recordings
                    let mut manager = state.stream_manager.write().await;
                    manager.stop_all();
                    // 2. Collect active stream IDs before stopping
                    let active_ids: Vec<String> = manager.get_all_statuses()
                        .iter()
                        .filter(|s| !matches!(s.state, StreamState::Idle | StreamState::Error))
                        .map(|s| s.stream_id.clone())
                        .collect();
                    drop(manager);
                    // 3. Map stream IDs to URLs via profile
                    let profile_read = state.active_profile.read().await;
                    let urls: Vec<String> = active_ids.iter()
                        .filter_map(|id| {
                            profile_read.streams.iter().find(|s| s.id == *id).map(|s| s.url.clone())
                        })
                        .collect();
                    drop(profile_read);
                    // 4. Save active URLs to profile
                    let mut profile = state.active_profile.write().await;
                    profile.active_recording_urls = urls;
                    let _ = profile.save();
                    drop(profile);
                    // 5. Wait for tasks to finish
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                });
            }
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
