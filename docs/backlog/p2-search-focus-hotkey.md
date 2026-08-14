---
slug: search-focus-hotkey
title: "Ctrl+F — фокус на пошук поточного екрана (+ гасіння Find bar WebView2)"
priority: P2
type: planned
status: ready
effort: S
kind: feature
target: 0.1.0
updated: 2026-08-14
a11y: true
depends_on: [webview-reload-guard]
blocks: []
touches:
  - src/lib/shortcuts.ts
  - src/lib/webviewAccelerators.ts
  - src/hooks/useZoneNavigation.ts
  - src/hooks/useGlobalShortcuts.ts
  - src/App.tsx
  - src/components/browser/SearchForm.tsx
  - src/components/songs/SongsFilterBar.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
  - docs/keyboard-shortcuts.md
gates: [pnpm test, pnpm vite:build]
notes:
  - "Відщеплено від hotkeys-expansion (grilling 2026-08-14): решта тієї хвилі — дрібні клавіші, а тут нова інфраструктура фокуса + правка чужого прийнятого рішення"
  - "Текстовий пошук є лише на Browser і Songs. У Streams — чіпи стану ($streamFilter), не текст; Wishlist / Schedule / Profiles не мають нічого"
  - "Ctrl+F не конфліктує з NVDA (пошук NVDA — NVDA+Ctrl+F)"
---

# Ctrl+F — фокус на пошук поточного екрана (+ гасіння Find bar WebView2)

> **Контекст:** відщеплено 2026-08-14 від
> [hotkeys-expansion](done/p2-hotkeys-expansion.md) (друга хвиля аудиту шорткатів,
> рішення 2026-07-23). Виправляє також підставу, на якій `Ctrl+F` було виключено
> з переліку гарда в [webview-reload-guard](done/p2-webview-reload-guard.md) §8.

## Опис

Універсальна конвенція «знайти»: `Ctrl+F` веде фокус у поле пошуку поточного екрана.
Текстовий пошук є на двох екранах — Browser
([SearchForm.tsx](../../src/components/browser/SearchForm.tsx)) і Songs
([SongsFilterBar.tsx](../../src/components/songs/SongsFilterBar.tsx)); на решті
клавіша відповідає, що шукати тут нема чого.

### Механізм: `focusSearch?()` на `ZoneEntry`

Наївне «сфокусувати зону пошуку» **не працює**: обидві зони віддають як `focus`
метод `restoreFocus` із [useFocusBoundary.ts:88](../../src/hooks/useFocusBoundary.ts#L88),
а той повертає фокус на *останній елемент, якого торкались у зоні*. Якщо користувач
востаннє був на `<select>` сортування, «фокус зони пошуку» приведе на сортування.

Тому `ZoneEntry` ([useZoneNavigation.ts:4](../../src/hooks/useZoneNavigation.ts#L4))
отримує **опційний** метод `focusSearch?(): void`, який реалізують тільки зони з полем
пошуку. `Ctrl+F` бере перший елемент `orderedZonesRef`, у якого метод є, і кличе його.

Чому саме так, а не мапа `секція → зона` чи атом-подія: `orderedZonesRef` уже містить
**лише зони поточної секції** плюс постійні, тож пошук автоматично section-scoped —
мапі нема з чим розсинхронитись, бо мапи немає. Нових сторів і підписок — нуль;
`App.tsx`, який і так володіє `orderedZonesRef`, віддає `focusSearch` у
`ShortcutActions` поруч із рештою дій.

Якщо фокус **уже** в полі — за браузерною конвенцією `select()` наявного тексту,
не просто `focus()`.

### Секція без пошуку: клавіша відповідає, а не мовчить

`Ctrl+F` лишається глобальним записом реєстру (без `when`-гейта), але **підстава інша,
ніж була в первинній редакції**. Там вона звучала «інакше спрацює дефолтний Find bar» —
після рішення нижче це робота гарда, не реєстру. Тепер підстава така: тиша у відповідь
на клавішу, яку конвенція обіцяє *скрізь*, нерозрізненна з «застосунок завис» або
«клавіша не дійшла». Тож на секції без пошуку йде коротка репліка
(«На цьому екрані немає пошуку»), assertive — за правилом «відповідь на натискання
користувача assertive, фонова подія polite».

### Find bar: клавіша йде **і** в перелік гарда

`Ctrl+F` дописується в [webviewAccelerators.ts](../../src/lib/webviewAccelerators.ts):
модифікатори за прецедентом `KeyR` — `ctrl`/`meta` **без** `alt` (AltGr на європейських
розкладках).

Це не дубль реєстру, а другий шар. `webview-reload-guard` §8 виключив `Ctrl+F` із
переліку з підставою «споживає Tier-2 диспетчер» — а Tier-2 виходить першим рядком
при `isInModal()` ([useGlobalShortcuts.ts:46](../../src/hooks/useGlobalShortcuts.ts#L46)).
Отже з будь-якого відкритого діалогу — Add Stream, Settings, редактор тегів,
KeyRecorder — `Ctrl+F` долітає до WebView2 і відкриває Find bar (у
[tauri.conf.json](../../src-tauri/tauri.conf.json) `browserAcceleratorKeys` не
виставлено, тобто акселератори ввімкнені за замовчуванням). Гард `isInModal`-гейта не
має й робить лише `preventDefault` — рівно та схема, що вже працює для `F5`: гард
гасить браузерний дефолт **скрізь**, застосунок дає клавіші сенс там, де він є.

Системний вимикач `AreBrowserAcceleratorKeysEnabled` не чіпаємо — його відхилено в
§7 того ж запису, і перелік зростає на один рядок, а не «розростається».

## Критерії готовності

- [ ] `ZoneEntry.focusSearch?()` — опційний метод; реалізують `SearchForm` і
      `SongsFilterBar` (обидві ведуть на **інпут**, не на зону; якщо фокус уже там —
      `select()`)
- [ ] `Ctrl+F` у `SHORTCUTS`: глобальний матч (`e.code === "KeyF"`, ctrlOrMeta),
      `reserved: true`, група global, лейбли uk/en
- [ ] Browser і Songs: фокус лендиться в поле пошуку з будь-якої зони секції
- [ ] Секція без пошуку: assertive-репліка «На цьому екрані немає пошуку», без
      падінь і без руху фокуса
- [ ] `Ctrl+F` у [webviewAccelerators.ts](../../src/lib/webviewAccelerators.ts)
      (`ctrl`/`meta` без `alt`); Find bar не відкривається **ніде**, включно з
      відкритим діалогом
- [ ] `docs/keyboard-shortcuts.md`: рядок Tier 2, рядок у таблиці гарда, і
      **виправлена** примітка «свідомо поза переліком: `Ctrl+F` (споживає Tier-2)» —
      її підстава спростована
- [ ] Тести: диспетч на Browser/Songs; секція без пошуку → репліка + `defaultPrevented`
      без падіння; предикат гарда на `Ctrl+F` / `Ctrl+Alt+F` (AltGr не гаситься)
- [ ] NVDA-прогін (мануально, перед релізом): приземлення фокуса на обох екранах,
      репліка на секції без пошуку, `Ctrl+F` з відкритого діалогу — тиша без Find bar
- [ ] `pnpm test` без регресій

## Нюанси реалізації

- **Два capture-слухачі на `window` не заважають один одному:** `stopPropagation()`
  у Tier-2 не глушить інші слухачі того самого елемента (це робив би
  `stopImmediatePropagation`), тож `preventDefault` гарда відпрацює незалежно від
  порядку реєстрації.
- `ctrlOrMeta` у [shortcuts.ts:45](../../src/lib/shortcuts.ts#L45) уже вимагає
  `!altKey && !shiftKey` — окремої правки під AltGr у реєстрі не потрібно, вона
  потрібна саме в переліку гарда.

## Документи

- Реєстр: [docs/keyboard-shortcuts.md](../keyboard-shortcuts.md) (Tier 2; розділ
  «Подавлені акселератори WebView2 (гард)»)
- Код: `src/hooks/useZoneNavigation.ts` (`ZoneEntry`), `src/hooks/useFocusBoundary.ts`
  (`restoreFocus` — чому «фокус зони» не годиться), `src/App.tsx` (`orderedZonesRef`,
  `ShortcutActions`), `src/lib/webviewAccelerators.ts`
- Суміжні: [hotkeys-expansion](done/p2-hotkeys-expansion.md) (звідки відщеплено),
  [p2-webview-reload-guard.md](done/p2-webview-reload-guard.md) (§7 системний вимикач,
  §8 перелік акселераторів — підставу для `Ctrl+F` виправляє цей запис),
  [p2-webview-zoom-hotkeys.md](p2-webview-zoom-hotkeys.md) (сусідній випадок
  «акселератор, який застосунок забирає собі»)
- [Overriding default browser shortcuts (Chromium)](https://www.robin-drexler.com/2015/07/07/overriding-default-browser-shortcuts)
- [NVDA Commands Quick Reference](https://download.nvaccess.org/documentation/keyCommands.html)
  — `Ctrl+F` не заброньовано (пошук NVDA — `NVDA+Ctrl+F`)
</content>
