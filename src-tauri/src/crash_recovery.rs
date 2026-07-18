//! Phase 3K Crash Recovery: сесійний стан `data/state.json` — прапор
//! `clean_shutdown` + живий снапшот активних ручних записів. Єдине джерело
//! правди для resume після аварії (spec: docs/backlog/p1-crash-recovery.md).

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

use crate::app_state::AppState;
use crate::profile::StreamInfo;
use crate::stream::manager::StreamStatus;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveRecording {
    pub stream_id: String,
    /// Діагностика (логи / читабельність state.json). У матчингу на resume
    /// участі НЕ бере — ключ лише `stream_id` (спека, «Прийняті рішення»).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub clean_shutdown: bool,
    #[serde(default)]
    pub active_recordings: Vec<ActiveRecording>,
}

impl Default for SessionState {
    /// Відсутній/битий файл = аварія з порожнім снапшотом: resume — no-op,
    /// анонс мовчить (спека, «Механіка виявлення збою»).
    fn default() -> Self {
        Self { clean_shutdown: false, active_recordings: vec![] }
    }
}

impl SessionState {
    pub fn load() -> Self {
        Self::load_from(&crate::portable::state_path())
    }

    pub fn load_from(path: &Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_else(|e| {
                log::warn!("state.json: cannot parse ({e}) — treating as crash with empty snapshot");
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self) -> Result<(), std::io::Error> {
        self.save_to(&crate::portable::state_path())
    }

    /// Атомарний запис (temp → rename) — той самий підхід, що `Profile::save`.
    pub fn save_to(&self, path: &Path) -> Result<(), std::io::Error> {
        let tmp = path.with_extension("json.tmp");
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(&tmp, &json)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }
}

/// Safety net писаря: спека вимагає ≤ 30 с.
const SNAPSHOT_INTERVAL: Duration = Duration::from_secs(30);
/// Легкий debounce: серія переходів (start_all / stop_all) → один запис.
const SNAPSHOT_DEBOUNCE: Duration = Duration::from_millis(500);

/// Снапшот-писар (за зразком `SchedulerShared`): notify на зміну складу
/// записів + interval як safety net; cancel — із graceful_shutdown.
pub struct SnapshotShared {
    pub notify: tokio::sync::Notify,
    pub cancel: CancellationToken,
}

impl SnapshotShared {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            notify: tokio::sync::Notify::new(),
            cancel: CancellationToken::new(),
        })
    }
}

/// Чиста: вміст живого снапшота — активні ручні записи. `url` — діагностика
/// (може бути відсутнім, якщо StreamInfo уже видалено з профілю).
pub fn build_snapshot(
    statuses: &[StreamStatus],
    scheduler_owned: &[(String, u64)],
    streams: &[StreamInfo],
) -> Vec<ActiveRecording> {
    crate::app_state::manual_resume_stream_ids(statuses, scheduler_owned)
        .into_iter()
        .map(|stream_id| {
            let url = streams.iter().find(|st| st.id == stream_id).map(|st| st.url.clone());
            ActiveRecording { stream_id, url }
        })
        .collect()
}

/// Кожен старт: маркер «сеанс у польоті» (clean_shutdown=false, снапшот
/// порожній — записи ще не стартували).
pub fn mark_session_start() {
    let s = SessionState { clean_shutdown: false, active_recordings: vec![] };
    if let Err(e) = s.save() {
        log::warn!("crash-recovery: failed to mark session start: {e}");
    }
}

/// Чистий вихід. Викликати ЛИШЕ після cancel писаря — інакше його
/// відкладений запис перетре true → спурйозний resume наступного старту.
pub fn mark_clean_shutdown() {
    let s = SessionState { clean_shutdown: true, active_recordings: vec![] };
    if let Err(e) = s.save() {
        log::error!("crash-recovery: failed to mark clean shutdown: {e}");
    }
}

/// Spawn у setup-хуку (НЕ frontend_ready: писар не емітить UI-подій — гейт
/// webview йому не потрібен; спека, «Хто пише снапшот»).
pub fn spawn_snapshot_writer(app: AppHandle) {
    let shared = app.state::<AppState>().snapshot.clone();
    tauri::async_runtime::spawn(async move {
        log::info!("Crash-recovery snapshot writer started");
        loop {
            tokio::select! {
                _ = shared.cancel.cancelled() => break,
                _ = shared.notify.notified() => {
                    tokio::time::sleep(SNAPSHOT_DEBOUNCE).await;
                }
                _ = tokio::time::sleep(SNAPSHOT_INTERVAL) => {}
            }
            // Після cancel (у т.ч. під час debounce-сну) НЕ писати — див.
            // mark_clean_shutdown.
            if shared.cancel.is_cancelled() {
                break;
            }
            write_snapshot(&app).await;
        }
        log::info!("Crash-recovery snapshot writer stopped");
    });
}

/// Підсумок «N з M» — payload події `crash-resume`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeSummary {
    pub resumed: usize,
    pub total: usize,
}

/// One-shot deferred-анонс resume — той самий гейт, що StartupPlan /
/// StartupNotice: setup стешить, frontend_ready дренує й емітує (емісія до
/// підписки webview = втрачене озвучення).
pub struct ResumeNotice(std::sync::Mutex<Option<ResumeSummary>>);

impl ResumeNotice {
    pub fn new(summary: ResumeSummary) -> Self {
        Self(std::sync::Mutex::new(Some(summary)))
    }
    pub fn take(&self) -> Option<ResumeSummary> {
        self.0.lock().unwrap().take()
    }
}

/// Виявлений збій: тихий авто-resume записів зі снапшота. Незіставлений
/// stream_id (потік видалили) чи невдалий старт — промах у «N з M».
/// Часткові файли попереднього сеансу не чіпаємо (спека: MP3/AAC — кадровий
/// потік, фіналізація не обов'язкова).
pub async fn resume_recordings(app: &AppHandle, prev: &SessionState) -> ResumeSummary {
    let state = app.state::<AppState>();
    let total = prev.active_recordings.len();
    let mut resumed = 0usize;
    for rec in &prev.active_recordings {
        let stream = {
            let profile = state.active_profile.read().await;
            profile.streams.iter().find(|st| st.id == rec.stream_id).cloned()
        };
        let Some(stream) = stream else {
            log::warn!(
                "crash-recovery: stream '{}' (url {:?}) not in active profile — not resumed",
                rec.stream_id, rec.url
            );
            continue;
        };
        match try_start(&state, stream).await {
            Ok(()) => resumed += 1,
            Err(e) => log::warn!("crash-recovery: failed to resume '{}': {e}", rec.stream_id),
        }
    }
    log::info!("crash-recovery: resumed {resumed} of {total} recordings after crash");
    ResumeSummary { resumed, total }
}

/// Той самий шлях, що ручний/плановий старт (scheduler::timer::try_start):
/// check_disk_space НЕ обходиться.
async fn try_start(
    state: &tauri::State<'_, AppState>,
    stream: StreamInfo,
) -> Result<(), String> {
    crate::commands::stream_commands::check_disk_space(state)
        .await
        .map_err(|e| e.to_string())?;
    let settings = state.active_profile.read().await.recording.clone();
    let mgr_arc = state.stream_manager.clone();
    let mut mgr = mgr_arc.write().await;
    mgr.start_recording(stream, settings, mgr_arc.clone())
        .map(|_| ())
        .map_err(|e| e.to_string())
}

async fn write_snapshot(app: &AppHandle) {
    let state = app.state::<AppState>();
    let statuses = state.stream_manager.read().await.get_all_statuses();
    let scheduler_owned = state.scheduler.core.lock().await.owned_sessions();
    let streams = state.active_profile.read().await.streams.clone();
    let snapshot = SessionState {
        clean_shutdown: false,
        active_recordings: build_snapshot(&statuses, &scheduler_owned, &streams),
    };
    if let Err(e) = snapshot.save() {
        log::warn!("crash-recovery: failed to write snapshot: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stream::manager::StreamState;

    fn status(stream_id: &str, state: StreamState, session_id: u64) -> StreamStatus {
        StreamStatus {
            stream_id: stream_id.into(),
            state,
            current_track: None,
            recording_started_at: None,
            bytes_recorded: 0,
            tracks_recorded: 0,
            error: None,
            reconnect_attempt: None,
            session_id,
        }
    }

    fn stream(id: &str, url: &str) -> StreamInfo {
        StreamInfo {
            id: id.into(), url: url.into(), name: id.into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
            icy_url: None, ignorelist: vec![], username: None, password: None,
            added_at: "2026-01-01".into(),
        }
    }

    #[test]
    fn build_snapshot_maps_manual_ids_with_diagnostic_url() {
        let statuses = [
            status("manual", StreamState::Recording, 1),
            status("planned", StreamState::Recording, 2),
        ];
        let owned = [("planned".to_string(), 2u64)];
        let streams = [stream("manual", "http://m"), stream("planned", "http://p")];
        assert_eq!(
            build_snapshot(&statuses, &owned, &streams),
            vec![ActiveRecording { stream_id: "manual".into(), url: Some("http://m".into()) }]
        );
    }

    #[test]
    fn build_snapshot_keeps_id_when_stream_info_missing() {
        // url — лише діагностика: без StreamInfo id все одно у снапшоті
        let statuses = [status("ghost", StreamState::Recording, 1)];
        assert_eq!(
            build_snapshot(&statuses, &[], &[]),
            vec![ActiveRecording { stream_id: "ghost".into(), url: None }]
        );
    }

    fn sample() -> SessionState {
        SessionState {
            clean_shutdown: false,
            active_recordings: vec![
                ActiveRecording { stream_id: "st-abc".into(), url: Some("https://radio.example/a".into()) },
                ActiveRecording { stream_id: "st-def".into(), url: None },
            ],
        }
    }

    #[test]
    fn roundtrip_save_load() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("state.json");
        let state = sample();
        state.save_to(&path).unwrap();
        assert_eq!(SessionState::load_from(&path), state);
    }

    #[test]
    fn missing_file_is_crash_with_empty_snapshot() {
        // Спека («Механіка виявлення»): відсутній файл = аварія, але снапшот
        // порожній → resume нічого не робить, анонс мовчить.
        let tmp = tempfile::tempdir().unwrap();
        let loaded = SessionState::load_from(&tmp.path().join("nope.json"));
        assert!(!loaded.clean_shutdown);
        assert!(loaded.active_recordings.is_empty());
    }

    #[test]
    fn corrupt_file_is_crash_with_empty_snapshot() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("state.json");
        std::fs::write(&path, "{not json").unwrap();
        assert_eq!(SessionState::load_from(&path), SessionState::default());
    }

    #[test]
    fn save_is_atomic_no_tmp_left_behind() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("state.json");
        sample().save_to(&path).unwrap();
        assert!(path.exists());
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn resume_notice_take_is_one_shot() {
        // Reload-safe: повторний frontend_ready не повинен анонсувати вдруге
        let n = ResumeNotice::new(ResumeSummary { resumed: 2, total: 3 });
        assert_eq!(n.take(), Some(ResumeSummary { resumed: 2, total: 3 }));
        assert_eq!(n.take(), None);
    }
}
