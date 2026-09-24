---
slug: corrupt-active-profile-aborts-startup
title: "Пошкоджений або відсутній активний профіль мовчки обриває запуск Tapir"
summary: "Битий або відсутній файл активного профілю обриває старт: вікно блимає й зникає без діалогу й рядка в журналі — щоразу; лікує наявний діалог старту"
priority: P1
type: planned
status: ready
effort: S
kind: bug
target: 0.1.1
updated: 2026-09-24
a11y: true
depends_on: []
blocks: []
touches:
  - src-tauri/src/lib.rs
  - src-tauri/src/i18n.rs
  - src/i18n/messages/en.json
  - src/i18n/messages/uk.json
  - docs/help/en/troubleshooting.md
  - docs/help/uk/troubleshooting.md
gates: [cargo test, cargo clippy --all-targets, pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Перевірено читанням коду, без запуску. У v0.1.0 той самий `expect` (`lib.rs:199`) і `panic = \"abort\"` у `[profile.release]`; `expect` живе з 9b3a91a (2026-04-14)."
---

# Пошкоджений або відсутній активний профіль мовчки обриває запуск Tapir

> **Контекст:** знахідка [огляду архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md).
> У v0.1.0 так само. `planned` + `ready` → **РЕАЛІЗАЦІЯ**. Номери рядків — стан на f09f36b.

## Опис

На старті Tapir читає файл активного профілю, названого в Глобальних налаштуваннях
(`settings.json`, `activeProfile`). Якщо файлу немає, він не читається або не розбирається,
процес обривається посеред `setup`: вікно блимає й зникає без діалогу й без рядка в
`tapir.log` — на кожному старті, доки файл не повернуть або `settings.json` не виправлять
руками. З NVDA не чути нічого, пояснення немає ні на екрані, ні в журналі.

Шляхи сюди: файл профілю видалили, перейменували чи правили руками в портативній теці;
`settings.json` перенесли з установки з іншим набором профілів; збій живлення одразу після
перейменування профілю й переходу на нього (`Profile::rename` пише неатомарно —
[profile-rename-not-atomic](p2-profile-rename-not-atomic.md)).

## Як відтворити

На збірці `release`, як випущено (`release-fast` має `panic = "unwind"`, `Cargo.toml:118`).

1. Створити профіль «Новини», перейти на нього, закрити Tapir.
2. У `data\profiles\` поруч із `tapir.exe` видалити `Новини.tapirprofile` або замінити його
   вміст на `{`. Для «Default» — лише друге: відсутній Default створюється заново.
3. Запустити `tapir.exe`: вікно на мить з'являється й зникає, діалогу немає, NVDA нічого не
   пояснює, у `data\logs\tapir.log` про профіль нічого. Повторний запуск — те саме.

## Що обіцяно

- Невдалий старт має власну поверхню — діалог, що працює без `AppState`
  ([ADR 2026-08-17](../decisions/2026-08-17-native-layer-localisation.md) §3).
- [resume-last-playback](done/p1-resume-last-playback.md), таблиця помилок (рядок 101): для
  пошкодженого профілю покладається на «існуючу обробку завантаження профілю» — на старті її немає.
- Довідка «Якщо нічого не допомогло» (`docs/help/uk/troubleshooting.md:75`, en :75) веде в
  `tapir.log`, куди причина не доходить.

## Причина

- `lib.rs:204`, у `setup`: `Profile::load(&settings.active_profile).expect("Failed to load profile")`;
  `Cargo.toml:110` — `panic = "abort"` у `[profile.release]`. Вікно вже показане й у фокусі
  (`lib.rs:163`, :174), тож воно блимає; з `--minimize` так само — ховання чекає
  `frontend_ready` (:176-186).
- Журнал: `set_hook` немає ні в `src-tauri/src`, ні в tauri 2.10.3 / tauri-plugin-log 2.8.0;
  стандартний хук пише в stderr, якого в релізі немає (`main.rs:1`). Встановлено читанням
  коду, прогоном не перевірено.
- `Profile::load` (`profile.rs:572-591`) повертає `Err`: файлу не-Default профілю немає —
  `NotFound` (:574-581); не читається — `Io` (:582); не розбирається — `Json` (:584), для
  Default теж. Default створюється лише за відсутності файлу (:575-578).
- Решта коду ту саму помилку переживає: `Profile::list` пропускає битий файл із `warn!`
  (`profile.rs:683-692`), `switch_profile` повертає її у вікно (`commands/profile_commands.rs:214`).
- Механізм показу — рядком нижче: невдачу `AppState::new` гілка `lib.rs:205-218` пише в журнал
  (:208), показує `StartupErrorTitle`/`StartupErrorBody` (:209-215) і повертає `Err` (:216).
  Але тіло (`en.json:724`, `uk.json:724`) радить перевірити аудіопристрій — `AppState::new`
  падає лише на `PlayerEngine::new` (`app_state.rs:42-46`). Для профілю порада хибна.

## Виправлення

Той самий діалог невдалого старту; IPC і нових поверхонь немає.

1. `lib.rs:204`: замість `expect` — `match` за зразком гілки `AppState::new`: `log::error!` із
   назвою профілю й помилкою → діалог → `return Err(...)`.
2. **Потрібен новий ключ i18n** (напр. `startup_error_profile_body`) в `en.json` і `uk.json` та
   новий варіант `Key` поруч зі `StartupError*` (`i18n.rs:111-112`); заголовок — наявний
   `StartupErrorTitle`. Тіло називає профіль і файл `data\profiles\<назва>.tapirprofile`,
   показує `{error}` і радить повернути робочу копію файлу. «Видалити файл» не радити: для
   не-Default це той самий `NotFound`; `--profile Default` задуманий на один сеанс (`lib.rs:81-82`).
3. Тіло з `(назва, &RadioError)` будує чиста функція поза `setup` — її й тестувати.
4. `blocking_show` у `setup` блокує головний потік, хоча `tauri-plugin-dialog` 2.7.0 так не
   радить (доккоментар, `src/lib.rs:355-356` крейта). За кодом взаємоблокування немає
   (`tauri-runtime-wry` 2.10.1 `send_user_message` виконує завдання одразу, rfd 0.16.0 показує
   діалог в окремому потоці, без власника); ризик — передній план. Гілка `AppState::new` робить
   те саме й наживо не перевірена; якщо діалог не на передньому плані — лагодити обидві гілки
   разом (напр. `MessageDialogBuilder::parent`).

## Поза межами

- **Вихід після діалогу.** `Err` із `setup` Tauri перетворює на `panic!` (tauri 2.10.3,
  `src/app.rs:1298-1299`) — у релізі це abort, але вже після прочитаного діалогу. Спільне з
  гілкою `AppState::new`; не міняємо.
- **Битий `settings.json`** — той самий клас, але раніше: `GlobalSettings::load().expect(…)`
  (`lib.rs:73`, `settings.rs:198-210`) іде до білдера Tauri, плагінів журналу й діалогів і до
  вибору локалі (`lib.rs:78`) — діалогу там ще немає. Так само `ensure_data_dirs` (:69) і
  `setup_tray` (:234). Окремий запис за потреби.
- **Неатомарне перейменування** лікує [profile-rename-not-atomic](p2-profile-rename-not-atomic.md);
  єдиного власника «профілю за назвою» пропонує [profiles-module](p2-profiles-module.md).

## Відкриті питання

- **Відкат на Default замість зупинки** — стартувати в Default, переписати `activeProfile` і
  сказати про це. Людина одразу в застосунку, порада з п. 2 перестає бути вузьким місцем. Але це
  рішення про поведінку: потрібен носій повідомлення після старту (гейт `frontend_ready`, як
  `autostart::StartupNotice`), а битий файл лишається. Не для 0.1.1 — окремий запис.

## Критерії готовності

- [ ] Довідка: `docs/help/en/troubleshooting.md` і `uk/` — короткий підрозділ про «Помилку
      запуску» через профіль і як повернути профіль; `build/helpContent.test.ts` зелений
- [ ] Відсутній, нечитабельний і битий файл активного профілю дають діалог невдалого старту з
      текстом про профіль; причина — в `tapir.log` до діалогу; `expect` на `Profile::load` немає
- [ ] Новий ключ є в `en.json` і `uk.json`, новий варіант `Key` стереже
      `every_key_exists_in_both_locales` (`i18n.rs:216`); `StartupErrorBody` не змінено
- [ ] Rust-тест на функцію тіла: для `NotFound` і `Json` тіло в uk і en (`i18n::with_locale`,
      `i18n.rs:201`) містить назву профілю й ім'я файлу та не збігається з `startup_error_body`
- [ ] Ручна перевірка на `release`: діалог на передньому плані, Enter закриває, процес не висить
- [ ] NVDA: NVDA сам, без Alt+Tab, читає «Помилка запуску» і текст із назвою профілю; те саме
      з `--minimize`
- [ ] `cargo test`, `cargo clippy --all-targets`, `pnpm test`, `pnpm typecheck`, `pnpm vite:build` зелені

## Документи

- [Огляд архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md) — звідки знахідка
- [ADR 2026-08-17 — локалізація нативного шару](../decisions/2026-08-17-native-layer-localisation.md) §3
- [tray-layer-not-localized](done/p1-tray-layer-not-localized.md) §5 — звідки ключі `startup_error_*`
- [resume-last-playback](done/p1-resume-last-playback.md) — таблиця помилок спирається на цю обробку
- [profile-rename-not-atomic](p2-profile-rename-not-atomic.md) — один зі шляхів сюди
- Довідка: [troubleshooting (uk)](../help/uk/troubleshooting.md), [troubleshooting (en)](../help/en/troubleshooting.md),
  [background (en)](../help/en/background.md) — `--profile`
- [CONTEXT.md](../../CONTEXT.md) §«Профіль»
- Код: `src-tauri/src/lib.rs`, `src-tauri/src/profile.rs`, `src-tauri/src/i18n.rs`, `src-tauri/Cargo.toml`
