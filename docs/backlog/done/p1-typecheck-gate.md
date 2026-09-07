---
slug: typecheck-gate
title: "Повернути tsc у ворота: allowJs, ES2022, @types/node і 60 помилок до нуля"
summary: "`tsc --noEmit` — ворота: 191 → 0; `filterDOMProps` глушить `title`, `onKeyDown`, `tabIndex` на RAC — мертвий код; натомість `excludeFromTabOrder`."
priority: P1
type: planned
status: done
effort: M
kind: chore
target: 0.1.0
updated: 2026-09-04
completed: 2026-09-04
a11y: false
depends_on: []
blocks: [ci-pipeline, wishlist-tabs-tab-bridge, player-transport-tab-order]
touches:
  - tsconfig.json
  - package.json
  - justfile
  - build/helpContent.test.ts
  - src/components/player/PlayerPanel.tsx
  - src/components/settings/GeneralTab.tsx
  - src/components/settings/SettingsDialog.tsx
  - src/components/common/HelpDialog.tsx
  - src/components/profile/ProfileSettingsDialog.tsx
  - src/components/profile/ProfileContextMenu.tsx
  - src/components/streams/StreamContextMenu.tsx
  - src/components/streams/StreamList.tsx
  - src/components/streams/AddStreamDialog.tsx
  - src/components/wishlist/WishlistPanel.tsx
  - AGENTS.md
  - docs/accessibility.md
  - docs/backlog/README.md
  - docs/backlog/_TEMPLATE.md
  - docs/backlog/ROADMAP.md
gates: [pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Аудит 2026-09-04: tsc дає 191 помилку, з них 126 одного класу TS7016, бо paraglide генерує JS з JSDoc, а tsconfig не має allowJs. Пробний конфіг з allowJs, lib ES2022 і @types/node лишає 60, з них 10 поза тестами."
  - "Раніше в пам'яті сесій фігурувало «близько 51 помилки»; число росте, бо ворота вимкнені й ніхто його не бачить."
  - "Підсумок: після конфігу лишилось 44, не 60 — переїзд helpContent.test.ts і target ES2022 зняли більше, ніж передбачав пробний прогін. Нуль досягнуто."
  - "Три з десяти «косметичних» помилок виявились мертвим кодом, який react-aria ніколи не доносив до DOM (`title`, `onKeyDown` на TabList, `tabIndex` на Button). Кнопки плеєра через це стояли з tabindex=0 всупереч власній моделі зони — виправлено на `excludeFromTabOrder`; це єдина зміна поведінки в записі. Дзеркальний випадок — `autoFocus` на `<Tab>`, який RAC навпаки доносить (через `useFocusable`), лишився під `@ts-expect-error` на трьох місцях: директива почервоніє, коли RAC додасть тип, а каст мовчав би."
---

# Повернути tsc у ворота: allowJs, ES2022, @types/node і 60 помилок до нуля

> **Контекст:** знахідка аудиту 2026-09-04. Перевірка типів у проєкті фактично вимкнена:
> `tsc --noEmit` червоний завжди, тож воротами служать лише `pnpm test` і
> `pnpm vite:build`. Полагодити дешево, рішення ухвалено.

## Опис

Paraglide 2 компілює повідомлення у `src/i18n/paraglide/*.js` з типами в JSDoc.
[tsconfig.json](../../../tsconfig.json) не має `allowJs`, тому кожен імпорт `messages`
дає TS7016 «Could not find a declaration file», а в
[GeneralTab.tsx#L20](../../../src/components/settings/GeneralTab.tsx#L20) стоїть
`@ts-expect-error` на імпорт runtime. Через це:

| Конфіг | Помилок `tsc --noEmit` |
|---|---|
| поточний | 191 |
| `allowJs: true`, `lib: ES2022`, типи node | 60 |
| з них у не-тестовому коді | 10 |

Ті 60 ніхто не бачить, бо їх ховає стіна з 126 однакових. Десять у коді застосунку
це косметика типів react-aria: `autoFocus` на `Tab`, `title` і `excludeFromTabOrder`
на `Button` та `MenuItem`, предикат `c is string` над брендованим `LocalizedString`,
звуження `transfer.target` у `StreamList`. Решта в тестах: фікстури `GlobalSettings`
без `volumeStepPercent` і `smtcEnabled`, пропс `onOpenInPlayer`, `.at()` на масивах
під `lib: ES2020`, `Element` замість `HTMLElement`, невикористані імпорти.

Окрема група з 13 помилок припадає на
[helpContent.test.ts](../../../build/helpContent.test.ts): він читає
`node:fs` і `process`, а `tsconfig` перевіряє `src` лише проти DOM-типів. За
конвенцією полиця для коду, якому потрібен Node, це `build/` (там уже живе
`docsLinks.test.ts`, і `vitest.config.ts` його підхоплює).

## Критерії готовності

- [x] `docs/help/` — запис видимої поведінки не змінює
- [x] `tsconfig.json`: `allowJs: true`, `lib` з `ES2022`, `@types/node` у
      `devDependencies`; `include` покриває і `build/`
- [x] `helpContent.test.ts` переїхав у `build/`, `vitest.config.ts` його бачить
- [x] `@ts-expect-error` на імпорт paraglide runtime прибрано; п'ять `@ts-expect-error`
      на `tabIndex` у [PlayerPanel.tsx](../../../src/components/player/PlayerPanel.tsx)
      або прибрано через підтримуваний react-aria спосіб, або лишено з оновленим
      поясненням, чому іншого шляху немає
- [x] `tsc --noEmit` дає нуль помилок, включно з тестами
- [x] `package.json` має скрипт `typecheck`, `justfile` має рецепт `check`, який
      запускає всі ворота фронтенду
- [x] `docs/backlog/README.md` і `_TEMPLATE.md` згадують `pnpm typecheck` серед
      типових `gates`, щоб нові записи його не забували
- [x] `pnpm test`, `pnpm vite:build`, `pnpm typecheck` без помилок

## Прийняті рішення

- `strict` лишається; жодних `any` заради зеленого прогону. Помилку, яку не вдається
  зняти чесно, фіксувати окремим `@ts-expect-error` з поясненням, як зараз для
  `tabIndex`.
- Порядок робіт: спершу конфіг і переїзд тесту (тоді видно справжній список), потім
  тести, потім десять місць у коді застосунку.

## Спадок

`tsc --noEmit` знову ворота: **нуль помилок** проти 191 на старті, `pnpm typecheck` у скриптах,
`just check` проганяє всі три (`test`, `typecheck`, `vite:build`), а `_TEMPLATE.md` і README
беклогу називають нові ворота серед типових `gates:`. Стіну з 126 однакових TS7016 зняв
`allowJs` (paraglide компілює повідомлення в JS із типами в JSDoc; `checkJs` лишається вимкненим
— той код не наш), `lib: ES2022` повернув `.at()`, `@types/node` — `fs`/`process`.
`helpContent.test.ts` переїхав у `build/`, на полицю для перевірок, яким потрібен Node; чотири
посилання на старий шлях знайшов `docsLinks.test.ts`, а не людина. Лишилось 44 помилки, не 60 —
і ось головне в спадок: **три з десяти «косметичних» місць у коді застосунку виявились мертвим
кодом**. `filterDOMProps` у react-aria доносить до DOM лише `id`, `aria-*`, `data-*`, п'ять
глобальних атрибутів і мишачі/вказівникові події — тож `title` на `<Button>`/`<MenuItem>` ніколи
не малював рідну підказку, `onKeyDown` на `<TabList>` ніколи не викликався (звідси
[wishlist-tabs-tab-bridge](p2-wishlist-tabs-tab-bridge.md)), а `tabIndex={-1}` на п'яти кнопках
плеєра ігнорувався — увесь транспорт стояв із `tabindex=0` всупереч власній моделі зони
(«стрілки між стопами, `Tab` виходить»). Підтримуваний спосіб сказати те саме —
`excludeFromTabOrder`, і це **єдина зміна поведінки** запису, накрита новим тестом. Дзеркальний
випадок: `autoFocus` на `<Tab>` навпаки **працює** (`useTab` віддає props у `useFocusable`),
просто `TabProps` не успадковує `FocusableProps` — лишився під `@ts-expect-error` на трьох
діалогах, бо директива почервоніє, коли RAC додасть тип, а каст мовчав би. У тестах гейт відкрив
дрейф, який ніхто не бачив: п'ять фікстур `GlobalSettings` без
`volumeStepPercent`/`smtcEnabled`, `StreamItem` без `onOpenInPlayer`, а `windowTitle.test.ts`
тримав `state: "playing"` — стану, якого в `StreamState` немає взагалі.

## Документи

- [tsconfig.json](../../../tsconfig.json), [vitest.config.ts](../../../vitest.config.ts)
- [helpContent.test.ts](../../../build/helpContent.test.ts) — переїхав у `build/`, разом із чотирма посиланнями на нього в беклозі
- документація Paraglide про TypeScript-типи згенерованого коду: https://inlang.com/m/gerre34r/library-inlang-paraglideJs
