---
slug: cli-profile-override-persists
title: "`--profile` не сеансовий: перше ж збереження налаштувань пише його в settings.json"
summary: "`--profile` оголошено сеансовим, але будь-який запис налаштувань за сеанс (і гасіння перенесеного автозапуску) пише його в settings.json"
priority: P2
type: planned
status: ready
effort: S
kind: bug
target: 0.1.1
updated: 2026-09-25
a11y: false
depends_on: []
blocks: []
touches:
  - src-tauri/src/lib.rs
  - src-tauri/src/app_state.rs
  - src-tauri/src/settings_store.rs
  - src-tauri/src/commands/profile_commands.rs
  - docs/architecture.md
  - docs/help/en/background.md
  - docs/help/uk/background.md
gates: [cargo test, cargo clippy --all-targets]
notes:
  - "Перевірено читанням коду, без запуску. У v0.1.0 те саме: коментар `lib.rs:81`, підміна `:90`, `save_detached` `:194`."
  - "Знайдено на рев'ю corrupt-active-profile-aborts-startup (гілка fix/corrupt-active-profile-aborts-startup, 15f587f): з troubleshooting.md прибрано пораду стартувати з `--profile`, бо речення «діє лише на цей запуск» було неправдою."
---

# `--profile` не сеансовий: перше ж збереження налаштувань пише його в settings.json

> **Контекст:** вада, знайдена на рев'ю
> [corrupt-active-profile-aborts-startup](done/p1-corrupt-active-profile-aborts-startup.md).
> `planned` + `ready` → **РЕАЛІЗАЦІЯ** за варіантом А (рішення 2026-09-25, див. «Варіанти»).
> Номери рядків — стан на `5553236`.

## Опис

`tapir.exe --profile "Новини"` підмінює `active_profile` у тій самій `GlobalSettings`, яка
стає `AppState.settings`. Налаштування пишуться лише цілком, тож перший же їхній запис у
цьому сеансі кладе «Новини» в `settings.json` як `activeProfile`. Наступний звичайний запуск
(без параметра — з меню «Пуск», з автозапуску) відкриває «Новини», а не профіль, у якому
людина працювала до того. Нічого не каже, що профіль змінився, крім назви в рядку активності.

Записати налаштування досить будь-якою дією у вікні налаштувань — поставити чи зняти
прапорець, вибрати пристрій виводу, змінити гарячу клавішу. Один шлях пише взагалі без дії
людини: Tapir, запущений з `--profile` після перенесення теки з увімкненим автозапуском,
гасить автозапуск і зберігає налаштування ще до завантаження профілю.

## Як відтворити

1. Активний профіль «Музика». Створити ярлик `tapir.exe --profile "Новини"`, закрити Tapir.
2. Запустити ярлик — Tapir у «Новинах», як і обіцяно.
3. У налаштуваннях на вкладці «Загальне» зняти й повернути будь-який прапорець. Закрити Tapir.
4. Запустити Tapir звичайним ярликом, без параметрів — він у «Новинах». У `data/settings.json`
   `"activeProfile": "Новини"`.

Варіант без кроку 3: Tapir із увімкненим автозапуском перенесено в іншу теку (або змінилася
літера флешки), і з нової теки його вперше запущено з `--profile "Новини"`. Tapir оголошує,
що автозапуск вимкнено, а `settings.json` уже містить `"activeProfile": "Новини"`.

## Що обіцяно

- Коментар `src-tauri/src/lib.rs:80-84`: «Session-only override (decision §7): we do NOT save
  settings.json here».
- [architecture.md](../architecture.md) `:268`: «`--profile` → підмінити active_profile ←
  сеансовий override, settings.json НЕ пишемо».
- Довідка ([background.md en](../help/en/background.md) `:43`, [uk](../help/uk/background.md)
  `:43`) обіцяє лише «стартувати в цьому профілі» — ані «на один запуск», ані «назавжди».
  Тобто довідка не бреше, але й не каже, чого чекати; порада з troubleshooting.md у записі
  corrupt-active-profile-aborts-startup (злито PR #30) впала на рев'ю саме через це.
- **Рішення №7** специфікації фази 3G (`docs/superpowers/specs/2026-06-13-3g-cli-design.md`,
  додана `f399eeb`, видалена `74e1511`; читати `git show f399eeb:<шлях>`, розділ 2 п. 7 і
  §3.6) цю «липкість» **знало й прийняло**: override стає постійним, щойно сеанс викличе
  будь-яке збереження налаштувань (`switch_profile`, `save_settings`, `set_output_device`),
  бо «персиститься свідома дія користувача в сесії, що прийнятно». Коментар у `lib.rs` і
  рядок в architecture.md цю умову загубили й читаються як безумовне «не пишемо».

Чому рішення №7 варто переглянути, а не лише дописати коментар:

1. **Шлях без дії людини.** Гасіння автозапуску після перенесення (`lib.rs:193-202`, підфаза
   3I-2) з'явилося після 3G і пише `settings` з уже підміненим `active_profile` ще до
   `Profile::load`. Під «свідому дію в сесії» воно не підпадає.
2. **Свідома дія — про інше.** Людина, що знімає прапорець сповіщень, вибирає сповіщення, а
   не профіль за замовчуванням. `switch_profile` — єдина дія, для якої запис профілю і є
   наміром; вона пише `active_profile` сама (`profile_commands.rs:219-238`).
3. **Записує кожна вкладка.** Автозбереження `useSettingsAutoSave` (`src/hooks/useSettingsAutoSave.ts:24`,
   вкладки «Загальне» й «Звук») і `HotkeysTab.tsx:54` шлють усю `$settings` через
   `save_settings`, а та замінює налаштування цілком (`settings_commands.rs:22-26`,
   `*current = settings`). `$settings` фронтенд отримав від `get_settings`, тож у ній уже
   підмінене ім'я.

## Причина

- `src-tauri/src/lib.rs:85-93`: для відомого імені `initial_settings.active_profile = name.clone()`.
- `lib.rs:188` → `AppState::new(settings, …)` (`:219`) → `AppState.settings`
  (`app_state.rs:50`).
- Усі записи `settings.json` серіалізують `GlobalSettings` цілком; `active_profile`
  (`settings.rs:18-19`) має лише `#[serde(default)]`, без `skip_serializing`:
  - `AppState::commit_settings` (`app_state.rs:90-96`) → `FileSettingsStore::save`
    (`settings_store.rs:25-27`);
  - його викликачі — `save_settings` (`settings_commands.rs:22`), `set_output_device`
    (`player_commands.rs:149`), `switch_profile` (`profile_commands.rs:221`, `:234`);
  - `settings_store::save_detached` (`settings_store.rs:36`) з `lib.rs:199` (перенесений
    автозапуск). Другий виклик, `GlobalSettings::load` (`settings.rs:202`), іде до підміни —
    він безпечний: перший старт без `settings.json` пише `Default`.
- Штатний вихід (`graceful_shutdown`) пише профіль, не налаштування, — тому без жодного
  збереження за сеанс підміна справді не переживає перезапуску.

## Варіанти

**А. Сеансовий по-справжньому — ВИБРАНО 2026-09-25.** Ім'я на диску живе окремо від імені в
пам'яті: `AppState` пам'ятає `active_profile` з файлу, коли `--profile` його підмінив, і
кожен запис налаштувань серіалізує копію з файловим значенням. `switch_profile` — свідомий
вибір профілю — це «запам'ятоване» значення замінює своїм, і далі все як зараз. Гасіння
автозапуску в `lib.rs` пише копію з початковим значенням (його там легко зберегти до
підміни). Місце підстановки — сховище (`FileSettingsStore` / `save_detached`) чи обгортка в
`commit_settings` — вибрати під час реалізації; IPC, `get_settings` і все, що фронтенд
показує як активний профіль, не змінюються. Після цього поради `--profile` на випадок
пошкодженого профілю повертаються в довідку.

**Б. Постійний за визначенням — відхилено.** `--profile` = перемикання профілю на старті: одразу
записати `active_profile` (тим самим `save_detached`), виправити коментар, architecture.md і
довідку («стартувати в цьому профілі й зробити його активним»). Просто й передбачувано, але
ярлик на рідко потрібний профіль тоді щоразу «забирає» звичайний запуск — сценарій, заради
якого параметр існує, ламається.

**В. Лишити як є, дописати умову.** Відхилено: «сеансовий, доки ви нічого не змінили в
налаштуваннях» не можна ні пояснити в довідці, ні передбачити людині; і шлях автозапуску
лишається без жодної дії людини.

## Критерії готовності

- [ ] Після старту з `--profile X` жоден запис налаштувань без `switch_profile` не змінює
      `activeProfile` у `settings.json`; зокрема гасіння автозапуску в `lib.rs`
- [ ] `switch_profile` у сеансі з `--profile` записує вибраний профіль, і наступні записи
      налаштувань його не повертають
- [ ] Rust-тест на шов підстановки: підміна → запис налаштувань → на диску файлове ім'я;
      підміна → перемикання → запис → на диску ім'я перемикання
- [ ] Коментар `lib.rs:80-84` і `docs/architecture.md:268` описують, що саме гарантовано
      (і посилаються на це рішення, а не на «decision §7» видаленої специфікації)
- [ ] `docs/help/{en,uk}/background.md`: біля `--profile` сказано, що параметр діє на цей
      запуск і активного профілю не змінює; у `troubleshooting.md` (підрозділ про «Помилку
      запуску» через профіль, en `:77` і uk) повернути пораду стартувати з `--profile`
      в іншому профілі, поки файл не повернуто
- [ ] `cargo test`, `cargo clippy --all-targets` зелені; `pnpm test` зелений, якщо
      змінювалась довідка (ворота слів)

## Документи

- [corrupt-active-profile-aborts-startup](done/p1-corrupt-active-profile-aborts-startup.md) — звідки знахідка
- Специфікація 3G, рішення №7: `git show f399eeb:docs/superpowers/specs/2026-06-13-3g-cli-design.md`
- [architecture.md](../architecture.md) — порядок старту
- [autostart](done/p2-autostart.md) — підфаза 3I-2, гасіння автозапуску після перенесення
- [settings-commit-seam](done/p1-settings-commit-seam.md) — `commit_settings` і `save_detached`
- Код: `src-tauri/src/lib.rs`, `src-tauri/src/app_state.rs`, `src-tauri/src/settings_store.rs`,
  `src-tauri/src/commands/settings_commands.rs`, `src-tauri/src/commands/profile_commands.rs`
