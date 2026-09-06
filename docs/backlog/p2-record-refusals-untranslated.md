---
slug: record-refusals-untranslated
title: "Відмова почати запис через диск або зниклий потік приходить у тост англійською"
priority: P2
type: planned
status: ready
effort: S
kind: bug
target: 0.1.0
updated: 2026-09-06
a11y: false
depends_on: [record-action-lies-while-connecting]
blocks: []
touches:
  - src-tauri/src/errors.rs
  - src-tauri/src/commands/stream_commands.rs
  - src/lib/recordingToggle.ts
  - src/components/streams/StreamsPanel.tsx
  - src/components/common/CommandPalette.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
gates: [cargo test, cargo clippy --all-targets, pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Відщеплено від record-action-lies-while-connecting під час його grooming 2026-09-06: той закриває лише подвійний старт, решта прози на тому самому виклику — тут. Залежність — не порядок, а спільний дім: мапер і константи кодів заводить батьківський запис, цей їх розширює; хто ландить другим, той перебазовується."
  - "target 0.1.0 призначено при grooming за темою віхи («обидві локалі повні»), не окремим рішенням розробника."
---

# Відмова почати запис через диск або зниклий потік приходить у тост англійською

> **Контекст:** хвіст [record-action-lies-while-connecting](p1-record-action-lies-while-connecting.md),
> відщеплений при його grooming. Рішення нижче; правило, яке вони застосовують, —
> [ADR 2026-09-06 §5](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md)
> і [ADR 2026-08-17 про локалізацію](../decisions/2026-08-17-native-layer-localisation.md).

## Опис

Команда `start_recording` у [stream_commands.rs](../../src-tauri/src/commands/stream_commands.rs)
має три виходи з відмовою, і кожен віддає фронтенду **англійську прозу** через
`Result<(), String>`; фронтенд кладе її в тост через `String(err)`, і NVDA читає її вголос
в українському інтерфейсі. Один із трьох — «вже пишеться» — закриває батьківський запис.
Лишаються два:

1. **Диск нижче порогу.** `check_disk_space` повертає
   `RadioError::Other("Not enough disk space: free 0.4 GB, required 1 GB")`. Це не збій, а
   відмова самого Tapir за налаштуванням профілю — і з трьох найімовірніша: поріг типово
   1 ГБ, а довідка описує саме її (`recording.md`: «Нижче порогу … запис не почнеться»;
   `troubleshooting.md` §«На диску закінчується місце»). Досяжна з **шести** місць, а не
   чотирьох: до кнопки рядка, контекстного меню, Enter у списку й палітри додаються два
   виклики `start_all_recordings` — «Записати все» / «Записати виділені» у
   [StreamsPanel.tsx](../../src/components/streams/StreamsPanel.tsx) і «Записати все» в
   [CommandPalette.tsx](../../src/components/common/CommandPalette.tsx). Та сама перевірка
   стоїть першою в обох командах.
2. **Потоку немає в активному профілі.** `format!("Stream {} not found", stream_id)` —
   гонка між рендером і кліком: профіль перемкнули, потік видалили. Практично недосяжно,
   але якщо станеться — у тості «Stream V1StGXR8_Z5jdHi6B-myT not found» з nanoid.

`stop_recording` перевірено: єдина проза там — «No active recording for stream» — це
`not_recording` батьківського запису; інших виходів немає, `notify_manual_stop` помилок
не повертає.

**Знайдено під час grooming.**

- `check_disk_space` має **чотирьох** споживачів, і троє прозу не показують: планувальник
  загортає її в `StartFailure::Failed` і віддає ключ `schedule_reason_start_failed`,
  crash-recovery лише рахує невдачі, CLI пише деталь у лог і шле `cli_action_failed`. Межу
  перетинає лише те, що йде через дві команди. Тому Display варіанта може лишитись
  англійським — для логу, — а код віддають команди, як `PLAY_ERR_UNSUPPORTED_CODEC`.
- Числа з прози — вільно й поріг — **уже мають видимий носій**: рядок стану й метрика
  «Вільно» на екрані «Потоки» показують вільне місце і за тим самим порогом
  (`isLowDiskSpace`) перемикаються на «Мало вільного місця: X»; сам поріг стоїть у
  налаштуваннях профілю, вкладка «Запис». Тост може бути коротким і без чисел — деталь
  лишається в логах, як вимагає ADR §5.
- На відмову за диском `check_disk_space` **не пише в лог нічого**: `warn!` є лише на
  невдалу перевірку. Поки числа їхали в тост, це було непомітно; щойно тост їх втратить,
  запис у лог стає єдиним місцем, де вони є.
- Та сама проза «stream not found» живе в `play_stream`
  ([player_commands.rs](../../src-tauri/src/commands/player_commands.rs)) і проходить
  `playRefusalMessage` без перекладу. Той самий клас, але плеєр — див. «Межі».

## Ухвалені рішення

1. **Два коди на межі, одна функція мапінгу.** `RadioError` дістає варіант
   `DiskSpaceLow { free_bytes, threshold_gb }` замість прози в `Other`; його Display лишає
   англійський рядок із числами — це текст логу, не екрана. `start_recording` і
   `start_all_recordings` віддають голі коди `disk_space_low` і `stream_not_found`
   константами поруч із `already_recording` / `not_recording` батьківського запису.
   Мапінг `RadioError → String` — одна чиста функція на межі команд, яку розширює і
   батьківський запис, а не чотири `map_err`. Відхилено: структурована помилка з числами
   (JSON в `Err`) — перший структурований `Err` у застосунку заради двох чисел, які вже
   є на екрані; числа плейсхолдерами ключа — те саме, ще й коштом формату в двох процесах.
2. **Один мапер, два ключі.** `recordRefusalMessage` батьківського запису дістає два
   випадки: `disk_space_low` → `record_refused_disk_space`, `stream_not_found` →
   `stream_not_found_in_profile`; `already_recording` / `not_recording` → `null`, як там;
   решта — `String(err)`, як у `playRefusalMessage` (причина обриву — єдина деталь, яку
   має людина). Обидва місця `startAllRecordings` проганяють помилку через той самий мапер.
   Відхилено: окремий мапер для «Записати все» — та сама помилка з тієї самої перевірки.
3. **Зниклий потік — тост, а не тиша.** «Вже пишеться» батьківський запис ковтає, бо
   застосунок тричі трактує його як пропуск, а рядок сам відповість за мить. Тут інше:
   список не мав показувати цей рядок узагалі, і тиша сховала б ваду списку — рівно та
   мовчазна відмова, яку віха 0.1.0 закриває. Ключ названо без «record», бо той самий
   текст підійде плеєру (див. «Межі»).
4. **Тексти без чисел, з наслідком.** Орієнтовно — uk «Замало вільного місця на диску —
   запис не розпочато», en «Not enough free disk space — recording did not start»;
   uk «Потік не знайдено в активному профілі», en «Stream not found in the active
   profile». Слово «поріг» у тості не потрібне: людина, яка хоче знати чому, іде туди,
   куди веде довідка. Тип тоста — той, що обере батьківський запис.
5. **Лог замість тоста.** `check_disk_space` при відмові пише `warn!` з вільним місцем і
   порогом — деталь, знята з екрана, мусить лишитись у логах (ADR 2026-09-06 §5).

## Межі — свідомо не в цьому записі

- **`play_stream` і його «stream not found: …».** Той самий клас і, після цього запису,
  однорядкова правка: константа `stream_not_found` у `player_commands.rs` і один `case`
  у `playRefusalMessage` на той самий ключ. Не тут, бо запис — про межу запису; хто
  візьметься, ключ перевикористовує, не заводить другий.
- **Решта прози «… not found» на межі IPC** — `update_stream`, `get_stream_status`,
  `transfer_stream_to_profile`, `Pattern '…' not found` у вішлісті — свої команди зі
  своїми поверхнями. Якщо знадобиться, це окремий аудит-запис, а не хвіст цього.
- **Планувальник, crash-recovery, CLI** — не чіпаються: прозу вони й так не показують.
- **Довідка не міняється:** §«На диску закінчується місце» описує поведінку, тост не
  цитує. Критерій нижче лишається як перевірка.

## Критерії готовності

- [ ] `docs/help/uk|en/troubleshooting.md` §«На диску закінчується місце» звірено: тост
      не цитується, правок не очікується
- [ ] `RadioError::DiskSpaceLow { free_bytes, threshold_gb }` замість прози в `Other`;
      `check_disk_space` повертає його і пише `warn!` з обома числами; тест на Display у
      `errors.rs`
- [ ] Константи `disk_space_low` і `stream_not_found` поруч із `already_recording` /
      `not_recording`, за зразком `PLAY_ERR_UNSUPPORTED_CODEC`; `start_recording` і
      `start_all_recordings` віддають їх замість прози; чиста функція мапінгу на межі з
      `cargo test`: `DiskSpaceLow` → код, решта → `to_string()`
- [ ] `stop_recording` — без змін; тест або перевірка, що прози поза `not_recording` там
      немає
- [ ] Ключі `record_refused_disk_space` і `stream_not_found_in_profile` в `uk.json` і
      `en.json`; `pnpm vite:build` перед тестами, інакше ключів не видно
- [ ] `recordRefusalMessage`: `disk_space_low` і `stream_not_found` → локалізований рядок,
      `already_recording` / `not_recording` → `null`, решта → `String(err)`; тести на
      обидва нові коди і на прохід чужого рядка
- [ ] Обидва місця `startAllRecordings` — StreamsPanel («Записати все», «Записати
      виділені») і палітра — показують результат того самого мапера; тест, що падає на
      невиправленому коді: `disk_space_low` з `startAllRecordings` дає локалізований тост
- [ ] `cargo test`, `cargo clippy --all-targets`, `pnpm test`, `pnpm typecheck`,
      `pnpm vite:build` — без помилок
- [ ] NVDA-прогону немає (`a11y: false`): нових зупинок фокуса й live-поверхонь запис не
      додає, тост іде тим самим каналом, що й досі

## Документи

- [record-action-lies-while-connecting](p1-record-action-lies-while-connecting.md) —
  батьківський запис: мапер, константи, рішення «пропуск — не помилка»
- [ADR 2026-09-06](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md) §5 —
  причина є закритим переліком, деталь лишається в логах
- [ADR 2026-08-17 про локалізацію](../decisions/2026-08-17-native-layer-localisation.md) —
  нативний шар шле ключі, не прозу
- [ADR 2026-08-31](../decisions/2026-08-31-visible-carrier-for-announced-facts.md) —
  чому тост без чисел нічого не втрачає: носій у рядку стану
- `docs/help/uk/troubleshooting.md` §«На диску закінчується місце»,
  `docs/help/uk/recording.md` — поведінка, яку тост має підтверджувати
- код: [stream_commands.rs](../../src-tauri/src/commands/stream_commands.rs),
  [errors.rs](../../src-tauri/src/errors.rs),
  [player_commands.rs](../../src-tauri/src/commands/player_commands.rs) і
  [playRefusal.ts](../../src/lib/playRefusal.ts) — зразки коду на межі,
  [StatusBar.tsx](../../src/components/layout/StatusBar.tsx) і
  [FreeSpaceMetric.tsx](../../src/components/streams/FreeSpaceMetric.tsx) — видимий носій
