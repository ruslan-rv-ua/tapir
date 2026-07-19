---
slug: streams-ctrlk-empty-hint
title: "Бейдж-підказка `Ctrl+K` у порожньому стані Streams"
priority: P2
type: planned
status: done
effort: S
kind: feature
target: 0.2.0
updated: 2026-06-23
completed: 2026-07-19
a11y: true
depends_on: []
blocks: [wishlist-example-patterns]
touches: [src/components/streams/StreamsPanel.tsx, src/components/common/ShortcutsHelp.tsx]
gates: [pnpm test, pnpm vite:build]
notes: ["виконано 2026-07-19, гілка feature/streams-ctrlk-empty-hint"]
---

# Бейдж-підказка `Ctrl+K` у порожньому стані Streams

> **Контекст:** виконано. Завершує ADR 2026-05-31 §6 (S3) — компенсуюча половина рішення, S2 (прибрати кнопку «Команди») було зроблено раніше. Патерн застосовано пізніше для [wishlist-example-patterns](p2-wishlist-example-patterns.md).

## Опис

ADR [2026-05-31 «Командна палітра і пошук/фільтр»](../../decisions/2026-05-31-command-palette-and-search-ux.md)
у §6 ухвалив для екрана Streams **дві зчеплені зміни**:

- **S2** — прибрати видиму кнопку «Команди» з тулбара й порожнього стану. ✅ Зроблено
  (`toolbarRefs` у [StreamsPanel.tsx:240](../../../src/components/streams/StreamsPanel.tsx#L240)
  уже без `cmdBtn`; згадок палітри в панелях немає).
- **S3 + конкретна зміна #3** — натомість додати **приглушений `kbd`-бейдж «Ctrl+K»**
  поруч із CTA в порожньому стані; **не Tab-стоп**; природно в порядку читання
  (доступний і для NVDA). ❌ **Не зроблено (на момент постановки запису).**

Тобто впровадили половину рішення (прибрали кнопку), а компенсуючу половину
(відкривність через бейдж) — ні. Порожній стан
[StreamsPanel.tsx:669-687](../../../src/components/streams/StreamsPanel.tsx#L669-L687)
містив лише підказку (`streams_empty_hint`) + кнопку «Додати приклади» — бейджа `Ctrl+K`
не було.

**Чому це важливо.** Уся a11y-аргументація S4 трималася на тому, що
**«відкривність несе порожній стан»** — саме тому свідомо відмовились від
`aria-keyshortcuts` на нефокусованому регіоні та від перемикача в Settings. Без бейджа
`Ctrl+K` на Streams **взагалі не виявний** ніде, крім F1-довідки → рішення ADR лишалось
напіввиконаним і його початкова мета (навчити користувача палітрі там, де він уперше
бачить екран порожнім) не була досягнута.

## Технічна реалізація

- У гілці `isEmpty` порожнього стану
  ([StreamsPanel.tsx:669-687](../../../src/components/streams/StreamsPanel.tsx#L669-L687))
  додати після CTA приглушений `<kbd>`-бейдж із текстом на кшталт «Команди — Ctrl+K».
- **Не фокусований:** без `tabIndex`, не кнопка — звичайний інлайн-вузол у порядку
  читання, щоб NVDA озвучив його природно, без зайвого Tab-стопа.
- Стилізувати приглушено (як `kbd` у [ShortcutsHelp.tsx:30](../../../src/components/common/ShortcutsHelp.tsx#L30)),
  з підтримкою `forced-colors` як у сусідніх елементах.
- i18n: новий ключ (напр. `streams_empty_palette_hint`) у
  [uk.json](../../../src/i18n/messages/uk.json) + [en.json](../../../src/i18n/messages/en.json);
  регенерувати через vite-плагін paraglide (не правити згенероване вручну).
- `Ctrl+K` (рушій) — **не чіпати**, працює глобально ([App.tsx](../../../src/App.tsx)).

## Критерії готовності

- [x] У порожньому стані Streams рендериться приглушений бейдж «Ctrl+K» поряд із CTA
- [x] Бейдж **не** Tab-стоп (не фокусується, не кнопка) і читається NVDA у порядку читання
- [x] `Ctrl+K` із порожнього стану відкриває командну палітру (регресія не зламана)
- [x] Новий i18n-ключ доданий у `uk.json` і `en.json`; згенеровано через плагін
- [x] `StreamsPanel.test.tsx`: бейдж рендериться та не потрапляє у roving-focus тулбара
- [x] `pnpm test` + `pnpm vite:build` зелені

## Відкриті питання — вирішено

- **Текст бейджа:** «Команди — Ctrl+K» (підпис + комбінація). Лише «Ctrl+K» відкинуто:
  поза контекстом NVDA прочитав би комбінацію, не пояснивши, що вона відкриває.
  Підпис — i18n-ключ `streams_empty_palette_hint`; сама комбінація не локалізується
  й читається з `SHORTCUTS` ([shortcuts.ts](../../../src/lib/shortcuts.ts), `id: "command-palette"`),
  щоб бейдж не розійшовся з F1-довідкою.
- **filter-empty:** бейджа там **немає** — ADR §7 відкинув «завжди видимий бейдж»
  на користь «лише порожній стан»; у filter-empty вже є власний CTA «Скинути фільтр».
  Покрито негативним тестом.
- ADR §9.2: якщо порожнього стану як єдиного місця навчання виявиться замало —
  повернутись до розгляду `aria-keyshortcuts` (S4). Це окремий тригер, не частина цього запису.

## Документи

- [decisions/2026-05-31-command-palette-and-search-ux.md](../../decisions/2026-05-31-command-palette-and-search-ux.md) —
  §6 (S2, S3, S4, конкретна зміна #3), DA5
- Код: [src/components/streams/StreamsPanel.tsx](../../../src/components/streams/StreamsPanel.tsx) (порожній стан),
  [src/components/common/ShortcutsHelp.tsx](../../../src/components/common/ShortcutsHelp.tsx) (зразок стилю `kbd`)
- i18n: [src/i18n/messages/uk.json](../../../src/i18n/messages/uk.json), [src/i18n/messages/en.json](../../../src/i18n/messages/en.json)
