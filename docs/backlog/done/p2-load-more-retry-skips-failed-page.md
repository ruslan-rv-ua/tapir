---
slug: load-more-retry-skips-failed-page
title: "Браузер станцій: повторне «Завантажити ще» після збою пропускає порцію"
priority: P2
type: planned
status: done
effort: S
kind: bug
target: 0.1.0
updated: 2026-09-04
a11y: false
depends_on: [load-more-unreachable-by-keyboard]
blocks: [stale-search-overwrites-results]
touches:
  - src/stores/browser.ts
  - src/stores/browser.test.ts
  - src/components/browser/BrowserPanel.tsx
  - src/components/browser/BrowserPanel.test.tsx
  - src/components/browser/SearchForm.tsx
gates: [pnpm test, pnpm vite:build]
notes:
  - "Знахідка рев'ю load-more-unreachable-by-keyboard (2026-09-04). Вада передіснуюча — кнопка й до того клікалась мишкою; той запис лише зробив повтор доступним усім і прямо пообіцяв, що помилка лишає стан недоторканим"
  - "Огрилено 2026-09-04 (10 розвилок): обрано варіант 3 — offset не зберігається взагалі. Рішення винесене в ADR loaded-prefix-is-the-cursor, словник поповнено секцією «Пошук станцій» у CONTEXT.md"
  - "Гонку «змінив запит під час дописування» цей запис ЗАКРИВАЄ; гонку двох замін — ні, вона винесена в stale-search-overwrites-results"
  - "Реалізовано 2026-09-04. Рев'ю знайшло, що «тихо виходить» із п. 5 не могло бути `return`: для завершального стопу резолв означає успішне порожнє дописування — хибне «Більше результатів немає» плюс фокус, вирваний із поля пошуку. Чужа порція **відхиляє** проміс (без тоста), і порція, що впала після зміни критеріїв, теж не тостить. Сторож — тест у BrowserPanel.test.tsx"
  - "target 0.1.0 за темою версії («мовчазні відмови дістають видиму поверхню»), а не за терміновістю — переставити в 0.2.0 одним рядком, якщо віха закривається раніше"
---

# Браузер станцій: повторне «Завантажити ще» після збою пропускає порцію

> **Контекст:** знахідка рев'ю
> [load-more-unreachable-by-keyboard](p1-load-more-unreachable-by-keyboard.md)
> (2026-09-04). Огрилено 2026-09-04 — спосіб виправлення **обрано**, обґрунтування в
> [ADR «Прочитаний початок і є курсор пагінації»](../../decisions/2026-09-04-loaded-prefix-is-the-cursor.md).
> Читати першим ADR, потім «Що робимо» нижче.

## Опис

`loadMore` у [browser.ts](../../../src/stores/browser.ts) піднімає `offset` у
`$searchParams` **до** запиту й не повертає його, коли запит падає. Наступне
натискання рахує `offset` від уже піднятого значення — тобто просить сторінку
**після** тієї, що не приїхала.

Сценарій цілком:

1. На екрані 50 результатів, `offset` = 0.
2. Людина натискає «Завантажити ще». Мережа моргнула — приходить тост, курсор
   лишається на кнопці (так і задумано).
3. Людина натискає ще раз. `offset` іде 50 → 100.
4. Станцій 51–100 у списку не буде **ніколи**, і жодна поверхня про це не каже:
   список виглядає цілим, дірка всередині нього мовчазна.

Обійти можна лише повторивши пошук з нуля — і треба спершу здогадатись, що є що
обходити.

## Що робимо

Обрано варіант 3 із трьох, що були в розвилці: **позиція пагінації не зберігається**.
Повне обґрунтування й відхилені варіанти — в
[ADR](../../decisions/2026-09-04-loaded-prefix-is-the-cursor.md); тут — те, що треба
зробити руками.

1. **Тип несе правило.** У `browser.ts` з'являється
   `type SearchCriteria = Omit<SearchParams, "offset">`; ним типується `$searchParams`.
   `SearchParams` у [tauri.ts](../../../src/lib/tauri.ts) **не чіпається** — це дзеркало
   дроту, і на дроті `offset` є. `updateSearchParam` більше не має що ставити в
   `offset: 0`; `SearchForm` перемикає імпорт типу на `SearchCriteria`.
2. **Одна спільна функція запиту.** Приватний `fetchBatch(criteria, offset)` робить виклик
   із трюком «+1» і повертає `{ results, hasMore }`. Трюк лишається рівно там, де був.
3. **Дві публічні функції замість однієї з прапорцем.** `searchStations(criteria)` —
   тільки заміна (`$searchLoading`, `$searchError`, offset завжди 0, **ніколи не кидає**);
   `loadMore()` — тільки дописування (`$appendLoading`, тост + `throw`). Сигнатура
   `searchStations` не змінюється, чотири виклики в `SearchForm` лишаються як є.
4. **`loadMore` рахує offset з екрана:** `$searchResults.get().length`, і в `$searchParams`
   **не пише нічого**.
5. **Квиток порції.** `loadMore` запам'ятовує об'єкт критеріїв і на приземленні звіряє
   `$searchParams.get() !== criteria` → виходить мовчки, без тоста. Це закриває гонку
   «змінив запит, поки їхала порція» для дописування.
   *Реалізовано як `throw new ForeignBatch()`, а не `return`* — резолв завершальний стоп
   читає як успішне порожнє дописування (хибне «Більше результатів немає» + фокус із поля
   пошуку в чужий список). Знахідка рев'ю; підстава — ADR §«Обмеження / наслідки».
6. **`isAppendingResults` видаляється.** Слухач `$searchParams` у
   [BrowserPanel](../../../src/components/browser/BrowserPanel.tsx) скидає курсор
   **безумовно**; імпорт предиката зникає.
7. **Коментарі в `browser.ts` перестають казати _selection_ про результати пошуку** —
   за словником *selection* значить виділення рядків (`$stationSelection`), а результати
   це **вибірка**. Див. [CONTEXT.md](../../../CONTEXT.md) §«Пошук станцій».

Чому це не ламає правило курсора: писарів `$searchParams` рівно троє — `loadMore`,
`updateSearchParam` (завжди `offset: 0`) і `resetSearch` (без offset). Тобто **сьогодні**
слухач скидає курсор на кожній зміні, крім тієї, яку робить `loadMore`; після зміни
`loadMore` не пише взагалі. Множина подій, що скидають курсор, лишається та сама з
точністю до події — не за перевіркою, а за конструкцією.

## Критерії готовності

- [x] `$searchParams` типується `SearchCriteria = Omit<SearchParams, "offset">`;
      `isAppendingResults` видалено разом із його читачем у `BrowserPanel`;
      `SearchParams` у `tauri.ts` без змін
- [x] **`loadMore` не пише в критерії** — тест у `stores/browser.test.ts`:
      `expect($searchParams.get()).toBe(before)`, порівняння **посиланням** (воно ж
      сторожить квиток із п. 5)
- [x] Після невдалого дописування повторне натискання просить **ту саму** сторінку —
      тест на два послідовні `loadMore`, де перший падає: обидва виклики IPC йдуть
      з тим самим `offset`
- [x] Порція, що приземлилась після зміни критеріїв, **не** дописується: `$searchResults`
      і `$hasMore` недоторкані, тоста немає
- [x] Правило курсора не зламане: наявний тест «`Load more` keeps the remembered row»
      ([BrowserPanel.test.tsx](../../../src/components/browser/BrowserPanel.test.tsx))
      лишається **дослівно** і проходить — після зміни його тримає те, що слухач узагалі
      не прокидається, а не предикат
- [x] Наявні тести `browser.test.ts` проходять без правок (їхня арифметика offset стає
      чеснішою сама: `loadMore` починає питати offset, що збігається з екраном)
- [x] Коментарі в `browser.ts` не вживають *selection* про результати пошуку
- [x] NVDA-прогін **не потрібен**, і це доказово: множина подій, що скидають курсор,
      не змінюється (див. «Що робимо»), нічого не оголошується, фокус не рухається
- [x] `docs/help/` — поведінка, описана в довідці, не змінюється; термінологічну правку
      («добірка»/«batch» про Популярні станції) вже зроблено в цій же гілці
- [x] `pnpm test`, `pnpm vite:build`

## Документи

- [ADR 2026-09-04 — прочитаний початок і є курсор пагінації](../../decisions/2026-09-04-loaded-prefix-is-the-cursor.md) —
  рішення цього запису, разом із відхиленими варіантами
- [CONTEXT.md](../../../CONTEXT.md) §«Пошук станцій» — терміни **Вибірка** і **Порція**
- [load-more-unreachable-by-keyboard](p1-load-more-unreachable-by-keyboard.md) —
  запис, рев'ю якого знайшло ваду, і той, що заморозив арифметику `loadMore`
- [browser-filter-cursor-reset](p2-browser-filter-cursor-reset.md) — правило
  курсора, що читало `offset` через `isAppendingResults`
- [stale-search-overwrites-results](../p2-stale-search-overwrites-results.md) — друга
  половина класу: гонка двох **замін**, свідомо не закрита тут
- [ADR 2026-09-03 — завершальний стоп](../../decisions/2026-09-03-trailing-stop-crosses-only-on-down.md)
- Код: `src/stores/browser.ts` (`loadMore`, `searchStations`), `src/components/browser/BrowserPanel.tsx`
  (слухач `$searchParams`), `src/components/browser/SearchForm.tsx` (імпорт типу)
