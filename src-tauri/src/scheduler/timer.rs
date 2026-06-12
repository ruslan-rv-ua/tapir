//! Imperative shell планувальника (§3.2, §3.5, §4): tokio-задача тіка,
//! застосування TickAction до StreamManager/профілю, події scheduled-*.
//! Усі рішення приймає core; тут — лише I/O і клей.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use chrono::{NaiveDateTime, Timelike};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

use crate::app_state::AppState;
use crate::profile::{ScheduleResultReason, ScheduleResultStatus, ScheduledRecording};
use super::core::{Fixation, SchedulerCore, TickAction, TickCtx};
use super::windows::{resolve_local, LocalKind};

pub struct SchedulerShared {
    pub core: tokio::sync::Mutex<SchedulerCore>,
    started: AtomicBool,
    pub cancel: CancellationToken,
}

impl SchedulerShared {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            core: tokio::sync::Mutex::new(SchedulerCore::default()),
            started: AtomicBool::new(false),
            cancel: CancellationToken::new(),
        })
    }

    /// Старт тік-задачі після ready-сигналу frontend (§3.5). Ідемпотентний:
    /// повторний frontend_ready (перезавантаження webview) — no-op.
    /// Перший тік — на початку наступної календарної хвилини.
    pub fn start(self: &Arc<Self>, app: AppHandle) {
        if self.started.swap(true, Ordering::SeqCst) {
            return;
        }
        let shared = self.clone();
        tauri::async_runtime::spawn(async move {
            log::info!("Scheduler tick loop started");
            loop {
                let wait = ms_until_next_minute(chrono::Local::now().timestamp_millis());
                tokio::select! {
                    _ = shared.cancel.cancelled() => break,
                    _ = tokio::time::sleep(std::time::Duration::from_millis(wait)) => {}
                }
                run_tick(&app).await;
            }
            log::info!("Scheduler tick loop stopped");
        });
    }
}

/// Чиста: мс до початку наступної календарної хвилини.
pub fn ms_until_next_minute(now_ms: i64) -> u64 {
    (60_000 - now_ms.rem_euclid(60_000)) as u64
}

/// Чиста: зріз до хвилини — гранулярність порівнянь §3.2.
pub fn truncate_to_minute(n: NaiveDateTime) -> NaiveDateTime {
    n.with_second(0).and_then(|n| n.with_nanosecond(0)).unwrap_or(n)
}

fn local_resolver(n: NaiveDateTime) -> LocalKind {
    resolve_local(&chrono::Local, n)
}

fn now_pair() -> (NaiveDateTime, chrono::DateTime<chrono::Utc>) {
    (truncate_to_minute(chrono::Local::now().naive_local()), chrono::Utc::now())
}

/// Знімок статусів: stream_id → session_id для активних станів
/// (recording / connecting / reconnecting).
async fn active_statuses(state: &AppState) -> HashMap<String, u64> {
    let mgr = state.stream_manager.read().await;
    mgr.get_all_statuses()
        .into_iter()
        .filter(|s| crate::recording_control::is_active(&s.state))
        .map(|s| (s.stream_id, s.session_id))
        .collect()
}

pub async fn run_tick(app: &AppHandle) {
    let state = app.state::<AppState>();
    let (schedules, pad_before, pad_after) = {
        let p = state.active_profile.read().await;
        (
            p.scheduled_recordings.clone(),
            p.recording.schedule_pad_before_min,
            p.recording.schedule_pad_after_min,
        )
    };
    let statuses = active_statuses(&state).await;
    let (now_local, now_utc) = now_pair();

    let actions = {
        let ctx = TickCtx {
            now_local,
            now_utc,
            schedules: &schedules,
            statuses: &statuses,
            pad_before_min: pad_before,
            pad_after_min: pad_after,
        };
        state.scheduler.core.lock().await.tick(&ctx, &local_resolver)
    };

    let mut fixes = Vec::new();
    for action in actions {
        match action {
            TickAction::Fix(f) => fixes.push(f),
            TickAction::StopRecording { stream_id } => {
                log::info!("Scheduler: stopping '{stream_id}' (window end)");
                let _ = state.stream_manager.write().await.stop_recording(&stream_id);
            }
            TickAction::StartRecording { key, stream_id, window_end_utc, late } => {
                let started = try_start(app, &stream_id).await;
                let mut core = state.scheduler.core.lock().await;
                match started {
                    Ok(session_id) => {
                        core.confirm_start(
                            key.clone(), stream_id.clone(), session_id,
                            window_end_utc, late, now_utc,
                        );
                        drop(core);
                        let name = schedules.iter()
                            .find(|s| s.id == key.0)
                            .map(|s| s.name.clone())
                            .unwrap_or_default();
                        log::info!("Scheduler: started '{stream_id}' for schedule '{}' (late: {late})", key.0);
                        let started_body = crate::tray::notify::scheduled_started_body(&name);
                        app.emit("scheduled-started", ScheduledStartedPayload {
                            recording_id: key.0.clone(),
                            stream_id,
                            name,
                        }).ok();
                        crate::tray::notify::notify_scheduled(app, started_body);
                    }
                    Err(e) => {
                        // §3.2: нічого не фіксуємо — наступний тік повторить
                        core.start_failed(&key);
                        log::warn!("Scheduler: start failed for schedule '{}': {e} (retry next tick)", key.0);
                    }
                }
            }
        }
    }
    apply_fixations(app, fixes).await;
}

/// Той самий шлях, що й ручний старт (§3.2): check_disk_space НЕ обходиться.
async fn try_start(app: &AppHandle, stream_id: &str) -> Result<u64, String> {
    let state = app.state::<AppState>();
    crate::commands::stream_commands::check_disk_space(&state)
        .await
        .map_err(|e| e.to_string())?;
    let (stream, settings) = {
        let p = state.active_profile.read().await;
        let stream = p.streams.iter().find(|s| s.id == stream_id).cloned()
            .ok_or_else(|| format!("Stream '{stream_id}' not found in active profile"))?;
        (stream, p.recording.clone())
    };
    let mgr_arc = state.stream_manager.clone();
    let mut mgr = mgr_arc.write().await;
    mgr.start_recording(stream, settings, mgr_arc.clone()).map_err(|e| e.to_string())
}

/// Кожна фіксація оновлює last_result і персистить профіль (§3.2 крок 5);
/// save один на пакет. Події — після save. Розклад міг зникнути між тіком
/// і фіксацією (delete) — такі пропускаються мовчки.
pub async fn apply_fixations(app: &AppHandle, fixes: Vec<Fixation>) {
    if fixes.is_empty() {
        return;
    }
    let state = app.state::<AppState>();
    let snapshot = {
        let mut profile = state.active_profile.write().await;
        for f in &fixes {
            if let Some(s) = profile.scheduled_recordings.iter_mut().find(|s| s.id == f.schedule_id) {
                s.last_result = Some(f.result.clone());
                if f.disable_schedule {
                    s.enabled = false;
                }
            }
        }
        profile.clone()
    };
    match tokio::task::spawn_blocking(move || snapshot.save()).await {
        Ok(Ok(())) => {}
        Ok(Err(e)) => log::error!("Scheduler: failed to save profile after fixation: {e}"),
        Err(e) => log::error!("Scheduler: profile save task panicked: {e}"),
    }
    for f in &fixes {
        emit_result(app, f);
    }
}

// --- Події §4: розширені payload, live region озвучує без рефетчу ---

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScheduledStartedPayload {
    recording_id: String,
    stream_id: String,
    name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScheduledCompletedPayload {
    recording_id: String,
    stream_id: String,
    name: String,
    status: ScheduleResultStatus, // completed | startedLate | stoppedByUser
    recorded_minutes: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScheduledMissedPayload {
    recording_id: String,
    stream_id: String,
    name: String,
    reason: Option<ScheduleResultReason>, // код — локалізує frontend (§5.6)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScheduledSkippedPayload {
    recording_id: String,
    stream_id: String,
    name: String,
}

/// scheduled-completed емітиться і при StoppedByUser (§4) — інакше панель
/// не оновить результат; frontend для StoppedByUser не озвучує (Фаза 3).
fn emit_result(app: &AppHandle, f: &Fixation) {
    match f.result.status {
        ScheduleResultStatus::Completed | ScheduleResultStatus::StartedLate => {
            app.emit("scheduled-completed", ScheduledCompletedPayload {
                recording_id: f.schedule_id.clone(),
                stream_id: f.stream_id.clone(),
                name: f.schedule_name.clone(),
                status: f.result.status.clone(),
                recorded_minutes: f.result.recorded_minutes,
            }).ok();
            crate::tray::notify::notify_scheduled(
                app,
                crate::tray::notify::scheduled_completed_body(
                    &f.schedule_name,
                    f.result.recorded_minutes,
                ),
            );
        }
        ScheduleResultStatus::StoppedByUser => {
            // §4: подія потрібна для оновлення панелі; без balloon і announce —
            // ручну зупинку вже озвучує recording-флоу.
            app.emit("scheduled-completed", ScheduledCompletedPayload {
                recording_id: f.schedule_id.clone(),
                stream_id: f.stream_id.clone(),
                name: f.schedule_name.clone(),
                status: f.result.status.clone(),
                recorded_minutes: f.result.recorded_minutes,
            }).ok();
        }
        ScheduleResultStatus::Missed => {
            // §3.2 крок 3: запис у лог
            log::warn!("Scheduler: missed '{}' ({:?})", f.schedule_name, f.result.reason);
            app.emit("scheduled-missed", ScheduledMissedPayload {
                recording_id: f.schedule_id.clone(),
                stream_id: f.stream_id.clone(),
                name: f.schedule_name.clone(),
                reason: f.result.reason.clone(),
            }).ok();
            crate::tray::notify::notify_scheduled(
                app,
                crate::tray::notify::scheduled_missed_body(
                    &f.schedule_name,
                    f.result.reason.as_ref(),
                ),
            );
        }
        ScheduleResultStatus::SkippedAlreadyRecording => {
            app.emit("scheduled-skipped", ScheduledSkippedPayload {
                recording_id: f.schedule_id.clone(),
                stream_id: f.stream_id.clone(),
                name: f.schedule_name.clone(),
            }).ok();
            crate::tray::notify::notify_scheduled(
                app,
                crate::tray::notify::scheduled_skipped_body(&f.schedule_name),
            );
        }
    }
}

// --- Хуки для команд (Tasks 7–9) ---

/// §3.3: спільний хук ручної зупинки. Викликати ПІСЛЯ зчитування session_id
/// (до cancel) і самої зупинки.
pub async fn notify_manual_stop(app: &AppHandle, stream_id: &str, session_id: u64) {
    let state = app.state::<AppState>();
    let schedules = state.active_profile.read().await.scheduled_recordings.clone();
    let (now_local, now_utc) = now_pair();
    let fix = state.scheduler.core.lock().await
        .on_manual_stop(stream_id, session_id, &schedules, now_local, now_utc);
    if let Some(f) = fix {
        log::info!("Scheduler: scheduled recording '{}' stopped by user", f.schedule_name);
        apply_fixations(app, vec![f]).await;
    }
}

/// §3.5: редагування суттєвих полів / toggle-off розкладу під час запису.
pub async fn notify_schedule_changed(app: &AppHandle, schedule: &ScheduledRecording) {
    let state = app.state::<AppState>();
    let statuses = active_statuses(&state).await;
    let (now_local, now_utc) = now_pair();
    let hit = state.scheduler.core.lock().await
        .on_schedule_changed(schedule, &statuses, now_local, now_utc);
    if let Some((stream_id, f)) = hit {
        log::info!("Scheduler: stopping '{stream_id}' (schedule '{}' edited)", schedule.id);
        let _ = state.stream_manager.write().await.stop_recording(&stream_id);
        apply_fixations(app, vec![f]).await;
    }
}

/// §3.5: видалення розкладу під час запису — просто зупинка.
pub async fn notify_schedule_deleted(app: &AppHandle, schedule_id: &str) {
    let state = app.state::<AppState>();
    let statuses = active_statuses(&state).await;
    let stop = state.scheduler.core.lock().await.on_schedule_deleted(schedule_id, &statuses);
    if let Some(stream_id) = stop {
        log::info!("Scheduler: stopping '{stream_id}' (schedule '{schedule_id}' deleted)");
        let _ = state.stream_manager.write().await.stop_recording(&stream_id);
    }
}

/// §3.5: переключення профілю. Викликати ДО stop_all_async і ДО збереження
/// старого профілю — фіксації ProfileSwitch пишуться саме в нього.
pub async fn on_profile_switch(app: &AppHandle) {
    let state = app.state::<AppState>();
    let schedules = state.active_profile.read().await.scheduled_recordings.clone();
    let statuses = active_statuses(&state).await;
    let (now_local, now_utc) = now_pair();
    let fixes = {
        let mut core = state.scheduler.core.lock().await;
        let fixes = core.drain_all(
            ScheduleResultReason::ProfileSwitch, &schedules, &statuses, now_local, now_utc,
        );
        core.reset(); // ledger/спроби — стан старого профілю
        fixes
    };
    apply_fixations(app, fixes).await;
}

/// §3.5: graceful shutdown. Викликати ДО stop_all (статуси ще живі).
/// Зупиняє тік-задачу і фіксує StoppedByUser(AppClosing).
pub async fn on_app_closing(app: &AppHandle) {
    let state = app.state::<AppState>();
    state.scheduler.cancel.cancel();
    let schedules = state.active_profile.read().await.scheduled_recordings.clone();
    let statuses = active_statuses(&state).await;
    let (now_local, now_utc) = now_pair();
    let fixes = state.scheduler.core.lock().await.drain_all(
        ScheduleResultReason::AppClosing, &schedules, &statuses, now_local, now_utc,
    );
    apply_fixations(app, fixes).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ms_until_next_minute_mid_minute() {
        assert_eq!(ms_until_next_minute(60_000 * 100 + 15_250), 44_750);
    }

    #[test]
    fn ms_until_next_minute_on_boundary_waits_full_minute() {
        assert_eq!(ms_until_next_minute(60_000 * 100), 60_000);
    }

    #[test]
    fn truncate_drops_seconds() {
        let n = NaiveDateTime::parse_from_str("2026-06-12T20:00:59", "%Y-%m-%dT%H:%M:%S").unwrap();
        assert_eq!(
            truncate_to_minute(n),
            NaiveDateTime::parse_from_str("2026-06-12T20:00:00", "%Y-%m-%dT%H:%M:%S").unwrap()
        );
    }
}
