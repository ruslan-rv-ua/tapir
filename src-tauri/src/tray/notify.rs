//! Native notification helpers: track-change toasts (via tauri-plugin-notification)
//! and the quit-confirm MessageBox.
//!
//! Toast delivery on Windows 10/11 requires a registered AppUserModelID. Going
//! through `tauri-plugin-notification` (which uses `notify-rust` underneath)
//! sets the AUMID to our bundle identifier when running from the built exe,
//! so the toast appears in Action Center and as a banner. The earlier
//! Shell_NotifyIcon balloon approach silently failed for portable builds
//! because Windows 10+ redirects NIF_INFO calls to toasts and drops them when
//! the AUMID is not registered.

use windows::core::HSTRING;
use windows::Win32::UI::WindowsAndMessaging::{
    MessageBoxW, IDYES, MB_DEFBUTTON2, MB_ICONWARNING, MB_SETFOREGROUND, MB_YESNO,
};

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri_plugin_notification::NotificationExt;

use crate::i18n::{self, Key, PluralKey};
use crate::profile::ScheduleResultReason;
use crate::recording_control::ToggleOutcome;

/// Register our AppUserModelID under HKCU so Windows treats our toast
/// notifications as coming from a known app. Without this, WinRT silently
/// drops toasts dispatched from portable builds (no installer ⇒ no Start Menu
/// shortcut ⇒ no AUMID registration).
///
/// Idempotent: safe to call on every launch.
pub fn register_aumid(aumid: &str, display_name: &str) {
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;

    let path = format!(r"Software\Classes\AppUserModelId\{aumid}");
    match RegKey::predef(HKEY_CURRENT_USER).create_subkey(&path) {
        Ok((key, disp)) => {
            if let Err(e) = key.set_value("DisplayName", &display_name) {
                log::warn!("register_aumid: failed to set DisplayName: {e}");
            } else {
                log::info!("register_aumid: aumid={aumid} display_name={display_name:?} ({disp:?})");
            }
        }
        Err(e) => log::warn!("register_aumid: failed to create key {path:?}: {e}"),
    }
}

/// (назва розкладу, локальний кінець вікна "HH:MM") активного планового запису.
type ScheduledLine = (String, String);

/// Тіло quit-confirm. Планові записи перелічуються окремим рядком (§3.5):
/// користувач має знати, що зупиняє не просто запис, а запланований.
fn quit_confirm_body(active_count: usize, scheduled: &[ScheduledLine]) -> String {
    let mut body = i18n::t_args(Key::QuitConfirmActive, &[("count", &active_count.to_string())]);
    if !scheduled.is_empty() {
        let list = scheduled
            .iter()
            .map(|(name, end)| {
                i18n::t_args(Key::QuitConfirmSchedItem, &[("name", name), ("end", end)])
            })
            .collect::<Vec<_>>()
            .join(", ");
        let line = if scheduled.len() == 1 {
            Key::QuitConfirmSchedOne
        } else {
            Key::QuitConfirmSchedMany
        };
        body.push('\n');
        body.push_str(&i18n::t_args(line, &[("list", &list)]));
    }
    body.push('\n');
    body.push_str(&i18n::t(Key::QuitConfirmQuestion));
    body
}

/// Show a native Yes/No MessageBox asking whether to quit the app while
/// recordings are active. Returns true if the user confirmed (clicked Yes).
///
/// Uses `MB_DEFBUTTON2` so "No" is the default — pressing Enter dismisses safely.
///
/// Заголовок і тіло йдуть мовою застосунку, кнопки — мовою Windows: «Так/Ні»
/// малює `user32` зі своїх ресурсів, і прапорця на це немає. Прийнято свідомо
/// (запис `tray-layer-not-localized`, рішення 10).
pub fn show_quit_confirm(body: &str) -> bool {
    let title = HSTRING::from(i18n::t(Key::QuitConfirmTitle));
    let body = HSTRING::from(body);
    let result = unsafe {
        MessageBoxW(
            None,
            &body,
            &title,
            MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2 | MB_SETFOREGROUND,
        )
    };
    result == IDYES
}

/// Gate quit on the user's confirmation if any recordings are active.
/// Returns `true` when the caller may proceed to shut down (either nothing
/// was recording, or the user clicked "Yes"). Centralises the policy so the
/// tray-menu Quit and the Alt+F4 / window-close path behave identically —
/// otherwise it's easy to lose in-flight recordings via the path that skips
/// the prompt.
pub async fn confirm_quit_if_recording(app: &tauri::AppHandle) -> bool {
    let state = tauri::Manager::state::<crate::app_state::AppState>(app);
    let active = {
        let mgr = state.stream_manager.read().await;
        crate::recording_control::count_active(&mgr.get_all_statuses())
    };

    if active == 0 { return true; }

    // §3.5: активні планові записи — назва + локальний кінець вікна.
    let scheduled: Vec<ScheduledLine> = {
        let schedules = state.active_profile.read().await.scheduled_recordings.clone();
        let overview = state.scheduler.core.lock().await.active_overview();
        overview
            .iter()
            .map(|occ| {
                (
                    schedules
                        .iter()
                        .find(|s| s.id == occ.key.0)
                        .map(|s| s.name.clone())
                        .unwrap_or_default(),
                    occ.window_end_utc
                        .with_timezone(&chrono::Local)
                        .format("%H:%M")
                        .to_string(),
                )
            })
            .collect()
    };
    let body = quit_confirm_body(active, &scheduled);

    // MessageBoxW blocks; run on a blocking thread so we don't stall the
    // tokio worker (or the UI thread, if called via block_on).
    tokio::task::spawn_blocking(move || show_quit_confirm(&body))
        .await
        .unwrap_or(false)
}

static LAST_NOTIFY_MS: AtomicU64 = AtomicU64::new(0);
const THROTTLE_MS: u64 = 3000;

/// Fire-and-forget: gate on the profile's `ui.trayNotifications`, resolve the station name
/// from the active profile, throttle to one toast per 3 s, and dispatch through
/// `tauri-plugin-notification`. Use this from any track-change emitter
/// (recorder, player) so the rules live in one place.
pub fn notify_track_change(app: &tauri::AppHandle, stream_id: &str, artist: &str, title: &str) {
    let app = app.clone();
    let stream_id = stream_id.to_string();
    let artist = artist.to_string();
    let title = title.to_string();
    tauri::async_runtime::spawn(async move {
        let state = tauri::Manager::state::<crate::app_state::AppState>(&app);

        // Гейт і назва станції — з одного guard'а активного профілю: обидва
        // профільні (ADR 2026-08-08), нового лока не з'являється.
        let station = {
            let profile = state.active_profile.read().await;
            if !profile.ui.tray_notifications { return; }
            profile.streams.iter()
                .find(|s| s.id == stream_id)
                .map(|s| s.name.clone())
                .unwrap_or_else(|| stream_id.clone())
        };

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let last = LAST_NOTIFY_MS.load(Ordering::Relaxed);
        if now.saturating_sub(last) < THROTTLE_MS { return; }
        LAST_NOTIFY_MS.store(now, Ordering::Relaxed);

        let body = match (artist.is_empty(), title.is_empty()) {
            (false, false) => format!("{artist} — {title}"),
            (true, false)  => title,
            (false, true)  => artist,
            _ => return,
        };

        log::info!("notify_track_change: station={station:?} body={body:?}");
        if let Err(e) = app.notification().builder()
            .title(&station)
            .body(&body)
            .show()
        {
            log::warn!("notify_track_change: failed to show toast: {e}");
        }
    });
}

/// Show the NVDA-readable toast for a global recording toggle.
///
/// Intentionally bypasses `ui.tray_notifications`: this is the *only* feedback
/// for a backgrounded hotkey, not ambient track chatter, so it must always fire.
///
/// Старт бере той самий ключ, що й кнопка «Записати все» в списку потоків: одна
/// подія — один текст. У зупинки близнюка на фронтенді немає (там рахунок
/// іде разом із пропущеними), тож ключ власний, але формулювання дзеркальне.
pub fn notify_recording_toggle(app: &tauri::AppHandle, outcome: ToggleOutcome) {
    // Synchronous (no spawn): the shortcut handler already calls this from a
    // spawned task after awaiting toggle_all, and notification show() is non-blocking.
    let body = match outcome {
        ToggleOutcome::Started(n) => i18n::t_plural(PluralKey::RecordAllStarted, n),
        ToggleOutcome::Stopped(n) => i18n::t_plural(PluralKey::StopAll, n),
        ToggleOutcome::NothingToStart => i18n::t_plural(PluralKey::RecordAllStarted, 0),
    };

    log::info!("notify_recording_toggle: {body:?}");
    if let Err(e) = app
        .notification()
        .builder()
        .title(i18n::t(Key::AppName))
        .body(&body)
        .show()
    {
        log::warn!("notify_recording_toggle: failed to show toast: {e}");
    }
}

/// Show the NVDA-readable toast for the global stop-all shortcut (KB-12).
///
/// Like `notify_recording_toggle`: intentionally bypasses
/// `ui.tray_notifications` (sole feedback for a backgrounded hotkey) and is
/// synchronous — the shortcut handler calls it from a spawned task.
///
/// `0` — не «зупинено 0 потоків», а «запис не йшов»: окремий `_zero`-ключ, бо
/// мовчазний no-op тут неприйнятний.
pub fn notify_stop_all(app: &tauri::AppHandle, stopped: usize) {
    let body = i18n::t_plural(PluralKey::StopAll, stopped);
    log::info!("notify_stop_all: {body:?}");
    if let Err(e) = app
        .notification()
        .builder()
        .title(i18n::t(Key::AppName))
        .body(&body)
        .show()
    {
        log::warn!("notify_stop_all: failed to show toast: {e}");
    }
}

// --- Balloon-дублікати подій scheduled-* (Phase 3D §5.5) ---
// Тексти не «дзеркалять» live region, а беруть **ті самі ключі**: одна подія —
// один текст, розійтися нема чому. StoppedByUser не дублюється: ручну зупинку
// вже озвучує існуючий recording-флоу.

pub fn scheduled_started_body(name: &str) -> String {
    i18n::t_args(Key::SchedStarted, &[("name", name)])
}

pub fn scheduled_completed_body(name: &str, minutes: u32) -> String {
    i18n::t_args(
        Key::SchedCompleted,
        &[("name", name), ("minutes", &minutes.to_string())],
    )
}

fn missed_reason(reason: Option<&ScheduleResultReason>) -> String {
    match reason {
        Some(ScheduleResultReason::AppNotRunning) => i18n::t(Key::ReasonAppNotRunning),
        Some(ScheduleResultReason::StartFailed) => i18n::t(Key::ReasonStartFailed),
        Some(ScheduleResultReason::ClockChange) => i18n::t(Key::ReasonClockChange),
        // Причини немає — тире не перекладається.
        _ => "—".to_string(),
    }
}

pub fn scheduled_missed_body(name: &str, reason: Option<&ScheduleResultReason>) -> String {
    i18n::t_args(
        Key::SchedMissed,
        &[("name", name), ("reason", &missed_reason(reason))],
    )
}

pub fn scheduled_skipped_body(name: &str) -> String {
    i18n::t_args(Key::SchedSkipped, &[("name", name)])
}

/// Fire-and-forget balloon для подій планувальника. Гейт ui.trayNotifications
/// («механізм Фази 3A», §5.5); без тротлінгу — події рідкісні.
pub fn notify_scheduled(app: &tauri::AppHandle, body: String) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = tauri::Manager::state::<crate::app_state::AppState>(&app);
        if !state.active_profile.read().await.ui.tray_notifications { return; }
        log::info!("notify_scheduled: {body:?}");
        if let Err(e) = app.notification().builder().title(i18n::t(Key::AppName)).body(&body).show() {
            log::warn!("notify_scheduled: failed to show toast: {e}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n::{with_locale, Locale};

    #[test]
    fn quit_confirm_body_without_scheduled() {
        let body = with_locale(Locale::Uk, || quit_confirm_body(2, &[]));
        assert_eq!(body, "Активних записів: 2.\nВийти з програми і зупинити їх?");
    }

    #[test]
    fn quit_confirm_body_with_one_scheduled() {
        let lines = vec![("Evening Jazz".to_string(), "22:05".to_string())];
        let body = with_locale(Locale::Uk, || quit_confirm_body(1, &lines));
        assert_eq!(
            body,
            "Активних записів: 1.\nТриває плановий запис «Evening Jazz» до 22:05.\nВийти з програми і зупинити їх?"
        );
    }

    #[test]
    fn quit_confirm_body_with_many_scheduled() {
        let lines = vec![
            ("A".to_string(), "22:05".to_string()),
            ("B".to_string(), "23:10".to_string()),
        ];
        let body = with_locale(Locale::Uk, || quit_confirm_body(3, &lines));
        assert_eq!(
            body,
            "Активних записів: 3.\nТривають планові записи: «A» до 22:05, «B» до 23:10.\nВийти з програми і зупинити їх?"
        );
    }

    /// Діалог виходу — єдина дія, доступна користувачеві, коли вікна немає:
    /// англійською він мусить бути англійським цілком, разом із лапками списку.
    #[test]
    fn quit_confirm_body_in_english() {
        let lines = vec![("Evening Jazz".to_string(), "22:05".to_string())];
        let body = with_locale(Locale::En, || quit_confirm_body(1, &lines));
        assert_eq!(
            body,
            "Active recordings: 1.\nA scheduled recording is in progress: “Evening Jazz” until 22:05.\nQuit the app and stop them?"
        );
    }

    #[test]
    fn scheduled_bodies_render_in_ukrainian() {
        use crate::profile::ScheduleResultReason;
        with_locale(Locale::Uk, || {
            assert_eq!(scheduled_started_body("X"), "Плановий запис «X» розпочато");
            assert_eq!(
                scheduled_completed_body("X", 119),
                "Плановий запис «X» завершено, записано 119 хв"
            );
            assert_eq!(
                scheduled_missed_body("X", Some(&ScheduleResultReason::AppNotRunning)),
                "Плановий запис «X» пропущено: Tapir не працював"
            );
            assert_eq!(
                scheduled_missed_body("X", Some(&ScheduleResultReason::StartFailed)),
                "Плановий запис «X» пропущено: не вдалося стартувати запис"
            );
            assert_eq!(
                scheduled_missed_body("X", Some(&ScheduleResultReason::ClockChange)),
                "Плановий запис «X» пропущено: переведення годинника"
            );
            assert_eq!(scheduled_missed_body("X", None), "Плановий запис «X» пропущено: —");
            assert_eq!(
                scheduled_skipped_body("X"),
                "Плановий запис «X» не стартував: потік уже записується"
            );
        });
    }

    /// Причина пропуску підставляється **всередину** речення, тож англійською
    /// має бути англійським і речення, і причина — це два різні ключі.
    #[test]
    fn scheduled_bodies_render_in_english() {
        use crate::profile::ScheduleResultReason;
        with_locale(Locale::En, || {
            assert_eq!(
                scheduled_missed_body("X", Some(&ScheduleResultReason::AppNotRunning)),
                "Scheduled recording \"X\" missed: Tapir was not running"
            );
            assert_eq!(scheduled_missed_body("X", None), "Scheduled recording \"X\" missed: —");
        });
    }
}
