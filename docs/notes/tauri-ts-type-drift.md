# Дрейф `tauri.ts` проти Rust: перевірка на HEAD і першоджерела

> Дослідницька нотатка до запису беклогу
> [p2-tauri-ts-type-drift](../backlog/done/p2-tauri-ts-type-drift.md). Дата: 2026-09-06.
> HEAD `4eece78` (`develop`). Попередня нотатка, з якої взято 12 рядків:
> [tauri-specta-bindings](tauri-specta-bindings.md), пін `869154c`.
> Версії з `Cargo.lock` / `node_modules`: Tauri 2.10.3, tauri-macros 2.5.5,
> `@tauri-apps/api` 2.10.1, serde 1.0.228 (ядро — `serde_core` 1.0.228, derive —
> `serde_derive` 1.0.228), serde_json 1.0.149, `@react-stately/numberfield` 3.11.0;
> Node 26.8.1 для дзеркала в scratchpad.
>
> Три роди тверджень позначено явно: **[Дж N]** — першоджерело (номер у списку
> «Джерела» наприкінці), **[Код]** — прочитано в коді Tapir на `4eece78`, з `file:line`,
> **[Дзеркало]** — прогін скрипта в scratchpad, який дослівно повторює три функції
> Tapir (не імпортує їх) і згодовує їм точний JSON обох емітерів.

## Коротко (TL;DR)

- З 12 рядків 11 тримаються без змін; **рядок 2 змінився**: `RecordingStatusPayload.error`
  тепер `error?: FailureReason` проти Rust `Option<FailureReason>` (коміт `890df92`),
  і поле відтепер **читають** (`recordingAnnounce.ts:52`) — але через `??`, тож
  `null` і `undefined` поводяться однаково. Номери рядків з'їхали: `manager.rs` +53,
  `tauri.ts` +11; `engine.rs`, `profile.rs`, `browser/types.rs` не мінялись [Код].
- **Рядок 1 живий, і вердикт статичний:** кваліфікатор «ігнорується» стоїть у рядку
  тоді й лише тоді, коли *останній* `track-changed` для потоку прийшов від менеджера.
  Обидва емітери читають ICY-метадані кожен на **своєму** HTTP-з'єднанні, тож порядок
  недетермінований. Порядок «менеджер → плеєр» стирає кваліфікатор до наступного
  треку; «плеєр → менеджер» показує його із запізненням. Це не мерехтіння, а один
  перехід [Код, Дзеркало].
- Плеєр **може** порахувати `ignored` сам (варіант а): `AppHandle` у писаря →
  `AppState.active_profile` + `matcher::check_track` — усе `pub`, рівно ті 12 рядків, що
  в менеджері. І **може** знати, чи потік пишеться (варіант б):
  `AppState.stream_manager.read().await.get_status(id)`. Сьогодні писар плеєра не
  торкається `AppState` взагалі [Код].
- Serde: `Option::None` → `null` завжди, поки нема `skip_serializing_if` [Дж 1, 4, 5];
  `-1` у `u8` → `invalid value: integer \`-1\`, expected u8`, `1.5` → `invalid type:
  floating point \`1.5\`, expected u8`; Tauri відкидає аргумент **до** тіла команди, і
  промис `invoke` відхиляється рядком `invalid args \`settings\` for command
  \`save_settings\`: …` [Дж 6–11]. З інтерфейсу від'ємне недосяжне (усі `minValue ≥ 0`),
  дробове досяжне лише в трьох полях `reconnect` без `step` [Код, Дж 12].
- Чотири `String`-поля (рядки 4, 7–9) шлють лише однослівні lowercase-значення, кожне
  покрите TS-унією; підняти до enum з `rename_all = "lowercase"` можна без зміни дроту.
  Лише `stream_sort` десеріалізується з диска — єдиний, де страх коментаря реальний, а
  `#[serde(other)]` тут не працює (лише для tagged-enum) [Дж 13].
- ts-rs `12.0.1` (2026-01-31), стабільна лінія; `Option<T>` → `T | null`; `?:` дає
  `#[ts(optional)]` або пара `default` + `skip_serializing_if` — сам `#[serde(default)]`
  поля **не** робить необов'язковим (на відміну від specta); `u64` → `bigint`, перемикач
  `TS_RS_LARGE_INT=number`; `usize` → `number`; `deserialize_with` — попередження, не
  помилка [Дж 14–21].

## Питання (чекліст запису)

| # | Питання / критерій із запису | Відповідь | Де в нотатці |
|---|---|---|---|
| В1 | Хто рахує `ignored` для треку з плеєра | Сьогодні ніхто. Обидві перевірки (список ігнорування, чи пишеться потік) доступні писареві плеєра через `AppHandle` тими самими викликами, що вже стоять у менеджері й у `notify_track_change` | B.2, B.3, «Що це означає для grooming» |
| В2 | Чи потрібен сторож дрейфу ширший за один тип | Факти про ts-rs 12: що він дає і чого не дає; рішення поза цією нотаткою | D |
| К1 | `docs/help/` не змінюється | Так: кваліфікатор описано в `docs/help/uk/wishlist.md:32` і `en/wishlist.md:32`; запис лише повертає йому надійність | B.4 |
| К2 | Відтворити або спростувати зникнення | Статично: зникає, коли подія плеєра приходить після події менеджера; дзеркало підтверджує обидва порядки. Живе відтворення потребує потоку з ICY-назвою під ігнор-патерн і одночасних запису+відтворення | B.5 |
| К3 | Обидва емітери — один `struct` | Сьогодні два: приватний `TrackChangedPayload` у `manager.rs:136-146` і локальний у тілі функції `engine.rs:669-676` | B.1 |
| К4 | `TrackChangedPayload` у TS збігається поле в поле | Збігається з менеджером (5 полів), не з плеєром (4) | B.4 |
| К5 | Пункти 2–12 закрити одним із двох напрямів | Для кожного — виробники, споживачі, ціна обох напрямів | A, C |
| К6 | `rename_all = "camelCase"` на `FilterItem`/`BrowserFilters` | Для нинішніх однослівних ключів — тотожність; наслідок для API-десеріалізації тих самих структур описано | C.2 |
| К7 | Сторож для класу 1 | Жодного немає: ні TS-тест на `handleTrackChanged`, ні Rust-тест на емітери; шви названо | B.6 |
| К8 | Ворота зелені | Не стосується дослідження | — |

## A. Дванадцять рядків на `4eece78`

`git diff 869154c..HEAD --stat`: 124 файли; з тих, що торкаються рядків, — `manager.rs`
(191 змінених рядків), `App.tsx` (41), `StreamItem.tsx` (63), `tauri.ts` (28). Три коміти: `890df92` «make a
stream that gave up reach the interface», `206fc3d`, `4cef9fc`. `engine.rs`,
`profile.rs`, `browser/types.rs`, `playback_control.rs`, `stream_io_commands.rs`,
`scheduler/*` — без змін [Код].

| # | Rust (`4eece78`) | TS (`src/lib/tauri.ts`) | Стан | Що додалось |
|---|---|---|---|---|
| 1 | `stream/manager.rs:136-146` `struct TrackChangedPayload { stream_id, artist, title, album, ignored: bool }`, емітер `:359-370`; `player/engine.rs:669-676` локальний `struct TrackChangedPayload { stream_id, artist, title, album }`, емітер `:677-685` | `:132-139`, `ignored: boolean` (`:138`) | **тримається** | Розділ B |
| 2 | `manager.rs:128-134` `error: Option<FailureReason>` без `skip_serializing_if` | `:125-130` `error?: FailureReason` | **змінився**: був `error?: string` / `Option<String>`; тепер обидва боки — закритий перелік (`FailureReason`, `manager.rs:62-69`, `tauri.ts:41`) | Половина «`?:` замість `\| null`» лишилась; поле тепер читає `recordingAnnounce.ts:52` через `??` |
| 3 | `manager.rs:48-56` `enum StreamState { Idle, Connecting, Recording, Reconnecting, Error }`; `"stopped"` — `TaskOutcome::status()` `:85-90`, емітиться `:1037` | `:32` унія з `"stopped"` | тримається | З 2026-09-06 `"error"` теж реальний (`:71-74`) |
| 4 | `manager.rs:130` `status: String`; літерали: `"connecting"` `:665`, `"reconnecting"` `:687, :1027`, `"recording"` `:852`, `outcome.status()` `:1037` ∈ {`stopped`, `error`} | `:127` `status: StreamState` | тримається | `"idle"` не емітиться ніколи |
| 5 | `profile.rs:337-359`, `last_active: Option<LastActive>` `:346-347`; enum `:308-313` (`"stream"`/`"file"`) | `:806-813` без `lastActive` | тримається | У `src/` жодного читача `lastActive` |
| 6 | `profile.rs:395-410` `SavedTrack`, 12 полів | `:814` `savedTracks: unknown[]` | тримається | У `src/` жодного індексування |
| 7 | `profile.rs:258-259` `stream_sort: String`, коментар `:254-257`, дефолт `:266` | `:670` `"name" \| "added"` | тримається | — |
| 8 | `playback_control.rs:16-22` `kind: String` | `:304` унія з 5 | тримається | Усі 5 виробників — C.4 |
| 9 | `commands/stream_io_commands.rs:29-42` `ImportProgress`, `status: String // "checking" \| "ok" \| "error"` `:33` | `:893-903` `ImportProgressPayload` | тримається | Імена структур різні |
| 10 | `scheduler/timer.rs:255-263` `status: ScheduleResultStatus` — 5 варіантів (`profile.rs:117-125`) | `:780-783` 3 літерали | тримається | Бракує `"missed"`, `"skippedAlreadyRecording"`; вони йдуть іншими подіями |
| 11 | `browser/types.rs:48-53`, `:56-62` без `rename_all` | `:566-576` | тримається | Поля: `name`, `stationcount`; `countries`, `codecs`, `languages`, `tags` |
| 12 | `settings.rs:40-41` `u8`; `profile.rs:92-93` і `commands/schedule_commands.rs:38-39` `Vec<u8>`; `browser/types.rs:40,43,44` `Option<u32>`; `profile.rs:186,198,202,204` і `:148,149,151` `u32` | `:116`, `:740`, `:757`, `:554-564`, `:78-92` — `number` | тримається | — |

## B. Рядок 1: `track-changed` із плеєра без `ignored`

### B.1 Два емітери

**Менеджер запису.** `recording_task` (`manager.rs:639-1041`) відкриває **власне**
з'єднання `connection::connect(&url)` (`:667`) і читає його в окремому потоці; кожна зміна
ICY-метаданих приходить як `ReadEvent::MetadataChanged(artist, title)` (`:580-589`,
`:889`). Далі перевірка списків (`:891-910`) і три гілки: `Ignored` →
`emit_track_changed(…, true)` (`:932`) + `update_track_info(…, true)` (`:933`);
`WishlistMatch` і `Normal` → `handle_splitter_action` (`:598-637`), де кожна гілка
сплітера емітить із `ignored: false` (`:610`, `:618`, `:633`). Емітер `:359-376` кладе
`TrackChangedPayload { stream_id, artist, title, album: "", ignored }` (`:136-146`,
структура **приватна**), потім `tray::notify::notify_track_change` (`:372`) і оновлення
трею (`:375`). Той самий факт лягає й у `StreamStatus.current_track.ignored`
(`:517-523`, `TrackInfo` `:108-120`) — його віддають `get_stream_status` /
`get_all_statuses` [Код].

**Плеєр.** `play_live` (`engine.rs:592-598`) відкриває **своє** з'єднання
`connection::connect(&url)` (`:608`), читач `pump_air` у `spawn_blocking` (`:630-649`)
шле `IcyEvent::Metadata(artist, title)` у писаря (`:651-719`). Писар на кожен такий
івент: `smtc::sync_track` (`:665`), і якщо `stream_id` непорожній (`:668`; прев'ю
йдуть із порожнім — `:835-836`), емітить локальний `TrackChangedPayload` **без**
`ignored` (`:669-685`, `album: String::new()`) і кличе той самий
`notify_track_change` (`:686-688`) [Код].

**Той самий id.** Команда `play_stream` (`commands/player_commands.rs:16-41`) шукає
потік в `active_profile.streams` за `stream_id` (`:22-28`) і передає його в
`PlayerEngine::play_stream` (`engine.rs:819-826`) → `PlaybackSource::Stream { stream_id }`;
менеджер ключує `entries` тим самим `stream_info.id` (`manager.rs:216, :250`). Отже, для
потоку, який і пишеться, і грає, на кожну межу треку йдуть **дві** події з однаковим
`streamId` [Код].

**Коли кожен спрацьовує.** Обидва — на зміну метаданих у своєму з'єднанні. Емісія плеєра
прив'язана до позиції читання HTTP, не до чутного звуку: писар емітить, щойно читач віддав
метадані, до того, як байти дійдуть через кільцевий буфер 512 КіБ (`:612`) до декодера.
Отже порядок двох подій задає мережа (час старту з'єднань, буферизація сервера), не код
[Код; міркування з прочитаного].

**Побічна знахідка.** Обидва емітери кличуть `notify_track_change`
(`tray/notify.rs:191-227`); там глобальний тротл 3 с (`:184-185`, `:214-216`). Тож при
одночасному записі й відтворенні друга подія або гаситься тротлом, або дає **другий
тост** на той самий трек, якщо розрив більший за 3 с [Код].

### B.2 Список ігнорування — факти для варіанта (а)

- **Де живе.** У профілі: `StreamInfo.ignorelist` (per-stream, `tauri.ts:26`),
  `Profile.ignorelist` (глобальний) і `Profile.wishlist` — усе під
  `AppState.active_profile: Arc<RwLock<Profile>>` (`app_state.rs:19`, поле `pub`) [Код].
- **Що збігає.** `matcher::build_stream_title(artist, title)` (`wishlist/matcher.rs:48-57`:
  «artist - title», або одне з двох, або `None`) → `matcher::check_track(title,
  per_stream, global, wishlist)` (`:61-91`): пріоритет per-stream → глобальний → wishlist →
  `Normal`; збіг — регістронезалежний wildcard `*`/`?` (`:14-44`). Функція **чиста**
  [Код].
- **Видимість.** `pub mod matcher` (`wishlist/mod.rs:2`); `AppState` і його поля `pub`
  [Код].
- **Що має плеєр.** `PlayerEngine` (`engine.rs:123-128`) тримає лише сесію, гучність,
  пристрій і wake-lock; жодного профілю. Але писар має `app_writer: AppHandle`
  (`:653`) і є `tokio::spawn`-задачею, тож `app_writer.state::<AppState>()` +
  `.active_profile.read().await` — рівно те, що робить менеджер (`manager.rs:894-895`) і
  `notify_track_change` з тим самим `AppHandle` (`notify.rs:197, :202`) [Код].
- **Дві пастки, видимі з коду.** (1) Гілка `WishlistMatch` у менеджері має побічні дії —
  запис у `match_log` (`:940-953`) і `emit_wishlist_match` (`:954`); плеєр мусив би брати
  лише відповідь `Ignored`, інакше збіг подвоїться. (2) Семантика: doc-коментар
  `TrackInfo.ignored` каже «підпав під ігнор-лист **і окремим файлом не збережеться**»
  (`manager.rs:115-118`); для потоку, який лише грає, файл не пишеться незалежно від
  списку [Код].

### B.3 Чи знає плеєр, що потік пишеться — факти для варіанта (б)

- `AppState.stream_manager: Arc<RwLock<StreamManager>>` (`app_state.rs:17`, `pub`);
  `StreamManager::get_status(&id) -> Option<StreamStatus>` (`manager.rs:320-322`).
  Запис у `entries` живе від `start_recording` (`:250-258`) до фінального прибирання
  (`:1040`) — тобто покриває `Connecting`/`Recording`/`Reconnecting` і мить `Error` перед
  видаленням [Код].
- Канонічний предикат — `recording_control::is_active(&StreamState)`
  (`recording_control.rs:37-42`: `Recording | Connecting | Reconnecting`), його ж бере
  фронтенд у `streamState.ts:13` [Код].
- Перевірку довелося б робити **на кожну** зміну метаданих (як у B.2), не на старті
  відтворення: запис може початися чи скінчитись посеред відтворення [Код; міркування].

### B.4 TS-бік

- Тип: `TrackChangedPayload` `tauri.ts:132-139`, `ignored: boolean` обов'язкове.
  Збігається з менеджером поле в поле; з плеєром — ні (К4) [Код].
- Слухач один: `App.tsx:383` `useTauriEvent<TrackChangedPayload>("track-changed",
  handleTrackChanged)` через `useTauriEvent.ts:4-17` (`listen(event, e =>
  handler(e.payload))`). Інших згадок `track-changed` у `src/` немає, крім двох коментарів
  у тестах [Код].
- Обробник `App.tsx:196-206` збирає **цілий** `currentTrack` із payload (`ignored:
  payload.ignored`, `:203`) і кладе його `updateStreamStatus` (`stores/streams.ts:82-96`),
  де `{ ...current, ...status }` замінює `currentTrack` як об'єкт. Попереднє `true` не
  переживає: у новому об'єкті ключ `ignored` є, значення `undefined` [Код, Дзеркало].
- Рендер: `StreamItem.tsx:163-165` — **істинність** (`status?.currentTrack?.ignored ? …`),
  не `=== true`; той самий рядок іде і в текст сегмента, і в `aria-label`
  (`:166-170`). Інших читачів `ignored` у `src/` немає: `announce()` його не читає,
  `windowTitleLabel` — ні; тест `StreamItem.test.tsx:144` перевіряє, що `aria-label`
  дорівнює тексту [Код].
- Дзеркало наповнюється ще з `get_all_statuses` на старті (`App.tsx:118-120`) —
  один раз; періодичного звірення з менеджером немає, тож після події плеєра значення
  менеджера не повертається до наступної події [Код].
- Довідка вже описує кваліфікатор: `docs/help/uk/wishlist.md:32`, `en/wishlist.md:32`
  (К1) [Код].

### B.5 Статичний вердикт

Рядок показує «ігнорується» **тоді й лише тоді, коли останній `track-changed` для цього
`streamId` прийшов від менеджера**. Два порядки на один ігнорований трек:

| Порядок | Що видно | Коли зникає |
|---|---|---|
| A: менеджер → плеєр | кваліфікатор з'являється, потім зникає на події плеєра | зникає й **не повертається** до наступної межі треку (менеджер не емітить повторно) |
| B: плеєр → менеджер | назва без кваліфікатора, потім із ним | не зникає |

«Мерехтіння» — це порядок A, один перехід; живий регіон його не озвучує (у сегмента
треку немає оголошення), тож для NVDA це тиха зміна тексту рядка [Код].

**[Дзеркало]** `scratchpad/track-changed-race.mjs` повторює `updateStreamStatus`,
`handleTrackChanged` і вираз `trackDisplay` дослівно, згодовує точний JSON обох емітерів
(`{"streamId":"s1","artist":"Ad","title":"Jingle","album":"","ignored":true}` і той самий
без `ignored`) і друкує:

```
player payload has key `ignored`: false
A: manager→player : "Ad — Jingle (ігнорується)" -> "Ad — Jingle" | ignored = undefined | key present: true
B: player→manager : "Ad — Jingle" -> "Ad — Jingle (ігнорується)" | ignored = true
(в) manager→player: "Ad — Jingle (ігнорується)" | ignored = true
(в) player→manager: "Ad — Jingle (ігнорується)" | ignored = true
```

Останні два рядки — варіант (в) із запису у формі «`payload.ignored ?? (той самий
artist+title ? попереднє : false)`»: у дзеркалі він тримає кваліфікатор в обох порядках.

**Живе відтворення** (для К2, якщо grooming вимагатиме) потребує: станцію з ICY-назвою,
що підпадає під патерн зі списку ігнорування; одночасно запис і відтворення того самого
потоку; спостереження рядка або `$statuses.get()[id].currentTrack.ignored` через обидві
події. Швів для юніт-тесту сьогодні два: `handleTrackChanged` — замикання всередині `App`
(`App.tsx:196`), не експортоване, тож або тест через мок `@tauri-apps/api/event`
(шаблон 5 файлів, див. попередню нотатку), або винесення редʼюсера окремим модулем —
так само, як `selectRecordingAnnouncement` винесли саме через «дорікнути нічому»
(`recordingAnnounce.ts:9-12`). Фікстура — два JSON із дзеркала [Код].

### B.6 Сторожі, що вже є

- TS: `StreamItem.test.tsx:129-145` — рендер `ignored: true` дає текст і `aria-label`
  `segment_track_ignored`. Це сторож **рендера**, не події. Фікстури з `ignored: false`
  ще в 5 файлах (`useGlobalShortcuts.test.tsx:237`, `playbackAnnounce.test.ts:126,167,176`,
  `windowTitle.test.ts:10`, `StreamItem.test.tsx:110`). Тесту на `handleTrackChanged`
  або на диспетч `track-changed` немає; `App.test.tsx` не існує; `streams.test.ts` не
  торкається `currentTrack` [Код].
- Rust: жоден тест не згадує `TrackChangedPayload` чи `emit_track_changed`; тести
  `manager.rs:1043+` покривають `TaskOutcome`/`StreamStatus` [Код].

### Що це означає для grooming

Факти, не рекомендація:

- **(а) плеєр рахує сам.** Дає правильний кваліфікатор незалежно від порядку. Ціна:
  читання `active_profile` на кожну зміну метаданих у писарі (прецедент —
  `notify_track_change` робить це на ту саму подію); подвійний `check_track` на трек,
  коли потік і пишеться, і грає; треба брати лише `Ignored`, не гілку wishlist (B.2);
  для потоку, що лише грає, кваліфікатор описує запис, якого немає (B.2, doc-коментар).
  К3 закривається лише якщо структуру винести спільною (`pub`) — сьогодні обидві не
  спільні.
- **(б) плеєр мовчить, поки потік пишеться.** Один власник кваліфікатора; читання
  `stream_manager` на кожну зміну метаданих (B.3); тост `notify_track_change` теж
  перестає дублюватись. Але для потоку, що **лише** грає, плеєр далі шле подію — і вона
  мусить нести `ignored` явно (спільна структура, `false`), інакше К3/К4 лишаються
  відкритими. `smtc::sync_track` під це не підпадає — він і так лише в плеєрі.
- **(в) `ignored?: boolean` + збереження попереднього.** У дзеркалі працює для обох
  порядків **лише** з перевіркою «той самий трек» (інакше подія плеєра на новий трек
  успадкує чужий `true`). Правило переїжджає у фронтенд; дві Rust-структури лишаються
  різними (К3 не виконано) — те, що запис називає «тією самою тишею».

## C. Першоджерела

### C.1 Рядок 2: `Option<T>` → `null`, і що змінює `skip_serializing_if`

- `impl Serialize for Option<T>`: `Some(v) → serialize_some(v)`, `None → serialize_none()`
  [Дж 1: `ser/impls.rs:99-111`]. У serde_json `serialize_none → serialize_unit →
  write_null` — літерал `null` [Дж 4: `ser.rs:271-273`, `:202-206`]. Отже поле
  `error: None` без атрибутів завжди дає `"error":null` — не відсутній ключ.
- `#[serde(skip_serializing_if = "path")]`: «Call a function to determine whether to skip
  serializing this field. The given function must be callable as `fn(&T) -> bool`»
  [Дж 2]. З `Option::is_none` ключ зникає — і лише тоді TS-форма `error?:` правдива.
- Tauri емітить через serde_json: `Emitter::emit` (`lib.rs:952-956`) →
  `EmitPayload::Serialize` → `AppManager::emit` (`manager/mod.rs:532-550`) →
  `EmitArgs::new` → `serde_json::to_string(payload)?` [Дж 6: `event/mod.rs:125-132`].
- На HEAD: `RecordingStatusPayload.error: Option<FailureReason>` без атрибутів
  (`manager.rs:128-134`) проти `error?: FailureReason` (`tauri.ts:129`). Єдиний читач —
  `recordingAnnounce.ts:52` `payload.error ?? DEFAULT_FAILURE_REASON`: `??` покриває і
  `null`, тому поведінка не страждає; страждає лише тип (він виключає `null`). Форма
  `StreamStatus.error: FailureReason | null` (`tauri.ts:64`) уже правдива [Код].
- Два напрями: `error: FailureReason | null` у TS, або `#[serde(skip_serializing_if =
  "Option::is_none")]` у Rust (тоді ключа не буде і `?:` стане правдою).

### C.2 Рядок 11: `rename_all` і два однослівні структури

- `#[serde(rename_all = "...")]`: «Rename all the fields (if this is a struct) or variants
  (if this is an enum) according to the given case convention» з переліком восьми
  значень; є окремі `serialize`/`deserialize` [Дж 3].
- Реалізація: `RenameRule::apply_to_field` — `None | LowerCase | SnakeCase =>
  field.to_owned()`, `CamelCase => PascalCase.apply_to_field(field)` з першою літерою в
  нижній регістр; PascalCase збирається з розбиття по `_` [Дж 5: `case.rs:82-109`].
  Для ідентифікатора без `_` camelCase — тотожність.
- На HEAD усі ключі однослівні: `FilterItem { name, stationcount }` (`stationcount` з
  `#[serde(default)]`), `BrowserFilters { countries, codecs, languages, tags }`
  (`browser/types.rs:48-62`). `SearchParams` і `StationResult` у тому ж файлі
  `rename_all` мають (`:34`, `:7`) [Код].
- **Наслідок К6, якого запис не називає:** ті самі структури десеріалізуються з відповіді
  Radio Browser API — `get_json::<Vec<FilterItem>>("/json/countries", …)` та ін.
  (`browser/api.rs:143-146`). Сьогодні `rename_all = "camelCase"` нічого не змінює в
  обидва боки. Але перше поле з `_` (скажімо `station_count`) під camelCase
  очікуватиме від API `stationCount`, а API шле `stationcount` — саме тому
  `StationResult` тримає `#[serde(alias = …)]` на кожному такому полі
  (`types.rs:12,17,22,24,28`). Альтернатива — `rename_all(serialize = "camelCase")`
  [Дж 3, Код].

### C.3 Рядок 12: числа на `invoke`

**Шлях аргументу в Tauri 2.10.3.** Обгортка `#[tauri::command]` для кожного аргумента
генерує `CommandArg::from_command(CommandItem { name, key, message, acl })` і
`Err(err) => { resolver.invoke_error(err); return true }` — відмова **до** виклику тіла
функції [Дж 7: `wrapper.rs:471-479`, `:373-376`]. Універсальний `impl CommandArg for D:
Deserialize`: `Self::deserialize(command).map_err(|e| crate::Error::InvalidArgs(name,
arg, e).into())` [Дж 8: `ipc/command.rs:62-70`]. `CommandItem` як `Deserializer` бере
`InvokeBody::Json(v).get(key)` і віддає його десеріалізатору `serde_json::Value`
[Дж 8: `:84-105`, `:113-178`]. `InvalidArgs` друкується як
``invalid args `{1}` for command `{0}`: {2}`` [Дж 9: `error.rs:59-60`];
`InvokeError::from(crate::Error)` — `Value::String(error.to_string())` [Дж 10:
`ipc/mod.rs:249-254`]; `invoke_error` → `InvokeResponse::Err` [Дж 10: `:421-430`] → HTTP
відповідь із заголовком `Tauri-Response: error` і JSON-тілом `e.0` [Дж 10:
`protocol.rs:107-124`].

**Як це бачить JS.** `@tauri-apps/api` `invoke` — тонка обгортка над
`window.__TAURI_INTERNALS__.invoke` [Дж 11: `core.js:201-203`]. У Tauri-скрипті
`invoke` створює промис із двома колбеками; `error`-колбек робить `reject(e)` [Дж 6:
`scripts/core.js:81-112`, `:88-91`]; `ipc-protocol.js` обирає колбек за заголовком
(`'ok' ? callback : error`) і віддає розібраний JSON [Дж 6: `scripts/ipc-protocol.js:42-58`].
Отже промис відхиляється **рядком** — той самий тип, що й `Err(String)` із тіла команди.

**Що каже serde на конкретні значення.** `Value::Number(n) →
n.deserialize_any(visitor)` [Дж 4: `value/de.rs:169-180`]; `Number::deserialize_any`:
`PosInt → visit_u64`, `NegInt → visit_i64`, `Float → visit_f64` [Дж 4:
`number.rs:538-547`]. Візитор `u8` (`impl_deserialize_num!`, `de/impls.rs:413-418`)
має `int_to_uint!(i64:visit_i64)` → для `v < 0` або поза діапазоном
`Err(Error::invalid_value(Unexpected::Signed(v), &self))` [Дж 1: `:286-300`];
`uint_to_self!(u64:visit_u64)` → `try_from` → `invalid_value(Unexpected::Unsigned(v))`
[Дж 1: `:336-346`]; `visit_f64` не визначено → дефолт `Visitor::visit_f64` →
`invalid_type(Unexpected::Float(v))` [Дж 1: `de/mod.rs:1494-1499`]; `expecting` =
`stringify!(u8)` [Дж 1: `:141-143`]. Формат: serde_json `invalid_type`/`invalid_value`
→ ``invalid type: {}, expected {}`` / ``invalid value: {}, expected {}``, де
`Unexpected::Float` друкується як ``floating point `1.5` ``, цілі — ``integer `-1` ``
[Дж 4: `error.rs:440-455`, `:465-479`; Дж 1: `de/mod.rs:401-410`]. Помилка з
`Value`-десеріалізатора має `line == 0`, тож суфікса «at line … column …» немає
[Дж 4: `error.rs:405-416`, `:483-492`]. Дослівно:

| Вхід → тип | Рядок |
|---|---|
| `-1` → `u8` | ``invalid value: integer `-1`, expected u8`` |
| `1.5` → `u8` | ``invalid type: floating point `1.5`, expected u8`` |
| `300` → `u8` | ``invalid value: integer `300`, expected u8`` |
| `4294967296` → `u32` | ``invalid value: integer `4294967296`, expected u32`` (`u32`: `uint_to_self!(u64:visit_u64)`, `:428-434`) |

Повний текст відмови для `save_settings(settings: GlobalSettings)`: ``invalid args
`settings` for command `save_settings`: invalid value: integer `-1`, expected u8``.
Ім'я **поля** (`volumeStepPercent`) у ньому не з'являється: ані `serde_derive`, ані
десеріалізатор `Value` шлях до поля не додають — це висновок із прочитаного коду, не
цитата. `Vec<u8>` (`days`) — елемент за елементом за тими самими правилами;
`Option<u32>` — `Null → None`, число → ті самі правила [Дж 4: `value/de.rs:317-324`].

**Чи може інтерфейс таке надіслати.** Усі числові поля йдуть через react-aria
`NumberField`; у `@react-stately/numberfield` 3.11.0 на commit значення **клампиться**
`clamp(min, max)` якщо `step` не задано, інакше **snap-иться** `snapValueToStep` [Дж 12:
`useNumberFieldState.mjs:93-98`; те саме на вході `:21-26`]. Сайти [Код]:

| Поле (Rust тип) | Компонент | `min`/`max`/`step` | Що доходить |
|---|---|---|---|
| `volumeStepPercent` (`u8`) | `AudioTab.tsx:155-163` + власний кламп 1..10 `:158` | 1 / 10 / 1 | ціле 1..10 |
| `days` (`Vec<u8>`) | `ScheduleForm.tsx:196-210` — чекбокси за індексом `i`; `formModel.ts:63` дедуп+сортування | — | цілі 0..6 |
| `SearchParams.minBitrate` (`Option<u32>`) | `SearchForm.tsx:183-190`, `:65-66` (`> 0 ? v : undefined`) | 0 / 320 / 32 | кратне 32 або відсутнє |
| `SearchParams.offset`, `limit` | `stores/browser.ts:63-67`, `:110`, `:143`, `:172` — рахує код (`limit + 1`, `results.length`) | — | цілі |
| `skipShortTracksMs` (`u32`) | `ProfileRecordingTab.tsx:141-146`, `val * 1000` | 0 / — / 1 | ціле |
| `diskSpaceThresholdGb`, `schedulePad*` (`u32`) | `:167-173`, `:188-194`, `:203-209` | 0 / 100·30·60 / 1 | ціле |
| `reconnect.maxRetries`, `retryIntervalSecs`, `maxIntervalSecs` (`u32`) | `:225-230`, `:238-242`, `:263-267` | 0·1·1 / 10000·—·— / **без `step`** | **дробове проходить** (`2.5` клампиться, не округлюється) |
| `reconnect.backoffMultiplier` (`f32`) | `:250-255` | 1 / — / 0.1 | дробове — і має бути |
| `logMaxSizeMb` (`u32`, поза списком запису) | `GeneralTab.tsx:332-340` | 1 / 100 / 1 | ціле |

Від'ємне з інтерфейсу недосяжне (усі `minValue ≥ 0`). Дробове досяжне в трьох полях
`reconnect` без `step`. Куди йде відмова: `update_profile_settings` (`ProfileSettingsDialog.tsx:102-106`,
«Rethrow: useAutoSave toasts the error»), `save_settings` (`useSettingsAutoSave.ts:24`),
`StreamsPanel.tsx:205-206` (`addToast(String(e), "error")`) — англійський рядок serde
потрапить у тост, і NVDA його прочитає [Код]. Rust-кламп існує, але **після** serde:
`RecordingSettings::clamp_schedule_padding` (`profile.rs:239-242`),
`ReconnectConfig::clamp_max_retries` (`:172-174`) [Код].

### C.4 Рядки 4, 7–10: enum проти `String`

**Як серіалізується unit-варіант.** Представлення за замовчуванням — externally tagged,
воно «can handle … unit variants» [Дж 13]; `Serializer::serialize_unit_variant` — «Serialize
a unit variant like `E::A` in `enum E { A, B }`» [Дж 13]; serde_json реалізує його як
`serialize_str(variant)` — голий JSON-рядок [Дж 4: `ser.rs:214-221`]. `rename_all` на enum
іде через `apply_to_variant`: `LowerCase → to_ascii_lowercase`, `CamelCase → перша
літера в нижній`, `KebabCase → snake_case з `_`→`-`` [Дж 5: `case.rs:57-79`]. У Tapir так
уже працюють `StreamState` (`lowercase`), `FailureReason` (`snake_case`),
`ScheduleResultStatus` (`camelCase`), `CliFeedback` (`kebab-case` + `tag`) [Код].

| Рядок | Виробники в Rust | Значення на дроті | Споживачі в TS, що гілкуються | Чи лягає в enum без зміни дроту |
|---|---|---|---|---|
| 4 `status` | `manager.rs:665, 687, 852, 1027`, `TaskOutcome::status()` `:85-90` → `:1037` | `connecting`, `reconnecting`, `recording`, `stopped`, `error` | `recordingAnnounce.ts:46-55` (`switch`), `App.tsx:184` (`state: payload.status` у `StreamStatus`) | так, `rename_all = "lowercase"`; але це **другий** enum поряд із `StreamState` або `StreamState` + `Stopped` — стан, який менеджер ніколи не зберігає |
| 7 `stream_sort` | пише лише фронтенд (`StreamsPanel.tsx:203-205`); дефолт `"name"` `profile.rs:266` | `name`, `added` | `streams.ts:34, 47-48` (`sortBy === "added"`, фолбек `name`), `StreamsPanel.tsx:146`, `ProfileInterfaceTab.tsx:57-58` | так за формою; **але** це єдине з чотирьох полів, що десеріалізується з диска: коментар `profile.rs:254-257` пояснює `String` саме цим. `#[serde(other)]` тут не допоможе — «Only allowed on a unit variant inside of an internally tagged or adjacently tagged enum» [Дж 13]; прецедент терпимого розбору — `deserialize_log_level` (`settings.rs:49-61`) |
| 8 `kind` | `emit_announce` з `"connecting"` `playback_control.rs:293`, `"error"` `:298, :330`, `"unavailable"` `:335`, `"volume"` `shortcuts.rs:60`; `emit_resuming` `"resuming"` `:37-46` | 5 значень = TS-унія | `App.tsx:335-372` (`switch`) | так, `lowercase`; payload лише `Serialize` |
| 9 `status` | `stream_io_commands.rs:145` `"checking"`, `:152` `"ok"`/`"error"` | 3 значення = TS-унія | `ImportStreamsDialog.tsx:99, 104, 105`; результат кладеться в `RowStatus` (`:17`) | так, `lowercase`; payload лише `Serialize` |
| 10 `status` | `timer.rs:284-342`: `Completed \| StartedLate` → `scheduled-completed` (`:287`), `StoppedByUser` → те саме (`:305`), `Missed` → `scheduled-missed` (`:316`), `SkippedAlreadyRecording` → `scheduled-skipped` (`:331`) | `completed`, `startedLate`, `stoppedByUser` | `useScheduleEvents.ts:28` (`!== "stoppedByUser"` → оголошення «завершено») | уже enum; TS вужчий за Rust-тип поля, але рівний емітованій множині. Якби `missed`/`skippedAlreadyRecording` прийшли цією подією, TS озвучив би «завершено» — за `match` неможливо |

**Ціна розширення TS до `string`** (другий напрям запису), за `pnpm typecheck` [Код]:
рядок 7 — `streams.ts:47` присвоює в `StreamSort`, ламається; рядок 9 —
`ImportStreamsDialog.tsx:99` кладе `p.status` у `RowStatus`, ламається; рядок 4 —
`App.tsx:184` кладе в `StreamStatus.state: StreamState`, ламається; рядок 8 — `switch` по
`string` компілюється, втрачається лише вичерпність.

### C.5 Рядок 3: `"stopped"` у двох формах

Rust `StreamState` — п'ять варіантів без `Stopped` (`manager.rs:48-56`); `"stopped"`
народжується в `TaskOutcome::status()` (`:85-90`) як рядок події `recording-status`
(`:1037`), а стан у менеджері при цьому `Idle` (`:100-105`). TS тримає одну унію на обидві
форми (`tauri.ts:32`), і дзеркало `App.tsx:183-187` кладе `payload.status` прямо в
`StreamStatus.state` — тож `$statuses[id].state === "stopped"` у TS можливий, а в Rust
`StreamStatus.state` — ні. Хто порівнює з `"stopped"`: `recordingAnnounce.ts:49` (`case`),
`streams.test.ts:117`; `streamState.ts:13, 33` його не містять, тож рендер трактує його як
`idle` через фолбек (`StreamItem.tsx:190-199`) [Код].

### C.6 Рядки 5 і 6

- `PlayerSession.last_active: Option<LastActive>` (`profile.rs:346-347`; enum `:308-313`,
  `lowercase`). Пишуть: `playback_control.rs:147, 151, 191`, `profile.rs:388`
  (`reset_for_share`). У `src/` слово `lastActive` не трапляється; `playerSession` читають
  лише `tauri.ts` і коментар `ProfilePlaybackTab.tsx:15`. Додати
  `lastActive: "stream" | "file" | null` — зміна лише типу [Код].
- `SavedTrack` (`profile.rs:395-410`): `path, artist, title, album, station, format:
  AudioFormat, bitrate: u32, duration_ms: u64, size_bytes: u64, is_complete,
  is_wishlist_match, recorded_at`. `savedTracks` у `src/` ніде не індексується [Код].

## D. Сторож дрейфу ширший за один тип — ts-rs, лише факти

| Аспект | Факт | Джерело |
|---|---|---|
| Версія | `12.0.1`, 2026-01-31 (`12.0.0` того ж дня); `max_stable_version = 12.0.1`; `rust_version = 1.78.0`, edition 2021, не yanked; попередні `11.1.0` 2025-10-14, `11.0.1` 2025-06-05 | [Дж 14] |
| MSRV | README і docs.rs кажуть «1.88.0»; crates.io — `1.78.0` (CHANGELOG 11.0.0: «Raised MSRV to 1.78.0») — розбіжність у їхніх документах | [Дж 15, 16, 18] |
| Репозиторій | push 2026-08-31, 30 відкритих, 1869 зірок, MIT, не архівований; теги на GitHub закінчуються `v12.0.0` — тега `v12.0.1` немає (raw-файли під ним 404) | [Дж 17] |
| `Option<T>` | `T \| null` (`format!("{} \| null", …)`); `#[ts(optional)]` → `t?: T`; `#[ts(optional = nullable)]` → `t?: T \| null`; на рівні структури `#[ts(optional_fields)]` / `= nullable` (з 11.0.0; для enum — 11.1.0) | [Дж 15, 16, 18] |
| `#[serde(default)]` | Сам по собі поля необов'язковим **не** робить: `is_optional = attr.maybe_omitted && attr.has_default`, де `maybe_omitted` ставлять лише `skip_serializing`/`skip_serializing_if` («only have an effect when used together with `#[serde(default)]`»). Для ~50 полів Tapir із `#[serde(default)]` це означає «лишаються обов'язковими» — протилежно до знахідки зі specta | [Дж 19, 20, 15] |
| 64-бітні | `u64, i64, u128, i128` (+NonZero) → `cfg.large_int_type`, дефолт `"bigint"`; перемикач — env `TS_RS_LARGE_INT` (`.cargo/config.toml`) або per-field `#[ts(type = "number")]` / `#[ts(as = …)]`; `usize, isize, f32, f64, u8…u32` → `"number"` | [Дж 16: `lib.rs:1024-1039`, Дж 15] |
| Для 21 поля з попередньої нотатки | 9 `usize` — `number` без налаштувань; 12 `u64` — `TS_RS_LARGE_INT=number` або 12 атрибутів; 3 `f32` — `number`, не `number \| null` | [Дж 16; Код] |
| serde-compat (дефолтна фіча) | Підтримано: `rename`, `rename-all`, `rename-all-fields`, `tag`, `content`, `untagged`, `skip`, `skip_serializing`, `skip_serializing_if`, `flatten`, `default`. `serialize_with`/`deserialize_with` **не парсяться** → попередження «failed to parse serde attribute … ts-rs failed to parse this attribute. It will be ignored.» (вимикає фіча `no-serde-warnings`); `with` → **помилка** компіляції без `#[ts(as)]`/`#[ts(type)]` (з 9.0.0) | [Дж 15, 18, 19, 21] |
| Для Tapir | `GlobalSettings.log_level` з `deserialize_with` (`settings.rs:36-37`) — попередження, тип поля `LogLevel` лишається | [Код, Дж 21] |
| Експорт | `#[ts(export)]` «generates a test which will export the type, by default to `bindings/<name>.ts` when running `cargo test`» — **один файл на тип**; `#[ts(export_to = "…")]` відносно `TS_RS_EXPORT_DIR` (дефолт `./bindings`); програмно `TS::export`, `TS::export_all`, `TS::export_to_string`; з 8.0.0 генерує `type`, не `interface` | [Дж 15, 16, 18] |
| Сторож у CI | Першоджерела мовчать. Що дають — детермінований запис у каталог під час `cargo test` (або рядок із `export_to_string`); порівняння з закомітованим — власна конструкція проєкту, не фіча крейта. Це міркування, не цитата | [Дж 15, 16] |
| Що лишається ручним | `invoke`-обгортки, події, `useTauriEvent`, 36 мок-файлів — усе як є («лише типи»); Wry у тестах не згадується, тож маніфест-обхід із спайку tauri-specta не потрібен — міркування, не вимір | попередня нотатка |

## Джерела

Локальні крейти — з реєстру cargo (`C:\scoop\persist\rustup\.cargo\registry\src\index.crates.io-…`),
версії з `src-tauri/Cargo.lock`. Мережеві джерела читано 2026-09-06.

1. `serde_core` 1.0.228 (те, що `serde` 1.0.228 реекспортує): `src/ser/impls.rs` (99–111, `Option`), `src/de/impls.rs` (81 макрос `impl_deserialize_num!`; 136–148 `PrimitiveVisitor`/`expecting`; 286–300 `int_to_uint!`; 336–346 `uint_to_self!`; 413–418 `u8`; 428–434 `u32`), `src/de/mod.rs` (213–215, 231–233 `invalid_type`/`invalid_value`; 401–410 `Display for Unexpected`; 1394–1399, 1456–1461, 1494–1499 дефолти `Visitor`). Публічно: <https://docs.rs/serde_core/1.0.228/src/serde_core/de/impls.rs.html> (перевірено), `…/ser/impls.rs.html`, `…/de/mod.rs.html`.
2. serde.rs, Field attributes — <https://serde.rs/field-attrs.html>: `skip_serializing_if`, `default`, `deserialize_with`, `with`, `rename`, `alias`.
3. serde.rs, Container attributes — <https://serde.rs/container-attrs.html>: `rename_all` (8 значень, окремі `serialize`/`deserialize`), `rename_all_fields`, `tag`, `untagged`.
4. `serde_json` 1.0.149: `src/ser.rs` (202–206 `serialize_unit` → `write_null`; 214–221 `serialize_unit_variant` → `serialize_str`; 271–273 `serialize_none`), `src/value/de.rs` (169–180 `deserialize_number!`; 286–301 `deserialize_any`; 303–314; 317–324 `deserialize_option`), `src/number.rs` (538–547 `deserialize_any`), `src/error.rs` (399–416 `Display`; 435–455 `custom`/`invalid_type`/`invalid_value`; 465–479 `JsonUnexpected`; 483–492 `make_error`). Публічно: <https://docs.rs/serde_json/1.0.149/src/serde_json/value/de.rs.html> (перевірено), `…/number.rs.html`, `…/error.rs.html`, `…/ser.rs.html`.
5. `serde_derive` 1.0.228: `src/internals/case.rs` (57–79 `apply_to_variant`; 82–109 `apply_to_field`), `src/internals/attr.rs` (283–295 розбір `rename_all`). Публічно: <https://docs.rs/serde_derive/1.0.228/src/serde_derive/internals/case.rs.html>.
6. `tauri` 2.10.3: `src/lib.rs` (939 `trait Emitter`; 952–956 `emit`), `src/manager/mod.rs` (532–550 `emit`), `src/event/mod.rs` (117–132 `EmitArgs::new` → `serde_json::to_string`), `scripts/core.js` (81–112 `invoke`; 88–91 `reject`), `scripts/ipc-protocol.js` (22–58; 44 вибір колбека за `Tauri-Response`). Публічно: <https://github.com/tauri-apps/tauri/tree/tauri-v2.10.3/crates/tauri> (тег перевірено: `Cargo.toml` → `version = "2.10.3"`).
7. `tauri-macros` 2.5.5: `src/command/wrapper.rs` (373–376 `Err(err) => { resolver.invoke_error(err); return true }`; 471–479 `CommandArg::from_command(CommandItem {…})`). Публічно: <https://github.com/tauri-apps/tauri/blob/tauri-v2.10.3/crates/tauri-macros/src/command/wrapper.rs>.
8. `tauri` 2.10.3 `src/ipc/command.rs`: 54–59 `trait CommandArg`; 62–70 `impl … for D: Deserialize`; 84–105 `deserialize_json`; 113–178 `impl Deserializer for CommandItem`. Публічно: <https://github.com/tauri-apps/tauri/blob/tauri-v2.10.3/crates/tauri/src/ipc/command.rs>.
9. `tauri` 2.10.3 `src/error.rs`: 59–60 `InvalidArgs` з ``#[error("invalid args `{1}` for command `{0}`: {2}")]``.
10. `tauri` 2.10.3 `src/ipc/mod.rs` (224 `struct InvokeError(pub serde_json::Value)`; 229–231 `from_error`; 240–247 `From<T: Serialize>`; 249–254 `From<crate::Error>`; 409–418 `reject`; 421–430 `invoke_error`), `src/ipc/protocol.rs` (107–124: заголовок `TAURI_RESPONSE_HEADER_ERROR`, тіло `serde_json::to_vec(&e.0)`).
11. `@tauri-apps/api` 2.10.1, `node_modules/.pnpm/@tauri-apps+api@2.10.1/node_modules/@tauri-apps/api/core.js`: 201–203 `invoke` → `window.__TAURI_INTERNALS__.invoke`.
12. `@react-stately/numberfield` 3.11.0, `dist/useNumberFieldState.mjs`: 21–26 (вхідне значення), 60 `clampStep`, 93–98 (commit: `clamp` без `step`, `snapValueToStep` зі `step`).
13. serde.rs, Enum representations — <https://serde.rs/enum-representations.html> (externally tagged за замовчуванням, «can handle … unit variants»); docs.rs `serde::Serializer::serialize_unit_variant` / `serialize_none` / `serialize_some` — <https://docs.rs/serde/1.0.228/serde/trait.Serializer.html#tymethod.serialize_unit_variant>; serde.rs, Variant attributes — <https://serde.rs/variant-attrs.html> (`#[serde(other)]`: «Only allowed on a unit variant inside of an internally tagged or adjacently tagged enum»).
14. crates.io API — <https://crates.io/api/v1/crates/ts-rs>: `max_version`, `max_stable_version`, версії з датами, `rust_version`, `edition`, `yanked`.
15. docs.rs — <https://docs.rs/ts-rs/latest/ts_rs/> і <https://docs.rs/ts-rs/latest/ts_rs/trait.TS.html> (12.0.1): атрибути контейнера/поля, `optional`, `optional_fields`, `export`/`export_to`, `TS_RS_EXPORT_DIR`, `TS_RS_LARGE_INT`, перелік serde-атрибутів, попередження, MSRV 1.88.0.
16. `ts-rs/src/lib.rs` `Aleph-Alpha/ts-rs` @ `v12.0.0`: doc-коментарі `optional`/`optional_fields`, `#[ts(export)]`, `TS_RS_EXPORT_DIR`; 983 `TS_RS_LARGE_INT`; 1024–1028 `impl_primitives!` (`usize, isize, …, f32, f64 => "number"`); 1036–1039 `impl_large_integers!`.
17. GitHub API `repos/Aleph-Alpha/ts-rs` (`pushed_at` 2026-08-31, 30 відкритих, 1869 зірок, MIT) і `/tags` (`v12.0.0`, `v11.1.0`, `v11.0.0`, `v10.1.0`, `v10.0.0`).
18. `README.md` і `CHANGELOG.md` `Aleph-Alpha/ts-rs` @ `v12.0.0`: таблиця фіч, змінні середовища, «skip_serializing and skip_serializing_if only have an effect when used together with #[serde(default)]», MSRV; записи 12.0.0 (`TS_RS_LARGE_INT`), 11.1.0 (`optional_fields` для enum), 11.0.0 (`skip_serializing_if`, `optional_fields`, MSRV 1.78), 9.0.0 (`with` вимагає `#[ts(as)]`), 8.0.0 (`type` замість `interface`, `export_all`).
19. `macros/src/attr/field.rs` `Aleph-Alpha/ts-rs` @ `v12.0.0`: `default` → `has_default`; `skip_serializing(_if)` → `maybe_omitted`; `with` → «using `#[serde(with = "...")]` requires the use of `#[ts(as = "...")]` or `#[ts(type = "...")]`»; `serialize_with`/`deserialize_with` не розбираються.
20. `macros/src/optional.rs` і `macros/src/types/named.rs` `Aleph-Alpha/ts-rs` @ `v12.0.0`: `is_optional = attr.maybe_omitted && attr.has_default` у дефолтній гілці `apply`; `optional_annotation` у `format_field`.
21. `macros/src/utils.rs` (`print_warning`) і макрос `impl_parse!` `Aleph-Alpha/ts-rs` @ `v12.0.0`: текст попередження «failed to parse serde attribute … ts-rs failed to parse this attribute. It will be ignored.» під `cfg!(not(feature = "no-serde-warnings"))`.

Дзеркало: `C:\Temp\claude\…\scratchpad\track-changed-race.mjs` (поза репозиторієм; у
нотатці процитовано його вивід повністю).
