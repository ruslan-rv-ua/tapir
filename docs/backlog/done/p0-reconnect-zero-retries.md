---
slug: reconnect-zero-retries
title: "Семантика нуля й лічильника спроб у перепідключенні"
priority: P0
type: planned
status: done
effort: M
kind: bug
target: 0.1.0
updated: 2026-08-13
completed: 2026-08-13
a11y: false
depends_on: []
blocks: [reconnect-max-in-status]
touches:
  - src-tauri/src/stream/manager.rs
  - src-tauri/src/profile.rs
  - src/components/streams/StreamItem.tsx
  - src/components/profile/ProfileRecordingTab.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
  - docs/help/uk/recording.md
  - docs/help/en/recording.md
  - CONTEXT.md
  - docs/decisions/2026-08-13-reconnect-attempt-semantics.md
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
notes:
  - "Знайдено 2026-08-13 під час grilling запису help-recording — при звірці дефолтів із кодом."
  - "Grilling 2026-08-13 (12 питань) ухвалив семантику й знайшов другу помилку — скидання лічильника на connect; обсяг S → M."
  - "Наявні профілі не мігруються (пре-реліз): у них лишається явний maxRetries: 0."
---

# Семантика нуля й лічильника спроб у перепідключенні

> **Контекст:** три шари застосунку описували одне число по-різному, і дефолт
> потрапляв саме в розбіжність. Семантику ухвалено на grilling-сесії 2026-08-13;
> «чому саме так» — в [ADR reconnect-attempt-semantics](../../decisions/2026-08-13-reconnect-attempt-semantics.md).

## Опис

`ReconnectConfig::default()` — `max_retries: 0`
([profile.rs:131](../../../src-tauri/src/profile.rs:131)). Далі шари розходяться:

| Шар | Що каже про `0` |
|---|---|
| [manager.rs:618](../../../src-tauri/src/stream/manager.rs:618), `:1019` | `if max_retries == 0 { break 'reconnect; }` — **жодної спроби**, запис завершується |
| `settings_max_retries_desc` (uk + en) | «0 = необмежено» / "0 = unlimited" |
| [StreamItem.tsx:166](../../../src/components/streams/StreamItem.tsx:166) | при `maxRetries === 0` показує `status_reconnecting_attempt_unlimited` — «Спроба {attempt}» без стелі |

Наслідок для користувача: типовий Tapir після обриву зв'язку **не відновлює запис**,
хоча інтерфейс обіцяє необмежені спроби. Сценарій, який це ламає: запис нічного ефіру.
Мережа мигнула на секунду — Tapir зупиняє запис і не відновлює, хоча користувач нічого
не налаштовував і мав підставу вважати, що відновлення ввімкнене «необмежено».

Grilling знайшов **другу**, незалежну помилку в тому ж циклі: `attempt = 0` виконується
одразу після успішного `connect` ([manager.rs:638](../../../src-tauri/src/stream/manager.rs:638)),
ще до першого прочитаного аудіобайта. Станція, що приймає з'єднання й рве потік за пів
секунди (перевантажений Icecast, мертвий mountpoint, що все ще відповідає), заганяє Tapir
у нескінченний цикл connect → EOF → `attempt = 0`: стеля не досягається **ніколи**,
backoff не росте **ніколи**. Тобто «необмежено» існує в продукті насправді — але лише
в найгіршому сценарії й без відома користувача.

## Прийняті рішення (grilling 2026-08-13)

1. **`0` = «не перепідключатися».** Бекенд правий, брехали підказка й UI.
2. **«Необмежено» зникає з домену.** Ключі `status_reconnecting_attempt_unlimited`
   (uk + en) і середня гілка тернара в [StreamItem.tsx:166](../../../src/components/streams/StreamItem.tsx:166)
   видаляються; тернар схлопується на наявний `m.status_reconnecting()`.
   > Твердження «гілка недосяжна» з першої редакції цього запису **хибне**: вона
   > досяжна, бо `recording_task` тримає **знімок** налаштувань
   > ([manager.rs:588](../../../src-tauri/src/stream/manager.rs:588)), а `StreamItem` читає
   > **поточні** ([StreamList.tsx:42](../../../src/components/streams/StreamList.tsx:42), `?? 0`).
   > Причина видалення інша: напис «Спроба 4» без стелі більше не відповідає жодному
   > стану домену. Розсинхрон як клас закриває окремий запис
   > [reconnect-max-in-status](../p2-reconnect-max-in-status.md).
3. **Дефолт `max_retries` = 10.** З наявним backoff (5 с, ×1.5, стеля 300 с) —
   ≈40 хвилин наполегливості: досить, щоб пережити мигання мережі й збій провайдера,
   замало, щоб зависнути назавжди на мертвій станції.
4. **Верхня межа 10000**, клампиться **на бекенді** (прецедент
   [`clamp_schedule_padding`](../../../src-tauri/src/profile.rs:204) — межі не залежать від
   того, якою гілкою прийшов патч), `maxValue` в UI — дзеркало. Без неї «необмежено»
   повертається чорним ходом через `u32::MAX`, а статус читається «Спроба 3 з 4294967295».
   > `apply_settings_patch` — не єдиний вхід: `Profile::load` і `Profile::save_imported`
   > теж парсять `ReconnectConfig` із JSON напряму (code-review знайшов цю прогалину).
   > Кламп викликається в усіх трьох місцях.
5. **Спроба витрачається, якщо з'єднання не дожило до першого аудіобайта.**
   `attempt = 0` переїжджає з успішного `connect` на першу гілку `ReadEvent::AudioBytes`.
6. **Одне місце для правила.** `plan_retry(&ReconnectConfig, attempt) -> Option<RetryPlan>`
   поглинає `compute_backoff_delay`, перевірку нуля і перевірку стелі. Три Rust-місця
   ([:618](../../../src-tauri/src/stream/manager.rs:618), [:1019](../../../src-tauri/src/stream/manager.rs:1019),
   предикат `will_retry` для `emit_stream_error`) стають викликами; `will_retry` = `.is_some()`.
   Це не рефакторинг за компанію: сама P0 існує тому, що одне правило жило в трьох копіях.
   > Реалізація виділила ще й `would_retry(&ReconnectConfig, attempt) -> bool` — саму
   > перевірку нуля й стелі без обчислення backoff — і `plan_retry` тепер делегує їй.
   > Причина: `will_retry` для `emit_stream_error` на шляху read-error раніше рахував
   > повний план і викидав його, тобто `compute_backoff_delay` виконувався двічі на
   > той самий `attempt` (знайдено code-review `/code-review`, виправлено в тому ж коміті).
7. **Міграції немає.** Пре-реліз: у наявних профілях лишається явний `"maxRetries": 0`,
   і новий дефолт їх не торкнеться (`#[serde(default)]` спрацьовує лише на **відсутнє**
   поле). Правиться руками в налаштуваннях.
8. **Довідка — мінімум плюс нуль:** новий дефолт і те, що `0` вимикає перепідключення.
   Поріг «перший аудіобайт» і стеля 10000 у довідку **не** йдуть.

## Критерії готовності

- [x] `plan_retry` — єдине джерело правила «пробувати ще раз?»; жодного
      `max_retries == 0` поза нею
- [x] `ReconnectConfig::default().max_retries == 10`; кламп верхньої межі 10000 на
      бекенді, `maxValue` в UI
- [x] `attempt = 0` — на першому отриманому аудіобайті, не на успішному `connect`
- [x] Ключі `status_reconnecting_attempt_unlimited` (uk + en) і гілка в
      `StreamItem.tsx` видалені; при `maxRetries === 0` рядок показує
      `m.status_reconnecting()`
- [x] `settings_max_retries_desc` (uk + en) каже «0 — не перепідключатися»
- [x] Тести на `plan_retry` таблицею (нуль, стеля, backoff, кламп) — без `AppHandle`;
      заразом покрито `compute_backoff_delay`, який зараз голий
- [x] `docs/help/uk/recording.md` і `docs/help/en/recording.md` — новий дефолт і як
      його вимкнути нулем
- [x] `CONTEXT.md` — розділ «Перепідключення» (спроба, коли витрачена, що означає нуль)
- [x] `docs/decisions/2026-08-13-reconnect-attempt-semantics.md` створено
- [x] `cargo test`, `cargo clippy`, `pnpm test`, `pnpm vite:build` — без помилок

## Документи

- [ADR: семантика спроби перепідключення](../../decisions/2026-08-13-reconnect-attempt-semantics.md) — чому нуль вимикає, чому лічильник скидається на першому байті
- [reconnect-max-in-status](../p2-reconnect-max-in-status.md) — відщеплено тут: бекенд віддає стелю разом зі статусом
- [help-recording](p1-help-recording.md) — запис, під час якого знайдено; містить звірені з кодом числа перепідключення
- `src-tauri/src/stream/manager.rs` — цикл `'reconnect` і `compute_backoff_delay`
- `src/components/profile/ProfileRecordingTab.tsx` — поля налаштувань перепідключення
