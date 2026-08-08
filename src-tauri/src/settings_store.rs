//! Сховище глобальних налаштувань — адаптер над [`crate::store`].
//!
//! Дзеркало [`crate::profile_store`]: те саме, але для `data/settings.json`.
//! `GlobalSettings` не має методу `save` — записати їх можна лише через
//! [`AppState::commit_settings`](crate::app_state::AppState::commit_settings)
//! або [`save_detached`] (до того, як `AppState` існує — старт застосунку).

use crate::errors::RadioError;
use crate::portable;
use crate::settings::GlobalSettings;
use crate::store::{write_json_atomically, Persist, Store};

impl Persist for GlobalSettings {
    /// Файл рівно один, тож ключ воріт — константа. Профіль ключується іменем
    /// саме тому, що файлів у нього багато.
    fn key(&self) -> String {
        "settings".to_string()
    }
}

/// Прод-сховище: файл `data/settings.json`.
pub struct FileSettingsStore;

impl Store<GlobalSettings> for FileSettingsStore {
    fn save(&self, settings: &GlobalSettings) -> Result<(), RadioError> {
        write_settings_file(settings)
    }
}

/// Записати налаштування поза `AppState`.
///
/// Потрібне двом місцям старту, де спільної копії в пам'яті ще не існує:
/// `GlobalSettings::load` створює файл за замовчуванням, а `lib.rs` гасить
/// `autostart` до `AppState::new`. Впорядковувати нема з чим — конкурентних
/// записувачів на цьому етапі немає.
pub fn save_detached(settings: &GlobalSettings) -> Result<(), RadioError> {
    write_settings_file(settings)
}

fn write_settings_file(settings: &GlobalSettings) -> Result<(), RadioError> {
    write_json_atomically(&portable::settings_path(), "json.tmp", settings)
}
