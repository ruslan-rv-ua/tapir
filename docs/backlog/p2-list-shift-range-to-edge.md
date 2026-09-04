---
slug: list-shift-range-to-edge
title: "Списки: Shift+Home / Shift+End розширюють діапазон до краю"
priority: P2
type: planned
status: draft
effort: S
kind: feature
target: 0.3.0
updated: 2026-09-04
a11y: true
depends_on: [list-key-modifier-guards]
blocks: []
touches:
  - src/hooks/useCompositeList.ts
  - src/hooks/useCompositeList.test.tsx
gates: [pnpm test, pnpm vite:build]
notes:
  - "Заведено грилінгом list-key-modifier-guards (2026-09-04, рішення A3/A11). Клавіші звільнились саме там: той запис зробив їх інертними замість напівправильних"
  - "Обсяг спірний і вирішується GROOMING: чи входять Shift+PageUp/PageDown і Shift+Ctrl+Home. Мінімум — пара Home/End"
---

# Списки: `Shift+Home` / `Shift+End` розширюють діапазон до краю

> **Контекст:** борг, названий
> [ADR «Клавіші списку голі, поки не названо інакше»](../decisions/2026-09-04-list-keys-are-bare-unless-named.md)
> (§2 і «Обмеження»). Коду немає, дизайну немає — потрібен GROOMING перед реалізацією.

## Опис

`useCompositeList` уміє розширювати виділення `Shift+↑` і `Shift+↓` (`selectRangeUp` /
`selectRangeDown`, якір + `anchorBase`, Explorer-inclusive — див.
[ADR про включення сфокусованого рядка](../decisions/2026-06-21-shift-range-includes-focused-row.md)).
Розширення **до краю** — `Shift+Home` і `Shift+End` — не вміє.

До [list-key-modifier-guards](done/p2-list-key-modifier-guards.md) ці клавіші робили дещо гірше за
«нічого»: `Shift+End` стрибав у кінець списку **і перевстановлював якір**, тобто мовчки
знищував діапазон, який людина щойно будувала через `Shift+↓`. Той запис зробив їх інертними
саме для того, щоб фічу потім **додавали**, а не перевчали від неї.

Зараз у списку видима нерівність: `Shift+↑/↓` є, `Shift+Home`/`End` — немає, хоча в Провіднику,
у списках Windows і в будь-якому `role="listbox"` вони працюють. Клавіші вільні, семантика
відома, ціна мала.

## Розвилки для GROOMING

- **Обсяг.** Мінімум — пара `Home`/`End`. Чи входять `Shift+PageUp`/`PageDown` (розширити на
  сторінку) і `Ctrl+Shift+Home`/`End`? Кожна додає гілку у `switch` і рядок у F1-довідник.
- **Якір.** Чи `Shift+End` розширює від наявного якоря (як `Shift+↓`), чи від сфокусованого
  рядка, якщо виділення порожнє? Прецедент уже є в `selectRangeDown` — імовірно просто
  повторити його, але це треба назвати, а не успадкувати мовчки.
- **Оголошення.** `selectRangeUp/Down` шлють `onSelectionChange({kind:"group", via:"key"})`, і
  списки з нього говорять кількість. Розширення на 500 рядків одним натисканням — та сама
  подія, чи інша репліка?
- **Куди їде курсор.** У `Shift+↓` курсор іде на сусідній рядок. У `Shift+End` — на останній,
  тобто `moveFocus` через увесь список; чи це те саме, що `End`, з погляду прокрутки й
  `memoryRef`.

## Критерії готовності

- [ ] Обсяг ухвалено на GROOMING (мінімум `Shift+Home`/`Shift+End`)
- [ ] Гілки оголошені **вище** спільного гарда `resolveKeyAction` — як названі винятки
      (ADR §1), а не як послаблення гарда
- [ ] Якір і `anchorBase` поводяться так само, як у `selectRangeUp/Down`
- [ ] Тести на: порожнє виділення, наявний якір вище/нижче курсора, список з одного рядка,
      курсор на завершальному стопі (ADR про завершальний стоп §2 — команда по рядках)
- [ ] F1-довідник і `docs/help/navigation.md` названі клавіші згадують
- [ ] `pnpm test`, `pnpm vite:build`
- [ ] NVDA-прогін: чи кількість виділених оголошується один раз і по суті

## Документи

- ADR: [2026-09-04-list-keys-are-bare-unless-named.md](../decisions/2026-09-04-list-keys-are-bare-unless-named.md) (§2)
- ADR: [2026-06-21-shift-range-includes-focused-row.md](../decisions/2026-06-21-shift-range-includes-focused-row.md)
- Код: `src/hooks/useCompositeList.ts` (`selectRangeUp`/`selectRangeDown`, `anchorRef`, `anchorBaseRef`)
- Батьківський запис: [p2-list-key-modifier-guards.md](done/p2-list-key-modifier-guards.md)
