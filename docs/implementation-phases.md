# Етапи реалізації Tapir

> **Версія:** 0.1 (draft) | **Версія продукту:** 0.1.0  
> **Підхід:** MVP-first, Walking Skeleton, Vertical Slices  
> **Кількість фаз:** 4

---

## Зведена таблиця

| Фаза | Назва | Ключове | Орієнтовний scope |
|------|-------|---------|-------------------|
| 1 | MVP: Core Recording | Запис потоків + розділення треків + теги + базова доступність + i18n setup | ~14 work items |
| 2 | Wishlist + Settings + Player | Wishlist/ignorelist, повний SettingsDialog, live playback, файлове відтворення | ~12 work items |
| 3 | Browser + Scheduler | Radio Browser API, заплановані записи | ~8 work items |
| 4 | Saved Songs + Advanced | Менеджер файлів, профілі, CLI, tray, post-processing, High Contrast | ~14 work items |

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
| `ProfileSwitcher.tsx` | Popover внизу ActivityBar — UI placeholder, нефункціональний до Фази 4 |
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
- ❌ Wishlist/Ignorelist (matcher, UI)
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

Якщо це працює — архітектура підтверджена, Tauri IPC ↔ Rust ↔ reqwest ↔ file I/O з'єднані.

### Критерії "Done" для Фази 1

- [ ] Користувач може додати потік за URL (прямий або PLS/M3U)
- [ ] Запис одного або кількох потоків одночасно
- [ ] Автоматичне розділення на треки за ICY metadata
- [ ] ID3v2/M4A теги записуються при фіналізації треку
- [ ] Автоматичне перепідключення при обриві
- [ ] Файли зберігаються за шаблоном в `data/recordings/`
- [ ] Повна навігація клавіатурою (Tab, Arrow, Enter, Space, Escape)
- [ ] NVDA читає таблицю потоків, оголошує зміну треку та статус запису
- [ ] Фокус trap в діалогах
- [ ] Portable EXE структура працює (data/ поряд з exe)
- [ ] Рядки UI через Paraglide.js (uk)
- [ ] Empty state для StreamTable при 0 потоків (CTA кнопка "Додати потік" з autoFocus)
- [ ] First-run announcement через LiveAnnouncer при першому запуску
- [ ] `aria-label` для checkbox вибору рядка у StreamTable
- [ ] `aria-current="page"` динамічно оновлюється при зміні секції

---

## Фаза 2 — Wishlist + Settings + Player

**Ціль:** фільтрація записів через wishlist/ignorelist, повне налаштування програми, відтворення live потоків та записаних файлів.

### Включено

**Backend:**

| Модуль | Опис |
|--------|------|
| `wishlist::matcher` | Wildcard matching (*, ?) для ICY metadata |
| `commands/wishlist_commands` | IPC: get/add/remove wishlist + ignorelist |
| `player::engine` | rodio + symphonia: live playback (tee від StreamManager), файлове відтворення |
| `commands/player_commands` | IPC: play_stream, play_file, pause, stop, seek, set_volume, get/set_output_device |
| `commands/settings_commands` | Розширений: save_settings з повним набором полів |

**Frontend:**

| Компонент | Опис |
|-----------|------|
| `WishlistPanel.tsx` | Tab: список wishlist + ignorelist |
| `WishlistTable.tsx` | Accessible table з patterns |
| `PlayerPanel.tsx` | Панель програвача (complementary region) |
| `VolumeSlider.tsx` | React Aria Slider (0-100%, accessible) |
| `ProgressBar.tsx` → `PlaybackPosition.tsx` | Slider (file seek) / ProgressBar (live stream) |
| `SettingsDialog.tsx` | Повноекранний діалог: мова, тема, output dir, templates, reconnect, аудіо-пристрій |
| `HotkeySettings.tsx` | KeyRecorder для глобальних хоткеїв |
| `GeneralSettings.tsx` | Мова, тема, tray, notifications |
| `RecordingSettings.tsx` | Output dir, templates, reconnect |

**Stores:**

| Store | Опис |
|-------|------|
| `player.ts` | Playback state, volume, position |
| `profile.ts` | Active profile data (wishlist included) |

**Infrastructure:**

| Елемент | Опис |
|---------|------|
| Global shortcuts | `tauri-plugin-global-shortcut` — Ctrl+Shift+R, P, Up, Down, H |
| Window state | `tauri-plugin-window-state` — запам'ятовування позиції/розміру |

### Критерії "Done" для Фази 2

- [ ] Wishlist matching працює при зміні ICY metadata
- [ ] Ignorelist фільтрує небажані треки (глобальний + per-stream)
- [ ] Live playback потоку через tee від recorder
- [ ] Відтворення записаних MP3/AAC файлів з seek
- [ ] Volume slider accessible (NVDA оголошує рівень)
- [ ] Вибір аудіо-пристрою
- [ ] Повна SettingsDialog з усіма налаштуваннями
- [ ] Глобальні гарячі клавіші працюють у фоні
- [ ] Налаштування хоткеїв через UI
- [ ] `tauri-plugin-dialog` для Browse кнопки та Profile import/export

---

## Фаза 3 — Browser + Scheduler

**Ціль:** пошук нових станцій через Radio Browser API, автоматичний запис за розкладом.

### Включено

**Backend:**

| Модуль | Опис |
|--------|------|
| `browser::api` | REST клієнт Radio Browser API (пошук, фільтрація) |
| `commands/browser_commands` | IPC: search_stations, add_station_from_browser |
| `scheduler::timer` | Per-minute check loop, CancellationToken |
| `commands/schedule_commands` | IPC: CRUD scheduled recordings, toggle enabled |

**Frontend:**

| Компонент | Опис |
|-----------|------|
| `BrowserPanel.tsx` | Tab: пошук станцій |
| `SearchForm.tsx` | React Aria ComboBox + filters (формат, бітрейт) |
| `ResultsTable.tsx` | Accessible table результатів |
| `SchedulePanel.tsx` | Tab: заплановані записи |
| `ScheduleTable.tsx` | Accessible table з розкладом |
| `ScheduleForm.tsx` | Діалог: створення/редагування (RadioGroup, TimeField, Select) |

**Stores:**

| Store | Опис |
|-------|------|
| `browser.ts` | Search results |
| `schedule.ts` | Scheduled recordings |

### Критерії "Done" для Фази 3

- [ ] Пошук станцій за назвою, жанром, форматом, бітрейтом
- [ ] Додавання станції зі списку результатів
- [ ] Одноразовий та повторюваний запис за розкладом
- [ ] Конфлікти: потік вже записується, два записи одночасно
- [ ] Пропущені записи логуються (програма була вимкнена)
- [ ] Live regions: "Плановий запис розпочато/завершено"
- [ ] Таблиця розкладу accessible (NVDA grid navigation)

---

## Фаза 4 — Saved Songs + Advanced

**Ціль:** менеджер записаних файлів, профілі, CLI, system tray, post-processing. Production-ready.

### Включено

**Backend:**

| Модуль | Опис |
|--------|------|
| `commands/songs_commands` | IPC: get/delete/rename songs, update tags, open in explorer, import |
| `commands/postprocess_commands` | IPC: get/save postprocess config |
| `postprocess::runner` | Запуск зовнішніх програм, timeout, черга |
| `profile.rs` (повний) | CRUD профілів, переключення, import/export |
| `commands/profile_commands` | IPC: list/switch/create/delete/export/import profiles |

**Frontend:**

| Компонент | Опис |
|-----------|------|
| `SongsPanel.tsx` | Tab: збережені пісні |
| `SongsTable.tsx` | Accessible sortable table з фільтрами |
| `TagEditor.tsx` | Діалог редагування тегів |
| `ProfileManager.tsx` | UI для управління профілями |
| `PostprocessSettings.tsx` | Налаштування постобробки |

**Infrastructure:**

| Елемент | Опис |
|---------|------|
| `tray.rs` | TrayIconBuilder, rebuild_tray_menu(), обробка кліків |
| `tray_menu.rs` | Побудова динамічного меню за станом (player, recordings, window) |
| Balloon tip | `Shell_NotifyIconW` через `windows-rs` для сповіщень про зміну треку |
| Single instance | `tauri-plugin-single-instance` (Named Mutex) |
| CLI | `tauri-plugin-cli` — `-r`, `-p`, `-profile`, `-datadir`, `-minimize` |
| Autostart | `tauri-plugin-autostart` + перевірка шляху при запуску |
| High Contrast | `forced-colors:` CSS для всіх компонентів |
| Log rotation | tauri-plugin-log з ротацією |
| Bandwidth limit | Throttling у stream::connection |

### Критерії "Done" для Фази 4

- [ ] Менеджер збережених файлів (сортування, фільтрація, пошук)
- [ ] Редагування ID3v2/M4A тегів через UI
- [ ] Контекстне меню збережених пісень (play, delete, rename, explorer)
- [ ] Профілі: створення, переключення, import/export
- [ ] Підтвердження при switch profile якщо є активні записи
- [ ] CLI аргументи працюють (запис, відтворення, wishlist)
- [ ] System tray:
  - [ ] TrayIconBuilder з іконкою та динамічним tooltip
  - [ ] Контекстне меню (right-click): "Зараз грає" info, Грати/Пауза, Зупинити, Записи info, Зупинити всі, Показати/Приховати, Вихід
  - [ ] Динамічна перебудова меню при зміні стану (`player-status`, `recording-status`, window visibility)
  - [ ] Left-click: toggle видимості вікна
  - [ ] Вихід: confirm dialog якщо є активні записи
  - [ ] Balloon tip при зміні треку (`showTrayNotifications` setting, throttle 3с)
  - [ ] `minimizeToTray` setting: close → hide замість exit
- [ ] Single instance: повторний запуск передає аргументи першому
- [ ] Autostart з перевіркою шляху
- [ ] Windows High Contrast: усі елементи видимі
- [ ] Post-processing: запуск зовнішніх програм після запису
- [ ] Log rotation працює

---

## Залежності між фазами

```
Фаза 1: Core Recording
  ├── stream::manager (central)
  ├── settings.rs
  ├── profile.rs (Default only)
  ├── portable.rs
  └── tags::writer

Фаза 2: Wishlist + Settings + Player
  ├── wishlist::matcher ← залежить від stream::manager (Phase 1)
  ├── player::engine ← залежить від stream::manager tee (Phase 1)
  └── SettingsDialog ← залежить від settings.rs (Phase 1)

Фаза 3: Browser + Scheduler
  ├── browser::api ← незалежний (лише reqwest + JSON)
  └── scheduler::timer ← залежить від stream::manager (Phase 1)

Фаза 4: Saved Songs + Advanced
  ├── songs_commands ← залежить від recordings (Phase 1+)
  ├── postprocess::runner ← залежить від recordings (Phase 1+)
  ├── profile.rs (full) ← розширює Phase 1 profile.rs
  └── CLI ← залежить від stream::manager + player (Phase 1+2)
```

Фази 2 і 3 можна виконувати в будь-якому порядку. Фаза 4 залежить від усіх попередніх.

---

## Джерела досліджень

Деталі обґрунтування фазування — в дослідженнях, проведених під час планування.
