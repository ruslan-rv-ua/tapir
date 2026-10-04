---
slug: song-edit-refusals-untranslated
title: "Відмова перейменувати, змінити теги чи видалити трек приходить у тост англійською"
summary: "rename_song, update_song_tags і delete_song шлють англійську прозу («Stop playback first…», «IO error: …»); тост клеїть її в «Не вдалось виконати дію: {error}»"
priority: P2
type: planned
status: draft
effort: S
kind: bug
target: 0.1.1
updated: 2026-10-04
a11y: true
depends_on: [play-refusals-untranslated]
blocks: []
touches:
  - src-tauri/src/commands/songs_commands.rs
  - src-tauri/src/songs/ops.rs
  - src-tauri/src/songs/tags.rs
  - src/lib/tauri.ts
  - src/components/songs/RenameDialog.tsx
  - src/components/songs/TagEditorDialog.tsx
  - src/components/songs/SongsPanel.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
  - docs/help/uk/songs.md
  - docs/help/en/songs.md
gates: [cargo test, cargo clippy --all-targets, pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Заведено 2026-10-04 після злиття play-refusals-untranslated (PR #47): той самий клас вади на третій групі команд екрана «Записи». Залежність — спільний підхід (закритий перелік кодів, деталь у лозі, мапер «код → ключ»), а не спільний код: дім кодів для операцій над файлами вирішує грумінг."
  - "Звірено з HEAD 95a9bec (після злиття play-file-refusals-untranslated, PR #48): усі чотири виклики `songs_toast_failed` з прозою на місці; `play_saved_song` уже шле коди."
---

# Відмова перейменувати, змінити теги чи видалити трек приходить у тост англійською

> **Контекст:** заведено 2026-10-04, звірено з HEAD 95a9bec. Режим — **DRAFT → GROOMING**:
> довести до `ready`, коду не писати. Читати першим — батьківський
> [play-refusals-untranslated](done/p2-play-refusals-untranslated.md) і сусід
> [play-file-refusals-untranslated](done/p2-play-file-refusals-untranslated.md) — обидва закриті.

## Опис

Три команди екрана «Записи» (`src-tauri/src/commands/songs_commands.rs`) повертають
`Result<_, String>` із сирою англійською прозою, а фронтенд показує її як є, вклеюючи в ключ
`songs_toast_failed` — «Не вдалось виконати дію: {error}» / «Action failed: {error}». Україномовна
людина чує половину фрази українською, половину англійською.

| команда | виклик на фронтенді | проза в Rust |
|---|---|---|
| `rename_song` | `RenameDialog.tsx`, `handleSave` | «Stop playback first: this file is currently playing»; «Unsupported audio format»; `e.to_string()` від `ops::rename_file` і `scanner::read_song` |
| `update_song_tags` | `TagEditorDialog.tsx`, `handleSave` | «Unsupported audio format»; `e.to_string()` від `tags::write_song_tags` і `scanner::read_song` |
| `delete_song` | `SongsPanel.tsx`, `handleConfirmDelete` | «Stop playback first: this file is currently playing»; `e.to_string()` від `ops::delete_to_recycle_bin` |

Усі три виклики роблять те саме: `addToast(m.songs_toast_failed({ error: String(err) }), "error")`.

### Що виявила звірка з HEAD 95a9bec

1. **Захардкоджені рядки — лише верхівка.** Решта гілок віддає `Display` від `RadioError`
   (`src-tauri/src/errors.rs`), тобто ще гірше:
   - `ops::rename_file`: «Format error: rename: source is not a file», «Format error: Empty
     filename», «IO error: Access is denied. (os error 5)» від `std::fs::rename`;
   - `tags::write_song_tags`: «Format error: Read tags: …» / «Format error: Write tags: …» з
     текстом помилки `lofty`;
   - `ops::delete_to_recycle_bin`: «Not found: {повний шлях}» і «SHFileOperationW failed:
     0x{код}» — шлях і шістнадцяткове число в тості;
   - `scanner::read_song` після успішної операції — файл уже перейменовано чи переписано, а
     людина бачить відмову.
2. **«Stop playback first» — задокументована поведінка.** `docs/help/*/songs.md`,
   «Перейменування, теги й видалення», обіцяє: видалення відтворюваного файла не вдасться —
   «Tapir попросить спершу зупинити відтворення». Обіцянку виконано англійською. Для
   перейменування той самий захист є в коді, але довідка про нього мовчить.
3. **«Unsupported audio format» на практиці недосяжний.** Список будує сканер лише з
   `mp3`/`aac`/`m4a` (`scanner::format_from_extension`), а перейменування зберігає розширення.
   Гілка захисна; грумінг вирішує, чи вона заслуговує на код, чи на `unreachable`-подібне
   «внутрішня помилка → загальний код».
4. **Теги відтворюваного файла не захищені.** `update_song_tags` не перевіряє, чи файл зараз
   грає, на відміну від двох сусідів. Чи відмовить запис тегів, поки файл відкрито плеєром,
   — не перевірено; якщо відмовить, людина отримає «Format error: Write tags: …» замість
   «спершу зупиніть відтворення».
5. **Тост відмови з'являється, поки діалог відкритий.** У `RenameDialog` і `TagEditorDialog`
   діалог на відмову лишається відкритим, а `ToastContainer` (`role="log"`,
   `aria-live="polite"`) не має `data-live-announcer` — react-aria ховає все поза модальним
   вікном. За пам'яттю проєкту «live region inside modals» такий тост може бути німим для
   NVDA. Не перевірено; грумінг вирішує, чи це частина запису (носій відмови всередині
   діалогу), чи окремий запис.
6. **Масове видалення вже чесне.** `delete_songs` не відмовляє, а повертає `skipped` — його
   не чіпати.
7. **Четвертий виклик `songs_toast_failed`.** «Показати в теці» (`SongsPanel.tsx`, дія
   `explorer`) так само клеїть `String(e)` від `open_song_in_explorer` — текст
   `std::io::Error` з невдалого запуску `explorer.exe`. Гілка майже недосяжна, але це ще один
   вихід прози крізь той самий ключ.

## Чому це вада

Нативний шар шле коди, не прозу
([ADR 2026-08-17](../decisions/2026-08-17-native-layer-localisation.md)); причина — закритий
перелік, деталь — у лозі
([ADR 2026-09-06](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md) §5).
Обидва сусідні записи — [play-refusals-untranslated](done/p2-play-refusals-untranslated.md) і
[record-refusals-untranslated](done/p2-record-refusals-untranslated.md) — уже привели до цього
правила відтворення й запис.

## Відкриті питання для грумінгу

1. **Перелік кодів.** Кандидати: «файл відтворюється» (спільний для перейменування й
   видалення, а може й тегів — п. 4); «файл не знайдено» (`NotFound` типом, як у
   play-file-refusals-untranslated, — ключ `songs_open_not_found` уже є); «файл зайнятий або
   доступ заборонено»; загальна відмова на решту. Чи потрібен окремий код для «Кошик
   недоступний» (мережевий диск) — він веде до іншої дії людини?
2. **Ключі: окремий на кожну дію чи спільні?** «Не вдалося перейменувати файл» / «…зберегти
   теги» / «…видалити файл» проти одного «Не вдалося змінити файл». `songs_toast_failed` з
   плейсхолдером `{error}` після міграції має зникнути — інакше крізь нього проза повернеться;
   отже «Показати в теці» (п. 7 звірки) — в обсязі.
3. **Дім кодів.** `PLAY_ERR_*` і `file_refusal_on_wire` (з типом `FileRefusal`) живуть у
   `player_commands.rs`; для операцій над файлами — поруч чи в `songs_commands.rs`/`songs/`? Типізувати `ops`/`tags` (замість
   `RadioError::Format(String)`), щоб класифікація йшла типом, а не зіставленням рядків.
4. **Захист тегів відтворюваного файла** (п. 4 звірки) — в обсязі, якщо запис тегів справді
   відмовляє; інакше лише зафіксувати.
5. **Носій відмови в діалозі** (п. 5 звірки) — у цьому записі чи окремо.
6. **Довідка.** Чи називати захист відтворюваного файла також для перейменування (і тегів,
   якщо п. 4).

## Критерії готовності

> Чорнові — уточнюються на грумінгу.

- [ ] `rename_song`, `update_song_tags`, `delete_song` повертають лише коди із закритого
      переліку; жодної прози, шляху чи чисел; тест Rust на кожну гілку класифікації
- [ ] Повна деталь (`{e:#}` або `Debug`) — у лозі на кожну відмову
- [ ] Мапер «код → ключ» на фронтенді; `RenameDialog`, `TagEditorDialog` і
      `SongsPanel.handleConfirmDelete` показують відмову через нього; тест на кожен код і
      кожен виклик
- [ ] `songs_toast_failed` з `{error}` прибрано з обох локалей (або більше ніде не отримує
      нативний рядок)
- [ ] Нові ключі — в обох локалях
- [ ] `docs/help/` (обидві локалі), `songs.md` — оновлено за рішенням п. 6, або зазначено,
      що видимого тексту довідки запис не змінює
- [ ] `cargo test`, `cargo clippy --all-targets`, `pnpm test`, `pnpm typecheck`,
      `pnpm vite:build` — без помилок
- [ ] NVDA-прогін, в обох локалях:
  - [ ] трек відтворюється, `Delete` на його рядку й підтвердження: одна репліка мовою
        інтерфейсу, що спершу треба зупинити відтворення
  - [ ] трек відтворюється, `F2`, нове ім'я, `Enter`: та сама репліка; діалог лишається, і
        репліку чути, поки він відкритий
  - [ ] трек видалено в Провіднику, `F4`, зміна тегу, `Enter`: репліка мовою інтерфейсу без
        шляху

## Документи

- [play-refusals-untranslated](done/p2-play-refusals-untranslated.md) — батьківський запис, коди й мапер
- [play-file-refusals-untranslated](done/p2-play-file-refusals-untranslated.md) — сусід у тому самому файлі, `file_refusal_on_wire`
- [record-refusals-untranslated](done/p2-record-refusals-untranslated.md) — той самий клас для запису
- [ADR 2026-08-17 — локалізація нативного шару](../decisions/2026-08-17-native-layer-localisation.md)
- [ADR 2026-09-06 — помилка як діагноз](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md) §5
- Код: `src-tauri/src/commands/songs_commands.rs` (`rename_song`, `update_song_tags`,
  `delete_song`), `src-tauri/src/songs/ops.rs` (`rename_file`, `delete_to_recycle_bin`),
  `src-tauri/src/songs/tags.rs` (`write_song_tags`), `src-tauri/src/errors.rs` (`RadioError`),
  `src/components/songs/RenameDialog.tsx`, `src/components/songs/TagEditorDialog.tsx`,
  `src/components/songs/SongsPanel.tsx` (`handleConfirmDelete`),
  `src/components/common/ToastContainer.tsx` (п. 5), `src/lib/shellOpenError.ts` (прецедент
  `not_found`)
