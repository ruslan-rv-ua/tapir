---
slug: help-content-polish
title: "Довести до ума вбудовану довідку (F1)"
priority: P2
type: planned
status: ready
effort: M
kind: chore
target: 0.1.0
updated: 2026-07-22
a11y: false
depends_on: []
blocks: []
touches:
  - docs/help/uk/recording.md
  - docs/help/uk/wishlist.md
  - docs/help/uk/templates.md
  - docs/help/uk/scheduling.md
  - docs/help/uk/profiles.md
  - docs/help/en/recording.md
  - docs/help/en/wishlist.md
  - docs/help/en/templates.md
  - docs/help/en/scheduling.md
  - docs/help/en/profiles.md
gates: [pnpm vite:build]
---

# Довести до ума вбудовану довідку (F1)

> **Контекст:** HelpDialog (F1) має 7 вкладок; 5 із них — заглушки «Цей розділ незабаром буде доповнено.» Потребує написання реального контенту.

## Стан вкладок

| Вкладка | Файл uk | Файл en | Стан |
|---------|---------|---------|------|
| Огляд | `uk/overview.md` | `en/overview.md` | ✅ Є контент |
| Гарячі клавіші | `ShortcutsHelp.tsx` | (той самий) | ✅ Генерується із `SHORTCUTS` |
| Запис | `uk/recording.md` | `en/recording.md` | ❌ Заглушка |
| Вішліст | `uk/wishlist.md` | `en/wishlist.md` | ❌ Заглушка |
| Шаблони | `uk/templates.md` | `en/templates.md` | ❌ Заглушка |
| Розклад | `uk/scheduling.md` | `en/scheduling.md` | ❌ Заглушка |
| Профілі | `uk/profiles.md` | `en/profiles.md` | ❌ Заглушка |

## Що написати

Кожна вкладка — короткий практичний текст для сліпого користувача:

- **Запис** — як додати потік, як запускати запис вручну (Enter/Ctrl+Enter), що означають статуси. Формат запису — де зберігаються файли.
- **Вішліст** — що таке патерн, як додати, як Tapir сповіщає про збіг.
- **Шаблони** — синтаксис шаблонів імен файлів (змінні `{artist}`, `{title}` тощо), приклади.
- **Розклад** — як додати заплановану запис, одноразова vs повторювана, поняття pad-after.
- **Профілі** — що таке профіль, як створити/перейменувати/переключити, як копіювати/переносити потоки між профілями.

Обсяг: 150–300 слів на розділ (стислий reference-формат, не tutorial).

## Питання

- Чи потрібна окрема вкладка «Потоки» або «Браузер»? Зараз їх у довідці немає.
- Чи потрібна вкладка «Записи» (Songs Manager)?

## Критерії готовності

- [ ] Усі 5 заглушок замінено реальним контентом (uk і en)
- [ ] Контент коректно рендериться у `HelpDialog` (перевірити через `pnpm tauri dev` або скомпільовану версію)
- [ ] Форматування: Markdown → HTML через `marked` (або що використовує `getHelpHtml`) — перевірити що заголовки/списки відображаються
- [ ] NVDA: структура заголовків у кожній вкладці читається як `h2`/`h3`
- [ ] `pnpm vite:build` без помилок

## Документи

- `src/components/common/HelpDialog.tsx` — структура вкладок
- `src/components/common/HelpContent.tsx` — рендер HTML
- `docs/help/uk/overview.md` — зразок стилю для uk
- `docs/help/en/overview.md` — зразок стилю для en
