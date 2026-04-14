use crate::errors::RadioError;
use crate::portable;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

/// Strip UTF-8 BOM if present (Windows Notepad adds this).
pub fn strip_bom(s: &str) -> &str {
    s.strip_prefix('\u{FEFF}').unwrap_or(s)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSettings {
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_theme")]
    pub theme: Theme,
    #[serde(default = "default_active_profile")]
    pub active_profile: String,
    #[serde(default)]
    pub output_device: Option<String>,
    #[serde(default = "default_true")]
    pub minimize_to_tray: bool,
    #[serde(default = "default_true")]
    pub show_tray_notifications: bool,
    #[serde(default = "default_true")]
    pub show_track_in_title: bool,
    #[serde(default = "default_disk_space_threshold_gb")]
    pub disk_space_threshold_gb: u32,
    #[serde(default)]
    pub double_click_action: DoubleClickAction,
    #[serde(default)]
    pub bandwidth_limit_kbps: u32,
    #[serde(default)]
    pub autostart: bool,
    #[serde(default)]
    pub hotkeys: HotkeyMap,
    #[serde(default = "default_true")]
    pub log_rotation: bool,
    #[serde(default = "default_log_max_size_mb")]
    pub log_max_size_mb: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    Auto,
    Dark,
    Light,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum DoubleClickAction {
    #[default]
    Record,
    Play,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyMap {
    pub toggle_recording: String,
    pub toggle_playback: String,
    pub volume_up: String,
    pub volume_down: String,
    pub toggle_window: String,
}

impl Default for HotkeyMap {
    fn default() -> Self {
        Self {
            toggle_recording: "Ctrl+Shift+R".to_string(),
            toggle_playback: "Ctrl+Shift+P".to_string(),
            volume_up: "Ctrl+Shift+Up".to_string(),
            volume_down: "Ctrl+Shift+Down".to_string(),
            toggle_window: "Ctrl+Shift+H".to_string(),
        }
    }
}

fn default_language() -> String {
    sys_locale::get_locale()
        .filter(|l| l.starts_with("uk"))
        .map(|_| "uk-UA".to_string())
        .unwrap_or_else(|| "en-US".to_string())
}
fn default_theme() -> Theme { Theme::Auto }
fn default_active_profile() -> String { "Default".to_string() }
fn default_true() -> bool { true }
fn default_disk_space_threshold_gb() -> u32 { 1 }
fn default_log_max_size_mb() -> u32 { 10 }

impl Default for GlobalSettings {
    fn default() -> Self {
        Self {
            language: default_language(),
            theme: Theme::Auto,
            active_profile: "Default".to_string(),
            output_device: None,
            minimize_to_tray: true,
            show_tray_notifications: true,
            show_track_in_title: true,
            disk_space_threshold_gb: 1,
            double_click_action: DoubleClickAction::Record,
            bandwidth_limit_kbps: 0,
            autostart: false,
            hotkeys: HotkeyMap::default(),
            log_rotation: true,
            log_max_size_mb: 10,
        }
    }
}

impl GlobalSettings {
    pub fn load() -> Result<Self, RadioError> {
        let path = portable::settings_path();
        if !path.exists() {
            let settings = Self::default();
            settings.save()?;
            info!("Created default settings at {}", path.display());
            return Ok(settings);
        }
        let content = std::fs::read_to_string(&path)?;
        let content = strip_bom(&content);
        match serde_json::from_str(content) {
            Ok(settings) => Ok(settings),
            Err(e) => {
                warn!("Settings parse error ({}), using defaults", e);
                Ok(Self::default())
            }
        }
    }

    pub fn save(&self) -> Result<(), RadioError> {
        let path = portable::settings_path();
        let tmp_path = path.with_extension("json.tmp");
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(&tmp_path, &json)?;
        std::fs::rename(&tmp_path, &path)?;
        Ok(())
    }
}
