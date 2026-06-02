# Екран профілів — рефакторинг навігації на composite-список

**Дата:** 2026-06-02
**Гілка:** `feature/profiles-list-composite-nav` (від `feature/pahse-3F-profiles`)
**Статус:** затверджено до планування

## Мета

Привести навігацію екрана профілів у відповідність до екрана потоків: замінити
React Aria `ListBox` + бічну панель `ProfileActions` на кастомний composite-список
на `useCompositeList` з 2D-roving-фокусом (Up/Down між профілями, Left/Right між
сегментами рядка), inline-кнопками дій у кожному рядку та контекстним меню —
точно за патерном `StreamList` / `StreamItem` / `StreamContextMenu`.

## Рішення (з брейнштормінгу)

1. **Вимкнені inline-кнопки пропускаються** — список сегментів рядка
   обчислюється динамічно; для недоступної дії `<button>` взагалі не рендериться,
   тож Left/Right на неї не натрапляє.
2. **У контекстному меню недоступні дії показуються сірими** через `isDisabled`
   (меню завжди має стабільні 5 пунктів).
3. **Видима кнопка `⋯` у рядку лишається** (як у потоків) — 6-й inline-елемент
   (сегмент `action-menu`), хоч і дублює inline-дії.

## Архітектура та зони

Зони після рефакторингу: **було 3 → стало 2**.

- `profiles-toolbar` — **без змін**: Команди (Ctrl+K) / Новий профіль / Імпорт,
  горизонтальний `useRovingFocus`, Tab виходить у список.
- `profiles-list` — повноцінна composite-зона. `ProfileList` експортує `ZoneEntry`
  через `forwardRef`, як `StreamList`.
- ~~`profiles-actions`~~ — **видаляється** разом із `ProfileActions.tsx`.

`onZonesChange([toolbarZone, listZone])`. Профілі ніколи не порожні (завжди є
"Default"), тож empty-/filter-empty-зон не потрібно — простіше за потоки.

### Потік даних

`ProfilesPanel` лишається власником діалогів (`subDialog`, `nameInput`,
`nameError`, `busy`) і всіх `tauri.*`-хендлерів. Зміни:

- Хендлери більше не читають єдиний `selected` зі стану панелі — кожен
  викликається з іменем профілю **конкретного рядка** (inline-кнопка / пункт меню /
  Enter на summary передають `name`).
- Стан `selected` → `target`: профіль, на якому зараз відкрито діалог
  (rename / delete / duplicate / switch-confirm).
- Навігаційний «вибір» живе всередині `useCompositeList` (`activeItemId`);
  панель його не дублює.

## Модель рядка та сегментів

`getProfileSegments(profile, activeProfile)` — за аналогією з
`getStreamSegments(status)`. Порядок Left→Right:

```
summary (неявно перший)
  → action-switch      // лише якщо рядок ≠ активний профіль
  → action-duplicate   // завжди
  → action-rename      // лише якщо не "Default" і не активний
  → action-delete      // лише якщо не "Default" і не активний
  → action-export      // завжди
  → action-menu        // ⋯ завжди
```

Вимкнені дії **відсутні в списку сегментів** — їхніх `<button>` у рядку немає.

### Рядок (`ProfileItem`)

`<li role="listitem" data-segment="summary">`, як `StreamItem`:

- roving `tabIndex` через `isFocused("summary")`.
- `aria-roledescription` = «профіль» (нове `item_role_profile`).
- Візуал: іконка `CheckCircle` (`aria-hidden`) перед назвою **лише на активному**,
  назва, лічильник потоків справа (візуально; не окремий focus-stop).
- Складений `aria-label` рядка несе весь стан:
  - активний: `«Default, активний, 3 потоки»`
  - неактивний: `«Вечірнє радіо, 5 потоків»`
  - плюралізація лічильника — наявні `profile_stream_count_*`; «активний» — нове
    `profile_state_active`.
- Стан «активний» передається **лише** текстом у `aria-label` + візуальною
  іконкою. Поточний бейдж (`profile_active_badge`) прибирається.

### Кнопки

Icon-only (`ArrowRightLeft`, `Copy`, `Pencil`, `Trash2`, `Upload`, `⋯`). Кожна:

- власний focus-stop у Left/Right (roving `tabIndex` через `isFocused("action-…")`);
- `aria-label` з іменем профілю (напр. `profile_switch_named({name})`);
- іконка `aria-hidden`;
- активується нативно (Enter/Space/click) — хук не перехоплює (`isNativeControl`).

Група кнопок рядка — `role="group"` з `aria-label` (`profile_row_actions({name})`),
аналог обгортки дій у `StreamItem`.

### Enter / Space на summary

`onAction('primary' | 'toggle', name, 'summary')` → `handleSwitch(name)`:

- якщо `name === activeProfile` → `announce(profile_already_active)`, **без**
  перемикання;
- інакше → наявна логіка: перевірка активних записів → `switch-confirm`-діалог
  або одразу `doSwitch`.

## Контекстне меню (`ProfileContextMenu`)

Дзеркало `StreamContextMenu`: `MenuTrigger` + `Button` (видима `⋯`) + `Popover` +
`Menu`.

- Кнопка-тригер: `data-segment="action-menu"`, `data-context-menu-trigger`,
  `excludeFromTabOrder={!menuFocused}`, `aria-label={profile_actions({name})}`.
- Меню — **усі 5 пунктів завжди**; недоступні через `isDisabled`: Switch на
  активному; Rename/Delete для "Default"/активного. Duplicate/Export завжди
  активні. Кожен пункт — іконка (`aria-hidden`) + текст.
- Виклик: ПКМ по рядку (`onContextMenu` → клік тригера) і клавіша Menu / Shift+F10
  (`useCompositeList` `onAction('contextMenu', name)` → клік
  `[data-context-menu-trigger]`).
- Клавіша Delete → `onAction('delete', name)` → діалог підтвердження.

## a11y-структура

- `<ul role="application" aria-label={zone_profiles_list}>` — пригнічує неявні
  list-семантики, віддаючи навігацію хуку.
- `<li role="listitem">` з **явною** роллю (бо `application` знімає неявну) +
  `aria-roledescription` + складений `aria-label`.
- Жодного `aria-selected` / `ListBox`.

## Керування фокусом

- `restoreFocus`, focus-memory та live-reconciliation (видалення активного рядка →
  фокус на сусідній) — безкоштовно з `useCompositeList`. Поточний ручний
  `refocusList` / `requestAnimationFrame` у `ProfilesPanel` **видаляється**: після
  switch/delete хук сам відновить фокус.
- **Після create / duplicate / import / rename** новий/перейменований профіль має
  отримати фокус. `ProfileList` надає імперативний `focusProfile(name)`, який
  панель викликає після успішної операції; фолбек — `restoreFocus`.
- Закриття будь-якого діалогу повертає фокус у список.

## Зміни у файлах

- ✏️ `src/hooks/useCompositeList.ts` — **адитивно** розширити union `SegmentKind`
  (`action-switch`, `action-duplicate`, `action-rename`, `action-export`;
  `action-menu` та `action-delete` вже існують). Потоків не зачіпає.
- 🆕 `src/components/profile/ProfileItem.tsx` + `getProfileSegments()` (зразок
  `StreamItem.tsx`).
- 🆕 `src/components/profile/ProfileContextMenu.tsx` (зразок `StreamContextMenu.tsx`).
- ♻️ `src/components/profile/ProfileList.tsx` — переписати з `ListBox` на composite
  (`forwardRef<ZoneEntry>`, `useCompositeList`); експортує `focusProfile`.
- ✏️ `src/components/profile/ProfilesPanel.tsx` — прибрати `profiles-actions`-зону
  та монтаж `ProfileActions`; хендлери приймають `name`; `selected` → `target`;
  прибрати `refocusList`/rAF.
- ❌ `src/components/profile/ProfileActions.tsx` + `ProfileActions.test.tsx` —
  видалити.
- 🆕 i18n-повідомлення (uk + усі наявні локалі); видалити осиротілі
  (`profile_actions_label`, `profile_group_*`, `profile_active_badge`,
  `profile_list_label` за потреби).

### Нові i18n-повідомлення (орієнтовно)

`profile_state_active`, `profile_already_active`, `item_role_profile`,
`profile_row_actions`, `profile_switch_named`, `profile_duplicate_named`,
`profile_rename_named`, `profile_delete_named`, `profile_export_named`,
`profile_context_menu`.

## Тести (Vitest + Testing Library)

Адаптовані з `StreamList.test` / `StreamItem.test`:

- 2D-навігація: Up/Down між профілями, Left/Right між сегментами; вимкнені дії
  пропускаються.
- Enter на summary активного → оголошення «вже активний», без перемикання; на
  неактивному → switch (+гілка confirm за активних записів).
- Inline-кнопки викликають правильні хендлери з іменем рядка.
- Контекстне меню: ПКМ / Menu / Shift+F10 відкриває; недоступні пункти `isDisabled`.
- a11y: складений `aria-label` рядка (активний/неактивний + лічильник),
  `role="application"` / `listitem`, `aria-roledescription`.
- Реконсиляція: видалення активного рядка → фокус на сусідній.
- Фокус після create / rename / duplicate → на відповідному профілі.

## Поза обсягом (YAGNI)

Фільтри/чіпи, метрики-бар, drag-reorder, мультивибір — спека не просить.
