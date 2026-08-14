# Ctrl+N — контекстне «створити нове» на Profiles / Wishlist / Schedule

- **Слаг:** `contextual-ctrl-n`
- **Дата:** 2026-06-21
- **Тип:** дизайн (spec) для реалізації
- **Беклог:** docs/backlog/p0-contextual-ctrl-n.md
- **ADR:** [docs/decisions/2026-06-02-context-aware-keyboard-shortcuts.md](../../decisions/2026-06-02-context-aware-keyboard-shortcuts.md)
- **Гілка реалізації:** `feature/contextual-ctrl-n` (відгалужена від `develop`); фінал — merge у `develop`, без push, `main` не чіпати.

## Проблема й мета

`Ctrl+N` уже відкриває «Add Stream» на екрані Streams через реєстр шорткатів. ADR передбачає
розширення патерну на інші екрани. Мета — щоб користувач (незрячий, NVDA) вчив **одне** правило
_«Ctrl+N — створити нове в поточному екрані»_ і діставав дію створення однією клавішею, незалежно
від поточного фокуса всередині екрана, без проходу Tab-кроками чи через зони (F6).

## Обсяг

`Ctrl+N` відкриває діалог створення на трьох екранах. Streams вже працює і не змінюється.

| екран (`$activeSection`) | `Ctrl+N` → дія | діалог | i18n-мітка F1 |
|--------------------------|----------------|--------|----------------|
| `streams` | (вже є) Add Stream | `AddStreamDialog` | `m.add_stream` |
| `profiles` | Створити профіль | `ProfileNameDialog` (`type:"create"`) | `m.profile_create` → «Новий профіль» |
| `wishlist` | Додати патерн (для активної вкладки) | `AddPatternDialog` | `m.add_pattern` → «Додати патерн» |
| `schedule` | Нове планування | `ScheduleForm` | `m.schedule_add` → «Додати розклад» |

### Без нових i18n-ключів

Усі мітки F1 — **наявні** ключі (звірено з `src/i18n/messages/uk.json`): `m.profile_create`
(«Новий профіль»), `m.add_pattern` («Додати патерн»), `m.schedule_add` («Додати розклад»). Беклогова
назва «Нове планування» — лише концептуальна; реально перевикористовуємо `m.schedule_add` (та сама
мітка, що й на кнопці тулбара). Нові ключі **не створюємо**.

> **Нюанс озвучення (не дефект):** мітка F1 — це не завжди заголовок діалогу. `AddPatternDialog`
> оголошує власний заголовок за активною вкладкою — `m.add_to_wishlist` («Додати до бажаних») або
> `m.add_to_ignorelist` («Додати до ігнорованих»), — а не `m.add_pattern`. Це коректно й навіть
> точніше для NVDA. F1 лишає тег-агностичну мітку «Додати патерн».

### Поза обсягом (свідоме рішення)

- **Browser — пропускаємо.** Формулювання беклогу «додати станцію до Wishlist» помилкове: кнопка
  «Add» на Browser додає станцію до **Streams**, а не до wishlist (wishlist тримає патерни назв
  пісень, не станції). Головне — якщо рядок станції у фокусі, її вже можна додати клавішею **Enter**
  (primary-дія рядка). Тож `Ctrl+N` на Browser або дублював би Enter (рядок у фокусі), або був би
  no-op із підказкою (фокус не на рядку). Слабка цінність → не робимо. Інші три екрани відкривають
  діалог створення, чого Enter ніколи не робить.
- **НЕ оголошуємо «Ctrl+N — [дія]» при зміні активного екрана** (відкрите питання беклогу). YAGNI +
  ризик «галасливості» NVDA при частому перемиканні Alt+цифра. App уже озвучує **назву секції** при
  перемиканні ([src/App.tsx](../../../src/App.tsx), ефект на `activeSection`) — додавати ще й підказку
  про шорткат надмірно. Дискаверабіліті шортката лишається через F1; озвучення назви дії при
  *відкритті* діалогу забезпечене заголовком/`aria-label` діалогів.

## Архітектура: bridge-атом на екран

Глобальний обробник [src/hooks/useGlobalShortcuts.ts](../../../src/hooks/useGlobalShortcuts.ts)
працює на рівні `window` (capture-фаза) і диспетчеризує дії через nanostores. Три цільові діалоги
тримаються в **локальному** `useState` своїх панелей, а їхній стан мультиплексований:

- `ProfilesPanel` — `subDialog` (7 типів: create/rename/duplicate/delete/switch-confirm/…);
- `WishlistPanel` — `dialog` (`add`/`edit`, плюс залежність від локального `activeTab`);
- `SchedulePanel` — `formFor` (`{schedule: null}` для нового, `{schedule}` для редагування).

Повний перенос цього стану в атоми (як у `$showAddStreamDialog`, де діалог цілком керується атомом)
надто інвазивний. Тому — **атом-сигнал + місток-ефект**: один булевий атом на екран; панель
підписується через `useStore`, і коли атом стає `true`, `useEffect` відкриває *локальний* діалог і
скидає атом назад у `false`.

```
Ctrl+N
  → matchShortcut(e, {activeSection:"profiles"})  // when-gate в реєстрі
  → hit.run(actions)  →  actions.openCreateProfile()  →  $showCreateProfileDialog.set(true)
  → ProfilesPanel useEffect([showCreate]):
        if (showCreate) { setNameInput(""); setNameError(null); setSubDialog({type:"create"}); $showCreateProfileDialog.set(false); }
```

**Панель завжди змонтована, коли її гейт спрацьовує.** [src/App.tsx](../../../src/App.tsx) монтує
панель лише для активної секції (`{activeSection === "profiles" && <ProfilesPanel/>}`). Оскільки
`when`-гейт пускає `run` тільки коли `activeSection` дорівнює цьому екрану, відповідна панель у цей
момент гарантовано в DOM, тож місток-ефект відпрацює.

**Чому re-entrancy безпечна:** поки діалог відкритий, `isInModal()` у глобальному обробнику глушить
`Ctrl+N`, тож подвійного відкриття немає. `isInModal()` звіряється з `MODAL_SELECTOR`, що покриває й
`role="dialog"` (AddPatternDialog, ScheduleForm), і `role="alertdialog"` (ProfileNameDialog) — усі три
діалоги під захистом. Скидання атома в `false` (синхронно при відкритті) дозволяє повторне натискання
після закриття і робить «застряглий `true`» практично неможливим у нормальному потоці (атом стає
`false` ще до того, як діалог відкриється і панель зможе демонтуватися). Guard `if (show…)` у ефекті
не дає переоткрити діалог при перерендері з інших причин (напр. зміна `activeTab` у Wishlist).

## Зміни по файлах

### 1. Стори — нові атоми (поруч із наявними)

- `src/stores/profileManager.ts`: `export const $showCreateProfileDialog = atom<boolean>(false);`
- `src/stores/wishlist.ts`: `export const $showAddPatternDialog = atom<boolean>(false);`
- `src/stores/schedule.ts`: `export const $showAddScheduleDialog = atom<boolean>(false);`

### 2. `src/lib/shortcuts.ts` — реєстр

- Розширити `ShortcutActions`:
  `openCreateProfile`, `openAddPattern`, `openCreateSchedule` (усі `() => void`).
  > Назва `openAddPattern` (не беклогова `openAddWishlistPattern`): діалог додає патерн до **активної
  > вкладки**, якою може бути й ignorelist, — тег-агностична назва точніша й збігається з атомом
  > `$showAddPatternDialog`.
- Додати 3 записи в `SHORTCUTS` одразу після `new:streams` (group `context`, `reserved: true`):

```ts
{
  id: "new:profiles",
  combo: "Ctrl+N",
  label: m.profile_create,
  group: "context",
  reserved: true,
  match: (e) => ctrlOrMeta(e) && e.code === "KeyN",
  when: (ctx) => ctx.activeSection === "profiles",
  run: (a) => a.openCreateProfile(),
},
// new:wishlist  → when "wishlist" → a.openAddPattern(),     label m.add_pattern
// new:schedule  → when "schedule" → a.openCreateSchedule(), label m.schedule_add
```

`matchShortcut` повертає **перший** запис, чий `match` спрацював і чий `when` істинний. Записи
Ctrl+N стоять у порядку streams → profiles → wishlist → schedule; їхні `when` взаємовиключні за
`activeSection`, тож рівно один спрацює на кожному екрані.

### 3. `src/lib/reservedShortcuts.ts` — дедуплікація

Combo `Ctrl+N` уже зарезервований записом Streams, тож KeyRecorder уже захищений. Щоб зберегти
інваріант «кожен запис реєстру `reserved`» (усі наявні записи `reserved`) і не зламати точну перевірку
`reservedShortcuts.test.ts` (масив очікує **один** `Ctrl+N`), дедуплікувати
`RESERVED_WEBVIEW_COMBOS` за `combo`, лишаючи перше входження (зберігає порядок реєстру):

```ts
export const RESERVED_WEBVIEW_COMBOS: ReadonlyArray<{ combo: string; label: () => string }> =
  SHORTCUTS
    .filter((s) => s.reserved)
    .filter((s, i, arr) => arr.findIndex((x) => x.combo === s.combo) === i)
    .map(({ combo, label }) => ({ combo, label }));
```

`findReservedConflict("Ctrl+N")` далі повертає мітку Streams (`m.add_stream`) — перше входження.
Єдиний споживач — `HotkeysTab.tsx` — викликає лише `findReservedConflict(combo)` (перевірка членства),
списку не рендерить, тож дедуплікація безпечна. `findIndex` — O(n²), але `n ≈ 16`, тож байдуже; без
побічних ефектів у предикаті.

> **Простіша альтернатива (відхилено):** не ставити `reserved` новим записам узагалі — тоді
> `RESERVED_WEBVIEW_COMBOS` лишиться з одним `Ctrl+N` (від Streams) без жодних змін у
> `reservedShortcuts.ts`. Працює, але порушує інваріант «кожен запис `reserved`» і приховує намір, що
> ці комбо нерепризначувані. Обрано явне `reserved: true` + дедуплікацію.

### 4. `src/hooks/useGlobalShortcuts.ts` — дроти

Імпортувати 3 нові атоми; додати 3 методи в об'єкт `actions`:

```ts
openCreateProfile: () => $showCreateProfileDialog.set(true),
openAddPattern:    () => $showAddPatternDialog.set(true),
openCreateSchedule: () => $showAddScheduleDialog.set(true),
```

### 5. Панелі — місток-ефект

- **`src/components/profile/ProfilesPanel.tsx`**
  `const showCreate = useStore($showCreateProfileDialog);`
  `useEffect(() => { if (showCreate) { setNameInput(""); setNameError(null); setSubDialog({type:"create"}); $showCreateProfileDialog.set(false); } }, [showCreate]);`
- **`src/components/wishlist/WishlistPanel.tsx`**
  `const showAddPattern = useStore($showAddPatternDialog);`
  `useEffect(() => { if (showAddPattern) { setDialog({mode:"add", listType: activeTab}); $showAddPatternDialog.set(false); } }, [showAddPattern, activeTab]);`
  (відкриває для активної вкладки; guard не дає переоткрити при зміні `activeTab`).
- **`src/components/schedule/SchedulePanel.tsx`**
  `const showAddSchedule = useStore($showAddScheduleDialog);`
  `useEffect(() => { if (showAddSchedule) { setFormFor({schedule:null}); $showAddScheduleDialog.set(false); } }, [showAddSchedule]);`

## Тести (TDD)

### `src/hooks/useGlobalShortcuts.test.tsx` (розширити; виконує критерій беклогу)

Цей тест **не мокає** `paraglide/messages` — і не треба: мітки в реєстрі — ліниві геттери
(`label: m.profile_create`), які при диспетчеризації не викликаються (їх читає лише `ShortcutsHelp`).
Додавання посилань на нові мітки безпечне.

- імпортувати й ресетити 3 нові атоми в `beforeEach` (поруч із наявним ресетом `$showAddStreamDialog`);
- `Ctrl+N` на `profiles` → `$showCreateProfileDialog === true` **і** `$showAddStreamDialog === false`;
- те саме для `wishlist` → `$showAddPatternDialog`, `schedule` → `$showAddScheduleDialog`;
- наявний тест «не відкриває Add Stream поза streams» лишається.

### Панельні bridge-тести — мокування різниться по файлах!

Кожен панельний тест уже монтує панель з обов'язковими пропсами
`render(<Panel onZonesChange={() => {}} exitZone={() => {}} />)` і мокає `../../lib/tauri`. Bridge-тест
лише **встановлює атом** (через `act(() => $show….set(true))`) і перевіряє, що з'явився діалог. Перед
тим — ресет атома в `beforeEach`. **Спосіб пошуку діалогу й набір мокнутих повідомлень відрізняються:**

| тест | messages | роль діалогу | заголовок (як шукати) |
|------|----------|--------------|------------------------|
| `ProfilesPanel.test.tsx` | **мокнуті** (`profile_create: () => "New profile"`) | `role="alertdialog"` ⚠️ | `getByRole("alertdialog")` / heading `m.profile_create()` |
| `WishlistPanel.test.tsx` | **справжні** (мок лише `tauri`) | `role="dialog"` | heading `m.add_to_wishlist()` (активна вкладка — wishlist) |
| `SchedulePanel.test.tsx` | **мокнуті** (`schedule_form_add_title: () => "Додати розклад"`) | `role="dialog"` | `findByRole("dialog")` + heading `m.schedule_form_add_title()` |

- **Не** використовувати `getByRole("dialog")` для Profiles — `ProfileNameDialog` має
  `role="alertdialog"`. Шукати по геттеру `m.*()` (а не хардкоднутий рядок), щоб тест був стійкий і до
  мокнутих, і до справжніх повідомлень.
- Імпорт нового атома береться з того ж стора, що вже імпортується в тесті
  (`profileManager` / `wishlist` / `schedule`).

### `src/lib/reservedShortcuts.test.ts`

Лишається зеленим **без змін**: після дедуплікації масив очікує один `Ctrl+N` (перший — Streams), а
`findReservedConflict("Ctrl+N")` → `m.add_stream`. (Якщо тест усе ж упаде — це сигнал, що дедуплікацію
не застосовано.)

## Критерії готовності

- [ ] `Ctrl+N` на Profiles відкриває діалог «Створити профіль» (`ProfileNameDialog`, `type:"create"`).
- [ ] `Ctrl+N` на Wishlist відкриває `AddPatternDialog` для активної вкладки.
- [ ] `Ctrl+N` на Schedule відкриває `ScheduleForm` (нове планування).
- [ ] NVDA озвучує назву дії після відкриття (заголовок діалогу = його доступна назва; нічого нового).
- [ ] F1-довідка містить 3 нові записи в групі «context» із правильними i18n-мітками.
- [ ] `useGlobalShortcuts.test.tsx` розширено: `Ctrl+N` на 3 екранах виконує правильну дію і **не**
      відкриває Add Stream.
- [ ] 3 панельні bridge-тести (атом `true` → діалог відкрито).
- [ ] Browser свідомо поза обсягом; нових i18n-ключів не додано.
- [ ] Gate: `pnpm test` + `pnpm vite:build` зелені.

## Деталі / конвенції

- `e.code === "KeyN"`, не `e.key` — кирилична розкладка повертає `e.key === "н"` (accessibility.md §12).
- `ctrlOrMeta`: `(e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey`.
- **Повернення фокуса:** react-aria `Modal` повертає фокус на елемент, активний у момент відкриття
  (рядок списку / поле пошуку / будь-що), а success-хендлери панелей (`refocusProfile`, focus на новий
  розклад тощо) самі ведуть фокус після створення. Це та сама поведінка, що й у Streams `Ctrl+N`, —
  окремо нічого робити не треба.
- **Без нового UI-стану в реєстрі:** нові записи мають `match` (отже, диспетчеризуються централізовано,
  як `new:streams`); жодних змін у `App.tsx`-слухачі не потрібно.
- `tsc` має ~51 наявних помилок (нетипізований paraglide) — це не gate; реальні gate — `pnpm test`
  і `pnpm vite:build`.
