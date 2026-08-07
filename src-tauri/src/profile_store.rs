//! Сховище активного профілю та коміт змін до нього.
//!
//! Терміни — [CONTEXT.md](../../CONTEXT.md). Коротко: **коміт** — це мутація
//! активного профілю разом із її записом на диск; **сховище** — те, куди
//! лягає знімок. Впорядкованість комітів забезпечує цей модуль, сховище про
//! неї не знає.
//!
//! Це єдине місце в кодовій базі, яке пише файл профілю. `Profile` не має
//! методу `save` — записати профіль можна лише через [`ProfileWriter::commit`]
//! (активний профіль) або [`save_detached`] (завантажений неактивний).

use std::io::Write;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use tokio::sync::{Mutex, RwLock};

use crate::errors::RadioError;
use crate::portable;
use crate::profile::Profile;

/// Що мутація повідомляє комітові.
///
/// `Skip` — мутація виявила, що змінювати нічого (патерн уже у wishlist, усі
/// URL імпорту — дублікати). Значення повертається викликачеві, запису не
/// відбувається. Рішення належить мутації, а не місцю виклику: інакше кожен
/// викликач мусив би пам'ятати, коли запис зайвий.
pub enum Commit<T> {
    Save(T),
    Skip(T),
}

/// Куди коміт кладе знімок.
///
/// Уміє рівно одне — записати один знімок. Ані блокувань, ані порядку —
/// це відповідальність [`ProfileWriter`].
pub trait ProfileStore: Send + Sync + 'static {
    fn save(&self, profile: &Profile) -> Result<(), RadioError>;
}

/// Прод-сховище: файл `data/profiles/<назва>.tapirprofile`.
pub struct FileProfileStore;

impl ProfileStore for FileProfileStore {
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

/// `tmp` → write → `sync_all` → `rename`.
///
/// `sync_all` **до** `rename`: без нього rename атомарний лише щодо імені —
/// після раптового зникнення живлення на місці профілю може опинитися порожній
/// або обрізаний файл. Crash-recovery (фаза 3K) існує саме для цього сценарію,
/// тож економити тут нема на чому.
fn write_profile_file(profile: &Profile) -> Result<(), RadioError> {
    let path = portable::profiles_dir().join(format!("{}.tapirprofile", profile.name));
    let tmp_path = path.with_extension("tapirprofile.tmp");
    let json = serde_json::to_string_pretty(profile)?;
    {
        let mut file = std::fs::File::create(&tmp_path)?;
        file.write_all(json.as_bytes())?;
        file.sync_all()?;
    }
    std::fs::rename(&tmp_path, &path)?;
    Ok(())
}

/// Володіє порядком записів активного профілю.
///
/// Гарантія: **на диск ніколи не лягає знімок, старіший за вже записаний знімок
/// того самого профілю.**
///
/// Механізм — квиток, а не утримання лока. Під локом профілю коміт бере номер
/// (миттєво, синхронно) і відпускає лок; далі змагається за право писати. Той,
/// хто дійшов до запису з номером, старішим за вже записаний, не пише зовсім:
/// оскільки профіль пишеться **цілком**, новіший знімок уже містить його
/// мутацію.
///
/// Альтернатива «взяти дозвіл на запис ще під локом профілю» відкинута: дозвіл
/// асинхронний, тож очікування на нього тримало б лок профілю на час чужого
/// файлового запису — рівно те, чого правило architecture.md §4 уникає.
pub struct ProfileWriter {
    store: Arc<dyn ProfileStore>,
    /// Номер наступного коміту. Починається з 1, щоб 0 означав «ще нічого не записано».
    next_seq: AtomicU64,
    /// Серіалізує записи; всередині — номер останнього успішно записаного знімка
    /// **для кожного імені профілю**. Ключ потрібен через перемикання профілю:
    /// знімки різних профілів лягають у різні файли, тож новіший запис одного
    /// не має права витіснити відкладений запис іншого.
    gate: Mutex<std::collections::HashMap<String, u64>>,
}

impl ProfileWriter {
    pub fn new(store: Arc<dyn ProfileStore>) -> Self {
        Self {
            store,
            next_seq: AtomicU64::new(1),
            gate: Mutex::new(std::collections::HashMap::new()),
        }
    }

    /// Змінити активний профіль і записати його.
    ///
    /// Замикання **синхронне**: усе, чого треба чекати (мережа, читання файлу),
    /// робиться до виклику. Через це тримати лок профілю через `.await`
    /// неможливо за конструкцією, а не за домовленістю.
    ///
    /// Помилка запису повертається викликачеві, а пам'ять лишається зміненою.
    /// Розбіжність тимчасова: наступний успішний коміт — з будь-якої причини —
    /// перенесе на диск і цю мутацію теж, бо пишеться весь профіль.
    pub async fn commit<T, F>(&self, profile: &RwLock<Profile>, mutate: F) -> Result<T, RadioError>
    where
        F: FnOnce(&mut Profile) -> Commit<T> + Send,
        T: Send,
    {
        let (value, seq, snapshot) = {
            let mut guard = profile.write().await;
            match mutate(&mut guard) {
                Commit::Skip(value) => return Ok(value),
                Commit::Save(value) => {
                    let seq = self.next_seq.fetch_add(1, Ordering::SeqCst);
                    (value, seq, guard.clone())
                }
            }
        };
        self.write(seq, snapshot).await?;
        Ok(value)
    }

    /// Записати знімок, якщо його ще не витіснив новіший знімок того самого профілю.
    pub(crate) async fn write(&self, seq: u64, snapshot: Profile) -> Result<(), RadioError> {
        let name = snapshot.name.clone();
        let mut gate = self.gate.lock().await;
        if gate.get(&name).copied().unwrap_or(0) > seq {
            return Ok(());
        }
        let store = self.store.clone();
        let result = tokio::task::spawn_blocking(move || store.save(&snapshot))
            .await
            .map_err(|e| RadioError::Other(format!("profile save task panicked: {e}")))?;
        if result.is_ok() {
            gate.insert(name, seq);
        }
        result
    }
}

#[cfg(test)]
pub(crate) mod test_store {
    use super::*;

    /// Тестове сховище: тримає знімки в пам'яті **послідовно**. Саме ця
    /// послідовність і є предметом перевірки — вона доводить, що старіший
    /// знімок ніколи не лягає поверх новішого.
    #[derive(Default)]
    pub struct MemProfileStore {
        pub saved: std::sync::Mutex<Vec<Profile>>,
        /// Лічильник викликів — окремо від `saved`, бо невдалий виклик нічого
        /// не додає, а нумерацію зсувати мусить.
        calls: std::sync::atomic::AtomicUsize,
        /// Номери викликів (від 1), на яких `save` має повернути помилку.
        pub fail_on_call: std::sync::Mutex<Vec<usize>>,
    }

    impl MemProfileStore {
        pub fn new() -> Arc<Self> {
            Arc::new(Self::default())
        }

        pub fn failing_on(calls: &[usize]) -> Arc<Self> {
            let store = Self::default();
            *store.fail_on_call.lock().unwrap() = calls.to_vec();
            Arc::new(store)
        }

        pub fn saved_names(&self) -> Vec<String> {
            self.saved.lock().unwrap().iter().map(|p| p.name.clone()).collect()
        }

        pub fn save_count(&self) -> usize {
            self.saved.lock().unwrap().len()
        }

        pub fn last(&self) -> Option<Profile> {
            self.saved.lock().unwrap().last().cloned()
        }
    }

    impl ProfileStore for MemProfileStore {
        fn save(&self, profile: &Profile) -> Result<(), RadioError> {
            let call = self.calls.fetch_add(1, Ordering::SeqCst) + 1;
            if self.fail_on_call.lock().unwrap().contains(&call) {
                return Err(RadioError::Other(format!("store failure on call {call}")));
            }
            self.saved.lock().unwrap().push(profile.clone());
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_store::MemProfileStore;
    use super::*;

    fn profile(name: &str) -> Profile {
        let mut p = Profile::create_default();
        p.name = name.to_string();
        p
    }

    /// Той самий профіль у двох станах — відрізняються лише вмістом, не іменем
    /// (ім'я тепер ключ воріт, тож розрізняти ним не можна).
    fn version(marker: &str) -> Profile {
        let mut p = profile("Default");
        p.ignorelist.push(marker.to_string());
        p
    }

    fn saved_markers(store: &MemProfileStore) -> Vec<String> {
        store.saved.lock().unwrap().iter().map(|p| p.ignorelist[0].clone()).collect()
    }

    fn writer(store: Arc<MemProfileStore>) -> ProfileWriter {
        ProfileWriter::new(store)
    }

    #[tokio::test]
    async fn commit_writes_the_mutated_snapshot() {
        let store = MemProfileStore::new();
        let writer = writer(store.clone());
        let state = RwLock::new(profile("Default"));

        let out = writer
            .commit(&state, |p| {
                p.ignorelist.push("*jingle*".into());
                Commit::Save(p.ignorelist.len())
            })
            .await
            .unwrap();

        assert_eq!(out, 1);
        assert_eq!(store.save_count(), 1);
        assert_eq!(store.last().unwrap().ignorelist, vec!["*jingle*".to_string()]);
        // Пам'ять і диск збігаються.
        assert_eq!(state.read().await.ignorelist, vec!["*jingle*".to_string()]);
    }

    #[tokio::test]
    async fn skip_returns_the_value_without_writing() {
        let store = MemProfileStore::new();
        let writer = writer(store.clone());
        let state = RwLock::new(profile("Default"));

        let out = writer.commit(&state, |_| Commit::Skip("вже є")).await.unwrap();

        assert_eq!(out, "вже є");
        assert_eq!(store.save_count(), 0);
    }

    #[tokio::test]
    async fn a_late_stale_snapshot_never_overwrites_a_newer_one() {
        // Пряма перевірка інваріанта воріт: знімок №2 дійшов до запису першим,
        // знімок №1 — після нього. Це рівно та гонка, що можлива між командою
        // IPC і фоновим ICY-перейменуванням.
        let store = MemProfileStore::new();
        let writer = writer(store.clone());

        writer.write(2, version("новіший")).await.unwrap();
        writer.write(1, version("старіший")).await.unwrap();

        assert_eq!(saved_markers(&store), vec!["новіший".to_string()]);
    }

    #[tokio::test]
    async fn a_newer_write_does_not_suppress_another_profile() {
        // Перемикання профілю: відкладений запис старого профілю йде в СВІЙ файл,
        // тож свіжий коміт нового профілю не має права його витіснити.
        let store = MemProfileStore::new();
        let writer = writer(store.clone());

        writer.write(2, profile("Новий")).await.unwrap();
        writer.write(1, profile("Старий")).await.unwrap();

        assert_eq!(store.saved_names(), vec!["Новий".to_string(), "Старий".to_string()]);
    }

    #[tokio::test]
    async fn an_equal_seq_still_writes() {
        // Витісняє лише СТАРІШИЙ. Межа — свій власний номер.
        let store = MemProfileStore::new();
        let writer = writer(store.clone());

        writer.write(1, version("перший")).await.unwrap();
        writer.write(1, version("той самий")).await.unwrap();

        assert_eq!(saved_markers(&store), vec!["перший".to_string(), "той самий".to_string()]);
    }

    #[tokio::test]
    async fn a_failed_write_does_not_advance_the_gate() {
        // Невдалий новіший запис не має «поглинати» старіший: на диску його
        // змін немає, тож старіший знімок лишається кращим за нічого.
        let store = MemProfileStore::failing_on(&[1]);
        let writer = writer(store.clone());

        assert!(writer.write(2, version("новіший")).await.is_err());
        writer.write(1, version("старіший")).await.unwrap();

        assert_eq!(saved_markers(&store), vec!["старіший".to_string()]);
    }

    #[tokio::test]
    async fn a_failed_commit_reports_the_error_and_keeps_the_mutation() {
        let store = MemProfileStore::failing_on(&[1]);
        let writer = writer(store.clone());
        let state = RwLock::new(profile("Default"));

        let result = writer
            .commit(&state, |p| {
                p.ignorelist.push("*ad*".into());
                Commit::Save(())
            })
            .await;

        assert!(result.is_err());
        assert_eq!(store.save_count(), 0);
        // Пам'ять — першоджерело: мутація лишається, наступний успішний коміт її запише.
        assert_eq!(state.read().await.ignorelist, vec!["*ad*".to_string()]);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn concurrent_commits_converge_on_the_memory_state() {
        let store = MemProfileStore::new();
        let writer = Arc::new(ProfileWriter::new(store.clone()));
        let state = Arc::new(RwLock::new(profile("Default")));

        let mut tasks = Vec::new();
        for i in 0..50 {
            let writer = writer.clone();
            let state = state.clone();
            tasks.push(tokio::spawn(async move {
                writer
                    .commit(&state, move |p| {
                        p.ignorelist.push(format!("pattern-{i}"));
                        Commit::Save(())
                    })
                    .await
                    .unwrap();
            }));
        }
        for t in tasks {
            t.await.unwrap();
        }

        let in_memory = state.read().await.ignorelist.clone();
        assert_eq!(in_memory.len(), 50);
        // Останній знімок на «диску» дорівнює пам'яті — жоден старіший не ліг поверх.
        assert_eq!(store.last().unwrap().ignorelist, in_memory);
    }
}
