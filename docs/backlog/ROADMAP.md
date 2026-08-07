# ROADMAP беклогу

Навігаційна карта записів [`docs/backlog/`](README.md), згрупована за `target`
(semver-версією з front-matter). **Front-matter кожного запису — першоджерело**;
цей файл підтримується вручну й може дрейфувати — за розбіжності вір файлу запису.

> Це не той самий roadmap, що [`docs/implementation-phases.md`](../implementation-phases.md)
> (офіційний фазовий roadmap застосунку). Цей файл впорядковує **беклог** —
> те, що ще не стало фазою — за версією, яку розробник планує його зробити.

Посилання — за **slug**, стабільні (не нумерація `#N`). Секції йдуть за зростанням
semver; `unscheduled` — наприкінці.

---

## v0.1.0

| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує |
|------|---|-----|------|---------|---------------|-------------|
| [profile-commit-seam](p0-profile-commit-seam.md) | P0 | planned | ready | L | — | — (розблоковує той самий шов для `GlobalSettings`) |
| [streams-transfer-hotkeys](p2-streams-transfer-hotkeys.md) | P2 | planned | ready | M | — (webview-reload-guard виконано) | [list-key-modifier-guards](p3-list-key-modifier-guards.md) |
| [hotkeys-expansion](p2-hotkeys-expansion.md) | P2 | planned | ready | M | — | — |
| [import-duplicate-metadata-update](p3-import-duplicate-metadata-update.md) | P3 | planned | ready | M | — | — |
| [help-content-polish](p1-help-content-polish.md) | P1 | planned | ready | M | — | — |

## v0.2.0

| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує |
|------|---|-----|------|---------|---------------|-------------|
| [command-palette-phase-3](p2-command-palette-phase-3.md) | P2 | planned | ready | S | — | [command-palette-phase-4](p3-command-palette-phase-4.md), [command-palette-mode-prefixes](p3-command-palette-mode-prefixes.md) |
| [command-palette-phase-4](p3-command-palette-phase-4.md) | P3 | planned | **blocked** | S | [command-palette-phase-3](p2-command-palette-phase-3.md) | — |

## unscheduled

<!-- Відсортовано за пріоритетом і корисністю (P1 → P2 → P3). -->
<!-- P значення відповідають front-matter записів (першоджерело). -->

| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує |
|------|---|-----|------|---------|---------------|-------------|
| [focus-active-item-on-playback-start](p1-focus-active-item-on-playback-start.md) | P1 | idea | draft | S | — | — |
| [wishlist-conditions](p1-wishlist-conditions.md) | P1 | idea | draft | L | — | — |
| [browser-filter-cursor-reset](p2-browser-filter-cursor-reset.md) | P2 | planned | ready | S | — | — |
| [webview-zoom-hotkeys](p2-webview-zoom-hotkeys.md) | P2 | planned | ready | S | — | — (відгалуження webview-reload-guard: зуму в застосунку зараз немає) |
| [sleep-timer](p2-sleep-timer.md) | P2 | idea | draft | S | — | — |
| [pause-recording](p2-pause-recording.md) | P2 | idea | draft | M | — | — |
| [focus-on-screen-open-option](p2-focus-on-screen-open-option.md) | P2 | idea | draft | S | — | — |
| [command-palette-fuzzy-search](p2-command-palette-fuzzy-search.md) | P2 | idea | draft | S | — | — |
| [command-palette-taxonomy](p2-command-palette-taxonomy.md) | P2 | idea | draft | M | — | — (спірна — див. «Відкриті питання»; розчеплено з phase-3) |
| [post-processing](p2-post-processing.md) | P2 | idea | draft | M | — | — |
| [command-palette-dual-language-search](p2-command-palette-dual-language-search.md) | P2 | idea | draft | S | — | — |
| [wishlist-separate-folder](p2-wishlist-separate-folder.md) | P2 | idea | draft | S | — | — |
| [stream-manual-reorder](p2-stream-manual-reorder.md) | P2 | idea | draft | M | — | — |
| [track-log-only-mode](p2-track-log-only-mode.md) | P2 | idea | draft | M | — | — |
| [quick-controls-overlay](p2-quick-controls-overlay.md) | P2 | idea | draft | L | — | — |
| [per-stream-ignorelist-ui](p2-per-stream-ignorelist-ui.md) | P2 | planned | draft | M | — | — (логіка вже жива, бракує редактора; винесено з [full-edit-stream](done/p1-full-edit-stream.md)) |
| [stream-auth](p2-stream-auth.md) | P2 | research | draft | L | — | — (username/password мертві; DPAPI в docs є, у коді немає; винесено з [full-edit-stream](done/p1-full-edit-stream.md)) |
| [list-key-modifier-guards](p3-list-key-modifier-guards.md) | P3 | planned | draft | S | [streams-transfer-hotkeys](p2-streams-transfer-hotkeys.md) | — (знахідка ревізії streams-transfer-hotkeys: switch по e.key не перевіряє модифікатори) |
| [command-palette-mode-prefixes](p3-command-palette-mode-prefixes.md) | P3 | idea | draft | S | [command-palette-phase-3](p2-command-palette-phase-3.md) | — (спірна — укр. розкладка без `>`/`@`; вирізано з phase-4) |
| [mpv-playback-engine](p3-mpv-playback-engine.md) | P3 | research | draft | L | — | [he-aac-mf-playback](p3-he-aac-mf-playback.md), [hls-stream-support](p3-hls-stream-support.md) (розвилка — може закрити обидва) |
| [he-aac-mf-playback](p3-he-aac-mf-playback.md) | P3 | research | draft | M | — | залежить від рішення mpv-playback-engine |
| [hls-stream-support](p3-hls-stream-support.md) | P3 | idea | draft | L | — | залежить від рішення mpv-playback-engine |
| [lastfm-scrobbling](p3-lastfm-scrobbling.md) | P3 | idea | draft | M | — | — |
| [recording-stats](p3-recording-stats.md) | P3 | idea | draft | S | — | — |
| [context-menu-at-cursor](p3-context-menu-at-cursor.md) | P3 | idea | draft | S | — | — |
| [window-fullscreen-f11](p3-window-fullscreen-f11.md) | P3 | idea | draft | S | — (webview-reload-guard виконано) | — (брати лише за явним запитом — див. «Відкриті питання») |
| [profile-switch-orphaned-tasks](p3-profile-switch-orphaned-tasks.md) | P3 | idea | draft | M | — | **умовний** — брати лише за реальним тригером |
| [screen-reader-direct-speech](p3-screen-reader-direct-speech.md) | P3 | idea | **blocked** | S | — | тригер-gated, не планувати |
| [player-station-image](p3-player-station-image.md) | P3 | idea | draft | S | — | — |

---

## Виконано

| Запис | Коли | Що лишилось у спадок |
|-------|------|----------------------|
| [webview-reload-guard](done/p2-webview-reload-guard.md) | 2026-08-07 | Гард — два capture-слухачі на `window` ([useWebviewGuard.ts](../../src/hooks/useWebviewGuard.ts) над предикатами [webviewAccelerators.ts](../../src/lib/webviewAccelerators.ts)), викликається поруч із `useGlobalShortcuts()`. `F3`/`F5`/`F7`/`F11` матчаться **без розбору модифікаторів** (кожен варіант F5 у WebView2 — reload; перелічувати поіменно означало б лишити дірку на невгаданому `Ctrl+Shift+F5`); `KeyR` — єдиний виняток, де саме модифікатор робить клавішу акселератором (`(ctrl\|\|meta) && !alt`, бо AltGr рапортує ctrl+alt). Лише `preventDefault()`, **ніколи** `stopPropagation()`: гард гасить дефолт, не забирає клавішу — інакше майбутній `F5` = «Копіювати в профіль» ([streams-transfer-hotkeys](p2-streams-transfer-hotkeys.md)) не спрацював би, а KeyRecorder не записав би ці клавіші під OS-хоткей. Дві свідомі відмінності від Tier-2: `e.repeat` **не** відкидається (кожен повтор несе власний дефолт), і немає гейта на `isInModal` (reload з відкритого діалогу так само руйнівний). Контекстне меню — carve-out через наявний `isTextEntryTarget`, підйомом по `parentElement` від цілі події (не `document.activeElement`). Жодних режимних гілок — поведінка однакова в dev/vitest/прод. Devtools у debug відкриває Rust: `open_devtools()` під `cfg(debug_assertions)` **між** `show()` і `set_focus()`, щоб останнім фокус забрало головне вікно (інваріант «webview ініціалізується у OS-foreground»). `SHORTCUTS` не змінено — резервувати погашені клавіші не стали. Гілка `develop` напряму. **NVDA-прогін проведено 2026-08-07, усі 16 сценаріїв пройдено, зауважень немає**; сценарій-замір (Edge) підтвердив F3/F7 інертними (повернуто в пул вільних F-клавіш — [hotkeys-expansion](p2-hotkeys-expansion.md)), F11 зайнятим (fullscreen) |
| [full-edit-stream](done/p1-full-edit-stream.md) | 2026-08-07 | `update_stream(stream_id, name, url?, icy_name?, bitrate?, format?)` — форма аргументів дзеркалить `add_stream`, і саме `url` є перемикачем: `None` — чисте перейменування з недоторканими похідними полями, `Some` — `resolve_playlist_url` і перезапис `format`/`bitrate`/`icy_name` переданим **включно з `None`** (вони описують адресу, а не рядок: після переїзду старе «AAC 64k» — брехня, яку NVDA прочитав би як факт; перше ж підключення їх перезаповнить). Окрему `update_stream_url` відхилено — ім'я й адреса в одному сабміті інакше стали б двома IPC і двома `save()` з частковим збоєм між ними. Уся логіка — в чистій `build_edited_stream` над `&[StreamInfo]` за зразком `build_added_stream`. Потік, чиє ім'я дорівнює **старому** URL, лишається безіменним (icy_name з probe через `naming::disambiguate`, інакше новий URL) — інакше рівність `name == url`, за якою `icy_rename` впізнає неназваний потік, зламалась би назавжди. Порожня назва трактується так само (зберегти `""` означало б рядок, який NVDA читає як ніщо, і теку `%s` без імені); шлях чистого перейменування не чіпали — там і далі `name.trim()`. UI: поле URL першим в **обох** режимах, але `autoFocus` в edit-режимі лишився на імені (F2 — м'язова пам'ять «перейменувати»). Змінена адреса проходить probe + `checkStreamConflicts({url, name, excludeId})`, незмінена — жодної нової перевірки. Обидва попередження озвучуються **разом**: перевірка після сабміту стає недійсною, тож притримане попередження — це попередження, яке не почують. Під час запису поле — `readOnly` + `aria-disabled` з поясненням через `aria-describedby`, а **не** нативний `disabled`: той випадає з обходу по Tab, і NVDA не дійшов би ні до поля, ні до пояснення (домашній патерн `SelectionToolbar`/`ActivityBar`); критерій «поле URL disabled» читати як «недоступне для правки». Побічно: предикат «потік записується» винесено в `src/lib/streamState.ts::isRecordingLike` — чотири копії каскаду станів (`StreamsPanel`, `StreamItem`, `StreamContextMenu` + новий виклик) стали однією функцією; Rust-дзеркало — `move_blocked_by_state`. Auth і per-stream ignorelist свідомо винесено ([stream-auth](p2-stream-auth.md), [per-stream-ignorelist-ui](p2-per-stream-ignorelist-ui.md)). Гілка `feature/full-edit-stream`, TDD. **NVDA-прогін проведено 2026-08-07, усі 9 сценаріїв пройдено, зауважень немає** |
| [settings-sidebar-tabs](done/p2-settings-sidebar-tabs.md) | 2026-08-07 | `SettingsDialog` перейшов на `orientation="vertical"` за зразком `HelpDialog` — обидва діалоги тепер звучать однаково, і це був головний аргумент, сильніший за напрямок стрілок. Вертикальний режим RAC поблажливіший: `TabsKeyboardDelegate.getKeyLeftOf/getKeyRightOf` не мають orientation-guard, тож живі **всі чотири** стрілки, тоді як у horizontal ↑/↓ мертві (`getKeyAbove/Below` повертають `null`) — перевірено і в сорсах `@react-aria/tabs@3.11.1`, і негативним контролем: зі знятим `orientation` усі три нові тести падають, `{ArrowDown}` не рухає вибір узагалі. Це страховка проти того, що NVDA не озвучує `aria-orientation` (JAWS озвучує) — клавіші не змінюються, а додаються. Понад початковий обсяг: `TabList` дістав власну мітку `settings_sections_label` («Розділи налаштувань») замість повторного `settings_title` — у бічній панелі таблист став окремою зоною, і мітка, тотожна заголовку діалогу, змушувала NVDA двічі поспіль вимовити «Налаштування» (симетрично до `help_sections_label`). З'явився перший `SettingsDialog.test.tsx` — доти діалог покривали лише тести чотирьох вкладок, тобто гейт `pnpm test` про сам діалог не знав нічого. Сесія `/grill-with-docs`; свідомо без ADR і без `CONTEXT.md` (зміна відкочується одним revert, запис беклогу — достатня домівка), мертві ключі `settings_tab_reconnection`/`settings_tab_audio` не чіпали. Гілка `feature/settings-dialog`. **NVDA-прогін проведено 2026-08-07, усі 5 сценаріїв пройдено, зауважень немає** |
| [open-stream-with-default-app](done/p1-open-stream-with-default-app.md) | 2026-08-07 | шел не отримує сирий URL потоку — той резолвиться в `http(s)://…/live` ще на додаванні, і єдина асоціація для нього браузер; замість цього пишеться одноелементний `data/tmp/<назва>.m3u8` (`stream_playlist_path`, `to_m3u8`) і відкривається файл. `data/tmp/` створюється й чиститься в `ensure_data_dirs()` при старті (`portable::tmp_dir`/`clear_dir_contents`), а не після відкриття — видалення відразу гонилося б з холодним стартом плеєра. `shell_open`/`map_shell_error` винесено зі `songs_commands.rs` у спільний `commands/shell_open.rs` з новим кодом `write_failed`; фронтенд отримав окрему `streamOpenErrorMessage` (не переоформлення `shellOpenErrorMessage` — набори кодів різні). UI: пункт «Відкрити у медіаплеєрі» в `StreamContextMenu` (після record, перед edit) і `Alt+Enter` у `StreamList.onAction`, обидва на сфокусованому рядку, ігнорують виділення; успіх мовчазний, помилка — тост. `aria-keyshortcuts` на рядку свідомо не додано (рішення `b06a9c1`). Гілка `feature/open-stream-with-default-app`, TDD. **NVDA-прогін проведено 2026-08-07, усі 8 сценаріїв пройдено, зауважень немає**; код `no_assoc` вручну не перевірявся (немає машини без медіаплеєра) |
| [open-song-with-default-app](done/p1-open-song-with-default-app.md) | 2026-08-06 | команда `open_song_in_app` (`songs_commands.rs`) віддає файл шелу через `ShellExecuteW` з дієсловом `open` на blocking-потоці з парними `CoInitializeEx`/`CoUninitialize` (STA — вимога MSDN, потоки tokio апартаменту не мають); нова фіча `Win32_System_Com` у `Cargo.toml`. Код повернення (`HINSTANCE` ≤ 32) мапиться чистою `map_shell_error` у стабільні `not_found`/`no_assoc`/`generic`, які `src/lib/shellOpenError.ts` перетворює на локалізований toast — контракт свідомо винесено з Songs, бо той самий знадобиться [open-stream-with-default-app](p1-open-stream-with-default-app.md). UI: пункт «Відкрити у програмі» між `play` і `explorer`, діє на рядок під фокусом і **ігнорує виділення** (модель Провідника відкрила б N вікон з одного натискання). Клавіатура: `Alt+Enter` = зовнішня програма, `Ctrl+Enter` = Провідник (раніше шорткату не було зовсім), обидві — на фокусованому рядку, на відміну від `Delete`. Модифікатори діють лише на `Enter`, тож `Alt+Space` лишився чистим play. Побічно: `ActionModifiers` нарешті має поле `alt` (+ `CompositeRow.onActivate` прокидає `altKey`) — це закриває однойменний пункт у запису для потоків; `Alt+Enter` зареєстровано `reserved` у `shortcuts.ts`, інакше його можна було б перекрити глобальним хоткеєм. Гілка `feature/open-song-with-default-app`, TDD. **NVDA-прогін проведено 2026-08-06, усі 8 сценаріїв пройдено, зауважень немає** |
| [log-rotation](done/p1-log-rotation.md) | 2026-08-06 | стратегія ротації зафіксована як `RotationStrategy::KeepSome(1)` прямо в конфігурації плагіна (`lib.rs`) — актив + один датований архів, разом ≤ ~2× `max_file_size`; поле `log_rotation`/`logRotation` прибрано наскрізь (схема + `Default` у `settings.rs`, TS-тип у `tauri.ts`, 6 тест-фікстур, 5 місць у `data-models.md`) разом із функцією `rotation_strategy_for` і чекбоксом «Зберігати всю історію логів» (ключ `settings_log_keep_history`). Обидва положення прибраного перемикача були хибні: `KeepOne` **видаляв** попередній лог замість архівування (на `debug` — за хвилини), `KeepAll` повертав необмежений ріст, а сам чекбокс читався інвертовано щодо поля в `settings.json`. Міграції немає — serde ігнорує застарілий ключ, той випадає при наступному `save()`. Єдиний важіль у UI — макс. розмір (10 МБ, 1–100). Гілка `chore/log-rotation-keepsome`. **NVDA-прогін проведено 2026-08-06, усі 6 сценаріїв пройдено, зауважень немає** |
| [wishlist-stale-list-ref](done/p1-wishlist-stale-list-ref.md) | 2026-08-06 | `patternListCallbackRef` у `WishlistPanel.tsx` повертає cleanup (React 19) із guard `patternListRef.current === zone` — обидва `TabPanel` ділять один ref, а RAC тримає деселектнуту панель ще один коміт (`useExitAnimation`), тож порядок attach(нова)→detach(стара) затирав посилання на живий список: тулбарна «Видалити вибрані» мовчки no-op, а проксі-зона `wishlist-list` відхиляла фокус і F6 пропускав список. Два регресійні тести (тулбарний шлях + F6 через `ZoneHarness`) — наявний ignorelist-bulk свідомо ходить рядковим ✕ і цього не ловив. Гілка `fix/wishlist-stale-list-ref`, TDD. **NVDA-прогін проведено 2026-08-06, усі 7 сценаріїв пройдено, зауважень немає** |
| [stream-name-disambiguation](done/p0-stream-name-disambiguation.md) | 2026-08-06 | чистий модуль `src-tauri/src/naming.rs` — єдине місце, де вирішується ім'я потоку (`collision_key` = санітизоване ім'я без регістру, суфікс `(AAC 64k)`/`(AAC)`/`(2)`, присвоюється **один раз** при додаванні); викликається з `build_added_stream`, `plan_appended` (браузер), `plan_import`, `recording_task` (ICY). IPC `check_stream_conflicts` дає діалогу попередження про дубль URL і про колізію імені; `ProbeVerdict` тепер несе `icyName`/`bitrate`/`format` і вони зберігаються в потік — потік, доданий без імені, одразу дістає `icy_name` замість URL. `%s` більше ніколи не бере сире ICY-ім'я. Гілка `feature/stream-name-disambiguation`, TDD. **NVDA-прогін проведено 2026-08-06, усі 12 сценаріїв пройдено**; він виявив втрату фокуса після попередження (форма на час probe стає `disabled` → фокус падає на `<body>`) — виправлено в `90dc66e` явним фокусом на кнопку підтвердження |
| [command-palette-results-a11y](done/p1-command-palette-results-a11y.md) | 2026-07-23 | `palette_no_results` замість хардкоду; оголошення кількості результатів (у т.ч. «0») через глобальний `LiveAnnouncer`/`useAnnounce` (polite, дебаунс 300 мс) — без окремого регіону в модалці й без змін моделі пунктів. Гілка `feature/command-palette-results-a11y`, TDD. **NVDA-прогін оголошення не проведено** — рекомендовано перед релізом |
| [resume-last-playback](done/p1-resume-last-playback.md) | 2026-07-23 | `PlayerSession.autoplay_on_startup` (per-profile opt-in) + `AutoplayGuard` one-shot + `set_profile_autoplay` IPC + `ProfileSettingsDialog`; злито fast-forward у develop (`26b7f1e`), локально, не запушено. **NVDA-прогін нового діалогу та авто-старту не проведено** — рекомендовано перед релізом |
| [stream-name-trim](done/p0-stream-name-trim.md) | 2026-07-22 | `.trim()` у `add_stream` і `update_stream` (`stream_commands.rs`) — назва потоку більше не зберігається з провідними/завершальними пробілами |
| [streams-empty-focus-audit](done/p2-streams-empty-focus-audit.md) | 2026-07-20 | гіпотеза підтверджена + третій мертвий шлях (одиничне move-to-profile); імперативний `onEmpty()` у `handleConfirmDelete`/`doTransfer` (`StreamList.tsx`) за зразком `223fadb`; 3 регресійні тести «SINGLE-op empty transitions» у `StreamsPanel.test.tsx` |
| [wishlist-example-patterns](done/p2-wishlist-example-patterns.md) | 2026-07-19 | CTA «Додати приклад» у власній зоні `wishlist-empty` (`WishlistPanel.tsx`) — не в `PatternList`'s `emptyExtra` (той варіант виявився keyboard-unreachable, rev R1); фіксований масив `examplePatterns.ts`; ключі `wishlist_add_example`/`wishlist_examples_adding`/`wishlist_examples_added`/`wishlist_examples_failed`. Застосувало патерн `streams-ctrlk-empty-hint` |
| [streams-ctrlk-empty-hint](done/p2-streams-ctrlk-empty-hint.md) | 2026-07-19 | бейдж «Команди — Ctrl+K» у порожньому стані `StreamsPanel` (не Tab-стоп); константа `PALETTE_COMBO` читає комбінацію з `SHORTCUTS`, тож бейдж не розходиться з F1-довідкою; ключ `streams_empty_palette_hint`. Завершує ADR 2026-05-31 §6 (S3) — патерн для `wishlist-example-patterns` |
| [browser-add-probe](done/p2-browser-add-probe.md) | 2026-07-19 | подія `browser-station-probe-result` + `useBrowserProbeFeedback` (App-wide, озвучує лише невдачі/підсумок); `spawn_probe_added()` у `browser_commands.rs` — detached probe після збереження, `buffer_unordered(5)` |
| [add-stream-probe](done/p2-add-stream-probe.md) | 2026-07-19 | IPC `probe_stream(url) -> { ok, error }` + `probe_once()` у `stream_io_commands.rs` (спільний 5-с `SINGLE_PROBE_TIMEOUT`); sync-spinner + «Все одно додати» в `AddStreamDialog` |
| [volume-nan-validation](done/p2-volume-nan-validation.md) | 2026-07-19 | хелпер `sanitize_volume()` у `player/engine.rs` — єдина точка санітизації гучності на межах IPC (`set_volume`) і профілю (`PlayerEngine::new`); non-finite → `0.0` |
| [activity-bar-help-button](done/p1-activity-bar-help-button.md) | 2026-07-19 | кнопка Help у footer `ActivityBar.tsx` (над Settings, спільний атом `$helpOpen` з `F1`); roving-order бару тепер 8 елементів |
| [crash-recovery](done/p1-crash-recovery.md) | 2026-07-18 | `data/state.json` (`cleanShutdown` + `activeRecordings[{streamId, url?}]`), снапшот-писар (`Notify` + 30с interval + 500мс debounce, `crash_recovery.rs`), auto-resume в setup-хуку, deferred подія `crash-resume`, `useCrashResumeFeedback` (NVDA polite + toast) — `Profile.active_recording_urls` прибрано |
| [resume-file-from-setting](done/p2-resume-file-from-setting.md) | 2026-07-18 | `resume_file_from` у `GlobalSettings`, `plan_file_resume`/`emit_resuming` у `playback_control.rs`, NVDA-анонс позиції — нульового виносу немає, чисто адитивно |
| [playback-toggle-stop-pause](done/p1-playback-toggle-stop-pause.md) | 2026-07-18 | `PlayerSession.last_active` + оживлені `last_stream_id`/`last_file_position`, `playback_control.rs`, cold-start resume — база для `resume-last-playback` (вище) |
| [autostart](done/p2-autostart.md) | 2026-06-25 | winreg-автостарт (`autostart.rs`), CLI `--minimize`; сам **не** грає — авто-гра лише через `autoplay_on_startup` (`resume-last-playback`) |

---

## Перехресні рішення

1. ✅ **resume-last-playback vs playback-toggle-stop-pause** — _вирішено 2026-06-25 (A1), базу
   реалізовано 2026-07-18; політику фіналізовано 2026-07-19; **код реалізовано й злито
   2026-07-23** (`26b7f1e`, NVDA-прогін ще не проведено)._ `resume-last-playback` — надбудова над
   `PlayerSession`; **окремого `last_playback.json` немає.** Політика —
   `autoplay_on_startup: bool` (без `always_paused` — дублює cold-start `Ctrl+Shift+K`;
   без `restore`) — нове поле **в `PlayerSession`** → per-profile. Авто-гра — явний opt-in.
2. ✅ **state.json (crash-recovery, done) vs стан відтворення (resume-last-playback)** — _знято (A1)._ Стан
   відтворення живе в `PlayerSession` (профіль), crash — у `data/state.json`; два чітко
   різні сховища, звіряти нема чого.
3. ✅ **autostart ↔ відтворення** — _вирішено (A3 через A1), обидві сторони реалізовано й злито._
   Autostart сам **не** грає; авто-гра ⇔ активний профіль має `autoplay_on_startup = true`
   (поле вводить [resume-last-playback](done/p1-resume-last-playback.md)).
4. **mpv-playback-engine ↔ he-aac-mf-playback / hls-stream-support.** Якщо mpv проходить PoC — винести
   обидва записи в `done/` як зняті. _(A4 — відкрите.)_
