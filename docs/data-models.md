# Моделі даних Tapir

> **Версія:** 0.1 (draft) | **Версія продукту:** 0.1.0  
> Усі дані зберігаються у JSON. Кодування UTF-8. Форматування — pretty-print (2 пробіли).

---

## 1. Глобальні налаштування (`data/settings.json`)

```jsonc
{
  // Мова: "uk-UA" | "en-US". Auto-detect при першому запуску через sys-locale
  "language": "uk-UA",

  // Тема: "auto" (Windows) | "dark" | "light"
  "theme": "auto",

  // Ім'я активного профілю. Має відповідати файлу data/profiles/{name}.tapirprofile
  "activeProfile": "Default",

  // Аудіо пристрій для програвача. null = системний за замовчуванням;
  // якщо збережений пристрій зник, при старті fallback до null без помилки
  "outputDevice": null,

  // Згортати до tray замість закриття
  "minimizeToTray": true,

  // Показувати сповіщення при зміні треку (balloon tip)
  "showTrayNotifications": true,

  // Показувати назву треку в заголовку вікна
  "showTrackInTitle": true,

  // Зупинити запис при низькому місці на диску (ГБ). 0 = вимкнено
  "diskSpaceThresholdGb": 1,

  // Дія при активації потоку (Enter / подвійний клік): "record" | "play"
  "doubleClickAction": "record",

  // Ліміт пропускної здатності (кБ/с). 0 = без ліміту
  "bandwidthLimitKbps": 0,

  // Автозапуск з Windows
  "autostart": false,

  // Глобальні гарячі клавіші
  "hotkeys": {
    "toggleRecording": "Ctrl+Shift+R",
    "togglePlayback": "Ctrl+Shift+P",
    "volumeUp": "Ctrl+Alt+Up",
    "volumeDown": "Ctrl+Alt+Down",
    "toggleWindow": "Ctrl+Shift+H",
    "stopAll": "Ctrl+Shift+S",
    "prevTrack": "Ctrl+Alt+Left",
    "nextTrack": "Ctrl+Alt+Right"
  },

  // Logging
  "logRotation": true,
  "logLevel": "info",
  "logMaxSizeMb": 10
}
```

### TypeScript тип

```typescript
interface GlobalSettings {
  language: "uk-UA" | "en-US";
  theme: "auto" | "dark" | "light";
  activeProfile: string;
  outputDevice: string | null;  // null або unavailable device => system default
  minimizeToTray: boolean;
  showTrayNotifications: boolean;
  showTrackInTitle: boolean;
  diskSpaceThresholdGb: number;
  doubleClickAction: "record" | "play";
  bandwidthLimitKbps: number;
  autostart: boolean;
  hotkeys: HotkeyMap;
  logRotation: boolean;
  logLevel: "error" | "warn" | "info" | "debug";
  logMaxSizeMb: number;
}

interface HotkeyMap {
  toggleRecording: string;
  togglePlayback: string;
  volumeUp: string;
  volumeDown: string;
  toggleWindow: string;
}
```

### Rust struct

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSettings {
    pub language: String,
    pub theme: Theme,
    pub active_profile: String,
    pub output_device: Option<String>,
    pub minimize_to_tray: bool,
    pub show_tray_notifications: bool,
    pub show_track_in_title: bool,
    pub disk_space_threshold_gb: u32,
    pub double_click_action: DoubleClickAction,
    pub bandwidth_limit_kbps: u32,
    pub autostart: bool,
    pub hotkeys: HotkeyMap,
    pub log_rotation: bool,
    pub log_level: LogLevel,
    pub log_max_size_mb: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Auto,
    Dark,
    Light,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DoubleClickAction {
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
```

---

## 2. Профіль (`data/profiles/{name}.tapirprofile`)

```jsonc
{
  "name": "Default",
  "version": 1,

  // Список потоків
  "streams": [
    {
      "id": "abc123",
      "url": "https://ice1.somafm.com/groovesalad-256-mp3",
      "name": "SomaFM Groove Salad",
      "format": "mp3",
      "bitrate": 256,
      // Ці поля заповнюються при першому підключенні
      "icyName": "SomaFM: Groove Salad",
      "icyGenre": "ambient",
      "icyUrl": "https://somafm.com",
      // Per-stream ignorelist
      "ignorelist": ["*jingle*", "*advertisement*"],
      // Basic auth (опціонально)
      // ⚠️ Паролі шифруються через Windows DPAPI (CryptProtectData)
      // перед збереженням у профіль. Формат зберігання: "DPAPI:<base64>"
      // Дешифрування можливе тільки на тій самій машині тим самим користувачем.
      // При експорті профілю паролі оминаються (password: null).
      "username": null,
      "password": null,
      // Дата додавання
      "addedAt": "2026-01-15T10:30:00"
    }
  ],

  // Wishlist — автоматичний запис за патерном
  "wishlist": [
    {
      "pattern": "Tycho - *",
      "minBitrate": 128,
      "format": null,
      "removeAfterRecord": false,
      "addToIgnorelistAfterRecord": true,
      "addedAt": "2026-01-20T14:00:00"
    }
  ],

  // Глобальний ignorelist (не per-stream)
  "ignorelist": [
    "*commercial*",
    "*advertisement*"
  ],

  // Заплановані записи
  "scheduledRecordings": [
    {
      "id": "sched001",
      "streamId": "abc123",
      "name": "Evening Jazz",
      "type": "recurring",
      "days": [4],
      "date": null,
      "time": "20:00",
      "durationMinutes": 120,
      "enabled": true,
      "createdAt": "2026-01-25T09:00:00",
      "lastResult": null
    }
  ],

  // Налаштування запису
  "recording": {
    "outputDir": "recordings",
    "fileNameTemplate": "%s\\%a - %t",
    "incompleteFileNameTemplate": "%s\\%a - %t_incomplete",
    "streamFileNameTemplate": "%s\\stream_%d_%time",
    "saveStreamFile": true,
    "deleteStreamFileOnStop": false,
    "skipFirstIncompleteTrack": true,
    "skipShortTracksMs": 30000,
    "autoCorrectCase": true,
    "schedulePadBeforeMin": 0,
    "schedulePadAfterMin": 0,
    "reconnect": {
      "maxRetries": 0,
      "retryIntervalSecs": 5,
      "backoffMultiplier": 1.5,
      "maxIntervalSecs": 300
    }
  },

  // Постобробка
  "postprocess": {
    "enabled": false,
    "command": "",
    "arguments": "%file",
    "timeoutSecs": 120,
    "runOnComplete": true,
    "runOnIncomplete": false
  },

  // Сесія програвача
  "playerSession": {
    "volume": 0.75
  },

  // Збережені треки (lightweight metadata, не файли)
  "savedTracks": [
    {
      "path": "recordings/SomaFM Groove Salad/Tycho - A Walk.mp3",
      "artist": "Tycho",
      "title": "A Walk",
      "album": "",
      "station": "SomaFM Groove Salad",
      "format": "mp3",
      "bitrate": 256,
      "durationMs": 245000,
      "sizeBytes": 7840000,
      "isComplete": true,
      "isWishlistMatch": false,
      "recordedAt": "2026-01-15T22:15:30"
    }
  ],

  // URL потоків, що записувалися при останньому виході
  "activeRecordingUrls": []
}
```

### TypeScript тип

```typescript
interface Profile {
  name: string;
  version: number;
  streams: StreamInfo[];
  wishlist: WishlistEntry[];
  ignorelist: string[];
  scheduledRecordings: ScheduledRecording[];
  recording: RecordingSettings;
  postprocess: PostprocessConfig;
  playerSession: PlayerSession;
  savedTracks: SavedTrack[];
  activeRecordingUrls: string[];  // URL потоків, що записувалися при закритті; заповнюється при graceful shutdown, очищується після відновлення
}
```

### Rust struct

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub name: String,
    pub version: u32,
    pub streams: Vec<StreamInfo>,
    pub wishlist: Vec<WishlistEntry>,
    pub ignorelist: Vec<String>,
    pub scheduled_recordings: Vec<ScheduledRecording>,
    pub recording: RecordingSettings,
    pub postprocess: PostprocessConfig,
    pub player_session: PlayerSession,
    pub saved_tracks: Vec<SavedTrack>,
    pub active_recording_urls: Vec<String>,
}
```

---

## 3. Вкладені типи

### 3.1. StreamInfo

```typescript
interface StreamInfo {
  id: string;                    // nanoid, 21 символ (алфавіт: A-Za-z0-9_-), crate `nanoid`
  url: string;                   // resolved URL (після PLS/M3U parsing)
  name: string;                  // user-defined або ICY name
  format: "mp3" | "aac" | null; // визначається при першому підключенні
  bitrate: number | null;        // з ICY headers, кбіт/с
  icyName: string | null;        // icy-name заголовок
  icyGenre: string | null;       // icy-genre заголовок
  icyUrl: string | null;         // icy-url заголовок
  ignorelist: string[];           // per-stream ignorelist patterns
  username: string | null;        // HTTP basic auth
  password: string | null;
  addedAt: string;                // ISO 8601 datetime
}
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    pub id: String,
    pub url: String,
    pub name: String,
    pub format: Option<AudioFormat>,
    pub bitrate: Option<u32>,
    pub icy_name: Option<String>,
    pub icy_genre: Option<String>,
    pub icy_url: Option<String>,
    pub ignorelist: Vec<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioFormat {
    Mp3,
    Aac,
}
```

**Автооновлення ICY полів:** Після першого підключення `recording_task` зберігає дані з ICY headers у профіль: `bitrate`, `format`, `icy_name`, `icy_genre`. Якщо `name == url` (користувач не вказав ім'я), `name` автоматично замінюється на `icy_name`. Профіль зберігається на диск, і emit-ується `stream-info-updated` event для оновлення фронтенду.

### 3.2. WishlistEntry

```typescript
interface WishlistEntry {
  pattern: string;             // wildcard: "Tycho - *", "?onobo*"
  minBitrate: number | null;   // мінімальний бітрейт, null = будь-який
  format: "mp3" | "aac" | null;
  removeAfterRecord: boolean;
  addToIgnorelistAfterRecord: boolean;
  addedAt: string;
}
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WishlistEntry {
    pub pattern: String,
    pub min_bitrate: Option<u32>,
    pub format: Option<AudioFormat>,
    pub remove_after_record: bool,
    pub add_to_ignorelist_after_record: bool,
    pub added_at: String,
}
```

### 3.3. ScheduledRecording

```typescript
interface ScheduledRecording {
  id: string;
  streamId: string;             // references StreamInfo.id активного профілю
  name: string;                 // мітка користувача, напр. "Evening Jazz"
  type: "oneshot" | "recurring";
  days: number[];               // recurring: 0=Пн..6=Нд, непорожній, без дублікатів; oneshot: []
  date: string | null;          // oneshot: ISO-дата "2026-06-14"; recurring: null
  time: string;                 // початок "HH:MM" (24h, локальний час)
  durationMinutes: number;      // 1..=1439
  enabled: boolean;
  createdAt: string;
  lastResult: ScheduleResult | null;  // пише лише backend
}

interface ScheduleResult {
  occurrence: string;           // "2026-06-12T20:00" — номінальний локальний час входження
  status: "completed" | "startedLate" | "missed" | "stoppedByUser" | "skippedAlreadyRecording";
  reason: ScheduleResultReason | null;  // лише для missed / stoppedByUser
  recordedMinutes: number;      // wall-clock; 0 — не стартував
  finishedAt: string;           // ISO datetime фіксації статусу
}

type ScheduleResultReason =
  // missed:
  | "appNotRunning" | "startFailed" | "clockChange"
  // stoppedByUser:
  | "manualStop" | "profileSwitch" | "appClosing" | "scheduleEdited";
```

```rust
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
    pub stream_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub schedule_type: ScheduleType,
    #[serde(default)]
    pub days: Vec<u8>,                // recurring: 0=Пн..6=Нд; oneshot: порожній
    #[serde(default)]
    pub date: Option<String>,
    pub time: String,
    pub duration_minutes: u32,        // 1..=1439
    pub enabled: bool,
    pub created_at: String,
    #[serde(default)]
    pub last_result: Option<ScheduleResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleResult {
    pub occurrence: String,
    pub status: ScheduleResultStatus,
    #[serde(default)]
    pub reason: Option<ScheduleResultReason>,
    pub recorded_minutes: u32,
    pub finished_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScheduleResultStatus {
    Completed,
    StartedLate,
    Missed,
    StoppedByUser,
    SkippedAlreadyRecording,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScheduleResultReason {
    AppNotRunning,
    StartFailed,
    ClockChange,
    ManualStop,
    ProfileSwitch,
    AppClosing,
    ScheduleEdited,
}
```

Правила валідації та семантика — [спека Phase 3D](superpowers/specs/2026-06-12-scheduler-design.md) §2.

### 3.4. RecordingSettings

```typescript
interface RecordingSettings {
  outputDir: string;                     // відносний (до data/) або абсолютний
  fileNameTemplate: string;              // "%s\\%a - %t"
  incompleteFileNameTemplate: string;
  streamFileNameTemplate: string;
  saveStreamFile: boolean;
  deleteStreamFileOnStop: boolean;
  skipFirstIncompleteTrack: boolean;
  skipShortTracksMs: number;             // 0 = не пропускати
  autoCorrectCase: boolean;              // "artist - title" → "Artist - Title" (Phase 1: включено, реалізовано у sanitize.rs)
  schedulePadBeforeMin: number;          // 0–30 хв, запас перед стартом планового запису
  schedulePadAfterMin: number;           // 0–60 хв, запас після кінця
  reconnect: ReconnectConfig;
}

interface ReconnectConfig {
  maxRetries: number;          // 0 = нескінченно
  retryIntervalSecs: number;
  backoffMultiplier: number;
  maxIntervalSecs: number;
}
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingSettings {
    pub output_dir: String,
    pub file_name_template: String,
    pub incomplete_file_name_template: String,
    pub stream_file_name_template: String,
    pub save_stream_file: bool,
    pub delete_stream_file_on_stop: bool,
    pub skip_first_incomplete_track: bool,
    pub skip_short_tracks_ms: u32,
    pub auto_correct_case: bool,
    #[serde(default)]
    pub schedule_pad_before_min: u32,
    #[serde(default)]
    pub schedule_pad_after_min: u32,
    pub reconnect: ReconnectConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconnectConfig {
    pub max_retries: u32,
    pub retry_interval_secs: u32,
    pub backoff_multiplier: f32,
    pub max_interval_secs: u32,
}
```

### 3.5. PostprocessConfig

```typescript
interface PostprocessConfig {
  enabled: boolean;
  command: string;          // шлях до exe або скрипту
  arguments: string;        // "%file" замінюється на шлях до файлу; приклад: "--preset radio %file"
  timeoutSecs: number;
  runOnComplete: boolean;
  runOnIncomplete: boolean;
}

Приклади `arguments`:

```text
%file
--preset radio %file
--input %file --output %file.processed.mp3
```

Плейсхолдери:
- `%file` — абсолютний шлях до записаного файлу
- Інші `%...` плейсхолдери не підтримуються у v0.1.0
```

```rust
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
```

### 3.6. SavedTrack

```typescript
interface SavedTrack {
  path: string;              // відносний до outputDir
  artist: string;
  title: string;
  album: string;
  station: string;
  format: "mp3" | "aac";
  bitrate: number;
  durationMs: number;
  sizeBytes: number;
  isComplete: boolean;
  isWishlistMatch: boolean;
  recordedAt: string;         // ISO 8601
}
```

```rust
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
```

### 3.7. PlayerSession

```typescript
interface PlayerSession {
  volume: number;  // 0.0 — 1.0
  lastStreamId?: string;      // ID останнього відтвореного потоку
  lastFilePosition?: {        // для файлів: resume position
    path: string;
    positionMs: number;
  };
}
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSession {
    pub volume: f32,
    pub last_stream_id: Option<String>,
    pub last_file_position: Option<FilePosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePosition {
    pub path: String,
    pub position_ms: u64,
}
```

---

## 4. Runtime-only типи (не зберігаються на диск)

Ці типи використовуються в IPC та стані програми, але не персистяться.

### 4.1. StreamStatus

```typescript
interface StreamStatus {
  streamId: string;
  state: "idle" | "connecting" | "recording" | "reconnecting" | "error";
  currentTrack: TrackInfo | null;
  recordingStartedAt: string | null;
  bytesRecorded: number;
  tracksRecorded: number;
  error: string | null;
  reconnectAttempt: number | null;
}

interface TrackInfo {
  artist: string;
  title: string;
  album: string;
  startedAt: string;
}
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamStatus {
    pub stream_id: String,
    pub state: StreamState,
    pub current_track: Option<TrackInfo>,
    pub recording_started_at: Option<String>,
    pub bytes_recorded: u64,
    pub tracks_recorded: u32,
    pub error: Option<String>,
    pub reconnect_attempt: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StreamState {
    Idle,
    Connecting,
    Recording,
    Reconnecting,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackInfo {
    pub artist: String,
    pub title: String,
    pub album: String,
    pub started_at: String,
}
```

### 4.2. PlayerStatus

```typescript
interface PlayerStatus {
  state: "stopped" | "playing" | "paused";
  source: { type: "stream"; streamId: string } | { type: "file"; path: string } | null;
  volume: number;
  positionMs: number | null;   // null для live stream
  durationMs: number | null;   // null для live stream
}
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStatus {
    pub state: PlaybackState,
    pub source: Option<PlaybackSource>,
    pub volume: f32,
    pub position_ms: Option<u64>,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackState {
    Stopped,
    Playing,
    Paused,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PlaybackSource {
    Stream { stream_id: String },
    File { path: String },
}
```

### 4.3. StationResult (Radio Browser API)

```typescript
interface StationResult {
  stationuuid: string;
  name: string;
  url: string;
  urlResolved: string;
  codec: string;          // "MP3", "AAC", "AAC+"
  bitrate: number;
  country: string;
  countrycode: string;    // ISO 3166-1 (e.g. "UA", "DE")
  tags: string;           // comma-separated
  language: string;
  votes: number;
  clickcount: number;
  hasExtendedInfo: boolean | null;
  homepage: string;
  lastcheckok: number;    // 1 = OK, 0 = failed
}
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationResult {
    pub stationuuid: String,
    pub name: String,
    pub url: String,
    #[serde(default, alias = "url_resolved")]
    pub url_resolved: String,
    pub codec: String,
    pub bitrate: u32,
    pub country: String,
    #[serde(alias = "countrycode")]
    pub countrycode: String,
    pub tags: String,
    pub language: String,
    pub votes: i32,
    #[serde(alias = "clickcount")]
    pub clickcount: u32,
    #[serde(default, alias = "has_extended_info")]
    pub has_extended_info: Option<bool>,
    #[serde(default)]
    pub homepage: String,
    #[serde(alias = "lastcheckok")]
    pub lastcheckok: i8,
}
```

### 4.4. AudioDevice

```typescript
interface AudioDevice {
  name: string;
  isDefault: boolean;
}
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub name: String,
    pub is_default: bool,
}
```

### 4.5. ProfileMeta

```typescript
interface ProfileMeta {
  name: string;
  path: string;
  streamCount: number;
  isActive: boolean;
}
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMeta {
    pub name: String,
    pub path: String,
    pub stream_count: usize,
    pub is_active: bool,
}
```

---

## 5. IPC Event Payloads

Payload типи для Tauri events (backend → frontend).

```typescript
// track-changed
interface TrackChangedPayload {
  streamId: string;
  artist: string;
  title: string;
  album: string;
}

// recording-status
interface RecordingStatusPayload {
  streamId: string;
  status: "connecting" | "recording" | "stopped" | "error" | "reconnecting";
  error?: string;
}

// recording-started
interface RecordingStartedPayload {
  streamId: string;
  fileName: string;
}

// recording-completed
interface RecordingCompletedPayload {
  streamId: string;
  fileName: string;
  durationMs: number;
}

// stream-error
interface StreamErrorPayload {
  streamId: string;
  message: string;
  willRetry: boolean;
}

// stream-info-updated — після підключення, коли ICY headers оновили профіль потоку
// Payload = повна структура StreamInfo (див. розділ 1)
// Frontend оновлює $streams store для відображення bitrate, icy_name, format тощо.
// Якщо name потоку == URL (не вказано користувачем), name автоматично замінюється на icy_name.

// player-status — payload = повний PlayerStatus struct (див. §4.2)
// Емітується при play/pause/stop/device change/set_volume.
// Frontend зберігає в $playerStatus store.

// player-progress — кожну 1с під час file playback
interface PlayerProgressPayload {
  positionMs: number;
  durationMs: number;
}

// scheduled-started / scheduled-completed
interface ScheduledEventPayload {
  recordingId: string;
  streamId: string;
}

// scheduled-missed
interface ScheduledMissedPayload {
  recordingId: string;
  reason: string;
}

// wishlist-match
interface WishlistMatchPayload {
  streamId: string;
  artist: string;
  title: string;
  pattern: string;
}

// disk-space-low
interface DiskSpaceLowPayload {
  availableGb: number;
  thresholdGb: number;
}

// profile-changed
interface ProfileChangedPayload {
  profile: Profile;
}

// postprocess-started
interface PostprocessStartedPayload {
  fileName: string;
}

// postprocess-completed
interface PostprocessCompletedPayload {
  fileName: string;
  success: boolean;
  output?: string;
}

// postprocess-error
interface PostprocessErrorPayload {
  fileName: string;
  error: string;
}
```

---

## 6. Defaults (значення за замовчуванням)

### settings.json

```json
{
  "language": "en-US",
  "theme": "auto",
  "activeProfile": "Default",
  "outputDevice": null,
  "minimizeToTray": true,
  "showTrayNotifications": true,
  "showTrackInTitle": true,
  "diskSpaceThresholdGb": 1,
  "doubleClickAction": "record",
  "bandwidthLimitKbps": 0,
  "autostart": false,
  "hotkeys": {
    "toggleRecording": "Ctrl+Shift+R",
    "togglePlayback": "Ctrl+Shift+P",
    "volumeUp": "Ctrl+Alt+Up",
    "volumeDown": "Ctrl+Alt+Down",
    "toggleWindow": "Ctrl+Shift+H",
    "stopAll": "Ctrl+Shift+S",
    "prevTrack": "Ctrl+Alt+Left",
    "nextTrack": "Ctrl+Alt+Right"
  },
  "logRotation": true,
  "logLevel": "info",
  "logMaxSizeMb": 10
}
```

### Default.tapirprofile

```json
{
  "name": "Default",
  "version": 1,
  "streams": [],
  "wishlist": [],
  "ignorelist": [],
  "scheduledRecordings": [],
  "recording": {
    "outputDir": "recordings",
    "fileNameTemplate": "%s\\%a - %t",
    "incompleteFileNameTemplate": "%s\\%a - %t_incomplete",
    "streamFileNameTemplate": "%s\\stream_%d_%time",
    "saveStreamFile": true,
    "deleteStreamFileOnStop": false,
    "skipFirstIncompleteTrack": true,
    "skipShortTracksMs": 30000,
    "autoCorrectCase": true,
    "schedulePadBeforeMin": 0,
    "schedulePadAfterMin": 0,
    "reconnect": {
      "maxRetries": 0,
      "retryIntervalSecs": 5,
      "backoffMultiplier": 1.5,
      "maxIntervalSecs": 300
    }
  },
  "postprocess": {
    "enabled": false,
    "command": "",
    "arguments": "%file",
    "timeoutSecs": 120,
    "runOnComplete": true,
    "runOnIncomplete": false
  },
  "playerSession": {
    "volume": 0.75
  },
  "savedTracks": [],
  "activeRecordingUrls": []
}
```

---

## 7. Міграція даних

При зміні schema version:

1. Читаємо JSON
2. Перевіряємо `version` (для профілів) або наявність нових полів (для settings)
3. Додаємо відсутні поля з default значеннями (`#[serde(default)]`)
4. Зберігаємо оновлену версію

```rust
// Serde забезпечує forward compatibility через default values:
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSettings {
    #[serde(default = "default_language")]
    pub language: String,
    
    #[serde(default)]
    pub log_rotation: bool,
    #[serde(default)]
    pub log_level: LogLevel,
    
    // Нові поля в майбутніх версіях додаються з #[serde(default)]
}
```

Backward compatibility: старі файли без нових полів читаються коректно завдяки `#[serde(default)]`. Нові поля отримують значення за замовчуванням.
