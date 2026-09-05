//! Localisation of the native surfaces (tray menu, tooltip, toasts, dialogs).
//!
//! Джерело перекладів одне — `src/i18n/messages/*.json`, ті самі файли, які
//! paraglide компілює для webview. Rust — їхній **другий споживач**, а не друге
//! джерело: дублювання рядків тут неминуче розійшлося б із фронтендом.
//!
//! Файли вшиваються на компіляції (`include_str!`), бо в збірку вони не
//! потрапляють: paraglide перетворює їх на JS, і поруч із exe жодного JSON
//! немає. Розбір — один раз на локаль, у `OnceLock`.
//!
//! Локаль живе тут, а не в `AppState`, з двох причин: діалог невдалого старту
//! показується саме тоді, коли `AppState` створити не вдалося, а `build_menu`
//! і `tooltip` синхронні — читати з асинхронного `RwLock` вони могли б лише
//! через `block_on`.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::OnceLock;

const UK_JSON: &str = include_str!("../../src/i18n/messages/uk.json");
const EN_JSON: &str = include_str!("../../src/i18n/messages/en.json");

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Locale {
    Uk = 0,
    En = 1,
}

impl Locale {
    /// `uk-UA` → `Uk`; будь-що інше → `En`. Тег приходить із
    /// `GlobalSettings.language`, де значень рівно два, але звужувати до них
    /// не варто: невідома мова має давати робочий інтерфейс, а не паніку.
    pub fn from_tag(tag: &str) -> Self {
        if tag.starts_with("uk") { Self::Uk } else { Self::En }
    }
}

/// Поточна локаль нативного шару. `Uk` до першого `set_locale` — це джерельна
/// мова `messages/`, тож найгірше, що дає невстановлена локаль, — українська,
/// а не порожні рядки.
static CURRENT: AtomicU8 = AtomicU8::new(Locale::Uk as u8);

pub fn set_locale(locale: Locale) {
    CURRENT.store(locale as u8, Ordering::Relaxed);
}

pub fn locale() -> Locale {
    if CURRENT.load(Ordering::Relaxed) == Locale::Uk as u8 { Locale::Uk } else { Locale::En }
}

fn messages(locale: Locale) -> &'static HashMap<String, String> {
    static UK: OnceLock<HashMap<String, String>> = OnceLock::new();
    static EN: OnceLock<HashMap<String, String>> = OnceLock::new();
    match locale {
        Locale::Uk => UK.get_or_init(|| parse(UK_JSON)),
        Locale::En => EN.get_or_init(|| parse(EN_JSON)),
    }
}

/// Вміст вшито на компіляції, тож зламаний JSON — дефект збірки, а не рантайму:
/// падати тут чесніше, ніж мовчки лишити застосунок без єдиного напису.
fn parse(raw: &str) -> HashMap<String, String> {
    serde_json::from_str(raw).expect("i18n: messages JSON is malformed")
}

/// Ключі оголошуються макросом, щоб `ALL` не могла розійтися з переліком
/// варіантів: тест обходить саме `ALL`, і пропущений там варіант зробив би
/// перевірку сліпою рівно до нього.
macro_rules! keys {
    ($name:ident, $all:ident, $( $(#[$attr:meta])* $variant:ident => $id:literal ),+ $(,)?) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq)]
        pub enum $name { $( $(#[$attr])* $variant ),+ }

        impl $name {
            /// Повний перелік ключів — існує заради тесту, який вимагає кожен
            /// із них в обох мовах; у прод-коді ключі беруться поіменно.
            #[cfg(test)]
            pub const $all: &'static [$name] = &[ $( $name::$variant ),+ ];

            pub fn id(self) -> &'static str {
                match self { $( $name::$variant => $id ),+ }
            }
        }
    };
}

keys! { Key, ALL,
    // — меню значка —
    TrayNowPlaying        => "tray_now_playing",
    TrayPlay              => "tray_play",
    TrayPause             => "tray_pause",
    TrayStop              => "tray_stop",
    TrayStopAllRecordings => "tray_stop_all_recordings",
    TrayShowWindow        => "tray_show_window",
    TrayHideWindow        => "tray_hide_window",
    TrayQuit              => "tray_quit",
    // — мітка джерела звуку —
    TraySourceFile        => "tray_source_file",
    // Прев'ю — термін домену, а не мітка інтерфейсу (CONTEXT.md): у меню це
    // станція, як її і зве решта інтерфейсу.
    TraySourceStation     => "tray_source_station",
    // — діалог підтвердження виходу —
    QuitConfirmTitle      => "tray_quit_confirm_title",
    QuitConfirmActive     => "tray_quit_confirm_active",
    QuitConfirmSchedOne   => "tray_quit_confirm_scheduled_one",
    QuitConfirmSchedMany  => "tray_quit_confirm_scheduled_many",
    QuitConfirmSchedItem  => "tray_quit_confirm_scheduled_item",
    QuitConfirmQuestion   => "tray_quit_confirm_question",
    // — діалог невдалого старту —
    StartupErrorTitle     => "startup_error_title",
    StartupErrorBody      => "startup_error_body",
    // — спільне з live region: одна подія — один ключ —
    AppName               => "app_name",
    SchedStarted          => "scheduled_announce_started",
    SchedCompleted        => "scheduled_announce_completed",
    SchedMissed           => "scheduled_announce_missed",
    SchedSkipped          => "scheduled_announce_skipped",
    ReasonAppNotRunning    => "schedule_reason_app_not_running",
    ReasonStartFailed      => "schedule_reason_start_failed",
    ReasonClockChange      => "schedule_reason_clock_change",
    ReasonUnsupportedCodec => "schedule_reason_unsupported_codec",
    // — невдалий prev/next: ті самі ключі, що читає вікно —
    PlaybackError          => "playback_error",
    StreamPlayUnsupported  => "stream_play_unsupported",
}

keys! { PluralKey, ALL,
    /// Спільна з кнопкою «Записати все»: та сама подія, той самий підрахунок.
    RecordAllStarted => "record_all_announce",
    /// Близнюка на фронтенді немає (там зупинка рахується разом із пропущеними),
    /// тож ключ власний — але формулювання дзеркалить `record_all_announce`.
    StopAll          => "tray_stop_all",
    /// Спільна з лічильником у списку потоків.
    ActiveRecordings => "active_recordings",
}

/// Суфікс форми числа. Повторює конвенцію фронтенду (`plural()` у
/// `src/lib/plural.ts`): нуль — окремий випадок застосунку, а не форма мови;
/// далі правила CLDR для `uk` (1 / 2–4 / решта) і `en` (1 / решта).
fn plural_suffix(locale: Locale, n: usize) -> &'static str {
    if n == 0 { return "zero"; }
    match locale {
        Locale::Uk => {
            let n10 = n % 10;
            let n100 = n % 100;
            if n10 == 1 && n100 != 11 {
                "one"
            } else if (2..=4).contains(&n10) && !(12..=14).contains(&n100) {
                "few"
            } else {
                "many"
            }
        }
        Locale::En => if n == 1 { "one" } else { "many" },
    }
}

fn lookup(id: &str) -> String {
    match messages(locale()).get(id) {
        Some(s) => s.clone(),
        None => {
            // Недосяжно, поки тест нижче зелений. Українську як запасний варіант
            // не беремо: підміна саме тим текстом, від якого лікує локалізація,
            // сховала б проблему в єдиній конфігурації, де вона шкодить.
            log::warn!("i18n: missing key {id:?} for locale {:?}", locale());
            id.to_string()
        }
    }
}

fn interpolate(template: &str, args: &[(&str, &str)]) -> String {
    let mut out = template.to_string();
    for (name, value) in args {
        out = out.replace(&format!("{{{name}}}"), value);
    }
    out
}

/// Рядок без підстановок.
pub fn t(key: Key) -> String {
    lookup(key.id())
}

/// Рядок із підстановками: `{name}` у шаблоні замінюється на значення.
pub fn t_args(key: Key, args: &[(&str, &str)]) -> String {
    interpolate(&lookup(key.id()), args)
}

/// Рядок із узгодженням за числом. `{count}` підставляється завжди.
pub fn t_plural(key: PluralKey, n: usize) -> String {
    let id = format!("{}_{}", key.id(), plural_suffix(locale(), n));
    interpolate(&lookup(&id), &[("count", &n.to_string())])
}

/// Виконати `f` під заданою локаллю. Тести локалізованих поверхонь живуть у
/// різних модулях, але локаль у процесі одна — без цього замка вони читали б
/// чужу мову посеред власної перевірки.
#[cfg(test)]
pub fn with_locale<T>(locale: Locale, f: impl FnOnce() -> T) -> T {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let prev = self::locale();
    set_locale(locale);
    let out = f();
    set_locale(prev);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_key_exists_in_both_locales() {
        for key in Key::ALL {
            for locale in [Locale::Uk, Locale::En] {
                assert!(
                    messages(locale).contains_key(key.id()),
                    "{:?}: ключа {:?} немає в {:?}",
                    key, key.id(), locale
                );
            }
        }
    }

    #[test]
    fn every_plural_family_has_all_four_forms_in_both_locales() {
        for key in PluralKey::ALL {
            for suffix in ["zero", "one", "few", "many"] {
                let id = format!("{}_{}", key.id(), suffix);
                for locale in [Locale::Uk, Locale::En] {
                    assert!(
                        messages(locale).contains_key(&id),
                        "{:?}: ключа {id:?} немає в {locale:?}",
                        key
                    );
                }
            }
        }
    }

    #[test]
    fn ukrainian_plural_follows_one_few_many() {
        let uk = |n| plural_suffix(Locale::Uk, n);
        assert_eq!(uk(0), "zero");
        assert_eq!((uk(1), uk(21), uk(101)), ("one", "one", "one"));
        assert_eq!((uk(2), uk(4), uk(22)), ("few", "few", "few"));
        assert_eq!((uk(5), uk(11), uk(12), uk(14), uk(25)), ("many", "many", "many", "many", "many"));
    }

    #[test]
    fn english_plural_is_one_or_many() {
        let en = |n| plural_suffix(Locale::En, n);
        assert_eq!(en(0), "zero");
        assert_eq!(en(1), "one");
        assert_eq!((en(2), en(5), en(21)), ("many", "many", "many"));
    }

    #[test]
    fn locale_switches_the_string() {
        assert_eq!(with_locale(Locale::Uk, || t(Key::TrayQuit)), "Вихід");
        assert_eq!(with_locale(Locale::En, || t(Key::TrayQuit)), "Quit");
    }

    #[test]
    fn placeholders_are_substituted() {
        let s = with_locale(Locale::En, || {
            t_args(Key::TraySourceStation, &[("name", "SomaFM")])
        });
        assert_eq!(s, "Station: SomaFM");
    }

    #[test]
    fn plural_substitutes_count_and_picks_the_form() {
        with_locale(Locale::Uk, || {
            assert_eq!(t_plural(PluralKey::StopAll, 1), "Зупинено запис: 1 потік");
            assert_eq!(t_plural(PluralKey::StopAll, 3), "Зупинено запис: 3 потоки");
            assert_eq!(t_plural(PluralKey::StopAll, 5), "Зупинено запис: 5 потоків");
            assert_eq!(t_plural(PluralKey::StopAll, 0), "Запис не йшов");
        });
        with_locale(Locale::En, || {
            assert_eq!(t_plural(PluralKey::StopAll, 1), "Recording stopped: 1 stream");
            assert_eq!(t_plural(PluralKey::StopAll, 3), "Recording stopped: 3 streams");
        });
    }

    #[test]
    fn locale_from_tag_maps_both_settings_values() {
        assert_eq!(Locale::from_tag("uk-UA"), Locale::Uk);
        assert_eq!(Locale::from_tag("en-US"), Locale::En);
        assert_eq!(Locale::from_tag("de-DE"), Locale::En);
    }

    #[test]
    fn missing_key_falls_back_to_its_own_name_not_to_ukrainian() {
        with_locale(Locale::En, || {
            assert_eq!(lookup("tray_no_such_key"), "tray_no_such_key");
        });
    }
}
