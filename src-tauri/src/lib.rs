pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            // Will be expanded in later tasks
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
