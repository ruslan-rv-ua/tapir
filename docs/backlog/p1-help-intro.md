---
slug: help-intro
title: "Довідка: Огляд і перші кроки + Навігація і клавіатура"
priority: P1
type: planned
status: ready
effort: M
kind: chore
target: 0.1.0
updated: 2026-08-08
a11y: false
depends_on: [help-content-polish]
blocks: [help-recording, help-listening, help-automation, help-config, help-troubleshooting]
touches:
  - docs/help/uk/overview.md
  - docs/help/en/overview.md
  - docs/help/uk/navigation.md
  - docs/help/en/navigation.md
  - src/components/common/HelpDialog.tsx
  - src/components/common/helpContent.test.ts
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
gates: [pnpm test, pnpm vite:build]
---

# Довідка: Огляд і перші кроки + Навігація і клавіатура

> **Контекст:** перший із шести записів, що наповнюють вбудовану довідку (F1).
> Специфікація — [help-content-polish](done/p1-help-content-polish.md): принцип універсального
> дизайну, стиль-гайд, конвенції розмітки й мапа покриття живуть **там**, тут їх не
> дублюємо. Іде першим, бо в `navigation.md` осідає канон наскрізних механік, на який
> посилаються всі екранні розділи, і тут же з'являються тести парності локалей.

## Опис

Два розділи:

- **`overview.md`** — переписати наявний: додати портативність, перший запуск, перелік
  шести екранів, `F1`/`Ctrl+K`/`Alt`+цифра. Обсяг — до 600 слів.
- **`navigation.md`** — новий: єдине повне пояснення зон `F6`, роботи в списках,
  виділення, `Delete`, меню рядка, палітри й рядка стану. На нього посилатимуться всі
  екранні розділи фразою «Загальні правила навігації — у розділі „Навігація і клавіатура"».

Точний перелік того, що зобов'язаний згадати кожен файл, — у розділі «Мапа покриття»
специфікації.

## Технічні кроки

- Нова вкладка `navigation` у `HelpDialog.tsx` — **між** `overview` і `shortcuts`.
- Нові ключі `help_section_navigation` в `uk.json` / `en.json`:
  «Навігація і клавіатура» / "Getting around".
- Змінити наявні ключі `help_section_overview`: «Огляд і перші кроки» /
  "Overview & first steps".
- Два тести в `helpContent.test.ts` (захист від старіння з специфікації):
  1. набір файлів `docs/help/uk/` дорівнює набору `docs/help/en/`;
  2. набір `id` вкладок у `HelpDialog` дорівнює набору файлів.

## Критерії готовності

- [ ] `overview.md` переписано (uk + en) за мапою покриття
- [ ] `navigation.md` написано (uk + en) за мапою покриття
- [ ] Вкладка «Навігація і клавіатура» стоїть другою, одразу після «Огляд і перші кроки»
- [ ] Стиль-гайд дотримано: друга особа, дія від наміру, нейтральний зворотний зв'язок,
      слова «NVDA»/«скрінрідер» — рівно один рядок сумісності в `overview.md`
- [ ] Розмітка: без таблиць, **без посилань**, лише `##`/`###`, backtick'и для клавіш
- [ ] Тест парності локалей і тест «вкладки = файли» додано й зелені
- [ ] `pnpm test`, `pnpm vite:build` — без помилок
- [ ] Візуальна перевірка в зібраному застосунку: обидва розділи рендеряться,
      заголовки — `h2`/`h3`

## Документи

- [help-content-polish](done/p1-help-content-polish.md) — специфікація (мапа, стиль, розмітка)
- [keyboard-shortcuts.md](../keyboard-shortcuts.md) — реєстр клавіш; **звіряти з кодом**
- `src/lib/shortcuts.ts`, `src/hooks/useCompositeList.ts`, `src/hooks/useZoneNavigation.ts`
- `src/components/layout/StatusBar.tsx` — склад рядка стану
