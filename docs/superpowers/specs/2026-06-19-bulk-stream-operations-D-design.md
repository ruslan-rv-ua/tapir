# Спека: масові операції — віха D (розкочування виділення на решту списків)

- **Дата:** 2026-06-19
- **Тип:** дизайн фічі (spec) — четверта (остання) віха парасолькового запису
- **Статус:** затверджено, готово до writing-plans
- **Парасолька (north-star):** [docs/backlog/p1-bulk-stream-operations.md](../../backlog/p1-bulk-stream-operations.md)
  — усі дизайн-рішення (1–18) живуть там; ця спека на них **посилається**, а не дублює.
- **Спирається на:** [A-design](2026-06-14-bulk-stream-operations-A-design.md) (спільний API
  виділення в `useCompositeList`/`CompositeList`), [B-design](2026-06-18-bulk-stream-operations-B-design.md)
  (перенос-у-профіль, skip-семантика), [C-design](2026-06-19-bulk-stream-operations-C-design.md)
  (динамічні назви, запис/зупинка виділених).
- **Пов'язані документи:** [accessibility.md](../../accessibility.md) (§3 виділення, §1.4 LiveAnnouncer),
  [keyboard-shortcuts.md](../../keyboard-shortcuts.md) (Tier 2′).

## Мета

Закрити обсяг **віхи D** (розділ «Віхи» парасольки): увімкнути доведену на streams (A–C)
модель виділення у **решті п'яти композитних списків** — songs, profiles, browser, schedule
і `PatternList` (спільний компонент вкладок wishlist/ignorelist) — і дати кожному **релевантну
масову дію**. Механіка виділення (клавіатура, миша, ARIA/NVDA, anchor, announce-payload) уже
живе в `useCompositeList`; D її **перевикористовує**, не переписує.

**Рішення, ухвалені на брейнштормі D (2026-06-19):**

- **Набір дій:** видалення для songs / profiles (крім активного) / schedule / patterns;
  для browser — **додавання виділених** у активний профіль (його природна масова дія).
- **UI:** повний кластер скрізь (рішення №2, №6) — «Виділити все/Зняти» + дія-кнопка + лічильник.
  Списки без тулбара (songs, browser) отримують **нову roving-зону в шапці**; profiles / schedule /
  wishlist дістають кластер у **наявному** тулбарі.
- **Активний профіль:** **виділяється, але пропускається** при видаленні (дзеркало skip-семантики
  №5) — БЕЗ змін у `useCompositeList` (жодного per-row «selectable»-предиката).
- **Спільна інфраструктура (Approach B):** ідентичну glue виносимо в спільні модулі (нижче, D1),
  per-list лишається лише те, що **справді** різниться (бекенд-виклик, мутація даних, getter імені,
  рендер рядка) — консистентність для NVDA важливіша за менший обсяг (рішення №1), і це уникає
  5 копій тонкої focus/announce/prune-логіки.

## Контекст (поточний стан коду, звірено 2026-06-19)

- **Усі п'ять списків уже рендеряться через `CompositeList`** (`SongsList`, `ProfileList`,
  `StationList`, `ScheduleTable`, `PatternList`) — тож D **не** торкається roving-механіки.
  Жоден ще не передає `selection`/`onSelectionChange`, тож поводиться як до A.
- **`CompositeRow` уже підтримує проп `selected`** (`data-selected` + підсвітка, forced-colors) —
  з віхи A. Per-row робота зводиться до суфікса в accessible name + прокидання `selected`.
- **`useCompositeList` (A):** `selection?: CompositeSelection` + `onSelectionChange?` — opt-in.
  `Ctrl+Space`/`Shift+↑↓`/`Ctrl+A`/`Escape`/миша/anchor — усе вже всередині; `Delete` маршрутизує
  через `onAction('delete', …)`. Без `selection` хук поводиться 1:1 як раніше.
- **Сховище — лише streams:** `$streamSelection` + `replaceSelection`/`pruneSelection` у
  `stores/streams.ts`. A-спека прямо відклала «узагальнення на 6 списків» на D.
- **Еталон споживача — `StreamList`/`StreamsPanel`:** adapter, `handleSelectionChange`→announce,
  prune-ефект, `handleConfirmBulkDelete` (ціль/виживші ДО await; програмний фокус через
  `pendingBulkFocusRef`+`useLayoutEffect`; підсумок), `requestBulkDelete()` на хендлі, кластер у
  тулбарі (roving, `aria-disabled`), section-scoped lifecycle.
- **Бекенд-еталон:** `remove_streams`/`transfer_streams_to_profile` (один save, чесний count,
  pure-функція `retain_streams`, юніт-тести без Tauri-стану) + тонкі обгортки в `lib/tauri.ts`.
- **Списки, що мають ⋯-меню:** songs (`SongContextMenu`), profiles (`ProfileContextMenu`),
  schedule (`ScheduleContextMenu`). `PatternList` — **без** ⋯, має inline ✎/✕. `StationList` —
  без ⋯, має Add + preview (видалення немає).
- **Single-команди бекенду (є):** `delete_song` (recycle-bin, емітить `song-deleted`),
  `delete_profile` (відхиляє активний: `RadioError::Forbidden`), `delete_schedule` (retain+save+
  `notify_schedule_deleted`), `remove_from_wishlist`/`remove_from_ignorelist` (retain+save),
  `add_station_from_browser` (через `append_streams_to_active_profile`, що **вже дедупить** url).
  **Масових варіантів немає** — їх додає D.

## Ключові архітектурні рішення

### D1. Спільна інфраструктура — виносимо ідентичну glue (Approach B)

Per-list повторюється 8 шматків: ① atom + replace/prune, ② adapter, ③ `onSelectionChange`→announce,
④ prune-ефект, ⑤ bulk-оркестрація (знімок видимого → бекенд → мутація стора → `replace(∅)` →
announce → програмний фокус над **реально видаленими**, D8), ⑥ тулбар-кластер, ⑦ per-Item суфікс,
⑧ Explorer-маршрутизація.
Ідентичні **②③④** і частину **⑤/⑥** виносимо; решта лишається per-list (справді різниться).

Нові спільні модулі:

- **`src/stores/selection.ts`** — generic `replaceSelection($sel, next)` / `pruneSelection($sel,
  existingIds)` (atom передається параметром; семантика 1:1 з нинішніми streams-функціями: новий
  `Set` identity на replace; no-op prune, коли нічого не змінилось). Кожен список оголошує **власний**
  `atom<Set<string>>`. `stores/streams.ts` мігрує: `$streamSelection` лишається, а його
  `replaceSelection`/`pruneSelection` стають тонкими обгортками над generic (або call-site'и
  переходять на 2-арг форму) — поведінка незмінна, покрита наявними A-тестами.
- **`src/hooks/useListSelection.ts`** — споживацький хук. Вхід: `{ $selection, announce,
  resolveName, allItems }` (`allItems` — **повний** список зі стора, не видимий/відфільтрований).
  Повертає `{ selectionAdapter, onSelectionChange }` і **сам ганяє prune-ефект** на зміну `allItems`
  (ключ — **ідентичність масиву стора**, стабільна між апдейтами; ids похідні всередині — НЕ свіжий
  `Set` щоrender). Складає **②③④** — байт-в-байт однакові сьогодні в `StreamList`. `onSelectionChange`
  повторює A6/A5: pointer-single → пропуск (фокус уже на рядку); key-single → `resolveName(lastId)`
  над **видимим** списком (фокус завжди на відрендереному рядку) → `item_selected`/
  `item_deselected({name})`; group → `selection_count`/`selection_cleared`.
- **`src/lib/bulkFocus.ts`** — pure `computeBulkFocusTarget(visibleItems, removedIds): string | null`
  → id першого вцілілого на/після верхнього **видаленого** індексу (правило A8; `null` = усе видиме
  видалено → `onEmpty`). `removedIds` — **реально видалені**, не сире виділення (див. D8: skip), і
  **непорожні**: повний-skip-no-op (`removedIds.length === 0`) ловить **виклик** ДО цієї функції (D8),
  бо тут `findIndex === -1` дав би fallback на перший рядок — хибний focus-jump після no-op. Мутація
  даних і бекенд-виклик лишаються per-list (різні); спільна **лише** ця індексна арифметика +
  focus-ефект-патерн (документуємо як шаблон, не як god-хук).
- **`src/components/common/SelectionToolbar.tsx`** — кластер для списків з **однією** масовою дією:
  кнопка «Виділити все/Зняти» (toggle, дзеркало Ctrl+A, `aria-disabled` коли немає видимих) +
  **одна** дія-кнопка (`aria-disabled` коли count=0; видимий текст = accessible name, WCAG 2.5.3) +
  не-live `[N вибрано]` span. Це **два** окремі roving-стопи: пропси беруть `ref` + **опційний**
  `tabIndex` **на кожну** кнопку (roving-панелі передають керований `tabIndex`; focus-boundary-зона
  wishlist `tabIndex` **не** передає → звичайний tab-order), плюс `selCount`/`visibleCount`/labels/
  `onSelectAll`/`onAction`. **Streams не чіпаємо** — у нього 3 дії через наявний `SelectionActionsMenu`;
  нові списки мають 1 дію, тож кнопка доречніша за меню (і це не регресія A–C).

> **Чому B, а не «копіювати форму».** A-спека прямо відклала узагальнення на D. 5 копій
> focus/announce/prune-дансу дрейфують, а для незрячого **розбіжність між екранами — найдорожчий
> провал** (рішення №1). B виносить лише **справді ідентичне**; god-компонент (`<MultiSelectList>`)
> відкинуто — списки надто різні (items/segments/render/actions).

### D2. Сховище — generic helpers + per-list atoms; patterns ділять один atom

Нові atom'и: `$songsSelection` (stores/songs), `$profilesSelection` (stores/profileManager),
`$scheduleSelection` (stores/schedule), `$patternSelection` (stores/wishlist), `$stationSelection`
(stores/browser). Кожен — `atom<Set<string>>`, читається через `useStore` у списку, рядку й тулбарі.

**Patterns ділять один `$patternSelection`:** react-aria `Tabs` монтує лише активний `TabPanel`,
тож одночасно живий тільки один `PatternList`; перемикання вкладки **очищає** виділення (як зміна
фільтра, рішення №4) — тож спільний atom не плутає wishlist/ignorelist. Ключ виділення — `pattern`
(рядок-патерн, як і `item.id`).

### D3. ARIA/NVDA — як у streams (рішення №9), per-Item суфікс

Кожен Item-компонент дістає проп `isSelected`; до accessible name додається `, ${selection_suffix}`
(«виділено»), і `selected={isSelected}` прокидається в `CompositeRow` (підсвітка вже є). Точки:

- `SongItem` — суфікс на `summaryLabel`.
- `ProfileItem` — суфікс на summary; **активний профіль теж може мати суфікс** (виділяється).
- `StationItem` — суфікс на summary (новий проп).
- `ScheduleItem` — суфікс на summary.
- `PatternList` (рендерить `CompositeRow` напряму) — суфікс на `label`, `selected` на рядку.

Озвучення — лише через центральний `announce` (хук-жести через `onSelectionChange`→`useListSelection`;
тулбар-кнопки «Виділити все/Зняти» кличуть `announce` **самі**, A7). `[N вибрано]` — НЕ live.

### D4. Explorer-маршрутизація per-list (рішення №15, №16)

- **songs / profiles / schedule (мають ⋯):** `Delete`-клавіша → bulk, коли виділення непорожнє;
  інакше **одинично** активний рядок. ⋯-«Видалити» на **виділеному** рядку → bulk; на
  **невиділеному** → спершу `replace({id})`, потім одинично. Пункт ⋯ несе кількість у accessible
  name на виділеному рядку («Видалити виділені (N)»); суто-одиничні пункти (Перейменувати, Теги,
  Слухати, Дублювати, Експорт, Перемкнути, Редагувати, Toggle) лишаються в однині й діють на
  **відкритий** рядок (№16).
  - ⚠ **Геп songs:** `SongsList.onAction` **сьогодні не має** гілки `delete` (Delete-клавіша
    нічого не робить; одиничне видалення лише через ⋯). profiles / schedule / patterns уже мають
    `delete`→одинично. Тож D **додає** songs гілку `delete`: непорожнє виділення → bulk, інакше →
    одиничний `ConfirmDialog` активного рядка (як у решти) — консистентно для NVDA.
- **patterns (без ⋯, inline ✕):** `Delete`-клавіша → bulk при непорожньому виділенні; кнопка **✕**
  на виділеному рядку → bulk, на невиділеному → `replace({id})` + одинично. ✎ (edit) — завжди одинично.
- **browser (без видалення):** `Delete` не застосовна (масова дія — **додавання**). Простий клік
  згортає виділення (дефолт хука); Enter / кнопка Add лишаються **одиничним** додаванням відкритого
  рядка; масове додавання — **лише** через тулбар-кнопку «Додати виділені (N)» (немає природної
  клавіші «додати», тож і Explorer-Delete-баласту немає).

### D5. Lifecycle — section-scoped, per-list тригери очищення (рішення №13, №4)

Спільне правило: виділення живе в межах секції; сорт і Tab/F6 **зберігають**; **очищають** —
зміна фільтра, перемикання профілю, вихід із секції, Escape, та зникнення id (auto-prune через
`useListSelection`). Per-list тригери:

- **songs:** очищають зміна `$songsQuery`/`$songsStation` (фільтр, №4); сорт `$songsSort` — зберігає;
  unmount панелі. `select-all` діє на `$filteredSongs` (видимі); prune — на `$songs` (повні).
- **profiles:** очищає лише unmount (+ auto-prune після видалення). Фільтра немає, а **перемикання
  активного профілю НЕ змінює членство списку профілів** (усі профілі лишаються) — тож виділення
  лишається валідним, очищати на switch **не** треба (на відміну від streams, де switch міняє набір
  потоків). prune — на `$profileList`.
- **schedule:** очищає unmount; фільтра/профіль-перемикання в межах секції немає. prune — на `$schedules`.
- **patterns:** очищають **перемикання вкладки** (№4-аналог) і unmount. prune — на активний список
  (`$wishlist` або `$ignorelist`).
- **browser:** очищають **точки входу нового пошуку** (`updateSearchParam`/`resetSearch` — offset=0,
  тобто заміна результатів) і **зміна режиму** popular↔search; unmount. **`load-more` (offset>0,
  дописування) — НЕ очищає** (пагінація зберігає виділення). Тож тригер вішаємо на дії-нового-пошуку,
  а не на кожну зміну `$searchResults` (та фіриться й на load-more). prune/select-all — на видимі
  `stations`.

### D6. Бекенд — масові команди (патерн `remove_streams`: один save, чесний count)

Нові Rust-команди (+ реєстрація в `lib.rs`, + pure-хелпер з юніт-тестом де доречно, + обгортка
в `lib/tauri.ts`):

- **`delete_songs(paths) -> BulkDeleteSongs { deleted: Vec<String>, skipped: Vec<String> }`** —
  по кожному шляху recycle-bin; файл, що зараз грає, **пропускає в `skipped`** (на відміну від
  одиничного `delete_song`, який повертає помилку — для bulk це частковий успіх, не провал).
  **НЕ емітить per-file `song-deleted`** (інакше N озвучень панеллю): повертає списки, фронт оновлює
  `$songs` один раз і дає **один** підсумок. (Одиничне видалення лишається на наявному `song-deleted`.)
- **`delete_profiles(names) -> BulkDeleteProfiles { deleted: Vec<String>, skipped_active: bool }`** —
  по кожному `Profile::delete`, **пропускає активний** (звіряє з `state.active_profile`). Один прохід.
  `deleted` — **імена реально видалених** профілів (дзеркало `delete_songs.deleted`; назва профілю = row id),
  тож D8 бере `removedIds = result.deleted` напряму, а count для announce = `deleted.len()`; `skipped_active`
  — чи був серед виділених активний (хвіст підсумку). Повертаємо список, а не `u32`, бо `computeBulkFocusTarget`
  працює по видимому **порядку рядків** (id), а не по count.
- **`delete_schedules(ids) -> u32`** — один `retain` + один `save` + `notify_schedule_deleted` по
  кожному видаленому id (зупинка in-progress, §3.5). Pure `retain_schedules(&mut profile, &ids)`.
- **`remove_from_wishlist_bulk(patterns) -> u32`** і **`remove_from_ignorelist_bulk(patterns) -> u32`** —
  один `retain` + один `save` на список.
- **`add_stations_from_browser(stations) -> Vec<StreamInfo>`** — через наявний
  `append_streams_to_active_profile`, який **сам** робить один save **і емітить `streams-changed`**
  (App перезавантажує `$streams`), і вже дедупить **по `url`**. Повернені = реально додані; пропущені =
  `stations.len() − added.len()`. **⚠ Причина skip — НЕ лише «вже у профілі».** `dedup_new_streams`
  одним `HashSet` відкидає url, що (а) вже в профілі **або** (б) повторюється **всередині самого
  виділення** — а виділення ідентифікується по `stationuuid`, тож два різні результати можуть вести на
  один `url` (один додасться, інший впаде в skip як дубль-у-виділенні, **не** будучи в профілі до операції).
  Тож копі skip — **нейтральне «дублікати»**, не «вже у профілі» (інакше summary/тести брешуть про
  семантику). **Фронт `$streams` НЕ чіпає** (як одиничний `add_station_from_browser` — оновлення йде
  через подію; коли `added` порожній, бекенд save/emit **пропускає** — це коректно, бо чіпати нема що);
  bulk-хендлер лише дає підсумок-announce «Додано N, пропущено M (дублікати)».

### D7. Тулбар-кластери per-list (рішення №2, №6, №8 для browser-add — окрема дія-кнопка)

- **songs, browser — нова roving-зона в шапці.** `ScreenHeader` дістає `children` (кластер) і
  обгортається в `ScreenZone role="application"` з `useRovingFocus` над **двома** стопами
  (select-all, дія) — патерн `ProfilesPanel`: `songs-selection` / `browser-selection`. Кластер =
  `SelectionToolbar` (передаємо обидва refs + `toolbarTabIndex(0/1)`). Дія: songs → «Видалити
  виділені (N)»; browser → «Додати виділені (N)». **Реєстрація зон** (`onZonesChange`) — у видимому
  порядку: `[selection, filter|search, list]` (нова зона **перед** наявними). **`BrowserPanel`
  зараз не має `useAnnounce`** — додати (select-all кличе `announce` сам, A7).
- **profiles, schedule — кластер у наявному тулбарі.** Roving-масив зростає: profiles 2→4
  (New, Import, **SelectAll, DeleteSelected**); schedule 1→3 (Add, **SelectAll, DeleteSelected**).
  Оновити `toolbarRefs` і всі `toolbarTabIndex`-індекси; `SelectionToolbar` дістає refs цих двох
  стопів + їх керовані `tabIndex`.
- **wishlist — кластер у наявній controls-зоні** (tabs + Add). Зона `role="group"` з
  `useFocusBoundary` (Tab-навігація, **не** roving) — тож select-all + delete-selected додаємо як
  звичайні focusable-кнопки, `SelectionToolbar` тут `tabIndex` **не** отримує (нормальний tab-order).
  Кнопки присутні завжди (aria-disabled, не conditional), тож boundary стабільна; `refreshBoundary`
  на зміну вкладки лишається.
- Дія-кнопка кличе `listRef.current?.requestBulkDelete()` (або `requestBulkRemove()`/`requestBulkAdd()`)
  на розширеному хендлі списку (як `StreamListHandle.requestBulkDelete`). Для songs/wishlist/browser
  ref **типізуємо** під розширений хендл (зараз `ZoneEntry`); виклик іде через **живий** callback-ref
  (не proxy, що лише для focus-реєстрації), і лише коли count>0 → список змонтований. «Виділити
  все/Зняти» — у панелі, кличе `announce` сам (A7), діє на видимі.

### D8. Bulk-оркестрація per-list (фокус — спільний `computeBulkFocusTarget`, A8/№18)

Кожен список володіє своїм `ConfirmDialog` (точний count) і bulk-хендлером (форма
`handleConfirmBulkDelete`). Послідовність: знімок **видимого** списку ДО await; бекенд-виклик;
**обчислити `removedIds`** (реально видалені, з результату бекенду — див. skip-нотатку нижче);
**далі — лише якщо `removedIds.length > 0`:** оновлення стора (видалити/додати); `replaceSelection($sel, ∅)`;
програмний фокус через `pendingBulkFocusRef` + `useLayoutEffect` на `[items, bulkSeq]`; `onEmpty()` коли
вцілілих нема. `announce`-підсумок — **завжди** (і при частковому, і при повному skip). Тригери
(тулбар-кнопка / `Delete` / ⋯ / inline-✕) сходяться в одному хендлері.

> **⚠ Повний skip (`removedIds.length === 0`) — справжній no-op для фокуса.** Якщо бекенд нічого не
> прибрав (виділено лише активний профіль / лише поточну грану пісню), фокус **не рухаємо взагалі**:
> `pendingBulkFocusRef` не ставимо, `onEmpty()` НЕ кличемо, стор не чіпаємо, selection лишаємо як є
> (skipped-рядки лишаються виділені) — лише `announce`-підсумок. Інакше `computeBulkFocusTarget` дістав
> би порожній `removedIds`, `findIndex` повернув би `-1`, і фокус сів би повз після фактичного no-op
> (особливо болісно для NVDA). Це дзеркало `doBulkTransfer`, де мутація+фокус під вартою
> `res.transferred.length > 0`.

> **⚠ `removedIds` ≠ сире виділення, коли є skip (важливо для фокуса).** `computeBulkFocusTarget`
> має дістати **реально видалені** id, інакше фокус сяде повз. Де skip можливий — рахуємо `removedIds`
> з результату бекенду (B-патерн `doBulkTransfer`: `moved = res.transferred`), **після** await, над
> знімком видимого до await:
> - **streams (A):** skip немає (delete дозволено й для recording) → `removedIds = selection`, можна ДО await.
> - **songs:** skipped-playing → `removedIds = result.deleted` (бекенд повертає `{deleted, skipped}`).
> - **profiles:** skipped-active → `removedIds = result.deleted` (імена видалених; активного в `deleted`
>   немає — про нього сигналить `skipped_active`).
> - **schedule / patterns:** skip немає → `removedIds = selection`.

- **browser-add** **не видаляє** рядки видимого списку (станції лишаються, лише позначаються `isAdded`
  через подію `streams-changed`→reload `$streams`), тож програмний фокус **не** рухається — лишається
  на активному рядку; лише підсумок-announce. `computeBulkFocusTarget` тут не застосовується.

## Зміни по файлах

**Спільне (D1):**
- `src/stores/selection.ts` *(новий)* — generic `replaceSelection`/`pruneSelection`.
- `src/hooks/useListSelection.ts` *(новий)* — adapter + announce + prune-ефект.
- `src/lib/bulkFocus.ts` *(новий)* — `computeBulkFocusTarget`.
- `src/components/common/SelectionToolbar.tsx` *(новий)* — select-all + 1 дія + count.
- `src/stores/streams.ts` — мігрувати `replaceSelection`/`pruneSelection` на generic (поведінка 1:1).
- **i18n (paraglide):**
  - перейменувати `stream_selected`→`item_selected`, `stream_deselected`→`item_deselected` (зміст уже
    generic «{name}, виділено»). Оновити call-site'и: `StreamList.tsx:70` **і** `StreamList.test.tsx:375`.
  - **Кнопки — переважно generic, не per-list:** «Видалити виділені (N)» однакова для songs/profiles/
    schedule/patterns → **перевикористати наявний `delete_selected`** (видимий текст = accessible name).
    Browser — новий generic `add_selected` («Додати виділені ({count})»). `select_all`/`clear_selection`/
    `selected_count_label`/`selection_suffix`/`selection_count`/`selection_cleared` уже generic.
  - **Per-list — лише підтвердження й підсумки** (несуть тип елемента/skip-причину):
    `confirm_delete_selected_songs/_profiles/_schedules/_patterns({count})`,
    `songs_removed_bulk`/`profiles_removed_bulk`/`schedules_removed_bulk`/`patterns_removed_bulk`,
    `stations_added_bulk` — з partial-success-хвостами (skipped-active / skipped-playing /
    skipped-duplicate). Регенерувати через vite-plugin.

**Songs:**
- `stores/songs.ts` — `$songsSelection`; `removeSongsByPaths(paths)` (bulk-аналог `removeSongByPath`).
- `components/songs/SongsList.tsx` — `selection`/`onSelectionChange` (через `useListSelection`); читає
  `$songs` (повний) для prune і для мутації стора (зараз лише `$filteredSongs`); bulk-delete + фокус
  (`removedIds = result.deleted`, skip-playing); **нова гілка `delete`** (одинично, коли виділення
  порожнє — див. D4-геп); `requestBulkDelete` на хендлі (`SongsListHandle = ZoneEntry & {…}`);
  `isSelected` у рядок; Explorer-маршрутизація `delete`/⋯.
- `components/songs/SongItem.tsx` — проп `isSelected` + суфікс + `selected`.
- `components/songs/SongContextMenu.tsx` — динамічний підпис «Видалити» за виділенням (№16).
- `components/songs/SongsPanel.tsx` — `ScreenHeader`+кластер у новій `songs-selection` зоні (типізувати
  `listRef` під `SongsListHandle`); зони `[selection, filter, list]`; lifecycle-clear (зміна
  `$songsQuery`/`$songsStation`/unmount; сорт зберігає); `onEmpty` фокусує філ-бар (як зараз).
  `song-deleted`-листенер лишається **як є** для одиничних видалень; bulk його **обходить** (команда
  не емітить подію), тож подвійного озвучення немає — окремо нічого «прибирати» не треба.
- `src-tauri`: `delete_songs(paths) -> {deleted, skipped}` (recycle-bin; skip-playing; **без**
  per-file `song-deleted`) + реєстрація; `lib/tauri.ts`: `deleteSongs`.

**Profiles:**
- `stores/profileManager.ts` — `$profilesSelection`.
- `components/profile/ProfileList.tsx` — selection-wiring, bulk-delete (active-skip), `requestBulkDelete`,
  `isSelected`, Explorer-маршрутизація.
- `components/profile/ProfileItem.tsx` — `isSelected` + суфікс + `selected`.
- `components/profile/ProfileContextMenu.tsx` — динамічний «Видалити» (№16): маршрутизація за
  виділенням як у songs/schedule (виділений рядок → bulk, що пропускає активний; невиділений →
  згорнути + одинично). Одиничне видалення активного профілю лишається наявною помилкою бекенду
  (поведінка не-D, не чіпаємо).
- `components/profile/ProfilesPanel.tsx` — кластер у тулбарі (roving 2→4; оновити всі індекси);
  lifecycle-clear **лише** на unmount (switch НЕ очищає — членство списку незмінне, D5); `listRef`
  уже `ProfileListHandle` — лише розширити тип `requestBulkDelete`. (Список не «спорожніє» через bulk:
  активний завжди виживає, тож гілка `onEmpty` недосяжна — окремий empty-фокус не потрібен.)
- `src-tauri`: `delete_profiles(names) -> {deleted: string[], skipped_active}` (пропускає активний;
  `deleted` = імена реально видалених) + реєстрація; `lib/tauri.ts`: `deleteProfiles`.

**Schedule:**
- `stores/schedule.ts` — `$scheduleSelection`.
- `components/schedule/ScheduleTable.tsx` — selection-wiring, bulk-delete, `requestBulkDelete`,
  `isSelected`, Explorer-маршрутизація `delete`/⋯.
- `components/schedule/ScheduleItem.tsx` — `isSelected` + суфікс + `selected`.
- `components/schedule/ScheduleContextMenu.tsx` — динамічний «Видалити».
- `components/schedule/SchedulePanel.tsx` — кластер у тулбарі (roving 1→3); lifecycle-clear (unmount).
- `src-tauri`: `delete_schedules` + `retain_schedules` + реєстрація; `lib/tauri.ts`: `deleteSchedules`.

**Patterns (wishlist/ignorelist):**
- `stores/wishlist.ts` — `$patternSelection` (спільний на обидві вкладки; одночасно живий лише один
  `TabPanel`, а перемикання вкладки очищає — тож безпечно).
- `components/wishlist/PatternList.tsx` — selection-wiring (`useListSelection`), bulk-remove +
  `ConfirmDialog` + фокус (`computeBulkFocusTarget`, skip немає), `requestBulkRemove` на хендлі
  (`PatternListHandle`), `isSelected` суфікс + `selected`, Explorer-маршрутизація `delete`/✕.
  **Новий проп `onBulkRemove: (patterns: string[]) => Promise<number>`** від панелі (бекенд +
  оновлення стора + count) — лишає `PatternList` list-type-агностичним; підсумок/фокус — у `PatternList`.
- `components/wishlist/WishlistPanel.tsx` — кластер у controls-зоні (focus-boundary, без roving-tabIndex);
  типізувати `patternListRef` під `PatternListHandle`; clear на зміну вкладки/unmount; передати
  `onBulkRemove` під активну вкладку (wishlist vs ignorelist) і `select-all` над її items.
- `src-tauri`: `remove_from_wishlist_bulk(patterns)->u32` / `remove_from_ignorelist_bulk(patterns)->u32`
  (один retain+save) + реєстрація; `lib/tauri.ts`: `removeFromWishlistBulk`/`removeFromIgnorelistBulk`.

**Browser:**
- `stores/browser.ts` — `$stationSelection`; `addStations(stations)` = тонка обгортка над командою
  (НЕ оновлює `$streams` — бекенд емітить `streams-changed`, App перезавантажує); clear-тригер на
  точках нового пошуку (`updateSearchParam`/`resetSearch`).
- `components/browser/StationList.tsx` — selection-wiring (`useListSelection`), bulk-add
  (`requestBulkAdd`), `isSelected` суфікс + `selected`; bulk пропускає **дублікати** url (бекенд дедупить
  по url — і проти профілю, і всередині виділення; підсумок «Додано N, пропущено M (дублікати)»).
  Фокус **не** рухається (рядки лишаються).
- `components/browser/StationItem.tsx` — `isSelected` + суфікс + `selected`.
- `components/browser/BrowserPanel.tsx` — `ScreenHeader`+кластер у новій `browser-selection` зоні
  (зони `[selection, search, results]`); **додати `useAnnounce`** (select-all, A7); типізувати
  results-ref під `StationListHandle`; clear на нову пошукову дію/зміну режиму/unmount.
- `src-tauri`: `add_stations_from_browser(stations)->Vec<StreamInfo>` (через
  `append_streams_to_active_profile` — один save+emit, дедуп) + реєстрація; `lib/tauri.ts`:
  `addStationsFromBrowser`.

**Документація:**
- `keyboard-shortcuts.md` — зазначити, що list-scoped виділення (Ctrl+Space/Shift±/Ctrl+A/Escape/Delete-bulk)
  тепер у **всіх** композитних списках, не лише streams.
- Парасолька — оновити критерії готовності D (познач закрите) **після** реалізації й NVDA-перевірки.

## Поза обсягом (YAGNI)

- Per-row «selectable»-предикат у `useCompositeList` (активний профіль виділяється-але-пропускається,
  тож хук не змінюється).
- Масовий перенос/копіювання у профіль для songs/інших; bulk-toggle у schedule; bulk-tags/rename —
  не в D (можна окремим записом, якщо знадобиться).
- Рефактор streams-тулбара під `SelectionToolbar` (у нього 3 дії через `SelectionActionsMenu` —
  лишаємо як є, без регресії A–C).
- Undo для bulk-видалень (узгоджено з парасолькою — одиничні теж без undo).
- Зміна roving-механіки чи ARIA-моделі списків (усе вже в A).

## Критерії приймання

1. **Виділення з клавіатури/миші працює в усіх 5 списках** так само, як у streams: Ctrl+Space toggle
   (+ суфікс «, виділено»), Shift+↑↓ діапазон, Ctrl+A toggle видимих, Escape очищає, простий клік
   згортає, Ctrl/Shift+Click. Space зберігає наявну primary-семантику кожного списку.
2. **NVDA:** одиничний key-toggle → негайне `item_selected`/`item_deselected({name})`; груповий →
   одне зведене `selection_count`/`selection_cleared`; pointer-single не дублюється. Без флуду.
3. **Масові дії:** songs/profiles/schedule/patterns — «Видалити виділені (N)» з одним `ConfirmDialog`
   (точний count); browser — «Додати виділені (N)». Тригери (тулбар / `Delete` / ⋯ / ✕) сходяться;
   ⋯/✕ на невиділеному спершу згортає до рядка (№15).
4. **Частковий успіх + підсумок:** profiles пропускає активний; songs пропускає те, що грає; browser
   пропускає **дублікати** url (вже в профілі **або** повтор у виділенні); кожен дає зведений announce
   «Зроблено N, пропущено M (причина)». Повний skip (нічого не зроблено) — фокус не рухає (D8).
5. **Фокус після bulk-видалення:** найближчий уцілілий (через `computeBulkFocusTarget`); хвіст → новий
   останній; усе видиме → `onEmpty` (відповідна порожня зона/контрол); **ніколи `<body>`**; незалежно
   від тригера. (browser-add фокус не рухає.)
6. **Lifecycle:** фільтр (songs) / вкладка (patterns) / новий пошук чи зміна режиму (browser) / вихід
   із секції очищають; сорт, Tab/F6 і **перемикання активного профілю (profiles — членство списку
   незмінне, D5)** зберігають; зниклі id auto-prune; `[N вибрано]` чесний.
7. **Тулбар:** кластер присутній і коректний у кожному списку (нова зона для songs/browser; розширений
   roving для profiles/schedule/wishlist); «Виділити все/Зняти» (toggle, видимі) і дія-кнопка
   (`aria-disabled` без виділення; видимий текст = accessible name).
8. `pnpm test`, `pnpm vite:build` і `cargo test` — зелені; ручна NVDA-перевірка bulk-циклу по
   **кожному** зі списків.

## План тестів (гейти: `pnpm test` + `pnpm vite:build` + `cargo test`, НЕ `tsc`)

- **`stores/selection` тест:** generic `replaceSelection` (нова identity), `pruneSelection` (drop
  зниклих, no-op коли без змін); streams-міграція не змінює поведінку (наявні A-тести зелені).
- **`useListSelection` тест:** adapter `current/replace`; `onSelectionChange` payload→announce
  (key-single name, group count/cleared, pointer-single пропуск); prune-ефект на зміну `allItems`.
- **`bulkFocus` тест:** перший вцілілий на/після індексу; хвіст→останній; усе видалено→`null`;
  не-знайдений (findIndex=-1) fallback.
- **`SelectionToolbar` тест:** select-all label-toggle і `aria-disabled` без видимих; дія-кнопка
  `aria-disabled` коли count=0; видимий текст == accessible name; roving-стоп.
- **Per-list (Item + List + Panel) тести** (дзеркало `StreamList`/`StreamsPanel` тестів):
  - **songs:** суфікс у `aria-label`; bulk-`ConfirmDialog` count; `deleteSongs` з множиною; `$songs`
    оновлено один раз; skipped-playing у підсумку; фокус→вцілілий над `result.deleted` (НЕ `<body>`);
    **`Delete` з порожнім виділенням → одиничний confirm активного** (нова гілка); ⋯-delete на
    невиділеному згортає; lifecycle-clear на зміну фільтра, збереження на сорт.
  - **profiles:** активний **виділяється**; bulk пропускає активний (`skipped_active`); підсумок;
    фокус рахується над `result.deleted` (активний виключений); **виділення переживає switch**
    (членство незмінне), clear лише на unmount.
  - **schedule:** bulk-delete count; `notify`-семантика (бекенд); фокус; ⋯-маршрутизація.
  - **patterns:** спільний `$patternSelection`; clear на зміну вкладки; bulk-remove під правильний
    список (wishlist vs ignorelist) через `onBulkRemove`; ✕ на невиділеному згортає.
  - **browser:** bulk-add; пропуск вже-доданих; підсумок; фокус **не** рухається; **`$streams` не
    чіпається фронтом** (оновлення через `streams-changed`); clear на новий пошук, **load-more
    зберігає** виділення.
- **Rust:** `delete_songs` (recycle-bin mock/skip-playing), `delete_profiles` (skip-active; `deleted` =
  імена видалених, активного немає в списку),
  `retain_schedules` (pure), `remove_from_*_bulk` (один save), `add_stations_from_browser` (dedup,
  added vs skipped) — pure-хелпери юніт-тестуються без Tauri-стану, як `retain_streams`.
- **Ручний NVDA (по кожному списку):** виділити (Ctrl+Space / Shift / Ctrl+A) → почути суфікс +
  «Виділено N» → масова дія (Delete/тулбар) → підтвердити → фокус на вцілілому + підсумок.
