---
slug: player-transport-tab-order
title: "Прогін NVDA: кнопки транспорту плеєра вийшли з рідного порядку Tab"
priority: P2
type: planned
status: ready
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-04
a11y: true
depends_on: [typecheck-gate]
blocks: []
touches:
  - src/components/player/PlayerPanel.tsx
  - src/components/player/PlayerPanel.test.tsx
gates: [pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Код уже написаний і злитий разом із typecheck-gate; цей запис — лише ручна перевірка, якої той запис не вимагав (a11y: false)."
  - "Автотест уже є: PlayerPanel.test.tsx, «keeps every transport button out of the tab order». Він доводить атрибут, не відчуття."
---

# Прогін NVDA: кнопки транспорту плеєра вийшли з рідного порядку Tab

> **Контекст:** хвіст [typecheck-gate](done/p1-typecheck-gate.md). Коду писати не
> треба — треба **почути**, що зміна нічого не зламала.

## Опис

`tabIndex={-1}` на п'яти кнопках транспорту (`Попередній`, `Відтворити/Пауза`,
`Зупинити`, `Наступний`, `Звук`) react-aria **ігнорував**: усі п'ять рендерились
із `tabindex="0"`, тобто були рідними Tab-стопами всупереч моделі зони
(«стрілки ходять по стопах, `Tab` виводить із зони» —
[accessibility.md §4.1](../accessibility.md)). Замінено на підтримуваний
`excludeFromTabOrder`, і тепер атрибут дорівнює `-1`.

Практично різниці може й не бути: `usePlayerZoneNav.onRootKeyDown` перехоплює
`Tab` усередині панелі, тож рідний порядок там і не використовувався. Усі 1158
тестів лишились зелені без єдиної правки. Але це фокус у плеєрі, а перевірити
дешевше, ніж вгадувати.

Записи, у яких зміну описано детальніше: `notes:` і рядок «Виконано» ROADMAP для
[typecheck-gate](done/p1-typecheck-gate.md).

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює (модель клавіатури зони
      описана й лишилась тією самою)
- [ ] NVDA-прогін за [чеклістом](../testing/nvda-player-transport-tab-order.md) пройдено, зауважень немає
- [ ] запис закрито розробником після прогону (агент такий запис не закриває)

## Документи

- [PlayerPanel.tsx](../../src/components/player/PlayerPanel.tsx) — п'ять `excludeFromTabOrder`
- [usePlayerZoneNav.ts](../../src/hooks/usePlayerZoneNav.ts) — модель навігації зони
- [accessibility.md](../accessibility.md) §4.1 — зона плеєра
