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
interface ZoneFocusAPI {
  focus(direction: 'forward' | 'backward'): void;
}
```

Each major zone component exposes this via `useImperativeHandle` on a `forwardRef`.

#### Zone order in App.tsx

```ts
const zoneRefs = {
  activityBar: React.createRef<ZoneFocusAPI>(),
  screenZones: [], // populated by active panel
  player: React.createRef<ZoneFocusAPI>(),
  statusBar: React.createRef<ZoneFocusAPI>(),
};
```

Active panel provides its zones via a callback: `onZonesChange(zones: ZoneFocusAPI[])`. App.tsx builds the flat ordered array:

```
[activityBar, ...screenZones, player, statusBar]
```

#### Zone detection

Each zone root element carries `data-zone-id="<id>"`. When Tab or F6 fires:

```ts
const zoneEl = document.activeElement?.closest('[data-zone-id]');
const idx = orderedZones.findIndex(z => z.el === zoneEl);
```

#### Global key handler in App.tsx

```ts
window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' || e.key === 'F6') {
    const idx = currentZoneIndex();
    if (idx === -1) return; // focus outside known zones (modal)
    e.preventDefault();
    const next = e.shiftKey
      ? wrap(idx - 1, orderedZones.length)
      : wrap(idx + 1, orderedZones.length);
    orderedZones[next].focus(e.shiftKey ? 'backward' : 'forward');
  }
});
```

Unmounted zones are filtered out before building `orderedZones`.

#### Zone announcement

When `zone.focus()` is called, the zone implementation calls `announce(zoneName, 'polite')` only if the zone's natural focus does not already produce sufficient speech. Lists typically produce adequate speech from the focused element's accessible name; StatusBar requires an explicit announcement.

---

### 2. `useCompositeList` hook

Manages 2D roving focus for any list: Up/Down between items, Left/Right between segments within the active item.

#### State

```ts
interface CompositeListState {
  activeItem: number;         // index into items array
  activeSegment: number;      // -1 = summary; 0..n = segment index
}
```

#### Keyboard behaviour

| Key | Effect |
|-----|--------|
| Up / Down | Move `activeItem` ± 1; keep `activeSegment` if segment exists in target item, else fall back to -1 |
| Left | Decrease `activeSegment` (min -1 = summary) |
| Right | Increase `activeSegment` (max = segments.length - 1) |
| Home | `activeItem = 0` |
| End | `activeItem = items.length - 1` |
| PageUp / PageDown | Move by approx one visual page (measured by container height / item height) |
| Tab / Shift+Tab | Call `onTabOut(forward: boolean)` — hands off to zone manager |
| Enter | `onAction('primary', activeItem, activeSegment)` |
| Space | `onAction('toggle', activeItem, activeSegment)` |
| Delete | `onAction('delete', activeItem, activeSegment)` |
| Shift+F10 / ContextMenu | `onAction('contextMenu', activeItem, activeSegment)` |

#### DOM pattern

```jsx
<ul role="list" data-zone-id={zoneId} ref={listRef} onKeyDown={handleKeyDown}>
  {items.map((item, i) => (
    <li key={item.id}>
      {/* summary focus point */}
      <div
        tabIndex={isFocused(i, -1) ? 0 : -1}
        aria-label={item.summaryLabel}
        ref={getSummaryRef(i)}
      />
      {/* segments */}
      {item.segments.map((seg, s) => (
        <div
          key={s}
          tabIndex={isFocused(i, s) ? 0 : -1}
          aria-label={seg.label}
        >
          {seg.content}
          {/* action buttons inside segments get tabIndex={-1} */}
        </div>
      ))}
    </li>
  ))}
</ul>
```

#### Focus memory

`useCompositeList` stores `{ activeItem, activeSegment }` in a `useRef` (no reactivity needed). When the zone receives `focus('forward')`, it restores the last active position. If the remembered item no longer exists, it falls back to the nearest available item.

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

**StreamItem segments** (in order):
1. Summary (index -1): recording state + playback state + stream name. `aria-label` example: `"Записується, Radio Paradise"`
2. Segment 0 — Track: current artist/title. `aria-label`: `"Трек, Tycho — A Walk"` or `"Трек, —"`
3. Segment 1 — Tech: bitrate + duration if recording. `aria-label`: `"256 кбіт/с, 1:23:45"` or `"256 кбіт/с"`
4. Segment 2 — Actions: Play/Stop, Record/Stop, context menu. `aria-label`: `"Дії"`; inner buttons have `tabIndex={-1}`.

Empty state: `<div autoFocus>` with CTA button (existing `EmptyState` component). Zone skips list zone if empty.

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

**PatternItem segments:**
1. Summary: pattern string
2. Segment 0 — Conditions: format, min bitrate, options (if applicable)
3. Segment 1 — Actions: Edit, Delete

Empty state: message + Add CTA, similar to streams empty state.

#### Player zone

- Element: existing `<PlayerPanel>`
- `data-zone-id="player"`
- Transport controls group: `role="toolbar"` + `useRovingFocus` (horizontal)
- Position Slider: below transport controls, native keyboard (Left/Right, PageUp/PageDown, Home/End)
- Volume Slider: after position slider
- Tab from last control (volume slider) → calls `onTabOut(true)` → StatusBar
- `focus('forward')` → first transport control; `focus('backward')` → volume slider or last available control

#### StatusBar zone

- Element: existing `<footer role="status">`
- Add `data-zone-id="status-bar"`, `tabIndex={0}` on the footer itself as anchor
- Change `role="status"` to `role="contentinfo"` (live region stays as `aria-live="polite"` on inner element)
- Left/Right: move between status segments (recordings count, duration, future indicators)
- `focus('forward')` → first segment (or footer anchor); `focus('backward')` → last segment
- Announce zone name on entry: `announce(m.zone_status(), 'polite')` (since read-only content may not trigger NVDA focus announcement)

---

### 5. Modal surfaces (no changes to model)

`SettingsDialog`, `AddStreamDialog`, `AddPatternDialog`, `ConfirmDialog` already use React Aria dialog pattern which provides focus trap. Verify:

- `ConfirmDialog`: cancel/safe action receives `autoFocus`
- All dialogs: `Escape` returns focus to trigger element
- No global zone handler fires when focus is within a dialog (guard: check `document.activeElement.closest('[role="dialog"]')`)

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
zone_activity_bar       — "Бокова панель"
zone_streams_actions    — "Дії потоку"
zone_streams_list       — "Список потоків"
zone_browser_search     — "Пошук"
zone_browser_results    — "Результати пошуку"
zone_wishlist_controls  — "Список і дії"
zone_wishlist_list      — "Список патернів"
zone_player             — "Програвач"
zone_status             — "Статус"
segment_track           — "Трек"
segment_tech            — "Технічна інформація"
segment_actions         — "Дії"
segment_metadata        — "Метадані"
segment_conditions      — "Умови"
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
