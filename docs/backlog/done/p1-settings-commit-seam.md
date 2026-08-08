---
slug: settings-commit-seam
title: Глобальні налаштування — тим самим швом, що й профіль
priority: P1
type: planned
status: done
effort: S
kind: chore
target: 0.1.0
updated: 2026-08-07
completed: 2026-08-07
a11y: false
depends_on:
  - profile-commit-seam
blocks: []
touches:
  - src-tauri/src/store.rs
  - src-tauri/src/settings_store.rs
  - src-tauri/src/profile_store.rs
  - src-tauri/src/settings.rs
  - src-tauri/src/app_state.rs
  - src-tauri/src/commands/settings_commands.rs
  - src-tauri/src/commands/player_commands.rs
  - src-tauri/src/commands/profile_commands.rs
  - src-tauri/src/lib.rs
gates:
  - cargo test
  - pnpm test
  - pnpm vite:build
notes:
  - "Прямий наступний крок profile-commit-seam — той запис лишив GlobalSettings поза обсягом свідомо"
  - "SessionState (data/state.json) — третій агрегат тієї ж форми, свідомо не чіпали"
  - "NVDA-прогін не потрібен: жодне оголошення не змінюється"
---

# Глобальні налаштування — тим самим швом, що й профіль

> **Контекст:** продовження [profile-commit-seam](p0-profile-commit-seam.md).
> Терміни — [CONTEXT.md](../../../CONTEXT.md).

## Опис

`GlobalSettings` мали ту саму форму, що профіль до рефакторингу, у 5 місцях, і
серед них — ті самі дві патології:

- `save_settings` писала диск **перед** мутацією пам'яті (як `save_recording_settings`);
- `set_output_device` — канонічний «lock → clone → save поза локом», тобто та сама
  гонка, тільки з меншою ймовірністю (налаштування змінюють рідко).

## Прийняте рішення

**Механізм узагальнено, а не скопійовано.** Інваріант порядку («на диск не лягає
знімок, старіший за вже записаний з тим же ключем») тепер живе в одному місці —
`store.rs`:

- `Commit<T>`, `Persist` (ключ воріт), `Store<T>` (сховище), `Writer<T>` (порядок);
- `write_json_atomically` — `tmp` → `sync_all` → `rename`, спільна для обох агрегатів.

`profile_store.rs` і `settings_store.rs` схудли до адаптерів: ключ, файловий
шлях, `save_detached`. Дві копії механізму означали б два місця, де інваріант
можна зламати — а він тут головна цінність.

`Persist::key` для профілю — ім'я (файлів багато), для налаштувань — константа
(файл один).

### Розподіл 5 сайтів

| Куди | Хто |
|---|---|
| `commit_settings` | `save_settings`, `set_output_device`, `switch_profile` (крок 9) |
| `settings_store::save_detached` | `GlobalSettings::load` (створення дефолту), `lib.rs` (гасіння autostart до `AppState::new`) |

`GlobalSettings::save` видалено — той самий доказ повноти, що й для профілю:
решту сайтів перелічив компілятор. Після міграції в кодовій базі не лишилося
жодного `settings.write().await`.

### Відкат у `switch_profile` збережено

Єдиний сайт, що не підпадає під загальне правило «розбіжність лікує наступний
успішний коміт». `activeProfile` читається лише при старті, тож наступного
коміту можна не дочекатися, а розійшовшись, він відправив би застосунок у
профіль, якого користувач не вибирав. Реалізовано через `Commit::Skip`: запис
невдалий, отже на диску вже старе значення — пам'ять повертається до нього без
другої спроби писати. Під це є тест `skip_still_applies_the_mutation_to_memory`.

## Критерії готовності

- [x] `store.rs`: `Commit`, `Persist`, `Store<T>`, `Writer<T>`, `write_json_atomically` + 9 тестів.
- [x] `settings_store.rs`: `FileSettingsStore`, `save_detached`, `impl Persist`.
- [x] `profile_store.rs` схуд до адаптера над `store`.
- [x] `AppState::commit_settings`.
- [x] Усі 5 сайтів мігровано; `GlobalSettings::save` видалено.
- [x] `save_settings` — пам'ять першою (інверсію прибрано).
- [x] Відкат у `switch_profile` збережено, покрито тестом.
- [x] fsync тепер і для `settings.json`.
- [x] Гейти зелені: `cargo test` (451), `pnpm test` (787), `pnpm vite:build`.
      Clippy — 47, як і до змін.

## Документи

- [profile-commit-seam](p0-profile-commit-seam.md) — рішення, що їх цей запис успадковує
- [CONTEXT.md](../../../CONTEXT.md) — «коміт», «сховище», «персистентні агрегати»
- код: `src-tauri/src/store.rs`, `src-tauri/src/settings_store.rs`
