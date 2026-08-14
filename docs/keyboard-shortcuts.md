# Клавіатурні шорткати — реєстр

- **Тип:** живий довідник (reference), **не** ADR. Тут — *що забіндано зараз*;
  *чому* саме так — у відповідних ADR (посилання в рядках).
- **Оновлювати:** при кожному додаванні/зміні названого шортката (Tier 1–2).
- **Останнє звірення з кодом:** 2026-08-14 (hotkeys-expansion: Tier 2 — `Ctrl+M`
  (mute) і `F9` («що зараз відтворюється»); Tier 2′ — `F4` (теги рядка Записів),
  `F2` на Записах ⬜→✅; додано конвенцію 5 — пріоритет анонсів);
  2026-08-09 (grilling help-intro: `Alt+4` (секція Schedule)
  реалізовано — [shortcuts.test.ts:68](../src/lib/shortcuts.test.ts) `"maps Alt+4 →
  schedule (shipped in Phase 3D)"` — стан виправлено ⬜→✅, умова «після Phase 3D» лишена
  як історична, за прецедентом рядка `Alt+0`);
  2026-08-09 (Tier 2′: `F5` / `Shift+F5` —
  копіювати / перенести в інший профіль у списку потоків; обидві резервуються
  проти KeyRecorder, тому виправлено твердження в розділі гарду, що він приймає
  `F5`);
  2026-08-07 (додано розділ «Подавлені акселератори
  WebView2 (гард)» — `F5`-родина, `F3`/`F7`/`F11` і нативне контекстне меню поза
  текстовими полями; шарів шорткатів це не змінює);
  2026-06-20 (Tier 2′: віха D — модель виділення
  (`Ctrl+Space`/`Ctrl+A`/`Shift+↑↓`/`Escape`/bulk-`Delete`) розкочена на **всі**
  композитні списки: streams, songs, profiles, schedule, patterns (wishlist/ignorelist),
  browser; per-list bulk-дія зафіксована у примітці до Tier 2′);
  2026-06-18: реалізовано віху A — виділення `Ctrl+Space`/`Ctrl+A`/`Shift+↑↓`,
  bulk-`Delete`, `Escape`-clear переведено ⬜→✅;
  2026-06-14: дописано наявний `Ctrl+C`, виправлено стан `Delete`, carve-out для
  list-scoped Ctrl-комбо; решта — 2026-06-11).

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
| `Ctrl+Shift+K` | toggle_playback (джерело-залежний: стрім → **зупинити**; файл → **пауза/відновлення** з позиції; холодний старт → **відновити** останнє джерело). Розділяє debounce з tray Play/Pause і SMTC. | OS | ✅ |
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
> окремою задачею. **Ґрунт для нього готовий (2026-08-14):** дія, її guard і
> формулювання живуть у [muteControl.ts](../src/lib/muteControl.ts), куди вже
> дзвонять кнопка плеєра й webview-`Ctrl+M` — мосту лишиться викликати
> `toggleMute()`. `Ctrl+M` цього кандидата **не закриває**: він webview-scope
> (працює лише з фокусом у вікні), `Ctrl+Shift+U` — OS-scope. Глобальний stop-playback не додаємо (`Ctrl+Shift+K`
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
відтворенням через SMTC-сесію
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
| `Ctrl+,` | налаштування програми — тільки глобальні (toggle) | — | webview | ✅ | — |
| `Ctrl+Shift+,` | налаштування активного профілю (toggle) | — | webview | ✅ | [global-vs-profile-settings-boundary ADR](decisions/2026-08-08-global-vs-profile-settings-boundary.md) |
| `Alt+1` | секція Streams | — | webview | ✅ | section-navigation ADR |
| `Alt+2` | секція Browser | — | webview | ✅ | ↑ |
| `Alt+3` | секція Wishlist | — | webview | ✅ | ↑ |
| `Alt+4` | секція Schedule | після Phase 3D | webview | ✅ | ↑ |
| `Alt+5` | секція Songs | — | webview | ✅ | ↑ |
| `Alt+0` | секція Profiles | після Phase 3F | webview | ✅ | ↑ |
| `Ctrl+N` | Add Stream | `$activeSection === "streams"` | webview | ✅ | [context-aware ADR](decisions/2026-06-02-context-aware-keyboard-shortcuts.md) |
| `Ctrl+N` | Додати патерн до wishlist | `$activeSection === "wishlist"` | webview | ⬜ | ↑ |
| `Ctrl+N` | Новий профіль | `$activeSection === "profiles"` | webview | ⬜ | ↑ |
| `F1` | довідник гарячих клавіш (open-once, модаль з реєстру) | — | webview | ✅ | відкривність (a11y) |
| `Ctrl+M` | вимкнути/увімкнути звук (toggle; анонс **стану**) | плеєр не зупинено | webview | ✅ | TapinRadio `Ctrl+M`, YouTube `M`; [hotkeys-expansion](backlog/p2-hotkeys-expansion.md) |
| `F9` | сказати, що зараз відтворюється (фокус не рухається) | — | webview | ✅ | TapinRadio `F11` (Announce currently playing song); `F11` тут зайнятий fullscreen'ом |

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
> полі. Текстове поле само хоткеї **не** глушить: усі Tier-2 комбо або під
> модифікатором, або функційні (`F1`, `F9`), тож `Alt+2` працює навіть із фокусом
> у пошуку. Колізію з набором тексту
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
| `Ctrl+Enter` | **записати** рядок незалежно від налаштування (Streams: toggle запису · Songs: показати файл у провіднику) | фокус на рядку Streams/Songs | ↑; гілка Songs: [SongsList.tsx](../src/components/songs/SongsList.tsx) | ✅ |
| `Alt+Enter` | **відкрити** рядок у зовнішній програмі за замовчуванням (лише Songs) | фокус на рядку Songs | ↑ → `open_song_in_app` ([songs_commands.rs](../src-tauri/src/commands/songs_commands.rs)) | ✅ |
| `Ctrl+C` | копіювати щодо рядка (generic `copy`; Streams: URL потоку) | фокус на рядку списку | [useCompositeList.ts:274](../src/hooks/useCompositeList.ts#L274) (`e.code === "KeyC"`) → `onAction("copy")` списку | ✅ |
| `Ctrl+Space` | перемкнути виділення активного рядка (+ ставить якір) — у **всіх** композитних списках (streams, songs, profiles, schedule, patterns, browser) | фокус у списку з multi-select | [useCompositeList.ts](../src/hooks/useCompositeList.ts) `resolveKeyAction` → `selectToggle` | ✅ |
| `Ctrl+A` | виділити всі видимі / зняти (toggle) — у **всіх** композитних списках | фокус у списку з multi-select | ↑ (`selectAll` / `clearSelection`) | ✅ |
| `Shift+↑` / `Shift+↓` | розширити / звузити діапазон виділення від якоря — у **всіх** композитних списках | фокус у списку з multi-select | ↑ (`selectRangeUp` / `selectRangeDown`) | ✅ |
| `F2` | редагувати / перейменувати рядок (Streams: edit/rename · Songs: перейменувати файл · Profiles: rename — заплановано) | фокус на рядку (де застосовно) | generic `edit`-інтент [useCompositeList.ts](../src/hooks/useCompositeList.ts) `resolveKeyAction`→`onAction("edit")`; гілки [StreamList.tsx](../src/components/streams/StreamList.tsx)→`$editStream`, [SongsList.tsx](../src/components/songs/SongsList.tsx)→`RenameDialog`; reserved у [shortcuts.ts](../src/lib/shortcuts.ts) | Streams ✅ · Songs ✅ · Profiles ⬜ |
| `F4` | редагувати **вміст** рядка (Songs: редактор тегів). Конвенція Total Commander / FAR: `F2` = ім'я, `F4` = вміст. **Будь-який** модифікатор → відмова від матчу, щоб `Alt+F4` лишалась системним закриттям вікна | фокус на рядку Записів | generic `edit-content`-інтент [useCompositeList.ts](../src/hooks/useCompositeList.ts) `resolveKeyAction`→`onAction("edit-content")`; гілка [SongsList.tsx](../src/components/songs/SongsList.tsx)→`TagEditorDialog`; reserved у [shortcuts.ts](../src/lib/shortcuts.ts) | Songs ✅ · решта — не заводимо |
| `F5` | копіювати в інший профіль (Streams): за наявності виділення — **усе виділення**, інакше сфокусований рядок; ціль питає `StreamTransferDialog` | фокус на рядку потоків | generic `transfer-copy`-інтент [useCompositeList.ts](../src/hooks/useCompositeList.ts) `resolveKeyAction`→`onAction("transfer-copy")`; гілка [StreamList.tsx](../src/components/streams/StreamList.tsx)→`openTransfer`; reserved у [shortcuts.ts](../src/lib/shortcuts.ts) | Streams ✅ · решта — не заводимо |
| `Shift+F5` | перенести в інший профіль (Streams), та сама модель виділення; **одиночний** маршрут блокується на активному потоці (запис / грає через наш плеєр) з озвученою причиною — bulk ні (бекенд пропускає активні сам) | ↑ | ↑ (`transfer-move`); гард — `isRecordingLike` ([streamState.ts](../src/lib/streamState.ts)) + `$playerStatus`, та сама умова, що `moveDisabled` у [StreamContextMenu.tsx](../src/components/streams/StreamContextMenu.tsx) | Streams ✅ |
| `Delete` | видалити рядок (з підтвердженням); за наявності виділення — масове видалення множини (Explorer-модель) — у **всіх** списках, крім browser (там немає Delete; bulk-дія browser — «Додати виділені» через тулбар/кластер, не клавіша) | фокус на рядку списку | [useCompositeList.ts:361](../src/hooks/useCompositeList.ts#L361) → `onAction("delete")` → per-list bulk handler; bulk-видалення: streams/songs/profiles/schedule; bulk-remove: patterns (wishlist/ignorelist) | одинично ✅ · bulk ✅ |
| `Escape` | закрити палітру / діалог (або скасувати запис хоткея); **у списку з непорожнім виділенням — зняти виділення** (list-scoped, consume) — у **всіх** композитних списках | палітра / модаль / рекордер відкриті · або список із виділенням | палітра [CommandPalette.tsx:150](../src/components/common/CommandPalette.tsx#L150); Settings — react-aria `isDismissable` [SettingsDialog.tsx:35](../src/components/settings/SettingsDialog.tsx#L35); рекордер [KeyRecorder.tsx:51](../src/components/settings/KeyRecorder.tsx#L51); clear-selection — [useCompositeList.ts](../src/hooks/useCompositeList.ts) `clearSelection` | палітра/діалог ✅ · clear-selection ✅ |

> `Shift+F10`/`ContextMenu` не обробляються окремо: WebView2 для всіх трьох
> (ПКМ, клавіша Menu, `Shift+F10`) емітить один `contextmenu` event — його й
> ловить `onContextMenu`, гасячи нативне меню та відкриваючи меню рядка. `Escape`
> у модалях Settings — нативний react-aria (`ModalOverlay isDismissable`); у
> hand-rolled палітрі — явний `if (e.key === "Escape")`.

> **Per-list bulk-дії (Milestone D, 2026-06-20).** Клавіші виділення
> (`Ctrl+Space`/`Ctrl+A`/`Shift+↑↓`/`Escape`/`Delete`) однакові у всіх
> композитних списках. Bulk-дія за наявності виділення залежить від списку:
>
> | Список | Bulk-дія |
> |---|---|
> | streams | bulk-delete (з підтвердженням) |
> | songs | bulk-delete до кошика (поточний файл, що грає, — пропускається) |
> | profiles | bulk-delete (активний профіль — вибираємо, але пропускаємо при видаленні) |
> | schedule | bulk-delete |
> | patterns (wishlist / ignorelist) | bulk-remove |
> | browser | **bulk-add-selected** — додати до активного профілю (тулбар / кластер зони; `Delete` не діє; фокус не рухається; live-підсумок «Додано N, пропущено M (дублікати)») |

> `F2` / `F4` / `Delete` — контекстні дії рядка (focus mode), за desktop-list
> конвенцією. `F2`/`F4` діють **тільки на сфокусований рядок** (виділення
> ігнорують — на відміну від `Delete`/`F5`/`Shift+F5` нижче) і ведуть у ті самі
> діалоги, що й ⋯-меню рядка.
>
> **`F5`/`Shift+F5`: із Total Commander запозичено лише клавішу, не модель.**
> `F5` = Copy — конвенція Norton Commander, успадкована TC і FAR; серед незрячих
> користувачів TC — стандарт де-факто, тож м'язова пам'ять клавіші коштує дешево.
> Але в TC `F5` копіює у **другу видиму панель** (ціль очевидна до натискання) —
> у Tapir другої панелі немає, ціль питає `StreamTransferDialog`. Не варто
> очікувати двопанельної семантики.
>
> **Чому move — `Shift+F5`, а не `F6` (як у TC).** `F6` недоторканний: він уже
> зайнятий зонною навігацією (Tier 2′ вище) і це платформна конвенція Microsoft
> (`F6` = перемикання панелей, `Shift+F6` — назад), a11y-критична. Тому move
> переїхав на `Shift+F5` — свідоме відхилення від TC (там `Shift+F5` = копіювати
> з перейменуванням). NVDA не біндить ані голі `F5`/`F6`, ані `Shift+F5`/`F6`
> (Commands Quick Reference 2026.1.1), тож зі скрінрідером конфлікту немає.
>
> **Пастка, яку видно лише в лейблах F1:** `Delete`, `F5` і `Shift+F5` з
> клавіатури діють на **все виділення**, навіть якщо сфокусований рядок до нього
> не входить (⋯-меню натомість маршрутизує по `.has(id)`). Розбіжність свідома —
> внутрішня консистентність клавіатури важливіша за симетрію клавіатура↔меню.
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
> `Shift+Enter`/`Ctrl+Enter`/`Alt+Enter` — **фіксована** семантика (Shift = слухати,
> Ctrl = записати, Alt = віддати зовнішній програмі), вона не інвертується разом із
> `doubleClickAction`: стабільна м'язова пам'ять важливіша за симетрію «протилежної
> дії». Миша дзеркалить клавіатуру: `Shift+`/`Ctrl+`подвійний клік — те саме
> ([CompositeRow.tsx](../src/components/common/composite-list/CompositeRow.tsx)).
> Рядки анонсують комбо через `aria-keyshortcuts`; усі три є в F1-довіднику
> (група «Списки») і зарезервовані проти KeyRecorder. На Songs запису немає, тож
> `Ctrl` вільний і віддається допоміжній навігації (провідник), а `Alt+Enter` —
> зовнішньому плеєру; `Shift+Enter` там збігається з голим `Enter` (play) —
> окремої гілки нема. На Profiles/Wishlist модифікатори свідомо не мають дії.
>
> Модифікатори діють **лише на `Enter`** (`primary`). `Space` (`toggle`) приходить
> у `onAction` з тими самими модифікаторами, але списки їх ігнорують: `Alt+Space`
> не дублює `Alt+Enter` (а `Ctrl+Space` узагалі не долітає — його забирає
> selection-toggle у `resolveKeyAction`).

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

## Подавлені акселератори WebView2 (гард)

Не шар шорткатів, а його протилежність: клавіші, які **нічого не роблять**, бо
їхній браузерний дефолт шкідливий. Гард —
[useWebviewGuard.ts](../src/hooks/useWebviewGuard.ts) (перелік —
[webviewAccelerators.ts](../src/lib/webviewAccelerators.ts)), capture-фазний
`window`-слухач поруч із Tier-2, викликається з [App.tsx](../src/App.tsx).

| Клавіші | Дефолт WebView2, який гасимо | Умова |
|---|---|---|
| `F5` · `Ctrl+F5` · `Shift+F5` · `Ctrl+Shift+F5` | reload webview | будь-які модифікатори |
| `Ctrl+R` · `Ctrl+Shift+R` · `Cmd+R` | reload webview | `ctrl`/`meta`, **без** `alt` (AltGr) |
| `F3` | find next | будь-які модифікатори |
| `F7` | caret browsing (перемикає режим уведення під NVDA) | ↑ |
| `F11` | fullscreen (ховає рамку вікна, від якої залежить NVDA-трекінг) | ↑ |
| ПКМ · `Shift+F10` · `ContextMenu` | нативне меню WebView2 (з пунктом Reload) | **поза** текстовим полем |

> **Наслідок, який слід знати:** поза списками контекстного меню в застосунку
> **немає взагалі** — ні мишею, ні клавішею Applications, ні `Shift+F10`.
> Натискання просто нічого не робить (тиша, без оголошення). Це свідоме рішення,
> а не пропуск: власних контекстних дій поза списками немає, а нативне меню
> корисного не пропонує. Меню **рядків списків** працює як раніше — його дає
> [useCompositeList.ts](../src/hooks/useCompositeList.ts) (Tier 2′ вище).
> У текстових полях (`<input>` text-типів, `<textarea>`, `contenteditable`)
> нативне меню лишається — щоб не ламати «Вставити». На слайдерах
> (`<input type="range">`) меню подавлюється: нативне там порожнє.
>
> **Конвенція 4 («ігнорувати `e.repeat`») на гард не поширюється** — і це
> свідомо. Вона написана під Tier-2, де кожне комбо — toggle/open-once, тож
> авто-повтор мусить відкидатись, щоб дія не «блимала». Тут навпаки: **кожна**
> повторна подія несе власний браузерний дефолт, і пропустити бодай одну —
> означає перезавантажити webview на утримуваній `F5`.
>
> **Гард гасить дефолт, але не забирає клавішу:** лише `preventDefault()`,
> **ніколи** `stopPropagation()`. Саме тому подавлені клавіші лишаються вільними
> для застосунку — і `F5`/`Shift+F5` цим уже скористались: у списку потоків це
> «Копіювати / Перенести в профіль» (Tier 2′ вище). Наслідок для KeyRecorder:
> `F5` і `Shift+F5` тепер **резервуються** в `SHORTCUTS` (`row-copy-profile` /
> `row-move-profile`), тож під OS-хоткей їх призначити не можна;
> `F3`/`F7`/`F11` лишаються вільними — у `SHORTCUTS` їх немає.
>
> Порядок трьох шарів на `F5` при діагностиці: `useWebviewGuard` (capture на
> `window`, лише `preventDefault`) → `onKeyDownCapture` списку (`consume()` =
> `preventDefault` + `stopPropagation`) → усе інше. Гард завжди встигає першим,
> тому список робить `stopPropagation` лише на **своєму** матчі: `Ctrl+F5`/`Alt+F5`
> у `resolveKeyAction` повертають `null` (відмова від матчу), а не «матч із
> порожньою дією».
>
> **Свідомо поза переліком:** `Ctrl+Plus`/`Ctrl+Minus`/`Ctrl+0` (зум — окремий
> запис [webview-zoom-hotkeys](backlog/p2-webview-zoom-hotkeys.md)), `Alt+F4`
> (системне закриття вікна, не браузерний акселератор), `Ctrl+F` (споживає
> Tier-2), `F12` (у прод-збірці Tauri мертвий без `devtools`-feature),
> `Ctrl+P`/`Ctrl+S` (шкідливого ефекту не мають). Devtools у debug-збірці
> відкриває Rust ([lib.rs](../src-tauri/src/lib.rs), між `show()` і `set_focus()`),
> а не `F12`/контекстне меню.

## Конвенції реалізації (обов'язкові)

1. **`e.code`, не `e.key`.** Метчити фізичну клавішу: `e.code === "KeyK"`,
   `"KeyN"`, `"Digit0".."Digit5"`, `"Comma"`. На кирилічній розкладці `e.key`
   повертає кирилицю (фізична K → «л», N → «т»), тож `e.key === "n"` ніколи не
   спрацює. Правило — [accessibility.md §12](accessibility.md); приклад у
   [App.tsx:137-139](../src/App.tsx#L137-L139).
2. **Tier 2 — лише в App.tsx-listener**, не в `onKeyDown` панелей.
3. **`preventDefault()`** на кожному перехопленому комбо.
4. **Ігнорувати `e.repeat`** (Tier-2; **не** стосується гарду акселераторів —
   див. розділ вище). Tier-2 — це toggle/open-once дії; синтетичні
   авто-повтори утримуваної клавіші відкидаються на початку слухача
   ([App.tsx](../src/App.tsx#L135)), щоб held-комбо не «блимало». Кнопки на
   react-aria `usePress` (напр. mute) уже відкидають повтор самі.
5. **Пріоритет анонсів: відповідь на натискання — `assertive`, фонова подія —
   `polite`.** Користувач щойно натиснув клавішу й чекає на відповідь саме
   зараз (`Ctrl+M` — стан звуку, `F9` — що грає, `F5` — причина відмови), тож
   черга ввічливих повідомлень тут неприйнятна. Навпаки, те, що сталося без
   його участі (трек змінився, запис завершився, список перечитано), не має
   переривати читання — це `polite`.

## Звірення з ADR (2026-06-07)

- Код-приклади в обох ADR приведено до конвенції №1 (`e.code`, не `e.key`):
  [context-aware ADR](decisions/2026-06-02-context-aware-keyboard-shortcuts.md) →
  `e.code === "KeyN"`; section-navigation ADR
  → `"Digit0".."Digit5"` (Numpad не матчиться — Alt+Numpad на Windows це alt-коди).
- Колізій між запланованими `Alt+0..5` / `Ctrl+N` і наявними `Ctrl+Shift+*`
  (Tier 1) немає.
