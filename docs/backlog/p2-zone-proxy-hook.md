---
slug: zone-proxy-hook
title: "Дев'ять стабільних проксі зон — один і той самий тризрядковий об'єкт"
priority: P2
type: planned
status: ready
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-05
a11y: true
depends_on: [zone-entry-dead-el]
blocks: []
touches:
  - src/hooks/useZoneNavigation.ts
  - src/App.tsx
  - src/components/browser/BrowserPanel.tsx
  - src/components/schedule/SchedulePanel.tsx
  - src/components/songs/SongsPanel.tsx
  - src/components/streams/StreamsPanel.tsx
  - src/components/wishlist/WishlistPanel.tsx
gates: [pnpm lint, pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Знахідка код-рев'ю zone-entry-dead-el 2026-09-04: зі зняттям ZoneEntry.el проксі схудли до трьох однакових рядків у шести файлах."
  - "П'ять із дев'яти несуть майже дослівно однаковий коментар — його теж має лишитись рівно один."
  - "Хвіст рев'ю 2026-09-05: «Скинути фільтр» на Потоках лишає фокус на <body> — окремий запис streams-reset-filter-focus-drop; чекліст обходить це трьома F6."
---

# Дев'ять стабільних проксі зон — один і той самий тризрядковий об'єкт

> **Контекст:** хвіст [zone-entry-dead-el](done/p2-zone-entry-dead-el.md).
> Механічна робота з нульовим впливом на поведінку, але в a11y-критичному коді —
> як і батьківський запис, тому окремим записом, а не побіжно.

## Опис

Стабільний проксі-`ZoneEntry` — це відповідь на реальну ваду: зона, що
демонтується (список у стані loading/error/empty), лишає в `App` мертвий
`ZoneEntry`, чий `focus()` нічого не робить, і F6 мовчки глухне. Проксі
створюється один раз і завжди делегує **поточному** хендлу. Рішення правильне;
див. [wishlist-stale-list-ref](done/p1-wishlist-stale-list-ref.md).

Поки `ZoneEntry` мав поле `el`, кожен проксі був чотирирядковим і кожен по-своєму
брехав компілятору в геттері. Зі зняттям поля
([zone-entry-dead-el](done/p2-zone-entry-dead-el.md)) від них лишилось **по три
однакові рядки, дев'ять разів у шести файлах**:

```tsx
const listProxyRef = useRef<ZoneEntry>({
  id: "songs-list",
  focus: (dir) => listRef.current?.focus(dir),
});
```

Дев'ять місць: [App.tsx](../../src/App.tsx) ×3 (постійні зони),
`BrowserPanel`, `SchedulePanel`, `SongsPanel`, `StreamsPanel`,
`WishlistPanel` ×2 (патерни й журнал збігів).

Дублюється не лише код. **П'ять із дев'яти несуть майже дослівно однаковий
коментар** на 3–5 рядків, який щоразу пояснює той самий механізм — і кожна
наступна копія посилається на попередню («той самий патерн, що в `App.tsx`»,
«mirrors SongsPanel/SchedulePanel»). Пояснення механізму має **одного власника**,
решта на нього посилається.

## Що зробити

- [x] Завести `useZoneProxy(id, ref)` поруч із `ZoneEntry`
      ([useZoneNavigation.ts](../../src/hooks/useZoneNavigation.ts)) — там, де
      живе тип, який він повертає. Хук повертає сам `ZoneEntry`, а не реф до
      нього: об'єкт створюється раз на екземпляр компонента, тож його можна
      класти в залежності ефекту реєстрації — нічого не перезапускається, а
      наявні директиви `exhaustive-deps` і далі глушать лише `onZonesChange`,
      як і кажуть їхні коментарі
- [x] Пояснення «навіщо проксі, а не сам хендл» перенести в док-коментар хука;
      у дев'яти місцях виклику лишити щонайбільше рядок із посиланням. Рядок
      у кожному місці називає лише те, що саме там демонтує чи перебудовує
      хендл
- [x] Замінити всі дев'ять оголошень. Тести на шві — у
      `useZoneNavigation.test.tsx`: `F6` доходить до хендла, встановленого
      після реєстрації; напрямок входу передається; id несеться; відсутній
      хендл відмовляється тихо, і `cycleZone` його пропускає; об'єкт той самий
      на кожному рендері

## Критерії готовності

- [x] `docs/help/` — запис видимої поведінки не змінює
- [x] У `src` не лишилось жодного `useRef<ZoneEntry>({` — усі дев'ять через хук
- [x] Пояснення механізму проксі живе рівно в одному місці — док-коментар
      `useZoneProxy`; він же каже, що проксі несе лише `focus` (зони з полем
      пошуку реєструють хендл напряму), як і раніше
- [ ] Навігація F6 між зонами перевірена вручну: та сама підстава, що в
      батьківському записі — код a11y-критичний, і помилка при заміні впаде саме
      на перемиканні зон, найпомітніше на екранах, де список демонтується
      (порожній фільтр, порожній профіль, вкладка журналу).
      Чекліст — [nvda-zone-proxy-hook.md](../testing/nvda-zone-proxy-hook.md)

## Документи

- [zone-entry-dead-el](done/p2-zone-entry-dead-el.md) — звідки взявся хвіст
- [useZoneNavigation.ts](../../src/hooks/useZoneNavigation.ts) — `ZoneEntry` і `cycleZone`
- [accessibility.md](../accessibility.md) — вимоги до зонової навігації
