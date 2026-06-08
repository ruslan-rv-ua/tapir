# Клавіатурні шорткати — реєстр

- **Тип:** живий довідник (reference), **не** ADR. Тут — *що забіндано зараз*;
  *чому* саме так — у відповідних ADR (посилання в рядках).
- **Оновлювати:** при кожному додаванні/зміні названого шортката (Tier 1–2).
- **Останнє звірення з кодом:** 2026-06-07.

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
| `Ctrl+Shift+Up` | volume_up (+5%) | OS | ✅ |
| `Ctrl+Shift+Down` | volume_down (−5%) | OS | ✅ |
| `Ctrl+Shift+H` | toggle_window (показати/сховати) | OS | ✅ |
| `Ctrl+Shift+M` | toggle_mute (вимкнути/увімкнути звук) | OS | ⬜ |
| `Ctrl+Shift+S` | stop_all (зупинити весь запис) | OS | ⬜ |
| `Ctrl+Shift+Right` / `Ctrl+Shift+Left` | наступний / попередній трек у плеєрі (потребує моделі черги) | OS | ⬜ |

> ⬜-кандидати `Ctrl+Shift+M` / `Ctrl+Shift+S` / `Ctrl+Shift+←→` — з
> [KB-12](keyboard-shortcuts-backlog.md#L173); патерн `Ctrl+Shift+*`, без колізій з
> webview-резервами (валідація KeyRecorder, KB-09).

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
> ([KeyboardShortcutsDialog.tsx](../src/components/common/KeyboardShortcutsDialog.tsx)).
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
конфігуровні. Колізій із Tier 1–2 не дають (функційні/спец-клавіші). Scope —
`webview` (фокус у вікні).

| Клавіша | Дія | Умова | Реалізація | Стан |
|---|---|---|---|---|
| `F6` / `Shift+F6` | циклічна навігація по зонах (вперед / назад), оголошення зони NVDA | поза модалем (`isInModal` — focus trap) | [useZoneNavigation.ts:58-71](../src/hooks/useZoneNavigation.ts#L58-L71) · [accessibility.md §2.3.1](accessibility.md#L109) | ✅ |
| `Shift+F10` / `ContextMenu` | меню рядка (еквівалент ПКМ) | фокус на рядку списку | [useCompositeList.ts:342-367](../src/hooks/useCompositeList.ts#L342-L367) · [accessibility.md §3.6](accessibility.md#L333) | ✅ |
| `Enter` | активувати рядок (Streams: play/stop · Songs: play · Profiles: switch) | фокус на рядку списку | — | ⬜ |
| `F2` | редагувати / перейменувати рядок (Streams: edit · Songs/Profiles: rename) | фокус на рядку (де застосовно) | — | ⬜ |
| `Delete` | видалити рядок (з підтвердженням) | фокус на рядку списку | — | ⬜ |
| `Escape` | закрити палітру / діалог (або скасувати запис хоткея) | палітра / модаль / рекордер відкриті | палітра [CommandPalette.tsx:150](../src/components/common/CommandPalette.tsx#L150); Settings — react-aria `isDismissable` [SettingsDialog.tsx:35](../src/components/settings/SettingsDialog.tsx#L35); рекордер [KeyRecorder.tsx:51](../src/components/settings/KeyRecorder.tsx#L51) | ✅ |

> `Shift+F10`/`ContextMenu` не обробляються окремо: WebView2 для всіх трьох
> (ПКМ, клавіша Menu, `Shift+F10`) емітить один `contextmenu` event — його й
> ловить `onContextMenu`, гасячи нативне меню та відкриваючи меню рядка. `Escape`
> у модалях Settings — нативний react-aria (`ModalOverlay isDismissable`); у
> hand-rolled палітрі — явний `if (e.key === "Escape")`.

> `Enter` / `F2` / `Delete` — нові ⬜ контекстні дії рядка (focus mode), за
> desktop-list конвенцією. `duplicate` (Profiles) і per-row `record` свідомо
> лишаємо **тільки** в меню рядка (`Shift+F10`): голий `Ctrl`-letter ризикований у
> NVDA browse mode і ламав би інваріант Tier 2′ (лише функційні/спец-клавіші).

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
