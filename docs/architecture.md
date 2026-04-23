# Архітектура Tapir

> **Версія:** 0.1 (draft) | **Версія продукту:** 0.1.0  
> **Стек:** Tauri v2 + React 19 + React Aria + Rust  
> **Платформа:** Windows 11+, portable EXE

> **Примітка (2026-04-23):** згадки про table/grid-компоненти та стару модель списків у цьому документі описують поточну або історичну архітектуру. Для навігаційного refactor у гілці `feature/nav` джерелом істини є `docs/FRD-navigation.md`.

---

## 1. Огляд

Tapir — двошаровий десктопний додаток, побудований на Tauri v2:

- **Backend (Rust)** — усе, що стосується аудіо, мережі, файлів, стану
- **Frontend (React)** — лише UI та реактивне відображення стану

Зв'язок між шарами — виключно через **Tauri IPC**: команди (frontend → backend) та події (backend → frontend).

### Принцип: backend-first

Весь стан живе в Rust. Frontend — тонкий presentation layer:

- Frontend **не зберігає** стан (окрім локального UI-стану: відкриті діалоги, input values)
- Frontend **не здійснює** HTTP-запитів (окрім тих, що напряму отримує через Tauri-конфіг → Radio Browser API)
- Frontend **не пише файли** — усі файлові операції виконуються backend

```
┌────────────────────────────────┐
│   React 19 + React Aria        │  Presentation layer
│   (WebView2 / Chromium)        │  - ARIA-розмітка, keyboard nav
│                                │  - Nanostores (UI state mirror)
└────────────┬───────────────────┘
             │ invoke() / listen()
             │ Tauri IPC (JSON serialization)
┌────────────▼───────────────────┐
│   Rust Backend                  │  Application layer
│   (tokio async runtime)        │  - StreamManager, Player, Scheduler
│                                │  - Settings, Profiles, Tags
│                                │  - File I/O, logging
└────────────────────────────────┘
```

---

## 2. Модульна структура (Rust Backend)

```
src-tauri/src/
├── main.rs                    # Entry point
├── lib.rs                     # Tauri Builder setup
├── app_state.rs               # AppState (shared state container)
├── commands/                  # Tauri IPC command handlers
│   ├── mod.rs
│   ├── stream_commands.rs     # start/stop recording, get stream status
│   ├── player_commands.rs     # play/pause/stop, volume, device
│   ├── browser_commands.rs    # search stations, add station
│   ├── settings_commands.rs   # load/save settings
│   ├── profile_commands.rs    # CRUD profiles, switch profile
│   ├── wishlist_commands.rs   # wishlist/ignorelist operations
│   ├── schedule_commands.rs   # CRUD scheduled recordings
│   ├── songs_commands.rs      # list/delete/tag saved songs
│   └── postprocess_commands.rs
├── stream/                    # Core recording engine
│   ├── mod.rs
│   ├── manager.rs             # StreamManager — координатор усіх потоків
│   ├── connection.rs          # HTTP connection + ICY metadata
│   ├── recorder.rs            # File writer (raw bytes → stream file + tracks)
│   ├── splitter.rs            # Track splitting by ICY metadata
│   ├── format.rs              # Format detection (MP3/AAC)
│   └── playlist.rs            # PLS/M3U parser
├── player/                    # Audio playback engine
│   ├── mod.rs
│   └── engine.rs              # rodio + symphonia, device selection
├── scheduler/                 # Scheduled recordings
│   ├── mod.rs
│   └── timer.rs               # Per-minute check loop
├── browser/                   # Radio Browser API client
│   ├── mod.rs
│   └── api.rs                 # REST client for radio-browser.info
├── tags/                      # Audio metadata
│   ├── mod.rs
│   └── writer.rs              # lofty wrapper (ID3 + M4A)
├── wishlist/                  # Wishlist / Ignorelist
│   ├── mod.rs
│   └── matcher.rs             # Wildcard matching logic
├── postprocess/               # Post-recording processing
│   ├── mod.rs
│   └── runner.rs              # External script execution
├── settings.rs                # Global settings (data/settings.json)
├── profile.rs                 # Profile management (.tapirprofile)
├── portable.rs                # Portable path helpers (next to EXE)
├── sanitize.rs                # Filename sanitization, template rendering
└── errors.rs                  # Error types (thiserror)
```

### Відповідальність модулів

| Модуль | Відповідальність | Залежності |
|---|---|---|
| `app_state` | Центральний контейнер стану, доступний через `tauri::State` | `stream`, `player`, `settings`, `profile` |
| `commands/*` | Тонкі обгортки: дістають `AppState`, делегують логіку модулям, серіалізують результат | `app_state`, відповідний модуль |
| `stream::manager` | Координує всі активні потоки; створює/зупиняє записи | `stream::connection`, `stream::recorder` |
| `stream::connection` | HTTP з'єднання з ICY; отримує raw bytes та метадані | `reqwest`, `icy-metadata` |
| `stream::recorder` | Пише raw bytes у файл; розділяє треки за метаданими | `stream::splitter`, `tags`, `sanitize` |
| `stream::splitter` | Логіка розділення: коли метадані змінюються → фіналізувати попередній трек, розпочати новий | — |
| `player::engine` | Створює sink через rodio 0.22 (`DeviceSinkBuilder`/`MixerDeviceSink`/`Player`); live playback через незалежне HTTP-з'єднання з rtrb SPSC ring buffer та `LiveSource` (symphonia); файлове відтворення через `rodio::Decoder`; volume/device | `rodio`, `symphonia`, `rtrb`, `stream::connection` |
| `scheduler::timer` | Перевіряє заплановані записи щохвилини; делегує `stream::manager` | `stream::manager` |
| `browser::api` | REST клієнт Radio Browser API | `reqwest` |
| `tags::writer` | Пише ID3v2 / M4A теги після завершення запису треку | `lofty` |
| `wishlist::matcher` | Порівнює ICY metadata з wishlist/ignorelist (wildcard) | — |
| `postprocess::runner` | Запуск зовнішньої програми з аргументами, timeout | `tokio::process` |
| `settings` | Read/write `data/settings.json` | `serde_json`, `portable` |
| `profile` | Read/write `.tapirprofile` файлів; switch profile | `serde_json`, `portable` |
| `portable` | Визначення шляху до EXE, формування шляхів для data | `std::env` |
| `sanitize` | Санітизація імен файлів, рендеринг шаблонів `%a`, `%t`, колізії | — |

---

## 3. Модульна структура (Frontend)

> **Фази:** Компоненти без позначки — Фаза 1. Компоненти з позначкою — див. вказану фазу.

```
src/
├── index.html
├── main.tsx                   # React entry, Tauri event listeners init
├── App.tsx                    # Root: ActivityBar + Content layout
├── components/
│   ├── layout/
│   │   ├── ActivityBar.tsx     # Left sidebar: section icons + ⚙️ gear + profile switcher
│   │   ├── SectionHeader.tsx   # Top: section title + command palette trigger
│   │   └── StatusBar.tsx      # Bottom: recording count, disk space, longest recording
│   ├── streams/
│   │   ├── StreamsPanel.tsx   # Tab panel: stream list + controls
│   │   ├── StreamTable.tsx    # React Aria TableView (sortable, NO drag-and-drop)
│   │   │                      # Reorder via context menu ↑/↓ (keyboard accessible)
│   │   ├── StreamRow.tsx      # Row: status, station, track, bitrate
│   │   └── AddStreamDialog.tsx  # Add / Edit stream (dual-mode dialog)
│   ├── player/                          # [Phase 2]
│   │   ├── PlayerPanel.tsx    # Playback controls bar
│   │   ├── VolumeSlider.tsx   # React Aria Slider
│   │   └── PlaybackPosition.tsx # Slider (file seek) / ProgressBar (live)
│   ├── browser/                         # [Phase 3]
│   │   ├── BrowserPanel.tsx   # Tab panel: stream browser
│   │   ├── SearchForm.tsx     # ComboBox + filters
│   │   └── ResultsTable.tsx   # Search results table
│   ├── songs/                           # [Phase 4]
│   │   ├── SongsPanel.tsx     # Tab panel: saved songs
│   │   ├── SongsTable.tsx     # Saved songs table (sortable, filterable)
│   │   └── TagEditor.tsx      # Edit tags dialog
│   ├── schedule/                        # [Phase 3]
│   │   ├── SchedulePanel.tsx  # Tab panel: scheduled recordings
│   │   ├── ScheduleTable.tsx
│   │   └── ScheduleForm.tsx   # Add/edit scheduled recording
│   ├── settings/                        # [Phase 2]
│   │   ├── SettingsDialog.tsx  # Full-screen dialog (⚙️ gear / Ctrl+,)
│   │   ├── SettingsNav.tsx    # Left sidebar navigation within dialog
│   │   ├── GeneralSettings.tsx
│   │   ├── RecordingSettings.tsx
│   │   ├── HotkeySettings.tsx
│   │   ├── ProfileManager.tsx
│   │   └── PostprocessSettings.tsx
│   ├── wishlist/                        # [Phase 2]
│   │   ├── WishlistPanel.tsx
│   │   └── WishlistTable.tsx
│   └── common/
│       ├── LiveAnnouncer.tsx  # Screen reader announcements
│       ├── ConfirmDialog.tsx  # Accessible confirmation dialog
│       ├── CommandPalette.tsx # Ctrl+K: fuzzy search actions, stations, songs
│       ├── ProfileSwitcher.tsx # Profile popover [Phase 4, Phase 1: UI placeholder]
│       ├── ToastContainer.tsx # Toast notifications (bottom-right)
│       ├── UndoToast.tsx      # Undo toast for mild-destructive actions (delete stream, wishlist entry)
│       ├── KeyboardShortcutsModal.tsx # F1: повна таблиця shortcuts, role="dialog"
│       └── ErrorBoundary.tsx
├── stores/                    # Nanostores — Tauri IPC bridge
│   ├── streams.ts             # Stream list + recording states
│   ├── player.ts              # Playback state [Phase 2]
│   ├── browser.ts             # Search results [Phase 3]
│   ├── songs.ts               # Saved songs [Phase 4]
│   ├── schedule.ts            # Scheduled recordings [Phase 3]
│   ├── settings.ts            # Global settings mirror
│   ├── profile.ts             # Active profile data
│   ├── navigation.ts          # Active section, command palette state
│   ├── toasts.ts              # Toast notification queue
│   └── announcer.ts           # Queue for screen reader announcements
├── hooks/
│   ├── useTauriEvent.ts       # listen() wrapper for React lifecycle
│   └── useAnnounce.ts         # Announce via LiveAnnouncer
├── i18n/
│   ├── messages/
│   │   ├── en.json
│   │   └── uk.json
│   └── paraglide/             # Auto-generated
├── lib/
│   ├── tauri.ts               # Typed invoke() wrappers
│   └── formatters.ts          # Duration, bitrate, date formatting
└── styles.css                 # Tailwind v4 entry + custom properties
```

---

## 4. AppState (центральний стан)

```rust
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct AppState {
    pub stream_manager: Arc<RwLock<StreamManager>>,
    pub player: Arc<RwLock<PlayerEngine>>,       // Phase 2. Phase 1: ініціалізується no-op stub
    pub scheduler: Arc<RwLock<Scheduler>>,        // Phase 3. Phase 1: ініціалізується no-op stub
    pub settings: Arc<RwLock<GlobalSettings>>,
    pub active_profile: Arc<RwLock<Profile>>,
}
```

### Правила доступу до стану

1. **Команди** отримують `AppState` через `tauri::State<AppState>`
2. **Блокування мінімальне**: `RwLock` з коротким scope. Ніколи не тримати lock через `.await`
3. **Великі операції** (запис файлу, мережевий запит) — поза lock
4. **Stream state** живе всередині `StreamManager`, не в `AppState` напряму

```rust
// Правильно — короткий lock
#[tauri::command]
async fn get_streams(state: tauri::State<'_, AppState>) -> Result<Vec<StreamInfo>, String> {
    let manager = state.stream_manager.read().await;
    Ok(manager.get_all_stream_info())
    // lock звільнений тут
}

// Правильно — lock тільки для отримання даних, робота поза lock
#[tauri::command]
async fn start_recording(
    url: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // start_recording є синхронним: лише реєструє завдання і spawn’ить async task
    let mut manager = state.stream_manager.write().await;
    manager.start_recording(url, app.clone()).map_err(|e| e.to_string())
    // lock звільнений тут; фактичний запис відбувається у spawned task
}
```

---

## 5. Потоки даних (Data Flows)

### 5.1. Запис потоку

```
Frontend                    IPC                  Rust Backend
────────                  ─────                ──────────────
User clicks "Record"
  → invoke("start_recording", {url, streamId})
                            →          StreamManager::start_recording()
                                         │
                                         ├─ reqwest GET url
                                         │   + Icy-MetaData: 1
                                         │
                                         ├─ Parse IcyHeaders
                                         │   (name, bitrate, metaint)
                                         │
                                         ├─ Update profile: bitrate, format,
                                         │   icy_name, icy_genre
                                         │   (якщо name == URL → name = icy_name)
                                         │   emit("stream-info-updated", StreamInfo)
                                         │
                                         ├─ Spawn tokio task: read_loop
                                         │   │
                                         │   ├─ Read chunk (metaint bytes)
                                         │   ├─ Read ICY metadata block (ручний парсинг)
                                         │   │
                                         │   ├─ IF metadata changed:
                                         │   │   ├─ Finalize current track file
                                         │   │   ├─ Write tags (lofty)
                                         │   │   ├─ Check wishlist/ignorelist (§5.5)
                                         │   │   ├─ emit("track-changed", {streamId, title})
                                         │   │   └─ Start new track file
                                         │   │
                                         │   ├─ Write raw bytes → stream file
                                         │   ├─ Write raw bytes → track file
                                         │   │
                                         │   └─ IF playing this stream:
                                         │       Copy bytes → playback channel (§5.2)
                                         │
                                         └─ Return Ok(streamId)
                            ←
  ← listen("track-changed")
  Update NowPlaying + LiveAnnouncer
```

#### 5.1.1. ICY metadata encoding

ICY протокол офіційно використовує latin-1 (ISO 8859-1), але більшість сучасних серверів надсилають UTF-8. Алгоритм декодування:

```rust
fn decode_icy_metadata(raw: &[u8]) -> String {
    // 0. Зняти UTF-8 BOM якщо є
    let raw = raw.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(raw);
    // 1. Спробувати UTF-8
    match std::str::from_utf8(raw) {
        Ok(s) => s.nfc().collect(),  // Unicode NFC normalization
        Err(_) => {
            // 2. Fallback: latin-1 (ISO 8859-1) — кожен байт → Unicode codepoint
            let s: String = raw.iter().map(|&b| b as char).collect();
            s.nfc().collect()
        }
    }
}
```

**Правила:**
- Завжди спочатку пробувати UTF-8 (більшість серверів)
- Якщо UTF-8 невалідний → latin-1 (ніколи не фейлиться, кожен байт — валідний codepoint)
- Після декодування — Unicode NFC нормалізація
- Не намагатися auto-detect інших кодувань (Windows-1251, Shift-JIS тощо) — занадто ненадійно

#### 5.1.2. Логіка першого треку та мінімальної тривалості

При зміні метаданих `stream::splitter` вирішує, чи зберігати попередній сегмент:

```
IF це перший сегмент (від початку запису до першої зміни метаданих):
    IF skipFirstIncompleteTrack == true:
        → відкинути сегмент (навіть якщо тривалість >= skipShortTracksMs)
    ELSE:
        → зберегти сегмент (навіть якщо тривалість < skipShortTracksMs)
ELSE (не перший сегмент):
    IF тривалість < skipShortTracksMs:
        → відкинути сегмент
    ELSE:
        → зберегти сегмент
```

> **Поля:** `RecordingSettings.skipFirstIncompleteTrack` (bool) та `RecordingSettings.skipShortTracksMs` (u32).
> У PRD ці поля описані як `saveFirstTrack` (інвертована семантика) та `minTrackDuration`.
> Canonical назви — з data-models.md.

### 5.2. Відтворення потоку (live) [Phase 2]

> У Фазі 1 `StreamManager::read_loop` пише байти лише у файл(и). Tee у playback channel додається у Фазі 2 без зміни recording pipeline.

```
StreamManager read_loop
  │
  ├─ raw audio bytes
  │
  ├─ tee → file writer
  │
  └─ tee → ring buffer (crossbeam channel)
               │
               └─ PlayerEngine reads from channel
                    │
                    ├─ symphonia decoder (MP3/AAC-LC → PCM)
                    │
                    └─ rodio Sink → WASAPI → speakers

Frontend
  │
  ├─ invoke("set_volume", {level: 0.75})  →  PlayerEngine::set_volume()
  └─ invoke("set_output_device", {name})  →  PlayerEngine::set_device()
```

### 5.3. Завантаження додатку (Startup)

```
main.rs
  │
  ├─ #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
  │   // Критично: ховає вікно консолі у release збірці
  │
  ├─ Determine portable base path (next to EXE)
  │
  ├─ Read data/settings.json (or create default)
  ├─ Read active profile .tapirprofile (or create Default.tapirprofile)
  │
  ├─ tauri::Builder::default()
  │     .plugin(single_instance)        // 1st — обов'язково першим
  │     .plugin(cli)
  │     .plugin(global_shortcut)
  │     .plugin(window_state)
  │     .plugin(fs)
  │     .plugin(http)
  │     .plugin(shell)
  │     .plugin(dialog)                  // folder/file picker
  │     .plugin(notification)
  │     .plugin(autostart)
  │     .plugin(log)                    // logging — до setup
  │     .setup(|app| {
  │          // Initialize AppState
  │          // Start Scheduler timer
  │          // Parse CLI args
  │          // Restore previous recording sessions (if configured)
  │          // Register global shortcuts
  │          // Setup system tray
  │     })
  │     .manage(app_state)
  │     .invoke_handler(commands)
  │     .run()
  │
  └─ Frontend loads:
       main.tsx
         ├─ invoke("get_settings") → populate stores
         ├─ invoke("get_profile")  → populate stores
         ├─ invoke("get_streams")  → populate stream table
         ├─ Register Tauri event listeners (track-changed, recording-status, etc.)
         └─ Render App with ActivityBar + Content
              └─ IF streams.length === 0 (first run):
                   announce("Tapir відкрито вперше. Додайте перший потік для запису.", "assertive")
                   autoFocus → "Додати потік" button in StreamTable empty state

    Примітка: точна поведінка first-run announcement описана в accessibility.md §3.5.
```

### 5.4. Зміна профілю [Phase 4]

```
Frontend                         Rust Backend
────────                       ──────────────
invoke("switch_profile",
  {name: "Music"})
                          →    0. IF active recordings > 0:
                                  Frontend shows ConfirmDialog
                                  User cancels → abort
                                  User confirms → continue
                               1. Save current profile to .tapirprofile
                               2. Load new profile from .tapirprofile
                               3. Stop all active recordings (from old profile)
                               4. Update AppState.active_profile
                               5. emit("profile-changed", {profileData})
                          ←
listen("profile-changed")
  → Replace all stores with new profile data
  → Re-render entire UI
```

---

## 6. Tauri IPC Contract

### 6.0. Глобальні гарячі клавіші → IPC

`tauri-plugin-global-shortcut` реєструє хоткеї у `setup()`. Натискання хоткея → callback у Rust → виклик відповідної команди напряму (без IPC roundtrip через frontend):

```rust
// У setup:
app.global_shortcut().on_shortcut("Ctrl+Shift+R", |app, _shortcut, event| {
    if event.state == ShortcutState::Pressed {
        // Визначаємо selected stream з AppState
        // Якщо записується → stop_recording, інакше → start_recording
        let state = app.state::<AppState>();
        // ...toggle logic
    }
});
```

Після виконання дії backend emit-ує відповідну подію (`recording-status`, `player-status` тощо), і frontend оновлюється як звичайно.

### 6.1. Команди (Frontend → Backend)

> У таблицях нижче `Returns` показує payload успішного `Ok(...)`. Фактичний IPC-контракт для всіх команд: `Result<T, String>`.
>
> Імена команд вказані у snake_case (Rust). JavaScript викликає camelCase-варіант: `invoke('getStreams')`. Tauri конвертує автоматично.

#### Streams & Recording

| Command | Params | Returns | Опис |
|---|---|---|---|
| `get_streams` | — | `Vec<StreamInfo>` | Список усіх потоків з поточного профілю |
| `add_stream` | `{url, name?}` | `StreamInfo` | Додати потік (resolve PLS/M3U) |
| `remove_stream` | `{streamId}` | `()` | Видалити потік з профілю |
| `update_stream` | `{streamId, url?, name?, username?, password?, ignorelist?}` | `StreamInfo` | Редагувати потік (URL, назва, auth, ignorelist) |
| `start_recording` | `{streamId}` | `()` | Почати запис потоку |
| `stop_recording` | `{streamId}` | `()` | Зупинити запис потоку |
| `stop_all_recordings` | — | `()` | Зупинити всі записи |
| `toggle_recording` | `{streamId}` | `()` | Увімкнути/вимкнути запис потоку |
| `get_stream_status` | `{streamId}` | `StreamStatus` | Детальний статус одного потоку |

#### Player [Phase 2]

| Command | Params | Returns | Опис |
|---|---|---|---|
| `play_stream` | `{streamId}` | `()` | Відтворити потік (live) |
| `play_file` | `{path}` | `()` | Відтворити записаний файл |
| `pause_playback` | — | `()` | Пауза |
| `stop_playback` | — | `()` | Зупинити відтворення |
| `seek` | `{positionMs}` | `()` | Перемотка (тільки для файлів) |
| `set_volume` | `{level}` | `()` | 0.0 — 1.0 |
| `get_output_devices` | — | `Vec<AudioDevice>` | Список аудіо пристроїв |
| `set_output_device` | `{deviceName}` | `()` | Вибрати пристрій виведення |

#### Stream Browser [Phase 3]

| Command | Params | Returns | Опис |
|---|---|---|---|
| `search_stations` | `{query, format?, minBitrate?}` | `Vec<StationResult>` | Пошук через Radio Browser API |
| `add_station_from_browser` | `{station}` | `StreamInfo` | Додати знайдену станцію |

#### Settings & Profiles

> `get_settings` / `save_settings` — Phase 1 (мінімальний). Інші — Phase 4.

| Command | Params | Returns | Опис |
|---|---|---|---|
| `get_settings` | — | `GlobalSettings` | Глобальні налаштування |
| `save_settings` | `{settings}` | `()` | Зберегти глобальні налаштування |
| `get_profile` | — | `Profile` | Активний профіль (повні дані) |
| `list_profiles` | — | `Vec<ProfileMeta>` | Список профілів (ім'я, шлях) |
| `switch_profile` | `{name}` | `Profile` | Перемкнути профіль |
| `create_profile` | `{name, copyFrom?}` | `ProfileMeta` | Створити профіль |
| `delete_profile` | `{name}` | `()` | Видалити (крім Default) |
| `export_profile` | `{name, targetPath}` | `()` | Експорт у файл |
| `import_profile` | `{sourcePath}` | `ProfileMeta` | Імпорт з файлу |

#### Wishlist / Ignorelist [Phase 2]

| Command | Params | Returns | Опис |
|---|---|---|---|
| `get_wishlist` | — | `Vec<WishlistEntry>` | Список бажаних треків |
| `add_to_wishlist` | `{pattern}` | `()` | Додати (wildcard) |
| `remove_from_wishlist` | `{pattern}` | `()` | Видалити |
| `get_ignorelist` | — | `Vec<String>` | Список ігнорованих |
| `add_to_ignorelist` | `{pattern}` | `()` | Додати |
| `remove_from_ignorelist` | `{pattern}` | `()` | Видалити |

#### Scheduled Recordings [Phase 3]

| Command | Params | Returns | Опис |
|---|---|---|---|
| `get_scheduled_recordings` | — | `Vec<ScheduledRecording>` | Список запланованих |
| `add_scheduled_recording` | `{recording}` | `ScheduledRecording` | Створити |
| `update_scheduled_recording` | `{id, recording}` | `()` | Редагувати |
| `delete_scheduled_recording` | `{id}` | `()` | Видалити |
| `toggle_scheduled_recording` | `{id, enabled}` | `()` | Увімкнути/вимкнути |

#### Saved Songs [Phase 4]

| Command | Params | Returns | Опис |
|---|---|---|---|
| `get_saved_songs` | `{filter?, sort?}` | `Vec<SavedSong>` | Список збережених пісень |
| `delete_song` | `{path, toTrash}` | `()` | Видалити файл |
| `rename_song` | `{path, newName}` | `()` | Перейменувати |
| `update_song_tags` | `{path, tags}` | `()` | Оновити ID3/M4A теги |
| `open_in_explorer` | `{path}` | `()` | Показати в провіднику Windows |
| `import_files` | `{paths}` | `Vec<SavedSong>` | Імпортувати файли |

#### Postprocessing [Phase 4]

| Command | Params | Returns | Опис |
|---|---|---|---|
| `get_postprocess_config` | — | `PostprocessConfig` | Налаштування постобробки |
| `save_postprocess_config` | `{config}` | `()` | Зберегти |

### 6.2. Події (Backend → Frontend)

| Event | Payload | Коли |
|---|---|---|
| `track-changed` | `{streamId, artist, title, album}` | Зміна ICY метаданих у потоці |
| `recording-status` | `{streamId, status, error?}` | Зміна стану запису (recording/stopped/error/reconnecting) |
| `stream-info-updated` | `StreamInfo` (повна структура) | Після підключення: оновлені ICY поля (bitrate, icy_name, format, icy_genre) |
| `recording-started` | `{streamId, fileName}` | Трек розпочато записувати |
| `recording-completed` | `{streamId, fileName, duration}` | Трек завершено |
| `stream-error` | `{streamId, message, willRetry, retryNumber?, maxRetries?}` | Помилка з'єднання |
| `player-status` | `{status, source, volume, positionMs?, durationMs?}` | Зміна стану player (playing/paused/stopped) |
| `player-progress` | `{positionMs, durationMs}` | Оновлення позиції (для файлів) |
| `scheduled-started` | `{recordingId, streamId}` | Плановий запис розпочався |
| `scheduled-completed` | `{recordingId, streamId}` | Плановий запис завершився |
| `scheduled-missed` | `{recordingId, reason}` | Пропущений запис (програма була вимкнена) |
| `wishlist-match` | `{streamId, artist, title, pattern}` | Знайдено трек зі списку бажань |
| `disk-space-low` | `{availableGb, thresholdGb}` | Мало місця на диску |
| `disk-space-ok` | `{availableGb}` | Місце на диску відновлено (після disk-space-low) |
| `bandwidth-exceeded` | `{currentKbps, limitKbps}` | Перевищено ліміт пропускної здатності |
| `profile-changed` | `{profile}` | Профіль змінено |
| `postprocess-started` | `{fileName}` | Розпочато постобробку |
| `postprocess-completed` | `{fileName, success, output?}` | Постобробку завершено |
| `postprocess-error` | `{fileName, error}` | Помилка постобробки |

---

## 7. Модель конкурентності

### Tokio Runtime

Tauri v2 ініціалізує tokio runtime автоматично. **Не створювати** власний runtime.

### Потоки та задачі

```
Main Thread (OS)
  │
  ├─ Tauri app loop + WebView2 message pump
  │
  └─ tokio runtime (multi-threaded)
       │
       ├─ IPC handler tasks (per invoke call)
       │
       ├─ StreamManager
       │   ├─ Stream 1: read_loop task (long-lived)
       │   ├─ Stream 2: read_loop task (long-lived)
       │   ├─ ...
       │   └─ Stream N: read_loop task (long-lived)
       │
       ├─ Scheduler: interval task (per minute)
       │
       └─ Postprocess: queue runner task

Dedicated OS Thread (rodio internal)
  │
  └─ Audio mixer + WASAPI output
```

### StreamManager — керування потоками

```rust
pub struct StreamManager {
    streams: HashMap<StreamId, StreamHandle>,
    client: reqwest::Client,  // shared HTTP client (connection pooling)
}

pub struct StreamHandle {
    pub info: StreamInfo,
    pub status: StreamStatus,
    pub cancel_token: CancellationToken,  // для зупинки read_loop
    pub task_handle: JoinHandle<()>,
}
```

- `CancellationToken` (з `tokio_util`) — для graceful shutdown кожного запису
- `reqwest::Client` — один на всі потоки (внутрішнє connection pooling)
- При `stop_recording()` — cancel token → read_loop завершується → файл фіналізується

### Взаємодія Recording ↔ Player

Якщо потік одночасно записується і програється:

```rust
// Запис: read_loop пише raw bytes у два місця
loop {
    let chunk = icy_reader.read_chunk().await?;
    
    // 1. Файл (завжди)
    file_writer.write(&chunk.audio).await?;
    
    // 2. Playback buffer (якщо player слухає цей потік)
    if let Some(tx) = playback_sender.as_ref() {
        let _ = tx.try_send(chunk.audio.clone()); // non-blocking, drop if full
    }
}

// Player: читає з ring buffer
// PlayerEngine тримає crossbeam bounded channel receiver
// symphonia декодує raw bytes → PCM → rodio Sink
```

#### Параметри playback channel

| Параметр | Значення | Обґрунтування |
|----------|----------|---------------|
| Тип | `crossbeam_channel::bounded<Vec<u8>>` | Lock-free, multi-producer safe |
| Ємність | 64 chunks | ~1–2 секунди буферу при 256 kbps (chunk ≈ metaint, зазвичай 8–32 KB) |
| Backpressure | `try_send` — drop chunk if full | Запис не блокується; програвач може мати короткий audio skip |
| Створення | При `play_stream(streamId)` — recorder отримує `Sender` | Sender = `Option<Sender>` в `StreamHandle` |
| Видалення | При `stop_playback` або `stop_recording` — drop Sender/Receiver | Receiver дропається → decoder loop завершується |

**Поведінка при переповненні:** `try_send` повертає `Err(Full)` — chunk втрачається. Це призводить до мікро-заїкання (~50–200 мс), що прийнятно: запис (файл) не страждає, лише прослуховування. Якщо програвач не встигає декодувати, це означає перевантаження CPU — в такому разі краще drop ніж backpressure на запис.

### 5.5. Wishlist / Ignorelist — порядок перевірки

При зміні ICY метаданих перевіряються списки в такому порядку:

```
1. Per-stream ignorelist  → збіг → відкинути трек, НЕ записувати
2. Global ignorelist      → збіг → відкинути трек, НЕ записувати
3. Wishlist               → збіг → автоматичний запис
4. Жодного збігу          → звичайна поведінка (запис якщо ручний запис активний)
```

**Правило:** Ignorelist завжди має пріоритет над wishlist. Якщо трек збігається з обома — він ігнорується.

**Обґрунтування:** Ignorelist — це explicit opt-out. Користувач, що додає "*jingle*" в ignorelist, очікує що жодні jingle-и не будуть записані, навіть якщо wishlist містить широкий патерн.

---

## 8. Моніторинг ресурсів

### Дисковий простір

Перевірка вільного місця виконується:
1. **При запуску запису** — перед `start_recording`
2. **Щохвилини** — в рамках scheduler timer loop
3. **При записі треку** — після фіналізації кожного track file

Якщо вільного місця менше `diskSpaceThresholdGb`:
- `emit("disk-space-low", {availableGb, thresholdGb})`
- Зупинити всі активні записи (graceful: дописати поточний трек)
- Логувати: `[DiskMonitor] Low disk space: {availableGb} GB < {thresholdGb} GB threshold. Recordings stopped.`

**Відновлення після звільнення місця:**
- При наступній щохвилинній перевірці, якщо місце знову ≥ `diskSpaceThresholdGb`:
  - `emit("disk-space-ok", {availableGb})`
- Frontend показує persistent toast (не auto-dismiss) при `disk-space-low`:
  - Текст: "Мало місця на диску ({gb} ГБ). Записи зупинено."
  - Кнопки: "Відкрити провідник" (показати папку recordings) | "Закрити"
- Після `disk-space-ok` — toast замінюється на polite announcement: "Місце на диску відновлено"
- Перезапуск записів — лише вручну (користувач повторно натискає Record)

### Пропускна здатність

Якщо `bandwidthLimitKbps > 0`, StreamManager обчислює сумарну швидкість усіх активних потоків. При перевищенні:
- `emit("bandwidth-exceeded", {currentKbps, limitKbps})`
- Нові записи не стартують до зниження навантаження

---

## 9. Обробка помилок

### Стратегія

| Шар | Підхід |
|---|---|
| Internal Rust | `thiserror` — типізовані помилки з контекстом |
| Tauri Commands | `Result<T, String>` — Tauri серіалізує `Err(String)` як помилку для JS |
| Stream errors | Автоперепідключення + `emit("stream-error")` → UI показує статус |
| Frontend | `try/catch` навколо `invoke()`, помилка → toast/alert |

### Типи помилок (Rust)

```rust
#[derive(thiserror::Error, Debug)]
pub enum RadioError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(#[from] reqwest::Error),
    
    #[error("Stream {stream_id} not found")]
    StreamNotFound { stream_id: String },
    
    #[error("File I/O error: {0}")]
    FileError(#[from] std::io::Error),
    
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),
    
    #[error("Profile '{name}' not found")]
    ProfileNotFound { name: String },
    
    #[error("Cannot delete default profile")]
    CannotDeleteDefault,
    
    #[error("Playback error: {0}")]
    PlaybackError(String),
    
    #[error("Tag writing error: {0}")]
    TagError(#[from] lofty::error::LoftyError),
}

// Конвертація для Tauri IPC
impl From<RadioError> for String {
    fn from(err: RadioError) -> String {
        err.to_string()
    }
}
```

### Перепідключення при втраті з'єднання

```rust
pub struct ReconnectConfig {
    pub max_retries: u32,      // 0 = infinite
    pub retry_interval_secs: u32,
    pub backoff_multiplier: f32,
    pub max_interval_secs: u32,
}

// У read_loop:
// 1. Connection drop → emit("recording-status", Reconnecting)
// 2. Wait interval → retry connection
// 3. Success → emit("recording-status", Recording), continue
// 4. Max retries → emit("recording-status", Error), stop
```

---

## 10. Портативне зберігання даних

### Визначення base path

```rust
// portable.rs
use std::path::{Path, PathBuf};

pub fn base_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("cannot determine exe path: {e}"))?;
    exe.parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "exe has no parent dir".to_string())
}

pub fn data_dir() -> Result<PathBuf, String> {
    Ok(base_dir()?.join("data"))
}

pub fn settings_path() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("settings.json"))
}

pub fn profiles_dir() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("profiles"))
}

pub fn logs_dir() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("logs"))
}

pub fn default_recordings_dir() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("recordings"))
}
```

### Файлова структура на диску

```
Tapir/                                  (base_dir)
├── tapir.exe
└── data/                               (data_dir)
    ├── settings.json                   (global settings)
    ├── profiles/
    │   ├── Default.tapirprofile            (JSON, default profile)
    │   └── Music.tapirprofile              (JSON, user profile)
    ├── logs/
    │   └── tapir.log                   (rotated)
    └── recordings/                     (default, configurable per profile)
        ├── SomaFM Groove Salad/
        │   ├── Tycho - A Walk.mp3
        │   ├── Bonobo - Kerala.mp3
        │   └── stream_2026-04-10.mp3     (stream file)
        └── Jazz FM/
            └── ...
```

---

## 11. Вікно та System Tray

### Window Management

- `decorations: true` — **обов'язково** (accessibility: NVDA mouse tracking)
- `visible: false` при старті → `tauri-plugin-window-state` відновлює позицію → показує вікно
- Мінімізація до tray (опціонально, налаштування)
- При закритті вікна: мінімізувати до tray (якщо увімкнено) або зупинити записи та вийти
- **Розмір за замовчуванням**: 1200×800, maximized
- **Мінімальний розмір**: 800×550 (UI не ламається)
- **Resize дозволений** (accessibility: screen magnifier, multi-monitor, Windows Snap)
- **Window state persistence**: `tauri-plugin-window-state` зберігає розмір, позицію, maximized між сесіями

```json
// tauri.conf.json → windows[0]
{
  "width": 1200,
  "height": 800,
  "minWidth": 800,
  "minHeight": 550,
  "decorations": true,
  "visible": false
}
```

### System Tray

#### Tooltip

Динамічний tooltip відображає поточний стан:

| Стан | Tooltip |
|------|---------|
| Idle | `Tapir` |
| Playing | `Tapir — ▶ {station}` |
| Recording (n) | `Tapir — ● {n} записів` |
| Playing + Recording | `Tapir — ▶ {station} · ● {n} записів` |

#### Контекстне меню (right-click)

```
Зараз грає: {station} — {title}        ← disabled label, тільки якщо state == Playing
──────────
⏯ Грати / Пауза                        ← toggle, enabled тільки якщо lastStreamId != null
⏹ Зупинити                              ← enabled тільки якщо state != Stopped
──────────
● Записи: {n} активних                  ← disabled label, тільки якщо n > 0
Зупинити всі записи                      ← тільки якщо n > 0
──────────
Показати Tapir / Приховати Tapir         ← toggle за window.isVisible()
──────────
Вихід
```

| Пункт | ID | Тип | Умова видимості | Дія |
|-------|----|-----|-----------------|-----|
| Зараз грає: … | `now-playing` | `MenuItem` (disabled) | `PlayerStatus.state == Playing` | — |
| Грати / Пауза | `toggle-playback` | `MenuItem` | завжди | `invoke("toggle_playback")` |
| Зупинити | `stop-playback` | `MenuItem` | `state != Stopped` | `invoke("stop_playback")` |
| Записи: {n} | `recording-info` | `MenuItem` (disabled) | `active_recordings > 0` | — |
| Зупинити всі записи | `stop-all` | `MenuItem` | `active_recordings > 0` | `invoke("stop_all_recordings")` |
| Показати/Приховати | `toggle-window` | `MenuItem` | завжди | `window.show()` / `window.hide()` |
| Вихід | `quit` | `MenuItem` | завжди | Якщо є активні записи → `ConfirmDialog`, інакше `app.exit(0)` |

#### Динамічне оновлення меню

Tray menu перебудовується при зміні стану:
- `player-status` event → оновити "Зараз грає", toggle "Грати/Пауза", видимість "Зупинити"
- `recording-status` event → оновити кількість записів, видимість "Зупинити всі"
- `window.onCloseRequested` / `window.onFocusChanged` → toggle "Показати/Приховати"

```rust
fn rebuild_tray_menu(
    app: &AppHandle,
    player: &PlayerStatus,
    active_recordings: usize,
    window_visible: bool,
) -> tauri::Result<()> {
    let tray = app.tray_by_id("main").unwrap();
    let mut items: Vec<Box<dyn IsMenuItem>> = Vec::new();

    // Now Playing (conditional)
    if player.state == PlaybackState::Playing {
        if let Some(ref source) = player.source {
            let label = format!("Зараз грає: {}", now_playing_label(app, source));
            items.push(Box::new(MenuItem::with_id(app, "now-playing", &label, false, None::<&str>)?));
            items.push(Box::new(Separator::new(app)?));
        }
    }

    // Playback controls
    let play_label = if player.state == PlaybackState::Playing { "Пауза" } else { "Грати" };
    items.push(Box::new(MenuItem::with_id(app, "toggle-playback", play_label, true, None::<&str>)?));

    if player.state != PlaybackState::Stopped {
        items.push(Box::new(MenuItem::with_id(app, "stop-playback", "Зупинити", true, None::<&str>)?));
    }

    items.push(Box::new(Separator::new(app)?));

    // Recording info (conditional)
    if active_recordings > 0 {
        let rec_label = format!("● Записи: {} активних", active_recordings);
        items.push(Box::new(MenuItem::with_id(app, "recording-info", &rec_label, false, None::<&str>)?));
        items.push(Box::new(MenuItem::with_id(app, "stop-all", "Зупинити всі записи", true, None::<&str>)?));
        items.push(Box::new(Separator::new(app)?));
    }

    // Window toggle
    let toggle_label = if window_visible { "Приховати Tapir" } else { "Показати Tapir" };
    items.push(Box::new(MenuItem::with_id(app, "toggle-window", toggle_label, true, None::<&str>)?));

    items.push(Box::new(Separator::new(app)?));
    items.push(Box::new(MenuItem::with_id(app, "quit", "Вихід", true, None::<&str>)?));

    let menu = Menu::with_items(app, &items.iter().map(|i| i.as_ref()).collect::<Vec<_>>())?;
    tray.set_menu(Some(menu))?;
    Ok(())
}
```

#### Обробка кліків

```rust
// Left click — toggle window visibility
.on_tray_icon_event(|tray, event| {
    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
        let window = tray.app_handle().get_webview_window("main").unwrap();
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
})

// Menu item clicks
.on_menu_event(|app, event| {
    match event.id().as_ref() {
        "toggle-playback" => { /* invoke toggle_playback command */ }
        "stop-playback"   => { /* invoke stop_playback command */ }
        "stop-all"        => { /* invoke stop_all_recordings command */ }
        "toggle-window"   => { /* show/hide main window */ }
        "quit"            => { /* confirm if recordings active, then app.exit(0) */ }
        _ => {}
    }
})
```

#### Balloon tip (сповіщення)

При зміні треку (якщо `showTrayNotifications: true`):
- **Title:** назва станції
- **Body:** "Artist — Title"
- Через Win32 `Shell_NotifyIconW` balloon API (не toast, щоб уникнути "PowerShell" у portable mode)
- Throttle: не частіше ніж раз на 3 секунди (ICY metadata flicker)

---

## 12. Security

### CSP (Content Security Policy)

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
connect-src ipc: http://ipc.localhost http://tauri.localhost https://*.api.radio-browser.info;
```

- Ніяких зовнішніх скриптів
- `unsafe-inline` для динамічних стилів (React Aria, Tailwind)
- `ipc:` + `http://ipc.localhost` — Tauri IPC комунікація (invoke, events)
- `http://tauri.localhost` — Tauri asset protocol
- `connect-src` — Radio Browser API (HTTP запити з frontend)
- Аудіо потоки йдуть через Rust, не через WebView

### IPC Security

- Capabilities (`default.json`) — мінімальний набір дозволів
- `tauri-plugin-shell` — scope обмежений до дозволених програм
- `tauri-plugin-http` — URL allowlist тільки для `*.api.radio-browser.info`
- `tauri-plugin-fs` — read/write scope обмежений

### Файлова безпека

- Path traversal prevention: відхиляти шляхи з `..`
- Колізії імен: числовий суфікс `_2`, `_3` (без перезапису)

### sanitize.rs — детальна специфікація

#### Заборонені символи

Замінюються на `_`:

| Символ | Опис |
|--------|------|
| `\` | backslash (дозволений лише як роздільник теки у шаблоні) |
| `/` | slash |
| `:` | colon |
| `*` | asterisk |
| `?` | question mark |
| `"` | double quote |
| `<` | less than |
| `>` | greater than |
| `\|` | pipe |
| `\0`–`\x1F` | control characters |

#### Зарезервовані імена Windows

Наступні імена (без урахування регістру, з або без розширення) додають суфікс `_`:

`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`

Приклад: `CON.mp3` → `CON_.mp3`, `nul` → `nul_`

#### Нормалізація

1. Unicode NFC нормалізація (crate `unicode-normalization`)
2. Trailing пробіли та крапки обрізаються з кожного компонента шляху
3. Порожній результат після санітизації → замінюється на `_untitled`

#### Обмеження довжини

- Максимальна довжина одного компонента (ім'я файлу або теки): **255** символів
- Якщо довше → обрізати до 251 + зберегти розширення (до 4 символів)
- Максимальна довжина повного шляху: **259** символів (Windows MAX_PATH - 1)
- Якщо повний шлях перевищує ліміт → обрізати компонент файлу, зберігаючи розширення

#### Алгоритм

```rust
pub fn sanitize_filename(raw: &str) -> String {
    let normalized = raw.nfc().collect::<String>();
    let replaced = replace_forbidden_chars(&normalized, '_');
    let trimmed = replaced.trim_end_matches([' ', '.'].as_ref()).to_string();
    let safe = avoid_reserved_names(&trimmed);
    if safe.is_empty() { "_untitled".to_string() } else { truncate_component(safe, 255) }
}

pub fn resolve_collision(path: &Path) -> PathBuf {
    if !path.exists() { return path.to_path_buf(); }
    let stem = path.file_stem().unwrap().to_str().unwrap();
    let ext = path.extension().map(|e| format!(".", e.to_str().unwrap())).unwrap_or_default();
    for i in 2.. {
        let candidate = path.with_file_name(format!("{stem}_{i}{ext}"));
        if !candidate.exists() { return candidate; }
    }
    unreachable!()
}
```

#### Рендеринг шаблонів

| Токен | Значення | Санітизація |
|-------|----------|-------------|
| `%a` | artist | sanitize_filename |
| `%t` | title | sanitize_filename |
| `%l` | album | sanitize_filename |
| `%s` | station name | sanitize_filename |
| `%n` | track number (sequential, per recording session) | digits only |
| `%d` | date `YYYY-MM-DD` | safe as-is |
| `%time` | time `HH-MM-SS` | safe as-is (дефіси замість двокрапок) |

Кожен токен санітизується окремо, потім збирається повний шлях. `\` у шаблоні інтерпретується як роздільник теки. Після збірки — перевірка загальної довжини шляху.

---

## 13. Доступність (Architectural Patterns)

### Screen Reader Announcements

Централізований компонент `LiveAnnouncer`:

```tsx
// components/common/LiveAnnouncer.tsx
// Єдиний aria-live контейнер для всіх dynamic announcements

// stores/announcer.ts
import { atom } from 'nanostores';

interface Announcement {
  message: string;
  priority: 'polite' | 'assertive';
}

export const $announcement = atom<Announcement | null>(null);

export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  $announcement.set({ message, priority });
}
```

### Що оголошується для screen reader

| Подія | Рівень | Текст |
|---|---|---|
| Track changed | `polite` | "Зараз грає: {artist} — {title}" |
| Recording started | `assertive` | "Запис розпочато: {station}" |
| Recording stopped | `assertive` | "Запис зупинено: {station}" |
| Connection error | `assertive` | "Помилка з'єднання: {station}" |
| Reconnecting | `polite` | "Перепідключення: {station}, спроба {n}" |
| Scheduled recording started | `assertive` | "Плановий запис розпочато: {station}" |
| Scheduled recording completed | `assertive` | "Плановий запис завершено: {station}" |
| Wishlist match | `assertive` | "Знайдено бажану пісню: {title}" |
| Disk space low | `assertive` | "Увага: мало місця на диску ({gb} ГБ)" |
| Profile changed | `polite` | "Профіль змінено: {name}" |

### Keyboard Navigation

```
Tab order (main window):
  [Activity Bar] → [Section Content] → [Player Controls] → [Status Bar]

Zone navigation (F6 / Shift+F6):
    F6 — наступна зона: Activity Bar → Section Content → Player → Status Bar (cycle; Player пропускається у Фазі 1 або коли прихований)
  Shift+F6 — попередня зона
  • Запам'ятовує останній фокусований елемент у кожній зоні
    • Пропускає приховані або неімплементовані зони (Player прихований якщо нічого не грає або ще не реалізований у поточній фазі)
  • Оголошує назву зони через LiveAnnouncer (assertive)
  • Не працює всередині діалогів (Settings, AddStream)

Within Activity Bar:
  Arrow Up/Down — перемикання секцій
  Ctrl+1...Ctrl+5 — пряма навігація (5 робочих секцій)

Global:
  Ctrl+K — Command Palette (fuzzy search actions, stations, songs)
  Ctrl+, — Налаштування (повноекранний діалог)
  Ctrl+Shift+P — Switch Profile

Within Streams Section:
  [Stream Table] → [Add Stream Button] → [Start All Button]

Within Stream Table:
  Arrow Up/Down — рядки
  Arrow Left/Right — стовпці
  Enter — подвійний клік (запис або відтворення)
  Space — toggle recording
  Delete — видалити потік
  Context Menu key — контекстне меню

Global hotkeys (configurable):
  Ctrl+Shift+R — Start/stop recording selected stream
  Ctrl+Shift+P — Play/pause
  Ctrl+Shift+Up — Volume up
  Ctrl+Shift+Down — Volume down
  Ctrl+Shift+H — Show/hide window
```

---

## 14. Обмеження та компроміси

| Рішення | Чому | Що втрачаємо |
|---|---|---|
| `decorations: true` | NVDA mouse tracking працює коректно | Кастомний title bar неможливий |
| React 19 (не Svelte 5) | React Aria — єдина бібліотека з JAWS/NVDA тестуванням | Більший бандл (~80–130 KB gzip vs ~30–50 KB) |
| Запис raw bytes (без decode) | Мінімальне CPU для 20+ потоків | Не можемо нормалізувати рівень гучності під час запису |
| symphonia (без HE-AAC v2/AAC-ELD; HE-AAC v1 підтримується) | Pure Rust, без FFmpeg dependency | Деякі станції 32-64 kbps не програються (але записуються нормально) |
| Portable data layout | Файли поряд з EXE, працює з флешки | `current_exe()` може повернути різні шляхи через symlinks |
| Один лог-файл | Простота, зрозумілість для користувача | Менш зручний аналіз окремих підсистем (можна компенсувати prefixed записами) |

---

## 15. Діаграма залежностей модулів

```
                    ┌──────────────┐
                    │  commands/*  │  (Tauri IPC entry points)
                    └──────┬───────┘
                           │ delegates to
          ┌────────────────┼──────────────────┐
          │                │                  │
    ┌─────▼─────┐   ┌─────▼─────┐    ┌──────▼──────┐
    │  stream/  │   │  player/  │    │  scheduler/ │
    │  manager  │   │  engine   │    │  timer      │
    └─────┬─────┘   └─────┬─────┘    └──────┬──────┘
          │               │                  │
    ┌─────▼─────┐   ┌─────▼─────┐           │
    │ connection│   │   rodio   │    uses stream/manager
    │  recorder │   │ symphonia │    to start/stop recordings
    │  splitter │   └───────────┘
    └─────┬─────┘
          │
    ┌─────▼─────┐   ┌───────────┐   ┌───────────┐
    │   tags/   │   │ wishlist/ │   │ postproc/ │
    │  writer   │   │ matcher   │   │  runner   │
    └───────────┘   └───────────┘   └───────────┘
          │                                │
    ┌─────▼─────────────────────────────────▼────┐
    │  settings  │  profile  │  portable  │  sanitize  │
    └────────────────────────────────────────────────────┘
```

---

## 16. Рекомендації щодо подальших документів

1. **Data Models** — JSON schemas для `GlobalSettings`, `Profile`, `StreamInfo`, `SavedSong`, `ScheduledRecording`
2. **Accessibility Spec** — ARIA-розмітка для кожного екрану (Streams, Player, Browser, Songs, Schedule, Settings)
3. **Implementation Plan** — фази MVP → v1 з конкретними milestones
