use crate::errors::RadioError;
use crate::portable;
use crate::settings::strip_bom;
use serde::{Deserialize, Serialize};

// --- AudioFormat ---
/// Закритий набір того, що Tapir уміє **записати**: назвати розширенням файлу
/// й протегувати (CONTEXT.md, «Формат»). Не опис того, що буває в ефірі —
/// чужа сім'я варіанта тут не отримує, вона живе в [`UnsupportedCodec`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioFormat {
    Mp3,
    Aac,
}

/// Мітка «цього ефіру Tapir не пише» — кеш останнього вердикту `detect`
/// (ADR 2026-08-31 §6). Живе поруч із `format` і перезаписується разом із ним:
/// заповнена рівно тоді, коли `format` порожній через відмову, а не через те,
/// що потік ще жодного разу не перевіряли.
///
/// `family` названа, коли сім'ю впізнано (`OGG`, `FLAC`), і `None`, коли
/// доказів не вистачило ні на що. Мітка живить три речі: носія в рядку потоку,
/// фаст-фейл планувальника й коротке замикання Play.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsupportedCodec {
    #[serde(default)]
    pub family: Option<String>,
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
    /// Заповнена, коли останній вердикт про ефір був «не пишемо» — див.
    /// [`UnsupportedCodec`]. Взаємовиключна з `format`.
    #[serde(default)]
    pub unsupported_codec: Option<UnsupportedCodec>,
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

// --- ScheduleType + ScheduledRecording (Phase 3D, спека §2) ---
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScheduleType {
    Oneshot,
    Recurring,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledRecording {
    pub id: String,
    pub stream_id: String,            // посилання на StreamInfo.id активного профілю
    pub name: String,                 // мітка користувача, напр. "Evening Jazz"
    #[serde(rename = "type")]
    pub schedule_type: ScheduleType,
    #[serde(default)]
    pub days: Vec<u8>,                // recurring: 0=Пн..6=Нд, непорожній; oneshot: порожній
    #[serde(default)]
    pub date: Option<String>,         // oneshot: ISO-дата "2026-06-14"; recurring: None
    pub time: String,                 // початок "HH:MM", 24h, локальний час
    pub duration_minutes: u32,        // 1..=1439
    pub enabled: bool,
    pub created_at: String,
    #[serde(default)]
    pub last_result: Option<ScheduleResult>, // пише лише backend
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleResult {
    pub occurrence: String,           // "2026-06-12T20:00" — номінальний локальний
                                      // час початку входження (без padding)
    pub status: ScheduleResultStatus,
    #[serde(default)]
    pub reason: Option<ScheduleResultReason>, // лише для Missed / StoppedByUser
    pub recorded_minutes: u32,        // wall-clock від фактичного старту до зупинки;
                                      // 0 — не стартував
    pub finished_at: String,          // ISO datetime, коли статус зафіксовано
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScheduleResultStatus {
    Completed,                // записано все вікно
    StartedLate,              // catch-up: стартували посеред вікна, дописали решту
    Missed,                   // вікно минуло без старту
    StoppedByUser,            // користувач зупинив плановий запис вручну
    SkippedAlreadyRecording,  // на старті вікна потік уже записувався
}

/// Код причини для Missed і StoppedByUser. Локалізує frontend (Paraglide);
/// backend ніколи не віддає готові рядки.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScheduleResultReason {
    // Missed:
    AppNotRunning,   // вікно минуло без жодної спроби старту в цій сесії
    StartFailed,     // спроби старту були, всі невдалі
    ClockChange,     // неіснуючий локальний час (DST-стрибок уперед)
    UnsupportedCodec, // ефір не з тих, які Tapir уміє писати — старту не було
    // StoppedByUser:
    ManualStop,      // зупинка з UI або глобального хоткея
    ProfileSwitch,   // переключення профілю
    AppClosing,      // закриття додатка
    ScheduleEdited,  // редагування/вимкнення розкладу під час запису
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
            // 0 = не перепідключатися; «необмежено» в домені немає (ADR
            // 2026-08-13). ≈40 хв наполегливості з дефолтним backoff.
            max_retries: 10,
            retry_interval_secs: 5,
            backoff_multiplier: 1.5,
            max_interval_secs: 300,
        }
    }
}

impl ReconnectConfig {
    /// Стеля `max_retries` (ADR 2026-08-13): без неї «необмежено» повертається
    /// чорним ходом через `u32::MAX`, а статус читається «Спроба 3 з 4294967295».
    pub const MAX_RETRIES_CAP: u32 = 10_000;

    pub fn clamp_max_retries(&mut self) {
        self.max_retries = self.max_retries.min(Self::MAX_RETRIES_CAP);
    }
}

// --- RecordingSettings ---
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingSettings {
    #[serde(default = "default_output_dir")]
    pub output_dir: String,
    /// Профільний, бо охороняє профільний `output_dir`: «Архів» на 4-ТБ томі і
    /// «Ніч» на системному диску не мають ділити один поріг (ADR 2026-08-08).
    #[serde(default = "default_disk_space_threshold_gb")]
    pub disk_space_threshold_gb: u32,
    #[serde(default = "default_file_name_template")]
    pub file_name_template: String,
    #[serde(default = "default_incomplete_template")]
    pub incomplete_file_name_template: String,
    #[serde(default = "default_stream_template")]
    pub stream_file_name_template: String,
    #[serde(default = "default_true")]
    pub save_stream_file: bool,
    #[serde(default = "default_true")]
    pub skip_first_incomplete_track: bool,
    #[serde(default = "default_skip_short_tracks_ms")]
    pub skip_short_tracks_ms: u32,
    #[serde(default = "default_true")]
    pub auto_correct_case: bool,
    #[serde(default)]
    pub schedule_pad_before_min: u32,   // 0–30, клампиться у clamp_schedule_padding
    #[serde(default)]
    pub schedule_pad_after_min: u32,    // 0–60
    #[serde(default)]
    pub reconnect: ReconnectConfig,
}

fn default_output_dir() -> String { "recordings".to_string() }
fn default_disk_space_threshold_gb() -> u32 { 1 }
fn default_file_name_template() -> String { "%s\\%a - %t".to_string() }
fn default_incomplete_template() -> String { "%s\\%a - %t_incomplete".to_string() }
fn default_stream_template() -> String { "%s\\stream_%d_%time".to_string() }
fn default_true() -> bool { true }
fn default_skip_short_tracks_ms() -> u32 { 30000 }

impl Default for RecordingSettings {
    fn default() -> Self {
        Self {
            output_dir: default_output_dir(),
            disk_space_threshold_gb: default_disk_space_threshold_gb(),
            file_name_template: default_file_name_template(),
            incomplete_file_name_template: default_incomplete_template(),
            stream_file_name_template: default_stream_template(),
            save_stream_file: true,
            skip_first_incomplete_track: true,
            skip_short_tracks_ms: 30000,
            auto_correct_case: true,
            schedule_pad_before_min: 0,
            schedule_pad_after_min: 0,
            reconnect: ReconnectConfig::default(),
        }
    }
}

impl RecordingSettings {
    /// Спека Phase 3D §2: межі padding 0–30 / 0–60 хв клампляться на backend
    /// при збереженні налаштувань, а не лише в UI.
    pub fn clamp_schedule_padding(&mut self) {
        self.schedule_pad_before_min = self.schedule_pad_before_min.min(30);
        self.schedule_pad_after_min = self.schedule_pad_after_min.min(60);
    }
}

// --- UiSettings ---
/// «Яким є набір даних і як він показаний» — фільтр 4 ADR 2026-08-08.
/// Обидва `tray_notifications_*` — той самий **один** свідомий виняток із
/// фільтра ОС-межі («нічний сценарій — тихо»), просто втілений двома полями:
/// категорій тостів дві, і кожна вимикається окремо (ADR 2026-08-17 про
/// категорії тостів). Рахувати їх як два винятки не можна.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSettings {
    /// `String`, не enum, свідомо: невідоме значення в enum завалило б розбір
    /// **усього** профілю, а не одного поля. Фронт звужує його до
    /// `"name" | "added"` і має фолбек на `"name"` — та сама терпимість, що й у
    /// `deserialize_log_level`, лише дешевша.
    #[serde(default = "default_stream_sort")]
    pub stream_sort: String,
    #[serde(default = "default_true")]
    pub tray_notifications_track_change: bool,
    #[serde(default = "default_true")]
    pub tray_notifications_scheduled: bool,
}

fn default_stream_sort() -> String { "name".to_string() }

impl Default for UiSettings {
    fn default() -> Self {
        Self {
            stream_sort: default_stream_sort(),
            tray_notifications_track_change: true,
            tray_notifications_scheduled: true,
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
/// Which source was last active — the single discriminator cold-start uses to
/// decide what `Ctrl+Shift+K` resumes. Set on every play-start; the resolve step
/// tolerates a dangling value (discriminator set but its data field `None`) by
/// treating it as "nothing saved". Two slots only, so no timestamp/ordering.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LastActive {
    Stream,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePosition {
    pub path: String,
    pub position_ms: u64,
}

/// What position the cold-start `Ctrl+Shift+K` file resume starts from.
/// ONLY consulted on cold-start — in-session pause→resume always keeps the
/// position (pause semantics). Enum (not bool) to leave the door open for a
/// third variant (e.g. Ask), per the backlog decision.
///
/// Lives next to `autoplay_on_startup` in `PlayerSession`: «чи відновлювати» і
/// «звідки відновлювати» — одна фіча холодного старту (ADR 2026-08-08).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ResumeFileFrom {
    #[default]
    Position,
    Start,
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
    #[serde(default)]
    pub last_active: Option<LastActive>,
    /// Per-profile policy: on the next app startup, resume whatever was last
    /// playing in this profile. Opt-in; legacy JSON without the field is `false`.
    #[serde(default)]
    pub autoplay_on_startup: bool,
    /// Play the next track in the list when the current file ends.
    #[serde(default = "default_true")]
    pub auto_advance: bool,
    /// Where a cold-start file resume starts from — «звідки відновлювати»,
    /// впритул до «чи відновлювати» (`autoplay_on_startup`).
    #[serde(default)]
    pub resume_file_from: ResumeFileFrom,
}

fn default_volume() -> f32 { 0.75 }
fn default_version() -> u32 { 1 }

impl Default for PlayerSession {
    fn default() -> Self {
        Self {
            volume: 0.75,
            last_stream_id: None,
            last_file_position: None,
            last_active: None,
            autoplay_on_startup: false,
            auto_advance: true,
            resume_file_from: ResumeFileFrom::Position,
        }
    }
}

impl PlayerSession {
    /// Reset the fields that must not travel to a duplicate or an export: the
    /// per-profile autoplay policy and the whole resume triple (what/where
    /// playback last was). The resume triple is cleared in full — leaving only
    /// `last_file_position` would strand a dangling `last_active` discriminator,
    /// and the absolute file path is both a privacy leak and stale on another
    /// machine. `volume` is intentionally preserved — as are `auto_advance` and
    /// `resume_file_from`: those are preferences, not a trace of this session.
    pub fn reset_for_share(&mut self) {
        self.autoplay_on_startup = false;
        self.last_active = None;
        self.last_stream_id = None;
        self.last_file_position = None;
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
    pub ui: UiSettings,
    #[serde(default)]
    pub player_session: PlayerSession,
    // DEPRECATED Phase 3C: not populated. Saved Songs Manager scans the
    // recordings directory on demand instead. Kept for backward compat with
    // existing profile JSON files; reserved for a future cached-index approach.
    #[serde(default)]
    pub saved_tracks: Vec<SavedTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMeta {
    pub name: String,
    pub stream_count: usize,
    pub is_active: bool,
}

/// The editable slice of a profile — exactly what the profile-settings dialog
/// shows, for the active profile or an inactive one. Three sections: `recording`
/// and `ui` whole, plus the three `player_session` fields the UI owns (the rest
/// of `player_session` — `volume`, the resume triple — is written by the backend
/// and must never travel through the dialog).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSettingsView {
    pub recording: RecordingSettings,
    pub ui: UiSettings,
    pub autoplay_on_startup: bool,
    pub auto_advance: bool,
    pub resume_file_from: ResumeFileFrom,
}

/// A patch, not «my copy of the profile»: `save_detached` writes the profile
/// whole, so writing back a copy would clobber concurrent changes — the
/// scheduler's `last_result`, `volume`, the last-playback trace. `recording` and
/// `ui` may travel as whole sections precisely because neither holds a
/// backend-written field; `player_session` may not.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSettingsPatch {
    #[serde(default)]
    pub recording: Option<RecordingSettings>,
    #[serde(default)]
    pub ui: Option<UiSettings>,
    #[serde(default)]
    pub autoplay_on_startup: Option<bool>,
    #[serde(default)]
    pub auto_advance: Option<bool>,
    #[serde(default)]
    pub resume_file_from: Option<ResumeFileFrom>,
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
                crate::profile_store::save_detached(&profile)?;
                return Ok(profile);
            }
            return Err(RadioError::NotFound(format!("Profile '{}' not found", name)));
        }
        let content = std::fs::read_to_string(&path)?;
        let content = strip_bom(&content);
        let mut profile: Self = serde_json::from_str(content)?;
        crate::scheduler::validation::sanitize_on_load(&mut profile);
        // A profile.json written before MAX_RETRIES_CAP existed (or hand-edited)
        // can carry an out-of-range value; load-time is the other entry point
        // besides apply_settings_patch, so the cap has to be enforced here too.
        profile.recording.reconnect.clamp_max_retries();
        Ok(profile)
    }

    /// Append `stream` unless this profile already holds a stream with the same
    /// URL. On a duplicate, returns `Conflict(self.name)` so the caller can tell
    /// the user which profile already has it. Does not save.
    pub fn add_stream_checked(&mut self, stream: StreamInfo) -> Result<(), RadioError> {
        if self.streams.iter().any(|s| s.url == stream.url) {
            return Err(RadioError::Conflict(self.name.clone()));
        }
        self.streams.push(stream);
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
            ui: UiSettings::default(),
            player_session: PlayerSession::default(),
            saved_tracks: vec![],
        }
    }

    /// The editable slice this profile exposes to the profile-settings dialog.
    pub fn settings_view(&self) -> ProfileSettingsView {
        ProfileSettingsView {
            recording: self.recording.clone(),
            ui: self.ui.clone(),
            autoplay_on_startup: self.player_session.autoplay_on_startup,
            auto_advance: self.player_session.auto_advance,
            resume_file_from: self.player_session.resume_file_from,
        }
    }

    /// Apply the sections the patch actually carries; leave every other field —
    /// including the backend-owned `volume`, the resume triple and each
    /// schedule's `last_result` — untouched. Pure: the caller decides whether the
    /// result goes through `commit_profile` (active) or `save_detached`
    /// (inactive), and padding is clamped here so the limits cannot depend on
    /// which branch the patch arrived through.
    pub fn apply_settings_patch(&mut self, patch: ProfileSettingsPatch) {
        if let Some(recording) = patch.recording {
            self.recording = recording;
        }
        if let Some(ui) = patch.ui {
            self.ui = ui;
        }
        if let Some(v) = patch.autoplay_on_startup {
            self.player_session.autoplay_on_startup = v;
        }
        if let Some(v) = patch.auto_advance {
            self.player_session.auto_advance = v;
        }
        if let Some(v) = patch.resume_file_from {
            self.player_session.resume_file_from = v;
        }
        self.recording.clamp_schedule_padding();
        self.recording.reconnect.clamp_max_retries();
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
        crate::profile_store::save_detached(&profile)?;
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
        // A duplicate is a fresh start: it must not inherit the source's autoplay
        // policy nor its last-playback record (which would make the copy "resume"
        // someone else's session). Volume carries over.
        profile.player_session.reset_for_share();
        crate::profile_store::save_detached(&profile)?;
        Ok(ProfileMeta {
            name: new_name.to_string(),
            stream_count: profile.streams.len(),
            is_active: false,
        })
    }

    /// Serialize this profile to JSON with all stream passwords stripped.
    pub fn export_json_str(&self) -> String {
        let mut copy = self.clone();
        for stream in &mut copy.streams {
            stream.password = None;
        }
        // Strip the autoplay policy and the whole resume triple: the record is
        // machine-local (absolute file path — privacy + staleness) and importing
        // someone else's "resume this" is never desired.
        copy.player_session.reset_for_share();
        serde_json::to_string_pretty(&copy).unwrap_or_default()
    }

    /// Parse JSON and return a preview. Does NOT save, does NOT strip passwords.
    pub fn preview_import_json(json: &str) -> Result<ImportPreview, RadioError> {
        let existing = Self::list("").map(|v| v.into_iter().map(|m| m.name).collect::<Vec<_>>())
            .unwrap_or_default();
        Self::preview_import_json_with_existing(json, &existing)
    }

    pub fn preview_import_json_with_existing(json: &str, existing: &[String]) -> Result<ImportPreview, RadioError> {
        let profile: Profile = serde_json::from_str(json)
            .map_err(|e| RadioError::InvalidData(format!("Cannot parse profile: {e}")))?;
        let has_conflict = existing.iter().any(|e| e.to_lowercase() == profile.name.to_lowercase());
        Ok(ImportPreview {
            profile_json: json.to_string(),
            suggested_name: profile.name.clone(),
            stream_count: profile.streams.len(),
            has_conflict,
        })
    }

    /// Validate name, strip passwords, override profile name, save.
    pub fn save_imported(json: &str, name: &str) -> Result<ProfileMeta, RadioError> {
        let existing: Vec<String> = Self::list("")?.iter().map(|m| m.name.clone()).collect();
        validate_profile_name(name, &existing)?;
        let mut profile: Profile = serde_json::from_str(json)
            .map_err(|e| RadioError::InvalidData(format!("Cannot parse profile: {e}")))?;
        // Strip passwords server-side regardless of what the frontend sends
        for stream in &mut profile.streams {
            stream.password = None;
        }
        // Defense-in-depth: even a hand-crafted import file cannot smuggle in an
        // enabled autoplay policy (export already strips it) or an out-of-range
        // reconnect ceiling (MAX_RETRIES_CAP).
        profile.player_session.autoplay_on_startup = false;
        profile.recording.reconnect.clamp_max_retries();
        profile.name = name.to_string();
        crate::profile_store::save_detached(&profile)?;
        Ok(ProfileMeta {
            name: name.to_string(),
            stream_count: profile.streams.len(),
            is_active: false,
        })
    }

    /// Load profile, strip passwords, return JSON for file export.
    pub fn export_json(name: &str) -> Result<String, RadioError> {
        let profile = Self::load(name)?;
        Ok(profile.export_json_str())
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

    // --- Profile-scoped settings (profile-scoped-settings) ---

    #[test]
    fn ui_settings_defaults() {
        let u = UiSettings::default();
        assert_eq!(u.stream_sort, "name");
        assert!(u.tray_notifications_track_change);
        assert!(u.tray_notifications_scheduled);
    }

    /// Профіль, записаний до розділення прапорця, читається без помилки, а
    /// обидві категорії піднімаються ввімкненими. Міграції немає свідомо:
    /// `UiSettings` без `deny_unknown_fields`, тож старе поле просто зникає.
    #[test]
    fn profile_with_pre_split_tray_flag_reads_with_both_categories_on() {
        let json = r#"{"name":"T","ui":{"streamSort":"added","trayNotifications":false}}"#;
        let p: Profile = serde_json::from_str(json).unwrap();
        assert_eq!(p.ui.stream_sort, "added");
        assert!(p.ui.tray_notifications_track_change);
        assert!(p.ui.tray_notifications_scheduled);
    }

    #[test]
    fn profile_without_ui_block_uses_defaults() {
        // A profile written before the block existed must still deserialize.
        let json = r#"{"name":"T"}"#;
        let p: Profile = serde_json::from_str(json).unwrap();
        assert_eq!(p.ui.stream_sort, "name");
        assert!(p.ui.tray_notifications_track_change);
        assert!(p.ui.tray_notifications_scheduled);
        assert_eq!(p.recording.disk_space_threshold_gb, 1);
        assert!(p.player_session.auto_advance);
        assert_eq!(p.player_session.resume_file_from, ResumeFileFrom::Position);
    }

    #[test]
    fn ui_settings_serialize_camel_case() {
        let p = Profile::create_default();
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains(r#""streamSort":"name""#), "got: {json}");
        assert!(json.contains(r#""trayNotificationsTrackChange":true"#), "got: {json}");
        assert!(json.contains(r#""trayNotificationsScheduled":true"#), "got: {json}");
        assert!(json.contains(r#""diskSpaceThresholdGb":1"#), "got: {json}");
        assert!(json.contains(r#""autoAdvance":true"#), "got: {json}");
        assert!(json.contains(r#""resumeFileFrom":"position""#), "got: {json}");
    }

    #[test]
    fn migrated_fields_round_trip() {
        let mut p = Profile::create_default();
        p.recording.disk_space_threshold_gb = 25;
        p.ui.stream_sort = "added".into();
        p.ui.tray_notifications_track_change = false;
        p.ui.tray_notifications_scheduled = false;
        p.player_session.auto_advance = false;
        p.player_session.resume_file_from = ResumeFileFrom::Start;
        let back: Profile = serde_json::from_str(&serde_json::to_string(&p).unwrap()).unwrap();
        assert_eq!(back.recording.disk_space_threshold_gb, 25);
        assert_eq!(back.ui.stream_sort, "added");
        assert!(!back.ui.tray_notifications_track_change);
        assert!(!back.ui.tray_notifications_scheduled);
        assert!(!back.player_session.auto_advance);
        assert_eq!(back.player_session.resume_file_from, ResumeFileFrom::Start);
    }

    #[test]
    fn settings_view_mirrors_the_three_sections() {
        let mut p = Profile::create_default();
        p.recording.output_dir = "D:/arc".into();
        p.ui.tray_notifications_track_change = false;
        p.player_session.autoplay_on_startup = true;
        let view = p.settings_view();
        assert_eq!(view.recording.output_dir, "D:/arc");
        assert!(!view.ui.tray_notifications_track_change);
        assert!(view.autoplay_on_startup);
        assert!(view.auto_advance);
    }

    #[test]
    fn apply_patch_touches_only_present_sections() {
        let mut p = Profile::create_default();
        p.recording.output_dir = "D:/arc".into();
        p.ui.stream_sort = "added".into();
        p.player_session.autoplay_on_startup = true;

        p.apply_settings_patch(ProfileSettingsPatch {
            auto_advance: Some(false),
            ..Default::default()
        });

        assert!(!p.player_session.auto_advance, "the one present field applied");
        assert_eq!(p.recording.output_dir, "D:/arc", "absent section untouched");
        assert_eq!(p.ui.stream_sort, "added", "absent section untouched");
        assert!(p.player_session.autoplay_on_startup, "absent field untouched");
    }

    #[test]
    fn apply_patch_preserves_backend_owned_player_session_fields() {
        // The dialog owns three fields of player_session; the rest — volume and
        // the resume triple — is written by the backend and must survive a patch.
        let mut p = Profile::create_default();
        p.player_session.volume = 0.42;
        p.player_session.last_stream_id = Some("s1".into());
        p.player_session.last_active = Some(LastActive::Stream);
        p.player_session.last_file_position =
            Some(FilePosition { path: "a.mp3".into(), position_ms: 5 });

        p.apply_settings_patch(ProfileSettingsPatch {
            recording: Some(RecordingSettings::default()),
            ui: Some(UiSettings::default()),
            autoplay_on_startup: Some(true),
            auto_advance: Some(false),
            resume_file_from: Some(ResumeFileFrom::Start),
        });

        assert_eq!(p.player_session.volume, 0.42);
        assert_eq!(p.player_session.last_stream_id.as_deref(), Some("s1"));
        assert_eq!(p.player_session.last_active, Some(LastActive::Stream));
        assert!(p.player_session.last_file_position.is_some());
    }

    #[test]
    fn apply_patch_preserves_schedule_last_result() {
        let mut p = Profile::create_default();
        let mut sched = sample_recurring_schedule();
        sched.last_result = Some(ScheduleResult {
            occurrence: "2026-06-12T20:00".into(),
            status: ScheduleResultStatus::Completed,
            reason: None,
            recorded_minutes: 120,
            finished_at: "2026-06-12T22:00:00+03:00".into(),
        });
        p.scheduled_recordings.push(sched);

        p.apply_settings_patch(ProfileSettingsPatch {
            recording: Some(RecordingSettings::default()),
            ..Default::default()
        });

        assert_eq!(
            p.scheduled_recordings[0].last_result.as_ref().unwrap().recorded_minutes,
            120,
        );
    }

    #[test]
    fn apply_patch_clamps_schedule_padding() {
        let mut p = Profile::create_default();
        let recording = RecordingSettings {
            schedule_pad_before_min: 31,
            schedule_pad_after_min: 61,
            ..RecordingSettings::default()
        };
        p.apply_settings_patch(ProfileSettingsPatch {
            recording: Some(recording),
            ..Default::default()
        });
        assert_eq!(p.recording.schedule_pad_before_min, 30);
        assert_eq!(p.recording.schedule_pad_after_min, 60);
    }

    #[test]
    fn apply_patch_clamps_reconnect_max_retries() {
        let mut p = Profile::create_default();
        let recording = RecordingSettings {
            reconnect: ReconnectConfig { max_retries: 999_999, ..ReconnectConfig::default() },
            ..RecordingSettings::default()
        };
        p.apply_settings_patch(ProfileSettingsPatch {
            recording: Some(recording),
            ..Default::default()
        });
        assert_eq!(p.recording.reconnect.max_retries, ReconnectConfig::MAX_RETRIES_CAP);
    }

    #[test]
    fn load_nonexistent_is_not_found() {
        // Це і є правило «команда не створює профіль, якого немає»:
        // `update_profile_settings` не має власної перевірки — воно успадковує
        // її від `Profile::load`. Дебаунс автозбереження 300 мс робить вікно
        // «видалив профіль → відкладений патч дописався на диск» реальним.
        let err = Profile::load("__nonexistent_profile_xyz__").unwrap_err();
        assert!(matches!(err, RadioError::NotFound(_)), "got: {err}");
    }

    #[test]
    fn patch_deserializes_from_a_partial_camel_case_object() {
        // The wire form the webview sends: only the fields it actually changed.
        let patch: ProfileSettingsPatch =
            serde_json::from_str(r#"{"autoplayOnStartup":true}"#).unwrap();
        assert_eq!(patch.autoplay_on_startup, Some(true));
        assert!(patch.recording.is_none());
        assert!(patch.ui.is_none());
        assert!(patch.auto_advance.is_none());
        assert!(patch.resume_file_from.is_none());
    }

    #[test]
    fn duplicate_inherits_settings_but_not_autoplay() {
        // reset_for_share is what a duplicate/export runs: preferences travel,
        // the session trace does not.
        let mut p = Profile::create_default();
        p.recording.disk_space_threshold_gb = 25;
        p.ui.tray_notifications_track_change = false;
        p.player_session.auto_advance = false;
        p.player_session.resume_file_from = ResumeFileFrom::Start;
        p.player_session.autoplay_on_startup = true;
        p.player_session.reset_for_share();
        assert_eq!(p.recording.disk_space_threshold_gb, 25);
        assert!(!p.ui.tray_notifications_track_change);
        assert!(!p.player_session.auto_advance);
        assert_eq!(p.player_session.resume_file_from, ResumeFileFrom::Start);
        assert!(!p.player_session.autoplay_on_startup, "autoplay does not travel");
    }

    #[test]
    fn player_session_autoplay_defaults_to_false() {
        // Legacy profile JSON without the field must deserialize to opt-out.
        let s: PlayerSession = serde_json::from_str("{}").unwrap();
        assert!(!s.autoplay_on_startup);
    }

    #[test]
    fn reset_for_share_clears_autoplay_and_resume_keeps_volume() {
        let mut s = PlayerSession {
            volume: 0.42,
            last_stream_id: Some("s1".into()),
            last_file_position: Some(FilePosition { path: "a.mp3".into(), position_ms: 5 }),
            last_active: Some(LastActive::File),
            autoplay_on_startup: true,
            ..PlayerSession::default()
        };
        s.reset_for_share();
        assert!(!s.autoplay_on_startup);
        assert!(s.last_active.is_none());
        assert!(s.last_stream_id.is_none());
        assert!(s.last_file_position.is_none());
        assert_eq!(s.volume, 0.42, "volume must survive a share/duplicate");
    }

    #[test]
    fn export_strips_autoplay_and_full_resume_triple() {
        let mut p = Profile::create_default();
        p.player_session.autoplay_on_startup = true;
        p.player_session.last_active = Some(LastActive::Stream);
        p.player_session.last_stream_id = Some("s1".into());
        p.player_session.last_file_position =
            Some(FilePosition { path: "C:/secret/a.mp3".into(), position_ms: 5 });
        let json = p.export_json_str();
        let back: Profile = serde_json::from_str(&json).unwrap();
        assert!(!back.player_session.autoplay_on_startup);
        assert!(back.player_session.last_active.is_none());
        assert!(back.player_session.last_stream_id.is_none());
        assert!(back.player_session.last_file_position.is_none());
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
        let mut metas = [
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

    #[test]
    fn export_json_strips_all_passwords() {
        let mut profile = Profile::create_default();
        profile.streams.push(StreamInfo {
            id: "1".into(), url: "http://x".into(), name: "X".into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
            unsupported_codec: None,
            icy_url: None, ignorelist: vec![], username: Some("user".into()),
            password: Some("hunter2".into()), added_at: "2026-01-01".into(),
        });
        let json = profile.export_json_str();
        assert!(!json.contains("hunter2"), "password must be stripped from export");
        assert!(json.contains("user"), "username may remain");
    }

    #[test]
    fn preview_import_returns_err_for_invalid_json() {
        let result = Profile::preview_import_json("not json at all");
        assert!(matches!(result, Err(RadioError::InvalidData(_))));
    }

    #[test]
    fn preview_import_detects_conflict() {
        let profile = Profile::create_default();
        let json = serde_json::to_string(&profile).unwrap();
        let preview = Profile::preview_import_json_with_existing(&json, &["Default".to_string()]);
        assert!(preview.unwrap().has_conflict);
    }

    #[test]
    fn save_imported_rejects_invalid_name() {
        let profile = Profile::create_default();
        let json = serde_json::to_string(&profile).unwrap();
        let err = Profile::save_imported(&json, "").unwrap_err();
        assert!(err.to_string().starts_with("InvalidName:"), "got: {err}");
    }

    #[test]
    fn save_imported_rejects_invalid_json() {
        let err = Profile::save_imported("not valid json", "ValidName").unwrap_err();
        assert!(err.to_string().starts_with("InvalidData:"), "got: {err}");
    }

    #[test]
    fn add_stream_checked_appends_when_url_is_new() {
        let mut p = Profile::create_default();
        let s = StreamInfo {
            id: "1".into(), url: "http://a".into(), name: "A".into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
            unsupported_codec: None,
            icy_url: None, ignorelist: vec![], username: None, password: None,
            added_at: "2026-01-01".into(),
        };
        assert!(p.add_stream_checked(s).is_ok());
        assert_eq!(p.streams.len(), 1);
    }

    #[test]
    fn add_stream_checked_rejects_duplicate_url() {
        let mut p = Profile::create_default();
        let mk = |id: &str| StreamInfo {
            id: id.into(), url: "http://dup".into(), name: "X".into(),
            format: None, bitrate: None, icy_name: None, icy_genre: None,
            unsupported_codec: None,
            icy_url: None, ignorelist: vec![], username: None, password: None,
            added_at: "2026-01-01".into(),
        };
        p.add_stream_checked(mk("1")).unwrap();
        let err = p.add_stream_checked(mk("2")).unwrap_err();
        assert!(matches!(err, RadioError::Conflict(_)));
        assert_eq!(p.streams.len(), 1, "duplicate must not be appended");
    }

    #[test]
    fn recording_settings_padding_defaults_to_zero() {
        let r = RecordingSettings::default();
        assert_eq!(r.schedule_pad_before_min, 0);
        assert_eq!(r.schedule_pad_after_min, 0);
    }

    #[test]
    fn recording_settings_deserializes_without_padding_fields() {
        // Профіль, збережений до Фази 1, не має нових полів
        let json = r#"{"outputDir":"recordings"}"#;
        let r: RecordingSettings = serde_json::from_str(json).unwrap();
        assert_eq!(r.schedule_pad_before_min, 0);
        assert_eq!(r.schedule_pad_after_min, 0);
    }

    #[test]
    fn clamp_schedule_padding_clamps_to_limits() {
        let mut r = RecordingSettings {
            schedule_pad_before_min: 31,
            schedule_pad_after_min: 61,
            ..Default::default()
        };
        r.clamp_schedule_padding();
        assert_eq!(r.schedule_pad_before_min, 30);
        assert_eq!(r.schedule_pad_after_min, 60);
    }

    #[test]
    fn clamp_schedule_padding_keeps_valid_values() {
        let mut r = RecordingSettings {
            schedule_pad_before_min: 30,
            schedule_pad_after_min: 60,
            ..Default::default()
        };
        r.clamp_schedule_padding();
        assert_eq!(r.schedule_pad_before_min, 30);
        assert_eq!(r.schedule_pad_after_min, 60);
    }

    #[test]
    fn reconnect_config_default_is_ten_retries() {
        // ADR 2026-08-13: 0 means "don't reconnect", so it can no longer be
        // the default — a dropped connection must recover on its own.
        assert_eq!(ReconnectConfig::default().max_retries, 10);
    }

    #[test]
    fn clamp_max_retries_clamps_to_cap() {
        let mut cfg = ReconnectConfig { max_retries: 999_999, ..ReconnectConfig::default() };
        cfg.clamp_max_retries();
        assert_eq!(cfg.max_retries, ReconnectConfig::MAX_RETRIES_CAP);
    }

    #[test]
    fn clamp_max_retries_keeps_valid_values() {
        let mut cfg = ReconnectConfig { max_retries: 42, ..ReconnectConfig::default() };
        cfg.clamp_max_retries();
        assert_eq!(cfg.max_retries, 42);
    }

    #[test]
    fn load_contract_invalid_schedule_is_disabled_not_fatal() {
        // Те, що робить Profile::load після parse: sanitize_on_load.
        // recurring із порожніми days — жорстко невалідний.
        let json = r#"{
            "name": "T",
            "scheduledRecordings": [{
                "id": "bad", "streamId": "s", "name": "Bad", "type": "recurring",
                "days": [], "time": "20:00", "durationMinutes": 60,
                "enabled": true, "createdAt": "2026-06-12T10:00:00+03:00"
            }]
        }"#;
        let mut p: Profile = serde_json::from_str(json).unwrap();
        crate::scheduler::validation::sanitize_on_load(&mut p);
        assert_eq!(p.scheduled_recordings.len(), 1, "рядок видно в таблиці");
        assert!(!p.scheduled_recordings[0].enabled, "невалідний розклад вимкнено");
        assert_eq!(p.scheduled_recordings[0].name, "Bad", "решта полів неушкоджена");
    }

    // --- Scheduler model (Phase 3D, Фаза 1) ---

    fn sample_recurring_schedule() -> ScheduledRecording {
        ScheduledRecording {
            id: "sch1".into(),
            stream_id: "st1".into(),
            name: "Evening Jazz".into(),
            schedule_type: ScheduleType::Recurring,
            days: vec![0, 1, 2, 3, 4],
            date: None,
            time: "20:00".into(),
            duration_minutes: 120,
            enabled: true,
            created_at: "2026-06-12T10:00:00+03:00".into(),
            last_result: None,
        }
    }

    #[test]
    fn scheduled_recording_serializes_camel_case() {
        let json = serde_json::to_string(&sample_recurring_schedule()).unwrap();
        assert!(json.contains("\"streamId\":\"st1\""), "got: {json}");
        assert!(json.contains("\"type\":\"recurring\""), "got: {json}");
        assert!(json.contains("\"days\":[0,1,2,3,4]"), "got: {json}");
        assert!(json.contains("\"durationMinutes\":120"), "got: {json}");
        assert!(json.contains("\"lastResult\":null"), "got: {json}");
    }

    #[test]
    fn scheduled_recording_deserializes_with_defaults() {
        // Мінімальний oneshot без days і lastResult — serde(default) заповнює їх
        let json = r#"{"id":"x","streamId":"s1","name":"N","type":"oneshot",
            "date":"2026-06-14","time":"08:30","durationMinutes":60,
            "enabled":true,"createdAt":"2026-06-12T10:00:00+03:00"}"#;
        let s: ScheduledRecording = serde_json::from_str(json).unwrap();
        assert_eq!(s.schedule_type, ScheduleType::Oneshot);
        assert!(s.days.is_empty());
        assert_eq!(s.date.as_deref(), Some("2026-06-14"));
        assert!(s.last_result.is_none());
    }

    #[test]
    fn schedule_result_serializes_status_and_reason_camel_case() {
        let r = ScheduleResult {
            occurrence: "2026-06-12T20:00".into(),
            status: ScheduleResultStatus::StartedLate,
            reason: Some(ScheduleResultReason::AppNotRunning),
            recorded_minutes: 80,
            finished_at: "2026-06-12T22:05:00+03:00".into(),
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("\"status\":\"startedLate\""), "got: {json}");
        assert!(json.contains("\"reason\":\"appNotRunning\""), "got: {json}");
        assert!(json.contains("\"recordedMinutes\":80"), "got: {json}");
        assert!(json.contains("\"finishedAt\""), "got: {json}");
    }

    #[test]
    fn schedule_result_roundtrip() {
        let r = ScheduleResult {
            occurrence: "2026-06-12T20:00".into(),
            status: ScheduleResultStatus::StoppedByUser,
            reason: Some(ScheduleResultReason::ProfileSwitch),
            recorded_minutes: 45,
            finished_at: "2026-06-12T21:00:00+03:00".into(),
        };
        let back: ScheduleResult =
            serde_json::from_str(&serde_json::to_string(&r).unwrap()).unwrap();
        assert_eq!(back.status, ScheduleResultStatus::StoppedByUser);
        assert_eq!(back.reason, Some(ScheduleResultReason::ProfileSwitch));
        assert_eq!(back.recorded_minutes, 45);
        assert_eq!(back.occurrence, "2026-06-12T20:00");
    }

    #[test]
    fn last_active_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&LastActive::Stream).unwrap(), "\"stream\"");
        assert_eq!(serde_json::to_string(&LastActive::File).unwrap(), "\"file\"");
    }

    #[test]
    fn player_session_defaults_last_active_none() {
        let s = PlayerSession::default();
        assert!(s.last_active.is_none());
    }

    #[test]
    fn player_session_without_last_active_still_loads() {
        // A profile written before this field existed must still deserialize.
        let json = r#"{"volume":0.5,"lastStreamId":"abc"}"#;
        let s: PlayerSession = serde_json::from_str(json).unwrap();
        assert!(s.last_active.is_none());
        assert_eq!(s.last_stream_id.as_deref(), Some("abc"));
    }

    #[test]
    fn player_session_round_trips_last_active() {
        let s = PlayerSession { last_active: Some(LastActive::File), ..Default::default() };
        let back: PlayerSession = serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap();
        assert_eq!(back.last_active, Some(LastActive::File));
    }
}
