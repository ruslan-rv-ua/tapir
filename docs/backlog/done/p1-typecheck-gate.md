---
slug: typecheck-gate
title: "Повернути tsc у ворота: allowJs, ES2022, @types/node і 60 помилок до нуля"
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
blocks: [ci-pipeline, wishlist-tabs-tab-bridge]
touches:
  - tsconfig.json
  - package.json
  - justfile
  - build/helpContent.test.ts
  - src/components/settings/GeneralTab.tsx
  - src/components/player/PlayerPanel.tsx
  - docs/backlog/README.md
  - docs/backlog/_TEMPLATE.md
gates: [pnpm test, pnpm vite:build, pnpm typecheck]
notes:
  - "Аудит 2026-09-04: tsc дає 191 помилку, з них 126 одного класу TS7016, бо paraglide генерує JS з JSDoc, а tsconfig не має allowJs. Пробний конфіг з allowJs, lib ES2022 і @types/node лишає 60, з них 10 поза тестами."
  - "Раніше в пам'яті сесій фігурувало «близько 51 помилки»; число росте, бо ворота вимкнені й ніхто його не бачить."
  - "Підсумок: після конфігу лишилось 44, не 60 — переїзд helpContent.test.ts і target ES2022 зняли більше, ніж передбачав пробний прогін. Нуль досягнуто."
  - "Три з десяти «косметичних» помилок виявились мертвим кодом, який react-aria ніколи не доносив до DOM (`title`, `onKeyDown` на TabList, `tabIndex` на Button). Кнопки плеєра через це стояли з tabindex=0 всупереч власній моделі зони — виправлено на `excludeFromTabOrder`; це єдина зміна поведінки в записі."
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

## Документи

- [tsconfig.json](../../../tsconfig.json), [vitest.config.ts](../../../vitest.config.ts)
- [helpContent.test.ts](../../../build/helpContent.test.ts) — переїхав у `build/`, разом із чотирма посиланнями на нього в беклозі
- документація Paraglide про TypeScript-типи згенерованого коду: https://inlang.com/m/gerre34r/library-inlang-paraglideJs
