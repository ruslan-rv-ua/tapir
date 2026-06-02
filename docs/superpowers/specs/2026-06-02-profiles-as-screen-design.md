# Спека: менеджер профілів як екран

- **Статус:** Узгоджено (готово до плану)
- **Дата:** 2026-06-02
- **Гілка:** `feature/profiles-as-screen` (від `feature/pahse-3F-profiles`)
- **Базується на:** [ADR 2026-06-02 «Менеджер профілів — екран замість діалогу»](../../decisions/2026-06-02-profiles-as-screen.md)

## 0. Призначення

Перевести менеджер профілів із модального діалогу `ProfileManager` у повноцінний
**екран** (`ProfilesPanel`), вбудований у зональну навігацію поряд зі
Streams/Browser/Wishlist/Songs. Архітектурні рішення зафіксовані в ADR (P1–P6) і
тут не переглядаються — спека деталізує реалізацію та закриває відкриті питання §6
ADR.

### Закриті відкриті питання (з §6 ADR)

| # | Питання | Рішення |
|---|---------|---------|
| 1 | Іконка секції | **Lucide `Layers`** — без змін |
| 2 | Локальний пошук/фільтр у списку | **Ні** — список малий (відповідає політиці DA3) |
| 3 | Клавіатурний шорткат на екран профілів | **Ні** (поки що); доступ через головне меню |
| 4 | Розкладка екрана | **Варіант A:** тулбар + список + панель дій (3 зони) |

## 1. Структура компонентів

### Нові

- **`src/components/profile/ProfilesPanel.tsx`** — екран. Контракт пропсів
  `{ onZonesChange: (zones: ZoneEntry[]) => void; exitZone: (fromId: string, forward: boolean) => void }`
  за зразком [StreamsPanel](../../../src/components/streams/StreamsPanel.tsx). Тримає
  всю CRUD-логіку, перенесену з `ProfileManager`: `handleSwitch`/`doSwitch`,
  `handleCreate`, `handleRename`, `handleDuplicate`, `handleDelete`, `handleExport`,
  `handleImport`/`handleCommitImport`, стан під-діалогів (`subDialog`), `busy`,
  `nameInput`/`nameError`, оголошення через `useAnnounce`. Реєструє 3 зони через
  `onZonesChange`.

- **`src/components/profile/ProfileNameDialog.tsx`** — винесений із модалки діалог
  вводу імені (create / rename / duplicate / import). Пропси:
  `{ titleKey, value, onChange, error, busy, onConfirm, onCancel }`. Рендериться
  через `createPortal` у `document.body`, `role="dialog"`/`alertdialog`, `z-50`.

### Перевикористані (мінімальні правки)

- **`src/components/profile/ProfileList.tsx`** — без зміни внутрішньої розмітки.
  `ProfilesPanel` обгортає його у `ZoneEntry` з `id="profiles-list"`; `focusSelected`
  лишається. ListBox сам обробляє стрілки; вихід Tab на межі → `exitZone`.
- **`src/components/profile/ProfileActions.tsx`** — стає зоною. Кнопки отримують
  `tabIndex` від `useRovingFocus`; контейнер — `data-zone-id="profiles-actions"`,
  `role="application"` (як `streams-toolbar`), `onKeyDown` від хука. Каптіони груп
  (`GroupCaption`) лишаються `aria-hidden`.

### Видалені

- **`src/components/profile/ProfileManager.tsx`** — видаляється (логіка переїхала
  у `ProfilesPanel`, під-діалоги — у `ProfileNameDialog` + `ConfirmDialog`).
- Стор **`$profileManagerOpen`** у `src/stores/profileManager.ts` — видаляється;
  `$profileList` лишається.

## 2. Зональна модель (розкладка A)

Три зони на екрані; Tab/Shift+Tab на межах і F6/Shift+F6 циклять між ними через
`exitZone`, як у Streams. Візуально: тулбар зверху, нижче — дві колонки
(список ліворуч, панель дій праворуч для вибраного профілю).

| Зона | `data-zone-id` | Вміст | Навігація |
|---|---|---|---|
| Тулбар | `profiles-toolbar` | Команди (палітра), Створити, Імпортувати | `useRovingFocus(refs, "horizontal", { mode: "mixed-boundary-handoff", onTabBoundary })` |
| Список | `profiles-list` | `ProfileList` (ListBox) | Стрілки — react-aria; Tab на межі → `exitZone("profiles-list", …)` |
| Дії | `profiles-actions` | `ProfileActions` (Switch + group Профіль + group Файл) | `useRovingFocus(refs, "vertical", { mode: "mixed-boundary-handoff", onTabBoundary })` |

Порядок зон у масиві `onZonesChange`: `[toolbar, list, actions]`.

**`aria-label` зон:** додати i18n-ключі `zone_profiles_toolbar`, `zone_profiles_actions`
(за зразком `zone_streams_*`). Список уже має `profile_list_label`.

**Заголовок екрана:** `role="region"` з `aria-label={m.profile_name()}` на корені
панелі (як `aria-label={m.streams_section()}` у StreamsPanel); візуальний `<h1>` у
тулбарі з текстом `m.profile_name()`.

### Перенесення `ProfileList` у зону

`ProfilesPanel` тримає `listRef` (`ProfileListHandle`) і будує `ZoneEntry`:

```
const listZone: ZoneEntry = {
  id: "profiles-list",
  get el() { return listWrapperRef.current!; },
  focus: () => listRef.current?.focusSelected(),
};
```

Tab-вихід зі списку: ListBox react-aria не передає Tab у `exitZone` автоматично.
Обгортковий `<div data-zone-id="profiles-list">` отримує `onKeyDown`, що на `Tab`
без модифікаторів (фокус усередині ListBox) викликає
`exitZone("profiles-list", !e.shiftKey)` і `preventDefault`/`stopPropagation`
(ListBox — єдиний таб-стоп зони, тож будь-який Tab = вихід; патерн `composite-exit`).

## 3. Під-операції (P5 — однорівневі діалоги)

Тип стану лишається як у модалці:

```
type SubDialog =
  | null
  | { type: "create" } | { type: "rename" } | { type: "duplicate" }
  | { type: "delete" } | { type: "switch-confirm" }
  | { type: "import"; preview: ImportPreview };
```

- **create / rename / duplicate / import** → `ProfileNameDialog` (ввід імені,
  валідація `nameError`, кнопки Скасувати / OK).
- **delete**, **switch-confirm** → `ConfirmDialog`
  ([common/ConfirmDialog](../../../src/components/common/ConfirmDialog.tsx)),
  повідомлення з `profile_delete_confirm` / `profile_switch_confirm`.

Усі — один рівень, `createPortal` у `body`, `z-50`, **не вкладені** один в одного
(ручне `z-40/z-50` стекування модалки-над-модалкою прибрано). `isInModal()` у
[useZoneNavigation](../../../src/hooks/useZoneNavigation.ts) уже глушить F6/Tab,
поки відкритий будь-який діалог.

## 4. ActivityBar (P2, P3, P4)

Файл [components/layout/ActivityBar.tsx](../../../src/components/layout/ActivityBar.tsx).

### Розкладка
```
┌ Профіль / <активний профіль>   ← нагорі, aria-pressed коли активний (P2, P4)
├──────────────────────────────  ← divider, role="separator" (P2)
│  Потоки / Браузер / … / Пісні   ← група секцій
│                    (mt-auto)
└─ Налаштування                   ← футер, лишається діалогом (P6)
```

### Зміни
- Кнопку профілю **підняти нагору** (перший дочірній елемент `<nav>`), під нею
  `<div role="separator">` (візуальний `border-b`/лінія).
- Порядок refs для `useRovingFocus(refs, "both", { mode: "composite-exit", onTabOut })`:
  `[profileRef, ref0…ref4 (секції), settingsRef]` — профіль індекс 0, секції 1–5,
  Settings 6.
- Профіль: `onPress → $activeSection.set("profiles")`; `aria-pressed={activeSection === "profiles"}`;
  зберегти дворядковий header «Профіль / `<назва>`» (P4) і
  `aria-label={`${m.profile_name()} — ${settings?.activeProfile ?? "Default"}`}`.
- Прибрати імпорт і використання `$profileManagerOpen`.

### Launch-фокус (P3)
`ZoneEntry.focus` ActivityBar має фокусувати кнопку **активної секції**, а не
індекс 0. Реалізація: обчислити `activeNavIndex` (профіль=0; інакше
`SECTIONS.findIndex(active) + 1`) і у `focus(dir)` викликати `moveTo(activeNavIndex)`
(хук [useRovingFocus](../../../src/hooks/useRovingFocus.ts) уже фокусує елемент через
`pendingFocusRef` у `useLayoutEffect`). Той самий якір застосовується і для входу
по F6 — активна секція як передбачуваний орієнтир.

`App.tsx` далі викликає `activityBarZoneRef.current?.focus("forward")` у `.finally()`
після завантаження даних — поведінка тепер дає фокус на активній секції.

## 5. App.tsx та навігація

Файл [App.tsx](../../../src/App.tsx), [stores/navigation.ts](../../../src/stores/navigation.ts).

1. `Section` += `"profiles"`:
   `type Section = "streams" | "browser" | "wishlist" | "schedule" | "songs" | "profiles";`
2. У `<main>` додати:
   `{activeSection === "profiles" && <ProfilesPanel onZonesChange={onZonesChange} exitZone={exitZone} />}`
3. Прибрати `<ProfileManager />` з дерева `App` (рядок import + JSX).
4. Ефект «при зміні `activeSection` фокусувати першу зону екрана»
   ([App.tsx:84-95](../../../src/App.tsx#L84-L95)) працює без змін — перехід на
   профілі дасть фокус у `profiles-toolbar`.

## 6. Фокус після дій (спрощення хаків з §4.6 ADR)

Прибрати `refocusList`-прапорець із подвійним рендером
([ProfileManager.tsx:38,51-56](../../../src/components/profile/ProfileManager.tsx#L51-L56)).
Натомість після `await` у `doSwitch`/`handleDelete` (коли кнопка-тригер стає
disabled) повертати фокус у список одним викликом:

```
requestAnimationFrame(() => listRef.current?.focusSelected());
```

rAF гарантує, що фокус ставиться після коміту disabled-стану. State-машина не
потрібна — екран не має race із закриттям модалки.

## 7. Тести

- **`ProfileManager.test.tsx`** → перейменувати/переписати на
  **`ProfilesPanel.test.tsx`:** рендер 3 зон і реєстрація через `onZonesChange`;
  roving-focus у тулбарі й панелі дій; Tab-вихід зі списку → `exitZone`;
  відкриття/закриття під-діалогів (create/rename/duplicate/delete/switch/import);
  refocus у список після switch/delete; `switch-confirm` за наявності активних
  записів.
- **`ProfileList.test.tsx`**, **`ProfileActions.test.tsx`** — лишаються; правки під
  нову обгортку-зону (де потрібно `tabIndex`/`onKeyDown`).
- **`ActivityBar.test.tsx`** — новий порядок кнопок (профіль угорі), наявність
  divider (`role="separator"`), `aria-pressed` на кнопці профілю при
  `activeSection === "profiles"`, `onPress` перемикає секцію (а не відкриває стор),
  launch-фокус на кнопці активної секції.

## 8. i18n

Файли [src/i18n/messages/en.json](../../../src/i18n/messages/en.json),
[uk.json](../../../src/i18n/messages/uk.json).

- Усі ключі профілів уже існують (`profile_*`).
- Назва секції в меню та `<h1>` екрана — `m.profile_name()` («Профіль»).
- **Додати** ключі `zone_profiles_toolbar`, `zone_profiles_actions` (uk + en) для
  `aria-label` нових зон.
- Ключ `profile_manager_open` («Управління профілями») лишається для `aria-label`
  кнопки профілю (контекст «що це за кнопка»).

## 9. Поза scope

- Settings лишається діалогом (P6).
- Інлайн-форми замість діалогів для під-операцій (відкинуто в ADR §5).
- Клавіатурний шорткат, пошук у списку (закриті як «ні» вище).

## 10. Порядок реалізації (для плану)

1. `navigation.ts`: `Section` += `"profiles"`; i18n-ключі зон.
2. `ProfileNameDialog.tsx` (винести з модалки).
3. `ProfilesPanel.tsx`: перенести логіку, 3 зони, під-діалоги, refocus через rAF.
4. `ProfileActions.tsx`: зробити зоною (roving vertical).
5. `App.tsx`: рендер `ProfilesPanel`, прибрати `<ProfileManager />`.
6. `ActivityBar.tsx`: профіль нагору + divider + `aria-pressed` + `$activeSection`;
   launch-фокус на активній секції; прибрати `$profileManagerOpen`.
7. Видалити `ProfileManager.tsx` і `$profileManagerOpen`.
8. Тести: `ProfilesPanel.test.tsx`, оновити `ActivityBar.test.tsx`,
   `ProfileList`/`ProfileActions` тести.
