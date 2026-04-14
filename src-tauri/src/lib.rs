mod errors;
mod portable;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            portable::ensure_data_dirs()
                .expect("Failed to create data directories");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
