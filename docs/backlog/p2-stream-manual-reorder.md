---
slug: stream-manual-reorder
title: "Ручне сортування потоків — ↑↓ кнопки або drag-and-drop"
priority: P2
type: idea
status: draft
effort: M
kind: feature
target: 0.3.0
updated: 2026-10-04
a11y: true
depends_on: []
blocks: []
touches: [src-tauri/src/profile.rs, src-tauri/src/commands/stream_commands.rs, src/components/streams/StreamItem.tsx, src/components/streams/StreamList.tsx, src/stores/streams.ts]
gates: [pnpm test, cargo test]
---

# Ручне сортування потоків — ↑↓ кнопки або drag-and-drop

> **Контекст:** Зараз потоки сортуються за назвою або датою додавання — профільне
> налаштування `UiSettings.stream_sort` (`src-tauri/src/profile.rs:259-260`, enum `StreamSort`
> `:279`; у вебв'ю `streamSort`, `src/stores/streams.ts:34`, `:47`). Ручний порядок дозволяє
> розмістити улюблені станції нагорі.

## Опис

Новий режим сортування `"manual"` у профільному `StreamSort` (з 2026-08-08 сортування — у
профілі, а не в `GlobalSettings.sortBy`, див. ADR 2026-08-08 про межу глобального й
профільного). В цьому режимі:

- Порядок потоків зберігається у профілі явно (поле `order` або позиційний масив id)
- Доступне перетягування рядків (drag-and-drop) для мишкових користувачів
- Клавіатурне переміщення через ↑↓ кнопки (або Alt+Up / Alt+Down) у рядку потоку
- При додаванні нового потоку — він іде в кінець списку

Для сліпого користувача drag-and-drop непридатний — клавіатурні кнопки є основним методом.

## Критерії готовності

- [ ] `docs/help/` оновлено: `streams.md` (обидві локалі) описує ручний порядок і клавіші
      переміщення
- [ ] Новий варіант `"manual"` у профільному `StreamSort` (`UiSettings.stream_sort`)
- [ ] `StreamInfo` або профіль зберігає явний порядок (масив id або поле `position: u32`)
- [ ] IPC: `reorder_stream(stream_id, direction: "up" | "down")` або `move_stream(id, new_index)`
- [ ] Клавіатура: Alt+Up / Alt+Down (або Ctrl+Shift+Up/Down) переміщує потік
- [ ] Кнопки ↑↓ у context menu рядка потоку (або окремі action-кнопки)
- [ ] NVDA: оголошення «<назва> переміщено вгору/вниз, позиція N з M»
- [ ] При `streamSort !== "manual"` — кнопки переміщення недоступні (aria-disabled)

## Відкриті питання

- Де зберігати порядок: окреме поле `stream_order: Vec<String>` у профілі,
  чи поле `position: u32` в кожному `StreamInfo`?
- Чи підтримувати drag-and-drop взагалі (складність для a11y — потребує ARIA live region
  і keyboard fallback), чи тільки кнопки?
- Яка комбінація клавіш для переміщення (не конфліктує з existing shortcuts)?
