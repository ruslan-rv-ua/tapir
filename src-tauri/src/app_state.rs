use std::sync::Arc;
use tokio::sync::RwLock;
use crate::settings::GlobalSettings;
use crate::profile::Profile;
use crate::stream::manager::StreamManager;
use crate::player::engine::PlayerEngine;

pub struct AppState {
    pub stream_manager: Arc<RwLock<StreamManager>>,
    pub settings: Arc<RwLock<GlobalSettings>>,
    pub active_profile: Arc<RwLock<Profile>>,
    // PlayerEngine is internally synchronized via Arc<Mutex<>> fields — no outer RwLock needed.
    pub player: Arc<PlayerEngine>,
}

impl AppState {
    pub fn new(
        settings: GlobalSettings,
        profile: Profile,
        app_handle: tauri::AppHandle,
    ) -> anyhow::Result<Self> {
        let player = PlayerEngine::new(
            profile.player_session.volume,
            settings.output_device.clone(),
        )?;
        Ok(Self {
            stream_manager: Arc::new(RwLock::new(StreamManager::new(app_handle))),
            settings: Arc::new(RwLock::new(settings)),
            active_profile: Arc::new(RwLock::new(profile)),
            player: Arc::new(player),
        })
    }
}
