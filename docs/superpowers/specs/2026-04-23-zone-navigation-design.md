# Design Spec: Зонна клавіатурна навігація та композиційні списки

> Status: approved  
> Date: 2026-04-23  
> FRD: docs/FRD-navigation.md  
> Branch: feature/nav

---

## Problem

Tapir's current UI uses React Aria `<Table>`/`<Row>`/`<Cell>` for all lists (streams, browser results, wishlist patterns). These tables do not match the desired keyboard model for a blind user with NVDA:

- React Aria Table follows the ARIA `grid` pattern, which relies on arrow-key navigation inside a composite widget. This does not match Tapir's required **segment-based list model** (Left/Right navigate between named segments within an item).
- There is no zone-level navigation (Tab cycles zones, not controls).
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
- **Form zones** (Browser search/filters, Wishlist controls): contain standard form widgets (Input, Select, ComboBox, etc.). Native Tab order is preserved **within** the zone. Exit at zone boundaries is detected by adding `onKeyDown` handlers **to the first and last real focusable elements** in the zone (no hidden sentinel nodes):
  - **First element** `onKeyDown`: if `Shift+Tab` → `preventDefault(); exitZone(forward=false)`
  - **Last element** `onKeyDown`: if `Tab` (no Shift) → `preventDefault(); exitZone(forward=true)`
  This keeps all focus targets real, visible, and accessible. A utility `useFocusBoundary(containerRef)` attaches these handlers. Since form zone contents can change dynamically (e.g. Browser filters async-loaded after `loadFilters()`), the hook must **re-discover** first/last tabbable elements after every render and DOM change. API:

  ```ts
  const { refreshBoundary } = useFocusBoundary(containerRef, exitZone)
  // caller must call refreshBoundary() after async DOM changes:
  useEffect(() => { refreshBoundary() }, [filters, activeTab])
  ```
  Hidden, `disabled`, and portal-based elements must never become boundary targets.
- **Mixed zones** (Player): contain a small ordered sequence of sub-controls (transport toolbar, position slider, volume slider). Tab moves between sub-controls in sequence; only after the last sub-control does Tab call `onTabOut(true)`. Shift+Tab from the first sub-control calls `onTabOut(false)`. Each sub-control group uses roving focus internally where applicable.

#### F6 handler (global) vs Tab handler (per-zone)

**F6/Shift+F6**: global `window.addEventListener('keydown')` always cycles zones, regardless of zone type.

**Tab/Shift+Tab in composite zones**: each composite zone's root `onKeyDown` detects Tab and calls `onTabOut(forward)` instead of letting native Tab propagate.

**Tab/Shift+Tab in form zones**: native Tab operates within the zone; the first and last real focusable elements detect boundary escape via `onKeyDown` and call `exitZone`.

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

**On active-section change**: after the new screen's zones register (via `onZonesChange`), App must call `focus('forward')` on the first active-screen zone (or the empty-state CTA zone if the list is empty). This ensures focus moves into the new screen rather than remaining in ActivityBar.

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
| Space | `onAction('toggle', activeItemId, activeSegment)` — **exception: on `'actions'` segment, Space fires `'primary'` (not `'toggle'`), since actions segments have no toggle semantics** |
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

**All zone types** must implement focus memory per FRD §6.3 — re-entering a zone via Tab/F6 restores the user's last position. First/last are only the fallback when no prior position exists or it has been removed.

**Composite/roving zones** (ActivityBar, toolbars, StatusBar): the roving focus index naturally provides memory — the element with `tabIndex={0}` IS the stored position. No extra state needed. `focus('forward')` restores to that element; `focus('backward')` restores to that element too (unless the zone explicitly maps 'backward' to the last item, which only makes sense for linear zones with a meaningful "end").

**List zones** (`useCompositeList`): stores `{ itemId: string, prevIndex: number, activeSegment: SegmentKind, scrollTop: number }` in a `useRef` (no reactivity needed). When the zone receives `focus('forward')`:
1. Try to find `itemId` in current items array → if found, restore segment and scrollTop.
2. If not found, use `prevIndex` clamped to `[0, items.length - 1]` as the fallback item.
3. If `activeSegment` kind is absent from the restored item's segments, fall back to `'summary'`.
`prevIndex` is updated every time `activeItemId` changes so it always reflects the last known position.

**Live reconciliation** (item removal while list has focus): `useCompositeList` watches for changes to the `items` array via `useEffect`. If the `activeItemId` no longer exists and the list still has focus (check `listRef.current.contains(document.activeElement)`):
- If items remain: immediately move focus to the item at `prevIndex` clamped to `[0, items.length - 1]`.
- If the list becomes empty: the parent panel replaces the list with the empty-state zone (`onZonesChange`) and calls `focus('forward')` on that zone so NVDA announces the CTA.

**Form zones** (Browser search, Wishlist controls): store last focused `HTMLElement` in a `useRef<HTMLElement | null>`. On every `focus` or `focusin` event within the zone, update the ref. `focus('forward')` and `focus('backward')` restore to the stored element (call `.focus()` on it) if it still exists and is still within the zone; fall back to first/last focusable respectively.

**Mixed zone** (Player): track the last active sub-control (transport button index, or "position slider", or "volume slider") in a `useRef`. Restore on re-entry.

**Empty-state zones**: 2 focusable elements (CommandPalette trigger + CTA). Store last focused control in the roving index (same as other composite zones). `focus('forward')` and `focus('backward')` both restore the last remembered control; fallback to CTA for 'forward' and CommandPalette trigger for 'backward' when no memory exists.

---

### 3. `useRovingFocus` hook

For toolbar-like zones (ActivityBar, toolbar action zones).

```ts
useRovingFocus(
  refs: RefObject<HTMLElement>[],
  axis: 'horizontal' | 'vertical',
  options:
    | { mode: 'composite-exit'; onTabOut: (forward: boolean) => void }
    | { mode: 'mixed-boundary-handoff'; onTabBoundary: (forward: boolean) => void }
)
```

Two mutually exclusive modes prevent ambiguity:

- **`composite-exit`** (ActivityBar, all toolbars): Tab or Shift+Tab **at any element** immediately calls `onTabOut(forward)` and stops propagation. This ensures Tab never remains inside a composite zone — the active roving element is exited regardless of position.
- **`mixed-boundary-handoff`** (Player transport controls only): Tab at the **last** element calls `onTabBoundary(true)`; Shift+Tab at the **first** element calls `onTabBoundary(false)`. Used exclusively to hand off to the next sub-control (position slider). Tab from non-boundary elements stays within the transport group.

- Arrow keys in the given axis move between `refs`.
- Home/End jump to first/last.
- Only the active element has `tabIndex={0}`; all others have `tabIndex={-1}`.

Player transport controls use `mode: 'mixed-boundary-handoff'`, NOT `composite-exit`, so Tab from the last transport button moves to the position slider (not out of the Player zone).

---

### 4. Per-zone specifications

#### ActivityBar

- Element: existing `<nav role="navigation" aria-label="Головна навігація">`
- Add `data-zone-id="activity-bar"`
- Apply `useRovingFocus` (vertical axis) to section buttons + settings button
- Section buttons: change from individual tabIndex to roving (currently all independently focusable)
- Disabled sections: use `aria-disabled="true"` on the button instead of React Aria `isDisabled` prop, so they remain in the roving focus sequence and are discoverable by NVDA. **All activation handlers (click, Enter, Space) on disabled items must be no-ops** — check `aria-disabled="true"` at the top of each handler and return early. This ensures they are discoverable but cannot switch sections.
- `focus('forward')` → restore last remembered roving element (roving index is memory); fallback: first section button. `focus('backward')` → restore last remembered roving element; fallback: settings button.

#### Streams screen zones

Two zones:

1. **Actions zone** (`data-zone-id="streams-actions"`) — toolbar containing **CommandPalette trigger button** (rendered by `StreamsPanel` directly, not `SectionHeader`), Add Stream button, Stop All button. `useRovingFocus` horizontal with `mode: 'composite-exit'`. `focus('forward'|'backward')` → restore last remembered roving element; fallback: first button.
2. **Streams list zone** (`data-zone-id="streams-list"`) — `<ul>` with `useCompositeList`. Replaces `<StreamTable>`.

**StreamItem segments** — `SegmentKind[]` is dynamic per item:
- Always present: `['track', 'tech', 'actions']`
- Present only when recording or playing: `'status'` is inserted between `'tech'` and `'actions'`

So the resolved `segments[]` for an idle stream: `['track', 'tech', 'actions']`; for a recording/playing stream: `['track', 'tech', 'status', 'actions']`.

| Kind | `aria-label` example |
|------|----------------------|
| `'summary'` | `"Записується, Radio Paradise"` or `"Відтворюється, записується, SomaFM"` |
| `'track'` | `"Трек, Tycho — A Walk"` or `"Трек, —"` |
| `'tech'` | `"Бітрейт, 256 кбіт/с"` |
| `'status'` | `"Статус, Тривалість запису, 1:23:45"` or `"Статус, Відтворюється"` |
| `'actions'` | Computed: `"Дії: Відтворити, Почати запис, Меню"` (lists actual button labels) |

Inner buttons in `'actions'` segment have `tabIndex={-1}`. **Enter** on the `'actions'` segment fires the primary button's click handler directly (e.g. Record for a stream, Add for a station). Context menu / secondary actions are always accessible via **Shift+F10** / ContextMenu key → `onAction('contextMenu', ...)`. There is no intermediate "focus first button" step — Enter always activates, not navigates.

Empty state: when no streams exist, `StreamsPanel` renders a single **empty-state zone** (`data-zone-id="streams-empty"`) that includes both the **CommandPalette trigger button** (rendered by `StreamsPanel`, not `SectionHeader`) and the Add Stream CTA button with `autoFocus`. Zone type: **composite** (roving focus, Tab always exits). The CTA carries `aria-describedby` pointing to a hidden `<span>` with the empty-state description (e.g. `"Список потоків порожній. Натисніть Enter, щоб додати перший потік."`) so NVDA announces context when focus lands. No additional live announcement on mount — the CTA focus + `aria-describedby` is the one announcement path; a second live announce would cause NVDA to read twice. `focus('forward')` → Add Stream CTA button. `focus('backward')` → CommandPalette trigger button (or Add CTA if trigger is absent). This zone replaces both `streams-actions` and `streams-list` in the zone order; `onZonesChange` updates App.tsx.

#### Browser screen zones

1. **Search/Filters zone** (`data-zone-id="browser-search"`) — form zone — existing `<SearchForm>` + **CommandPalette trigger button** (rendered by `BrowserPanel`, not `SectionHeader`). Standard Tab-within-zone (form widgets keep native keyboard model). Exit handled by `useFocusBoundary` (first/last real focusable `onKeyDown`; caller must call `refreshBoundary()` after filter async-load). `focus('forward'|'backward')` → restore last remembered focused element (form zone memory); fallback: search input for 'forward', last filter/button for 'backward'.
2. **Results list zone** (`data-zone-id="browser-results"`) — composite zone — `<ul>` with `useCompositeList`. Replaces `<StationTable>`.

**StationItem segments** (`SegmentKind[]`): `['metadata', 'actions']`
1. Summary (`'summary'`): station name
2. `'metadata'`: country, codec, bitrate, popularity. `aria-label` example: `"Метадані: Ukraine, MP3, 256 кбіт/с, 15000 слухачів"`
3. `'actions'`: Add button. `aria-label` computed: `"Дії: Додати"` or `"Дії: Вже додано"`

After add action: `announce(m.browser_station_added({ name }), 'polite')`. Focus stays on same item.

#### Wishlist/Ignorelist screen zones

1. **Controls zone** (`data-zone-id="wishlist-controls"`) — form zone — Tabs (Wishlist/Ignorelist), Add button, **CommandPalette trigger button** (rendered by `WishlistPanel`, not `SectionHeader`). Tabs use React Aria `<Tabs>` with native Left/Right switching; buttons after tabs reachable via Tab within zone. Exit handled by `useFocusBoundary` (first/last real focusable `onKeyDown`). `focus('forward'|'backward')` → restore last remembered focused element (form zone memory); fallback: first focusable (Wishlist tab) for 'forward', last focusable (Add or last button) for 'backward'.
2. **Patterns list zone** (`data-zone-id="wishlist-list"`) — `<ul>` with `useCompositeList`. Replaces `<PatternTable>`.

**PatternItem segments** (`SegmentKind[]`): `['conditions', 'actions']`
1. Summary (`'summary'`): pattern string (e.g. `"Tycho*"`)
2. `'conditions'`: format, min bitrate, options. `aria-label` example: `"Умови: MP3, 128 кбіт/с"` or `"Умови: будь-який формат"`
3. `'actions'`: Edit, Delete. `aria-label` computed: `"Дії: Редагувати, Видалити"`; inner buttons `tabIndex={-1}`

Empty state: dedicated empty-state zone (same pattern as Streams empty state — composite zone type, CTA with `autoFocus`, `aria-describedby` pointing to empty-state description (no additional live announce), CommandPalette trigger included, `focus('forward')` → CTA, `focus('backward')` → CommandPalette trigger).

#### Player zone (mixed zone)

- Element: existing `<PlayerPanel>`
- `data-zone-id="player"`, zone type: **mixed**
- Internal Tab order (sub-controls, sequential):
  1. Transport controls group: `role="toolbar"` + `useRovingFocus` (horizontal, Left/Right). Tab from last transport control → moves to next sub-control (position slider).
  2. Position Slider (only when seekable source): native keyboard (Left/Right, PageUp/PageDown, Home/End). Tab → volume slider.
  3. Volume Slider: native keyboard. Tab → `onTabOut(true)` (exits to StatusBar). Shift+Tab → back to position slider (or transport controls if no slider).
- `focus('forward')` → restore last sub-control (Player mixed zone memory); fallback: first transport control. `focus('backward')` → restore last sub-control; fallback: volume slider (or last available sub-control).

#### StatusBar zone

- Element: existing `<footer>`
- Add `data-zone-id="status-bar"`, zone type: **composite** (roving focus, Left/Right)
- Keep an inner `role="status" aria-live="polite"` element (invisible) for live recording updates — do NOT remove this to avoid NVDA regressions
- The focusable elements in this zone are the status segments themselves (no extra wrapper anchor):
  1. Recordings count — always present, `tabIndex={0}` by default (first in roving order)
  2. Free disk space — when data available
  3. Longest recording duration — when recording active
  4. Future indicators (bandwidth, active profile, etc.)
- Each segment: `<div tabIndex={isActive ? 0 : -1} aria-label={...}>` with `role="status"` omitted (the dedicated live region handles announcements separately)
- If only one segment is present, it still gets `tabIndex={0}` and Left/Right have no effect
- Home/End: first/last segment
- `focus('forward')` → restore last remembered segment (roving index); fallback: first segment (recordings count). `focus('backward')` → restore last remembered segment; fallback: last present segment.
- On entry: `announce(m.zone_status(), 'polite')` since read-only content may not trigger NVDA automatically

---

### 5. Modal surfaces

`SettingsDialog` and `AddStreamDialog`/`AddPatternDialog` use React Aria dialog pattern which provides focus trap. `ConfirmDialog` uses `role="alertdialog"`. `CommandPalette` is a custom overlay.

Changes required:
- `ConfirmDialog`: safe action (Cancel) must receive `autoFocus`. Verify this is already the case.
- All dialogs + CommandPalette: before opening, store the current `document.activeElement` ref. On `Escape`/close, restore focus to that element **if it is still connected to the DOM**. Exception: if the dialog was a destructive confirm (delete item), the opener may no longer exist. In that case, after the deletion completes, call `focus('forward')` on the affected list zone — the list's focus memory will resolve to the nearest surviving sibling using `prevIndex`.
- `CommandPalette`: requires `role="dialog"`, `aria-modal="true"`, and `aria-label="Command Palette"` (or i18n equivalent `m.command_palette_label()`) on its root element so NVDA announces the modal context and its name. Also add `data-modal="true"` as a **technical selector** for the modal guard (`data-modal` is a supplemental attribute only; `role="dialog"` is the primary ARIA semantic). Implement a focus trap (`<FocusScope contain restoreFocus>` or equivalent). On open, focus the search input. On close, restore opener's focus.

  ```tsx
  // CommandPalette root
  <div
    role="dialog"
    aria-modal="true"
    aria-label={m.command_palette_label()}
    data-modal="true"
  >
    ...
  </div>
  ```
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
- `src/hooks/useRovingFocus.ts` — 1D toolbar roving focus hook (`mode: 'composite-exit' | 'mixed-boundary-handoff'`)
- `src/hooks/useZoneNavigation.ts` — global Tab/F6 zone cycling logic
- `src/hooks/useFocusBoundary.ts` — form zone Tab-exit boundary hook with dynamic refresh
- `src/components/streams/StreamList.tsx` — replaces StreamTable
- `src/components/streams/StreamItem.tsx` — replaces StreamRow
- `src/components/browser/StationList.tsx` — replaces StationTable
- `src/components/wishlist/PatternList.tsx` — replaces PatternTable

**Modified files:**
- `src/App.tsx` — zone refs array, global Tab/F6 handler, zone change callback
- `src/components/layout/ActivityBar.tsx` — roving focus, aria-disabled
- `src/components/layout/StatusBar.tsx` — focus anchor, segment navigation
- `src/components/player/PlayerPanel.tsx` — toolbar roving focus, zone integration
- `src/components/streams/StreamsPanel.tsx` — actions zone, zone registration, owns CommandPalette trigger
- `src/components/browser/BrowserPanel.tsx` — zone registration, owns CommandPalette trigger
- `src/components/wishlist/WishlistPanel.tsx` — zone registration, owns CommandPalette trigger
- `src/components/layout/SectionHeader.tsx` — remove CommandPalette trigger (moved to panels); keep title + settings button only
- `src/components/common/CommandPalette.tsx` — add `role="dialog"`, `aria-modal="true"`, `aria-label`, focus trap

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
