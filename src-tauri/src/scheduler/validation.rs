//! Чиста валідація розкладів (спека Phase 3D §2).
//! Календарна логіка обчислення вікон з'явиться у Фазі 2 (scheduler::timer).

use chrono::{NaiveDate, NaiveDateTime, NaiveTime};

use crate::errors::RadioError;
use crate::profile::{Profile, ScheduleType, ScheduledRecording, StreamInfo};

/// Структурні правила §2: формат полів, узгодженість type ↔ days/date.
/// Застосовується і на add/update, і на load (sanitize_on_load).
pub fn validate_structural(s: &ScheduledRecording) -> Result<(), RadioError> {
    if NaiveTime::parse_from_str(&s.time, "%H:%M").is_err() {
        return Err(RadioError::InvalidData(format!(
            "Invalid time '{}': expected HH:MM", s.time
        )));
    }
    if !(1..=1439).contains(&s.duration_minutes) {
        return Err(RadioError::InvalidData(format!(
            "Duration {} minutes is out of range 1..=1439", s.duration_minutes
        )));
    }
    match s.schedule_type {
        ScheduleType::Recurring => {
            if s.days.is_empty() {
                return Err(RadioError::InvalidData(
                    "Recurring schedule must list at least one day".into(),
                ));
            }
            if let Some(d) = s.days.iter().find(|d| **d > 6) {
                return Err(RadioError::InvalidData(format!(
                    "Day {d} is out of range 0..=6"
                )));
            }
            let mut seen = [false; 7];
            for &d in &s.days {
                if seen[d as usize] {
                    return Err(RadioError::InvalidData(format!("Duplicate day {d}")));
                }
                seen[d as usize] = true;
            }
            if s.date.is_some() {
                return Err(RadioError::InvalidData(
                    "Recurring schedule must not have a date".into(),
                ));
            }
        }
        ScheduleType::Oneshot => {
            if !s.days.is_empty() {
                return Err(RadioError::InvalidData(
                    "Oneshot schedule must not have days".into(),
                ));
            }
            let Some(date) = s.date.as_deref() else {
                return Err(RadioError::InvalidData(
                    "Oneshot schedule requires a date".into(),
                ));
            };
            if NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err() {
                return Err(RadioError::InvalidData(format!(
                    "Invalid date '{date}': expected YYYY-MM-DD"
                )));
            }
        }
    }
    Ok(())
}

/// Чи вікно oneshot (кінець включає padAfter) повністю в минулому.
/// Порівняння за наївним локальним календарем — для валідації цього досить.
/// Для recurring і для непарсибельних полів — false (структурну валідність
/// перевіряє validate_structural, не ця функція).
pub fn oneshot_window_fully_past(
    s: &ScheduledRecording,
    pad_after_min: u32,
    now: NaiveDateTime,
) -> bool {
    if s.schedule_type != ScheduleType::Oneshot {
        return false;
    }
    let Some(date) = s.date.as_deref() else { return false };
    let Ok(date) = NaiveDate::parse_from_str(date, "%Y-%m-%d") else { return false };
    let Ok(time) = NaiveTime::parse_from_str(&s.time, "%H:%M") else { return false };
    let end = NaiveDateTime::new(date, time)
        + chrono::Duration::minutes(s.duration_minutes as i64 + pad_after_min as i64);
    end <= now
}

/// Повна валідація для add_schedule / update_schedule (§2).
pub fn validate_for_save(
    s: &ScheduledRecording,
    streams: &[StreamInfo],
    pad_after_min: u32,
    now: NaiveDateTime,
) -> Result<(), RadioError> {
    validate_structural(s)?;
    if !streams.iter().any(|st| st.id == s.stream_id) {
        return Err(RadioError::NotFound(format!(
            "Stream '{}' not found in active profile", s.stream_id
        )));
    }
    if oneshot_window_fully_past(s, pad_after_min, now) {
        return Err(RadioError::InvalidData(
            "Oneshot schedule window is fully in the past".into(),
        ));
    }
    Ok(())
}

/// Валідація для toggle_schedule(enabled = true): структура + oneshot не
/// відпрацьований. stream_id НЕ перевіряється — осиротілі розклади дозволені
/// (§2), у Фазі 2 вони дадуть Missed.
pub fn validate_for_enable(
    s: &ScheduledRecording,
    pad_after_min: u32,
    now: NaiveDateTime,
) -> Result<(), RadioError> {
    validate_structural(s)?;
    if oneshot_window_fully_past(s, pad_after_min, now) {
        return Err(RadioError::InvalidData(
            "Oneshot schedule window is fully in the past".into(),
        ));
    }
    Ok(())
}

/// На load профілю (§2): профіль — JSON на диску, його можуть редагувати
/// руками. Жорстко невалідний розклад не валить завантаження — вимикається
/// з попередженням у лозі; рядок лишається видимим у таблиці.
/// Осиротілий stream_id і відпрацьований oneshot тут НЕ чіпаються.
pub fn sanitize_on_load(profile: &mut Profile) {
    for s in &mut profile.scheduled_recordings {
        if !s.enabled {
            continue;
        }
        if let Err(e) = validate_structural(s) {
            log::warn!("Disabling invalid schedule '{}' ({}): {e}", s.name, s.id);
            s.enabled = false;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::{Profile, ScheduleType, ScheduledRecording, StreamInfo};
    use chrono::NaiveDateTime;

    fn recurring(days: &[u8]) -> ScheduledRecording {
        ScheduledRecording {
            id: "sch1".into(),
            stream_id: "st1".into(),
            name: "Test".into(),
            schedule_type: ScheduleType::Recurring,
            days: days.to_vec(),
            date: None,
            time: "20:00".into(),
            duration_minutes: 60,
            enabled: true,
            created_at: "2026-06-12T10:00:00+03:00".into(),
            last_result: None,
        }
    }

    fn oneshot(date: &str, time: &str, duration: u32) -> ScheduledRecording {
        ScheduledRecording {
            id: "sch1".into(),
            stream_id: "st1".into(),
            name: "Test".into(),
            schedule_type: ScheduleType::Oneshot,
            days: vec![],
            date: Some(date.into()),
            time: time.into(),
            duration_minutes: duration,
            enabled: true,
            created_at: "2026-06-12T10:00:00+03:00".into(),
            last_result: None,
        }
    }

    fn at(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M").unwrap()
    }

    fn one_stream() -> Vec<StreamInfo> {
        vec![StreamInfo {
            id: "st1".into(), url: "http://x".into(), name: "X".into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
            unsupported_codec: None,
            icy_url: None, ignorelist: vec![], username: None, password: None,
            added_at: "2026-01-01".into(),
        }]
    }

    // --- validate_structural ---

    #[test]
    fn recurring_valid_passes() {
        assert!(validate_structural(&recurring(&[0, 1, 2, 3, 4])).is_ok());
        assert!(validate_structural(&recurring(&[6])).is_ok());
    }

    #[test]
    fn recurring_empty_days_fails() {
        assert!(validate_structural(&recurring(&[])).is_err());
    }

    #[test]
    fn recurring_day_out_of_range_fails() {
        assert!(validate_structural(&recurring(&[0, 7])).is_err());
    }

    #[test]
    fn recurring_duplicate_days_fails() {
        assert!(validate_structural(&recurring(&[1, 1])).is_err());
    }

    #[test]
    fn recurring_with_date_fails() {
        let mut s = recurring(&[0]);
        s.date = Some("2026-06-14".into());
        assert!(validate_structural(&s).is_err());
    }

    #[test]
    fn oneshot_valid_passes() {
        assert!(validate_structural(&oneshot("2026-06-14", "20:00", 60)).is_ok());
    }

    #[test]
    fn oneshot_with_days_fails() {
        let mut s = oneshot("2026-06-14", "20:00", 60);
        s.days = vec![0];
        assert!(validate_structural(&s).is_err());
    }

    #[test]
    fn oneshot_without_date_fails() {
        let mut s = oneshot("2026-06-14", "20:00", 60);
        s.date = None;
        assert!(validate_structural(&s).is_err());
    }

    #[test]
    fn oneshot_invalid_date_fails() {
        assert!(validate_structural(&oneshot("2026-13-40", "20:00", 60)).is_err());
        assert!(validate_structural(&oneshot("14.06.2026", "20:00", 60)).is_err());
    }

    #[test]
    fn invalid_time_fails() {
        for bad in ["24:00", "garbage", "20:00:00", ""] {
            let mut s = recurring(&[0]);
            s.time = bad.into();
            assert!(validate_structural(&s).is_err(), "time '{bad}' має бути відхилено");
        }
    }

    #[test]
    fn duration_bounds() {
        let mk = |d| { let mut s = recurring(&[0]); s.duration_minutes = d; s };
        assert!(validate_structural(&mk(0)).is_err());
        assert!(validate_structural(&mk(1440)).is_err());
        assert!(validate_structural(&mk(1)).is_ok());
        assert!(validate_structural(&mk(1439)).is_ok());
    }

    // --- oneshot_window_fully_past ---

    #[test]
    fn window_end_exactly_now_is_past() {
        let s = oneshot("2026-06-12", "20:00", 60);
        assert!(oneshot_window_fully_past(&s, 0, at("2026-06-12T21:00")));
        assert!(!oneshot_window_fully_past(&s, 0, at("2026-06-12T20:59")));
    }

    #[test]
    fn pad_after_extends_window() {
        let s = oneshot("2026-06-12", "20:00", 60);
        // кінець без padding — 21:00; із padAfter 60 — 22:00
        assert!(oneshot_window_fully_past(&s, 0, at("2026-06-12T21:30")));
        assert!(!oneshot_window_fully_past(&s, 60, at("2026-06-12T21:30")));
    }

    #[test]
    fn recurring_is_never_fully_past() {
        assert!(!oneshot_window_fully_past(&recurring(&[0]), 0, at("2099-01-01T00:00")));
    }

    // --- validate_for_save ---

    #[test]
    fn save_accepts_valid_recurring() {
        assert!(validate_for_save(&recurring(&[0]), &one_stream(), 0,
            at("2026-06-12T12:00")).is_ok());
    }

    #[test]
    fn save_rejects_unknown_stream() {
        let err = validate_for_save(&recurring(&[0]), &[], 0, at("2026-06-12T12:00"))
            .unwrap_err();
        assert!(err.to_string().contains("not found"), "got: {err}");
    }

    #[test]
    fn save_rejects_past_oneshot() {
        let s = oneshot("2026-06-10", "20:00", 60);
        assert!(validate_for_save(&s, &one_stream(), 0, at("2026-06-12T12:00")).is_err());
    }

    #[test]
    fn save_accepts_future_oneshot() {
        let s = oneshot("2026-06-14", "20:00", 60);
        assert!(validate_for_save(&s, &one_stream(), 0, at("2026-06-12T12:00")).is_ok());
    }

    // --- validate_for_enable ---

    #[test]
    fn enable_rejects_past_oneshot() {
        let s = oneshot("2026-06-10", "20:00", 60);
        assert!(validate_for_enable(&s, 0, at("2026-06-12T12:00")).is_err());
    }

    #[test]
    fn enable_allows_orphan_stream() {
        // stream_id не перевіряється на enable: осиротілі розклади дозволені
        let mut s = recurring(&[0]);
        s.stream_id = "ghost".into();
        assert!(validate_for_enable(&s, 0, at("2026-06-12T12:00")).is_ok());
    }

    // --- sanitize_on_load ---

    #[test]
    fn sanitize_disables_invalid_enabled_schedule() {
        let mut p = Profile::create_default();
        p.scheduled_recordings.push(recurring(&[])); // невалідний: порожні days
        sanitize_on_load(&mut p);
        assert_eq!(p.scheduled_recordings.len(), 1, "рядок лишається в списку");
        assert!(!p.scheduled_recordings[0].enabled);
    }

    #[test]
    fn sanitize_keeps_valid_schedule_enabled() {
        let mut p = Profile::create_default();
        p.scheduled_recordings.push(recurring(&[0, 4]));
        sanitize_on_load(&mut p);
        assert!(p.scheduled_recordings[0].enabled);
    }

    #[test]
    fn sanitize_keeps_orphan_and_past_oneshot_enabled() {
        // Осиротілий stream_id і відпрацьований oneshot НЕ вимикаються на load —
        // ними займеться таймер Фази 2 (Missed → enabled = false)
        let mut p = Profile::create_default();
        let mut orphan = recurring(&[0]);
        orphan.stream_id = "ghost".into();
        p.scheduled_recordings.push(orphan);
        p.scheduled_recordings.push(oneshot("2000-01-01", "20:00", 60));
        sanitize_on_load(&mut p);
        assert!(p.scheduled_recordings[0].enabled);
        assert!(p.scheduled_recordings[1].enabled);
    }

    #[test]
    fn sanitize_skips_already_disabled() {
        let mut p = Profile::create_default();
        let mut s = recurring(&[]);
        s.enabled = false;
        p.scheduled_recordings.push(s);
        sanitize_on_load(&mut p);
        assert!(!p.scheduled_recordings[0].enabled);
    }
}
