# ROADMAP беклогу

> Згенеровано з front-matter записів командою `pnpm backlog index`. **Не редагувати руками:**
> правки йдуть у front-matter записів і в [THEMES.md](THEMES.md); сторож —
> `build/backlogIndex.test.ts` у `pnpm test`.

Черга записів [`docs/backlog/`](README.md), згрупована за `target` (semver-версією з
front-matter). Це не той самий roadmap, що [`docs/implementation-phases.md`](../implementation-phases.md)
(офіційний фазовий roadmap застосунку): тут упорядковано **беклог** — те, що ще не стало
фазою — за версією, у яку розробник планує його зробити.

Посилання — за **slug**. Секції йдуть за зростанням semver; `unscheduled` — наприкінці.
Порядок рядків у секціях — за пріоритетом, а в межах пріоритету **більші першими**:
саме вони визначають, чи версія закриється. Колонка «Суть» — поле `summary:` запису
(без нього — `title:`).
♿ — запис зачіпає доступність (`a11y: true`), приймання потребує NVDA-прогону.
Виконані записи (99) — у [done/README.md](done/README.md), спадок кожного — у секції
«Спадок» його файлу.

---

## v0.1.0

> **Тема — чесний інтерфейс.** Усе вже побудоване доводиться до стану, у якому воно
> не бреше й не мовчить: мертві налаштування прибрані, мовчазні відмови дістають видиму
> поверхню, хибні мітки виправлені, обидві локалі повні. Нових можливостей версія не додає.
> Чи вважати віху завершеною і тегувати збірку, вирішує розробник після цієї черги;
> завантажуваний exe для тегу — [release-workflow](p3-release-workflow.md), поки `draft`.

У черзі: 2. Виконано: 84.

| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує | Суть |
|------|---|-----|------|---------|---------------|-------------|------|
| [data-models-doc-drift](p2-data-models-doc-drift.md) | P2 | planned | ready | L | [architecture-doc-drift](done/p2-architecture-doc-drift.md) ✅ | — | третій документ у ряду `tech-stack.md` → `architecture.md` → `data-models.md`; метод звірки вже записаний, виводити наново не треба |
| [release-workflow](p3-release-workflow.md) | P3 | idea | draft | M | [ci-pipeline](done/p2-ci-pipeline.md) ✅ | — | exe у GitHub Release на тег `v*`; у воротах не збирається — release-профіль це другий повний прохід по графу залежностей; відкриті підпис і SmartScreen |

---

## v0.2.0

> **Тема — фічі з готовим дизайном.** Записи, де рішення вже ухвалені (`type: planned`)
> і лишилася реалізація, включно з останньою незакритою фазою застосунку —
> **3H Post-processing**.

У черзі: 11. Виконано: 12.

| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує | Суть |
|------|---|-----|------|---------|---------------|-------------|------|
| [post-processing](p1-post-processing.md) ♿ | P1 | planned | ready | L | [profile-scoped-settings](done/p0-profile-scoped-settings.md) ✅ | — | остання незакрита фаза **3H**; оживляє вкладку-заглушку в діалозі профілю |
| [per-stream-ignorelist-ui](p1-per-stream-ignorelist-ui.md) ♿ | P1 | planned | draft | M | — | — | бекенд уже працює, наповнити список з інтерфейсу неможливо; довідка описує це як дірку |
| [command-palette-phase-3](p1-command-palette-phase-3.md) ♿ | P1 | planned | ready | S | — | [command-palette-phase-4](p2-command-palette-phase-4.md), [command-palette-mode-prefixes](p3-command-palette-mode-prefixes.md) | Командна палітра — Фаза 3: розширення контенту (пісні, навігація) |
| [import-duplicate-metadata-update](p2-import-duplicate-metadata-update.md) ♿ | P2 | planned | ready | M | — | — | рішення ухвалено 2026-07-23 |
| [wishlist-match-tray-notification](p2-wishlist-match-tray-notification.md) ♿ | P2 | planned | ready | M | [wishlist-match-invisible](done/p1-wishlist-match-invisible.md) ✅ | — | четверта категорія `ToastKind`; слід, без якого гейт прапорцем був би заборонений, тепер є — журнал збігів |
| [autostart-notice-lost-when-minimized](p2-autostart-notice-lost-when-minimized.md) ♿ | P2 | planned | ready | S | [hotkey-registration-silent-at-startup](done/p1-hotkey-registration-silent-at-startup.md) ✅ | — | репліка про автозапуск переїжджає на гейт «перший показ вікна»; гейт витягти в спільний тип, не копіювати |
| [stream-failure-tray-toast](p2-stream-failure-tray-toast.md) ♿ | P2 | planned | ready | S | [error-state-never-reaches-ui](done/p1-error-state-never-reaches-ui.md) ✅ | — | ADR 2026-09-06 §6: у згорнутому вікні поверхня — система; нова категорія `ToastKind` зі своїм прапорцем, звірити з wishlist-match-tray-notification |
| [focus-active-item-on-playback-start](p2-focus-active-item-on-playback-start.md) ♿ | P2 | idea | draft | S | — | — | Автофокус на елементі при старті відтворення |
| [streams-list-search](p2-streams-list-search.md) ♿ | P2 | idea | draft | S | — | — | гачок уже стоїть: `ZoneEntry.focusSearch?()` із search-focus-hotkey; зникне репліка «на цьому екрані немає пошуку» |
| [transport-boundary-silent-in-background](p2-transport-boundary-silent-in-background.md) ♿ | P2 | planned | draft | S | [transport-skip-silent-failure](done/p1-transport-skip-silent-failure.md) ✅ | — | у вікні носій є — кнопки на межі `disabled`; у фоні натискання на краю списку не лишає сліду |
| [command-palette-phase-4](p2-command-palette-phase-4.md) ♿ | P2 | planned | **blocked** | S | [command-palette-phase-3](p1-command-palette-phase-3.md) | — | Командна палітра — Phase 4: context-aware ранжування Заблоковано: Phase 3 командної палітри не реалізована — немає ні поля PaletteItem.type, ні пісень у палітрі, які можна ранжувати |

---

## v0.3.0

> **Тема — комфорт.** Ідеї (`type: idea`) з ясною цінністю, але без ухваленого дизайну:
> кожну треба спершу обговорити (режим **ОБГОВОРЕННЯ** за алгоритмом
> [README](README.md#алгоритм-для-агента)), і лише потім планувати. Записи `planned`/`draft`
> тут — хвости грилінгів, їм потрібен **GROOMING**, а не обговорення; `research`/`draft` —
> дослідження, не обговорення.

У черзі: 19. Виконано: 0.

| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує | Суть |
|------|---|-----|------|---------|---------------|-------------|------|
| [webview-zoom-hotkeys](p1-webview-zoom-hotkeys.md) ♿ | P1 | planned | ready | S | — | — | прогалина доступності для слабозорих; перший крок — вимірювання, не правка |
| [wishlist-conditions](p2-wishlist-conditions.md) | P2 | idea | draft | L | — | — | перетинається з post-processing у частині «дії після запису» — звіряти після 0.2.0, інакше два механізми на одну задачу |
| [pause-recording](p2-pause-recording.md) ♿ | P2 | idea | draft | M | — | — | Пауза запису без відключення від потоку |
| [stream-manual-reorder](p2-stream-manual-reorder.md) ♿ | P2 | idea | draft | M | — | — | Ручне сортування потоків — ↑↓ кнопки або drag-and-drop |
| [track-log-only-mode](p2-track-log-only-mode.md) | P2 | idea | draft | M | — | — | Режим логування назв треків без запису аудіо |
| [command-palette-dual-language-search](p2-command-palette-dual-language-search.md) | P2 | idea | draft | S | — | — | Пошук у палітрі команд дублюється двома мовами |
| [command-palette-fuzzy-search](p2-command-palette-fuzzy-search.md) | P2 | idea | draft | S | — | — | Нечіткий пошук у палітрі команд |
| [focus-on-screen-open-option](p2-focus-on-screen-open-option.md) ♿ | P2 | idea | draft | S | — | — | Налаштування фокуса при відкритті екрана |
| [list-shift-range-to-edge](p2-list-shift-range-to-edge.md) ♿ | P2 | planned | draft | S | [list-key-modifier-guards](done/p2-list-key-modifier-guards.md) ✅ | — | хвіст грилінгу list-key-modifier-guards: `Shift+↑/↓` є, `Shift+Home`/`End` немає; батьківський запис зробив їх інертними, щоб фічу додавали, а не перевчали |
| [sleep-timer](p2-sleep-timer.md) ♿ | P2 | idea | draft | S | — | — | Sleep Timer — зупинити відтворення/запис через X хвилин |
| [tray-cannot-resume-last](p2-tray-cannot-resume-last.md) ♿ | P2 | planned | draft | S | [tray-toggle-label-vs-action](done/p2-tray-toggle-label-vs-action.md) ✅ | — | знахідка grilling 2026-09-03: пункт трея сірий, хоча `Ctrl+Shift+K` у тому самому стані відновлює останнє джерело |
| [wishlist-separate-folder](p2-wishlist-separate-folder.md) | P2 | idea | draft | S | — | — | Окрема папка для записів із вішліста |
| [lastfm-scrobbling](p3-lastfm-scrobbling.md) | P3 | idea | draft | M | — | — | Last.fm скробблінг — автоматична відправка прослуханих треків |
| [ts-rs-drift-guard](p3-ts-rs-drift-guard.md) | P3 | research | draft | M | [tauri-ts-type-drift](done/p2-tauri-ts-type-drift.md) ✅ | — | хвіст грилінгу tauri-ts-type-drift: сторож дрейфу `tauri.ts` проти Rust на ts-rs 12 «лише типи»; 12 розбіжностей за місяць — постійна ціна |
| [context-menu-at-cursor](p3-context-menu-at-cursor.md) | P3 | idea | draft | S | — | — | Контекстне меню відкривається у місці правого кліка |
| [diagnostic-report-block](p3-diagnostic-report-block.md) ♿ | P3 | idea | draft | S | [about-app-info](done/p1-about-app-info.md) ✅ | — | хвіст about-app-info: збірка Windows, версія WebView2, кнопка «Скопіювати відомості для звіту» |
| [player-station-image](p3-player-station-image.md) | P3 | idea | draft | S | — | — | Зображення станції у плеєрі |
| [recording-stats](p3-recording-stats.md) ♿ | P3 | idea | draft | S | — | — | Статистика запису — скільки записано, топ станцій |
| [tray-now-playing-source-prefix](p3-tray-now-playing-source-prefix.md) | P3 | planned | draft | S | — | — | знахідка grilling 2026-09-03: «Зараз грає: Файл: track.mp3» і префікс «Станція:», що відрізняє прев'ю від ефіру |

---

## unscheduled

> **Номера свідомо немає.** Тут лишаються дослідження (`type: research`), спірні ідеї,
> чиї «Відкриті питання» ставлять під сумнів саму пропозицію, і тригер-gated записи —
> ті, до яких повертаються лише за реальним приводом, а не за планом.
> Найперше рішення для цієї секції — **gate A4** ([mpv-playback-engine](p3-mpv-playback-engine.md)):
> його «go» закриває два інші записи разом.

У черзі: 13. Виконано: 3.

| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує | Суть |
|------|---|-----|------|---------|---------------|-------------|------|
| [disk-space-monitor](p2-disk-space-monitor.md) ♿ | P2 | planned | draft | M | — | — | знахідка architecture-doc-drift: §8 описував нагляд за місцем як робочий — події, щохвилинна перевірка, автозупинка, — а в коді немає нічого; не грилений |
| [reconnect-counter-not-live](p2-reconnect-counter-not-live.md) | P2 | planned | draft | S | [reconnect-max-in-status](done/p2-reconnect-max-in-status.md) ✅ | — | пара «спроба N з M» їде правильним каналом, але канал не оновлюється під час запису; знахідка реалізації 2026-09-02, потрібен grooming каналу |
| [stale-search-overwrites-results](p2-stale-search-overwrites-results.md) | P2 | planned | draft | S | [load-more-retry-skips-failed-page](done/p2-load-more-retry-skips-failed-page.md) ✅ | — | клас «стан розійшовся з екраном»: дві заміни в польоті, пізня кладе результати критеріїв, яких уже немає; квиток із load-more-retry підходить, грилити |
| [hls-stream-support](p3-hls-stream-support.md) ♿ | P3 | idea | draft | L | — | — | залежить від рішення mpv-playback-engine |
| [mpv-playback-engine](p3-mpv-playback-engine.md) ♿ | P3 | research | draft | L | — | [hls-stream-support](p3-hls-stream-support.md), [he-aac-mf-playback](p3-he-aac-mf-playback.md) | розвилка A4 (PoC-gate): «go» закриває he-aac-mf-playback і hls-stream-support разом; робити першим серед декодер-записів |
| [stream-auth](p3-stream-auth.md) ♿ | P3 | research | draft | L | — | — | брати лише за реальною потребою (станція з платним/приватним mountpoint) |
| [command-palette-taxonomy](p3-command-palette-taxonomy.md) ♿ | P3 | idea | draft | M | — | — | спірна — «Відкриті питання» ставлять під сумнів саму суть пропозиції |
| [he-aac-mf-playback](p3-he-aac-mf-playback.md) ♿ | P3 | research | draft | M | — | — | залежить від рішення mpv-playback-engine |
| [profile-switch-orphaned-tasks](p3-profile-switch-orphaned-tasks.md) ♿ | P3 | idea | draft | M | — | — | **умовний** — лише за реальним тригером (незафіналізовані файли після перемикання профілю) |
| [capabilities-dead-plugin-permissions](p3-capabilities-dead-plugin-permissions.md) | P3 | planned | draft | S | [dead-js-tauri-plugins](done/p3-dead-js-tauri-plugins.md) ✅ | — | хвіст dead-js-tauri-plugins: чотири дозволи в `capabilities/default.json` нікого не обслуговують; рішення, бо відсутній дозвіл ламає виклик мовчки |
| [cli-answers-only-with-exit-code](p3-cli-answers-only-with-exit-code.md) | P3 | idea | draft | S | — | — | спірна — `--version` і `--help` не друкують нічого (код 0 без `e.print()`); перше питання — чи GUI-застосунок узагалі має відповідати в консолі |
| [command-palette-mode-prefixes](p3-command-palette-mode-prefixes.md) ♿ | P3 | idea | draft | S | [command-palette-phase-3](p1-command-palette-phase-3.md) | — | спірна — українська розкладка без `>`/`@` |
| [help-style-guide-extract](p3-help-style-guide-extract.md) | P3 | planned | draft | S | [help-word-floor](done/p2-help-word-floor.md) ✅ | — | стиль-гайд довідки лежить у закритому `help-content-polish`, тест цитує його за slug'ом; чистий рефакторинг адреси, три відкриті питання |
