---
slug: tauri-ts-type-drift
title: "Дрейф ручних типів tauri.ts проти Rust: track-changed із плеєра без ignored і ще 11 розбіжностей"
summary: "Один `TrackChangedPayload`; власник — `player_owns_track_line` за `Recording`, не `is_active`; терпимість десеріалізатора перевіряти, не оголошувати."
priority: P2
type: planned
status: done
effort: M
kind: bug
target: 0.1.0
updated: 2026-09-07
completed: 2026-09-07
a11y: false
depends_on: [tauri-specta-bindings]
blocks: [ts-rs-drift-guard]
touches:
  - src/lib/tauri.ts
  - src/App.tsx
  - src/stores/streams.ts
  - src/lib/recordingAnnounce.ts
  - src/components/profile/ProfileRecordingTab.tsx
  - src-tauri/src/player/engine.rs
  - src-tauri/src/stream/manager.rs
  - src-tauri/src/profile.rs
  - src-tauri/src/browser/types.rs
  - src-tauri/src/scheduler/timer.rs
  - src-tauri/src/playback_control.rs
  - src-tauri/src/commands/stream_io_commands.rs
gates: [cargo test, cargo clippy --all-targets, pnpm test, pnpm vite:build, pnpm typecheck]
notes:
  - "Знахідка дослідження tauri-specta-bindings (2026-09-05): аудит 67 типів tauri.ts проти Rust, поле в поле. Повна таблиця з номерами рядків станом на 869154c — docs/notes/tauri-specta-bindings.md, розділ «DTO: ручний файл проти Rust»."
  - "Дослідження 2026-09-06: нотатка docs/notes/tauri-ts-type-drift.md — усі 12 рядків перевірено на 4eece78 (11 тримаються, рядок 2 звузився з обох боків і тепер читається), статичний вердикт по рядку 1 з дзеркалом у scratchpad, першоджерела serde/serde_json/tauri за версіями Cargo.lock, факти про ts-rs 12."
  - "Grooming 2026-09-06, 13 питань, усі рекомендації прийнято: «ігнорується» — факт про запис; плеєр мовчить, поки менеджер у Recording; позначка належить трекові; album знято; два словники RecordingStatus/StreamState; enum'и для чотирьох String-полів; сторож дрейфу — окремий P3 ts-rs-drift-guard. Без ADR: правило власника відкочується одним предикатом. Словник CONTEXT.md доповнено трьома реченнями того ж дня."
---

# Дрейф ручних типів tauri.ts проти Rust: track-changed із плеєра без ignored і ще 11 розбіжностей

> **Контекст:** знахідка дослідження
> [tauri-specta-bindings](p3-tauri-specta-bindings.md) (2026-09-05). Міграцію на
> генератор відхилено, поки крейт у RC, але аудит ручних типів залишив перелік
> розбіжностей, і одна з них — жива вада. Дослідження 2026-09-06 перевірило всі рядки
> на HEAD і дало статичний вердикт по ваді; grooming того ж дня закрив обидва відкриті
> питання. Читати першим: [нотатку дослідження](../../notes/tauri-ts-type-drift.md)
> (розділи B.5 і «Що це означає для grooming»), потім розділ «Рішення» нижче.

## Опис

Подію `track-changed` шлють два емітери з різними тілами. Менеджер запису
([manager.rs](../../../src-tauri/src/stream/manager.rs)) кладе в неї `ignored: bool` —
кваліфікатор «ігнорується», з якого `StreamItem` збирає живий рядок треку. Плеєр
([engine.rs](../../../src-tauri/src/player/engine.rs)) шле локальну структуру без цього
поля. TS-тип `TrackChangedPayload` у [tauri.ts](../../../src/lib/tauri.ts) описує поле як
обов'язкове, а `handleTrackChanged` в [App.tsx](../../../src/App.tsx) збирає
`currentTrack` цілком із події. Коли потік одночасно записується і грає, обидва емітери
читають метадані ефіру кожен на своєму з'єднанні, тож порядок двох подій на одну межу
треку задає мережа. Кваліфікатор стоїть у рядку тоді й лише тоді, коли останнім
озвався менеджер: порядок «менеджер → плеєр» стирає його до наступного треку, порядок
«плеєр → менеджер» показує із запізненням. Це один тихий перехід, не мерехтіння; для
NVDA — нечутна зміна тексту рядка (нотатка, B.5, з дзеркалом обох порядків).

Решта одинадцять — звуження, приховані `null` і латентні пастки. Жодна сьогодні не
ламає рантайм, але кожна означає, що `tauri.ts` описує не те, що шле Rust. Стан на
`4eece78` (нотатка, розділ A): усі тримаються, рядок 2 звузився з обох боків до
`FailureReason` і тепер читається через `??`, тож поведінково нешкідливий.

| # | Тип у `tauri.ts` | Rust | Клас |
|---|---|---|---|
| 2 | `RecordingStatusPayload.error?: FailureReason` | `Option<FailureReason>` без `skip_serializing_if` — завжди є ключ, `null` або причина | `?:` замість `\| null` |
| 3 | `StreamState` має `"stopped"` | enum `StreamState` його не має; `"stopped"` існує лише як рядок у `RecordingStatusPayload.status` | одна унія на два словники |
| 4 | `RecordingStatusPayload.status: StreamState` | `status: String` | звуження |
| 5 | `Profile.playerSession` | Rust `PlayerSession` має ще `last_active` | TS не описує поле |
| 6 | `Profile.savedTracks: unknown[]` | `Vec<SavedTrack>` | розхлябаність |
| 7 | `UiSettings.streamSort: "name" \| "added"` | `stream_sort: String` (рядок навмисно, є коментар) | звуження |
| 8 | `PlaybackAnnounce.kind` — унія з 5 літералів | `kind: String` | звуження |
| 9 | `ImportProgressPayload.status` — унія | `status: String` | звуження |
| 10 | `ScheduledCompletedPayload.status` — 3 варіанти | `ScheduleResultStatus` — 5 | неповна унія |
| 11 | `FilterItem`, `BrowserFilters` | структури без `rename_all` ([browser/types.rs](../../../src-tauri/src/browser/types.rs)); збіг лише тому, що всі ключі однослівні | латентна: перше двослівне поле зламає TS мовчки |
| 12 | `volumeStepPercent`, `days`, `SearchParams.*`, `RecordingSettings.*` — `number` | `u8` / `Vec<u8>` / `u32` | від'ємне чи дробове відкине serde на `invoke`, а не клампне |

Побічна знахідка нотатки (B.1): обидва емітери кличуть `notify_track_change`, тож при
одночасному записі й відтворенні другий тост на той самий трек або гаситься тротлом
3 с, або показується. Рішення Q4 закриває це тим самим предикатом.

## Рішення

Grooming 2026-09-06, тринадцять питань. Факти — у [нотатці](../../notes/tauri-ts-type-drift.md),
розділи в дужках.

1. **«Ігнорується» — факт про запис, не про ефір.** Словник уже казав це двома
   реченнями («не зберігати цей трек окремим файлом»; «збіг перевіряється лише поки потік
   записується»). Варіант (а) — плеєр рахує `ignored` сам — відпав як такий, що звіряє
   з патернами потік, який лише слухають. У `CONTEXT.md` додано речення про позначку.
2. **Правило одного власника виконує плеєр на боці Rust** (варіант б): поки потік
   пишеться, рядок треку і кваліфікатор належать менеджеру, плеєр мовчить. Знання «чи
   потік пишеться» лежить у Rust; хаб-власник (г) ламає межу S, правило у фронтенді (в')
   потребує сторожа «той самий трек» (B.2, B.3, «Що це означає для grooming»).
3. **Позначка належить трекові, не станові запису.** Трек, що застав кінець запису,
   доносить її до своєї межі; наступний приходить без неї. Так уже поводиться режим
   «востаннє грав», так каже довідка («поки такий трек в ефірі»). Хвіст варіанта (б) —
   не вада; коду не потребує. Записано у `CONTEXT.md`.
4. **Предикат — лише `Recording`, не `is_active`.** У `Connecting`/`Reconnecting`
   менеджер ефіру не спостерігає, тож власник рядка — плеєр, і він говорить із
   `ignored: false`; щойно менеджер (пере)з'єднався, він на першому блоці метаданих
   забирає рядок назад. З `is_active` рядок застигав би на весь час перепідключення.
   Під предикат підпадають подія і тост `notify_track_change`; `smtc::sync_track` — ні.
   Перевірка на кожну зміну метаданих, не на старті відтворення.
5. **`album` знято** з `TrackChangedPayload` і `TrackInfo` з обох боків: на дроті воно
   завжди `""` (метадані ефіру альбому не несуть), у фронтенді його ніхто не читає.
   Спільна структура — `pub` у `stream/manager.rs`, поруч із `TrackInfo`; плеєр уже
   залежить від `stream::connection`, новий напрям залежності не з'являється.
6. **Сторожі — два Rust-тести:** форма дроту (точний набір ключів серіалізованого payload)
   і чиста функція-предикат власника з тестом на всі стани. TS-сторож не потрібен: після
   (б) у фронтенді правила злиття немає.
7. **Рядки 2, 5, 6 — лише TS, дзеркально до Rust:** `error: FailureReason | null`,
   `lastActive: "stream" | "file" | null`, повний `interface SavedTrack`. Rust не
   чіпається; `skip_serializing_if` заради типу відхилено.
8. **Рядки 3–4 — два словники, одна лінія відображення.** Подія несе *результат
   запису* (`RecordingStatus`: фази плюс `stopped`/`error`), дзеркало зберігає *стан
   потоку* (`StreamState` без `stopped`); межа — один рядок `stopped → idle` в `App.tsx`
   замість фолбеку в рендері. `Stopped` у `StreamState` (варіант 2) узаконив би стан,
   якого менеджер не зберігає; `idle` на дроті замість `stopped` (варіант 3) робив би з
   будь-якого майбутнього шляху в `idle` «зупинено». Записано у `CONTEXT.md`.
9. **Рядки 7–9 — enum'и в Rust.** `PlaybackAnnounce.kind` і `ImportProgressPayload.status`
   лише серіалізуються, споживачі гілкуються — enum без застережень. `stream_sort`
   десеріалізується з диска: страх коментаря в `profile.rs` чинний, але лікується
   терпимим `deserialize_with` (невідоме → `Name`) за прецедентом `deserialize_log_level`,
   а не типом `String`.
10. **Рядок 10 — Rust звужується:** окремий enum для payload `scheduled-completed`
    (`Completed | StartedLate | StoppedByUser`), бо `match` у `timer.rs` уже розбив
    результати на три події; новий варіант `ScheduleResultStatus` тоді ламає компіляцію,
    а не тихо їде в чужу подію.
11. **Рядок 12 — `step={1}` на три поля `reconnect`**, єдиний досяжний шлях дробового
    (react-stately без `step` клампить, не округлює). Від'ємне з інтерфейсу недосяжне.
    Округлення в Rust відхилено як те саме «клампне», проти якого запис написаний.
12. **Сторож дрейфу ширший за один тип — окремий P3** [ts-rs-drift-guard](../p3-ts-rs-drift-guard.md):
    три підстави відмови від `tauri-specta` для ts-rs 12 не тримаються, а дванадцять
    розбіжностей за місяць кажуть, що тригер «друга помилка дрейфу» фактично спрацював.
13. **Без ADR.** Правило власника відкочується правкою одного `matches!`, тож умова
    «важко відкотити» не виконується. Живе doc-коментарем на функції-предикаті з
    посиланням сюди; доменні факти — у словнику.

## Критерії готовності

- [x] `docs/help/` — запис видимої поведінки не змінює: кваліфікатор «ігнорується» в
      рядку вже описаний як «поки такий трек в ефірі», і після рішення 3 це лишається
      правдою
- [x] Рядок 1: статичний вердикт нотатки (B.5, дзеркало обох порядків) прийнято як
      відтворення; живого прогону з ефіром запис не вимагає
- [x] Обидва емітери `track-changed` шлють одну `pub struct TrackChangedPayload` зі
      `stream/manager.rs`: `stream_id`, `artist`, `title`, `ignored: bool`; поля `album`
      немає ні в ній, ні в `TrackInfo`, ні в TS-типах, ні у фікстурах тестів
- [x] Плеєр емітить `track-changed` і кличе `notify_track_change` лише коли статус потоку
      в менеджері **не** `Recording` (у `Connecting`, `Reconnecting` і без запису —
      емітить з `ignored: false`); `smtc::sync_track` під предикат не підпадає; перевірка
      на кожну зміну метаданих
- [x] Предикат — чиста функція з doc-коментарем (чому `Recording`, а не `is_active`;
      посилання на цей запис) і тестом на всі варіанти `StreamState` та відсутній статус
- [x] Тест форми дроту: серіалізований `TrackChangedPayload` має рівно ключі `streamId`,
      `artist`, `title`, `ignored`
- [x] `TrackChangedPayload` і `TrackInfo` у TS збігаються зі структурами поле в поле
- [x] Рядки 3–4: Rust `RecordingStatus { Connecting, Recording, Reconnecting, Stopped, Error }`
      (lowercase, лише `Serialize`) замість `status: String` і `TaskOutcome::status()`; TS
      `RecordingStatus` для події, `StreamState` без `"stopped"`; дзеркало відображає
      `stopped → idle` одним рядком в `App.tsx`; `recordingAnnounce` гілкується за
      `RecordingStatus`; `streamState.ts` без змін
- [x] Рядки 7–9: `StreamSort { Name, Added }` з терпимим `deserialize_with` (невідоме →
      `Name`), коментар у `profile.rs` переписано під нову причину; `PlaybackAnnounce.kind`
      і `ImportProgressPayload.status` — enum'и lowercase; TS-унії без змін
- [x] Рядок 10: окремий enum для payload `scheduled-completed`
      (`Completed | StartedLate | StoppedByUser`, camelCase); TS без змін
- [x] Рядки 2, 5, 6 — лише TS: `error: FailureReason | null`,
      `PlayerSession.lastActive: "stream" | "file" | null`, `interface SavedTrack` з
      усіма полями замість `unknown[]`
- [x] Рядок 11: `#[serde(rename_all = "camelCase")]` на `FilterItem` і `BrowserFilters`,
      навіть якщо сьогодні всі ключі однослівні
- [x] Рядок 12: `step={1}` на `reconnect.maxRetries`, `retryIntervalSecs`,
      `maxIntervalSecs` у `ProfileRecordingTab.tsx`; коментар біля `RecordingSettings` і
      `UiSettings` у `tauri.ts`, що цілі поля їдуть як JSON-цілі і serde інше відкидає
      — див. відхилення 1
- [x] Запис [ts-rs-drift-guard](../p3-ts-rs-drift-guard.md) заведено з посиланням на
      розділ D нотатки
- [x] Ворота з `gates:` зелені (локально; на CI — у PR)

## Відхилення від запису

Два, обидва свідомі й обидва знайдені code-review'ом.

1. **Коментар про цілі числа стоїть біля `GlobalSettings`, не `UiSettings`.** Критерій
   називає `UiSettings`, але жодного числового поля там немає: `volumeStepPercent`, який
   рядок 12 і перелічує, живе в `GlobalSettings`. Коментар пішов туди, де числа справді
   є (`RecordingSettings`, `GlobalSettings.volumeStepPercent`, `ScheduledRecording.days`,
   `SearchParams`); у `UiSettings` він був би неправдою. Сам критерій, схоже, назвав
   `UiSettings` замість `GlobalSettings` помилково.
2. **Зачеплено `docs/data-models.md`, якого немає в `touches:`.** Документ цитує
   `TrackChangedPayload`, `RecordingStatusPayload` і `TrackInfo` поле в поле, тож після
   цієї роботи почав би брехати. Копії полагоджено, а не знято: знімати їх — робота
   запису [data-models-doc-drift](p2-data-models-doc-drift.md), який цей борг і веде.
   У щойно виправленому фрагменті Rust `TrackInfo` заразом дописано `pub ignored: bool` —
   дрейф, що був там до цієї роботи, у рядку, який усе одно правився.

## Спадок

Подію `track-changed` шлють два емітери, і до цього запису вони сперечались: кваліфікатор
«ігнорується» стояв у рядку рівно тоді, коли останнім озвався менеджер, а порядок задавала
мережа — обидва читали ефір на **своєму** з'єднанні. Тепер тіло одне (`pub struct
TrackChangedPayload` у `stream/manager.rs`), а власника називає предикат
`player_owns_track_line`: поки потік у `Recording`, рядок і тост належать менеджеру, плеєр
мовчить. Предикат дивиться саме на `Recording`, **не** на `is_active`: у
`Connecting`/`Reconnecting` менеджер ефіру не спостерігає, тож там говорить плеєр, — з
`is_active` рядок застигав би на весь час перепідключення. `smtc::sync_track` лишився поза
правилом. Решта одинадцять розбіжностей закриті типами: `RecordingStatus` (результат запису, зі
`stopped`) відділено від `StreamState` (стан потоку, без нього) — межа тепер один рядок
відображення в `App.tsx`, а не фолбек у рендері; чотири `String`-поля стали enum'ами;
`scheduled-completed` дістав власний перелік із трьох варіантів, тож шостий
`ScheduleResultStatus` ламатиме збірку, а не тихо їхатиме в чужу подію. **Урок — терпимість
треба перевіряти, а не оголошувати:** `deserialize_stream_sort`, написаний за зразком
`deserialize_log_level`, читав `Option<String>` і на числі чи об'єкті все одно завалював би
профіль цілком — саме ту відмову, проти якої поле й тримали рядком; знайшов це code-review, не
автор. Ту саму діру в `deserialize_log_level`, з якого прецедент і брали, закрито одразу слідом
— обидва тепер читають будь-яке JSON-значення, і це були єдині два власні десеріалізатори в
дереві. Спадок: два відхилення записані в самому записі (коментар рядка 12 пішов у
`GlobalSettings`, бо в `UiSettings` чисел немає; `docs/data-models.md` полагоджено поза
`touches:`, бо він цитує змінені payload'и — знімати ті копії лишається роботою
[data-models-doc-drift](p2-data-models-doc-drift.md)), і хвіст
[ts-rs-drift-guard](../p3-ts-rs-drift-guard.md): дванадцять розбіжностей за місяць кажуть, що
дрейф — постійна ціна, а не разова подія

## Документи

- [Нотатка дослідження 2026-09-06](../../notes/tauri-ts-type-drift.md) — перевірка 12 рядків
  на `4eece78`, статичний вердикт по рядку 1, першоджерела serde/serde_json/tauri,
  факти про ts-rs 12
- [Нотатка дослідження 2026-09-05](../../notes/tauri-specta-bindings.md) — початкова
  таблиця, номери рядків станом на `869154c`
- [CONTEXT.md](../../../CONTEXT.md) — «Вішліст і Ігнор-лист» (позначка належить трекові),
  «Запис» (результат запису проти стану потоку)
- [tauri.ts](../../../src/lib/tauri.ts), [App.tsx](../../../src/App.tsx),
  [StreamItem.tsx](../../../src/components/streams/StreamItem.tsx) — споживачі
- [engine.rs](../../../src-tauri/src/player/engine.rs),
  [manager.rs](../../../src-tauri/src/stream/manager.rs),
  [browser/types.rs](../../../src-tauri/src/browser/types.rs) — емітери й структури
- [ADR 2026-08-31: видимий носій](../../decisions/2026-08-31-visible-carrier-for-announced-facts.md)
  — чому кваліфікатор мусить стояти в самому рядку
- [ADR 2026-08-31: носії для подій станції](../../decisions/2026-08-31-carriers-for-station-events.md)
  — §3, §4: позначка на місці не переживає наступної події
