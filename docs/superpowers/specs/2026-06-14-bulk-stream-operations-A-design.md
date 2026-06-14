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
плюс дрібні **чисті** хелпери `replaceSelection(next)` і
`pruneSelection(existingIds)`. Atom — єдине джерело правди; тулбар (StreamsPanel),
список (StreamList) і рядок (StreamItem) читають його через `useStore` — **без**
prop-drilling крізь `CompositeList` (тулбар — сусідня зона). Узагальнення на 6
списків — пізніше (D); зараз atom streams-специфічний.

### A2. Контракт виділення в `useCompositeList` — «хук володіє механікою, споживач — текстом»

Opt-in. Адаптер — **двометодовий міст** до atom; уся механіка (toggle, діапазон,
select-all, clear, count, якір) живе **в хуку**:

```ts
interface CompositeSelection {
  current: () => ReadonlySet<string>;          // event-time знімок (atom.get)
  replace: (next: ReadonlySet<string>) => void; // store робить $streamSelection.set
}
interface SelectionChange {
  kind: "single" | "group";  // single = Ctrl+Space/Ctrl+Click; group = діапазон/all/clear
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
переміщеннях; Shift-жести якір **не** рухають. Без `selection` — хук поводиться
як зараз (інші списки нічого не передають).

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

`case ' '` розгалужується за `e.ctrlKey`: з Ctrl → select-toggle; без — наявна
record/play-гілка.

### A5. Мишача модель (рішення №11, №15) — на `<ul>`, як `onContextMenu`

Новий делегований `onClick` на `<ul>` (лише коли `selection` передано):
- **Простий клік** по рядку → згорнути виділення до цього рядка (`replace({id})`),
  зробити активним + якорем. Кліки по власних контролах рядка
  (`button,a,input,select,textarea`) — ігнор (нехай діють самі).
- **Ctrl+Click** → toggle цього рядка (= Ctrl+Space).
- **Shift+Click** → спан якір→клік.
- **Подвійний клік** → без змін (primary-дія через наявний `onActivate` у Row).

### A6. ARIA/NVDA (рішення №9)

- **Суфікс в accessible name:** до `aria-label` виділеного рядка додається
  `«, виділено»` (будується в `StreamItem` з нового пропа `isSelected`).
- **Зрячим:** CSS-підсвітка виділених рядків (`data-selected` + клас; `forced-colors:`
  через `Highlight`/`HighlightText`), візуально відмінна від active-row/recording/
  playing-фону.
- **Оголошення — лише через центральний LiveAnnouncer** (`announce`), один канал;
  тулбар-лічильник — **візуальний, НЕ live** (інакше NVDA озвучить двічі):
  - **одиничний** toggle → негайний `announce` («{name}, виділено» / «{name}, знято
    з виділення») — фокус не рухається, тож NVDA сам мовчить;
  - **груповий** жест → рівно **одне** зведене `announce` («Виділено N»); Shift-стрілки
    додатково рухають фокус, тож NVDA озвучить новий рядок із суфіксом поверх одного
    зведеного; clear → `announce` («Виділення знято»).

> Узгодження з accessibility.md §3.1: ескіз із per-toolbar `aria-live` лічильником —
> з історичного table/grid-чернетки (примітка doc 2026-04-23). Стан виділення
> їде центральним announcer'ом. Додати в §3 короткий абзац-уточнення.

`onSelectionChange` віддає **дані** (kind/count/lastId/selected); локалізований
рядок добирає `StreamList` (має `streams` для пошуку назви + `useAnnounce`).

### A7. Тулбар (StreamsPanel) — стабільні кнопки (рішення №2, №17, №18)

Roving зростає 10 → **12**. На початку **рядка 2** (перед «Записати все») —
кластер виділення: `[N вибрано] · Виділити все/Зняти · Видалити виділені (N)`.
Нові індекси: Add 0, Import 1, Export 2, **SelectAll 3, DeleteSelected 4**,
RecordAll 5, StopAll 6, chips 7–9, sorts 10–11 (оновити `toolbarRefs` і
колоковані коментарі про індекси).

- **Виділити все/Зняти:** label перемикається за «всі видимі виділені» (дзеркало
  Ctrl+A); `aria-disabled` коли немає видимих рядків; діє на `sortedStreams`.
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
`focusItem` з `imperativeExtra`).

Виконання: `tauri.removeStreams([...selection])` → успіх → `$streams.set(filter
без видалених)`, очистити виділення, `announce(«Видалено N»)`.

**Фокус (окремо від живої реконсиляції):** верхній видалений індекс рахується з
**множини виділення** над видимим списком; цільовий рядок — перший уцілілий
на/після цього індексу (новий останній, якщо видалено хвіст; зона порожнього
стану через `onEmpty`, якщо видалено все), фокусується **програмно**
(`focusItem`/`pendingFocusRef`) — **ніколи `<body>`**. Кнопка-тригер на цей момент
`aria-disabled` (count→0), тож конкуренції за фокус немає.

### A9. Бекенд — `remove_streams(stream_ids) -> usize`

Нова Rust-команда в [stream_commands.rs](../../../src-tauri/src/commands/stream_commands.rs):
одна ітерація стоп-записів, один `retain`, **одне** збереження, повертає кількість
видалених. Реєстрація в `lib.rs`; обгортка в `lib/tauri.ts` (`removeStreams`).
Backend-first, атомарно, чесний count (краще за фронт-цикл із N збережень).
Видалення працює і над потоком, що записується (як одинична `remove_stream`), тож
для delete категорії «пропущено» нема — підсумок = «Видалено N».

### A10. Lifecycle — section-scoped (рішення №13)

- `pruneSelection(existingIds)` в ефекті StreamList на зміну `$streams` — прибирає
  зниклі id (після самих bulk-операцій), щоб лічильник лишався чесним.
- **Очищення** виділення: зміна фільтра (в `handleChipClick`/`handleResetFilter`),
  перемикання профілю (`profile-changed` у `useProfileSync`), вихід із секції
  (`$activeSection !== "streams"`).
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
  `$streamSelection`; читає виділення `useStore` для рендера рядків; bulk
  `ConfirmDialog` + виконання + фокус; `onSelectionChange` → `announce`; expose
  `requestBulkDelete()`; маршрутизація `delete`/⋯ за виділенням (№15).
- **`src/components/streams/StreamContextMenu.tsx` / `StreamItem` пропси** —
  `Delete`-пункт несе кількість в accessible name, коли рядок виділений
  («Видалити виділені (N)»); на невиділеному — одиничний (№15/№16). *Тільки delete*
  (move/copy масові — віха B).
- **`src/components/streams/StreamsPanel.tsx`** — 2 кнопки + `[N вибрано]`; оновити
  `toolbarRefs` (12) і індексні коментарі; lifecycle-очищення (фільтр/профіль/секція);
  читає `$streamSelection` через `useStore`.
- **`src-tauri/src/commands/stream_commands.rs`** + **`lib.rs`** — `remove_streams`.
- **`src/lib/tauri.ts`** — `removeStreams(ids)`.
- **i18n (paraglide):** `selection_suffix` («виділено»), `stream_selected`/
  `stream_deselected` ({name}), `selection_count` ({count} — «Виділено {count}»;
  безособове, без plural-форм), `selection_cleared`, `select_all`/`clear_selection`,
  `selected_count_label` ({count} — «{count} вибрано»), `delete_selected` ({count}),
  `confirm_delete_selected` ({count}), `streams_removed_bulk` ({count}). Регенерувати
  через vite-plugin.
- **Документація:** `keyboard-shortcuts.md` Tier 2′ — додати Ctrl+Space, Ctrl+A,
  Escape (clear), Shift+↑↓ (list-scoped); `accessibility.md` §3 — абзац про
  центральний канал оголошень виділення; F1-довідка (`ShortcutsHelp`) — нові комбо
  в групі «list» (reserved-guard, як `row-menu`).

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
   усе → зона порожнього стану; **ніколи `<body>`**; незалежно від тригера.
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
    клік по кнопці рядка не чіпає виділення;
  - `onSelectionChange` payload (kind/count/lastId/selected) для кожного жесту.
- **`stores/streams` тест:** `replaceSelection`, `pruneSelection`.
- **`StreamList`/`StreamItem` тест:** суфікс у `aria-label` виділеного рядка;
  bulk-`ConfirmDialog` показує точний count; `removeStreams` викликано з множиною;
  `$streams` оновлено один раз; фокус → найближчий уцілілий (НЕ `<body>`); хвіст →
  останній; усе → `onEmpty`; одиничний vs груповий `announce`; ⋯ delete на
  невиділеному згортає до рядка.
- **`StreamsPanel` тест:** кнопки/лейбли/`aria-disabled` за станом виділення;
  тулбар-`requestBulkDelete` тригерить діалог; lifecycle-очищення (фільтр/секція);
  roving 12 елементів коректний.
- **Rust:** `remove_streams` — `retain` лишає невидалені, одне збереження, count
  чесний; ідемпотентно щодо неіснуючих id.
- **Ручний NVDA:** виділити (Ctrl+Space / Shift+↓ / Ctrl+A) → почути суфікс +
  «Виділено N» → Delete → підтвердити → фокус на уцілілому + «Видалено N».
