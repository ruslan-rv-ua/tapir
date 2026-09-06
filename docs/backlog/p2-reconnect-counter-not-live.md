---
slug: reconnect-counter-not-live
title: "Лічильник спроб перепідключення не оновлюється наживо"
priority: P2
type: planned
status: draft
effort: S
kind: bug
target: unscheduled
updated: 2026-09-06
a11y: false
depends_on: [reconnect-max-in-status]
blocks: []
touches:
  - src-tauri/src/stream/manager.rs
  - src/App.tsx
  - src/lib/tauri.ts
gates: [cargo test, cargo clippy --all-targets, pnpm test, pnpm vite:build]
notes:
  - "Знахідка реалізації reconnect-max-in-status (2026-09-02): пара «спроба N з M» їде правильним каналом, але канал не оновлюється під час запису. Канал не обрано — потрібен grooming."
---

# Лічильник спроб перепідключення не оновлюється наживо

> **Контекст:** знайдено під час реалізації [reconnect-max-in-status](done/p2-reconnect-max-in-status.md).
> Дизайн каналу не ухвалено — перед реалізацією потрібен grooming.

## Опис

Подія `recording-status` (`RecordingStatusPayload` у
[manager.rs](../../src-tauri/src/stream/manager.rs)) несе лише `streamId`, `status`,
`error`. Обробник `handleRecordingStatus` в [App.tsx](../../src/App.tsx) зливає в стор
тільки `state` і `recordingStartedAt`. Пара `reconnectAttempt` / `reconnectMaxRetries`
потрапляє в `$statuses` лише з повного `StreamStatus` — через `getAllStatuses` на старті
застосунку й при перемиканні профілю (`ProfilesPanel`). Іншого опитування статусів
немає.

Наслідок: під час живого перепідключення рядок потоку показує «Перепідключення…»
(запасна гілка `StreamItem` для відсутньої пари), а «Спроба N з M» видно лише тоді, коли
застосунок стартував або перемкнув профіль посеред перепідключення. Довідка
(`recording.md`) обіцяє «перепідключення з номером спроби».

## Нове свідчення (2026-09-06)

NVDA-прогін [error-state-never-reaches-ui](p1-error-state-never-reaches-ui.md) уперше
поставив цю ваду перед людиною як **головний** текст про потік, що бореться. Відтоді
фільтр і метрика «Потребує уваги» рахують і тих, хто ще перепідключається, тож рядок
такого потоку тепер регулярно читають — і єдине, що він може про нього сказати, це
«Перепідключення…» без номера спроби. Тестувальник спитав, чи так і має бути.

Це аргумент за перегляд `target: unscheduled`: доти вада була про рідкісний випадок,
тепер вона про звичайний.

## Критерії готовності

- [ ] `docs/help/` — підтвердити, що `recording.md` змін не потребує (обіцянка вже є)
- [ ] Під час живого перепідключення рядок потоку показує «Спроба N з M» з актуальним N
- [ ] Обидва числа й далі з одного джерела — знімка циклу (reconnect-max-in-status не
      зламано)
- [ ] `cargo test`, `cargo clippy`, `pnpm test`, `pnpm vite:build` — без помилок

## Відкриті питання

- Канал: розширити `RecordingStatusPayload` парою (attempt, max), дотягувати
  `getStreamStatus` на подію `reconnecting`, чи слати в події повний `StreamStatus`?
- Чи є інші поля `StreamStatus`, які так само живуть лише в `getAllStatuses`
  (`bytesRecorded`, `tracksRecorded`)? Якщо так — запис ширший за лічильник.
- Жодна половина пари не скидається в `None`: бекенд (`update_state` лишає старі
  `Some`) і стор (`updateStreamStatus` зливає поверх). Сценарій хибного числа (рев'ю
  2026-09-03): застосунок стартував посеред перепідключення (стор: 3 з 10) → запис
  відновився → зупинено → стелю піднято до 25 → новий запис обірвався → подія
  `reconnecting` без пари → рядок показує «Спроба 3 з 10», бекенд на 1 з 25. Той самий
  клас, що раніше для самого лічильника; канал мусить скидати пару поза `reconnecting`.

## Документи

- [reconnect-max-in-status](done/p2-reconnect-max-in-status.md) — звідки відщеплено
- [ADR: семантика спроби перепідключення](../decisions/2026-08-13-reconnect-attempt-semantics.md)
