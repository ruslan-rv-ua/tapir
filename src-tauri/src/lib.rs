mod app_state;
mod commands;
mod errors;
mod player;
mod portable;
mod profile;
mod sanitize;
mod shortcuts;
mod settings;
mod stream;
mod tags;
mod tray;
mod wishlist;
mod browser;

use app_state::AppState;
use settings::GlobalSettings;
use profile::Profile;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind, RotationStrategy};

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Debug)
                .max_file_size(10_485_760) // 10 MB
                .rotation_strategy(RotationStrategy::KeepOne)
                .targets([
                    Target::new(TargetKind::Folder {
                        path: portable::logs_dir(),
                        file_name: Some("tapir".into()),
                    }),
                    Target::new(TargetKind::Stdout),
                ])
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            portable::ensure_data_dirs()
                .expect("Failed to create data directories");
            let settings = GlobalSettings::load().expect("Failed to load settings");
            let profile = Profile::load(&settings.active_profile).expect("Failed to load profile");
            let state = AppState::new(settings, profile, app.handle().clone())
                .expect("Failed to initialize AppState (no audio device?)");
            app.manage(state);
            tray::setup_tray(app.handle()).expect("Failed to set up system tray");
            let state_ref = app.state::<AppState>();
            let settings = tauri::async_runtime::block_on(state_ref.settings.read());
            let failed = shortcuts::register_global_shortcuts(app.handle(), &settings.hotkeys);
            if !failed.is_empty() {
                tracing::warn!("Failed to register shortcuts: {:?}", failed);
            }
            drop(settings);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle().clone();
                // CloseRequested is delivered on the main UI thread (not a tokio worker),
                // so block_on is safe here and will not deadlock.
                tauri::async_runtime::block_on(async {
                    crate::app_state::graceful_shutdown(&app).await;
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
            commands::settings_commands::get_recording_settings,
            commands::settings_commands::save_recording_settings,
            commands::settings_commands::register_hotkeys,
            commands::settings_commands::open_directory_picker,
            commands::player_commands::play_stream,
            commands::player_commands::play_file,
            commands::player_commands::pause_playback,
            commands::player_commands::resume_playback,
            commands::player_commands::stop_playback,
            commands::player_commands::seek_playback,
            commands::player_commands::set_volume,
            commands::player_commands::get_player_status,
            commands::player_commands::list_output_devices,
            commands::player_commands::set_output_device,
            commands::wishlist_commands::get_wishlist,
            commands::wishlist_commands::add_to_wishlist,
            commands::wishlist_commands::remove_from_wishlist,
            commands::wishlist_commands::update_wishlist_pattern,
            commands::wishlist_commands::get_ignorelist,
            commands::wishlist_commands::add_to_ignorelist,
            commands::wishlist_commands::remove_from_ignorelist,
            commands::wishlist_commands::update_ignorelist_pattern,
            commands::browser_commands::search_stations,
            commands::browser_commands::get_browser_filters,
            commands::browser_commands::add_station_from_browser,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
