# tauri-specta: чи міняти ручний `tauri.ts` на згенеровані bindings

> Дослідницька нотатка зі спайком до запису беклогу
> [p3-tauri-specta-bindings](../backlog/p3-tauri-specta-bindings.md).
> Дата: 2026-09-05. Гілка спайку: `spike/tauri-specta` (коміти `2c2a944`, `0e577db`),
> не зливати. Tauri 2.10.3, Rust 2024 / rustc 1.94.0, Windows 11.
>
> Три роди тверджень позначено явно: **[Дж]** — першоджерело (номер у списку
> «Джерела» наприкінці), **[Код]** — прочитано в коді Tapir на `869154c`,
> **[Спайк]** — виміряно або отримано на гілці спайку.

## Коротко (TL;DR)

- `tauri-specta` — RC із 2023 року, остання `2.0.0-rc.25` (2026-05-08); docs.rs для двох
  останніх версій не збирається; питання «коли вихід із RC» (#247) висить без жодної
  відповіді з 2026-07-22 [Дж 1, 14, 15, 18].
- Спайк працює: три команди й одна подія → `bindings.ts` за ~3 мс. Але «ціна» — не
  «прибрати 925 рядків». Експортер **відмовляє** на `u64`/`usize` (21 поле в DTO Tapir),
  рендерить кожен `f32` як `number | null`, відмовляє на `deserialize_with`, а всі поля з
  `#[serde(default)]` робить необов'язковими (`?:`) у типах-результатах — це змінює форму
  `StreamInfo`, `Profile`, `RecordingSettings` для всього фронтенду [Спайк].
- На Windows тестовий бінарник, що згадує `Builder::<Wry>`, **не запускається**
  (`STATUS_ENTRYPOINT_NOT_FOUND`): tauri-build вшиває маніфест Common-Controls v6 лише в
  `bin`-цілі. Обхід — один рядок у `build.rs`, але лише для `[[test]]`-цілей [Спайк, Дж 28, 29].
- Аудит ручних типів знайшов 12 розбіжностей; справжня одна (`track-changed` із плеєра
  не несе `ignored`), решта — свідомі звуження або `?:` замість `| null` [Код].
- **Рекомендація: «не мігрувати, поки RC».** Тригер повернення — стабільний `2.x` на
  crates.io з зеленим docs.rs, або друга справжня помилка дрейфу. Дешевший
  середній шлях — «лише типи» (ts-rs або specta-typescript без tauri-specta), ~2–3 дні.

## Питання (чекліст запису)

| # | Питання із запису | Відповідь | Де в нотатці |
|---|---|---|---|
| 1 | Три команди анотовано, `bindings.ts` згенеровано; скільки рядків Rust на команду | Так. 2 / 4 / 8 рядків на команду + ~90 рядків інфраструктури | Спайк, кроки 2 і 4 |
| 2 | Чи компілюється `specta::Type` для всіх типів `profile.rs` і `settings.rs` без переписування | Derive — так, усі 28. Експортер — ні: `deserialize_with` (1 поле) і `u64`/`usize` (4 поля) | Спайк, крок 3 |
| 3 | Чи збігається згенерований `StreamStatus` з ручним | Поле в поле — так (з примусовим `number` для `u64`). `StreamState` у ручному має зайве `"stopped"` | Спайк, крок 5 |
| 4 | Чи переживають тести з `vi.mock("@tauri-apps/api/core")` | Так: bindings імпортують `invoke` саме звідти. Але таких тестів 1; 36 файлів мокають `lib/tauri` | Спайк, крок 6 |
| 5 | Скільки часу додає генерація до `just dev`, чи потрібен окремий крок | 3–10 мс на старт; окремий крок не потрібен за часом, але потрібен через `#[cfg(debug_assertions)]`-запис у `src/` на кожному старті | Першоджерела §4, Спайк, крок 7 |

## Відповіді з першоджерел

### 1. Версії, статус RC, супровід

| Факт | Значення | Джерело |
|---|---|---|
| Остання версія `tauri-specta` | `2.0.0-rc.25`, 2026-05-08; edition 2024; `rust_version` не вказано; `max_stable_version` = `1.0.2` | [Дж 1] |
| Попередні | rc.24 — 2026-03-30 (edition 2024); rc.21 — 2025-01-13 (edition 2021); rc.20 — 2024-09-18. Версій rc.22 і rc.23 у `tauri-specta` не було | [Дж 1, 14] |
| Пари версій | README головної гілки має лише таблицю 2×2 «Specta v1 ↔ Tauri v1, Specta v2 ↔ Tauri v2» з посиланням на docs.rs `^2.0.0-rc.21`; таблиці «яка rc з якою» немає. Пару дає сам `Cargo.toml` крейта на тезі `v2.0.0-rc.25`: `specta = "=2.0.0-rc.25"`, `specta-typescript = "0.0.12"`, `specta-serde`/`specta-util` `0.0.12`; `tauri = { version = "2", default-features = false, features = ["specta"] }` | [Дж 5, 6] |
| Що радить документація крейта | «Tauri Specta v2 is still in beta … it is really important you use `=` before your Specta version»; `cargo add tauri@2.0 specta@=2.0.0-rc.25 specta-typescript@0.0.12` і `tauri-specta@=2.0.0-rc.25 --features derive,typescript,javascript` | [Дж 7] |
| docs.rs | rc.25 — **не зібрано**, rc.24 — **не зібрано**, rc.21 — зібрано; `specta` rc.25, `specta-typescript` 0.0.12, `ts-rs` 12.0.1 — зібрано | [Дж 18] |
| Чому не збирається | Issue #227 (2026-06-14, 0 коментарів): лог docs.rs — `feature(doc_auto_cfg)` знято в rustc 1.92, падають `winnow 0.5.40`, `toml_datetime 0.6.3`, `serde_spanned 0.6.9` під `--all-features` | [Дж 16] |
| Issue #247 «Release candidate status» | Відкрито 2026-07-22 (ThalusA), без міток, **0 коментарів** станом на 2026-09-05 | [Дж 15] |
| Інші сигнали про RC | #166 «`Result` shouldn't be the default» — від мейнтейнера (2025-03-11), 0 коментарів; #135 «bindings still have throw even with `ErrorHandlingMode::Result`» — відкрито з 2024-09-29, мейнтейнер пояснює задум і обіцяє `ResultUnknown` | [Дж 17] |
| Супровід | Останній коміт 2026-07-20 (`ebe38d6`, «remove default features so runtime isn't included»); `pushed_at` 2026-07-26; 4 відкриті PR; 28 відкритих issues+PR; 791 зірок | [Дж 14] |
| Каденс релізів | rc.21 → rc.24: 14,5 місяця без релізу; rc.24 → rc.25: 5 тижнів | [Дж 1, 14] |
| Breaking-зміни між rc | rc.24: «Upgrade Specta … Checkout the v2.0.0-rc.24 and v2.0.0-rc.23 release notes for breaking changes»; введено *phase-specific types* (`X_Serialize`/`X_Deserialize`), вимкнути — `Builder::disable_serde_phases`. rc.25: «Upgrade to latest Specta; Fixing issues with phased types; Support for semantic types». rc.21: «this release will be broken until tauri-apps/tauri#12371 is released» (радили `[patch.crates-io]` на git-ревізію Tauri). rc.20: «recommended you lock the version using an `=`» | [Дж 14] |
| `specta` / `specta-typescript` | `specta` rc.25 — 2026-05-07 (max_stable `1.0.5`); `specta-typescript` `0.0.12` — 2026-05-07 (усі його версії `0.0.x`); репозиторій `specta` — push 2026-09-01, 11 відкритих, 637 зірок | [Дж 2, 3, 31] |

### 2. Форма згенерованого `bindings.ts`

Читано генератор `src/lang/js_ts.rs` і `src/builder.rs` на тезі `v2.0.0-rc.25` та приклад
`examples/app/src/bindings.ts` [Дж 8, 9, 12].

| Аспект | Що робить генератор | Джерело |
|---|---|---|
| Імпорт `invoke` | `import { invoke as __TAURI_INVOKE } from "@tauri-apps/api/core"` (+ `Channel`, якщо є канали); події — `import * as __TAURI_EVENT from "@tauri-apps/api/event"`. Не `window.__TAURI_INTERNALS__` | [Дж 8: рядки 144–160] |
| `Result<T, E>` | За замовчуванням `ErrorHandlingMode::Result`: обгортка `typedError<T, E>(promise)` повертає `{ status: "ok"; data: T } \| { status: "error"; error: E }`. Усередині: `if (e instanceof Error) throw e;` — екземпляри `Error` **перекидаються**, решта загортається | [Дж 8: 1013–1019; Дж 9: 15–21] |
| Чи можна кидати | `Builder::error_handling(ErrorHandlingMode::Throw)`; або підмінити реалізацію обгортки `Builder::typed_error_impl(...)` | [Дж 9: 263–290] |
| Чому перекидає `Error` | Мейнтейнер (#135, 2024-09-30): щоб тип помилки був `TErr`, а не `unknown`; «I suspect we might want to implement `ErrorHandlingMode::ResultUnknown`» — не реалізовано на rc.25 | [Дж 17] |
| Не-`Result` команди | `name: (args) => __TAURI_INVOKE<T>("name", { args })` | [Дж 12] |
| Події | `events.x = makeEvent<T>("x")` з `listen`, `once`, `emit` і варіантом на конкретне вікно `events.x(window).listen`; ім'я — kebab-case назви структури або `#[tauri_specta(event_name = "...")]`; потрібен derive `tauri_specta::Event` + `collect_events![]` + `builder.mount_events(app)` | [Дж 8: 1055–1072; Дж 11; Дж 7] |
| `Channel<T>` | `tauri::ipc::Channel<T>` у Tauri 2.10.3 має `#[specta(remote = Channel)]`; у TS — аргумент `Channel<T>` з `@tauri-apps/api/core` | [Дж 27: ipc/channel.rs 54–57; Дж 8: 969–992] |
| JSDoc | Rust doc-коментарі команд і полів переносяться у `/** … */` (видно у спайковому `bindings.ts`) | [Дж 8: 404–508; Спайк] |
| Заголовок / форматер | `Typescript::default().header("…")`, `.layout(Layout::…)`; методів `formatter`/prettier/biome у `specta-typescript` 0.0.12 (`typescript.rs`, `exporter.rs`) **немає** | [Дж 24] |
| BigInt | `usize/isize/i64/u64/i128/u128/f128` — **помилка експорту** за замовчуванням; `Builder::dangerously_cast_bigints_to_number()` мапить їх у `number`; `Builder::semantic_types(...)` з `enable_lossless_bigints()` дає JS `BigInt` | [Дж 22: 1509–1511; Дж 9: 306–310; Дж 24: semantic.rs 327–337] |
| Фази serde | З rc.24 типи з різною формою для Serialize/Deserialize експортуються як `X_Serialize`, `X_Deserialize`, `X = X_Serialize \| X_Deserialize`; аргументи команд беруть Deserialize-форму, результати — Serialize; вимкнути — `disable_serde_phases()` | [Дж 7; Дж 9: 317] |

### 3. `specta::Type` і serde

| Аспект | Факт | Джерело |
|---|---|---|
| Атрибути serde, які парсить derive | контейнер: `rename`, `rename_all` (у т.ч. `serialize=`/`deserialize=`), `rename_all_fields`, `tag`, `content`, `untagged`, `default`, `transparent`; варіант: `rename`, `alias`, `rename_all`, `skip`, `skip_serializing`, `skip_deserializing`, `serialize_with`, `deserialize_with`, `with`, `other`, `untagged`; поле: `rename`, `alias`, `default`, `flatten`, `skip`, `skip_serializing`, `skip_deserializing`, `skip_serializing_if`, `serialize_with`, `deserialize_with`, `with` | [Дж 20: serde.rs 63–107, 180–300] |
| Атрибути `#[specta(...)]` | контейнер: `crate`, `type`, `inline`, `remote`, `collect`, `skip_attr`, `transparent`, `bound`; поле: `type`, `inline`, `skip`, `optional`, `default`; варіант: `skip`, `inline`, `type` | [Дж 20: attr/*.rs; Дж 26] |
| Відомі прогалини (валідація на експорті, не на derive) | `serialize_with`/`deserialize_with`/`with` **без** `#[specta(type = …)]` → помилка «unsupported serde custom codec»; `skip_serializing_if` в уніфікованому режимі → помилка; `#[serde(other)]` лише для tagged-enum; const-generics і associated types не експортуються | [Дж 21: 536–567, 544–548, 652–654; Дж 26] |
| `Option<T>` | `T \| null` (`DataType::Nullable`); `?:` дає лише `#[specta(optional)]` | [Дж 25: impls.rs 235–237; Дж 26] |
| `HashMap`/`BTreeMap`, `Vec`, кортежі, `PathBuf` | мапи → `PrimitiveMap<K, V>`; `Vec`/`VecDeque` → список; кортежі до 12 елементів; `Path`/`PathBuf` → `string` | [Дж 25: impls.rs 33–34, 66–67, 76–77, 94–95] |
| `chrono` | feature `chrono` крейта `specta`; `NaiveDateTime`/`NaiveDate`/`NaiveTime` → `string` | [Дж 19: рядок 52; Дж 25: legacy_impls.rs 355–362] |
| Числа | `i8…u32` → `number`; `f16/f32/f64` → **`number \| null`** («`null` comes from `NaN`, `Infinity` and `-Infinity`. Is done by JS APIs and Serde JSON»); `u64`/`i64`/`usize`… → помилка `bigint_forbidden` | [Дж 22: 1505–1514] |
| Порада specta щодо BigInt | 5 шляхів у порядку переваги: framework-level, менші типи, рядок + `#[specta(type = String)]`, **per-field** `#[specta(type = specta_typescript::Number)]` («similar to an `unsafe` block»), `Remapper` на всю колекцію | [Дж 23: 9–40] |
| Аргументи команд, які ігноруються | Tauri 2.10.3 під feature `specta` реалізує `FunctionArg` з `None` для `State<'_, T>`, `AppHandle<R>`, `Window<R>`, `Webview<R>`, `WebviewWindow<R>`; feature вимагає `specta ^2.0.0-rc.16` | [Дж 27: src/lib.rs 38, 1104–1136; Cargo.toml `[dependencies.specta]`] |

### 4. Як запускається експорт

- Документація крейта і приклад: `#[cfg(debug_assertions)] builder.export(Typescript::default(), "../src/bindings.ts")` **у `main()`/`run()` до `tauri::Builder`** — тобто на кожному старті debug-збірки [Дж 7, 9, 13].
- `Exporter::export_to` пише файл **безумовно** (`std::fs::write`), без порівняння вмісту [Дж 24: exporter.rs 236–290]. Для `just dev` це означає: кожен старт торкається `src/lib/bindings.ts`, який дивиться Vite. Реакцію Vite спайк не перевіряв (застосунок не запускався).
- Час самого експорту — мілісекунди (див. Спайк, крок 7); час не аргумент, аргумент — побічний запис у `src/` і потреба debug-запуску як «збірки» типів.
- Альтернатива з `#[test]`: працює лише як `[[test]]`-ціль і лише з обходом маніфесту (Спайк, крок 4).

### 5. Альтернативи

| Варіант | Факти | Джерело |
|---|---|---|
| **ts-rs** | `12.0.1`, 2026-01-31; стабільна лінія (`max_stable_version` = `12.0.1`); `rust-version = "1.78.0"` у `Cargo.toml` (README тієї ж теги каже «MSRV … 1.88.0» — розбіжність у їхніх документах); edition 2021. Експорт: `#[ts(export)]` генерує `#[test]` на тип, `cargo test` пише `bindings/<Name>.ts`; змінні `TS_RS_EXPORT_DIR`, `TS_RS_LARGE_INT` (за замовчуванням `bigint`, можна `number`). serde: `rename`, `rename-all`, `rename-all-fields`, `tag`, `content`, `untagged`, `skip`, `skip_serializing`, `skip_serializing_if`, `flatten`, `default`; непідтримуваний атрибут — **попередження**, не помилка; `skip_deserializing` ігнорується; `chrono` — feature `chrono-impl`. Репозиторій: push 2026-08-31, 30 відкритих, 1869 зірок. Ручні `invoke`-обгортки лишаються — це саме «лише типи» | [Дж 4, 30] |
| **specta + specta-typescript без tauri-specta** | `Typescript::export_to(path, &Types, format)` є в `0.0.12`; потрібно самому зібрати `Types` і передати `Format` (serde-фази — `specta_serde`). Ті самі правила чисел і `deserialize_with`; замість `dangerously_cast_bigints_to_number` — `Remapper` або per-field `#[specta(type = Number)]`. Спайком **не перевірено** | [Дж 24: typescript.rs 65–86; Дж 23] |
| **Status quo + сторож дрейфу** | Ручний файл лишається; виправити 12 знахідок аудиту; сторож — окреме питання, тут не спроєктований | [Код] |

## Інвентар Tapir

Усе нижче — читання коду на `869154c` [Код]; повний аудит типів робив окремий прохід по
`src/lib/tauri.ts` і всіх `pub struct`/`pub enum` із serde-derive у `src-tauri/src/**`.

### Команди

| Метрика | Значення |
|---|---|
| `#[tauri::command]` у `src-tauri/src/commands/*.rs` | **85**; стільки ж у `generate_handler!` (`lib.rs` 320–406) |
| Повертають `Result<_, String>` | **82** |
| Повертають `Result<_, RadioError>` | **0**. `RadioError` не має `Serialize`; є лише `impl From<RadioError> for String` (`errors.rs` 48–52) через `Display` — запис беклогу тут неточний |
| Прості значення | 3: `get_app_info → AppInfo`, `default_hotkeys → HotkeyMap`, `notify_transport_failure → ()` |
| Беруть `State<'_, AppState>` | 68 |
| Беруть `AppHandle` | 35 |
| Беруть `Window`/`WebviewWindow`/`Channel` | 0 |
| Не беруть ні `State`, ні `AppHandle` | 10 |
| `src/lib/tauri.ts` | 925 рядків; 89 рядків із `invoke` = 1 імпорт + 88 викликів; **85 унікальних команд** (4 виклики подвоєні: `transfer_stream[s]_to_profile` як `copy`/`move`) |

### Події

| Метрика | Значення |
|---|---|
| Місць `app.emit(...)` у Rust | 38 |
| Унікальних імен подій | **29** (28 літералів + `BUSY_EVENT = "hotkeys-busy"`) |
| Слухають у TS | усі 29: 23 через `useTauriEvent`/`listen` у компонентах, 6 у хуках (`profile-changed`, `autostart-deactivated`, `browser-station-probe-result`, `cli-feedback`, `crash-resume`, `hotkeys-busy`) |
| Типи payload | ~25 іменованих структур; `()` ×3 (`wishlist-changed`, `streams-changed`, `autostart-deactivated`); `&str` (`transport-skip`: `"prev"`/`"next"`); `Vec<String>` (`hotkeys-busy`); повторно вжиті DTO (`PlayerStatus`, `WishlistMatch`, `Song`, `StreamInfo`) |
| Два емітери однієї події | `track-changed`: `stream/manager.rs` 83–93 (з `ignored`) і **локальна структура всередині функції** в `player/engine.rs` 669–676 (без `ignored`) |

Для `tauri_specta::Event` кожна подія мусить бути іменованим типом із `Type` +
`Event`: три `()`-події, рядковий `transport-skip` і `Vec<String>` потребують newtype-обгорток,
локальну структуру в `engine.rs` треба винести.

### DTO: ручний файл проти Rust, поле в поле

Перевірено 67 рядків (усі `export interface`/`export type` у `tauri.ts` + `src/types/song.ts`
+ `src/lib/logLevel.ts` + інлайнові типи трьох команд). Ім'я, `rename_all`, опційність,
варіанти enum, представлення (`tag`/`untagged`) і числові типи. **Розбіжностей: 12.**

| # | Тип | Що розходиться | Клас |
|---|---|---|---|
| 1 | `TrackChangedPayload.ignored` (`tauri.ts:127`) | Емітер у `player/engine.rs:669–676` поля `ignored` **не має**; емітер у `stream/manager.rs:83–93` — має. `App.tsx:201` читає `payload.ignored` | **справжня** (TS читає поле, якого один емітер не шле; сьогодні `undefined` поводиться як `false`) |
| 2 | `RecordingStatusPayload.error?: string` (`:118`) | Rust `error: Option<String>` без `skip_serializing_if` → завжди `"error": null`; правильно `string \| null` | нешкідливо (ніхто не читає) |
| 3 | `StreamState` (`:32`) має `"stopped"` | Rust enum (`stream/manager.rs:47–55`) — `Idle, Connecting, Recording, Reconnecting, Error`; `"stopped"` існує лише як вільний рядок у `RecordingStatusPayload.status` (`manager.rs:991`) | свідоме: одна TS-унія на дві Rust-форми |
| 4 | `RecordingStatusPayload.status: StreamState` | Rust `status: String`; усі емітовані літерали в унії | звуження |
| 5 | `Profile.playerSession` (`:800–807`) | Rust `PlayerSession` має ще `last_active: Option<LastActive>` (`profile.rs:346–347`), TS його не описує | нешкідливо |
| 6 | `Profile.savedTracks: unknown[]` (`:808`) | Rust `Vec<SavedTrack>` (`profile.rs:395–410`) | свідома розхлябаність |
| 7 | `UiSettings.streamSort: "name" \| "added"` (`:664`) | Rust `stream_sort: String` (`profile.rs:258–259`, з коментарем, що рядок навмисно) | звуження |
| 8 | `PlaybackAnnounce.kind` унія з 5 літералів (`:298`) | Rust `kind: String` (`playback_control.rs:19`); усі 5 емітованих значень в унії | звуження |
| 9 | `ImportProgressPayload.status` (`:889`) | Rust `status: String` (`stream_io_commands.rs:33`) | звуження |
| 10 | `ScheduledCompletedPayload.status` — 3 з 5 варіантів (`:775`) | Rust `ScheduleResultStatus` (5 варіантів); емітери шлють лише ці 3 | звуження |
| 11 | `FilterItem`, `BrowserFilters` (`:560–569`) | Rust структури **без** `rename_all` (`browser/types.rs:48–62`); збіг лише тому, що всі ключі однослівні. Перше двослівне поле зламає TS мовчки | латентна |
| 12 | Вхідні числа: `volumeStepPercent → u8`, `days → Vec<u8>`, `SearchParams.*`, `RecordingSettings.*` → `u32` | від'ємне/дробове число відкине serde на `invoke`, а не клампне | стандартна розхлябаність `number` |

Числові поля, що мають значення для генератора: **21** поле `u64`/`usize` у DTO
(12 `u64`: `StreamStatus.bytesRecorded/sessionId`, `RecordingCompletedPayload.durationMs`,
`PlayerStatus.positionMs/durationMs`, `PlayerProgressPayload.*`, `PlaybackAnnounce.positionMs`,
`WishlistMatch.id`, `FilePosition.positionMs`, `Song.durationMs/sizeBytes`; 9 `usize`:
`ProfileMeta.streamCount`, `ImportPreview.streamCount`, `BulkTransferResult.*`,
`StreamImportResult.*`, `CrashResumeSummary.*`, `BrowserProbeSummary.checked`) + 5 скалярів
команд (`get_free_space`, `seek_playback`, `remove_streams`, `stop_all_recordings`,
`start_all_recordings`); **3** поля `f32` (`ReconnectConfig.backoffMultiplier`,
`PlayerStatus.volume`, `PlayerSession.volume`); `i64` — жодного.

### Як тести мокають IPC

| Що мокають | Файлів |
|---|---|
| `vi.mock("../lib/tauri")` / `"../../lib/tauri"` / `"./tauri"` — **модуль-обгортку** | **36** |
| `vi.mock("@tauri-apps/api/core")` | 1 (`src/lib/tauri.profile.test.ts`) |
| `vi.mock("@tauri-apps/api/event")` | 5 |
| `vi.mock(".../hooks/useTauriEvent")` | 3 |
| `mockIPC` / `mockWindows` | 0 |
| Усього тест-файлів (`pnpm test`) | 99 |

Твердження запису «`vi.mock` і `mockIPC` у vitest працюють як зараз» стосується одного
файлу з 99. Решта мокає `lib/tauri` — обгортку, яку міграція мала б прибрати.

### `RadioError`

`thiserror`-enum без `Serialize` (`errors.rs`). До webview доходить `String` через
`From<RadioError> for String` → `to_string()`. TS-бік ловить рядки: обгортки документують
«Rejects with a stable code — map it via `shellOpenErrorMessage`».

## Спайк

Гілка `spike/tauri-specta` над `869154c`; два коміти: `2c2a944` (кроки 1, 2, 4, 5, 6, 7)
і `0e577db` (крок 3). Застосунок не запускався; `tauri build` не робився.

### Крок 1 — залежності

Додано до `src-tauri/Cargo.toml` (пін `=`, як радить крейт):
`specta = "=2.0.0-rc.25"` (features `derive`), `specta-typescript = "=0.0.12"`,
`tauri-specta = "=2.0.0-rc.25"` (features `derive`, `typescript`).

| Метрика | До | Після |
|---|---|---|
| Пакетів у `Cargo.lock` | 653 | 661 (+8: `Inflector 0.11.4`, `specta`, `specta-macros`, `specta-serde 0.0.12`, `specta-typescript 0.0.12`, `specta-util 0.0.12`, `tauri-specta`, `tauri-specta-macros`) |
| `cargo tree --prefix none \| sort -u` | 494 | 506 |
| `cargo tree --prefix none -e normal \| sort -u` | 449 | 461 |
| `cargo check --all-targets`, холодний `target/` | 59,9 с | 54,6 с (різниця в межах шуму) |
| `cargo check --all-targets` інкрементально одразу після додавання | — | **26,9 с**: перекомпілюються `tauri 2.10.3`, п'ять `tauri-plugin-*` і `tapir`, бо `tauri` отримує feature `specta` |
| Перша `cargo test` (з бінарником) | — | 1 хв 22 с |

### Крок 2 — три команди

| Команда | Роль | Рядків Rust | Що саме |
|---|---|---|---|
| `get_app_info` (`AppHandle` → `AppInfo`) | проста | **2** | `#[specta::specta]` + `specta::Type` у derive `AppInfo` |
| `get_stream_status` → `Result<StreamStatus, String>` | `Result` | **4** | атрибут + derive на `StreamStatus`, `StreamState`, `TrackInfo` |
| `get_player_status` → `Result<PlayerStatus, String>`, DTO = payload події `player-status` | з подією | **8** | атрибут + derive на `PlayerStatus` (+`tauri_specta::Event`), `PlaybackState`, `PlaybackSource` + 4 рядки per-field override на `volume` (див. крок 5) |

Спільна інфраструктура: `Cargo.toml` +15 (9 без коментарів), `build.rs` +17 (крок 4),
`src/bindings_export.rs` 44 рядки, `tests/export_bindings.rs` 13, `lib.rs` +1. Аргументи
`State`/`AppHandle` зникли з сигнатур самі (feature `specta` у Tauri) — `getAppInfo: () => …`.

### Крок 3 — усі типи `profile.rs`, `settings.rs` і `RadioError`

`specta::Type` додано регексом до **кожного** derive із `Serialize` (23 у `profile.rs`,
5 у `settings.rs`) і до `RadioError`.

| Що | Результат | Дослівно |
|---|---|---|
| Derive на 28 типах | **компілюється без змін** | — |
| Derive на `RadioError` | 3 × `E0277` | `error[E0277]: the trait `specta::Type` is not implemented for `reqwest::Error`` (`src\errors.rs:6:21`), те саме для `std::io::Error` (`:9`) і `serde_json::Error` (`:12`); підказка компілятора: «wrap your type in a new-type wrapper». Виправлення — `#[specta(skip)]` на трьох payload-ах (як у прикладі крейта з `#[serde(skip)]` на `io::Error`) |
| Експорт усіх 28 типів, спроба 1 | помилка експортера | `Format error: type graph formatter failed: Unsupported serde attribute at 'GlobalSettings.log_level': #[serde(deserialize_with)] changes the wire type. Add #[specta(type = ...)] (or #[specta(type = specta_serde::Phased<Serialize, Deserialize>)])` → 1 рядок `#[specta(type = LogLevel)]` |
| Спроба 2 | помилка експортера | `Attempted to export "tapir_lib::profile::FilePosition.positionMs" but Specta forbids exporting BigInt-style types (usize, isize, i64, u64, i128, u128) to avoid precision loss.` → `dangerously_cast_bigints_to_number()` |
| Спроба 3 | 28 типів експортовано: 310 рядків (phased), 28 `export type` (unified) | 9,9 мс / 6,9 мс |

Що каже експорт усіх типів (тест пише файл у `%TEMP%\tapir-spike-all-dtos.ts` і
`…-unified.ts`; у комітах їх немає):

- **`#[serde(default)]` → `?:`.** `StreamInfo` (10 полів), `RecordingSettings` (12),
  `Profile` (10), `PlayerSession` (7), `UiSettings` (3), `ScheduledRecording` (3),
  `WishlistEntry` (2), `UnsupportedCodec`, `ScheduleResult` — усі поля з `default`
  стали необов'язковими ключами. Ручний `tauri.ts` тримає їх обов'язковими, і Rust
  **завжди** їх серіалізує.
- **Фази.** `GlobalSettings` розбито на `GlobalSettings_Serialize` (усі поля обов'язкові —
  збігається з ручним) і `GlobalSettings_Deserialize` (усі `?:`); у крок 3b це підтвердилося
  в позиціях команд: `getSettings` повертає `_Serialize`, `saveSettings` бере `_Deserialize`.
  Але `Profile` і `StreamInfo` — з такими самими `default` — на дві форми **не** розбито,
  і `getStreams` повертає `StreamInfo[]` з `?:`-ключами. Чому одні типи розбиваються, а
  інші зливаються в одну форму, спайк не з'ясував (гіпотеза: розбиття провокує лише
  фазово-специфічне поле — тут `deserialize_with` з override; не перевірено в
  `specta-serde`).
- **Unified-режим** (`disable_serde_phases()`) робить `?:` скрізь, включно з
  `GlobalSettings` — гірше для читача результатів.
- `f32` → `number | null` у `ReconnectConfig.backoffMultiplier` і `PlayerSession.volume`.
- `UiSettings.streamSort?: string` — ручна унія `"name" | "added"` зникає (як і для
  решти `String`-полів із п. 7–9 аудиту).
- `Profile.playerSession.lastActive?: LastActive | null` і `savedTracks?: SavedTrack[]` —
  генератор показує те, чого ручний файл не описує (п. 5–6 аудиту).

### Крок 4 — генерація, `cargo test`, `clippy`, і чому тестовий бінарник не запускався

Шлях експорту: **не** `#[cfg(debug_assertions)]` у `run()` (заборонено запускати
застосунок), а тест. Перша версія — `#[test]` у lib (`src/bindings_export.rs`):
компілюється, але процес тестів падає **до** першого тесту:

```
process didn't exit successfully: `…\tapir_lib-cd341915db649655.exe export_bindings --nocapture`
(exit code: 0xc0000139, STATUS_ENTRYPOINT_NOT_FOUND)
```

Діагноз (усе відтворювано скриптами; PE-таблиці читав власний парсер):

1. Тестовий exe з основного дерева (`develop`, 2026-09-04) запускається і **не імпортує**
   нічого з `user32`/`comctl32`/`dwmapi`: лінкер викинув невикористаний Wry-рантайм.
   Спайковий тестовий exe імпортує ~150 нових символів, серед них
   `comctl32!TaskDialogIndirect` — бо `Builder::<tauri::Wry>` + `collect_commands!`
   (обгортка над `tauri::generate_handler!` [Дж 10]) роблять Wry досяжним із тесту.
2. `C:\Windows\System32\comctl32.dll` (119 експортів) **не має** `TaskDialogIndirect`; він є
   лише в ComCtl32 v6 у WinSxS (`…common-controls_…_6.0.26100.*`). `rfd` каже прямо: «only
   provided by ComCtl32.dll v6 but Windows use v5 by default» [Дж 29].
3. Маніфест Common-Controls v6 tauri-build вшиває через `tauri-winres` → `embed-resource`,
   а той друкує `cargo:rustc-link-arg-bins=<OUT_DIR>/resource.lib` — **лише для `bin`-цілей**
   [Дж 28]. У `tapir.exe` рядок `Common-Controls` є, в обох тестових exe — ні.

Обхід у `build.rs`: `println!("cargo:rustc-link-arg-tests={out_dir}/resource.lib")`. Для
lib-`#[test]` cargo його **відкидає**:

```
error: invalid instruction `cargo:rustc-link-arg-tests` from build script of `tapir v0.1.0 (…)`
The package tapir v0.1.0 (…) does not have a test target.
```

Тож експорт живе в `[[test]]`-цілі `src-tauri/tests/export_bindings.rs`, а
`bindings_export` став `pub mod` (у lib він мертвий, але публічний, тому без попереджень).
Побічний ефект `[[test]]`-цілі: `cargo test --test export_bindings` збирає й `tapir.exe`
(cargo будує `bin`-цілі для інтеграційних тестів); одного разу збірка впала на
`failed to remove file …\target\debug\tapir.exe` (тимчасовий лок, повтор пройшов).

Ворота на стані спайку: `cargo test` — 551 lib-тестів + 2 інтеграційні + doc; `cargo clippy
--all-targets` (`all = "deny"`) — **0 попереджень**; `pnpm test` — 99 файлів / 1187 тестів
(з них 6 нових); `pnpm typecheck` — чисто (4,4 с); `pnpm lint` — чисто (4,0 с).

### Крок 5 — згенеровані типи проти ручних (для трьох команд)

| Тип | Збіг | Розбіжність |
|---|---|---|
| `StreamStatus` | 10/10 полів, імена, `\| null` там само; doc-коментарі полів перенесено як JSDoc | `bytesRecorded`, `sessionId` — `number` **лише** з `dangerously_cast_bigints_to_number()`; без нього експорт зупиняється (перша зупинка була на `PlayerStatus.positionMs`, дослівно: «`Specta forbids exporting BigInt-style types … See https://docs.rs/specta-typescript/latest/specta_typescript/struct.Error.html#bigint-forbidden`») |
| `StreamState` | 5 варіантів | ручний має шосте `"stopped"` (п. 3 аудиту) |
| `TrackInfo` | 5/5 | — |
| `AppInfo` | 2/2 | — |
| `PlaybackState`, `PlaybackSource` | ідентичні, включно з `{ type: "stream"; streamId }` | — |
| `PlayerStatus` | 4/5 | `volume: number \| null` проти ручного `number` — `pnpm typecheck` дослівно: `src/lib/tauri.ts(344,3): error TS2322: Type 'import("…/bindings").PlayerStatus' is not assignable to type 'import("…/tauri").PlayerStatus'. Types of property 'volume' are incompatible. Type 'number \| null' is not assignable to type 'number'.` Виправлено per-field `#[specta(type = specta_typescript::Number)]` (шлях 4 з поради specta [Дж 23]) |

### Крок 6 — тести з `vi.mock("@tauri-apps/api/core")`

`src/lib/bindings.test.ts` мокає `@tauri-apps/api/core` тією ж формою, що
`tauri.profile.test.ts`, і викликає `commands.*`/`events.*` напряму. **6/6 зелених**:
мок перехоплює, бо `bindings.ts` імпортує `invoke` з `@tauri-apps/api/core` (рядок 4
згенерованого файлу). Перевірено й контракт обгортки: `Err(String)` з Rust → `{ status:
"error", error }`; `Error`-екземпляр → **rethrow**.

Три обгортки в `tauri.ts` (`getAppInfo`, `getStreamStatus`, `getPlayerStatus`) переведено на
`commands.*` із розгортанням `{ status }` у reject-рядок — жоден із 36 файлів із
`vi.mock("../lib/tauri")` не змінено, повний `pnpm test` зелений. Ціна на місці виклику
без обгорток: кожен `await getX()` стає `const r = await commands.getX(); if (r.status ===
"error") …` — або `ErrorHandlingMode::Throw`, який повертає сьогоднішню семантику, але
втрачає типізовану помилку (яка в Tapir і так `string`).

### Крок 7 — час експорту

| Обсяг | `collect` (побудова `Builder`) | Разом |
|---|---|---|
| 3 команди + 1 подія (7 типів) | 0,25–0,29 мс | **2,4–3,2 мс** (4 прогони) |
| 6 команд + 1 подія | 0,68 мс | 7,6 мс |
| 28 типів `profile.rs`/`settings.rs` | — | 9,9 мс (phased) / 6,9 мс (unified) |

Екстраполяція на 85 команд і 29 подій — десятки мілісекунд; на тлі компіляції в `just dev`
непомітно. Окремий крок потрібен не через час, а через безумовний запис у `src/`.

## Оцінка повної міграції

Припущення: один розробник; тонкі обгортки в `tauri.ts` **лишаються** (сигнатури не
змінюються, 36 мок-файлів не чіпаються); рішення «`number` для 64-бітних» ухвалено як
глобальний cast; `tauri-specta` не оновлюється посеред роботи; NVDA-прогін не потрібен
(видима поверхня не змінюється).

| Шар | Робота | Дні |
|---|---|---|
| Rust: анотації | 85 × `#[specta::specta]`; `Type` на ~60 DTO; `Event` на 29 подій, з них ~5 newtype-обгорток (`()`, `&str`, `Vec<String>`) і винесення локальної структури з `engine.rs`; `collect_commands!` замість `generate_handler!` | 1–1,5 |
| Rust: блокери експортера | 21 BigInt-поле (1 рядок cast або 21 per-field), 3 `f32`, 1 `deserialize_with`, 4 `String`-поля, які TS звужує (`PlaybackAnnounce.kind`, `ImportProgress.status`, `RecordingStatusPayload.status`, `UiSettings.stream_sort`) → enum'и, інакше звуження зникає | 0,5 |
| **`#[serde(default)]` → `?:`** у типах-результатах (~50 полів у 9 DTO) | або фронтенд приймає `undefined` (кожен споживач `stream.bitrate`, `profile.recording`, …), або трюк на боці Rust, який змусить Serialize-форму, — спайк його не знайшов | 1–2 (найбільша невизначеність) |
| TS: команди | 85 обгорток → `commands.*` + розгортання `{ status }` | 0,5–1 |
| TS: події | `useTauriEvent<T>("name")` → `events.x.listen` (29 місць, 3 мок-файли хука) | 0,5 |
| TS: типи | ~45 інтерфейсів → re-export із `bindings.ts`; 12 знахідок аудиту закрити по дорозі | 0,5 |
| Інфраструктура | `build.rs`-маніфест (є), сторож дрейфу (`cargo test` експортує → `git diff --exit-code src/lib/bindings.ts` у CI), документи (`tech-stack.md`, `DEVELOPERS.md`, ADR) | 0,5–0,75 |
| **Разом** | | **≈ 5–7 робочих днів** |

Якщо обгортки прибирати повністю і переписувати 36 мок-файлів на `bindings` — ще 2–3 дні.

Середній шлях «лише типи» (ts-rs або specta-typescript без tauri-specta): derive на ~60
типів, експорт із `cargo test` (для ts-rs — його власні тести; Wry не згадується, тож
маніфест не потрібен — це міркування, не вимір), заміна ~45 інтерфейсів на імпорти,
сторож дрейфу; `invoke`-обгортки, події й усі моки не змінюються. Ті самі рішення про
`u64` (`TS_RS_LARGE_INT=number` у ts-rs), `f32` і `deserialize_with` (у ts-rs —
попередження, не помилка). Оцінка **≈ 2–3 дні**; спайком не перевірено, як ts-rs
рендерить `#[serde(default)]`.

Status quo з виправленням 12 знахідок: **≈ 0,5 дня**.

## Рекомендація

**«Не мігрувати, поки RC».** Підстави:

1. Зрілість: RC без відповіді про вихід (#247, 0 коментарів за 6 тижнів), два останні
   релізи без docs.rs, 14,5 місяця між rc.21 і rc.24, breaking-зміни форми типів (фази) у
   rc.24, і сам мейнтейнер сумнівається в дефолті `Result` (#166) [Дж 14–18].
2. Ціна не там, де її бачив запис: генерація за мілісекунди й моки живі, але експортер
   відкидає 21 поле, змінює `f32` і робить `?:` із `#[serde(default)]` — це переформатування
   типової поверхні фронтенду, не видалення 925 рядків [Спайк].
3. Дрейф є, але малий: 1 справжня розбіжність на 67 типів; решта — свідомі звуження, які
   генератор навпаки **прибере** (`String` замість унії літералів) [Код].

**Тригер повернення до питання** (будь-який):
- на crates.io з'являється `tauri-specta` `2.x` без `-rc` (`max_stable_version ≥ 2.0.0`) і
  docs.rs для нього зелений; або
- Tapir ловить **другу** справжню помилку дрейфу (перша — `TrackChangedPayload.ignored`),
  яка доходить до користувача.

**Третій шлях, окремо від тригера:** закрити 12 знахідок аудиту зараз (0,5 дня) і, якщо
дрейф турбує, спайкнути «лише типи» на ts-rs (1 день) — він стабільний, не залежить від
Tauri і залишає обгортки й 36 мок-файлів як є. Це не «мігрувати» в сенсі запису, тому
окремого `type: planned`-запису тут не пропоную; його варто завести лише після
тригера.

## Джерела

Усі мережеві джерела читано 2026-09-05; для GitHub-файлів указано тег.

1. crates.io API — <https://crates.io/api/v1/crates/tauri-specta>: `max_version`, `max_stable_version`, список версій із датами, edition, `rust_version`.
2. crates.io API — <https://crates.io/api/v1/crates/specta>: те саме.
3. crates.io API — <https://crates.io/api/v1/crates/specta-typescript>: те саме.
4. crates.io API — <https://crates.io/api/v1/crates/ts-rs>: те саме (`rust_version` 1.78.0).
5. `README.md` гілки `main` `specta-rs/tauri-specta` (GitHub API, 47 рядків): таблиця сумісності 2×2, посилання на docs.rs `^2.0.0-rc.21`.
6. `Cargo.toml` `specta-rs/tauri-specta` @ `v2.0.0-rc.25`: edition 2024, `[workspace.dependencies]` з пінами specta/specta-typescript, `tauri … features = ["specta"]`.
7. `src/lib.rs` `tauri-specta` @ `v2.0.0-rc.25` (документація крейта, 287 рядків): «still in beta», `cargo add …=2.0.0-rc.25`, setup із `#[cfg(debug_assertions)]`, розділи «Phase-specific types», «BigInt handling».
8. `src/lang/js_ts.rs` `tauri-specta` @ `v2.0.0-rc.25` (1104 рядки): імпорти (144–160), тіло `Result`-команд (246–300), remapper BigInt (693–706), `TYPED_ERROR_IMPL_TS` (1013–1019), `MAKE_EVENT_IMPL_TS` (1055–1072), `Channel` (969–992).
9. `src/builder.rs` `tauri-specta` @ `v2.0.0-rc.25` (385 рядків): `ErrorHandlingMode` (15–21), приклад експорту (39–48, 373–378), `error_handling`, `typed_error_impl`, `semantic_types`, `dangerously_cast_bigints_to_number`, `disable_serde_phases` (263–320).
10. `src/macros.rs` `tauri-specta` @ `v2.0.0-rc.25`: `collect_commands!` = `tauri::generate_handler!` + `specta::function::collect_functions!`.
11. `macros/src/lib.rs` `tauri-specta` @ `v2.0.0-rc.25`: derive `Event`, ім'я через `to_kebab_case()` або `#[tauri_specta(event_name = …)]`.
12. `examples/app/src/bindings.ts` `tauri-specta` @ `v2.0.0-rc.25` (115 рядків): приклад згенерованого файлу.
13. `examples/app/src-tauri/src/main.rs` і `Cargo.toml` @ `v2.0.0-rc.25`: експорт під `#[cfg(debug_assertions)]`, features `derive, typescript, javascript`, `#[serde(skip)]` на `io::Error` у `MyError`.
14. GitHub API `repos/specta-rs/tauri-specta` (`pushed_at`, `open_issues_count`, зірки), `/releases` (теги, дати, тіла нотаток rc.25, rc.24, rc.21, rc.20), `/commits` (останні 3), `/pulls?state=open` (4), `/issues?state=open` (список).
15. Issue <https://github.com/specta-rs/tauri-specta/issues/247> (GitHub API): заголовок, автор, дата, стан, 0 коментарів, тіло.
16. Issue <https://github.com/specta-rs/tauri-specta/issues/227> (GitHub API): тіло з логом docs.rs.
17. Issues <https://github.com/specta-rs/tauri-specta/issues/135> (тіло + 2 коментарі мейнтейнера `oscartbeaumont`) і <https://github.com/specta-rs/tauri-specta/issues/166> (тіло, автор — мейнтейнер).
18. docs.rs `status.json`: `/crate/tauri-specta/2.0.0-rc.25`, `…/2.0.0-rc.24`, `…/2.0.0-rc.21`, `/crate/specta/2.0.0-rc.25`, `/crate/specta-typescript/0.0.12`, `/crate/ts-rs/12.0.1`.
19. `specta/Cargo.toml` `specta-rs/specta` @ `v2.0.0-rc.25`: секція `[features]` (`chrono`, `serde_json`, `uuid`, …).
20. `specta-macros/src/type/serde.rs` (566 рядків) і `specta-macros/src/type/attr/{field,container,variant}.rs` @ `v2.0.0-rc.25`: які атрибути парсяться.
21. `specta-serde/src/validate.rs` @ `v2.0.0-rc.25` (774 рядки): `ensure_codec_override`/`unsupported_serde_custom_codec` (536–567), `skip_serializing_if` в unified-режимі (544–548), `#[serde(other)]` (652–654).
22. `specta-typescript/src/primitives.rs` @ `v2.0.0-rc.25`: рендер чисел (1505–1514).
23. `specta-typescript/src/error.rs` @ `v2.0.0-rc.25`: розділ «BigInt Forbidden» (9–40).
24. `specta-typescript/src/typescript.rs` (94 рядки), `src/exporter.rs` (1330 рядків; `export_to` 236–290), `src/semantic.rs` (документація модуля, `enable_lossless_bigints` 327–337), `src/lib.rs` @ `v2.0.0-rc.25`.
25. `specta/src/type/impls.rs` (`Option` 235–237, мапи 76–77, `PathBuf` 94–95, кортежі 33–34) і `specta/src/type/legacy_impls.rs` (`chrono` 355–362) @ `v2.0.0-rc.25`.
26. docs.rs — <https://docs.rs/specta/2.0.0-rc.25/specta/derive.Type.html> і `…/specta/index.html`: перелік атрибутів, обмеження, feature-прапорці.
27. Локальний реєстр cargo, `tauri-2.10.3`: `Cargo.toml` (`[dependencies.specta] version = "^2.0.0-rc.16"`, feature `specta = ["dep:specta"]`), `src/lib.rs` (рядок 38; `FunctionArg`-impl'и 1104–1136), `src/ipc/channel.rs` (54–57).
28. Локальний реєстр cargo: `tauri-build-2.5.6/src/lib.rs` (218–258, 596–660) і `src/windows-app-manifest.xml`; `tauri-winres-0.3.5/src/lib.rs` (523–538); `embed-resource-3.0.8/src/lib.rs` (441–450: `rustc-link-arg-bins`; 490–501: `compile_for_tests`).
29. Локальний реєстр cargo: `rfd-0.16.0/src/lib.rs` (87–102) — `TaskDialogIndirect` лише в ComCtl32 v6.
30. `README.md`, `ts-rs/Cargo.toml`, `CHANGELOG.md`, `ts-rs/src/lib.rs` `Aleph-Alpha/ts-rs` @ `v12.0.0`; GitHub API `repos/Aleph-Alpha/ts-rs` (`pushed_at` 2026-08-31, 30 відкритих, 1869 зірок) і `/tags`.
31. GitHub API `repos/specta-rs/specta` (`pushed_at` 2026-09-01, 11 відкритих, 637 зірок) і `/tags`.
32. Локальна машина: таблиця експортів `C:\Windows\System32\comctl32.dll` і вміст `C:\Windows\WinSxS` (папки `…common-controls_6595b64144ccf1df_6.0.26100.*`); таблиці імпортів тестових exe основного дерева (`tapir_lib-1a55c2fc6f226e8f.exe`, 2026-09-04) і спайку (`tapir_lib-cd341915db649655.exe`); рядок `Common-Controls` у `target/debug/tapir.exe`.

Код спайку: `src-tauri/src/bindings_export.rs`, `src-tauri/tests/export_bindings.rs`,
`src-tauri/build.rs`, `src/lib/bindings.ts`, `src/lib/bindings.test.ts`, правки в
`src-tauri/src/{commands/*,player/engine.rs,stream/manager.rs,profile.rs,settings.rs,errors.rs}`
і три обгортки в `src/lib/tauri.ts` — усе на гілці `spike/tauri-specta`.
