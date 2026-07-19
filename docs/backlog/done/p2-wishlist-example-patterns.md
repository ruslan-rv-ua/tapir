---
slug: wishlist-example-patterns
title: "Приклади-патерни у порожньому стані Wishlist / Ignorelist"
priority: P2
type: planned
status: done
effort: S
kind: feature
target: 0.2.0
updated: 2026-07-19
completed: 2026-07-19
a11y: true
depends_on: [streams-ctrlk-empty-hint]
blocks: [streams-empty-focus-audit, wishlist-stale-list-ref]
touches: [src/components/wishlist/examplePatterns.ts, src/components/wishlist/WishlistPanel.tsx, src/components/wishlist/PatternList.tsx]
gates: [pnpm test, pnpm vite:build]
---

# Приклади-патерни у порожньому стані Wishlist / Ignorelist

> **Контекст:** виконано. Реалізація вийшла за рамки первинного плану (rev R1) — CTA переїхав з `PatternList`'s `emptyExtra` у власну зону `wishlist-empty` (keyboard-reachability). Дало дві дослідницькі знахідки — [streams-empty-focus-audit](../p2-streams-empty-focus-audit.md) і [wishlist-stale-list-ref](../p2-wishlist-stale-list-ref.md).

## Опис

За аналогією з кнопкою [«Додати приклади потоків»](../../../src/components/streams/StreamsPanel.tsx#L669-L687)
у порожньому профілі Streams ([`add_example_streams`](../../../src-tauri/src/commands/browser_commands.rs#L235))
дати новачку «з чого почати» в порожньому Wishlist/Ignorelist. Зараз порожній стан —
це гола фраза [«Список … порожній»](../../../src/components/wishlist/PatternList.tsx#L110-L112)
без жодної підказки, що це за список і як виглядає валідний патерн. Синтаксис `*`/`?`
показується лише у [діалозі додавання](../../../src/components/wishlist/AddPatternDialog.tsx#L57-L59) —
тобто **після** того, як юзер уже здогадався натиснути «Додати».

**Чому це не буквальний клон Streams.** Приклад-потік (Промінь, SomaFM, FIP) має власну
цінність — це робоча станція для будь-кого. Патерн вішліста **персональний**: загального
«бажаного треку» не існує, тож пачка прикладів-артистів — це сміття на видалення. Тому
обрана **асиметрична, локаль-незалежна** курація (рішення 2026-06-24):

- **Ignorelist** — кілька напівуніверсальних патернів сміття одразу для **всіх локалей**:
  `*реклама*`, `*джингл*`, `*advert*`, `*jingle*`, `*promo*`.
- **Wishlist** — два приклади одразу для **всіх локалей**: `*новин*` + `*news*`.
  `*новин*` ширший за `*новини*` — ловить відмінки.

**Чому всі локалі одразу, а не за поточним `settings.language`.**
Метадані потоків диктує станція, а не локаль інтерфейсу: україномовний користувач,
що слухає SomaFM чи BBC, отримує англійські ICY-теги, і навпаки. Bulk delete вже є —
видалити зайве коштує два кліки. Плюс: реалізація простіша — фіксований список без
гілки по локалі.

## Технічна реалізація

Ключове спрощення: на відміну від example-streams (потрібен Rust для резолву URL),
приклади-патерни — це **локалізований текст**, тож:

- Патерни — **фіксований масив у коді фронту** (не i18n): locale-branching не потрібен,
  бо seed однаковий для всіх локалей. Нові i18n-ключі потрібні лише для рядків UI
  (назва кнопки «Додати приклад», оголошення результату).
- Seed робиться **повністю на фронті** через наявні
  [`add_to_wishlist`/`add_to_ignorelist`](../../../src-tauri/src/commands/wishlist_commands.rs#L10-L110).
  **Нова Rust-команда не потрібна.** Дедуплікація вже вбудована → повторний клік ідемпотентний.
- **Патерни з `*…*`.** Матчер [`wildcard_match`](../../../src-tauri/src/wishlist/matcher.rs#L16) —
  повний-рядковий (anchored), не підрядковий: `новин` зматчить лише `новин` рівно.
  Тому приклади мусять мати обгортку `*…*`, що заодно демонструє синтаксис.
- **Розміщення:** окрема зона `wishlist-empty`, яку рендерить
  [WishlistPanel](../../../src/components/wishlist/WishlistPanel.tsx), за зразком зони
  `streams-empty` у `StreamsPanel` — а не `empty`/`emptyExtra` prop `PatternList`, як
  планувалось спершу (той підхід відкинуто як keyboard-unreachable; деталі — розділ
  «Спадщина» нижче). Вкладка Wishlist сіє один приклад (`*новин*`), вкладка Ignorelist —
  набір сміттєвих патернів.
- **CTA:** «Додати приклад» (нейтральне, пасує і до вішліста, і до ignorelist).
- **Бейдж синтаксису:** приглушений текст-рядок «`*` — будь-які символи, `?` — один символ»
  поряд із CTA (не Tab-стоп, у природному порядку читання, NVDA читає). Той самий патерн,
  що вже реалізований для Streams ([streams-ctrlk-empty-hint](p2-streams-ctrlk-empty-hint.md)) —
  див. бейдж у порожньому стані [StreamsPanel.tsx](../../../src/components/streams/StreamsPanel.tsx).
- **A11y / NVDA:** повторити патерн зі StreamsPanel
  ([`handleAddExamples`](../../../src/components/streams/StreamsPanel.tsx#L306-L322)): `aria-busy`
  на кнопці, після додавання — оголосити кількість/назви та перевести фокус на перший рядок.

## Критерії готовності

- [x] Порожня вкладка Wishlist показує CTA «Додати приклад», що додає `*новин*` + `*news*`
- [x] Порожня вкладка Ignorelist показує CTA «Додати приклад», що додає `*реклама*`, `*джингл*`, `*advert*`, `*jingle*`, `*promo*`
- [x] Поряд із CTA — приглушений бейдж синтаксису «`*` — будь-які символи, `?` — один символ» (не Tab-стоп)
- [x] Патерни — фіксований масив у коді (не i18n); нові i18n-ключі лише для рядків UI
- [x] Усі патерни мають обгортку `*…*` і реально матчаться у `wildcard_match`
- [x] Повторний клік не дублює (дедуплікація наявних команд)
- [x] Після додавання фокус переходить на перший рядок списку; NVDA оголошує результат
- [x] Нові i18n-ключі для рядків UI (кнопка, оголошення) у `uk.json` і `en.json`; згенеровано через vite-плагін paraglide (не вручну)
- [x] Тести `WishlistPanel.test.tsx` / `PatternList.test.tsx` покривають seed + порожній стан
- [x] `pnpm test` + `pnpm vite:build` зелені

## Спадщина (реалізація)

- Реалізація вийшла за рамки первинного плану (rev R1, 2026-07-19): CTA спершу планували
  через `PatternList`'s `emptyExtra` slot — виявилось keyboard-unreachable (Tab з порожнього
  списку виходив із зони раніше, ніж досягав кнопки). Рішення: власна hand-rolled зона
  `wishlist-empty` у `WishlistPanel.tsx`, за зразком `streams-empty` у `StreamsPanel.tsx`
  (без `onKeyDownCapture`, `ZoneEntry.focus` веде прямо на кнопку).
- Код: `src/components/wishlist/examplePatterns.ts` (фіксований масив),
  `src/components/wishlist/WishlistPanel.tsx` (`handleAddExamples`, зона `wishlist-empty`),
  i18n-ключі `wishlist_add_example`, `wishlist_examples_adding`, `wishlist_examples_added`,
  `wishlist_examples_failed` у `uk.json`/`en.json` (бейдж перевикористовує вже наявний
  `pattern_hint`).
- Тести: `src/components/wishlist/examplePatterns.test.ts` (seed-масиви, обгортка `*…*`),
  `src/components/wishlist/WishlistPanel.test.tsx` (`describe("empty-state example seeding")`
  + regression-тести на keyboard-reachability з R1).
- Виявлені під час фінального ревʼю (223fadb-фікс, follow-up-хвиля) — окремі дослідницькі
  записи: [streams-empty-focus-audit](../p2-streams-empty-focus-audit.md) (латентна версія
  фокус-вади в StreamsPanel), [wishlist-stale-list-ref](../p2-wishlist-stale-list-ref.md)
  (застарілий callback-ref після перемикання вкладки).

## Документи

- Зразок (Streams): [StreamsPanel.tsx:306-322, 669-687](../../../src/components/streams/StreamsPanel.tsx#L306-L322),
  [browser_commands.rs:235](../../../src-tauri/src/commands/browser_commands.rs#L235)
- Код вішліста: [WishlistPanel.tsx](../../../src/components/wishlist/WishlistPanel.tsx),
  [PatternList.tsx](../../../src/components/wishlist/PatternList.tsx),
  [AddPatternDialog.tsx](../../../src/components/wishlist/AddPatternDialog.tsx),
  [wishlist_commands.rs](../../../src-tauri/src/commands/wishlist_commands.rs),
  [matcher.rs](../../../src-tauri/src/wishlist/matcher.rs)
- i18n: [uk.json](../../../src/i18n/messages/uk.json), [en.json](../../../src/i18n/messages/en.json)
- Сусідній (уже реалізований) патерн порожнього стану: [streams-ctrlk-empty-hint](p2-streams-ctrlk-empty-hint.md)
