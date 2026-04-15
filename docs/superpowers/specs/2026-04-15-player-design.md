# Дизайн: Player (Фаза 2)

> **Дата:** 2026-04-15
> **Фаза:** 2 — Wishlist + Settings + Player
> **Підсистема:** Player (перша з трьох підсистем Фази 2)
> **Статус:** Затверджено

---

## 1. Контекст

Фаза 1 реалізувала запис потоків (StreamManager, ICY metadata, tags, reconnect). Фаза 2 додає відтворення. Player — перша підсистема Фази 2, яка реалізується незалежно від Wishlist та SettingsDialog.

**Scope цього дизайну:**
- Live playback інтернет-радіо потоків
- File playback записаних MP3/AAC файлів з seek
- Вибір аудіо-пристрою виведення
- PlayerPanel як постійна нижня панель UI
- Повна доступність (NVDA, клавіатура)

**Поза scope:**
- Wishlist/Ignorelist інтеграція
- SettingsDialog (налаштування пристрою там — окремо в SettingsDialog)
- Tray integration (Фаза 4)
- Playlist/queue management

---

## 2. Архітектура

```
┌─────────────────────────────────────────────────────┐
│  Frontend                                           │
│  PlayerPanel (bottom bar, role="complementary")     │
│  ├── [Play/Pause] [Stop]  [Source label]            │
│  ├── PlaybackPosition (Slider / ProgressBar)        │
│  └── VolumeSlider                                   │
│                                                     │
│  player.ts store ← Tauri events                     │
└────────────────┬────────────────────────────────────┘
                 │ IPC invoke / listen
┌────────────────▼────────────────────────────────────┐
│  Rust Backend                                       │
│  commands/player_commands.rs                        │
│                                                     │
│  player::engine::PlayerEngine (Arc в AppState)      │
│  ├── PlaybackSession { sink, cancel, source }       │
│  ├── progress_task → emit "player-progress" /1s     │
│  └── OutputStreamHandle (WASAPI)                    │
└─────────────────────────────────────────────────────┘
```

### 2.1. Tauri Events (backend → frontend)

| Event | Payload | Коли |
|---|---|---|
| `player-status` | `PlayerStatus` | play/pause/stop/device change |
| `player-progress` | `{ positionMs, durationMs }` | кожну 1с під час file playback |

---

## 3. Backend

### 3.1. Модульна структура

```
src-tauri/src/
├── player/
│   ├── mod.rs
│   └── engine.rs
└── commands/
    └── player_commands.rs
```

### 3.2. `player::engine`

**Підхід:** Task-based PlayerEngine з CancellationToken — аналогічний патерн до існуючого `StreamManager`.

```rust
// src-tauri/src/player/engine.rs

pub struct PlayerEngine {
    session: Arc<Mutex<Option<PlaybackSession>>>,
    volume: Arc<Mutex<f32>>,
    output_device: Arc<Mutex<Option<String>>>,  // None = system default
    _output_stream: OutputStream,               // тримає WASAPI живим
    output_handle: OutputStreamHandle,
}

struct PlaybackSession {
    sink: Arc<Sink>,
    cancel: CancellationToken,
    source: PlaybackSource,     // Stream { stream_id } | File { path }
    progress_task: JoinHandle<()>,
}
```

**`PlaybackSource`** відповідає типу з `data-models.md`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PlaybackSource {
    Stream { stream_id: String },
    File { path: String },
}
```

### 3.3. Live playback (`play_stream`)

1. Скасувати поточну сесію (`cancel.cancel()`, drop session)
2. Отримати URL потоку з `StreamManager` за `stream_id` (або приймати URL напряму)
3. Підключитись через існуючий `stream::connection` код — незалежне HTTP-з'єднання, без запису
4. Spawn tokio-таск: читати байти → писати в `Arc<Mutex<VecDeque<u8>>>` (ring buffer)
5. Створити `LiveSource` що реалізує `rodio::Source<Item=i16>` — читає з ring buffer, декодує через symphonia frame-by-frame
6. `sink.append(live_source)` → rodio → WASAPI
7. Emit `player-status { state: "playing", source: Stream { stream_id }, volume }`

> Якщо потік вже записується — live playback підключається окремим HTTP-з'єднанням. Tee не потрібен.

### 3.4. File playback (`play_file`)

1. Скасувати поточну сесію
2. `rodio::Decoder::new(BufReader::new(File::open(path)?))` — symphonia всередині
3. Отримати тривалість через `decoder.total_duration()`
4. `sink.append(decoder)`
5. Spawn `progress_task`: loop кожну 1с → `sink.get_pos()` → emit `player-progress { positionMs, durationMs }`
6. Emit `player-status { state: "playing", source: File { path }, volume, durationMs }`

### 3.5. Seek (`seek_playback`)

Seek підтримується лише для file playback. При виклику на live stream — повертає `Err`.

```rust
pub async fn seek(&self, position_ms: u64, app_handle: &AppHandle) -> Result<()> {
    let session = self.session.lock().await;
    let session = session.as_ref().ok_or("not playing")?;

    match &session.source {
        PlaybackSource::File { path } => {
            session.sink.stop();
            let mut decoder = Decoder::new(BufReader::new(File::open(path)?))?;
            decoder.try_seek(Duration::from_millis(position_ms))?;
            session.sink.append(decoder);
            // emit player-progress з новою позицією
        }
        PlaybackSource::Stream { .. } => return Err(anyhow!("seek unavailable for live stream")),
    }
    Ok(())
}
```

### 3.6. Volume (`set_volume`)

```rust
pub async fn set_volume(&self, volume: f32) -> Result<()> {
    // volume: 0.0 — 1.0
    *self.volume.lock().await = volume;
    if let Some(session) = self.session.lock().await.as_ref() {
        session.sink.set_volume(volume);
    }
    // Зберегти у profile.playerSession.volume через ProfileManager
    Ok(())
}
```

Зміна гучності не перериває відтворення.

### 3.7. Output device (`set_output_device`)

1. Зупинити поточне відтворення (emit `player-status { state: "stopped" }`)
2. Drop поточний `_output_stream`
3. Знайти пристрій за ім'ям через `cpal::available_hosts()` / `cpal::default_host().output_devices()`
4. Створити новий `OutputStream::try_from_device(&device)?`
5. Оновити `output_handle`
6. Зберегти `output_device` в `settings.json` через SettingsManager

```rust
pub async fn list_output_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let devices = host.output_devices()?;
    let default = host.default_output_device();
    // ...
}
```

### 3.8. Graceful shutdown

При закритті програми (`on_window_event CloseRequested`):
- `PlayerEngine::stop()` — скасувати сесію
- Зберегти `playerSession.volume` у профіль

---

## 4. IPC команди

```rust
// src-tauri/src/commands/player_commands.rs

#[tauri::command]
pub async fn play_stream(stream_id: String, state: State<'_, AppState>, app: AppHandle) -> Result<(), String>

#[tauri::command]
pub async fn play_file(path: String, state: State<'_, AppState>, app: AppHandle) -> Result<(), String>

#[tauri::command]
pub async fn pause_playback(state: State<'_, AppState>, app: AppHandle) -> Result<(), String>

#[tauri::command]
pub async fn resume_playback(state: State<'_, AppState>, app: AppHandle) -> Result<(), String>

#[tauri::command]
pub async fn stop_playback(state: State<'_, AppState>, app: AppHandle) -> Result<(), String>

#[tauri::command]
pub async fn seek_playback(position_ms: u64, state: State<'_, AppState>, app: AppHandle) -> Result<(), String>

#[tauri::command]
pub async fn set_volume(volume: f32, state: State<'_, AppState>) -> Result<(), String>

#[tauri::command]
pub async fn get_player_status(state: State<'_, AppState>) -> Result<PlayerStatus, String>

#[tauri::command]
pub async fn list_output_devices() -> Result<Vec<AudioDevice>, String>

#[tauri::command]
pub async fn set_output_device(name: Option<String>, state: State<'_, AppState>, app: AppHandle) -> Result<(), String>
```

**Події після кожної команди:**

| Команда | Emitted event |
|---|---|
| `play_stream` / `play_file` | `player-status { state: "playing", source, volume }` |
| `pause_playback` | `player-status { state: "paused" }` |
| `resume_playback` | `player-status { state: "playing" }` |
| `stop_playback` | `player-status { state: "stopped", source: null }` |
| `seek_playback` | `player-progress { positionMs, durationMs }` |
| `set_output_device` | `player-status { state: "stopped" }` |

---

## 5. Frontend

### 5.1. Store (`src/stores/player.ts`)

```typescript
import { atom } from 'nanostores';

export const $playerStatus = atom<PlayerStatus>({
  state: 'stopped',
  source: null,
  volume: 0.75,
  positionMs: null,
  durationMs: null,
});
```

Підписка на Tauri events реєструється в `App.tsx`:
```typescript
listen('player-status', e => $playerStatus.set(e.payload));
listen('player-progress', e => {
  $playerStatus.setKey('positionMs', e.payload.positionMs);
  $playerStatus.setKey('durationMs', e.payload.durationMs);
});
```

### 5.2. Компоненти

**Структура:**
```
src/components/player/
├── PlayerPanel.tsx      — головний контейнер
├── PlaybackPosition.tsx — Slider (file) / ProgressBar (live)
└── VolumeSlider.tsx     — React Aria Slider
```

**`PlayerPanel.tsx`** — постійна нижня панель:

```tsx
<div role="complementary" aria-label={m.player_panel_label()}>
  <div className="flex items-center gap-2">
    <Button
      aria-label={isPlaying ? m.pause() : m.play()}
      onPress={handlePlayPause}
    >
      {isPlaying ? <Pause aria-hidden /> : <Play aria-hidden />}
    </Button>
    <Button aria-label={m.stop()} onPress={handleStop}>
      <Square aria-hidden />
    </Button>
    <span aria-live="polite" aria-atomic="true">
      {sourceLabel}  {/* "SomaFM Groove Salad — Tycho - Awake" */}
    </span>
  </div>

  <PlaybackPosition />
  <VolumeSlider />
</div>
```

**`PlaybackPosition.tsx`:**
- `source.type === 'file'` → React Aria `Slider` з seek
  - `aria-label={m.playback_position()}`
  - `aria-valuetext` → `"3 хвилини 12 секунд"`
  - `onChange` (після release) → `invoke('seek_playback', { positionMs })`
- `source.type === 'stream'` → React Aria `ProgressBar` (indeterminate)
  - `aria-label={m.live_stream()}`
- `state === 'stopped'` → `hidden`

**`VolumeSlider.tsx`:**
```tsx
<Slider
  aria-label={m.volume()}
  minValue={0} maxValue={100}
  value={Math.round(volume * 100)}
  onChange={v => invoke('set_volume', { volume: v / 100 })}
/>
// NVDA оголошує: "Гучність, 75"
```

### 5.3. Keyboard navigation

| Клавіша | Дія |
|---|---|
| `Tab` | Вхід у PlayerPanel після StreamTable |
| `Space` / `Enter` на Play/Pause | Invoke play/pause |
| `←` `→` на Seek Slider | Перемотати ±5 секунд |
| `←` `→` на Volume Slider | ±5% гучності |
| `Home` / `End` на Seek Slider | Початок / кінець файлу |
| `Escape` | Повернути фокус у StreamTable |

### 5.4. Live regions (NVDA)

| Подія | Тип | Оголошення |
|---|---|---|
| Play (stream) | assertive | "Відтворення: SomaFM Groove Salad" |
| Play (file) | assertive | "Відтворення файлу: Tycho - Awake" |
| Track changed (live) | polite | "Tycho - Awake" |
| Pause | assertive | "Відтворення призупинено" |
| Stop | assertive | "Відтворення зупинено" |
| Error | assertive | "Помилка відтворення: [опис]" |
| Device unavailable | assertive | "Аудіо пристрій недоступний" |

---

## 6. Обробка помилок

| Ситуація | Поведінка |
|---|---|
| HTTP stream недоступний | `play_stream` → `Err` → toast + assertive announce |
| Файл не існує | `play_file` → `Err` → toast "Файл не знайдено" |
| HE-AAC (32-64 kbps) | `Err` → toast "Формат не підтримується (HE-AAC)" |
| Stream обривається під час live playback | emit `player-status { state: "stopped" }` → toast + assertive |
| Аудіо пристрій зник | emit `player-status { state: "stopped" }` → toast |
| Seek на live stream | Захищено на рівні UI (Slider не відображається); backend повертає `Err` як safety net |

---

## 7. Залежності та інтеграція

**Нові Rust крейти:** Не потрібні — `rodio` (з symphonia features) вже є в `Cargo.toml`.

**Нові Tauri плагіни:** Не потрібні.

**Зміни в `AppState`:**
```rust
pub struct AppState {
    pub stream_manager: Arc<StreamManager>,
    pub player: Arc<PlayerEngine>,          // новий
    // ...
}
```

**Зміни в `lib.rs`:** Реєстрація нових команд у `.invoke_handler()`.

**Зміни в `App.tsx`:** Підключення event listeners для `player-status` та `player-progress`.

**Зміни в layout:** `PlayerPanel` додається як постійний footer між `ContentArea` та кінцем `<main>`.

---

## 8. Критерії готовності

- [ ] Live playback потоку через незалежне HTTP-з'єднання
- [ ] Одночасний запис і відтворення одного потоку працюють
- [ ] Відтворення MP3/AAC файлів
- [ ] Seek для файлів (Slider, ±5с клавішами)
- [ ] Volume slider (0–100%, NVDA оголошує рівень)
- [ ] Progress events кожну 1с під час file playback
- [ ] Вибір аудіо-пристрою (зупиняє відтворення)
- [ ] `player-status` events при кожній зміні стану
- [ ] PlayerPanel — постійна нижня панель, завжди видима
- [ ] Повна клавіатурна навігація (Tab, Space, стрілки, Home/End)
- [ ] NVDA оголошує стан відтворення та зміни треку
- [ ] Focus trap не порушений (PlayerPanel не перехоплює Escape від діалогів)
- [ ] Volume зберігається у `profile.playerSession.volume`
- [ ] Graceful shutdown зберігає volume
