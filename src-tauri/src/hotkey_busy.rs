//! Зайняті комбінації (CONTEXT.md §«Гаряча клавіша, комбінація, зайнята
//! комбінація»): комбінація, яку ОС відмовилась віддати Tapir, бо її тримає інша
//! програма. Гаряча клавіша при цьому лишається призначеною, але не працює.
//!
//! Два факти тут незалежні: «яка комбінація призначена» — налаштування, «чи вона
//! працює зараз» — стан, який Tapir дізнається лише спробою реєстрації. Цей модуль
//! тримає другий факт і вирішує, про що казати вголос:
//!
//! - [`plan_reports`] — про які зайняті комбінації людина ще не чула;
//! - [`ReportedCombos`] — пам'ять «уже повідомлено» між сеансами
//!   (`data/hotkeys-reported.json`, не settings.json і не state.json — спека,
//!   рішення 7). Пам'ять фіксує **доставлену** репліку, не факт реєстрації:
//!   помічається при дренажі [`BusyNotice`] (старт) або одразу в команді діалогу,
//!   де вкладка оголошує кожну нововиявлену комбінацію сама. Інакше старт
//!   згорнутим, після якого вікна так і не показали, зробив би конфлікт
//!   «повідомленим» назавжди;
//! - [`BusyNotice`] — одноразова репліка при старті, яка чекає **першого показу
//!   вікна**, а не `frontend_ready`: старт згорнутим інакше ковтає її (рішення 8).

use std::path::Path;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter};

use crate::errors::RadioError;
use crate::settings::HotkeyMap;

/// Подія до вебв'ю: перелік комбінацій, про які треба сказати вголос.
pub const BUSY_EVENT: &str = "hotkeys-busy";

/// Результат [`plan_reports`]: що повідомити зараз і що з пам'яті ще чинне.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReportPlan {
    /// Зайняті зараз комбінації, про які ще не казали.
    pub to_report: Vec<String>,
    /// Та частина пам'яті, що досі зайнята. Комбінація, що зареєструвалась або яку
    /// перепризначили, випадає — і наступна її зайнятість знову буде новиною
    /// (рішення 6). `to_report` сюди НЕ входить: у пам'ять вона потрапляє лише
    /// після доставки репліки ([`ReportedCombos::mark`]).
    pub still_reported: Vec<String>,
}

/// Покомбінаційна пам'ять: повідомляється лише те, що зайняте зараз і чого не було
/// серед повідомлених. Порядок `busy_now` зберігається — репліки йдуть у порядку
/// рядків вкладки.
pub fn plan_reports(busy_now: &[String], reported: &[String]) -> ReportPlan {
    let to_report = busy_now
        .iter()
        .filter(|combo| !reported.contains(combo))
        .cloned()
        .collect();
    let still_reported = reported
        .iter()
        .filter(|combo| busy_now.contains(combo))
        .cloned()
        .collect();
    ReportPlan { to_report, still_reported }
}

/// Перелік комбінацій, про зайнятість яких уже сказано. Відсутній або битий файл
/// означає «нічого не повідомляли»: найгірший наслідок — одна зайва репліка.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ReportedCombos {
    #[serde(default)]
    pub combos: Vec<String>,
}

impl ReportedCombos {
    pub fn load() -> Self {
        Self::load_from(&crate::portable::hotkeys_reported_path())
    }

    pub fn load_from(path: &Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_else(|e| {
                log::warn!("hotkeys-reported.json: cannot parse ({e}) — treating as nothing reported");
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self) -> Result<(), RadioError> {
        self.save_to(&crate::portable::hotkeys_reported_path())
    }

    pub fn save_to(&self, path: &Path) -> Result<(), RadioError> {
        crate::store::write_json_atomically(path, "json.tmp", self)
    }

    /// Репліку доставлено — запам'ятати, без дублів.
    pub fn mark(&mut self, delivered: &[String]) {
        for combo in delivered {
            if !self.combos.contains(combo) {
                self.combos.push(combo.clone());
            }
        }
    }
}

/// Репліки про `combos` доставлено: дописати їх у пам'ять на диску. Єдина точка,
/// з якої комбінація стає «повідомленою».
pub fn record_delivered(combos: &[String]) {
    if combos.is_empty() {
        return;
    }
    let mut reported = ReportedCombos::load();
    reported.mark(combos);
    if let Err(e) = reported.save() {
        log::warn!("hotkeys-reported.json: failed to save: {e}");
    }
}

/// Підсумок однієї реєстрації: усе зайняте зараз і те з нього, що є новиною.
/// Іде у вебв'ю як відповідь `register_hotkeys`, тому camelCase.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Registration {
    pub busy: Vec<String>,
    pub newly_busy: Vec<String>,
}

/// Єдина точка реєстрації для обох шляхів — старту і діалогу: реєструє, звіряє з
/// пам'яттю і **забуває** з неї те, що більше не зайняте. Нового в пам'ять не
/// додає — це робить той, хто доставив репліку ([`record_delivered`]): старт кладе
/// `newly_busy` у [`BusyNotice`], діалог оголошує сам.
pub fn register_and_plan(app: &AppHandle, hotkeys: &HotkeyMap) -> Registration {
    let busy = crate::shortcuts::register_global_shortcuts(app, hotkeys);
    let before = ReportedCombos::load();
    let plan = plan_reports(&busy, &before.combos);
    if plan.still_reported != before.combos {
        let kept = ReportedCombos { combos: plan.still_reported };
        if let Err(e) = kept.save() {
            log::warn!("hotkeys-reported.json: failed to save: {e}");
        }
    }
    Registration { busy, newly_busy: plan.to_report }
}

/// Одноразова репліка при старті про нові зайняті комбінації. Дренується не у
/// `frontend_ready` (як `StartupNotice`), а коли **обидва** гейти пройдено: вебв'ю
/// підписалось на події І головне вікно на передньому плані. При звичайному старті
/// це той самий момент; при старті згорнутим — перший показ вікна з трею чи
/// клавішею. NVDA читає live region лише переднього вікна, а віконний тост гасне
/// за 4 с, тож репліка в сховане вікно — репліка в нікуди.
pub struct BusyNotice(Mutex<NoticeState>);

#[derive(Default)]
struct NoticeState {
    pending: Vec<String>,
    webview_ready: bool,
}

impl BusyNotice {
    pub fn new(pending: Vec<String>) -> Self {
        Self(Mutex::new(NoticeState { pending, webview_ready: false }))
    }

    /// `frontend_ready`: вебв'ю підписалось. `foreground` — чи вікно видиме й у
    /// фокусі саме зараз. Повертає репліки, якщо їх час настав.
    pub fn on_webview_ready(&self, foreground: bool) -> Option<Vec<String>> {
        let mut s = self.0.lock().unwrap();
        s.webview_ready = true;
        if foreground { Self::drain(&mut s) } else { None }
    }

    /// Головне вікно отримало фокус. Репліки віддаються лише якщо вебв'ю вже
    /// підписалось — інакше емісія піде до підписки й загубиться.
    pub fn on_window_focused(&self) -> Option<Vec<String>> {
        let mut s = self.0.lock().unwrap();
        if s.webview_ready { Self::drain(&mut s) } else { None }
    }

    fn drain(s: &mut NoticeState) -> Option<Vec<String>> {
        if s.pending.is_empty() {
            None
        } else {
            Some(std::mem::take(&mut s.pending))
        }
    }
}

/// Емісія репліки до вебв'ю; текст і назву дії добирає фронт (`useHotkeyBusyFeedback`).
/// Пам'ять помічається тут, а не при реєстрації: до цього моменту репліки ще не
/// було, і наступний старт має право сказати її знову.
pub fn emit_busy(app: &AppHandle, combos: Vec<String>) {
    log::info!("Reporting busy hotkey combos: {combos:?}");
    record_delivered(&combos);
    let _ = app.emit(BUSY_EVENT, combos);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn combos(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    // --- plan_reports: покомбінаційна пам'ять (рішення 6) ---

    #[test]
    fn first_time_busy_combo_is_news_but_not_yet_remembered() {
        // Реєстрація сама по собі нічого не «каже»: у пам'ять K потрапить лише
        // після доставки репліки (mark) — інакше старт згорнутим, після якого
        // вікна не показали, зробив би конфлікт повідомленим назавжди.
        let plan = plan_reports(&combos(&["Ctrl+Shift+K"]), &[]);
        assert_eq!(plan.to_report, combos(&["Ctrl+Shift+K"]));
        assert!(plan.still_reported.is_empty());
    }

    #[test]
    fn combo_already_reported_stays_silent_and_remembered() {
        let plan = plan_reports(&combos(&["Ctrl+Shift+K"]), &combos(&["Ctrl+Shift+K"]));
        assert!(plan.to_report.is_empty());
        assert_eq!(plan.still_reported, combos(&["Ctrl+Shift+K"]));
    }

    #[test]
    fn only_the_new_busy_combo_is_reported_when_an_old_one_persists() {
        // K зайнята третій сеанс, сьогодні ще й R забрала нова програма.
        let plan = plan_reports(
            &combos(&["Ctrl+Shift+R", "Ctrl+Shift+K"]),
            &combos(&["Ctrl+Shift+K"]),
        );
        assert_eq!(plan.to_report, combos(&["Ctrl+Shift+R"]));
        assert_eq!(plan.still_reported, combos(&["Ctrl+Shift+K"]));
    }

    #[test]
    fn freed_or_reassigned_combo_is_forgotten_so_it_can_be_news_again() {
        // Людина закрила чужу програму (або перепризначила K): K більше не зайнята.
        let plan = plan_reports(&[], &combos(&["Ctrl+Shift+K"]));
        assert!(plan.to_report.is_empty());
        assert!(plan.still_reported.is_empty());
        // За тиждень ту саму програму поставили знову — репліка звучить знову.
        let again = plan_reports(&combos(&["Ctrl+Shift+K"]), &plan.still_reported);
        assert_eq!(again.to_report, combos(&["Ctrl+Shift+K"]));
    }

    #[test]
    fn undelivered_notice_is_news_again_next_start() {
        // Старт згорнутим: K зайнята, репліка чекала показу вікна, якого не
        // сталося. Пам'ять не помічена → наступний старт каже знову.
        let first = plan_reports(&combos(&["Ctrl+Shift+K"]), &[]);
        let memory = ReportedCombos { combos: first.still_reported };
        let second = plan_reports(&combos(&["Ctrl+Shift+K"]), &memory.combos);
        assert_eq!(second.to_report, combos(&["Ctrl+Shift+K"]));
    }

    #[test]
    fn mark_remembers_delivered_combos_without_duplicates() {
        let mut reported = ReportedCombos { combos: combos(&["Ctrl+Shift+K"]) };
        reported.mark(&combos(&["Ctrl+Shift+K", "Ctrl+Shift+R"]));
        assert_eq!(reported.combos, combos(&["Ctrl+Shift+K", "Ctrl+Shift+R"]));
        // Після доставки та сама комбінація вже не новина.
        let plan = plan_reports(&combos(&["Ctrl+Shift+R"]), &reported.combos);
        assert!(plan.to_report.is_empty());
    }

    // --- ReportedCombos: відсутній/битий файл = нічого не повідомляли (рішення 7) ---

    #[test]
    fn reported_round_trips_through_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("hotkeys-reported.json");
        let saved = ReportedCombos { combos: combos(&["Ctrl+Shift+K"]) };
        saved.save_to(&path).unwrap();
        assert_eq!(ReportedCombos::load_from(&path), saved);
    }

    #[test]
    fn missing_file_means_nothing_reported() {
        let dir = tempfile::tempdir().unwrap();
        let loaded = ReportedCombos::load_from(&dir.path().join("nope.json"));
        assert!(loaded.combos.is_empty());
    }

    #[test]
    fn corrupt_file_means_nothing_reported() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("hotkeys-reported.json");
        std::fs::write(&path, "{ not json").unwrap();
        assert!(ReportedCombos::load_from(&path).combos.is_empty());
    }

    // --- BusyNotice: гейт «перший показ вікна» (рішення 8) ---

    #[test]
    fn normal_start_drains_at_frontend_ready_when_window_is_foreground() {
        let notice = BusyNotice::new(combos(&["Ctrl+Shift+K"]));
        assert_eq!(notice.on_webview_ready(true), Some(combos(&["Ctrl+Shift+K"])));
        // Reload вебв'ю кличе frontend_ready ще раз — репліка не повторюється.
        assert_eq!(notice.on_webview_ready(true), None);
        assert_eq!(notice.on_window_focused(), None);
    }

    #[test]
    fn minimized_start_waits_for_the_first_window_focus() {
        let notice = BusyNotice::new(combos(&["Ctrl+Shift+K"]));
        // --minimize: вікно сховане на момент frontend_ready.
        assert_eq!(notice.on_webview_ready(false), None);
        // Людина відкрила вікно з трею.
        assert_eq!(notice.on_window_focused(), Some(combos(&["Ctrl+Shift+K"])));
        // Наступні фокуси — тиша.
        assert_eq!(notice.on_window_focused(), None);
    }

    #[test]
    fn focus_before_webview_subscribed_does_not_drain() {
        // Focused(true) прилітає ще в setup (show + set_focus) — до підписки.
        let notice = BusyNotice::new(combos(&["Ctrl+Shift+K"]));
        assert_eq!(notice.on_window_focused(), None);
        assert_eq!(notice.on_webview_ready(true), Some(combos(&["Ctrl+Shift+K"])));
    }

    #[test]
    fn nothing_busy_means_no_notice_on_any_gate() {
        let notice = BusyNotice::new(vec![]);
        assert_eq!(notice.on_webview_ready(true), None);
        assert_eq!(notice.on_window_focused(), None);
    }
}
