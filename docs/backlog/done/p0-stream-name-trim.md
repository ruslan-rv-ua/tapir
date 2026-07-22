---
slug: stream-name-trim
title: Обрізання пробільних символів у назві потоку
priority: P0
type: planned
status: done
effort: S
kind: bug
target: v0.1.0
updated: 2026-07-22
completed: 2026-07-22
a11y: false
depends_on: []
blocks: []
touches:
  - src-tauri/src/commands/stream_commands.rs
  - src/components/streams/AddStreamDialog.tsx
gates: [pnpm test, pnpm build]
---

# Обрізання пробільних символів у назві потоку

> **Контекст:** При додаванні та редагуванні потоку (F2) назва зберігається без
> обрізання провідних/завершальних пробілів. Баг виявлено перевіркою — 2026-07-22.

## Опис

При збереженні назви потоку в `add_stream` та `update_stream` не застосовується `.trim()`.
Це дозволяє зберегти назву з пробілами на початку або кінці, що виглядає аномально
у списку і може заплутати пошук/порівняння.

Для порівняння: назва профілю обрізається на фронтенді (`.trim()`) і відхиляється
бекендом (`validate_profile_name`) — аналогічного захисту для потоків немає.

## Місця без trim

| Місце | Файл | Рядок |
|---|---|---|
| `add_stream` (бекенд) | `stream_commands.rs` | `name: stream_name` |
| `update_stream` (бекенд) | `stream_commands.rs` | `stream.name = name;` |
| `AddStreamDialog` (фронтенд) | `AddStreamDialog.tsx` | `onChange={(e) => setName(e.target.value)}` |

## Критерії готовності

- [ ] У бекенді `update_stream`: `stream.name = name.trim().to_string();`
- [ ] У бекенді `add_stream`: `let stream_name = name.map(|n| n.trim().to_string()).unwrap_or_else(|| resolved_url.clone());`
      або окремий `name.unwrap_or_else(...)` з `.trim()`
- [ ] Після виправлення бекенд є єдиним джерелом правди (фронтенд може не змінюватись)
- [ ] `pnpm test` без регресій
- [ ] `pnpm build` без помилок
