use serde::{Deserialize, Serialize};

use crate::app_state::AppState;
use crate::errors::RadioError;
use crate::profile::{Profile, ScheduleType, ScheduledRecording};
use crate::store::Commit;
use crate::scheduler::validation;

/// Відповідь get_schedules: розклад + обчислюване nextRun
/// ("YYYY-MM-DDTHH:MM", §4; None — вимкнено або oneshot у минулому).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleDto {
    #[serde(flatten)]
    pub schedule: ScheduledRecording,
    pub next_run: Option<String>,
}

/// Активний плановий запис — дані для confirm-діалогів §3.5.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveScheduledDto {
    pub recording_id: String,
    pub name: String,
    pub stream_id: String,
    /// Локальний кінець вікна "YYYY-MM-DDTHH:MM" — frontend форматує «до HH:MM».
    pub window_end: String,
}

/// Вхід add_schedule: id, createdAt, lastResult генерує/володіє backend.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledRecordingInput {
    pub stream_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub schedule_type: ScheduleType,
    #[serde(default)]
    pub days: Vec<u8>,
    #[serde(default)]
    pub date: Option<String>,
    pub time: String,
    pub duration_minutes: u32,
    pub enabled: bool,
}

// --- Чиста логіка (тестується без tauri::State) ---

fn add_schedule_impl(
    profile: &mut Profile,
    input: ScheduledRecordingInput,
) -> Result<ScheduledRecording, RadioError> {
    let schedule = ScheduledRecording {
        id: nanoid::nanoid!(),
        stream_id: input.stream_id,
        name: input.name,
        schedule_type: input.schedule_type,
        days: input.days,
        date: input.date,
        time: input.time,
        duration_minutes: input.duration_minutes,
        enabled: input.enabled,
        created_at: chrono::Local::now().to_rfc3339(),
        last_result: None,
    };
    validation::validate_for_save(
        &schedule,
        &profile.streams,
        profile.recording.schedule_pad_after_min,
        chrono::Local::now().naive_local(),
    )?;
    profile.scheduled_recordings.push(schedule.clone());
    Ok(schedule)
}

fn update_schedule_impl(
    profile: &mut Profile,
    incoming: ScheduledRecording,
) -> Result<ScheduledRecording, RadioError> {
    let idx = profile
        .scheduled_recordings
        .iter()
        .position(|s| s.id == incoming.id)
        .ok_or_else(|| RadioError::NotFound(format!("Schedule '{}' not found", incoming.id)))?;
    // §2: created_at і last_result із клієнта ігноруються — їх пише лише backend
    let mut updated = incoming;
    updated.created_at = profile.scheduled_recordings[idx].created_at.clone();
    updated.last_result = profile.scheduled_recordings[idx].last_result.clone();
    validation::validate_for_save(
        &updated,
        &profile.streams,
        profile.recording.schedule_pad_after_min,
        chrono::Local::now().naive_local(),
    )?;
    profile.scheduled_recordings[idx] = updated.clone();
    Ok(updated)
}

fn toggle_schedule_impl(
    profile: &mut Profile,
    id: &str,
    enabled: bool,
) -> Result<ScheduledRecording, RadioError> {
    let pad_after = profile.recording.schedule_pad_after_min;
    let idx = profile
        .scheduled_recordings
        .iter()
        .position(|s| s.id == id)
        .ok_or_else(|| RadioError::NotFound(format!("Schedule '{id}' not found")))?;
    if enabled {
        // §2: увімкнення відпрацьованого oneshot — та сама помилка, що на add/update
        validation::validate_for_enable(
            &profile.scheduled_recordings[idx],
            pad_after,
            chrono::Local::now().naive_local(),
        )?;
    }
    profile.scheduled_recordings[idx].enabled = enabled;
    Ok(profile.scheduled_recordings[idx].clone())
}

fn delete_schedule_impl(profile: &mut Profile, id: &str) {
    // Ідемпотентно, як remove_from_wishlist: відсутній id — не помилка
    profile.scheduled_recordings.retain(|s| s.id != id);
}

fn active_scheduled_impl(
    active: &[crate::scheduler::core::ActiveOccurrence],
    schedules: &[ScheduledRecording],
) -> Vec<ActiveScheduledDto> {
    active
        .iter()
        .map(|occ| ActiveScheduledDto {
            recording_id: occ.key.0.clone(),
            name: schedules
                .iter()
                .find(|s| s.id == occ.key.0)
                .map(|s| s.name.clone())
                .unwrap_or_default(),
            stream_id: occ.stream_id.clone(),
            window_end: occ
                .window_end_utc
                .with_timezone(&chrono::Local)
                .format("%Y-%m-%dT%H:%M")
                .to_string(),
        })
        .collect()
}

/// §4: nextRun — ISO локальний datetime "YYYY-MM-DDTHH:MM" наступного
/// номінального старту; None для вимкнених і відпрацьованих oneshot
/// (frontend рендерить «—»). Обчислення — тільки в Rust.
fn dto_for(schedule: ScheduledRecording, now: chrono::NaiveDateTime) -> ScheduleDto {
    let next_run = if schedule.enabled {
        crate::scheduler::windows::next_run(&schedule, now)
            .map(crate::scheduler::windows::occurrence_key)
    } else {
        None
    };
    ScheduleDto { schedule, next_run }
}

/// Remove every schedule whose id is in `ids`; returns how many were removed.
/// Pure over the profile — unit-testable without Tauri state.
pub fn retain_schedules(profile: &mut Profile, ids: &std::collections::HashSet<String>) -> usize {
    let before = profile.scheduled_recordings.len();
    profile.scheduled_recordings.retain(|s| !ids.contains(&s.id));
    before - profile.scheduled_recordings.len()
}

// --- Tauri-команди (спека §4): працюють з активним профілем і одразу персистять ---

#[tauri::command]
pub async fn get_schedules(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ScheduleDto>, String> {
    let now = chrono::Local::now().naive_local();
    let profile = state.active_profile.read().await;
    Ok(profile
        .scheduled_recordings
        .iter()
        .cloned()
        .map(|schedule| dto_for(schedule, now))
        .collect())
}

#[tauri::command]
pub async fn add_schedule(
    input: ScheduledRecordingInput,
    state: tauri::State<'_, AppState>,
) -> Result<ScheduledRecording, String> {
    state
        .commit_profile(|profile| match add_schedule_impl(profile, input) {
            Ok(entry) => Commit::Save(Ok(entry)),
            Err(e) => Commit::Skip(Err(e.to_string())),
        })
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn update_schedule(
    schedule: ScheduledRecording,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ScheduledRecording, String> {
    let (entry, old) = state
        .commit_profile(|profile| {
            let old = profile.scheduled_recordings.iter().find(|s| s.id == schedule.id).cloned();
            match update_schedule_impl(profile, schedule) {
                Ok(entry) => Commit::Save(Ok((entry, old))),
                Err(e) => Commit::Skip(Err(e.to_string())),
            }
        })
        .await
        .map_err(|e| e.to_string())??;
    // §3.5: зміна назви запис не перериває; суттєві поля — зупинка
    // з фіксацією StoppedByUser(ScheduleEdited)
    if let Some(old) = old {
        if crate::scheduler::core::essential_fields_changed(&old, &entry) {
            crate::scheduler::timer::notify_schedule_changed(&app, &entry).await;
        }
    }
    Ok(entry)
}

#[tauri::command]
pub async fn delete_schedule(
    id: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state
        .commit_profile(|profile| {
            delete_schedule_impl(profile, &id);
            Commit::Save(())
        })
        .await
        .map_err(|e| e.to_string())?;
    // §3.5: видалення під час запису — просто зупинка (фіксувати нікуди)
    crate::scheduler::timer::notify_schedule_deleted(&app, &id).await;
    Ok(())
}

#[tauri::command]
pub async fn delete_schedules(
    ids: Vec<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<u32, String> {
    let id_set: std::collections::HashSet<String> = ids.iter().cloned().collect();
    let removed = state
        .commit_profile(|profile| Commit::Save(retain_schedules(profile, &id_set)))
        .await
        .map_err(|e| e.to_string())?;
    // §3.5: stop any in-progress recording for each deleted id (nothing to record).
    for id in &ids {
        crate::scheduler::timer::notify_schedule_deleted(&app, id).await;
    }
    Ok(removed as u32)
}

#[tauri::command]
pub async fn toggle_schedule(
    id: String,
    enabled: bool,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ScheduledRecording, String> {
    let entry = state
        .commit_profile(|profile| match toggle_schedule_impl(profile, &id, enabled) {
            Ok(entry) => Commit::Save(Ok(entry)),
            Err(e) => Commit::Skip(Err(e.to_string())),
        })
        .await
        .map_err(|e| e.to_string())??;
    // §3.5: вимкнення під час запису — та сама фіксація (ScheduleEdited) +
    // ledger: повторне увімкнення в тому ж вікні не рестартує
    if !enabled {
        crate::scheduler::timer::notify_schedule_changed(&app, &entry).await;
    }
    Ok(entry)
}

#[tauri::command]
pub async fn get_active_scheduled(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ActiveScheduledDto>, String> {
    let schedules = state.active_profile.read().await.scheduled_recordings.clone();
    let active = state.scheduler.core.lock().await.active_overview();
    Ok(active_scheduled_impl(&active, &schedules))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::{ScheduleResult, ScheduleResultStatus, StreamInfo};
    use chrono::NaiveDateTime;

    fn profile_with_stream() -> Profile {
        let mut p = Profile::create_default();
        p.streams.push(StreamInfo {
            id: "st1".into(), url: "http://x".into(), name: "X".into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
            unsupported_codec: None,
            icy_url: None, ignorelist: vec![], username: None, password: None,
            added_at: "2026-01-01".into(),
        });
        p
    }

    fn valid_input() -> ScheduledRecordingInput {
        ScheduledRecordingInput {
            stream_id: "st1".into(),
            name: "Evening Jazz".into(),
            schedule_type: ScheduleType::Recurring,
            days: vec![0, 2, 4],
            date: None,
            time: "20:00".into(),
            duration_minutes: 90,
            enabled: true,
        }
    }

    #[test]
    fn add_generates_server_owned_fields() {
        let mut p = profile_with_stream();
        let added = add_schedule_impl(&mut p, valid_input()).unwrap();
        assert!(!added.id.is_empty());
        assert!(!added.created_at.is_empty());
        assert!(added.last_result.is_none());
        assert_eq!(p.scheduled_recordings.len(), 1);
        assert_eq!(p.scheduled_recordings[0].id, added.id);
    }

    #[test]
    fn add_rejects_invalid_input() {
        let mut p = profile_with_stream();
        let mut input = valid_input();
        input.days = vec![]; // recurring без днів
        assert!(add_schedule_impl(&mut p, input).is_err());
        assert!(p.scheduled_recordings.is_empty(), "невалідне не додається");
    }

    #[test]
    fn add_rejects_unknown_stream() {
        let mut p = profile_with_stream();
        let mut input = valid_input();
        input.stream_id = "ghost".into();
        let err = add_schedule_impl(&mut p, input).unwrap_err();
        assert!(err.to_string().contains("not found"), "got: {err}");
    }

    #[test]
    fn update_preserves_server_owned_fields() {
        let mut p = profile_with_stream();
        let added = add_schedule_impl(&mut p, valid_input()).unwrap();

        let mut incoming = added.clone();
        incoming.name = "Renamed".into();
        incoming.created_at = "1999-01-01T00:00:00+00:00".into(); // клієнтський сміттєвий
        incoming.last_result = Some(ScheduleResult {
            occurrence: "2026-06-12T20:00".into(),
            status: ScheduleResultStatus::Completed,
            reason: None,
            recorded_minutes: 90,
            finished_at: "2026-06-12T22:00:00+03:00".into(),
        });

        let updated = update_schedule_impl(&mut p, incoming).unwrap();
        assert_eq!(updated.name, "Renamed");
        assert_eq!(updated.created_at, added.created_at, "createdAt від клієнта ігнорується");
        assert!(updated.last_result.is_none(), "lastResult від клієнта ігнорується");
        assert_eq!(p.scheduled_recordings[0].name, "Renamed");
    }

    #[test]
    fn update_unknown_id_is_not_found() {
        let mut p = profile_with_stream();
        let mut ghost = add_schedule_impl(&mut p, valid_input()).unwrap();
        ghost.id = "no-such-id".into();
        let err = update_schedule_impl(&mut p, ghost).unwrap_err();
        assert!(matches!(err, RadioError::NotFound(_)), "got: {err}");
    }

    #[test]
    fn toggle_flips_enabled() {
        let mut p = profile_with_stream();
        let added = add_schedule_impl(&mut p, valid_input()).unwrap();
        let off = toggle_schedule_impl(&mut p, &added.id, false).unwrap();
        assert!(!off.enabled);
        let on = toggle_schedule_impl(&mut p, &added.id, true).unwrap();
        assert!(on.enabled);
    }

    #[test]
    fn toggle_enable_expired_oneshot_fails() {
        let mut p = profile_with_stream();
        p.scheduled_recordings.push(ScheduledRecording {
            id: "old".into(), stream_id: "st1".into(), name: "Old".into(),
            schedule_type: ScheduleType::Oneshot,
            days: vec![], date: Some("2000-01-01".into()),
            time: "20:00".into(), duration_minutes: 60,
            enabled: false, created_at: "2000-01-01T00:00:00+00:00".into(),
            last_result: None,
        });
        assert!(toggle_schedule_impl(&mut p, "old", true).is_err());
        // вимкнення відпрацьованого — дозволене
        assert!(toggle_schedule_impl(&mut p, "old", false).is_ok());
    }

    #[test]
    fn toggle_unknown_id_is_not_found() {
        let mut p = profile_with_stream();
        let err = toggle_schedule_impl(&mut p, "ghost", true).unwrap_err();
        assert!(matches!(err, RadioError::NotFound(_)), "got: {err}");
    }

    #[test]
    fn delete_removes_and_is_idempotent() {
        let mut p = profile_with_stream();
        let added = add_schedule_impl(&mut p, valid_input()).unwrap();
        delete_schedule_impl(&mut p, &added.id);
        assert!(p.scheduled_recordings.is_empty());
        delete_schedule_impl(&mut p, &added.id); // повторне видалення — no-op
    }

    fn at(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M").unwrap()
    }

    #[test]
    fn dto_computes_next_run_for_enabled() {
        // 2026-06-12 — п'ятниця; valid_input має days [0,2,4] (пн/ср/пт) 20:00
        let mut p = profile_with_stream();
        let schedule = add_schedule_impl(&mut p, valid_input()).unwrap();
        let dto = dto_for(schedule, at("2026-06-12T10:00"));
        assert_eq!(dto.next_run.as_deref(), Some("2026-06-12T20:00"));
    }

    #[test]
    fn dto_next_run_none_when_disabled() {
        let mut p = profile_with_stream();
        let mut schedule = add_schedule_impl(&mut p, valid_input()).unwrap();
        schedule.enabled = false;
        let dto = dto_for(schedule, at("2026-06-12T10:00"));
        assert!(dto.next_run.is_none());
    }

    #[test]
    fn active_scheduled_impl_maps_names_and_local_end() {
        use crate::scheduler::core::ActiveOccurrence;
        let mut p = profile_with_stream();
        let added = add_schedule_impl(&mut p, valid_input()).unwrap();
        let end_utc = chrono::Utc::now() + chrono::Duration::hours(2);
        let occ = ActiveOccurrence {
            key: (added.id.clone(), "2026-06-12T20:00".into()),
            stream_id: "st1".into(),
            session_id: 1,
            window_end_utc: end_utc,
            started_late: false,
            started_at_utc: chrono::Utc::now(),
        };
        let dtos = active_scheduled_impl(&[occ], &p.scheduled_recordings);
        assert_eq!(dtos.len(), 1);
        assert_eq!(dtos[0].recording_id, added.id);
        assert_eq!(dtos[0].name, "Evening Jazz");
        assert_eq!(dtos[0].stream_id, "st1");
        // Формат §4: локальний "YYYY-MM-DDTHH:MM"
        assert!(
            NaiveDateTime::parse_from_str(&dtos[0].window_end, "%Y-%m-%dT%H:%M").is_ok(),
            "got: {}", dtos[0].window_end
        );
    }

    #[test]
    fn active_scheduled_dto_serializes_camel_case() {
        let dto = ActiveScheduledDto {
            recording_id: "r".into(), name: "N".into(),
            stream_id: "s".into(), window_end: "2026-06-12T22:05".into(),
        };
        let json = serde_json::to_string(&dto).unwrap();
        assert!(json.contains("\"recordingId\""), "got: {json}");
        assert!(json.contains("\"windowEnd\""), "got: {json}");
    }

    #[test]
    fn dto_next_run_none_for_past_oneshot() {
        // Будуємо напряму, НЕ через add_schedule_impl: той валідує проти
        // реального Local::now(), і фіксована дата з часом стала б минулою
        let schedule = ScheduledRecording {
            id: "o1".into(),
            stream_id: "st1".into(),
            name: "Once".into(),
            schedule_type: ScheduleType::Oneshot,
            days: vec![],
            date: Some("2026-06-14".into()),
            time: "20:00".into(),
            duration_minutes: 60,
            enabled: true,
            created_at: "2026-06-12T10:00:00+03:00".into(),
            last_result: None,
        };
        let dto = dto_for(schedule.clone(), at("2026-06-15T10:00"));
        assert!(dto.next_run.is_none(), "початок у минулому → None, frontend покаже «—»");
        let dto = dto_for(schedule, at("2026-06-12T10:00"));
        assert_eq!(dto.next_run.as_deref(), Some("2026-06-14T20:00"));
    }

    #[test]
    fn retain_schedules_removes_listed_and_counts() {
        let mut p = profile_with_stream();
        let a = add_schedule_impl(&mut p, valid_input()).unwrap();
        let mut second = valid_input();
        second.name = "Second".into();
        let b = add_schedule_impl(&mut p, second).unwrap();
        let ids: std::collections::HashSet<String> = [a.id.clone()].into_iter().collect();
        let removed = retain_schedules(&mut p, &ids);
        assert_eq!(removed, 1);
        assert_eq!(p.scheduled_recordings.iter().map(|s| s.id.clone()).collect::<Vec<_>>(), vec![b.id]);
    }

    #[test]
    fn schedule_dto_flattens_and_camel_cases() {
        let mut p = profile_with_stream();
        let schedule = add_schedule_impl(&mut p, valid_input()).unwrap();
        let dto = ScheduleDto { schedule, next_run: None };
        let json = serde_json::to_string(&dto).unwrap();
        assert!(json.contains("\"nextRun\":null"), "got: {json}");
        assert!(json.contains("\"streamId\":\"st1\""), "got: {json}");
        assert!(!json.contains("\"schedule\":"), "flatten: без вкладеного об'єкта");
    }
}
