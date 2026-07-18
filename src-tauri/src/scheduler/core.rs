//! Ядро планувальника (§3.1–3.3): чиста state machine без tokio і Tauri.
//! Тік приймає знімок світу (TickCtx) і повертає дії; виконує їх shell
//! (scheduler::timer), повідомляючи результат стартів назад
//! (confirm_start / start_failed). DST інжектиться резолвером.

use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Duration, NaiveDateTime, Utc};

use crate::profile::{
    ScheduleResult, ScheduleResultReason, ScheduleResultStatus, ScheduleType, ScheduledRecording,
};
use super::windows::{end_instant, latest_started_window, occurrence_key, LocalKind};

/// Ключ входження (§3.1): (schedule.id, локальний номінальний початок "YYYY-MM-DDTHH:MM").
pub type OccKey = (String, String);

/// Активне входження — запис, який scheduler сам почав (§3.2).
#[derive(Debug, Clone)]
pub struct ActiveOccurrence {
    pub key: OccKey,
    pub stream_id: String,
    /// Власність (§3.3): звіряється зі StreamStatus.session_id.
    pub session_id: u64,
    /// Обчислений ОДИН раз на старті інстант — DST назад не подовжує запис.
    pub window_end_utc: DateTime<Utc>,
    pub started_late: bool,
    pub started_at_utc: DateTime<Utc>,
}

#[derive(Debug, Clone)]
struct LedgerEntry {
    cleanup_after: NaiveDateTime,
}

/// Знімок світу на тік. `statuses`: stream_id → session_id лише для потоків
/// в активному стані (recording / connecting / reconnecting).
pub struct TickCtx<'a> {
    pub now_local: NaiveDateTime, // зрізано до хвилини
    pub now_utc: DateTime<Utc>,
    pub schedules: &'a [ScheduledRecording],
    pub statuses: &'a HashMap<String, u64>,
    pub pad_before_min: u32,
    pub pad_after_min: u32,
}

/// Фіксація результату: shell пише last_result у профіль, персистить і
/// емітить подію (§4). disable_schedule → enabled = false (§3.2 крок 4).
#[derive(Debug, Clone, PartialEq)]
pub struct Fixation {
    pub schedule_id: String,
    pub stream_id: String,
    pub schedule_name: String,
    pub result: ScheduleResult,
    pub disable_schedule: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TickAction {
    /// Прохід A: вікно скінчилося — зупинити запис (власність уже звірено).
    StopRecording { stream_id: String },
    Fix(Fixation),
    /// Прохід B: стартувати запис. Shell ЗОБОВ'ЯЗАНИЙ відповісти
    /// confirm_start або start_failed.
    StartRecording {
        key: OccKey,
        stream_id: String,
        window_end_utc: DateTime<Utc>,
        late: bool,
    },
}

#[derive(Debug, Default)]
pub struct SchedulerCore {
    active: Vec<ActiveOccurrence>,
    /// Завершені входження сесії (§3.1): не перезапускати після ручної
    /// зупинки, гасити DST-повтор, не дублювати Missed.
    ledger: HashMap<OccKey, LedgerEntry>,
    /// Входження з невдалими спробами старту в цій сесії — визначає причину
    /// майбутнього Missed (StartFailed vs AppNotRunning).
    start_attempted: HashSet<OccKey>,
}

fn finished_at(now_local: NaiveDateTime) -> String {
    now_local.format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn minutes_between(start: DateTime<Utc>, end: DateTime<Utc>) -> u32 {
    (end - start).num_minutes().max(0) as u32
}

impl SchedulerCore {
    pub fn tick(
        &mut self,
        ctx: &TickCtx,
        resolve: &dyn Fn(NaiveDateTime) -> LocalKind,
    ) -> Vec<TickAction> {
        // Ledger очищається від давно минулих входжень (§3.1, ~48 год)
        self.ledger.retain(|_, e| e.cleanup_after > ctx.now_local);
        let mut actions = Vec::new();
        self.pass_a(ctx, &mut actions);
        self.pass_b(ctx, resolve, &mut actions);
        actions
    }

    /// Записати входження в ledger; спроби стартів більше не потрібні.
    fn remember(&mut self, key: OccKey, now_local: NaiveDateTime) {
        self.start_attempted.remove(&key);
        self.ledger.insert(key, LedgerEntry { cleanup_after: now_local + Duration::hours(48) });
    }

    /// Прохід A (§3.2): активні входження. Зниклий або перезапущений
    /// користувачем запис (інший session_id) прибирається БЕЗ фіксації:
    /// входження не в ledger, тож прохід B перезапустить його в межах вікна.
    /// Кінець вікна — за збереженим інстантом window_end_utc.
    fn pass_a(&mut self, ctx: &TickCtx, actions: &mut Vec<TickAction>) {
        let mut still_active = Vec::new();
        for occ in std::mem::take(&mut self.active) {
            match ctx.statuses.get(&occ.stream_id) {
                None => {}                                // зник сам — без фіксації
                Some(&sid) if sid != occ.session_id => {} // перезапущений — чужий
                Some(_) if ctx.now_utc >= occ.window_end_utc => {
                    let schedule = ctx.schedules.iter().find(|s| s.id == occ.key.0);
                    actions.push(TickAction::StopRecording { stream_id: occ.stream_id.clone() });
                    let status = if occ.started_late {
                        ScheduleResultStatus::StartedLate
                    } else {
                        ScheduleResultStatus::Completed
                    };
                    actions.push(TickAction::Fix(Fixation {
                        schedule_id: occ.key.0.clone(),
                        stream_id: occ.stream_id.clone(),
                        schedule_name: schedule.map(|s| s.name.clone()).unwrap_or_default(),
                        result: ScheduleResult {
                            occurrence: occ.key.1.clone(),
                            status,
                            reason: None,
                            recorded_minutes: minutes_between(occ.started_at_utc, ctx.now_utc),
                            finished_at: finished_at(ctx.now_local),
                        },
                        disable_schedule: schedule
                            .is_some_and(|s| s.schedule_type == ScheduleType::Oneshot),
                    }));
                    self.remember(occ.key.clone(), ctx.now_local);
                }
                Some(_) => still_active.push(occ),
            }
        }
        self.active = still_active;
    }

    /// (stream_id, session_id) своїх активних записів — для фільтра
    /// снапшота state.json (manual_resume_stream_ids) (§3.5).
    pub fn owned_sessions(&self) -> Vec<(String, u64)> {
        self.active.iter().map(|a| (a.stream_id.clone(), a.session_id)).collect()
    }

    /// Знімок активних входжень для UI (confirm-діалоги §3.5).
    pub fn active_overview(&self) -> Vec<ActiveOccurrence> {
        self.active.clone()
    }

    /// Прохід B (§3.2): старти й Missed.
    fn pass_b(
        &mut self,
        ctx: &TickCtx,
        resolve: &dyn Fn(NaiveDateTime) -> LocalKind,
        actions: &mut Vec<TickAction>,
    ) {
        for s in ctx.schedules.iter().filter(|s| s.enabled) {
            let Some(w) =
                latest_started_window(s, ctx.pad_before_min, ctx.pad_after_min, ctx.now_local)
            else {
                continue;
            };
            let key: OccKey = (s.id.clone(), occurrence_key(w.occurrence));
            if self.ledger.contains_key(&key) || self.active.iter().any(|a| a.key == key) {
                continue;
            }
            let is_oneshot = s.schedule_type == ScheduleType::Oneshot;

            if w.window_end > ctx.now_local {
                // Вікно активне (крок 2)
                if ctx.statuses.contains_key(&s.stream_id) {
                    // Потік уже пишеться (вручну або іншим розкладом).
                    // Skip фіксується раз на вікно (§8).
                    actions.push(TickAction::Fix(Fixation {
                        schedule_id: s.id.clone(),
                        stream_id: s.stream_id.clone(),
                        schedule_name: s.name.clone(),
                        result: ScheduleResult {
                            occurrence: key.1.clone(),
                            status: ScheduleResultStatus::SkippedAlreadyRecording,
                            reason: None,
                            recorded_minutes: 0,
                            finished_at: finished_at(ctx.now_local),
                        },
                        disable_schedule: is_oneshot,
                    }));
                    self.remember(key, ctx.now_local);
                } else {
                    actions.push(TickAction::StartRecording {
                        key,
                        stream_id: s.stream_id.clone(),
                        window_end_utc: end_instant(resolve, w.window_end),
                        // Хвилинна гранулярність: тік рівно в хвилину start — не Late
                        late: ctx.now_local > w.occurrence,
                    });
                    // ActiveOccurrence з'явиться лише після confirm_start від shell
                }
            } else {
                // Вікно минуло (крок 3) → Missed
                if s.last_result.as_ref().is_some_and(|r| r.occurrence == key.1) {
                    // Дедуплікація між сесіями (ledger живе лише в пам'яті).
                    // Відпрацьований oneshot, що лишився enabled (StoppedByUser
                    // при AppClosing/ProfileSwitch), гаситься тут без
                    // перезапису результату.
                    if is_oneshot {
                        actions.push(TickAction::Fix(Fixation {
                            schedule_id: s.id.clone(),
                            stream_id: s.stream_id.clone(),
                            schedule_name: s.name.clone(),
                            result: s.last_result.clone().expect("checked above"),
                            disable_schedule: true,
                        }));
                    }
                    self.remember(key, ctx.now_local);
                    continue;
                }
                let reason = if matches!(resolve(w.occurrence), LocalKind::Gap) {
                    ScheduleResultReason::ClockChange
                } else if self.start_attempted.contains(&key) {
                    ScheduleResultReason::StartFailed
                } else {
                    ScheduleResultReason::AppNotRunning
                };
                actions.push(TickAction::Fix(Fixation {
                    schedule_id: s.id.clone(),
                    stream_id: s.stream_id.clone(),
                    schedule_name: s.name.clone(),
                    result: ScheduleResult {
                        occurrence: key.1.clone(),
                        status: ScheduleResultStatus::Missed,
                        reason: Some(reason),
                        recorded_minutes: 0,
                        finished_at: finished_at(ctx.now_local),
                    },
                    disable_schedule: is_oneshot,
                }));
                self.remember(key, ctx.now_local);
            }
        }
    }

    /// Shell підтвердив успішний старт (§3.2): входження стає активним.
    pub fn confirm_start(
        &mut self,
        key: OccKey,
        stream_id: String,
        session_id: u64,
        window_end_utc: DateTime<Utc>,
        late: bool,
        now_utc: DateTime<Utc>,
    ) {
        self.start_attempted.remove(&key);
        self.active.push(ActiveOccurrence {
            key,
            stream_id,
            session_id,
            window_end_utc,
            started_late: late,
            started_at_utc: now_utc,
        });
    }

    /// Невдалий старт: нічого не фіксуємо — наступний тік повторить спробу
    /// до кінця вікна (§3.2 крок 2). Факт спроби визначає причину Missed.
    pub fn start_failed(&mut self, key: &OccKey) {
        self.start_attempted.insert(key.clone());
    }

    /// §3.3: спільний хук чотирьох шляхів ручної зупинки. Фіксує
    /// StoppedByUser(ManualStop), ЛИШЕ якщо session_id збігається з активним
    /// входженням; інакше ігнор — зупинили ручний запис, що зайняв потік
    /// (catch-up у вікні має лишитися можливим).
    pub fn on_manual_stop(
        &mut self,
        stream_id: &str,
        session_id: u64,
        schedules: &[ScheduledRecording],
        now_local: NaiveDateTime,
        now_utc: DateTime<Utc>,
    ) -> Option<Fixation> {
        let idx = self
            .active
            .iter()
            .position(|a| a.stream_id == stream_id && a.session_id == session_id)?;
        let occ = self.active.remove(idx);
        self.remember(occ.key.clone(), now_local);
        Some(stopped_by_user_fixation(occ, ScheduleResultReason::ManualStop, schedules, now_local, now_utc))
    }

    /// §3.5: редагування суттєвих полів або toggle-off розкладу, що зараз
    /// пише: зупинка + StoppedByUser(ScheduleEdited) + ledger під СТАРИМ
    /// ключем. Якщо запис уже чужий — лише прибрати з active (None).
    pub fn on_schedule_changed(
        &mut self,
        schedule: &ScheduledRecording,
        statuses: &HashMap<String, u64>,
        now_local: NaiveDateTime,
        now_utc: DateTime<Utc>,
    ) -> Option<(String, Fixation)> {
        let idx = self.active.iter().position(|a| a.key.0 == schedule.id)?;
        let occ = self.active.remove(idx);
        if statuses.get(&occ.stream_id) != Some(&occ.session_id) {
            return None; // запис чужий (перезапущений) — не чіпаємо
        }
        self.remember(occ.key.clone(), now_local);
        let stream_id = occ.stream_id.clone();
        let fix = stopped_by_user_fixation(
            occ,
            ScheduleResultReason::ScheduleEdited,
            std::slice::from_ref(schedule),
            now_local,
            now_utc,
        );
        Some((stream_id, fix))
    }

    /// §3.5: видалення розкладу під час запису — просто зупинка (фіксувати
    /// нікуди, рядок зник). Повертає stream_id, якщо запис ще наш.
    pub fn on_schedule_deleted(
        &mut self,
        schedule_id: &str,
        statuses: &HashMap<String, u64>,
    ) -> Option<String> {
        let idx = self.active.iter().position(|a| a.key.0 == schedule_id)?;
        let occ = self.active.remove(idx);
        (statuses.get(&occ.stream_id) == Some(&occ.session_id)).then_some(occ.stream_id)
    }

    /// §3.5: ProfileSwitch / AppClosing — зафіксувати StoppedByUser(reason)
    /// для всіх своїх живих записів. Викликати ДО stop_all: статуси ще живі.
    /// Самі записи зупиняє викликач (stop_all / stop_all_async).
    pub fn drain_all(
        &mut self,
        reason: ScheduleResultReason,
        schedules: &[ScheduledRecording],
        statuses: &HashMap<String, u64>,
        now_local: NaiveDateTime,
        now_utc: DateTime<Utc>,
    ) -> Vec<Fixation> {
        std::mem::take(&mut self.active)
            .into_iter()
            .filter(|occ| statuses.get(&occ.stream_id) == Some(&occ.session_id))
            .map(|occ| stopped_by_user_fixation(occ, reason.clone(), schedules, now_local, now_utc))
            .collect()
    }

    /// Переключення профілю: ledger і спроби стартів — стан старого профілю.
    pub fn reset(&mut self) {
        self.active.clear();
        self.ledger.clear();
        self.start_attempted.clear();
    }
}

/// Спільна фіксація для ManualStop / ScheduleEdited / ProfileSwitch / AppClosing.
fn stopped_by_user_fixation(
    occ: ActiveOccurrence,
    reason: ScheduleResultReason,
    schedules: &[ScheduledRecording],
    now_local: NaiveDateTime,
    now_utc: DateTime<Utc>,
) -> Fixation {
    let schedule = schedules.iter().find(|s| s.id == occ.key.0);
    Fixation {
        schedule_id: occ.key.0.clone(),
        stream_id: occ.stream_id,
        schedule_name: schedule.map(|s| s.name.clone()).unwrap_or_default(),
        result: ScheduleResult {
            occurrence: occ.key.1,
            status: ScheduleResultStatus::StoppedByUser,
            reason: Some(reason),
            recorded_minutes: minutes_between(occ.started_at_utc, now_utc),
            finished_at: finished_at(now_local),
        },
        // Oneshot НЕ вимикаємо (рішення №2 плану): catch-up після
        // рестарту/повернення має лишитися можливим; відпрацьований
        // oneshot гасить дедуп-гілка проходу B.
        disable_schedule: false,
    }
}

/// §3.5: зміна назви запис не перериває; суттєві поля — фіксований перелік.
pub fn essential_fields_changed(old: &ScheduledRecording, new: &ScheduledRecording) -> bool {
    old.stream_id != new.stream_id
        || old.time != new.time
        || old.days != new.days
        || old.date != new.date
        || old.duration_minutes != new.duration_minutes
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn recurring(id: &str, stream: &str, days: &[u8], time: &str, dur: u32) -> ScheduledRecording {
        ScheduledRecording {
            id: id.into(),
            stream_id: stream.into(),
            name: format!("Schedule {id}"),
            schedule_type: ScheduleType::Recurring,
            days: days.to_vec(),
            date: None,
            time: time.into(),
            duration_minutes: dur,
            enabled: true,
            created_at: "2026-06-12T10:00:00+03:00".into(),
            last_result: None,
        }
    }

    fn oneshot(id: &str, stream: &str, date: &str, time: &str, dur: u32) -> ScheduledRecording {
        let mut s = recurring(id, stream, &[], time, dur);
        s.schedule_type = ScheduleType::Oneshot;
        s.date = Some(date.into());
        s
    }

    fn at(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M").unwrap()
    }

    fn utc_of(s: &str) -> DateTime<Utc> {
        Utc.from_utc_datetime(&at(s))
    }

    fn no_dst(n: NaiveDateTime) -> LocalKind {
        LocalKind::Valid(Utc.from_utc_datetime(&n))
    }

    fn busy(pairs: &[(&str, u64)]) -> HashMap<String, u64> {
        pairs.iter().map(|(id, sid)| (id.to_string(), *sid)).collect()
    }

    fn ctx<'a>(
        now: &str,
        schedules: &'a [ScheduledRecording],
        statuses: &'a HashMap<String, u64>,
    ) -> TickCtx<'a> {
        TickCtx {
            now_local: at(now),
            now_utc: utc_of(now),
            schedules,
            statuses,
            pad_before_min: 0,
            pad_after_min: 0,
        }
    }

    fn start_actions(actions: &[TickAction]) -> Vec<&TickAction> {
        actions.iter().filter(|a| matches!(a, TickAction::StartRecording { .. })).collect()
    }

    fn fixations(actions: &[TickAction]) -> Vec<&Fixation> {
        actions.iter().filter_map(|a| match a { TickAction::Fix(f) => Some(f), _ => None }).collect()
    }

    // 2026-06-12 — п'ятниця (день 4)

    // --- Прохід B: старти ---

    #[test]
    fn starts_on_time_not_late() {
        // Хвилинна гранулярність: тік рівно у хвилину start → НЕ StartedLate (§3.2 крок 2)
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        let actions = core.tick(&ctx("2026-06-12T20:00", &schedules, &statuses), &no_dst);
        assert_eq!(actions, vec![TickAction::StartRecording {
            key: ("a".into(), "2026-06-12T20:00".into()),
            stream_id: "st1".into(),
            window_end_utc: utc_of("2026-06-12T21:00"),
            late: false,
        }]);
    }

    #[test]
    fn catch_up_mid_window_is_late() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        let actions = core.tick(&ctx("2026-06-12T20:30", &schedules, &statuses), &no_dst);
        match &actions[..] {
            [TickAction::StartRecording { late, .. }] => assert!(late),
            other => panic!("expected one StartRecording, got {other:?}"),
        }
    }

    #[test]
    fn confirmed_start_blocks_second_start() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let mut core = SchedulerCore::default();
        let free = busy(&[]);
        let actions = core.tick(&ctx("2026-06-12T20:00", &schedules, &free), &no_dst);
        let TickAction::StartRecording { key, window_end_utc, late, .. } = actions[0].clone() else { panic!() };
        core.confirm_start(key, "st1".into(), 1, window_end_utc, late, utc_of("2026-06-12T20:00"));
        // Наступний тік: запис живий (наш session_id) → жодних нових дій
        let statuses = busy(&[("st1", 1)]);
        let actions = core.tick(&ctx("2026-06-12T20:01", &schedules, &statuses), &no_dst);
        assert!(actions.is_empty(), "got {actions:?}");
    }

    #[test]
    fn failed_start_retries_next_tick() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        let actions = core.tick(&ctx("2026-06-12T20:00", &schedules, &statuses), &no_dst);
        let TickAction::StartRecording { key, .. } = actions[0].clone() else { panic!() };
        core.start_failed(&key);
        // Декларативна модель: наступний тік повторює спробу (§3.2 крок 2)
        let actions = core.tick(&ctx("2026-06-12T20:01", &schedules, &statuses), &no_dst);
        assert_eq!(start_actions(&actions).len(), 1);
    }

    // --- Прохід B: skip ---

    #[test]
    fn busy_stream_skips_once_per_window() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let mut core = SchedulerCore::default();
        let statuses = busy(&[("st1", 99)]); // чужий запис (ручний)
        let actions = core.tick(&ctx("2026-06-12T20:00", &schedules, &statuses), &no_dst);
        let fixes = fixations(&actions);
        assert_eq!(fixes.len(), 1);
        assert_eq!(fixes[0].result.status, ScheduleResultStatus::SkippedAlreadyRecording);
        assert_eq!(fixes[0].result.occurrence, "2026-06-12T20:00");
        // Конфліктний запис зупинився посеред вікна → плановий все одно НЕ стартує (§8)
        let free = busy(&[]);
        let actions = core.tick(&ctx("2026-06-12T20:30", &schedules, &free), &no_dst);
        assert!(actions.is_empty(), "skip фіксується раз на вікно, got {actions:?}");
    }

    // --- Прохід B: Missed ---

    #[test]
    fn missed_without_attempts_is_app_not_running() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        let actions = core.tick(&ctx("2026-06-12T21:30", &schedules, &statuses), &no_dst);
        let fixes = fixations(&actions);
        assert_eq!(fixes.len(), 1);
        assert_eq!(fixes[0].result.status, ScheduleResultStatus::Missed);
        assert_eq!(fixes[0].result.reason, Some(ScheduleResultReason::AppNotRunning));
        assert_eq!(fixes[0].result.recorded_minutes, 0);
        assert!(!fixes[0].disable_schedule, "recurring не вимикається");
        // Повторний тік — без дубля (ledger)
        let actions = core.tick(&ctx("2026-06-12T21:31", &schedules, &statuses), &no_dst);
        assert!(actions.is_empty());
    }

    #[test]
    fn missed_after_failed_attempts_is_start_failed() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        let actions = core.tick(&ctx("2026-06-12T20:30", &schedules, &statuses), &no_dst);
        let TickAction::StartRecording { key, .. } = actions[0].clone() else { panic!() };
        core.start_failed(&key);
        let actions = core.tick(&ctx("2026-06-12T21:00", &schedules, &statuses), &no_dst);
        let fixes = fixations(&actions);
        assert_eq!(fixes[0].result.reason, Some(ScheduleResultReason::StartFailed));
    }

    #[test]
    fn expired_oneshot_on_first_tick_missed_and_disabled() {
        // «Tapir довго не запускали»: вікно минуло понад добу тому (§3.2 крок 1, §2)
        let schedules = [oneshot("a", "st1", "2026-06-10", "20:00", 60)];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        let actions = core.tick(&ctx("2026-06-12T12:00", &schedules, &statuses), &no_dst);
        let fixes = fixations(&actions);
        assert_eq!(fixes[0].result.status, ScheduleResultStatus::Missed);
        assert_eq!(fixes[0].result.reason, Some(ScheduleResultReason::AppNotRunning));
        assert!(fixes[0].disable_schedule, "oneshot після результату вимикається");
    }

    #[test]
    fn missed_dedup_via_last_result() {
        // Між сесіями: ledger в пам'яті, last_result персиститься (§3.2 крок 3)
        let mut s = recurring("a", "st1", &[4], "20:00", 60);
        s.last_result = Some(ScheduleResult {
            occurrence: "2026-06-12T20:00".into(),
            status: ScheduleResultStatus::Missed,
            reason: Some(ScheduleResultReason::AppNotRunning),
            recorded_minutes: 0,
            finished_at: "2026-06-12T21:01:00".into(),
        });
        let schedules = [s];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        let actions = core.tick(&ctx("2026-06-12T21:30", &schedules, &statuses), &no_dst);
        assert!(actions.is_empty(), "got {actions:?}");
    }

    #[test]
    fn dedup_disables_spent_oneshot_without_overwriting_result() {
        // Oneshot, зупинений при AppClosing, лишився enabled; вікно минуло →
        // вимкнути, НЕ перезаписуючи результат (рішення №2 цього плану)
        let prev = ScheduleResult {
            occurrence: "2026-06-11T20:00".into(),
            status: ScheduleResultStatus::StoppedByUser,
            reason: Some(ScheduleResultReason::AppClosing),
            recorded_minutes: 30,
            finished_at: "2026-06-11T20:30:00".into(),
        };
        let mut s = oneshot("a", "st1", "2026-06-11", "20:00", 60);
        s.last_result = Some(prev.clone());
        let schedules = [s];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        let actions = core.tick(&ctx("2026-06-12T12:00", &schedules, &statuses), &no_dst);
        let fixes = fixations(&actions);
        assert_eq!(fixes.len(), 1);
        assert!(fixes[0].disable_schedule);
        assert_eq!(fixes[0].result, prev, "результат не перезаписується");
        // і лише один раз
        let actions = core.tick(&ctx("2026-06-12T12:01", &schedules, &statuses), &no_dst);
        assert!(actions.is_empty());
    }

    // --- Прохід A ---

    /// Хелпер: стартувати і підтвердити запис розкладу `a` на st1 із session_id 1.
    fn started_core(
        schedules: &[ScheduledRecording],
        start_tick: &str,
    ) -> (SchedulerCore, OccKey) {
        let mut core = SchedulerCore::default();
        let free = busy(&[]);
        let actions = core.tick(&ctx(start_tick, schedules, &free), &no_dst);
        let TickAction::StartRecording { key, stream_id, window_end_utc, late } = actions[0].clone()
        else {
            panic!("expected StartRecording, got {actions:?}");
        };
        core.confirm_start(key.clone(), stream_id, 1, window_end_utc, late, utc_of(start_tick));
        (core, key)
    }

    #[test]
    fn completes_at_window_end() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 1)]);
        let actions = core.tick(&ctx("2026-06-12T21:00", &schedules, &statuses), &no_dst);
        assert_eq!(actions[0], TickAction::StopRecording { stream_id: "st1".into() });
        let fixes = fixations(&actions);
        assert_eq!(fixes[0].result.status, ScheduleResultStatus::Completed);
        assert_eq!(fixes[0].result.recorded_minutes, 60, "wall-clock від старту до зупинки");
        assert_eq!(fixes[0].result.occurrence, "2026-06-12T20:00");
        // Завершене входження в ledger: B не рестартує його в цьому ж вікні
        assert!(core.owned_sessions().is_empty());
    }

    #[test]
    fn late_start_completes_as_started_late() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:30");
        let statuses = busy(&[("st1", 1)]);
        let actions = core.tick(&ctx("2026-06-12T21:00", &schedules, &statuses), &no_dst);
        let fixes = fixations(&actions);
        assert_eq!(fixes[0].result.status, ScheduleResultStatus::StartedLate);
        assert_eq!(fixes[0].result.recorded_minutes, 30);
    }

    #[test]
    fn oneshot_disabled_after_completion() {
        let schedules = [oneshot("a", "st1", "2026-06-12", "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 1)]);
        let actions = core.tick(&ctx("2026-06-12T21:00", &schedules, &statuses), &no_dst);
        assert!(fixations(&actions)[0].disable_schedule);
    }

    #[test]
    fn foreign_session_is_not_stopped() {
        // Запис обірвався, користувач перезапустив потік вручну (інший session_id):
        // чужий запис не чіпаємо (§3.3); вікно активне, потік зайнятий → Skip
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 99)]);
        let actions = core.tick(&ctx("2026-06-12T20:45", &schedules, &statuses), &no_dst);
        assert!(
            !actions.iter().any(|a| matches!(a, TickAction::StopRecording { .. })),
            "чужий запис не зупиняється, got {actions:?}"
        );
        let fixes = fixations(&actions);
        assert_eq!(fixes[0].result.status, ScheduleResultStatus::SkippedAlreadyRecording);
    }

    #[test]
    fn vanished_recording_restarts_within_window() {
        // Фатальний обрив (reconnect вичерпано): запис зник без stop-команди →
        // НЕ в ledger → той самий тік перезапускає (обрив ≠ скасування, §3.3)
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let free = busy(&[]);
        let actions = core.tick(&ctx("2026-06-12T20:10", &schedules, &free), &no_dst);
        assert_eq!(start_actions(&actions).len(), 1, "got {actions:?}");
        assert!(fixations(&actions).is_empty(), "без фіксації");
    }

    #[test]
    fn session_survives_reconnect_and_stops_at_end() {
        // session_id стабільний через reconnect (його не змінює reconnect-цикл
        // manager-а) → у кінці вікна запис зупиняється як свій
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 1)]); // той самий sid після реконектів
        let actions = core.tick(&ctx("2026-06-12T21:05", &schedules, &statuses), &no_dst);
        assert!(actions.iter().any(|a| matches!(a, TickAction::StopRecording { .. })));
    }

    #[test]
    fn dst_backward_does_not_extend_recording() {
        // window_end — інстант: переведення годинника назад під час запису
        // не подовжує його (§3.2). now_local «повернувся» в вікно, now_utc — ні.
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 1)]);
        let tick_ctx = TickCtx {
            now_local: at("2026-06-12T20:30"),       // годинник перевели назад
            now_utc: utc_of("2026-06-12T21:05"),     // реально вікно скінчилось
            schedules: &schedules,
            statuses: &statuses,
            pad_before_min: 0,
            pad_after_min: 0,
        };
        let actions = core.tick(&tick_ctx, &no_dst);
        assert!(actions.iter().any(|a| matches!(a, TickAction::StopRecording { .. })));
    }

    #[test]
    fn dst_backward_no_second_start_after_completion() {
        // Після завершення вікно наївно «збігається вдруге» — ledger гасить (§3.1)
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 1)]);
        core.tick(&ctx("2026-06-12T21:00", &schedules, &statuses), &no_dst); // завершення
        let free = busy(&[]);
        let tick_ctx = TickCtx {
            now_local: at("2026-06-12T20:30"), // повторна година
            now_utc: utc_of("2026-06-12T21:06"),
            schedules: &schedules,
            statuses: &free,
            pad_before_min: 0,
            pad_after_min: 0,
        };
        let actions = core.tick(&tick_ctx, &no_dst);
        assert!(actions.is_empty(), "got {actions:?}");
    }

    #[test]
    fn over_24h_window_second_occurrence_skipped_and_first_stopped_by_pass_a() {
        // duration + padAfter > 1440 хв (§2): вікна сусідніх днів перетинаються.
        // Перше входження завершує прохід A за збереженим window_end, друге → Skip.
        let schedules = [recurring("a", "st1", &[0, 1, 2, 3, 4, 5, 6], "20:00", 1430)];
        let mut core = SchedulerCore::default();
        let free = busy(&[]);
        let mut tick_ctx = ctx("2026-06-12T20:00", &schedules, &free);
        tick_ctx.pad_after_min = 60; // вікно: 20:00 → наступного дня 20:50 (1430+60 хв)
        let actions = core.tick(&tick_ctx, &no_dst);
        let TickAction::StartRecording { key, stream_id, window_end_utc, late } = actions[0].clone()
        else { panic!("got {actions:?}") };
        assert_eq!(window_end_utc, utc_of("2026-06-13T20:50"));
        core.confirm_start(key, stream_id, 1, window_end_utc, late, utc_of("2026-06-12T20:00"));

        // Наступного дня о 20:00 потік усе ще пише перше входження → друге Skipped
        let statuses = busy(&[("st1", 1)]);
        let mut tick_ctx = ctx("2026-06-13T20:00", &schedules, &statuses);
        tick_ctx.pad_after_min = 60;
        let actions = core.tick(&tick_ctx, &no_dst);
        let fixes = fixations(&actions);
        assert_eq!(fixes.len(), 1);
        assert_eq!(fixes[0].result.status, ScheduleResultStatus::SkippedAlreadyRecording);
        assert_eq!(fixes[0].result.occurrence, "2026-06-13T20:00");
        assert!(!actions.iter().any(|a| matches!(a, TickAction::StopRecording { .. })));

        // Кінець першого вікна обробляє прохід A, а не «найближче вікно» (§3.2)
        let mut tick_ctx = ctx("2026-06-13T20:50", &schedules, &statuses);
        tick_ctx.pad_after_min = 60;
        let actions = core.tick(&tick_ctx, &no_dst);
        assert!(actions.iter().any(|a| matches!(a, TickAction::StopRecording { .. })));
        let fixes = fixations(&actions);
        assert_eq!(fixes[0].result.occurrence, "2026-06-12T20:00");
        assert_eq!(fixes[0].result.recorded_minutes, 1490);
    }

    // --- Ручна зупинка (§3.3) ---

    #[test]
    fn manual_stop_fixes_and_blocks_restart() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:05");
        let fix = core
            .on_manual_stop("st1", 1, &schedules, at("2026-06-12T20:47"), utc_of("2026-06-12T20:47"))
            .expect("свій запис має зафіксуватись");
        assert_eq!(fix.result.status, ScheduleResultStatus::StoppedByUser);
        assert_eq!(fix.result.reason, Some(ScheduleResultReason::ManualStop));
        assert_eq!(fix.result.recorded_minutes, 42, "wall-clock 20:05 → 20:47");
        // У цьому вікні більше не перезапускати (ledger)
        let free = busy(&[]);
        let actions = core.tick(&ctx("2026-06-12T20:48", &schedules, &free), &no_dst);
        assert!(actions.is_empty(), "got {actions:?}");
    }

    #[test]
    fn manual_stop_with_foreign_session_is_ignored() {
        // Зупинили ручний запис, що зайняв потік після обриву планового (§3.3):
        // StoppedByUser НЕ фіксується, catch-up у вікні лишається можливим
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        assert!(core.on_manual_stop("st1", 99, &schedules, at("2026-06-12T20:30"), utc_of("2026-06-12T20:30")).is_none());
        // Планове входження досі активне у core; якщо запис справді зник —
        // наступний тік перезапустить (vanished_recording_restarts_within_window)
        assert_eq!(core.owned_sessions(), vec![("st1".to_string(), 1)]);
    }

    #[test]
    fn manual_stop_oneshot_stays_enabled_for_catch_up() {
        // Рішення №2 плану: oneshot не вимикається при StoppedByUser
        let schedules = [oneshot("a", "st1", "2026-06-12", "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let fix = core.on_manual_stop("st1", 1, &schedules, at("2026-06-12T20:30"), utc_of("2026-06-12T20:30")).unwrap();
        assert!(!fix.disable_schedule);
    }

    // --- Редагування / вимкнення / видалення під час запису (§3.5) ---

    #[test]
    fn schedule_change_stops_and_ledgers_old_key() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 1)]);
        let (stop_stream, fix) = core
            .on_schedule_changed(&schedules[0], &statuses, at("2026-06-12T20:30"), utc_of("2026-06-12T20:30"))
            .expect("активний запис має зупинитись");
        assert_eq!(stop_stream, "st1");
        assert_eq!(fix.result.status, ScheduleResultStatus::StoppedByUser);
        assert_eq!(fix.result.reason, Some(ScheduleResultReason::ScheduleEdited));
        assert!(!fix.disable_schedule, "далі — за новим станом (§3.5)");
        // Повторне увімкнення в тому ж вікні не рестартує (ledger під старим ключем)
        let free = busy(&[]);
        let actions = core.tick(&ctx("2026-06-12T20:31", &schedules, &free), &no_dst);
        assert!(actions.is_empty(), "got {actions:?}");
    }

    #[test]
    fn schedule_change_with_foreign_session_only_forgets() {
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 99)]);
        assert!(core.on_schedule_changed(&schedules[0], &statuses, at("2026-06-12T20:30"), utc_of("2026-06-12T20:30")).is_none());
        assert!(core.owned_sessions().is_empty(), "входження прибране з active");
    }

    #[test]
    fn schedule_delete_returns_stream_to_stop_without_fixation() {
        // «Видалення — просто зупинка (фіксувати нікуди)» (§3.5)
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let (mut core, _) = started_core(&schedules, "2026-06-12T20:00");
        let statuses = busy(&[("st1", 1)]);
        assert_eq!(core.on_schedule_deleted("a", &statuses), Some("st1".to_string()));
        assert!(core.owned_sessions().is_empty());
        // Нема активного запису → None
        assert_eq!(core.on_schedule_deleted("a", &statuses), None);
    }

    // --- ProfileSwitch / AppClosing (§3.5) ---

    #[test]
    fn drain_all_fixes_every_owned_recording() {
        let schedules = [
            recurring("a", "st1", &[4], "20:00", 60),
            recurring("b", "st2", &[4], "20:00", 60),
        ];
        let mut core = SchedulerCore::default();
        let free = busy(&[]);
        let actions = core.tick(&ctx("2026-06-12T20:00", &schedules, &free), &no_dst);
        for action in actions {
            let TickAction::StartRecording { key, stream_id, window_end_utc, late } = action else { panic!() };
            let sid = if stream_id == "st1" { 1 } else { 2 };
            core.confirm_start(key, stream_id, sid, window_end_utc, late, utc_of("2026-06-12T20:00"));
        }
        let statuses = busy(&[("st1", 1), ("st2", 2)]);
        let fixes = core.drain_all(
            ScheduleResultReason::ProfileSwitch,
            &schedules,
            &statuses,
            at("2026-06-12T20:30"),
            utc_of("2026-06-12T20:30"),
        );
        assert_eq!(fixes.len(), 2);
        for f in &fixes {
            assert_eq!(f.result.status, ScheduleResultStatus::StoppedByUser);
            assert_eq!(f.result.reason, Some(ScheduleResultReason::ProfileSwitch));
            assert_eq!(f.result.recorded_minutes, 30);
        }
        assert!(core.owned_sessions().is_empty());
    }

    #[test]
    fn reset_clears_ledger_for_new_profile() {
        // Після reset стара історія не блокує розклади нового профілю
        let schedules = [recurring("a", "st1", &[4], "20:00", 60)];
        let statuses = busy(&[]);
        let mut core = SchedulerCore::default();
        core.tick(&ctx("2026-06-12T21:30", &schedules, &statuses), &no_dst); // Missed → ledger
        core.reset();
        let actions = core.tick(&ctx("2026-06-12T21:31", &schedules, &statuses), &no_dst);
        // Без last_result дедуплікація не спрацює — Missed фіксується знову,
        // що доводить: ledger порожній
        assert_eq!(fixations(&actions).len(), 1);
    }

    // --- essential_fields_changed (§3.5) ---

    #[test]
    fn name_change_is_not_essential() {
        let old = recurring("a", "st1", &[4], "20:00", 60);
        let mut new = old.clone();
        new.name = "Renamed".into();
        new.enabled = false; // enabled теж не суттєве — ним займається toggle
        assert!(!essential_fields_changed(&old, &new));
    }

    #[test]
    fn each_essential_field_triggers() {
        let old = recurring("a", "st1", &[4], "20:00", 60);
        let mut s = old.clone(); s.stream_id = "st2".into();
        assert!(essential_fields_changed(&old, &s));
        let mut s = old.clone(); s.time = "20:01".into();
        assert!(essential_fields_changed(&old, &s));
        let mut s = old.clone(); s.days = vec![0, 4];
        assert!(essential_fields_changed(&old, &s));
        let mut s = old.clone(); s.date = Some("2026-06-14".into());
        assert!(essential_fields_changed(&old, &s));
        let mut s = old.clone(); s.duration_minutes = 61;
        assert!(essential_fields_changed(&old, &s));
    }

    #[test]
    fn active_overview_returns_confirmed_starts() {
        let mut core = SchedulerCore::default();
        let key: OccKey = ("sch1".into(), "2026-06-12T20:00".into());
        let end = Utc::now() + Duration::hours(2);
        core.confirm_start(key.clone(), "st1".into(), 7, end, false, Utc::now());
        let overview = core.active_overview();
        assert_eq!(overview.len(), 1);
        assert_eq!(overview[0].key, key);
        assert_eq!(overview[0].stream_id, "st1");
        assert_eq!(overview[0].window_end_utc, end);
    }

    #[test]
    fn dst_gap_start_is_missed_clock_change() {
        // 2026-03-29 — неділя (день 6); 03:15 у розриві 03:00→04:00
        let schedules = [recurring("a", "st1", &[6], "03:15", 30)];
        let statuses = busy(&[]);
        let gap_resolver = |n: NaiveDateTime| {
            use chrono::Timelike;
            if n.date() == chrono::NaiveDate::from_ymd_opt(2026, 3, 29).unwrap() && n.hour() == 3 {
                LocalKind::Gap
            } else {
                no_dst(n)
            }
        };
        let mut core = SchedulerCore::default();
        // Годинник стрибнув 02:59 → 04:00; вікно [03:15, 03:45) повністю в розриві
        let actions = core.tick(&ctx("2026-03-29T04:00", &schedules, &statuses), &gap_resolver);
        let fixes = fixations(&actions);
        assert_eq!(fixes[0].result.status, ScheduleResultStatus::Missed);
        assert_eq!(fixes[0].result.reason, Some(ScheduleResultReason::ClockChange));
    }
}
