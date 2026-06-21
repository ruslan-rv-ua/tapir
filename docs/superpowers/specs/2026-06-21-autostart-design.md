# Autostart (Підфаза 3I-2) — дизайн

- **Дата:** 2026-06-21
- **Гілка:** `feature/3i-2-autostart`
- **Слаг:** `autostart`
- **Беклог:** [docs/backlog/p2-autostart.md](../../backlog/p2-autostart.md)
- **Залежності (перевірені):** Phase 2C SettingsDialog ✅, Phase 3A System Tray ✅,
  Phase 3D Scheduler ✅, Phase 3G CLI `--minimize` ✅

## Проблема

Tapir має вміти запускатися автоматично разом із Windows. Ключовий use case:
користувач налаштував нічний запис (Scheduler), і для його спрацювання Tapir
має бути запущений до старту. Для незрячого користувача з NVDA це особливо
важливо — він не може легко перевірити, чи застосунок працює у фоні. Один раз
увімкнув опцію — і застосунок сам стартує при вході в Windows, ховається у трей,
Scheduler спрацьовує вночі.

## Звірка беклогу з кодом (стан до реалізації)

| Твердження беклогу | Факт | Наслідок |
|---|---|---|
| «Додати поле `autostart_enabled: bool`» | Поле **вже існує** як `autostart: bool` (settings.rs:35, default `false`), є й у `tauri.ts`, `data-models.md`. Зараз **не використовується**. | Структуру не змінюємо — лише підключаємо. |
| Механізм — `tauri-plugin-autostart` | `winreg` **уже в залежностях** із готовим HKCU-патерном `register_aumid` (tray/notify.rs:31). | Беремо ручний `winreg`. Див. «Рішення». |
| `--minimize` потрібен від Phase 3G | Phase 3G **готова**: `--minimize` парситься (cli.rs:42) і в `setup` робить `show()+set_focus()` **і лише потім** `hide()` (lib.rs:144) — NVDA встигає приєднатися. | Команда `tapir.exe --minimize` NVDA-дружня. |
| «Окреме налаштування *Запускати мінімізованим*» | Підтверджено користувачем як вимога. | Додаємо `autostart_minimized` + другий toggle. |

## Прийняті рішення

1. **Механізм — ручний `winreg`, не плагін.** Окремий toggle «мінімізовано» робить
   команду в реєстрі умовною (`tapir.exe` vs `tapir.exe --minimize`).
   `tauri-plugin-autostart` запікає аргументи при ініціалізації плагіна — умовний
   `--minimize` там незручний. Ручний запис дає повний контроль над командою,
   точне порівняння шляху з `current_exe()` і прибирання застарілого запису при
   переміщенні EXE. `winreg` уже залежність → без нового плагіна/ACL.
2. **Окремий toggle «Запускати мінімізованим».** Поле `autostart_minimized`
   (default `true` — головний use case хоче трей). Toggle **задизейблений**, поки
   «Запускати разом із Windows» вимкнено (інертний контрол бентежить незрячого).
3. **Деактивація при переміщенні EXE — тиха + NVDA-оголошення.** Без діалогів.
4. **Без анонсу при кожному autostart-старті.** Не озвучувати щовходу в Windows.

## Модель даних

`src-tauri/src/settings.rs` — `GlobalSettings`:

- `autostart: bool` — *уже є*, default `false`. Чи зареєстрований запис у `Run`.
- `autostart_minimized: bool` — **новий**, `#[serde(default = "default_true")]`,
  у `Default` = `true`. Чи містить команда `--minimize`.

`src/lib/tauri.ts` — `GlobalSettings`: додати `autostartMinimized: boolean`.

`docs/data-models.md` — задокументувати `autostartMinimized` поряд з `autostart`.

Сумісність: старий `settings.json` без `autostartMinimized` вантажиться (default `true`).

## Backend: модуль `src-tauri/src/autostart.rs`

Розділення pure/impure як у `cli.rs`: тестоване ядро + тонка winreg-оболонка.

Константи:
- Ключ: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- Ім'я значення: `Tapir`

### Чисті функції (юніт-тести)

```rust
/// Команда для реєстру. Exe завжди в лапках (шлях може містити пробіли).
/// minimized → додає " --minimize".
fn build_run_command(exe: &str, minimized: bool) -> String

/// Витягти шлях до exe з рядка реєстру. Обробляє провідні лапки;
/// для значень без лапок бере перший токен. Повертає шлях без лапок.
fn exe_path_from_command(value: &str) -> Option<String>

enum Reconcile {
    None,               // нічого робити
    Write(String),      // (пере)записати значення цією командою
    DeleteStale,        // autostart=false, але запис існує — прибрати
    DisableMoved,       // exe переміщено — прибрати, autostart=false, оголосити
}

/// Порівняння шляху — case-insensitive (Windows).
fn reconcile(
    autostart: bool,
    minimized: bool,
    current_exe: &str,
    registered: Option<&str>,
) -> Reconcile
```

Таблиця рішень `reconcile`:

| `autostart` | `registered` | Результат |
|---|---|---|
| `true` | `None` (відсутній) | `Write` — тихе самовідновлення (напр., попередній запис не вдався) |
| `true` | exe == current, команда не збігається (змінено `minimized`) | `Write` — тихий перезапис |
| `true` | exe == current, команда збігається | `None` |
| `true` | exe **≠** current | `DisableMoved` |
| `false` | присутній | `DeleteStale` |
| `false` | відсутній | `None` |

### Impure (winreg, патерн `register_aumid`)

```rust
fn read_run_value() -> Option<String>          // None якщо ключа/значення нема
fn write_run_value(command: &str) -> Result<(), RadioError>
fn delete_run_value() -> Result<(), RadioError> // Ok, якщо значення вже нема

/// Викликається з команди syncAutostart: привести реєстр у відповідність до
/// (enabled, minimized). enabled=false → delete; enabled=true → write.
pub fn apply(enabled: bool, minimized: bool) -> Result<(), RadioError>

/// Викликається в setup. Читає реєстр, проганяє reconcile, виконує дію.
/// Повертає true, якщо сталася DisableMoved (треба оновити settings + оголосити).
pub fn reconcile_on_startup(autostart: bool, minimized: bool) -> bool
```

`apply` бере `current_exe` через `std::env::current_exe()` всередині (impure).
Усі winreg-помилки логуються; `apply` повертає `Err` у команду для UI-оголошення;
`reconcile_on_startup` помилки лише логує (старт не блокуємо).

## Backend: IPC-команда

`src-tauri/src/commands/settings_commands.rs`:

```rust
/// Привести реєстр Run у відповідність до поточних settings (autostart,
/// autostart_minimized). Frontend викликає після persist toggle.
#[tauri::command]
pub async fn sync_autostart(state: State<'_, AppState>) -> Result<(), String>
```

Читає `state.settings` (уже оновлені через `save_settings`), викликає
`autostart::apply(autostart, autostart_minimized)`. Реєструється в `invoke_handler`.

Чому окрема команда, а не як SMTC у `save_settings`: реєстровий запис **може
впасти** (на відміну від in-process SMTC), і незрячий користувач має почути про
це. `save_settings` лишається суто про persist.

## Backend: старт (`lib.rs setup`)

Реконсиляцію робимо **до `AppState::new`** (воно споживає `settings`), мутуючи
`initial_settings`, щоб скинутий прапорець потрапив у стан:

```rust
let mut settings = initial_settings;
let moved = autostart::reconcile_on_startup(settings.autostart, settings.autostart_minimized);
if moved {
    settings.autostart = false;
    let _ = settings.save();         // персистимо скинутий прапорець
    // відкласти оголошення до frontend_ready (webview ще не підписаний)
    app.manage(autostart::StartupNotice::moved());
}
// ... далі settings → Profile::load → AppState::new(settings, ...)
```

`StartupNotice` — managed-state на кшталт `cli::StartupPlan`
(`Mutex<Option<...>>`, `take()` одноразовий). Дренаж у
`commands/app_commands.rs::frontend_ready` (поряд зі `StartupPlan`):

```rust
if let Some(notice) = app.try_state::<autostart::StartupNotice>() {
    if notice.take().is_some() {
        let _ = app.emit("autostart-deactivated", ());
    }
}
```

Чому defer: той самий гейт, що `StartupPlan`/scheduler — емісія до підписки
webview = втрачене оголошення.

## Frontend

### GeneralTab (`src/components/settings/GeneralTab.tsx`)

Нова секція «Автозапуск» (`settings_section_autostart`) з двома `Checkbox`
(патерн існуючих чекбоксів у файлі):

1. **«Запускати разом із Windows»** ← `settings.autostart`.
   `onChange`: `update({ autostart: val })` → `await tauri.syncAutostart()` →
   `announce(val ? m.autostart_enabled() : m.autostart_disabled(), "polite")`.
   На помилку: `announce(m.autostart_error(), "assertive")` + error-toast.
2. **«Запускати мінімізованим»** ← `settings.autostartMinimized`,
   **`isDisabled={!settings.autostart}`**. `onChange`:
   `update({ autostartMinimized: val })` → `await tauri.syncAutostart()`
   (autostart увімкнено → перезаписує команду з/без `--minimize`).

`update()` уже існує (persist через `useAutoSave`). Послідовність: спершу persist
(оновлює і `state.settings` у Rust через `save_settings`), потім `syncAutostart`
читає оновлений стан.

### Хук `useAutostartFeedback` (`src/hooks/useAutostartFeedback.ts`)

Як `useCliFeedback`: слухає подію `autostart-deactivated` →
`announce(m.autostart_deactivated_moved(), "polite")` + info-toast. Підключити в
`App.tsx` поряд з `useCliFeedback`.

### `src/lib/tauri.ts`

- Тип: `autostartMinimized: boolean` у `GlobalSettings`.
- Біндинг: `export const syncAutostart = () => invoke<void>("sync_autostart")`.

### i18n (`src/i18n/messages/{uk,en}.json`)

Нові ключі: `settings_section_autostart`, `settings_autostart`,
`settings_autostart_minimized`, `autostart_enabled`, `autostart_disabled`,
`autostart_error`, `autostart_deactivated_moved`. Регенерувати через vite-плагін
paraglide (не правити згенероване вручну).

Орієнтовні рядки (uk):
- `settings_section_autostart`: «Автозапуск»
- `settings_autostart`: «Запускати разом із Windows»
- `settings_autostart_minimized`: «Запускати мінімізованим»
- `autostart_enabled`: «Автозапуск увімкнено»
- `autostart_disabled`: «Автозапуск вимкнено»
- `autostart_error`: «Не вдалося змінити автозапуск»
- `autostart_deactivated_moved`: «Автозапуск вимкнено: виявлено переміщення застосунку»

## Тести (TDD)

**Rust (`autostart.rs` `#[cfg(test)]`):**
- `build_run_command`: лапки навколо exe; з/без `--minimize`.
- `exe_path_from_command`: значення в лапках з аргументами; без лапок; порожнє.
- `reconcile`: повна таблиця рішень (6 рядків), включно з case-insensitive
  порівнянням шляху (різний регістр = той самий exe).
- `settings.rs`: `autostart_minimized` default `true`; legacy-конфіг без поля
  вантажиться з default; round-trip.

**Frontend (Vitest):**
- `GeneralTab.test.tsx`: клік по «Запускати разом із Windows» пише
  `autostart` у стор і викликає `syncAutostart`; «Запускати мінімізованим»
  задизейблений при `autostart=false`, активний при `true`.
- `useAutostartFeedback`: подія `autostart-deactivated` → `announce` викликано.

**Не покривається юніт-тестами (ручна перевірка з NVDA):**
- Реальний запис/видалення в `HKCU\...\Run`.
- Старт із `--minimize` → лише іконка в треї.
- Переміщення EXE → тиха деактивація + оголошення.

## Критерії готовності (з беклогу)

- [ ] Toggle «Запускати разом із Windows» у SettingsDialog, доступний з NVDA.
- [ ] Увімкнення реєструє EXE у `HKCU\...\Run` (з `--minimize`, якщо minimized).
- [ ] Вимкнення видаляє запис.
- [ ] При старті звіряється зареєстрований шлях із `current_exe()`.
- [ ] EXE переміщено → тиха деактивація, `autostart=false`.
- [ ] Деактивація через переміщення → polite NVDA-оголошення.
- [ ] Toggle відображає актуальний стан після старту.
- [ ] Autostart із `--minimize` → лише іконка в треї.
- [ ] «Запускати мінімізованим» задизейблений, поки autostart вимкнено.

## Гейти

- `pnpm test` + `pnpm vite:build` (tsc має ~51 передіснуючу paraglide-помилку — не показник).
- `cargo test` для Rust-ядра.
- i18n регенерувати через vite-плагін.

## Поза обсягом (YAGNI)

- Без `tauri-plugin-autostart`.
- Без анонсу «Tapir запущений автоматично» при кожному вході.
- Без HKLM / прав адміністратора (тільки HKCU, портативна модель).
- Без міграції наявних `settings.json` (default `autostartMinimized=true` достатньо).
</content>
</invoke>
