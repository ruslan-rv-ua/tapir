//! Tray menu and tooltip construction (pure functions).

use crate::i18n::{self, Key, PluralKey};
use crate::tray::{MenuPlayback, MenuSnapshot};

const MAX_TOOLTIP_CHARS: usize = 127;

/// Build the Windows tray tooltip from a snapshot.
pub fn tooltip(snap: &MenuSnapshot) -> String {
    let playing = matches!(snap.playback, MenuPlayback::Live | MenuPlayback::FilePlaying);
    let station = snap.now_playing_label.as_deref();
    let rec = snap.active_recordings;
    let app = i18n::t(Key::AppName);
    let recs = |n| i18n::t_plural(PluralKey::ActiveRecordings, n);

    let s = match (playing, station, rec) {
        (false, _, 0)       => app,
        (true, Some(st), 0) => format!("{app} — ▶ {st}"),
        (false, _, n)       => format!("{app} — ● {}", recs(n)),
        (true, Some(st), n) => format!("{app} — ▶ {st} · ● {}", recs(n)),
        (true, None, _)     => format!("{app} — ▶"),
    };

    truncate_chars(&s, MAX_TOOLTIP_CHARS)
}

fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max { return s.to_string(); }
    let mut out: String = s.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

use tauri::AppHandle;
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder};
use tauri::Wry;

const ID_NOW_PLAYING: &str = "now-playing";
/// The menu's primary playback control — the counterpart of the player panel's
/// main button. Named for the **role**, not for one of its labels: for a file it
/// pauses and resumes, for live sound it stops.
const ID_PRIMARY_PLAYBACK: &str = "primary-playback";
const ID_STOP_PLAYBACK: &str = "stop-playback";
const ID_RECORDING_INFO: &str = "recording-info";
const ID_STOP_ALL: &str = "stop-all";
const ID_TOGGLE_WINDOW: &str = "toggle-window";
const ID_QUIT: &str = "quit";

pub const MENU_ID_PRIMARY_PLAYBACK: &str = ID_PRIMARY_PLAYBACK;
pub const MENU_ID_STOP_PLAYBACK: &str = ID_STOP_PLAYBACK;
pub const MENU_ID_STOP_ALL: &str = ID_STOP_ALL;
pub const MENU_ID_TOGGLE_WINDOW: &str = ID_TOGGLE_WINDOW;
pub const MENU_ID_QUIT: &str = ID_QUIT;

/// What the playback section of the menu looks like in a given state.
pub(crate) struct PlaybackItems {
    /// Whether this state wants the disabled "Now playing: …" line. Today it
    /// agrees with `build_now_playing_label` returning `Some` — the guard there
    /// is the same one — but that guard lives in another function and answers a
    /// different question ("could I compose a label?"). Keeping the wish here
    /// means the whole playback section is decided in one place, under one test.
    pub now_playing: bool,
    /// Label of the primary item — the word that must name what pressing it
    /// does. Never `TrayPause` for live sound: there is no resuming a broadcast.
    pub primary: Key,
    pub primary_enabled: bool,
    /// Whether the separate `Stop` item is drawn alongside. Never for live
    /// sound: the primary item already stops it, and a second item with the
    /// identical word is one a screen reader cannot tell apart.
    pub separate_stop: bool,
}

/// The playback section of the menu, decided. Pure and total, because
/// `build_menu` needs an `AppHandle` and so cannot be unit-tested: keeping the
/// decision here is what lets a test hold the labels to their states.
pub(crate) fn playback_items(playback: MenuPlayback) -> PlaybackItems {
    match playback {
        MenuPlayback::Idle => PlaybackItems {
            now_playing: false,
            primary: Key::TrayPlay,
            primary_enabled: false,
            separate_stop: false,
        },
        MenuPlayback::Live => PlaybackItems {
            now_playing: true,
            primary: Key::TrayStop,
            primary_enabled: true,
            separate_stop: false,
        },
        MenuPlayback::FilePlaying => PlaybackItems {
            now_playing: true,
            primary: Key::TrayPause,
            primary_enabled: true,
            separate_stop: true,
        },
        MenuPlayback::FilePaused => PlaybackItems {
            now_playing: true,
            primary: Key::TrayPlay,
            primary_enabled: true,
            separate_stop: true,
        },
    }
}

/// Build the right-click menu from a snapshot. A thin renderer over
/// `playback_items` — every decision it could get wrong lives there, under test.
pub fn build_menu(app: &AppHandle, snap: &MenuSnapshot) -> tauri::Result<Menu<Wry>> {
    let mut builder = MenuBuilder::new(app);
    let items = playback_items(snap.playback);

    if items.now_playing && snap.now_playing_label.is_some() {
        let label = snap.now_playing_label.as_deref().unwrap_or("");
        let text = i18n::t_args(Key::TrayNowPlaying, &[("label", label)]);
        let item = MenuItemBuilder::with_id(ID_NOW_PLAYING, text)
            .enabled(false)
            .build(app)?;
        builder = builder.item(&item).separator();
    }

    let primary = MenuItemBuilder::with_id(ID_PRIMARY_PLAYBACK, i18n::t(items.primary))
        .enabled(items.primary_enabled)
        .build(app)?;
    builder = builder.item(&primary);

    if items.separate_stop {
        let stop = MenuItemBuilder::with_id(ID_STOP_PLAYBACK, i18n::t(Key::TrayStop)).build(app)?;
        builder = builder.item(&stop);
    }

    builder = builder.separator();

    if snap.active_recordings > 0 {
        // ● — маркер, а не текст: рахунок бере той самий ключ, що й список потоків.
        let info = MenuItemBuilder::with_id(
            ID_RECORDING_INFO,
            format!("● {}", i18n::t_plural(PluralKey::ActiveRecordings, snap.active_recordings)),
        )
        .enabled(false)
        .build(app)?;
        let stop_all =
            MenuItemBuilder::with_id(ID_STOP_ALL, i18n::t(Key::TrayStopAllRecordings)).build(app)?;
        builder = builder.item(&info).item(&stop_all).separator();
    }

    let window_label = if snap.window_visible {
        i18n::t(Key::TrayHideWindow)
    } else {
        i18n::t(Key::TrayShowWindow)
    };
    let toggle_window = MenuItemBuilder::with_id(ID_TOGGLE_WINDOW, window_label).build(app)?;
    builder = builder.item(&toggle_window).separator();

    let quit = MenuItemBuilder::with_id(ID_QUIT, i18n::t(Key::TrayQuit)).build(app)?;
    builder = builder.item(&quit);

    builder.build()
}

use crate::app_state::AppState;
use crate::player::engine::{PlaybackSource, PlaybackState, PlayerStatus};
use tauri::Manager;

/// Compose the "Now playing" label for the menu, reading station + track
/// info from AppState. Returns None when nothing is meaningfully playing.
pub async fn build_now_playing_label(
    status: &PlayerStatus,
    app: &AppHandle,
) -> Option<String> {
    if !matches!(status.state, PlaybackState::Playing | PlaybackState::Paused) {
        return None;
    }
    let source = status.source.as_ref()?;
    let state = app.state::<AppState>();
    match source {
        PlaybackSource::Stream { stream_id } => {
            let manager = state.stream_manager.read().await;
            let statuses = manager.get_all_statuses();
            let stream_status = statuses.iter().find(|s| &s.stream_id == stream_id).cloned();
            drop(manager);

            let profile = state.active_profile.read().await;
            let stream_info = profile.streams.iter().find(|s| &s.id == stream_id).cloned();
            drop(profile);

            let station = stream_info.map(|s| s.name).unwrap_or_else(|| stream_id.clone());

            match stream_status.and_then(|s| s.current_track) {
                Some(t) if !t.artist.is_empty() || !t.title.is_empty() => {
                    Some(format!("{station} — {} — {}", t.artist, t.title))
                }
                _ => Some(station),
            }
        }
        PlaybackSource::File { path } => {
            let basename = std::path::Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("?");
            Some(i18n::t_args(Key::TraySourceFile, &[("name", basename)]))
        }
        // Прев'ю — термін домену, а не мітка інтерфейсу (CONTEXT.md): для
        // користувача це станція, як її зве й решта інтерфейсу.
        PlaybackSource::Preview { name, .. } => {
            Some(i18n::t_args(Key::TraySourceStation, &[("name", name)]))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap(playback: MenuPlayback, label: Option<&str>, rec: usize) -> MenuSnapshot {
        MenuSnapshot {
            playback,
            now_playing_label: label.map(String::from),
            active_recordings: rec,
            window_visible: false,
        }
    }

    use crate::i18n::{with_locale, Locale};

    /// Кожен стан названо поіменно: вичерпність `match` ловить **пропущений**
    /// варіант, але не той, де мітку підмінено, — а саме підміна й була дефектом
    /// (пункт звався «Пауза», поки дія зупиняла). Очікування взято з таблиці §4
    /// запису `tray-toggle-label-vs-action`, не перерахуванням тієї ж логіки.
    #[test]
    fn playback_items_answers_for_every_state() {
        let table = [
            (MenuPlayback::Idle,        false, Key::TrayPlay,  false, false),
            (MenuPlayback::Live,        true,  Key::TrayStop,  true,  false),
            (MenuPlayback::FilePlaying, true,  Key::TrayPause, true,  true),
            (MenuPlayback::FilePaused,  true,  Key::TrayPlay,  true,  true),
        ];

        for (playback, now_playing, primary, primary_enabled, separate_stop) in table {
            let items = playback_items(playback);
            assert_eq!(items.now_playing, now_playing, "now_playing для {playback:?}");
            assert_eq!(items.primary, primary, "primary для {playback:?}");
            assert_eq!(items.primary_enabled, primary_enabled, "primary_enabled для {playback:?}");
            assert_eq!(items.separate_stop, separate_stop, "separate_stop для {playback:?}");
        }
    }

    /// Інваріант, а не рядок таблиці: два пункти з тим самим словом скрінрідер
    /// не розрізняє, тож жоден стан не сміє водночас робити головний пункт
    /// «Зупинити» і малювати окрему «Зупинити».
    #[test]
    fn no_state_draws_two_stop_items() {
        for playback in [
            MenuPlayback::Idle,
            MenuPlayback::Live,
            MenuPlayback::FilePlaying,
            MenuPlayback::FilePaused,
        ] {
            let items = playback_items(playback);
            assert!(
                !(items.primary == Key::TrayStop && items.separate_stop),
                "{playback:?} малює «Зупинити» двічі"
            );
        }
    }

    #[test]
    fn idle_shows_just_app_name() {
        let s = with_locale(Locale::Uk, || tooltip(&snap(MenuPlayback::Idle, None, 0)));
        assert_eq!(s, "Tapir");
    }

    #[test]
    fn playing_only_shows_play_arrow_and_station() {
        let s = with_locale(Locale::Uk, || {
            tooltip(&snap(MenuPlayback::Live, Some("SomaFM"), 0))
        });
        assert_eq!(s, "Tapir — ▶ SomaFM");
    }

    #[test]
    fn recording_only_shows_recording_count() {
        let s = with_locale(Locale::Uk, || tooltip(&snap(MenuPlayback::Idle, None, 3)));
        assert_eq!(s, "Tapir — ● 3 записи");
    }

    #[test]
    fn playing_and_recording_shows_both() {
        let s = with_locale(Locale::Uk, || {
            tooltip(&snap(MenuPlayback::Live, Some("SomaFM"), 2))
        });
        assert_eq!(s, "Tapir — ▶ SomaFM · ● 2 записи");
    }

    /// На паузі буває тільки файл: живий звук кожен головний орган керування
    /// зупиняє, тож стану «ефір на паузі» більше не існує.
    #[test]
    fn paused_file_does_not_show_play_arrow() {
        let s = with_locale(Locale::Uk, || {
            tooltip(&snap(MenuPlayback::FilePaused, Some("Файл: jazz.mp3"), 1))
        });
        assert_eq!(s, "Tapir — ● 1 запис");
    }

    /// Підказка — не лише переклад слів: англійська має власне узгодження,
    /// і саме воно ламається першим, якщо форму обирають за українськими правилами.
    #[test]
    fn tooltip_follows_the_selected_language() {
        let s = with_locale(Locale::En, || {
            tooltip(&snap(MenuPlayback::Live, Some("SomaFM"), 2))
        });
        assert_eq!(s, "Tapir — ▶ SomaFM · ● 2 recordings");

        let one = with_locale(Locale::En, || tooltip(&snap(MenuPlayback::Idle, None, 1)));
        assert_eq!(one, "Tapir — ● 1 recording");
    }

    #[test]
    fn truncates_long_station_name() {
        let long = "a".repeat(200);
        let s = snap(MenuPlayback::Live, Some(&long), 0);
        let result = tooltip(&s);
        assert!(result.chars().count() <= 127);
        assert!(result.ends_with('…'));
    }

    #[test]
    fn handles_unicode_correctly_in_truncation() {
        let long: String = "Я".repeat(200);
        let s = snap(MenuPlayback::Live, Some(&long), 0);
        let result = tooltip(&s);
        assert!(result.chars().count() <= 127);
    }
}
