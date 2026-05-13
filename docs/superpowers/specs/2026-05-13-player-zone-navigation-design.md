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
4. Sliders are adjustable with Up/Down arrow keys only.
5. NVDA always enters focus (application) mode when the player zone is focused.

---

## Architecture

### 1. `role="application"` on the Player Root

The root `<div>` of `PlayerPanel` changes from `role="complementary"` to `role="application"`.

This causes NVDA to automatically engage **application (focus) mode** for the entire player zone, ensuring all keystrokes are passed to the web application rather than being interpreted by NVDA's virtual cursor.

The existing `aria-label={m.player_panel_label()}` is retained.

---

### 2. Zone Skip When Nothing Is Playing

`PlayerPanel.restoreFocusPlayer()` (called via `useImperativeHandle`) checks `state === "stopped"` (or `!source`) as its first action. If the player is stopped, it immediately calls `exitZone(direction === 'forward')` and returns without focusing any element.

Result: Tab and Shift+Tab pass through the player zone transparently when idle.

---

### 3. Focus Stop List

All focus stops are navigated in this fixed order using Left/Right arrow keys. Conditional stops are included only when their condition is met; disabled stops are always skipped.

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
  stops: FocusStop[],
  onExitZone: (forward: boolean) => void
): {
  onRootKeyDown: (e: React.KeyboardEvent) => void;
  enterZone: (direction: 'forward' | 'backward') => void;
}
```

**Key behavior:**

| Key | Action |
|-----|--------|
| `ArrowLeft` | Move to previous enabled stop; clamp at first (no wrap) |
| `ArrowRight` | Move to next enabled stop; clamp at last (no wrap) |
| `Tab` | Call `onExitZone(true)` — exit zone forward |
| `Shift+Tab` | Call `onExitZone(false)` — exit zone backward |

**`enterZone(direction)`:** focuses the first enabled stop when `'forward'`, the last when `'backward'`. This is called by `restoreFocusPlayer` on zone entry.

**`onRootKeyDown`:** attached to the root `<div role="application">` of `PlayerPanel`. All keydown events bubble here.

The hook tracks `activeIdx` internally (index within the `stops` array). When `enabled` flags change (e.g., playback stops), the hook re-validates the active index on the next navigation event.

---

### 5. Slider Key Override

Both `VolumeSlider` and `PlaybackPosition` accept a new optional prop:

```typescript
onNavigate?: (forward: boolean) => void
```

In the slider's `onKeyDown` handler (on `SliderThumb`):
- `ArrowLeft` or `ArrowRight`: call `onNavigate(key === 'ArrowRight')` and `e.preventDefault()` — this prevents the browser/React Aria from changing the slider value, and the parent hook handles zone navigation.
- `ArrowUp` or `ArrowDown`: do nothing (pass through to React Aria for value adjustment).

**Why `onKeyDown` on `SliderThumb`:** The `<SliderThumb>` renders an `<input type="range">`. Calling `preventDefault()` on the `keydown` event before the browser applies the default action stops the value from changing on Left/Right.

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
- `sourceNameRef`, `trackNameRef`, `bitrateRowRef`, `outputDeviceRef` — refs for text focus stops
- `usePlayerZoneNav(stops, exitZone)` — replaces all current navigation hooks
- `role="application"` on root `<div>`
- `tabIndex={-1}` wrappers around text stops

**`restoreFocusPlayer`** simplified to: if stopped → `exitZone(direction === 'forward')`; else → `enterZone(direction)`.

Button refs (`playPauseRef`, `stopRef`, `muteRef`) remain as refs passed to `usePlayerZoneNav` stop list.

### `VolumeSlider.tsx`

- Add `onNavigate?: (forward: boolean) => void` prop.
- Add `onKeyDown` to `SliderThumb`: intercept ArrowLeft/Right → call `onNavigate` + `preventDefault()`.

### `PlaybackPosition.tsx`

- Add `onNavigate?: (forward: boolean) => void` prop.
- Add `onKeyDown` to `SliderThumb` in the file-source slider: same intercept pattern.
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
