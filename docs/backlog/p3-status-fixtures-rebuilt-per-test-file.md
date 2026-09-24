---
slug: status-fixtures-rebuilt-per-test-file
title: "Фікстури StreamStatus зібрані руками в кожному тестовому файлі"
summary: "5 білдерів у Rust і 17 літералів у 9 файлах TS; одне поле статусу — і правити треба всюди. Метушня, не ризик: забуту фікстуру ловлять типи"
priority: P3
type: planned
status: draft
effort: S
kind: chore
target: unscheduled
updated: 2026-09-24
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
gates: [cargo test, cargo clippy --all-targets, pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "2026-09-15: знайдено рев'ю коду reconnect-counter-not-live — одне перейменування поля зачепило 13 файлів, майже всі з них тестові фікстури."
  - "Нічого не ламається мовчки: `tsc` спіймав єдину фікстуру, яку в тій роботі забули, і назвав файл. Це витрати на метушню, не ризик — тому P3, а не вище."
  - "2026-09-24: огляд архітектури знайшов той самий візерунок ширше в TS (34 часткові моки `lib/tauri`). TS-половину поглинули б білдери фікстур з ipc-seam-test-adapter; Rust-половина лишається тут."
---

# Фікстури StreamStatus зібрані руками в кожному тестовому файлі

> **Контекст:** знахідка рев'ю коду в
> [reconnect-counter-not-live](done/p2-reconnect-counter-not-live.md) (2026-09-15); перетин з
> ipc-seam-test-adapter знайшов [огляд архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md).
> Чистий chore, поведінки застосунку не змінює. Режим — **GROOMING** (`planned` + `draft`).
> Номери рядків і підрахунки — стан на f09f36b.

## Опис

`StreamStatus` будується вручну там, де його потребує тест, — щоразу заново, з повним
переліком полів.

**Rust — 5 білдерів у 4 файлах**, усі з однаковим тілом:

- `src-tauri/src/stream/manager.rs:1275` — `idle_status()`
- `src-tauri/src/app_state.rs:174` — `status(stream_id, state, session_id)`
- `src-tauri/src/crash_recovery.rs:237` — той самий `status(…)`
- `src-tauri/src/recording_control.rs:154` — `status(state)` **і** `:185` — `st(id, state, session)`

**TypeScript — 17 літералів у 9 файлах:** `StreamItem.test.tsx` (6), `StreamList.test.tsx`
(4), плюс по одному в `CommandPalette`, `StatusBar`, `StreamContextMenu`, `StreamsPanel`,
`useGlobalShortcuts`, `playbackAnnounce`, `windowTitle`.

Наслідок виміряний, не припущений: у `reconnect-counter-not-live` дві половини пари
звелися в одне поле, і це торкнулося **13 файлів**, з яких змістовних було два.

Той самий візерунок є і на `PlayerStatus` — два білдери, `src-tauri/src/playback_control.rs:404`
і `src-tauri/src/tray/mod.rs:194`. Він у цей запис **не** входить: спершу варто побачити, чи
допоміг перший.

## Чого тут немає

**Ризику.** Забута фікстура не проходить мовчки: в тій самій роботі один пропущений
білдер завалив `pnpm typecheck` із назвою файлу й переліком полів. Тому це P3 і chore, а
не вада — купується лише менша метушня при наступній зміні форми статусу.

Це також означає, що запис легко відхилити: якщо спільна фабрика виявиться дорожчою за
метушню, яку вона економить, «ні» — нормальна відповідь.

## Перетин з ipc-seam-test-adapter

[Огляд архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md) побачив той самий
візерунок ширше на боці TS: 34 зі 100 тестових файлів пишуть власний частковий `vi.mock`
модуля `lib/tauri`, а інші DTO скопійовані так само — `PlayerStatus` (літерал із `volume`,
`positionMs`, `durationMs`) у 15 файлах, `StreamInfo` (`unsupportedCodec:`) у 10,
`GlobalSettings` (`smtcEnabled`) у 8. Сімнадцять літералів `StreamStatus` — окремий випадок
того самого.

TS-половину цього запису поглинули б білдери фікстур, які пропонує
[ipc-seam-test-adapter](p2-ipc-seam-test-adapter.md): білдер статусу став би одним із них, а
питання «фабрика з перевизначеннями чи готові стани» вирішувалося б там для всіх DTO разом.
Rust-половина (5 білдерів) лишається тут: IPC-шов її не торкається. Хто забирає TS-половину,
вирішує обговорення ipc-seam-test-adapter; фабрика `StreamStatus`, зроблена тут раніше,
ризикує бути переписаною під спільну форму.

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
- [ ] Вирішено, хто робить TS-половину: цей запис чи ipc-seam-test-adapter; рішення записане в обох
- [ ] Форма `StreamStatus` міняється щонайбільше у двох місцях: Rust і TS
- [ ] Жоден тест не став менш читним, ніж був: незвичайний стан задається на місці виклику
- [ ] Ворота з `gates:` — без помилок

## Документи

- [reconnect-counter-not-live](done/p2-reconnect-counter-not-live.md) — робота, яка це виміряла
- [ipc-seam-test-adapter](p2-ipc-seam-test-adapter.md) — той самий візерунок ширше на боці
  TS: спільний тестовий адаптер і білдери фікстур
- [Огляд архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md) — де перетин знайдено
