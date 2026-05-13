# Player Zone Navigation — Design Spec

**Date:** 2026-05-13  
**Status:** Approved  
**Scope:** Keyboard navigation and accessibility improvements to the player zone (PlayerPanel)

---

## Problem

The player zone currently has several accessibility issues:

1. The zone is reachable via Tab/Shift+Tab even when nothing is playing.
2. Volume and position sliders are reachable via Tab, which is unexpected for screen reader users.
3. Navigation inside the zone mixes Tab (section-to-section) and arrow keys (toolbar), creating an inconsistent model.
4. NVDA may not be in focus mode inside the player zone, causing unreliable key handling.

---

## Goals

1. Skip the player zone entirely via Tab/Shift+Tab when nothing is playing.
2. Remove all sliders from the Tab order.
3. Establish a single, consistent navigation model: Left/Right arrow keys move between focus stops inside the zone; Tab/Shift+Tab exits the zone.
4. Sliders are adjustable with Up/Down arrow keys only. Home/End/PageUp/PageDown do **not** adjust slider values; they perform zone-level navigation (Home → first stop, End → last stop, PageUp/PageDown → no-op).
5. NVDA always enters focus (application) mode when the player zone is focused.

---

## Architecture

### 1. Landmark Preservation + NVDA Focus Mode

The root `<div role="complementary">` is **retained** to preserve the player as a discoverable ARIA landmark. An inner `<div role="application" aria-label={m.player_panel_label()}>` wraps all interactive content.

```html
<div role="complementary" aria-label={m.player_panel_label()} data-zone-id="player">
  <div role="application" aria-label={m.player_panel_label()}>
    <!-- all panels: now-playing, controls, output -->
  </div>
</div>
```

The `role="application"` inner wrapper causes NVDA to automatically engage **application (focus) mode**, ensuring all keystrokes are passed to the web application. The outer `role="complementary"` preserves landmark navigation (NVDA semicolon key).

`data-zone-id="player"` stays on the outer div so `useZoneNavigation` continues to work. `onRootKeyDown` from `usePlayerZoneNav` is attached to the **inner** `role="application"` div.

---

### 2. Zone Skip When Nothing Is Playing

`PlayerPanel.restoreFocusPlayer()` (called via `useImperativeHandle`) checks `state === "stopped"` (or `!source`) as its first action. If the player is stopped, it immediately calls `exitZone(direction === 'forward')` and returns without focusing any element.

Result: Tab and Shift+Tab pass through the player zone transparently when idle.

---

### 3. Focus Stop List

All focus stops are navigated in this fixed order using Left/Right arrow keys. Conditional stops are included only when their condition is met; disabled stops are always skipped.

> **Precondition:** This table applies only when `source !== null && state !== 'stopped'`. When the player is stopped, the zone is transparent to all Tab navigation (§2) and the stop list is effectively empty — it is never consulted.

| # | Element | Included when |
|---|---------|---------------|
| 1 | Source name (stream name or filename) | Always (when something is playing) |
| 2 | Track name ("Artist — Title") | Stream source only, when metadata is present |
| 3 | Bitrate row ("128 kbps LIVE") | Stream source only |
| 4 | Play/Pause button | `isActive` (playing or paused) |
| 5 | Stop button | `isActive` |
| 6 | Mute button | `isActive` |
| 7 | Playback position slider | File source only (not live stream) |
| 8 | Output device display | Always |
| 9 | Volume slider | Always |

**Notes:**
- Prev and Next buttons are always disabled; they are never added to the stop list.
- The live stream `ProgressBar` (indeterminate, non-interactive) is not a focus stop.
- For file sources, stops #2 and #3 are absent. Stop #7 is present.

Text stops (#1, #2, #3, #8) are wrapped in a `<div tabIndex={-1} ref={...}>` so they can receive programmatic focus. NVDA reads their text content when focused (application mode behavior).

---

### 4. `usePlayerZoneNav` Hook

A new hook in `src/hooks/usePlayerZoneNav.ts`.

```typescript
interface FocusStop {
  ref: RefObject<HTMLElement | null>;
  enabled: boolean; // when false, skipped during navigation
}

function usePlayerZoneNav(
  appRef: RefObject<HTMLElement | null>,  // ref to the inner role="application" div
  stops: FocusStop[],
  onExitZone: (forward: boolean) => void
): {
  onRootKeyDown: (e: React.KeyboardEvent) => void;
  enterZone: (direction: 'forward' | 'backward') => void;
  navigate: (forward: boolean) => void;
}
```

**Key behavior:**

| Key | Action |
|-----|--------|
| `ArrowLeft` | Move to previous enabled stop; clamp at first (no wrap); `preventDefault` |
| `ArrowRight` | Move to next enabled stop; clamp at last (no wrap); `preventDefault` |
| `Tab` | `preventDefault` + `stopPropagation`; call `onExitZone(true)` |
| `Shift+Tab` | `preventDefault` + `stopPropagation`; call `onExitZone(false)` |
| `Home` | Move to first enabled stop; `preventDefault` |
| `End` | Move to last enabled stop; `preventDefault` |

**`enterZone(direction)`:** focuses the first enabled stop when `'forward'`, the last when `'backward'`. Called by `restoreFocusPlayer` on zone entry.

**`navigate(forward)`:** imperative navigation exposed for sliders. Sliders call `navigate(true/false)` from the `onNavigate` callback instead of duplicating navigation logic.

**`onRootKeyDown`:** attached to the inner `<div role="application">`. All keydown events bubble here.

The hook tracks `activeIdx` internally (index within the `stops` array).

**`activeIdx` synchronisation rules:**
- **Navigation (←/→):** moves `activeIdx` to the next/previous enabled stop.
- **`enterZone`:** sets `activeIdx` to first or last enabled stop.
- **`navigate(forward)` (called by slider `onNavigate`):** moves `activeIdx` exactly as ←/→ would.
- **Click / programmatic focus:** the hook attaches a native `focusin` listener to `appRef.current` in a `useEffect`. When a `focusin` fires on an element that matches a ref in `stops`, `activeIdx` is updated to that stop's index. This keeps keyboard navigation consistent after a mouse click.
- **Stop-list reorder or insertion** (e.g., track metadata appears mid-playback): after each render, the hook searches the new `stops` array for the ref that was previously focused (`stops[activeIdx].ref`). If found at a new index, `activeIdx` is remapped to that index so subsequent arrow navigation continues from the correct element. If the previously focused ref is no longer in the list, `activeIdx` is clamped to the nearest valid enabled index.
- **Stop-list shrink** (stops removed entirely): if `activeIdx` is out-of-range after removal, clamp to the last enabled index.

**Focus loss when a stop becomes disabled mid-playback** (e.g., playback stops while focus is on the Stop button): On each render, if `stops[activeIdx].enabled` has become `false`, the hook moves focus to the next enabled stop in the forward direction. If no enabled stop exists (player is stopped), exits the zone forward. This check runs in a `useEffect` whenever the `stops` array changes.


---

### 5. Slider Key Override

Both `VolumeSlider` and `PlaybackPosition` accept a new optional prop:

```typescript
onNavigate?: (forward: boolean) => void
```

In the slider's `onKeyDown` handler (on `SliderThumb`):
- `ArrowLeft` or `ArrowRight`: call `onNavigate(key === 'ArrowRight')`, `e.preventDefault()`, and **`e.stopPropagation()`** — `preventDefault()` stops the browser from changing the slider value; `stopPropagation()` prevents the event from bubbling to `onRootKeyDown` on the zone root (which would otherwise trigger a second navigation).
- `ArrowUp` or `ArrowDown`: pass through to React Aria for value adjustment.
- `Home`: call `navigate` to first stop + `e.preventDefault()` + `e.stopPropagation()` (prevents React Aria jumping to min).
- `End`: call `navigate` to last stop + `e.preventDefault()` + `e.stopPropagation()` (prevents React Aria jumping to max).
- `PageUp`, `PageDown`: `e.preventDefault()` + `e.stopPropagation()` — no-op (prevents React Aria large-step behavior, consistent with goal §4).

**Slider tabIndex:** Slider thumbs (`<input type="range">` rendered by `SliderThumb`) must have `tabIndex={-1}` so they are programmatically focusable (required for zone entry) but not reachable via Tab key. React Aria's `<SliderThumb>` accepts a `tabIndex` prop for this purpose.

**Why `onKeyDown` on `SliderThumb`:** Attaching `onKeyDown` directly to the `<SliderThumb>` (inner `<input type="range">`) ensures the handler fires on the event's target, preventing any parent from intercepting the event first and guaranteeing `stopPropagation()` is called before `onRootKeyDown`.

---

## Component Changes

### `PlayerPanel.tsx`

**Remove:**
- `positionWrapperRef`, `volumeWrapperRef`
- `handlePositionKeyDown`, `handleVolumeKeyDown`
- `useRovingFocus` (transport toolbar hook and all its refs)
- `focusFirstIn` helper
- `lastFocusedRef` and the three-section focus restoration logic

**Add:**
- `appRef` — ref to the inner `<div role="application">` element
- `sourceNameRef`, `trackNameRef`, `bitrateRowRef`, `outputDeviceRef` — refs for text focus stops
- `usePlayerZoneNav(appRef, stops, exitZone)` — replaces all current navigation hooks
- Outer `<div role="complementary" aria-label={...} data-zone-id="player">` — landmark, unchanged
- Inner `<div role="application" aria-label={...}>` — wraps all panels; `onRootKeyDown` from the hook attaches here
- `tabIndex={-1}` wrappers around text stops

**`restoreFocusPlayer`** simplified to: if stopped → `exitZone(direction === 'forward')`; else → `enterZone(direction)`.

Button refs (`playPauseRef`, `stopRef`, `muteRef`) remain as refs passed to `usePlayerZoneNav` stop list.

### `VolumeSlider.tsx`

- Add `onNavigate?: (forward: boolean) => void` prop.
- Add `onKeyDown` to `SliderThumb`: intercept ArrowLeft/Right → call `onNavigate` + `preventDefault()` + `stopPropagation()`.
- Add `tabIndex={-1}` to `SliderThumb` to remove it from the Tab order while keeping it programmatically focusable.

### `PlaybackPosition.tsx`

- Add `onNavigate?: (forward: boolean) => void` prop.
- Add `onKeyDown` to `SliderThumb` in the file-source slider: same intercept pattern (`preventDefault` + `stopPropagation` on Left/Right).
- Add `tabIndex={-1}` to `SliderThumb`.
- Live stream `ProgressBar` branch: unchanged (not focusable, not a stop).

---

## Files Affected

| File | Change |
|------|--------|
| `src/hooks/usePlayerZoneNav.ts` | **New** |
| `src/components/player/PlayerPanel.tsx` | **Refactor** navigation |
| `src/components/player/VolumeSlider.tsx` | Add `onNavigate` prop |
| `src/components/player/PlaybackPosition.tsx` | Add `onNavigate` prop |

`useRovingFocus.ts` and `useZoneNavigation.ts` are **not changed**.

---

## Accessibility Considerations

- `role="application"` removes NVDA's virtual cursor from the zone. Users rely entirely on focus-based reading. Each stop must have a clear accessible name (text content or `aria-label`).
- Text stops use their visible text as the accessible name (NVDA reads focused element's text in application mode).
- Bitrate row: if `LiveBadge` renders additional text/icon, ensure it has a meaningful `aria-label` or is `aria-hidden` with the "LIVE" text already present in the surrounding span.
- The `aria-live="polite"` region inside Panel 1 remains for async track name updates.
- NVDA users can use F6/Shift+F6 (zone cycling) as an alternative to Tab for zone navigation — this is unaffected.
- Zone entry announcement (`announce(m.zone_player())`) is retained in `restoreFocusPlayer`.

---

## Acceptance Cases

### Zone entry / skip

| Scenario | Expected |
|----------|----------|
| Player stopped, press Tab | Zone skipped — focus goes to next zone |
| Player stopped, press Shift+Tab | Zone skipped — focus goes to previous zone |
| Player stopped, press F6 | Zone skipped — `restoreFocusPlayer` exits immediately |
| Player playing/paused, press Tab | Focus enters zone at first enabled stop |
| Player playing/paused, press Shift+Tab | Focus enters zone at last enabled stop |

### In-zone navigation (stream source, playing)

| Scenario | Expected |
|----------|----------|
| Arrow Right from source name | → track name |
| Arrow Right from track name | → bitrate row |
| Arrow Right from bitrate row | → Play/Pause button |
| Arrow Left from source name | stays on source name (no wrap) |
| Arrow Right from volume slider | stays on volume slider (no wrap) |
| Tab anywhere in zone | exits zone forward |
| Shift+Tab anywhere in zone | exits zone backward |

### Disabled stops are skipped

| Scenario | Expected |
|----------|----------|
| All transport buttons disabled (nothing playing) | Buttons absent from stop list |
| Playing live stream | Position slider absent from stop list (skip from buttons → output device) |
| Arrow Right from Mute button (live stream) | → output device (position slider skipped) |

### Sliders

| Scenario | Expected |
|----------|----------|
| ArrowLeft on volume slider | navigates to output device stop |
| ArrowRight on volume slider | stays (last stop) |
| ArrowUp on volume slider | volume increases |
| ArrowDown on volume slider | volume decreases |
| ArrowLeft on position slider | navigates to Mute button |
| ArrowRight on position slider | navigates to output device |
| ArrowUp on position slider | seeks forward |
| ArrowDown on position slider | seeks backward |

### Stop-while-focused

| Scenario | Expected |
|----------|----------|
| Playback stops while focus is on Stop button | Focus moves to next enabled stop; if none, exits zone forward |
| Playback stops while focus is on source name text | Source name becomes inactive; since player is now stopped, zone exits forward |

