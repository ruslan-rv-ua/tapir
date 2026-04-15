# Декомпозиція фаз 3–4 на незалежні підфази

> **Версія:** 1.0 | **Дата:** 2025-07-18  
> **Контекст:** Phase 1 (Core Recording) ✅ | Phase 2A (Player) ✅ | Phase 2B (Wishlist+Context Menu) ⬜ | Phase 2C (Settings) ⬜

---

## Короткий підсумок

Оригінальні фази 2 (залишок), 3 (Browser + Scheduler) та 4 (Saved Songs + Advanced) розбиті на **11 незалежних підфаз** (2B, 2C, 3A–3I), кожна з яких є self-contained delivery, що може бути реалізована coding-агентом за одну сесію. Підфази впорядковані за цінністю для користувача (від найважливіших до polish-фіч). Максимальна незалежність дозволяє пропускати або переставляти підфази без порушення функціональності.

---

## Зведена таблиця

| # | Підфаза | Залежить від | Scope | Цінність |
|---|---------|-------------|-------|----------|
| 2B | Wishlist + Ignorelist + Context Menu | Phase 1 | Backend + Frontend | 🟠 Висока |
| 2C | SettingsDialog + Shortcuts + Window State | Phase 1 | Frontend + Infrastructure | 🟠 Висока |
| 3A | System Tray + Minimize to Tray | Phase 1 + 2A | Backend + Frontend | 🔴 Критична |
| 3B | Stream Browser (Radio Browser API) | — (незалежна) | Backend + Frontend | 🔴 Критична |
| 3C | Saved Songs Manager | Phase 1 | Backend + Frontend | 🟠 Висока |
| 3D | Scheduler (Заплановані записи) | Phase 1 | Backend + Frontend | 🟠 Висока |
| 3E | Single Instance | — (незалежна) | Backend | 🟡 Середня |
| 3F | Profile Manager (повний CRUD) | Phase 1 | Backend + Frontend | 🟡 Середня |
| 3G | CLI Arguments | Phase 1 + 2, 3E | Backend | 🟡 Середня |
| 3H | Post-processing | Phase 1 | Backend + Frontend | 🟢 Низька |
| 3I | Polish Bundle (HC, Autostart, Logs, BW) | — (незалежні) | CSS + Backend | 🟢 Низька |

> **Нумерація:** усі підфази мають префікс `3x` замість `3+4`, оскільки оригінальна Фаза 3 і 4 тепер розбиті на рівноправні одиниці.

---

## Граф залежностей

```
Phase 1 (Core Recording) ──────────────────────────────────┐
Phase 2A (Player) ──────────────────────────────────────┐  │
                                                        │  │
  ┌─────────────────────────────────────────────────────┼──┤
  │                                                     │  │
  │  2B Wishlist + Context Menu ◄─ Phase 1              │  │
  │  2C SettingsDialog ◄────────── Phase 1              │  │
  │  3A System Tray ◄──────────── Phase 1 + Phase 2A    │  │
  │  3B Stream Browser ◄───────── (незалежна)            │  │
  │  3C Saved Songs ◄──────────── Phase 1               │  │
  │  3D Scheduler ◄────────────── Phase 1               │  │
  │  3E Single Instance ◄──────── (незалежна)            │  │
  │  3F Profile Manager ◄──────── Phase 1               │  │
  │  3G CLI ◄──────────────────── Phase 1 + Phase 2A + 3E│  │
  │  3H Post-processing ◄──────── Phase 1               │  │
  │  3I Polish Bundle ◄────────── (незалежна)            │  │
  └─────────────────────────────────────────────────────┘
```

**Ключове спостереження:** підфази 2B, 2C, 3B, 3E, 3I повністю незалежні або залежать лише від Phase 1 (завершена). Решта залежать лише від Phase 1 (вже завершена). Тільки 3A і 3G мають залежність від Phase 2A.

---

## Детальний опис підфаз

### 2B — Wishlist + Ignorelist + Контекстне меню станцій

**Цінність:** 🟠 Висока — автоматична фільтрація треків є core-фічею радіо-рекордера; контекстне меню — основний спосіб взаємодії зі станціями.

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

**Критерії Done:**
- [ ] Wishlist matching працює при зміні ICY metadata
- [ ] Ignorelist фільтрує небажані треки (глобальний + per-stream)
- [ ] Precedence: per-stream ignorelist → global ignorelist → wishlist → звичайна поведінка
- [ ] WishlistPanel з CRUD операціями
- [ ] Контекстне меню StreamRow (Shift+F10, right-click)
- [ ] NVDA: контекстне меню accessible (React Aria Menu)

---

### 2C — SettingsDialog + Global Shortcuts + Window State

**Цінність:** 🟠 Висока — повний діалог налаштувань необхідний для конфігурації програми.

**Залежності:** Phase 1 (settings.rs)

**Frontend:**

| Компонент | Опис |
|-----------|------|
| `SettingsDialog.tsx` | Повноекранний діалог з табами |
| `GeneralSettings.tsx` | Мова, тема, tray, notifications |
| `RecordingSettings.tsx` | Output dir, templates, reconnect, min track duration |
| `HotkeySettings.tsx` | KeyRecorder для глобальних хоткеїв |

**Infrastructure:** `tauri-plugin-global-shortcut`, `tauri-plugin-window-state`, `tauri-plugin-dialog`

**Критерії Done:**
- [ ] SettingsDialog відкривається та зберігає всі налаштування
- [ ] Мова: переключення uk/en без перезапуску
- [ ] Тема: auto/dark/light
- [ ] Глобальні гарячі клавіші працюють у фоні
- [ ] Window state зберігається між сесіями
- [ ] NVDA: усі елементи accessible

---

### 3A — System Tray + Minimize to Tray

**Цінність:** 🔴 Критична — програма для запису радіо має працювати у фоні; без tray користувач змушений тримати вікно відкритим.

**Залежності:** Phase 1 (recording status), Phase 2 (player status)

**Backend:**

| Модуль | Опис |
|--------|------|
| `tray.rs` | `TrayIconBuilder`, `rebuild_tray_menu()`, обробка кліків |
| `tray_menu.rs` | Побудова динамічного меню за станом (player, recordings, window visibility) |
| Balloon tip | `Shell_NotifyIconW` через `windows-rs` для сповіщень про зміну треку |

**Frontend / Settings:**

| Елемент | Опис |
|---------|------|
| `minimizeToTray` | Setting: close → hide замість exit |
| `showTrayNotifications` | Setting: balloon tip при зміні треку (throttle 3с) |
| Confirm dialog | При виході з активними записами |

**Scope:**
- TrayIconBuilder з іконкою та динамічним tooltip
- Контекстне меню: "Зараз грає" info, Грати/Пауза, Зупинити, Записи info, Зупинити всі, Показати/Приховати, Вихід
- Динамічна перебудова меню при зміні стану (`player-status`, `recording-status`, window visibility)
- Left-click: toggle видимості вікна
- Вихід: confirm dialog якщо є активні записи
- Balloon tip при зміні треку

**Критерії Done:**
- [ ] Іконка у systemtray з tooltip
- [ ] Right-click відкриває контекстне меню з поточним станом
- [ ] Left-click toggle видимості вікна
- [ ] `minimizeToTray` setting працює (close → hide)
- [ ] Balloon tip при зміні треку (з throttle)
- [ ] Confirm dialog при exit з активними записами
- [ ] Меню динамічно оновлюється при зміні стану

---

### 3B — Stream Browser (Radio Browser API)

**Цінність:** 🔴 Критична — пошук нових станцій без ручного введення URL є базовою фічею будь-якого радіо-додатку.

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

**Store:**

| Store | Опис |
|-------|------|
| `browser.ts` | Search results, loading state, selected filters |

**Критерії Done:**
- [ ] Пошук станцій за назвою, жанром, форматом, бітрейтом
- [ ] Результати у accessible table (NVDA grid navigation)
- [ ] Кнопка "Додати" → станція з'являється у профілі
- [ ] Activity Bar icon для Browser tab
- [ ] Empty state та loading state accessible

---

### 3C — Saved Songs Manager

**Цінність:** 🟠 Висока — користувач має бачити та керувати записаними файлами в самій програмі, а не шукати у файловій системі.

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

**Store:**

| Store | Опис |
|-------|------|
| `songs.ts` | Список збережених треків, фільтри, сортування |

**Критерії Done:**
- [ ] Список усіх записаних файлів з metadata
- [ ] Сортування за назвою, артистом, датою, розміром
- [ ] Фільтрація та пошук
- [ ] Контекстне меню: відтворити, відкрити в explorer, видалити, перейменувати, редагувати теги
- [ ] TagEditor: зміна artist, title, album, genre
- [ ] Confirm dialog при видаленні
- [ ] NVDA: grid navigation, live region при операціях

---

### 3D — Scheduler (Заплановані записи)

**Цінність:** 🟠 Висока — автоматичний запис за розкладом (наприклад, улюблене шоу щодня о 19:00) є killer-фічею для радіо-рекордера.

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

**Store:**

| Store | Опис |
|-------|------|
| `schedule.ts` | Список scheduled recordings, enabled/disabled status |

**Критерії Done:**
- [ ] Одноразовий запис: дата + час + тривалість
- [ ] Повторюваний запис: день тижня + час + тривалість
- [ ] Toggle enabled/disabled без видалення
- [ ] Конфлікт: потік вже записується → не дублювати
- [ ] Пропущені записи логуються
- [ ] Live regions: "Плановий запис розпочато/завершено"
- [ ] NVDA: таблиця accessible, форма accessible

---

### 3E — Single Instance

**Цінність:** 🟡 Середня — запобігає одночасному запуску двох копій, що може призвести до конфліктів у файлах і записах.

**Залежності:** немає (незалежна)

**Backend:**

| Елемент | Опис |
|---------|------|
| `tauri-plugin-single-instance` | Named Mutex + Named Pipe для передачі аргументів |

**Scope:**
- При повторному запуску — фокус переноситься на існуюче вікно
- CLI-аргументи передаються першій інстанції (підготовка для 3G)

**Критерії Done:**
- [ ] Другий запуск → фокус на першому вікні
- [ ] `clean_shutdown` прапор у `data/state.json`
- [ ] Named Pipe готовий для передачі CLI args (3G залежить від цього)

---

### 3F — Profile Manager (повний CRUD)

**Цінність:** 🟡 Середня — корисна для power-користувачів, які хочуть ізольовані набори станцій.

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

**Критерії Done:**
- [ ] Список профілів з поточним позначеним
- [ ] Створення нового профілю
- [ ] Перемикання між профілями
- [ ] Видалення профілю (крім Default, з confirm)
- [ ] Export/import `.tapirprofile` файлу
- [ ] Confirm при switch якщо є активні записи
- [ ] ProfileSwitcher у ActivityBar працює

---

### 3G — CLI Arguments

**Цінність:** 🟡 Середня — дозволяє автоматизацію та скриптування (наприклад, shortcut для запуску запису).

**Залежності:** Phase 1 + Phase 2 (stream::manager + player), **3E** (single instance для передачі аргументів)

**Backend:**

| Елемент | Опис |
|---------|------|
| `tauri-plugin-cli` | clap-based парсинг аргументів |
| CLI handler | Обробка `--record`, `--play`, `--stop-*`, `--wish-*`, `--profile`, `--minimize`, `--datadir` |

**Scope:**
- Повний набір CLI аргументів з PRD §4.11
- При single-instance: передача аргументів першій інстанції через Named Pipe
- Exit codes: 0 (success), 1 (error), 2 (invalid args)

**Критерії Done:**
- [ ] `--record URL` запускає запис
- [ ] `--play URL` запускає відтворення
- [ ] `--stop-recording` / `--stop-playback` зупиняють
- [ ] `--wish-add` / `--wish-remove` керують wishlist
- [ ] `--profile NAME` вибирає профіль при запуску
- [ ] `--minimize` запуск згорнутим до tray
- [ ] При повторному запуску args передаються першій інстанції
- [ ] Правильні exit codes

---

### 3H — Post-processing

**Цінність:** 🟢 Низька — ніша: running external commands після запису (конвертація, нормалізація тощо).

**Залежності:** Phase 1 (recordings, подія завершення треку)

**Backend:**

| Модуль | Опис |
|--------|------|
| `postprocess::runner` | Запуск зовнішніх програм, timeout (120с default), черга |
| `commands/postprocess_commands` | IPC: `get_postprocess_config`, `save_postprocess_config` |

**Frontend:**

| Компонент | Опис |
|-----------|------|
| `PostprocessSettings.tsx` | UI: шлях до програми, аргументи, timeout, triggers (completed / incomplete) |

**Критерії Done:**
- [ ] Запуск зовнішньої програми після фіналізації треку
- [ ] Налаштування аргументів (placeholders %file, %artist, %title)
- [ ] Timeout з kill process
- [ ] Вибір тригеру: завершений / незакінчений трек
- [ ] Черга: не більше N одночасних процесів

---

### 3I — Polish Bundle

**Цінність:** 🟢 Низька — набір незалежних polish-фіч, кожна з яких може бути реалізована окремо.

**Залежності:** немає (кожен елемент незалежний)

Ця підфаза — зонтик для дрібних незалежних фіч. Можна реалізувати по одній або все разом.

#### 3I-1. Windows High Contrast

| Scope | Опис |
|-------|------|
| CSS | `forced-colors:` для всіх custom компонентів (StatusIcon, Badge, Toast, Slider thumb, Progress track) |

**Критерії Done:**
- [ ] Усі кастомні елементи коректно відображаються у Windows High Contrast mode
- [ ] Тест: увімкнути High Contrast в Windows → перевірити всі екрани

#### 3I-2. Autostart

| Scope | Опис |
|-------|------|
| Backend | `tauri-plugin-autostart` + перевірка шляху EXE при запуску |
| Settings | Toggle у Settings Dialog |

**Критерії Done:**
- [ ] Setting "Запускати з Windows" працює
- [ ] Перевірка шляху: якщо EXE переміщено, autostart деактивується

#### 3I-3. Log Rotation

| Scope | Опис |
|-------|------|
| Backend | `tauri-plugin-log` з ротацією (розмір, кількість файлів) |

**Критерії Done:**
- [ ] Логи ротуються при досягненні макс. розміру
- [ ] Зберігається N останніх файлів

#### 3I-4. Bandwidth Limiting

| Scope | Опис |
|-------|------|
| Backend | Throttling у `stream::connection` (кБ/с per-stream) |
| Settings | Налаштування ліміту |

**Критерії Done:**
- [ ] Обмеження швидкості завантаження на потік
- [ ] Налаштування у Settings або per-stream

---

## Порівняння підходів

| Критерій | Оригінальний (2 фази) | Декомпозований (9 підфаз) |
|----------|----------------------|--------------------------|
| Granularity | 2 великі фази | 9 незалежних одиниць |
| Паралелізм | Фаза 4 блокується Фазою 3 | ~6 підфаз можна робити паралельно |
| Гнучкість | Фіксований порядок | Можна пропустити будь-яку підфазу |
| Ризик | Велика фаза = великий ризик | Ізольовані ризики |
| Overhead | Низький | Трохи вищий (більше context-switching) |
| Агент-придатність | Потребує тривалого контексту | Кожна підфаза ≈ 1 сесія агента |

---

## Рекомендації

### Пріоритетний порядок реалізації

1. **3A System Tray** — без tray програма не може нормально працювати у фоні
2. **3B Stream Browser** — discovery нових станцій
3. **3C Saved Songs** — менеджмент записаних файлів
4. **3D Scheduler** — автоматизація записів
5. **3E Single Instance** — захист від дублів (передумова для 3G)
6. **3F Profile Manager** — power-user фіча
7. **3G CLI** — автоматизація, залежить від 3E
8. **3H Post-processing** — ніша
9. **3I Polish Bundle** — можна додавати по шматочку у будь-який момент

### Рекомендації для coding-агентів

- Кожна підфаза має чіткі **Критерії Done** — агент може верифікувати себе
- Кожна підфаза описує конкретні **модулі, компоненти, stores** — агент знає що створювати
- **3I** можна давати як окремі мікрозадачі (3I-1, 3I-2 тощо)
- Перед кожною підфазою агент має прочитати відповідні розділи PRD та accessibility.md

---

## Невизначеності та обмеження

- ⚠️ Phase 2 (Wishlist + SettingsDialog) ще не реалізована — 3A (Tray) залежить від Phase 2 player, але НЕ залежить від Wishlist/Settings. Якщо Phase 2 Wishlist буде реалізована паралельно, конфліктів не очікується.
- ⚠️ Пріоритетність базується на загальній оцінці user value для радіо-рекордера; конкретний користувач може мати інші пріоритети.
- ❓ Точний scope balloon tip (Windows Shell API vs Tauri notification) може потребувати R&D при реалізації 3A.
- ❓ Radio Browser API може змінити endpoint або формат — 3B має обробляти graceful degradation.
- ✅ Усі підфази, що залежать лише від Phase 1, можуть бути розпочаті негайно (Phase 1 завершена).

---

## Джерела

- [implementation-phases.md](../implementation-phases.md) — оригінальний розподіл на 4 фази
- [PRD.md](../PRD.md) — функціональні вимоги §4.1–4.12
- [accessibility.md](../accessibility.md) — вимоги доступності
- [architecture.md](../architecture.md) — архітектура модулів
- [data-models.md](../data-models.md) — структури даних
