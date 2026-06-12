use serde::{Deserialize, Serialize};

use crate::app_state::AppState;
use crate::errors::RadioError;
use crate::profile::{Profile, ScheduleType, ScheduledRecording};
use crate::scheduler::validation;

/// Відповідь get_schedules: розклад + обчислюване nextRun.
/// Фаза 1: nextRun завжди None — обчислення вікон з'явиться у Фазі 2.
/// Формат nextRun (Фаза 2): ISO локальний datetime "YYYY-MM-DDTHH:MM".
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleDto {
    #[serde(flatten)]
    pub schedule: ScheduledRecording,
    pub next_run: Option<String>,
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

// --- Tauri-команди (спека §4): працюють з активним профілем і одразу персистять ---

#[tauri::command]
pub async fn get_schedules(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ScheduleDto>, String> {
    let profile = state.active_profile.read().await;
    Ok(profile
        .scheduled_recordings
        .iter()
        .cloned()
        .map(|schedule| ScheduleDto { schedule, next_run: None })
        .collect())
}

#[tauri::command]
pub async fn add_schedule(
    input: ScheduledRecordingInput,
    state: tauri::State<'_, AppState>,
) -> Result<ScheduledRecording, String> {
    let (entry, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let entry = add_schedule_impl(&mut profile, input).map_err(|e| e.to_string())?;
        (entry, profile.clone())
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(entry)
}

#[tauri::command]
pub async fn update_schedule(
    schedule: ScheduledRecording,
    state: tauri::State<'_, AppState>,
) -> Result<ScheduledRecording, String> {
    let (entry, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let entry = update_schedule_impl(&mut profile, schedule).map_err(|e| e.to_string())?;
        (entry, profile.clone())
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(entry)
}

#[tauri::command]
pub async fn delete_schedule(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let snapshot = {
        let mut profile = state.active_profile.write().await;
        delete_schedule_impl(&mut profile, &id);
        profile.clone()
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_schedule(
    id: String,
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<ScheduledRecording, String> {
    let (entry, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let entry =
            toggle_schedule_impl(&mut profile, &id, enabled).map_err(|e| e.to_string())?;
        (entry, profile.clone())
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(entry)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::{ScheduleResult, ScheduleResultStatus, StreamInfo};

    fn profile_with_stream() -> Profile {
        let mut p = Profile::create_default();
        p.streams.push(StreamInfo {
            id: "st1".into(), url: "http://x".into(), name: "X".into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
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
