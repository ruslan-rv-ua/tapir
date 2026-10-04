---
slug: play-refusals-untranslated
title: "Відмова відтворення приходить у тост англійською: тайм-аут проби, формат, з'єднання, пристрій"
summary: "play_stream і preview_station шлють сиру англійську прозу на кожну відмову рушія; на станціях AAC+ прев'ю ще й закреслює станцію як «Недоступна»"
priority: P2
type: planned
status: ready
effort: S
kind: bug
target: 0.1.1
updated: 2026-10-04
a11y: true
depends_on: []
blocks: [play-file-refusals-untranslated]
touches:
  - src-tauri/src/player/engine.rs
  - src-tauri/src/commands/player_commands.rs
  - src-tauri/src/playback_control.rs
  - src/lib/playRefusal.ts
  - src/components/browser/StationItem.tsx
  - src/components/browser/StationList.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
  - docs/help/uk/troubleshooting.md
  - docs/help/en/troubleshooting.md
  - docs/help/uk/browser.md
  - docs/help/en/browser.md
gates: [cargo test, cargo clippy --all-targets, pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Знахідка огляду беклогу 2026-10-04 (звірка he-aac-mf-playback з HEAD a04e358). Ті самі рядки engine.rs і той самий playRefusal.ts є в тегу v0.1.0."
  - "2026-10-04: перенесено в 0.1.1 рішенням власника — kind: bug, є у відвантаженій збірці, поверхня та сама, тип IPC той самий."
  - "2026-10-04: виґрумінговано (draft → ready). Один код `play_failed` на тайм-аут проби й формат; обсяг свідомо ширшає на `connect_failed` і `output_unavailable`, на прев'ю браузера (тост, зайва репліка, мітка «Недоступна»). Екран «Записи» винесено в play-file-refusals-untranslated."
---

# Відмова відтворення приходить у тост англійською: тайм-аут проби, формат, з'єднання, пристрій

> **Контекст:** знахідка огляду беклогу 2026-10-04, того ж дня перенесена в 0.1.1 і
> виґрумінгована (див. «Рішення грумінгу»). Режим — **READY**: до реалізації.

## Опис

`play_stream` (`src-tauri/src/commands/player_commands.rs`) віддає фронтенду `e.to_string()`
усього, що поверне рушій. Стабільні коди мають лише два випадки — `unsupported_codec` і
`stream_not_found`; решта йде прозою з `anyhow`:

- тайм-аут проби — «timed out probing stream format after 15s (unsupported codec?)»
  (`src-tauri/src/player/engine.rs`, `play_live`, гілка `Err(_elapsed)`);
- нерозібраний формат — «could not decode stream (unsupported format?)»; поруч паніка
  ініціалізації «LiveSource init task panicked: …»;
- з'єднання — «failed to connect to stream»;
- пристрій виведення — «Failed to open audio output stream».

`playRefusalMessage` (`src/lib/playRefusal.ts`) свідомо пропускає «все інше» як є. Тож
людина з українським інтерфейсом бачить і чує англійський тост. Найчастіше — на станціях
AAC+ (HE-AAC): Tapir їх називає й записує, а symphonia не декодує, тож кожна спроба слухати
закінчується тайм-аутом ([he-aac-mf-playback](p3-he-aac-mf-playback.md)).

### Що виявила звірка з HEAD 74f18ed (грумінг)

1. **Помилка з'єднання подробиць не несе.** `to_string()` на `anyhow::Error` друкує лише
   зовнішній контекст, тож причина від reqwest до людини не доходить ніколи — тост завжди
   «failed to connect to stream». Обґрунтування в коментарі `playRefusal.ts` («заміна коштувала
   б людині єдиної подробиці») хибне.
2. **У лозі деталі немає теж.** Ні `play_stream`, ні `preview_station`, ні рушій відмову не
   логують; два `log::warn!("…{e}")` у `playback_control.rs` (resume-last) пишуть лише
   зовнішній контекст.
3. **Прев'ю в браузері станцій** (`preview_station`) іде тим самим `play_live`, а
   `StationItem.tsx` показує `String(err)` в обхід `playRefusalMessage`. Слідом він
   проговорює `station_preview_failed` («Не вдалося підключитися до {name}») — друга репліка
   на ту саму подію (`ToastContainer` уже `aria-live="polite"`), і для AAC+ хибна: з'єднання
   якраз було.
4. **Невдале прев'ю закреслює станцію.** `markPreviewFailed` (`StationList.tsx`) реагує на
   будь-яку відмову: рядок стає «Недоступна, {name}» з трикутником. Для AAC+ це неправда —
   станція на зв'язку й записується, а мітка відраджує її додавати.

## Чому це вада

- Тема 0.1.0 обіцяла повні обидві локалі, а
  [ADR про локалізацію нативного шару](../decisions/2026-08-17-native-layer-localisation.md)
  каже: нативний шар шле ключі, не прозу.
- [ADR 2026-09-06](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md) §5:
  причина — закритий перелік, деталь із числами — у лозі.
  [record-refusals-untranslated](done/p2-record-refusals-untranslated.md) провів це правило для
  відмов запису; хвіст «та сама проза в `play_stream`» тоді закрили лише для `unsupported_codec`.

## Рішення грумінгу (2026-10-04)

**1. Один код `play_failed` на тайм-аут проби, нерозібраний формат і паніку ініціалізації.**
Усі три трапляються, коли з'єднання вже є, і ведуть до однієї дії людини — інша станція або
довідка. Окремий код на тайм-аут виправдав би себе, лише якби вів до іншої дії. Відхилено
«свій код на тайм-аут»: тайм-аут буває й від повільної мережі, тож слово про кодек хибило б, а
чесне слово («потік не почав звучати») нічого людині не підказує.

**2. Помилки з'єднання отримують код `connect_failed`** — і це **свідоме розширення обсягу**
проти чернетки, де вони лишались сирими. Підстава чернетки відпала (знахідка 1). Код бере
наявний ключ `failure_station_unreachable` («Станція не відповідає» / «Station is not
responding»): один факт — одне формулювання, як `stream_not_found` у запису й відтворенні.
Відхилено злиття в `play_failed`: дія тут інша («спробуйте пізніше») — це єдина відмінність,
з якої людина може щось зробити. Хибний абзац коментаря `playRefusal.ts` прибрати.

**3. Пристрій виведення — свій код `output_unavailable`.** Причина третя, дія окрема (вкладка
**Аудіо** налаштувань); попередня сесія на цю мить уже зупинена, тобто тиша справжня.

**4. Деталь — у лозі.** Відмова `play_stream` / `preview_station` пишеться `log::warn!` з
`{e:#}` (повний ланцюг контекстів) перед перетворенням на код; два `log::warn!` у
`playback_control.rs` — теж на `{e:#}`.

**5. Прев'ю браузера входить у запис.** Бекенд-зміна 1–3 зачіпає `preview_station`
неминуче: без зміни фронтенду `StationItem` показав би голий код `play_failed` — гірше, ніж
тепер. Тост іде через `playRefusalMessage`; `announce(station_preview_failed)` прибирається
(одна подія — одна репліка: тост несе причину, фокус на рядку несе станцію), ключ
`station_preview_failed` видаляється з обох локалей — інших вживань немає.

**6. Мітка «Недоступна» після прев'ю — лише на `connect_failed`.** `onPreviewFailed`
спрацьовує тільки на цей код; `play_failed` і `output_unavailable` станцію не позначають.

**7. Формулювання нових ключів:**

| код | ключ | uk | en |
|---|---|---|---|
| `play_failed` | `stream_play_failed` (новий) | Не вдалося відтворити потік | Couldn't play this stream |
| `connect_failed` | `failure_station_unreachable` (наявний) | Станція не відповідає | Station is not responding |
| `output_unavailable` | `stream_play_output_unavailable` (новий) | Не вдалося відкрити пристрій виведення | Couldn't open the output device |

Без «ви» й без чисел; «пристрій виведення» — термін вкладки **Аудіо** і сусіда
`settings_output_device_error`. Відхилено «Tapir не зміг відтворити цей потік» — натякає на
винного, хоча причиною буває й мережа.

**8. Довідка (обидві локалі) — у критеріях готовності, правиться разом із кодом.**

**9. Межа.** Екран «Записи» (`play_saved_song` → `play_file`, `SongsPanel.tsx` показує
`String(err)`) — той самий клас, окремий запис
[play-file-refusals-untranslated](p2-play-file-refusals-untranslated.md), що бере коди й мапер
звідси. Трей і гарячі клавіші (`playback_control.rs`, `TransportFailureReason`) уже
локалізовані — не чіпати, крім `{e:#}` із п. 4.

### Вказівка для реалізації

Класифікувати відмову типом, а не зіставленням рядків: зразок — `recording_refusal_on_wire`
(`src-tauri/src/commands/stream_commands.rs`), що мапить варіанти `RadioError` на коди
`REC_ERR_*`. Константи `PLAY_ERR_*` — поруч із наявними в `player_commands.rs`; одна функція
«відмова → код на дріт» на обидві команди, щоб `play_stream` і `preview_station` не розійшлися.

### Умова перебування в 0.1.1

Виконана: та сама поверхня (тост відмови), той самий тип IPC (`Result<(), String>`), лише нові
значення коду й ключі в обох локалях. Розширення обсягу (п. 2, 3, 5, 6) — на тих самих викликах
і в тих самих компонентах, без нової поверхні.

## Критерії готовності

- [x] `play_stream` і `preview_station` повертають `play_failed` на тайм-аут проби,
      нерозібраний формат і паніку ініціалізації; `connect_failed` на з'єднання;
      `output_unavailable` на пристрій виведення. Жодної прози, жодних чисел; тест Rust на
      кожну гілку класифікації
- [x] Повна деталь (`{e:#}`) — у лозі на кожну відмову обох команд; два `log::warn!` у
      `playback_control.rs` — на `{e:#}`
- [x] `playRefusalMessage` мапить три нові коди на ключі з таблиці; тест на кожен код;
      хибний абзац коментаря прибрано
- [x] Ключі `stream_play_failed` і `stream_play_output_unavailable` — в обох локалях;
      `station_preview_failed` видалено з обох
- [x] `StationItem`: помилка прев'ю — через `playRefusalMessage`, без `announce`;
      `onPreviewFailed` — лише на `connect_failed`; тести на обидві умови
- [x] `docs/help/` (обидві локалі):
  - [x] `troubleshooting.md`, «Станція записується, але не відтворюється»: відтворення
        «здається з повідомленням **Не вдалося відтворити потік**»; те саме буває, коли
        станцію прослуховують у браузері станцій, і позначки **Недоступна** вона від цього
        не отримує
  - [x] `troubleshooting.md`, «Звук іде не в той пристрій»: від'єднаний вибраний пристрій
        більше не дає мовчазного відтворення — Tapir скаже **Не вдалося відкрити пристрій
        виведення**; звірити з реченням «…leaves playback silent» і виправити його
  - [x] `browser.md`, абзац про **Недоступна**: «…або щойно не відповів, коли ви його
        прослуховували» замість «…щойно не запустився у вас» (у текстах — «прослухати», не
        «прев'ю», див. CONTEXT.md §«Прев'ю»)
- [x] `cargo test`, `cargo clippy --all-targets`, `pnpm test`, `pnpm typecheck`,
      `pnpm vite:build` — без помилок
- [ ] NVDA-прогін на станції AAC+, в обох локалях:
  - [ ] екран «Потоки»: тост читається мовою інтерфейсу — «Не вдалося відтворити потік»
  - [ ] прев'ю в браузері станцій: той самий тост, **одна** репліка, рядок не стає
        «Недоступна»
  - [ ] станція з недоступною адресою: «Станція не відповідає», рядок прев'ю — «Недоступна»

## Документи

- [he-aac-mf-playback](p3-he-aac-mf-playback.md) — де вада трапляється найчастіше
- [play-file-refusals-untranslated](p2-play-file-refusals-untranslated.md) — той самий клас для
  екрана «Записи»
- [record-refusals-untranslated](done/p2-record-refusals-untranslated.md) — той самий клас для запису
- [ADR 2026-08-17 — локалізація нативного шару](../decisions/2026-08-17-native-layer-localisation.md)
- [ADR 2026-09-06 — помилка як діагноз](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md) §5
- Код: `src-tauri/src/player/engine.rs` (`play_live`, `PROBE_TIMEOUT`),
  `src-tauri/src/commands/player_commands.rs` (`play_stream`, `preview_station`),
  `src-tauri/src/commands/stream_commands.rs` (`recording_refusal_on_wire` — зразок),
  `src/lib/playRefusal.ts`, `src/components/browser/StationItem.tsx`,
  `src/components/browser/StationList.tsx` (`markPreviewFailed`)
