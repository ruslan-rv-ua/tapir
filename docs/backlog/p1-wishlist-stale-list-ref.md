---
slug: wishlist-stale-list-ref
title: "Застарілий patternListRef після перемикання вкладки Wishlist/Ignorelist"
priority: P1
type: planned
status: ready
effort: S
kind: bug
target: 0.1.0
updated: 2026-08-06
a11y: true
depends_on: [wishlist-example-patterns]
blocks: []
touches: [src/components/wishlist/WishlistPanel.tsx, src/components/wishlist/WishlistPanel.test.tsx]
gates: [pnpm test, pnpm vite:build]
notes:
  - "NVDA-прогін після фікса: тулбарна «Видалити вибрані» та F6 до списку після перемикання вкладки"
  - "обхід у тесті ignorelist-bulk (d305323, select-all + рядковий ✕) лишити — він покриває рядковий шлях; новий тест покриває тулбарний"
  - "TypeScript: callback-ref із cleanup не може мати implicit return — тіло в фігурних дужках"
---

# Застарілий patternListRef після перемикання вкладки Wishlist/Ignorelist

> **Контекст:** реалізовано 2026-08-06 у гілці `fix/wishlist-stale-list-ref`
> (фікс **(б)** — cleanup-функція callback-ref, React 19). Код і гейти готові;
> лишився **NVDA-прогін** перед прийманням. Дослідження — див. «Прийняті рішення».

## Опис

Обидва `<PatternList>` у [WishlistPanel](../../src/components/wishlist/WishlistPanel.tsx)
ділять один стабільний callback-ref (`patternListCallbackRef`). RAC `TabPanel`
тримає деселектнуту панель змонтованою **ще один коміт** (`useExitAnimation`),
тож при перемиканні вкладки порядок — **attach(нова, коміт N) → detach(стара,
коміт N+1)**: `null` від розмонтування старої приходить після attach нової і
затирає `patternListRef.current` на живому списку. Callback-ref стабільний,
повторного attach не буде до наступного ремоунту.

Механізм **середовищно-незалежний**: у JSDOM (`getAnimations` відсутній) і в
реальному браузері без CSS-анімацій (`animations.length === 0`) `useExitAnimation`
однаково розмонтовує стару панель окремим комітом — баг очікувано відтворюється
і в застосунку з NVDA, не лише в тестах.

**Наслідки на перемкнутій вкладці:**

- тулбарна кнопка «Видалити вибрані» мовчки no-op
  (`patternListRef.current?.requestBulkRemove()`) — для NVDA-користувача без
  жодного фідбеку;
- проксі-зона `wishlist-list` відхиляє фокус → F6 пропускає список
  (`cycleZone` за контрактом пропускає зони, що відхиляють фокус).

## Прийняті рішення (дослідження 2026-07-23)

**Корінь (підтверджено кодом установлених пакетів):** RAC 1.16
`Tabs.mjs:252-253` — `if (!isSelected && !shouldForceMount && !isExiting) return null;`,
де `isExiting` з `useExitAnimation` (`@react-aria/utils` `animation.mjs`)
синхронно стає `true` у рендері деселекту і скидається в layout-ефекті
наступним комітом.

**Обраний фікс (б) — cleanup-функція callback-ref.** React 19 (у проєкті)
підтримує повернення cleanup із callback-ref; тоді React **не викликає ref з
`null`** при розмонтуванні, а cleanup привʼязаний до конкретного інстанса.
Працює й через `useImperativeHandle` (офіційний блог React v19); наш ланцюжок
PatternList → CompositeList → `useImperativeHandle` — чистий React, без
сторонніх обгорток ref, які цю семантику ламають (відомі кейси: MUI #45538,
motion #3360).

```ts
const patternListCallbackRef = useCallback((zone: PatternListHandle) => {
  patternListRef.current = zone;
  return () => {
    if (patternListRef.current === zone) patternListRef.current = null;
  };
}, []);
```

Стара панель викликає лише свій cleanup; guard бачить, що ref уже на новому
handle — і не затирає. Перемикання на порожню вкладку (без нового attach)
коректно занулює. Один ref зберігається → патерн стабільного проксі
`patternListProxyRef` не чіпаємо.

**Відхилено:** (а) окремі refs на вкладку — розгалуження по `activeTab` у
кожному споживачі (тулбар, проксі, `pendingFocusFirstRow`, реєстрація зон) без
виграшу; (в) `key={activeTab}` — панелі й так окремі інстанси, порядок
розмонтування диктує `useExitAnimation`, на який key не впливає, а ремоунт
`<Tabs>` скинув би фокус/контекст для NVDA.

## Критерії готовності

- [x] Регресійний тест (спершу падає): обидва списки непорожні → перемкнутись
      на Ignorelist → select-all → **тулбарна** «Видалити вибрані» → відкрився
      bulk-confirm, після підтвердження викликано `removeFromIgnorelistBulk`.
      (Наявний `routes the cluster delete…` покриває лише стартову вкладку.)
      — `the TOOLBAR delete still reaches the list after switching tabs`.
- [x] Додатково покрито другий симптом: `F6 still reaches the pattern list after
      switching tabs` — через `ZoneHarness`, реальний шлях Tab → composite-exit →
      `cycleZone` (до фікса фокус ішов у status-bar, бо зона відхиляла focus).
- [x] Фікс (б) у `WishlistPanel.tsx`: `patternListCallbackRef` повертає cleanup
      із guard `patternListRef.current === zone`; тести зеленіють.
- [x] Гейти: `pnpm test` (708 тестів, 77 файлів), `pnpm vite:build`.
- [ ] NVDA-прогін: після перемикання вкладки «Видалити вибрані» відкриває
      confirm (озвучується), F6 доходить до списку. Чекліст —
      [nvda-wishlist-stale-list-ref.md](../testing/nvda-wishlist-stale-list-ref.md)
      (7 сценаріїв; суть фікса — сценарії 1–3).

## Документи

- Код: [WishlistPanel.tsx](../../src/components/wishlist/WishlistPanel.tsx)
  (`patternListCallbackRef`, проксі `patternListProxyRef`),
  [WishlistPanel.test.tsx](../../src/components/wishlist/WishlistPanel.test.tsx).
- Джерела дослідження:
  [React v19 — Cleanup functions for refs](https://react.dev/blog/2024/12/05/react-19)
  (працює для `useImperativeHandle`; TS-заборона implicit return),
  RAC `Tabs.mjs` + `@react-aria/utils` `animation.mjs` (установлені пакети),
  [MUI #45538](https://github.com/mui/material-ui/issues/45538) і
  [motion #3360](https://github.com/motiondivision/motion/issues/3360)
  (обгортки ref, що ламають cleanup — у нашому ланцюжку таких немає).
- Споріднений механізм: memory-нотатка про стабільні проксі зон;
  [done/p2-wishlist-example-patterns.md](done/p2-wishlist-example-patterns.md) —
  follow-up-хвиля, в якій знахідку зроблено.
