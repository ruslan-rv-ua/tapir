# Відновлення останнього відтворення при запуску

- **Слаг:** `resume-last-playback`
- **Тип:** покращення
- **Стан:** draft (модель узгоджена 2026-06-25 — див. «Прийняті рішення»)
- **Зусилля:** M (раніше S; зросло через окремий per-profile діалог «Налаштування профілю» + нову IPC-команду + правила скидання при дублюванні/експорті)
- **Оновлено:** 2026-06-25
- **Залежності:** **#1 [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md)** — єдине джерело правди `PlayerSession`; цей запис є **надбудовою** над ним. Phase 2A (PlayerEngine ✅), Phase 2C (SettingsDialog ✅), `profile.rs` (`PlayerSession`, `duplicate`, `export_json_str`, `commit_import`), профільний UI (`ProfileContextMenu`). Координація з [autostart](p2-autostart.md) і [crash-recovery](p1-crash-recovery.md).

## Опис

При наступному запуску програма — **за бажанням користувача, налаштованим окремо для кожного профілю** — починає відтворювати те, що грало під час попереднього сеансу в цьому профілі: чи то живий радіо-потік, чи записаний файл.

**UX-цінність:**
- Типовий радіо-слухач очікує «продовжити з того ж місця» без зайвих дій.
- Для незрячого користувача (NVDA) — критично менша кількість кроків навігації: замість пошуку потоку у списку, вибору, запуску — одразу звук (коли користувач свідомо це ввімкнув).
- Особливо цінно у поєднанні з autostart: програма запускається у фоні і одразу починає грати — користувач просто вмикає комп'ютер.

## Рішення A1 — модель персистенсу (узгоджено 2026-06-25)

Закрито в [OPEN-QUESTIONS.md → A1](OPEN-QUESTIONS.md). Цей запис — **тонкий шар політики + UI поверх `PlayerSession` з #1**, а не друге джерело правди:

- **Дані** («що грало + позиція») — у `PlayerSession` профілю: `last_stream_id`, `last_file_position {path, position_ms}`, дискримінатор `last_active`. Їх оживляє #1. **Окремого `data/last_playback.json` не буде** (скасовано — уникнути двох джерел правди).
- **Політика** («чи й як стартувати») — нове поле `startup_playback_mode` **у тому ж `PlayerSession`**, тобто **per-profile**: кожен профіль має свій режим старту, **а не** глобальне поле в `settings.json`.
- Наслідок: на старті **один read активного профілю** дає одразу і «чи грати», і «що грати» — політика й ціль подорожують разом, нема ризику взяти режим з одного профілю, а ціль з іншого.

## Критерії готовності

- [ ] У `PlayerSession` ([profile.rs](../../src-tauri/src/profile.rs)) додано поле `startup_playback_mode` з трьома значеннями (`never`, `always_paused`, `always_play`), `#[serde(default)]` → **`never`**. Жодного глобального поля в `settings.json` для цієї фічі.
- [ ] Дані resume (`last_stream_id` / `last_file_position` / `last_active`) — ті самі, що пише й читає #1; цей запис **не** заводить власного сховища.
- [ ] На старті (`lib.rs` setup, **після** завантаження активного профілю) читається `active_profile.player_session.startup_playback_mode` і застосовується (таблиця нижче). Помилка / недоступний таргет — startup **не блокується**, протухлий запис очищується (механізм #1).
- [ ] Авто-гра — **явний opt-in**; дефолт `never`. Хто вмикає `always_play`, свідомо приймає, що NVDA може не прозвучати вітання на старті ([[nvda-startup-foreground]]); підпис у UI прямо про це попереджає.
- [ ] Окремий діалог **«Налаштування профілю»** (новий компонент, `role="dialog"`), вхід із `ProfileContextMenu` — **не** розширення спільного `ProfileNameDialog`. Містить комбобокс `startup_playback_mode`. Нова IPC-команда зберігає поле в **обраний** профіль (load→modify→save); якщо профіль активний — оновлюється і in-memory `AppState`.
- [ ] `duplicate()` скидає у дубля `startup_playback_mode→never`, `last_stream_id→None`, `last_file_position→None`, `last_active→None`; `volume` переноситься (роблячи чесним наявний коментар «starts fresh»).
- [ ] `export_json_str` (поряд зі стрипом паролів) скидає `startup_playback_mode→never` і стирає `last_file_position` (абсолютний шлях — приватність + протухає на чужій машині). `commit_import` додатково клампить `startup_playback_mode→never` (defense-in-depth).
- [ ] При авто-старті frontend виводить `aria-live="polite"` анонс «Відтворення: [назва]»; назва **резолвиться на льоту** (потік → `StreamInfo`, файл → ім'я файлу), не кешується в профілі.

## Технічні деталі

### Де зберігати (єдине джерело правди)

Усе — в `PlayerSession` профілю (`*.tapirprofile` JSON), поряд з уже наявним `volume`:

```rust
pub struct PlayerSession {
    pub volume: f32,
    pub last_stream_id: Option<String>,          // оживляє #1
    pub last_file_position: Option<FilePosition>, // { path, position_ms } — оживляє #1
    pub last_active: Option<LastActive>,          // дискримінатор «останнє активне» — #1
    pub startup_playback_mode: StartupPlaybackMode, // ЦЯ фіча; default = Never
}
```

### Таблиця застосування режиму на старті

| Режим | Файл як останнє джерело | Потік як останнє джерело |
|---|---|---|
| `never` (дефолт) | нічого | нічого |
| `always_paused` | завантажити, seek на `position_ms`, **не грати** | тиша, але ціль «зведена» — перше `Ctrl+Shift+K` робить reconnect |
| `always_play` | завантажити + seek + **грати** | reconnect + **грати** |

> `restore` (грати, лише якщо минулого разу грало) **відкинуто** — потребував би окремого поля стану «грало/стояло»; не вартий ускладнення в 1-й ітерації. Двері відчинені на потім.
>
> `always_paused` для потоку фізично вироджується в «тишу + зведену ціль», бо в моделі `PlayerEngine` потік не має паузи (або грає, або зупинений).

### Коли зберігати (спільний шлях запису з #1)

- `last_stream_id` / `last_file_position` пишуться **на переходах** (pause / stop / зміна треку / graceful-shutdown), як визначає #1 — **не** на кожен progress-tick. Цей запис **не** додає окремого write-path.
- `startup_playback_mode` пишеться лише з діалогу «Налаштування профілю».

### Взаємодія з Crash Recovery (A2 — знято)

Раніше планувався окремий `data/last_playback.json`; **скасовано** (A1). Тепер:

| Сховище | Призначення |
|---------|-------------|
| `PlayerSession` (у профілі) | стан відтворення: останнє джерело, позиція, режим старту (ця фіча + #1) |
| `data/state.json` (Phase 3K) | crash recovery: незавершені записи |

Це два **чітко різні** сховища (профіль ≠ `state.json`); звіряти структури вже нема потреби — питання A2 знято.

### Взаємодія з Autostart (A3 — per-profile)

- Autostart **сам по собі не грає**. Він лише запускає програму (`--minimize`); далі діє `startup_playback_mode` **активного профілю**.
- Тобто autostart авто-грає **тоді й лише тоді**, коли активний профіль має `always_play`. Це і є новий, точніший зміст A3 (раніше — «ніколи»).
- Якщо вікно приховане (tray) — `aria-live`-анонс при першому відкритті; tray-tooltip показує назву потоку.

### Обробка помилок

| Ситуація | Поведінка |
|----------|-----------|
| Записаний файл не знайдено на диску | Тихо скипати, очистити resume-поля профілю, продовжити (механізм #1) |
| Потік не відповідає | Стандартна логіка retry/error `PlayerEngine`; startup не блокувати |
| Профіль пошкоджений / невалідний | Існуюча обробка завантаження профілю; resume просто не спрацьовує |
| `startup_playback_mode = never` | resume-поля все одно пишуться (для `Ctrl+Shift+K`), але авто-старт не запускається |

### Rust-модулі (орієнтовно)

- `src-tauri/src/profile.rs` — нове поле `startup_playback_mode` у `PlayerSession` (enum `StartupPlaybackMode`, default `Never`); скидання в `duplicate()`; стрип у `export_json_str`; кламп у `commit_import`.
- `src-tauri/src/commands/profile_commands.rs` — **нова IPC-команда** збереження налаштувань профілю (напр. `set_profile_startup_mode(name, mode)`); коректне оновлення активного профілю в `AppState`, якщо редагується саме він.
- `src-tauri/src/lib.rs` (startup hook) — після завантаження активного профілю прочитати `startup_playback_mode` і застосувати; ділить resume-функцію з cold-start-гілкою `Ctrl+Shift+K` з #1.
- `src-tauri/src/player/engine.rs` — повторно використати `play_live` / `play_file` (+ seek) з #1; окремого коду не треба.

### Frontend (орієнтовно)

- `src/components/profile/ProfileSettingsDialog.tsx` — **новий** діалог `role="dialog"` з комбобоксом `startup_playback_mode` + попереджувальний підпис про NVDA на старті. **Не** розширювати `ProfileNameDialog` (він узагальнений і спільний для create/rename).
- `src/components/profile/ProfileContextMenu.tsx` — пункт «Налаштування профілю…», що відкриває діалог для **обраного** (не обов'язково активного) профілю.
- `aria-live="polite"` анонс при авто-старті — через `useAnnounce`; назва резолвиться на льоту.

## Прийняті рішення

| Питання | Рішення |
|---------|--------|
| Де зберігати стан? | **`PlayerSession` профілю** (єдине джерело правди з #1). Окремого `last_playback.json` немає. (A1) |
| Скоуп режиму? | **Per-profile** — поле `startup_playback_mode` у `PlayerSession`, не глобально в `settings.json`. |
| Які режими? | **`never` / `always_paused` / `always_play`.** `restore` відкинуто (потребував би поля стану). |
| Авто-гра на старті? | **Явний opt-in**, дефолт `never`. Свідома відмова від «NVDA чути на старті» лише для тих, хто ввімкнув `always_play`. |
| Де в UI? | **Новий окремий діалог «Налаштування профілю»** з `ProfileContextMenu` (`role="dialog"`), не розширення `ProfileNameDialog`. |
| Дублювання профілю | Скидати `startup_playback_mode→never` + resume-поля у `None`; `volume` переноситься. |
| Експорт/імпорт | Скидати `startup_playback_mode→never` і стирати `last_file_position` на експорті; кламп `→never` ще й на імпорті. |
| Назва для анонсу | **Резолвити на льоту** (потік → `StreamInfo`, файл → ім'я), не кешувати. |
| Тайм-аут потоку | Існуюча логіка retry у `PlayerEngine`. Окремої поведінки не треба. |
| Позиція для файлів | Відновлювати з `position_ms` (seek symphonia). Для потоків позиція `null`. |

## Відкриті питання (рівень реалізації)

- 🟦 **Форма дискримінатора `last_active`** — спадщина #1 (окреме поле enum vs `updated_at`-timestamp); вирішується разом з #1.
- 🟦 **Seek до `position_ms` для всіх форматів** (symphonia) — якщо формат не сікається, fallback «з початку». Спільне з #1.
- 🟨 **Синхронізація активного профілю** — нова IPC при редагуванні **активного** профілю має оновити і файл, і in-memory `AppState`, без рейсів із записом стану відтворення.
- 🟨 **NVDA: комбобокс у модалці** — react-aria `Select` відкриває listbox через портал; перевірити, що Modal не aria-ховає список ([[live-region-inside-modals]], [[portal-dialog-inside-collection-double-mount]]).
- 🟥 **Чи лишати `always_paused`** взагалі — для потоку він вироджується в «тишу»; корисний лише для файлів. Тримати (нешкідливий) чи звузити до `never`/`always_play`? _Поки тримати._

## Документи

- [docs/implementation-phases.md](../implementation-phases.md) — Phase 2A (PlayerEngine), Phase 2C (Settings), Phase 3K (Crash Recovery)
- [docs/architecture.md](../architecture.md) — backend-first, IPC, PlayerEngine, профілі
- [docs/data-models.md](../data-models.md) — §3.7 `PlayerSession` (оновити: нове поле `startup_playback_mode`)
- [docs/accessibility.md](../accessibility.md) — NVDA, `aria-live`, `useAnnounce`, модальні діалоги
- Код: `src-tauri/src/profile.rs`, `src-tauri/src/commands/profile_commands.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/player/engine.rs`, `src/components/profile/`
- Portable storage: `src-tauri/src/portable.rs`
- Пам'ять: [[nvda-startup-foreground]], [[live-region-inside-modals]], [[portal-dialog-inside-collection-double-mount]], [[profiles-recording-model]]
- Перехресне: [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) (A1 ✅, A2 знято, A3 per-profile), [IMPLEMENTATION-ORDER.md](IMPLEMENTATION-ORDER.md) (#10)

## Промпт для агента

```text
Реалізація узгодженої моделі (рішення A1 закрите — див. «Прийняті рішення»). Спершу звірся з контекстом, не починай правок наосліп. Залежність: спершу має бути зроблено #1 (playback-toggle-stop-pause), бо він оживляє PlayerSession (last_stream_id/last_file_position/last_active) — цей запис надбудовується над ним.

Що зробити:
1) profile.rs: додати у PlayerSession поле startup_playback_mode (enum Never|AlwaysPaused|AlwaysPlay, #[serde(default)] = Never). Жодного глобального поля в settings.json.
2) duplicate(): скинути startup_playback_mode→Never + last_stream_id/last_file_position/last_active→None; volume лишити. (Заразом чесний коментар «starts fresh».)
3) export_json_str(): поряд зі стрипом паролів скинути startup_playback_mode→Never і стерти last_file_position (абсолютний шлях). commit_import: кламп startup_playback_mode→Never.
4) profile_commands.rs: нова IPC set_profile_startup_mode(name, mode) — load→modify→save обраного профілю; якщо активний — оновити in-memory AppState без рейсів.
5) lib.rs startup hook: після завантаження активного профілю прочитати startup_playback_mode і застосувати (never→нічого; always_paused→завантажити+seek, не грати [потік: тиша+ціль зведена]; always_play→грати/reconnect). Ділити resume-функцію з cold-start-гілкою Ctrl+Shift+K з #1. Помилка/недоступний таргет — не блокувати startup, очистити запис.
6) Frontend: новий ProfileSettingsDialog (role="dialog") з комбобоксом режиму + попереджувальний підпис про NVDA на старті; вхід із ProfileContextMenu для ОБРАНОГО профілю. НЕ розширювати спільний ProfileNameDialog. Перевір [[live-region-inside-modals]] / [[portal-dialog-inside-collection-double-mount]] для Select у модалці.
7) aria-live="polite" «Відтворення: [назва]» на авто-старті; назву резолвити на льоту (потік→StreamInfo, файл→ім'я).
8) Оновити доки: data-models.md §3.7 (нове поле), architecture.md, accessibility.md.

Звірся: profile.rs (PlayerSession, duplicate, export_json_str), profile_commands.rs (наявні команди, switch/active state), lib.rs (порядок setup — профіль ДО resume-хука), player/engine.rs (play_live/play_file/seek з #1), src/components/profile/. Узгодь з autostart (A3: автогра лише якщо активний профіль = always_play).

Гейти: cargo test + cargo clippy; pnpm test + pnpm vite:build (tsc має ~51 преекзистинг-помилку від paraglide — не блокер, [[typecheck-paraglide-gotchas]]); ручний прогін з NVDA: per-profile діалог, авто-старт always_play на потоці й файлі, дубль/експорт скидає режим.
```
