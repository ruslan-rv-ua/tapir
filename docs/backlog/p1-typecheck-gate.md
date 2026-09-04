---
slug: typecheck-gate
title: "Повернути tsc у ворота: allowJs, ES2022, @types/node і 60 помилок до нуля"
priority: P1
type: planned
status: ready
effort: M
kind: chore
target: 0.1.0
updated: 2026-09-04
a11y: false
depends_on: []
blocks: [ci-pipeline]
touches:
  - tsconfig.json
  - package.json
  - justfile
  - src/components/common/helpContent.test.ts
  - src/components/settings/GeneralTab.tsx
  - src/components/player/PlayerPanel.tsx
  - docs/backlog/README.md
  - docs/backlog/_TEMPLATE.md
gates: [pnpm test, pnpm vite:build, pnpm typecheck]
notes:
  - "Аудит 2026-09-04: tsc дає 191 помилку, з них 126 одного класу TS7016, бо paraglide генерує JS з JSDoc, а tsconfig не має allowJs. Пробний конфіг з allowJs, lib ES2022 і @types/node лишає 60, з них 10 поза тестами."
  - "Раніше в пам'яті сесій фігурувало «близько 51 помилки»; число росте, бо ворота вимкнені й ніхто його не бачить."
---

# Повернути tsc у ворота: allowJs, ES2022, @types/node і 60 помилок до нуля

> **Контекст:** знахідка аудиту 2026-09-04. Перевірка типів у проєкті фактично вимкнена:
> `tsc --noEmit` червоний завжди, тож воротами служать лише `pnpm test` і
> `pnpm vite:build`. Полагодити дешево, рішення ухвалено.

## Опис

Paraglide 2 компілює повідомлення у `src/i18n/paraglide/*.js` з типами в JSDoc.
[tsconfig.json](../../tsconfig.json) не має `allowJs`, тому кожен імпорт `messages`
дає TS7016 «Could not find a declaration file», а в
[GeneralTab.tsx#L20](../../src/components/settings/GeneralTab.tsx#L20) стоїть
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
[helpContent.test.ts](../../build/helpContent.test.ts): він читає
`node:fs` і `process`, а `tsconfig` перевіряє `src` лише проти DOM-типів. За
конвенцією полиця для коду, якому потрібен Node, це `build/` (там уже живе
`docsLinks.test.ts`, і `vitest.config.ts` його підхоплює).

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює
- [ ] `tsconfig.json`: `allowJs: true`, `lib` з `ES2022`, `@types/node` у
      `devDependencies`; `include` покриває і `build/`
- [ ] `helpContent.test.ts` переїхав у `build/`, `vitest.config.ts` його бачить
- [ ] `@ts-expect-error` на імпорт paraglide runtime прибрано; п'ять `@ts-expect-error`
      на `tabIndex` у [PlayerPanel.tsx](../../src/components/player/PlayerPanel.tsx)
      або прибрано через підтримуваний react-aria спосіб, або лишено з оновленим
      поясненням, чому іншого шляху немає
- [ ] `tsc --noEmit` дає нуль помилок, включно з тестами
- [ ] `package.json` має скрипт `typecheck`, `justfile` має рецепт `check`, який
      запускає всі ворота фронтенду
- [ ] `docs/backlog/README.md` і `_TEMPLATE.md` згадують `pnpm typecheck` серед
      типових `gates`, щоб нові записи його не забували
- [ ] `pnpm test`, `pnpm vite:build`, `pnpm typecheck` без помилок

## Прийняті рішення

- `strict` лишається; жодних `any` заради зеленого прогону. Помилку, яку не вдається
  зняти чесно, фіксувати окремим `@ts-expect-error` з поясненням, як зараз для
  `tabIndex`.
- Порядок робіт: спершу конфіг і переїзд тесту (тоді видно справжній список), потім
  тести, потім десять місць у коді застосунку.

## Документи

- [tsconfig.json](../../tsconfig.json), [vitest.config.ts](../../vitest.config.ts)
- [helpContent.test.ts](../../build/helpContent.test.ts) — кандидат на переїзд у `build/`
- документація Paraglide про TypeScript-типи згенерованого коду: https://inlang.com/m/gerre34r/library-inlang-paraglideJs
