use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::RwLock;
use crate::settings::GlobalSettings;
use crate::profile::Profile;
use crate::stream::manager::{StreamManager, StreamState, StreamStatus};
use crate::player::engine::PlayerEngine;
use crate::browser::api::RadioBrowserClient;
use crate::wake_lock::WakeLock;

pub struct AppState {
    pub stream_manager: Arc<RwLock<StreamManager>>,
    pub settings: Arc<RwLock<GlobalSettings>>,
    pub active_profile: Arc<RwLock<Profile>>,
    // PlayerEngine is internally synchronized via Arc<Mutex<>> fields — no outer RwLock needed.
    pub player: Arc<PlayerEngine>,
    pub browser_client: Arc<tokio::sync::OnceCell<RadioBrowserClient>>,
    pub scheduler: Arc<crate::scheduler::timer::SchedulerShared>,
}

impl AppState {
    pub fn new(
        settings: GlobalSettings,
        profile: Profile,
        app_handle: tauri::AppHandle,
    ) -> anyhow::Result<Self> {
        let wake_lock = Arc::new(WakeLock::new());
        let player = PlayerEngine::new(
            profile.player_session.volume,
            settings.output_device.clone(),
            wake_lock.clone(),
        )?;
        let browser_client = Arc::new(tokio::sync::OnceCell::new());
        Ok(Self {
            stream_manager: Arc::new(RwLock::new(StreamManager::new(app_handle, wake_lock))),
            settings: Arc::new(RwLock::new(settings)),
            active_profile: Arc::new(RwLock::new(profile)),
            player: Arc::new(player),
            browser_client,
            scheduler: crate::scheduler::timer::SchedulerShared::new(),
        })
    }
}

/// Stop all recordings, save active URLs, stop player, save volume,
/// then briefly wait for in-flight tasks. Used by close-button shutdown
/// (when minimize_to_tray is false) and by tray "Quit".
pub async fn graceful_shutdown(app: &AppHandle) {
    let state = app.state::<AppState>();

    // Статуси і scheduler-owned пари — ДО stop_all (§3.5): після скасування
    // записи зникають із manager асинхронно, фільтрувати було б ні по чому.
    let statuses = state.stream_manager.read().await.get_all_statuses();
    let scheduler_owned = state.scheduler.core.lock().await.owned_sessions();

    // Зупинити тік-задачу і зафіксувати StoppedByUser(AppClosing) для своїх
    // записів (пише last_result + save + подія scheduled-completed).
    crate::scheduler::timer::on_app_closing(app).await;

    state.stream_manager.write().await.stop_all();

    // active_recording_urls — лише ручні записи: відновлення планових
    // після рестарту — виключно через catch-up (§3.5).
    let urls = {
        let profile = state.active_profile.read().await;
        manual_resume_urls(&statuses, &scheduler_owned, &profile.streams)
    };

    let mut profile = state.active_profile.write().await;
    profile.active_recording_urls = urls;
    if let Err(e) = profile.save() {
        log::error!("Failed to save profile on shutdown: {e}");
    }
    drop(profile);

    state.player.stop_session_public().await;
    let volume = state.player.current_volume().await;
    let mut profile = state.active_profile.write().await;
    profile.player_session.volume = volume;
    if let Err(e) = profile.save() {
        log::error!("Failed to save profile volume on shutdown: {e}");
    }
    drop(profile);

    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
}

/// Чиста (§3.5): URL-и активних НЕпланових записів для відновлення після
/// рестарту. Scheduler-owned визначається парою (stream_id, session_id) —
/// сам stream_id недостатній: потік міг перейти до ручного запису.
pub fn manual_resume_urls(
    statuses: &[StreamStatus],
    scheduler_owned: &[(String, u64)],
    streams: &[crate::profile::StreamInfo],
) -> Vec<String> {
    statuses
        .iter()
        .filter(|s| !matches!(s.state, StreamState::Idle | StreamState::Error))
        .filter(|s| {
            !scheduler_owned
                .iter()
                .any(|(id, sid)| *id == s.stream_id && *sid == s.session_id)
        })
        .filter_map(|s| streams.iter().find(|st| st.id == s.stream_id).map(|st| st.url.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::StreamInfo;
    use crate::stream::manager::StreamStatus;

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
    fn scheduler_owned_recordings_are_excluded_from_resume() {
        // §3.5: планові записи не потрапляють в active_recording_urls —
        // інакше після рестарту вони стали б «нічийними» і не зупинились би
        let statuses = [
            status("manual", StreamState::Recording, 1),
            status("planned", StreamState::Recording, 2),
        ];
        let owned = [("planned".to_string(), 2u64)];
        let streams = [stream("manual", "http://m"), stream("planned", "http://p")];
        assert_eq!(manual_resume_urls(&statuses, &owned, &streams), vec!["http://m".to_string()]);
    }

    #[test]
    fn same_stream_with_other_session_is_manual() {
        // Пара (stream_id, session_id): якщо плановий запис обірвався і потік
        // зайняв ручний запис (інший session) — він має відновитися
        let statuses = [status("st1", StreamState::Recording, 5)];
        let owned = [("st1".to_string(), 2u64)]; // застаріла пара scheduler-а
        let streams = [stream("st1", "http://x")];
        assert_eq!(manual_resume_urls(&statuses, &owned, &streams), vec!["http://x".to_string()]);
    }

    #[test]
    fn idle_and_error_states_are_not_resumed() {
        let statuses = [
            status("a", StreamState::Idle, 1),
            status("b", StreamState::Error, 2),
            status("c", StreamState::Connecting, 3),
            status("d", StreamState::Reconnecting, 4),
        ];
        let streams = [stream("a", "ua"), stream("b", "ub"), stream("c", "uc"), stream("d", "ud")];
        assert_eq!(manual_resume_urls(&statuses, &[], &streams), vec!["uc".to_string(), "ud".to_string()]);
    }

    #[test]
    fn unknown_stream_id_is_skipped() {
        // Статус без відповідного StreamInfo (потік видалили) — без URL
        let statuses = [status("ghost", StreamState::Recording, 1)];
        assert!(manual_resume_urls(&statuses, &[], &[]).is_empty());
    }
}
