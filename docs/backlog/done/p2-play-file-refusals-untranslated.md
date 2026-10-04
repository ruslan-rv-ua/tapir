---
slug: play-file-refusals-untranslated
title: "Відмова відтворити трек на екрані «Записи» приходить у тост англійською"
summary: "Відмова відтворити трек на екрані «Записи» й в автопереході приходить кодом file_not_found / file_play_failed / output_unavailable"
priority: P2
type: planned
status: done
completed: 2026-10-04
effort: S
kind: bug
target: 0.1.1
updated: 2026-10-04
a11y: true
depends_on: [play-refusals-untranslated]
blocks: []
touches:
  - src-tauri/src/player/engine.rs
  - src-tauri/src/commands/songs_commands.rs
  - src-tauri/src/commands/player_commands.rs
  - src-tauri/src/lib.rs
  - src/lib/tauri.ts
  - src/lib/playRefusal.ts
  - src/lib/transportControl.ts
  - src/components/songs/SongsPanel.tsx
  - src/App.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
  - docs/help/uk/songs.md
  - docs/help/en/songs.md
  - docs/help/uk/troubleshooting.md
  - docs/help/en/troubleshooting.md
gates: [cargo test, cargo clippy --all-targets, pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Винесено з грумінгу play-refusals-untranslated 2026-10-04: той самий клас вади на іншому виклику. Залежність — спільний дім: коди PLAY_ERR_*, функцію «відмова → код на дріт» і мапер заводить батьківський запис, цей їх розширює."
  - "2026-10-04: виґрумінговано (draft → ready). Два нові коди (`file_not_found` лише на NotFound, `file_play_failed` на решту), `output_unavailable` з батьківського; автоперехід входить, перехід уперед/назад — ні; мертва команда `player_commands::play_file` прибирається. Термінологію вирівняно з CONTEXT.md: «трек», екран «Записи»."
  - "2026-10-04: реалізовано (d26e72f, 2098a8c). NVDA-прогін не проводився — користувач прийняв без нього."
---

# Відмова відтворити трек на екрані «Записи» приходить у тост англійською

> **Контекст:** винесено з грумінгу
> [play-refusals-untranslated](p2-play-refusals-untranslated.md) 2026-10-04, щоб той лишився
> S і з одним NVDA-сценарієм; того ж дня виґрумінговано (див. «Рішення грумінгу») і реалізовано (див. «Спадок»). Режим —
> **DONE**.

## Опис

`play_saved_song` (`src-tauri/src/commands/songs_commands.rs`) віддає `e.to_string()` усього,
що поверне `play_file` рушія, а `SongsPanel.tsx` (`handlePlay`) показує `String(err)` у тості.
Сира проза рушія (`src-tauri/src/player/engine.rs`, `play_file`):

- «File not found: {шлях}» — ще й із повним шляхом у тості;
- «Unsupported audio format»;
- «Failed to open audio output stream».

### Що виявила звірка з HEAD c63cf28 (грумінг)

1. **Викликів `play_file` рушія чотири.** Окрім `SongsPanel`:
   - **автоперехід** (`App.tsx`, `handlePlayerEnded`) — тост `playback_error` («Помилка
     відтворення») і зупинка: мовою інтерфейсу, але причина губиться;
   - **перехід уперед/назад** (`transportControl.ts`, `reportSkipFailure`) — тост
     «{назва}: Помилка відтворення» у вікні або нативне сповіщення з `TransportFailureReason`
     поза ним; локалізовано;
   - **відновлення останнього джерела** (`playback_control.rs`, `ResumeLastAction::PlayFile`)
     — `ResumeFailure::Error`, локалізовано; `log::warn!` пише лише зовнішній контекст.
2. **Мертва IPC-команда.** `player_commands::play_file` зареєстрована в `lib.rs`, але
   обгортку `tauri.playFile` ніхто не імпортує. Це другий вихід тієї ж прози.
3. **«File not found» буває неправдою.** `File::open` відмовляє й тоді, коли доступ
   заборонено або файл тримає інший процес (sharing violation); рушій усе називає «не
   знайдено».
4. **Сусідній прецедент.** Відкриття треку в програмі за замовчуванням (`Alt+Enter`,
   `shellOpenError.ts`) мапить `not_found` на `songs_open_not_found` («Файл не знайдено»), і
   рядок лишається в списку.

## Чому це вада

Те саме правило, що в батьківському записі: нативний шар шле ключі, не прозу
([ADR 2026-08-17](../../decisions/2026-08-17-native-layer-localisation.md)); причина — закритий
перелік, деталь — у лозі
([ADR 2026-09-06](../../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md) §5).

## Рішення грумінгу (2026-10-04)

**1. `file_not_found` — лише на `NotFound`.** Окремий код виправдовує себе, коли веде до
іншої дії людини: «трека більше немає там, де його бачить список» — веде. Доступ заборонено
й файл зайнятий трапляються рідко і ведуть до тієї самої дії, що будь-яка інша відмова, тож
ідуть у загальний код (п. 2). Відхилено «один код на будь-яку відмову `File::open`» — та сама
неправда, що тепер, лише українською; і «три коди» — дві причини без власної дії.

**2. Загальна відмова файлу — свій код `file_play_failed`.** Покриває доступ, зайнятість,
нерозібраний формат (`Decoder::try_from` — і битий, і недописаний файл) та паніку чи будь-що
інше. Рушій і так знає, що грає файл (`play_file` ≠ `play_live`), тож тип джерела чесно їде в
коді, а `playRefusalMessage` лишається таблицею «код → ключ». Відхилено «`play_failed` +
ключ за викликачем» (мапер дістає другий вимір) і «ключ без слова про джерело» (екран
«Потоки» втратив би вже виґрумінговану точність).

**3. Пристрій виведення — `output_unavailable` з батьківського запису, як є.** Слова «потік»
у формулюванні немає; попередня сесія на цю мить уже зупинена (`stop_session` на початку
`play_file`), тиша справжня.

**4. Формулювання:**

| код | ключ | uk | en |
|---|---|---|---|
| `file_not_found` | `songs_open_not_found` (наявний) | Файл не знайдено | наявний |
| `file_play_failed` | `file_play_failed` (новий) | Не вдалося відтворити файл | Couldn't play this file |
| `output_unavailable` | `stream_play_output_unavailable` (з батьківського) | Не вдалося відкрити пристрій виведення | Couldn't open the output device |

«Файл не знайдено» — той самий ключ, що в `Alt+Enter`: один факт — одне формулювання.

**5. Після «Файл не знайдено» рядок лишається в списку.** Та сама реакція, що в `Alt+Enter`.
Прибирання зниклих рядків зачепило б фокус, вибірку і `Alt+Enter` разом — це не мова
відмови. Окремий запис не заводиться: `songs.md` прямо каже, що список — тека, побачена при
побудові, і повернення на екран його перебудовує. Якщо рядок-привид заважатиме після
NVDA-прогону — тоді.

**6. Автоперехід входить у запис.** `handlePlayerEnded` показує `playRefusalMessage(e)`
замість `playback_error`; зупинка після відмови (захист від циклу через биті файли) — як є.
Саме тут `file_not_found` найімовірніший: сусіда видалили, поки грав попередній трек.

**7. Перехід уперед/назад і відновлення останнього джерела — не чіпати.** Перший уже
локалізований, а точніша причина в нативному сповіщенні вимагала б нових варіантів
`TransportFailureReason` і ключів трею — інший шар; виправити лише тост розвело б вікно й
систему (ADR «вухо, вікно, система»). Межа та сама, що в батьківському записі. `{e:#}` у
`log::warn!` відновлення вже робить батьківський запис.

**8. Мертва команда `player_commands::play_file` прибирається** разом із реєстрацією в
`lib.rs` і обгорткою `tauri.playFile` — інакше вона або дублює класифікацію, або лишається
діркою, крізь яку проза повернеться.

**9. Довідка (обидві локалі) — у критеріях готовності, правиться разом із кодом.**

### Вказівка для реалізації

Класифікувати відмову типом, а не зіставленням рядків — той самий підхід і той самий дім, що
в батьківському записі (`PLAY_ERR_*` поруч у `player_commands.rs`, функція «відмова → код на
дріт»). `NotFound` береться з `std::io::ErrorKind` джерела помилки `File::open`, а не з
тексту контексту. Деталь — `log::warn!` з `{e:#}` перед перетворенням на код.

### Умова перебування в 0.1.1

Виконана: та сама поверхня (тост відмови), той самий тип IPC (`Result<(), String>`), лише нові
значення коду, один новий ключ в обох локалях і видалення мертвої команди.

## Критерії готовності

- [x] `play_saved_song` повертає `file_not_found` лише на `NotFound` від `File::open`;
      `file_play_failed` на решту відмов відкриття й на нерозібраний формат;
      `output_unavailable` на пристрій виведення. Жодної прози, шляху чи чисел; тест Rust на
      кожну гілку класифікації, зокрема «доступ заборонено → `file_play_failed`»
- [x] Повна деталь (`{e:#}`) — у лозі на кожну відмову
- [x] `player_commands::play_file`, його реєстрацію в `lib.rs` і `tauri.playFile` прибрано
- [x] `playRefusalMessage` мапить `file_not_found` і `file_play_failed` на ключі з таблиці;
      тест на кожен код
- [x] `SongsPanel.handlePlay` і `App.tsx` `handlePlayerEnded` показують відмову через
      `playRefusalMessage`; тести на обидва виклики
- [x] Ключ `file_play_failed` — в обох локалях
- [x] `docs/help/` (обидві локалі):
  - [x] `songs.md`, «Відтворити й відкрити»: якщо файла вже немає на місці, Tapir скаже
        **Файл не знайдено** — і на `Enter`, і на `Alt+Enter`
  - [x] `troubleshooting.md`: розділ «Файл не відкривається в іншій програмі» стає «Файл не
        відтворюється або не відкривається»; спільна причина (перемістили поза Tapir) і
        ліки (`Ctrl+Enter`) — один раз; абзац про **Не вдалося відтворити файл**: файл тримає
        інша програма (редактор тегів) — закрийте її; файл битий — `Alt+Enter` покаже, чи
        грає він деінде
- [x] `cargo test`, `cargo clippy --all-targets`, `pnpm test`, `pnpm typecheck`,
      `pnpm vite:build` — без помилок
- [ ] NVDA-прогін, в обох локалях (не проводився: користувач прийняв зміну без прогону
      2026-10-04; три сценарії нижче лишаються готовим планом ручної перевірки):
  - [ ] екран «Записи» відкрито, трек видалено в Провіднику, `Enter` на його рядку: тост
        «Файл не знайдено», одна репліка, рядок лишається
  - [ ] у теку записів покладено текстовий файл із розширенням `.mp3`, екран перечитано,
        `Enter` на ньому: тост «Не вдалося відтворити файл»
  - [ ] автоперехід: поки грає трек, наступний за ним видалено в Провіднику; коли перший
        закінчився — тост «Файл не знайдено» (не «Помилка відтворення»), відтворення
        зупинилось

## Спадок

- **Класифікація типом.** `play_file` (`src-tauri/src/player/engine.rs`) вішає зовнішній
  контекст `FileRefusal { NotFound, Unplayable, Output }` — файловий близнюк `LiveRefusal`.
  `NotFound` дає лише `io::ErrorKind::NotFound` від `File::open` (`FileRefusal::of_open`);
  доступ заборонено, зайнятий файл і нерозібраний формат — `Unplayable`. Шлях живе у
  внутрішньому контексті, тобто лише в лозі.
- **Дріт.** `file_refusal_on_wire` (`src-tauri/src/commands/player_commands.rs`) пише `{e:#}`
  у лог і віддає `file_not_found` / `file_play_failed` / `output_unavailable`;
  некласифіковане — `file_play_failed`. Викликає його `play_saved_song`.
- **Сторожі.** Тести рушія на справжній ФС: зниклий файл, тека (на Windows — «доступ
  заборонено»), текст із розширенням `.mp3`; плюс синтетичний `PermissionDenied`. Чотири
  тести коду на дроті в `player_commands.rs`.
- **Фронтенд.** `playRefusalMessage` мапить обидва нові коди; `SongsPanel.handlePlay` показує
  відмову через нього. Тіло `handlePlayerEnded` переїхало з `App.tsx` у
  `transportControl.executeEndedAdvance` — заради тесту; поведінка та сама, крім причини в
  тості.
- **Прибрано:** `player_commands::play_file`, його реєстрація в `lib.rs`, `tauri.playFile`.
- **Поза обсягом, свідомо (п. 7):** перехід уперед/назад (`reportSkipFailure`) досі каже
  «Помилка відтворення» на будь-яку відмову файлу, крім кодека; відновлення останнього
  джерела відповідає `ResumeFailure::Error`.
- **Знахідка огляду:** `rename_song` і редагування тегів у `songs_commands.rs` досі шлють
  прозу («Stop playback first…», «Unsupported audio format») — той самий клас вади, запису
  ще немає.

## Документи

- [play-refusals-untranslated](p2-play-refusals-untranslated.md) — батьківський запис, коди й мапер
- [record-refusals-untranslated](p2-record-refusals-untranslated.md) — той самий клас для запису
- [ADR 2026-08-17 — локалізація нативного шару](../../decisions/2026-08-17-native-layer-localisation.md)
- [ADR 2026-09-06 — помилка як діагноз](../../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md) §5
- Код: `src-tauri/src/player/engine.rs` (`play_file`),
  `src-tauri/src/commands/songs_commands.rs` (`play_saved_song`),
  `src-tauri/src/commands/player_commands.rs` (`play_file` — мертва),
  `src/lib/playRefusal.ts`, `src/lib/shellOpenError.ts` (прецедент `not_found`),
  `src/components/songs/SongsPanel.tsx` (`handlePlay`), `src/App.tsx` (`handlePlayerEnded`),
  `src/lib/transportControl.ts` (`reportSkipFailure` — поза обсягом)
