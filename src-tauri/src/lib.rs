mod app_state;
mod commands;
mod errors;
mod player;
mod portable;
mod profile;
mod recording_control;
mod sanitize;
mod scheduler;
mod shortcuts;
mod settings;
mod smtc;
mod songs;
mod stream;
mod tags;
mod tray;
mod wake_lock;
mod wishlist;
mod browser;
mod cli;

use app_state::AppState;
use settings::GlobalSettings;
use profile::Profile;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_log::{Target, TargetKind, RotationStrategy};

/// Maps the user's `log_rotation` toggle to a plugin rotation strategy.
/// `true` (default) keeps disk bounded (KeepOne, == previous behavior);
/// `false` keeps the full timestamped history (KeepAll).
fn rotation_strategy_for(keep_recycling: bool) -> RotationStrategy {
    if keep_recycling {
        RotationStrategy::KeepOne
    } else {
        RotationStrategy::KeepAll
    }
}

pub fn run() {
    // Create data dirs before anything reads/writes them: the log plugin targets
    // logs_dir() and GlobalSettings::load() may write default settings.json.
    portable::ensure_data_dirs().expect("Failed to create data directories");

    // Load settings once, before the builder, so the log plugin (which is built
    // at startup and cannot change afterwards) reflects the user's choices.
    let initial_settings = GlobalSettings::load().expect("Failed to load settings");

    // Apply the user's level only to our own crate (`tapir_lib::*`). Dependencies
    // are capped at Info: their debug/trace is noise and may leak request headers
    // or stream credentials. So "detailed logging" means detailed *app* logs.
    let app_filter = initial_settings.log_level.to_filter();
    let dep_filter = app_filter.min(log::LevelFilter::Info);

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(dep_filter)
                .level_for("tapir_lib", app_filter)
                .max_file_size(initial_settings.log_max_size_mb as u128 * 1_048_576)
                .rotation_strategy(rotation_strategy_for(initial_settings.log_rotation))
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
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            // Show and focus the main window as early as possible — while the
            // OS foreground-activation grant from the user's launch is still
            // valid. The window is configured `visible: false` so its restored
            // position (tauri-plugin-window-state) is applied before it appears.
            // Showing it here (rather than from JS after data loads) ensures the
            // webview initializes while the window is already OS-foreground,
            // which NVDA requires to attach to the document and announce focus.
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.show();
                let _ = main_window.set_focus();
            }

            // Phase 3E: feed our own argv through the shared CLI seam.
            // No-op beyond logging until Phase 3G fills in parsing.
            crate::cli::handle_args(app.handle(), std::env::args().collect(), None);

            let settings = initial_settings;
            let profile = Profile::load(&settings.active_profile).expect("Failed to load profile");
            let state = match AppState::new(settings, profile, app.handle().clone()) {
                Ok(s) => s,
                Err(e) => {
                    log::error!("Failed to initialize AppState: {e}");
                    app.dialog()
                        .message(format!(
                            "Не вдалося запустити Tapir:\n\n{e}\n\nПереконайтеся, що аудіо-пристрій підключено, і спробуйте ще раз."
                        ))
                        .title("Помилка запуску")
                        .blocking_show();
                    return Err(e.into());
                }
            };
            app.manage(state);
            tray::setup_tray(app.handle()).expect("Failed to set up system tray");
            tray::notify::register_aumid(&app.config().identifier, "Tapir");
            let state_ref = app.state::<AppState>();
            let settings = tauri::async_runtime::block_on(state_ref.settings.read());
            let failed = shortcuts::register_global_shortcuts(app.handle(), &settings.hotkeys);
            if !failed.is_empty() {
                log::warn!("Failed to register shortcuts: {:?}", failed);
            }
            let smtc_enabled = settings.smtc_enabled;
            drop(settings);
            smtc::init(app.handle(), smtc_enabled);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle().clone();
                let state = app.state::<AppState>();
                // CloseRequested is delivered on the main UI thread (not a tokio worker),
                // so block_on is safe here and will not deadlock.
                let minimize_to_tray = tauri::async_runtime::block_on(async {
                    state.settings.read().await.minimize_to_tray
                });

                if minimize_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                    crate::tray::notify_state_changed(&app);
                    return;
                }

                // Same guard as the tray-menu Quit: prompt before tearing down
                // active recordings, regardless of how the close was triggered.
                let confirmed = tauri::async_runtime::block_on(async {
                    crate::tray::notify::confirm_quit_if_recording(&app).await
                });
                if !confirmed {
                    api.prevent_close();
                    return;
                }

                let _ = window.hide();
                tauri::async_runtime::block_on(async {
                    crate::app_state::graceful_shutdown(&app).await;
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_commands::frontend_ready,
            commands::stream_commands::get_streams,
            commands::stream_commands::add_stream,
            commands::stream_commands::remove_stream,
            commands::stream_commands::transfer_stream_to_profile,
            commands::stream_commands::update_stream,
            commands::stream_commands::start_recording,
            commands::stream_commands::stop_recording,
            commands::stream_commands::stop_all_recordings,
            commands::stream_commands::start_all_recordings,
            commands::stream_commands::get_stream_status,
            commands::stream_commands::get_all_statuses,
            commands::settings_commands::get_settings,
            commands::settings_commands::save_settings,
            commands::settings_commands::get_recording_settings,
            commands::settings_commands::save_recording_settings,
            commands::settings_commands::get_free_space,
            commands::settings_commands::register_hotkeys,
            commands::settings_commands::default_hotkeys,
            commands::settings_commands::open_directory_picker,
            commands::player_commands::play_stream,
            commands::player_commands::preview_station,
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
            commands::songs_commands::list_saved_songs,
            commands::songs_commands::play_saved_song,
            commands::songs_commands::open_song_in_explorer,
            commands::songs_commands::rename_song,
            commands::songs_commands::update_song_tags,
            commands::songs_commands::delete_song,
            commands::profile_commands::list_profiles,
            commands::profile_commands::create_profile,
            commands::profile_commands::rename_profile,
            commands::profile_commands::delete_profile,
            commands::profile_commands::duplicate_profile,
            commands::profile_commands::export_profile,
            commands::profile_commands::begin_import,
            commands::profile_commands::commit_import,
            commands::profile_commands::switch_profile,
            commands::stream_io_commands::begin_stream_import,
            commands::stream_io_commands::validate_import_candidates,
            commands::stream_io_commands::commit_stream_import,
            commands::stream_io_commands::export_streams,
            commands::schedule_commands::get_schedules,
            commands::schedule_commands::add_schedule,
            commands::schedule_commands::update_schedule,
            commands::schedule_commands::delete_schedule,
            commands::schedule_commands::toggle_schedule,
            commands::schedule_commands::get_active_scheduled,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotation_true_keeps_one_false_keeps_all() {
        // log_rotation == true preserves the current bounded-disk behavior (KeepOne).
        assert!(matches!(rotation_strategy_for(true), RotationStrategy::KeepOne));
        assert!(matches!(rotation_strategy_for(false), RotationStrategy::KeepAll));
    }
}
