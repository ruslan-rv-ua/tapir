use std::sync::Arc;
use tokio::sync::RwLock;
use crate::settings::GlobalSettings;
use crate::profile::Profile;
use crate::stream::manager::StreamManager;

pub struct AppState {
    pub stream_manager: Arc<RwLock<StreamManager>>,
    pub settings: Arc<RwLock<GlobalSettings>>,
    pub active_profile: Arc<RwLock<Profile>>,
}

impl AppState {
    pub fn new(settings: GlobalSettings, profile: Profile, app_handle: tauri::AppHandle) -> Self {
        Self {
            stream_manager: Arc::new(RwLock::new(StreamManager::new(app_handle))),
            settings: Arc::new(RwLock::new(settings)),
            active_profile: Arc::new(RwLock::new(profile)),
        }
    }
}
