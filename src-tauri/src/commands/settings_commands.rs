use crate::app_state::AppState;
use crate::settings::{GlobalSettings, HotkeyMap};
use crate::store::Commit;
use crate::shortcuts;

#[tauri::command]
pub async fn get_settings(state: tauri::State<'_, AppState>) -> Result<GlobalSettings, String> {
    let settings = state.settings.read().await;
    Ok(settings.clone())
}

#[tauri::command]
pub async fn save_settings(
    settings: GlobalSettings,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    // Пам'ять першою, як і в решті комітів — цей сайт мав ту саму інверсію, що
    // й save_recording_settings.
    let smtc_enabled = settings.smtc_enabled;
    let language = settings.language.clone();
    let smtc_changed = state
        .commit_settings(|current| {
            let changed = current.smtc_enabled != smtc_enabled;
            *current = settings;
            Commit::Save(changed)
        })
        .await
        .map_err(|e| e.to_string())?;

    // Мова нативного шару їде тим самим шляхом, що й решта налаштувань: окрема
    // команда додала б фронтенду обов'язок, забуття якого дало б трей чужою
    // мовою й не ловилося б жодним тестом. Меню перезбирається наявним
    // notify_state_changed — окремого шляху для мови не заводимо.
    let locale = crate::i18n::Locale::from_tag(&language);
    if locale != crate::i18n::locale() {
        crate::i18n::set_locale(locale);
        crate::tray::notify_state_changed(&app);
    }
    // No separate command needed (unlike register_hotkeys): there is no
    // error list for the UI here, the toggle applies silently.
    if smtc_changed {
        crate::smtc::set_enabled(smtc_enabled);
    }
    Ok(())
}

#[tauri::command]
pub async fn register_hotkeys(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let settings = state.settings.read().await;
    let hotkeys = settings.hotkeys.clone();
    drop(settings);
    let failed = shortcuts::register_global_shortcuts(&app, &hotkeys);
    Ok(failed)
}

/// Default Tier-1 hotkey combos. Pure lookup for the Settings → Hotkeys
/// reset button (KB-10): writes nothing, registers nothing.
#[tauri::command]
pub fn default_hotkeys() -> HotkeyMap {
    HotkeyMap::default()
}

#[tauri::command]
pub async fn get_free_space(state: tauri::State<'_, AppState>) -> Result<u64, String> {
    let dir = {
        let profile = state.active_profile.read().await;
        crate::portable::resolve_output_dir(&profile.recording.output_dir)
    };
    tokio::task::spawn_blocking(move || crate::portable::free_bytes_on_volume(&dir))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn open_directory_picker(
    app: tauri::AppHandle,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let result = tokio::task::spawn_blocking(move || {
        let mut builder = app.dialog().file();
        if let Some(path) = default_path {
            builder = builder.set_directory(&path);
        }
        builder.blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(result.map(|p| p.to_string()))
}

/// Привести реєстр `Run` у відповідність до (enabled, minimized). Frontend
/// передає значення ЯВНО (не читаємо `state.settings`): `useAutoSave` дебаунсить
/// persist на 300 мс, тож стан тут був би застарілим — явні аргументи усувають
/// гонку. Окрема команда (а не як SMTC у `save_settings`), бо реєстровий запис
/// може впасти, і незрячий користувач має почути про це: помилка повертається у
/// фронт для оголошення + revert. `spawn_blocking` — winreg це блокувальний I/O.
#[tauri::command]
pub async fn sync_autostart(enabled: bool, minimized: bool) -> Result<(), String> {
    tokio::task::spawn_blocking(move || crate::autostart::apply(enabled, minimized))
        .await
        .map_err(|e| e.to_string())?
        .map_err(Into::into)
}
