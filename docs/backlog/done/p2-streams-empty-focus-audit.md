---
slug: streams-empty-focus-audit
title: "Аудит фокуса при спорожненні списку Streams"
priority: P2
type: research
status: done
effort: S
kind: bug
target: 0.2.0
updated: 2026-07-20
completed: 2026-07-20
a11y: true
depends_on: [wishlist-example-patterns]
blocks: []
touches: [src/components/streams/StreamList.tsx, src/components/streams/StreamsPanel.test.tsx]
gates: [pnpm test, pnpm vite:build]
---

# Аудит фокуса при спорожненні списку Streams

> **Контекст:** виконано. Гіпотеза **підтвердилась** — і ширше, ніж очікувалось:
> мертвими виявились не два, а **три** effect-reliant шляхи (третій — одиничне
> «Перемістити в профіль»). Виправлено за зразком `223fadb` у гілці
> `fix/streams-empty-focus`; 3 регресійні тести, всі перевірені як падаючі на
> невиправленому коді.

## Опис

Під час фінального ревʼю `wishlist-example-patterns` знайшли й виправили (коміт
`223fadb`) ваду у WishlistPanel: коли видаляєш **останній** патерн, батько в тому
самому рендері підміняє `PatternList` порожньою зоною → `PatternList`
розмонтовується → його `onEmpty` (ефект на `[items]` у
[useCompositeList](../../../src/hooks/useCompositeList.ts)) не встигає спрацювати →
фокус падає в `<body>`, NVDA мовчить. Ліки: прапорець `pendingFocusEmptyZone` +
ефект, що фокусує CTA порожньої зони.

**Гіпотеза:** [StreamsPanel](../../../src/components/streams/StreamsPanel.tsx) може
мати латентну версію тієї самої вади — він так само підміняє список власною
порожньою зоною (`streams-empty`), тож effect-шлях `onEmpty` у `StreamList`
за тим самим механізмом стає недосяжним.

## Результати трейсу (2026-07-20)

**Живі шляхи (bulk) — імперативний `onEmpty`, вада не відтворюється:**

- `handleConfirmBulkDelete` у `StreamList.tsx` — рахує survivors по видимому
  списку **до** запису в стор і викликає `onEmpty()` синхронно в тому ж блоці,
  до розмонтування.
- `doBulkTransfer` (bulk move) — та сама схема.
- Обидва покриті тестами «…never `<body>`» у `StreamsPanel.test.tsx`
  (секція «selection lifecycle»).

**Мертві шляхи (покладались на effect-спрацювання) — вада підтверджена:**

1. **Одиничне видалення останнього потоку** (`handleConfirmDelete`): писав у
   `$streams` без `onEmpty` і без прапорця. `isEmpty` фліпається в тому ж
   коміті → `StreamList` розмонтовується → ефект реконсиляції `[items]` у
   `useCompositeList` не встигає → react-aria повертає фокус на розмонтований
   рядок-тригер → `<body>`, NVDA мовчить.
2. **Filter-empty** — той самий обробник при видаленні останнього *видимого*
   рядка під активним фільтром: фліпається `filterHidesAll`, механіка та сама.
3. **Одиничне «Перемістити в профіль» останнього видимого потоку** (`doTransfer`,
   гілка `move`) — не згадувався у гіпотезі, але це той самий мертвий шлях:
   запис у `$streams` без `onEmpty`.

## Фікс

За зразком `223fadb`: у тому ж синхронному блоці, що й запис у стор, обчислити
видимих survivors (по відфільтрованому prop `streams`, не по повному стору) і
викликати `onEmpty()` імперативно — прапорець `pendingFocusEmptyZone` у
StreamsPanel уже існував, як і deferred-ефект, що фокусує CTA обох порожніх зон
(`streams-empty` → «Додати приклади», `streams-filter-empty` → «Скинути фільтр»).

- `handleConfirmDelete`: `if (streams.every((s) => s.id === pendingDeleteId)) onEmpty();`
- `doTransfer` (move): `if (streams.every((s) => s.id === streamId)) onEmpty();`

Регресійні тести (`StreamsPanel.test.tsx`, describe «SINGLE-op empty transitions
rescue focus», шаблон — тест R1 з
[WishlistPanel.test.tsx](../../../src/components/wishlist/WishlistPanel.test.tsx)):

- одиничне видалення останнього потоку → фокус на CTA «Додати приклади»;
- одиничне видалення останнього видимого під фільтром → фокус на «Скинути фільтр»;
- одиничне переміщення останнього потоку в інший профіль → фокус на CTA.

Усі три перевірено як падаючі до фікса. Gates: `pnpm test` (683/683),
`pnpm vite:build` — зелені.

## Документи

- Зразок симптому й ліків: [done/p2-wishlist-example-patterns.md](p2-wishlist-example-patterns.md)
  (секція «Спадщина»), фікс-коміт `223fadb` на гілці `feature/wishlist-example-patterns`.
- Код: [StreamList.tsx](../../../src/components/streams/StreamList.tsx),
  [StreamsPanel.tsx](../../../src/components/streams/StreamsPanel.tsx),
  [useCompositeList.ts](../../../src/hooks/useCompositeList.ts).
