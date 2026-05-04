# Streams Screen Redesign — Design Spec

**Date:** 2026-05-04  
**Branch:** current working branch  
**Reference mockup:** `docs/ui/01-streams-screen.html`  
**Approach:** In-place restyling (Approach A) — modify existing component files, keep all navigation hooks intact.

---

## Problem

The current streams screen is a functional but visually minimal implementation (slim icon-only sidebar, compact flat list, compact player bar). The mockup `01-streams-screen.html` defines a richer visual language: wide labeled sidebar, metric tiles, search toolbar, table-row stream list, and a 3-panel player.

This spec covers the visual and structural changes to match that mockup while preserving all accessibility (NVDA/zone navigation) and Tauri IPC behavior.

---

## Scope

**In scope (this spec):**
1. ActivityBar — expand to wide labeled rail with profile card
2. SectionHeader — remove (title integrates into workspace titlebar)
3. StreamsPanel — add titlebar, metrics bar, search+filter toolbar, column headers
4. StreamItem — redesign as a table-like grid row
5. PlayerPanel — expand to 3-panel layout
6. StatusBar — minor styling update

**Out of scope:**
- Search/filter functionality (stubs only)
- Multi-select (stub)
- Free disk space metric (stub — backend not implemented)
- Prev/Next stream navigation (stubs)
- Mute button (stub)
- Profiles feature (static stub in profile card)
- WishlistPanel, BrowserPanel restyling (future)

---

## Zone Navigation Model

Zone order (Tab / Shift+Tab cycles through these):
1. `activity-bar` — ActivityBar (rovingFocus vertical)
2. `streams-toolbar` — Titlebar actions + search + filter chips ← **NEW** (non-empty state only)
   OR `streams-empty` — empty state (palette + CTA)
3. `streams-list` — StreamList (composite list) — non-empty state only
4. `player` — PlayerPanel transport + sliders
5. `status-bar` — StatusBar (focusable segments — stays in cycle per FRD 6.2.1 and 7.1.1)

The old `streams-actions` zone (palette + add + stop-all) is replaced by `streams-toolbar`.

**Empty state — no toolbar zone:**  
Per FRD 7.3.3: "перший `Tab` у `Main` має приводити фокус на головну CTA-кнопку". When the stream list is empty, register only `[emptyZone]`. The empty state zone contains palette + CTA buttons; `focus('forward')` lands on the CTA button. No toolbar zone is added in empty state.

**streams-toolbar zone — focus model:**  
The toolbar contains a `<input type="text">` which cannot be inside a standard `composite-exit` rovingFocus (arrow keys would conflict with cursor movement). Use `mixed-boundary-handoff` mode for the whole toolbar:
- Only the **active item** has `tabIndex=0`; all others have `tabIndex=-1`. Arrow keys (Left/Right) move between items within the toolbar.
- Shift+Tab on the first item (Команди) → `exitZone("streams-toolbar", false)`
- Tab on the last item (last chip) → `exitZone("streams-toolbar", true)`
- At any non-boundary item, Tab/Shift+Tab is NOT intercepted — native Tab moves to the next zone-external tab stop.
- Arrow key navigation is blocked only when the focused element is the search input: add an `onKeyDown` on the input itself that calls `e.stopPropagation()` for `ArrowLeft`, `ArrowRight`, `Home`, `End`

**streams-toolbar zone items** (in Tab/arrow order):
1. "Команди" button
2. "Додати потік" button
3. "Зупинити все" button — **kept in toolbar** (FRD 7.3.2 requires it)
4. Search input
5. "Усі" chip
6. "Записуються" chip
7. "З помилками" chip
8. "Вибрані" chip

`onZonesChange` in StreamsPanel registers:
- `[toolbarZone, streamListZone]` when non-empty
- `[emptyZone]` when empty (CTA-first, per FRD)

---

## Component Designs

### 1. ActivityBar

**File:** `src/components/layout/ActivityBar.tsx`

**Changes:**
- Width: `w-12` → `w-56` (224px)
- Nav button layout: `flex items-center gap-3 px-3 py-3 w-full rounded-xl` with icon (20px) + text label
- Active state: `bg-slate-700/60 text-blue-400` + left accent border `border-l-2 border-blue-400`
- Disabled state: `cursor-not-allowed text-slate-600`
- Add logo area at top: a small SVG or text "Tapir" — or leave empty (the mockup shows a logo image that isn't available)
- Add **profile card** at the very bottom (below Settings button):
  - Static card: user icon + "Профіль" (strong) + actual active profile name from `useStore($settings).activeProfile ?? "Default"` (span)
  - Not focusable (`tabIndex` not set / no tab stop), but NOT `aria-hidden` — NVDA reads it as passive text in the document flow
  - Will become an interactive button in Phase 3D (profiles feature)
- Settings button: remains just above the profile card
- Zone navigation: unchanged (rovingFocus vertical on section buttons + settings button; profile card is NOT in the tab order)
- Forced-colors: maintained per existing patterns

### 2. SectionHeader removal

**File:** `src/App.tsx`

- Remove `<SectionHeader section={activeSection} />` from the JSX
- Remove the import of `SectionHeader`
- The `SectionHeader.tsx` component file itself can remain (do not delete — other panels might use it in future)

### 3. StreamsPanel

**File:** `src/components/streams/StreamsPanel.tsx`

**New structure (non-empty state):**

```
<div role="region" aria-label="Потоки">
  <header class="titlebar">        ← NEW: h2 + Команди btn + Додати потік btn
  <section class="metrics">        ← NEW: 4 metric tiles
  <section class="toolbar">        ← NEW: search stub + filter chip stubs
  <div class="column-headers">     ← NEW: visual column labels (aria-hidden)
  <StreamList />                   ← EXISTING: no API changes
  <AddStreamDialog />              ← EXISTING: unchanged
</div>
```

**Titlebar + Toolbar = `streams-toolbar` zone:**
- `h2` "Потоки" — real, visible heading (do NOT add `aria-hidden`)
- `<div ref={toolbarZoneRef} data-zone-id="streams-toolbar" role="toolbar" aria-label={m.zone_streams_toolbar()}>`
- Contains (`mixed-boundary-handoff`):
  1. "Команди" button → `$commandPaletteOpen.set(true)`
  2. "Додати потік" button → `$showAddStreamDialog.set(true)`
  3. Search `<input>` with `aria-label`, `placeholder`; Ctrl+F shortcut focuses it
  4. Filter chip buttons (see below)
- The old `actionsZoneRef` + rovingFocus for actions are **removed**
- The `toolbarZoneRef` replaces them; registered via `onZonesChange`

**Metrics bar:**
- 4 tiles in a CSS grid row (`grid grid-cols-4 gap-3`)
- Tile component (inline): `strong` value + `span` label
- Values computed from `$streams` + `$statuses` stores using reactive `useStore` hooks:
  ```ts
  const streamIds = new Set(streams.map(s => s.id));
  const visibleStatuses = Object.entries(statuses)
    .filter(([id]) => streamIds.has(id))
    .map(([, s]) => s);
  ```
  - `streams.length` → "{count} потоків" / "У профілі"
  - `visibleStatuses.filter(s => s.state === "recording").length` → "{count} записів" / "Активні"
  - `visibleStatuses.filter(s => s.state === "error").length` → "{count} збоїв" / "Потребує уваги"
  - `"—"` → "Вільно" (stub, disk space TBD)
- No keyboard interaction (display only)
- Metric counts use plural-aware i18n keys (see i18n Keys section)

**Toolbar (stubs):**
- Search `<input type="text">` with `aria-label={m.streams_search_label()}`, `placeholder`.  
  Keyboard: Ctrl+F focuses this input (via `useEffect` keydown handler in StreamsPanel).  
  Input value is not used — no filtering occurs yet.
- Filter chips: plain `<button>` elements with **`aria-pressed`** only (no `role="radio"`).  
  "Усі" starts with `aria-pressed="true"` visually. Clicking does nothing — state is local UI stub only.  
  Chips do NOT affect the stream list.

**Stop All action:** Remains in the toolbar as button 3 (FRD 7.3.2 requires it in the action zone). Calls `tauri.stopAllRecordings()`. Secondary visual style.

**Column headers (visual only):**
- `div[aria-hidden="true"]` with same CSS grid as stream rows: Статус / Станція / Зараз грає / Бітрейт / Тривалість / Дії
- Styled in muted/small caps text

**Zone registration changes:**
- Remove `actionsZone` and its rovingFocus setup
- Add `toolbarZone` with `data-zone-id="streams-toolbar"`, `mixed-boundary-handoff` mode on 8 items (see Zone Navigation Model for details on search input arrow-key guard)
- `onZonesChange` registers `[toolbarZone, streamListZone]` when non-empty, `[emptyZone]` when empty (CTA-first per FRD 7.3.3)

### 4. StreamItem

**File:** `src/components/streams/StreamItem.tsx`

**Segment → column mapping:**

The `<li>` is a CSS Grid container with 6 explicit columns:
```
grid-template-columns: 100px 1fr 1.5fr 90px 90px 160px
```

DOM order of children (Tab order follows DOM order):

| DOM pos | `grid-column` | Focusable | Segment | Content |
|---|---|---|---|---|
| 1 | 2 — Станція | ✅ | `summary` | station name (visible text) |
| 2 | 1 — Статус | ❌ | — (`aria-hidden`) | **visual** status dot + label |
| 3 | 3 — Зараз грає | ✅ | `track` | artist — title or "—" |
| 4 | 4 — Бітрейт | ✅ | `tech` | formatBitrate or "—" |
| 5 | 5 — Тривалість/Стан | ✅ active / ❌ idle | `status` (active only) | duration or state text |
| 6 | 6 — Дії | ✅ | `actions` | ▶/■ + ⏺/⏹ + ⋯ |

**Key decisions:**
- Col 1 (Статус dot): `aria-hidden="true"` — purely visual new decoration (colored dot + short label like "REC", "Підключення…"). Not a segment. Screen reader users get status from the `summary` aria-label AND from the `status` segment when active.
- Col 5 (Тривалість/Стан): The **existing `status` segment** — focusable and part of the composite list for `recording`, `connecting`, and `reconnecting` states. In `idle`/`stopped` state the cell is `aria-hidden` (no segment rendered — matches current behavior).
- `summary` is DOM-first (col 2) — keyboard/screen-reader order: Станція → Зараз грає → Бітрейт → [Статус, коли активний] → Дії. This matches `useCompositeList` expectations (summary is first).
- CSS Grid explicit placement (`grid-column`) allows visual col 1 (status dot) to appear before col 2 (summary) without changing DOM order.

**`getStreamSegments()` — NO CHANGE from current behavior:**
Already returns `["track", "tech", "status", "actions"]` for active streams (recording/connecting/reconnecting), and `["track", "tech", "actions"]` for idle/stopped. Do not modify this function.

**Visual status dot labels (col 1, aria-hidden):**
- `recording` → red dot + `m.status_recording()` ("REC")
- `connecting` → amber dot + `m.status_connecting()` ("Підключення...")
- `reconnecting` → amber dot + `m.status_reconnecting()` ("Перепідключення...")
- `error` → red dot + `m.status_error()` ("Помилка")
- `idle` / `stopped` → green dot + `m.status_idle()` ("Очікування")

All labels use existing i18n keys — no hardcoded English text.

**Row highlighting:**
- Recording: subtle `bg-red-950/30 border-l-2 border-red-500`
- Playing (this stream): subtle `bg-blue-950/30`

**Accessibility:**
- Summary aria-label still provides full row context for screen readers
- Each segment aria-label unchanged
- `data-item-id`, `data-segment` attributes unchanged (composite list depends on these)

### 5. PlayerPanel

**File:** `src/components/player/PlayerPanel.tsx`

**Layout:** 3 equal-ish columns in a horizontal bar (`grid grid-cols-3 gap-4`), each column is a `<article>` card.

**Panel 1 — "Зараз грає":**
- `<article aria-label={m.player_now_playing()}>` — article is labelled, no h3 needed for a11y
- `<h3 aria-hidden="true">` "Зараз грає" — visual only (article label serves screen readers)
- Source label: `useSourceLabel()` hook result (existing)
- Track: `currentTrack?.artist — currentTrack?.title` or `"—"`.  
  Track info: `playerStatus.source?.type === "stream"` → look up `statuses[source.streamId]?.currentTrack`. For files: no track info, show filename.
- Meta row (muted text): `"Прослуховування"` + bitrate string (from stream's `bitrate` field if source is stream, else "—") + `"Live"` badge when `source.type === "stream"`

**Panel 2 — "Керування":**
- `<article aria-label={m.player_controls()}>` — article is labelled
- `<h3 aria-hidden="true">` "Керування" — visual only
- Transport row — 5 buttons:
  1. **Prev** — `isDisabled={true}` stub, `aria-label={m.player_prev()}`
  2. **Play/Pause** — existing logic (enabled when `isActive`)
  3. **Stop** — existing logic (enabled when `isActive`)
  4. **Next** — `isDisabled={true}` stub, `aria-label={m.player_next()}`
  5. **Mute** — `isDisabled={true}` stub, `aria-label={m.player_mute()}`
- `PlaybackPosition` component (unchanged). When it returns `null`, the position wrapper div is still present — Tab flow is unchanged.
- Transport rovingFocus refs: `[prevRef, playPauseRef, stopRef, nextRef, muteRef]` (5 refs)

**Panel 3 — "Вивід":**
- `<article aria-label={m.player_output()}>` — article is labelled
- `<h3 aria-hidden="true">` "Вивід" — visual only
- Detail rows (each a `<div>` with `<span>` label + `<strong>` value):
  - "Активний запис" → `streams.find(s => statuses[s.id]?.state === "recording")?.name ?? "—"` (use reactive `useStore($streams)` / `useStore($statuses)` — not raw `.get()` calls);  
    use `useStore($streams)` + `useStore($statuses)` inside PlayerPanel
  - "Пристрій" → `useStore($settings).outputDevice ?? "—"`
  - "Гучність" → `${Math.round(playerStatus.volume * 100)}%`
- `VolumeSlider` component (unchanged)

**Zone navigation updates:**
- `transportRefs` useMemo expands to 5 refs: `[prevRef, playPauseRef, stopRef, nextRef, muteRef]`
- Backward zone entry (Shift+Tab arriving from StatusBar) → land on last item in volume wrapper
- `restoreFocusPlayer` (modal-dismiss focus restore) → land on `muteRef` (last transport item, preserves play/pause context)
- Tab sequence: transport row → position wrapper → volume wrapper → exit forward (unchanged flow, just more transport buttons)

### 6. StatusBar

**File:** `src/components/layout/StatusBar.tsx`

- Keep existing aria structure
- Minor visual styling: `text-sm text-slate-400` with `strong` highlights
- No content changes (content is already stub-level)

---

## i18n Keys

New keys needed (add to `uk.json` and `en.json`):

Plural-aware keys for metric counts (follow the existing `recordings_count_one/few/many/zero` pattern):
- `streams_count_zero` — "Немає потоків"
- `streams_count_one` — "{count} потік"
- `streams_count_few` — "{count} потоки"
- `streams_count_many` — "{count} потоків"
- `active_recordings_zero` — "Немає записів"
- `active_recordings_one` — "{count} запис"
- `active_recordings_few` — "{count} записи"
- `active_recordings_many` — "{count} записів"
- `errors_count_zero` — "Немає збоїв"
- `errors_count_one` — "{count} збій"
- `errors_count_few` — "{count} збої"
- `errors_count_many` — "{count} збоїв"

Use `Intl.PluralRules` like StatusBar does. Do NOT embed counts via template literals.

Simple (non-plural) new keys (verify each against `uk.json` before adding — already-existing keys are noted):

- `zone_streams_toolbar` — "Пошук і фільтри" ← NEW
- `streams_search_label` — "Пошук потоків або URL" ← NEW
- `filter_all` — "Усі" ← NEW
- `filter_recording` — "Записуються" ← NEW
- `filter_errors` — "З помилками" ← NEW
- `filter_selected` — "Вибрані" ← NEW
- `metric_streams_in_profile` — "У профілі" ← NEW
- `metric_active_recordings` — "Активні" ← NEW
- `metric_errors` — "Потребує уваги" ← NEW
- `metric_free_space` — "Вільно" ← NEW
- `profile_name` — "Профіль" ← NEW
- `column_station` — "Станція" ← NEW
- `column_now_playing` — "Зараз грає" ← NEW (≠ existing `column_track` "Поточний трек")
- ~~`column_status`~~ — **already exists**
- ~~`column_bitrate`~~ — **already exists**
- ~~`column_duration`~~ — **already exists**
- ~~`column_actions`~~ — **already exists**
- `player_now_playing` — "Зараз грає" ← NEW
- `player_controls` — "Керування" ← NEW
- `player_output` — "Вивід" ← NEW
- `player_prev` — "Попередній потік" ← NEW
- `player_next` — "Наступний потік" ← NEW
- `player_mute` — "Вимкнути/увімкнути звук" ← NEW
- `player_active_recording` — "Активний запис" ← NEW
- `player_device` — "Пристрій" ← NEW
- `player_volume` — "Гучність" ← NEW
- `commands_label` — "Команди" ← NEW (button visible text; aria-label reuses existing `command_palette_label`)
- ~~`stop_all_recordings`~~ — **use existing `stop_all`** ("Зупинити всі")

---

## Risks & Notes

- **`getStreamSegments()` unchanged** — matches current code: returns `["track","tech","status","actions"]` for active streams (recording/connecting/reconnecting), `["track","tech","actions"]` for idle/stopped. The `status` segment (col 5) remains accessible. The new visual status dot (col 1) is `aria-hidden` decoration only.
- **ActivityBar width change** affects overall layout; content area shrinks by ~176px. The stream table uses CSS grid with `minmax` or `fr` units — ensure `min-width` on the list prevents collapse.
- **Profile card** is `aria-hidden="true"` and purely static — no click handler, no tab stop. Shows actual active profile name from `$settings`. Will become interactive in Phase 3D.
- **Prev/Next/Mute stubs** in PlayerPanel: `isDisabled={true}` (not just no-op). Screen readers will announce them as "dimmed/unavailable" — this is the correct behavior for not-yet-implemented controls.
- **`streams_search_label`** — used for both `aria-label` and `placeholder` on the search input.
- **Metric plurals** — use `Intl.PluralRules` + separate `one/few/many/zero` keys (same pattern as `StatusBar` / `recordings_count_*`). Do not embed counts via string concatenation.
- **`$settings.activeProfile`** — verify field name in `GlobalSettings` struct; fall back to `"Default"` if null.
