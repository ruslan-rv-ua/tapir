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
④ prune-ефект, ⑤ bulk-оркестрація (ціль/виживші ДО await → бекенд → мутація стора → `replace(∅)` →
announce → програмний фокус), ⑥ тулбар-кластер, ⑦ per-Item суфікс, ⑧ Explorer-маршрутизація.
Ідентичні **②③④** і частину **⑤/⑥** виносимо; решта лишається per-list (справді різниться).

Нові спільні модулі:

- **`src/stores/selection.ts`** — generic `replaceSelection($sel, next)` / `pruneSelection($sel,
  existingIds)` (atom передається параметром; семантика 1:1 з нинішніми streams-функціями: новий
  `Set` identity на replace; no-op prune, коли нічого не змінилось). Кожен список оголошує **власний**
  `atom<Set<string>>`. `stores/streams.ts` мігрує: `$streamSelection` лишається, а його
  `replaceSelection`/`pruneSelection` стають тонкими обгортками над generic (або call-site'и
  переходять на 2-арг форму) — поведінка незмінна, покрита наявними A-тестами.
- **`src/hooks/useListSelection.ts`** — споживацький хук. Вхід: `{ $selection, announce,
  resolveName, allIds, visibleItems }`. Повертає `{ selectionAdapter, onSelectionChange }` і **сам
  ганяє prune-ефект** на зміну `allIds`. Складає **②③④** — байт-в-байт однакові сьогодні в
  `StreamList`. `onSelectionChange` повторює A6/A5: pointer-single → пропуск (фокус уже на рядку);
  key-single → `item_selected`/`item_deselected({name})`; group → `selection_count`/`selection_cleared`.
- **`src/lib/bulkFocus.ts`** — pure `computeBulkFocusTarget(visibleItems, removedIds): string | null`
  → id першого вцілілого на/після верхнього видаленого індексу (правило A8; `null` = усе видиме
  видалено → `onEmpty`). Мутація даних і бекенд-виклик лишаються per-list (різні); спільна **лише**
  ця індексна арифметика + focus-ефект-патерн (документуємо як шаблон, не як god-хук).
- **`src/components/common/SelectionToolbar.tsx`** — кластер для списків з **однією** масовою дією:
  кнопка «Виділити все/Зняти» (toggle, дзеркало Ctrl+A, `aria-disabled` коли немає видимих) +
  **одна** дія-кнопка (`aria-disabled` коли count=0; видимий текст = accessible name, WCAG 2.5.3) +
  не-live `[N вибрано]` span. Пропси: counts, labels, `isActiveStop`/`buttonRef` під roving,
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

- **songs / profiles / schedule (мають ⋯):** `Delete`-клавіша → bulk, коли виділення непорожнє
  (інакше одинично — як зараз); ⋯-«Видалити» на **виділеному** рядку → bulk; на **невиділеному** →
  спершу `replace({id})`, потім одинично. Пункт ⋯ несе кількість у accessible name на виділеному
  рядку («Видалити виділені (N)»); суто-одиничні пункти (Перейменувати, Теги, Слухати, Дублювати,
  Експорт, Перемкнути, Редагувати, Toggle) лишаються в однині й діють на **відкритий** рядок (№16).
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
- **profiles:** очищають перемикання профілю (`profile-changed`/після switch) і unmount; фільтра немає.
  prune — на `$profileList`.
- **schedule:** очищає unmount; фільтра/профіль-перемикання в межах секції немає. prune — на `$schedules`.
- **patterns:** очищають **перемикання вкладки** (№4-аналог) і unmount. prune — на активний список
  (`$wishlist` або `$ignorelist`).
- **browser:** очищають **нова пошукова дія / зміна режиму** (popular↔search, як фільтр) і unmount;
  `load-more` дописує (виділення зберігається). prune/select-all — на видимі `stations`.

### D6. Бекенд — масові команди (патерн `remove_streams`: один save, чесний count)

Нові Rust-команди (+ реєстрація в `lib.rs`, + pure-хелпер з юніт-тестом де доречно, + обгортка
в `lib/tauri.ts`):

- **`delete_songs(paths) -> BulkDeleteSongs { deleted: Vec<String>, skipped: Vec<String> }`** —
  по кожному шляху recycle-bin; **пропускає** файл, що зараз грає (як одиничний `delete_song`).
  **НЕ емітить per-file `song-deleted`** (інакше N озвучень панеллю): повертає списки, фронт оновлює
  `$songs` один раз і дає **один** підсумок. (Одиничне видалення лишається на наявному `song-deleted`.)
- **`delete_profiles(names) -> BulkDeleteProfiles { deleted: u32, skipped_active: bool }`** —
  по кожному `Profile::delete`, **пропускає активний** (звіряє з `state.active_profile`). Один прохід.
- **`delete_schedules(ids) -> u32`** — один `retain` + один `save` + `notify_schedule_deleted` по
  кожному видаленому id (зупинка in-progress, §3.5). Pure `retain_schedules(&mut profile, &ids)`.
- **`remove_from_wishlist_bulk(patterns) -> u32`** і **`remove_from_ignorelist_bulk(patterns) -> u32`** —
  один `retain` + один `save` на список.
- **`add_stations_from_browser(stations) -> Vec<StreamInfo>`** — через наявний
  `append_streams_to_active_profile` (вже дедупить url); повернені = реально додані, пропущені =
  `stations.len() − added.len()` (вже в профілі). Фронт оновлює `$streams` доданими + підсумок.

### D7. Тулбар-кластери per-list (рішення №2, №6, №8 для browser-add — окрема дія-кнопка)

- **songs, browser — нова roving-зона в шапці.** `ScreenHeader` дістає `children` (кластер) і
  обгортається в `ScreenZone role="application"` з `useRovingFocus` (патерн `ProfilesPanel`):
  `songs-selection` / `browser-selection`. Кластер = `SelectionToolbar` (select-all + дія + count).
  Дія: songs → «Видалити виділені (N)»; browser → «Додати виділені (N)».
- **profiles, schedule — кластер у наявному тулбарі.** Roving-масив зростає: profiles 2→4
  (New, Import, **SelectAll, DeleteSelected**); schedule 1→3 (Add, **SelectAll, DeleteSelected**).
  Оновити `toolbarRefs` і `toolbarTabIndex`-індекси.
- **wishlist — кластер у наявній controls-зоні** (tabs + Add). Зона зараз `role="group"` з
  `useFocusBoundary`; додаємо select-all + delete-selected як focusable-кнопки в тій самій зоні
  (boundary вже все охоплює; `refreshBoundary` на зміну вкладки лишається).
- Дія-кнопка кличе `listRef.current?.requestBulkDelete()` (або `requestBulkAdd()` для browser) на
  розширеному хендлі списку (як `StreamListHandle.requestBulkDelete`). «Виділити все/Зняти» — у панелі,
  кличе `announce` сам (A7), діє на видимі.

### D8. Bulk-оркестрація per-list (фокус — спільний `computeBulkFocusTarget`, A8/№18)

Кожен список володіє своїм `ConfirmDialog` (точний count) і bulk-хендлером (форма
`handleConfirmBulkDelete`): ціль фокуса = `computeBulkFocusTarget(visible, removedIds)` **ДО** await;
бекенд-виклик; оновлення стора (видалити/додати); `replaceSelection($sel, ∅)`; `announce`-підсумок
(partial-success де є: songs skipped-playing, profiles skipped-active, browser skipped-duplicate);
програмний фокус через `pendingBulkFocusRef` + `useLayoutEffect` на `[items, bulkSeq]`; `onEmpty()`
коли вцілілих нема. Тригери (тулбар-кнопка / `Delete` / ⋯ / inline-✕) сходяться в одному хендлері.

- **browser-add** не видаляє рядки видимого списку (станції лишаються в результатах, лише позначаються
  `isAdded`), тож фокус **не** рухається програмно — лишається на активному рядку; підсумок-announce.

## Зміни по файлах

**Спільне (D1):**
- `src/stores/selection.ts` *(новий)* — generic `replaceSelection`/`pruneSelection`.
- `src/hooks/useListSelection.ts` *(новий)* — adapter + announce + prune-ефект.
- `src/lib/bulkFocus.ts` *(новий)* — `computeBulkFocusTarget`.
- `src/components/common/SelectionToolbar.tsx` *(новий)* — select-all + 1 дія + count.
- `src/stores/streams.ts` — мігрувати `replaceSelection`/`pruneSelection` на generic (поведінка 1:1).
- **i18n (paraglide):** перейменувати `stream_selected`→`item_selected`, `stream_deselected`→
  `item_deselected` (оновити call-site'и у `StreamList`); додати `delete_selected_songs`/`_profiles`/
  `_schedules`/`_patterns`, `add_selected_stations`, відповідні `confirm_*` і `*_removed_bulk`/
  `stations_added_bulk` з partial-success-варіантами (skipped-active / skipped-playing / skipped-duplicate).
  Регенерувати через vite-plugin.

**Songs:**
- `stores/songs.ts` — `$songsSelection`.
- `components/songs/SongsList.tsx` — `selection`/`onSelectionChange` (через `useListSelection`),
  bulk-delete + фокус, `requestBulkDelete` на хендлі (`SongsListHandle`), `isSelected` у рядок,
  Explorer-маршрутизація `delete`/⋯.
- `components/songs/SongItem.tsx` — проп `isSelected` + суфікс + `selected`.
- `components/songs/SongContextMenu.tsx` — динамічний підпис «Видалити» за виділенням (№16).
- `components/songs/SongsPanel.tsx` — `ScreenHeader`+кластер у новій `songs-selection` зоні; lifecycle-
  clear (фільтр/unmount); `onEmpty` фокусує філ-бар (як зараз). Прибрати дубль-озвучення з
  `song-deleted`-листенера для bulk (bulk не емітить подію).
- `src-tauri`: `delete_songs` + реєстрація; `lib/tauri.ts`: `deleteSongs`.

**Profiles:**
- `stores/profileManager.ts` — `$profilesSelection`.
- `components/profile/ProfileList.tsx` — selection-wiring, bulk-delete (active-skip), `requestBulkDelete`,
  `isSelected`, Explorer-маршрутизація.
- `components/profile/ProfileItem.tsx` — `isSelected` + суфікс + `selected`.
- `components/profile/ProfileContextMenu.tsx` — динамічний «Видалити» (№16): маршрутизація за
  виділенням як у songs/schedule (виділений рядок → bulk, що пропускає активний; невиділений →
  згорнути + одинично). Одиничне видалення активного профілю лишається наявною помилкою бекенду
  (поведінка не-D, не чіпаємо).
- `components/profile/ProfilesPanel.tsx` — кластер у тулбарі (roving 2→4); lifecycle-clear
  (profile-switch/unmount).
- `src-tauri`: `delete_profiles` + реєстрація; `lib/tauri.ts`: `deleteProfiles`.

**Schedule:**
- `stores/schedule.ts` — `$scheduleSelection`.
- `components/schedule/ScheduleTable.tsx` — selection-wiring, bulk-delete, `requestBulkDelete`,
  `isSelected`, Explorer-маршрутизація `delete`/⋯.
- `components/schedule/ScheduleItem.tsx` — `isSelected` + суфікс + `selected`.
- `components/schedule/ScheduleContextMenu.tsx` — динамічний «Видалити».
- `components/schedule/SchedulePanel.tsx` — кластер у тулбарі (roving 1→3); lifecycle-clear (unmount).
- `src-tauri`: `delete_schedules` + `retain_schedules` + реєстрація; `lib/tauri.ts`: `deleteSchedules`.

**Patterns (wishlist/ignorelist):**
- `stores/wishlist.ts` — `$patternSelection`.
- `components/wishlist/PatternList.tsx` — selection-wiring, bulk-remove, `requestBulkRemove`,
  `isSelected` суфікс, Explorer-маршрутизація `delete`/✕; проп для бекенд-функції видалення
  (wishlist vs ignorelist) від панелі.
- `components/wishlist/WishlistPanel.tsx` — кластер у controls-зоні; clear на зміну вкладки/unmount;
  передати правильний bulk-remove у `PatternList` під активну вкладку.
- `src-tauri`: `remove_from_wishlist_bulk` / `remove_from_ignorelist_bulk` + реєстрація;
  `lib/tauri.ts`: `removeFromWishlistBulk`/`removeFromIgnorelistBulk`.

**Browser:**
- `stores/browser.ts` — `$stationSelection`; `addStations(stations)` (масовий, через бекенд).
- `components/browser/StationList.tsx` — selection-wiring, bulk-add (`requestBulkAdd`), `isSelected`
  суфікс; масове додавання пропускає вже-додані (`isAlreadyAdded`).
- `components/browser/StationItem.tsx` — `isSelected` + суфікс + `selected`.
- `components/browser/BrowserPanel.tsx` — `ScreenHeader`+кластер у новій `browser-selection` зоні;
  clear на нову пошукову дію/зміну режиму/unmount.
- `src-tauri`: `add_stations_from_browser` + реєстрація; `lib/tauri.ts`: `addStationsFromBrowser`.

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
   пропускає вже-додані; кожен дає зведений announce «Зроблено N, пропущено M (причина)».
5. **Фокус після bulk-видалення:** найближчий уцілілий (через `computeBulkFocusTarget`); хвіст → новий
   останній; усе видиме → `onEmpty` (відповідна порожня зона/контрол); **ніколи `<body>`**; незалежно
   від тригера. (browser-add фокус не рухає.)
6. **Lifecycle:** фільтр (songs) / вкладка (patterns) / пошук (browser) / профіль (profiles) / вихід
   із секції очищають; сорт і Tab/F6 зберігають; зниклі id auto-prune; `[N вибрано]` чесний.
7. **Тулбар:** кластер присутній і коректний у кожному списку (нова зона для songs/browser; розширений
   roving для profiles/schedule/wishlist); «Виділити все/Зняти» (toggle, видимі) і дія-кнопка
   (`aria-disabled` без виділення; видимий текст = accessible name).
8. `pnpm test`, `pnpm vite:build` і `cargo test` — зелені; ручна NVDA-перевірка bulk-циклу по
   **кожному** зі списків.

## План тестів (гейти: `pnpm test` + `pnpm vite:build` + `cargo test`, НЕ `tsc`)

- **`stores/selection` тест:** generic `replaceSelection` (нова identity), `pruneSelection` (drop
  зниклих, no-op коли без змін); streams-міграція не змінює поведінку (наявні A-тести зелені).
- **`useListSelection` тест:** adapter `current/replace`; `onSelectionChange` payload→announce
  (key-single name, group count/cleared, pointer-single пропуск); prune-ефект на зміну `allIds`.
- **`bulkFocus` тест:** перший вцілілий на/після індексу; хвіст→останній; усе видалено→`null`;
  не-знайдений (findIndex=-1) fallback.
- **`SelectionToolbar` тест:** select-all label-toggle і `aria-disabled` без видимих; дія-кнопка
  `aria-disabled` коли count=0; видимий текст == accessible name; roving-стоп.
- **Per-list (Item + List + Panel) тести** (дзеркало `StreamList`/`StreamsPanel` тестів):
  - **songs:** суфікс у `aria-label`; bulk-`ConfirmDialog` count; `deleteSongs` з множиною; `$songs`
    оновлено один раз; skipped-playing у підсумку; фокус→вцілілий (НЕ `<body>`); ⋯-delete на
    невиділеному згортає; lifecycle-clear на фільтр.
  - **profiles:** активний **виділяється**; bulk пропускає активний (`skipped_active`); підсумок;
    фокус; clear на switch.
  - **schedule:** bulk-delete count; `notify`-семантика (бекенд); фокус; ⋯-маршрутизація.
  - **patterns:** спільний `$patternSelection`; clear на зміну вкладки; bulk-remove під правильний
    список (wishlist vs ignorelist); ✕ на невиділеному згортає.
  - **browser:** bulk-add; пропуск вже-доданих; підсумок; фокус **не** рухається; clear на новий пошук.
- **Rust:** `delete_songs` (recycle-bin mock/skip-playing), `delete_profiles` (skip-active, count),
  `retain_schedules` (pure), `remove_from_*_bulk` (один save), `add_stations_from_browser` (dedup,
  added vs skipped) — pure-хелпери юніт-тестуються без Tauri-стану, як `retain_streams`.
- **Ручний NVDA (по кожному списку):** виділити (Ctrl+Space / Shift / Ctrl+A) → почути суфікс +
  «Виділено N» → масова дія (Delete/тулбар) → підтвердити → фокус на вцілілому + підсумок.
