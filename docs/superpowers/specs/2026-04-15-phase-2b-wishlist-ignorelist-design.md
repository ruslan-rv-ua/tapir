# Phase 2B — Wishlist + Ignorelist + Контекстне меню

> **Дата:** 2026-04-15  
> **Статус:** ✅ Реалізовано  
> **Залежності:** Phase 1 (stream::manager, ICY metadata)

## Ціль

Автоматична фільтрація треків через wishlist/ignorelist під час активного запису + контекстне меню у таблиці потоків + окрема вкладка Activity Bar для керування списками.

## Скоуп

### В скоупі
- Wildcard matching (*, ?) для ICY StreamTitle — case-insensitive
- Глобальний ignorelist (Profile.ignorelist) + per-stream ignorelist (StreamInfo.ignorelist) — matching
- Wishlist з мінімальним набором полів (pattern + addedAt)
- Matching працює тільки під час активного запису
- Ignorelist: трек не зберігається як окремий файл (stream-файл продовжує писатись)
- Контекстне меню StreamRow (React Aria Menu)
- WishlistPanel як окрема вкладка Activity Bar
- IPC команди для CRUD wishlist/ignorelist (додати, видалити, редагувати)
- NVDA-доступні оголошення для всіх подій

### Поза скоупом
- Per-stream ignorelist **UI** (дані вже є, matching працює, але окремого UI для керування per-stream ignorelist немає)
- Розширені поля WishlistEntry: minBitrate, format, removeAfterRecord, addToIgnorelistAfterRecord
- Моніторинг потоків без запису (auto-record)
- Імпорт/експорт списків
- Персистенція `is_wishlist_match` на SavedTrack (Phase 3C)

---

## 1. Backend — wishlist::matcher

### Файлова структура

```
src-tauri/src/wishlist/
├── mod.rs       // pub mod matcher;
└── matcher.rs   // WildcardMatcher + check_track()
```

### API

```rust
/// Результат перевірки треку
pub enum TrackAction {
    /// Трек в ignorelist — не записувати
    Ignored,
    /// Трек збігається з wishlist-патерном
    WishlistMatch { pattern: String },
    /// Жодного збігу — звичайна поведінка
    Normal,
}

/// Перевіряє трек проти ignorelist та wishlist.
/// Порядок: per-stream ignorelist → global ignorelist → wishlist → Normal
pub fn check_track(
    stream_title: &str,
    per_stream_ignorelist: &[String],
    global_ignorelist: &[String],
    wishlist: &[WishlistEntry],
) -> TrackAction
```

### Wildcard matching

Функція `wildcard_match(pattern: &str, text: &str) -> bool`:
- Case-insensitive (обидва рядки переводяться в lowercase)
- `*` — збіг з будь-якою кількістю символів (включаючи 0)
- `?` — збіг з рівно одним символом
- Реалізація через рекурсію або DP, без зовнішніх залежностей

### Порядок перевірки (Precedence)

```
1. Per-stream ignorelist → збіг → TrackAction::Ignored
2. Global ignorelist     → збіг → TrackAction::Ignored
3. Wishlist              → збіг → TrackAction::WishlistMatch { pattern }
4. Жодного збігу         → TrackAction::Normal
```

Ignorelist завжди має пріоритет над wishlist. Per-stream ignorelist перевіряється першим.

### Інтеграція в manager.rs

У хендлері `MetadataChanged` (рядки ~715-748), **перед** `spl.on_metadata_change()`.

> **Примітка:** architecture.md показує перевірку після finalize у псевдокоді. Розміщення *перед* Splitter є навмисним — це дозволяє повністю пропустити Splitter для ігнорованих треків, уникаючи створення файлів для непотрібних треків.

**Правило конкатенації StreamTitle:** якщо `artist` порожній — використовувати тільки `title`. Якщо `title` порожній — тільки `artist`. Якщо обидва непорожні — `format!("{} - {}", artist, title)`. Якщо обидва порожні — пропустити перевірку (TrackAction::Normal).

1. Зібрати повний StreamTitle за правилом вище
2. Завантажити per-stream ignorelist (з StreamInfo), global ignorelist та wishlist з `AppState.profile`
3. `wishlist::matcher::check_track(stream_title, &per_stream_ignorelist, &global_ignorelist, &wishlist)`
4. **Ignored** → emit `track-changed` + `track-ignored` для UI, не передавати в Splitter
5. **WishlistMatch** → передати в Splitter як зазвичай, emit `wishlist-match` event (маркер `is_wishlist_match` не персистується до Phase 3C — SavedTrack management)
6. **Normal** → існуюча логіка без змін

---

## 2. Backend — IPC команди

### Файл: `commands/wishlist_commands.rs`

| Command | Params | Returns | Опис |
|---------|--------|---------|------|
| `get_wishlist` | — | `Vec<WishlistEntry>` | Повертає wishlist з профілю |
| `add_to_wishlist` | `{ pattern: String }` | `WishlistEntry` | Додає запис (pattern + addedAt = now). Дублікати ігноруються |
| `remove_from_wishlist` | `{ pattern: String }` | `()` | Видаляє запис за точним збігом pattern |
| `update_wishlist_pattern` | `{ oldPattern: String, newPattern: String }` | `WishlistEntry` | Оновлює патерн (реалізація: remove old + add new зі збереженням addedAt) |
| `get_ignorelist` | — | `Vec<String>` | Повертає глобальний ignorelist |
| `add_to_ignorelist` | `{ pattern: String }` | `()` | Додає патерн. Дублікати ігноруються |
| `remove_from_ignorelist` | `{ pattern: String }` | `()` | Видаляє патерн |
| `update_ignorelist_pattern` | `{ oldPattern: String, newPattern: String }` | `()` | Оновлює патерн (replace in-place) |

### Логіка
- Всі команди працюють з `AppState.profile` (lock → modify → save → unlock)
- Дублікати ігноруються (не додається повторний запис з тим самим pattern)
- Після змін — `profile.save()` зберігає на диск
- `update_*_pattern`: повертає помилку якщо `oldPattern` не знайдено; відхиляє якщо `newPattern` вже існує

### WishlistEntry для MVP

Лише `pattern` і `added_at` використовуються. Решта полів залишаються в структурі з дефолтними значеннями:
- `min_bitrate: None`
- `format: None`
- `remove_after_record: false`
- `add_to_ignorelist_after_record: false`

---

## 3. Frontend — WishlistPanel + PatternTable

### Навігація

Activity Bar отримує другу вкладку — "Wishlist". При натисканні показується WishlistPanel замість StreamsPanel.

### Файлова структура

```
src/components/wishlist/
├── WishlistPanel.tsx       // Контейнер: два розділи
├── PatternTable.tsx        // Accessible table для списку патернів
└── AddPatternDialog.tsx    // React Aria Dialog для додавання патерну
```

### WishlistPanel

Два розділи з заголовками (`<h2>`):
1. **Бажані треки (Wishlist)** — `PatternTable` + кнопка "Додати"
2. **Ігноровані треки (Ignorelist)** — `PatternTable` + кнопка "Додати"

### PatternTable

React Aria `<Table>` — переиспользовуваний компонент з конфігурованими колонками:

**Wishlist таблиця** — колонки:
- **Патерн** — текст
- **Дата додавання** — formatted date
- **Дії** — кнопки "Редагувати" / "Видалити"

**Ignorelist таблиця** — колонки:
- **Патерн** — текст
- **Дії** — кнопки "Редагувати" / "Видалити"

> Ignorelist entries — це `Vec<String>` (без дати), тому колонка "Дата додавання" прихована для ignorelist.

Клавіатурна навігація: стрілки ↑↓ між рядками, Tab до кнопок дій, Enter/Space для дії.

**Редагування:** натискання "Редагувати" відкриває AddPatternDialog з предзаповненим поточним патерном. При збереженні викликається `update_wishlist_pattern` / `update_ignorelist_pattern`.

### AddPatternDialog

React Aria Dialog з:
- `<TextField>` для введення патерну
- Підказка: "Використовуйте * для будь-яких символів, ? для одного символу"
- Кнопки "Додати" / "Скасувати"
- При відкритті з контекстного меню StreamRow — предзаповнений поточний трек

### Store

Розширення `profile.ts`:
```typescript
export interface ProfileState {
  name: string;
  recording: RecordingSettings;
  wishlist: WishlistEntry[];
  ignorelist: string[];
}
```

Типи в `lib/tauri.ts`:
```typescript
export interface WishlistEntry {
  pattern: string;
  minBitrate: number | null;
  format: "mp3" | "aac" | null;
  removeAfterRecord: boolean;
  addToIgnorelistAfterRecord: boolean;
  addedAt: string;
}
```

IPC wrapper функції: `getWishlist()`, `addToWishlist(pattern)`, `removeFromWishlist(pattern)`, `updateWishlistPattern(oldPattern, newPattern)`, `getIgnorelist()`, `addToIgnorelist(pattern)`, `removeFromIgnorelist(pattern)`, `updateIgnorelistPattern(oldPattern, newPattern)`.

### Доступність (NVDA)

- Таблиця: `aria-label="Список бажаних треків"` / `"Список ігнорованих треків"`
- Кнопка видалення: `aria-label="Видалити патерн {pattern}"`
- Після додавання/видалення — `aria-live="polite"` оголошення
- Діалог — React Aria Dialog (focus trap, Escape закриває)

---

## 4. Frontend — Контекстне меню StreamRow

### Реалізація

React Aria `<MenuTrigger>` + `<Menu>` + `<MenuItem>`.

**Тригери:**
- Кнопка "⋯" (три крапки) в рядку таблиці — видима кнопка
- Right-click на рядку — `onContextMenu` відкриває те саме меню
- Shift+F10 — стандартна клавіша контекстного меню (React Aria підтримує автоматично)

**Пункти меню:**

| Пункт | Дія | Умова |
|-------|-----|-------|
| ▶ Відтворити / ■ Зупинити | playStream / stopPlayback | Toggle |
| ⏺ Записати / ⏹ Зупинити запис | startRecording / stopRecording | Toggle |
| ✎ Редагувати | EditStreamDialog (існує з Phase 1) | Завжди |
| ⊕ Додати до бажаних | AddPatternDialog (wishlist, предзаповнений) | Є поточний трек |
| ⊖ Додати до ігнорованих | AddPatternDialog (ignorelist, предзаповнений) | Є поточний трек |
| — (роздільник) | — | — |
| ✕ Видалити потік | ConfirmDialog (існує з Phase 1) | Завжди |

**Inline кнопки Play/Record** залишаються в рядку для швидкого доступу.

### Доступність

- Кнопка "⋯": `aria-label="Дії для {stream.name}"`
- Menu: `aria-label="Контекстне меню потоку"`
- MenuItem: кожен пункт має текстовий label
- Стрілки ↑↓ для навігації, Enter/Space для вибору, Escape закриває

---

## 5. Events + Announcements

### Нові backend events

| Event | Payload | Коли |
|-------|---------|------|
| `wishlist-match` | `{ streamId, artist, title, pattern }` | Трек збігся з wishlist |
| `track-ignored` | `{ streamId, artist, title, pattern }` | Трек в ignorelist |

### NVDA Live Announcements

| Подія | Регіон | Текст |
|-------|--------|-------|
| Wishlist match | `assertive` | "Знайдено бажану пісню: {artist} — {title}" |
| Track ignored | `polite` | "Трек ігноровано: {artist} — {title}" |
| Pattern added | `polite` | "Патерн додано: {pattern}" |
| Pattern removed | `polite` | "Патерн видалено: {pattern}" |

### Frontend event listeners

В `App.tsx` — додати слухачі для `wishlist-match` та `track-ignored`, які викликають LiveAnnouncer.

---

## 6. i18n

Нові повідомлення для `uk.json` та `en.json`:

| Ключ | UK | EN |
|------|----|----|
| `wishlist_tab_label` | Бажане | Wishlist |
| `wishlist_section_title` | Бажані треки | Desired tracks |
| `ignorelist_section_title` | Ігноровані треки | Ignored tracks |
| `add_pattern` | Додати патерн | Add pattern |
| `edit_pattern` | Редагувати патерн | Edit pattern |
| `remove_pattern` | Видалити патерн | Remove pattern |
| `pattern_hint` | Використовуйте * для будь-яких символів, ? для одного | Use * for any characters, ? for one |
| `add_to_wishlist` | Додати до бажаних | Add to wishlist |
| `add_to_ignorelist` | Додати до ігнорованих | Add to ignorelist |
| `stream_actions` | Дії для {name} | Actions for {name} |
| `stream_context_menu` | Контекстне меню потоку | Stream context menu |
| `announcement_wishlist_match` | Знайдено бажану пісню: {title} | Desired track found: {title} |
| `announcement_track_ignored` | Трек ігноровано: {title} | Track ignored: {title} |
| `announcement_pattern_added` | Патерн додано: {pattern} | Pattern added: {pattern} |
| `announcement_pattern_removed` | Патерн видалено: {pattern} | Pattern removed: {pattern} |

---

## Критерії "Done"

- [ ] Wishlist matching працює при зміні ICY metadata під час запису
- [ ] Ignorelist фільтрує небажані треки (per-stream + глобальний)
- [ ] Precedence: per-stream ignorelist → global ignorelist → wishlist → звичайна поведінка
- [ ] WishlistPanel з CRUD операціями (додати, видалити, редагувати pattern)
- [ ] Контекстне меню StreamRow (кнопка ⋯, right-click): Play, Record, Edit, Add to Wishlist, Add to Ignorelist, Remove
- [ ] NVDA: контекстне меню, таблиці, діалоги — повністю accessible
- [ ] Live announcements для wishlist-match, track-ignored, pattern add/remove
