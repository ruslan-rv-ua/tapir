# Спека: сортування списку потоків + перемикач у тулбарі

- **Дата:** 2026-06-14
- **Тип:** дизайн фічі (spec) — впорядкування списку потоків із перемикачем «За назвою / За часом додавання»
- **Статус:** затверджено, готово до writing-plans
- **Гілка:** `feat/streams-sort` (від `develop`)

## Мета

На екрані потоків додати **сортування списку** з перемикачем у тулбарі:

1. **«За назвою»** — алфавітно, локалізовано (дефолт).
2. **«За часом додавання»** — нові зверху.

Вибір **зберігається глобально на диск** (переживає перезапуск, спільний для всіх
профілів) і має дефолт `"name"`.

Проблема, яку вирішуємо: зараз список рендериться в insertion-order (нові внизу),
без сортування ні на бекенді, ні на фронті — у довгому списку важко знайти станцію
за назвою, особливо з екранним читачем (немає передбачуваного first-letter переходу).

## Контекст (поточний стан коду)

- Порядок зараз = insertion-order: бекенд
  [`get_streams`](../../../src-tauri/src/commands/stream_commands.rs) повертає
  `profile.streams.clone()` як є (`Vec<StreamInfo>`, нові `push`-аться в кінець);
  фронт лише `.map`/`.filter`, не сортує.
- Поля для сортування вже є в моделі: `StreamInfo.name`, `StreamInfo.added_at`
  (RFC3339) — [`profile.rs`](../../../src-tauri/src/profile.rs),
  [`tauri.ts`](../../../src/lib/tauri.ts). Міграція даних **не потрібна**.
- Фільтр-чіпи `all/recording/errors` —
  [`StreamsPanel.tsx`](../../../src/components/streams/StreamsPanel.tsx):
  `FILTER_CHIPS` (const), `$streamFilter` (**сесійний** atom у
  [`stores/streams.ts`](../../../src/stores/streams.ts), скидається на `"all"` при
  перезапуску), `filteredStreams` (useMemo), `filterAnnouncement` + `announce`
  (polite) при зміні чіпа. Чіпи — toggle-кнопки з `aria-pressed` у
  `role="group"`.
- Тулбар = зона `streams-toolbar` з roving-focus на **8 елементах** (індекси 0–7):
  `[addBtn, importBtn, exportBtn, recordAllBtn, stopAllBtn, chip0, chip1, chip2]`
  через `useRovingFocus(toolbarRefs, "horizontal", { mode: "mixed-boundary-handoff" })`.
- Персистентність налаштувань: `GlobalSettings` (Rust
  [`settings.rs`](../../../src-tauri/src/settings.rs), серіалізується на диск;
  поля з `#[serde(default = "...")]`), TS-тип у
  [`tauri.ts`](../../../src/lib/tauri.ts), стор `$settings`. Патерн запису (з
  `GeneralTab.tsx`): `$settings.set({ ...current, ...patch })` →
  `tauri.saveSettings(updated)`.
- `Intl` уже використовується в `StreamsPanel` (`Intl.PluralRules` з
  `settings?.language || document.documentElement.lang || "uk"`).
- Стрілки `Ctrl+Alt` зайняті гучністю — будь-яке клавіатурне керування
  сортуванням НЕ використовує стрілкові комбо
  (див. [keyboard-shortcuts.md](../../keyboard-shortcuts.md)). Перемикач керується
  лише roving-стрілками всередині тулбара + клік/Enter/Space, без нових глобальних
  комбо.

## Ключові архітектурні рішення

### Р1. Сортування — чистий display-concern на фронті

Сортуємо **на фронті**, над уже відфільтрованим списком; бекендний `Vec`
лишається канонічним insertion-order (важливо для експорту та семантики
`added_at`). У `StreamsPanel` після `filteredStreams` додаємо `sortedStreams`
(useMemo), його передаємо в `StreamList` як `streams`.

```ts
const sortedStreams = useMemo(() => {
  if (sortBy === "added") {
    // нові зверху: за added_at спадаюче (RFC3339 порівнюється лексикографічно,
    // але робимо явний компаратор за датою для надійності)
    return [...filteredStreams].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }
  const collator = new Intl.Collator(
    settings?.language || document.documentElement.lang || "uk",
    { numeric: true, sensitivity: "base" },
  );
  return [...filteredStreams].sort((a, b) => collator.compare(a.name, b.name));
}, [filteredStreams, sortBy, settings?.language]);
```

- `"name"`: `Intl.Collator(numeric, sensitivity:"base")` → локалізовано,
  регістронезалежно, «Радіо 2» < «Радіо 10».
- `"added"`: за `added_at` спадаюче → найсвіжіший зверху.

> **Note (RFC3339 + localeCompare):** усі `added_at` пишуться однаковим
> `chrono::Local::now().to_rfc3339()`, тож рядки одного формату й `localeCompare`
> дає коректний хронологічний порядок. Якщо колись з'являться різні офсети —
> перейти на `Date.parse`. Для спеки залишаємо `localeCompare` як простіше й
> достатнє.

### Р2. Стабільність порядку — ніколи не авто-реордер під фокусом

Переупорядкування трапляється **лише** за явною дією користувача (перемикач) або
перейменуванням потока — **ніколи** автоматично за зміною статусу
(recording/error). Це антипатерн для NVDA/клавіатури: рядок «їде» з-під фокусу.
Потребу «показати лише ті, що пишуться» закривають наявні filter-чіпи без
переупорядкування.

Перемикач живе в **тулбарі** (не в списку), тож у момент перемикання фокус не в
списку → жодного стрибка фокусу. Список просто перерендериться в новому порядку;
при наступному вході `CompositeList.restoreFocus` повертає на запам'ятаний `id`
або перший рядок.

### Р3. Персистентність — поле `sortBy` у `GlobalSettings`

`sortBy: "name" | "added"` додаємо в `GlobalSettings` (Rust + TS), дефолт
`"name"` через `#[serde(default = "default_sort_by")]` — старі конфіги без поля
десеріалізуються в `"name"` (back-compat). Запис — тим самим патерном, що
`doubleClickAction`: оновити `$settings` і викликати `tauri.saveSettings`.

### Р4. UI перемикача — сегмент із 2 toggle-кнопок (дзеркало filter-чіпів)

2 кнопки `aria-pressed` у `role="group" aria-label="Сортування"`, візуально як
наявні filter-чіпи, розміщені в **рядку 2 тулбара після filter-групи** через
вертикальний `divider`.

- Roving-focus: `toolbarRefs` 8 → **10** елементів; нові індекси **8** («За
  назвою»), **9** («За часом додавання»). Стрілки циклять як зараз.
- При зміні — `announce(..., "polite")` (як filter-чіпи), напр. «Сортування: за
  назвою».
- **Без** окремого пункту в `GeneralTab` — керування лише через тулбар (поле в
  settings — це тільки сховище). YAGNI.
- Радіо-семантика toggle-кнопок: активний — `aria-pressed=true`, дзеркалить, як
  поданий `aria-pressed` на filter-чіпах (узгодженість важливіша за «ідеальний»
  radiogroup-патерн, який тут не вводимо).

## Зміни по файлах

### `src-tauri/src/settings.rs`

- Додати поле в `GlobalSettings`:
  ```rust
  #[serde(default = "default_sort_by")]
  pub sort_by: String, // "name" | "added"
  ```
  (рядок, як `theme`/`language` подані; enum не вводимо заради простоти й
  узгодженості з рештою рядкових полів — валідні значення гарантує фронт.)
- Додати `fn default_sort_by() -> String { "name".into() }`.
- Оновити дефолтну ініціалізацію `GlobalSettings` (Default/конструктор), якщо
  така є.

### `src/lib/tauri.ts`

- Додати в інтерфейс `GlobalSettings`: `sortBy: "name" | "added";`.

### `src/stores/streams.ts`

- Додати тип `export type StreamSort = "name" | "added";` (для UI-типізації;
  джерело правди — `settings.sortBy`).

### `src/components/streams/StreamsPanel.tsx`

- Прочитати `sortBy = settings?.sortBy ?? "name"`.
- Додати `sortedStreams` (useMemo, Р1); передати його в `StreamList` замість
  `filteredStreams`.
- `SORT_OPTIONS` const (дзеркало `FILTER_CHIPS`):
  `[{ id: "name", labelFn }, { id: "added", labelFn }]`.
- Розширити `toolbarRefs` до 10 (додати `sort0Ref`, `sort1Ref`); оновити коментар
  «(8 items)» → «(10 items)».
- Хендлер `handleSortChange(id)`: ігнорувати якщо вже активне; інакше
  `$settings.set({ ...current, sortBy: id })` + `tauri.saveSettings(updated)`
  (з `.catch(addToast)`) + `announce(sortAnnouncement(id), "polite")`.
- Рендер сегмента сортування в рядку 2 після filter-групи (divider +
  `role="group"`), `tabIndex={toolbarTabIndex(8|9)}`, `aria-pressed`,
  `aria-label`, `onClick`.

### i18n (paraglide)

Додати повідомлення (регенерувати через **vite-плагін**, не редагувати
згенероване вручну):
- `streams_sort_group` — «Сортування» (aria-label групи).
- `streams_sort_by_name` — «За назвою».
- `streams_sort_by_added` — «За часом додавання».
- `streams_sort_changed` — announce при зміні, параметр `{label}`, напр.
  «Сортування: {label}».

### `docs/data-models.md`

- Додати `sortBy: "name" | "added"` у блоки `GlobalSettings` (TS + Rust + приклад
  JSON), з коротким коментарем.

## Поза обсягом (YAGNI)

- **Не** додаємо напрям asc/desc як окремий контрол — кожен режим має фіксований
  природний напрям (name A→Z, added нові зверху).
- **Не** додаємо сортування за статусом/бітрейтом/тривалістю — статус-впорядкування
  суперечить Р2; решта — спекулятивно.
- **Не** робимо ручне перетягування/move-up-down рядків.
- **Не** дублюємо контрол у `GeneralTab`.
- **Не** сортуємо на бекенді й **не** чіпаємо `get_streams` — порядок лишається
  display-concern.

## Критерії приймання

1. Дефолт після першого запуску (конфіг без `sortBy`) — **«За назвою»**, список
   відсортований алфавітно.
2. Перемикач у тулбарі має 2 toggle-кнопки; активна має `aria-pressed=true`;
   доступні стрілками в roving-focus (індекси 8–9) і не ламають межовий handoff.
3. «За назвою»: локалізовано й numeric — «Радіо 2» перед «Радіо 10», регістр не
   впливає.
4. «За часом додавання»: найсвіжіший (`added_at`) — перший.
5. Зміна перемикача → новий порядок + polite-оголошення + запис у
   `GlobalSettings` на диск; вибір переживає перезапуск.
6. Сортування застосовується **поверх** активного фільтра (filter, потім sort);
   зміна статусу потока сама по собі **не** переупорядковує список.
7. `pnpm test` і `pnpm vite:build` — зелені.

## План тестів (гейти: `pnpm test` + `pnpm vite:build`, НЕ `tsc`)

- **`StreamsPanel.test.tsx`:**
  - дефолт `sortBy="name"` → рядки в алфавітному порядку;
  - numeric-collation: «Радіо 2» рендериться перед «Радіо 10»;
  - регістронезалежність (наприклад «alpha» і «Beta» у правильному порядку);
  - `sortBy="added"` → порядок за `addedAt` спадаюче;
  - клік по неактивній sort-кнопці → `tauri.saveSettings` викликано з новим
    `sortBy`, `$settings` оновлено, announce викликано; клік по активній — no-op;
  - `aria-pressed` відображає активний режим;
  - сортування застосовується поверх активного фільтра (recording/errors);
  - roving-focus: стрілки доходять до індексів 8–9 (sort-кнопки фокусуються).
- **Rust (`settings.rs`):**
  - `default_sort_by() == "name"`;
  - десеріалізація JSON `GlobalSettings` без поля `sortBy` → `"name"`;
  - round-trip серіалізації зі `sort_by: "added"`.
- **Тестові фікстури:** додати `sortBy: "name"` у всі `baseSettings`-моки
  (`StreamList.test.tsx`, `PlayerPanel.test.tsx`, `transportControl.test.ts`,
  `AudioTab.test.tsx`, `HotkeysTab.test.tsx`, та інші, що будують `GlobalSettings`).
