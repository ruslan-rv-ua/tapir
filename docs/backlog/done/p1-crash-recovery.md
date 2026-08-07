---
slug: crash-recovery
title: "Crash Recovery — відновлення записів після аварійного завершення"
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
blocks: [resume-last-playback]
touches: [src-tauri/src/app_state.rs, src-tauri/src/profile.rs, src-tauri/src/portable.rs, src-tauri/src/stream/manager.rs, src-tauri/src/lib.rs, src-tauri/src/scheduler/timer.rs, src-tauri/src/commands/profile_commands.rs]
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
notes: ["реалізовано у feature/phase-3k-crash-recovery; чекає ручного NVDA-прогону — [[phase-3k-crash-recovery-status]]"]
---

# Crash Recovery — відновлення записів після аварійного завершення

> **Контекст:** виконано, реалізовано у `feature/phase-3k-crash-recovery`. Усі автоматизовані критерії закриті; ручний NVDA-прогін очікує ([[phase-3k-crash-recovery-status]]).

## Опис

Під час активного запису радіо-потоку процес може завершитись аварійно: вимкнення
живлення, `End Task` у Task Manager, паніка в Rust-потоці, зависання системи.
У такому разі:

- MP3/AAC-файли залишаються **незафіналізованими** (у більшості контейнерів — без
  кінцевого маркера; деякі плеєри їх не відкриють).
- ICY-теги поточного треку **не записані** (пишуться при зміні треку або зупинці).
- Частково записаний трек є «зависшим» у файловій системі без явної позначки
  кінця.
- Список активних записів у профілі (Phase 1, `active_recording_urls`) оновлювався
  **лише** при чистому виході — після збою він застарілий або порожній, тому сліпий
  resume за ним хибний. Ця фаза **замінює** його живим снапшотом у `data/state.json`.

**Завдання фази:** виявити, що попередній сеанс завершився аварійно, відновити
активні (ручні) записи і повідомити користувача (NVDA-сумісно).

### Механіка виявлення збою

`clean_shutdown` — булевий прапор у `data/state.json` (окремий від профілю):

- записується `false` при кожному **старті** (атомарний write);
- перезаписується `true` в `graceful_shutdown` перед виходом.

Якщо при старті значення `false` — попередній сеанс завершився аварійно. Якщо файл
**відсутній** (найперший запуск або видалений `data/`) — теж трактуємо як аварію,
але снапшот тоді порожній, тому resume нічого не робить і анонс мовчить (див. NVDA).

### Чому потрібен живий снапшот

`active_recording_urls` у Phase 1 оновлювався **лише** в `graceful_shutdown`.
Після збою цей список застарілий або порожній — resume за ним відновить не ті
потоки. Тому потрібен **окремий живий снапшот** у `data/state.json`, що
оновлюється під час роботи (тригер на зміну складу + таймер ≤ 30 с). Це **єдине**
джерело для resume: при `clean_shutdown = false` беремо снапшот; при чистому виході
снапшот не читається взагалі (`clean_shutdown = true` → нічого не відновлюємо).

Структура `data/state.json`:

```json
{
  "clean_shutdown": false,
  "active_recordings": [
    { "stream_id": "st-abc", "url": "https://radio.example/stream-a" },
    { "stream_id": "st-def", "url": "https://radio.example/stream-b" }
  ]
}
```

> **Реалізація:** серіалізується в camelCase (`cleanShutdown`, `activeRecordings`,
> `streamId`), як і решта персистованих структур проєкту — див.
> [docs/data-models.md §8](../../data-models.md) і `src-tauri/src/crash_recovery.rs`
> (джерело правди). Поля вище — snake_case з чернетки цього запису, лишено як є.

Ключ — `stream_id` (= `StreamInfo.id`): стабільний унікальний ідентифікатор, який
однозначно розв'язується у `StreamInfo` активного профілю → точні credentials /
ignorelist. URL так не годиться: не унікальний (можливі дублікати — той самий сервер
із різними акаунтами; станцію додали двічі) і не несе credentials, тож зіставлення за
ним нечітке й ламається при правці URL ([full-edit-stream](p1-full-edit-stream.md)
лишає `id` незмінним).
Поле `url` у снапшоті — **діагностичне, лише для логів і читабельності `state.json`**;
у зіставленні на resume **не** бере участі.

### Resume-споживач

Resume-споживача зараз **немає взагалі** — `Profile.active_recording_urls` є лише в
типах і ніде на старті не читається. Цю фазу й треба дотягнути: при виявленому збої
(`clean_shutdown = false`) прочитати `stream_id`-и з живого снапшота і запустити записи
через `stream::manager`. Кожен `stream_id` розв'язується у `StreamInfo` активного
профілю (`streams.iter().find(|st| st.id == stream_id)`) → звідти URL + credentials +
ignorelist. Незіставлений `stream_id` (потік видалили між снапшотом і рестартом)
рахується як **невдале відновлення** і йде в підсумок «N з M» (нижче).

### Хто пише снапшот

**Окрема виділена tokio-задача**, змодельована за зразком `SchedulerShared`
([`scheduler/timer.rs`](../../../src-tauri/src/scheduler/timer.rs)): власний
`tokio::select!` над notify-каналом, `interval` і `CancellationToken`. Вона читає
`AppState` (статуси записів + `scheduler-owned` пари) і реюзає чисту функцію
`manual_resume_stream_ids(statuses, scheduler_owned)`, що повертає `stream_id`-и
активних **непланових** записів (розв'язання id → `StreamInfo` переходить на resume).

Це **не** обов'язок `StreamManager` (він не знає ні про scheduler, ні про профіль —
дати йому ці залежності зіпсувало б його межі) і **не** піггібек на scheduler-тіку:
тік прив'язаний до межі календарної хвилини (~60 с) і чисто таймерний, а снапшоту
треба ≤ 30 с **+ реакція на зміну складу**. Підганяти каданс планувальника заради
чужої потреби зламало б його межі.

**Тригер:** `tokio::sync::Notify` (або `watch`), який `StreamManager` /
`recording_control` смикає при зміні стану запису (старт / стоп / error) → миттєвий
запис із легким debounce; плюс `interval ≤ 30 с` як safety net. Запис атомарний
(`temp → rename`).

**Де spawn:** у **setup-хуку** (`lib.rs`, після `AppState::new`), **не** у
`frontend_ready`. Scheduler і `StartupPlan` відкладені до `frontend_ready`, бо
**емітять UI-події** до підписки webview; снапшот-писар не емітить нічого — лише
атомарно пише файл, тож гейт webview йому не потрібен, і персистенс крихкого стану не
варто чіпляти до життя webview. Відкласти до `frontend_ready` треба **лише анонс**
підсумку resume (див. NVDA).

### Взаємодія з NVDA

Модальний діалог «Відновити записи?» — **погана ідея** для незрячого користувача:
він блокує решту UI і потребує явного підтвердження. Дружній до NVDA дефолт —
**тихий авто-resume** + анонс через `aria-live`. Дерево анонсу:

- снапшот **порожній** (вкл. перший запуск, або аварія без активних записів) — **тиша**
  (немає втрат — немає чого повідомляти; уникає фальшивої тривоги);
- **усі** записи підняті — «Відновлено N записів після аварійного завершення»;
- **частково** — «Відновлено N з M записів після аварійного завершення; решта
  потоків недоступні».

Анонс через `LiveAnnouncer` (`data-live-announcer`) — поза модалом
([[live-region-inside-modals]]). Підсумок resume обчислюється в setup-хуку, але
**емітується через відкладений механізм** (як `StartupPlan` / `StartupNotice`): setup
стешить результат, а `frontend_ready` його дренує й емітує. Інакше подія піде до
підписки webview і озвучення загубиться — той самий гейт, що в scheduler-а.

## Критерії готовності

- [x] `data/state.json` містить `clean_shutdown: bool` і список `stream_id` активних
  ручних записів (живий снапшот; `url` — опційне діагностичне поле, не для матчингу)
- [x] При кожному старті `clean_shutdown` записується `false` (атомарний write);
  відсутній файл трактується як аварія, але з порожнім снапшотом
- [x] В `graceful_shutdown` перед виходом `clean_shutdown` записується `true`
- [x] Окрема виділена tokio-задача (за зразком `SchedulerShared`; spawn у setup-хуку)
  оновлює снапшот `stream_id` активних записів у `data/state.json` (тригер `Notify` на
  зміну складу + `interval` ≤ 30 с), реюзаючи `manual_resume_stream_ids`
- [x] Поле `Profile.active_recording_urls` прибрано (модель, `default`, dup-clear,
  `profile_commands`); його запис у `graceful_shutdown` знято
- [x] На старті: якщо `clean_shutdown = false` і снапшот непорожній — бекенд розв'язує
  кожен `stream_id` у `StreamInfo` активного профілю і запускає записи через
  `stream::manager` (resume-споживач, якого зараз немає)
- [x] Тихий авто-resume без діалогу; підсумок обчислено в setup, відкладено й емітовано
  у `frontend_ready` (як `StartupPlan`); фронтенд виводить `aria-live` анонс
- [x] Анонс: порожній снапшот → тиша; усі підняті → «Відновлено N…»; частково →
  «Відновлено N з M…»; через `data-live-announcer` поза модалом
- [x] NVDA озвучує підсумок відновлення одразу після завантаження UI (коли DOM готовий)
  — механізм реалізовано й покрито тестами (`useCrashResumeFeedback.test.tsx`);
  живий прогін з екранним читачем — окремий пункт нижче
- [x] Часткові файли записів (з моменту збою) залишені без змін — поведінка
  задокументована
- [x] Гейти: `cargo test` + `cargo clippy` зелені; `pnpm test` + `pnpm vite:build` проходять
- [ ] Ручний прогін з NVDA (аварія з ≥1 активним записом) — **(очікує ручного прогону)**

## Прийняті рішення

| Питання | Рішення |
|---------|--------|
| Авто-resume vs діалог? | **Тихий авто-resume + `aria-live` анонс.** Немає несподіваних діалогів при запуску. |
| Коли відновлювати? | **Тільки після аварії** (`clean_shutdown = false`). Чистий вихід = свідома зупинка → не відновлюємо. |
| Джерело правди? | **Живий снапшот у `data/state.json`** — єдине джерело. `Profile.active_recording_urls` **прибрано** (мертве поле: писалось лише в `graceful_shutdown`, ніде не читалось). |
| Ключ снапшота — URL чи `stream_id`? | **`stream_id`, не URL.** Стабільний унікальний ідентифікатор → однозначний розв'язок у `StreamInfo` (точні credentials / ignorelist), стійкий до правки URL, чистий «N з M» (id відсутній → промах). URL не унікальний (дублікати) і не несе credentials. `url` лишається в снапшоті лише діагностичним полем. |
| Хто пише снапшот? | **Окрема виділена tokio-задача** (за зразком `SchedulerShared`), що реюзає `manual_resume_stream_ids(statuses, scheduler_owned)`. **Не** `StreamManager` (не знає про scheduler/профіль) і **не** scheduler-тік. **Spawn у setup-хуку** (писар не емітить UI-подій → гейт `frontend_ready` не потрібен; відкладається лише анонс resume). |
| Частота / каданс снапшота? | **`Notify` на зміну складу + `interval` ≤ 30 с (safety net)** у `tokio::select!`. **Не** піггібек на scheduler-тіку: його ~60 с календарний каданс і чисто-таймерна модель не дають ≤ 30 с + подієвість без спотворення меж планувальника. |
| Анонс resume? | Порожній снапшот (вкл. перший запуск) → **тиша**. Усі підняті → «Відновлено N…». Частково → «Відновлено N з M…». |
| Partial-файли після збою? | **Залишити як є.** MP3/AAC — кадровий потік без обов'язкової фіналізації; плеєр відтворить більшу частину. Подія фіксується в лозі. |
| Resume при зміні IP/мережі? | **Не в scope цієї фази.** Reconnect-логіка (`stream::manager`) — окрема задача. |
| Планові записи при збої? | **Scheduler-owned потоки не входять у resume.** Снапшот їх виключає через `manual_resume_stream_ids`; їх catch-up лежить у `ScheduleManager`. |
| Атомарний write `state.json`? | **Так, `write temp → rename`.** Той самий підхід, що у `profile.rs`. |

## Документи

- [implementation-phases.md §3K](../../implementation-phases.md)
- Код бекенду:
  - `src-tauri/src/app_state.rs` — `graceful_shutdown`, `manual_resume_urls` (фільтр resume →
    перейменувати на `manual_resume_stream_ids`, повертати `stream_id` замість `url`; тести оновити)
  - `src-tauri/src/profile.rs` — **прибрати** поле `active_recording_urls` (~306) і
    його скиди при дублюванні (~520, ~568)
  - `src-tauri/src/portable.rs` — шлях до `data/` (новий `state.json` поряд із `settings.json`)
  - `src-tauri/src/stream/manager.rs` — `StreamManager`, `stop_all`, статуси записів
  - `src-tauri/src/lib.rs` — setup-хук (виявлення збою + resume + spawn снапшот-писаря),
    `ensure_data_dirs`; відкладений анонс resume дренується у `frontend_ready`
  - `src-tauri/src/scheduler/timer.rs` — `owned_sessions` / `on_app_closing` (виключення планових);
    `SchedulerShared` — зразок патерну задачі для снапшот-писаря (`select!` над notify / interval / cancel)
  - `src-tauri/src/commands/profile_commands.rs` — **прибрати** скид `active_recording_urls` (~142)
- Код фронтенду:
  - `src/components/common/LiveAnnouncer.tsx`
  - `src/stores/announcer.ts`
  - `src/hooks/useAnnounce.ts`
- [accessibility.md — §11 live-regions, §1.4 modal-hacks](../../accessibility.md)
- Суміжний беклог: [resume-last-playback](p1-resume-last-playback.md) — стан відтворення
  живе в `PlayerSession` профілю (після A1 окремого `last_playback.json` немає); `state.json`
  (crash recovery) — інше сховище. Два чітко різні стани, звіряти нема чого.
- Пам'ять: [[live-region-inside-modals]], [[branch-model-main-stale]], [[phase-3k-crash-recovery-status]]
