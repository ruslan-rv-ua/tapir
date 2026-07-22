---
slug: command-palette-taxonomy
title: "Командна палітра — таксономія категорій і потоки-навігація"
priority: P1
type: idea
status: draft
effort: S
kind: feature
target: 0.1.0
updated: 2026-07-22
a11y: true
depends_on: []
blocks: [command-palette-phase-3]
touches: [src/components/common/CommandPalette.tsx, src/i18n/messages/uk.json, src/i18n/messages/en.json]
gates: [pnpm test, pnpm vite:build]
notes:
  - "Дизайн-уточнення до command-palette-phase-3, але реалізоване незалежно — поточна палітра вже є."
  - "2-рядковий формат вже є через sublabel. Змінюється семантика: sublabel = тип категорії, а не контекстний підпис."
---

# Командна палітра — таксономія категорій і потоки-навігація

> **Контекст:** поточна палітра вже відкрита та має `sublabel` для другого рядка. Ця ідея
> змінює **що** відображається в `sublabel` і додає **новий тип** пунктів — «потік» для
> навігації до рядка в списку.

## Опис

Кожен пункт палітри отримує явний **тип-категорію** як `sublabel`:

| Категорія | uk | en | Приклади |
|---|---|---|---|
| `control` | керування | control | «Додати потік», «Імпортувати», «Записати все» |
| `stream` | потік | stream | назви потоків профілю |
| `navigation` | навігація | navigation | «Перейти до: Браузер», «Налаштування» |

Кожен рядок у UI виглядає:
```
Radio Paradise
потік
```
```
Додати потік
керування
```

### Новий тип «потік»

Сьогодні per-stream пункти — це дії: «Записати / Зупинити» + `sublabel: stream.name`.

Нова ідея: **окремий пункт-потік** = назва станції + `sublabel: "потік"`.
При активації — встановити фокус на цей потік у списку потоків
(`$activeSection = "streams"` + `ScrollIntoView` + focus відповідного рядка).
Далі користувач сам виконує дію: Enter / R (Record) / Menu.

Дії «Записати/Зупинити» (поточна реалізація) можуть залишатися паралельно
або бути замінені — відкрите питання.

### Що залишається без змін (Phase 3)

Додавання пісень і повного набору навігаційних команд — у `command-palette-phase-3`
(там розширення *контенту*; тут — *форма відображення і семантика потоків*).

## Рішення

| Питання | Рішення |
|---|---|
| Per-stream пункти «Записати/Зупинити» | **Замінити** пунктами-потоками (не паралельно) |
| i18n-ключі категорій | **Потрібні**: `palette_kind_control`, `palette_kind_stream`, `palette_kind_navigation` |
| Навігаційні команди | **Чекати** на `command-palette-phase-3` |
| Активація «потік» | Закрити палітру → перейти в секцію Потоки → **фокус на рядку потоку** |
| Пошукова фільтрація | Тільки по `label`; substring `includes()` (не fuzzy); `sublabel` не шукається |
| Порядок пунктів | **Змішаний**, як зараз (без розбивки на групи) |
| Статус потоку (REC/Playing) | **Іконка/емоджі перед назвою**: `🔴 Radio Paradise` або `▶ Radio Paradise` |
| Гарячі клавіші у control-пунктах | **Не показувати** зараз |
| «Нещодавно використані» | **Не додавати** — це phase-4 (context-aware ranking) |
| NVDA: кількість результатів | **aria-live** регіон, оголошення після дебаунсу 300 мс |
| Empty state | **i18n-ключ** `palette_no_results`: «Нічого не знайдено» / «No results» |

## Критерії готовності

- [ ] `PaletteItem` має поле `kind: "control" | "stream" | "navigation"`
- [ ] `sublabel` всіх статичних пунктів показує локалізовану назву категорії (`palette_kind_*`)
- [ ] Per-stream пункти «Записати/Зупинити» **прибрано**; залишено лише «Записати все» / «Зупинити все»
- [ ] Пункти-потоки: `label = stream.name`, `sublabel = m.palette_kind_stream()`, `kind = "stream"`
- [ ] Статус: `🔴` перед назвою якщо записує; `▶` якщо програється
- [ ] `hintLabel` (між label і sublabel) = `hostname` з URL потоку; показується завжди
- [ ] Алгоритм тай-брейкера для потоків з однаковою назвою:
  1. Різний hostname → hostname disambiguates автоматично
  2. Однаковий hostname, різний бітрейт → додати `· 320 kbps MP3` до hintLabel
  3. Однаковий hostname + бітрейт → показати повний URL без протоколу
- [ ] Активація пункту-потоку: `$activeSection = "streams"` + фокус на рядку з відповідним `stream.id`
- [ ] Пошук фільтрує тільки по `label` (substring); `sublabel`/`hintLabel` не шукаються
- [ ] Порядок пунктів — змішаний, без групування
- [ ] aria-live регіон: оголошує «N результатів» після 300 мс дебаунсу
- [ ] Empty state: `m.palette_no_results()` замість hardcoded «No results»
- [ ] NVDA читає label + hintLabel + sublabel (перевірити через `aria-label` на `<li>`)
- [ ] Нові i18n-ключі: `palette_kind_control`, `palette_kind_stream`, `palette_kind_navigation`, `palette_no_results` (uk + en)
- [ ] Тести оновлені: per-stream «Записати» відсутній, пункт-потік присутній з правильним sublabel
