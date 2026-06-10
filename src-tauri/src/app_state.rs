use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::RwLock;
use crate::settings::GlobalSettings;
use crate::profile::Profile;
use crate::stream::manager::{StreamManager, StreamState};
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
        })
    }
}

/// Stop all recordings, save active URLs, stop player, save volume,
/// then briefly wait for in-flight tasks. Used by close-button shutdown
/// (when minimize_to_tray is false) and by tray "Quit".
pub async fn graceful_shutdown(app: &AppHandle) {
    let state = app.state::<AppState>();

    let mut manager = state.stream_manager.write().await;
    manager.stop_all();
    let active_ids: Vec<String> = manager.get_all_statuses()
        .iter()
        .filter(|s| !matches!(s.state, StreamState::Idle | StreamState::Error))
        .map(|s| s.stream_id.clone())
        .collect();
    drop(manager);

    let profile_read = state.active_profile.read().await;
    let urls: Vec<String> = active_ids.iter()
        .filter_map(|id| profile_read.streams.iter()
            .find(|s| s.id == *id)
            .map(|s| s.url.clone()))
        .collect();
    drop(profile_read);

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
