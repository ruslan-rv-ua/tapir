# Відновлення останнього відтворення при запуску

- **Слаг:** `resume-last-playback`
- **Тип:** ідея
- **Стан:** draft
- **Зусилля:** S
- **Оновлено:** 2026-06-15
- **Залежності:** Phase 2A (PlayerEngine ✅), Phase 2C (SettingsDialog ✅); узгодити з Phase 3K (Crash Recovery ⬜) щодо `data/state.json`

## Опис

При наступному запуску програма автоматично починає відтворювати те, що грало під час попереднього сеансу — чи то живий радіо-потік, чи записаний файл.

**UX-цінність:**
- Типовий радіо-слухач очікує «продовжити з того ж місця» без зайвих дій.
- Для незрячого користувача (NVDA) — критично менша кількість кроків навігації: замість пошуку потоку у списку, вибору, запуску — одразу звук.
- Особливо цінно у поєднанні з autostart (3I-2): програма запускається у фоні і одразу починає грати — користувач просто вмикає комп'ютер.

## Критерії готовності

- [ ] При зупинці відтворення або завершенні програми (graceful shutdown) зберігається файл `data/last_playback.json` з типом джерела (`stream` або `file`), ідентифікатором (URL потоку або абсолютний шлях до файлу) та позицією у секундах (лише для файлів).
- [ ] При запуску, якщо `startup_playback_mode ≠ never` і `data/last_playback.json` існує — `PlayerEngine` діє згідно вибраному режиму; при помилці (файл видалено, потік недоступний) — startup не блокується.
- [ ] У `SettingsDialog` (вкладка **Playback**) додано комбобокс `startup_playback_mode` з чотирма варіантами (`never`, `always_paused`, `always_play`, `restore`); значення зберігається у `data/settings.json`; при авто-відтворенні frontend виводить `aria-live="polite"` анонс «Відтворення: [назва]».

## Технічні деталі

### Що зберігати

Файл `data/last_playback.json` (новий, окремий від `settings.json` і від майбутнього `state.json`):

```json
{
  "source_type": "stream",
  "identifier": "https://radio.example.com/stream",
  "display_name": "Радіо Промінь",
  "position_secs": null
}
```

або для файлу:

```json
{
  "source_type": "file",
  "identifier": "/absolute/path/to/data/recordings/2026-06-15_Recording.mp3",
  "display_name": "2026-06-15_Recording.mp3",
  "position_secs": 142.5
}
```

### Коли зберігати

- При зміні джерела відтворення (новий потік / новий файл).
- При зупинці (`stop` IPC команда) — оновити `position_secs` для файлів.
- При graceful shutdown (`on_window_close` / `Exit` з tray) — фінальна позиція.
- **Не** зберігати кожну секунду — лише на дискретних подіях.

### Взаємодія з Crash Recovery (Phase 3K ⬜)

Phase 3K планує `data/state.json` для відновлення після краш-завершення (незбережений запис тощо). Стан відтворення і стан запису — **різні речі**, їх треба тримати в окремих файлах:

| Файл | Призначення |
|------|-------------|
| `data/last_playback.json` | Остання відтворювана позиція (ця фіча) |
| `data/state.json` | Crash recovery: незавершені записи, тимчасові мітки (Phase 3K) |

При реалізації Phase 3K треба узгодити структури, щоб уникнути дублювання.

### Взаємодія з Autostart (Phase 3I-2 ⬜)

- `autostart + resumePlaybackOnStartup = true` → програма запускається, вікно може бути приховане (tray), але відтворення починається у фоні.
- Tray-іконка: показати назву потоку у tooltip або контекстному меню.
- Якщо вікно відкрите — `aria-live` анонс; якщо вікно ще не відкрите — анонс при першому відкритті.

### Обробка помилок

| Ситуація | Поведінка |
|----------|-----------|
| Записаний файл не знайдено на диску | Тихо скипати (без діалогу помилки), очистити `last_playback.json`, продовжити завантаження |
| Потік не відповідає | Стандартна помилка `PlayerEngine` (існуючий механізм retry/error), не блокувати startup |
| `last_playback.json` пошкоджений / невалідний JSON | Видалити файл, продовжити без відновлення |
| `resumePlaybackOnStartup = false` | Файл `last_playback.json` все одно зберігається (на майбутнє), але auto-play не запускається |

### Rust-модулі (орієнтовно)

- `src-tauri/src/last_playback.rs` — структура `LastPlayback`, `save()`, `load()`, `clear()`.
- `src-tauri/src/player_engine.rs` — виклик `last_playback::save()` при відповідних IPC-подіях.
- `src-tauri/src/settings.rs` — нове поле `resume_playback_on_startup: bool` (default: `false`).
- `src-tauri/src/lib.rs` (startup hook) — читання `last_playback.json`, перевірка налаштування, старт відтворення.

### Frontend (орієнтовно)

- `src/components/settings/GeneralSettings.tsx` (або новий `PlaybackSettings.tsx`) — чекбокс `resumePlaybackOnStartup`.
- `src/stores/playerStatus.ts` (`$playerStatus`) — вже існує, отримає подію auto-play через Tauri event.
- `aria-live="polite"` анонс у `PlayerPanel` або через `useAnnounce` hook — «Відтворення: [назва]»; `polite`, а не `assertive`, щоб не переривати можливий голос читача при завантаженні.

## Прийняті рішення

| Питання | Рішення |
|---------|--------|
| Де зберігати стан? | **Окремий `data/last_playback.json`.** Без залежності від Phase 3K. |
| Режим при запуску? | **Enum `startup_playback_mode`** — комбобокс замість чекбокса (три значення, div. нижче). |
| Тайм-аут потоку? | Використовувати існуючу логіку retry у `PlayerEngine`. Окремої поведінки не треба. |
| Позиція для файлів? | Відновлювати з збереженої секунди (`seek` symphonia). Для потоків позиція `null`. |
| Де в SettingsDialog? | **Новий таб Playback** у SettingsDialog. |

### Режим відтворення при запуску (`startup_playback_mode`)

Замість простого чекбокса — комбобокс з трьома значеннями:

| Значення | Поведінка |
|---|---|
| `never` | Не відновлювати відтворення. (Еквівалент disabled.) |
| `always_paused` | Завантажити останнє джерело, але зупинитися (для файлів — на збереженій позиції). Дає орієнтацію без звуку. |
| `always_play` | Одразу почати відтворення. Найзручніше для "радіо при старті". |
| `restore` | Відновити стан: якщо "грало" — грати, якщо "зупинено" — завантажити, але не грати. |

**Важлива деталь для потоків:** live stream не має паузи в нашій моделі (`PlayerEngine` або грає, або зупинений). Тому для потоків `restore` = `always_play` якщо стан був «грав», або «нічого» якщо «зупинено».

Default: `never` (безпечно, не дивує нових користувачів).

## Документи

- [docs/implementation-phases.md](../implementation-phases.md) — Phase 2A (PlayerEngine), Phase 2C (Settings), Phase 3K (Crash Recovery)
- [docs/architecture.md](../architecture.md) — backend-first, IPC, PlayerEngine
- [docs/data-models.md](../data-models.md) — структури даних, `settings.json`
- [docs/accessibility.md](../accessibility.md) — NVDA, `aria-live`, `useAnnounce`
- Код PlayerEngine: `src-tauri/src/player_engine.rs`
- Код налаштувань: `src-tauri/src/settings.rs`, `src/components/settings/`
- Portable storage: `src-tauri/src/portable.rs`
- Announce hook: `src/hooks/useAnnounce.ts`

## Промпт для агента

Каталог промптів за типом: [README — Каталог промптів](README.md#каталог-промптів-за-типом).
Тип `ідея`.
