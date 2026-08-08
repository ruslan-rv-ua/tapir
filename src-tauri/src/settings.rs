use crate::errors::RadioError;
use crate::portable;
use serde::{Deserialize, Serialize};
use log::info;

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
    pub show_track_in_title: bool,
    #[serde(default)]
    pub double_click_action: DoubleClickAction,
    #[serde(default)]
    pub bandwidth_limit_kbps: u32,
    #[serde(default)]
    pub autostart: bool,
    #[serde(default = "default_true")]
    pub autostart_minimized: bool,
    #[serde(default)]
    pub hotkeys: HotkeyMap,
    #[serde(default = "default_log_max_size_mb")]
    pub log_max_size_mb: u32,
    #[serde(default, deserialize_with = "deserialize_log_level")]
    pub log_level: LogLevel,
    #[serde(default)]
    pub prev_restart_threshold_ms: u32,
    #[serde(default = "default_volume_step_percent")]
    pub volume_step_percent: u8,
    #[serde(default = "default_true")]
    pub smtc_enabled: bool,
}

/// Deserialize `log_level` tolerantly: an unknown or legacy value (e.g. the
/// removed "trace") falls back to the default instead of failing the whole
/// settings load and panicking the app at startup.
fn deserialize_log_level<'de, D>(deserializer: D) -> Result<LogLevel, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let raw = Option::<String>::deserialize(deserializer)?;
    Ok(match raw.as_deref() {
        Some("error") => LogLevel::Error,
        Some("warn") => LogLevel::Warn,
        Some("info") => LogLevel::Info,
        Some("debug") => LogLevel::Debug,
        _ => LogLevel::default(),
    })
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Error,
    Warn,
    #[default]
    Info,
    Debug,
}

impl LogLevel {
    pub fn to_filter(self) -> log::LevelFilter {
        match self {
            LogLevel::Error => log::LevelFilter::Error,
            LogLevel::Warn => log::LevelFilter::Warn,
            LogLevel::Info => log::LevelFilter::Info,
            LogLevel::Debug => log::LevelFilter::Debug,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyMap {
    // Per-field defaults: an old settings.json whose `hotkeys` object predates
    // a field must still deserialize (missing field → default combo), without
    // discarding the user's other customized combos.
    #[serde(default = "default_hk_toggle_recording")]
    pub toggle_recording: String,
    #[serde(default = "default_hk_toggle_playback")]
    pub toggle_playback: String,
    #[serde(default = "default_hk_volume_up")]
    pub volume_up: String,
    #[serde(default = "default_hk_volume_down")]
    pub volume_down: String,
    #[serde(default = "default_hk_toggle_window")]
    pub toggle_window: String,
    #[serde(default = "default_hk_stop_all")]
    pub stop_all: String,
    #[serde(default = "default_hk_prev_track")]
    pub prev_track: String,
    #[serde(default = "default_hk_next_track")]
    pub next_track: String,
}

fn default_hk_toggle_recording() -> String { "Ctrl+Shift+R".to_string() }
fn default_hk_toggle_playback() -> String { "Ctrl+Shift+K".to_string() }
// Arrows live on Ctrl+Alt (like prev/next_track), never Ctrl+Shift: an
// OS-global grab of Ctrl+Shift+Up/Down would steal paragraph selection in
// every editor system-wide (docs/keyboard-shortcuts.md, Tier 1 notes).
fn default_hk_volume_up() -> String { "Ctrl+Alt+Up".to_string() }
fn default_hk_volume_down() -> String { "Ctrl+Alt+Down".to_string() }
fn default_hk_toggle_window() -> String { "Ctrl+Shift+H".to_string() }
fn default_hk_stop_all() -> String { "Ctrl+Shift+S".to_string() }
fn default_hk_prev_track() -> String { "Ctrl+Alt+Left".to_string() }
fn default_hk_next_track() -> String { "Ctrl+Alt+Right".to_string() }

impl Default for HotkeyMap {
    fn default() -> Self {
        Self {
            toggle_recording: default_hk_toggle_recording(),
            toggle_playback: default_hk_toggle_playback(),
            volume_up: default_hk_volume_up(),
            volume_down: default_hk_volume_down(),
            toggle_window: default_hk_toggle_window(),
            stop_all: default_hk_stop_all(),
            prev_track: default_hk_prev_track(),
            next_track: default_hk_next_track(),
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
fn default_log_max_size_mb() -> u32 { 10 }
fn default_volume_step_percent() -> u8 { 5 }

impl Default for GlobalSettings {
    fn default() -> Self {
        Self {
            language: default_language(),
            theme: Theme::Auto,
            active_profile: "Default".to_string(),
            output_device: None,
            minimize_to_tray: true,
            show_track_in_title: true,
            double_click_action: DoubleClickAction::Record,
            bandwidth_limit_kbps: 0,
            autostart: false,
            autostart_minimized: true,
            hotkeys: HotkeyMap::default(),
            log_max_size_mb: 10,
            log_level: LogLevel::Info,
            prev_restart_threshold_ms: 0,
            volume_step_percent: 5,
            smtc_enabled: true,
        }
    }
}

impl GlobalSettings {
    pub fn load() -> Result<Self, RadioError> {
        let path = portable::settings_path();
        if !path.exists() {
            let settings = Self::default();
            crate::settings_store::save_detached(&settings)?;
            info!("Created default settings at {}", path.display());
            return Ok(settings);
        }
        let content = std::fs::read_to_string(&path)?;
        let content = strip_bom(&content);
        let settings: Self = serde_json::from_str(content)?;
        Ok(settings)
    }

}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_level_default_is_info() {
        assert_eq!(LogLevel::default(), LogLevel::Info);
    }

    #[test]
    fn log_level_to_filter_maps_each_variant() {
        assert_eq!(LogLevel::Error.to_filter(), log::LevelFilter::Error);
        assert_eq!(LogLevel::Warn.to_filter(), log::LevelFilter::Warn);
        assert_eq!(LogLevel::Info.to_filter(), log::LevelFilter::Info);
        assert_eq!(LogLevel::Debug.to_filter(), log::LevelFilter::Debug);
    }

    #[test]
    fn settings_without_log_level_defaults_to_info() {
        // An existing settings.json that predates this field must still load.
        let json = r#"{ "language": "en-US", "theme": "auto", "activeProfile": "Default" }"#;
        let settings: GlobalSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.log_level, LogLevel::Info);
    }

    #[test]
    fn log_level_unknown_value_falls_back_to_default() {
        // A legacy/removed value (e.g. "trace") must not break the whole load.
        let json = r#"{ "logLevel": "trace" }"#;
        let settings: GlobalSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.log_level, LogLevel::Info);
    }

    #[test]
    fn log_level_serde_round_trip() {
        let mut s = GlobalSettings::default();
        s.log_level = LogLevel::Debug;
        let json = serde_json::to_string(&s).unwrap();
        let back: GlobalSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.log_level, LogLevel::Debug);
    }

    #[test]
    fn playback_settings_defaults() {
        assert_eq!(GlobalSettings::default().prev_restart_threshold_ms, 0);
    }

    #[test]
    fn legacy_config_without_playback_fields_uses_defaults() {
        // A config saved before these fields existed must still deserialize.
        let json = r#"{"language":"en-US","theme":"auto","activeProfile":"Default"}"#;
        let s: GlobalSettings = serde_json::from_str(json).unwrap();
        assert_eq!(s.prev_restart_threshold_ms, 0);
    }

    #[test]
    fn profile_scoped_fields_are_gone_from_global_settings() {
        // Дорелізний переїзд без міграції (ADR 2026-08-08): п'ять полів просто
        // зникають із settings.json, а старий файл, який їх іще має, мусить
        // завантажитися — зайві ключі serde ігнорує.
        let json = r#"{"language":"en-US","activeProfile":"Default",
            "showTrayNotifications":false,"diskSpaceThresholdGb":9,
            "autoAdvance":false,"resumeFileFrom":"start","sortBy":"added"}"#;
        let s: GlobalSettings = serde_json::from_str(json).unwrap();
        assert_eq!(s.active_profile, "Default");
        let out = serde_json::to_string(&s).unwrap();
        for key in ["showTrayNotifications", "diskSpaceThresholdGb", "autoAdvance",
                    "resumeFileFrom", "sortBy"] {
            assert!(!out.contains(key), "{key} must not be written back: {out}");
        }
    }

    #[test]
    fn default_stop_all_combo() {
        assert_eq!(HotkeyMap::default().stop_all, "Ctrl+Shift+S");
    }

    #[test]
    fn hotkeys_object_without_stop_all_still_loads() {
        // A settings.json written before KB-12 has a `hotkeys` object with five
        // fields. It must deserialize, the new field gets its default, and the
        // user's customized combos survive.
        let json = r#"{ "hotkeys": {
            "toggleRecording": "Ctrl+Shift+R",
            "togglePlayback": "Ctrl+Shift+P",
            "volumeUp": "Ctrl+Shift+Up",
            "volumeDown": "Ctrl+Shift+Down",
            "toggleWindow": "Ctrl+Alt+J"
        } }"#;
        let settings: GlobalSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.hotkeys.stop_all, "Ctrl+Shift+S");
        assert_eq!(settings.hotkeys.toggle_window, "Ctrl+Alt+J");
    }

    #[test]
    fn default_track_combos() {
        let hk = HotkeyMap::default();
        assert_eq!(hk.prev_track, "Ctrl+Alt+Left");
        assert_eq!(hk.next_track, "Ctrl+Alt+Right");
    }

    #[test]
    fn default_volume_combos_use_ctrl_alt() {
        let hk = HotkeyMap::default();
        assert_eq!(hk.volume_up, "Ctrl+Alt+Up");
        assert_eq!(hk.volume_down, "Ctrl+Alt+Down");
    }

    #[test]
    fn stored_volume_combos_are_not_migrated() {
        // Pre-2026-06-11 installs persisted the old Ctrl+Shift+Up/Down defaults
        // into settings.json. The new defaults apply to fresh installs only;
        // whatever is stored — old default or customization — must survive.
        let json = r#"{ "hotkeys": {
            "volumeUp": "Ctrl+Shift+Up",
            "volumeDown": "Ctrl+Shift+Down"
        } }"#;
        let settings: GlobalSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.hotkeys.volume_up, "Ctrl+Shift+Up");
        assert_eq!(settings.hotkeys.volume_down, "Ctrl+Shift+Down");
    }

    #[test]
    fn hotkeys_object_without_track_fields_still_loads() {
        // A settings.json written before prev/next track hotkeys has a `hotkeys`
        // object with six fields. It must deserialize, the new fields get their
        // defaults, and the user's customized combos survive.
        let json = r#"{ "hotkeys": {
            "toggleRecording": "Ctrl+Shift+R",
            "togglePlayback": "Ctrl+Shift+P",
            "volumeUp": "Ctrl+Shift+Up",
            "volumeDown": "Ctrl+Shift+Down",
            "toggleWindow": "Ctrl+Alt+J",
            "stopAll": "Ctrl+Shift+S"
        } }"#;
        let settings: GlobalSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.hotkeys.prev_track, "Ctrl+Alt+Left");
        assert_eq!(settings.hotkeys.next_track, "Ctrl+Alt+Right");
        assert_eq!(settings.hotkeys.toggle_window, "Ctrl+Alt+J");
    }

    #[test]
    fn volume_step_defaults_to_5() {
        assert_eq!(GlobalSettings::default().volume_step_percent, 5);
    }

    #[test]
    fn legacy_config_without_volume_step_uses_default() {
        let json = r#"{"language":"en-US","theme":"auto","activeProfile":"Default"}"#;
        let s: GlobalSettings = serde_json::from_str(json).unwrap();
        assert_eq!(s.volume_step_percent, 5);
    }

    #[test]
    fn smtc_enabled_defaults_to_true() {
        assert!(GlobalSettings::default().smtc_enabled);
    }

    #[test]
    fn legacy_config_without_smtc_field_defaults_to_true() {
        // A settings.json written before SMTC existed must still load,
        // with the new field taking its default (KB-12 / prev_track pattern).
        let json = r#"{"language":"en-US","theme":"auto","activeProfile":"Default"}"#;
        let s: GlobalSettings = serde_json::from_str(json).unwrap();
        assert!(s.smtc_enabled);
    }

    #[test]
    fn smtc_enabled_false_round_trips() {
        let mut s = GlobalSettings::default();
        s.smtc_enabled = false;
        let json = serde_json::to_string(&s).unwrap();
        let back: GlobalSettings = serde_json::from_str(&json).unwrap();
        assert!(!back.smtc_enabled);
    }

    #[test]
    fn autostart_minimized_defaults_to_true() {
        assert!(GlobalSettings::default().autostart_minimized);
    }

    #[test]
    fn legacy_config_without_autostart_minimized_defaults_to_true() {
        // A settings.json written before this field existed must still load,
        // with the new field taking its default (KB-12 / smtc pattern).
        let json = r#"{"language":"en-US","theme":"auto","activeProfile":"Default"}"#;
        let s: GlobalSettings = serde_json::from_str(json).unwrap();
        assert!(s.autostart_minimized);
    }

    #[test]
    fn autostart_minimized_false_round_trips() {
        let mut s = GlobalSettings::default();
        s.autostart_minimized = false;
        let json = serde_json::to_string(&s).unwrap();
        let back: GlobalSettings = serde_json::from_str(&json).unwrap();
        assert!(!back.autostart_minimized);
    }

    #[test]
    fn default_toggle_playback_is_ctrl_shift_k() {
        assert_eq!(HotkeyMap::default().toggle_playback, "Ctrl+Shift+K");
    }

    #[test]
    fn stored_toggle_playback_combo_is_not_migrated() {
        // The old default (Ctrl+Shift+P) collided with Firefox private-window /
        // VS Code command palette. The new default is for fresh installs only;
        // a stored combo — old default or customization — must survive verbatim.
        let json = r#"{ "hotkeys": { "togglePlayback": "Ctrl+Shift+P" } }"#;
        let settings: GlobalSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.hotkeys.toggle_playback, "Ctrl+Shift+P");
    }
}
