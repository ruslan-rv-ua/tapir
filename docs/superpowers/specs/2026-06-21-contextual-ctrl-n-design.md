# Ctrl+N — контекстне «створити нове» на Profiles / Wishlist / Schedule

- **Слаг:** `contextual-ctrl-n`
- **Дата:** 2026-06-21
- **Тип:** дизайн (spec) для реалізації
- **Беклог:** [docs/backlog/p0-contextual-ctrl-n.md](../../backlog/p0-contextual-ctrl-n.md)
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
| `profiles` | Створити профіль | `ProfileNameDialog` (`type:"create"`) | `m.profile_create` |
| `wishlist` | Додати паттерн (для активної вкладки) | `AddPatternDialog` | `m.add_pattern` |
| `schedule` | Нове планування | `ScheduleForm` | `m.schedule_add` |

### Поза обсягом (свідоме рішення)

- **Browser — пропускаємо.** Формулювання беклогу «додати станцію до Wishlist» помилкове: кнопка
  «Add» на Browser додає станцію до **Streams**, а не до wishlist (wishlist тримає паттерни назв
  пісень, не станції). Головне — якщо рядок станції у фокусі, її вже можна додати клавішею **Enter**
  (primary-дія рядка). Тож `Ctrl+N` на Browser або дублював би Enter (рядок у фокусі), або був би
  no-op із підказкою (фокус не на рядку). Слабка цінність → не робимо. Інші три екрани відкривають
  діалог створення, чого Enter ніколи не робить.
- **НЕ оголошуємо «Ctrl+N — [дія]» при зміні активного екрана** (відкрите питання беклогу). YAGNI +
  ризик «галасливості» NVDA при частому перемиканні Alt+цифра. Дискаверабіліті лишається через F1.
  Озвучення назви дії при *відкритті* діалогу вже забезпечене `aria-label` діалогів.

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

**Чому re-entrancy безпечна:** поки діалог відкритий, `isInModal()` у глобальному обробнику глушить
`Ctrl+N`, тож подвійного відкриття немає. Скидання атома в `false` дозволяє повторне натискання після
закриття діалогу. Guard `if (showCreate)` у ефекті не дає переоткрити діалог при перерендері з інших
причин (напр. зміна `activeTab` у Wishlist).

## Зміни по файлах

### 1. Стори — нові атоми (поруч із наявними)

- `src/stores/profileManager.ts`: `export const $showCreateProfileDialog = atom<boolean>(false);`
- `src/stores/wishlist.ts`: `export const $showAddPatternDialog = atom<boolean>(false);`
- `src/stores/schedule.ts`: `export const $showAddScheduleDialog = atom<boolean>(false);`

### 2. `src/lib/shortcuts.ts` — реєстр

- Розширити `ShortcutActions`:
  `openCreateProfile`, `openAddWishlistPattern`, `openCreateSchedule` (усі `() => void`).
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
// new:wishlist  → when "wishlist" → a.openAddWishlistPattern(), label m.add_pattern
// new:schedule  → when "schedule" → a.openCreateSchedule(),    label m.schedule_add
```

`matchShortcut` повертає **перший** запис, чий `match` спрацював і чий `when` істинний. Записи
Ctrl+N стоять у порядку streams → profiles → wishlist → schedule; їхні `when` взаємовиключні за
`activeSection`, тож рівно один спрацює на кожному екрані.

### 3. `src/lib/reservedShortcuts.ts` — дедуплікація

Combo `Ctrl+N` уже зарезервований записом Streams, тож KeyRecorder уже захищений. Щоб зберегти
інваріант «кожен запис реєстру `reserved`» і не зламати точну перевірку
`reservedShortcuts.test.ts` (масив очікує **один** `Ctrl+N`), дедуплікувати
`RESERVED_WEBVIEW_COMBOS` за `combo`, лишаючи перше входження (зберігає порядок реєстру):

```ts
const seen = new Set<string>();
export const RESERVED_WEBVIEW_COMBOS = SHORTCUTS
  .filter((s) => s.reserved)
  .filter((s) => !seen.has(s.combo) && seen.add(s.combo))
  .map(({ combo, label }) => ({ combo, label }));
```

`findReservedConflict("Ctrl+N")` далі повертає мітку Streams (`m.add_stream`) — перше входження.

### 4. `src/hooks/useGlobalShortcuts.ts` — дроти

Імпортувати 3 нові атоми; додати 3 методи в об'єкт `actions`:
`openCreateProfile: () => $showCreateProfileDialog.set(true)` тощо.

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

- **`src/hooks/useGlobalShortcuts.test.tsx`** (розширити; виконує критерій беклогу):
  - reset нових атомів у `beforeEach`;
  - `Ctrl+N` на `profiles` → `$showCreateProfileDialog === true` і `$showAddStreamDialog === false`;
  - те саме для `wishlist` → `$showAddPatternDialog`, `schedule` → `$showAddScheduleDialog`;
  - наявний тест «не відкриває Add Stream поза streams» лишається.
- **Панельні bridge-тести** (файли є: `ProfilesPanel.test.tsx`, `WishlistPanel.test.tsx`,
  `SchedulePanel.test.tsx`): встановлення атома в `true` відкриває відповідний діалог
  (перевірка по `role="dialog"`/`aria-label`).
- **`src/lib/reservedShortcuts.test.ts`**: лишається зеленим без змін завдяки дедуплікації
  (масив очікує один `Ctrl+N`; `findReservedConflict("Ctrl+N")` → `m.add_stream`).

## Критерії готовності

- [ ] `Ctrl+N` на Profiles відкриває діалог «Створити профіль» (`ProfileNameDialog`, `type:"create"`).
- [ ] `Ctrl+N` на Wishlist відкриває `AddPatternDialog` для активної вкладки.
- [ ] `Ctrl+N` на Schedule відкриває `ScheduleForm` (нове планування).
- [ ] NVDA озвучує назву дії після відкриття (наявні `aria-label` діалогів).
- [ ] F1-довідка містить 3 нові записи в групі «context» із правильними i18n-мітками.
- [ ] `useGlobalShortcuts.test.tsx` розширено: `Ctrl+N` на 3 екранах виконує правильну дію і **не**
      відкриває Add Stream.
- [ ] Browser свідомо поза обсягом.
- [ ] Gate: `pnpm test` + `pnpm vite:build` зелені.

## Деталі / конвенції

- `e.code === "KeyN"`, не `e.key` — кирилична розкладка повертає `e.key === "н"` (accessibility.md §12).
- `ctrlOrMeta`: `(e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey`.
- `tsc` має ~51 наявних помилок (нетипізований paraglide) — це не gate; реальні gate — `pnpm test`
  і `pnpm vite:build`.
