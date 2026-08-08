use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::RwLock;
use crate::settings::GlobalSettings;
use crate::profile::Profile;
use crate::profile_store::FileProfileStore;
use crate::settings_store::FileSettingsStore;
use crate::store::{Commit, Writer};
use crate::errors::RadioError;
use crate::stream::manager::{StreamManager, StreamState, StreamStatus};
use crate::player::engine::PlayerEngine;
use crate::browser::api::RadioBrowserClient;
use crate::wake_lock::WakeLock;

pub struct AppState {
    pub stream_manager: Arc<RwLock<StreamManager>>,
    pub settings: Arc<RwLock<GlobalSettings>>,
    pub active_profile: Arc<RwLock<Profile>>,
    /// Єдиний шлях запису активного профілю — див. [`AppState::commit_profile`].
    profile_writer: Arc<Writer<Profile>>,
    /// Те саме для глобальних налаштувань — див. [`AppState::commit_settings`].
    settings_writer: Arc<Writer<GlobalSettings>>,
    // PlayerEngine is internally synchronized via Arc<Mutex<>> fields — no outer RwLock needed.
    pub player: Arc<PlayerEngine>,
    pub browser_client: Arc<tokio::sync::OnceCell<RadioBrowserClient>>,
    pub scheduler: Arc<crate::scheduler::timer::SchedulerShared>,
    pub snapshot: Arc<crate::crash_recovery::SnapshotShared>,
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
            profile_writer: Arc::new(Writer::new(Arc::new(FileProfileStore))),
            settings_writer: Arc::new(Writer::new(Arc::new(FileSettingsStore))),
            player: Arc::new(player),
            browser_client,
            scheduler: crate::scheduler::timer::SchedulerShared::new(),
            snapshot: crate::crash_recovery::SnapshotShared::new(),
        })
    }

    /// Змінити активний профіль і записати його — єдиний спосіб це зробити.
    ///
    /// Замикання синхронне й повертає [`Commit::Save`] або [`Commit::Skip`];
    /// впорядкованість записів і роботу зі сховищем тримає
    /// [`Writer`](crate::store::Writer).
    ///
    /// ```ignore
    /// let entry = state.commit_profile(|p| {
    ///     if p.wishlist.iter().any(|e| e.pattern == pattern) {
    ///         return Commit::Skip(existing);
    ///     }
    ///     p.wishlist.push(entry.clone());
    ///     Commit::Save(entry)
    /// }).await?;
    /// ```
    pub async fn commit_profile<T, F>(&self, mutate: F) -> Result<T, RadioError>
    where
        F: FnOnce(&mut Profile) -> Commit<T> + Send,
        T: Send,
    {
        self.profile_writer.commit(&self.active_profile, mutate).await
    }

    /// Змінити глобальні налаштування і записати їх — єдиний спосіб це зробити
    /// після старту застосунку (до `AppState` — `settings_store::save_detached`).
    ///
    /// Дзеркало [`AppState::commit_profile`], з тими самими правилами:
    /// синхронне замикання, помилка запису лишає пам'ять зміненою.
    pub async fn commit_settings<T, F>(&self, mutate: F) -> Result<T, RadioError>
    where
        F: FnOnce(&mut GlobalSettings) -> Commit<T> + Send,
        T: Send,
    {
        self.settings_writer.commit(&self.settings, mutate).await
    }
}

/// Stop all recordings, stop player, save volume/session, then briefly wait
/// for in-flight tasks. Used by close-button shutdown (when minimize_to_tray
/// is false) and by tray "Quit".
pub async fn graceful_shutdown(app: &AppHandle) {
    let state = app.state::<AppState>();

    // Phase 3K: зупинити снапшот-писаря ДО будь-яких зупинок — інакше «stopped»
    // переходи розбудять його і він перетре clean_shutdown=true нижче.
    state.snapshot.cancel.cancel();

    // Зупинити тік-задачу і зафіксувати StoppedByUser(AppClosing) для своїх
    // записів (пише last_result + save + подія scheduled-completed).
    crate::scheduler::timer::on_app_closing(app).await;

    state.stream_manager.write().await.stop_all();

    // Capture the resume snapshot BEFORE tearing the player down — stop loses
    // the source and position. Merge it with the volume into a single save
    // (impl-decision #3: avoid a third profile write / racing saves).
    let player_status = state.player.get_status().await;

    state.player.stop_session_public().await;
    let volume = state.player.current_volume().await;
    // `commit_profile` дочікується запису перед поверненням, тож окремого
    // «синхронного» шляху для виходу не потрібно.
    let committed = state
        .commit_profile(|profile| {
            profile.player_session.volume = volume;
            crate::playback_control::apply_session_snapshot(
                &mut profile.player_session,
                &player_status,
            );
            Commit::Save(())
        })
        .await;
    if let Err(e) = committed {
        log::error!("Failed to save profile session on shutdown: {e}");
    }

    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    // Phase 3K: писар скасований (вище) — цей запис останній.
    crate::crash_recovery::mark_clean_shutdown();
}

/// Чиста (§3.5, Phase 3K): stream_id-и активних НЕпланових записів — вміст
/// живого снапшота state.json. Scheduler-owned визначається парою
/// (stream_id, session_id) — сам stream_id недостатній: потік міг перейти до
/// ручного запису. Розв'язання id → StreamInfo (URL/credentials) — на боці
/// resume-споживача.
pub fn manual_resume_stream_ids(
    statuses: &[StreamStatus],
    scheduler_owned: &[(String, u64)],
) -> Vec<String> {
    statuses
        .iter()
        .filter(|s| !matches!(s.state, StreamState::Idle | StreamState::Error))
        .filter(|s| {
            !scheduler_owned
                .iter()
                .any(|(id, sid)| *id == s.stream_id && *sid == s.session_id)
        })
        .map(|s| s.stream_id.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
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

    #[test]
    fn scheduler_owned_recordings_are_excluded_from_resume() {
        // §3.5: планові записи не потрапляють у снапшот — їх catch-up
        // лежить у ScheduleManager, а не в crash-resume
        let statuses = [
            status("manual", StreamState::Recording, 1),
            status("planned", StreamState::Recording, 2),
        ];
        let owned = [("planned".to_string(), 2u64)];
        assert_eq!(manual_resume_stream_ids(&statuses, &owned), vec!["manual".to_string()]);
    }

    #[test]
    fn same_stream_with_other_session_is_manual() {
        // Пара (stream_id, session_id): якщо плановий запис обірвався і потік
        // зайняв ручний запис (інший session) — він має відновитися
        let statuses = [status("st1", StreamState::Recording, 5)];
        let owned = [("st1".to_string(), 2u64)]; // застаріла пара scheduler-а
        assert_eq!(manual_resume_stream_ids(&statuses, &owned), vec!["st1".to_string()]);
    }

    #[test]
    fn idle_and_error_states_are_not_resumed() {
        let statuses = [
            status("a", StreamState::Idle, 1),
            status("b", StreamState::Error, 2),
            status("c", StreamState::Connecting, 3),
            status("d", StreamState::Reconnecting, 4),
        ];
        assert_eq!(manual_resume_stream_ids(&statuses, &[]), vec!["c".to_string(), "d".to_string()]);
    }

    #[test]
    fn ids_are_returned_even_without_stream_info() {
        // Розв'язання id → StreamInfo — на resume: видалений потік лишається у
        // снапшоті і рахується промахом «N з M» (спека, «Resume-споживач»)
        let statuses = [status("ghost", StreamState::Recording, 1)];
        assert_eq!(manual_resume_stream_ids(&statuses, &[]), vec!["ghost".to_string()]);
    }
}
