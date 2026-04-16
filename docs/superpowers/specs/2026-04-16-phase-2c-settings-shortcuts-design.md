# Phase 2C — SettingsDialog + Global Shortcuts + Window State

> **Дата:** 2026-04-16  
> **Статус:** Затверджено  
> **Залежності:** Phase 1 (settings.rs, profile.rs), Phase 2A (player IPC)

## Ціль

Повний діалог налаштувань програми з auto-save, глобальні гарячі клавіші через `tauri-plugin-global-shortcut`, збереження стану вікна через `tauri-plugin-window-state`.

## Scope

**Включено:**
- SettingsDialog (модальний) з 5 табами: Загальні, Запис, Перепідключення, Гарячі клавіші, Аудіо
- Auto-save при зміні кожного поля (debounce 300ms)
- Глобальні хоткеї (працюють навіть коли Tapir не у фокусі)
- KeyRecorder UI для зміни хоткеїв
- Window state persistence (розмір, позиція, maximized)
- Синхронізація TypeScript інтерфейсу з Rust структурою
- i18n ключі для всіх нових елементів

**Виключено (пізніші фази):**
- Профілі CRUD (Phase 3F)
- Постобробка (Phase 3H)
- Автозапуск з Windows (Phase 3I)
- System Tray (Phase 3A) — поля `minimizeToTray` / `showTrayNotifications` показуються disabled

---

## Архітектура

### Data Sources

SettingsDialog працює з двома джерелами даних:

| Джерело | Файл | Таби |
|---------|------|------|
| `GlobalSettings` | `data/settings.json` | Загальні, Гарячі клавіші, Аудіо |
| `Profile.recording` | `data/profiles/{name}.tapirprofile` | Запис, Перепідключення |

### Entry Points

- Кнопка ⚙️ в ActivityBar (увімкнити, зараз disabled)
- `Ctrl+,` (глобальний хоткей у frontend)
- Command Palette → "Налаштування" (out of scope для Phase 2C — буде додано коли Command Palette розшириться)

### Компонентна структура

```
SettingsDialog (role="dialog", aria-label="Налаштування", modal)
├── TabList (React Aria <Tabs>, orientation="horizontal")
│   ├── Tab: Загальні
│   ├── Tab: Запис
│   ├── Tab: Перепідключення
│   ├── Tab: Гарячі клавіші
│   └── Tab: Аудіо
│
├── TabPanel (per tab)
│   └── <GeneralTab /> | <RecordingTab /> | <ReconnectionTab /> | <HotkeysTab /> | <AudioTab />
│
└── Close button (Escape або X)
```

### Auto-save

Кожна зміна поля → debounce 300ms → відповідний IPC:
- GlobalSettings поля → `save_settings`
- RecordingSettings поля → `save_recording_settings`
- Хоткеї → `save_settings` + `register_hotkeys`
- Output device → `set_output_device` + `save_settings`

Оптимістичний UI: локальний стан оновлюється одразу, IPC у фоні. При помилці збереження — показати aria-live повідомлення.

---

## Таби

### 1. Загальні (GeneralTab)

Поля з `GlobalSettings`:

| Поле | Компонент | Тип | Default | Примітка |
|------|-----------|-----|---------|----------|
| Мова | `<Select>` | `"uk-UA" \| "en-US"` | auto-detect | `setLanguageTag()` без перезапуску |
| Тема | `<Select>` | `"auto" \| "dark" \| "light"` | `"auto"` | CSS `data-theme` атрибут на `<html>` |
| Згортати до tray | `<Checkbox>` | bool | true | **disabled** — Phase 3A |
| Сповіщення при зміні треку | `<Checkbox>` | bool | true | **disabled** — Phase 3A |
| Назва треку в заголовку | `<Checkbox>` | bool | true | |
| Дія при подвійному кліку | `<Select>` | `"record" \| "play"` | `"record"` | |
| Поріг диску (ГБ) | `<NumberField>` | u32 | 1 | 0 = вимкнено |

**Поля НЕ показані в UI (Phase 2C):** `bandwidthLimitKbps` (Phase 3I), `logRotation`, `logMaxSizeMb` (Phase 3I), `autostart` (Phase 3I). Зберігаються у settings.json з defaults, але UI для них буде в пізніших фазах.

**Мова:** зміна → `setLanguageTag(tag)` (Paraglide) одразу перемальовує весь UI без перезапуску.

**Тема:** додати `data-theme` атрибут на `<html>`, Tailwind dark mode через `[data-theme="dark"]` selector. `auto` = слідувати за `prefers-color-scheme`.

**Disabled поля:** показуються з `isDisabled` + description "(Доступно після реалізації System Tray)".

### 2. Запис (RecordingTab)

Поля з `Profile.recording` (`RecordingSettings`):

| Поле | Компонент | Default | Примітка |
|------|-----------|---------|----------|
| Папка для записів | `<TextField>` + Button "Огляд" | `"recordings"` | `dialog.open({directory: true})` |
| Шаблон імені треку | `<TextField>` | `"%s\\%a - %t"` | |
| Шаблон неповного файлу | `<TextField>` | `"%s\\%a - %t_incomplete"` | |
| Шаблон файлу потоку | `<TextField>` | `"%s\\stream_%d_%time"` | |
| Зберігати файл потоку | `<Checkbox>` | true | |
| Видаляти файл потоку після зупинки | `<Checkbox>` | false | |
| Пропускати перший неповний трек | `<Checkbox>` | true | |
| Мін. тривалість треку (сек) | `<NumberField>` | 30 | skip_short_tracks_ms / 1000 |
| Автокорекція регістру | `<Checkbox>` | true | |

**Browse:** кнопка "Огляд" → IPC `open_directory_picker` → `tauri-plugin-dialog` → повертає обрану теку або null.

**Прев'ю шаблонів:** під кожним шаблоном — текст-опис доступних плейсхолдерів (%s = station, %a = artist, %t = title, %d = date, %time = time).

### 3. Перепідключення (ReconnectionTab)

Поля з `Profile.recording.reconnect` (`ReconnectConfig`):

| Поле | Компонент | Default | Примітка |
|------|-----------|---------|----------|
| Макс. спроб | `<NumberField>` | 0 | 0 = необмежено |
| Інтервал (сек) | `<NumberField>` | 5 | мін. 1 |
| Множник backoff | `<NumberField>` step=0.1 | 1.5 | мін. 1.0 |
| Макс. інтервал (сек) | `<NumberField>` | 300 | |

Зберігається разом із Recording через `save_recording_settings`.

**Mid-recording:** зміни recording settings (output_dir, templates) застосовуються лише до нових записів. Активні записи продовжують використовувати налаштування, з якими були запущені.

### 4. Гарячі клавіші (HotkeysTab)

Відображає `GlobalSettings.hotkeys` (`HotkeyMap`):

| Дія | Field | Default | Поведінка |
|-----|-------|---------|----------|
| Запис (toggle) | `toggleRecording` | `Ctrl+Shift+R` | Toggle запис першого вибраного потоку. Якщо немає вибраного — no-op (ігнорувати) |
| Відтворення (toggle) | `togglePlayback` | `Ctrl+Shift+P` | Якщо щось грає → pause. Якщо pause → resume. Якщо нічого не грає → no-op |
| Гучність + | `volumeUp` | `Ctrl+Shift+Up` | +5% гучності (clamp до 100%) |
| Гучність − | `volumeDown` | `Ctrl+Shift+Down` | −5% гучності (clamp до 0%) |
| Показати/сховати вікно | `toggleWindow` | `Ctrl+Shift+H` | Якщо вікно видиме → hide. Якщо приховане → show + focus |

#### KeyRecorder компонент

```tsx
<div role="group" aria-label={m.hotkeyFor({ action: actionName })}>
  <Label>{actionName}</Label>
  <Button
    aria-label={`${actionName}: ${currentHotkey}. ${m.pressToChange()}`}
    onPress={startRecording}
    onKeyDown={captureKeys}  // у стані recording
  >
    {isRecording ? m.pressKeys() : currentHotkey}
  </Button>
  <Button aria-label={m.clearHotkey()} onPress={clearHotkey}>×</Button>
</div>
```

**Стани:**
- idle: показує поточну комбінацію
- recording: "Натисніть клавіші..." — перехоплює keydown, формує `Ctrl+Shift+R` формат
- Escape під час recording → скасувати без змін

**Валідація:** перевірка дублікатів серед інших хоткеїв. Якщо конфлікт → показати попередження, не зберігати.

**Збереження:** зміна хоткея → `save_settings` (persist) + `register_hotkeys` IPC (перереєструвати в системі).

### 5. Аудіо (AudioTab)

| Поле | Компонент | Примітка |
|------|-----------|----------|
| Пристрій виведення | `<Select>` + Button "Оновити" | `list_output_devices` IPC |

- При відкритті табу → `list_output_devices`
- Вибір → `set_output_device` + `save_settings` (output_device)
- Кнопка "Оновити" → перезавантажити список
- Якщо збережений пристрій недоступний → показати "(Системний за замовчуванням)"

---

## Backend: нові/змінені IPC команди

### Нові команди

| Команда | Params | Returns | Призначення |
|---------|--------|---------|-------------|
| `save_recording_settings` | `RecordingSettings` | `()` | Зберегти recording + reconnect у активний профіль |
| `register_hotkeys` | — | `Vec<String>` | Перереєструвати глобальні хоткеї; повертає список комбінацій що не вдалось зареєструвати |
| `open_directory_picker` | `{defaultPath?: string}` | `Option<String>` | Відкрити діалог вибору теки |

### Існуючі команди (без змін)

- `get_settings` → `GlobalSettings`
- `save_settings` → `()`
- `list_output_devices` → `Vec<AudioDevice>`
- `set_output_device` → `()`

### Глобальні хоткеї — Rust реалізація

```rust
// В setup() або окремому модулі shortcuts.rs:
fn register_global_shortcuts(app: &AppHandle, hotkeys: &HotkeyMap) -> Result<()> {
    let manager = app.global_shortcut();
    manager.unregister_all()?;

    // Ctrl+Shift+R → toggle recording для вибраного потоку
    manager.on_shortcut(&hotkeys.toggle_recording, |app, _, event| {
        if event.state == ShortcutState::Pressed {
            // Отримати вибраний потік, toggle recording
        }
    })?;

    // Ctrl+Shift+P → toggle playback
    // Ctrl+Shift+Up/Down → volume ±5%
    // Ctrl+Shift+H → show/hide window
    ...
}
```

`register_hotkeys` IPC: читає `hotkeys` з `AppState.settings`, викликає `register_global_shortcuts`.

**Startup:** Хоткеї реєструються при запуску програми в `setup()` (з `GlobalSettings.hotkeys`). IPC `register_hotkeys` використовується тільки для перереєстрації при зміні через UI.

### Помилки реєстрації хоткеїв

Якщо глобальний хоткей не вдалося зарєструвати (наприклад, зайнятий іншою програмою):
- Логувати `warn!` з деталями
- Продовжити реєстрацію інших хоткеїв (не зупиняти весь процес)
- Повернути список нереєстрованих хоткеїв у відповіді IPC
- Frontend показує aria-live повідомлення: "Не вдалося зареєструвати хоткей {combo} — можливо, використовується іншою програмою"

### save_recording_settings IPC

```rust
#[tauri::command]
async fn save_recording_settings(
    recording: RecordingSettings,
    state: State<'_, AppState>,
) -> Result<(), RadioError> {
    let mut profile = state.active_profile.write().await;
    profile.recording = recording;
    let snapshot = profile.clone();
    drop(profile);
    tokio::task::spawn_blocking(move || snapshot.save()).await??;
    Ok(())
}
```

---

## Infrastructure

### Tauri Plugins

| Plugin | Cargo.toml | Призначення |
|--------|------------|-------------|
| `tauri-plugin-global-shortcut` | додати | Глобальні хоткеї |
| `tauri-plugin-window-state` | додати | Збереження розміру/позиції вікна |
| `tauri-plugin-dialog` | вже є | Вибір теки (Browse) |

### Tauri v2 Capabilities

Додати permissions до `src-tauri/capabilities/default.json`:

```json
"global-shortcut:default",
"window-state:default"
```

`dialog:default` вже присутній.

### Window State

- `tauri-plugin-window-state` зберігає розмір, позицію, maximized стан автоматично
- Вікно стартує `visible: false` → плагін відновлює стан → `window.show()`
- Жодного коду на фронтенді — плагін працює автоматично
- Видалити `windowWidth`/`windowHeight`/`windowMaximized` з TypeScript інтерфейсу

### Frontend TypeScript sync

Синхронізувати `GlobalSettings` інтерфейс у `src/lib/tauri.ts` з Rust:

```typescript
export interface GlobalSettings {
  language: string;
  theme: "auto" | "dark" | "light";
  activeProfile: string;
  outputDevice: string | null;
  minimizeToTray: boolean;
  showTrayNotifications: boolean;
  showTrackInTitle: boolean;
  diskSpaceThresholdGb: number;
  doubleClickAction: "record" | "play";
  bandwidthLimitKbps: number;
  autostart: boolean;
  hotkeys: HotkeyMap;
  logRotation: boolean;
  logMaxSizeMb: number;
}

export interface HotkeyMap {
  toggleRecording: string;
  togglePlayback: string;
  volumeUp: string;
  volumeDown: string;
  toggleWindow: string;
}
```

### i18n

Додати ~40-50 нових ключів у `src/i18n/messages/uk.json` та `en.json`:
- Назви табів (settings_tab_general, settings_tab_recording, ...)
- Лейбли всіх полів
- Описи/підказки для disabled полів
- KeyRecorder стани (press_to_change, press_keys, clear_hotkey, ...)
- Validation messages

---

## Accessibility (NVDA)

### SettingsDialog
- `role="dialog"`, `aria-label="Налаштування"`, `aria-modal="true"`
- Focus trap: Tab/Shift+Tab циклить всередині діалогу
- Escape → закрити діалог, повернути фокус на trigger element
- При відкритті — фокус на перший таб

### TabList
- React Aria `<Tabs>` — автоматично керує role="tablist", aria-selected, arrow key navigation
- Horizontal orientation: Left/Right для навігації між табами
- Tab → перейти до TabPanel content

### Form Controls
- Всі поля мають видимі `<Label>` через React Aria Components
- Disabled поля мають `description` що пояснює чому disabled
- NumberField: aria-valuemin, aria-valuemax, aria-valuenow
- Select: aria-expanded, aria-activedescendant

### KeyRecorder
- role="group" з aria-label
- Button має aria-label з поточним хоткеєм і інструкцією
- При recording: aria-live="assertive" повідомлення "Натисніть клавіші..."
- При збереженні: aria-live="polite" повідомлення "Хоткей змінено: {combo}"
- При конфлікті: aria-live="assertive" повідомлення про дублікат

### Auto-save feedback
- aria-live="polite" region для "Збережено" / помилок
- Не показувати "Збережено" при кожній зміні — тільки при помилках

---

## File Structure

### Нові файли

```
src/components/settings/
├── SettingsDialog.tsx          # Modal dialog з Tabs
├── GeneralTab.tsx              # Загальні налаштування
├── RecordingTab.tsx            # Налаштування запису
├── ReconnectionTab.tsx         # Перепідключення
├── HotkeysTab.tsx              # Гарячі клавіші
├── AudioTab.tsx                # Аудіо пристрій
├── KeyRecorder.tsx             # Компонент запису хоткея
└── useAutoSave.ts              # Hook для debounced auto-save

src-tauri/src/
├── shortcuts.rs                # Реєстрація глобальних хоткеїв
└── commands/settings_commands.rs  # Розширити: save_recording_settings, register_hotkeys, open_directory_picker
```

### Змінені файли

```
src/lib/tauri.ts                           # Sync GlobalSettings interface, add new IPC wrappers
src/stores/settings.ts                     # Розширити store
src/components/layout/ActivityBar.tsx       # Увімкнити Settings button
src/App.tsx                                # Ctrl+, handler, render SettingsDialog
src/i18n/messages/uk.json                  # ~40-50 нових ключів
src/i18n/messages/en.json                  # ~40-50 нових ключів
src-tauri/Cargo.toml                       # Додати плагіни
src-tauri/tauri.conf.json                  # Plugin capabilities
src-tauri/src/lib.rs                       # Register plugins, register commands
```

---

## Критерії "Done"

- [ ] SettingsDialog відкривається через ⚙️ кнопку та Ctrl+,
- [ ] Таб "Загальні": всі поля працюють, мова перемикається без перезапуску
- [ ] Таб "Запис": всі поля + Browse для папки
- [ ] Таб "Перепідключення": всі поля
- [ ] Таб "Гарячі клавіші": KeyRecorder + валідація дублікатів
- [ ] Таб "Аудіо": вибір пристрою
- [ ] Auto-save працює (debounce 300ms)
- [ ] Глобальні хоткеї працюють у фоні (5 штук)
- [ ] Window state зберігається між сесіями
- [ ] TypeScript інтерфейс синхронізований з Rust
- [ ] NVDA: усі елементи SettingsDialog accessible
- [ ] i18n: uk + en
- [ ] Cargo check проходить
- [ ] `just build-fast` проходить
