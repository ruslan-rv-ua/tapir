---
slug: eslint-narrow-setup
title: "ESLint вузько: два правила react-hooks, typescript-eslint і ворота pnpm lint"
priority: P2
type: planned
status: done
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-04
completed: 2026-09-04
a11y: false
depends_on: [eslint-adoption]
blocks: []
touches:
  - eslint.config.mjs
  - package.json
  - justfile
  - src/components/settings/AudioTab.tsx
  - src/components/songs/SongsPanel.tsx
  - src/components/streams/ImportStreamsDialog.tsx
  - src/components/profile/ProfilesPanel.tsx
  - src/hooks/usePlayerZoneNav.ts
  - src/types/song.ts
gates: [pnpm lint, pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Наслідок дослідження eslint-adoption, рішення «третій вихід». Підстави й виміри — у ньому, тут лише те, що зроблено."
  - "jsx-a11y і prettier свідомо не заводились."
---

# ESLint вузько: два правила react-hooks, typescript-eslint і ворота pnpm lint

> **Контекст:** виконано. Реалізація рішення дослідження
> [eslint-adoption](p2-eslint-adoption.md) — читати його, якщо питання «чому саме
> так», а не «що змінилось».

## Опис

ESLint 10 із пласким конфігом, рівно два класичні правила `react-hooks` і
`typescript-eslint recommended`. Ні `jsx-a11y`, ні `prettier`, ні компіляторних
правил React.

## Що зроблено

- [eslint.config.mjs](../../../eslint.config.mjs) — область та сама, що в
  `pnpm typecheck` (`src` і `build`). Обґрунтування відмови від
  `reactHooks.configs.flat.recommended` записане в самому конфізі, бо саме там його
  шукатиме той, хто захоче «полагодити» конфіг назад до пресету.
- `pnpm lint` = `eslint --max-warnings 0 src build`. Прапорець несучий: обидва
  правила, заради яких усе робилось (`exhaustive-deps` і мертва директива), мають
  рівень `warn`, і без нього ворота не падали б **ніколи**.
- `just check` став із трьох кроків чотирма; `lint` іде останнім.
- Шість місць, які лінтер знайшов одразу, полагоджені (нижче).

## Що полагоджено попутно

- **`AudioTab.tsx:31` і `:55`** — два `catch (err)`, які прив'язували помилку й
  викидали її. Додано `console.error(err)` за наявною конвенцією
  (`PlaybackPosition.tsx:59`): користувач бачить той самий локалізований текст, але
  причина відмови аудіопристрою тепер доходить до логу.
- **`ImportStreamsDialog.tsx:88`** — директива `eslint-disable-next-line`, яка нічого
  не глушила; прибрана.
- **`usePlayerZoneNav.ts:93`** — `enterZone` читав `stops.length` повз масив
  залежностей. Це порушення ніхто ніколи не придушував: воно просто лежало на HEAD,
  бо лінтера не було.
- **`song.ts:16`** — `interface SongTagsUpdatedPayload extends Song {}` став
  псевдонімом типу і **почав використовуватись** у `SongsPanel.tsx:115`, де подія
  `song-tags-updated` була набрана `Song` вручну. Два сусідні обробники подій уже
  робили так само; цей один випадав.

## Хвіст, лишений свідомо

`ProfilesPanel.tsx:261` несе єдине придушення на весь проєкт —
`@typescript-eslint/no-non-null-asserted-optional-chain` із поясненням поруч. Причина
не в цьому рядку, а в тому, що `ZoneEntry.el` — обов'язкове поле без жодного читача:
див. [zone-entry-dead-el](p2-zone-entry-dead-el.md). Придушення живе рівно до того
запису. Свідомо **не** замасковане під `as HTMLElement`, як у шести сусідніх зон, —
там та сама брехня, але невидима для лінтера.

## Критерії готовності

- [x] `docs/help/` — запис видимої поведінки не змінює
- [x] `pnpm lint` на чистому дереві дає нуль
- [x] Ворота перевірено підсадженим порушенням: `rules-of-hooks`, `exhaustive-deps` і
      мертва директива дають `exit=1` кожне
- [x] `just check` містить `pnpm lint`
- [x] Усі чотири ворота зелені

## Документи

- [eslint-adoption](p2-eslint-adoption.md) — дослідження, виміри й підстави рішення
- [zone-entry-dead-el](p2-zone-entry-dead-el.md) — хвіст із єдиним придушенням
