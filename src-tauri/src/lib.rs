mod app_state;
mod autostart;
mod commands;
mod crash_recovery;
mod errors;
mod naming;
mod player;
mod playback_control;
mod portable;
mod profile;
mod profile_store;
mod recording_control;
mod sanitize;
mod scheduler;
mod shortcuts;
mod settings;
mod settings_store;
mod store;
mod smtc;
mod songs;
mod stream;
mod tags;
mod tray;
mod wake_lock;
mod wishlist;
mod browser;
mod cli;
mod single_instance;

use app_state::AppState;
use settings::GlobalSettings;
use profile::Profile;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_log::{Target, TargetKind, RotationStrategy};

pub fn run() {
    // Phase 3E: relax the foreground lock as early as possible. In a second
    // instance this hands the foreground grant to the first instance before the
    // single-instance plugin terminates this process; in the first instance it
    // is harmless. Must run before tauri::Builder (the plugin would exit a
    // second instance before any later code runs).
    single_instance::allow_foreground_handoff();

    // Phase 3G: parse our own argv early (so --profile can pick the profile
    // before AppState::new). args_os, not args: args() panics on invalid UTF-16,
    // and Cyrillic in names/paths is real. We do NOT exit here — this code also
    // runs in a second instance (the plugin kills it later, inside its own setup
    // hook). An early exit(2) here would eat the forwarding. The exit decision is
    // in .setup below, which only the first instance reaches.
    let argv: Vec<String> = std::env::args_os()
        .map(|s| s.to_string_lossy().into_owned())
        .collect();
    let parsed: Result<cli::Cli, clap::Error> = cli::parse(&argv);

    // Create data dirs before anything reads/writes them: the log plugin targets
    // logs_dir() and GlobalSettings::load() may write default settings.json.
    portable::ensure_data_dirs().expect("Failed to create data directories");

    // Load settings once, before the builder, so the log plugin (which is built
    // at startup and cannot change afterwards) reflects the user's choices.
    let mut initial_settings = GlobalSettings::load().expect("Failed to load settings");

    // --profile: pick the profile BEFORE AppState::new so we load the right one
    // directly (not Default -> switch). Session-only override (decision §7): we do
    // NOT save settings.json here. Only for an Ok parse; on Err we exit(2) in
    // .setup anyway. Existence is checked via Profile::list (Profile::load("Default")
    // would create a file as a side effect). Unknown name -> log warn + keep default.
    if let Ok(cli) = &parsed {
        if let Some(name) = &cli.profile {
            let known = Profile::list(&initial_settings.active_profile)
                .map(|metas| metas.iter().any(|m| &m.name == name))
                .unwrap_or(false);
            if known {
                initial_settings.active_profile = name.clone();
            } else {
                log::warn!("--profile: profile '{name}' does not exist, ignoring");
            }
        }
    }

    // Apply the user's level only to our own crate (`tapir_lib::*`). Dependencies
    // are capped at Info: their debug/trace is noise and may leak request headers
    // or stream credentials. So "detailed logging" means detailed *app* logs.
    let app_filter = initial_settings.log_level.to_filter();
    let dep_filter = app_filter.min(log::LevelFilter::Info);

    tauri::Builder::default()
        // MUST be first — before the log plugin. A dying second instance exits
        // inside this plugin's setup hook, so no later plugin (incl. log)
        // initializes in it, keeping tapir.log untouched. See single_instance.rs.
        .plugin(single_instance::plugin())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(dep_filter)
                .level_for("tapir_lib", app_filter)
                .max_file_size(initial_settings.log_max_size_mb as u128 * 1_048_576)
                // Active file + one timestamped archive (<= ~2x max_file_size).
                // KeepOne would *delete* the previous log on rotation, dropping
                // the diagnostic context exactly when it is needed; KeepAll is
                // unbounded, which is the problem rotation exists to solve.
                .rotation_strategy(RotationStrategy::KeepSome(1))
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
            // Phase 3G: exit decision HERE, not before the builder. .setup is
            // reachable only by the first instance (the plugin terminated the
            // second earlier, in its own setup hook). try_parse_from does NOT
            // exit on help/version — it returns Err and WE exit. No console text
            // (release has windows_subsystem = "windows") — exit code only.
            let cli = match parsed {
                Ok(c) => c,
                Err(e) => {
                    use clap::error::ErrorKind::*;
                    match e.kind() {
                        DisplayHelp | DisplayHelpOnMissingArgumentOrSubcommand
                        | DisplayVersion => std::process::exit(0),
                        _ => std::process::exit(2), // parse-error, before showing the window
                    }
                }
            };

            // Show and focus the main window as early as possible — while the
            // OS foreground-activation grant from the user's launch is still
            // valid. The window is configured `visible: false` so its restored
            // position (tauri-plugin-window-state) is applied before it appears.
            // Showing it here (rather than from JS after data loads) ensures the
            // webview initializes while the window is already OS-foreground,
            // which NVDA requires to attach to the document and announce focus.
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.show();
                // The webview guard (useWebviewGuard.ts) kills F5 and the native
                // context menu, so a debug build opens devtools itself. Placed
                // BETWEEN show() and set_focus(): devtools steal foreground, and
                // the main window must be the last to take it back — otherwise the
                // webview initializes unfocused and NVDA stays silent at startup.
                // Skipped under --minimize: that window is deliberately hidden below.
                #[cfg(debug_assertions)]
                if !cli.minimize {
                    main_window.open_devtools();
                }
                let _ = main_window.set_focus(); // webview inits in foreground (NVDA)
                if cli.minimize {
                    // --minimize = start in the tray. hide(), NOT minimize() (that
                    // is the taskbar). NVDA already attached above before we hide.
                    let _ = main_window.hide();
                    crate::tray::notify_state_changed(app.handle());
                }
            }

            let mut settings = initial_settings;
            // Підфаза 3I-2: звірити реєстр Run з current_exe() ДО AppState::new
            // (воно споживає settings). DisableMoved → скинути прапорець,
            // персистити, і відкласти оголошення до frontend_ready (webview ще
            // не підписаний на події — той самий гейт, що StartupPlan/scheduler).
            let moved = autostart::reconcile_on_startup(
                settings.autostart,
                settings.autostart_minimized,
            );
            if moved {
                settings.autostart = false;
                if let Err(e) = settings_store::save_detached(&settings) {
                    log::warn!("autostart: failed to persist autostart=false after EXE move: {e}");
                }
                app.manage(autostart::StartupNotice::moved());
            }
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
            // Phase 3K: виявлення збою. prev — стан ПОПЕРЕДНЬОГО сеансу,
            // читаємо ДО перезапису маркером нового сеансу.
            let prev_session = crash_recovery::SessionState::load();
            crash_recovery::mark_session_start();
            if !prev_session.clean_shutdown && !prev_session.active_recordings.is_empty() {
                // Тихий авто-resume (без діалогу). Підсумок стешиться і
                // емітується з frontend_ready (гейт StartupPlan) — інакше
                // подія піде до підписки webview і озвучення загубиться.
                let summary = tauri::async_runtime::block_on(
                    crash_recovery::resume_recordings(app.handle(), &prev_session),
                );
                app.manage(crash_recovery::ResumeNotice::new(summary));
            }
            crash_recovery::spawn_snapshot_writer(app.handle().clone());
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

            // Phase 3G: do NOT run the actionable flags here — the webview is not
            // yet subscribed to events (it subscribes after its initial data load,
            // then calls frontend_ready). Running now would emit recording-status /
            // cli-feedback before subscription -> lost announcements (the same gate
            // the scheduler uses). Stash the plan; frontend_ready drains it.
            // profile is already applied above, so plan(cli, Startup)'s
            // SwitchProfile action is a no-op in execute.
            let startup_plan = cli::plan(cli, cli::CliContext::Startup);
            app.manage(cli::StartupPlan::new(startup_plan));

            // Startup autoplay one-shot latch (resume-last-playback). Drained in
            // frontend_ready; managed unconditionally so the gate always exists.
            app.manage(playback_control::AutoplayGuard::new());

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
            commands::stream_commands::check_stream_conflicts,
            commands::stream_commands::remove_stream,
            commands::stream_commands::remove_streams,
            commands::stream_commands::transfer_stream_to_profile,
            commands::stream_commands::transfer_streams_to_profile,
            commands::stream_commands::update_stream,
            commands::stream_commands::start_recording,
            commands::stream_commands::stop_recording,
            commands::stream_commands::stop_all_recordings,
            commands::stream_commands::start_all_recordings,
            commands::stream_commands::get_stream_status,
            commands::stream_commands::get_all_statuses,
            commands::settings_commands::get_settings,
            commands::settings_commands::save_settings,
            commands::settings_commands::sync_autostart,
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
            commands::wishlist_commands::remove_from_wishlist_bulk,
            commands::wishlist_commands::update_wishlist_pattern,
            commands::wishlist_commands::get_ignorelist,
            commands::wishlist_commands::add_to_ignorelist,
            commands::wishlist_commands::remove_from_ignorelist,
            commands::wishlist_commands::remove_from_ignorelist_bulk,
            commands::wishlist_commands::update_ignorelist_pattern,
            commands::browser_commands::search_stations,
            commands::browser_commands::get_browser_filters,
            commands::browser_commands::add_station_from_browser,
            commands::browser_commands::add_stations_from_browser,
            commands::browser_commands::add_example_streams,
            commands::songs_commands::list_saved_songs,
            commands::songs_commands::play_saved_song,
            commands::songs_commands::open_song_in_explorer,
            commands::songs_commands::open_song_in_app,
            commands::stream_commands::open_stream_in_app,
            commands::songs_commands::rename_song,
            commands::songs_commands::update_song_tags,
            commands::songs_commands::delete_song,
            commands::songs_commands::delete_songs,
            commands::profile_commands::list_profiles,
            commands::profile_commands::create_profile,
            commands::profile_commands::rename_profile,
            commands::profile_commands::delete_profile,
            commands::profile_commands::delete_profiles,
            commands::profile_commands::duplicate_profile,
            commands::profile_commands::export_profile,
            commands::profile_commands::begin_import,
            commands::profile_commands::commit_import,
            commands::profile_commands::switch_profile,
            commands::profile_commands::set_profile_autoplay,
            commands::stream_io_commands::begin_stream_import,
            commands::stream_io_commands::validate_import_candidates,
            commands::stream_io_commands::probe_stream,
            commands::stream_io_commands::commit_stream_import,
            commands::stream_io_commands::export_streams,
            commands::schedule_commands::get_schedules,
            commands::schedule_commands::add_schedule,
            commands::schedule_commands::update_schedule,
            commands::schedule_commands::delete_schedule,
            commands::schedule_commands::delete_schedules,
            commands::schedule_commands::toggle_schedule,
            commands::schedule_commands::get_active_scheduled,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
