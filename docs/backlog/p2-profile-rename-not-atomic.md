---
slug: profile-rename-not-atomic
title: "Перейменування профілю пише файл повз атомарне Сховище"
summary: "`Profile::rename` пише новий файл сирим `std::fs::write`, без tmp і `sync_all`: втрата живлення за секунди після перейменування може згубити профіль"
priority: P2
type: planned
status: ready
effort: S
kind: chore
target: 0.2.0
updated: 2026-09-24
a11y: false
depends_on: []
blocks: []
touches:
  - src-tauri/src/profile.rs
  - src-tauri/src/profile_store.rs
  - docs/data-models.md
gates: [cargo test, cargo clippy --all-targets]
---

# Перейменування профілю пише файл повз атомарне Сховище

> **Контекст:** знахідка [огляду архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md).
> Режим — **РЕАЛІЗАЦІЯ** (`planned` + `ready`). Номери рядків — стан на `f09f36b`.

## Опис

`Profile::rename` — єдиний запис у `data/profiles/`, що обминає Сховище: новий файл пише
сирий `std::fs::write` (без tmp і `sync_all`), старий одразу видаляє. Поки Windows не
скинула дані на диск (кілька секунд), зникнення живлення може лишити новий файл порожнім чи
обрізаним, тоді як видалення старого вже в журналі ФС: профіль губиться разом із Потоками,
Вішлістом і розкладом, а Tapir мовчить — лише рядок у лозі. Падіння самого процесу даних не
втрачає: старий файл видаляється лише після запису нового; гірше, що буває, — дублікат або
недописаний новий файл, що займає ім'я. Код однаковий на `f09f36b` і `v0.1.0`.

Не 0.1.1: тема патча вимагає `kind: bug` із дефектом, видимим у відвантаженій збірці, а тут
наслідок з'являється лише після збою ОС чи втрати живлення.

## Як відтворити

1. У панелі профілів перейменувати неактивний профіль «Робота» на «Нічні ефіри». Tapir
   оголошує нове ім'я, список показує «Нічні ефіри».
2. У межах кількох секунд — зникнення живлення або синій екран.
3. Після перезавантаження відкрити профілі. Залежно від того, що встигло на диск: обидва
   профілі (нешкідливий дублікат), лише «Робота» або жодного — пошкоджений «Нічні ефіри»
   мовчки пропущено. У двох останніх випадках перейменувати інший профіль на «Нічні ефіри»
   не вдається: помилка про наявний файл.
4. Якщо між кроками 1 і 2 людина перемкнулась на «Нічні ефіри» й до втрати живлення не було
   Коміту цього профілю (старт відтворення, штатний вихід), Tapir більше не стартує: вікно
   блимає й зникає, і так щоразу.

## Що обіцяно

- Doc-коментар `src-tauri/src/profile_store.rs:3`: цей модуль — «єдине місце в кодовій базі,
  яке пише файл профілю»; `:35` серед операцій `save_detached` називає перейменування.
- `src-tauri/src/store.rs:117-121` пояснює, що `sync_all` до `rename` стоїть саме проти
  цього збою; [CONTEXT.md](../../CONTEXT.md) §«Сховище» (`:307-308`) — той самий ланцюжок.
- Таблиця «Розподіл сайтів» у [profile-commit-seam](done/p0-profile-commit-seam.md) (`:131`)
  відносить `Profile::rename` до `save_detached`.
- Натомість [data-models.md](../data-models.md) (`:52-53`) записує обхід як відомий виняток —
  документи суперечать одне одному. Довідка надійності перейменування не обіцяє.

## Причина

- `src-tauri/src/profile.rs:731-734`: `profile.name = new_name` → `serde_json::to_string_pretty`
  → `std::fs::write(&new_path, …)` → `std::fs::remove_file(&old_path)`.
- Атомарний писар — `store.rs:123-139` `write_json_atomically`; профіль доходить до нього лише
  через `profile_store::save_detached` (`profile_store.rs:36`) і `AppState::commit_profile`,
  як і всі інші записи профілю (серед них `create`, `duplicate`, `save_imported`, трансфери).
- Сирий запис живе з `b96a155` (2026-06-01). Рефакторинг шва `f1e95f4` (2026-08-07) доручив
  пошук сайтів компілятору через приватизацію `Profile::save`
  (`done/p0-profile-commit-seam.md:123-124`), але `rename` ніколи не викликав `save`. Звірка
  2026-09-07 (`be8812d`, [data-models-doc-drift](done/p2-data-models-doc-drift.md)) внесла
  обхід у `data-models.md` як факт, не завівши запису на виправлення.
- Перейменовується лише неактивний профіль: активний відхиляє
  `src-tauri/src/commands/profile_commands.rs:37-39`, `Default` — `profile.rs:715-717`;
  єдиний викликач — `src/components/profile/ProfilesPanel.tsx:147`.
- Втрата тиха: `Profile::list` пропускає пошкоджений файл лише з `log::warn!`
  (`profile.rs:683-685`), а сторож `new_path.exists()` (`:728-730`) потім не віддає ім'я.
- Крок 4: `switch_profile` читає новий профіль із кешу ОС (`profile_commands.rs:214`) і
  комітить `active_profile` у `settings.json` (`:221-225`), але файл профілю не переписує;
  на старті `src-tauri/src/lib.rs:204` робить `.expect(…)`, а `panic = "abort"`
  (`src-tauri/Cargo.toml:110`) обриває процес без діалогу.

## Виправлення

У `Profile::rename` замінити `profile.rs:732-733` викликом
`crate::profile_store::save_detached(&profile)?`: `profile.name` уже нове (`:731`), тож
`write_profile_file` (`profile_store.rs:40-43`) складе той самий `new_path`.
`remove_file(&old_path)` лишається **після** запису — той самий вибір дублювання замість
втрати, що й у перенесеннях. Сторож `new_path.exists()` лишається: `std::fs::rename` у
Windows мовчки замінює наявну ціль. Ні зміни IPC, ні нової поверхні, ні нового i18n-ключа.

**Регресійний тест** — модульний, у `profile.rs`. `portable::profiles_dir()` не підмінюється,
тож тест пише поруч із тестовим бінарем у `target/`: сам створює каталог, бере унікальні
імена, прибирає за собою. Шляхи розрізняє перешкода: каталог на місці
`<нове>.tapirprofile.tmp` ламає `File::create` атомарного писаря, і `rename` мусить
повернути `Err`; сирий `std::fs::write` перешкоди не помічає — на `f09f36b` тест червоний.

## Поза межами

- **Зупинка старту на пошкодженому активному профілі** (`lib.rs:204`) — запис
  [corrupt-active-profile-aborts-startup](p1-corrupt-active-profile-aborts-startup.md); тут
  прибирається лише один шлях до такого профілю.
- **`std::fs::rename(old, new)`** замість запису — ні: ім'я живе й усередині файлу
  (`profile.rs:456`).
- **Шов профільного I/O** (`profiles_dir()` не підмінюється, `AppState::new` жорстко ставить
  `FileProfileStore`) — ідея [profiles-module](p2-profiles-module.md), яка поглинула б цей
  запис; з таким швом тест обійдеться без реального каталогу.

## Критерії готовності

- [ ] `docs/help/` не змінюється: видима поведінка та сама, а
      [profiles.md](../help/en/profiles.md) (і uk-двійник) надійності не обіцяє
- [ ] `Profile::rename` пише через `profile_store::save_detached`; `std::fs::write` у
      `profile.rs` не лишилось; `remove_file` — після запису; сторож `new_path.exists()` на місці
- [ ] Rust-тест: з перешкодою `<нове>.tapirprofile.tmp` — `Err`, старий профіль читається,
      нового файлу немає; без неї — `Ok`, новий `name` у файлі, старого файлу й `.tmp` немає
- [ ] Doc-коментар `profile_store.rs:3` звужено до файлів у `data/profiles/` (експорт,
      `profile_commands.rs:74`, теж пише `.tapirprofile`, але в теку людини); `:35` правдивий
- [ ] `docs/data-models.md:52-53`: речення про виняток прибрано, правило «ім'я профілю — ім'я
      файлу» лишилось
- [ ] `cargo test`, `cargo clippy --all-targets` зелені

## Документи

- [Огляд архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md) — звідки знахідка
- [profile-commit-seam](done/p0-profile-commit-seam.md) — шов запису профілю, таблиця «Розподіл сайтів»
- [settings-commit-seam](done/p1-settings-commit-seam.md) — `write_json_atomically` як спільний механізм
- [data-models.md](../data-models.md), [CONTEXT.md](../../CONTEXT.md) — ім'я профілю, Коміт, Сховище
- [corrupt-active-profile-aborts-startup](p1-corrupt-active-profile-aborts-startup.md),
  [profiles-module](p2-profiles-module.md) — записи того самого огляду
- Код: `src-tauri/src/profile.rs`, `src-tauri/src/profile_store.rs`, `src-tauri/src/store.rs`
