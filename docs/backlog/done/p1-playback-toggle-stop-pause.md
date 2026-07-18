# Контекстний playback-toggle: stop для потоку, pause для файлу + resume останнього

- **Слаг:** `playback-toggle-stop-pause`
- **Тип:** покращення
- **Пріоритет:** P1
- **Стан:** done (реалізовано й перевірено з NVDA; злито в `develop` 2026-07-18, merge `4189826`)
- **Зусилля:** M (ребінд дефолту + розгалуження dispatch + оживлення dormant-полів `PlayerSession` + дискримінатор + NVDA-анонс + доки/тести)
- **Оновлено:** 2026-07-18
- **Залежності:** `shortcuts.rs` (global-hotkey dispatch), `player::engine` (`PlayerStatus.source`, `pause/resume/stop/play_live/play_file`, seek), `profile.rs` (`PlayerSession`), `settings.rs` (`default_hk_toggle_playback`), LiveAnnouncer (NVDA), [[global-hotkey-defaults-decision]], [[nvda-startup-foreground]]

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
| 2 | Поза активним відтворенням | **Симетричний toggle.** Файл: `Playing→pause`, `Paused→resume`. Потік: `Playing→stop`, `Stopped→reconnect`. Нічого → resume останнього (П3) або no-op. |
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
- **Дискримінатор:** додати у `PlayerSession` маркер останнього активного — рекоменд. окреме поле `last_active: Option<"stream"|"file">`, що виставляється на кожному play-start (альтернатива — timestamp на кожному полі).
- **Координація з #10:** [resume-last-playback](../p2-resume-last-playback.md) (A1) додає в **ту саму** `PlayerSession` per-profile поле `startup_playback_mode` (`never`/`always_paused`/`always_play`). #10 — надбудова над цими полями (єдине джерело правди); цей запис закладає поля й резюм-функцію, #10 викликає її на старті. Жодного окремого `last_playback.json`.
- **Запис позиції** — лише на переходах (pause/stop/track-change/quit); не на кожен progress-tick (запис у профіль-JSON важчий за крихітний state-файл; уникнути рейсів з іншими записами профілю).
- **Дефолт клавіші:** `default_hk_toggle_playback()` [settings.rs:138](../../../src-tauri/src/settings.rs#L138) → `"Ctrl+Shift+K"` + супутні тести [settings.rs:291](../../../src-tauri/src/settings.rs#L291).
- **NVDA-анонс:** Rust емітить статус+назву, webview озвучує через LiveAnnouncer; на cold-start вікно вже OS-foreground ([[nvda-startup-foreground]]). Лейбл дії у Settings/F1 (`settings_hotkey_toggle_playback` = «Відтворення (toggle)») лишається **загальним**.
- **Debounce:** зберегти `LAST_TOGGLE_PLAYBACK_MS` і спільну cell з трей-кнопкою ([keyboard-shortcuts.md:107](../../keyboard-shortcuts.md#L107)).

## Критерії готовності

- [ ] Дефолт `togglePlayback` = `Ctrl+Shift+K`; наявні `Ctrl+Shift+P` **не** мігрують (тест)
- [ ] Потік грає → K робить **stop** (не pause); повторно → reconnect того ж потоку
- [ ] Файл грає → pause; повторно → resume з тієї ж позиції
- [ ] Preview → stop, у профіль не пишеться, cold-start ігнорує
- [ ] `PlayerSession.last_stream_id` / `last_file_position` реально пишуться **на переходах** і читаються cold-start K
- [ ] Додано дискримінатор «останнє активне джерело»; K відновлює найновіше незалежно від типу
- [ ] Файл відновлюється з `position_ms` (seek), потік — reconnect
- [ ] Недоступний таргет → анонс «недоступно» + no-op + очищення запису
- [ ] NVDA озвучує статус+назву для кожного переходу (пауза/відновлено/зупинено/підключення/недоступно)
- [ ] Трей-кнопка Play/Pause узгоджена з новою семантикою; debounce спільний
- [ ] Autostart (якщо вже є, [2026-06-21-autostart.md](../../superpowers/plans/2026-06-21-autostart.md)) **не** авто-грає в межах #1 — гра через K. _(Per-profile авто-гра з'являється лише з #10 [resume-last-playback](../p2-resume-last-playback.md): режим `always_play` активного профілю; A3.)_
- [ ] Оновлені доки (нижче); `cargo test` + `cargo clippy` зелені; `pnpm test` + `pnpm vite:build` зелені; ручний gate з NVDA на потоці й файлі

## Рішення (рівень реалізації) — закрито 2026-06-25 (звірено з кодом)

1. **Форма дискримінатора → окреме поле `last_active: Option<LastActive>` (enum `stream | file`).** Не timestamp-на-полі: слотів лише 2, повне впорядкування непотрібне, а timestamp додає 2 поля + залежність від годинника й двозначність при рівних/зсунутих мітках. `last_active` виставляється на кожному play-start і є **єдиним джерелом правди** для cold-start; крок resolve мусить толерувати «висячий» дискримінатор (`last_active = file`, але `last_file_position = None`) → трактувати як «нічого не збережено» + очистити запис. _(Жорсткіша альтернатива — згорнути обидва Option-поля в один `last_playback: Option<enum { Stream { id }, File { path, pos } }>`, що робить інваріант «дискримінатор без даних» неможливим; відхилено заради сумісності з уже узгодженою моделлю #10, яка оперує окремими полями `PlayerSession`.)_
2. **Seek до `position_ms` → підтримується, вже підключено.** `play_file` свідомо бере `Decoder::try_from(File)`, щоб виставити `byte_len`+`is_seekable` (інакше backward-seek на headerless CBR MP3 з ICY-записів падає `ForwardOnly` → `RandomAccessNotSupported`) — [engine.rs:198-203](../../../src-tauri/src/player/engine.rs#L198-L203). Команда `seek_playback` (`player.try_seek`) уже існує і **fallible** ([engine.rs:386](../../../src-tauri/src/player/engine.rs#L386)). Cold-start файл-гілка: `play_file(path)` → `try_seek(position_ms)`; **на `Err` — лишитись з початку** (не валити resume), залогувати. Окремий `play_file_at` непотрібен — реюз `seek_playback`-шляху.
3. **Запис позиції на «переходах» → НЕ новий хук; розширити наявний `graceful_shutdown`.** Хук уже є ([app_state.rs:76-82](../../../src-tauri/src/app_state.rs#L76-L82), кличеться з `on_window_event`/CloseRequested [lib.rs:236](../../../src-tauri/src/lib.rs#L236) і трей-Quit) і **вже зберігає `player_session.volume`** на виході. Додати поряд знімок session-стану (`last_active`/`last_stream_id`/`last_file_position`). **Порядок критичний:** зчитати `get_status()` (позицію) **до** `stop_session_public()` (стоп тіардаунить сесію), потім писати session-стан і volume **одним** save-блоком (уникнути 3-го save і рейсів). Решта переходів (pause/stop/track-change) пишуть зі своїх команд плеєра. Per-tick запис — ні. Хард-кіл/краш покриває окремий механізм #3 (crash-recovery); resume-позиція — best-effort.
4. **Легасі-edge (paused-stream зі старого білда) → закрито дизайном dispatch.** Розгалужувати в першу чергу **за типом джерела**, не лише за станом: `Stream` активний (`Playing` АБО `Paused`) → **stop**; `Stream` Stopped/cold → reconnect; `File` Playing → pause, Paused → resume; `Preview` активний → stop. Так `Paused + Stream` (можливий лише як спадок старого білда — новий його не створює; до того ж in-memory сесія не переживає рестарт) коректно резолвиться у **stop** (resume живого потоку безглуздий — програв би застряглий буфер і відстав від ефіру). Без міграції даних: старий білд `last_*` не писав → None → cold-start no-op до першого нового відтворення. Покрити явним match-армом + тест.
5. **Doc-фікс `architecture.md` → :1178 «Switch Profile» помилкова (прибрати); :1193 «Play/pause» → `Ctrl+Shift+K`.** Звірено: Switch Profile — **не** глобальний хоткей, а MenuTrigger-кнопка в панелі профілів ([ProfilesPanel.tsx:114](../../../src/components/profile/ProfilesPanel.tsx#L114) → `tauri.switchProfile`); жодного `Ctrl+Shift+P → Switch Profile` у коді немає. Авторитет — список configurable-хоткеїв ([keyboard-shortcuts.md:43](../../keyboard-shortcuts.md#L43), [README.md:126](../../../README.md#L126)) і власна секція architecture.md:1191-1198. Рядок :1193 змінюється на `Ctrl+Shift+K` **разом із кодовим ребіндом** (щоб доки не випереджали код).

## Документи (оновити при реалізації)

- [README.md:126](../../../README.md#L126) · [docs/accessibility.md:919](../../accessibility.md#L919) · [docs/architecture.md:1193](../../architecture.md#L1193) · [docs/data-models.md:52](../../data-models.md#L52) (і :985, §3.7 PlayerSession :621) · [docs/keyboard-shortcuts.md:43](../../keyboard-shortcuts.md#L43)
- Код: [src-tauri/src/shortcuts.rs](../../../src-tauri/src/shortcuts.rs) (`toggle_playback`), [src-tauri/src/settings.rs](../../../src-tauri/src/settings.rs) (`default_hk_toggle_playback` + тести), [src-tauri/src/player/engine.rs](../../../src-tauri/src/player/engine.rs) (`PlaybackSource`, stop/play_live/play_file/seek), [src-tauri/src/profile.rs](../../../src-tauri/src/profile.rs) (`PlayerSession`), [src-tauri/src/app_state.rs](../../../src-tauri/src/app_state.rs), [src-tauri/src/tray/](../../../src-tauri/src/tray/)
- Пам'ять: [[global-hotkey-defaults-decision]], [[nvda-startup-foreground]], [[live-region-inside-modals]]

## Джерела (обґрунтування дизайну)

- Stop vs pause для live-потоку: [AzuraCast — swap Pause for Stop](https://features.azuracast.com/suggestions/169814/swap-the-pause-button-for-stop-button-on-stream-players) · [Can you pause live radio? (Quora)](https://www.quora.com/Can-you-pause-live-radio) · [AudioPlayer: STOP vs PAUSE (Amazon)](https://forums.developer.amazon.com/questions/36811/audioplayer-stop-vs-pause.html)
- Конфлікт `Ctrl+Shift+P`: [Firefox — reserved for Private window](https://github.com/chinchang/web-maker/issues/385) · [VS Code keybindings — Ctrl+Shift+P = Command Palette](https://code.visualstudio.com/docs/getstarted/keybindings)
- Доступність медіаконтролів: [Deque University — keyboard/screen-reader media controls](https://dequeuniversity.com/tips/media-player-controls)

## Промпт для агента

```text
Реалізація узгодженого дизайну (всі питання закриті — див. «Рішення»). Спершу звірся з контекстом, не починай правок наосліп.

Що зробити:
1) Дефолт togglePlayback: Ctrl+Shift+P → Ctrl+Shift+K (settings.rs default_hk_toggle_playback + тести). НЕ мігрувати наявні збережені значення.
2) Арм "toggle_playback" у shortcuts.rs: розгалузити за PlayerStatus.source. Playing+File→pause(+записати position); Playing+Stream→stop(+записати last_stream_id); Playing+Preview→stop (НЕ персистити); Paused+File→resume з position.
3) Оживити dormant-поля profile.rs PlayerSession (last_stream_id, last_file_position) — досі ніде не пишуться/читаються, тоді як volume з тієї ж структури вже працює. Додати дискримінатор "останнє активне джерело" (рекоменд. поле last_active: stream|file). Писати на переходах (pause/stop/track-change/quit), НЕ на кожен progress-tick.
4) Stopped/cold-гілка K: прочитати active_profile.player_session, за дискримінатором запустити play_live(last_stream_id) або play_file(path)+seek(position_ms). Найновіше джерело незалежно від типу. Недоступний таргет → анонс "недоступно" + no-op + очистити запис. Нічого збереженого → no-op.
5) NVDA: статус+назву через LiveAnnouncer (Пауза/Відновлено/Зупинено/Підключення/недоступно). Перевір [[live-region-inside-modals]] якщо анонс може статись при відкритому діалозі. Cold-start вікно вже OS-foreground — [[nvda-startup-foreground]].
6) Узгодити трей Play/Pause (handlers.rs/menu.rs), спільний debounce. Autostart (якщо є) НЕ авто-грає — гра лише через K.
7) Оновити доки: README, accessibility.md, architecture.md (виправити подвійну згадку Ctrl+Shift+P), data-models.md (вкл. §3.7), keyboard-shortcuts.md.

Звірся з контекстом: shortcuts.rs (toggle_playback, debounce), player/engine.rs (PlayerStatus.source, наявність stop_playback/play_live/play_file, чи є seek до позиції), profile.rs (PlayerSession), app_state.rs, settings.rs (дефолти+тести), tray/. Питання став по одному з рекомендованим варіантом.

Гейти: cargo test + cargo clippy; pnpm test + pnpm vite:build (tsc має ~51 преекзистинг-помилку від paraglide — не блокер, [[typecheck-paraglide-gotchas]]); ручний прогін з NVDA на реальному потоці і на файлі, вкл. cold-start resume.
```
