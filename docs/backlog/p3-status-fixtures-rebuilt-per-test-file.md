---
slug: status-fixtures-rebuilt-per-test-file
title: "Фікстури StreamStatus зібрані руками в кожному тестовому файлі"
summary: "5 білдерів у Rust і 17 літералів у 9 файлах TS; одне поле статусу — і правити треба всюди. Метушня, не ризик: типи стале ловлять"
priority: P3
type: planned
status: draft
effort: S
kind: chore
target: unscheduled
updated: 2026-09-15
a11y: false
depends_on: []
blocks: []
touches:
  - src-tauri/src/stream/manager.rs
  - src-tauri/src/app_state.rs
  - src-tauri/src/crash_recovery.rs
  - src-tauri/src/recording_control.rs
  - src/test/setup.ts
  - src/components/streams/StreamItem.test.tsx
  - src/components/streams/StreamList.test.tsx
gates: [cargo test, pnpm test, pnpm typecheck]
notes:
  - "2026-09-15: знайдено рев'ю коду reconnect-counter-not-live — одне перейменування поля зачепило 13 файлів, майже всі з них тестові фікстури."
  - "Нічого не ламається мовчки: `tsc` спіймав єдину фікстуру, яку в тій роботі забули, і назвав файл. Це витрати на метушню, не ризик — тому P3, а не вище."
---

# Фікстури StreamStatus зібрані руками в кожному тестовому файлі

> **Контекст:** знахідка рев'ю коду в
> [reconnect-counter-not-live](p2-reconnect-counter-not-live.md) (2026-09-15).
> Чистий chore: поведінки застосунку не змінює.

## Опис

`StreamStatus` будується вручну там, де його потребує тест, — щоразу заново, з повним
переліком полів.

**Rust — 5 білдерів у 4 файлах**, усі з однаковим тілом:

- [manager.rs](../../src-tauri/src/stream/manager.rs) — `idle_status()`
- [app_state.rs](../../src-tauri/src/app_state.rs) — `status(stream_id, state, session_id)`
- [crash_recovery.rs](../../src-tauri/src/crash_recovery.rs) — той самий `status(…)`
- [recording_control.rs](../../src-tauri/src/recording_control.rs) — `status(state)` **і** `st(id, state, session)`

**TypeScript — 17 літералів у 9 файлах:** `StreamItem.test.tsx` (6), `StreamList.test.tsx`
(4), плюс по одному в `CommandPalette`, `StatusBar`, `StreamContextMenu`, `StreamsPanel`,
`useGlobalShortcuts`, `playbackAnnounce`, `windowTitle`.

Наслідок виміряний, не припущений: у `reconnect-counter-not-live` дві половини пари
звелися в одне поле, і це торкнулося **13 файлів**, з яких змістовних було два.

Той самий візерунок є і на `PlayerStatus` — два білдери, у
[playback_control.rs](../../src-tauri/src/playback_control.rs) і
[tray/mod.rs](../../src-tauri/src/tray/mod.rs). Він у цей запис **не** входить: спершу
варто побачити, чи допоміг перший.

## Чого тут немає

**Ризику.** Забута фікстура не проходить мовчки: в тій самій роботі один пропущений
білдер завалив `pnpm typecheck` із назвою файлу й переліком полів. Тому це P3 і chore, а
не вада — купується лише менша метушня при наступній зміні форми статусу.

Це також означає, що запис легко відхилити: якщо спільна фабрика виявиться дорожчою за
метушню, яку вона економить, «ні» — нормальна відповідь.

## Відкриті питання

- **Де в Rust живе спільний білдер?** `#[cfg(test)]`-помічники через межу модуля просто
  так не ходять: потрібен або `pub(crate)` під `#[cfg(test)]`, або окремий
  `#[cfg(test)] mod test_support`. Перше рішення — саме це, бо воно задає конвенцію для
  всіх майбутніх спільних фікстур, не лише для статусу.
- **У TS місце вже є** — `src/test/`, уже підключений як `setupFiles` у
  `vitest.config.ts`. Питання радше в формі: фабрика з перевизначеннями
  (`mkStatus({ state: "recording" })`) чи набір готових станів.
- **Чи не зчепить це тести між собою?** Фабрика, яку тест мусить обходити, щоб дістати
  незвичайний стан, гірша за літерал. Перевіряється на `StreamItem.test.tsx`: там шість
  фікстур і найрізноманітніші стани — якщо фабрика незручна саме там, вона незручна.

## Критерії готовності

- [ ] `docs/help/` — змін не потребує (видимої поведінки запис не змінює)
- [ ] Форма `StreamStatus` міняється щонайбільше у двох місцях: Rust і TS
- [ ] Жоден тест не став менш читним, ніж був: незвичайний стан задається на місці виклику
- [ ] `cargo test`, `pnpm test`, `pnpm typecheck` — без помилок

## Документи

- [reconnect-counter-not-live](p2-reconnect-counter-not-live.md) — робота, яка це виміряла
