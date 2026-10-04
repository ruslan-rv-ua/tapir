---
slug: empty-search-shows-popular-stations
title: "Браузер станцій: пошук без результатів показує популярні станції"
summary: "показ результатів стоїть на відповіді екрана: нуль каже «Станцій не знайдено»; порожні критерії — не пошук; популярний список зветься популярним"
priority: P2
type: planned
status: ready
effort: S
kind: bug
target: 0.1.1
updated: 2026-10-04
a11y: true
depends_on: [debounce-window-shows-stale-result-set]
blocks: []
touches:
  - src/components/browser/BrowserPanel.tsx
  - src/components/browser/BrowserPanel.test.tsx
  - src/components/browser/StationList.tsx
  - src/components/browser/SearchForm.tsx
  - src/stores/browser.ts
  - src/stores/browser.test.ts
  - docs/accessibility.md
  - docs/decisions/2026-09-15-replace-flag-belongs-to-the-screen.md
gates: [pnpm vite:build, pnpm test, pnpm typecheck]
notes:
  - "Знахідка фонового обходу під час грилінгу stale-search-overwrites-results (2026-09-15), підтверджена емпірично двома незалежними перевірками"
  - "2026-10-04: перенесено в 0.1.1 рішенням власника; код на HEAD a04e358 той самий, що в v0.1.0"
  - "2026-10-04: виґрумінговано разом з debounce-window-shows-stale-result-set; рішення — ADR 2026-10-04 «Екран показує відповідь, а не поле». Носій $resultsFor народжується там, тому depends_on"
  - "Пункт 5 запису browser-zone-race-sweep-triage (Escape шукає без критеріїв) лікується тут"
  - "Озвучення кількості результатів свідомо не взято (патч без нових поверхонь) — окрема ідея browser-search-announces-result-count, 0.3.0"
---

# Браузер станцій: пошук без результатів показує популярні станції

> **Контекст:** знахідка фонового обходу під час грилінгу
> [stale-search-overwrites-results](done/p2-stale-search-overwrites-results.md) (2026-09-15).
> **Виґрумінговано 2026-10-04** разом із
> [debounce-window-shows-stale-result-set](done/p2-debounce-window-shows-stale-result-set.md); рішення —
> [ADR 2026-10-04 «Екран показує відповідь, а не поле»](../decisions/2026-10-04-screen-shows-the-answer-not-the-field.md).
> Читати першим ADR; тут — лише те, що несе саме цей запис.

## Опис

Людина набирає запит, якому в каталозі нічого не відповідає. У відповідь екран показує
**«Популярні станції»** — заголовок і півсотні станцій, які до запиту не мають стосунку.
Рядок «Станцій не знайдено. Спробуйте інший запит.» не показується ніколи.

Механізм — один вираз у [BrowserPanel.tsx](../../src/components/browser/BrowserPanel.tsx):

```ts
const showSearchResults = isSearchActive && (searchResults.length > 0 || searchLoading || !!searchError);
```

Успішний пошук із нульовим результатом не дає жодного з трьох доданків, прапорець падає в
`false`, і далі `stations = popularStations`, `mode = "popular"`. `m.browser_no_results()`
недосяжний за побудовою: «ще не шукали» й «пошукали, нема нічого» в сторі не розрізняються.

### Чому це a11y

Список зберігає власну назву `m.zone_browser_results()` — «Результати пошуку» — **в обох
режимах** (`StationList.tsx`). Скрінрідер оголошує півсотні сторонніх станцій як результати
пошуку, і жодна поверхня не каже, що знайдено нуль. Зрячий бачить хоча б заголовок «Популярні
станції»; той, хто заходить у зону через F6, чує лише її назву й перший рядок.

## Рішення (грумінг 2026-10-04)

Розвилка запису («що означає „пошук активний"») закрита першим варіантом — четвертим
доданком, носій якого (`$resultsFor`) народжується в сусідньому записі. Цей запис несе:

- **ADR §3 — що показує екран:**
  `showSearchResults = isSearchActive && ($resultsFor !== null || searchLoading || !!searchError)`.
  Нульова відповідь — «Станцій не знайдено»; немає відповіді за активних критеріїв —
  популярні (попередній екран).
- **ADR §4 — порожні критерії не пошук.** Зміна, після якої критеріїв не лишилось (Escape,
  стерте поле, бітрейт 0, «усі країни» на останньому фільтрі), скидає відповідь і не йде в
  каталог; той, хто спорожнив критерії, гасить прапорець заміни сам. Правило живе в сторі, не
  у формі. Без нього визначення вище брехало б: рядки пошуку без критеріїв спливали б у вікні
  дебаунсу як «попередня відповідь».
- **Назва списку за режимом:** популярні → `m.browser_popular_title()` (той самий текст, що
  видимий `<h2>`, — носій за ADR 2026-08-31 є, нових рядків перекладу немає); пошук →
  `m.zone_browser_results()`, як було. Порожній стан уже чесний: регіон бере `aria-label` із
  самого повідомлення.
- **Без озвучення нуля.** Приїзд відповіді не озвучується, як і досі (`accessibility.md` §5.1);
  факт живе в списку. Озвучення кількості результатів за прецедентом командної палітри —
  окрема ідея [browser-search-announces-result-count](p2-browser-search-announces-result-count.md)
  (0.3.0).

Розвилки 2 («порожньо» як окремий стан вибірки) і 3 (визнати поведінку навмисною) відкинуто:
друга — та сама модель, але без носія, якого вимагає вже прийнятий ADR; третя лишала б
рядок перекладу мертвим, а назву зони — брехливою.

### Пункт запису-розвідки, що лікується тут

**5** з [browser-zone-race-sweep-triage](p2-browser-zone-race-sweep-triage.md) — `Escape` у полі
пошуку стріляє пошук без критеріїв: лікує ADR §4, разом із двійниками (стерте поле, бітрейт 0,
«усі країни»).

### Довідка й `accessibility.md`

- Довідка: третє речення погодженої правки абзацу «Пошук» («Якщо за запитом нічого немає, список
  так і каже: „Станцій не знайдено"») — текст у
  [debounce-window-shows-stale-result-set](done/p2-debounce-window-shows-stale-result-set.md)
  §«Довідка й `accessibility.md`»; правка одна, бо PR один.
- `docs/accessibility.md` §5.1, дерево: `StationList aria-label` — «Популярні станції» /
  «Результати пошуку» за режимом; «(поки пошук не виконано)» біля `<h2>` → «(поки немає
  відповіді на пошук)».
- ADR 2026-09-15 §4 уже має «Уточнення (2026-10-04)»; разом із кодом переписати докстрінги
  `$searchLoading` і `resetSearch` у `browser.ts`, які кажуть «єдиний писар без запиту».

## Критерії готовності

- [ ] Пошук, що нічого не знайшов, показує «Станцій не знайдено. Спробуйте інший запит.» —
      видимий носій (ADR 2026-08-31), і він же назва регіону на вході через F6
- [ ] `m.browser_no_results()` досяжний — тест панелі на нульову відповідь
- [ ] «Ще не шукали» відрізняється від «знайдено нуль»: до першої відповіді за активних
      критеріїв — популярні, а не «нічого не знайдено» — тест
- [ ] Порожні критерії не йдуть у каталог (IPC не викликається) і скидають відповідь; прапорець
      гасне навіть тоді, коли заміна ще летить, і її пізня відповідь його не чіпає — тест у дусі
      «resetSearch says «nothing is coming»»
- [ ] Назва списку не бреше: популярні — «Популярні станції», пошук — «Результати пошуку» — тест
      на `aria-label` в обох режимах
- [ ] `docs/help/` — третє речення погодженої правки (див. вище)
- [ ] `docs/accessibility.md` §5.1 — дерево
- [ ] Докстрінги `$searchLoading` і `resetSearch` узгоджено з ADR 2026-10-04 §4
- [ ] NVDA-чекліст [nvda-empty-search-shows-popular-stations.json](../testing/nvda-empty-search-shows-popular-stations.json) через `/axygen-checklist:write`, сценарії:
      (1) щойно відкритий розділ, F6 у список — «Популярні станції» і перша станція;
      (2) набрати безглуздий запит, дочекатися, F6 — «Станцій не знайдено. Спробуйте інший запит.»,
      а не популярні;
      (3) набрати справжній запит, дочекатися, F6 — «Результати пошуку» і перший результат;
      (4) `Escape` у полі без інших фільтрів — популярні; F6 — «Популярні станції»;
      (5) задати країну й набрати запит, `Escape` — текст зник, список далі відфільтрований
      країною; F6 — «Результати пошуку»;
      (6) «Скинути фільтри» — популярні; F6 — «Популярні станції»
- [ ] `pnpm vite:build`, `pnpm test`, `pnpm typecheck`

## Документи

- [ADR 2026-10-04 — екран показує відповідь, а не поле](../decisions/2026-10-04-screen-shows-the-answer-not-the-field.md)
- [ADR 2026-08-31 — видимий носій для озвучених фактів](../decisions/2026-08-31-visible-carrier-for-announced-facts.md)
- [ADR 2026-09-15 — прапорець заміни належить екрану, а не запиту](../decisions/2026-09-15-replace-flag-belongs-to-the-screen.md) — §4
- [stale-search-overwrites-results](done/p2-stale-search-overwrites-results.md) — звідки
  знахідка; §«Спадок»
- [CONTEXT.md](../../CONTEXT.md) §«Пошук станцій» — **Відповідь екрана**
- Код: `src/components/browser/BrowserPanel.tsx` (`showSearchResults`, `emptyMessage`),
  `src/components/browser/StationList.tsx` (`ariaLabel`),
  `src/components/common/composite-list/CompositeList.tsx` (порядок гілок),
  `src/stores/browser.ts` (`updateSearchParam`, `searchStations`, `resetSearch`)
