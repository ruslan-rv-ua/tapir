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

    /// Прохід A (§3.2): активні входження. Task 4.
    fn pass_a(&mut self, _ctx: &TickCtx, _actions: &mut Vec<TickAction>) {}

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
