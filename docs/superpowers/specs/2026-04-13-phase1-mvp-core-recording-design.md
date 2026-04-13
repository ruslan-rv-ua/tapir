# Phase 1 — MVP: Core Recording — Design Spec

> **Date:** 2026-04-13  
> **Status:** Approved  
> **Scope:** Full Phase 1 as defined in `docs/implementation-phases.md`  
> **Strategy:** One spec, implementation plan split into stages (Walking Skeleton → full scope)

---

## 1. Design Decisions

Decisions made during brainstorming that are not captured in existing docs:

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Scaffold via `cargo tauri init` / `pnpm create tauri-app`, then adapt configs | Guarantees compatible boilerplate (`build.rs`, `main.rs`, `lib.rs`); configs adapted to match `tech-stack.md` |
| 2 | Plugins in Phase 1: only `tauri-plugin-log` + `tauri-plugin-dialog` | Minimal set — only plugins whose code is actually called. Rest added in later phases |
| 3 | Paraglide.js for i18n | Typesafe keys catch errors at compile time; handles Ukrainian plurals (one/few/many/other) |
| 4 | Reconnect logic lives in `stream::manager`, not `stream::connection` | Manager has full control — can check CancellationToken, decide not to reconnect on Stop |
| 5 | Separate IPC events (as in docs) — not a single `stream-update` event | Clear contract, simpler TypeScript typing, components subscribe only to relevant events |
| 6 | BOM strip when reading JSON files | `serde_json` fails on UTF-8 BOM; Windows Notepad adds BOM; trivial 3-line guard |
| 7 | Empty state: text + CTA button, no illustrations | Minimalistic, accessible; illustrations add no value for screen reader users |
| 8 | Recording pipeline: Hybrid approach (C) — `Arc<Mutex<...>>` + `tokio::spawn` per stream | Simplest for Tauri context; tasks emit events directly via `AppHandle`; minimal Mutex contention |

---

## 2. Project Scaffold & Infrastructure

### 2.1. Initialization

`pnpm create tauri-app` with React + TypeScript + Vite template. Post-scaffold adaptations:

- Replace generated configs with versions from `tech-stack.md`
- Add Tailwind CSS v4 (`@tailwindcss/vite`)
- Add React Aria Components, Nanostores, lucide-react
- Setup Paraglide.js with Vite plugin
- Configure `messages/uk.json` (primary), `messages/en.json` (placeholder)

### 2.2. Tauri Plugins (Phase 1 only)

| Plugin | Purpose |
|--------|---------|
| `tauri-plugin-log` | Structured logging from day 1 |
| `tauri-plugin-dialog` | Browse button for output directory |

All other plugins (`global-shortcut`, `single-instance`, `cli`, `window-state`, `autostart`, `shell`, `http`, `notification`) are added in their respective phases.

### 2.3. Cargo Dependencies (Phase 1)

**Included:**
- `reqwest` (stream feature), `icy-metadata`, `stream-download` — HTTP streaming
- `lofty` — ID3v2/M4A tags
- `tokio` (full), `futures-util`, `bytes` — async runtime
- `serde`, `serde_json` — serialization
- `thiserror`, `anyhow` — error handling
- `chrono`, `sys-locale` — time, locale detection
- `nanoid` — stream ID generation
- `tracing`, `log` — logging
- `tokio-util` — `CancellationToken`

**NOT included (later phases):**
- `rodio`, `symphonia` — Player (Phase 2)
- `windows-rs` — tray/balloon (Phase 4)

### 2.4. Portable Structure

`portable.rs` provides:
- `base_dir()` — directory containing the EXE
- `data_dir()` — `base_dir()/data/`
- Path builders for `settings.json`, `profiles/`, `recordings/`, `logs/`
- Directory creation on first launch

### 2.5. Paraglide.js Setup

- Vite plugin integration
- `messages/uk.json` — all UI strings in Ukrainian
- `messages/en.json` — English translations (can start as stubs)
- `<html lang="...">` attribute updated on language change
- Ukrainian plurals via `Intl.PluralRules` (one/few/many/other)

---

## 3. Recording Pipeline (Backend Core)

### 3.1. Architecture — Hybrid (C)

```
StreamManager
  state: Arc<Mutex<HashMap<StreamId, StreamEntry>>>
  app_handle: AppHandle
  │
  ├─ start_recording(stream_info) → tokio::spawn(recording_task)
  ├─ stop_recording(stream_id) → CancellationToken::cancel()
  ├─ stop_all() → cancel all tokens
  └─ get_status(stream_id) → read from shared state

StreamEntry {
  info: StreamInfo,
  status: StreamStatus,
  cancel_token: CancellationToken,
  join_handle: JoinHandle<()>,
}
```

Each stream runs as an independent `tokio::spawn` task. Tasks hold `Arc` references to shared state and `AppHandle` for emitting IPC events. `Mutex` is locked only for brief status updates, never during I/O.

### 3.2. Recording Task Flow

1. **Connect** — `stream::connection::connect(url)` → HTTP GET with ICY headers (`Icy-MetaData: 1`). Parse response headers (icy-name, icy-genre, icy-br, content-type). Emit `recording-status: connecting`.
2. **Detect format** — `stream::format::detect()` via content-type + magic bytes (MP3: `0xFF 0xFB/0xF3/0xF2`; AAC: ADTS `0xFF 0xF1/0xF9`).
3. **Read loop** — Read chunks via `icy-metadata` (auto-strips metadata from stream). On metadata change → emit `track-changed`, delegate to splitter.
4. **Split** — `stream::splitter` compares new metadata with previous. If changed → finalize current track (write tags, close file), open new file.
5. **Write** — `stream::recorder` writes raw bytes to two files: stream file (continuous) + current track file.
6. **Tags** — `tags::writer` writes ID3v2 (MP3) or M4A tags on track finalization: artist, title, album (empty), station name.
7. **Reconnect** — On connection error, task enters reconnect loop (exponential backoff). Emit `recording-status: reconnecting`. Manager checks `CancellationToken` before each retry attempt.

### 3.3. Track Splitting Logic (splitter.rs)

```
if first_metadata:
    if skip_first_incomplete_track → buffer bytes, don't write track file
    else → open track file, start writing
elif metadata_changed:
    finalize current track (write tags, check minDuration)
    if duration < skipShortTracksMs → delete track file
    open new track file
```

### 3.4. Filename Sanitization (sanitize.rs)

- Template rendering: `%a` → artist, `%t` → title, `%s` → station, `%n` → track number, `%d` → date, `%time` → time
- Forbidden characters (`\ / : * ? " < > |`) → `_`
- Trailing dots/spaces → trim
- Collisions: if file exists → `_2`, `_3`, etc.
- `autoCorrectCase`: `"artist - title"` → `"Artist - Title"`

### 3.5. Playlist Parsing (playlist.rs)

Manual implementation (~30 lines each):
- PLS: extract `File1=` URL
- M3U: skip `#` lines, take first non-empty URL

---

## 4. IPC Commands & Events

### 4.1. Commands (frontend → backend)

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `get_streams` | — | `Vec<StreamInfo>` | List streams from profile |
| `add_stream` | `url: String, name: Option<String>` | `StreamInfo` | Add stream (resolve PLS/M3U) |
| `remove_stream` | `stream_id: String` | `()` | Remove stream from profile |
| `update_stream` | `stream_id: String, name: String` | `StreamInfo` | Update stream name |
| `start_recording` | `stream_id: String` | `()` | Start recording |
| `stop_recording` | `stream_id: String` | `()` | Stop recording |
| `stop_all_recordings` | — | `()` | Stop all recordings |
| `get_stream_status` | `stream_id: String` | `StreamStatus` | Current stream status |
| `get_all_statuses` | — | `Vec<StreamStatus>` | All stream statuses |
| `get_settings` | — | `GlobalSettings` | Global settings |
| `save_settings` | `settings: GlobalSettings` | `()` | Save settings |

**`add_stream` details:** Receives URL. If URL points to PLS/M3U — parses it, extracts first stream URL. Stores resolved URL in profile. Name: if not provided, uses URL as temporary name (updated to icy-name on first connect).

### 4.2. Events (backend → frontend)

| Event | Payload | When |
|-------|---------|------|
| `recording-status` | `{ streamId, status, error? }` | State change: connecting, recording, stopped, error, reconnecting |
| `track-changed` | `{ streamId, artist, title, album }` | New ICY metadata |
| `recording-started` | `{ streamId, fileName }` | Recording file created |
| `recording-completed` | `{ streamId, fileName, durationMs }` | Track finalized and saved |
| `stream-error` | `{ streamId, message, willRetry }` | Connection error |

### 4.3. Error Handling

All commands return `Result<T, String>`. Errors serialize as rejected promises in frontend. Frontend shows toast with error text.

---

## 5. Frontend Architecture

### 5.1. Layout

```
┌──────────────────────────────────────────┐
│ Windows Titlebar (decorations: true)     │
├────┬─────────────────────────────────────┤
│    │ SectionHeader (title + Ctrl+K)      │
│ A  ├─────────────────────────────────────┤
│ c  │                                     │
│ t  │ StreamsPanel                        │
│ i  │   StreamTable (sortable grid)       │
│ v  │   - or empty state CTA             │
│ i  │                                     │
│ t  │                                     │
│ y  │                                     │
│    │                                     │
│ B  ├─────────────────────────────────────┤
│ a  │ StatusBar                           │
│ r  │ (recordings count, disk, duration)  │
├────┴─────────────────────────────────────┤
```

### 5.2. Components

| Component | Description |
|-----------|-------------|
| `App.tsx` | Root: ActivityBar (48px left) + content area. Initializes Tauri event listeners. |
| `ActivityBar.tsx` | Vertical icon bar. Phase 1: only "Streams" (Radio) active. Others disabled with tooltip. ProfileSwitcher at bottom — disabled placeholder. `aria-current="page"` on active. |
| `SectionHeader.tsx` | Top bar: section title + Ctrl+K trigger. |
| `StreamsPanel.tsx` | Container: toolbar (Add, Record, Stop, Remove) + StreamTable or empty state. |
| `StreamTable.tsx` | React Aria TableView. Columns: checkbox, status icon, name, current track, bitrate, recording duration. Sortable by name, bitrate. |
| `StreamRow.tsx` | Row with status icon: idle (grey), connecting (yellow pulse), recording (red pulse + "REC"), reconnecting (yellow), error (red). Checkbox `aria-label="Вибрати потік: {streamName}"`. |
| `AddStreamDialog.tsx` | React Aria Modal. Fields: URL (required), name (optional). Dual-mode: add/edit. Focus trap, Escape to close. |
| `StatusBar.tsx` | Bottom bar: active recording count, free disk space, longest recording duration. |
| `CommandPalette.tsx` | Ctrl+K overlay. Fuzzy search of actions and streams. Phase 1 actions: "Додати потік", "Почати запис", "Зупинити запис", stream list. |
| `ToastContainer.tsx` | Bottom-right, `aria-live="polite"`. Auto-dismiss after 5s. |
| `LiveAnnouncer.tsx` | Two `sr-only` containers (polite + assertive). Used for screen reader announcements. |
| `ConfirmDialog.tsx` | React Aria Modal for destructive actions (delete stream). |
| `ErrorBoundary.tsx` | React error boundary with fallback UI. |

### 5.3. Stores (Nanostores)

| Store | Type | Description |
|-------|------|-------------|
| `streams.ts` | `atom<StreamInfo[]>` | Synced with backend via `get_streams()` on start and after mutations |
| `statuses.ts` | `map<Record<string, StreamStatus>>` | Updated via Tauri events |
| `settings.ts` | `atom<GlobalSettings>` | Loaded on start |
| `navigation.ts` | `atom<{ section, commandPaletteOpen }>` | Active section, Command Palette state |
| `toasts.ts` | `atom<Toast[]>` | Push/auto-remove queue |
| `announcer.ts` | `atom<{ message, priority }>` | Screen reader announcement queue |

### 5.4. Hooks

| Hook | Description |
|------|-------------|
| `useTauriEvent(event, handler)` | Wrapper over `listen()` with cleanup on unmount |
| `useAnnounce()` | Returns `announce(message, priority)` for LiveAnnouncer |

---

## 6. Accessibility

### 6.1. Tab Order

`ActivityBar` → `StreamTable` (or empty state CTA) → `Toolbar` → `StatusBar`

### 6.2. Keyboard Navigation

| Context | Key | Action |
|---------|-----|--------|
| Global | `Ctrl+K` | Toggle Command Palette |
| Global | `Escape` | Close dialog / Command Palette |
| ActivityBar | `Arrow Up/Down` | Move between sections |
| ActivityBar | `Enter/Space` | Activate section |
| StreamTable | `Arrow Up/Down` | Move between rows |
| StreamTable | `Space` | Toggle select row |
| StreamTable | `Enter` | Default action (start/stop recording) |
| StreamTable | `Delete` | Delete stream (via ConfirmDialog) |
| Dialog | `Tab/Shift+Tab` | Navigate fields |
| Dialog | `Enter` | Submit |
| Dialog | `Escape` | Cancel/Close |

### 6.3. ARIA Markup

- `StreamTable` — `role="grid"`, columns `role="columnheader"` with `aria-sort`
- `StreamRow` — `role="row"`, cells `role="gridcell"`
- Checkbox select — `aria-label="Вибрати потік: {streamName}"`
- `ActivityBar` — `role="navigation"`, `aria-label="Головна навігація"`, `aria-current="page"` on active
- `StatusBar` — `role="status"`, `aria-live="polite"`
- Dialogs — `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on heading
- `CommandPalette` — `role="combobox"` + `role="listbox"` for results

### 6.4. Live Regions

| Event | Priority | Text |
|-------|----------|------|
| Track changed | polite | `"{artist} — {title}"` |
| Recording started | assertive | `"Запис розпочато: {streamName}"` |
| Recording stopped | assertive | `"Запис зупинено: {streamName}"` |
| Connection error | assertive | `"Помилка з'єднання: {streamName}"` |
| Reconnecting | polite | `"Перепідключення: {streamName}, спроба {n}"` |
| Stream added | polite | `"Потік додано: {name}"` |
| Stream removed | polite | `"Потік видалено: {name}"` |

### 6.5. First-Run

On first launch (0 streams), LiveAnnouncer announces: `"Ласкаво просимо до Tapir. Натисніть Enter щоб додати перший потік."` Focus auto-set on CTA button.

---

## 7. Data Flow & Error Handling

### 7.1. Startup Sequence

1. `portable::base_dir()` — determine EXE directory
2. Create `data/`, `data/profiles/`, `data/recordings/`, `data/logs/` if missing
3. Read `data/settings.json` (if missing → create with defaults, detect language via `sys-locale`)
4. BOM strip before `serde_json::from_str`
5. Read `data/profiles/{activeProfile}.tapirprofile` (if missing → create `Default.tapirprofile`)
6. Initialize `StreamManager` (empty, no active recordings)
7. Frontend: load `get_settings()`, `get_streams()` → populate stores
8. Frontend: subscribe to Tauri events
9. Show window (`window.show()`)

### 7.2. Data Persistence

- Settings and Profile saved on every mutation (save-on-change)
- Atomic write: write to temp file → rename — if crash during write, original file intact
- Recording files written directly (stream write) — partial files use `_incomplete` suffix

### 7.3. Error Categories

| Category | Example | Handling |
|----------|---------|----------|
| Network | Connection refused, timeout | Reconnect loop with backoff. Toast + live region. |
| File I/O | Disk full, permission denied | Stop recording, emit error. Toast (assertive). |
| Parse | Invalid PLS/M3U, corrupt JSON | Return `Err(String)` via IPC. Toast with description. |
| Config | Missing settings.json | Create with defaults, log warning. |
| Unexpected | Panic in recording task | `JoinHandle` catch, log, emit error event, mark stream as error. |

### 7.4. Graceful Shutdown

1. Frontend closes
2. Backend receives close event
3. `StreamManager::stop_all()` — cancel all recording tasks
4. Await `JoinHandle` completion (timeout 5s)
5. Save `activeRecordingUrls` to profile (recovery NOT in Phase 1 scope — only saving URLs)
6. Flush logs
7. Exit

---

## 8. What's NOT in Phase 1

- Player (playback) — Phase 2
- Wishlist/Ignorelist (matcher, UI) — Phase 2
- Scheduler (planned recordings) — Phase 3
- Browser (Radio Browser API) — Phase 3
- Saved Songs (file manager) — Phase 4
- Post-processing — Phase 4
- Profile switching (CRUD) — Phase 4
- Full SettingsDialog (language, theme, hotkeys, audio device) — Phase 2
- System tray + balloon tip — Phase 4
- CLI arguments — Phase 4
- Single instance (Named Mutex) — Phase 4
- Windows High Contrast (forced-colors) — Phase 4
- Autostart — Phase 4
- Window state persistence — Phase 2
- Bandwidth limiting — Phase 4

---

## 9. Done Criteria (from implementation-phases.md)

- [ ] User can add a stream by URL (direct or PLS/M3U)
- [ ] Record one or multiple streams simultaneously
- [ ] Automatic track splitting by ICY metadata
- [ ] ID3v2/M4A tags written on track finalization
- [ ] Automatic reconnection on disconnect
- [ ] Files saved by template in `data/recordings/`
- [ ] Full keyboard navigation (Tab, Arrow, Enter, Space, Escape)
- [ ] NVDA reads stream table, announces track changes and recording status
- [ ] Focus trap in dialogs
- [ ] Portable EXE structure works (data/ next to exe)
- [ ] UI strings via Paraglide.js (uk)
- [ ] Empty state for StreamTable with 0 streams (CTA button with autoFocus)
- [ ] First-run announcement via LiveAnnouncer
- [ ] `aria-label` for row selection checkbox: `"Вибрати потік: {streamName}"`
- [ ] `aria-current="page"` dynamically updates on section change
