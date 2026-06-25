# Відкриті питання беклогу

Зведення **усіх** питань, які треба вирішити перед/під час реалізації записів беклогу.
Зібрано з секцій «Відкриті питання» кожного запису + перехресні рішення, виявлені при
складанні [IMPLEMENTATION-ORDER.md](IMPLEMENTATION-ORDER.md). Станом на **2026-06-25**.

> Це навігаційний документ (без `p<рівень>-`-префікса), не запис беклогу. Першоджерело
> кожного питання — однойменний файл; тут лише агрегація для одного перегляду.

## Легенда типів

| Тег | Зміст | Хто відповідає |
|-----|-------|----------------|
| 🟥 **рішення** | потрібен вибір дизайну/продукту | користувач / власник продукту |
| 🟦 **перевірка** | факт у коді — звірити, не «рішення» | реалізатор (grep/чит. коду) |
| 🟨 **дослідження** | з'ясовується під час spike/реалізації | реалізатор (експеримент/тест) |

---

## A. Перехресні питання (найвищий пріоритет — зачіпають кілька записів)

Закрити **до** коду кластера відтворення/resume/crash, бо визначають межі кількох записів.

| # | Питання | Тип | Зачіпає | Рекомендація |
|---|---------|-----|---------|--------------|
| A1 | **Єдина модель resume-персистенсу.** `resume-last-playback` пропонував власний `last_playback.json` + enum `startup_playback_mode`, тоді як `playback-toggle` уже персистить `last_stream_id`/`last_file_position` у `PlayerSession`. Надбудова поверх P1 чи дублювання? | ✅ **вирішено** (2026-06-25) | [playback-toggle](p1-playback-toggle-stop-pause.md), [resume-last-playback](p2-resume-last-playback.md) | **#10 — надбудова над `PlayerSession` з P1.** Окремого `last_playback.json` немає. Режим `startup_playback_mode` (`never`/`always_paused`/`always_play`, дефолт `never`, без `restore`) — нове поле **в `PlayerSession`** → **per-profile**. Авто-гра = явний opt-in. UI — окремий діалог «Налаштування профілю». Деталі в записі. |
| A2 | **`state.json` vs стан відтворення.** Crash recovery кладе живий снапшот записів у `data/state.json`; resume-позиція — раніше планувалась в окремий файл. | ✅ **знято** (через A1) | [crash-recovery](p1-crash-recovery.md), [resume-last-playback](p2-resume-last-playback.md) | A1 скасував `last_playback.json` → стан відтворення живе в `PlayerSession` (профіль), crash — у `state.json`. Два чітко різні сховища; звіряти нема чого. |
| A3 | **Autostart не авто-грає.** Autostart стартує з `--minimize`. Узгодити з resume-моделлю A1. | ✅ **вирішено** (через A1) | [autostart](p2-autostart.md), [playback-toggle](p1-playback-toggle-stop-pause.md), [resume-last-playback](p2-resume-last-playback.md) | Autostart сам **не** грає; відтворення вирішує `startup_playback_mode` **активного профілю**. Авто-гра ⇔ активний профіль = `always_play` (явний opt-in). |
| A4 | **mpv закриває he-aac + hls?** Якщо PoC mpv проходить — `he-aac-mf` і `hls` стають непотрібні (mpv декодує обидва). Не вести MF-шлях і mpv паралельно. | 🟨 дослідження | [mpv](p3-mpv-playback-engine.md), [he-aac-mf](p3-he-aac-mf-playback.md), [hls](p3-hls-stream-support.md) | Спершу PoC-gate mpv; за `go` — видалити обидва записи |
| A5 | **CLI `--minimize` уже є?** Autostart залежить від нього (колишня Phase 3G). Запис `p1-cli-arguments.md` зник із беклогу → ймовірно зроблено. | ✅ **перевірено** (2026-06-25) | [autostart](p2-autostart.md) | **Так, реалізовано.** Прапорець у `cli.rs:42` (`#[arg(long)] minimize`, startup-only; forwarded-`--minimize` ігнорується, є тести). У setup: `show()+set_focus()` → `hide()` (старт у трей, NVDA встигає приєднатися) — `lib.rs:145`. Понад те, **увесь** autostart (бекенд + frontend) уже на місці: `autostart.rs` (build/reconcile/apply + тести), IPC `sync_autostart` (`lib.rs:258`), 2 toggle у `GeneralTab.tsx`, `useAutostartFeedback`, i18n — запис `p2-autostart.md` переведено у `done`. |

---

## B. Питання P1

### [crash-recovery](p1-crash-recovery.md) (ready)
- 🟥 **Снапшот за URL чи за `stream_id`?** URL не стабільний ключ (дублікати; credentials треба відновити зіставленням зі `StreamInfo`). _Рекомендація запису: лишити URL-и + зіставлення з профілем; незіставлений URL → невдале відновлення («N з M»)._
- 🟦 **Розміщення періодичної задачі:** поряд зі scheduler-тіком чи окремий spawn у `lib.rs` setup-хуку?

### [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md) (ready — рівень реалізації закрито 2026-06-25)
- ✅ **Форма дискримінатора:** окреме поле `last_active` enum (`stream|file`), **не** timestamp — слотів лише 2, enum = єдине джерело правди, resolve толерує висячий дискримінатор (+ очищає).
- ✅ **Seek до `position_ms`:** підтримується й **уже підключено** — `Decoder::try_from` виставляє `is_seekable`, команда `seek_playback`/`try_seek` fallible. Cold-start: `play_file` → `try_seek`, на `Err` — з початку.
- ✅ **Запис на «переходах»:** **НЕ** новий хук — розширити наявний `graceful_shutdown` (вже зберігає volume); знімок позиції зчитати **до** `stop_session_public`. pause/stop/track-change пишуть зі своїх команд.
- ✅ **Легасі-edge:** закрито дизайном dispatch — гілка `Stream` діє на `Playing||Paused` → stop, тож `Paused+Stream` зі старого білда коректно резолвиться у stop. Міграції не треба.
- ✅ **Doc-фікс:** `architecture.md:1178` «Switch Profile» — **помилка** (це MenuTrigger-кнопка, не хоткей) → прибрати; `:1193` → `Ctrl+Shift+K` разом із кодовим ребіндом.
- _Деталі та обґрунтування — секція «Рішення (рівень реалізації)» у записі._

### [activity-bar-help-button](p1-activity-bar-help-button.md) (ready)
- ✅ Відкритих питань немає.

---

## C. Питання P2

### [resume-file-from-setting](p2-resume-file-from-setting.md) (ready)
- 🟦 **У якому tab розмістити** (де живе `auto_advance` / `double_click_action`) — перевірити (ймовірно GeneralTab).
- 🟥 **Розширювати до «за довжиною»** (поріг хвилин) замість ручного вибору? _Поки ні (YAGNI); enum лишає двері відчиненими._

### [add-stream-probe](p2-add-stream-probe.md) (ready)
- 🟥 **Реюз IPC:** використати наявні `begin_stream_import` + `validate_import_candidates` чи зробити спрощений `probe_stream(url)`? _(Спільне з browser-add-probe — одна IPC на двох.)_
- 🟥 **Timeout probe:** 5 секунд фіксовано чи з налаштуванням?

### [browser-add-probe](p2-browser-add-probe.md) (ready)
- 🟥 **Async тост (вар. 1) чи sync blocking (вар. 2)?** _Рекомендація запису: вар. 1 (async тост) — не блокує масове додавання._
- 🟥 **Показувати `lastcheckok`** у таблиці результатів Browser як badge («остання перевірка: OK/FAIL»)?

### [streams-ctrlk-empty-hint](p2-streams-ctrlk-empty-hint.md) (ready)
- 🟥 **Текст бейджа:** лише «Ctrl+K», чи з підписом («Команди — Ctrl+K» / «Палітра команд»)?
- 🟥 **Показувати бейдж у filter-empty стані** теж, чи лише в порожньому профілі?
- 🟨 **(тригер)** ADR §9.2: якщо порожнього стану як єдиного місця навчання замало — повернутись до `aria-keyshortcuts` (S4). Окремий тригер, не частина запису.

### [wishlist-example-patterns](p2-wishlist-example-patterns.md) (ready)
- ✅ Усі питання закриті в сесії 2026-06-24.

### [resume-last-playback](p2-resume-last-playback.md) (draft, модель узгоджена 2026-06-25)
- ✅ **A1/A2 закрито:** надбудова над `PlayerSession` з #1; per-profile `startup_playback_mode` (`never`/`always_paused`/`always_play`); окремий діалог «Налаштування профілю»; скидання режиму при дублюванні/експорті. Деталі — в записі.
- 🟦 **Спадщина #1:** форма дискримінатора `last_active`; seek до `position_ms` для всіх форматів.
- 🟨 **Рівень реалізації:** синхронізація in-memory активного профілю при редагуванні; NVDA-перевірка `Select` у модалці.

### [log-rotation](p2-log-rotation.md) (draft, рішення прийняті)
- 🟦 **Portable-шлях:** чи `tauri_plugin_log` поважає `portable::log_dir()` (пише в `data/logs/`, не `%APPDATA%`)? Якщо ні — додати в `portable.rs`.

### [open-song-with-default-app](p2-open-song-with-default-app.md) (draft)
- 🟦 **Чи `tauri-plugin-opener` вже у `Cargo.toml`?**
- 🟥 **Назва пункту меню:** «Відкрити у програмі» / «Відтворити зовнішнім плеєром» / просто «Відкрити»?

### [import-duplicate-metadata-update](p2-import-duplicate-metadata-update.md) (draft)
- 🟥 **Що оновлювати:** лише `name`, чи також `codec`/`bitrate`? (Оновлення кодека/бітрейту може затерти ручні правки.)
- 🟥 **Коли показувати опцію:** лише якщо probe вже виконано (стан `Probed`), чи запускати probe спеціально для дублікатів?
- 🟥 **Чи показувати всі змінені поля** (напр. `icy_name` збігається, але `bitrate` різний) — окремими чекбоксами чи загальним?
- 🟥 **Undo** оновлення метаданих окремо від скасування всього імпорту?
- 🟨 **Нормалізація назви** перед порівнянням (`icy_name` у верхньому регістрі / зайві пробіли)?

### [full-edit-stream](p2-full-edit-stream.md) (ідея — ескіз НЕ узгоджено)
- 🟥 **Зміна URL під час активного запису/відтворення:** блокувати vs зупинити-й-попередити?
- 🟥 **Скоуп полів у 1-й ітерації:** лише URL, чи одразу URL+auth+ignorelist? _Менший крок — лише URL._
- 🟥 **Збереження позиції/статусу потоку** при зміні URL (id незмінний → так, але re-resolve може змінити метадані)?

### [autostart](p2-autostart.md) (✅ done — реалізовано, перевірено 2026-06-25)
- ✅ **Анонс «Tapir запущений автоматично» при autostart-старті — «ні» (фінальне).** Підтверджено в коді: `useAutostartFeedback` озвучує лише деактивацію через переміщення EXE, звичайний autostart-старт не анонсується.
- ✅ **A5 закрито (2026-06-25):** CLI `--minimize` є й працює (`cli.rs:42`, `lib.rs:145`). Бекенд і frontend autostart реалізовані повністю (`autostart.rs`, `sync_autostart`, toggle у `GeneralTab.tsx`, `useAutostartFeedback`) → запис переведено у `done`.
- ✅ **A3 (через A1):** autostart сам не грає; авто-гра ⇔ активний профіль має `startup_playback_mode = always_play` (per-profile opt-in).

### [command-palette-phase-3](p2-command-palette-phase-3.md) (draft)
- 🟥 **Ліміт результатів:** показувати перші N (15–20) / «показати ще» / лише за query? _Рекоменд.: порожній query → лише дії+навігація; query ≥ 2 → підмішувати станції/пісні (до 10 кожного типу)._
- 🟨 **Сортування:** підіймати «нещодавні»? _Recency-ранжування — у Phase 4._
- 🟦 **Пошук пісень:** filename vs metadata (artist/title) — залежить, чи backend повертає теги.
- 🟥 **Навігаційні команди при порожньому рядку:** показувати одразу всі чи за keyword «перейти»? _Рекоменд.: показувати одразу._
- 🟨 **Взаємодія з Phase 4:** не закладати жорсткий порядок — лишити місце для ранжування.
- 🟥 **Кнопка «Команди» в шапці (DA5):** прибрати в цій же задачі чи окремо?

### [post-processing](p2-post-processing.md) (draft, рішення прийняті)
- ✅ Відкритих питань немає (усе в «Прийняті рішення»).

### [bug-profile-switch-orphaned-tasks](p2-bug-profile-switch-orphaned-tasks.md) (draft)
- 🟨 **Наскільки реальний сценарій**, де task не завершується за 2с? _(Тригер узяти в роботу взагалі.)_
- 🟥 **Track-level shutdown (CancellationToken)** замість process-level kill? (Вибір між 3 варіантами фіксу: ↑timeout / CancellationToken / детект+лог+NVDA.)

### [bug-volume-nan-validation](p2-bug-volume-nan-validation.md) (ready)
- ✅ Відкритих питань немає.

---

## D. Питання P3

### [mpv-playback-engine](p3-mpv-playback-engine.md) (дослідити) — **gate go/no-go**
- 🟥 **In-process (`libmpv2`) чи окремий процес (`tauri-plugin-mpv` + JSON-IPC)?**
- 🟨 **Перший ICY-тайтл:** чи дає mpv надійний **перший** `StreamTitle`? (Ключове go/no-go — від нього залежить track-changed/SMTC/нотифікації.) Якщо ні — лишити власний ICY-pump лише для метаданих?
- 🟦/🟨 **Бандлінг `libmpv-2.dll`** для portable-EXE (звідки бінарник, оновлення, антивірус-false-positive).
- 🟨 **Non-destructive probe** на подіях mpv — чи зберігається модель «старий потік грає, поки новий не підтверджений»?
- 🟥 **Цінність проти ризику:** скільки станцій саме HE-AAC/HLS без MP3/AAC-LC-альтернативи?
- 🟥 **Видалити he-aac/hls** записи, якщо mpv заходить? _(= A4.)_

### [he-aac-mf-playback](p3-he-aac-mf-playback.md) (дослідити — вторинний до mpv)
- 🟨 **Реальна першопричина** поломки: невірний spec у `LiveSource` ↔ ресемплінг rodio, чи інше у виводі MF→rodio?
- 🟥 **Тримати MF-шлях** чи прийняти graceful-degradation (HE-AAC просто показує помилку)?
- 🟨 **Перемаршрутизація лише HE-AAC** у MF (LC лишити symphonia) — як надійно відрізнити LC від HE-AAC на live-потоці до декоду (sniff/rewind на нерозмотуваному rtrb)?
- 🟥 **Патчити лише вихідний шлях** на `he-aac-mf` чи переробити маршрутизацію з нуля?
- 🟥 **Реальна цінність:** скільки станцій у користувача саме HE-AAC без LC/MP3-альтернативи?

### [hls-stream-support](p3-hls-stream-support.md) (ідея — вторинний до mpv)
- 🟨 **Скільки % станцій виключно HLS** (без ICY-альтернативи)? _Перевірити перед роботою._
- 🟥 **DRM (`#EXT-X-KEY`)** підтримувати? _Найімовірніше ні (комерційні потоки)._
- 🟥 **Варіативний бітрейт (`#EXT-X-STREAM-INF`)** — підтримувати? Який обирати автоматично?
- 🟥 **«Зараз грає» без ICY:** лише назва станції чи ховати рядок?
- 🟥 **ffmpeg** як опціональна залежність чи виключно нативна Rust-реалізація?
- 🟦 **Зрілість HLS-крейтів** (`m3u8-rs`, `hls_m3u8`) для production — перевірити.
- 🟨 **(тригер повернення):** конкретні запити користувачів або >20% популярних станцій виключно HLS.

### [command-palette-phase-4](p3-command-palette-phase-4.md) (blocked — чекає phase-3)
- 🟥 **Mode-prefixes (`>`/`@`) взагалі потрібні?** Ризик: незрозумілі наосліп для NVDA. _Альтернатива: лише context-boost без prefixes._
- 🟨 **NVDA + динамічний reranking:** чи `aria-live="polite"` з дебаунсом достатньо, чи потрібен `aria-relevant="additions"`?
- 🟨 **Поріг бусту:** перекривати хороший fuzzy-збіг іншого типу чи лише при рівних score? _Визначити ручним тестом після Phase 3._
- 🟥 **Wishlist/Schedule пріоритизація:** буст `station` для Wishlist? Schedule без бусту?

### [quick-controls-overlay](p3-quick-controls-overlay.md) (draft, L)
- 🟥 **Яку глобальну клавішу** призначити (без конфлікту з T1-шорткатами)?
- 🟥 **Конфігурованість overlay** (вибір пунктів)?
- 🟥 **Друге Tauri-вікно vs нативний Win32** — з урахуванням «portable single EXE»? _Рекоменд.: друге Tauri-вікно (правильна a11y)._
- 🟥 **Toggle vs відкрити заново** при кожному виклику?

### [screen-reader-direct-speech](p3-screen-reader-direct-speech.md) (відкладено)
- 🟨 **(тригер повернення):** лише якщо balloon tips виявляться недостатніми для швидкого фідбеку на глобальні хоткеї (типово — гучність). Тоді scope — **тільки** озвучення глобальних хоткеїв, не заміна `LiveAnnouncer`.

### [unwrap-in-tests](p3-unwrap-in-tests.md) (ready)
- ✅ Відкритих питань немає.

---

## Зведення для дій

- **Закрити першими (блокують код):** ~~A1~~ ✅, ~~A2~~ ✅, ~~A3~~ ✅, ~~A5~~ ✅ (вирішені/перевірені 2026-06-25 — resume = надбудова над `PlayerSession`, per-profile режим; CLI `--minimize` є в коді, autostart фактично реалізований). Лишився **A4** (mpv-gate).
- **Чисті перевірки коду** (не «рішення», звірити grep'ом): B-crash (розміщення задачі), C-resume-file (tab), C-log (portable-шлях), C-open-song (opener у Cargo), C-phase3 (теги пісень), D-hls (зрілість крейтів). _(A5 — ✅ перевірено; B-playback — ✅ закрито 2026-06-25: seek уже підключено, graceful-hook уже є, doc-фікс визначено.)_
- **Дослідницькі gate'и** (відповідь — під час spike): A4, D-mpv (перший ICY-тайтл — go/no-go), D-he-aac (першопричина), D-hls (% станцій).
- **Записи без відкритих питань:** activity-bar-help-button, wishlist-example-patterns, post-processing, volume-nan-validation, unwrap-in-tests.
