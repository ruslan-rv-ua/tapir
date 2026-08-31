# Моделі даних Tapir

> **Версія:** 0.1 (draft) | **Версія продукту:** 0.1.0  
> Усі дані зберігаються у JSON. Кодування UTF-8. Форматування — pretty-print (2 пробіли).

---

## 1. Глобальні налаштування (`data/settings.json`)

> **Межа глобальне/профільне** проведена правилом трьох фільтрів —
> [ADR 2026-08-08](decisions/2026-08-08-global-vs-profile-settings-boundary.md).
> Коротко: машинозалежне, зареєстроване в ОС і «що робить натискання» —
> глобальне; «яким є набір даних і як він показаний» — профільне. Класифікуючи
> нове поле, спершу прогнати його через фільтри, а не через зручність читання.

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

  // Показувати назву треку в заголовку вікна
  "showTrackInTitle": true,

  // Дія при активації потоку (Enter / подвійний клік): "record" | "play"
  "doubleClickAction": "record",

  // Автозапуск з Windows
  "autostart": false,

  // Глобальні гарячі клавіші
  "hotkeys": {
    "toggleRecording": "Ctrl+Shift+R",
    "togglePlayback": "Ctrl+Shift+K",
    "volumeUp": "Ctrl+Alt+Up",
    "volumeDown": "Ctrl+Alt+Down",
    "toggleWindow": "Ctrl+Shift+H",
    "stopAll": "Ctrl+Shift+S",
    "prevTrack": "Ctrl+Alt+Left",
    "nextTrack": "Ctrl+Alt+Right"
  },

  // Logging
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
  showTrackInTitle: boolean;
  doubleClickAction: "record" | "play";
  autostart: boolean;
  autostartMinimized: boolean;
  hotkeys: HotkeyMap;
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
    pub show_track_in_title: bool,
    pub double_click_action: DoubleClickAction,
    pub autostart: bool,
    pub autostart_minimized: bool,
    pub hotkeys: HotkeyMap,
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
      // Заповнена, лише коли останній вердикт про ефір був «не пишемо»:
      // { "family": "OGG" } — сім'ю впізнано, { "family": null } — доказів
      // не вистачило ні на що. Взаємовиключна з format.
      "unsupportedCodec": null,
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
    // Зупинити запис при низькому місці на диску (ГБ). 0 = вимкнено.
    // Профільний: охороняє профільний outputDir.
    "diskSpaceThresholdGb": 1,
    "fileNameTemplate": "%s\\%a - %t",
    "incompleteFileNameTemplate": "%s\\%a - %t_incomplete",
    "streamFileNameTemplate": "%s\\stream_%d_%time",
    "saveStreamFile": true,
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
    "volume": 0.75,
    "lastActive": null,
    "lastStreamId": null,
    "lastFilePosition": null,
    "autoplayOnStartup": false,
    "autoAdvance": true,
    "resumeFileFrom": "position"
  },

  // Інтерфейс — профільний (ADR 2026-08-08, фільтр 4)
  "ui": {
    "streamSort": "name",
    "trayNotificationsTrackChange": true,
    "trayNotificationsScheduled": true
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
  ]
}
```

> **Phase 3K:** поле `activeRecordingUrls` (URL потоків, що записувалися при останньому виході) **прибрано** — писалось лише в `graceful_shutdown` і ніде на старті не читалось (мертве поле). Живий снапшот активних записів для crash recovery живе окремо, у `data/state.json` (§8 нижче), ключований стабільним `streamId`, а не URL.

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
  ui: UiSettings;
  playerSession: PlayerSession;
  savedTracks: SavedTrack[];
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
    pub ui: UiSettings,
    pub player_session: PlayerSession,
    pub saved_tracks: Vec<SavedTrack>,
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
  unsupportedCodec: { family: string | null } | null; // мітка відмови, див. нижче
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
    #[serde(default)]
    pub unsupported_codec: Option<UnsupportedCodec>,
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
#[serde(rename_all = "camelCase")]
pub struct UnsupportedCodec {
    #[serde(default)]
    pub family: Option<String>,   // "OGG" / "FLAC"; None — доказів не вистачило
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioFormat {
    Mp3,
    Aac,
}
```

**Формат і мітка кодека** — дві половини одного вердикту `stream::format::detect`
(`Content-Type`, далі магічні байти, без дефолту — ADR 2026-08-31): заповнена завжди
рівно одна з них, і обидві перезаписуються разом. `unsupportedCodec != null` означає,
що Tapir цього ефіру **не записує**: старт запису відмовляє, не створивши файлу й не
витративши спроби перепідключення, планувальник відмовляє **не з'єднуючись**, а Play
відмовляє одразу. Мітку кладе перевірка при додаванні (діалог, каталог, імпорт) або
попередня відмова; вона застаріває, як і `format`, і лікується наступним запуском
запису вручну.

**Автооновлення ICY полів:** Після першого підключення `recording_task` зберігає дані з ICY headers у профіль: `bitrate`, `format`, `icy_name`, `icy_genre`. Якщо `name == url` (користувач не вказав ім'я), `name` автоматично замінюється на `icy_name` — з антиколізійним суфіксом за правилами нижче. Профіль зберігається на диск, і emit-ується `stream-info-updated` event для оновлення фронтенду.

#### Розрізнення однакових імен (`src-tauri/src/naming.rs`)

`name` **не унікальне** — це водночас плейсхолдер `%s` у шаблонах запису, тобто
**тека на диску**. Одна станція часто віддає кілька потоків (Icecast mountpoints,
дзеркала) з однаковим `icy-name`, і Radio Browser їх не групує, тож однакові
імена — норма, а не помилка вводу. Правило: імена мають бути *розрізнюваними*,
а не примусово унікальними.

- **Ключ колізії** — санітизоване (`sanitize::sanitize_component`, тобто саме те,
  що стане текою) ім'я без урахування регістру: NTFS вважає `Radio X` і `radio x`
  однією текою, тож різниця лише в регістрі все одно злила б записи.
- **Суфікс присвоюється один раз, у момент додавання**, і надалі **ніколи не
  переглядається автоматично** — жодних «покращень» `(2)` → `(AAC 64k)` при
  пізніших підключеннях. Ім'я = тека: стабільність важливіша за точність, а ім'я,
  що змінюється саме, — брехня для скрінрідера.
- **Формат суфікса — ASCII, без локалізації** (ім'я це дані, не UI):
  `(AAC 64k)` → `(AAC)` / `(128k)`, якщо відома лише частина метаданих →
  порядковий `(2)`, якщо не відомо нічого. Якщо інформативний суфікс сам колізує
  (два ідентичні варіанти), порядковий додається поверх: `(AAC 64k) (2)`.
- **Джерела метаданих:** браузер станцій — `StationResult.codec`/`bitrate`;
  ручне додавання — probe із діалогу (`ProbeVerdict.icyName`/`bitrate`/`format`,
  вони ж зберігаються в потік); імпорт — батч-probe діалогу імпорту. Колізії
  перевіряються і проти профілю, і всередині партії.
- **Ім'я при додаванні без імені:** пріоритет — введене користувачем →
  `icy_name` з probe → URL як плейсхолдер. Тобто потік, доданий «просто за
  URL», одразу отримує людське ім'я (і теку), а не чекає першого запису;
  URL лишається іменем лише якщо probe провалився або станція не шле `icy-name`.
- **`%s` завжди бере `StreamInfo.name`,** ніколи сире ICY-ім'я: два mountpoints
  шлють однаковий `icy-name`, тож інакше їхні теки злилися б попри суфікси.
- **ICY-автоперейменування** застосовується лише поки `name == url` (потік ще не
  має людського імені). Ім'я, яке обрав користувач або каталог станцій, не
  перезаписується ніколи.
- **Ручне перейменування не блокується й не суфіксується мовчки** — діалог лише
  попереджає, що записи підуть в одну теку (`check_stream_conflicts`); явний
  вибір користувача поважається. Там же — попередження про дубль URL.
- **`icy_name` лишається офіційною назвою станції** і копіюється в `name` тільки
  явною дією (кнопка «Використати офіційну назву» в діалозі редагування).
- **Наявні профілі не мігруються** — правило діє лише вперед, на нові додавання
  та ICY-оновлення.

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
  | "appNotRunning" | "startFailed" | "clockChange" | "unsupportedCodec"
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
    UnsupportedCodec,
    ManualStop,
    ProfileSwitch,
    AppClosing,
    ScheduleEdited,
}
```

Правила валідації та семантика — спека Phase 3D §2.

### 3.4. RecordingSettings

```typescript
interface RecordingSettings {
  outputDir: string;                     // відносний (до data/) або абсолютний
  diskSpaceThresholdGb: number;          // 0 = перевірку вимкнено; охороняє outputDir
  fileNameTemplate: string;              // "%s\\%a - %t"
  incompleteFileNameTemplate: string;
  streamFileNameTemplate: string;
  saveStreamFile: boolean;
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

Зберігається у профілі (`data/profiles/<name>.tapirprofile`, поле
`playerSession`), **не** у `settings.json`. При дублюванні профілю resume-поля
(`lastActive`/`lastStreamId`/`lastFilePosition`) та `autoplayOnStartup`
скидаються (не копіюються); `volume` переноситься. На експорті ті самі поля
стрипаються (приватність + машинно-локальний абсолютний шлях), на імпорті
`autoplayOnStartup` клампиться в `false`.

```typescript
interface PlayerSession {
  volume: number;  // 0.0 — 1.0

  // Дискримінатор: яке джерело було активним останнім.
  // null — нічого не відтворювалось (або поле відсутнє — зворотна сумісність).
  lastActive?: "stream" | "file" | null;

  // ID останнього відтвореного потоку (стріму).
  // Записується при: старті відтворення стріму, зупинці стріму, виході з програми.
  lastStreamId?: string;

  // Позиція відновлення для файлів.
  // Записується при: старті відтворення файлу, паузі файлу, виході з програми.
  lastFilePosition?: {
    path: string;
    positionMs: number;
  };

  // Per-profile політика: при наступному запуску застосунку відновити останнє
  // відтворення (resume_last). Opt-in; відсутнє поле = false (зворотна сумісність).
  autoplayOnStartup: boolean;

  // Грати наступний трек, коли поточний файл дограв. Дефолт true.
  autoAdvance: boolean;

  // Звідки cold-start Ctrl+Shift+K відновлює файл. Дефолт "position".
  // Лежить поруч із autoplayOnStartup: «чи відновлювати» і «звідки» — одна фіча.
  resumeFileFrom: "position" | "start";
}
```

### UiSettings (`profile.ui`)

```typescript
interface UiSettings {
  streamSort: "name" | "added";           // порядок списку потоків цього профілю
  trayNotificationsTrackChange: boolean;  // тости про зміну треку
  trayNotificationsScheduled: boolean;    // тости про плановий запис
}
```

Обидва прапорці — **один** свідомий виняток із фільтра «зареєстроване в ОС»
(«нічний сценарій — тихо» є сценарною потребою), просто втілений двома полями:
категорій тостів дві, і вимикаються вони незалежно (ADR 2026-08-17 про
категорії тостів). Рахувати їх як два винятки не можна — поріг «2–3 винятки →
переглянути фільтр» із ADR 2026-08-08 цим не зачеплено.

Третя категорія — тости `notify_recording_toggle` / `notify_stop_all` — не
гейтиться ніколи й поля не має: вона єдиний слід фонового хоткея. Правило, за
яким категорія отримує прапорець, живе в `is_enabled` (`tray/notify.rs`):
вимикається те, що лишає інший слід.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSession {
    pub volume: f32,
    /// Дискримінатор джерела для toggle_playback / холодного старту.
    pub last_active: Option<LastActive>,
    pub last_stream_id: Option<String>,
    pub last_file_position: Option<FilePosition>,
    /// Per-profile autoplay-on-startup (resume-last-playback). `#[serde(default)]` = false.
    pub autoplay_on_startup: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
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
```

#### Семантика запису `lastActive` / `lastStreamId` / `lastFilePosition`

| Подія | `lastActive` | `lastStreamId` | `lastFilePosition` |
|---|---|---|---|
| Старт відтворення стріму | `"stream"` | ID потоку | без змін |
| Зупинка стріму (`stop`) | `"stream"` | ID потоку | без змін |
| Старт відтворення файлу | `"file"` | без змін | `{path, positionMs: 0}` |
| Пауза файлу | `"file"` | без змін | `{path, positionMs}` (поточна) |
| Вихід із програми (`graceful_shutdown`) | без змін | без змін | `positionMs` оновлюється (якщо файл грав) |

Превью-відтворення (Preview) **не** пише у `playerSession`; перезапуск після
превью не відновлює попередній стан превью.

`lastFilePosition.positionMs` персиститься **завжди**, незалежно від
`playerSession.resumeFileFrom`. Це поле лише вибирає, чи cold-start
`Ctrl+Shift+K` виконує `seek(positionMs)` (`position`, дефолт) чи стартує
файл з 0 (`start`) — рішення читається один раз у `resume_last`, `pause→resume`
у межах сесії його не бачить.

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
  sessionId: number;            // стабільний id сесії запису; reconnect не змінює (Phase 3D §3.3)
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
    pub session_id: u64,
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

### 4.6. ProfileSettingsView / ProfileSettingsPatch

Редагований зріз профілю — те, що читає й пише діалог профілю
(`get_profile_settings` / `update_profile_settings`), для активного профілю і для
неактивного однаково.

```typescript
interface ProfileSettings {          // = ProfileSettingsView на бекенді
  recording: RecordingSettings;
  ui: UiSettings;
  autoplayOnStartup: boolean;
  autoAdvance: boolean;
  resumeFileFrom: "position" | "start";
}

interface ProfileSettingsPatch {     // усі поля опційні
  recording?: RecordingSettings;
  ui?: UiSettings;
  autoplayOnStartup?: boolean;
  autoAdvance?: boolean;
  resumeFileFrom?: "position" | "start";
}
```

Чому патч, а не копія профілю: `save_detached` пише профіль цілком, тож запис
своєї копії затер би паралельні зміни — `lastResult` від планувальника, `volume`,
слід останнього відтворення. `recording` і `ui` їдуть секціями саме тому, що в
них немає жодного бекендового поля; `playerSession` — не може, тому три його поля
йдуть поокремо.

Застосування — чиста функція `Profile::apply_settings_patch`; вона ж клампить
`schedulePad*`, щоб межі не залежали від того, через яку гілку прийшов патч.
Команда **не створює** неіснуючий профіль: `Profile::load` віддає `NotFound`.

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

// stream-unsupported — ефір, який Tapir не записує (ADR 2026-08-31).
// Свідомо НЕ stream-error: стан потоку не стає `error`, спроба не витрачена,
// перепідключення не заплановано. family = "OGG" / "FLAC", або null, коли
// доказів не вистачило; готового рядка backend не віддає — текст складе Paraglide.
interface StreamUnsupportedPayload {
  streamId: string;
  family: string | null;
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

// scheduled-started / scheduled-skipped (Phase 3D §4)
interface ScheduledEventPayload {
  recordingId: string;          // ScheduledRecording.id
  streamId: string;
  name: string;                 // мітка розкладу — live region озвучує без рефетчу
}

// scheduled-completed: і в кінці вікна, і при StoppedByUser
interface ScheduledCompletedPayload {
  recordingId: string;
  streamId: string;
  name: string;
  status: "completed" | "startedLate" | "stoppedByUser";
  recordedMinutes: number;
}

// scheduled-missed
interface ScheduledMissedPayload {
  recordingId: string;
  streamId: string;
  name: string;
  reason: ScheduleResultReason | null;  // код — локалізує frontend (§5.6 спеки)
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
  "showTrackInTitle": true,
  "doubleClickAction": "record",
  "autostart": false,
  "autostartMinimized": true,
  "hotkeys": {
    "toggleRecording": "Ctrl+Shift+R",
    "togglePlayback": "Ctrl+Shift+K",
    "volumeUp": "Ctrl+Alt+Up",
    "volumeDown": "Ctrl+Alt+Down",
    "toggleWindow": "Ctrl+Shift+H",
    "stopAll": "Ctrl+Shift+S",
    "prevTrack": "Ctrl+Alt+Left",
    "nextTrack": "Ctrl+Alt+Right"
  },
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
    "volume": 0.75,
    "lastActive": null,
    "lastStreamId": null,
    "lastFilePosition": null,
    "autoplayOnStartup": false,
    "autoAdvance": true,
    "resumeFileFrom": "position"
  },
  "ui": {
    "streamSort": "name",
    "trayNotificationsTrackChange": true,
    "trayNotificationsScheduled": true
  },
  "savedTracks": []
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
    pub log_level: LogLevel,
    
    // Нові поля в майбутніх версіях додаються з #[serde(default)]
}
```

Backward compatibility: старі файли без нових полів читаються коректно завдяки `#[serde(default)]`. Нові поля отримують значення за замовчуванням.

---

## 8. Сесійний стан crash recovery (`data/state.json`, Phase 3K)

Окремий файл поряд із `settings.json` і `profiles/`, **не** частина профілю. Єдине
джерело правди для відновлення записів після аварійного завершення (вимкнення
живлення, `End Task`, паніка, зависання) — до Phase 3K це намагалося робити мертве
поле `Profile.activeRecordingUrls` (писалось лише при чистому виході, ніде не
читалось), яке ця фаза прибрала.

```jsonc
{
  // false при кожному старті програми (атомарний запис); true — лише в
  // graceful_shutdown, перед виходом. Відсутній/битий файл трактується так само,
  // як false (аварія), але з порожнім снапшотом — resume тоді no-op.
  "cleanShutdown": false,

  // Живий снапшот активних РУЧНИХ записів (планові через scheduler виключені —
  // їхній catch-up лежить у ScheduleManager). Оновлюється під час роботи, а не
  // лише на виході.
  "activeRecordings": [
    { "streamId": "abc123", "url": "https://ice1.somafm.com/groovesalad-256-mp3" },
    { "streamId": "def456" }
  ]
}
```

### TypeScript тип

```typescript
interface SessionState {
  cleanShutdown: boolean;
  activeRecordings: ActiveRecording[];
}

interface ActiveRecording {
  streamId: string;   // ключ матчингу на resume — StreamInfo.id активного профілю
  url?: string;        // ДІАГНОСТИЧНЕ поле (логи/читабельність); у матчингу участі не бере
}
```

### Rust struct

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveRecording {
    pub stream_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub clean_shutdown: bool,
    #[serde(default)]
    pub active_recordings: Vec<ActiveRecording>,
}
```

(`src-tauri/src/crash_recovery.rs` — джерело правди.)

### Семантика

| Аспект | Поведінка |
|---|---|
| `cleanShutdown` | `false` записано при кожному старті (`mark_session_start`, до читання попереднього стану для detection); переписано на `true` в `graceful_shutdown`, **останнім кроком** — після зупинки снапшот-писаря, стріму, плеєра й збереження профілю. Якщо писар не зупинити першим, його наступний тик перезапише `true` назад на `false` (спурйозний resume наступного старту). |
| Відсутній/битий файл | Трактується як аварія (`cleanShutdown = false`), але з **порожнім** снапшотом → resume — no-op, анонс мовчить (немає різниці між «перший запуск» і «аварія без активних записів»). |
| Ключ снапшота | `streamId` (= `StreamInfo.id`), **не** URL — стабільний, однозначно розв'язується у `StreamInfo` активного профілю (credentials, ignorelist); стійкий до редагування URL. Незіставлений `streamId` (потік видалили між снапшотом і рестартом) — промах, рахується в підсумку «N з M». |
| `url` у записі | Лише діагностика (логи, читабельність файлу) — у матчингу на resume участі не бере. |
| Живість снапшота | Пише **окрема tokio-задача** (`spawn_snapshot_writer`, spawn у setup-хуку `lib.rs` — не в `frontend_ready`, оскільки писар не емітить UI-подій): тригер `tokio::sync::Notify` на кожну зміну складу активних записів (старт/стоп/error) із debounce 500мс + `interval` 30с як safety net. Отже знімок «живих» записів ніколи не старіший за ~30с. |
| Атомарність запису | `write temp → rename` (той самий підхід, що `Profile::save`) — інший процес ніколи не бачить частково записаний JSON. |
| Resume на старті | При `cleanShutdown = false` і непорожньому снапшоті: кожен `streamId` розв'язується у `StreamInfo` активного профілю (`streams.iter().find(|st| st.id == stream_id)`), перевіряється вільне місце на диску, і запис стартує тим самим шляхом, що ручний/плановий старт. Незіставлений `streamId` або невдалий старт — промах у підсумку. |
| Анонс (NVDA) | Підсумок `{resumed, total}` обчислюється в setup-хуку, стешиться (`ResumeNotice`, той самий deferred-патерн, що `StartupPlan`/`StartupNotice`) і емітується подією `crash-resume` лише з `frontend_ready` (webview вже підписаний). Фронтенд (`useCrashResumeFeedback`) локалізує (uk plural forms) і озвучує через `LiveAnnouncer` (polite) + info-toast. Порожній снапшот → події `crash-resume` не буде взагалі → тиша (без хибних тривог на першому запуску чи чистому виході). |
| Часткові файли | MP3/AAC-файли з моменту збою (незафіналізовані, без ICY-тегу поточного треку) залишаються **без змін** — кадровий потік не потребує обов'язкової фіналізації, більшість плеєрів відтворять записану частину. Подія лише логується, файл не видаляється й не відновлюється. |
| Заплановані записи | Scheduler-owned потоки **виключені** зі снапшота (`manual_resume_stream_ids` фільтрує за парою `(streamId, sessionId)` з `owned_sessions()`) — їхнє відновлення після збою лежить у `ScheduleManager`, не в crash recovery. |

Докладніше про прийняті рішення й вимоги — [docs/backlog/done/p1-crash-recovery.md](backlog/done/p1-crash-recovery.md).
