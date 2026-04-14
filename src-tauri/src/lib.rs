mod errors;
mod portable;
mod profile;
mod settings;

use profile::Profile;
use settings::GlobalSettings;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            portable::ensure_data_dirs()
                .expect("Failed to create data directories");
            let settings = GlobalSettings::load()
                .expect("Failed to load settings");
            let profile = Profile::load(&settings.active_profile)
                .expect("Failed to load profile");
            tracing::info!("Loaded profile: {}", profile.name);
            tracing::info!("Streams in profile: {}", profile.streams.len());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
