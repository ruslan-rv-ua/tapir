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

Алгоритм `reconcile` (явний, без двозначностей). `desired =
build_run_command(current_exe, minimized)`. Усі порівняння — **case-insensitive**
(Windows). Витяг exe — `exe_path_from_command(reg)`:

```
match registered {
    None            => if autostart { Write(desired) } else { None },
    Some(reg)       => {
        if !autostart { return DeleteStale; }
        match exe_path_from_command(reg) {
            Some(e) if eq_ic(e, current_exe) =>
                if eq_ic(reg, desired) { None } else { Write(desired) }, // змінено minimized
            Some(_) => DisableMoved,   // розібрано ІНШИЙ шлях → переміщення
            None    => Write(desired),  // значення нерозбірливе → тихе self-heal
        }
    }
}
```

Таблиця (підсумок):

| `autostart` | `registered` | Результат |
|---|---|---|
| `true` | відсутній | `Write` — тихе self-heal (попередній запис не вдався) |
| `true` | exe == current, команда збігається | `None` |
| `true` | exe == current, команда різна (змінено `minimized`) | `Write` — тихий перезапис |
| `true` | exe **≠** current | `DisableMoved` |
| `true` | значення нерозбірливе (exe не парситься) | `Write` — тихе self-heal |
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

`apply` і `reconcile_on_startup` **обидва** беруть `current_exe` через
`std::env::current_exe()` (impure) і будують команду через той самий
`build_run_command` — щоб збережений при `apply` рядок дослівно дорівнював
перебудованому при старті (інакше зайвий `Write`). Усі winreg-помилки логуються;
`apply` повертає `Err` у команду для UI-оголошення; `reconcile_on_startup`
помилки лише логує (старт не блокуємо).

## Backend: IPC-команда

`src-tauri/src/commands/settings_commands.rs`:

```rust
/// Привести реєстр Run у відповідність до (enabled, minimized).
/// Frontend передає значення явно (НЕ читаємо state — див. нижче).
#[tauri::command]
pub async fn sync_autostart(enabled: bool, minimized: bool) -> Result<(), String> {
    tokio::task::spawn_blocking(move || autostart::apply(enabled, minimized))
        .await
        .map_err(|e| e.to_string())?
        .map_err(Into::into)
}
```

**Чому явні аргументи, а не читання `state.settings` (B1):** `useAutoSave`
дебаунсить persist на **300 мс** (useAutoSave.ts:10). Якби команда читала
`state.settings`, вона прочитала б **застарілий** стан (debounced `save_settings`
ще не виконався). Явні аргументи усувають гонку: реєстр пишеться тими самими
значеннями, що й оптимістичний апдейт стора.

**Чому `spawn_blocking` (B2):** winreg — блокувальний I/O; у async-команді його
треба винести з runtime-потоку (патерн `save_settings`).

**Чому окрема команда, а не як SMTC у `save_settings`:** реєстровий запис **може
впасти** (на відміну від in-process SMTC), і незрячий користувач має почути про
це. `save_settings` лишається суто про persist. Реєструється в `invoke_handler`.
Власні команди застосунку не потребують ACL-запису (на відміну від plugin-команд).

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
(патерн існуючих чекбоксів у файлі). Обидва `onChange` — async; передають значення
в `syncAutostart` **явно** (не покладаючись на дебаунснутий persist), і **revert
оптимістичного апдейту при помилці** (I2 — UI/настройка не «брешуть» незрячому):

1. **«Запускати разом із Windows»** ← `settings.autostart`:
   ```ts
   onChange={async (val) => {
     update({ autostart: val });               // оптимістично + debounced persist
     try {
       await tauri.syncAutostart(val, settings.autostartMinimized);
       announce(val ? m.autostart_enabled() : m.autostart_disabled(), "polite");
     } catch {
       update({ autostart: !val });            // revert
       announce(m.autostart_error(), "assertive");
       addToast(m.autostart_error(), "error");
     }
   }}
   ```
2. **«Запускати мінімізованим»** ← `settings.autostartMinimized`,
   **`isDisabled={!settings.autostart}`** (рішення: задизейблити). `onChange` аналогічно, але
   `syncAutostart(settings.autostart, val)` (autostart тут завжди `true`, бо інакше
   контрол задизейблений) і revert поля `autostartMinimized`.

`update()` уже існує (persist через `useAutoSave`, debounced 300 мс). Реєстр
синхронізується **негайно** через явні аргументи — persist відбувається окремо й
асинхронно; рідкісне розходження вирівнюється `reconcile_on_startup` при старті.

### Хук `useAutostartFeedback` (`src/hooks/useAutostartFeedback.ts`)

Як `useCliFeedback`: слухає подію `autostart-deactivated` (payload порожній,
`useTauriEvent<void>`) → `announce(m.autostart_deactivated_moved(), "polite")` +
info-toast. Підключити в `App.tsx` поряд з `useCliFeedback()` (App.tsx:315).

### `src/lib/tauri.ts`

- Тип: `autostartMinimized: boolean` у `GlobalSettings`.
- Біндинг: `export const syncAutostart = (enabled: boolean, minimized: boolean) =>
  invoke<void>("sync_autostart", { enabled, minimized });`

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
- `exe_path_from_command`: значення в лапках з аргументами; без лапок; порожнє/garbage → `None`.
- `reconcile`: **уся таблиця (7 рядків)**, включно з case-insensitive порівнянням
  шляху (різний регістр = той самий exe), з нерозбірливим значенням (`None` exe →
  `Write`), і з `minimized`-перезаписом (exe той самий, команда різна → `Write`).
- `settings.rs`: `autostart_minimized` default `true`; legacy-конфіг без поля
  вантажиться з default; round-trip.

**Frontend (Vitest):**
- `GeneralTab.test.tsx` (**новий файл**): клік по «Запускати разом із Windows» пише
  `autostart` у стор і викликає `syncAutostart(true, …)`; «Запускати мінімізованим»
  задизейблений при `autostart=false`, активний при `true`; **revert при rejected
  `syncAutostart`** (стор повертається до попереднього значення). Мок `lib/tauri`
  має включати `syncAutostart` (і `saveSettings`).
- `useAutostartFeedback`: подія `autostart-deactivated` → `announce` викликано.

**Гепи тестових фікстур (G1):** додавання обов'язкового `autostartMinimized` до
TS-типу `GlobalSettings` ламає typecheck у **5 наявних фікстурах**, які будують
повний об'єкт — оновити кожну (`+ autostartMinimized: true`):
`HotkeysTab.test.tsx:37`, `AudioTab.test.tsx:27`, `PlayerPanel.test.tsx:20`,
`StreamList.test.tsx:56`, `transportControl.test.ts:52`.

**Не покривається юніт-тестами (ручна перевірка з NVDA):**
- Реальний запис/видалення в `HKCU\...\Run`.
- Старт із `--minimize` → лише іконка в треї.
- Переміщення EXE → тиха деактивація + оголошення.

## Відомі обмеження / краєві випадки

- **Кілька копій EXE.** `DisableMoved` видаляє запис `Run`, що вказує на ту копію,
  з якої НЕ запущено поточний процес. Якщо існують дві копії й autostart вів на
  копію A, запуск копії B вимкне autostart (видалить запис A). Відповідає наміру
  беклогу («розходження шляху → деактивувати»); рідкісний кейс портативного app.
- **Dev-запуск (`just dev`).** `current_exe()` вказує на debug-білд. Якщо в
  `settings.json` лишився autostart=true від реального білда, dev-запуск побачить
  розходження шляху → `DisableMoved` → видалить реальний `Run`-запис і скине
  прапорець. Очікувано (інший exe), але варто пам'ятати під час розробки.
- **Рідкісна реєстр-помилка (self-heal, G4).** Якщо `apply` впав (напр.,
  enterprise-політика блокує `Run`), фронт оголошує помилку й revert-ить toggle —
  тож persist лишається консистентним з реальністю. Якщо ж persist випередив
  revert (await > 300 мс), розходження вирівняє `reconcile_on_startup` при старті.
  Старт-помилки лише логуються (без оголошення).
- **`Emitter` import (G2).** `frontend_ready` емітить `autostart-deactivated` —
  додати `use tauri::Emitter;` у `app_commands.rs` (зараз там лише `Manager`).

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
