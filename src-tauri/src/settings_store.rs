//! Сховище глобальних налаштувань — адаптер над [`crate::store`].
//!
//! Дзеркало [`crate::profile_store`]: те саме, але для `data/settings.json`.
//! `GlobalSettings` не має методу `save` — записати їх можна лише через
//! [`AppState::commit_settings`](crate::app_state::AppState::commit_settings)
//! або [`save_detached`] (до того, як `AppState` існує — старт застосунку).

use std::sync::{Arc, Mutex};

use tokio::sync::RwLock;

use crate::errors::RadioError;
use crate::portable;
use crate::settings::GlobalSettings;
use crate::store::{write_json_atomically, Commit, Persist, Store, Writer};

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

/// Копія налаштувань для запису: активний профіль — `file_profile`, якщо сеанс
/// працює не в тому профілі, що записаний у файлі (`--profile`).
pub fn disk_snapshot(settings: &GlobalSettings, file_profile: Option<&str>) -> GlobalSettings {
    let mut copy = settings.clone();
    if let Some(name) = file_profile {
        copy.active_profile = name.to_string();
    }
    copy
}

/// Коміт глобальних налаштувань, для якого `--profile` лишається сеансовим.
///
/// `--profile X` підміняє `active_profile` у пам'яті, а налаштування пишуться
/// цілком — без цього шару перший же запис (прапорець, пристрій виводу,
/// гаряча клавіша) поклав би X у `settings.json`, і наступний звичайний запуск
/// відкрив би X. Тому тут пам'ятається ім'я, яке лежить у файлі, і кожен знімок
/// несе його. Замінює це ім'я лише [`choose_profile`](Self::choose_profile) —
/// свідомий вибір профілю — і [`file_profile_moved`](Self::file_profile_moved),
/// коли файловий профіль перейменували чи видалили. Рішення — backlog `cli-profile-override-persists`
/// (варіант А).
pub struct SettingsWriter {
    writer: Writer<GlobalSettings>,
    /// Активний профіль, записаний у файлі, поки сеанс працює в іншому.
    /// `None` — у файлі те саме, що в пам'яті.
    file_profile: Mutex<Option<String>>,
}

impl SettingsWriter {
    pub fn new(store: Arc<dyn Store<GlobalSettings>>, file_profile: Option<String>) -> Self {
        Self { writer: Writer::new(store), file_profile: Mutex::new(file_profile) }
    }

    /// Правила — [`Writer::commit`]; знімок несе файлове ім'я профілю.
    pub async fn commit<T, F>(
        &self,
        cell: &RwLock<GlobalSettings>,
        mutate: F,
    ) -> Result<T, RadioError>
    where
        F: FnOnce(&mut GlobalSettings) -> Commit<T> + Send,
        T: Send,
    {
        self.writer
            .commit_with_snapshot(cell, mutate, |s| disk_snapshot(s, self.file_profile().as_deref()))
            .await
    }

    /// Зробити `name` активним профілем — і в пам'яті, і у файлі.
    ///
    /// На відміну від решти комітів, невдалий запис відкочує пам'ять (і файлове
    /// ім'я): `active_profile` читають лише при старті, тож «наступного коміту»
    /// можна не дочекатися, а розбіжність відправила б застосунок у профіль,
    /// якого користувач не вибирав. Запис невдалий — на диску старе значення,
    /// тож відкат лише повертає пам'ять до нього, не пишучи вдруге.
    pub async fn choose_profile(
        &self,
        cell: &RwLock<GlobalSettings>,
        name: String,
    ) -> Result<(), RadioError> {
        let mut undo = None;
        let committed = self
            .commit(cell, |s| {
                let file_profile = self.set_file_profile(None);
                undo = Some((std::mem::replace(&mut s.active_profile, name), file_profile));
                Commit::Save(())
            })
            .await;
        if let (Err(_), Some((active, file_profile))) = (&committed, undo) {
            let _ = self
                .writer
                .commit(cell, |s| {
                    s.active_profile = active;
                    self.set_file_profile(file_profile);
                    Commit::Skip(())
                })
                .await;
        }
        committed
    }

    /// Профіль `old` перейменовано (`new` = нове ім'я) або видалено (`None`).
    ///
    /// Сеансовий профіль ні перейменувати, ні видалити не можна, а файловий —
    /// можна: у вікні він звичайний неактивний. Якщо це він, файл налаштувань
    /// пишеться одразу — інакше наступний звичайний запуск шукав би профіль,
    /// якого вже немає. Видалений файловий профіль поступається сеансовому:
    /// іншого існуючого кандидата, який людина обирала б, немає.
    pub async fn file_profile_moved(
        &self,
        cell: &RwLock<GlobalSettings>,
        old: &str,
        new: Option<String>,
    ) -> Result<(), RadioError> {
        self.commit(cell, |_| {
            if self.file_profile().as_deref() != Some(old) {
                return Commit::Skip(());
            }
            self.set_file_profile(new);
            Commit::Save(())
        })
        .await
    }

    fn file_profile(&self) -> Option<String> {
        self.file_profile.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    fn set_file_profile(&self, value: Option<String>) -> Option<String> {
        std::mem::replace(&mut self.file_profile.lock().unwrap_or_else(|e| e.into_inner()), value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::test_store::MemStore;

    /// Сеанс, запущений з `--profile "Новини"`, коли у файлі «Музика».
    fn overridden_with(
        store: Arc<MemStore<GlobalSettings>>,
    ) -> (Arc<MemStore<GlobalSettings>>, SettingsWriter, RwLock<GlobalSettings>) {
        let writer = SettingsWriter::new(store.clone(), Some("Музика".into()));
        let cell = RwLock::new(settings_in("Новини"));
        (store, writer, cell)
    }

    fn overridden() -> (Arc<MemStore<GlobalSettings>>, SettingsWriter, RwLock<GlobalSettings>) {
        overridden_with(MemStore::new())
    }

    fn settings_in(profile: &str) -> GlobalSettings {
        GlobalSettings { active_profile: profile.into(), ..GlobalSettings::default() }
    }

    fn toggle_smtc(s: &mut GlobalSettings) -> Commit<()> {
        s.smtc_enabled = !s.smtc_enabled;
        Commit::Save(())
    }

    #[tokio::test]
    async fn settings_write_keeps_the_file_profile_under_a_session_override() {
        let (store, writer, cell) = overridden();

        writer.commit(&cell, toggle_smtc).await.unwrap();

        let saved = store.last().unwrap();
        assert_eq!(saved.active_profile, "Музика");
        assert_eq!(saved.smtc_enabled, cell.read().await.smtc_enabled, "решта змін іде на диск");
        assert_eq!(cell.read().await.active_profile, "Новини", "пам'ять лишається сеансовою");
    }

    #[tokio::test]
    async fn replacing_the_whole_settings_keeps_the_file_profile() {
        // save_settings: фронтенд шле всю `$settings`, а в ній уже сеансове ім'я.
        let (store, writer, cell) = overridden();
        let from_frontend = cell.read().await.clone();

        writer
            .commit(&cell, |s| {
                *s = from_frontend;
                Commit::Save(())
            })
            .await
            .unwrap();

        assert_eq!(store.last().unwrap().active_profile, "Музика");
    }

    #[tokio::test]
    async fn choosing_a_profile_replaces_the_file_profile() {
        let (store, writer, cell) = overridden();

        writer.choose_profile(&cell, "Спорт".into()).await.unwrap();
        assert_eq!(store.last().unwrap().active_profile, "Спорт");

        writer.commit(&cell, toggle_smtc).await.unwrap();
        assert_eq!(store.last().unwrap().active_profile, "Спорт", "наступні записи вибору не повертають");
        assert_eq!(cell.read().await.active_profile, "Спорт");
    }

    #[tokio::test]
    async fn choosing_the_session_profile_makes_it_the_file_profile() {
        // Свідомий вибір того самого профілю, у якому сеанс і так працює.
        let (store, writer, cell) = overridden();

        writer.choose_profile(&cell, "Новини".into()).await.unwrap();
        writer.commit(&cell, toggle_smtc).await.unwrap();

        assert_eq!(store.last().unwrap().active_profile, "Новини");
    }

    #[tokio::test]
    async fn failed_choice_restores_both_memory_and_the_file_profile() {
        let (store, writer, cell) = overridden_with(MemStore::failing_on(&[1]));

        assert!(writer.choose_profile(&cell, "Спорт".into()).await.is_err());
        assert_eq!(cell.read().await.active_profile, "Новини");

        writer.commit(&cell, toggle_smtc).await.unwrap();
        assert_eq!(store.last().unwrap().active_profile, "Музика");
    }

    #[tokio::test]
    async fn without_an_override_the_memory_profile_is_written() {
        let store = MemStore::new();
        let writer = SettingsWriter::new(store.clone(), None);
        let cell = RwLock::new(settings_in("Новини"));

        writer.commit(&cell, toggle_smtc).await.unwrap();
        assert_eq!(store.last().unwrap().active_profile, "Новини");

        writer.choose_profile(&cell, "Спорт".into()).await.unwrap();
        assert_eq!(store.last().unwrap().active_profile, "Спорт");
    }

    #[tokio::test]
    async fn renaming_the_file_profile_writes_the_new_name_at_once() {
        // Інакше наступний звичайний запуск шукав би файл, якого вже немає.
        let (store, writer, cell) = overridden();

        writer.file_profile_moved(&cell, "Музика", Some("Музика 2".into())).await.unwrap();
        assert_eq!(store.last().unwrap().active_profile, "Музика 2");

        writer.commit(&cell, toggle_smtc).await.unwrap();
        assert_eq!(store.last().unwrap().active_profile, "Музика 2");
        assert_eq!(cell.read().await.active_profile, "Новини");
    }

    #[tokio::test]
    async fn deleting_the_file_profile_hands_the_file_to_the_session_profile() {
        let (store, writer, cell) = overridden();

        writer.file_profile_moved(&cell, "Музика", None).await.unwrap();
        assert_eq!(store.last().unwrap().active_profile, "Новини");

        writer.commit(&cell, toggle_smtc).await.unwrap();
        assert_eq!(store.last().unwrap().active_profile, "Новини");
    }

    #[tokio::test]
    async fn moving_another_profile_does_not_write() {
        let (store, writer, cell) = overridden();

        writer.file_profile_moved(&cell, "Спорт", None).await.unwrap();
        writer.file_profile_moved(&cell, "Джаз", Some("Блюз".into())).await.unwrap();
        assert_eq!(store.save_count(), 0);

        writer.commit(&cell, toggle_smtc).await.unwrap();
        assert_eq!(store.last().unwrap().active_profile, "Музика");
    }

    #[test]
    fn detached_copy_carries_the_file_profile() {
        // Шлях `lib.rs` до AppState: гасіння перенесеного автозапуску.
        let settings = settings_in("Новини");

        assert_eq!(disk_snapshot(&settings, Some("Музика")).active_profile, "Музика");
        assert_eq!(disk_snapshot(&settings, None).active_profile, "Новини");
    }
}
