# KB-12: Нові глобальні шорткати — глобальний stop_all — дизайн

- **Дата:** 2026-06-10
- **Беклог:** [keyboard-shortcuts-backlog.md → KB-12](../../keyboard-shortcuts-backlog.md)
- **Гілка:** `feature/kb-12-new-global-shortcuts`

## Мета

KB-12 питає: чи додавати нові OS-глобальні шорткати. Рішення (узгоджено з
користувачем):

| Кандидат | Рішення |
| --- | --- |
| `Ctrl+Shift+S` — зупинити весь запис (stop_all) | **Додаємо** (ця спека) |
| `Ctrl+Shift+M` — toggle_mute | **Відкладено**: mute-логіка живе лише у фронтенді ([$muteState](../../../src/stores/player.ts), PlayerPanel/App), глобальний хоткей потребує моста Rust→webview. Рядок ⬜ лишається в реєстрі з приміткою. |
| Глобальний stop-playback | **Не додаємо**: `toggle_playback` (`Ctrl+Shift+P`) + зупинка у вікні достатні; комбо ніколи не резервувалось. |
| `Ctrl+Shift+←/→` — next/prev трек | **Відхилено** до появи моделі черги плеєра (її немає). Рядок ⬜ прибрати з реєстру. |

Цінність stop_all окремо від toggle (`Ctrl+Shift+R`, KB-01): гарантована
зупинка без ризику випадкового старту — toggle **стартує** запис, якщо нічого
не активно. Узгоджено з моделлю профілів («одна кнопка „Зупинити все“»).

## Поведінка

- OS-глобальний (Tier 1), конфігуровний, дефолт `Ctrl+Shift+S`.
- Натиск → зупинка всього активного запису профілю (`StreamManager::stop_all`).
- Тост (NVDA-readable, повз `show_tray_notifications`, як у KB-01 — це єдиний
  фідбек фонового хоткея):
  - `n > 0` → «Запис зупинено: n {потік/потоки/потоків}» (наявний `plural_streams`);
  - `n = 0` → «Запис не йшов» — мовчазний no-op неприйнятний для NVDA.
- Авто-повтор утримуваної клавіші гаситься дебаунсом 500 мс. Лічильник
  **окремий** від toggle_recording: послідовність «R → ой → S» за пів секунди
  не повинна ковтатись.

## Архітектура

### Backend (Rust)

- **[settings.rs](../../../src-tauri/src/settings.rs):** поле
  `stop_all: String` у `HotkeyMap` (serde camelCase → `stopAll` у JSON/TS),
  дефолт `"Ctrl+Shift+S"`.
  **Міграція:** `#[serde(default = "...")]` на **всі** поля `HotkeyMap` —
  зараз жодне поле дефолту не має, тож старий `settings.json` з наявним
  `hotkeys`-об'єктом без нового поля завалив би десеріалізацію всього
  `GlobalSettings`. Default-функції повертають ті самі значення, що
  `HotkeyMap::default()` (без дублювання — `default()` збирається з них).
- **[recording_control.rs](../../../src-tauri/src/recording_control.rs):**
  `pub async fn stop_all_now(state: &AppState) -> usize` — порахувати активні
  (`count_active`), `mgr.stop_all()`, повернути кількість зупинених.
  Дзеркало гілки Stop у `toggle_all`.
- **[tray/notify.rs](../../../src-tauri/src/tray/notify.rs):**
  `pub fn notify_stop_all(app: &AppHandle, stopped: usize)` — тост за
  правилами вище; рядки українські, як решта нативних поверхонь.
- **[shortcuts.rs](../../../src-tauri/src/shortcuts.rs):**
  - `(&hotkeys.stop_all, "stop_all")` у масив `combos`;
  - гілка `"stop_all"` у `handle_shortcut_action`: дебаунс →
    `stop_all_now` → `notify_stop_all`;
  - дебаунс-хелпер узагальнити: одна функція над `&AtomicU64`
    (теперішня `recently_toggled_recording` стає викликом хелпера),
    два statics — `LAST_TOGGLE_RECORDING_MS`, `LAST_STOP_ALL_MS`.

### Frontend

- **`tauri.ts`:** TS-тип `HotkeyMap` + `stopAll: string`.
- **[HotkeysTab.tsx](../../../src/components/settings/HotkeysTab.tsx):**
  рядок `{ key: "stopAll", label: () => m.settings_hotkey_stop_all() }`
  у `HOTKEY_FIELDS`. Валідація дублікатів/резервів (KB-09), auto-save,
  reset-to-defaults (KB-10) підхоплюються автоматично — все ітерує
  `HOTKEY_FIELDS` / `HotkeyMap::default()`.

### i18n

Один новий ключ (uk + en):

| Ключ | uk | en |
| --- | --- | --- |
| `settings_hotkey_stop_all` | Зупинити весь запис | Stop all recording |

## Помилки та крайні випадки

- **Колізія з користувацьким комбо:** якщо інший хоткей уже перемаплено на
  `Ctrl+Shift+S`, реєстрація stop_all впаде в наявний `failed`-шлях
  `register_global_shortcuts` (видно в Settings → Hotkeys); розв'язується
  перезаписом. Окремої логіки не треба.
- **Порожнє комбо** → пропуск реєстрації (наявний `is_empty`-гард).
- **F1-довідник** Tier-1 хоткеї не показує взагалі — наявна прогалина, поза
  скоупом KB-12.

## Тестування

- **Rust:**
  - serde-міграція: JSON `hotkeys`-об'єкт без `stopAll` парситься, поле
    отримує `"Ctrl+Shift+S"`;
  - `HotkeyMap::default().stop_all == "Ctrl+Shift+S"`;
  - чисті помічники `count_active`/`plural_streams` уже покриті (KB-01).
- **Frontend** ([HotkeysTab.test.tsx](../../../src/components/settings/HotkeysTab.test.tsx)):
  - новий рядок «Зупинити весь запис» рендериться;
  - дублікатна валідація бачить `stopAll` (запис того самого комбо в інше
    поле → відхилено).

## Документація

- **[keyboard-shortcuts.md](../../keyboard-shortcuts.md):** `Ctrl+Shift+S` →
  ✅; прибрати рядок `Ctrl+Shift+←/→`; до `Ctrl+Shift+M` примітка
  «відкладено (KB-12, 2026-06-10): чекає моста Rust→webview»; оновити
  виноску під таблицею Tier 1.
- **[keyboard-shortcuts-backlog.md](../../keyboard-shortcuts-backlog.md):**
  KB-12 → `[x]` зі стандартною нотаткою рішень (таблиця «Мета» вище).

## Поза скоупом

- toggle_mute (відкладено), stop-playback (не додаємо), next/prev трек
  (відхилено) — див. таблицю рішень.
- Показ Tier-1 хоткеїв у F1-довіднику.
- Будь-які зміни моделі запису/черги.

## Готово коли

`Ctrl+Shift+S` (у т.ч. з фоновим/схованим вікном) зупиняє весь активний запис
і показує NVDA-readable тост («Запис зупинено: n …» або «Запис не йшов»);
комбо конфігурується, скидається й валідується в Settings → Hotkeys нарівні з
рештою; старі settings.json мігрують без втрат. Тести зелені (`pnpm test` +
`cargo test`), збірка проходить (`pnpm vite:build`).
