# Гарячі клавіші — бэклог покращень

- **Тип:** робочий чек-лист (backlog). Виконувати поступово, відмічаючи `[x]`.
- **Контекст:** реєстр стану — [keyboard-shortcuts.md](keyboard-shortcuts.md);
  правило клавіш — [accessibility.md §12](accessibility.md).
- **Звірено з кодом:** 2026-06-07.

**Легенда:** `🐞 баг-підтв.` бачив у коді · `🔍 перевірити` потребує звірки ·
`✨ покращення` нова поведінка.

**Рекомендований порядок:** P0 → P1 → P2 → P3 (нижче по секціях).
ID (`KB-NN`) стабільні — на них зручно посилатися в комітах/PR.

---

## P0 — справжні баги (спершу)

### [x] KB-01 · 🐞 Глобальний `toggle_recording` нічого не робить
На `Ctrl+Shift+R` лише пишеться лог «no selected stream context» — запис не
стартує: [shortcuts.rs:52-54](../src-tauri/src/shortcuts.rs#L52-L54).
- Потрібна модель «цільового потоку» (фокусований/обраний рядок або мапінг на
  «Записати все»). Узгодити з моделлю профілів/запису.
- **Готово коли:** глобальний хоткей реально стартує/зупиняє запис за визначеним
  правилом цілі, з оголошенням для NVDA.
- **Зроблено (2026-06-07):** ціль = весь активний профіль — будь-що активне →
  `stop_all`, інакше `start_all`, через
  [recording_control.rs](../src-tauri/src/recording_control.rs) ·
  [shortcuts.rs](../src-tauri/src/shortcuts.rs). Оголошення — Windows-toast
  (NVDA читає у фоні), дебаунс авто-повтору 500 мс. Спека/план:
  `docs/superpowers/{specs,plans}/2026-06-07-kb01-global-toggle-recording*`.
  Лишилось: ручна NVDA-приймальня (fg + у фоні).

### [x] KB-02 · 🐞 KeyRecorder ловить `e.key`, а не `e.code`
[KeyRecorder.tsx:33,46-48](../src/components/settings/KeyRecorder.tsx#L33)
нормалізує символ (`key.toUpperCase()`). На кирилиці запис `Ctrl+Shift+R` збереже
`Ctrl+Shift+К` → акселератор невалідний/не матчиться ОС → хоткей мовчки не працює.
- Нормалізувати фізичну позицію через `e.code` (`KeyR`→`R`, `Digit1`→`1`,
  `ArrowUp`→`Up`, …), за §12.
- **Готово коли:** запис будь-якого комбо на кириличній розкладці дає коректний
  латинський акселератор, що реєструється й спрацьовує.
- **Зроблено (2026-06-07):** `KeyRecorder` бере токен із `e.code` через чистий
  `codeToToken` ([KeyRecorder.tsx](../src/components/settings/KeyRecorder.tsx)) —
  фізична позиція замість символу, за §12. Підтримані сім'ї: `KeyA–KeyZ`,
  `Digit0–9`, стрілки, `Space`, `F1–F24`; усе інше (пунктуація, numpad, самотні
  модифікатори) ігнорується — рекордер лишається активним замість збереження
  нереєстрованого комбо. Побічно полагоджено `Shift+1`→`!`. Тести:
  [KeyRecorder.test.tsx](../src/components/settings/KeyRecorder.test.tsx).

---

## P1 — робастність перед реалізацією `Alt+digit` / `Ctrl+N`

### [x] KB-04 · ✨ Гард на фокус/модалі у глобальному слухачі
Слухач [App.tsx:135-150](../src/App.tsx#L135-L150) спрацьовував з `window`
незалежно від фокуса. `Ctrl+N`/`Alt+digit` не повинні стріляти, коли фокус у
текстовому полі (пошук Browser), відкрито модаль, або KeyRecorder у режимі запису.
- Перевикористати наявні патерни: `isContentEditable`
  ([useCompositeList.ts:48](../src/hooks/useCompositeList.ts#L48)),
  `closest(MODAL_SELECTOR)` ([useZoneNavigation.ts:16](../src/hooks/useZoneNavigation.ts#L16)).
- **Готово коли:** контекстні/навігаційні хоткеї ігноруються при редагуванні
  тексту й при відкритому модалі/рекордері.
- **Зроблено (2026-06-07):** єдиний гард `shouldIgnoreShortcut()`
  ([shortcutGuard.ts](../src/lib/shortcutGuard.ts)) — ранній `return` на початку
  window-слухача ([App.tsx](../src/App.tsx#L135)). Блокує, коли: фокус у
  текстовому полі (allowlist text-типів `<input>` + `<textarea>` +
  `contentEditable`; `<input type=range>` слайдерів навмисно НЕ блокується), або
  фокус у модалі (`MODAL_SELECTOR` — він же покриває KeyRecorder, бо той живе в
  діалозі Settings). `MODAL_SELECTOR`/`isInModal` винесено в `shortcutGuard.ts` і
  перевикористано в [useZoneNavigation.ts](../src/hooks/useZoneNavigation.ts).
  Гард застосовано і до наявних `Ctrl+K`/`Ctrl+,` (узгоджено для всього Tier-2:
  тепер фокус-/модаль-залежні; self-close по тій же клавіші зник, але `Escape`
  закриває). Тести: [shortcutGuard.test.ts](../src/lib/shortcutGuard.test.ts).

### [x] KB-05 · 🔍 `Ctrl+N` може перехопити WebView2
На Windows `Ctrl+N` історично = «нове вікно». Переконатися, що подія доходить до
JS у Tauri-webview.
- **Готово коли:** підтверджено, що handler отримує `Ctrl+N` (або обрано інший
  біндинг, якщо ні).
- **Зроблено (2026-06-07):** біндинг лишаємо — `Ctrl+N` **не** перехоплюється.
  Застереження стосувалося повного Edge/Chrome (там є browser-shell із «новим
  вікном»); Tapir живе у *вбудованому* контролі WebView2 (wry 0.54.4 → tao →
  tauri 2.10.3), де такої команди немає (єдиний шлях нового вікна —
  `window.open`/`NewWindowRequested`, програмний). Докази: (1) `Ctrl+N` не входить
  до набору browser-accelerator клавіш WebView2 — лише Find/Print/Reload/Zoom/
  DevTools + спец-клавіші Back/Forward/Search ([MS docs: AreBrowserAcceleratorKeysEnabled](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/winrt/microsoft_web_webview2_core/corewebview2settings#arebrowseracceleratorkeysenabled)).
  (2) Той самий window-слухач уже отримує `Ctrl+K`/`Ctrl+,` (✅ у реєстрі,
  [App.tsx:144-148](../src/App.tsx#L144-L148)) — `Ctrl+N` той самий клас Ctrl+letter,
  що не є акселератором. (3) wry лишає `AreBrowserAcceleratorKeysEnabled` у дефолті
  `true`, Tapir його не чіпає; на крайній випадок є рубильник
  `with_browser_accelerator_keys(false)`, плюс `preventDefault()` на комбо
  (конвенція №3) як запобіжник. Лишилось: ручний прес `Ctrl+N` у вікні під час
  NVDA-приймальні (разом із KB-01).

### [x] KB-06 · ✨ Ігнорувати `e.repeat` для toggle-дій
Утримання клавіші не має багаторазово перемикати палітру/mute.
- **Готово коли:** toggle-хоткеї реагують лише на перше натискання.
- **Зроблено (2026-06-07):** ранній `if (e.repeat) return;` на початку Tier-2
  window-слухача ([App.tsx:135](../src/App.tsx#L135)) — перед гардом KB-04. Покриває
  наявні `Ctrl+K`/`Ctrl+,` і автоматично майбутні `Alt+digit`/`Ctrl+N` (усі Tier-2
  — toggle/open-once, жоден не хоче авто-повтору). Tier-3 слайдери не зачеплені —
  вони мають власні `onKeyDown` і повтор їм потрібен. Mute змін не потребував:
  react-aria `usePress` уже відкидає `e.repeat` (`usePress.mjs` `!e.repeat`). Tier-1
  (OS) поза скоупом — там немає `e.repeat`; авто-повтор `toggle_recording` уже
  погашено дебаунсом у KB-01. Конвенцію №4 додано в
  [keyboard-shortcuts.md](keyboard-shortcuts.md#L74).

---

## P2 — відкривність (найбільший a11y-виграш)


---

## P3 — консистентність, конфіг, docs, нові клавіші

### [x] KB-03 · 🐞 Доповнити реєстр уже наявними клавішами
У [keyboard-shortcuts.md](keyboard-shortcuts.md) бракувало named-клавіш:
- `F6` / `Shift+F6` — циклічна навігація по зонах ([accessibility.md:124](accessibility.md));
- `Shift+F10` / `ContextMenu` — меню рядка ([accessibility.md:358](accessibility.md#L358));
- `Escape` — закрити палітру/діалог.
- **Готово коли:** реєстр містить ці записи з посиланнями на код.
- **Зроблено (2026-06-07):** новий розділ «Tier 2′ — named-навігація / керування»
  у [keyboard-shortcuts.md](keyboard-shortcuts.md) — таблиця з усіма трьома
  записами + посиланнями на код. `F6`/`Shift+F6` →
  [useZoneNavigation.ts:45-58](../src/hooks/useZoneNavigation.ts#L45-L58)
  (§2.3.1); `Shift+F10`/`ContextMenu` →
  [useCompositeList.ts:342-367](../src/hooks/useCompositeList.ts#L342-L367)
  (один `contextmenu` event WebView2 на ПКМ/Menu/Shift+F10, §3.6); `Escape` →
  палітра [CommandPalette.tsx:150](../src/components/common/CommandPalette.tsx#L150),
  Settings — нативний react-aria `isDismissable`
  [SettingsDialog.tsx:35](../src/components/settings/SettingsDialog.tsx#L35),
  рекордер [KeyRecorder.tsx:51](../src/components/settings/KeyRecorder.tsx#L51).
  Це окремий клас (named, але не app-дії й не конфігуровні) — не Tier 2 і не
  Tier 3.

### [x] KB-09 · 🔍 Детект колізій у KeyRecorder
Шов `onValidate` існує ([KeyRecorder.tsx:9,52](../src/components/settings/KeyRecorder.tsx#L52)).
Перевірити, чи він відхиляє комбо, зайняте іншою дією, і попереджає про збіг із
фіксованими webview-клавішами.
- **Готово коли:** не можна призначити дубльоване комбо без попередження.
- **Зроблено (2026-06-07):** дублікати Tier-1 уже відхилялись; додано перевірку
  проти **фіксованих webview-комбо** (Tier 2 + Tier 2′). Новий чистий lib
  [reservedShortcuts.ts](../src/lib/reservedShortcuts.ts) (`RESERVED_WEBVIEW_COMBOS`
  + `findReservedConflict`, за зразком `shortcutGuard.ts`) скомпоновано у
  `HotkeysTab.validateHotkey` ([HotkeysTab.tsx](../src/components/settings/HotkeysTab.tsx))
  — зарезервоване має пріоритет над дублікатом, бо його не обійти переназначенням.
  `KeyRecorder` без змін: блокуючий рядок іде в наявний `role="alert"`, `onChange`
  не викликається. Повідомлення називає дію (`settings_hotkey_reserved`), реюз
  наявних i18n-міток + 4 нові ключі. Спека/план:
  `docs/superpowers/{specs,plans}/2026-06-07-kb09-keyrecorder-collision-detection*`.
  Тести: [reservedShortcuts.test.ts](../src/lib/reservedShortcuts.test.ts),
  [HotkeysTab.test.tsx](../src/components/settings/HotkeysTab.test.tsx).

### ☐ KB-10 · 🔍 Reset-to-defaults для хоткеїв
Перевірити наявність відкату до дефолтів у Settings → Hotkeys.
- **Готово коли:** користувач може повернути дефолтні комбінації однією дією.

### [x] KB-11 · ✨ Зафіксувати позицію щодо асиметрії конфігурованості
Tier 1 (OS) конфігуровний, Tier 2 (`Ctrl+K`/`Alt+digit`) — хардкод. Зробити це
свідомим рішенням (ймовірно лишити як є — стандартна конвенція).
- **Готово коли:** позиція зафіксована в реєстрі/ADR.
- **Зроблено (2026-06-07):** асиметрію лишаємо свідомо — новий
  [ADR](decisions/2026-06-07-shortcut-configurability-asymmetry.md). Принцип:
  конфігуровність визначає **scope колізій**, не важливість. Tier 1 (OS) стріляє поза
  фокусом → конкурує з чужими застосунками/AT → потрібен рубильник. Tier 2/2′ —
  scope=webview, колізії лише в нашому контролі (+ WebView2, KB-05) + усталена
  конвенція (`Ctrl+K`/`Alt+digit`) → хардкод. Tier 2′ (`F6`/`Shift+F10`/`Escape`) —
  ARIA-примітиви, ремап заборонено за a11y. Запобіжник «течі»: KeyRecorder відхиляє
  OS-комбо, що збігається з `RESERVED_WEBVIEW_COMBOS` (KB-09), тож конфіговний шар не
  затіняє хардкодні. Крос-лінк у реєстрі ([keyboard-shortcuts.md](keyboard-shortcuts.md)
  — «Як читати» → Конфіг, + примітка в Tier 2).

### ☐ KB-12 · ✨ Можливі нові глобальні шорткати
Кандидати: «зупинити весь запис», глобальний stop-playback.
- **Готово коли:** вирішено, чи додавати, і додано за потреби.
