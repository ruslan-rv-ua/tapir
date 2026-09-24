---
slug: file-position-lost-on-external-stop
title: "Позиція файлу губиться після зупинки медіа-клавішею, `--stop-playback` чи перемиканням профілю"
summary: "Медіа-клавіша «Стоп», `--stop-playback` і перемикання профілю не зберігають позицію файлу: продовження останнього починає файл з нуля"
priority: P2
type: planned
status: ready
effort: S
kind: bug
target: 0.1.1
updated: 2026-09-24
a11y: false
depends_on: []
blocks: []
touches:
  - src-tauri/src/smtc.rs
  - src-tauri/src/cli.rs
  - src-tauri/src/commands/profile_commands.rs
  - src-tauri/src/playback_control.rs
  - src-tauri/src/app_state.rs
  - docs/data-models.md
gates: [cargo test, cargo clippy --all-targets]
notes:
  - "Знахідка огляду архітектури 2026-09-24; дослідник і скептик згодні. Первинний огляд казав, що губиться останнє джерело, — хибно: губиться лише позиція файлу."
  - "У v0.1.0 те саме: `git grep persist_session_snapshot v0.1.0` дає ті самі місця виклику; `smtc.rs` і `player/engine.rs` відтоді не змінювались."
  - "a11y: false — оголошення не змінюються; котре з двох наявних звучить при продовженні, вирішують дані профілю."
---

# Позиція файлу губиться після зупинки медіа-клавішею, `--stop-playback` чи перемиканням профілю

> **Контекст:** знахідка [огляду архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md).
> `planned` + `ready` → **РЕАЛІЗАЦІЯ**. Номери рядків — стан на f09f36b; шляхи Rust — від
> `src-tauri/src/`.

## Опис

Позиція файлу (`player_session.last_file_position`) — одне з [Сесійних полів](../../CONTEXT.md)
профілю: на диск вона потрапляє на переходах, коли місце виклику не забуло про
`persist_session_snapshot`. Три шляхи зупинки забувають: системні медіа-клавіші,
`tapir --stop-playback` і перемикання профілю. У профілі лишається позиція зі старту
відтворення — нуль, а для файлу, запущеного продовженням останнього, — та давніша точка.

Останнє джерело не губиться: `last_active`, шлях файлу й `last_stream_id` пишуться на старті
відтворення, тож продовжується правильний файл, лише з неправильного місця. Потоки не
втрачають нічого. Найбільше втрачає довгий файл, як-от суцільний файл ефіру: екран «Записи»
показує й його (`songs/scanner.rs:102` обходить теку записів рекурсивно).

## Як відтворити

Передумова: **Відновлювати файл** = «З останньої позиції» (типово, `profile.rs:358-359`).

1. На екрані «Записи» увімкнути файл і дати йому дограти до 12:30.
2. Зупинити одним із трьох способів: медіа-клавіша «Стоп»; `tapir --stop-playback` при
   запущеному Tapir; перемикання на інший профіль на екрані «Профілі» (`Alt+0`) і назад.
3. Продовжити останнє: `Ctrl+Shift+K`, «Грати» в треї (немає в 0.1.0) або перезапуск з
   **Відновлювати останнє відтворення при запуску**.

Файл починається з 0:00 зі звичайним оголошенням старту замість «Відтворення — …, з 12:30»
(`playback_resuming`). Нормальний вихід із програми цього не лагодить. Для порівняння: з
кнопкою «Зупинити» в плеєрі чи в треї файл продовжується з 12:30. Медіа-пауза сама позицію
не губить (вихід її рятує) — губить, якщо далі йде один із трьох способів або аварія.

## Що обіцяно

- [CONTEXT.md](../../CONTEXT.md), «Сесійні поля» (:316-320): поля пишуться на переходах, серед
  них «пауза/зупинка файлу». Там само (:176): поки щось грає, медіа-клавіші поводяться як
  головна кнопка, а її пауза файлу (`PauseFile`) позицію зберігає.
- Довідка, «Робота у фоні»: медіа-клавіші керують відтворенням так само, як кнопки
  програвача (`docs/help/uk/background.md:25`, en :25); кнопка «Зупинити» позицію зберігає.
- Довідка, «Продовжити останнє»: файл іде зі збереженої позиції або з початку — за
  **Відновлювати файл** (`docs/help/uk/player.md:37`, en :37; мітка
  `settings_resume_from_position`, `src/i18n/messages/uk.json:391`).
- Довідка, «Перемикання»: перемикання зупиняє відтворення (`docs/help/uk/profiles.md:11`,
  en :11) — це зупинка файлу за правилом CONTEXT.
- [playback-toggle-stop-pause](done/p1-playback-toggle-stop-pause.md), рішення #7 (:64):
  збереження позиції на pause / stop / зміні треку / виході; підключено лише клавішу, трей,
  IPC-зупинку й вихід.

## Причина

- `persist_session_snapshot` (`playback_control.rs:177-195`) кличуть на старті
  (`commands/player_commands.rs:39`, `:60`, `commands/songs_commands.rs:39`,
  `playback_control.rs:342`, `:365`) і перед зупинкою чи паузою в трьох місцях: IPC
  `stop_playback` (`commands/player_commands.rs:87`), «Зупинити» в треї
  (`tray/handlers.rs:52`), гілка `PauseFile` (`playback_control.rs:238`). Вихід має власну
  копію (`app_state.rs:119-137`): статус до зупинки, один Коміт разом із гучністю.
- Без виклику: `smtc.rs:230` (Pause файлу) і `:235` (Stop); `cli.rs:272`
  (`Action::StopPlayback`, для обох контекстів — `cli.rs:143-145`);
  `commands/profile_commands.rs:193` — `switch_profile` зупиняє плеєр, а Коміт у старий
  профіль (:200-211) пише лише `player_session.volume`, до завантаження нового (:214).
  Фронтенд не зупиняє перед перемиканням: `src/components/profile/ProfilesPanel.tsx:125`.
- Чому вихід не рятує: `stop_playback` (`player/engine.rs:318-330`) забирає сесію
  (`stop_session`, :194-201), `get_status` повертає `source: None` (:171-178), а
  `apply_session_snapshot` його пропускає (`playback_control.rs:169`). Пауза сесію лишає.

## Виправлення

У межах наявного механізму: IPC, події, тости й тексти не змінюються; нового i18n-ключа не
треба.

1. `smtc.rs:230` і `:235`: перед викликом плеєра —
   `crate::playback_control::persist_session_snapshot(&app).await`, як `tray/handlers.rs:52`.
   Гілці живого джерела (:228) виклик не потрібен — так само, як `StopStream`
   (`playback_control.rs:230`): дискримінатор записано на старті, позиції немає.
2. `cli.rs:272`: той самий виклик перед `stop_playback`.
3. `switch_profile`: прочитати `get_status()` до зупинки на :193 і викликати
   `apply_session_snapshot` у Коміті гучності (:200-211). Окремий `persist_session_snapshot` дав би другий Коміт
   профілю, якого `graceful_shutdown` свідомо уникає (`app_state.rs:119-121`).
4. Тіло цього Коміту (гучність + `apply_session_snapshot`) — чиста функція в
   `playback_control.rs`, спільна для `switch_profile` і `graceful_shutdown`: дві копії
   розійшлися саме тут, і це точка для регресійного тесту.

## Поза межами

- **Усунення класу.** `persist_session_snapshot` — вісім викликів у чотирьох модулях плюс
  власна копія виходу; кожен новий шлях зупинки мусить про нього пам'ятати. Дієслова
  програвача, що самі зберігають Сесійні поля, — ідея
  [playback-verbs-persist-session](p2-playback-verbs-persist-session.md) з того самого огляду.
- **Одне згортання для перемикання й виходу** — ідея [profiles-module](p2-profiles-module.md);
  тут перемикання лише отримує функцію Коміту виходу.
- **Кнопка паузи в плеєрі** (`commands/player_commands.rs:65-70`) позиції не зберігає, як і
  записано в `docs/data-models.md` §3.7 (:250); після виправлення її позиція губиться лише
  при аварії. Чи писати на паузі — питання до playback-verbs-persist-session.

## Критерії готовності

- [ ] `docs/help/` не змінюється: довідка вже обіцяє цю поведінку (`background.md:25`,
      `player.md:37`, `profiles.md:11`, обидві мови); виправлення робить обіцянку правдою
- [ ] Медіа-клавіша «Стоп» і `--stop-playback` зберігають позицію файлу перед зупинкою,
      медіа-пауза — перед паузою
- [ ] `switch_profile` пише позицію в старий профіль тим самим Комітом, що й гучність
- [ ] Rust-тест спільної функції Коміту в `playback_control.rs`: файл на 750 000 мс →
      гучність + `last_file_position` (шлях, 750 000); `source: None` → лише гучність,
      наявна позиція не змінена
- [ ] Ручна перевірка трьох способів з «Як відтворити»: `Ctrl+Shift+K` продовжує з 12:30 і
      оголошує позицію. SMTC і CLI юніт-тестом не покрити — жоден тест не будує `AppState`
- [ ] `docs/data-models.md` §3.7: рядок «Зупинка файлу» з усіма шляхами, рядок «Перемикання
      профілю» (позиція — у старий профіль), медіа-клавіша в рядку паузи
- [ ] `cargo test`, `cargo clippy --all-targets` зелені

## Документи

- [Огляд архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md) — звідки знахідка
- [playback-verbs-persist-session](p2-playback-verbs-persist-session.md),
  [profiles-module](p2-profiles-module.md) — ідеї, що прибирають клас
- [playback-toggle-stop-pause](done/p1-playback-toggle-stop-pause.md) — ввів
  `persist_session_snapshot` і пообіцяв збереження на кожному переході
- [resume-file-from-setting](done/p2-resume-file-from-setting.md) — налаштування, чию
  обіцянку ламає дефект; [resume-last-playback](done/p1-resume-last-playback.md) —
  автовідтворення
- [tray-cannot-resume-last](done/p2-tray-cannot-resume-last.md),
  [player-primary-button-resumes-last](p2-player-primary-button-resumes-last.md) — інші
  поверхні продовження, що показують втрачену позицію
- [data-models.md](../data-models.md) §3.7; [CONTEXT.md](../../CONTEXT.md) — «Сесійні поля»,
  «Головна кнопка і останнє джерело»
- Довідка: [background](../help/uk/background.md), [player](../help/uk/player.md),
  [profiles](../help/uk/profiles.md) та en-близнюки
