# Клавіатурні шорткати — реєстр

- **Тип:** живий довідник (reference), **не** ADR. Тут — *що забіндано зараз*;
  *чому* саме так — у відповідних ADR (посилання в рядках).
- **Оновлювати:** при кожному додаванні/зміні названого шортката (Tier 1–2).
- **Останнє звірення з кодом:** 2026-06-14 (Tier 2′: дописано наявний `Ctrl+C`,
  виправлено стан `Delete`, додано carve-out для list-scoped Ctrl-комбо; решта — 2026-06-11).

## Як читати

Шорткати живуть у **трьох шарах**. Колізії бувають лише між Tier 1 і Tier 2
(глобальні названі комбінації) — їх і тримаємо в таблицях. Tier 3 (віджетні
ARIA-клавіші) узагальнено абзацом, бо це не «названі» шорткати, а інтринсік
патернів.

- **Scope** — `OS` (працює навіть коли вікно не у фокусі) / `webview` (лише коли
  фокус у застосунку).
- **Стан** — ✅ реалізовано · ⬜ вирішено, реалізація попереду.
- **Конфіг** — перепризначається користувачем лише Tier 1 (OS); Tier 2/2′ — хардкод
  за дизайном. Чому саме така асиметрія —
  [ADR: асиметрія конфігурованості](decisions/2026-06-07-shortcut-configurability-asymmetry.md).

## Tier 1 — OS-глобальні, конфігуровні

Реєструються через `tauri-plugin-global-shortcut`
([shortcuts.rs](../src-tauri/src/shortcuts.rs)); дефолти — у `HotkeyMap`
([settings.rs:115-122](../src-tauri/src/settings.rs#L115-L122)); перепризначаються
користувачем у Settings → Hotkeys ([KeyRecorder.tsx](../src/components/settings/KeyRecorder.tsx)).
Записане комбо валідується проти зарезервованих webview-клавіш
([reservedShortcuts.ts](../src/lib/reservedShortcuts.ts)): не можна призначити
OS-хоткей на `Ctrl+K`/`Alt+digit`/`F6`/… — гард і реєстр поділяють той самий
намір (KB-09).

| Комбо (дефолт) | Дія | Scope | Стан |
|---|---|---|---|
| `Ctrl+Shift+R` | toggle_recording (запис/зупинка всього активного профілю + toast) | OS | ✅ |
| `Ctrl+Shift+P` | toggle_playback | OS | ✅ |
| `Ctrl+Alt+Up` | volume_up (+5%) | OS | ✅ |
| `Ctrl+Alt+Down` | volume_down (−5%) | OS | ✅ |
| `Ctrl+Shift+H` | toggle_window (показати/сховати) | OS | ✅ |
| `Ctrl+Shift+S` | stop_all (зупинити весь запис, тост для NVDA) | OS | ✅ |
| `Ctrl+Alt+Left` | prev_track (попередній трек/потік; через webview-міст) | OS | ✅ |
| `Ctrl+Alt+Right` | next_track (наступний трек/потік; через webview-міст) | OS | ✅ |
| `Ctrl+Shift+U` | toggle_mute (вимкнути/увімкнути звук) | OS | ⬜ |

> ⬜-кандидат toggle_mute — з KB-12 (беклог шорткатів вилучено як виконаний):
> відкладено (2026-06-10) — mute-логіка живе у фронтенді (`$muteState`). Міст
> Rust→webview для таких дій уже існує (подія `transport-skip` для
> prev/next_track — [shortcuts.rs](../src-tauri/src/shortcuts.rs) →
> [transportControl.ts](../src/lib/transportControl.ts)); mute лишається
> окремою задачею. Глобальний stop-playback не додаємо (`Ctrl+Shift+P`
> достатньо). Дефолт — `Ctrl+Shift+U`, **не** `Ctrl+Shift+M` (початковий
> кандидат, відхилено 2026-06-11): `Ctrl+Shift+M` — глобальний mute мікрофона
> в MS Teams і Discord; красти його під час дзвінка заради audio-mute плеєра —
> найгірший із можливих конфліктів.

### Принципи вибору Tier-1 дефолтів (2026-06-11)

OS-глобальний хоткей забирає комбінацію в **усіх** застосунків, поки Tapir
запущений, тож критерій вибору — не єдиний стиль, а мінімум шкоди:

1. **Літери — `Ctrl+Shift`, стрілки — `Ctrl+Alt`.** Не `Ctrl+Alt+літера`:
   на європейських розкладках `Ctrl+Alt` = AltGr, глобальний хоткей ламав би
   ввід символів (`AltGr+S` = «ś» польською; `ґ` на українській розширеній).
   Не `Ctrl+Shift+стрілки/Home/End` — це системне виділення тексту
   (слово/абзац/до краю документа), критичне для NVDA-користувачів; саме
   тому volume переїхав з `Ctrl+Shift+Up/Down` на `Ctrl+Alt+Up/Down`
   (2026-06-11), а prev/next від початку на `Ctrl+Alt+←/→`.
2. **Не красти високочастотні комбо месенджерів/офісу** (приклад: відхилений
   `Ctrl+Shift+M` ↑). Низькочастотні крадіжки (hard reload браузера на
   `Ctrl+Shift+R`, Save As на `Ctrl+Shift+S`) — свідомий компроміс на користь
   мнемоніки: частій дії — зручна комбінація, конфлікт лікується KeyRecorder'ом.
3. **`Ctrl+Alt+стрілки` vs NVDA:** у browse mode це навігація по таблицях.
   Конфлікт м'який: NVDA перехоплює клавіатуру раніше за `RegisterHotKey`,
   тож у таблиці виграє NVDA (наш хоткей просто не спрацьовує саме там),
   поза таблицями — ми. Користувачу нічого не ламаємо — зрідка не
   спрацьовуємо самі. Свідомий компроміс.
4. **Дефолт мусить бути в межах токенів KeyRecorder** (літери, цифри,
   стрілки, `Space`, `F1–F24`, `Pause` — [KeyRecorder.tsx](../src/components/settings/KeyRecorder.tsx)
   `codeToToken`), інакше користувач не зможе його перезаписати.
5. **Зміна дефолту не мігрує збережені налаштування:** старе значення в
   `settings.json` (хоч кастомне, хоч колишній дефолт) лишається —
   per-field `#[serde(default)]` підставляє новий дефолт лише відсутнім полям
   (тест `stored_volume_combos_are_not_migrated`,
   [settings.rs](../src-tauri/src/settings.rs)).

**Користувачу, що вперся в конфлікт:** кишені `Ctrl+Shift+F1–F12` практично
вільні системно (точкові винятки в Office/IDE), `F13–F24` — вільні гарантовано
(фізично відсутні; для програмованих клавіатур), `Pause` — семантично ідеальна
для playback, якщо вона є на клавіатурі. KeyRecorder приймає всі три родини.

### SMTC: системні медіа-клавіші

Апаратні медіа-клавіші (⏯, кнопки гарнітури, Bluetooth-пульти) керують
відтворенням через [SMTC-сесію](frd/2026-06-11-smtc-integration.md)
(`src-tauri/src/smtc.rs`), а не через глобальні хоткеї — ОС маршрутизує їх
кооперативно, нічого не крадучи в інших плеєрів. SMTC **доповнює** Tier 1,
дефолти хоткеїв не змінює; запис через SMTC невиразимий принципово
(toggle_recording / stop_all лишаються тільки хоткеями). Вимикається в
Settings → Hotkeys («Інтеграція з системними медіа-кнопками»). SMTC
Play/Pause ділить debounce-cell із хоткеєм toggle_playback — одночасне
натискання дає одну дію.

## Tier 2 — глобальні у webview

Один **capture**-фазний `window` keydown-listener
([useGlobalShortcuts.ts](../src/hooks/useGlobalShortcuts.ts)). Усі майбутні
app-level шорткати додавати в реєстр `SHORTCUTS`, не в панелі (надійніше за
`onKeyDown` контейнера — react-aria контроли поглинають bubbling). Хардкод (не
конфігуровні) — свідомо, бо scope=webview: колізії лише в нашому контролі
([ADR](decisions/2026-06-07-shortcut-configurability-asymmetry.md)).

| Комбо | Дія | Умова | Scope | Стан | Джерело мотивації |
|---|---|---|---|---|---|
| `Ctrl+K` | командна палітра (toggle) | — | webview | ✅ | [command-palette ADR](decisions/2026-05-31-command-palette-and-search-ux.md) · [accessibility.md §2.4](accessibility.md) |
| `Ctrl+,` | діалог налаштувань (toggle) | — | webview | ✅ | — |
| `Alt+1` | секція Streams | — | webview | ✅ | [section-navigation ADR](decisions/2026-06-02-section-navigation-shortcuts.md) |
| `Alt+2` | секція Browser | — | webview | ✅ | ↑ |
| `Alt+3` | секція Wishlist | — | webview | ✅ | ↑ |
| `Alt+4` | секція Schedule | після Phase 3D | webview | ⬜ | ↑ |
| `Alt+5` | секція Songs | — | webview | ✅ | ↑ |
| `Alt+0` | секція Profiles | після Phase 3F | webview | ✅ | ↑ |
| `Ctrl+N` | Add Stream | `$activeSection === "streams"` | webview | ✅ | [context-aware ADR](decisions/2026-06-02-context-aware-keyboard-shortcuts.md) |
| `Ctrl+N` | Додати патерн до wishlist | `$activeSection === "wishlist"` | webview | ⬜ | ↑ |
| `Ctrl+N` | Новий профіль | `$activeSection === "profiles"` | webview | ⬜ | ↑ |
| `F1` | довідник гарячих клавіш (open-once, модаль з реєстру) | — | webview | ✅ | відкривність (a11y) |

> `Alt+digit` нумерує секції за порядком в ActivityBar; `Alt+0` — Profiles
> (винесено окремо вгорі). Чому `Alt`, а не `Ctrl`: NVDA у browse mode перехоплює
> частину `Ctrl`-комбінацій — деталі в section-navigation ADR.
>
> Контекстні дії (як `Ctrl+N`) гейтяться на `$activeSection`. Той самий ключ може
> в майбутньому означати різне на різних екранах (Browser → wishlist, Profiles →
> новий профіль) — таблиця-розширення в context-aware ADR.
>
> Реалізація: диспетч єдиний — чистий `matchShortcut` ([shortcuts.ts](../src/lib/shortcuts.ts))
> над реєстром `SHORTCUTS`, що його поділяють слухач
> [useGlobalShortcuts.ts](../src/hooks/useGlobalShortcuts.ts), гард
> [reservedShortcuts.ts](../src/lib/reservedShortcuts.ts) і F1-довідник
> ([ShortcutsHelp.tsx](../src/components/common/ShortcutsHelp.tsx)).
> Порядок/digit секцій — спільний [sections.ts](../src/lib/sections.ts) (його ж
> читає ActivityBar) → застереження section-navigation ADR про дрейф нумерації
> знято: число й секція більше не дублюються.
>
> Фаза/подавлення: слухач працює у **capture**-фазі (як `F6`) і глушиться **лише**
> коли відкрита модаль (`isInModal`, [shortcutGuard.ts](../src/lib/shortcutGuard.ts)).
> Capture — бо react-aria контроли (напр. `SearchField` пошуку Browser) поглинають
> keydown у фазі спливання; bubble-слухач втрачав би хоткей із фокусом у такому
> полі. Текстове поле само хоткеї **не** глушить: усі Tier-2 комбо під модифікатором
> або `F1`, тож `Alt+2` працює навіть із фокусом у пошуку. Колізію з набором тексту
> мають лише немодифіковані клавіші рядка Tier 2′ (`Enter`/`F2`/`Delete`) — їх
> блокуватиме `useCompositeList`, не цей слухач (KB-14).

## Tier 2′ — named-навігація / керування (не app-дії)

Названі клавіші, що є навігаційними/керувальними примітивами, а **не**
перемикачами app-дій — тому живуть **не** в App.tsx-слухачі Tier 2 і **не**
конфігуровні. Колізій із Tier 1–2 не дають: це або функційні/спец-клавіші, або
**list-scoped Ctrl-комбо всередині `role="application"`** (де NVDA — у focus mode,
не browse; carve-out нижче). Scope — `webview` (фокус у вікні).

| Клавіша | Дія | Умова | Реалізація | Стан |
|---|---|---|---|---|
| `F6` / `Shift+F6` | циклічна навігація по зонах (вперед / назад), оголошення зони NVDA | поза модалем (`isInModal` — focus trap) | [useZoneNavigation.ts:58-71](../src/hooks/useZoneNavigation.ts#L58-L71) · [accessibility.md §2.3.1](accessibility.md#L109) | ✅ |
| `Shift+F10` / `ContextMenu` | меню рядка (еквівалент ПКМ) | фокус на рядку списку | [useCompositeList.ts:342-367](../src/hooks/useCompositeList.ts#L342-L367) · [accessibility.md §3.6](accessibility.md#L333) | ✅ |
| `Enter` | активувати рядок (Streams: record/play за `doubleClickAction` · Browser: додати · Songs: play · Profiles: switch · Wishlist: edit) | фокус на рядку списку | [useCompositeList.ts Enter-case](../src/hooks/useCompositeList.ts) → `onAction` списку | ✅ |
| `Shift+Enter` | **прослухати** рядок незалежно від налаштування (Streams: toggle відтворення · Browser: toggle прев'ю) | фокус на рядку Streams/Browser | модифікатори в `onAction` ([useCompositeList.ts](../src/hooks/useCompositeList.ts)); гілки: [StreamList.tsx](../src/components/streams/StreamList.tsx), [StationList.tsx](../src/components/browser/StationList.tsx) | ✅ |
| `Ctrl+Enter` | **записати** рядок незалежно від налаштування (лише Streams: toggle запису) | фокус на рядку Streams | ↑ | ✅ |
| `Ctrl+C` | копіювати щодо рядка (generic `copy`; Streams: URL потоку) | фокус на рядку списку | [useCompositeList.ts:274](../src/hooks/useCompositeList.ts#L274) (`e.code === "KeyC"`) → `onAction("copy")` списку | ✅ |
| `Ctrl+Space` | перемкнути виділення активного рядка (+ ставить якір) | фокус у списку з multi-select | [spec віхи A](superpowers/specs/2026-06-14-bulk-stream-operations-A-design.md) | ⬜ |
| `Ctrl+A` | виділити всі видимі / зняти (toggle) | фокус у списку з multi-select | ↑ | ⬜ |
| `Shift+↑` / `Shift+↓` | розширити / звузити діапазон виділення від якоря | фокус у списку з multi-select | ↑ | ⬜ |
| `F2` | редагувати / перейменувати рядок (Streams: edit · Songs/Profiles: rename) | фокус на рядку (де застосовно) | — | ⬜ |
| `Delete` | видалити рядок (з підтвердженням); за наявності виділення — масове видалення множини (Explorer-модель) | фокус на рядку списку | [useCompositeList.ts:361](../src/hooks/useCompositeList.ts#L361) → `onAction("delete")` → [StreamList.tsx](../src/components/streams/StreamList.tsx); bulk — [spec віхи A](superpowers/specs/2026-06-14-bulk-stream-operations-A-design.md) | одинично ✅ · bulk ⬜ |
| `Escape` | закрити палітру / діалог (або скасувати запис хоткея); **у списку з непорожнім виділенням — зняти виділення** (list-scoped, consume) | палітра / модаль / рекордер відкриті · або список із виділенням | палітра [CommandPalette.tsx:150](../src/components/common/CommandPalette.tsx#L150); Settings — react-aria `isDismissable` [SettingsDialog.tsx:35](../src/components/settings/SettingsDialog.tsx#L35); рекордер [KeyRecorder.tsx:51](../src/components/settings/KeyRecorder.tsx#L51); clear-selection — [spec віхи A](superpowers/specs/2026-06-14-bulk-stream-operations-A-design.md) | палітра/діалог ✅ · clear-selection ⬜ |

> `Shift+F10`/`ContextMenu` не обробляються окремо: WebView2 для всіх трьох
> (ПКМ, клавіша Menu, `Shift+F10`) емітить один `contextmenu` event — його й
> ловить `onContextMenu`, гасячи нативне меню та відкриваючи меню рядка. `Escape`
> у модалях Settings — нативний react-aria (`ModalOverlay isDismissable`); у
> hand-rolled палітрі — явний `if (e.key === "Escape")`.

> `F2` / `Delete` — контекстні дії рядка (focus mode), за desktop-list
> конвенцією.
>
> **Carve-out для list-scoped Ctrl-комбо.** Інваріант «лише функційні/спец-клавіші»
> стосується **глобального / section-scope** (де NVDA в browse mode перехоплює голі
> Ctrl-letter — quick-nav). **Усередині `role="application"`-списку NVDA — у focus
> mode** (browse-quick-nav вимкнено), тож list-scoped Ctrl-комбо безпечні: на цій
> підставі вже живе **`Ctrl+C`** (у коді [useCompositeList.ts](../src/hooks/useCompositeList.ts)),
> і на ній же стоятимуть `Ctrl+Space`/`Ctrl+A` виділення (spec віхи A). Ключове —
> вони **list-scoped** (обробляються в `onKeyDownCapture` списку, не у window-слухачі),
> тож поза списком не «крадуть» нічого. Тому `duplicate` (Profiles) усе одно лишаємо
> **тільки** в меню рядка (`Shift+F10`): для нього окремий list-scoped гард не писали,
> а голий section-scope Ctrl-letter саме й ризикований у browse mode.
>
> `Shift+Enter`/`Ctrl+Enter` — **фіксована** семантика (Shift = слухати,
> Ctrl = записати), вона не інвертується разом із `doubleClickAction`: стабільна
> м'язова пам'ять важливіша за симетрію «протилежної дії». Миша дзеркалить
> клавіатуру: `Shift+`/`Ctrl+`подвійний клік — те саме ([CompositeRow.tsx](../src/components/common/composite-list/CompositeRow.tsx)).
> Рядки анонсують комбо через `aria-keyshortcuts`; обидва є в F1-довіднику
> (група «Списки») і зарезервовані проти KeyRecorder. На Songs `Shift+Enter`
> збігається з голим `Enter` (play) — окремої гілки нема; на Profiles/Wishlist
> модифікатори свідомо не мають дії (немає «слухати»/«записати»).

## Tier 3 — віджетні / ARIA (не named-шорткати)

Інтринсік патернів роумінг-фокуса й слайдерів; конвенційні, в реєстрі не
перелічуються порядково:

- **Слайдери** (гучність, позиція): `←/→`, `Home`/`End`, `PageUp`/`PageDown`,
  `↑/↓` — [VolumeSlider.tsx](../src/components/player/VolumeSlider.tsx),
  [PlaybackPosition.tsx](../src/components/player/PlaybackPosition.tsx).
- **Роумінг-фокус** у списках, тулбарах, плеєрі, ActivityBar: `Tab` (між зонами),
  `←/→` або `↑/↓` (всередині зони), `Home`/`End` —
  [usePlayerZoneNav.ts](../src/hooks/usePlayerZoneNav.ts),
  [useRovingFocus.ts](../src/hooks/useRovingFocus.ts),
  [useZoneNavigation](../src/hooks/useZoneNavigation.ts).

## Конвенції реалізації (обов'язкові)

1. **`e.code`, не `e.key`.** Метчити фізичну клавішу: `e.code === "KeyK"`,
   `"KeyN"`, `"Digit0".."Digit5"`, `"Comma"`. На кирилічній розкладці `e.key`
   повертає кирилицю (фізична K → «л», N → «т»), тож `e.key === "n"` ніколи не
   спрацює. Правило — [accessibility.md §12](accessibility.md); приклад у
   [App.tsx:137-139](../src/App.tsx#L137-L139).
2. **Tier 2 — лише в App.tsx-listener**, не в `onKeyDown` панелей.
3. **`preventDefault()`** на кожному перехопленому комбо.
4. **Ігнорувати `e.repeat`.** Tier-2 — це toggle/open-once дії; синтетичні
   авто-повтори утримуваної клавіші відкидаються на початку слухача
   ([App.tsx](../src/App.tsx#L135)), щоб held-комбо не «блимало». Кнопки на
   react-aria `usePress` (напр. mute) уже відкидають повтор самі.

## Звірення з ADR (2026-06-07)

- Код-приклади в обох ADR приведено до конвенції №1 (`e.code`, не `e.key`):
  [context-aware ADR](decisions/2026-06-02-context-aware-keyboard-shortcuts.md) →
  `e.code === "KeyN"`; [section-navigation ADR](decisions/2026-06-02-section-navigation-shortcuts.md)
  → `"Digit0".."Digit5"` (Numpad не матчиться — Alt+Numpad на Windows це alt-коди).
- Колізій між запланованими `Alt+0..5` / `Ctrl+N` і наявними `Ctrl+Shift+*`
  (Tier 1) немає.
