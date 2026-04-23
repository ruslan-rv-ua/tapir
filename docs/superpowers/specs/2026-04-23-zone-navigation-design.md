# Design Spec: Зонна клавіатурна навігація та композиційні списки

> Status: approved  
> Date: 2026-04-23  
> FRD: docs/FRD-navigation.md  
> Branch: feature/nav

---

## Problem

Tapir's current UI uses React Aria `<Table>`/`<Row>`/`<Cell>` for all lists (streams, browser results, wishlist patterns). These tables do not match the desired keyboard model for a blind user with NVDA:

- Tab cycles through every individual cell, creating hundreds of tab stops.
- There is no zone-level navigation (Tab cycles zones, not controls).
- Multi-part list items cannot be navigated by segment with Left/Right inside a row.
- F6/Shift+F6 desktop shortcut is not supported.

The FRD (docs/FRD-navigation.md) defines the target model: zone-based Tab cycling, composite lists with roving focus, and segment-level Left/Right navigation within each list item.

---

## Approach: Custom hooks + static zone array (Approach B)

Chosen over:
- React Aria FocusScope + ListBox — FRD explicitly rejects listbox (flattens multi-part items) and FocusScope is for modal traps, not zone cycling.
- Nanostores zone registry — over-engineered for a mostly-static zone order; lifecycle complexity without benefit.

---

## Architecture

### 1. Global zone navigation

#### Zone interface

```ts
interface ZoneEntry {
  id: string;
  el: HTMLElement;             // the root DOM element with data-zone-id
  focus(direction: 'forward' | 'backward'): void;
}
```

Each major zone component exposes `{ el, focus }` via `useImperativeHandle` on a `forwardRef`. The zone root element always carries `data-zone-id="<id>"` matching the entry's `id`.

#### Zone types: composite, form, and mixed

Three distinct zone types determine how Tab behaves **inside** the zone:

- **Composite zones** (ActivityBar, toolbars, lists, StatusBar): use roving focus; all elements except the active one have `tabIndex={-1}`. Tab is intercepted in the zone's `onKeyDown` and always exits by calling `onTabOut(forward)`.
- **Form zones** (Browser search/filters, Wishlist controls): contain standard form widgets (Input, Select, ComboBox, etc.). Native Tab order is preserved **within** the zone. Exit at zone boundaries is handled by invisible sentinel elements at the start and end of the zone:
  ```jsx
  <span tabIndex={0} aria-hidden="true"
    onFocus={(e) => { e.preventDefault(); exitZone(forward=false); }} />
  {/* ... form content ... */}
  <span tabIndex={0} aria-hidden="true"
    onFocus={(e) => { e.preventDefault(); exitZone(forward=true); }} />
  ```
  Sentinels use `onFocus` (not `onKeyDown`): when Tab naturally moves focus onto a sentinel, the `onFocus` handler immediately redirects focus to the appropriate adjacent zone.
- **Mixed zones** (Player): contain a small ordered sequence of sub-controls (transport toolbar, position slider, volume slider). Tab moves between sub-controls in sequence; only after the last sub-control does Tab call `onTabOut(true)`. Shift+Tab from the first sub-control calls `onTabOut(false)`. Each sub-control group uses roving focus internally where applicable.

#### F6 handler (global) vs Tab handler (per-zone)

**F6/Shift+F6**: global `window.addEventListener('keydown')` always cycles zones, regardless of zone type.

**Tab/Shift+Tab in composite zones**: each composite zone's root `onKeyDown` detects Tab and calls `onTabOut(forward)` instead of letting native Tab propagate.

**Tab/Shift+Tab in form zones**: native Tab operates within the zone; sentinels on `onFocus` redirect exit at zone boundaries.

**Tab/Shift+Tab in mixed zones (Player)**: Tab moves between the ordered sub-controls; only at the first/last boundary does it call `onTabOut`.

#### Zone order

```ts
// In App.tsx (ref-based, not reactive)
type ZoneOrder = [
  activityBarRef,
  ...screenZoneRefs,   // 1–N zones from the active panel, set via onZonesChange
  playerRef,
  statusBarRef,
]
```

Active panel provides its ordered zone entries via `onZonesChange(zones: ZoneEntry[])`. App.tsx rebuilds the flat `orderedZones: ZoneEntry[]` whenever the active section changes or a panel reports zone changes. Unmounted zones are excluded.

#### Zone detection (for F6 handler)

`element.closest('[data-zone-id]')` returns the innermost zone element (safe with nested panels since the innermost `data-zone-id` wins). Match by `id` string against `orderedZones`.

#### Modal guard

The global F6 handler and per-zone Tab interceptors must not fire when focus is inside a modal surface. Guard condition:

```ts
const isInModal = !!document.activeElement?.closest(
  '[role="dialog"], [role="alertdialog"], [data-modal="true"]'
);
```

`data-modal="true"` covers `CommandPalette` (custom overlay with no dialog role). Both `SettingsDialog` (uses React Aria Dialog, `role="dialog"`) and `ConfirmDialog` (uses `role="alertdialog"`) are covered by the explicit role selectors.

#### Zone announcement

When `zone.focus()` is called, the zone implementation calls `announce(zoneName, 'polite')` only if the zone's natural focus does not already produce sufficient speech. Lists typically produce adequate speech from the focused element's accessible name; StatusBar requires an explicit announcement.

---

### 2. `useCompositeList` hook

Manages 2D roving focus for any list: Up/Down between items, Left/Right between segments within the active item.

#### State

```ts
type SegmentKind = 'summary' | 'track' | 'tech' | 'status' | 'actions' | 'metadata' | 'conditions';

interface CompositeListState {
  activeItemId: string;           // stable item ID, not array index
  activeSegment: SegmentKind;     // 'summary' = summary focus point
}
```

Each item declares its own ordered `segments: SegmentKind[]` array. The hook resolves which segment kinds are available for the active item. Up/Down preserves `activeSegment` kind if the target item has that kind; otherwise falls back to `'summary'`. Left/Right move through the target item's actual `segments` array by position, not by numeric index, so absent optional segments never cause index mismatches.

#### Keyboard behaviour

| Key | Effect |
|-----|--------|
| Up / Down | Move to prev/next item by `activeItemId`; keep `activeSegment` kind if target has it, else `'summary'` |
| Left | Move to prev segment kind in active item's `segments[]`; at first → stay on `'summary'` |
| Right | Move to next segment kind in active item's `segments[]`; at `'summary'` → first segment |
| Home | First item in list |
| End | Last item in list |
| PageUp / PageDown | Move by approx one visual page (container height / item height) |
| Tab / Shift+Tab | Call `onTabOut(forward: boolean)` — hands off to zone manager |
| Enter | `onAction('primary', activeItemId, activeSegment)` |
| Space | `onAction('toggle', activeItemId, activeSegment)` |
| Delete | `onAction('delete', activeItemId, activeSegment)` |
| Shift+F10 / ContextMenu | `onAction('contextMenu', activeItemId, activeSegment)` |

#### DOM pattern

```jsx
<ul role="list" data-zone-id={zoneId} ref={listRef} onKeyDown={handleKeyDown}>
  {items.map((item) => (
    <li key={item.id}>
      {/* summary focus point */}
      <div
        tabIndex={isFocused(item.id, 'summary') ? 0 : -1}
        aria-label={item.summaryLabel}
      />
      {/* segments — only rendered if present in item.segments */}
      {item.segments.map((kind) => (
        <div
          key={kind}
          tabIndex={isFocused(item.id, kind) ? 0 : -1}
          aria-label={item.segmentLabels[kind]}
        >
          {item.segmentContent[kind]}
          {/* action buttons inside action segment get tabIndex={-1} */}
        </div>
      ))}
    </li>
  ))}
</ul>
```

#### Focus memory

`useCompositeList` stores `{ itemId: string, activeSegment: SegmentKind, scrollTop: number }` in a `useRef` (no reactivity needed). When the zone receives `focus('forward')`, it resolves `itemId` against the current items array, restores `scrollTop`, and focuses the remembered segment kind. If `itemId` no longer exists, fall back to the nearest surviving item by original index (or first item). If the remembered segment kind is absent from the restored item, fall back to `'summary'`.

---

### 3. `useRovingFocus` hook

For toolbar-like zones (ActivityBar, toolbar action zones, Player transport controls).

```ts
useRovingFocus(refs: RefObject<HTMLElement>[], axis: 'horizontal' | 'vertical')
```

- Arrow keys in the given axis cycle through `refs`.
- Home/End jump to first/last.
- Tab/Shift+Tab delegate to `onTabOut`.
- Only the active element has `tabIndex={0}`; all others have `tabIndex={-1}`.

---

### 4. Per-zone specifications

#### ActivityBar

- Element: existing `<nav role="navigation" aria-label="Головна навігація">`
- Add `data-zone-id="activity-bar"`
- Apply `useRovingFocus` (vertical axis) to section buttons + settings button
- Section buttons: change from individual tabIndex to roving (currently all independently focusable)
- Disabled sections: use `aria-disabled="true"` on the button instead of React Aria `isDisabled` prop, so they remain in the roving focus sequence and are discoverable by NVDA
- `focus('forward')` → first section; `focus('backward')` → settings button

#### Streams screen zones

Two zones:

1. **Actions zone** (`data-zone-id="streams-actions"`) — toolbar containing CommandPalette button (from SectionHeader), Add Stream button, Stop All button. `useRovingFocus` horizontal.
2. **Streams list zone** (`data-zone-id="streams-list"`) — `<ul>` with `useCompositeList`. Replaces `<StreamTable>`.

**StreamItem segments** — `SegmentKind[]` is dynamic per item:
- Always present: `['track', 'tech', 'actions']`
- Present only when recording or playing: `'status'` is inserted between `'tech'` and `'actions'`

So the resolved `segments[]` for an idle stream: `['track', 'tech', 'actions']`; for a recording/playing stream: `['track', 'tech', 'status', 'actions']`.

| Kind | `aria-label` example |
|------|----------------------|
| `'summary'` | `"Записується, Radio Paradise"` or `"Відтворюється, записується, SomaFM"` |
| `'track'` | `"Трек, Tycho — A Walk"` or `"Трек, —"` |
| `'tech'` | `"256 кбіт/с"` |
| `'status'` | `"Тривалість запису, 1:23:45"` or `"Відтворюється"` |
| `'actions'` | Computed: `"Дії: Відтворити, Почати запис, Меню"` (lists actual button labels) |

Inner buttons in `'actions'` segment have `tabIndex={-1}`. Enter on the `'actions'` segment focuses the first inner button; subsequent Left/Right (if desired) could move between inner buttons, but FRD does not require intra-action navigation — Enter activates the whole segment's primary action.

Empty state: when no streams exist, `StreamsPanel` renders a single **empty-state zone** (`data-zone-id="streams-empty"`) containing a descriptive message and the Add Stream CTA button with `autoFocus`. This zone replaces both the actions zone and list zone in the zone order — the first Tab in Main lands directly on the Add CTA. When streams are added, the zone order switches back to `[streams-actions, streams-list]`. `onZonesChange` is called to update App.tsx.

#### Browser screen zones

1. **Search/Filters zone** (`data-zone-id="browser-search"`) — existing `<SearchForm>` + CommandPalette button. Standard Tab-within-zone (form widgets keep native keyboard model).
2. **Results list zone** (`data-zone-id="browser-results"`) — `<ul>` with `useCompositeList`. Replaces `<StationTable>`.

**StationItem segments:**
1. Summary: station name
2. Segment 0 — Metadata: country, codec, bitrate, popularity
3. Segment 1 — Actions: Add button

After add action: `announce(m.browser_station_added({ name }), 'polite')`. Focus stays on same item.

#### Wishlist/Ignorelist screen zones

1. **Controls zone** (`data-zone-id="wishlist-controls"`) — Tabs (Wishlist/Ignorelist), Add button, CommandPalette button. Tabs use React Aria `<Tabs>` with native Left/Right switching; buttons after tabs reachable via Tab within zone.
2. **Patterns list zone** (`data-zone-id="wishlist-list"`) — `<ul>` with `useCompositeList`. Replaces `<PatternTable>`.

**PatternItem segments** (`SegmentKind[]`): `['conditions', 'actions']`
1. Summary (`'summary'`): pattern string (e.g. `"Tycho*"`)
2. `'conditions'`: format, min bitrate, options. `aria-label` example: `"Умови: MP3, 128 кбіт/с"` or `"Умови: будь-який формат"`
3. `'actions'`: Edit, Delete. `aria-label` computed: `"Дії: Редагувати, Видалити"`; inner buttons `tabIndex={-1}`

Empty state: dedicated empty-state zone (same pattern as Streams empty state).

#### Player zone (mixed zone)

- Element: existing `<PlayerPanel>`
- `data-zone-id="player"`, zone type: **mixed**
- Internal Tab order (sub-controls, sequential):
  1. Transport controls group: `role="toolbar"` + `useRovingFocus` (horizontal, Left/Right). Tab from last transport control → moves to next sub-control (position slider).
  2. Position Slider (only when seekable source): native keyboard (Left/Right, PageUp/PageDown, Home/End). Tab → volume slider.
  3. Volume Slider: native keyboard. Tab → `onTabOut(true)` (exits to StatusBar). Shift+Tab → back to position slider (or transport controls if no slider).
- `focus('forward')` → first transport control; `focus('backward')` → volume slider (or last available sub-control)

#### StatusBar zone

- Element: existing `<footer>`
- Add `data-zone-id="status-bar"`
- Keep an inner `role="status" aria-live="polite"` element for live recording updates (do NOT move this to the footer itself to avoid regressions)
- Add a separate focusable status summary element: `<div tabIndex={0} aria-label={statusSummaryLabel}>` as the focus anchor; this is the entry point for `focus('forward')` and `focus('backward')`
- Segments (Left/Right navigation via `useRovingFocus` horizontal):
  1. Active recordings count (always present)
  2. Free disk space (when available)
  3. Longest recording duration (when recording)
  4. Future indicators (bandwidth, active profile, etc.)
- Home/End: first/last segment
- `focus('forward')` → first segment; `focus('backward')` → last segment
- Announce zone name on entry: `announce(m.zone_status(), 'polite')` (read-only content may not trigger NVDA focus announcement automatically)

---

### 5. Modal surfaces

`SettingsDialog` and `AddStreamDialog`/`AddPatternDialog` use React Aria dialog pattern which provides focus trap. `ConfirmDialog` uses `role="alertdialog"`. `CommandPalette` is a custom overlay.

Changes required:
- `ConfirmDialog`: safe action (Cancel) must receive `autoFocus`. Verify this is already the case.
- All dialogs: `Escape` returns focus to the element that triggered the dialog. Store trigger ref in each dialog.
- `CommandPalette`: add `data-modal="true"` to its root element so the modal guard covers it.
- Modal guard used by all global zone handlers:
  ```ts
  const isInModal = !!document.activeElement?.closest(
    '[role="dialog"], [role="alertdialog"], [data-modal="true"]'
  );
  if (isInModal) return; // do not intercept Tab/F6
  ```

---

### 6. New files and changed files

**New files:**
- `src/hooks/useCompositeList.ts` — 2D roving focus hook
- `src/hooks/useRovingFocus.ts` — 1D toolbar roving focus hook
- `src/hooks/useZoneNavigation.ts` — global Tab/F6 zone cycling logic
- `src/components/streams/StreamList.tsx` — replaces StreamTable
- `src/components/streams/StreamItem.tsx` — replaces StreamRow
- `src/components/browser/StationList.tsx` — replaces StationTable
- `src/components/wishlist/PatternList.tsx` — replaces PatternTable

**Modified files:**
- `src/App.tsx` — zone refs array, global Tab/F6 handler, zone change callback
- `src/components/layout/ActivityBar.tsx` — roving focus, aria-disabled
- `src/components/layout/StatusBar.tsx` — focus anchor, segment navigation
- `src/components/player/PlayerPanel.tsx` — toolbar roving focus, zone integration
- `src/components/streams/StreamsPanel.tsx` — actions zone, zone registration
- `src/components/browser/BrowserPanel.tsx` — zone registration
- `src/components/wishlist/WishlistPanel.tsx` — zone registration
- `src/components/layout/SectionHeader.tsx` — CommandPalette button joins first screen zone

**Deleted files (after replacement):**
- `src/components/streams/StreamTable.tsx`
- `src/components/streams/StreamRow.tsx`
- `src/components/browser/StationTable.tsx`
- `src/components/wishlist/PatternTable.tsx`

---

### 7. i18n keys required

New keys needed (in both `uk.json` and `en.json`):

```
zone_activity_bar           — "Бокова панель"
zone_streams_actions        — "Дії потоку"
zone_streams_list           — "Список потоків"
zone_browser_search         — "Пошук"
zone_browser_results        — "Результати пошуку"
zone_wishlist_controls      — "Список і дії"
zone_wishlist_list          — "Список патернів"
zone_player                 — "Програвач"
zone_status                 — "Статус"
segment_track               — "Трек"
segment_tech                — "Технічна інформація"
segment_status_duration     — "Тривалість запису"
segment_playing             — "Відтворюється"
segment_actions             — "Дії"          (used in computed action segment label)
segment_metadata            — "Метадані"
segment_conditions          — "Умови"
segment_free_disk           — "Вільне місце"
segment_longest_recording   — "Найдовший запис"
```

---

## Acceptance criteria

From FRD §10, verified by:

1. Tab/Shift+Tab and F6/Shift+F6 cycle through ActivityBar → screen zones → Player → StatusBar on all supported screens.
2. No HTML table or ARIA grid/listbox used for streams, browser results, or wishlist patterns.
3. Up/Down/Left/Right/Home/End/PageUp/PageDown work per FRD §7 on all lists.
4. NVDA announces stream summary and segments without context loss.
5. Focus is never lost after section change, dialog close, or item deletion.
6. All modal dialogs have focus trap; Escape returns focus to trigger.
7. Focus indicator visible in normal and Windows High Contrast mode.
8. No duplicate announcements when navigating list items.
