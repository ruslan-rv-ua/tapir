# Застарілий patternListRef після перемикання вкладки Wishlist/Ignorelist

- **Слаг:** `wishlist-stale-list-ref`
- **Тип:** дослідити
- **Стан:** ready
- **Зусилля:** S
- **Оновлено:** 2026-07-19
- **Залежності:** немає (знахідка з follow-up-хвилі [wishlist-example-patterns](done/p2-wishlist-example-patterns.md))

## Опис

Обидва `<PatternList>` у [WishlistPanel](../../src/components/wishlist/WishlistPanel.tsx)
ділять один стабільний callback-ref (`patternListCallbackRef`). Інструментований
прогін тестів (2026-07-19) показав, що під час перемикання вкладки виклики
приходять у порядку **attach(нова) → detach(стара) → null**: react-aria Tabs
тримає стару панель ще один рендер, тож null від її розмонтування приходить
**після** attach нової і затирає `patternListRef.current` на живому списку.
Callback-ref стабільний (`useCallback([])`), повторного attach не буде до
наступного ремоунту — тобто ref лишається `null` до наступного перемикання.

**Ймовірні наслідки на перемкнутій вкладці** (підтверджено лише в тест-середовищі):

- тулбарна кнопка «Видалити вибрані» мовчки no-op
  (`patternListRef.current?.requestBulkRemove()`);
- проксі-зона `wishlist-list` відхиляє фокус → F6 пропускає список
  (`cycleZone` за контрактом пропускає зони, що відхиляють фокус — див.
  стабільні проксі в [useZoneNavigation](../../src/hooks/useZoneNavigation.ts)).

Обхід у тестах уже застосовано: тест bulk-шляху ignorelist (коміт `d305323`)
свідомо їде через select-all + рядковий ✕ (відкриває bulk-confirm без ref).

## Що з'ясувати

- [ ] Відтворити в реальному застосунку з NVDA: перемкнутися на Ignorelist,
      вибрати все, натиснути «Видалити вибрані»; окремо — F6 до списку після
      перемикання. Якщо відтворюється — це кандидат на підняття до P1.
- [ ] Падаючий тест: «після перемикання вкладки тулбарна кнопка Видалити
      вибрані відкриває bulk-confirm» (зараз такого покриття немає — наявний
      тест `routes the cluster delete…` працює лише на стартовій вкладці).
- [ ] Варіанти фікса: (а) окремі callback-refs на вкладку; (б) guard у
      callback-ref — ігнорувати null, якщо елемент, що відмонтовується, не є
      поточним власником; (в) ремоунт через `key={activeTab}`. Оцінити проти
      патерну стабільних проксі-зон.

## Документи

- Код: [WishlistPanel.tsx](../../src/components/wishlist/WishlistPanel.tsx)
  (`patternListCallbackRef`, проксі `patternListProxyRef`),
  [PatternList.tsx](../../src/components/wishlist/PatternList.tsx).
- Споріднений механізм: memory-нотатка про стабільні проксі зон;
  [done/p2-wishlist-example-patterns.md](done/p2-wishlist-example-patterns.md) —
  follow-up-хвиля, в якій знахідку зроблено.

## Промпт для агента

Каталог промптів за типом: [README — Каталог промптів](README.md#каталог-промптів-за-типом).

```text
Дослідь цей запис. Спершу відтвори (реальний застосунок або падаючий тест на
перемкнутій вкладці), потім обери варіант фікса з розділу «Що з'ясувати» і
реалізуй з тестом. Не чіпай спільний composite-list — проблема у wiring
WishlistPanel. Гейти: `pnpm test` і `pnpm vite:build`; NVDA-перевірка тулбарного
bulk-delete і F6 після перемикання вкладки.
```
