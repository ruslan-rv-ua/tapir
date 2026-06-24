# Повне редагування потоку (URL / auth / ignorelist)

- **Слаг:** `full-edit-stream`
- **Тип:** покращення
- **Пріоритет:** P2
- **Стан:** ідея (винесено з rename-only F2-беклога, 2026-06-23; той реалізовано в `ee9a704`)
- **Зусилля:** M (Rust `update_stream` + UI-поля в edit-режимі + re-resolve PLS/M3U + guard для активного запису/відтворення + i18n + тести)
- **Залежності:** F2 / edit-режим `AddStreamDialog` — ✅ у продакшені (`ee9a704`)

## Опис

Сьогодні «редагування» потоку = **тільки перейменування** (`name`). І UI, і backend обмежені назвою:
- поле URL у edit-режимі приховане ([AddStreamDialog.tsx:70](../../src/components/streams/AddStreamDialog.tsx#L70));
- `update_stream` приймає лише `name` ([stream_commands.rs:236-248](../../src-tauri/src/commands/stream_commands.rs#L236-L248)), хоча `tauri.updateStream` теж пробрасує лише `name` ([tauri.ts:145](../../src/lib/tauri.ts#L145)).

Цей запис додає **редагування URL** (і, можливо, auth/ignorelist) — типова потреба, коли станція змінила адресу потоку.

**Реальна потреба:** станція переїхала на новий URL → зараз єдиний шлях — видалити потік і додати наново (втрата позиції в списку / історії). Редагування URL on-the-spot це закриває.

## Чому окремий запис, а не частина P1

P1 (`F2`) — чисто провід клавіші до **наявного** rename-режиму, нульовий backend-ризик. Редагування URL — це:
- зміна сигнатури Rust-команди + серіалізація (back-compat);
- re-resolve PLS/M3U при зміні URL (як `add_stream`);
- guard на активний запис/відтворення (міняти URL «під» live-задачею небезпечно).

Тримати це окремо лишає P1 вузьким.

## Ескіз рішення (НЕ узгоджено — обговорити при підйомі)

| Аспект | Чернетка |
|---|---|
| Backend | Розширити `update_stream` до опційних `url?` (+ можливо `username?`/`password?`/`ignorelist?`); при зміні URL — re-resolve PLS/M3U, як в `add_stream`. Back-compat серіалізації. |
| UI | У edit-режимі `AddStreamDialog` показувати поле URL (і, за рішенням, auth). Валідація URL як при додаванні. |
| Guard | Якщо потік **записується / відтворюється** — або заблокувати зміну URL (як `move_disabled_reason`), або зупинити задачу й попередити. Визначити при підйомі. |
| Скоуп полів | Спершу лише **URL**? Чи одразу URL+auth+ignorelist? Менший крок — лише URL. |

## Відкриті питання

- Чи дозволяти зміну URL під час активного запису/відтворення (блокувати vs зупинити-й-попередити)?
- Які саме поля в першій ітерації — лише URL, чи одразу auth/ignorelist?
- Чи зберігати позицію/статус потоку при зміні URL (id незмінний → так, але re-resolve може змінити метадані).

## Документи

- Походить із: rename-only F2-беклог (реалізовано в `ee9a704`)
- Код: [stream_commands.rs](../../src-tauri/src/commands/stream_commands.rs) (`update_stream`), [tauri.ts](../../src/lib/tauri.ts) (`updateStream`), [AddStreamDialog.tsx](../../src/components/streams/AddStreamDialog.tsx)
- [architecture.md](../architecture.md) — таблиця Streams-команд (звірити сигнатуру `update_stream`)
