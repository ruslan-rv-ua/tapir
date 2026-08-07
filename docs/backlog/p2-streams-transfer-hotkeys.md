---
slug: streams-transfer-hotkeys
title: "Потоки: F5 / Shift+F5 — копіювати / перенести в інший профіль"
priority: P2
type: planned
status: ready
effort: M
kind: feature
target: 0.1.0
updated: 2026-08-07
a11y: true
depends_on: []
blocks: [list-key-modifier-guards]
touches:
  - src/hooks/useCompositeList.ts
  - src/hooks/useCompositeList.test.tsx
  - src/components/streams/StreamList.tsx
  - src/components/streams/StreamList.test.tsx
  - src/components/streams/StreamItem.tsx
  - src/lib/shortcuts.ts
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
  - docs/keyboard-shortcuts.md
  - docs/testing/nvda-streams-transfer-hotkeys.md
gates: [pnpm test, pnpm vite:build]
notes:
  - "F5=Copy — конвенція Norton Commander (1980-ті) / Total Commander / FAR, добре знайома незрячим користувачам. АЛЕ запозичується лише клавіша, не модель: у TC F5 копіює у другу видиму панель (ціль очевидна до натискання), у нас другої панелі немає й ціль питає TransferDialog. Це свідомо — м'язова пам'ять клавіші коштує дешево, повна модель TC нам не потрібна"
  - "F6 недоторканний: зайнятий зонною навігацією (Tier 2′), і це платформна конвенція Microsoft (F6 = перемикання панелей, Shift+F6 — назад); тому move = Shift+F5, свідоме відхилення від TC (там Shift+F5 = копіювати з перейменуванням)"
  - "NVDA не біндить ані голі F5/F6, ані Shift+F5/F6 (Commands Quick Reference 2026.1.1) — конфлікту зі скрінрідером немає; NVDA+F5 (reload document) — з NVDA-модифікатором, не заважає"
  - "Без webview-reload-guard голий F5 поза списком перезавантажує webview (дефолт WebView2) — звідси depends_on. УСЕРЕДИНІ списку F5 безпечний і без гарда (наш хендлер сам робить preventDefault) — залежність тримається заради незалежної регресії поза списком, а не тому, що фіча без неї зламана. Не «лагодити» F5 у списку, якщо гард ще не злитий"
  - "Ctrl+F5 (hard reload WebView2) гасить сам webview-reload-guard — його список акселераторів уже включає Shift+F5 і Ctrl+F5. Наш гард модифікаторів лише не дає Ctrl+F5 відкрити діалог; погашення reload — не наша відповідальність"
  - "Ревізія 2026-08-07 (grilling): запис перейменовано з keyboard-shortcuts-audit (аудит закрито в §5, лишилась одна вузька фіча); e.code → e.key за конвенцією хука; знайдено дірку фокуса в doTransfer (A9); effort S → M"
---

# Потоки: F5 / Shift+F5 — копіювати / перенести в інший профіль

> **Контекст:** дослідження проведено 2026-07-23, рішення прийнято:
> **`F5` = «Копіювати в профіль…», `Shift+F5` = «Перенести в профіль…»** у
> списку потоків. Подавлення webview-reload винесено в
> [webview-reload-guard](done/p2-webview-reload-guard.md) (залежність цього запису).
> Ширший аудит закрито без нових шорткатів (див. «Результат дослідження» §5).
>
> **Ревізія 2026-08-07 (grilling).** Запис перейменовано під фактичний зміст;
> звірено з кодом — три твердження розходились із реальністю (`e.code`,
> склад тестів, «діалог не називає кількість»), і знайдено незакриту дірку
> фокуса. Усі рішення — в «Рішеннях ревізії» нижче.

## Опис

Дії Copy/Move to profile вже реалізовані (меню рядка `StreamContextMenu`,
тулбар `SelectionActionsMenu` → `openTransfer("copy"|"move", …)` у
[StreamList.tsx](../../src/components/streams/StreamList.tsx)) — додаємо лише
клавіатурний вхід:

- **`F5`** → відкрити StreamTransferDialog у режимі copy;
- **`Shift+F5`** → у режимі move;
- **семантика виділення — модель `Delete`** ([StreamList.tsx](../../src/components/streams/StreamList.tsx),
  keyboard-гілка): виділення непорожнє (`size > 0`) → bulk по виділенню;
  порожнє → single по фокусованому рядку.

Реалізація за прецедентом `F2`/`Ctrl+C`: list-scoped клавіші в
[useCompositeList.ts](../../src/hooks/useCompositeList.ts) (`resolveKeyAction`) →
generic-інтенти `transfer-copy` / `transfer-move` → `onAction` списку; гілки має
лише StreamList, решта списків інтенти ігнорують. Метчити `e.key === "F5"` у
тому ж `switch`, де вже живе `F2` (конвенція хука: `e.code` — для літер/Space,
`e.key` — для навігаційних/функційних клавіш), з **явним гардом модифікаторів**
(`Ctrl`/`Alt`/`Meta` не матчаться) — див. A4. У
[shortcuts.ts](../../src/lib/shortcuts.ts) — два reserved-записи групи `list`
без `match`/`run` (як `row-edit`): F1-довідник + гард KeyRecorder (`F5` реально
рекордиться — `codeToToken` пропускає `/^F([1-9]|1[0-9]|2[0-4])$/`, тож без
`reserved` його можна було б забрати під OS-хоткей).

Понад «лише клавіатурний вхід» запис везе одну правку продакшн-логіки —
**дірку фокуса в одиночному move** (A9). Вона наявна вже зараз, але досяжна
тільки з клавіатури, тож лагодиться тут.

## Рішення ревізії (2026-08-07)

- **A1. Аналогія з TC — лише клавіша, не модель.** Записано в нотатки й у
  `docs/keyboard-shortcuts.md`, щоб наступний читач не очікував двопанельної
  семантики.
- **A2. Два окремі інтенти**, не один + `mods.shift`. Прецедент
  `selectRangeUp`/`selectRangeDown` ближчий (навігаційна клавіша), а
  «модифікатори їдуть у `modifiers(e)`» документовано саме для Enter/Space.
- **A3. `e.key`, не `e.code`** — за конвенцією `resolveKeyAction` і прямим
  прецедентом `F2`.
- **A4. Гард модифікаторів — лише для F5.** `switch` по `e.key` сьогодні не має
  гарду взагалі (`Ctrl+F2` → `edit`, `Alt+Delete` → `delete`). Вирівнювання
  F2/Delete/Enter — це зміна поведінки в чотирьох списках, винесена в
  [list-key-modifier-guards](p3-list-key-modifier-guards.md).
- **A5. `aria-keyshortcuts` — усі три токени.** Рядок потоку вже обробляє
  `Alt+Enter`, але не рекламує нічого; `SongItem` свою пару рекламує. Оголосити
  `"F5 Shift+F5 Alt+Enter"` і переписати наявний тест
  `"does not advertise keyshortcuts on the row"`.
- **A6. Модель `Delete` дзеркалиться один-в-один**, разом із її розбіжністю з
  ⋯-меню (клавіатура — `size > 0`, меню — `.has(id)`). Внутрішня консистентність
  застосунку важливіша за симетрію клавіатура↔меню.
- **A7. Перейменування** slug і файла; 8 посилань у 4 файлах — окремим комітом
  до реалізації.
- **A8. `depends_on` лишається**, але з поясненням у нотатках (див. вище).
- **A9. Дірка фокуса в одиночному move.** `doBulkTransfer` при move ставить
  `pendingBulkFocusRef` на вцілілий рядок; `doTransfer` — ні. Сьогодні шлях
  досяжний лише з ⋯-меню (фокус був на кнопці, react-aria має свою гілку
  «тригер зник»), тож не болить. З `Shift+F5` зникає **сам фокусований рядок**,
  тригера-кнопки немає — фокус падає на `<body>`. jsdom цю гілку не ловить.
- **A10. Тести розділені**: резолвинг клавіші + гард модифікаторів →
  `useCompositeList.test.tsx` (поруч із наявними `F2`/`Delete`); маршрутизація
  інтентів і `aria-keyshortcuts` → `StreamList.test.tsx`.
- **A11. Лічильник у діалозі — вже є.** `StreamTransferDialog` приймає
  `TransferSubject = {kind:"bulk", count}` і будує заголовок із
  `copy_selected_to_profile_title({count})`. Роботи немає, лишається тест.
- **A12. Лейбли F1 називають семантику виділення** — це єдине місце, де пастку
  «діє на все виділення» взагалі можна пояснити.
- **A13. Bulk-of-1 лишається bulk-маршрутом** («Копіювати 1 потік…», не ім'я).
  Заголовок навмисне визначається маршрутом, а не кількістю
  (`StreamTransferDialog`, «finding 2»). З клавіатури лічильника перед очима
  немає — тому це явний рядок у NVDA-чеклисті, щоб не прочиталось як баг.
- **A14. Один прогін прод-збірки на два записи**, два окремі коміти прийняття:
  якщо наш прогін упаде, `webview-reload-guard` не має застрягти разом із ним.
- **A15. Шов між записами перевіряє наш чеклист** — див. критерій нижче.
- **A16. `effort` S → M.** Ядро мале, але A9 — правка продакшн-логіки, а
  ручний прогін прод-збірки сам по собі не `S`.

## Критерії готовності

- [ ] `useCompositeList`: `F5` → `onAction("transfer-copy")`, `Shift+F5` →
      `onAction("transfer-move")` (list-scoped, `e.key`, `preventDefault`,
      явний гард — `Ctrl`/`Alt`/`Meta` не матчаться)
- [ ] `StreamList.onAction`: обидва інтенти → `openTransfer` за моделлю
      `Delete` (selection `size > 0` → bulk, інакше single по фокусованому
      рядку); інші списки — no-op без падінь
- [ ] **`doTransfer` (move): фокус після видалення рядка** — той самий механізм
      `pendingBulkFocusRef` + `setBulkDeleteSeq`, що вже є в `doBulkTransfer`
      (A9). Без цього запис не приймається
- [ ] `shortcuts.ts`: reserved-записи `row-copy-profile` (`F5`) і
      `row-move-profile` (`Shift+F5`), група `list` → з'являються у
      F1-довіднику і блокуються в KeyRecorder
- [ ] i18n (uk/en), ключі `settings_hotkey_action_row_copy_profile` /
      `settings_hotkey_action_row_move_profile`: лейбли називають семантику —
      «Копіювати в інший профіль — виділення або рядок (потоки)» (A12)
- [ ] `aria-keyshortcuts` рядка потоку = `"F5 Shift+F5 Alt+Enter"` (через
      `CompositeRow`, прецедент `StationItem`/`SongItem`); наявний тест
      `"does not advertise keyshortcuts on the row"` переписано (A5). Правило
      порядку токенів зафіксовано в докстрінгу `CompositeRow`
- [ ] `docs/keyboard-shortcuts.md`: Tier 2′ — два нові рядки; примітка про
      свідоме відхилення від TC (move ≠ F6) з посиланням на MS-конвенцію;
      примітка A1 (запозичена клавіша, не модель)
- [ ] Тести `useCompositeList.test.tsx`: `F5`/`Shift+F5` дають правильні
      інтенти; `Ctrl+F5` і `Alt+F5` не матчаться (A10)
- [ ] Тести `StreamList.test.tsx`: single і bulk маршрути для обох інтентів;
      заголовок діалогу називає кількість у bulk (A11); `aria-keyshortcuts`
- [ ] **NVDA-прогін на прод-збірці** (`pnpm tauri build`, не `dev`) за
      чеклістом `docs/testing/nvda-streams-transfer-hotkeys.md`; проводиться
      однією сесією слідом за `webview-reload-guard`, приймається окремим
      комітом (A14). Обов'язкові кроки:
  - [ ] `F5`/`Shift+F5` озвучуються з рядка; діалог відкривається з фокусом
        усередині
  - [ ] заголовок читає «N потоків» при непорожньому виділенні
  - [ ] **фокус після `Shift+F5` → підтвердження стає на сусідній рядок, не на
        `<body>`** (A9 — jsdom це не покриває)
  - [ ] bulk-of-1 читає «1 потік», а не ім'я — це очікувано, не баг (A13)
  - [ ] **шов із гардом:** з фокусом на рядку потоку `F5` відкриває діалог
        **І** webview не перезавантажується — одна дія, обидва інваріанти
        (A15). Свідомо дублює зону відповідальності
        [webview-reload-guard](done/p2-webview-reload-guard.md): якщо гард колись
        додасть `stopPropagation`, жоден з двох чеклистів поодинці цього не
        спіймає
- [ ] `pnpm test` без регресій

## Результат дослідження (2026-07-23)

> Історичний блок. Актуальність станом на 2026-07-23; §5 частково застаріла —
> `open-song-with-default-app` відтоді реалізовано й прийнято (`done/`).

1. **Чи очікувані F5/F6?** F5=Copy/F6=Move — конвенція Norton Commander,
   успадкована Total Commander і FAR; серед незрячих користувачів TC —
   стандарт де-факто. Модель TC (клавіша → діалог з ціллю → підтвердження)
   збігається з нашим TransferDialog. **Але F6 віддати не можна:** у Tapir він
   уже реалізований як зонна навігація (Tier 2′, reserved), і це офіційна
   конвенція Microsoft (F6 = перемикання панелей, Shift+F6 — зворотний цикл) —
   a11y-критична, ламати заборонено. Тому move = `Shift+F5` (NVDA його не
   біндить; відхилення від TC документуємо).
   _(Уточнено 2026-08-07, A1: збіг із TC не такий повний, як тут написано —
   у TC ціль видима, у нас її питає діалог.)_
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
   Винесено в окремий запис [webview-reload-guard](done/p2-webview-reload-guard.md)
   (`depends_on`): без нього F5 поза списком скидає стан UI.
5. **Ширший аудит — закрито без нових шорткатів.** Таблиці первинного запису
   були частково застарілі: «Додати потік» уже має `Ctrl+N`
   ([shortcuts.ts](../../src/lib/shortcuts.ts), `new:streams`), «попередня
   зона» — `Shift+F6` ✅; Songs (`Alt+Enter`/`Ctrl+Enter`) повністю
   специфіковані в [open-song-with-default-app](done/p1-open-song-with-default-app.md)
   (на 2026-07-23 — ready; прийнято 2026-08-06). Низькочастотні дії (імпорт,
   сортування, скидання фільтра, теги) — через командну палітру `Ctrl+K`,
   окремі комбінації не проходять критерій частоти.

## Документи

- Код: `src/hooks/useCompositeList.ts` (`resolveKeyAction` — місце нових
  клавіш, поруч із `F2`), `src/components/streams/StreamList.tsx`
  (`openTransfer`, `doTransfer` — A9, модель `Delete`),
  `src/lib/shortcuts.ts` (reserved-прецедент `row-edit`/`copy-url`),
  `src/components/common/composite-list/CompositeRow.tsx` (`keyshortcuts`),
  `src/components/streams/StreamTransferDialog.tsx` (лічильник — уже є, A11)
- Реєстр: [docs/keyboard-shortcuts.md](../keyboard-shortcuts.md) (Tier 2′)
- Залежність: [p2-webview-reload-guard.md](done/p2-webview-reload-guard.md)
- Відгалуження: [p3-list-key-modifier-guards.md](p3-list-key-modifier-guards.md) (A4)
- [Total Commander: F5 (Copy) / F6 (Move)](https://ghisler.ch/board/viewtopic.php?t=18963) ·
  [Norton Commander shortcuts](https://www.winnc.com/norton_commander_keyboard_shortcuts/)
- [Microsoft: Keyboard accessibility — F6 pane navigation](https://learn.microsoft.com/en-us/windows/apps/design/accessibility/keyboard-accessibility) ·
  [Guidelines for Keyboard UI Design](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/dnacc/guidelines-for-keyboard-user-interface-design)
- [NVDA Commands Quick Reference 2026.1.1](https://download.nvaccess.org/documentation/keyCommands.html)
  — голі F5/F6 і Shift+F5/F6 не заброньовані
