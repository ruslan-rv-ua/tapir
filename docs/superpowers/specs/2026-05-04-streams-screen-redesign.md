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
  - Static card: user icon + "Профіль" (strong) + "Music Discovery" (span)
  - `aria-label="Активний профіль"` (not focusable — stub, no interaction)
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

**Titlebar:**
- `h2` "Потоки" (`aria-hidden` — the region aria-label already announces it)
- "Команди" button → opens `$commandPaletteOpen` (replaces current `>_` button)
- "Додати потік" button → opens `$showAddStreamDialog`
- Zone: these buttons move from the actions zone into the titlebar. The `actionsZoneRef` and rovingFocus setup for the old toolbar are **removed**. Titlebar buttons are standard tab stops (not in a composite zone).

**Metrics bar:**
- 4 tiles in a CSS grid row (`grid grid-cols-4 gap-3`)
- Tile component (inline): `strong` value + `span` label
- Values computed from `$streams` + `$statuses` stores:
  - `streams.length` → "X потоків" / "У профілі"
  - `Object.values(statuses).filter(s => s.state === "recording").length` → "X записів" / "Активні"
  - `Object.values(statuses).filter(s => s.state === "error").length` → "X збоїв" / "Потребує уваги"
  - `"—"` → "Вільно" (stub, disk space TBD)
- No keyboard interaction (display only)

**Toolbar (stubs):**
- Search input with `aria-label="Пошук потоків або URL"`, `placeholder`, keyboard shortcut badge "Ctrl+F" — input does nothing
- Filter chips: "Усі" (active state), "Записуються", "З помилками", "Вибрані" — buttons with `role="radio"` / `aria-pressed` but no filter logic

**Column headers (visual only):**
- `div[aria-hidden="true"]` with same CSS grid as stream rows: Статус / Станція / Зараз грає / Бітрейт / Тривалість / Дії
- Styled in muted/small caps text

**Zone registration changes:**
- Remove `actionsZone` (toolbar buttons are standard tab stops now)
- StreamList zone remains as before
- Empty state zone remains as before
- `onZonesChange` now registers only `[streamListRef.current]` (or `[emptyZone]`)

### 4. StreamItem

**File:** `src/components/streams/StreamItem.tsx`

**Grid layout:**
```css
grid-template-columns: 100px 1fr 1.5fr 90px 90px 160px
```
Each `<li>` is the grid container. Summary is sr-only first child. Then 6 grid cells.

**Segment changes:**
- `getStreamSegments()` now **always** returns `["status", "track", "tech", "actions"]` (status always present)
- `summary` segment: sr-only focusable div (unchanged behavior — composite list entry point)
- `status` segment: CSS grid cell col 1 — status dot + text label:
  - `recording` → red dot + "REC"
  - `connecting` → yellow dot + "Підключення"
  - `reconnecting` → yellow dot + "Retry (N/M)"
  - `error` → red dot + "Помилка"
  - `idle` → green dot + "Idle"
- `track` segment: CSS grid cell col 3 — `artist — title` or `"—"`
- `tech` segment: CSS grid cell col 4 — `formatBitrate(stream.bitrate)` or `"—"`
- New static cell col 2 (station name): stream name in bold — NOT a focusable segment, rendered as a visual `<span>` inside the `summary`-cell area. Actually: the summary cell occupies col 2, and visually shows stream name. The sr-only aria-label provides full context.
- New static cell col 5 (duration): `formatDuration(elapsedMs)` when recording, else `"—"` — not a separate segment (included in status aria-label)
- `actions` segment: CSS grid cell col 6 — 3 buttons: Play/Stop, REC toggle, context menu

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
- `<h3>` "Зараз грає"
- Source name (strong)
- `artist — title` paragraph (or "—")
- Meta row: "Прослуховування" + bitrate string + "Live" badge when no position — these are stubs/derived from playerStatus

**Panel 2 — "Керування":**
- `<h3>` "Керування"
- Transport row: Prev (stub, aria-label, disabled), Play/Pause (existing), Next (stub), Mute (stub) + "Live" span
- Progress section: `PlaybackPosition` component (existing)
- Zone: transport refs expand from `[playPauseRef, stopRef]` to `[prevRef, playPauseRef, nextRef, muteRef]`; stop button is removed (stop moved to context? or kept as 5th button)
  - **Decision:** Keep Stop button but only when `isActive`. Transport refs: `[prevRef, playPauseRef, stopRef, nextRef, muteRef]`

**Panel 3 — "Вивід":**
- `<h3>` "Вивід"
- Detail rows:
  - "Активний запис" → name of first recording stream or "—"
  - "Пристрій" → `settings.outputDevice` or "—"  
  - "Гучність" → percentage label (derived from VolumeSlider state — stub)
- `VolumeSlider` component (existing)
- Zone: volume wrapper handles Tab key same as before

**Zone navigation updates:**
- `restoreFocusPlayer` updates: backward direction → land on mute (last transport button)
- Tab sequence within player: transport row → position slider → volume slider → exit forward

### 6. StatusBar

**File:** `src/components/layout/StatusBar.tsx`

- Keep existing aria structure
- Minor visual styling: `text-sm text-slate-400` with `strong` highlights
- No content changes (content is already stub-level)

---

## i18n Keys

New keys needed (add to `uk.json` and `en.json`):
- `zone_streams_toolbar` — "Пошук і фільтри"
- `streams_search_placeholder` — "Пошук потоків або URL"
- `filter_all` — "Усі"
- `filter_recording` — "Записуються"
- `filter_errors` — "З помилками"
- `filter_selected` — "Вибрані"
- `metric_streams_in_profile` — "У профілі"
- `metric_active_recordings` — "Активні"
- `metric_errors` — "Потребує уваги"
- `metric_free_space` — "Вільно"
- `profile_name` — "Профіль"
- `column_status` — "Статус"
- `column_station` — "Станція"
- `column_now_playing` — "Зараз грає"
- `column_bitrate` — "Бітрейт"
- `column_duration` — "Тривалість"
- `column_actions` — "Дії"
- `player_now_playing` — "Зараз грає"
- `player_controls` — "Керування"
- `player_output` — "Вивід"
- `player_prev` — "Попередній потік"
- `player_next` — "Наступний потік"
- `player_mute` — "Вимкнути/увімкнути звук"
- `player_active_recording` — "Активний запис"
- `player_device` — "Пристрій"
- `player_volume` — "Гучність"
- `commands_label` — "Команди"

---

## Risks & Notes

- **`getStreamSegments()` change** (always returns status) may affect `useCompositeList` navigation if it assumes segment count can vary. Verify that adding a permanent "status" segment doesn't break roving focus within a row.
- **ActivityBar width change** affects overall layout; content area shrinks by ~176px. Verify stream table columns still fit.
- **Profile card** is purely static — no click handler, no tab stop. If needed in future (Phase 3D), it becomes interactive.
- **Prev/Next/Mute stubs** in PlayerPanel: buttons are present but `onPress` does nothing. They are NOT disabled (have no `isDisabled` prop) so screen reader users know they exist. Add `aria-describedby` pointing to "буде реалізовано" text.
