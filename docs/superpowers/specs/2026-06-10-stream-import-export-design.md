# Stream Import/Export (M3U8/PLS) — Design

> **Дата:** 2026-06-10
> **Гілка:** `feature/stream-import-export`
> **Підфаза:** 3J — Stream Import/Export
> **Статус:** Design approved, чекає рев'ю спеки

## Мета

Дати користувачу імпорт і експорт списку потоків активного профілю у форматах
**M3U8** та **PLS**. На імпорті — перевіряти кожен знайдений потік на
працездатність, показувати реальні метадані з перевірки та діалог вибору, які
саме потоки додати. Покриває 90%+ сценаріїв обміну списками радіостанцій.

## Контекст (що вже є в коді)

- [`stream::playlist`](../../../src-tauri/src/stream/playlist.rs) парсить PLS і
  M3U/M3U8, але повертає **лише перший** URL (`parse_pls` → `File1=`, `parse_m3u`
  → перший рядок). Є `resolve_playlist_url`, що визначає тип за розширенням,
  тягне й парсить.
- [`stream::connection::connect`](../../../src-tauri/src/stream/connection.rs)
  робить GET з `icy-metadata:1` і повертає `IcyHeaders` (назва станції, жанр,
  бітрейт) + content-type. Це готовий пробник: перевірка + метадані одним
  викликом.
- [`Profile::add_stream_checked`](../../../src-tauri/src/profile.rs) уже
  дедуплікує по URL (точний збіг) і повертає `Conflict`.
- Профільний import/export ([`profile_commands.rs`](../../../src-tauri/src/commands/profile_commands.rs))
  робить файловий діалог **у Rust** через `app.dialog().file().blocking_pick_file()`
  / `blocking_save_file()`, а UI працює поверх результату. `tauri-plugin-dialog`
  уже в залежностях.
- Кнопка «Додати потік» — у `ScreenHeader` в
  [`StreamsPanel.tsx`](../../../src/components/streams/StreamsPanel.tsx), у
  roving-tabindex тулбарі (`toolbarTabIndex`). Діалог відкривається через
  nanostore-прапорець `$showAddStreamDialog`.

## Затверджені рішення

1. **Метадані в імпортований потік:** зберігати **лише `name`** (ICY-ім'я →
   Title із плейлиста → URL). Поля `icy_name/bitrate/format/genre` лишаються
   `null` і заповнюються при першому записі — консистентно з ручним «Додати
   потік» і Browser. Метадані з probe використовуються **тільки для показу** в
   діалозі імпорту.
2. **Дублікати (URL уже є в активному профілі):** показувати в діалозі зі
   статусом «вже в профілі», чекбокс **disabled**, пропускати при коміті.
   Прозоро для незрячого користувача, не ламає `id`/credentials/ignorelist
   існуючого потоку, консистентно з семантикою `add_stream_checked`.
3. **Порівняння URL:** точний збіг після `trim`. Без канонікалізації
   (http/https, слеші) — більше шкоди, ніж користі.
4. **Roadmap:** нова підфаза **3J**; «оновити назву/метадані з перевірки для
   дубліката» — окрема **відкладена** позиція всередині 3J (не в цьому обсязі).

## Архітектура та межі модулів

| Модуль | Відповідальність |
|--------|------------------|
| `stream::playlist` (розшир.) | Парсинг *усіх* записів PLS/M3U + серіалізація на експорт. Чиста логіка, unit-тести. |
| `stream::probe` (новий) | Перевірка працездатності + метадані одним викликом поверх `connection::connect`. |
| `commands::stream_io_commands` (новий) | IPC: файлові діалоги, оркестрація перевірки з подіями, коміт імпорту, експорт. Окремо від `stream_commands`, щоб не змішувати CRUD із import/export. |
| `ImportStreamsDialog.tsx` (новий) | Список кандидатів, живі статуси перевірки, вибір, коміт. |
| `ExportFormatDialog.tsx` (новий) | Вибір формату (M3U8/PLS) перед save-діалогом. |
| `StreamsPanel.tsx` (розшир.) | Дві кнопки в тулбарі + прапорці-стори. |
| `CommandPalette.tsx` (розшир.) | Дві дії. |

## Backend — парсинг і серіалізація (`stream::playlist`)

```rust
pub struct ParsedEntry {
    pub url: String,
    pub title: Option<String>,
}

/// Парсить усі FileN=/TitleN= пари. Відсіває не-HTTP(S) URL, дедуплікує по URL
/// усередині файлу (лишає перший).
pub fn parse_pls_all(content: &str) -> Vec<ParsedEntry>;

/// Парсить усі записи M3U/M3U8. #EXTINF:-1,Назва злучається з наступним
/// не-коментарним рядком-URL. Відсіває не-HTTP(S). Дедуп по URL.
/// Якщо у вмісті є HLS-теги (#EXT-X-*) — це плейлист сегментів, не список
/// станцій: повертає порожній Vec (caller покаже відповідне повідомлення).
pub fn parse_m3u_all(content: &str) -> Vec<ParsedEntry>;

/// Визначає формат за вмістом (не лише за розширенням): рядок [playlist]
/// (case-insensitive) → PLS, інакше → M3U. Файли часто мають «неправильне»
/// розширення.
pub fn parse_playlist_all(content: &str) -> Vec<ParsedEntry>;

/// Серіалізує потоки активного профілю у текст плейлиста.
pub fn to_m3u8(streams: &[StreamInfo]) -> String; // #EXTM3U + #EXTINF:-1,name + url
pub fn to_pls(streams: &[StreamInfo]) -> String;  // [playlist] + File/Title/LengthN + NumberOfEntries + Version=2
```

Існуючі `parse_pls`/`parse_m3u` (single-URL для `resolve_playlist_url`)
рефакторяться делегувати у `_all` і брати перший запис — без дублювання логіки.
`validate_stream_url` лишається спільним фільтром.

## Backend — перевірка (`stream::probe`)

```rust
pub struct ProbeResult {
    pub url: String,
    pub ok: bool,
    pub icy_name: Option<String>,
    pub bitrate: Option<u32>,
    pub format: Option<AudioFormat>,
    pub genre: Option<String>,
    pub error: Option<String>,
}

/// 1) resolve_playlist_url (раптом запис сам вкладений плейлист)
/// 2) connection::connect → читає ICY-заголовки → body одразу відкидає
/// 3) таймаут ~10 с; будь-яка помилка → ok=false, error=текст
pub async fn probe(url: &str) -> ProbeResult;
```

## Backend — IPC-команди та типи (`commands::stream_io_commands`)

```rust
#[serde(rename_all = "camelCase")]
pub struct ImportCandidate {
    pub url: String,
    pub name: String,             // Title із плейлиста → URL (probe ще не відпрацював)
    pub already_in_profile: bool, // точний збіг URL з активним профілем
}

#[serde(rename_all = "camelCase")]
pub struct ImportProgress {       // payload події stream-import-progress
    pub url: String,
    pub status: String,           // "checking" | "ok" | "error"
    pub icy_name: Option<String>,
    pub bitrate: Option<u32>,
    pub format: Option<String>,
    pub error: Option<String>,
}

#[serde(rename_all = "camelCase")]
pub struct ImportResult { pub added: usize, pub skipped: usize }
```

Команди:

- `begin_stream_import(app, state) -> Option<Vec<ImportCandidate>>`
  Rust-діалог `blocking_pick_file` з фільтром `m3u/m3u8/pls`, читає файл
  (`strip_bom`), `parse_playlist_all`, позначає `already_in_profile` по
  активному профілю. Порожній/нечитабельний/без HTTP-потоків → `None`
  (UI покаже toast). Скасування діалогу → `None`.
- `validate_import_candidates(urls: Vec<String>, app) -> ()`
  Паралельні `probe` (cap 4–6 через буфер futures). На кожен — `emit(
  "stream-import-progress", ImportProgress)` (спершу `checking`, потім
  `ok`/`error`). Дублікати **не** перевіряються (їх не імпортуємо). Команда
  завершується, коли всі probe готові.
- `commit_stream_import(selected: Vec<SelectedStream{url,name}>, state) -> ImportResult`
  По кожному — `add_stream_checked` (захист від гонок/повторів), один `save()`
  у `spawn_blocking`. `name` = вибране користувачем (із probe/Title/URL).
  Повертає `{ added, skipped }`.
- `export_streams(app, format: String, state) -> ()`
  `format` ∈ `"m3u8"|"pls"`. Save-діалог із відповідним фільтром і
  дефолтним іменем (`<profile>.m3u8`/`.pls`), серіалізація активного профілю,
  запис файлу. Скасування → silent no-op.

Реєстрація в `lib.rs` `invoke_handler`.

## Frontend — імпорт (`ImportStreamsDialog.tsx`)

Потік:
1. «Імпорт…» → `begin_stream_import` (відкриває OS-пікер у Rust).
2. `None` → toast «Не знайдено потоків у файлі», діалог не відкривається.
3. Інакше — React Aria Modal зі списком кандидатів; **одразу** авто-старт
   `validate_import_candidates(urls)` (тільки для не-дублікатів).
4. Підписка на `stream-import-progress` (через `useTauriEvent`) оновлює статус
   рядків живцем.

Список (кожен рядок):
- чекбокс + назва + URL + текст статусу;
- статуси: `checking` → «перевіряється…», `ok` → «✓ 128 kbps MP3 · SomaFM…»
  (назва/бітрейт/формат із probe), `error` → «✗ <причина>», дубль →
  «вже в профілі».
- Дефолти чекбоксів: `ok`+новий — увімкнено; `error` — вимкнено, але
  **доступний** (станція може бути тимчасово офлайн); дубль — вимкнено,
  **disabled**.
- «Вибрати все / зняти все» (тільки доступні рядки).

Доступність (NVDA):
- `aria-live="polite"`: «Перевірено X з N», по завершенні — підсумок
  «N працюють, M помилок, K вже в профілі».
- Назва кандидата в `name` потоку: ICY-ім'я (коли probe `ok`) → Title → URL.

Коміт: «Імпортувати вибрані (N)» → `commit_stream_import` → toast з результатом
→ рефреш `$streams` → закрити. Escape/«Скасувати» закриває; незавершені probe
ігноруються (їх результати просто не застосовуються).

## Frontend — експорт (`ExportFormatDialog.tsx`)

«Експорт…» (disabled при 0 потоків) → невеликий діалог radio-group
(◉ M3U8 / ○ PLS — явний вибір зрозуміліший для NVDA, ніж фільтри в OS save-
діалозі) → `export_streams(format)` (Rust save-діалог) → toast. Експортуються
**усі** потоки активного профілю; credentials не потрапляють (зберігаються
окремо від URL, тож URL чисті).

## Розміщення в UI

- [`StreamsPanel.tsx`](../../../src/components/streams/StreamsPanel.tsx),
  `ScreenHeader` поряд із «Додати потік»: дві кнопки «Імпорт…» / «Експорт…» у
  наявному roving-tabindex (`toolbarTabIndex`). «Експорт…» disabled при 0
  потоків.
- Прапорці-стори в `stores/streams.ts`: `$showImportStreamsDialog`,
  `$showExportStreamsDialog` (дзеркало `$showAddStreamDialog`).
- CommandPalette: «Імпортувати потоки…», «Експортувати потоки…».
- i18n: нові рядки в `src/i18n/messages/uk.json` + `en.json`.

## Граничні випадки

| Випадок | Поведінка |
|---------|-----------|
| Файл порожній / 0 HTTP-потоків | `begin_stream_import` → `None` → toast |
| HLS-плейлист (`#EXT-X-*`) | `parse_m3u_all` → порожньо → toast «HLS не підтримується» |
| Запис сам є плейлистом (`.pls`/`.m3u` URL) | `probe` робить `resolve_playlist_url` |
| Дубль усередині самого файлу | дедуп, лишаємо перший (з його Title) |
| Помилка читання/парсингу | toast, діалог не відкривається |
| Мережева помилка на potоці | статус `error` + повідомлення; рядок лишається імпортовним |
| Великі плейлисти (сотні) | concurrency cap + прогрес; без жорсткого ліміту |

## Тести

**Rust unit (`stream::playlist`):**
- `parse_pls_all`: кілька записів, `TitleN`, дедуп, відсів не-http.
- `parse_m3u_all`: злучення `#EXTINF` з URL, дедуп, **HLS → порожньо**.
- `parse_playlist_all`: визначення формату за вмістом (PLS vs M3U).
- `to_m3u8`/`to_pls`: коректний формат, екранування назв, `NumberOfEntries`.

**Rust (`stream::probe`):** error-path на недосяжному хості (як наявні тести
`resolve_playlist_url`).

**Frontend (`ImportStreamsDialog.test.tsx`)** у стилі
[`ProfilesPanel.test.tsx`](../../../src/components/profile/ProfilesPanel.test.tsx):
рендер кандидатів, дефолти чекбоксів по статусу, select-all, `commit` викликає
команду з вибраними, оновлення статусу з події, aria-live підсумок.

## Roadmap (`docs/implementation-phases.md`)

Додати рядок у зведену таблицю та секцію **3J — Stream Import/Export (M3U8/PLS)**
з критеріями Done. Усередині 3J — відкладена позиція: «оновити назву/метадані
існуючого потоку з результату перевірки при імпорті дубліката» (Phase-3I-рівень
полірування, не в цьому обсязі).

## Поза обсягом (deferred)

- Оновлення назви/метаданих дубліката з probe (відкладено в 3J).
- Канонікалізація URL при порівнянні дублікатів.
- Перевірка потоків при експорті.
- Вибірковий експорт (експортуємо всі потоки профілю).
- Формати, відмінні від M3U8/PLS (XSPF, ASX тощо).
