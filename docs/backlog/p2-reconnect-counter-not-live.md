---
slug: reconnect-counter-not-live
title: "Лічильник спроб перепідключення не оновлюється наживо"
priority: P2
type: planned
status: draft
effort: S
kind: bug
target: 0.1.0
updated: 2026-09-02
a11y: false
depends_on: [reconnect-max-in-status]
blocks: []
touches:
  - src-tauri/src/stream/manager.rs
  - src/App.tsx
  - src/lib/tauri.ts
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
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

## Відкриті питання

- Канал: розширити `RecordingStatusPayload` парою (attempt, max), дотягувати
  `getStreamStatus` на подію `reconnecting`, чи слати в події повний `StreamStatus`?
- Чи є інші поля `StreamStatus`, які так само живуть лише в `getAllStatuses`
  (`bytesRecorded`, `tracksRecorded`)? Якщо так — запис ширший за лічильник.

## Критерії готовності

- [ ] `docs/help/` — підтвердити, що `recording.md` змін не потребує (обіцянка вже є)
- [ ] Під час живого перепідключення рядок потоку показує «Спроба N з M» з актуальним N
- [ ] Обидва числа й далі з одного джерела — знімка циклу (reconnect-max-in-status не
      зламано)
- [ ] `cargo test`, `cargo clippy`, `pnpm test`, `pnpm vite:build` — без помилок

## Документи

- [reconnect-max-in-status](done/p2-reconnect-max-in-status.md) — звідки відщеплено
- [ADR: семантика спроби перепідключення](../decisions/2026-08-13-reconnect-attempt-semantics.md)
