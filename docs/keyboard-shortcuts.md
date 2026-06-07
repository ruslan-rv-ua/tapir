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

## Tier 1 — OS-глобальні, конфігуровні

Реєструються через `tauri-plugin-global-shortcut`
([shortcuts.rs](../src-tauri/src/shortcuts.rs)); дефолти — у `HotkeyMap`
([settings.rs:115-122](../src-tauri/src/settings.rs#L115-L122)); перепризначаються
користувачем у Settings → Hotkeys ([KeyRecorder.tsx](../src/components/settings/KeyRecorder.tsx)).

| Комбо (дефолт) | Дія | Scope | Стан |
|---|---|---|---|
| `Ctrl+Shift+R` | toggle_recording (запис/зупинка всього активного профілю + toast) | OS | ✅ |
| `Ctrl+Shift+P` | toggle_playback | OS | ✅ |
| `Ctrl+Shift+Up` | volume_up (+5%) | OS | ✅ |
| `Ctrl+Shift+Down` | volume_down (−5%) | OS | ✅ |
| `Ctrl+Shift+H` | toggle_window (показати/сховати) | OS | ✅ |

## Tier 2 — глобальні у webview

Один `window` keydown-listener в [App.tsx:135-150](../src/App.tsx#L135-L150)
(той самий `useEffect`). Усі майбутні app-level шорткати додавати **сюди**, не в
панелі (надійніше за `onKeyDown` контейнера — bubbling рядків може зупинятися).

| Комбо | Дія | Умова | Scope | Стан | Джерело мотивації |
|---|---|---|---|---|---|
| `Ctrl+K` | командна палітра (toggle) | — | webview | ✅ | [command-palette ADR](decisions/2026-05-31-command-palette-and-search-ux.md) · [accessibility.md §2.4](accessibility.md) |
| `Ctrl+,` | діалог налаштувань (toggle) | — | webview | ✅ | — |
| `Alt+1` | секція Streams | — | webview | ⬜ | [section-navigation ADR](decisions/2026-06-02-section-navigation-shortcuts.md) |
| `Alt+2` | секція Browser | — | webview | ⬜ | ↑ |
| `Alt+3` | секція Wishlist | — | webview | ⬜ | ↑ |
| `Alt+4` | секція Schedule | після Phase 3D | webview | ⬜ | ↑ |
| `Alt+5` | секція Songs | — | webview | ⬜ | ↑ |
| `Alt+0` | секція Profiles | після Phase 3F | webview | ⬜ | ↑ |
| `Ctrl+N` | Add Stream | `$activeSection === "streams"` | webview | ⬜ | [context-aware ADR](decisions/2026-06-02-context-aware-keyboard-shortcuts.md) |

> `Alt+digit` нумерує секції за порядком в ActivityBar; `Alt+0` — Profiles
> (винесено окремо вгорі). Чому `Alt`, а не `Ctrl`: NVDA у browse mode перехоплює
> частину `Ctrl`-комбінацій — деталі в section-navigation ADR.
>
> Контекстні дії (як `Ctrl+N`) гейтяться на `$activeSection`. Той самий ключ може
> в майбутньому означати різне на різних екранах (Browser → wishlist, Profiles →
> новий профіль) — таблиця-розширення в context-aware ADR.

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
