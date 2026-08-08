//! Коміт стану, що переживає перезапуск, і порядок його записів.
//!
//! Терміни — [CONTEXT.md](../../CONTEXT.md). Механізм тут один на всі
//! персистентні агрегати (профіль, глобальні налаштування); що саме і в який
//! файл лягає — справа модулів-адаптерів (`profile_store`, `settings_store`).
//!
//! Інваріант порядку живе **тільки тут**: дві його копії означали б два місця,
//! де його можна зламати.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use tokio::sync::{Mutex, RwLock};

use crate::errors::RadioError;

/// Що мутація повідомляє комітові.
///
/// `Skip` — мутація виявила, що на диску міняти нічого: патерн уже у wishlist,
/// усі URL імпорту — дублікати, або зміна свідомо стосується лише пам'яті
/// (відкат після невдалого запису). Значення повертається викликачеві, запису
/// не відбувається. Рішення належить мутації, а не місцю виклику.
pub enum Commit<T> {
    Save(T),
    Skip(T),
}

/// Агрегат, який можна покласти на диск.
pub trait Persist: Clone + Send + Sync + 'static {
    /// Ключ воріт. Різні ключі — різні файли, тож знімок з одним ключем ніколи
    /// не витісняє відкладений запис з іншим (профілі: ключ — ім'я профілю).
    fn key(&self) -> String;
}

/// Куди коміт кладе знімок.
///
/// Уміє рівно одне — записати один знімок. Ані блокувань, ані порядку: це
/// відповідальність [`Writer`].
pub trait Store<T>: Send + Sync + 'static {
    fn save(&self, value: &T) -> Result<(), RadioError>;
}

/// Володіє порядком записів одного агрегату.
///
/// Гарантія: **на диск ніколи не лягає знімок, старіший за вже записаний знімок
/// з тим самим ключем.**
///
/// Механізм — квиток, а не утримання лока. Під локом стану коміт бере номер
/// (миттєво, синхронно) і відпускає лок; далі змагається за право писати. Той,
/// хто дійшов до запису з номером, старішим за вже записаний, не пише зовсім:
/// агрегат пишеться **цілком**, тож новіший знімок уже містить його мутацію.
///
/// Альтернатива «взяти дозвіл на запис ще під локом стану» відкинута: дозвіл
/// асинхронний, тож очікування на нього тримало б лок на час чужого файлового
/// запису — рівно те, чого правило architecture.md §4 уникає.
pub struct Writer<T> {
    store: Arc<dyn Store<T>>,
    /// Номер наступного коміту. Починається з 1, щоб 0 означав «ще нічого не записано».
    next_seq: AtomicU64,
    /// Серіалізує записи; всередині — номер останнього успішно записаного
    /// знімка для кожного ключа.
    gate: Mutex<HashMap<String, u64>>,
}

impl<T: Persist> Writer<T> {
    pub fn new(store: Arc<dyn Store<T>>) -> Self {
        Self { store, next_seq: AtomicU64::new(1), gate: Mutex::new(HashMap::new()) }
    }

    /// Змінити стан і записати його.
    ///
    /// Замикання **синхронне**: усе, чого треба чекати (мережа, читання файлу),
    /// робиться до виклику. Через це тримати лок через `.await` неможливо за
    /// конструкцією, а не за домовленістю.
    ///
    /// Помилка запису повертається викликачеві, а пам'ять лишається зміненою.
    /// Розбіжність тимчасова: наступний успішний коміт — з будь-якої причини —
    /// перенесе на диск і цю мутацію теж, бо пишеться весь агрегат.
    pub async fn commit<R, F>(&self, cell: &RwLock<T>, mutate: F) -> Result<R, RadioError>
    where
        F: FnOnce(&mut T) -> Commit<R> + Send,
        R: Send,
    {
        let (value, seq, snapshot) = {
            let mut guard = cell.write().await;
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

    /// Записати знімок, якщо його ще не витіснив новіший знімок із тим же ключем.
    pub(crate) async fn write(&self, seq: u64, snapshot: T) -> Result<(), RadioError> {
        let key = snapshot.key();
        let mut gate = self.gate.lock().await;
        if gate.get(&key).copied().unwrap_or(0) > seq {
            return Ok(());
        }
        let store = self.store.clone();
        let result = tokio::task::spawn_blocking(move || store.save(&snapshot))
            .await
            .map_err(|e| RadioError::Other(format!("save task panicked: {e}")))?;
        if result.is_ok() {
            gate.insert(key, seq);
        }
        result
    }
}

/// `tmp` → write → `sync_all` → `rename`.
///
/// `sync_all` **до** `rename`: без нього rename атомарний лише щодо імені —
/// після раптового зникнення живлення на місці файлу може опинитися порожній
/// або обрізаний. Crash-recovery (фаза 3K) існує саме для цього сценарію, тож
/// економити тут нема на чому.
pub(crate) fn write_json_atomically<T: serde::Serialize>(
    path: &std::path::Path,
    tmp_extension: &str,
    value: &T,
) -> Result<(), RadioError> {
    use std::io::Write;

    let tmp_path = path.with_extension(tmp_extension);
    let json = serde_json::to_string_pretty(value)?;
    {
        let mut file = std::fs::File::create(&tmp_path)?;
        file.write_all(json.as_bytes())?;
        file.sync_all()?;
    }
    std::fs::rename(&tmp_path, path)?;
    Ok(())
}

#[cfg(test)]
pub(crate) mod test_store {
    use super::*;

    /// Тестове сховище: тримає знімки в пам'яті **послідовно**. Саме ця
    /// послідовність і є предметом перевірки — вона доводить, що старіший
    /// знімок ніколи не лягає поверх новішого.
    pub struct MemStore<T> {
        pub saved: std::sync::Mutex<Vec<T>>,
        /// Лічильник викликів — окремо від `saved`, бо невдалий виклик нічого
        /// не додає, а нумерацію зсувати мусить.
        calls: std::sync::atomic::AtomicUsize,
        /// Номери викликів (від 1), на яких `save` має повернути помилку.
        fail_on_call: Vec<usize>,
    }

    impl<T: Persist> MemStore<T> {
        pub fn new() -> Arc<Self> {
            Self::failing_on(&[])
        }

        pub fn failing_on(calls: &[usize]) -> Arc<Self> {
            Arc::new(Self {
                saved: std::sync::Mutex::new(Vec::new()),
                calls: std::sync::atomic::AtomicUsize::new(0),
                fail_on_call: calls.to_vec(),
            })
        }

        pub fn save_count(&self) -> usize {
            self.saved.lock().unwrap().len()
        }

        pub fn last(&self) -> Option<T> {
            self.saved.lock().unwrap().last().cloned()
        }

        pub fn saved_keys(&self) -> Vec<String> {
            self.saved.lock().unwrap().iter().map(|v| v.key()).collect()
        }
    }

    impl<T: Persist> Store<T> for MemStore<T> {
        fn save(&self, value: &T) -> Result<(), RadioError> {
            let call = self.calls.fetch_add(1, Ordering::SeqCst) + 1;
            if self.fail_on_call.contains(&call) {
                return Err(RadioError::Other(format!("store failure on call {call}")));
            }
            self.saved.lock().unwrap().push(value.clone());
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_store::MemStore;
    use super::*;

    /// Мінімальний агрегат: ключ (який файл) + маркер (яка версія).
    #[derive(Clone, PartialEq, Debug)]
    struct Doc {
        name: String,
        marker: String,
    }

    impl Persist for Doc {
        fn key(&self) -> String {
            self.name.clone()
        }
    }

    fn doc(name: &str, marker: &str) -> Doc {
        Doc { name: name.into(), marker: marker.into() }
    }

    /// Дві версії одного файлу — різняться маркером, не ключем.
    fn version(marker: &str) -> Doc {
        doc("default", marker)
    }

    fn markers(store: &MemStore<Doc>) -> Vec<String> {
        store.saved.lock().unwrap().iter().map(|d| d.marker.clone()).collect()
    }

    #[tokio::test]
    async fn commit_writes_the_mutated_snapshot() {
        let store = MemStore::new();
        let writer = Writer::new(store.clone());
        let cell = RwLock::new(version("v1"));

        let out = writer
            .commit(&cell, |d| {
                d.marker = "v2".into();
                Commit::Save(d.marker.clone())
            })
            .await
            .unwrap();

        assert_eq!(out, "v2");
        assert_eq!(markers(&store), vec!["v2".to_string()]);
        // Пам'ять і диск збігаються.
        assert_eq!(cell.read().await.marker, "v2");
    }

    #[tokio::test]
    async fn skip_returns_the_value_without_writing() {
        let store = MemStore::new();
        let writer = Writer::new(store.clone());
        let cell = RwLock::new(version("v1"));

        let out = writer.commit(&cell, |_| Commit::Skip("вже є")).await.unwrap();

        assert_eq!(out, "вже є");
        assert_eq!(store.save_count(), 0);
    }

    #[tokio::test]
    async fn skip_still_applies_the_mutation_to_memory() {
        // Використовується для відкату пам'яті після невдалого запису:
        // на диску вже старе значення, тож писати його вдруге не треба.
        let store = MemStore::new();
        let writer = Writer::new(store.clone());
        let cell = RwLock::new(version("v1"));

        writer
            .commit(&cell, |d| {
                d.marker = "відкат".into();
                Commit::Skip(())
            })
            .await
            .unwrap();

        assert_eq!(cell.read().await.marker, "відкат");
        assert_eq!(store.save_count(), 0);
    }

    #[tokio::test]
    async fn a_late_stale_snapshot_never_overwrites_a_newer_one() {
        // Пряма перевірка інваріанта воріт: знімок №2 дійшов до запису першим,
        // знімок №1 — після нього. Це рівно та гонка, що можлива між командою
        // IPC і фоновим ICY-перейменуванням.
        let store = MemStore::new();
        let writer = Writer::new(store.clone());

        writer.write(2, version("новіший")).await.unwrap();
        writer.write(1, version("старіший")).await.unwrap();

        assert_eq!(markers(&store), vec!["новіший".to_string()]);
    }

    #[tokio::test]
    async fn a_newer_write_does_not_suppress_another_key() {
        // Перемикання профілю: відкладений запис старого йде у СВІЙ файл, тож
        // свіжий коміт нового не має права його витіснити.
        let store = MemStore::new();
        let writer = Writer::new(store.clone());

        writer.write(2, doc("Новий", "a")).await.unwrap();
        writer.write(1, doc("Старий", "b")).await.unwrap();

        assert_eq!(store.saved_keys(), vec!["Новий".to_string(), "Старий".to_string()]);
    }

    #[tokio::test]
    async fn an_equal_seq_still_writes() {
        // Витісняє лише СТАРІШИЙ. Межа — свій власний номер.
        let store = MemStore::new();
        let writer = Writer::new(store.clone());

        writer.write(1, version("перший")).await.unwrap();
        writer.write(1, version("той самий")).await.unwrap();

        assert_eq!(markers(&store), vec!["перший".to_string(), "той самий".to_string()]);
    }

    #[tokio::test]
    async fn a_failed_write_does_not_advance_the_gate() {
        // Невдалий новіший запис не має «поглинати» старіший: на диску його
        // змін немає, тож старіший знімок лишається кращим за нічого.
        let store = MemStore::failing_on(&[1]);
        let writer = Writer::new(store.clone());

        assert!(writer.write(2, version("новіший")).await.is_err());
        writer.write(1, version("старіший")).await.unwrap();

        assert_eq!(markers(&store), vec!["старіший".to_string()]);
    }

    #[tokio::test]
    async fn a_failed_commit_reports_the_error_and_keeps_the_mutation() {
        let store = MemStore::failing_on(&[1]);
        let writer = Writer::new(store.clone());
        let cell = RwLock::new(version("v1"));

        let result = writer
            .commit(&cell, |d| {
                d.marker = "v2".into();
                Commit::Save(())
            })
            .await;

        assert!(result.is_err());
        assert_eq!(store.save_count(), 0);
        // Пам'ять — першоджерело: мутація лишається, наступний успішний коміт її запише.
        assert_eq!(cell.read().await.marker, "v2");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn concurrent_commits_converge_on_the_memory_state() {
        let store = MemStore::new();
        let writer = Arc::new(Writer::new(store.clone()));
        let cell = Arc::new(RwLock::new(version("")));

        let mut tasks = Vec::new();
        for i in 0..50 {
            let writer = writer.clone();
            let cell = cell.clone();
            tasks.push(tokio::spawn(async move {
                writer
                    .commit(&cell, move |d| {
                        d.marker.push_str(&format!("{i},"));
                        Commit::Save(())
                    })
                    .await
                    .unwrap();
            }));
        }
        for t in tasks {
            t.await.unwrap();
        }

        let in_memory = cell.read().await.marker.clone();
        assert_eq!(in_memory.matches(',').count(), 50);
        // Останній знімок на «диску» дорівнює пам'яті — жоден старіший не ліг поверх.
        assert_eq!(store.last().unwrap().marker, in_memory);
    }
}
