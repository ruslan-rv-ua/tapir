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
Виконані записи (110) — у [done/README.md](done/README.md), спадок кожного — у секції
«Спадок» його файлу.

---

## v0.1.0

> **Тема — чесний інтерфейс.** Усе вже побудоване доводиться до стану, у якому воно
> не бреше й не мовчить: мертві налаштування прибрані, мовчазні відмови дістають видиму
> поверхню, хибні мітки виправлені, обидві локалі повні. Нових можливостей версія не додає.
> **Випущено 2026-09-07** — тег `v0.1.0` на `main`, GitHub Release, маніфест у scoop-bucket;
> механізм — [release-workflow](done/p2-release-workflow.md), процедура — `docs/release.md`.

Черга порожня. Виконано: 87.

---

## v0.1.1

> **Тема — те, що обіцяно, але не працює.** Патч до випущеного 0.1.0: тільки записи
> `kind: bug`, жодної нової поверхні, жодного нового `ToastKind`. Критерій відбору
> подвійний — дефект видно в тому, що вже відвантажено людям, і виправлення лишається
> всередині наявного механізму (IPC і набір поверхонь не міняються). Версія закрита,
> коли код перестає розходитися з тим, що вже обіцяно: довідка обіцяє номер спроби
> перепідключення, пошук обіцяє показати відповідь саме на введений запит, автозапуск
> обіцяє тихий старт згорнутим у трей — живий і чутний для скрінрідера, — застосунок
> обіцяє сказати про вимкнений автозапуск, докоментар трея обіцяє `cold=resume-last`.
> Пряме продовження *чесного інтерфейсу* 0.1.0 — цього разу проти вже випущеної збірки.
>
> Поза чергою записів версія несе ще й **зміни значень за замовчуванням** — те, з чим
> Tapir зустрічає людину вперше. Записів вони не мають і теми не порушують: нових
> поверхонь не з'являється, IPC не міняється, а вже встановлені копії лишаються зі
> своїми значеннями, бо міграцій немає.

У черзі: 4. Виконано: 8.

| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує | Суть |
|------|---|-----|------|---------|---------------|-------------|------|
| [hotkey-record-skips-disk-check](p1-hotkey-record-skips-disk-check.md) ♿ | P1 | planned | ready | S | — | — | Ctrl+Shift+R стартує запис усіх потоків повз поріг диску: тост «Розпочато запис», диск заповнюється до краю; вікно в тій самій ситуації відмовляє |
| [file-position-lost-on-external-stop](p2-file-position-lost-on-external-stop.md) | P2 | planned | ready | S | — | — | Медіа-клавіша «Стоп», `--stop-playback` і перемикання профілю не зберігають позицію файлу: продовження останнього починає файл з нуля |
| [preview-switch-keeps-mute](p2-preview-switch-keeps-mute.md) ♿ | P2 | planned | ready | S | — | — | прев'ю A → прев'ю B після Ctrl+M: «Відтворення: B», а звук лишається вимкненим — App.tsx не порівнює url; одне порівняння джерел на обидва місця |
| [track-line-dangling-dash](p2-track-line-dangling-dash.md) ♿ | P2 | planned | ready | S | — | [tray-now-playing-source-prefix](p3-tray-now-playing-source-prefix.md) | станція без « - » у метаданих ефіру дає «— So What» у плеєрі, рядку потоку й журналі збігів, у треї — подвійне тире; лік — спільний trackLabel |

---

## v0.2.0

> **Тема — фічі з готовим дизайном.** Записи, де рішення вже ухвалені (`type: planned`)
> і лишилася реалізація, включно з останньою незакритою фазою застосунку —
> **3H Post-processing**.

У черзі: 13. Виконано: 12.

| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує | Суть |
|------|---|-----|------|---------|---------------|-------------|------|
| [post-processing](p1-post-processing.md) ♿ | P1 | planned | ready | L | [profile-scoped-settings](done/p0-profile-scoped-settings.md) ✅ | — | остання незакрита фаза **3H**; оживляє вкладку-заглушку в діалозі профілю |
| [per-stream-ignorelist-ui](p1-per-stream-ignorelist-ui.md) ♿ | P1 | planned | draft | M | — | — | бекенд уже працює, наповнити список з інтерфейсу неможливо; довідка описує це як дірку |
| [command-palette-phase-3](p1-command-palette-phase-3.md) ♿ | P1 | planned | ready | S | — | [command-palette-phase-4](p2-command-palette-phase-4.md), [command-palette-mode-prefixes](p3-command-palette-mode-prefixes.md) | Командна палітра — Фаза 3: розширення контенту (пісні, навігація) |
| [import-duplicate-metadata-update](p2-import-duplicate-metadata-update.md) ♿ | P2 | planned | ready | M | — | — | рішення ухвалено 2026-07-23 |
| [wishlist-match-tray-notification](p2-wishlist-match-tray-notification.md) ♿ | P2 | planned | ready | M | [wishlist-match-invisible](done/p1-wishlist-match-invisible.md) ✅ | — | четверта категорія `ToastKind`; слід, без якого гейт прапорцем був би заборонений, тепер є — журнал збігів |
| [player-primary-button-resumes-last](p2-player-primary-button-resumes-last.md) ♿ | P2 | planned | draft | M | [tray-cannot-resume-last](done/p2-tray-cannot-resume-last.md) ✅ | — | третя поверхня ролі «головна кнопка»: кнопка панелі в спокої мусить продовжувати останнє; потрібні IPC і видимий носій у вікні |
| [profile-rename-not-atomic](p2-profile-rename-not-atomic.md) | P2 | planned | ready | S | — | — | `Profile::rename` пише новий файл сирим `std::fs::write`, без tmp і `sync_all`: втрата живлення за секунди після перейменування може згубити профіль |
| [stream-failure-tray-toast](p2-stream-failure-tray-toast.md) ♿ | P2 | planned | ready | S | [error-state-never-reaches-ui](done/p1-error-state-never-reaches-ui.md) ✅ | — | ADR 2026-09-06 §6: у згорнутому вікні поверхня — система; нова категорія `ToastKind` зі своїм прапорцем, звірити з wishlist-match-tray-notification |
| [streams-metrics-bar-duplicates-chips](p2-streams-metrics-bar-duplicates-chips.md) ♿ | P2 | planned | ready | S | — | — | грилінг 2026-09-08: чотири плитки повторюють числа чіпів і рядка стану й тихо тримають чотири живі області; смуга прибирається цілком |
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

У черзі: 30. Виконано: 0.

| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує | Суть |
|------|---|-----|------|---------|---------------|-------------|------|
| [webview-zoom-hotkeys](p1-webview-zoom-hotkeys.md) ♿ | P1 | planned | ready | S | — | — | прогалина доступності для слабозорих; перший крок — вимірювання, не правка |
| [backend-mirror-stores](p2-backend-mirror-stores.md) | P2 | idea | draft | L | — | — | Засів, злиття відповіді команди, події й скидання на зміну профілю — в одному модулі на зріз (Потоки, Вішліст, налаштування), як `stores/browser.ts` |
| [profiles-module](p2-profiles-module.md) | P2 | idea | draft | L | — | — | «Чи це активний профіль?» питають 7 команд, перемикання й вихід згортають сесію по-різному, файли профілю йдуть повз Сховище; ідея — один модуль |
| [reconnect-loop-behind-host-port](p2-reconnect-loop-behind-host-port.md) | P2 | idea | draft | L | [recording-control-owns-every-start](p2-recording-control-owns-every-start.md) | — | Задача запису (422 рядки) сама лізе в AppState, трей і події, а тести лише пінять сигнатури; обговорити порт хоста й підставний ефір |
| [wishlist-conditions](p2-wishlist-conditions.md) | P2 | idea | draft | L | — | — | перетинається з post-processing у частині «дії після запису» — звіряти після 0.2.0, інакше два механізми на одну задачу |
| [composite-list-owns-bulk-removal](p2-composite-list-owns-bulk-removal.md) ♿ | P2 | idea | draft | M | — | — | Фокус після масового видалення зшито руками в 5 списках; список має сам вести Виділення й цей фокус. Спільне правило з клампом дрейфу — під питанням |
| [ipc-seam-test-adapter](p2-ipc-seam-test-adapter.md) | P2 | idea | draft | M | — | — | 34 тестові файли пишуть свій частковий мок tauri.ts і копіюють фікстури; у шов — спільний адаптер у пам'яті, мапа подій, словник кодів відмов |
| [pause-recording](p2-pause-recording.md) ♿ | P2 | idea | draft | M | — | — | Пауза запису без відключення від потоку |
| [playback-source-module](p2-playback-source-module.md) ♿ | P2 | idea | draft | M | — | — | «чи грає джерело цього рядка» виведено 6 разів, «слухати / зупинити» з відмовою — 5, рядок треку повз trackLabel — 4; зібрати в один модуль |
| [playback-verbs-persist-session](p2-playback-verbs-persist-session.md) | P2 | idea | draft | M | — | — | Сесійні поля зберігає викликач: 8 викликів у 4 модулях, а SMTC, CLI й перемикання профілю їх пропускають; зберігати має саме дієслово програвача |
| [player-mirror-module](p2-player-mirror-module.md) ♿ | P2 | idea | draft | M | — | — | Одну подію player-status розбирають п'ять файлів, «те саме джерело» записане двічі й розійшлося; ідея — один модуль дзеркала програвача |
| [recording-control-owns-every-start](p2-recording-control-owns-every-start.md) | P2 | idea | draft | M | — | [reconnect-loop-behind-host-port](p2-reconnect-loop-behind-host-port.md) | старт Запису скопійовано в п'ять місць, і копії розійшлися (Ctrl+Shift+R не перевіряє місце); ідея — один модуль на кожен старт і зупинку |
| [stream-insert-single-path](p2-stream-insert-single-path.md) | P2 | idea | draft | M | — | — | Сім команд кладуть Потік у Профіль чотирма способами, кожен зі своєю частиною правил; перенесення назв не звіряє — два рядки з однією назвою |
| [stream-manual-reorder](p2-stream-manual-reorder.md) ♿ | P2 | idea | draft | M | — | — | Ручне сортування потоків — ↑↓ кнопки або drag-and-drop |
| [track-log-only-mode](p2-track-log-only-mode.md) | P2 | idea | draft | M | — | — | Режим логування назв треків без запису аудіо |
| [command-palette-dual-language-search](p2-command-palette-dual-language-search.md) | P2 | idea | draft | S | — | — | Пошук у палітрі команд дублюється двома мовами |
| [command-palette-fuzzy-search](p2-command-palette-fuzzy-search.md) | P2 | idea | draft | S | — | — | Нечіткий пошук у палітрі команд |
| [focus-on-screen-open-option](p2-focus-on-screen-open-option.md) ♿ | P2 | idea | draft | S | — | — | Налаштування фокуса при відкритті екрана |
| [list-shift-range-to-edge](p2-list-shift-range-to-edge.md) ♿ | P2 | planned | draft | S | [list-key-modifier-guards](done/p2-list-key-modifier-guards.md) ✅ | — | хвіст грилінгу list-key-modifier-guards: `Shift+↑/↓` є, `Shift+Home`/`End` немає; батьківський запис зробив їх інертними, щоб фічу додавали, а не перевчали |
| [sleep-timer](p2-sleep-timer.md) ♿ | P2 | idea | draft | S | — | — | Sleep Timer — зупинити відтворення/запис через X хвилин |
| [wishlist-separate-folder](p2-wishlist-separate-folder.md) | P2 | idea | draft | S | — | — | Окрема папка для записів із вішліста |
| [event-speech-delivery](p3-event-speech-delivery.md) ♿ | P3 | idea | draft | M | — | — | 13 подій бекенду доносять шість хуків і App.tsx, кожен сам обирає пріоритет і тост; ідея — чисті селектори подій і одна доставка у вікні |
| [lastfm-scrobbling](p3-lastfm-scrobbling.md) | P3 | idea | draft | M | — | — | Last.fm скробблінг — автоматична відправка прослуханих треків |
| [ts-rs-drift-guard](p3-ts-rs-drift-guard.md) | P3 | research | draft | M | [tauri-ts-type-drift](done/p2-tauri-ts-type-drift.md) ✅ | — | хвіст грилінгу tauri-ts-type-drift: сторож дрейфу `tauri.ts` проти Rust на ts-rs 12 «лише типи»; 12 розбіжностей за місяць — постійна ціна |
| [zone-registry](p3-zone-registry.md) ♿ | P3 | idea | draft | M | — | — | exitZone прокинуто крізь 18 компонентів, проксі латають застарілу реєстрацію, ремонт фокуса на заміні слоту в кожного екрана свій; ідея — реєстр Зон |
| [context-menu-at-cursor](p3-context-menu-at-cursor.md) | P3 | idea | draft | S | — | — | Контекстне меню відкривається у місці правого кліка |
| [diagnostic-report-block](p3-diagnostic-report-block.md) ♿ | P3 | idea | draft | S | [about-app-info](done/p1-about-app-info.md) ✅ | — | хвіст about-app-info: збірка Windows, версія WebView2, кнопка «Скопіювати відомості для звіту» |
| [player-station-image](p3-player-station-image.md) | P3 | idea | draft | S | — | — | Зображення станції у плеєрі |
| [recording-stats](p3-recording-stats.md) ♿ | P3 | idea | draft | S | — | — | Статистика запису — скільки записано, топ станцій |
| [tray-now-playing-source-prefix](p3-tray-now-playing-source-prefix.md) ♿ | P3 | planned | draft | S | [track-line-dangling-dash](p2-track-line-dangling-dash.md) | — | «Зараз грає» в треї: подвійна двокрапка, префікс «Станція:» лише в прев'ю, а трек потоку видно лише під час запису |

---

## unscheduled

> **Номера свідомо немає.** Тут лишаються дослідження (`type: research`), спірні ідеї,
> чиї «Відкриті питання» ставлять під сумнів саму пропозицію, і тригер-gated записи —
> ті, до яких повертаються лише за реальним приводом, а не за планом.
> Найперше рішення для цієї секції — **gate A4** ([mpv-playback-engine](p3-mpv-playback-engine.md)):
> його «go» закриває два інші записи разом.

У черзі: 17. Виконано: 3.

| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує | Суть |
|------|---|-----|------|---------|---------------|-------------|------|
| [disk-space-monitor](p2-disk-space-monitor.md) ♿ | P2 | planned | draft | M | — | — | знахідка architecture-doc-drift: §8 описував нагляд за місцем як робочий — події, щохвилинна перевірка, автозупинка, — а в коді немає нічого; не грилений |
| [browser-zone-race-sweep-triage](p2-browser-zone-race-sweep-triage.md) ♿ | P2 | research | draft | S | [stale-search-overwrites-results](done/p2-stale-search-overwrites-results.md) ✅ | — | обхід зони браузера дав шість дефектів поза класом stale-search; частина підтверджена, частина не перевірялась — звірити й розділити на власні записи |
| [debounce-window-shows-stale-result-set](p2-debounce-window-shows-stale-result-set.md) ♿ | P2 | planned | draft | S | [stale-search-overwrites-results](done/p2-stale-search-overwrites-results.md) ✅ | — | критерії міняються миттєво, запит — через 500 мс; у це вікно стара вибірка видається за відповідь, а дописування йде новими критеріями по старому зсуву |
| [empty-search-shows-popular-stations](p2-empty-search-shows-popular-stations.md) ♿ | P2 | planned | draft | S | — | — | нульовий результат згортає showSearchResults, тож відповіддю на запит стає список популярних; рядок «Станцій не знайдено» недосяжний узагалі |
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
| [recording-duration-is-per-connection](p3-recording-duration-is-per-connection.md) | P3 | research | draft | S | [reconnect-counter-not-live](done/p2-reconnect-counter-not-live.md) ✅ | — | рядок і рядок стану показують вік поточного з'єднання, а не сесії запису; питання не в числі, а в тому, що таке «тривалість» |
| [recording-start-speaks-three-times](p3-recording-start-speaks-three-times.md) ♿ | P3 | idea | draft | S | [row-silent-while-connecting](done/p1-row-silent-while-connecting.md) ✅ | — | тригер-gated: одна дія дає «Підключення…», «Записується…», «Запис розпочато…»; вертатись, лише коли людина скаже, що заважає |
| [status-fixtures-rebuilt-per-test-file](p3-status-fixtures-rebuilt-per-test-file.md) | P3 | planned | draft | S | — | — | 5 білдерів у Rust і 17 літералів у 9 файлах TS; одне поле статусу — і правити треба всюди. Метушня, не ризик: забуту фікстуру ловлять типи |
