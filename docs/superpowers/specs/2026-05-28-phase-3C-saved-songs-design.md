# Phase 3C — Saved Songs Manager: Design Spec

> **Status:** approved by user (2026-05-28) — ready for implementation plan
> **Phase reference:** [docs/implementation-phases.md](../../implementation-phases.md) §3C
> **Navigation contract:** [docs/FRD-navigation.md](../../FRD-navigation.md)

## 1. Мета та обсяг

**Мета:** менеджер записаних аудіофайлів усередині Tapir — перегляд, фільтрація/пошук, відтворення, перейменування, редагування ID3v2 тегів, видалення (у Кошик Windows).

**In scope:**
- Нова секція "Збережені пісні" в `ActivityBar`.
- Сканування `recording.output_dir` на льоту (walkdir + lofty).
- Фільтр-бар: текстовий пошук, вибір сортування, chips за станціями.
- Композиційний список (FRD-navigation: roving focus, summary-фокус, сегменти).
- Контекстне меню рядка: Грати, Відкрити в Explorer, Перейменувати, Редагувати теги, Видалити.
- Діалог `TagEditorDialog`: artist, title, album, genre.
- Видалення → `SHFileOperationW` із `FOF_ALLOWUNDO`.
- ConfirmDialog для видалення (default focus = "Скасувати").

**Out of scope:**
- Bulk-операції (multi-select, batch delete) — відкладено.
- Розширені теги (year, track #, cover art) — пізніше за потреби.
- Імпорт зовнішніх файлів (drag-and-drop, "Add file…") — не потрібно для MVP.
- Кеш у `Profile.saved_tracks` — поле залишається оголошеним, але **не** заповнюється; потенційний Approach C на майбутнє.

## 2. Архітектура (огляд)

```
Frontend (React + Nanostores)
  SongsPanel
    ├─ SongsFilterBar       (search + sort + station chips, zone "songs-filter")
    ├─ SongsList            (composite list, zone "songs-list")
    │    └─ SongItem        (summary / status / title / meta / actions)
    ├─ SongContextMenu      (Shift+F10 / right-click)
    ├─ TagEditorDialog
    ├─ RenameDialog
    └─ ConfirmDialog        (delete)

Backend (Rust)
  songs/
    ├─ mod.rs       — pub Song, scan(), read_song()
    ├─ scanner.rs   — walkdir + lofty
    ├─ tags.rs      — write_song_tags()
    └─ ops.rs       — rename_file(), delete_to_recycle_bin()
  commands/songs_commands.rs
    list_saved_songs, play_saved_song, open_song_in_explorer,
    rename_song, update_song_tags, delete_song
```

**Принципи:**
- Без нового персистентного стану. `Profile.saved_tracks` залишається порожнім (`#[serde(default)]`).
- Sort / filter / search — на клієнті (як у `StationList`).
- Точкові оновлення `$songs` через події `song-tags-updated`, `song-deleted`, `song-renamed` — без повторного сканування.
- Повне пересканування при `recording-completed` (підстраховка) і за явним користувацьким "Оновити".

## 3. Контракт даних

### 3.1. Frontend type (`src/types/song.ts`)

```ts
interface Song {
  path: string;          // absolute path returned by backend
  fileName: string;      // basename without extension
  artist: string;        // "" if missing
  title: string;
  album: string;
  genre: string;
  station: string;       // first component of relative path; "—" if file in root
  format: "mp3" | "aac";
  durationMs: number;    // 0 if unreadable
  sizeBytes: number;
  recordedAt: string;    // ISO 8601 local, from file mtime
  isComplete: boolean;   // false if file ends with "_incomplete"
}
```

### 3.2. Rust struct (`src-tauri/src/songs/mod.rs`)

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    pub path: String,
    pub file_name: String,
    pub artist: String,
    pub title: String,
    pub album: String,
    pub genre: String,
    pub station: String,
    pub format: AudioFormat,
    pub duration_ms: u64,
    pub size_bytes: u64,
    pub recorded_at: String,
    pub is_complete: bool,
}
```

`AudioFormat` re-uses existing enum from `profile.rs`.

### 3.3. IPC commands

| Команда | Параметри | Повертає | Поведінка |
|---|---|---|---|
| `list_saved_songs` | — | `Vec<Song>` | walkdir по `output_dir` (mp3/aac/m4a), читає теги через lofty; `spawn_blocking` |
| `play_saved_song` | `path: String` | `()` | `state.player.play_file(&app, &path).await` |
| `open_song_in_explorer` | `path: String` | `()` | `Command::new("explorer.exe").args(["/select,", &path]).spawn()` |
| `rename_song` | `old_path: String`, `new_basename: String` | `Song` (new) | basename без розширення; колізії через `sanitize::resolve_collision` |
| `update_song_tags` | `path`, `artist`, `title`, `album`, `genre` | `Song` (new) | через lofty: read → mutate primary tag → save; empty album/genre → видалити фрейм |
| `delete_song` | `path: String` | `()` | `SHFileOperationW` із `FO_DELETE` + `FOF_ALLOWUNDO \| FOF_NO_UI \| FOF_NOCONFIRMATION \| FOF_SILENT` |

### 3.4. Events (backend → frontend)

```ts
// song-tags-updated — payload = повний Song
// song-deleted     — { path: string }
// song-renamed     — { oldPath: string, newSong: Song }
```

Frontend listeners оновлюють `$songs` точково. Додатково: `recording-completed` (існуючий) → `loadSongs()` як safety net.

## 4. Бекенд

### 4.1. Файли (нові / змінені)

| Файл | Статус | Мета |
|---|---|---|
| `src-tauri/Cargo.toml` | Modify | Додати `walkdir = "2"` |
| `src-tauri/src/songs/mod.rs` | Create | `pub use Song`, реекспорт scan/read_song |
| `src-tauri/src/songs/scanner.rs` | Create | `scan(output_dir)`, `read_song(path, output_dir, format)` |
| `src-tauri/src/songs/tags.rs` | Create | `write_song_tags()` (read-modify-save через lofty) |
| `src-tauri/src/songs/ops.rs` | Create | `rename_file()`, `delete_to_recycle_bin()` |
| `src-tauri/src/commands/songs_commands.rs` | Create | 6 IPC команд |
| `src-tauri/src/commands/mod.rs` | Modify | `pub mod songs_commands` |
| `src-tauri/src/lib.rs` | Modify | `mod songs` + register 6 invoke_handler-ів |
| `src-tauri/src/profile.rs` | Modify | Коментар-`DEPRECATED Phase 3C` на полі `saved_tracks` |
| `src-tauri/src/portable.rs` | Modify (можливо) | Додати `resolve_output_dir(rel) -> PathBuf` якщо нема |

### 4.2. `scanner.rs` ключові деталі

- `walkdir::WalkDir::new(output_dir).follow_links(false)` — без симлінків (safety).
- Extension filter: `mp3`, `aac`, `m4a` (case-insensitive).
- `read_song()` поведінка:
  - `lofty::read_from_path(path)` → `primary_tag()` → artist/title/album/genre (порожній рядок якщо тегу немає).
  - `tagged.properties().duration().as_millis()` → `duration_ms` (0 при помилці).
  - `fs::metadata(path)` → `len()` (size), `modified()` → ISO 8601 local string (`chrono::DateTime::<Local>`).
  - `station` = перший компонент `path.strip_prefix(output_dir).components().next()`; якщо файл у корені — `"—"`.
  - `is_complete` = `!file_name.ends_with("_incomplete")` (перевірка по basename без розширення).
- При помилці парсингу одного файлу — `log::warn!`, пропустити, продовжити.

### 4.3. `tags.rs`

```rust
pub fn write_song_tags(path: &Path, format: AudioFormat,
                       artist: &str, title: &str, album: &str, genre: &str)
    -> Result<(), RadioError>
{
    let mut tagged = lofty::read_from_path(path)
        .map_err(|e| RadioError::Format(format!("Read tags: {e}")))?;
    let tag_type = match format { AudioFormat::Mp3 | AudioFormat::Aac => TagType::Id3v2 };
    let tag = tagged.primary_tag_mut().get_or_insert_with(|| Tag::new(tag_type));
    tag.set_artist(artist.to_string());
    tag.set_title(title.to_string());
    if album.is_empty() { tag.remove_album(); } else { tag.set_album(album.to_string()); }
    if genre.is_empty() { tag.remove_genre(); } else { tag.set_genre(genre.to_string()); }
    tagged.save_to_path(path, WriteOptions::default())
        .map_err(|e| RadioError::Format(format!("Write tags: {e}")))?;
    Ok(())
}
```

Існуючий `tags::writer::write_tags` залишається без змін — його викликає `recorder::finalize_track`.

### 4.4. `ops.rs` — Recycle Bin

```rust
pub fn delete_to_recycle_bin(path: &Path) -> Result<(), RadioError> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::Shell::{
        SHFileOperationW, SHFILEOPSTRUCTW, FO_DELETE,
        FOF_ALLOWUNDO, FOF_NO_UI, FOF_NOCONFIRMATION, FOF_SILENT,
    };

    // Path must be NULL-NULL-terminated
    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    wide.push(0); wide.push(0);

    let mut op = SHFILEOPSTRUCTW {
        hwnd: Default::default(),
        wFunc: FO_DELETE as u32,
        pFrom: windows::core::PCWSTR(wide.as_ptr()),
        pTo: windows::core::PCWSTR::null(),
        fFlags: (FOF_ALLOWUNDO | FOF_NO_UI | FOF_NOCONFIRMATION | FOF_SILENT) as u16,
        fAnyOperationsAborted: Default::default(),
        hNameMappings: std::ptr::null_mut(),
        lpszProgressTitle: windows::core::PCWSTR::null(),
    };
    let rc = unsafe { SHFileOperationW(&mut op) };
    if rc != 0 {
        return Err(RadioError::Io(format!("SHFileOperationW failed: 0x{rc:X}")));
    }
    Ok(())
}
```

`rename_file()` — обгортка над `std::fs::rename` з `sanitize::resolve_collision`.

### 4.5. Залежності

- `walkdir = "2"` — нова.
- `lofty` — вже є (Phase 1 використовує).
- `windows` crate з `Win32_UI_Shell` — вже додано в Phase 3A для balloons; перевикористовуємо.
- `chrono` — вже є.

### 4.6. `profile.rs` `saved_tracks`

```rust
// DEPRECATED Phase 3C: kept for backward profile-format compatibility but
// never populated. Saved Songs Manager scans the recordings directory on
// demand instead. Reserved for a future cached-index approach (see spec §1).
#[serde(default)]
pub saved_tracks: Vec<SavedTrack>,
```

Без міграції — `#[serde(default)]` забезпечує forward compat для старих профілів і no-op для нових.

## 5. Frontend

### 5.1. Файли (нові / змінені)

| Файл | Статус | Мета |
|---|---|---|
| `src/types/song.ts` | Create | `Song` interface |
| `src/stores/songs.ts` | Create | `$songs`, `$filteredSongs`, `$songsStations`, `loadSongs()` |
| `src/components/songs/SongsPanel.tsx` | Create | Контейнер секції, реєстрація зон |
| `src/components/songs/SongsFilterBar.tsx` | Create | Search input + sort dropdown + station chips |
| `src/components/songs/SongsList.tsx` | Create | Composite list (roving focus, FRD-nav) |
| `src/components/songs/SongItem.tsx` | Create | Рядок зі сегментами |
| `src/components/songs/SongContextMenu.tsx` | Create | React Aria MenuTrigger/Menu |
| `src/components/songs/TagEditorDialog.tsx` | Create | React Aria Modal + form |
| `src/components/songs/RenameDialog.tsx` | Create | React Aria Modal + single input |
| `src/components/layout/ActivityBar.tsx` | Modify | Зняти `disabled: true` із `songs` |
| `src/App.tsx` | Modify | Підключити `<SongsPanel />` у switch активної секції |
| `src/lib/tauri.ts` | Modify | 6 нових IPC-обгорток |
| `src/i18n/messages/uk.json` + `en.json` | Modify | ~25 нових ключів |

### 5.2. Store (`src/stores/songs.ts`)

Структура:
- `$songs: atom<Song[]>` — серверні дані.
- `$songsLoading`, `$songsError`.
- `$songsQuery: atom<string>` — пошуковий рядок.
- `$songsStation: atom<string | null>` — фільтр станції.
- `$songsSort: atom<"date" | "title" | "artist" | "size">` — сортування (default `"date"`).
- `$filteredSongs: computed` — фільтрує + сортує.
- `$songsStations: computed` — унікальні станції для chips.
- `loadSongs()` — async; ставить loading, викликає IPC, обробляє помилку.
- `replaceSongByPath(song, oldPath?)`, `removeSongByPath(path)` — для event listeners.

### 5.3. `SongsPanel` — зони

Дві зони, як у `BrowserPanel`:
1. `songs-filter` — `useFocusBoundary`.
2. `songs-list` — експонується через callback ref як `ZoneEntry`.

`onZonesChange([filterZone, listZone])` викликається у `useEffect`.

`useEffect` у `SongsPanel`:
- `loadSongs()` при mount.
- `listen("song-tags-updated", ...)` → `replaceSongByPath`.
- `listen("song-deleted", ...)` → `removeSongByPath`.
- `listen("song-renamed", ...)` → `replaceSongByPath` з `oldPath`.
- `listen("recording-completed", ...)` → `loadSongs()` (повне пересканування).

### 5.4. `SongItem` — сегменти (FRD §7)

5 сегментів (Left/Right):
1. **summary (весь рядок)** — фокус-стоп з `aria-label`: `«{title}, виконавець {artist}, станція {station}, {sizeMb} МБ, записано {dateRelative}»`. Up/Down переміщується між summary різних рядків.
2. **status** — повний / незавершений (badge).
3. **title** — підсвітка заголовка.
4. **meta** — `«{artist} · {album} · {format} · {bitrate}»`.
5. **actions** — окремі фокус-стопи: Play, Menu trigger (Shift+F10).

Усі дії, крім "Грати", — через context menu.

### 5.5. `TagEditorDialog`

- React Aria `Modal` + `Dialog` (як `AddStreamDialog`).
- 4 поля: title (autoFocus), artist, album, genre.
- Кнопки: "Зберегти" (Enter), "Скасувати" (ESC).
- При успіху — toast "Теги оновлено" (polite), закриває діалог; UI оновлюється через `song-tags-updated`.
- При помилці — toast "Не вдалось зберегти теги: {error}" (assertive); діалог залишається відкритим, поля не очищуються.

### 5.6. `RenameDialog`

- React Aria `Modal` + одне поле (autoFocus, select-all при mount).
- Валідація: непорожнє, без слешів / двокрапок / трюків NTFS — повторюємо logic `sanitize::sanitize_filename` на frontend (або робимо валідацію в backend і показуємо помилку).
- При успіху — toast "Файл перейменовано на {newName}" (polite).

### 5.7. `ConfirmDialog` (для видалення)

Re-use existing `ConfirmDialog`:
- Title: "Видалити пісню?"
- Body: "Файл буде переміщено у Кошик: {fileName}"
- Default focus: **Скасувати** (безпечний вибір).
- Підтвердження → виклик `delete_song`; toast "Пісню видалено" (assertive).

### 5.8. i18n ключі (drafts, uk)

```
songs_section            : "Збережені пісні"
songs_loading            : "Завантаження пісень…"
songs_loaded             : "Знайдено {count} пісень"
songs_empty              : "Поки що немає записаних пісень"
songs_error              : "Не вдалось завантажити список"
songs_search_placeholder : "Пошук по виконавцю, треку чи альбому"
songs_sort_label         : "Сортування"
songs_sort_date          : "За датою"
songs_sort_title         : "За назвою"
songs_sort_artist        : "За виконавцем"
songs_sort_size          : "За розміром"
songs_count_zero/one/few/many : плюрал
songs_filter_all         : "Усі станції"
songs_action_play        : "Грати"
songs_action_menu        : "Меню"
songs_action_explorer    : "Відкрити в Explorer"
songs_action_rename      : "Перейменувати"
songs_action_tags        : "Редагувати теги"
songs_action_delete      : "Видалити"
songs_confirm_delete_title : "Видалити пісню?"
songs_confirm_delete_body  : "Файл буде переміщено у Кошик: {fileName}"
songs_toast_deleted      : "Пісню видалено"
songs_toast_renamed      : "Файл перейменовано на {newName}"
songs_toast_tags_saved   : "Теги оновлено"
songs_toast_delete_failed : "Не вдалось видалити: {error}"
tag_editor_title         : "Редагувати теги"
tag_editor_artist        : "Виконавець"
tag_editor_song_title    : "Назва"
tag_editor_album         : "Альбом"
tag_editor_genre         : "Жанр"
tag_editor_save          : "Зберегти"
rename_dialog_title      : "Перейменувати файл"
rename_dialog_label      : "Нове ім'я (без розширення)"
songs_incomplete_badge   : "незавершений"
```

EN — повний переклад.

## 6. Помилки та edge cases

| Ситуація | Поведінка |
|---|---|
| `output_dir` не існує | `list_saved_songs` повертає `[]`; UI показує empty state |
| Файл зник між scan і дією | `RadioError::NotFound` → toast + `removeSongByPath` |
| Lofty не зміг прочитати теги (scan) | log warn, skip файл, продовжити scan |
| Lofty помилка при write | Toast (assertive); діалог залишається відкритий |
| Recycle Bin недоступний (мережевий drive) | Toast "Не вдалось перемістити у Кошик: {error}"; **без** автоматичного fallback на hard delete |
| Rename конфлікт | `sanitize::resolve_collision` → `_2`; toast "Збережено як {newName}" |
| Файл відкритий (Tapir програє його) | `os error 32` → toast "Файл використовується — зупиніть відтворення" |
| Файл `_incomplete` | **Показується** у списку зі статус-сегментом "незавершений"; усі дії доступні |
| Запис активний (файл `.tmp`/`_incomplete` ще пишеться) | Не блокуємо scan; lofty прочитає те, що зможе; після `recording-completed` робимо повний `loadSongs()` |
| Велика колекція (5000+ файлів) | `aria-busy="true"` + announce "Завантаження пісень…"; після — "Знайдено N пісень" |

## 7. Доступність

- **Композиційний список** (FRD §7) — без `role="grid"`, без HTML `<table>`.
- **Roving focus** — Up/Down між summary рядків; Left/Right між сегментами всередині.
- **Зональна навігація** — Tab cycle: ActivityBar → SongsFilterBar → SongsList → StatusBar.
- **Context menu** — Shift+F10 і right-click; React Aria Menu забезпечує focus management і ESC.
- **Live regions** —
  - polite: "Теги оновлено", "Файл перейменовано", "Завантаження…", "Знайдено N пісень"
  - assertive: "Пісню видалено", помилки.
- **ConfirmDialog** — default focus на "Скасувати" для деструктивних дій.
- **Forced colors (Windows High Contrast)** — `forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]` для активних/обраних станів; `forced-colors:text-[GrayText]` для disabled. Наслідуємо patterns зі `StreamList`.
- **TagEditor focus trap** — React Aria Modal; перше поле title із `autoFocus`; ESC закриває; Tab cycles в межах modal.
- **Aria-label рядка** — повний, читається одним повідомленням NVDA при summary-фокусі.

## 8. Тести

### 8.1. Rust unit tests

- `scanner::read_song`:
  - parse station from path (subdir vs root → "—").
  - format detection: mp3 / aac / m4a.
  - `is_complete` за суфіксом `_incomplete`.
  - fallback на порожні теги при відсутності тегів.
- `scanner::scan`:
  - порожня директорія → `[]`.
  - пропуск нерозпізнаних розширень.
  - пропуск пошкоджених файлів (warn + продовження).
- `tags::write_song_tags`:
  - round-trip: write → read → значення збігаються.
  - empty album → `remove_album()`; повторне read → порожній рядок.
- `ops::rename_file`:
  - колізія резолвиться через `sanitize::resolve_collision` → `_2`.

### 8.2. Rust integration test

- Створити tmpdir з MP3 fixture (статичний бінарний файл у `tests/fixtures/`); запустити повний контракт через test AppState → перевірити, що повертається коректний Song і що `update_song_tags` змінює файл.

### 8.3. Frontend unit tests

- `$filteredSongs` computed: пошук (case-insensitive), фільтр станції, всі 4 сортування.
- `SongItem` render — наявність 5 сегментів і коректний `aria-label`.
- `TagEditorDialog` — ESC скидає без save; Save викликає `updateSongTags`.

### 8.4. Manual NVDA checklist

Окремий файл `docs/superpowers/checklists/2026-05-28-phase-3C-manual-test.md` (як для Phase 3A) — створюється на етапі implementation:
1. Tab з ActivityBar → SongsFilterBar → SongsList → StatusBar (циклічно).
2. Up/Down між рядками; Left/Right між сегментами.
3. Shift+F10 → context menu → Play / Edit Tags / Delete.
4. TagEditor: focus trap; перше поле title focused; save → announce.
5. Delete → ConfirmDialog (default focus = Cancel) → recycle bin → toast + announce.
6. Rename → колізія → suffix-announce.
7. Forced Colors mode — list і chips читабельні.
8. Filter chip переключення оновлює live region.
9. Empty state — actions zone не фокусується, focus падає на filter bar.
10. Помилка при delete (read-only file) — assertive announce.

## 9. Залежності між кроками реалізації (preview для writing-plans)

Розбиття на chunks:
1. **Backend foundation** — `walkdir` dep, `songs/` module skeleton, типи.
2. **Scanner** — `scanner.rs` + unit tests.
3. **Tags** — `tags.rs` + unit tests; rename + Recycle Bin ops.
4. **IPC commands** — 6 commands + register у lib.rs.
5. **Frontend store + types** — `$songs`, computeds, IPC wrappers.
6. **SongsPanel + List + Item** — caркас і composite list.
7. **FilterBar** — search/sort/chips.
8. **ContextMenu + Dialogs** — TagEditor + Rename + Confirm.
9. **Events + i18n + a11y polish** — listeners, повна локалізація, focus polish.
10. **Verification** — unit/integration tests + manual NVDA pass.

## 10. Питання, які лишаються на implementation-час

- Точна форма `portable::resolve_output_dir` — створити утиліту чи inline у command.
- Чи потрібен `tauri-plugin-fs` `open` API для відкриття в Explorer, чи достатньо `std::process::Command`. (Pre-select: `Command`.)
- Як обходити кейс, коли Tapir-плеєр відтворює пісню, яку користувач намагається перейменувати/видалити — pre-check у command чи довіряти OS error 32. (Pre-select: довіряти OS, ловити помилку, давати toast.)

Ці питання не блокують дизайн і будуть розв'язані в плані / під час кодування.

---

## Self-Review

**Placeholder scan:** Жодного TBD, TODO, "implement later" у нормативних секціях. Розділ "Питання, які лишаються" явно зазначено як non-blocking — це не placeholders, а зафіксовані implementation-time рішення.

**Внутрішня узгодженість:**
- Контракт IPC у §3.3 — `update_song_tags` повертає `Song`. У §3.4 також emit `song-tags-updated` з повним Song. Frontend listener у §5.3 викликає `replaceSongByPath`. Все узгоджено.
- Файлова структура §4.1 і §5.1 — повний перелік усіх створюваних / змінюваних файлів. Включаючи `commands/mod.rs`, `lib.rs` register, `ActivityBar.tsx` зняття disabled, `App.tsx` routing.
- 5 сегментів у §5.4 збігаються з aria-label у §7.

**Scope check:** Один достатньо локалізований модуль (`songs/`), один frontend каталог, ~12 нових файлів backend+frontend разом. Підходить під один implementation plan.

**Ambiguity check:**
- "Recycle Bin недоступний" — явно: toast і нічого більше, без fallback (§6).
- "_incomplete файли" — явно: показуються (§6).
- "Activе recording" — явно: scan не блокується, повне пересканування після `recording-completed` (§5.3).
- "Bulk не підтримуємо" — зафіксовано у §1.

Готово.
