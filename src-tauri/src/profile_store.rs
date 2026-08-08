//! Сховище профілю — адаптер над [`crate::store`].
//!
//! Це єдине місце в кодовій базі, яке пише файл профілю. `Profile` не має
//! методу `save` — записати профіль можна лише через
//! [`AppState::commit_profile`](crate::app_state::AppState::commit_profile)
//! (активний профіль) або [`save_detached`] (завантажений неактивний).

use crate::errors::RadioError;
use crate::portable;
use crate::profile::Profile;
use crate::store::{write_json_atomically, Persist, Store};

impl Persist for Profile {
    /// Ім'я профілю — це і є ім'я його файлу, тож воно ж ключ воріт: знімки
    /// різних профілів не витісняють одне одного (вікно `switch_profile`).
    fn key(&self) -> String {
        self.name.clone()
    }
}

/// Прод-сховище: файл `data/profiles/<назва>.tapirprofile`.
pub struct FileProfileStore;

impl Store<Profile> for FileProfileStore {
    fn save(&self, profile: &Profile) -> Result<(), RadioError> {
        write_profile_file(profile)
    }
}

/// Записати завантажений **неактивний** профіль.
///
/// Другий і останній спосіб покласти профіль на диск. Впорядкування тут не
/// потрібне: неактивний профіль не має копії в пам'яті, тож двох станів, які
/// могли б розійтися, не існує — його читають, змінюють і записують у межах
/// однієї операції (перенесення потоку, створення, перейменування, імпорт).
pub fn save_detached(profile: &Profile) -> Result<(), RadioError> {
    write_profile_file(profile)
}

fn write_profile_file(profile: &Profile) -> Result<(), RadioError> {
    let path = portable::profiles_dir().join(format!("{}.tapirprofile", profile.name));
    write_json_atomically(&path, "tapirprofile.tmp", profile)
}
