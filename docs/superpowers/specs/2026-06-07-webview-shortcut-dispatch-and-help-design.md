# Webview-шорткати: єдиний диспетч + F1-довідник — дизайн

- **Статус:** затверджено (brainstorming, 2026-06-07).
- **Гілка:** `feat/section-navigation-shortcuts`.
- **Реалізує ADR:** [section-navigation](../../decisions/2026-06-02-section-navigation-shortcuts.md)
  (`Alt+0..5`), [context-aware](../../decisions/2026-06-02-context-aware-keyboard-shortcuts.md)
  (`Ctrl+N`); відкривність (F1) — порожній бакет **P2** у
  [бэклозі](../../keyboard-shortcuts-backlog.md).
- **Реєстр клавіш:** [keyboard-shortcuts.md](../../keyboard-shortcuts.md) (рядки
  `Alt+digit`/`Ctrl+N`/`F1` нині ⬜).
- **Підхоплює відкладене:** KB-09-спека свідомо лишила «рефакторинг App.tsx-слухача,
  щоб він керувався тим самим списком» *поза скоупом*
  ([2026-06-07-kb09…](2026-06-07-kb09-keyrecorder-collision-detection-design.md#L158-L159)).
  Ця спека його й виконує.
- **Прецедент патерну:** чисті, юніт-тестовані lib-модулі
  [shortcutGuard.ts](../../../src/lib/shortcutGuard.ts) (KB-04),
  [reservedShortcuts.ts](../../../src/lib/reservedShortcuts.ts) (KB-09).

## Проблема

Три ⬜-класи названих webview-шорткатів чекають реалізації, а підготовча
робастність (KB-04 гард фокуса/модалей, KB-05 WebView2, KB-06 `e.repeat`) уже
готова:

1. **`Alt+0..5`** — перемикання секцій (section-navigation ADR);
2. **`Ctrl+N`** — контекстна дія «Add Stream» на екрані Streams (context-aware ADR);
3. **`F1`** — довідник гарячих клавіш (відкривність — найбільший a11y-виграш).

Наївна реалізація (inline-`if` у слухачі за зразком ADR-скетчів) поглибила б уже
наявну **триплікацію**: ті самі комбо перелічені в
[keyboard-shortcuts.md](../../keyboard-shortcuts.md) (док), у
[reservedShortcuts.ts](../../../src/lib/reservedShortcuts.ts) (гард KeyRecorder) і
(після реалізації) у слухачі [App.tsx](../../../src/App.tsx). Порядок/`disabled`
секцій дублюється між [ActivityBar.tsx](../../../src/components/layout/ActivityBar.tsx)
і скетчем `Alt+digit` — а section-navigation ADR сам застерігає: «якщо порядок
секцій зміниться, числа зміщуються».

## Узгоджені рішення

1. **Скоуп:** `Alt+0..5` (усі) + `Ctrl+N` **лише для Streams** (решта секцій —
   документований-майбутнє; диспетч робить додавання однорядковим) + `F1`-довідник.
2. **Архітектура — повна уніфікація (варіант A):** дві чисті реєстр-таблиці
   (`sections` + `shortcuts`) як єдине джерело істини + чистий, юніт-тестований
   `matchShortcut`. **Усі** названі webview-комбо (зокрема наявні `Ctrl+K`/`Ctrl+,`)
   ідуть через один диспетч; `reservedShortcuts` і F1-довідник **деривуються** з
   реєстрів.
3. **F1 = модаль, згенерована з реєстру** (не reuse палітри, не статичний список):
   найкраща відкривність, гасить триплікацію.
4. **Disabled-секція (`Alt+4` Schedule):** мовчки ігнорується (паритет із кліком по
   disabled-кнопці; стан і так оголошується при Tab у ActivityBar). У довіднику —
   показується.
5. **`F1` під тим самим гардом** `shouldIgnoreShortcut()`, що й решта Tier-2
   (консистентність; із текстового поля — спершу `Escape`).

## §1 Архітектура

Чисті реєстри (без імпорту сторів) → з них деривуються три споживачі. Сайд-ефекти
(`run`) ін'єктуються в диспетч як `actions`-обʼєкт, тож реєстр лишається чистим і
безпечним для імпорту з гарда/довідника.

```
src/lib/sections.ts      SECTIONS[]  (id, label, digit, disabled)
        │
        ├──────────────► ActivityBar.tsx        (порядок, label, disabled)
        │
        └─ генерує ────►┐
src/lib/shortcuts.ts    │ SHORTCUTS[]  (combo, label, group, match?, when?, run?, reserved?)
        │               └ 6× section-nav записів
        │
        ├─ matchShortcut(e, ctx) ─► App.tsx window-слухач ─► hit.run(actions, ctx)
        ├─ .filter(reserved) ─────► reservedShortcuts.ts ─► HotkeysTab (KB-09 гард)
        └─ групування по `group` ─► KeyboardShortcutsDialog (F1)
```

**Без циклів:** `shortcuts.ts` імпортує лише `sections.ts` + paraglide + тип
`Section`. `reservedShortcuts.ts` і `KeyboardShortcutsDialog` імпортують
`shortcuts.ts`. Сайд-ефекти живуть в `App.tsx` (`actions`), де імпорт сторів
природний.

## §2 Модуль `src/lib/sections.ts`

Метадані секцій у порядку `Alt+digit` (індекс === digit). Єдине джерело порядку й
`disabled`, яке раніше дублювалось у `ActivityBar` та ADR-скетчі.

```ts
import type { Section } from "../stores/navigation";
import * as m from "../i18n/paraglide/messages";

export interface SectionMeta {
  id: Section;
  label: () => string;   // i18n-getter (читає локаль при виклику)
  digit: number;         // Alt+<digit>
  disabled?: boolean;    // секція ще не активна (Schedule до Phase 3D)
}

export const SECTIONS: readonly SectionMeta[] = [
  { id: "profiles", label: m.profiles_section, digit: 0 },
  { id: "streams",  label: m.streams_section,  digit: 1 },
  { id: "browser",  label: m.browser_section,  digit: 2 },
  { id: "wishlist", label: m.wishlist_section,  digit: 3 },
  { id: "schedule", label: m.schedule_section,  digit: 4, disabled: true },
  { id: "songs",    label: m.songs_section,     digit: 5 },
];
```

- **Іконки/`phase`** свідомо **не тут** — це презентація, лишаються локально в
  `ActivityBar` (lib не імпортує UI-іконки). Див. §7.
- Profiles стоїть першим (`digit: 0`), решта — `1..5`: точно мапиться на візуальну
  розкладку ActivityBar (Profiles окремо вгорі, секції 1–5 нижче).

## §3 Модуль `src/lib/shortcuts.ts`

### Типи

```ts
import type { Section } from "../stores/navigation";

export type ShortcutGroup = "global" | "navigation" | "context" | "list";

export interface ShortcutCtx { activeSection: Section }

export interface ShortcutActions {
  setSection(s: Section): void;
  toggleCommandPalette(): void;
  toggleSettings(): void;
  openAddStream(): void;
  openHelp(): void;
}

export interface Shortcut {
  id: string;                 // стабільний id дії, напр. "section:streams"
  combo: string;              // канонічний акселератор ("Ctrl+K", "Alt+1", "F1")
  label: () => string;        // i18n-назва для довідника/повідомлення гарда
  group: ShortcutGroup;       // групування у F1-довіднику
  reserved?: boolean;         // ⇒ потрапляє в RESERVED_WEBVIEW_COMBOS
  match?: (e: KeyboardEvent) => boolean;     // присутній ⇒ диспетчиться централізовано
  when?: (ctx: ShortcutCtx) => boolean;      // контекстний гейт (секція / disabled)
  run?: (a: ShortcutActions, ctx: ShortcutCtx) => void;
}
```

### Записи

Усі `match` — на `e.code` (фізична клавіша), за
[конвенцією №1 / accessibility.md §12](../../accessibility.md) (на кирилиці `e.key`
не матчиться); модифікатори перевіряються точно (щоб `Alt+1` не спрацював на
`Ctrl+Alt+1` тощо). Numpad навмисно не матчиться (`Alt+Numpad` = alt-коди Windows).

| id | combo | group | match (скорочено) | when | run | reserved |
|---|---|---|---|---|---|---|
| `command-palette` | `Ctrl+K` | global | `(ctrl\|meta)&&code=KeyK` | — | `toggleCommandPalette` | ✅ |
| `settings` | `Ctrl+,` | global | `(ctrl\|meta)&&code=Comma` | — | `toggleSettings` | ✅¹ |
| `help` | `F1` | global | `code=F1`, без модиф. | — | `openHelp` | ✅ |
| `section:*` (×6) | `Alt+0..5` | navigation | `alt&&!ctrl&&!shift&&code=Digit{n}` | `!disabled` | `setSection(id)` | ✅ |
| `new:streams` | `Ctrl+N` | context | `(ctrl\|meta)&&code=KeyN` | `activeSection==="streams"` | `openAddStream` | ✅ |
| `zone-nav` | `F6` | navigation | — (handled у [useZoneNavigation](../../../src/hooks/useZoneNavigation.ts)) | — | — | ✅ |
| `zone-nav-back` | `Shift+F6` | navigation | — | — | — | ✅ |
| `row-menu` | `Shift+F10` | list | — (handled у [useCompositeList](../../../src/hooks/useCompositeList.ts)) | — | — | ✅ |

¹ `Ctrl+,` нині нереєстровний KeyRecorder-ом (`codeToToken("Comma")===null`) —
лишається для наміру/futureproof, як у наявному `reservedShortcuts.ts`.

**Section-nav генеруються з `SECTIONS`** (не пишуться руками):

```ts
const sectionShortcuts: Shortcut[] = SECTIONS.map((s) => ({
  id: `section:${s.id}`,
  combo: `Alt+${s.digit}`,
  label: s.label,
  group: "navigation",
  reserved: true,
  match: (e) => e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey
             && e.code === `Digit${s.digit}`,
  when: () => !s.disabled,
  run: (a) => a.setSection(s.id),
}));
```

**Tier 2′-записи (`F6`/`Shift+F6`/`Shift+F10`)** — без `match`: вони обробляються
власними хуками, але присутні в реєстрі, щоб (а) показатись у F1-довіднику, (б)
лишитись зарезервованими в гарді KeyRecorder. (Невпроваджені `Enter`/`F2`/`Delete`
з Tier 2′ — **не** додаємо: показувати в довіднику те, чого ще нема, оманливо.)

### Чистий матчер

```ts
export function matchShortcut(e: KeyboardEvent, ctx: ShortcutCtx): Shortcut | null {
  for (const s of SHORTCUTS) {
    if (!s.match || !s.match(e)) continue;
    if (s.when && !s.when(ctx)) continue;
    return s;
  }
  return null;
}
```

Чистий (жодних сайд-ефектів — `match`/`when` чисті) → тривіально тестовний:
дай синтетичний `{ code, altKey, ctrlKey, shiftKey, metaKey }` + `ctx`, перевір
`id` результату. `e.repeat`-гард лишається у слухачі (§4), не в матчері.

## §4 Слухач `App.tsx`

`useEffect`-слухач ([App.tsx:136-161](../../../src/App.tsx#L136-L161)) згортається;
inline-блоки `Ctrl+K`/`Ctrl+,` зникають (вони тепер записи реєстру). `actions`
будується раз зі сторів.

```ts
useEffect(() => {
  const actions: ShortcutActions = {
    setSection: (s) => $activeSection.set(s),
    toggleCommandPalette: () => $commandPaletteOpen.set(!$commandPaletteOpen.get()),
    toggleSettings: () => $settingsDialogOpen.set(!$settingsDialogOpen.get()),
    openAddStream: () => $showAddStreamDialog.set(true),
    openHelp: () => $shortcutsHelpOpen.set(true),
  };
  const handler = (e: KeyboardEvent) => {
    if (e.repeat) return;                 // KB-06
    if (shouldIgnoreShortcut()) return;   // KB-04
    const ctx = { activeSection: $activeSection.get() };
    const hit = matchShortcut(e, ctx);
    if (hit) { e.preventDefault(); hit.run?.(actions, ctx); }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);
```

- Гарди `e.repeat` + `shouldIgnoreShortcut()` зберігаються (KB-04/KB-06) — порядок і
  семантика незмінні; наявні `Ctrl+K`/`Ctrl+,` отримують їх так само, як зараз.
- `preventDefault()` — лише на знайденому комбо (конвенція №3).

## §5 F1-довідник: store + компонент

- **Store:** новий `export const $shortcutsHelpOpen = atom<boolean>(false);` у
  [navigation.ts](../../../src/stores/navigation.ts) (поряд із `$commandPaletteOpen`).
- **Компонент:** `src/components/common/KeyboardShortcutsDialog.tsx` на
  react-aria `Modal`/`Dialog` (за зразком
  [SettingsDialog.tsx](../../../src/components/settings/SettingsDialog.tsx)) →
  безкоштовно focus-trap + `Escape`-dismiss (`isDismissable`), і його автоматично
  покриває `MODAL_SELECTOR` у `shouldIgnoreShortcut`. Підписаний на
  `$shortcutsHelpOpen`.
- **Рендер:** у `App()` поряд із `<CommandPalette/>`/`<SettingsDialog/>`.
- **Контент:** `SHORTCUTS`, згруповані по `group` (`global`→`navigation`→`context`→
  `list`); кожен рядок — `combo` (моноширинний бейдж) + `label()`. Заголовки груп і
  заголовок діалогу — нові i18n-ключі (§9).
- **Поведінка:** `F1` → `openHelp()` (open-once, ідемпотентно); `Escape` закриває
  через `isDismissable`. Коли діалог відкритий, `shouldIgnoreShortcut()` уже
  істинний (фокус у модалі), тож повторний `F1` не реентрить.

## §6 `reservedShortcuts.ts` — деривація

Хардкодний масив замінюється деривацією з реєстру; `findReservedConflict`
**без змін**:

```ts
import { SHORTCUTS } from "./shortcuts";
export const RESERVED_WEBVIEW_COMBOS = SHORTCUTS
  .filter((s) => s.reserved)
  .map(({ combo, label }) => ({ combo, label }));
```

- **Набір комбо = сьогоднішній + `F1`.** Поточні 12 (`Ctrl+K`, `Ctrl+,`,
  `Alt+0..5`, `Ctrl+N`, `F6`, `Shift+F6`, `Shift+F10`) лишаються; додається `F1`
  (тепер реальна webview-дія → має бути зарезервована, щоб OS-хоткей її не затінив).
- `reservedShortcuts.test.ts` оновлюється під `F1`; решта очікувань — без змін.
- Коментар-шапка `reservedShortcuts.ts` («Keep this list in sync with the registry»)
  стає **істинним за конструкцією** — список тепер дериватив.

## §7 `ActivityBar.tsx` — споживання `SECTIONS`

Локальний масив `SECTIONS` (рядки streams…songs) замінюється на спільний
[sections.ts](../../../src/lib/sections.ts):

- Profiles-кнопка ← запис `id==="profiles"`; група секцій ← решта
  (`streams…songs`) — **ті самі 5**, що й зараз.
- `Icon` і `phase` лишаються локальними (мапа `Record<Section, …>`) — презентація.
- **Роумінг-математика недоторкана:** `allRefs = [profileRef, …5 sectionRefs,
  settingsRef]`, `activeNavIndex` (profile=0, секції +1, Settings — footer) —
  без змін. Це найризикованіша частина рефактора; інваріант фіксуємо тестом
  ActivityBar, що вже існує (звірити перелік/порядок кнопок).

## §8 Поведінкові рішення (підсумок)

- **Disabled `Alt+4`:** `when: () => !disabled` → матчер повертає `null` → клавіша
  ігнорується (без `preventDefault`). Показується в довіднику.
- **Оголошення секції:** покладаємось на наявний перенос фокуса при зміні секції
  ([App.tsx:89-99](../../../src/App.tsx#L89-L99)) — паритет із кліком по ActivityBar;
  окремого announce немає. Якщо `Alt+N` натиснуто на вже-активній секції —
  no-op (фокус не переноситься).
- **`F1` при наборі тексту:** під тим самим `shouldIgnoreShortcut()` (єдина спірна
  точка — узгоджено лишити консистентним).

## §9 i18n

Додати в `en.json` + `uk.json` (і регенерувати paraglide через vite-плагін —
memory `typecheck-paraglide-gotchas`):

- `shortcuts_help_title` — EN «Keyboard shortcuts» / UK «Гарячі клавіші».
- `shortcuts_help_action` — label F1-запису та кнопки відкриття: EN «Keyboard
  shortcuts help» / UK «Довідник гарячих клавіш».
- Заголовки груп: `shortcuts_group_global`, `shortcuts_group_navigation`,
  `shortcuts_group_context`, `shortcuts_group_list`.

**Реюз наявних** (для записів реєстру): `command_palette_label`, `settings_title`,
`add_stream`, `*_section` (×6), `settings_hotkey_action_zone_nav`,
`settings_hotkey_action_row_menu`. Разом — **6 нових ключів ×2 мови**.

## §10 Тестування й гейти

- **`shortcuts.test.ts`** (за зразком `shortcutGuard.test.ts`):
  - `matchShortcut` повертає очікуваний `id` для кожного реалізованого комбо
    (`Ctrl+K`, `Ctrl+,`, `F1`, `Alt+0/1/2/3/5`, `Ctrl+N`@streams);
  - `Alt+4` (Schedule, disabled) → `null`;
  - `Ctrl+N` поза Streams → `null`;
  - `e.code`-безпека: подія з `code:"KeyN"`, `key:"т"` (кирилиця) матчиться;
  - точні модифікатори: `Ctrl+Alt+1` **не** дає `section:streams`;
  - Numpad: `code:"Numpad1"` з Alt → `null`.
- **`sections.test.ts`:** унікальність/послідовність `digit` (0..5), `id` збігаються
  з типом `Section`.
- **`reservedShortcuts.test.ts`:** оновити під дериватив + `F1`; вільний комбо →
  `null`; набір збігається з очікуваним.
- **`KeyboardShortcutsDialog.test.tsx`:** рендеряться всі групи з реалізованими
  записами; dismiss (`Escape`) закриває; відкриття по `$shortcutsHelpOpen`.
- **Гейти:** `pnpm test` + `pnpm vite:build` (tsc має ~51 наявних paraglide-помилок
  — не показник; memory `typecheck-paraglide-gotchas`).

## §11 Docs

- [keyboard-shortcuts.md](../../keyboard-shortcuts.md): рядки `Alt+0..5` / `Ctrl+N`
  (streams) / `F1` → `✅`; додати `F1` у Tier 2 (group global) і відмітити, що
  реєстр, гард і диспетч тепер деривуються зі спільних `sections.ts`/`shortcuts.ts`
  (єдине джерело — закриває застереження ADR про дрейф нумерації).
- [keyboard-shortcuts-backlog.md](../../keyboard-shortcuts-backlog.md): заповнити
  бакет **P2 (відкривність)** записом про F1-довідник `[x]`; за потреби — нотатка про
  реалізований `Alt+digit`/`Ctrl+N`.
- ADR-и [section-navigation](../../decisions/2026-06-02-section-navigation-shortcuts.md)
  / [context-aware](../../decisions/2026-06-02-context-aware-keyboard-shortcuts.md):
  статус «реалізація — попереду» → реалізовано; зазначити, що inline-скетч замінено
  на реєстр-диспетч (рішення про комбо незмінне).

## Поза скоупом

- `Ctrl+N` для **wishlist/profiles** (документований-майбутнє; додавання — один
  запис реєстру). Розбіжність реєстр↔ADR щодо «add to wishlist» (browser vs
  wishlist) вирішується тоді, не тут.
- Tier 2′ дії-рядка `Enter`/`F2`/`Delete` (окремий ⬜-клас).
- **KB-10** (reset-to-defaults), **KB-12** (нові OS-шорткати).
- Окреме голосове оголошення назви секції при `Alt+digit` (паритет із кліком —
  свідомо без нього).
