//! Чиста календарна логіка вікон (§3.2 крок 1, §4 nextRun).
//! Без tokio і Tauri; `now` — завжди параметр. DST — через generic TimeZone.

use chrono::{DateTime, Datelike, Duration, LocalResult, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Utc};

use crate::profile::{ScheduleType, ScheduledRecording};

/// Вікно конкретного входження в наївному локальному календарі (§3.2 крок 1).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OccurrenceWindow {
    pub occurrence: NaiveDateTime,   // номінальний початок (без padding)
    pub window_start: NaiveDateTime, // occurrence − padBefore
    pub window_end: NaiveDateTime,   // occurrence + duration + padAfter
}

/// Друга половина ключа входження (§3.1) і формат nextRun/occurrence (§4).
pub fn occurrence_key(dt: NaiveDateTime) -> String {
    dt.format("%Y-%m-%dT%H:%M").to_string()
}

fn parse_time(s: &ScheduledRecording) -> Option<NaiveTime> {
    NaiveTime::parse_from_str(&s.time, "%H:%M").ok()
}

/// День тижня у форматі моделі §2: 0=Пн..6=Нд.
fn weekday_index(date: NaiveDate) -> u8 {
    date.weekday().num_days_from_monday() as u8
}

fn window_for(s: &ScheduledRecording, date: NaiveDate, time: NaiveTime, pad_before: u32, pad_after: u32) -> OccurrenceWindow {
    let occurrence = NaiveDateTime::new(date, time);
    OccurrenceWindow {
        occurrence,
        window_start: occurrence - Duration::minutes(pad_before as i64),
        window_end: occurrence + Duration::minutes(s.duration_minutes as i64 + pad_after as i64),
    }
}

/// Найсвіжіше входження, чиє вікно ПОЧАЛОСЯ не пізніше `now`
/// (window_start <= now). Прохід B працює саме з ним: воно або активне
/// зараз, або щойно минуло (Missed). Oneshot — з явної дати, без горизонту
/// назад (§3.2 крок 1); recurring — до 7 діб назад. Offset −1 (завтра)
/// потрібен, коли padBefore відкриває завтрашнє вікно ще сьогодні.
pub fn latest_started_window(
    s: &ScheduledRecording,
    pad_before_min: u32,
    pad_after_min: u32,
    now: NaiveDateTime,
) -> Option<OccurrenceWindow> {
    let time = parse_time(s)?;
    match s.schedule_type {
        ScheduleType::Oneshot => {
            let date = NaiveDate::parse_from_str(s.date.as_deref()?, "%Y-%m-%d").ok()?;
            let w = window_for(s, date, time, pad_before_min, pad_after_min);
            (w.window_start <= now).then_some(w)
        }
        ScheduleType::Recurring => {
            for offset in -1..=7i64 {
                let date = now.date() - Duration::days(offset);
                if !s.days.contains(&weekday_index(date)) {
                    continue;
                }
                let w = window_for(s, date, time, pad_before_min, pad_after_min);
                if w.window_start <= now {
                    return Some(w);
                }
            }
            None
        }
    }
}

/// Найближчий номінальний старт строго ПІСЛЯ `now` (для nextRun, §4).
/// Padding не враховується. Вимкнені розклади фільтрує викликач.
pub fn next_run(s: &ScheduledRecording, now: NaiveDateTime) -> Option<NaiveDateTime> {
    let time = parse_time(s)?;
    match s.schedule_type {
        ScheduleType::Oneshot => {
            let date = NaiveDate::parse_from_str(s.date.as_deref()?, "%Y-%m-%d").ok()?;
            let occ = NaiveDateTime::new(date, time);
            (occ > now).then_some(occ)
        }
        ScheduleType::Recurring => (0..=7i64)
            .map(|offset| NaiveDateTime::new(now.date() + Duration::days(offset), time))
            .find(|occ| *occ > now && s.days.contains(&weekday_index(occ.date()))),
    }
}

/// Відображення наївного локального часу на інстант (§3.2): Gap — час не
/// існує (DST уперед) → Missed (ClockChange); Ambiguous — існує двічі (DST
/// назад), беремо ПЕРШЕ входження, щоб window_end не подовжував запис.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalKind {
    Valid(DateTime<Utc>),
    Gap,
    Ambiguous(DateTime<Utc>),
}

/// У проді tz = chrono::Local; у тестах — chrono_tz або фейк.
pub fn resolve_local<Tz: TimeZone>(tz: &Tz, naive: NaiveDateTime) -> LocalKind {
    match tz.from_local_datetime(&naive) {
        LocalResult::Single(dt) => LocalKind::Valid(dt.with_timezone(&Utc)),
        LocalResult::Ambiguous(first, _) => LocalKind::Ambiguous(first.with_timezone(&Utc)),
        LocalResult::None => LocalKind::Gap,
    }
}

/// Інстант кінця вікна, обчислюється ОДИН раз на старті запису (§3.2).
/// Кінець у DST-розриві — екзотика: беремо naive+1h (похибка ≤ розриву).
pub fn end_instant(resolve: &dyn Fn(NaiveDateTime) -> LocalKind, window_end: NaiveDateTime) -> DateTime<Utc> {
    match resolve(window_end) {
        LocalKind::Valid(u) | LocalKind::Ambiguous(u) => u,
        LocalKind::Gap => match resolve(window_end + Duration::hours(1)) {
            LocalKind::Valid(u) | LocalKind::Ambiguous(u) => u,
            // Подвійний розрив не трапляється у реальних TZ — детермінований фолбек
            LocalKind::Gap => Utc.from_utc_datetime(&window_end),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::{ScheduleType, ScheduledRecording};
    use chrono::TimeZone;

    fn recurring(days: &[u8], time: &str, dur: u32) -> ScheduledRecording {
        ScheduledRecording {
            id: "sch1".into(),
            stream_id: "st1".into(),
            name: "Test".into(),
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

    fn oneshot(date: &str, time: &str, dur: u32) -> ScheduledRecording {
        let mut s = recurring(&[], time, dur);
        s.schedule_type = ScheduleType::Oneshot;
        s.date = Some(date.into());
        s
    }

    fn at(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M").unwrap()
    }

    // --- latest_started_window ---

    #[test]
    fn recurring_window_active_today() {
        // Пт 20:00–21:00, зараз пт 20:30
        let w = latest_started_window(&recurring(&[4], "20:00", 60), 0, 0, at("2026-06-12T20:30")).unwrap();
        assert_eq!(w.occurrence, at("2026-06-12T20:00"));
        assert_eq!(w.window_start, at("2026-06-12T20:00"));
        assert_eq!(w.window_end, at("2026-06-12T21:00"));
    }

    #[test]
    fn before_todays_window_falls_back_to_previous_week() {
        // Зараз пт 19:00 — сьогоднішнє вікно ще не почалося → минула п'ятниця
        let w = latest_started_window(&recurring(&[4], "20:00", 60), 0, 0, at("2026-06-12T19:00")).unwrap();
        assert_eq!(w.occurrence, at("2026-06-05T20:00"));
    }

    #[test]
    fn midnight_crossing_window_belongs_to_start_day() {
        // Пн 23:00 + 120 хв → вікно до вт 01:00; зараз вт 00:30 — активне
        let w = latest_started_window(&recurring(&[0], "23:00", 120), 0, 0, at("2026-06-09T00:30")).unwrap();
        assert_eq!(w.occurrence, at("2026-06-08T23:00"));
        assert_eq!(w.window_end, at("2026-06-09T01:00"));
    }

    #[test]
    fn pad_before_opens_tomorrows_window_today() {
        // Пт 00:10, padBefore 30 → вікно стартує чт 23:40; зараз чт 23:45
        let w = latest_started_window(&recurring(&[4], "00:10", 60), 30, 0, at("2026-06-11T23:45")).unwrap();
        assert_eq!(w.occurrence, at("2026-06-12T00:10"));
        assert_eq!(w.window_start, at("2026-06-11T23:40"));
    }

    #[test]
    fn pad_after_extends_window_end() {
        let w = latest_started_window(&recurring(&[4], "20:00", 60), 0, 45, at("2026-06-12T20:30")).unwrap();
        assert_eq!(w.window_end, at("2026-06-12T21:45"));
    }

    #[test]
    fn oneshot_far_in_past_is_still_found() {
        // Без штучного горизонту «24 години» (§3.2 крок 1)
        let w = latest_started_window(&oneshot("2026-06-01", "20:00", 60), 0, 0, at("2026-06-12T12:00")).unwrap();
        assert_eq!(w.occurrence, at("2026-06-01T20:00"));
    }

    #[test]
    fn future_oneshot_window_is_none() {
        // Вікно ще не почалося — тіку нічого робити
        assert!(latest_started_window(&oneshot("2026-06-14", "20:00", 60), 0, 0, at("2026-06-12T12:00")).is_none());
        // Для recurring завжди є минуле входження (до 7 діб назад) — None
        // буває лише з невалідними полями, див. наступний тест
        let w = latest_started_window(&recurring(&[6], "20:00", 60), 0, 0, at("2026-06-08T12:00")).unwrap();
        assert_eq!(w.occurrence, at("2026-06-07T20:00"));
    }

    #[test]
    fn invalid_time_or_date_is_none() {
        assert!(latest_started_window(&recurring(&[4], "xx:yy", 60), 0, 0, at("2026-06-12T12:00")).is_none());
        assert!(latest_started_window(&oneshot("garbage", "20:00", 60), 0, 0, at("2026-06-12T12:00")).is_none());
    }

    // --- next_run ---

    #[test]
    fn next_run_later_today() {
        assert_eq!(next_run(&recurring(&[4], "20:00", 60), at("2026-06-12T10:00")), Some(at("2026-06-12T20:00")));
    }

    #[test]
    fn next_run_skips_to_next_week_after_start() {
        // Рівно у хвилину старту і пізніше — наступне входження (строго >)
        assert_eq!(next_run(&recurring(&[4], "20:00", 60), at("2026-06-12T20:00")), Some(at("2026-06-19T20:00")));
    }

    #[test]
    fn next_run_picks_nearest_of_days() {
        // Дні пн+пт, зараз пт 21:00 → найближчий пн 06-15
        assert_eq!(next_run(&recurring(&[0, 4], "20:00", 60), at("2026-06-12T21:00")), Some(at("2026-06-15T20:00")));
    }

    #[test]
    fn next_run_oneshot() {
        assert_eq!(next_run(&oneshot("2026-06-14", "08:30", 60), at("2026-06-12T12:00")), Some(at("2026-06-14T08:30")));
        assert_eq!(next_run(&oneshot("2026-06-10", "08:30", 60), at("2026-06-12T12:00")), None);
    }

    // --- occurrence_key ---

    #[test]
    fn occurrence_key_format() {
        assert_eq!(occurrence_key(at("2026-06-12T20:00")), "2026-06-12T20:00");
    }

    // --- resolve_local / end_instant (chrono-tz, Europe/Kyiv) ---

    #[test]
    fn resolve_normal_time_is_valid() {
        let kind = resolve_local(&chrono_tz::Europe::Kiev, at("2026-06-12T20:00"));
        // Літо, UTC+3
        assert_eq!(kind, LocalKind::Valid(Utc.with_ymd_and_hms(2026, 6, 12, 17, 0, 0).unwrap()));
    }

    #[test]
    fn resolve_spring_forward_gap() {
        // 2026-03-29 03:00→04:00 — 03:30 не існує
        assert_eq!(resolve_local(&chrono_tz::Europe::Kiev, at("2026-03-29T03:30")), LocalKind::Gap);
    }

    #[test]
    fn resolve_fall_back_is_ambiguous_earliest() {
        // 2026-10-25 04:00→03:00 — 03:30 існує двічі; беремо ПЕРШЕ (літнє, UTC+3 → 00:30 UTC)
        assert_eq!(
            resolve_local(&chrono_tz::Europe::Kiev, at("2026-10-25T03:30")),
            LocalKind::Ambiguous(Utc.with_ymd_and_hms(2026, 10, 25, 0, 30, 0).unwrap())
        );
    }

    #[test]
    fn end_instant_in_gap_shifts_one_hour() {
        let resolve = |n: NaiveDateTime| resolve_local(&chrono_tz::Europe::Kiev, n);
        // 03:30 у розриві → 04:30 EEST = 01:30 UTC
        assert_eq!(
            end_instant(&resolve, at("2026-03-29T03:30")),
            Utc.with_ymd_and_hms(2026, 3, 29, 1, 30, 0).unwrap()
        );
    }
}
