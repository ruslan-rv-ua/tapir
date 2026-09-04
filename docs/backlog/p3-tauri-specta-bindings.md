---
slug: tauri-specta-bindings
title: "tauri-specta: генерувати tauri.ts з Rust-команд замість 925 рядків руками"
priority: P3
type: research
status: ready
effort: L
kind: chore
target: 0.1.0
updated: 2026-09-04
a11y: false
depends_on: []
blocks: []
touches:
  - src/lib/tauri.ts
  - src-tauri/src/commands
  - src-tauri/src/profile.rs
  - src-tauri/src/settings.rs
  - src-tauri/Cargo.toml
gates: [cargo test, cargo clippy --all-targets, pnpm test, pnpm vite:build, pnpm typecheck]
notes:
  - "Аудит 2026-09-04: src/lib/tauri.ts має 89 обгорток invoke і дзеркальні інтерфейси всіх DTO, які тримаються синхронними з Rust лише увагою людини."
  - "tauri-specta 2.0.0-rc.25 (2026-05) сумісний з Tauri 2 і Rust 2024, але лишається RC з 2023 року; docs.rs для rc.25 не збирається; issue про вихід із RC без відповіді мейнтейнерів."
  - "P3 свідомо: брати лише за тригером, коли розбіжність типів Rust і TS проявиться як справжній баг, або коли спайк покаже малу ціну."
---

# tauri-specta: генерувати tauri.ts з Rust-команд замість 925 рядків руками

> **Контекст:** знахідка аудиту 2026-09-04, єдиний пункт із потенціалом прибрати
> великий шмат коду. Дослідження зі спайком; рішення «переходити чи ні» за його
> результатом. Тригер-gated: без реального бага дрейфу типів це не пріоритет.

## Опис

[tauri.ts](../../src/lib/tauri.ts) описує кожну команду й кожен тип вручну: 89 викликів
`invoke`, інтерфейси `StreamInfo`, `StreamStatus`, `GlobalSettings`, `Profile` і решта
DTO з `camelCase`-полями, які мусять збігатися з `#[serde(rename_all)]` у Rust.
Розбіжність не ловить ніщо, крім падіння в рантаймі або уважного рев'ю.

`tauri-specta` генерує `bindings.ts` із самих команд: `commands.helloWorld(name)`,
типи аргументів і результатів, `Result<T, E>` як `{ status: "ok" | "error" }`,
події через `events.playerStatus.listen(...)`, `Channel<T>`, JSDoc з Rust-коментарів.
Викликається той самий `invoke` з `@tauri-apps/api/core`, тож `vi.mock` і `mockIPC`
у vitest працюють як зараз.

Ціна: `#[derive(specta::Type)]` на кожному DTO (RadioError включно),
`#[specta::specta]` на кожній команді, `collect_commands!` замість
`generate_handler!`, версія RC, яку README радить пінити, і ризик breaking-змін між
rc-релізами. Ручний `tauri.ts` зникає разом із своїми тестами типів.

## Що з'ясувати (спайк на гілці, не зливати)

- [ ] Три команди (одна проста, одна з `Result<_, RadioError>`, одна з подією)
      анотовані, `bindings.ts` згенеровано; скільки рядків Rust-змін на одну команду
- [ ] Чи компілюється `specta::Type` для всіх типів у `profile.rs` і `settings.rs`
      без переписування (enum з `#[serde(tag)]`, `Option`, `HashMap`, `chrono`)
- [ ] Чи збігається згенерований тип `StreamStatus` з ручним полем у поле; кожна
      розбіжність це або баг у ручному файлі, або підказка, що дрейф уже є
- [ ] Чи переживають тести з `vi.mock("@tauri-apps/api/core")` заміну імпортів
- [ ] Скільки часу додає генерація до `just dev` і чи потрібен окремий крок

## Критерії готовності

- [ ] `docs/help/` — запис видимої поверхні не змінює
- [ ] Звіт у цьому записі: відповіді на питання вище, оцінка повної міграції в днях,
      знайдені розбіжності ручних типів з Rust
- [ ] Рекомендація: «мігрувати» з окремим записом `type: planned`, або «не мігрувати,
      поки RC» з тригером, який повертає до питання

## Документи

- [tauri.ts](../../src/lib/tauri.ts) — що замінюється
- https://github.com/specta-rs/tauri-specta — README, таблиця сумісності, приклад `bindings.ts`
- https://github.com/specta-rs/tauri-specta/issues/247 — статус RC
