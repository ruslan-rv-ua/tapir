---
slug: record-action-lies-while-connecting
title: "Поки потік підключається, кнопка рядка пропонує почати запис — і відповідає англійською"
priority: P1
type: planned
status: ready
effort: M
kind: bug
target: 0.1.0
updated: 2026-09-06
a11y: true
depends_on: []
blocks: []
touches:
  - src/lib/recordingToggle.ts
  - src/components/streams/StreamItem.tsx
  - src/components/streams/StreamContextMenu.tsx
  - src/components/streams/StreamList.tsx
  - src/components/common/CommandPalette.tsx
  - src-tauri/src/errors.rs
  - src-tauri/src/stream/manager.rs
  - src-tauri/src/commands/stream_commands.rs
  - CONTEXT.md
gates: [cargo test, cargo clippy --all-targets, pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Знайдено NVDA-прогоном error-state-never-reaches-ui (2026-09-06). Відщеплено свідомо: правка міняє видимий підпис кнопки, тобто вимагає власного прогону, а той запис свій уже пройшов чисто."
  - "Grooming 2026-09-06: термін «запис» розширено в CONTEXT.md §«Запис і Записи», рішення — у розділі нижче. ADR не заведено свідомо: «чому» несе словник, заливка оборотна, а «пропуск — не помилка» є третім застосуванням наявного правила."
---

# Поки потік підключається, кнопка рядка пропонує почати запис — і відповідає англійською

> **Контекст:** знахідка NVDA-прогону
> [error-state-never-reaches-ui](done/p1-error-state-never-reaches-ui.md). Grooming
> проведено 2026-09-06; рішення — в розділі «Ухвалені рішення» нижче, термін — у
> [CONTEXT.md](../../CONTEXT.md) §«Запис і Записи».

## Опис

Рядок потоку вважає запис активним лише в стані `recording`. Grooming знайшов ту саму
вузьку умову не у двох місцях, як здавалось, а в **чотирьох**, і кожне з них кладе
відмову бекенду в тост через `String(err)`:

- [StreamItem.tsx](../../src/components/streams/StreamItem.tsx) — `const isRecording = state === "recording"`,
  від нього залежать підпис дії, колір кнопки, заливка рядка і те, що дія робить;
- [StreamContextMenu.tsx](../../src/components/streams/StreamContextMenu.tsx) — та сама
  умова, той самий наслідок;
- [StreamList.tsx](../../src/components/streams/StreamList.tsx) — Enter і подвійний клік
  рядка (головна дія за налаштуванням, `Ctrl` примусово «запис»);
- [CommandPalette.tsx](../../src/components/common/CommandPalette.tsx) — команда
  «Почати запис» / «Зупинити запис» з назвою потоку підрядком.

Отже поки потік у стані `connecting` або `reconnecting` — а перепідключення за
замовчуванням триває **до ≈40 хвилин** — усі чотири місця кажуть «Почати запис: <назва>»,
хоча задача запису вже жива.

Три наслідки, кожен спостережуваний:

1. **Підпис бреше.** Запис уже йде (або пробує йти), а рядок пропонує його почати.
2. **Натискання відповідає технічною англійською.** `start_recording` бачить наявний запис
   у менеджері й повертає `Stream '<id>' is already recording`; фронтенд кладе цей рядок
   у тост через `String(err)`. У українському інтерфейсі, і NVDA читає його вголос. Це
   рівно те, що заборонив ADR
   [2026-09-06 §5](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md).
   Симетрична гонка на зупинці дає `No active recording for stream '<id>'`.
3. **Зупинити потік із його ж рядка неможливо.** Лишаються обхідні шляхи: виділити рядок
   і «Зупинити виділені», або глобальна `Ctrl+Shift+S` на все відразу. Обидва — не те, що
   людина шукає, стоячи на потрібному рядку.

Решта застосунку цю умову вже розуміє ширше: `isRecordingLike` (recording + connecting +
reconnecting) керує лічильником «зупиняються», кнопкою «Записати все» і забороною
переносити потік між профілями; у бекенді те саме каже `recording_control::is_active`,
а `stop_recording` менеджера скасовує токен будь-якого запису в `entries`, включно з
`connecting`. Тобто розходяться саме місця, де людина діє.

**Знайдено під час grooming.** «Вже записується» застосунок уже тричі трактує як
пропуск, а не збій: «Записати все» рахує «пропущено» (довідка: «звичайний результат двічі
натиснутої кнопки, а не помилка»), планувальник має статус `SkippedAlreadyRecording`
(«потік уже записувався»), CLI `--record` дає загальне `cli_action_failed` і пише деталь у
лог. Прецедент відмови на межі — константа `PLAY_ERR_UNSUPPORTED_CODEC = "unsupported_codec"`
у `player_commands.rs`, яку мапить `playRefusalMessage` у `src/lib/playRefusal.ts`.

## Ухвалені рішення

1. **Запис існує від команди «почати».** Підключення й перепідключення — його фази, а не
   його відсутність (словник, §«Запис і Записи»). Застосунок і довідка вже так говорили:
   глобальна кнопка «Зупинити запис» зупиняє потік, що підключається, а довідка каже
   «Enter — почати або зупинити запис». Тому дія рядка зветься **«Зупинити запис»** у всіх
   трьох фазах; фазу каже сегмент стану поруч. Відхилено: голе «Зупинити» під час
   підключення (два підписи й переназва глобальної кнопки), підписи по фазах (підпис під
   сфокусованою кнопкою мінявся б на кожному переході, і NVDA читала б кожен), «Скасувати»
   (ключ зайнятий діалогами, «Скасувати: <назва>» читається як скасування потоку).
2. **Одна умова, одне місце проживання.** Новий модуль `src/lib/recordingToggle.ts` за
   зразком `transportControl.ts`: `toggleRecording(streamId, state)` сам вирішує старт чи
   стоп через `isRecordingLike`, сам відповідає за відгук. Усі чотири місця викликають його
   без власного `try/catch`. Підписи лишаються на місцях, але через той самий
   `isRecordingLike`. Відхилено: чотири правки на місці — правило «пропуск — не помилка»
   жило б у чотирьох копіях, і наступне розходження гарантоване.
3. **Відмова на подвійний старт — стабільний код, і фронтенд його ковтає.** Після (2)
   англійський рядок з інтерфейсу досяжний лише у вікні гонки між `invoke` і подією
   `recording-status`. Бекенд віддає голі коди `already_recording` і `not_recording` за
   зразком `unsupported_codec`; чистий `recordRefusalMessage(err): string | null` повертає
   для них `null`, і тоста немає — відповіддю є сам рядок, який за мить перемкнеться.
   Відхилено: лишити гонку з англійським рядком (ADR §5 порушено), локалізований тост
   «Запис уже йде» (прийшов би одночасно з рядком і назвав помилкою те, що помилкою ніде
   не є), ідемпотентний старт у бекенді (у вікні між «зупинити» й прибиранням запис у
   `entries` ще є, але вже вмирає, і Ok збрехав би).
4. **Заливка рядка розводить фази.** `recording` — червона, як зараз; `connecting` і
   `reconnecting` — **жовта** в тон спінера R-слота; `error` — без заливки, як зараз.
   Порядок пріоритетів той самий: фаза запису перекриває синю заливку відтворення.
5. **Кнопка кодує дію, не фазу.** «Зупинити запис», червона, значок ⏹ — у трьох фазах.
   Два кольори під одним словом змусили б людину гадати, чи це та сама дія; індикатор
   фази дано рядку, цього досить.

## Межі — свідомо не в цьому записі

- Фільтр «Записуються», метрика «Записується N», лічильник тривалості й підпис
  «Записується» в резюме рядка лишаються за `recording`: вони про байти, що йдуть, а не
  про існування запису; чіпи відповідають на «які здорові, а які борються» (ADR 2026-09-06
  §2), і чіпати їх — правка чужого рішення.
- CLI `--record` на потік, що вже пишеться, і далі дає `cli_action_failed`.
- Решта англійських відмов на тому ж виклику (`check_disk_space`, «Stream not found») —
  окремий запис; вони не про подвійний старт.
- Довідка не міняється: кольорів рядка вона не описує, а речення про Enter після (1) —
  правда. Критерій нижче лишається як перевірка.

## Критерії готовності

- [ ] `src/lib/recordingToggle.ts`: `toggleRecording(streamId, state)` у `connecting` і
      `reconnecting` кличе `stopRecording`, в `idle`, `error` і без статусу —
      `startRecording`; тест модуля без DOM
- [ ] `recordRefusalMessage(err)`: `already_recording` і `not_recording` → `null` (тоста
      немає), решта → `String(err)`; тест
- [ ] Чотири місця — кнопка рядка, контекстне меню, Enter/подвійний клік у списку,
      палітра — викликають модуль без власного `try/catch`; по одному тесту на місце, що
      падає на невиправленому коді: у стані `connecting` дія зупиняє потік, а не пробує
      його почати
- [ ] Підпис у всіх чотирьох місцях у `connecting` і `reconnecting` — «Зупинити запис»
      (у рядку — з назвою в `aria-label`); тести на підпис
- [ ] Бекенд: `RadioError` дістає варіанти для «вже пишеться» і «не пишеться» замість прози
      в `Other`/`NotFound`; команди `start_recording` і `stop_recording` віддають голі коди
      `already_recording` / `not_recording` константами за зразком
      `PLAY_ERR_UNSUPPORTED_CODEC`; `cargo test` на менеджер і на мапінг команди
- [ ] Заливка рядка: `recording` червона, `connecting`/`reconnecting` жовта, `error` без
      заливки, фаза перекриває синю заливку відтворення; кнопка червона з ⏹ у трьох фазах;
      тест на рядок у `connecting`
- [ ] `docs/help/` — `streams.md` (uk, en): звірити, що «Enter — почати або зупинити
      запис» лишається правдою; правок не очікується
- [ ] `cargo test`, `cargo clippy --all-targets`, `pnpm test`, `pnpm typecheck`,
      `pnpm vite:build` — без помилок
- [ ] NVDA-прогін за чеклістом зі скілу `writing-nvda-checklists`: підпис під час
      підключення й перепідключення читається правильно; зміна підпису під сфокусованою
      кнопкою **чутна** (див. `focused-label-swap-is-silent` — лікує дзеркальний
      `aria-label`, який тут уже є); повторний Enter одразу після старту не дає тоста;
      палітра пропонує «Зупинити запис» для потоку, що підключається

## Документи

- [error-state-never-reaches-ui](done/p1-error-state-never-reaches-ui.md) — прогін, що це знайшов
- [CONTEXT.md](../../CONTEXT.md) §«Запис і Записи» — термін, розширений цим grooming-ом
- [ADR 2026-09-06](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md) §5 — чому технічний рядок не має перетинати межу; §2 — чому чіпи лишаються вузькими
- [ADR 2026-08-17 про локалізацію](../decisions/2026-08-17-native-layer-localisation.md) — нативний шар шле ключі, не прозу
- код: [StreamItem.tsx](../../src/components/streams/StreamItem.tsx),
  [StreamContextMenu.tsx](../../src/components/streams/StreamContextMenu.tsx),
  [StreamList.tsx](../../src/components/streams/StreamList.tsx),
  [CommandPalette.tsx](../../src/components/common/CommandPalette.tsx),
  [streamState.ts](../../src/lib/streamState.ts),
  [playRefusal.ts](../../src/lib/playRefusal.ts) і
  [transportControl.ts](../../src/lib/transportControl.ts) — зразки,
  [manager.rs](../../src-tauri/src/stream/manager.rs),
  [player_commands.rs](../../src-tauri/src/commands/player_commands.rs) — зразок коду на межі
