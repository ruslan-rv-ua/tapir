---
slug: tauri-specta-bindings
title: "tauri-specta: генерувати tauri.ts з Rust-команд замість 925 рядків руками"
priority: P3
type: research
status: done
effort: L
kind: chore
target: 0.1.0
updated: 2026-09-05
completed: 2026-09-05
a11y: false
depends_on: []
blocks: [tauri-ts-type-drift]
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
  - "Дослідження 2026-09-05: нотатка docs/notes/tauri-specta-bindings.md (гілка spike/tauri-specta, не зливати). Рекомендація — «не мігрувати, поки RC»; тригер повернення — стабільний 2.x на crates.io із зеленим docs.rs або друга справжня помилка дрейфу. Аудит ручних типів: 12 розбіжностей, справжня одна — track-changed із плеєра не несе поля ignored."
---

# tauri-specta: генерувати tauri.ts з Rust-команд замість 925 рядків руками

> **Контекст:** знахідка аудиту 2026-09-04, єдиний пункт із потенціалом прибрати
> великий шмат коду. Дослідження зі спайком; рішення «переходити чи ні» за його
> результатом. Тригер-gated: без реального бага дрейфу типів це не пріоритет.
>
> **Результат (2026-09-05):** «не мігрувати, поки RC». Звіт —
> [нотатка дослідження](../../notes/tauri-specta-bindings.md); спайк на гілці
> `spike/tauri-specta`, не зливати. Єдина жива вада дрейфу стала записом
> [tauri-ts-type-drift](../p2-tauri-ts-type-drift.md).

## Опис

[tauri.ts](../../../src/lib/tauri.ts) описує кожну команду й кожен тип вручну: 89 викликів
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

- [x] Три команди (одна проста, одна з `Result<_, RadioError>`, одна з подією)
      анотовані, `bindings.ts` згенеровано; скільки рядків Rust-змін на одну команду —
      2 / 4 / 8 рядків на команду плюс ~90 рядків інфраструктури експорту
- [x] Чи компілюється `specta::Type` для всіх типів у `profile.rs` і `settings.rs`
      без переписування — derive так, усі 28; **експортер** ні: відмовляє на
      `deserialize_with` (1 поле) і на `u64`/`usize` (21 поле по всіх DTO, якщо не
      дозволити глобальний cast у `number`)
- [x] Чи збігається згенерований тип `StreamStatus` з ручним полем у поле — так;
      ручний `StreamState` має зайве `"stopped"`, якого немає в Rust-enum
- [x] Чи переживають тести з `vi.mock("@tauri-apps/api/core")` заміну імпортів — так,
      bindings імпортують `invoke` саме звідти; але такий тест **один** із 99, решта
      36 мокають обгортку `lib/tauri`, яку міграція мала б прибрати
- [x] Скільки часу додає генерація до `just dev` — 3–10 мс; окремий крок не потрібен за
      часом, але потрібен через запис у `src/` на кожному старті під
      `#[cfg(debug_assertions)]`

## Критерії готовності

- [x] `docs/help/` — запис видимої поверхні не змінює
- [x] Звіт — у [нотатці дослідження](../../notes/tauri-specta-bindings.md), а не в
      записі: 436 рядків, 32 джерела, кожне твердження позначене як першоджерело, код
      Tapir або вимір спайку. Повна міграція ≈ 5–7 днів, «лише типи» (ts-rs) ≈ 2–3,
      закрити знахідки аудиту ≈ 0,5. Розбіжностей ручних типів з Rust — 12, справжня
      одна: `track-changed` із плеєра не несе `ignored`
- [x] Рекомендація — «не мігрувати, поки RC». Тригер повернення: `tauri-specta` `2.x`
      без `-rc` на crates.io із зеленим docs.rs, або друга справжня помилка дрейфу,
      яка доходить до користувача. Жива вада винесена в
      [tauri-ts-type-drift](../p2-tauri-ts-type-drift.md)

## Документи

- [tauri.ts](../../../src/lib/tauri.ts) — що замінюється
- [Нотатка дослідження](../../notes/tauri-specta-bindings.md) — відповіді з першоджерел, інвентар, спайк, оцінка в днях, рекомендація (2026-09-05)
- [tauri-ts-type-drift](../p2-tauri-ts-type-drift.md) — жива вада дрейфу й решта 11 розбіжностей аудиту
- https://github.com/specta-rs/tauri-specta — README, таблиця сумісності, приклад `bindings.ts`
- https://github.com/specta-rs/tauri-specta/issues/247 — статус RC
