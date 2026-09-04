---
slug: zone-id-union
title: "Ідентифікатор зони — рядок у трьох місцях, який ніхто не звіряє"
priority: P2
type: planned
status: draft
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-04
a11y: true
depends_on: [zone-entry-dead-el]
blocks: []
touches:
  - src/hooks/useZoneNavigation.ts
  - src/components/layout/ScreenZone.tsx
  - src/components/common/composite-list/CompositeList.tsx
  - src/App.tsx
gates: [pnpm lint, pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Знахідка код-рев'ю zone-entry-dead-el 2026-09-04: після зняття ZoneEntry.el поле id лишилось єдиним зв'язком зони з DOM."
  - "status: draft свідомо — рішення впирається в одне питання про сирі data-zone-id, див. «Відкриті питання»."
---

# Ідентифікатор зони — рядок у трьох місцях, який ніхто не звіряє

> **Контекст:** хвіст [zone-entry-dead-el](done/p2-zone-entry-dead-el.md).
> Запис у `draft`: підхід очевидний, але його цінність вирішує одне питання —
> чи дістає типізація до сирих атрибутів. Спершу грумінг, потім реалізація.

## Опис

Після зняття `ZoneEntry.el` поле `id` лишилось **єдиним зв'язком зони з DOM**.
Його коментар так і каже: «Must match the element's data-zone-id attribute» —
але це обіцянка на слово, не інваріант.

Один ідентифікатор пишеться **тричі, незалежно**:

1. `ZoneEntry.id` у реєстрації зони (15 зон);
2. носій у DOM — `<ScreenZone id=…>`, `<CompositeList zoneId=…>` або сирий
   `data-zone-id="…"` в JSX;
3. `exitZone("…", forward)` на межі зони — **21 виклик**.

Плюс один захардкоджений селектор у
[StationList.tsx](../../src/components/browser/StationList.tsx) —
`[data-zone-id="browser-results"]`. Разом близько півсотні рядкових літералів,
жоден із яких не звіряється з іншим ні компілятором, ні тестом.

Ціна помилки — **тиха неправильна навігація, а не падіння**.
[`cycleZone`](../../src/hooks/useZoneNavigation.ts) на невідомий `fromId` не
скаржиться:

```ts
const idx = zones.findIndex((z) => z.id === fromId);
fromIdx = idx < 0 ? (forward ? -1 : zones.length) : idx;
```

Тобто одруківка в `exitZone("streams-toobar")` не ламає нічого видимого: Tab на
межі зони просто поїде **в першу зону екрана замість наступної**. Це саме той
клас дефекту, який ловиться лише ручним NVDA-прогоном — і саме той, від якого
union із `tsc` у ролі сторожа коштує кілька рядків.

## Відкриті питання

- [ ] **Чи дістає union до сирих `data-zone-id`?** Шість носіїв — не компоненти,
      а руками написані елементи (`<nav>` бокової панелі, `<footer>` статусу,
      корінь програвача, три порожні зони). Пропси `ScreenZone.id` і
      `CompositeList.zoneId` типізуються тривіально; сирий атрибут лишається
      звичайним рядком. **Питання до розробника:** половина сторожа (реєстрація +
      компоненти + `exitZone`, але не шість сирих атрибутів) — це досить, щоб
      робити, чи це та сама нерівномірна видимість, за яку критикували стан
      `?.el!` проти `as HTMLElement` у батьківському записі?
- [ ] Якщо так — де живе union: поруч із `ZoneEntry` у `useZoneNavigation.ts` чи
      окремим модулем, який імпортують і `ScreenZone`, і панелі?
- [ ] Чи варто натомість (або додатково) закрити дірку **тестом**, який монтує
      екран і перевіряє, що кожен зареєстрований `id` має живий
      `[data-zone-id]`. Тест ловить і сирі атрибути, яких union не дістає.

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює
- [ ] Одруківка в будь-якому з трьох місць падає на `pnpm typecheck` (або на
      `pnpm test`, якщо обрано тестовий шлях) — перевірено **підсадженою**
      одруківкою, а не міркуванням
- [ ] Жодна зона не втратила носія: F6 обходить те саме коло, що й до зміни

## Документи

- [zone-entry-dead-el](done/p2-zone-entry-dead-el.md) — звідки взявся хвіст
- [useZoneNavigation.ts](../../src/hooks/useZoneNavigation.ts) — `ZoneEntry` і `cycleZone`
- [accessibility.md](../accessibility.md) — вимоги до зонової навігації
