---
slug: playback-toggle-stop-pause
title: "Контекстний playback-toggle: stop для потоку, pause для файлу + resume останнього"
priority: P1
type: planned
status: done
effort: M
kind: feature
target: 0.2.0
updated: 2026-07-18
completed: 2026-07-18
a11y: true
depends_on: []
blocks: [resume-file-from-setting, resume-last-playback]
touches: [src-tauri/src/shortcuts.rs, src-tauri/src/player/engine.rs, src-tauri/src/profile.rs, src-tauri/src/settings.rs, src-tauri/src/app_state.rs, src-tauri/src/tray]
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
notes: ["злито в develop 2026-07-18, merge 4189826; перевірено з NVDA"]
---

# Контекстний playback-toggle: stop для потоку, pause для файлу + resume останнього

> **Контекст:** виконано й перевірено з NVDA, злито в `develop`. База для [resume-file-from-setting](p2-resume-file-from-setting.md) і [resume-last-playback](p1-resume-last-playback.md).

## Опис

**Проблема 1 — семантика.** Зараз `toggle_playback` ([shortcuts.rs:146](../../../src-tauri/src/shortcuts.rs#L146)) на стані `Playing` **завжди** робить `pause_playback`, у т.ч. для **живого потоку**. Pause для live-стріму оманливий: «pause» обіцяє продовжити з того ж місця, а в ефірі такого місця немає — після resume користувач відстає або фактично перепідключається. UX-консенсус: для потоку коректна дія — **stop**, pause лишати файлам.

**Проблема 2 — клавіша.** Дефолт `Ctrl+Shift+P` глобально краде комбінацію: Firefox — приватне вікно (зарезервований системний шорткат), VS Code / редактори — Command Palette. Той самий клас проблеми, що й рішення *не* вішати mute на `Ctrl+Shift+M` через Teams ([[global-hotkey-defaults-decision]]).

**Проблема 3 — холодний старт.** Після запуску немає одного жесту «продовжити те, що слухав». Бажаний сценарій: запустив програму → натиснув клавішу → одразу пішло останнє відтворення. Це **явна дія**, а не auto-play на launch — авто-гра ворожа для NVDA, якому треба чути скрінрідер на старті ([[nvda-startup-foreground]]).

SMTC ([smtc.rs](../../../src-tauri/src/smtc.rs)) лишається окремим шляхом для апаратних медіаклавіш; ця комбінація — зручний клавіатурний дублікат.

## Ключова знахідка

Модель профілю **вже містить** потрібний персистенс, але він мертвий — [profile.rs:237-246](../../../src-tauri/src/profile.rs#L237-L246):

```rust
pub struct PlayerSession {
    pub volume: f32,
    pub last_stream_id: Option<String>,
    pub last_file_position: Option<FilePosition>,   // { path, position_ms }
}
```

`volume` з цієї структури **реально пишеться й відновлюється** ([app_state.rs:29](../../../src-tauri/src/app_state.rs#L29), [player_commands.rs:82](../../../src-tauri/src/commands/player_commands.rs#L82)), а `last_stream_id` / `last_file_position` **ніде не пишуться і не читаються** — лише оголошені в моделі й доках. Фічу спроєктовано, дроти не дотягнуто. `player_session` — **профіль-скоупед** і свідомо очищається при дублюванні профілю ([profile.rs:519](../../../src-tauri/src/profile.rs#L519)) → саме тут місце для resume-стану, **не** в `settings.json` (там глобальний конфіг). Завдання = оживити поля + додати дискримінатор.

## Рішення (закриті питання)

### Клавіша й поведінка
| # | Питання | Рішення |
|---|---|---|
| 1 | Клавіша замість `Ctrl+Shift+P` | **`Ctrl+Shift+K`** — мнемоніка play/pause (YouTube/медіаплеєри); правило «літери на `Ctrl+Shift`»; вільна серед хоткеїв Tapir (зайняті R/H/S); глобально майже без «м'язової пам'яті». |
| 2 | Поза активним відтворенням | **Симетричний toggle.** Файл: `Playing→pause`, `Paused→resume`. Потік: `Playing→stop`, `Stopped→reconnect`. Нічого → resume останнього (див. критерії) або no-op. |
| 3 | NVDA-озвучення | **Статус + назва**: «Пауза — <трек>», «Відновлено — <трек>», «Зупинено — <станція>», «Підключення — <станція>». |
| 4 | Міграція наявних інсталяцій | **Не мігрувати** (прецедент гучності [settings.rs:327](../../../src-tauri/src/settings.rs#L327)). Нові → `Ctrl+Shift+K`; наявний `Ctrl+Shift+P` лишається. |

### Resume / персистенс
| # | Питання | Рішення |
|---|---|---|
| 5 | Де зберігати | **Профіль** (`player_session`), не `settings.json` — модель уже там, скоуп правильний. |
| 6 | Що K відновлює, якщо є й потік, і файл | **Найновіше джерело будь-якого типу** — один маркер «останнє активне». K продовжує те, що слухав останнім. |
| 7 | Відновлення файлу + cadence | **З `position_ms` (seek), запис на переходах** (pause / stop / зміна треку / вихід). Без запису на кожен progress-tick. |
| 8 | Протухлий таргет (потік видалено / файл переміщено) | **Анонс «недоступно» + no-op**, протухлий запис очистити. Без падіння в «не те» відтворення. |
| 9 | Preview-джерело | **Транзитний — не персистити.** K під час preview = stop; у профіль не пишеться; cold-start ігнорує. |

## Цільова таблиця станів

| Стан | Джерело | Дія `Ctrl+Shift+K` | NVDA |
|---|---|---|---|
| Playing | File | pause + записати `last_file_position` | «Пауза — <трек>» |
| Paused | File | resume з position | «Відновлено — <трек>» |
| Playing | Stream | stop + записати `last_stream_id` | «Зупинено — <станція>» |
| Playing | Preview | stop (не персистити) | «Зупинено — <назва>» |
| Stopped / cold, last = stream | — | `play_live(last_stream_id)` | «Підключення — <станція>» |
| Stopped / cold, last = file | — | `play_file(path)` + seek `position_ms` | «Відтворення — <трек>» |
| Stopped / cold, таргет недоступний | — | no-op + очистити запис | «Останнє відтворення недоступне» |
| Stopped / cold, нічого не збережено | — | no-op | (тиша) |

## Деталі реалізації

- **Розгалуження** в арм `"toggle_playback"` [shortcuts.rs:146-156](../../../src-tauri/src/shortcuts.rs#L146-L156) за `PlayerStatus.source: Option<PlaybackSource>` — варіанти `Stream { stream_id }` / `File { path }` / `Preview { url, name }` ([engine.rs:23-32](../../../src-tauri/src/player/engine.rs#L23-L32)).
- **Stopped/cold-гілка** читає `active_profile.player_session` і за дискримінатором запускає `play_live` або `play_file(seek)`. Це **єдиний** механізм — in-session reconnect і cold-start resume зливаються; окремий in-memory last-source не потрібен (джерело правди — персистнутий `PlayerSession`).
- **Потрібен метод stop** на player (у поточному match лише pause/resume). Узгодити з трей-кнопкою `MENU_ID_TOGGLE_PLAYBACK` ([tray/handlers.rs](../../../src-tauri/src/tray/handlers.rs), [tray/menu.rs](../../../src-tauri/src/tray/menu.rs)).
- **Дискримінатор:** додати у `PlayerSession` маркер останнього активного — окреме поле `last_active: Option<"stream"|"file">`, що виставляється на кожному play-start.
- **Координація з [resume-last-playback](p1-resume-last-playback.md):** додає в **ту саму** `PlayerSession` per-profile поле `autoplay_on_startup` — надбудова над цими полями (єдине джерело правди); цей запис закладає поля й резюм-функцію, resume-last-playback викликає її на старті. Жодного окремого `last_playback.json`.
- **Запис позиції** — лише на переходах (pause/stop/track-change/quit); не на кожен progress-tick (запис у профіль-JSON важчий за крихітний state-файл; уникнути рейсів з іншими записами профілю).
- **Дефолт клавіші:** `default_hk_toggle_playback()` [settings.rs:138](../../../src-tauri/src/settings.rs#L138) → `"Ctrl+Shift+K"` + супутні тести [settings.rs:291](../../../src-tauri/src/settings.rs#L291).
- **NVDA-анонс:** Rust емітить статус+назву, webview озвучує через LiveAnnouncer; на cold-start вікно вже OS-foreground ([[nvda-startup-foreground]]). Лейбл дії у Settings/F1 (`settings_hotkey_toggle_playback` = «Відтворення (toggle)») лишається **загальним**.
- **Debounce:** зберегти `LAST_TOGGLE_PLAYBACK_MS` і спільну cell з трей-кнопкою ([keyboard-shortcuts.md:107](../../keyboard-shortcuts.md#L107)).

## Критерії готовності

- [x] Дефолт `togglePlayback` = `Ctrl+Shift+K`; наявні `Ctrl+Shift+P` **не** мігрують (тест)
- [x] Потік грає → K робить **stop** (не pause); повторно → reconnect того ж потоку
- [x] Файл грає → pause; повторно → resume з тієї ж позиції
- [x] Preview → stop, у профіль не пишеться, cold-start ігнорує
- [x] `PlayerSession.last_stream_id` / `last_file_position` реально пишуться **на переходах** і читаються cold-start K
- [x] Додано дискримінатор «останнє активне джерело»; K відновлює найновіше незалежно від типу
- [x] Файл відновлюється з `position_ms` (seek), потік — reconnect
- [x] Недоступний таргет → анонс «недоступно» + no-op + очищення запису
- [x] NVDA озвучує статус+назву для кожного переходу (пауза/відновлено/зупинено/підключення/недоступно)
- [x] Трей-кнопка Play/Pause узгоджена з новою семантикою; debounce спільний
- [x] Autostart не авто-грає в межах цього запису — гра через K; per-profile авто-гра з'являється лише з [resume-last-playback](p1-resume-last-playback.md)
- [x] Оновлені доки; `cargo test` + `cargo clippy` зелені; `pnpm test` + `pnpm vite:build` зелені; ручний gate з NVDA на потоці й файлі

## Рішення (рівень реалізації) — закрито 2026-06-25 (звірено з кодом)

1. **Форма дискримінатора → окреме поле `last_active: Option<LastActive>` (enum `stream | file`).** Не timestamp-на-полі: слотів лише 2, повне впорядкування непотрібне, а timestamp додає 2 поля + залежність від годинника й двозначність при рівних/зсунутих мітках. `last_active` виставляється на кожному play-start і є **єдиним джерелом правди** для cold-start; крок resolve мусить толерувати «висячий» дискримінатор (`last_active = file`, але `last_file_position = None`) → трактувати як «нічого не збережено» + очистити запис.
2. **Seek до `position_ms` → підтримується, вже підключено.** `play_file` свідомо бере `Decoder::try_from(File)`, щоб виставити `byte_len`+`is_seekable` (інакше backward-seek на headerless CBR MP3 з ICY-записів падає `ForwardOnly` → `RandomAccessNotSupported`) — [engine.rs:198-203](../../../src-tauri/src/player/engine.rs#L198-L203). Команда `seek_playback` (`player.try_seek`) уже існує і **fallible** ([engine.rs:386](../../../src-tauri/src/player/engine.rs#L386)). Cold-start файл-гілка: `play_file(path)` → `try_seek(position_ms)`; **на `Err` — лишитись з початку** (не валити resume), залогувати.
3. **Запис позиції на «переходах» → розширено наявний `graceful_shutdown`.** Хук уже є ([app_state.rs:76-82](../../../src-tauri/src/app_state.rs#L76-L82)) і **вже зберігає `player_session.volume`** на виході. Додано поряд знімок session-стану (`last_active`/`last_stream_id`/`last_file_position`). Порядок: зчитати `get_status()` (позицію) **до** `stop_session_public()`, потім писати session-стан і volume **одним** save-блоком.
4. **Легасі-edge (paused-stream зі старого білда) → закрито дизайном dispatch.** Розгалужування за типом джерела, не лише за станом: `Stream` активний (`Playing` АБО `Paused`) → **stop**; `Stream` Stopped/cold → reconnect; `File` Playing → pause, Paused → resume; `Preview` активний → stop.
5. **Doc-фікс `architecture.md`** — усунуто помилкове твердження про Switch Profile як глобальний хоткей; play/pause оновлено на `Ctrl+Shift+K`.

## Документи

- [README.md:126](../../../README.md#L126) · [docs/accessibility.md:919](../../accessibility.md#L919) · [docs/architecture.md](../../architecture.md) (§13 переїхав у `keyboard-shortcuts.md` 2026-09-04) · [docs/data-models.md:52](../../data-models.md#L52) (і :985, §3.7 PlayerSession :621) · [docs/keyboard-shortcuts.md:43](../../keyboard-shortcuts.md#L43)
- Код: [src-tauri/src/shortcuts.rs](../../../src-tauri/src/shortcuts.rs) (`toggle_playback`), [src-tauri/src/settings.rs](../../../src-tauri/src/settings.rs) (`default_hk_toggle_playback` + тести), [src-tauri/src/player/engine.rs](../../../src-tauri/src/player/engine.rs) (`PlaybackSource`, stop/play_live/play_file/seek), [src-tauri/src/profile.rs](../../../src-tauri/src/profile.rs) (`PlayerSession`), [src-tauri/src/app_state.rs](../../../src-tauri/src/app_state.rs), [src-tauri/src/tray/](../../../src-tauri/src/tray/)
- Пам'ять: [[global-hotkey-defaults-decision]], [[nvda-startup-foreground]], [[live-region-inside-modals]]

## Джерела (обґрунтування дизайну)

- Stop vs pause для live-потоку: [AzuraCast — swap Pause for Stop](https://features.azuracast.com/suggestions/169814/swap-the-pause-button-for-stop-button-on-stream-players) · [Can you pause live radio? (Quora)](https://www.quora.com/Can-you-pause-live-radio) · [AudioPlayer: STOP vs PAUSE (Amazon)](https://forums.developer.amazon.com/questions/36811/audioplayer-stop-vs-pause.html)
- Конфлікт `Ctrl+Shift+P`: [Firefox — reserved for Private window](https://github.com/chinchang/web-maker/issues/385) · [VS Code keybindings — Ctrl+Shift+P = Command Palette](https://code.visualstudio.com/docs/getstarted/keybindings)
- Доступність медіаконтролів: [Deque University — keyboard/screen-reader media controls](https://dequeuniversity.com/tips/media-player-controls)
