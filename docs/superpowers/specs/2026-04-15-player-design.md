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
| `player-status` | `PlayerStatus` (повний struct) | play/pause/stop/device change |
| `player-progress` | `PlayerProgressPayload { positionMs, durationMs }` | кожну 1с під час file playback |

> **Примітка:** `data-models.md` §5 визначає тонкий `PlayerStatusPayload { status }`. Цей дизайн використовує повний `PlayerStatus` struct як payload (аналогічно до `stream-info-updated`), оскільки фронтенд потребує всіх полів (source, volume, positionMs, durationMs). `data-models.md` буде оновлено відповідно.

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
    output_device: Arc<Mutex<Option<String>>>,       // None = system default
    // Option дозволяє drop + recreate у set_output_device без borrowing конфліктів.
    // Загортається в Mutex, щоб set_output_device не вимагав &mut self.
    output_stream: Arc<Mutex<Option<OutputStream>>>, // тримає аудіо вивід живим
    output_handle: Arc<Mutex<OutputStreamHandle>>,
}

struct PlaybackSession {
    sink: Arc<Sink>,
    cancel: CancellationToken,
    source: PlaybackSource,      // Stream { stream_id } | File { path }
    duration_ms: Option<u64>,    // Some для файлів, None для live потоків
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

> **Архітектурне рішення:** `implementation-phases.md` згадує "tee від StreamManager" як початковий план. За результатами brainstorming прийнято рішення використовувати **незалежне HTTP-з'єднання** замість tee. Причина: tee ускладнює StreamManager, вносить спільний mutable стан між записом і відтворенням, і ускладнює незалежне управління lifecycle. Незалежне з'єднання — простіше, ізольованіше, і не впливає на запис при помилках відтворення. `implementation-phases.md` буде оновлено відповідно.

1. Скасувати поточну сесію (`cancel.cancel()`, drop session)
2. Отримати URL потоку з `StreamManager` за `stream_id`
3. Підключитись через існуючий `stream::connection` код — незалежне HTTP-з'єднання, без запису
4. Створити SPSC ring buffer через `rtrb::RingBuffer::<u8>::new(capacity)` → `(producer, consumer)`
5. Spawn tokio-таск: читати байти з HTTP → `producer.write_chunk(bytes)` (lock-free, без mutex на кожному sample)
6. Створити `LiveSource` що реалізує `rodio::Source<Item=i16>` — приймає `consumer` (не Arc<Mutex>), декодує через symphonia frame-by-frame
7. `sink.append(live_source)` → rodio → аудіо вивід
8. Emit `player-status` (повний `PlayerStatus` struct) з `state: "playing"`, `source: Stream { stream_id }`, `volume`

> **Ring buffer:** `Arc<Mutex<VecDeque<u8>>>` блокує mutex на кожному audio sample — неприйнятно для real-time аудіо. `rtrb` — lock-free SPSC черга (Single Producer Single Consumer): producer у writer task, consumer у `LiveSource::next()`. Crate `rtrb` додається до `Cargo.toml`.

> Якщо потік вже записується — live playback підключається окремим HTTP-з'єднанням. Запис не переривається.

### 3.4. File playback (`play_file`)

1. Скасувати поточну сесію
2. `rodio::Decoder::new(BufReader::new(File::open(path)?))` — symphonia всередині
3. Отримати тривалість через `decoder.total_duration()`
4. `sink.append(decoder)`
5. Spawn `progress_task`: loop кожну 1с → `sink.get_pos()` → emit `player-progress { positionMs, durationMs }`
6. Emit `player-status { state: "playing", source: File { path }, volume, durationMs }`

### 3.5. Seek (`seek_playback`)

Seek підтримується лише для file playback. При виклику на live stream — повертає `Err`.

**Реалізація через `Sink::try_seek` (rodio 0.22):**

```rust
pub async fn seek(&self, position_ms: u64, app_handle: &AppHandle) -> Result<()> {
    let session = self.session.lock().await;
    let session = session.as_ref().ok_or("not playing")?;

    match &session.source {
        PlaybackSource::File { .. } => {
            // rodio 0.22: Sink::try_seek делегує до symphonia Decoder,
            // який реалізує Source + Seek. Не зупиняє sink.
            session.sink
                .try_seek(Duration::from_millis(position_ms))
                .map_err(|e| anyhow!("seek failed: {e}"))?;
            // emit player-progress з новою позицією
            let pos_ms = session.sink.get_pos().as_millis() as u64;
            app_handle.emit("player-progress", PlayerProgressPayload {
                position_ms: pos_ms,
                duration_ms: session.duration_ms.unwrap_or(0),
            })?;
        }
        PlaybackSource::Stream { .. } => return Err(anyhow!("seek unavailable for live stream")),
    }
    Ok(())
}
```

> `sink.stop()` назавжди зупиняє Sink — його не можна перевикористати. `Sink::try_seek` (rodio 0.17+) — правильний API для seek без перестворення Sink.

### 3.6. Volume (`set_volume`)

```rust
pub async fn set_volume(&self, volume: f32, app_handle: &AppHandle) -> Result<()> {
    // volume: 0.0 — 1.0
    *self.volume.lock().await = volume;
    if let Some(session) = self.session.lock().await.as_ref() {
        session.sink.set_volume(volume);
    }
    // Зберегти у profile.playerSession.volume через ProfileManager в AppState
    // Emit player-status щоб UI (і майбутній tray) отримали нову гучність
    app_handle.emit("player-status", self.get_status().await)?;
    Ok(())
}
```

Зміна гучності не перериває відтворення. `AppHandle` передається з `player_commands.rs`.

### 3.7. Output device (`set_output_device`)

1. Зупинити поточне відтворення (emit `player-status { state: "stopped" }`)
2. Drop поточний `_output_stream`
3. Знайти пристрій за ім'ям через `cpal::available_hosts()` / `cpal::default_host().output_devices()`
4. Створити новий `OutputStream::try_from_device(&device)?`
5. Оновити `output_handle`
6. Зберегти `output_device` в `settings.json` через SettingsManager

```rust
pub async fn list_output_devices() -> Result<Vec<AudioDevice>> {
    // cpal device enumeration є синхронним — виконуємо у spawn_blocking
    // щоб не блокувати tokio thread pool.
    // spawn_blocking повертає JoinHandle<Result<...>>:
    // перший .await? обробляє JoinError, другий ? — inner Result.
    tokio::task::spawn_blocking(|| -> anyhow::Result<Vec<AudioDevice>> {
        let host = cpal::default_host();
        let default_name = host.default_output_device()
            .and_then(|d| d.name().ok());
        let devices: Vec<AudioDevice> = host
            .output_devices()
            .context("failed to enumerate audio output devices")?
            .filter_map(|d| d.name().ok().map(|name| AudioDevice {
                is_default: Some(&name) == default_name.as_ref(),
                name,
            }))
            .collect();
        Ok(devices)
    })
    .await
    .context("device enumeration task panicked")? // JoinError → anyhow
    .context("device enumeration failed")         // inner Result
}
```

### 3.8. Graceful shutdown

При закритті програми (`on_window_event CloseRequested`):
- `PlayerEngine::stop()` — скасувати сесію
- Зберегти `playerSession.volume` у профіль

> **`PlayerSession.lastStreamId` та `lastFilePosition`** (resume position) визначені в `data-models.md` але виходять за scope цієї фази. Поля присутні у struct, але не заповнюються — відновлення попереднього відтворення реалізується пізніше.

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
pub async fn set_volume(volume: f32, state: State<'_, AppState>, app: AppHandle) -> Result<(), String>
// AppHandle потрібен для: emit "player-status" після зміни + persist через ProfileManager

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
listen('player-progress', (e: { payload: { positionMs: number; durationMs: number } }) => {
  // atom не має setKey — оновлення через spread
  $playerStatus.set({
    ...$playerStatus.get(),
    positionMs: e.payload.positionMs,
    durationMs: e.payload.durationMs,
  });
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
- `source.type === 'file'` → React Aria `Slider` з seek:
  ```tsx
  <Slider
    aria-label={m.playback_position()}
    aria-valuetext={formatTime(positionMs)}   // "3 хвилини 12 секунд"
    value={positionMs}
    maxValue={durationMs ?? 0}
    onChangeEnd={pos => invoke('seek_playback', { positionMs: pos })}
    // onChangeEnd — seek тільки після відпускання, не під час drag
    // onChange НЕ використовується для invoke, щоб не надсилати seek на кожен px
  />
  ```
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

**Нові Rust крейти:**
- `rtrb` — lock-free SPSC ring buffer для live stream (LiveSource). Додати до `Cargo.toml`: `rtrb = "0.3"`
- `rodio` (вже є) — `symphonia-mp3`, `symphonia-aac`, `symphonia-isomp4` features вже підключені

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
