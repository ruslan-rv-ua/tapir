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
    #[serde(default)]
    pub saved_tracks: Vec<SavedTrack>,
    #[serde(default)]
    pub active_recording_urls: Vec<String>,
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
}
