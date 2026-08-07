---
slug: per-stream-ignorelist-ui
title: "UI для per-stream ignorelist (логіка вже жива, редактора немає)"
priority: P2
type: planned
status: draft
effort: M
kind: feature
target: unscheduled
updated: 2026-08-07
a11y: true
depends_on: []
blocks: []
touches:
  - src-tauri/src/commands/stream_commands.rs
  - src/lib/tauri.ts
  - src/components/streams/StreamContextMenu.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
notes:
  - "Виявлено при groomingʼу full-edit-stream (2026-08-07): StreamInfo.ignorelist читається матчером, але жодна IPC-команда його не пише — усі add/remove_from_ignorelist працюють із ПРОФІЛЬНИМ списком"
  - "Готовий взірець UI — PatternList у WishlistPanel (ignorelist профілю): той самий жанр «список патернів + додати/редагувати/видалити», включно з bulk-видаленням"
  - "Пастка з portal-діалогом усередині react-aria колекції (див. wishlist-stale-list-ref і ba87641): діалог рендерити СИБЛІНГОМ колекції, інакше подвійний монтаж і взаємне aria-hide → NVDA мовчить"
---

# UI для per-stream ignorelist (логіка вже жива, редактора немає)

> **Контекст:** `status: draft` — потрібне одне рішення про місце редактора
> (див. «Відкриті питання»), решта зрозуміла. Особливість запису: **бекенд
> уже працює**, бракує рівно способу наповнити список.

## Опис

`StreamInfo.ignorelist` — не скаффолд: при кожній зміні метаданих треку
[manager.rs:911-919](../../src-tauri/src/stream/manager.rs#L911-L919) дістає
per-stream список і передає його в `matcher::check_track` **разом** із
профільним. Тобто персональний ігнор-лист станції вже впливає на запис.

Наповнити його при цьому нічим: усі IPC-обгортки — `getIgnorelist`,
`addToIgnorelist`, `removeFromIgnorelist`, `removeFromIgnorelistBulk`,
`updateIgnorelistPattern` ([tauri.ts:379-393](../../src/lib/tauri.ts#L379-L393))
— адресують **профільний** `Profile.ignorelist`. Єдиний спосіб покласти щось у
per-stream список сьогодні — редагувати `profile.json` руками.

Це і є причина винесення з [full-edit-stream](done/p1-full-edit-stream.md): робота
тут не «показати поле», а «зробити редактор списку» — окремий компонент із
власною клавіатурною моделлю й власним NVDA-прогоном.

## Відкриті питання

- **Де живе редактор.** Три варіанти: (а) секція в `AddStreamDialog` — тоді
  діалог із двох полів стає формою + списком, і його edit-режим важчає;
  (б) окремий діалог із контекстного меню потоку («Ігнор-лист станції…») —
  ізольовано, але ще один діалог у навігації; (в) окрема вкладка/панель поруч
  з ignorelist профілю. Рекомендація при підйомі — (б).
- **Спільний компонент.** `PatternList` із
  [WishlistPanel.tsx](../../src/components/wishlist/WishlistPanel.tsx) робить
  рівно цей жанр для профільного списку. Виносити його у спільний компонент
  чи дублювати? Виносити — якщо (б)/(в); при (а) форма інша.
- **Форма IPC.** Окремі `add_to_stream_ignorelist` / `remove_from_...` за
  зразком профільних, чи один запис усього списку через розширений
  `update_stream` (той після [full-edit-stream](done/p1-full-edit-stream.md) уже
  прийматиме опційні поля)? Другий шлях дешевший, але робить збереження
  списку атомарним лише разом із рештою форми.
- **Видимість.** Чи показувати в рядку потоку, що в нього є власний ігнор-лист
  (щоб «чому цей трек не записався» мало відповідь)?

## Критерії готовності

Уточнити після рішення про місце редактора. Кістяк:

- [ ] Патерн можна додати, відредагувати й видалити з per-stream списку
- [ ] Доданий патерн реально глушить трек — тест на `matcher::check_track`
      із непорожнім per-stream списком
- [ ] Профільний ignorelist не зачеплено (регресія)
- [ ] Список повністю керується з клавіатури; діалог — сиблінг колекції,
      не вкладений у неї
- [ ] NVDA-прогін за чеклістом

## Документи

- Джерело: grooming [full-edit-stream](done/p1-full-edit-stream.md), 2026-08-07
- Код: [manager.rs](../../src-tauri/src/stream/manager.rs) (споживач списку),
  [tauri.ts](../../src/lib/tauri.ts) (профільні ignorelist-обгортки — взірець),
  [WishlistPanel.tsx](../../src/components/wishlist/WishlistPanel.tsx) (`PatternList`)
- Пастка з фокусом і подвійним монтажем діалогу:
  [wishlist-stale-list-ref](done/p1-wishlist-stale-list-ref.md)
