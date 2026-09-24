---
slug: zone-registry
title: "Реєстр Зон через контекст замість прокинутого exitZone і стабільних проксі"
summary: "exitZone прокинуто крізь 18 компонентів, проксі латають застарілу реєстрацію, ремонт фокуса на заміні слоту в кожного екрана свій; ідея — реєстр Зон"
priority: P3
type: idea
status: draft
effort: M
kind: chore
target: 0.3.0
updated: 2026-09-24
a11y: true
depends_on: []
blocks: []
touches:
  - src/hooks/useZoneNavigation.ts
  - src/hooks/useGlobalShortcuts.ts
  - src/App.tsx
  - src/components/layout/ScreenZone.tsx
  - src/components/common/composite-list/CompositeList.tsx
  - src/components/streams/StreamsPanel.tsx
  - src/components/wishlist/WishlistPanel.tsx
gates: [pnpm test, pnpm typecheck, pnpm vite:build]
---

# Реєстр Зон через контекст замість прокинутого exitZone і стабільних проксі

> **Контекст:** знахідка [огляду архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md),
> фронтенд, залежність у процесі. Ідея — режим **ОБГОВОРЕННЯ**: інтерфейс не спроєктовано, коду
> не правити. Номери рядків — стан на `f09f36b`.

## Опис

`App.tsx` тримає цикл Зон (`F6` і `Tab` на межі Зони) у списку `orderedZonesRef`
(`src/App.tsx:66-110`). Шість панелей збирають свої Зони в ефекті й віддають нагору через
`onZonesChange`; вихід спускається вниз пропом `exitZone`. Реєстрація — масив хендлів за
значенням, тож застарілий хендл латає стабільний проксі, а ремонт фокуса на заміні слоту кожен
екран пише сам.

## Тертя

- **`exitZone` прокинуто крізь 18 файлів компонентів** (77 входжень), плюс `App.tsx` і
  `useFocusBoundary.ts:31`. Ланцюг списку Потоків: `App.tsx:415` → замикання id
  (`StreamsPanel.tsx:743`) → `StreamList.tsx:385` → `CompositeList.tsx:105` → `onTabOut`
  (`useCompositeList.ts:448`).
- **Шість ефектів реєстрації однієї форми з грубими залежностями:** `StreamsPanel.tsx:346-368`,
  `WishlistPanel.tsx:454-479`, `BrowserPanel.tsx:128-136`, `SongsPanel.tsx:103-111`,
  `SchedulePanel.tsx:85-95`, `ProfilesPanel.tsx:252-264` — перезапуск від `songs.length`,
  `hasRows`, `activeItems.length`; чотири з шести глушать `react-hooks/exhaustive-deps`.
- **`useZoneProxy` латає застарілу реєстрацію** (`useZoneNavigation.ts:78-99`): ефект із грубими
  залежностями не перереєструє новий хендл, і `App` тримає мертвий `ZoneEntry` (рескан Записів,
  e00262a). Дев'ять викликів — `App.tsx:73-75` і шість у панелях; `ProfilesPanel.tsx:257-260`
  пише той самий переадресатор руками. Проксі несе лише `focus`, тож Зони з `focusSearch`
  реєструють сирий хендл (`:97-98`) і тримаються лише на тому, що він стабільний.
- **Один id — три написання й четверте без типу.** Реєстрацію, `data-zone-id` і `exitZone(id, …)`
  зв'язує лише union `ZoneId` (`useZoneNavigation.ts:8-43`); `PERMANENT_ZONE_IDS` (`App.tsx:55`)
  — `Set<string>`, опечатку там typecheck не побачить.
- **Три зонні chore за два дні ходили тими самими панелями:** cb61ff7 (зняти `ZoneEntry.el`,
  18 файлів `src`), d7ddb30 (`useZoneProxy`, 8), 50ae2ae (union `ZoneId`, 20).
- **Ремонт фокуса на заміні слоту — свій на кожному екрані.** Сторож живості є лише в
  `StreamsPanel.tsx:381-400`. Вішліст на тій самій заміні «список ↔ порожня Зона» тримає
  прапорці-запити (`WishlistPanel.tsx:63`, `:248`) — форму, яку ADR 2026-09-05 відхилив (§4);
  Записи й Розклад кличуть `onEmpty()` після `await` (`SongsList.tsx:88`, `ScheduleTable.tsx:83`;
  докладно — [composite-list-owns-bulk-removal](p2-composite-list-owns-bulk-removal.md)).
  [Аудит 2026-09-05](done/p2-zone-vanishes-under-focus-audit.md) визнав Вішліст безпечним: набір
  патернів міняє лише користувач. Але `--wish-add` і `--wish-remove` з CLI
  (`src-tauri/src/cli.rs:315-325`, `:334-343`) міняють його поза вікном і доходять подією
  `wishlist-changed` (`App.tsx:394`) повз прапорці. Чи гине тоді фокус на `<body>` — не перевірено.
- **Ціна тестів.** `App.tsx` тестів не має; збірку циклу з панеллю (`App.tsx:82-84`) відтворює
  лише копія `ZoneHarness` (`WishlistPanel.test.tsx:27-54`, «faithful mirror of App.tsx's zone
  wiring»), ще одна заміна `orderedZonesRef` — у `useGlobalShortcuts.test.tsx:21`. Решта тестів
  панелей цикл обходить: `exitZone={vi.fn()}` — 57 разів в 11 файлах.

## Тест видалення

- **`useZoneProxy` проходить — у нинішній формі:** без нього мертвий `ZoneEntry` повернеться в
  дев'ять місць. Та ховає він наслідок реєстрації «масив за значенням з ефекту», не власну
  складність.
- **`exitZone` мілкий:** `isInModal()` плюс `cycleZone` (`useZoneNavigation.ts:176-182`).
- **`cycleZone` заробляє своє** (`useZoneNavigation.ts:127-155`) — гарантія прогресу за одне коло
  (`accessibility.md` §2.3.1). Реєстр її приймає, а не розбирає.
- **Сторож слоту в `StreamsPanel` глибокий, але прив'язаний до одного екрана:** без нього фокус
  від фонових причин падає на `<body>`, а інші екрани лагодять його по-своєму.

## Напрям

Реєстр Зон живе в `App` і роздається контекстом. Він знає, які Зони змонтовані, і володіє
порядком циклу, виходом за межу Зони (Зона чи список дістає свій вихід із контексту, не з пропа)
і сторожем живості на заміні слоту — реєстр переживає будь-яку заміну в екрані, тож доставка за
ADR 2026-09-05 §3 лягає в нього. Реєструються самі контейнери Зон (`ScreenZone`, `CompositeList`,
ручні `data-zone-id`) одним написанням id. `Ctrl+F` (`useGlobalShortcuts.ts:83,128`) і перехід
між секціями (`App.tsx:88-105`) питають реєстр. Тести — на справжньому провайдері в jsdom.
Межа з [composite-list-owns-bulk-removal](p2-composite-list-owns-bulk-removal.md): там рядки
всередині списку, тут Зони й заміна однієї Зони іншою.

## Що дає

- **Локальність.** «Фокус бере те, що стало на місце» (`accessibility.md` §3.1) і сторож живості
  мають одного власника замість трьох механізмів на чотирьох екранах.
- **Важіль.** Нова Зона — один контейнер з id, без ефекту, проксі й пропа (а постійна — ще й без
  рядка в `PERMANENT_ZONE_IDS`); [focus-on-screen-open-option](p2-focus-on-screen-open-option.md)
  дістає одне місце, де відомі Зони екрана.
- **Тести через інтерфейс:** цикл і ремонт — на реальному провайдері, без `ZoneHarness` і заглушок.
- **Клас дефектів зникає за побудовою:** застаріла реєстрація (e00262a) і фокус на `<body>` після
  заміни слоту ([streams-reset-filter-focus-drop](done/p2-streams-reset-filter-focus-drop.md),
  [zone-vanishes-under-focus-audit](done/p2-zone-vanishes-under-focus-audit.md)). Жодної вади з
  цієї партії записів він не закриває.

## Обмеження

- **Увага: реєстр замінює чинне рішення** «реєструй Зону стабільним проксі, а не `ref.current`»
  з [zone-proxy-hook](done/p2-zone-proxy-hook.md) («Рішення правильне»),
  [wishlist-stale-list-ref](done/p1-wishlist-stale-list-ref.md) і док-коментаря
  `useZoneNavigation.ts:78-99`. ADR під ним немає; чи потрібен заміні свій — вирішує обговорення.
- [ADR 2026-09-05](../decisions/2026-09-05-focus-repair-asks-liveness-not-history.md): сторож
  питає про теперішнє (§1), доставка — в тому, хто переживає заміну (§3), без нових
  прапорців-запитів (§4), наявні перевірки фокуса зелені без правок (§5). Тригер перегляду
  «слотів на екрані більше за один» не спрацював; довід тут інший — один слот на кількох
  екранах, тож наслідок «загального тесту немає» з того ADR переглядається свідомо.
- [accessibility.md](../accessibility.md) §2.3, §2.3.1: `Tab` і `F6` — один список; зміна секції —
  Оголошення назви, потім фокус у першу Зону екрана; назву Зони оголошує сама Зона, не цикл;
  `isInModal()` глушить `F6` і вихід `Tab`.
- [ADR 2026-09-06](../decisions/2026-09-06-new-result-set-forgets-the-current-stop.md): поточний
  стоп — справа Зони; реєстр вирішує, яка Зона бере фокус, а не який у ній стоп.
- Опечатка в id і далі мусить падати на `pnpm typecheck` ([zone-id-union](done/p2-zone-id-union.md)).

## Відкриті питання

- **Реєстр чи прибрати заміну слотів.** ADR 2026-09-05 відхилив «порожній стан усередині списку»
  (як у журналі збігів Вішліста) не назавжди; тоді реєстр потрібен лише для циклу й виходу.
- **Порядок циклу:** з порядку в DOM чи явний; постійні Зони — в реєстрі чи окремим рядом.
- **Власний реєстр чи `useLandmark` з react-aria** (`@react-aria/landmark` 3.0.10 уже стоїть
  транзитивно): нотатка знайшла в ньому ту саму діру, а ролі він бере лише орієнтирні — з трьох
  ролей `ScreenZone` (`application` / `search` / `group`) лише `search`, тож NVDA почула б інше.
- **Які тести можна міняти:** ADR §5 тримає перевірки фокуса, а проводку (`onZonesChange`,
  `exitZone={vi.fn()}`, `ZoneHarness`) реєстр прибирає — межу назвати до коду.
- **Вішліст і CLI:** якщо `--wish-add` / `--wish-remove` кидають фокус на `<body>` — окрема вада
  на 0.1.1 чи тут.

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює; зміну семантики Зон (ролі, порядок), якщо
      її ухвалять, несе окремий запис, що оновлює `docs/help/*/navigation.md`
- [ ] Обрано форму (реєстр, прибирання заміни слотів чи обидва) і місце шва
- [ ] Вирішено долю рішення про стабільні проксі й що міняється в ADR 2026-09-05
- [ ] Сценарії `--wish-add` і `--wish-remove` на Вішлісті перевірено; результат — тут або окремим
      записом
- [ ] Запис переведено в `planned` з критеріями або закрито з причиною

## Документи

- [Огляд архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md) — звідки запис
- [ADR 2026-09-05](../decisions/2026-09-05-focus-repair-asks-liveness-not-history.md), нотатка
  [zone-vanishes-under-focus](../notes/zone-vanishes-under-focus.md) — сторож живості, `useLandmark`
- [zone-proxy-hook](done/p2-zone-proxy-hook.md), [zone-entry-dead-el](done/p2-zone-entry-dead-el.md),
  [zone-id-union](done/p2-zone-id-union.md) — як склалася нинішня форма
- [composite-list-owns-bulk-removal](p2-composite-list-owns-bulk-removal.md) — сусідній запис, межа
  в «Напрямі»
- [accessibility.md](../accessibility.md) §2.3, §3.1; [CONTEXT.md](../../CONTEXT.md) — Зона, Стоп
