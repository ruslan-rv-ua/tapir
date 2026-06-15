# Спека: масові операції над потоками — віха A (фундамент виділення + масове видалення)

- **Дата:** 2026-06-14
- **Тип:** дизайн фічі (spec) — перша віха парасолькового запису
- **Статус:** затверджено, готово до writing-plans
- **Парасолька (north-star):** [docs/backlog/p1-bulk-stream-operations.md](../../backlog/p1-bulk-stream-operations.md)
  — усі дизайн-рішення (1–18) живуть там; ця спека на них **посилається**, а не дублює.
- **Пов'язані документи:** [accessibility.md](../../accessibility.md) (§1.4 LiveAnnouncer, §3, §11),
  [keyboard-shortcuts.md](../../keyboard-shortcuts.md) (Tier 2′)

## Мета

Закрити обсяг **віхи A** (розділ «Віхи» парасольки): спільний opt-in шар виділення
в `useCompositeList`/`CompositeList` поверх `$streamSelection`, клавіатурну +
мишачу модель виділення (Windows-стандарт), ARIA/NVDA-подання та масове видалення
з одним підтвердженням і коректним фокусом. **Лише streams.** Move/copy (B),
експорт + запис/зупинка виділених (C), решта списків (D) — поза обсягом.

Віха A навмисно отримує найглибший дизайн: вона фіксує **спільний API виділення**,
від якого залежать B/C/D.

## Контекст (поточний стан коду, звірено 2026-06-14)

- **`src/hooks/useCompositeList.ts`** — 2D roving-focus для `role="application"`
  списків. `onKeyDownCapture` (capture-фаза) емітить generic `onAction(type, itemId,
  segment, mods)` з типами `'primary' | 'toggle' | 'delete' | 'copy'`. Має
  `focusItem`/`pendingFocusRef` (програмний фокус), `activeItemId`, `modifiers(e)`,
  `onContextMenu` (єдина точка для ПКМ/Menu/Shift+F10). **REFACTOR TRIGGER**
  (рядки ~272–273): уже 2 хардкод list-дії (Delete, Ctrl+C) — на 3-й винести
  обробку в таблицю `key→actionType`. **`case ' '`** (рядок ~354) ігнорує
  модифікатори → шле `onAction('toggle', …)`, тож Ctrl+Space зараз помилково падає
  в record/play-гілку.
- **Жива реконсиляція** (рядки ~191–219): ключується на **одному** `activeItemId`
  й достроково виходить `if (exists) return;` — тож для bulk-фокуса потрібна
  **окрема** логіка (рішення №18).
- **`CompositeList.tsx`** — рендерить `<ul role="application">`, прокидає
  `onKeyDownCapture`/`onContextMenu`; підтримує `imperativeExtra(api)` для
  розширення хендла (вже віддає `focusItem`).
- **`CompositeRow.tsx`** — `li[role=listitem][data-segment="summary"]`; має лише
  `onDoubleClick` (primary-дія через `onActivate`); одиничний клік не обробляє.
- **`StreamItem.tsx`** — будує `summaryLabel` (accessible name рядка), `rowBg`
  (підсвітка active/recording/playing), віддає `isFocused` у Row/Segment/Action.
- **`StreamList.tsx`** — `forwardRef<ZoneEntry>`; читає `$streams`/`$statuses`;
  має `useAnnounce`, `addToast`, одиничний `pendingDeleteId` + `ConfirmDialog`,
  `activateStream`, `copyStreamUrl`. `onAction`: `copy`→URL, `delete`→
  `setPendingDeleteId`, `primary/toggle`→`activateStream`.
- **`StreamsPanel.tsx`** — тулбар (roving через `useRovingFocus`, **10 елементів**,
  індекси 0–9: Add 0, Import 1, Export 2, RecordAll 3, StopAll 4, chips 5–7,
  sorts 8–9). Має `filteredStreams`/`sortedStreams`, `$streamFilter`, `pluralize`,
  `streamListRef` (ZoneEntry). Експорт уже використовує `aria-disabled` (патерн
  «кнопка завжди присутня, неактивна без даних»).
- **Сховище:** `$streams = atom<StreamInfo[]>`, `$streamFilter = atom`. Видалення —
  `tauri.removeStream(id)` (Rust [`remove_stream`](../../../src-tauri/src/commands/stream_commands.rs#L122):
  спершу стоп-запис, потім `retain` + одне збереження; **не** емітить
  `streams-changed`). Фронт оновлює `$streams` оптимістично після виклику.
  **Бекенд-команди масового видалення немає.**
- **LiveAnnouncer:** `useAnnounce()` → `$announcer`; централізований polite/assertive
  регіон з `data-live-announcer="true"` (працює і всередині модалів).
- **Lifecycle-сигнали:** фільтр — `$streamFilter` (StreamsPanel); профіль — подія
  `profile-changed` ([useProfileSync.ts](../../../src/hooks/useProfileSync.ts));
  секція — `$activeSection` ([stores/navigation.ts](../../../src/stores/navigation.ts)).

## Ключові архітектурні рішення

### A1. Сховище — `$streamSelection` + read через `useStore` (рішення №10)

`stores/streams.ts`: `export const $streamSelection = atom<Set<string>>(new Set())`
плюс дрібні **store-екшени** `replaceSelection(next)` (нормалізує в новий `Set`
і робить `$streamSelection.set`) та `pruneSelection(existingIds)` (прибирає id,
яких уже нема; **no-op, якщо нічого не змінилось** — без зайвих ререндерів). Це
**імперативні** дії над atom (не чисті функції): їх викликають адаптер `replace`
(A2) і lifecycle-ефект (A10). Atom — єдине джерело правди; тулбар (StreamsPanel),
список (StreamList) і рядок (StreamItem) читають його через `useStore` — **без**
prop-drilling крізь `CompositeList` (тулбар — сусідня зона). Узагальнення на 6
списків — пізніше (D); зараз atom streams-специфічний.

### A2. Контракт виділення в `useCompositeList` — «хук володіє механікою, споживач — текстом»

Opt-in. Адаптер — **двометодовий міст** до atom; уся механіка (toggle, діапазон,
select-all, clear, count, якір) живе **в хуку**:

```ts
interface CompositeSelection {
  current: () => ReadonlySet<string>;          // event-time знімок (atom.get)
  replace: (next: ReadonlySet<string>) => void; // делегує в replaceSelection (A1): $streamSelection.set
}
interface SelectionChange {
  kind: "single" | "group";  // single = Ctrl+Space/Ctrl+Click/простий клік; group = діапазон/all/clear
  via: "key" | "pointer";    // pointer-жести вже рухають DOM-фокус (NVDA читає рядок) → single повторно НЕ оголошуємо
  count: number;             // новий розмір виділення
  lastId?: string;           // перемкнутий рядок (лише single)
  selected?: boolean;        // його новий стан (лише single)
}
// нові опційні параметри useCompositeList / CompositeListProps:
selection?: CompositeSelection;
onSelectionChange?: (c: SelectionChange) => void;
```

Хук тримає `anchorRef` (id) + `anchorBaseRef` (знімок виділення на момент
встановлення якоря). **Shift-діапазон і розширюється, і звужується** коректно
(Explorer-модель, №11): `next = anchorBase ∪ range(anchor → cursor)`. Якір
(пере)встановлюється на Ctrl+Space/Ctrl+Click і на **звичайних** навігаційних
переміщеннях; **кожне (пере)встановлення наново знімає `anchorBase` з
`selection.current()`**. Shift-жести якір **не** рухають. Без `selection` — хук
поводиться як зараз (інші списки нічого не передають).

> **Захист від зовнішнього очищення (геп):** хук **не** спостерігає `replaceSelection`,
> викликані ззовні — тулбаром (A7) чи lifecycle (A10). Якщо виділення очистили
> зовні, а наступний жест — одразу Shift+↑↓ (без проміжної звичайної навігації, що
> переписала б `anchorBase`), стара непорожня база воскресила б щойно очищене через
> `anchorBase ∪ range`. Тож **на старті кожного Shift-жесту**: якщо `selection.current()`
> порожнє — примусово `anchorBase = ∅`, а якорем узяти поточний курсор.

### A3. Рефактор key→actionType ПЕРЕД новими клавішами (передумова)

До додавання семантики виділення: винести розбір клавіш у `resolveKeyAction(e)`
(чисту функцію `KeyboardEvent → ActionId | null`), а тіло `onKeyDownCapture` —
у `switch (action)`. Це знімає REFACTOR TRIGGER (рядки 272–273) до того, як A
додасть Ctrl+Space/Ctrl+A/Escape/Shift+↑↓. Наявні клавіші (стрілки, Home/End,
PageX, Enter, Space, Delete, Tab, Ctrl+C) зберігають поведінку 1:1 — рефактор
без зміни семантики, покривається наявними тестами.

`e.code` для літер (`KeyA`, `KeyC`) і `Space` — кирилична розкладка
(accessibility.md §12); `e.key` лишається для стрілок/Enter/Delete/Tab/Escape.

### A4. Клавіатурна модель (рішення №11, №12, №15)

| Клавіші | Дія |
|---|---|
| `Ctrl+Space` | toggle активного рядка; встановити якір; `onSelectionChange{single}` |
| `Shift+↓`/`Shift+↑` | перемістити курсор + діапазон якір→курсор; `{group}` |
| `Ctrl+A` | усі видимі виділені? → clear : виділити всі видимі (toggle, №12); `{group}` |
| `Escape` | виділення непорожнє → clear (`{group}`) **і consume**; інакше — **не** consume (Escape вільний у списку, №12) |
| `Delete` | виділення непорожнє → bulk-видалення; інакше — одиничне (як зараз, №15) |
| `Space` (без Ctrl) | без змін → record/play `toggle` (split `case ' '` за `e.ctrlKey`) |
| стрілки/Home/End/PageX/Enter/Tab/Ctrl+C | без змін |

> «Без змін» в останньому рядку — про **рух фокуса**: коли `selection` активне,
> звичайні стрілки/Home/End/PageX додатково **(пере)встановлюють якір** (A2;
> базовий знімок = поточне виділення), а Shift-жести якір **не** рухають. Сам рух
> фокуса лишається 1:1 з поточним.

`case ' '` розгалужується за `e.ctrlKey`: з Ctrl → select-toggle **активного
рядка** (гілка **не** гейтиться `isNativeControl` — toggle діє з будь-якого
сегмента, зокрема з кнопки-дії, і `consume()` глушить нативний клік); без Ctrl —
наявна record/play-гілка зі своїм `isNativeControl`-гардом 1:1.

### A5. Мишача модель (рішення №11, №15) — на `<ul>`, як `onContextMenu`

Новий делегований `onClick` на `<ul>` (лише коли `selection` передано):
- **Простий клік** по рядку → згорнути виділення до цього рядка (`replace({id})`),
  зробити активним + якорем. Кліки по власних контролах рядка
  (`button,a,input,select,textarea`) — ігнор (нехай діють самі).
- **Ctrl+Click** → toggle цього рядка (= Ctrl+Space).
- **Shift+Click** → спан якір→клік.
- **Подвійний клік** → без змін (primary-дія через наявний `onActivate` у Row).

Усі мишачі жести рухають **DOM-фокус** на клікнутий рядок (на відміну від
Ctrl+Space) — тож NVDA сам прочитає рядок із суфіксом «, виділено». Тому
`onSelectionChange` для них іде з `via:"pointer"`, і StreamList **не** дублює
явним `announce` одиничний стан (простий клік / Ctrl+Click → `{single}`); лише
Shift+Click (спан, зміна багатьох рядків) шле одне зведене `{group}` «Виділено N».
Простий клік-«згортання» — це `{single, selected:true, count:1}` (де-виділення
решти рядків окремо не оголошується, як у Провіднику).

### A6. ARIA/NVDA (рішення №9)

- **Суфікс в accessible name:** до `aria-label` виділеного рядка додається
  `«, виділено»` (будується в `StreamItem` з нового пропа `isSelected`).
- **Зрячим:** CSS-підсвітка виділених рядків (`data-selected` + клас; `forced-colors:`
  через `Highlight`/`HighlightText`), візуально відмінна від active-row/recording/
  playing-фону.
- **Оголошення — лише через центральний LiveAnnouncer** (`announce`), один канал
  (кілька викликачів: хук-жести через `onSelectionChange`→StreamList; тулбар-кнопки
  «Виділити все/Зняти» оголошують **самі**, A7 — бо діють в обхід хука);
  тулбар-лічильник — **візуальний, НЕ live** (інакше NVDA озвучить двічі):
  - **одиничний** toggle **з клавіатури** (Ctrl+Space) → негайний `announce`
    («{name}, виділено» / «{name}, знято з виділення») — фокус не рухається, тож
    NVDA сам мовчить; **pointer-варіанти** (простий клік / Ctrl+Click, `via:"pointer"`)
    фокус **рухають** → рядок читається сам, явно їх **не** оголошуємо (A5);
  - **груповий** жест → рівно **одне** зведене `announce` («Виділено N»); Shift-стрілки
    додатково рухають фокус, тож NVDA озвучить новий рядок із суфіксом поверх одного
    зведеного; clear → `announce` («Виділення знято»).

> Узгодження з accessibility.md §3.1 (**застосовано** на етапі цієї спеки): ескіз із
> per-toolbar `aria-live` лічильником («{n} вибрано», ~рядок 190) — з історичного
> table/grid-чернетки (примітка doc 2026-04-23) і **прямо суперечив** цій спеці (дав би
> подвійне озвучення поверх центрального announcer'а). У §3.1 `aria-live` з лічильника
> **прибрано** (звичайний span, як `[N вибрано]` в A7), а під §3 додано абзац про єдиний
> канал оголошень виділення + звірку з реальним `role="application"`-списком.

`onSelectionChange` віддає **дані** (kind/count/lastId/selected); локалізований
рядок добирає `StreamList` (має `streams` для пошуку назви + `useAnnounce`).

### A7. Тулбар (StreamsPanel) — стабільні кнопки (рішення №2, №17, №18)

Roving зростає 10 → **12**. На початку **рядка 2** (перед «Записати все») —
кластер виділення: `[N вибрано] · Виділити все/Зняти · Видалити виділені (N)`.
Нові індекси: Add 0, Import 1, Export 2, **SelectAll 3, DeleteSelected 4**,
RecordAll 5, StopAll 6, chips 7–9, sorts 10–11 (оновити `toolbarRefs` і
колоковані коментарі про індекси).

- **Виділити все/Зняти:** label перемикається за «всі видимі виділені» (дзеркало
  Ctrl+A); `aria-disabled` коли немає видимих рядків; діє на `sortedStreams`
  (`replaceSelection`). Тулбар — сусідня зона, **не** проходить через
  `onSelectionChange` хука, тож клік **сам** кличе `announce` (StreamsPanel має
  `useAnnounce`): «Виділено N» / «Виділення знято» — той самий центральний канал
  (A6), просто другий викликач. Інакше Ctrl+A озвучувався б, а кнопка-дзеркало — ні.
- **Видалити виділені (N):** кількість у видимому тексті **і** в accessible name
  (WCAG 2.5.3); `aria-disabled` коли count = 0; клік → `streamListRef.current
  .requestBulkDelete()`.
- **`[N вибрано]`** — звичайний (НЕ live) span, видимий лише при count > 0; читається
  NVDA при фокусі, але не дублює оголошення (A6).

### A8. Масове видалення + фокус (рішення №15, №18)

Усі три тригери — тулбар-кнопка, клавіша `Delete`, ⋯-меню на **виділеному** рядку —
сходяться в **StreamList**, що володіє одним bulk-`ConfirmDialog` із точною
кількістю. ⋯ на **невиділеному** рядку спершу згортає виділення до нього, потім
діє одинично (№15). StreamList віддає `requestBulkDelete()` на своєму хендлі для
тулбар-кнопки (через `useImperativeHandle`, що композитить хендл `CompositeList` +
`focusItem` з `imperativeExtra`). Тип хендла відповідно розширюється до
`ZoneEntry & { requestBulkDelete(): void }` (і `streamListRef` у StreamsPanel).
**Застереження (stale-closure):** хендл будується `useImperativeHandle` з deps
`[zoneId, restoreFocus, focusItemAndDom]` — він **не** перебудовується, коли
змінюється лише *ідентичність* пропа `imperativeExtra`, тож замикання
`requestBulkDelete` фіксується **один раз**. Тому воно читає стан **на момент
виклику**, а не з захопленого пропа/стейту:
- **множину** — з `$streamSelection.get()`;
- **видимий порядок** (для індексу фокуса нижче) — з `streamsRef.current`, який
  оновлюється на кожен ререндер поточним пропом `streams` (= `sortedStreams`). **`$streams.get()`
  тут хибний:** це повний **нефільтрований/несортований** список, а індекс фокуса
  рахується над **видимим**. `$streams.get()` потрібен лише для мутації даних нижче.

Виконання: `tauri.removeStreams([...$streamSelection.get()])` → успіх →
`$streams.set($streams.get().filter(без видалених))`, очистити виділення (+ скинути
якір, A2/A10), `announce(«Видалено N»)`.

**Фокус (окремо від живої реконсиляції):** верхній видалений індекс рахується з
**множини виділення** над **видимим списком до видалення** (`streamsRef.current`,
**не** `$streams`); цільовий рядок — перший уцілілий на/після цього індексу (новий
останній, якщо видалено хвіст), фокусується **програмно**
(`focusItem`/`pendingFocusRef`) — **ніколи `<body>`**. Програмний фокус після
видалення **також скидає якір** на цільовий рядок із порожньою базою — інакше перший
Shift+↑↓ розширювався б від видаленого якоря.

**Перегони фокуса з ConfirmDialog:** `ConfirmDialog` — react-aria `Modal`, що при
закритті **відновлює фокус на тригер**. Коли тригер сам видалено (Delete з рядка /
⋯-меню на виділеному), відновлення сяде на зниклий вузол → `<body>`. Тож програмний
`focusItem` має спрацювати **після** розмонтування діалогу — прив'язати його до
пост-видалянної зміни стану (`$streams.set` → зміна `items` → `useLayoutEffect`), щоб
він був **останнім словом** (так само одинична гілка вже покладається на живу
реконсиляцію після закриття діалогу). Тулбар-тригер (`aria-disabled`, count→0)
лишається досяжним, але фокус однаково належить уцілілому рядку.

**Порожній видимий список після видалення (геп, закрити в A):** якщо видалено всі
**видимі** рядки — чи то останні потоки профілю (empty-profile), чи всі під
поточним фільтром, тоді як інші лишились (filter-empty) — у видимому списку
**нема** уцілілого, тож StreamList кличе `onEmpty()`. Наразі проп `onEmpty` зі
StreamsPanel — **no-op** («handled by isEmpty effect»), а той ефект фокусує перший
рядок лише після add-examples, **не** після видалення → фокус упав би на `<body>`
(порушення критерію 5). У межах A: StreamsPanel в `onEmpty` фокусує кнопку
відповідної порожньої зони (add-examples або reset-filter) — **але не синхронно в
колбеку**: у момент `onEmpty()` (одразу після `$streams.set`) цільова кнопка ще **не
змонтована** (StreamsPanel ще не перерендерив порожню зону — та сама причина, чому
наявний `handleAddExamples` відкладає фокус через `pendingFocusFirstRow` + ефект на
перехід `isEmpty`, а не фокусує одразу). Тож `onEmpty` виставляє прапорець і фокусує
кнопку в **ефекті на перехід** `isEmpty`/`filterHidesAll` → `true` (перевикористати
наявний патерн відкладеного фокуса).

### A9. Бекенд — `remove_streams(stream_ids) -> usize`

Нова Rust-команда в [stream_commands.rs](../../../src-tauri/src/commands/stream_commands.rs):
одна ітерація стоп-записів, один `retain`, **одне** збереження, повертає кількість
видалених. Реєстрація в `lib.rs`; обгортка в `lib/tauri.ts` (`removeStreams`).
Backend-first, атомарно, чесний count (краще за фронт-цикл із N збережень).
Видалення працює і над потоком, що записується (як одинична `remove_stream`), тож
для delete категорії «пропущено» нема — підсумок = «Видалено N».

### A10. Lifecycle — section-scoped (рішення №13)

- `pruneSelection(existingIds)` в ефекті StreamList на зміну `$streams` — прибирає
  зниклі id (після самих bulk-операцій), щоб лічильник лишався чесним. `existingIds`
  = `$streams.get()` (усі наявні), **не** видимий список — тож рядок, тимчасово
  схований **зміною статусу** під активним чипом (напр. recording→idle при чипі
  «Запис»), з виділення **не** випадає (лише явна зміна фільтра очищає, нижче).
- **Шов «виділення ↔ видимість»:** виділення тримається на `$streams` (усі наявні);
  visible-scoped операції (предикат Ctrl+A «всі видимі виділені», індекс фокуса A8)
  читають **видимий** список, а лічильник `[N вибрано]` й bulk-видалення діють на
  **повну** множину. Наслідок: `[N вибрано]` може врахувати рядок, схований фільтром
  після зміни статусу — **прийнятно** (лічильник чесний щодо реального виділення).
- **Очищення** виділення (+ **скидання якоря**, A2): зміна фільтра (в
  `handleChipClick`/`handleResetFilter`), перемикання профілю (`profile-changed` у
  `useProfileSync` — формально зайве щодо prune, бо `$streams` повністю заміняється,
  але робимо явно, щоб лічильник упав одразу, без чекання на ефект), вихід із секції
  (`$activeSection !== "streams"`), Escape (A4).
- **Збереження:** сортування, Tab/F6 між тулбаром і списком, відкриття власних
  діалогів (confirm).

## Зміни по файлах

- **`src/stores/streams.ts`** — `$streamSelection`; `replaceSelection`,
  `pruneSelection`.
- **`src/hooks/useCompositeList.ts`** — (1) рефактор `resolveKeyAction` + `switch
  (action)`; (2) split `case ' '` за ctrl; (3) опції `selection`/`onSelectionChange`;
  (4) `anchorRef`/`anchorBaseRef` + механіка toggle/range/all/clear; (5) делегований
  `onClick` на `<ul>` для миші. Зняти REFACTOR-TRIGGER-коментар.
- **`src/components/common/composite-list/CompositeList.tsx`** — прокинути
  `selection`/`onSelectionChange` у хук; додати їх у `CompositeListProps`.
- **`src/components/common/composite-list/CompositeRow.tsx`** — без змін логіки
  (миша — на `<ul>`); за потреби `aria-keyshortcuts` доповнити (необов'язково).
- **`src/components/streams/StreamItem.tsx`** — проп `isSelected`; суфікс у
  `summaryLabel`; `data-selected` + клас підсвітки.
- **`src/components/streams/StreamList.tsx`** — будує `selection`-адаптер над
  `$streamSelection`; читає виділення `useStore` для рендера рядків; `streamsRef`
  (видимий порядок на момент виклику, A8); bulk `ConfirmDialog` + виконання + фокус
  (індекс над `streamsRef`, після закриття діалогу); `onSelectionChange` → `announce`;
  expose `requestBulkDelete()` (хендл → `ZoneEntry & { requestBulkDelete() }`);
  маршрутизація `delete`/⋯ за виділенням (№15).
- **`src/components/streams/StreamContextMenu.tsx` / `StreamItem` пропси** —
  `Delete`-пункт несе кількість в accessible name, коли рядок виділений
  («Видалити виділені (N)»); на невиділеному — одиничний (№15/№16). *Тільки delete*
  (move/copy масові — віха B).
- **`src/components/streams/StreamsPanel.tsx`** — 2 кнопки + `[N вибрано]`; оновити
  `toolbarRefs` (12) і **всі** індексні коментарі — зокрема колокований у `ScreenZone`
  («all 8 interactive items (indices 0–7)») вже **застарів** (фактично 10/0–9), стане
  12/0–11; lifecycle-очищення (фільтр/профіль/секція); кнопки «Виділити все/Зняти»
  кличуть `announce` самі (A7); проп `onEmpty` тепер **відкладено фокусує** порожню
  зону (A8: прапорець + ефект на перехід, а не синхронно), а не no-op; читає
  `$streamSelection` через `useStore`.
- **`src-tauri/src/commands/stream_commands.rs`** + **`lib.rs`** — `remove_streams`.
- **`src/lib/tauri.ts`** — `removeStreams(ids)`.
- **i18n (paraglide):** `selection_suffix` («виділено»), `stream_selected`/
  `stream_deselected` ({name}), `selection_count` ({count} — «Виділено {count}»;
  безособове, без plural-форм), `selection_cleared`, `select_all`/`clear_selection`,
  `selected_count_label` ({count} — «{count} вибрано»), `delete_selected` ({count}),
  `confirm_delete_selected` ({count}), `streams_removed_bulk` ({count}). Регенерувати
  через vite-plugin.
- **Документація — вже застосовано на етапі цієї спеки** (наявні doc-розбіжності, не
  forward-фічі): `keyboard-shortcuts.md` Tier 2′ — дописано наявний `Ctrl+C`,
  виправлено стан рядка `Delete` (одинична гілка вже в коді → ✅; bulk → ⬜), додано
  **carve-out** для list-scoped Ctrl-комбо всередині `role="application"` (NVDA у focus
  mode), що знімає суперечність інваріанта «лише функційні/спец-клавіші» з наявним
  `Ctrl+C` і майбутніми Ctrl+Space/Ctrl+A; додано ⬜-рядки `Ctrl+Space`/`Ctrl+A`/`Shift+↑↓`
  і clear-гілку `Escape`. `accessibility.md` — §3.1: прибрано `aria-live` з лічильника
  «{n} вибрано»; під §3: нота про єдиний канал оголошень виділення + звірка з реальним
  `role="application"`-списком (ескізи §3.1–§3.6 — історичний grid).
- **Документація — лишається на цикл реалізації віхи A** (бо описує ще не зібрану
  поведінку): перемкнути ⬜→✅ у Tier 2′ для Ctrl+Space/Ctrl+A/Shift+↑↓/Escape-clear,
  коли код зайде; F1-довідка (`ShortcutsHelp`) — додати нові комбо в групу «list»
  (reserved-guard, як `row-menu`) **лише після** реалізації (F1 показує робочі шорткати,
  не ⬜).

## Поза обсягом (YAGNI)

- Move/copy масові, `StreamTransferDialog` під множину — **віха B**.
- Експорт виділених, запис/зупинка виділених, динамічні назви Export/RecordAll/
  StopAll — **віха C**.
- Узагальнення adapter-а на songs/profiles/browser/schedule/PatternList — **віха D**.
- Жодних змін у решті списків.
- Без undo для bulk-видалення (одинична дія undo теж не має — поза парасолькою).

## Критерії приймання

1. **Виділення з клавіатури:** Ctrl+Space toggle активного (+ якір); Shift+↓/↑
   діапазон від якоря (розширення **і** звуження); Ctrl+A toggle всіх видимих;
   Escape очищає непорожнє (інакше проходить далі). Space лишається record/play.
2. **Виділення мишею:** простий клік згортає до рядка; Ctrl+Click toggle;
   Shift+Click спан; подвійний клік — primary-дія; кліки по кнопках рядка не
   чіпають виділення.
3. **NVDA:** суфікс «, виділено» в назві рядка; одиничний toggle → негайне
   оголошення з назвою+станом; груповий жест → одне зведене «Виділено N»; clear →
   «Виділення знято». Без подвійного озвучення.
4. **Масове видалення:** за наявності виділення `Delete`, ⋯-меню (на виділеному
   рядку) і тулбар-кнопка діють на множину; один `ConfirmDialog` із точною
   кількістю; після видалення `$streams` оновлюється один раз, оголошення «Видалено N».
5. **Фокус після видалення:** найближчий уцілілий рядок на/після верхнього
   видаленого індексу (рахується з множини виділення); хвіст → новий останній;
   усе видиме → порожня зона (empty-profile або filter-empty), сфокусована
   програмно через `onEmpty`; **ніколи `<body>`**; незалежно від тригера.
6. **Lifecycle:** фільтр/профіль/вихід із секції очищають; сорт і Tab/F6 зберігають;
   зниклі id авто-prune; `[N вибрано]` чесний.
7. **Тулбар:** «Виділити все/Зняти» (toggle, лише видимі) і «Видалити виділені (N)»
   (aria-disabled без виділення, кількість у видимому тексті = accessible name).
8. `pnpm test` і `pnpm vite:build` — зелені; ручна перевірка циклу виділення →
   видалення з NVDA.

## План тестів (гейти: `pnpm test` + `pnpm vite:build`, НЕ `tsc`)

- **`useCompositeList.test.tsx`:**
  - паритет рефактора: наявні клавіші (ArrowDown, Tab, Enter, Delete, Ctrl+C,
    Space=toggle) працюють як раніше;
  - Ctrl+Space → `selection.replace` з доданим/знятим id + `onSelectionChange{single}`,
    **не** record/play;
  - Shift+↓ розширює, Shift+↑ після цього **звужує** (база-знімок);
  - Ctrl+A: з частковим виділенням → всі видимі; з повним → порожньо;
  - Escape: непорожнє → clear + consume; порожнє → не consume;
  - миша: простий клік → `replace({id})`; Ctrl+Click toggle; Shift+Click спан;
    клік по кнопці рядка не чіпає виділення; усі мишачі жести шлють `via:"pointer"`;
  - Ctrl+Space на кнопці-дії (action-play/menu) теж toggle **рядка** (не гейтиться
    `isNativeControl`); плоский Space на кнопці лишається нативним;
  - **anchorBase-guard:** після зовнішнього `replaceSelection(∅)` перший Shift+↓ дає
    рівно `{cursor}` (стара база НЕ воскресає);
  - `onSelectionChange` payload (kind/via/count/lastId/selected) для кожного жесту.
- **`stores/streams` тест:** `replaceSelection`, `pruneSelection`.
- **`StreamList`/`StreamItem` тест:** суфікс у `aria-label` виділеного рядка;
  bulk-`ConfirmDialog` показує точний count; `removeStreams` викликано з множиною;
  `$streams` оновлено один раз; фокус → найближчий уцілілий (НЕ `<body>`); фокус
  рахується над **відфільтрованим/сортованим** видимим порядком, не повним
  `$streams`; хвіст → останній; видалено весь видимий профіль → `onEmpty` фокусує
  add-examples (НЕ
  `<body>`); видалено весь видимий **під фільтром** (інші лишились) → `onEmpty`
  фокусує reset-filter; одиничний (клавіатура) vs груповий `announce`, а
  pointer-одиничний `announce` **не** дублюється; ⋯ delete на невиділеному згортає
  до рядка.
- **`StreamsPanel` тест:** кнопки/лейбли/`aria-disabled` за станом виділення;
  тулбар-`requestBulkDelete` тригерить діалог; тулбар «Виділити все/Зняти» кличе
  `announce` («Виділено N» / «Виділення знято»); lifecycle-очищення (фільтр/секція);
  roving 12 елементів коректний.
- **Rust:** `remove_streams` — `retain` лишає невидалені, одне збереження, count
  чесний; ідемпотентно щодо неіснуючих id.
- **Ручний NVDA:** виділити (Ctrl+Space / Shift+↓ / Ctrl+A) → почути суфікс +
  «Виділено N» → Delete → підтвердити → фокус на уцілілому + «Видалено N».
