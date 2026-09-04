---
slug: zone-entry-dead-el
title: "ZoneEntry.el — обов'язкове поле інтерфейсу, якого не читає ніхто"
priority: P2
type: planned
status: ready
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-04
a11y: true
depends_on: [eslint-narrow-setup]
blocks: []
touches:
  - src/hooks/useZoneNavigation.ts
  - src/App.tsx
  - src/components/profile/ProfilesPanel.tsx
  - src/components/browser/BrowserPanel.tsx
  - src/components/schedule/SchedulePanel.tsx
  - src/components/songs/SongsPanel.tsx
  - src/components/streams/StreamsPanel.tsx
  - src/components/wishlist/WishlistPanel.tsx
  - src/components/browser/BrowserPanel.test.tsx
gates: [pnpm lint, pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Знайдено дослідженням eslint-adoption 2026-09-04: лінтер вказав на одне небезпечне ствердження, за яким виявилось мертве поле."
  - "Поки запис відкритий, ProfilesPanel.tsx:261 несе єдине придушення правила на весь проєкт."
---

# ZoneEntry.el — обов'язкове поле інтерфейсу, якого не читає ніхто

> **Контекст:** хвіст [eslint-narrow-setup](done/p2-eslint-narrow-setup.md).
> Механічна робота з нульовим впливом на поведінку, але в a11y-критичному коді, тому
> окремим записом, а не побіжно.

## Опис

[`ZoneEntry`](../../src/hooks/useZoneNavigation.ts) оголошує
`readonly el: HTMLElement` як обов'язкове поле. Читачів у продуктивному коді **немає
жодного**: `cycleZone` веде навігацію по `id` і `focus()`, а поточну зону знаходить
через `document.activeElement?.closest('[data-zone-id]')`. `useGlobalShortcuts` до
`.el` теж не звертається. Єдині згадки — це самі геттери, що поле заповнюють, плюс
одне звертання в тесті (`BrowserPanel.test.tsx:214`).

Ціна цієї порожнечі — близько двадцяти геттерів, кожен із яких мусить збрехати
компілятору, бо реф на момент створення об'єкта може бути незмонтований:

```tsx
get el() { return listRef.current?.el!; }              // ProfilesPanel.tsx:261
get el() { return resultsListRef.current?.el as HTMLElement; }  // BrowserPanel.tsx:68
```

Форм дві — `!` і `as HTMLElement` — і це та сама брехня. Лінтер бачить лише першу:
`@typescript-eslint/no-non-null-asserted-optional-chain` спіймав **1 із 7** таких
місць, решта шість написані через `as` і проходять мовчки. Тобто нинішній стан гірший
за «просто мертве поле»: він ще й нерівномірно видимий.

Поведінку зняття поля змінити не може: геттери ліниві, і їх ніхто не викликає.

## Що зробити

- [x] Прибрати `el` з `ZoneEntry`
- [x] Видалити ~20 геттерів, що його заповнюють — вийшло 29, плюс одинадцять
      DOM-рефів, які лишились би записуваними без жодного читача
- [x] Розібратися з `BrowserPanel.test.tsx:214` — єдиним звертанням; перевірити, що
      саме тест хотів довести, і чи не має він перевіряти `data-zone-id` замість поля.
      Тест доводив, що на час дозавантаження зона лишається на місці; тепер він читає
      `closest([data-zone-id])` від елемента у фокусі — рівно те, що читає `cycleZone`
- [x] Прибрати придушення в `ProfilesPanel.tsx:261` разом із коментарем, який на цей
      запис посилається

## Критерії готовності

- [x] `docs/help/` — запис видимої поведінки не змінює
- [x] У `src` не лишилось ані `?.el!`, ані `?.el as HTMLElement`
- [x] `pnpm lint` дає нуль **без** придушення
      `@typescript-eslint/no-non-null-asserted-optional-chain` у `ProfilesPanel.tsx`.
      (Формулювання уточнено на реалізації: директива `react-hooks/exhaustive-deps`
      у тому ж файлі стояла до запису, вона про залежності ефекту й одна з
      тринадцяти однакових у проєкті — цей запис її не чіпає.)
- [ ] Навігація F6 між зонами перевірена вручну: код a11y-критичний, і хоч поле
      мертве, помилка при видаленні впаде саме на перемиканні зон.
      Чекліст — [nvda-zone-entry-dead-el.md](../testing/nvda-zone-entry-dead-el.md)

## Документи

- [eslint-narrow-setup](done/p2-eslint-narrow-setup.md) — звідки взявся хвіст
- [eslint-adoption](done/p2-eslint-adoption.md) — знахідка №1 у звіті дослідження
- [useZoneNavigation.ts](../../src/hooks/useZoneNavigation.ts) — оголошення `ZoneEntry`
