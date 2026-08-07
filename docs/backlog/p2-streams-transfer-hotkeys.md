---
slug: keyboard-shortcuts-audit
title: "Потоки: F5 / Shift+F5 — копіювати / перенести в інший профіль"
priority: P2
type: planned
status: ready
effort: S
kind: feature
target: 0.1.0
updated: 2026-07-23
a11y: true
depends_on: [webview-reload-guard]
blocks: []
touches:
  - src/hooks/useCompositeList.ts
  - src/components/streams/StreamList.tsx
  - src/lib/shortcuts.ts
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
  - docs/keyboard-shortcuts.md
gates: [pnpm test, pnpm vite:build]
notes:
  - "F5=Copy — конвенція Norton Commander (1980-ті) / Total Commander / FAR, добре знайома незрячим користувачам; TC-модель «натиснув → діалог із ціллю» збігається з нашим TransferDialog один в один"
  - "F6 недоторканний: зайнятий зонною навігацією (Tier 2′), і це платформна конвенція Microsoft (F6 = перемикання панелей, Shift+F6 — назад); тому move = Shift+F5, свідоме відхилення від TC (там Shift+F5 = копіювати з перейменуванням)"
  - "NVDA не біндить ані голі F5/F6, ані Shift+F5/F6 (Commands Quick Reference 2026.1.1) — конфлікту зі скрінрідером немає; NVDA+F5 (reload document) — з NVDA-модифікатором, не заважає"
  - "Без webview-reload-guard голий F5 поза списком перезавантажує webview (дефолт WebView2) — звідси depends_on"
---

# Потоки: F5 / Shift+F5 — копіювати / перенести в інший профіль

> **Контекст:** дослідження проведено 2026-07-23, рішення прийнято:
> **`F5` = «Копіювати в профіль…», `Shift+F5` = «Перенести в профіль…»** у
> списку потоків. Подавлення webview-reload винесено в
> [webview-reload-guard](p2-webview-reload-guard.md) (залежність цього запису).
> Ширший аудит закрито без нових шорткатів (див. «Результат дослідження» §5).

## Опис

Дії Copy/Move to profile вже реалізовані (меню рядка `StreamContextMenu`,
тулбар `SelectionActionsMenu` → `openTransfer("copy"|"move", …)` у
[StreamList.tsx](../../src/components/streams/StreamList.tsx)) — додаємо лише
клавіатурний вхід:

- **`F5`** → відкрити TransferDialog у режимі copy;
- **`Shift+F5`** → у режимі move;
- **семантика виділення — модель `Delete`** ([StreamList.tsx](../../src/components/streams/StreamList.tsx),
  keyboard-гілка): виділення непорожнє (`size > 0`) → bulk по виділенню;
  порожнє → single по фокусованому рядку.

Реалізація за прецедентом `F2`/`Ctrl+C`: list-scoped клавіші в
[useCompositeList.ts](../../src/hooks/useCompositeList.ts) (`resolveKeyAction`) →
generic-інтенти `transfer-copy` / `transfer-move` → `onAction` списку; гілки має
лише StreamList, решта списків інтенти ігнорують. Метчити `e.code === "F5"`
(голий / лише Shift), `preventDefault()`. У [shortcuts.ts](../../src/lib/shortcuts.ts) —
два reserved-записи групи `list` без `match`/`run` (як `row-edit`): F1-довідник
+ гард KeyRecorder (F5 — у токенах рекордера, без reserved його можна було б
забрати під OS-хоткей).

## Критерії готовності

- [ ] `useCompositeList`: `F5` → `onAction("transfer-copy")`, `Shift+F5` →
      `onAction("transfer-move")` (list-scoped, `preventDefault`, `Ctrl`/`Alt`
      не матчаться)
- [ ] `StreamList.onAction`: обидва інтенти → `openTransfer` за моделлю
      `Delete` (selection `size > 0` → bulk, інакше single по фокусованому
      рядку); інші списки — no-op без падінь
- [ ] `shortcuts.ts`: reserved-записи `row-copy-profile` (`F5`) і
      `row-move-profile` (`Shift+F5`), група `list` → з'являються у
      F1-довіднику і блокуються в KeyRecorder
- [ ] i18n: лейбли для F1-довідника (uk/en), за патерном
      `settings_hotkey_action_row_*`
- [ ] `aria-keyshortcuts` рядка потоку доповнено `"F5 Shift+F5"` (через
      `CompositeRow`, прецедент `StationItem`)
- [ ] `docs/keyboard-shortcuts.md`: Tier 2′ — два нові рядки; примітка про
      свідоме відхилення від TC (move ≠ F6) з посиланням на MS-конвенцію
- [ ] Тести `StreamList.test.tsx`: F5/Shift+F5 single і bulk; `Ctrl+F5` не
      тригерить; тест aria-keyshortcuts
- [ ] NVDA-прогін: комбо озвучуються з рядка, діалог відкривається з фокусом
      (мануально, перед релізом)
- [ ] `pnpm test` без регресій

## Результат дослідження (2026-07-23)

1. **Чи очікувані F5/F6?** F5=Copy/F6=Move — конвенція Norton Commander,
   успадкована Total Commander і FAR; серед незрячих користувачів TC —
   стандарт де-факто. Модель TC (клавіша → діалог з ціллю → підтвердження)
   збігається з нашим TransferDialog. **Але F6 віддати не можна:** у Tapir він
   уже реалізований як зонна навігація (Tier 2′, reserved), і це офіційна
   конвенція Microsoft (F6 = перемикання панелей, Shift+F6 — зворотний цикл) —
   a11y-критична, ламати заборонено. Тому move = `Shift+F5` (NVDA його не
   біндить; відхилення від TC документуємо).
2. **Ctrl+C/Ctrl+X замість F5/F6?** Відхилено: `Ctrl+C` у списках зайнятий
   (копіювати URL), а clipboard-модель (cut → перейти → paste) не відповідає
   діалоговій транзакції transfer — TC-модель лягає точніше.
3. **Чи виправданий шорткат при наявності дій у меню?** Так, за низькою ціною:
   дії реалізовані, потрібен лише клавіатурний вхід + reserved + довідник.
   Для NVDA шлях Shift+F10 → стрілки → Enter помітно довший; F1-довідник дає
   виявність.
4. **Конфлікт F5 у Tauri — підтверджений:** WebView2 за замовчуванням
   перезавантажує webview на F5/Ctrl+R (Tauri v2 опції вимкнути це не має;
   рішення — JS `preventDefault`, підтверджено мейнтейнером у tauri#3844).
   Винесено в окремий запис [webview-reload-guard](p2-webview-reload-guard.md)
   (`depends_on`): без нього F5 поза списком скидає стан UI.
5. **Ширший аудит — закрито без нових шорткатів.** Таблиці первинного запису
   були частково застарілі: «Додати потік» уже має `Ctrl+N`
   ([shortcuts.ts](../../src/lib/shortcuts.ts), `new:streams`), «попередня
   зона» — `Shift+F6` ✅; Songs (`Alt+Enter`/`Ctrl+Enter`) повністю
   специфіковані в [open-song-with-default-app](p1-open-song-with-default-app.md)
   (ready). Низькочастотні дії (імпорт, сортування, скидання фільтра, теги) —
   через командну палітру `Ctrl+K`, окремі комбінації не проходять критерій
   частоти.

## Документи

- Код: `src/hooks/useCompositeList.ts` (`resolveKeyAction` — місце нових
  клавіш), `src/components/streams/StreamList.tsx` (`openTransfer`, модель
  `Delete`), `src/lib/shortcuts.ts` (reserved-прецедент `row-edit`/`copy-url`),
  `src/components/common/composite-list/CompositeRow.tsx` (`keyshortcuts`)
- Реєстр: [docs/keyboard-shortcuts.md](../keyboard-shortcuts.md) (Tier 2′)
- Залежність: [p2-webview-reload-guard.md](p2-webview-reload-guard.md)
- [Total Commander: F5 (Copy) / F6 (Move)](https://ghisler.ch/board/viewtopic.php?t=18963) ·
  [Norton Commander shortcuts](https://www.winnc.com/norton_commander_keyboard_shortcuts/)
- [Microsoft: Keyboard accessibility — F6 pane navigation](https://learn.microsoft.com/en-us/windows/apps/design/accessibility/keyboard-accessibility) ·
  [Guidelines for Keyboard UI Design](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/dnacc/guidelines-for-keyboard-user-interface-design)
- [NVDA Commands Quick Reference 2026.1.1](https://download.nvaccess.org/documentation/keyCommands.html)
  — голі F5/F6 і Shift+F5/F6 не заброньовані
