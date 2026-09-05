---
slug: zone-id-union
title: "Ідентифікатор зони — рядок у трьох місцях, який ніхто не звіряє"
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
  - src/components/layout/ScreenZone.tsx
  - src/components/common/composite-list/CompositeList.tsx
  - src/hooks/useCompositeList.ts
  - src/components/browser/StationList.tsx
  - src/components/browser/BrowserPanel.tsx
  - src/components/profile/ProfilesPanel.tsx
  - src/components/schedule/SchedulePanel.tsx
  - src/components/songs/SongsPanel.tsx
  - src/components/streams/StreamsPanel.tsx
  - src/components/wishlist/WishlistPanel.tsx
gates: [pnpm lint, pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Знахідка код-рев'ю zone-entry-dead-el 2026-09-04: після зняття ZoneEntry.el поле id лишилось єдиним зв'язком зони з DOM."
  - "Грумінг 2026-09-05: питання про сирі data-zone-id знято пробою tsc — атрибут, оголошений аугментацією HTMLAttributes, перевіряється; союз дістає до всіх місць."
  - "zone-proxy-hook злився в develop першим (722e200); useZoneProxy(id) перетипізовано на ZoneId у мерж-коміті цього запису — одне слово, як і передбачалось."
---

# Ідентифікатор зони — рядок у трьох місцях, який ніхто не звіряє

> **Контекст:** хвіст [zone-entry-dead-el](done/p2-zone-entry-dead-el.md).
> Огрилено 2026-09-05 — дев'ять розвилок, усі рішення в розділі нижче. Підхід:
> союз літералів `ZoneId` плюс аугментація React, яка дотягує сторож до сирих атрибутів.

## Опис

Після зняття `ZoneEntry.el` поле `id` лишилось **єдиним зв'язком зони з DOM**.
Його коментар так і каже: «Must match the element's data-zone-id attribute» —
але це обіцянка на слово, не інваріант.

Один ідентифікатор пишеться **тричі, незалежно**:

1. `ZoneEntry.id` у реєстрації зони — 24 літерали на 21 різний ідентифікатор
   (три постійні зони реєструються двічі: хендл компонента і проксі в `App`);
2. **контейнер зони** в DOM — елемент, що несе `data-zone-id`: 7 через
   `<ScreenZone id=…>`, 7 через `<CompositeList zoneId=…>` і **7 сирих** у JSX
   (`<nav>` бокової панелі, `<footer>` статусу, корінь програвача, панель фільтра
   записів, три порожні стани);
3. `exitZone("…", forward)` на межі зони — **21 виклик**, і перевіряється він не
   проти хука, а проти пропса `exitZone: (fromId: string, …)` у шести панелях.

Плюс один захардкоджений селектор у
[StationList.tsx](../../src/components/browser/StationList.tsx) —
`[data-zone-id="browser-results"]` у файлі, який той самий id уже передає пропсом.
Разом 67 рядкових літералів, жоден із яких не звіряється з іншим ні компілятором,
ні тестом.

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
союз із `tsc` у ролі сторожа коштує кілька рядків.

## Рішення (грумінг 2026-09-05)

- **Союз, не «писати один раз».** `type ZoneId = "activity-bar" | …` на 21 літерал
  закриває описаний дефект за кілька рядків; рефакторинг, у якому id тече з
  контейнера в реєстрацію й `exitZone`, переставляв би 45 місць і тягнув на M.
  Після союзу дублювання нешкідливе — його звіряє компілятор.
- **Сирі атрибути дістає аугментація.** Проба на репозиторному `tsc` (`strict`,
  `noUnusedParameters`): `declare module "react" { interface HTMLAttributes<T> {
  "data-zone-id"?: ZoneId } }` змушує перевіряти атрибут на `<div>`, `<nav>`,
  `<footer>`, `<button>`; змінна типу `string` теж відхиляється, тож пропси
  `ScreenZone.id` і `CompositeList.zoneId` стають `ZoneId` **примусово**.
  Неоголошений `data-*` лишається вільним, як і був. «Половини сторожа» немає.
- **Дім — `useZoneNavigation.ts`**, поруч із `ZoneEntry`: там id порівнює `cycleZone`,
  звідти вже імпортує `CompositeList`, туди ж лягає `useZoneProxy`. Аугментація в
  тому ж файлі з коментарем — читач `ZoneEntry.id` бачить усі три гілки сторожа на
  одному екрані, а не шукає їх у `.d.ts`.
- **`cycleZone(fromId: string | null)` лишається рядком:** F6 читає id назад із DOM
  (`dataset.zoneId`), і там чесно `string`. Типізуються `ZoneEntry.id`, `exitZone`,
  шість панельних пропсів, обидва компоненти й сирі атрибути.
- **Селектор у `StationList`** — одна константа `satisfies ZoneId` на файл, вона ж у
  `zoneId={…}` і в селекторі: два літерали стають одним, без хелпера заради одного
  клієнта.
- **Вигадані id в тестах** (`"a"`, `"dead"`, `"test-list"`) лишаються вигаданими:
  каст `as ZoneId` в одній точці на тест — у хелпері `makeZone` і в одній константі
  `CompositeList.test`. Послаблювати `ZoneEntry.id` до `string` заради тестів — це
  дірка саме в реєстрації.
- **Мертва опція `zoneId` в `useCompositeList`** знімається тут: хук оголошує її з
  коментарем «reserved… Task 4 wires this up» і ніде не читає — реєстрацію робить сам
  `CompositeList`. Той самий клас, що `ZoneEntry.el`, і та сама нитка «куди тече id».
- **Тесту існування контейнерів не буде.** Правопис звіряє компілятор; лишається клас
  «забув поставити атрибут на рукописний контейнер майбутньої зони» — але тест-обхід
  екранів брехав би на порожніх станах і на проксі, які свідомо реєструються, поки
  список демонтований. Сьогодні всі сім сирих контейнерів атрибут мають.
- **Термін.** Елемент із `data-zone-id` — **контейнер зони** (*zone container*, як у
  док-коментарі `ScreenZone`), не «носій»: «видимий носій» у `CONTEXT.md` — це стан,
  який людина читає на екрані, і глосарій прямо каже, що значення в атрибуті носієм
  не є. У глосарій термін не йде — це DOM-деталь, а не поняття домену.
- **Порядок із [zone-proxy-hook](done/p2-zone-proxy-hook.md).** Домовленість була «союз
  першим», але на момент грумінгу сусідня гілка вже мала готовий коміт, а до злиття цього
  запису встигла в `develop` (722e200). Тому `useZoneProxy(id: string, …)` перетипізовано
  на `ZoneId` у мерж-коміті — одне слово; компілятор одразу вказав на два тестові хелпери
  з вигаданим id `"list"`, які дістали той самий каст, що й `makeZone`.
- **Приймання без чекліста.** У продуктивному коді змінюються лише типи (їх стирає
  компілятор), одна константа в `StationList` і знята мертва опція — видалень, як у
  батьківського запису, немає. Тому не чекліст NVDA, а ворота + підсаджена одруківка +
  один неформальний обхід F6 на збірці по всіх секціях.

## Що зробити

- [x] `ZoneId` (21 літерал) і аугментація `HTMLAttributes` у `useZoneNavigation.ts`;
      `ZoneEntry.id: ZoneId`, `exitZone(fromId: ZoneId, …)`
- [x] `ScreenZone.id`, `CompositeList.zoneId` і шість панельних пропсів `exitZone` → `ZoneId`
- [x] `StationList`: одна константа замість двох літералів
- [x] Зняти `zoneId` з опцій `useCompositeList` разом із коментарем і рядком у тесті
- [x] Касти в `useZoneNavigation.test` (`makeZone`) і `CompositeList.test` (одна константа)

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює
- [ ] Одруківка в **кожному** з місць падає на `pnpm typecheck` — реєстрація,
      `ScreenZone`, сирий `data-zone-id`, `exitZone`, константа селектора — перевірено
      **підсадженою** одруківкою, а не міркуванням
- [ ] Діф продуктивного коду (`git diff develop -- src ':!*.test.*'`) не містить нічого,
      крім типів, константи в `StationList` і знятої опції `useCompositeList`
- [ ] Обхід F6 на збірці по всіх шести секціях: те саме коло, що й до зміни — без
      чекліста, підстава в «Рішеннях»

## Документи

- [zone-entry-dead-el](done/p2-zone-entry-dead-el.md) — звідки взявся хвіст
- [zone-proxy-hook](done/p2-zone-proxy-hook.md) — сусідній хвіст у тому самому файлі, злитий першим
- [useZoneNavigation.ts](../../src/hooks/useZoneNavigation.ts) — `ZoneEntry` і `cycleZone`
- [accessibility.md](../accessibility.md) — вимоги до зонової навігації
