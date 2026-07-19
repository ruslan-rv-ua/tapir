---
slug: streams-empty-focus-audit
title: "Аудит фокуса при спорожненні списку Streams"
priority: P2
type: research
status: ready
effort: S
kind: bug
target: 0.2.0
updated: 2026-07-19
a11y: true
depends_on: [wishlist-example-patterns]
blocks: []
touches: [src/components/streams/StreamsPanel.tsx, src/hooks/useCompositeList.ts]
gates: [pnpm test, pnpm vite:build]
---

# Аудит фокуса при спорожненні списку Streams

> **Контекст:** дослідження — підтвердити чи спростувати гіпотезу (спадок фіксу [wishlist-example-patterns](done/p2-wishlist-example-patterns.md)), не одразу кодити.

## Опис

Під час фінального ревʼю `wishlist-example-patterns` знайшли й виправили (коміт
`223fadb`) ваду у WishlistPanel: коли видаляєш **останній** патерн, батько в тому
самому рендері підміняє `PatternList` порожньою зоною → `PatternList`
розмонтовується → його `onEmpty` (ефект на `[items]` у
[useCompositeList](../../src/hooks/useCompositeList.ts)) не встигає спрацювати →
фокус падає в `<body>`, NVDA мовчить. Ліки: прапорець `pendingFocusEmptyZone` +
ефект, що фокусує CTA порожньої зони.

**Гіпотеза:** [StreamsPanel](../../src/components/streams/StreamsPanel.tsx) може
мати латентну версію тієї самої вади — він так само підміняє список власною
порожньою зоною (`streams-empty`), тож effect-шлях `onEmpty` у `StreamList`
за тим самим механізмом стає недосяжним.

**Чому це лише гіпотеза, а не баг.** Bulk-delete у Streams, найімовірніше,
живий: `onEmpty` викликається **імперативно** зсередини обробника bulk-видалення
(до розмонтування; див. коментар «Set by StreamList.onEmpty when a bulk delete
clears the visible list» біля `pendingFocusEmptyZone` у StreamsPanel і ефект,
що фокусує CTA порожньої зони). Питання відкрите лише для шляхів, які покладаються
на effect-спрацювання.

## Що з'ясувати

- [ ] Трейс **одиничного** видалення останнього потоку (Delete на рядку →
      підтвердження → оновлення стора → `isEmpty` flips): хто після цього володіє
      фокусом? Чи виставляється `pendingFocusEmptyZone` на цьому шляху?
- [ ] Те саме для переходу **filter-empty** (`streams-filter-empty`): видалення
      останнього видимого рядка при активному фільтрі.
- [ ] Якщо фокус справді падає в `<body>` — виправити за зразком фікса `223fadb`
      (прапорець у тому ж синхронному блоці, що й запис у стор) + тест, який
      падає на невиправленому коді (шаблон: тест «deleting the last remaining
      pattern moves focus to the empty-state CTA» у
      [WishlistPanel.test.tsx](../../src/components/wishlist/WishlistPanel.test.tsx)).
- [ ] Якщо вада не відтворюється — задокументувати, **чому** шлях живий
      (де саме виставляється прапорець/фокус), і закрити запис у `done/`.

## Документи

- Зразок симптому й ліків: [done/p2-wishlist-example-patterns.md](done/p2-wishlist-example-patterns.md)
  (секція «Спадщина»), фікс-коміт `223fadb` на гілці `feature/wishlist-example-patterns`.
- Код: [StreamsPanel.tsx](../../src/components/streams/StreamsPanel.tsx),
  [useCompositeList.ts](../../src/hooks/useCompositeList.ts).
