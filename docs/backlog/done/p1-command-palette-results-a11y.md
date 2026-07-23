---
slug: command-palette-results-a11y
title: "Командна палітра — i18n порожнього стану + оголошення кількості результатів (NVDA)"
priority: P1
type: planned
status: done
effort: S
kind: feature
target: 0.1.0
updated: 2026-07-23
completed: 2026-07-23
a11y: true
depends_on: []
blocks: []
touches: [src/components/common/CommandPalette.tsx, src/i18n/messages/uk.json, src/i18n/messages/en.json]
gates: [pnpm test, pnpm vite:build]
notes:
  - "Виділено з command-palette-taxonomy: дешеві, модель-незалежні покращення, що стоять окремо від спірної таксономії категорій."
  - "Частково закриває a11y-критерій phase-3 «кількість результатів оголошена aria-live» — але тут без будь-яких змін до моделі пунктів."
  - "Реалізовано на гілці feature/command-palette-results-a11y (TDD, 9edb595). Оголошення кількості — через глобальний LiveAnnouncer (useAnnounce, priority polite, дебаунс 300 мс), а не окремий регіон усередині палітри: його регіони мають data-live-announcer, тож react-aria не заглушує їх. Гейти зелені (pnpm test 693/693, pnpm vite:build)."
  - "NVDA-прогін 2026-07-23 ✅ — оголошення кількості результатів і порожного стану працюють. Готово до релізу."
---

# Командна палітра — i18n порожнього стану + оголошення кількості результатів (NVDA)

> **Контекст:** два невеликі, самодостатні покращення палітри, що **не залежать**
> від моделі пунктів (нинішньої чи майбутньої з `command-palette-taxonomy`). Обидва —
> чиста доступність/локалізація над наявним компонентом.

## Опис

Виділено з [`command-palette-taxonomy`](p2-command-palette-taxonomy.md) — там лишилися
спірні зміни семантики (категорія-як-`sublabel`, пункти-навігація замість дій). Тут —
лише те, що цінне вже зараз і ні від чого не залежить.

### 1. i18n порожнього стану

Зараз рядок «No results» **захардкоджено** ([CommandPalette.tsx:230](../../src/components/common/CommandPalette.tsx#L230)) —
не локалізується. Замінити на новий i18n-ключ `palette_no_results` («Нічого не знайдено» / «No results»).

### 2. Оголошення кількості результатів (NVDA)

Зараз при фільтруванні NVDA не повідомляє, скільки пунктів лишилось — незрячий
користувач набирає всліпу. Додати `aria-live` регіон, що після дебаунсу **300 мс**
оголошує кількість поточних результатів (у т.ч. «0» для порожнього стану).

- Регіон — `aria-live="polite"`, у межах діалогу (пам'ятати про
  [[live-region-inside-modals]]: усередині модалки потрібен `data-live-announcer="true"`,
  інакше react-aria aria-hide заглушить оголошення — перевірити, чи стосується цього overlay).
- Дебаунс, щоб швидкий набір не сипав оголошеннями на кожну літеру.
- Повідомлення — i18n-ключ із параметром-кількістю, напр. `palette_results_count`.

## Критерії готовності

- [ ] `palette_no_results` (uk + en) замість захардкодженого «No results»
- [ ] `aria-live` регіон оголошує кількість результатів після 300 мс дебаунсу
- [ ] Порожній стан теж оголошується («0 результатів» / відповідний ключ)
- [ ] Новий ключ кількості (напр. `palette_results_count`) з параметром-числом (uk + en)
- [ ] Оголошення чутне при відкритій модалці (перевірити `data-live-announcer`, [[live-region-inside-modals]])
- [ ] Тести: порожній стан рендерить локалізований рядок; регіон містить кількість
- [ ] Нічого в **моделі пунктів** не змінено (жодного `kind`, `hintLabel`, зміни `sublabel`)

## Документи

- Код: [src/components/common/CommandPalette.tsx](../../src/components/common/CommandPalette.tsx) — `filtered`, порожній `<li>`, `<ul role="listbox">`
- Тести: `src/components/common/CommandPalette.test.tsx`
- Спірна частина, винесена окремо: [command-palette-taxonomy](p2-command-palette-taxonomy.md)
