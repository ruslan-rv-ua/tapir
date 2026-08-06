# Етапи реалізації Tapir

> **Версія:** 0.1 (draft) | **Версія продукту:** 0.1.0  
> **Підхід:** MVP-first, Walking Skeleton, Vertical Slices  
> **Кількість фаз:** 2 основні + 10 підфаз (3A–3J)  
> **Ризики:** якщо фаза займає більше часу, наступні фази зсуваються; функціонал не обрізається.

> **Примітка (2026-04-23):** назви на кшталт `StreamTable`, `WishlistTable` або grid/table acceptance criteria в цьому документі фіксують попередні етапи реалізації. Для майбутнього refactor навігації й списків пріоритет мали вимоги з `docs/FRD-navigation.md` (видалено).

---

## Зведена таблиця

| Фаза | Назва | Ключове | Статус |
|------|-------|---------|--------|
| 1 | MVP: Core Recording | Запис потоків + розділення треків + теги + базова доступність + i18n setup | ✅ Complete |
| 2A | Player | Live playback, файлове відтворення, volume, output device | ✅ Complete |
| 2B | Wishlist + Ignorelist + Context Menu | Фільтрація треків, контекстне меню станцій | ✅ Complete |
| 2C | SettingsDialog + Shortcuts | Повний діалог налаштувань, глобальні хоткеї, window state | ✅ Complete |
| 3A | System Tray | Tray icon, minimize to tray, balloon tips, dynamic menu | ✅ Complete |
| 3B | Stream Browser | Radio Browser API — пошук станцій | ✅ Complete |
| 3C | Saved Songs Manager | Менеджер записаних файлів, редагування тегів | ✅ Complete |
| 3D | Scheduler | Заплановані записи (одноразові + повторювані) | ✅ Complete |
| 3E | Single Instance | Named Mutex (глобальний), фокус 1-ї інстанції, передача argv | ✅ Complete |
| 3F | Profile Manager | Повний CRUD профілів, import/export | ✅ Complete |
| 3G | CLI Arguments | Аргументи командного рядка | ✅ Complete |
| 3H | Post-processing | Зовнішні програми після запису | ⬜ |
| 3I | Polish Bundle | High Contrast, Autostart, Log rotation | ⬜ |
| 3J | Stream Import/Export | Імпорт/експорт потоків профілю (M3U8/PLS) з перевіркою | ✅ Complete |
| 3K | Crash Recovery | clean_shutdown flag + resume записів на старті | ✅ Complete |

---

## Фаза 1 — MVP: Core Recording

**Ціль:** повноцінний запис потоків у файли з розділенням треків та тегами. Повна навігація клавіатурою та screen reader support. Один профіль Default, базові налаштування.

### Включено

**Backend (Rust):**

| Модуль | Опис |
|--------|------|
| `portable.rs` | EXE-відносні шляхи, `base_dir()`, `data_dir()` |
| `settings.rs` | Читання/запис `data/settings.json` з defaults |
| `profile.rs` | Один Default-профіль, без переключення |
| `sanitize.rs` | Шаблони імен файлів (%a, %t, %s...), колізії (_2, _3), заборонені символи |
| `errors.rs` | `RadioError` enum (thiserror) |
| `stream::connection` | HTTP з'єднання з ICY headers (reqwest + icy-metadata) |
| `stream::format` | Визначення формату (MP3/AAC) за content-type та magic bytes |
| `stream::playlist` | Парсинг PLS/M3U (~30 рядків кожен) |
| `stream::splitter` | Розбивка на треки за ICY metadata |
| `stream::recorder` | Запис raw bytes у stream file + track files |
| `stream::manager` | Координатор: start/stop recording, статуси, reconnect |
| `tags::writer` | Запис ID3v2/M4A тегів (lofty) після фіналізації треку |
| `commands/stream_commands` | IPC: `get_streams`, `add_stream`, `remove_stream`, `update_stream`, `start_recording`, `stop_recording`, `stop_all_recordings`, `get_stream_status` |
| `commands/settings_commands` | IPC: `get_settings`, `save_settings` (мінімальний) |

**Frontend (React):**

| Компонент | Опис |
|-----------|------|
| `App.tsx` | Root: ActivityBar + Content layout |
| `ActivityBar.tsx` | Ліва панель: іконки секцій + ProfileSwitcher |
| `StreamsPanel.tsx` | Секція: список потоків + контроли |
| `StreamTable.tsx` | React Aria TableView (sortable, accessible grid) |
| `StreamRow.tsx` | Рядок: статус, станція, трек, бітрейт |
| `AddStreamDialog.tsx` | Модальний діалог додавання/редагування потоку (React Aria Modal) |
| `StatusBar.tsx` | Кількість записів, вільне місце, найдовший запис |
| `CommandPalette.tsx` | Ctrl+K: fuzzy search дій, станцій, пісень |
| `ProfileSwitcher.tsx` | Popover внизу ActivityBar — UI placeholder, нефункціональний до Фази 4; у Фазі 1 disabled + tooltip/aria-description "Буде доступно у Фазі 4" |
| `ToastContainer.tsx` | Toast-повідомлення (bottom-right, aria-live) |
| `LiveAnnouncer.tsx` | Централізований aria-live контейнер |
| `ConfirmDialog.tsx` | Діалог підтвердження деструктивних дій |
| `ErrorBoundary.tsx` | Обробка помилок React |

**Stores (Nanostores):**

| Store | Опис |
|-------|------|
| `streams.ts` | Список потоків + recording states |
| `settings.ts` | Дзеркало глобальних налаштувань |
| `navigation.ts` | Активна секція, стан Command Palette |
| `toasts.ts` | Черга toast-повідомлень |
| `announcer.ts` | Черга оголошень для screen reader |

**Hooks:**

| Hook | Опис |
|------|------|
| `useTauriEvent.ts` | `listen()` wrapper для React lifecycle |
| `useAnnounce.ts` | Announce через LiveAnnouncer |

**Infrastructure:**

| Елемент | Опис |
|---------|------|
| Paraglide.js | Setup + vite plugin. UK рядки одразу, EN як placeholder |
| Tailwind CSS v4 | Стилі, `focus-visible:ring-*`, `sr-only`, `dark:` |
| Vite 8 | Frontend build |
| Tauri conf | `decorations: true`, CSP, capabilities |
| Portable structure | `data/settings.json`, `data/profiles/Default.tapirprofile`, `data/recordings/` |

**Accessibility (обов'язково у Фазі 1):**

- Tab order: [Activity Bar] → [StreamTable] → [Toolbar] → [StatusBar]
- ARIA roles на всіх елементах (grid, gridcell, columnheader, button, dialog)
- Live regions: track-changed (polite), recording started/stopped (assertive), errors (assertive)
- Focus trap в діалогах (AddStream, Confirm)
- Visible focus indicator (Tailwind `focus-visible:ring-2`)
- `lang` attribute відповідно до обраної мови

### НЕ включено

- ❌ Player (відтворення)
- ❌ Wishlist/Ignorelist (matcher, UI). Поле `StreamInfo.ignorelist` вже присутнє у data model, але логіка перевірки — Фаза 2
- ❌ Scheduler (заплановані записи)
- ❌ Browser (Radio Browser API)
- ❌ Saved Songs (менеджер файлів)
- ❌ Post-processing
- ❌ Профілі (переключення, CRUD)
- ❌ Повний SettingsDialog (мова, тема, хоткеї, аудіо-пристрій)
- ❌ System tray + balloon tip
- ❌ CLI arguments
- ❌ Single instance (Named Mutex)
- ❌ Windows High Contrast (forced-colors)
- ❌ Autostart
- ❌ Window state persistence
- ❌ Bandwidth limiting

### Walking Skeleton (перший тиждень)

Перший крок усередині Фази 1 — підтвердити архітектуру end-to-end:

1. `cargo tauri init` + React 19 + Vite 8
2. Одна IPC команда `start_recording(url)` → reqwest GET → записати raw bytes у файл
3. Одна IPC подія `emit("recording-status", ...)`
4. Мінімальний UI: кнопка "Record" + input URL
5. Portable: `data/` directory поряд з EXE

Якщо це працює — архітектура підтверджена, Tauri IPC ↔ Rust ↔ reqwest ↔ file I/O з'єднані. Після цього Фаза 1 розширюється до повного scope з таблиці "Включено".

### Критерії "Done" для Фази 1

- [x] Користувач може додати потік за URL (прямий або PLS/M3U)
- [x] Запис одного або кількох потоків одночасно
- [x] Автоматичне розділення на треки за ICY metadata
- [x] ID3v2/M4A теги записуються при фіналізації треку
- [x] Автоматичне перепідключення при обриві
- [x] Файли зберігаються за шаблоном в `data/recordings/`
- [x] Повна навігація клавіатурою (Tab, Arrow, Enter, Space, Escape)
- [x] NVDA читає таблицю потоків, оголошує зміну треку та статус запису
- [x] Фокус trap в діалогах
- [x] Portable EXE структура працює (data/ поряд з exe)
- [x] Рядки UI через Paraglide.js (uk)
- [x] Empty state для StreamTable при 0 потоків (CTA кнопка "Додати потік" з autoFocus)
- [x] First-run announcement через LiveAnnouncer при першому запуску
- [x] `aria-label` для checkbox вибору рядка у StreamTable у форматі `Вибрати потік: {streamName}`
- [x] `aria-current="page"` динамічно оновлюється при зміні секції

---

## Фаза 2 — Wishlist + Settings + Player

**Ціль:** фільтрація записів через wishlist/ignorelist, повне налаштування програми, відтворення live потоків та записаних файлів.

> **Phase 2A (Player)** — ✅ реалізовано. Залишок розбито на підфази 2B і 2C.

### Фаза 2A — Player (✅ Complete)

Повністю реалізовано: `PlayerEngine` (rodio 0.22), `LiveSource` (rtrb + symphonia), 10 IPC команд, `PlayerPanel`, `VolumeSlider`, `PlaybackPosition`, `$playerStatus` nanostore, NVDA-доступність.

---

### Фаза 2B — Wishlist + Ignorelist + Контекстне меню станцій ✅

**Ціль:** автоматична фільтрація треків через wishlist/ignorelist + контекстне меню у таблиці потоків.

**Залежності:** Phase 1 (stream::manager, ICY metadata)

**Backend:**

| Модуль | Опис |
|--------|------|
| `wishlist::matcher` | Wildcard matching (*, ?) для ICY metadata |
| `commands/wishlist_commands` | IPC: get/add/remove wishlist + ignorelist entries |

**Frontend:**

| Компонент | Опис |
|-----------|------|
| `WishlistPanel.tsx` | Секція (Activity Bar tab): список wishlist + ignorelist |
| `WishlistTable.tsx` | Accessible table з patterns (wildcard, per-stream/global) |
| `StreamRow.tsx` (оновлення) | Контекстне меню: Play, Record, Edit, Remove, Add to Wishlist, Add to Ignorelist |

**Store:** `profile.ts` (розширення) — wishlist + ignorelist дані

**Критерії "Done" для Фази 2B:**
- [x] Wishlist matching працює при зміні ICY metadata
- [x] Ignorelist фільтрує небажані треки (глобальний + per-stream)
- [x] Precedence: per-stream ignorelist → global ignorelist → wishlist → звичайна поведінка
- [x] WishlistPanel з CRUD операціями (додати, видалити, редагувати pattern)
- [x] Контекстне меню StreamRow (Shift+F10, right-click): Play, Record, Edit, Remove
- [x] Контекстне меню StreamRow: додати до Wishlist / Ignorelist
- [x] NVDA: контекстне меню accessible (React Aria Menu)

---

### Фаза 2C — SettingsDialog + Global Shortcuts + Window State

**Ціль:** повний діалог налаштувань програми, глобальні гарячі клавіші, збереження позиції вікна.

**Залежності:** Phase 1 (settings.rs)

**Backend:**

| Модуль | Опис |
|--------|------|
| `commands/settings_commands` | Розширений: save_settings з повним набором полів |

**Frontend:**

| Компонент | Опис |
|-----------|------|
| `SettingsDialog.tsx` | Повноекранний діалог з табами |
| `GeneralSettings.tsx` | Мова, тема, tray, notifications |
| `RecordingSettings.tsx` | Output dir, templates, reconnect, min track duration |
| `HotkeySettings.tsx` | KeyRecorder для глобальних хоткеїв |

**Infrastructure:**

| Елемент | Опис |
|---------|------|
| `tauri-plugin-global-shortcut` | Ctrl+Shift+R, P, Up, Down, H |
| `tauri-plugin-window-state` | Запам'ятовування позиції/розміру |
| `tauri-plugin-dialog` | Browse кнопка для вибору теки |

**Критерії "Done" для Фази 2C:**
- [x] SettingsDialog відкривається та зберігає всі налаштування
- [x] Мова: переключення uk/en без перезапуску
- [x] Тема: auto/dark/light
- [x] Recording settings: output dir (Browse), templates, reconnect
- [x] Глобальні гарячі клавіші працюють у фоні
- [x] Налаштування хоткеїв через UI (KeyRecorder)
- [x] Window state зберігається між сесіями
- [x] NVDA: усі елементи SettingsDialog accessible

---

## Фази 3A–3I — Декомпозовані підфази (замість оригінальних Фаз 3–4)

> Оригінальні Фаза 3 (Browser + Scheduler) та Фаза 4 (Saved Songs + Advanced) розбиті на 9 незалежних підфаз.
> Впорядковані за цінністю для користувача. Детальний аналіз — у research-phase-decomposition.md (видалено).

### Зведена таблиця підфаз

| # | Підфаза | Залежить від | Цінність |
|---|---------|-------------|----------|
| 3A | System Tray + Minimize to Tray | Phase 1 + 2 | 🔴 Критична |
| 3B | Stream Browser (Radio Browser API) | — (незалежна) | 🔴 Критична |
| 3C | Saved Songs Manager | Phase 1 | 🟠 Висока |
| 3D | Scheduler (Заплановані записи) | Phase 1 | 🟠 Висока |
| 3E | Single Instance | — (незалежна) | 🟡 Середня |
| 3F | Profile Manager (повний CRUD) | Phase 1 | 🟡 Середня |
| 3G | CLI Arguments | Phase 1 + 2, 3E | 🟡 Середня |
| 3H | Post-processing | Phase 1 | 🟢 Низька |
| 3I | Polish Bundle (HC, Autostart, Logs, BW) | — (незалежні) | 🟢 Низька |
| 3J | Stream Import/Export (M3U8/PLS) | Phase 1 (stream::playlist) | 🟡 Середня |
| 3K | Crash Recovery (clean_shutdown + resume) | Phase 1 (graceful_shutdown) | 🟠 Висока |

---

### Фаза 3A — System Tray + Minimize to Tray

**Ціль:** робота програми у фоні з іконкою в системному треї, balloon-сповіщеннями та динамічним контекстним меню.

**Залежності:** Phase 1 (recording status), Phase 2 (player status)

**Backend:**

| Модуль | Опис |
|--------|------|
| `tray.rs` | `TrayIconBuilder`, `rebuild_tray_menu()`, обробка кліків |
| `tray_menu.rs` | Побудова динамічного меню за станом (player, recordings, window visibility) |
| Balloon tip | `Shell_NotifyIconW` через `windows-rs` для сповіщень про зміну треку |

**Settings:**

| Елемент | Опис |
|---------|------|
| `minimizeToTray` | Close → hide замість exit |
| `showTrayNotifications` | Balloon tip при зміні треку (throttle 3с) |

**Критерії "Done":**
- [x] Іконка у systemtray з tooltip
- [x] Right-click — контекстне меню: "Зараз грає" info, Грати/Пауза, Зупинити, Записи info, Зупинити всі, Показати/Приховати, Вихід
- [x] Меню динамічно оновлюється при зміні стану (`player-status`, `recording-status`, window visibility)
- [x] Left-click — toggle видимості вікна
- [x] `minimizeToTray` setting працює (close → hide)
- [x] Balloon tip при зміні треку (з throttle)
- [x] Confirm dialog при exit з активними записами

---

### Фаза 3B — Stream Browser (Radio Browser API) ✅

**Ціль:** пошук нових станцій через Radio Browser API без ручного введення URL.

**Залежності:** немає (лише reqwest, вже в проєкті)

**Backend:**

| Модуль | Опис |
|--------|------|
| `browser::api` | REST клієнт Radio Browser API: пошук, фільтрація, DNS-based server discovery |
| `commands/browser_commands` | IPC: `search_stations`, `get_station_details`, `add_station_from_browser` |

**Frontend:**

| Компонент | Опис |
|-----------|------|
| `BrowserPanel.tsx` | Секція (Activity Bar tab): пошук станцій |
| `SearchForm.tsx` | React Aria ComboBox + filters (формат, мін. бітрейт, жанр) |
| `ResultsTable.tsx` | Accessible table результатів з кнопками "Додати" |

**Store:** `browser.ts` — search results, loading state, selected filters

**Критерії "Done":**
- [x] Пошук станцій за назвою, жанром, форматом, бітрейтом
- [x] Результати у accessible table (NVDA grid navigation)
- [x] Кнопка "Додати" → станція з'являється у профілі
- [x] Activity Bar icon для Browser tab
- [x] Empty state та loading state accessible

---

### Фаза 3C — Saved Songs Manager

**Ціль:** менеджмент записаних файлів у самій програмі.

**Залежності:** Phase 1 (recordings directory, tags::writer)

**Backend:**

| Модуль | Опис |
|--------|------|
| `commands/songs_commands` | IPC: `get_saved_songs`, `delete_song`, `rename_song`, `update_song_tags`, `open_in_explorer`, `import_songs` |

**Frontend:**

| Компонент | Опис |
|-----------|------|
| `SongsPanel.tsx` | Секція (Activity Bar tab): збережені пісні |
| `SongsTable.tsx` | Accessible sortable table з фільтрами та пошуком |
| `TagEditor.tsx` | Діалог редагування ID3v2/M4A тегів |

**Store:** `songs.ts` — список збережених треків, фільтри, сортування

**Критерії "Done":**
- [x] Список усіх записаних файлів з metadata
- [x] Сортування за назвою, артистом, датою, розміром
- [x] Фільтрація та пошук
- [x] Контекстне меню: відтворити, відкрити в explorer, видалити, перейменувати, редагувати теги
- [x] TagEditor: зміна artist, title, album, genre
- [x] Confirm dialog при видаленні
- [x] NVDA: composite-list navigation (FRD), live region при операціях

---

### Фаза 3D — Scheduler (Заплановані записи)

**Ціль:** автоматичний запис за розкладом (одноразовий та повторюваний).

**Залежності:** Phase 1 (stream::manager для start/stop recording)

**Backend:**

| Модуль | Опис |
|--------|------|
| `scheduler::timer` | Per-minute check loop з `CancellationToken`, запуск та зупинка recording через `stream::manager` |
| `commands/schedule_commands` | IPC: `get_schedules`, `add_schedule`, `update_schedule`, `delete_schedule`, `toggle_schedule` |

**Frontend:**

| Компонент | Опис |
|-----------|------|
| `SchedulePanel.tsx` | Секція (Activity Bar tab): заплановані записи |
| `ScheduleTable.tsx` | Accessible table з розкладом |
| `ScheduleForm.tsx` | Діалог: тип (одноразовий/повторюваний), потік, дата/день, час, тривалість |

**Store:** `schedule.ts` — список scheduled recordings, enabled/disabled status

**Критерії "Done":**
- [x] Одноразовий запис: дата + час + тривалість
- [x] Повторюваний запис: день тижня + час + тривалість
- [x] Toggle enabled/disabled без видалення
- [x] Конфлікт: потік вже записується → не дублювати
- [x] Пропущені записи логуються
- [x] Live regions: "Плановий запис розпочато/завершено"
- [x] NVDA: таблиця accessible, форма accessible

---

### Фаза 3E — Single Instance

**Ціль:** запобігання одночасному запуску двох копій програми; фокус наявного вікна і передача аргументів першій інстанції.

**Залежності:** немає (незалежна). Від цієї фази залежить 3G (CLI).

**Рішення дизайну:**
- **Ключ mutex — глобальний** (bundle identifier `ua.ruslanrv.tapir`): одна копія на користувача незалежно від `--datadir`. Наслідок: `--datadir` діє лише на ПЕРШІЙ інстанції; повторний запуск з іншим `--datadir` передасть argv першій і вийде (задокументувати в 3G).
- **Плагін реєструється ПЕРШИМ** — перед усіма іншими, зокрема перед log-плагіном: друга (вмираюча) інстанція не повинна торкатися спільного `tapir.log` (стратегія ротації спрацьовує і при ініціалізації плагіна, тож файл був би проротований/затертий).

**Backend:**

| Елемент | Опис |
|---------|------|
| `tauri-plugin-single-instance` | Named Mutex (глобальний ключ) + локальний IPC для передачі argv |
| Колбек активації | `unminimize → show → set_focus`; працює навіть коли вікно сховане в трей |
| Foreground-handoff | Друга інстанція викликає `AllowSetForegroundWindow` перед exit, інакше `SetForegroundWindow` блокується ОС і NVDA промовчить (див. nvda-startup-foreground) |
| argv-проксі | Сирий argv передається у спільний CLI-обробник першої інстанції — контракт для 3G: парсинг має бути викликуваним і на старті, і з колбека (друга інстанція не доходить до `.setup()`) |

**Критерії "Done":**
- [x] single-instance зареєстрований першим плагіном (перед log)
- [x] Другий запуск → перша інстанція `unminimize+show+set_focus`, працює і з трею
- [x] NVDA озвучує активацію вікна при другому запуску (foreground-handoff)
- [x] argv другого запуску проксюється у спільний CLI-обробник (готовність до 3G)
- [x] Задокументовано: `--datadir` діє лише на першій інстанції (глобальний ключ)

**Винесено з цієї фази:** `clean_shutdown` / resume записів після збою → **Фаза 3K (Crash Recovery)**.

---

### Фаза 3F — Profile Manager (повний CRUD)

**Ціль:** створення, перемикання та управління кількома профілями.

**Залежності:** Phase 1 (profile.rs вже має Default profile)

**Backend:**

| Модуль | Опис |
|--------|------|
| `profile.rs` (розширення) | CRUD: create, rename, delete (крім Default), duplicate |
| `commands/profile_commands` | IPC: `list_profiles`, `switch_profile`, `create_profile`, `delete_profile`, `export_profile`, `import_profile` |

**Frontend:**

| Компонент | Опис |
|-----------|------|
| `ProfileManager.tsx` | UI: список профілів, операції, import/export |
| `ProfileSwitcher.tsx` (оновлення) | Активувати повний функціонал замість disabled placeholder |

**Критерії "Done":**
- [x] Список профілів з поточним позначеним
- [x] Створення нового профілю
- [x] Перемикання між профілями
- [x] Видалення профілю (крім Default, з confirm)
- [x] Export/import `.tapirprofile` файлу
- [x] Confirm при switch якщо є активні записи
- [x] ProfileSwitcher у ActivityBar працює

---

### Фаза 3G — CLI Arguments (✅ Complete)

**Ціль:** підтримка аргументів командного рядка для автоматизації та скриптів.

**Залежності:** Phase 1 + Phase 2 (stream::manager + player), **3E** (single instance для передачі аргументів)

**Backend:**

| Елемент | Опис |
|---------|------|
| `tauri-plugin-cli` | clap-based парсинг аргументів |
| CLI handler | Обробка `--record`, `--play`, `--stop-*`, `--wish-*`, `--profile`, `--minimize` |

**Критерії "Done":**
- [x] `--record URL` запускає запис
- [x] `--play URL` запускає відтворення
- [x] `--stop-recording` / `--stop-playback` зупиняють
- [x] `--wish-add` / `--wish-remove` керують wishlist
- [x] `--profile NAME` вибирає профіль при запуску
- [x] `--minimize` запуск згорнутим до tray
- [x] При повторному запуску args передаються першій інстанції
- [x] Exit codes: 0 (success), 1 (error), 2 (invalid args)

> **Рішення (2026-06-15):** `--datadir` вилучено зі scope — занадто складно (потребує зміни `portable.rs`, глобальний mutex обмежує цінність), реальна потреба не виявлена.

---

### Фаза 3H — Post-processing

**Ціль:** запуск зовнішніх програм після запису для конвертації, нормалізації тощо.

**Залежності:** Phase 1 (recordings, подія завершення треку)

**Backend:**

| Модуль | Опис |
|--------|------|
| `postprocess::runner` | Запуск зовнішніх програм, timeout (120с default), черга |
| `commands/postprocess_commands` | IPC: `get_postprocess_config`, `save_postprocess_config` |

**Frontend:**

| Компонент | Опис |
|-----------|------|
| `PostprocessSettings.tsx` | UI: шлях до програми, аргументи, timeout, triggers |

**Критерії "Done":**
- [ ] Запуск зовнішньої програми після фіналізації треку
- [ ] Налаштування аргументів (placeholders %file, %artist, %title)
- [ ] Timeout з kill process
- [ ] Вибір тригеру: завершений / незакінчений трек
- [ ] Черга: не більше N одночасних процесів

---

### Фаза 3I — Polish Bundle

**Ціль:** набір незалежних polish-фіч, кожна може бути реалізована окремо.

**Залежності:** немає (кожен елемент незалежний)

#### 3I-1. Windows High Contrast

- `forced-colors:` CSS для всіх custom компонентів (StatusIcon, Badge, Toast, Slider thumb, Progress track)
- [x] Усі кастомні елементи коректно відображаються у Windows High Contrast mode

#### 3I-2. Autostart (✅ Complete)

- Прямий запис у `HKCU\…\Run` через `winreg` (`autostart.rs`) + перевірка шляху EXE при запуску (`reconcile_on_startup`). _Не `tauri-plugin-autostart` — ручний winreg для контролю над командою portable-EXE._
- CLI `--minimize` (`cli.rs`) → старт у трей; IPC `sync_autostart`; UI — два toggle у `GeneralTab.tsx`.
- [x] Setting "Запускати з Windows" працює
- [x] Окреме setting "Запускати мінімізованим" (`autostart_minimized`)
- [x] Якщо EXE переміщено, autostart деактивується (тихо + polite NVDA)

#### 3I-3. Log Rotation (✅ Complete)

- `tauri-plugin-log` з ротацією (макс. розмір; стратегія `KeepSome(1)` фіксована — актив + 1 датований архів, разом ≤ ~2× max_size)
- Налаштовується лише макс. розмір файлу (дефолт 10 МБ, 1–100) в Advanced settings; стратегія не виводиться в UI
- [x] Логи ротуються при досягненні макс. розміру (при записі та при ініціалізації плагіна)

#### 3I-4. Bandwidth Limiting — ❌ Відхилено

> **Рішення (2026-06-15):** Фіча виключена зі scope. Обґрунтування: радіо-потоки мають
> фіксований бітрейт (128–320 kbps), який вже малий. Реального кейсу насичення каналу
> при типовому використанні не виявлено. Вартість реалізації (throttle в `stream::connection`,
> UI, per-stream налаштування, взаємодія з PlayerEngine, ICY-metadata timing) не виправдана.
> Повертатись лише якщо реальне використання покаже насичення каналу при >5 одночасних записах.

---

### Фаза 3J — Stream Import/Export (M3U8/PLS)

**Ціль:** імпорт і експорт списку потоків активного профілю у форматах M3U8/PLS,
з перевіркою працездатності та діалогом вибору при імпорті.

**Залежності:** Phase 1 (`stream::playlist`, `stream::connection`)

**Backend:**

| Модуль | Опис |
|--------|------|
| `stream::playlist` (розшир.) | `parse_pls_all`/`parse_m3u_all`/`parse_playlist_all`, `to_m3u8`/`to_pls` |
| `stream::probe` | Перевірка працездатності + ICY-метадані (поверх `connection::connect`) |
| `commands::stream_io_commands` | IPC: `begin_stream_import`, `validate_import_candidates`, `commit_stream_import`, `export_streams` |

**Frontend:**

| Компонент | Опис |
|-----------|------|
| `ImportStreamsDialog.tsx` | Список кандидатів, живі статуси перевірки, вибір, коміт |
| `ExportFormatDialog.tsx` | Вибір формату M3U8/PLS |
| `StreamsPanel.tsx` (розшир.) | Кнопки «Імпорт…»/«Експорт…» у тулбарі + «Імпорт…» в empty-state |

**Критерії "Done":**
- [x] Імпорт `.m3u/.m3u8/.pls` (формат за вмістом, не лише за розширенням)
- [x] Перевірка кожного потоку на працездатність (concurrency), живі статуси через `stream-import-progress`
- [x] Діалог вибору потоків; дублікати позначені й вимкнені; помилкові — доступні
- [x] Імпорт зберігає лише назву (ICY→Title→URL); інші метадані заповнюються при першому записі
- [x] Експорт усіх потоків профілю у M3U8/PLS (без credentials)
- [x] NVDA: aria-live прогрес/підсумок, доступні чекбокси й radio-group

**Відкладено (майбутнє в межах 3J):**
- [ ] Оновлення назви/метаданих існуючого потоку з результату перевірки при імпорті дубліката (поки що дублікати просто пропускаються)

---

### Фаза 3K — Crash Recovery (✅ Complete)

**Ціль:** виявлення аварійного завершення і безпечне відновлення активних записів після рестарту.

**Залежності:** Phase 1 (`graceful_shutdown`).

**Контекст:** до цієї фази `Profile.active_recording_urls` існувало лише в типах — оновлювалось у `graceful_shutdown`, але споживача не було. Список писався тільки при чистому виході, тож після збою він застарілий; сліпе відновлення з нього хибне. Фаза вводить окремий живий снапшот `data/state.json` і **прибирає** мертве поле `active_recording_urls` з `Profile`.

**Backend:**

| Модуль | Опис |
|--------|------|
| `crash_recovery.rs` | `SessionState` (`clean_shutdown` + `active_recordings: Vec<ActiveRecording>`) — `load`/`save` атомарні (temp→rename); `mark_session_start`/`mark_clean_shutdown`; `build_snapshot`/`resume_recordings`; снапшот-писар (`spawn_snapshot_writer`, `SnapshotShared`: `Notify` + `interval` 30с + 500мс debounce) |
| `portable.rs` | `state_path()` → `data/state.json` |
| `app_state.rs` | `manual_resume_stream_ids(statuses, scheduler_owned)` — чиста функція, `stream_id`-и активних непланових записів; `graceful_shutdown` скасовує писаря **першим**, потім пише `clean_shutdown: true` останнім |
| `lib.rs` (setup-хук) | читає попередній `SessionState` **до** `mark_session_start()`; якщо `!clean_shutdown && !active_recordings.is_empty()` — `resume_recordings` (кожен `stream_id` → `StreamInfo` активного профілю, з перевіркою вільного місця), підсумок стешиться в `ResumeNotice`; спавнить писаря |
| `commands/app_commands.rs` (`frontend_ready`) | дренує `ResumeNotice` (якщо є) → емітує подію `crash-resume` `{resumed, total}` |

**Frontend:**

| Елемент | Опис |
|---------|------|
| `useCrashResumeFeedback` | слухає `crash-resume`, локалізує (uk plural forms) і озвучує через `LiveAnnouncer` (polite) + info-toast; порожній снапшот → події немає взагалі → тиша |

**Поведінка при виявленому збої:** тихий авто-resume без діалогу + `aria-live` анонс (дружній до NVDA дефолт). Анонс: усі підняті → «Відновлено N…»; частково → «Відновлено N з M…»; порожній снапшот (вкл. перший запуск) → тиша.

**Часткові файли** з моменту збою залишаються без змін (лише лог) — MP3/AAC не потребують обов'язкової фіналізації.

**Критерії "Done":**
- [x] `clean_shutdown` пишеться `false` на старті / `true` при чистому виході (після скасування писаря)
- [x] Періодичний снапшот `stream_id` живих записів окремою tokio-задачею (`Notify` + `interval` ≤ 30с)
- [x] Resume зі снапшота `state.json` на старті — `stream_id` → `StreamInfo` активного профілю
- [x] Тихий авто-resume + live-анонс (без модального діалогу)
- [x] NVDA: підсумок відновлення озвучується (`useCrashResumeFeedback`)
- [x] `Profile.active_recording_urls` прибрано

Докладніше — [docs/backlog/done/p1-crash-recovery.md](backlog/done/p1-crash-recovery.md) (прийняті рішення, критерії) і `src-tauri/src/crash_recovery.rs` (джерело правди для точної структури `state.json`).

---

## Залежності між фазами

```
Phase 1: Core Recording ✅
  ├── stream::manager (central)
  ├── settings.rs
  ├── profile.rs (Default only)
  ├── portable.rs
  └── tags::writer

Phase 2A: Player ✅
  └── player::engine ← незалежне HTTP-з'єднання, rtrb ring buffer, symphonia

Phase 2B: Wishlist + Ignorelist + Context Menu ← Phase 1 (stream::manager, ICY metadata)
Phase 2C: SettingsDialog + Shortcuts ← Phase 1 (settings.rs)

Phase 3A: System Tray ← Phase 1 (recording status) + Phase 2A (player status)
Phase 3B: Stream Browser ← незалежна (лише reqwest + JSON)
Phase 3C: Saved Songs ← Phase 1 (recordings, tags::writer)
Phase 3D: Scheduler ← Phase 1 (stream::manager)
Phase 3E: Single Instance ← незалежна
Phase 3F: Profile Manager ← Phase 1 (profile.rs)
Phase 3G: CLI ← Phase 1 + Phase 2A + Phase 3E
Phase 3H: Post-processing ← Phase 1 (recordings)
Phase 3I: Polish Bundle ← незалежна (кожен елемент)
Phase 3J: Stream Import/Export ← Phase 1 (stream::playlist, stream::connection)
Phase 3K: Crash Recovery ✅ ← Phase 1 (graceful_shutdown)
```

Підфази 2B і 2C незалежні одна від одної. Підфази 3B, 3E, 3I повністю незалежні. Підфази 3C, 3D, 3F, 3H, 3J, 3K залежать лише від Phase 1 (завершена) → можна починати негайно. Тільки 3A та 3G мають залежність від Phase 2A.

---

## Джерела досліджень

Деталі обґрунтування фазування — в дослідженнях, проведених під час планування.
Декомпозиція фаз 3–4 — у research-phase-decomposition.md (видалено).
