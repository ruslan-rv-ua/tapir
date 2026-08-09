---
slug: list-key-modifier-guards
title: "Списки: клавіші F2/Delete/Enter спрацьовують із будь-яким модифікатором"
priority: P3
type: planned
status: draft
effort: S
kind: bug
target:
updated: 2026-08-07
a11y: true
depends_on: []
blocks: []
touches:
  - src/hooks/useCompositeList.ts
  - src/hooks/useCompositeList.test.tsx
gates: [pnpm test, pnpm vite:build]
notes:
  - "Знахідка ревізії streams-transfer-hotkeys (grilling, 2026-08-07). Не вигадана проблема: switch по e.key у resolveKeyAction не перевіряє модифікатори взагалі, тож Ctrl+F2 сьогодні перейменовує рядок, а Alt+Delete відкриває діалог видалення"
  - "Свідомо НЕ виправлено разом із F5: це зміна поведінки в усіх чотирьох списках (streams, songs, browser, wishlist), і всередині запису про transfer вона б потонула. F5 отримав власний гард, тому в switch тимчасово співіснують два стилі — це навмисно, див. A4 там"
  - "Перед реалізацією перевірити, чи якийсь список не покладається на поточну поведінку навмисно (напр. Shift+Delete як «видалити без підтвердження») — швидкий grep по onAction-гілках"
---

# Списки: клавіші F2/Delete/Enter спрацьовують із будь-яким модифікатором

> **Контекст:** знахідка ревізії
> [streams-transfer-hotkeys](done/p2-streams-transfer-hotkeys.md) (2026-08-07,
> прийнято 2026-08-09). Виявлено при звірці критеріїв F5 з фактичним кодом хука.

## Опис

`resolveKeyAction` у [useCompositeList.ts](../../src/hooks/useCompositeList.ts)
має два різні стилі метчингу. Комбінації з модифікаторами (`Ctrl+Space`,
`Ctrl+C`, `Ctrl+A`, `Shift+Arrow`) перевіряються явно й акуратно. А фінальний
`switch (e.key)` — `ArrowUp`…`Delete`, `F2`, `Enter`, `Tab` — **не перевіряє
модифікатори взагалі**. Наслідки, живі сьогодні:

- `Ctrl+F2` / `Alt+F2` → `edit` (відкриває перейменування рядка);
- `Alt+Delete` / `Shift+Delete` → `delete` (відкриває діалог видалення);
- те саме для навігаційних клавіш — `Alt+Home` стрибає на початок списку
  замість того, щоб дійти до застосунку.

Практична шкода невелика (жодна з цих комбінацій зараз нічим іншим не зайнята),
але це прихована міна: будь-який майбутній Tier-2 хоткей на `Ctrl`+функційна
або `Alt`+навігаційна клавіша мовчки продублює дію рядка.

## Чому окремо

`streams-transfer-hotkeys` додав `F5` **із** явним гардом модифікаторів, бо
`Ctrl+F5` — це hard reload WebView2 і пускати його в діалог не можна. Тобто в
одному `switch` тепер співіснують два стилі. Вирівнювати решту клавіш там же
означало б зміну поведінки в чотирьох списках усередині запису про transfer —
свідомо відкладено (рішення A4 того запису).

## Критерії готовності

- [ ] `switch (e.key)` матчить лише коли `!e.ctrlKey && !e.altKey && !e.metaKey`
      (окрім гілок, де модифікатор осмислений — `Shift+Arrow` уже обробляється
      вище, `Enter`/`Space` навмисно везуть модифікатори через `modifiers(e)`)
- [ ] `Shift` для `Enter`/`Space`/`Delete`/`F2` не ламається — перевірити, що
      наявні гілки `mods?.shift` (listen/record, `Alt+Enter`) живі
- [ ] Перевірено всі чотири списки на навмисну залежність від поточної
      поведінки (grep по `onAction`-гілках) — жодна не зламана
- [ ] Тести в `useCompositeList.test.tsx` на кожну пару «клавіша × модифікатор»,
      що має пройти повз хук
- [ ] `pnpm test` без регресій
- [ ] NVDA-прогін **не потрібен**: зміна прибирає реакції, нічого не оголошує
      і не рухає фокус. Якщо ревізія покаже інше — завести чекліст

## Документи

- Код: `src/hooks/useCompositeList.ts` (`resolveKeyAction`, фінальний `switch`)
- Джерело: [p2-streams-transfer-hotkeys.md](done/p2-streams-transfer-hotkeys.md) (A4)
