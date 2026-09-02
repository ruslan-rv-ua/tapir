---
slug: reconnect-max-in-status
title: "Стеля спроб їде разом зі статусом потоку, а не читається з поточних налаштувань"
priority: P2
type: planned
status: done
effort: S
kind: bug
target: 0.1.0
updated: 2026-09-02
completed: 2026-09-02
a11y: false
depends_on: [reconnect-zero-retries]
blocks: []
touches:
  - src-tauri/src/stream/manager.rs
  - src/lib/tauri.ts
  - src/stores/streams.ts
  - src/components/streams/StreamList.tsx
  - src/components/streams/StreamItem.tsx
  - src/components/streams/StreamList.test.tsx
  - src/components/streams/StreamItem.test.tsx
  - docs/data-models.md
  - docs/decisions/2026-08-13-reconnect-attempt-semantics.md
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
notes:
  - "Відщеплено від reconnect-zero-retries під час grilling 2026-08-13 (варіант F3)."
  - "Реалізація 2026-09-02 знайшла, що пара не оновлюється наживо (подія recording-status несе лише стан) — відщеплено в reconnect-counter-not-live."
---

# Стеля спроб їде разом зі статусом потоку

> **Контекст:** UI показує «спроба N з M», де `N` приходить із бекенда, а `M` —
> із поточних налаштувань профілю. Це різні джерела, і вони розходяться.

## Опис

`recording_task` бере `RecordingSettings` **знімком** на старті запису
([manager.rs:588](../../../src-tauri/src/stream/manager.rs:588) — `reconnect` клонується
один раз і живе з задачею). `StreamItem` натомість читає **поточні** налаштування
профілю ([StreamList.tsx:42](../../../src/components/streams/StreamList.tsx:42):
`profileSettings?.recording.reconnect.maxRetries ?? 0`).

Два шляхи розсинхрону:

1. Користувач стартує запис із `maxRetries: 10`, під час запису змінює значення —
   бекенд і далі живе зі своїм знімком, UI вже показує нове число. «Спроба 3 з 25»
   при реальній стелі 10.
2. Доки налаштування профілю не завантажені, `?? 0` дає нуль — і будь-який
   `reconnecting`-статус у цьому вікні читається за гілкою «стелі немає».

`StreamStatus` уже несе `reconnect_attempt` — тобто половина пари вже їде правильним
каналом. Друга половина гадається на фронтенді.

## Рішення

Додати стелю в `StreamStatus` поруч із `reconnect_attempt`, зі **знімка**, за яким
реально живе цикл `'reconnect`. `StreamItem` перестає приймати `maxRetries` пропом і
бере обидва числа з одного джерела; `StreamList` більше не читає налаштування профілю
заради цього.

## Критерії готовності

- [x] `docs/help/` без змін — запис видимої поведінки не додає (`recording.md` уже
      обіцяє «номер спроби»)
- [x] `StreamStatus` несе стелю спроб зі знімка `recording_task`
- [x] `StreamItem` не отримує `maxRetries` із налаштувань профілю; обидва числа —
      з одного статусу
- [x] Зміна налаштування під час активного запису не міняє число в рядку потоку
- [x] `cargo test`, `cargo clippy`, `pnpm test`, `pnpm vite:build` — без помилок

## Прийняті рішення

**Стеля — сусіднє поле, не окрема структура.** `StreamStatus.reconnect_max_retries:
Option<u32>` стоїть поруч із `reconnect_attempt` (у TS — `reconnectMaxRetries`), як і
просив запис. Інваріант «обидва або жодне» тримає не тип, а єдиний писар:
`mark_reconnecting(&mut StreamStatus, attempt, max_retries)` виставляє стан, спробу й
стелю разом, і саме його кличе `update_state_reconnecting` з обох точок циклу
`'reconnect` — зі `reconnect.max_retries` того самого знімка, за яким живе цикл.
Виділено в чисту функцію, бо `StreamManager` без `AppHandle` не збирається, а інваріант
вартий тесту (`mark_reconnecting_sets_attempt_and_ceiling_from_the_same_snapshot`).

**Гілку `maxRetries > 0` у `StreamItem` прибрано.** Коли обидва числа з одного знімка,
стан `reconnecting` зі стелею `0` неможливий — `would_retry` при нулі не планує спроби.
Лишився один запасний варіант: якщо бракує будь-якої половини пари, рядок каже
«Перепідключення…», бо «Спроба N» без стелі не відповідає жодному стану домену
(ADR 2026-08-13). `StreamList` більше не підписаний на `$profileSettings` — стеля була
єдиним приводом. Сторожі спереду — два тести `StreamList`: стеля видна до завантаження
профільних налаштувань і не змінюється, коли профіль каже інше число.

**Довідка не змінювалась.** `recording.md` уже каже «перепідключення з номером спроби»;
число просто стало правдивим — нової видимої поведінки запис не додає.

**Знахідка поза обсягом: пара не оновлюється наживо.** Подія `recording-status` несе
лише стан, а `reconnectAttempt` / `reconnectMaxRetries` потрапляють у стор тільки з
`getAllStatuses` — на старті застосунку й при перемиканні профілю. Під час живого
перепідключення рядок зазвичай показує «Перепідключення…», а не «Спроба N з M»:
лічильник був таким і до цього запису, стеля лише приєдналася до нього. Який канал має
нести пару (розширити payload події чи дотягувати статус на подію) — розвилка для
grooming, відщеплено в [reconnect-counter-not-live](../p2-reconnect-counter-not-live.md).

## Документи

- [reconnect-zero-retries](p0-reconnect-zero-retries.md) — запис, від якого відщеплено (рішення 2, варіант F3)
- [ADR: семантика спроби перепідключення](../../decisions/2026-08-13-reconnect-attempt-semantics.md)
