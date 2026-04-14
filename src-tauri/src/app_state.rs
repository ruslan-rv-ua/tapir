use std::sync::Arc;
use tokio::sync::RwLock;
use crate::settings::GlobalSettings;
use crate::profile::Profile;

pub struct AppState {
    pub settings: Arc<RwLock<GlobalSettings>>,
    pub active_profile: Arc<RwLock<Profile>>,
    // stream_manager added in Task 10
    // player and scheduler are absent in Phase 1 — they will be added as fields
    // directly in later phases (no no-op stubs needed; AppState is internal, not
    // an external API, so adding fields is a non-breaking change).
}

impl AppState {
    pub fn new(settings: GlobalSettings, profile: Profile) -> Self {
        Self {
            settings: Arc::new(RwLock::new(settings)),
            active_profile: Arc::new(RwLock::new(profile)),
        }
    }
}
