use crate::errors::RadioError;
use crate::portable;
use crate::settings::strip_bom;
use serde::{Deserialize, Serialize};

// --- AudioFormat ---
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioFormat {
    Mp3,
    Aac,
}

// --- StreamInfo ---
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    pub id: String,
    pub url: String,
    pub name: String,
    #[serde(default)]
    pub format: Option<AudioFormat>,
    #[serde(default)]
    pub bitrate: Option<u32>,
    #[serde(default)]
    pub icy_name: Option<String>,
    #[serde(default)]
    pub icy_genre: Option<String>,
    #[serde(default)]
    pub icy_url: Option<String>,
    #[serde(default)]
    pub ignorelist: Vec<String>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    pub added_at: String,
}

// --- WishlistEntry ---
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WishlistEntry {
    pub pattern: String,
    #[serde(default)]
    pub min_bitrate: Option<u32>,
    #[serde(default)]
    pub format: Option<AudioFormat>,
    pub remove_after_record: bool,
    pub add_to_ignorelist_after_record: bool,
    pub added_at: String,
}

// --- ScheduleType + ScheduledRecording ---
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScheduleType {
    Oneshot,
    Recurring,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledRecording {
    pub id: String,
    pub stream_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub schedule_type: ScheduleType,
    #[serde(default)]
    pub day_of_week: Option<u8>,
    #[serde(default)]
    pub date: Option<String>,
    pub time: String,
    pub duration_minutes: u32,
    pub enabled: bool,
    pub created_at: String,
}

// --- ReconnectConfig ---
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconnectConfig {
    pub max_retries: u32,
    pub retry_interval_secs: u32,
    pub backoff_multiplier: f32,
    pub max_interval_secs: u32,
}

impl Default for ReconnectConfig {
    fn default() -> Self {
        Self {
            max_retries: 0,
            retry_interval_secs: 5,
            backoff_multiplier: 1.5,
            max_interval_secs: 300,
        }
    }
}

// --- RecordingSettings ---
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingSettings {
    #[serde(default = "default_output_dir")]
    pub output_dir: String,
    #[serde(default = "default_file_name_template")]
    pub file_name_template: String,
    #[serde(default = "default_incomplete_template")]
    pub incomplete_file_name_template: String,
    #[serde(default = "default_stream_template")]
    pub stream_file_name_template: String,
    #[serde(default = "default_true")]
    pub save_stream_file: bool,
    #[serde(default)]
    pub delete_stream_file_on_stop: bool,
    #[serde(default = "default_true")]
    pub skip_first_incomplete_track: bool,
    #[serde(default = "default_skip_short_tracks_ms")]
    pub skip_short_tracks_ms: u32,
    #[serde(default = "default_true")]
    pub auto_correct_case: bool,
    #[serde(default)]
    pub reconnect: ReconnectConfig,
}

fn default_output_dir() -> String { "recordings".to_string() }
fn default_file_name_template() -> String { "%s\\%a - %t".to_string() }
fn default_incomplete_template() -> String { "%s\\%a - %t_incomplete".to_string() }
fn default_stream_template() -> String { "%s\\stream_%d_%time".to_string() }
fn default_true() -> bool { true }
fn default_skip_short_tracks_ms() -> u32 { 30000 }

impl Default for RecordingSettings {
    fn default() -> Self {
        Self {
            output_dir: default_output_dir(),
            file_name_template: default_file_name_template(),
            incomplete_file_name_template: default_incomplete_template(),
            stream_file_name_template: default_stream_template(),
            save_stream_file: true,
            delete_stream_file_on_stop: false,
            skip_first_incomplete_track: true,
            skip_short_tracks_ms: 30000,
            auto_correct_case: true,
            reconnect: ReconnectConfig::default(),
        }
    }
}

// --- PostprocessConfig ---
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostprocessConfig {
    pub enabled: bool,
    pub command: String,
    pub arguments: String,
    pub timeout_secs: u32,
    pub run_on_complete: bool,
    pub run_on_incomplete: bool,
}

impl Default for PostprocessConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            command: String::new(),
            arguments: "%file".to_string(),
            timeout_secs: 120,
            run_on_complete: true,
            run_on_incomplete: false,
        }
    }
}

// --- PlayerSession ---
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePosition {
    pub path: String,
    pub position_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSession {
    #[serde(default = "default_volume")]
    pub volume: f32,
    #[serde(default)]
    pub last_stream_id: Option<String>,
    #[serde(default)]
    pub last_file_position: Option<FilePosition>,
}

fn default_volume() -> f32 { 0.75 }
fn default_version() -> u32 { 1 }

impl Default for PlayerSession {
    fn default() -> Self {
        Self {
            volume: 0.75,
            last_stream_id: None,
            last_file_position: None,
        }
    }
}

// --- SavedTrack ---
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedTrack {
    pub path: String,
    pub artist: String,
    pub title: String,
    pub album: String,
    pub station: String,
    pub format: AudioFormat,
    pub bitrate: u32,
    pub duration_ms: u64,
    pub size_bytes: u64,
    pub is_complete: bool,
    pub is_wishlist_match: bool,
    pub recorded_at: String,
}

// --- Profile ---
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub name: String,
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub streams: Vec<StreamInfo>,
    #[serde(default)]
    pub wishlist: Vec<WishlistEntry>,
    #[serde(default)]
    pub ignorelist: Vec<String>,
    #[serde(default)]
    pub scheduled_recordings: Vec<ScheduledRecording>,
    #[serde(default)]
    pub recording: RecordingSettings,
    #[serde(default)]
    pub postprocess: PostprocessConfig,
    #[serde(default)]
    pub player_session: PlayerSession,
    // DEPRECATED Phase 3C: not populated. Saved Songs Manager scans the
    // recordings directory on demand instead. Kept for backward compat with
    // existing profile JSON files; reserved for a future cached-index approach.
    #[serde(default)]
    pub saved_tracks: Vec<SavedTrack>,
    #[serde(default)]
    pub active_recording_urls: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMeta {
    pub name: String,
    pub stream_count: usize,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub profile_json: String,
    pub suggested_name: String,
    pub stream_count: usize,
    pub has_conflict: bool,
}

/// Validate a profile name for create/rename/import operations.
/// `existing` = list of existing profile names (for duplicate check, case-insensitive).
pub fn validate_profile_name(name: &str, existing: &[String]) -> Result<(), RadioError> {
    if name.is_empty() {
        return Err(RadioError::InvalidName("Name cannot be empty".into()));
    }
    if name.len() > 64 {
        return Err(RadioError::InvalidName("Name cannot exceed 64 characters".into()));
    }
    if name.starts_with(' ') || name.ends_with(' ') || name.starts_with('.') || name.ends_with('.') {
        return Err(RadioError::InvalidName(
            "Name cannot start or end with a space or dot".into(),
        ));
    }
    let forbidden_chars = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
    if let Some(ch) = name.chars().find(|c| forbidden_chars.contains(c)) {
        return Err(RadioError::InvalidName(format!("Forbidden character: {ch}")));
    }
    let upper = name.to_uppercase();
    let reserved = [
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if reserved.contains(&upper.as_str()) {
        return Err(RadioError::InvalidName(format!("'{name}' is a reserved Windows device name")));
    }
    if name.to_lowercase() == "default" {
        return Err(RadioError::InvalidName("'Default' is a reserved name".into()));
    }
    let lower = name.to_lowercase();
    if existing.iter().any(|e| e.to_lowercase() == lower) {
        return Err(RadioError::Conflict(format!("Profile '{name}' already exists")));
    }
    Ok(())
}

impl Profile {
    pub fn load(name: &str) -> Result<Self, RadioError> {
        let path = portable::profiles_dir().join(format!("{}.tapirprofile", name));
        if !path.exists() {
            if name == "Default" {
                let profile = Self::create_default();
                profile.save()?;
                return Ok(profile);
            }
            return Err(RadioError::NotFound(format!("Profile '{}' not found", name)));
        }
        let content = std::fs::read_to_string(&path)?;
        let content = strip_bom(&content);
        let profile: Self = serde_json::from_str(content)?;
        Ok(profile)
    }

    pub fn save(&self) -> Result<(), RadioError> {
        let path = portable::profiles_dir().join(format!("{}.tapirprofile", self.name));
        let tmp_path = path.with_extension("tapirprofile.tmp");
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(&tmp_path, &json)?;
        std::fs::rename(&tmp_path, &path)?;
        Ok(())
    }

    pub fn create_default() -> Self {
        Self {
            name: "Default".to_string(),
            version: 1,
            streams: vec![],
            wishlist: vec![],
            ignorelist: vec![],
            scheduled_recordings: vec![],
            recording: RecordingSettings::default(),
            postprocess: PostprocessConfig::default(),
            player_session: PlayerSession::default(),
            saved_tracks: vec![],
            active_recording_urls: vec![],
        }
    }

    pub fn list(active: &str) -> Result<Vec<ProfileMeta>, RadioError> {
        let dir = portable::profiles_dir();
        if !dir.exists() {
            return Ok(vec![ProfileMeta {
                name: "Default".to_string(),
                stream_count: 0,
                is_active: active == "Default",
            }]);
        }
        let mut metas: Vec<ProfileMeta> = std::fs::read_dir(&dir)?
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path().extension().and_then(|s| s.to_str()) == Some("tapirprofile")
            })
            .filter_map(|e| {
                let path = e.path();
                let name = path.file_stem()?.to_str()?.to_string();
                match std::fs::read_to_string(&path) {
                    Ok(content) => {
                        let stripped = strip_bom(&content);
                        match serde_json::from_str::<Profile>(stripped) {
                            Ok(p) => Some(ProfileMeta {
                                name: name.clone(),
                                stream_count: p.streams.len(),
                                is_active: name == active,
                            }),
                            Err(e) => {
                                log::warn!("Skipping corrupt profile '{name}': {e}");
                                None
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!("Cannot read profile file '{}': {e}", path.display());
                        None
                    }
                }
            })
            .collect();

        metas.sort_by(|a, b| {
            if a.name == "Default" { return std::cmp::Ordering::Less; }
            if b.name == "Default" { return std::cmp::Ordering::Greater; }
            a.name.cmp(&b.name)
        });
        Ok(metas)
    }

    pub fn create(name: &str) -> Result<Self, RadioError> {
        let existing = Self::list(name)?.iter().map(|m| m.name.clone()).collect::<Vec<_>>();
        validate_profile_name(name, &existing)?;
        let mut profile = Self::create_default();
        profile.name = name.to_string();
        profile.save()?;
        Ok(profile)
    }

    pub fn rename(old_name: &str, new_name: &str) -> Result<ProfileMeta, RadioError> {
        if old_name == "Default" {
            return Err(RadioError::Forbidden("Cannot rename 'Default' profile".into()));
        }
        let existing: Vec<String> = Self::list(old_name)?
            .iter()
            .filter(|m| m.name != old_name)
            .map(|m| m.name.clone())
            .collect();
        validate_profile_name(new_name, &existing)?;
        let mut profile = Self::load(old_name)?;
        let old_path = portable::profiles_dir().join(format!("{}.tapirprofile", old_name));
        let new_path = portable::profiles_dir().join(format!("{}.tapirprofile", new_name));
        // Guard against clobbering an existing file that validate missed (e.g. corrupt, unreadable)
        if new_path.exists() {
            return Err(RadioError::Conflict(format!("A profile file named '{new_name}' already exists")));
        }
        profile.name = new_name.to_string();
        let json = serde_json::to_string_pretty(&profile)?;
        std::fs::write(&new_path, &json)?;
        std::fs::remove_file(&old_path)?;
        Ok(ProfileMeta {
            name: new_name.to_string(),
            stream_count: profile.streams.len(),
            is_active: false, // caller must check
        })
    }

    pub fn delete(name: &str) -> Result<(), RadioError> {
        if name == "Default" {
            return Err(RadioError::Forbidden("Cannot delete 'Default' profile".into()));
        }
        let path = portable::profiles_dir().join(format!("{}.tapirprofile", name));
        if !path.exists() {
            return Err(RadioError::NotFound(format!("Profile '{name}' not found")));
        }
        std::fs::remove_file(&path)?;
        Ok(())
    }

    pub fn duplicate(src_name: &str, new_name: &str) -> Result<ProfileMeta, RadioError> {
        let existing: Vec<String> = Self::list(src_name)?.iter().map(|m| m.name.clone()).collect();
        validate_profile_name(new_name, &existing)?;
        let mut profile = Self::load(src_name)?;
        profile.name = new_name.to_string();
        // Clear session state — duplicated profile starts fresh
        profile.active_recording_urls = vec![];
        profile.save()?;
        Ok(ProfileMeta {
            name: new_name.to_string(),
            stream_count: profile.streams.len(),
            is_active: false,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_meta_serializes() {
        let m = ProfileMeta { name: "Test".into(), stream_count: 3, is_active: true };
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains("\"streamCount\":3"));
        assert!(json.contains("\"isActive\":true"));
        assert!(json.contains("\"name\":\"Test\""));
    }

    #[test]
    fn import_preview_serializes() {
        let p = ImportPreview {
            profile_json: "{}".into(),
            suggested_name: "Imported".into(),
            stream_count: 0,
            has_conflict: false,
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"suggestedName\":\"Imported\""));
        assert!(json.contains("\"hasConflict\":false"));
    }

    #[test]
    fn validate_name_rejects_empty() {
        assert!(validate_profile_name("", &[]).is_err());
    }

    #[test]
    fn validate_name_rejects_too_long() {
        let long = "a".repeat(65);
        assert!(validate_profile_name(&long, &[]).is_err());
    }

    #[test]
    fn validate_name_rejects_default() {
        assert!(validate_profile_name("Default", &[]).is_err());
        assert!(validate_profile_name("default", &[]).is_err());
        assert!(validate_profile_name("DEFAULT", &[]).is_err());
    }

    #[test]
    fn validate_name_rejects_windows_reserved() {
        for name in &["CON", "con", "NUL", "COM1", "LPT9", "PRN", "AUX"] {
            assert!(validate_profile_name(name, &[]).is_err(), "{name} should be rejected");
        }
    }

    #[test]
    fn validate_name_rejects_forbidden_chars() {
        for ch in &['\\', '/', ':', '*', '?', '"', '<', '>', '|'] {
            let name = format!("test{ch}name");
            assert!(validate_profile_name(&name, &[]).is_err(), "char {ch} should be rejected");
        }
    }

    #[test]
    fn validate_name_rejects_leading_trailing_dot_space() {
        assert!(validate_profile_name(" Work", &[]).is_err());
        assert!(validate_profile_name("Work ", &[]).is_err());
        assert!(validate_profile_name(".Work", &[]).is_err());
        assert!(validate_profile_name("Work.", &[]).is_err());
    }

    #[test]
    fn validate_name_rejects_duplicate_case_insensitive() {
        let existing = vec!["Jazz".to_string(), "Rock".to_string()];
        assert!(validate_profile_name("jazz", &existing).is_err());
        assert!(validate_profile_name("JAZZ", &existing).is_err());
    }

    #[test]
    fn validate_name_accepts_valid() {
        assert!(validate_profile_name("My Profile", &[]).is_ok());
        assert!(validate_profile_name("Jazz-2026", &[]).is_ok());
        assert!(validate_profile_name("Work_EU", &[]).is_ok());
    }

    #[test]
    fn list_sort_puts_default_first() {
        // Test the sort algorithm used by Profile::list()
        let mut metas = vec![
            ProfileMeta { name: "Zebra".into(), stream_count: 0, is_active: false },
            ProfileMeta { name: "Default".into(), stream_count: 0, is_active: true },
            ProfileMeta { name: "Alpha".into(), stream_count: 0, is_active: false },
        ];
        metas.sort_by(|a, b| {
            if a.name == "Default" { return std::cmp::Ordering::Less; }
            if b.name == "Default" { return std::cmp::Ordering::Greater; }
            a.name.cmp(&b.name)
        });
        assert_eq!(metas[0].name, "Default");
        assert_eq!(metas[1].name, "Alpha");
        assert_eq!(metas[2].name, "Zebra");
    }

    #[test]
    fn create_rejects_invalid_name() {
        let err = Profile::create("").unwrap_err();
        assert!(err.to_string().starts_with("InvalidName:"), "got: {err}");
    }

    #[test]
    fn create_rejects_forbidden_default_name() {
        let err = Profile::create("Default").unwrap_err();
        assert!(err.to_string().starts_with("InvalidName:"), "got: {err}");
    }

    #[test]
    fn rename_default_is_forbidden() {
        let err = Profile::rename("Default", "Anything").unwrap_err();
        assert!(err.to_string().starts_with("Forbidden:"), "got: {err}");
    }

    #[test]
    fn delete_default_is_forbidden() {
        let err = Profile::delete("Default").unwrap_err();
        assert!(err.to_string().starts_with("Forbidden:"), "got: {err}");
    }

    #[test]
    fn delete_nonexistent_is_not_found() {
        let err = Profile::delete("__nonexistent_profile_xyz__").unwrap_err();
        assert!(err.to_string().to_lowercase().contains("not found") ||
                err.to_string().contains("NotFound"), "got: {err}");
    }
}
