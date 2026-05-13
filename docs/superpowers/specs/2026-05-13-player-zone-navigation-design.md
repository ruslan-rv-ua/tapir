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
| 7 | Playback position slider | File source only **and** `durationMs > 0` (component returns `null` otherwise) |
| 8 | Output device display | Always |
| 9 | Volume slider | Always |

**Notes:**
- Prev and Next buttons are always disabled; they are never added to the stop list.
- The live stream `ProgressBar` (indeterminate, non-interactive) is not a focus stop.
- For file sources, stops #2 and #3 are absent. Stop #7 is present only once `durationMs` is known — there is a transient window at playback start where it is absent.
- Stop #7's inclusion condition must be derived from whether `PlaybackPosition` would actually render the slider (i.e., `source.type === 'file' && (durationMs ?? 0) > 0`), not merely from source type alone.

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
  navigate: (direction: 'prev' | 'next' | 'first' | 'last') => void;
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

**`navigate(direction)`:** imperative navigation exposed for sliders. Maps directly to the same logic as keyboard handling:
- `'prev'` → same as `ArrowLeft` (move to previous, clamp)
- `'next'` → same as `ArrowRight` (move to next, clamp)
- `'first'` → same as `Home` (move to first enabled stop)
- `'last'` → same as `End` (move to last enabled stop)

Sliders call `navigate(...)` from their `onNavigate` callback instead of duplicating logic.

**`onRootKeyDown`:** attached to the inner `<div role="application">`. All keydown events bubble here.

The hook tracks `activeIdx` internally (index within the `stops` array).

**`activeIdx` synchronisation rules:**
- **Navigation (←/→/Home/End):** updates `activeIdx` and calls `.focus()` on the target element.
- **`enterZone`:** sets `activeIdx` to first or last enabled stop.
- **`navigate(direction)` (called by slider `onNavigate`):** updates `activeIdx` and calls `.focus()` exactly as keyboard handling would.
- **Click / programmatic focus:** the hook attaches a native `focusin` listener to `appRef.current` in a `useEffect`. When a `focusin` fires on an element that matches a ref in `stops`, `activeIdx` is updated to that stop's index. This keeps keyboard navigation consistent after a mouse click.
- **Stop-list reorder or insertion** (e.g., track metadata appears mid-playback): in a `useEffect` on `stops` change, the hook looks up the previously active ref in the new list by identity. If found at a new index, `activeIdx` is remapped. If not found, falls through to the removal rule.
- **Stop-list removal / active stop gone or disabled**: the hook stores the previously-active ref in a `useRef` (updated on every `activeIdx` change). In the `useEffect` on `stops` change, it checks whether that ref is no longer present in the new list OR is `enabled: false`. If so, the hook **unconditionally** moves focus to the nearest enabled stop (forward first, then backward) — without relying on `document.activeElement` (which may already have moved to `<body>` before the effect runs). If no enabled stop exists, calls `onExitZone(true)`.


---

### 5. Slider Key Override

Both `VolumeSlider` and `PlaybackPosition` accept two new optional props:

```typescript
inputRef?: RefObject<HTMLInputElement | null>  // passed as SliderThumb's inputRef prop
onNavigate?: (direction: 'prev' | 'next' | 'first' | 'last') => void
```

**`inputRef`** is the correct way to access the focusable `<input type="range">` inside a React Aria `SliderThumb`. Verified against `react-aria-components` types: `SliderThumb.ref` is `RefAttributes<HTMLDivElement>` (the wrapper div), while `SliderThumb.inputRef` is `RefObject<HTMLInputElement | null>` (the actual input). `inputRef` is passed to `<SliderThumb inputRef={inputRef}>`.

**Tab order exclusion:** React Aria controls the input's `tabIndex` internally. To remove it from the Tab order, the component sets `inputRef.current.tabIndex = -1` in a `useEffect` (after mount and on `inputRef` changes). This directly patches the DOM because RAC does not expose an input-level `tabIndex` prop.

**`onKeyDown`** on `<SliderThumb>` catches key events that originate on the `<input>` and bubble up to the wrapper div. This is the correct attachment point — it fires after the input's own handlers and before zone root's `onRootKeyDown`.

In the slider's `onKeyDown` handler (on `SliderThumb`):
- `ArrowLeft`: call `onNavigate('prev')`, `e.preventDefault()`, `e.stopPropagation()`.
- `ArrowRight`: call `onNavigate('next')`, `e.preventDefault()`, `e.stopPropagation()`.
- `ArrowUp` or `ArrowDown`: pass through to React Aria for value adjustment.
- `Home`: call `onNavigate('first')`, `e.preventDefault()`, `e.stopPropagation()` (prevents React Aria jumping to min).
- `End`: call `onNavigate('last')`, `e.preventDefault()`, `e.stopPropagation()` (prevents React Aria jumping to max).
- `PageUp`, `PageDown`: `e.preventDefault()` + `e.stopPropagation()` — no-op (consistent with goal §4).

**Slider tabIndex and ref integration with React Aria:**
React Aria's `<SliderThumb>` renders a wrapper `<div>` that contains an `<input type="range">`. Verified against `react-aria-components` types:
- `<SliderThumb>` has `RefAttributes<HTMLDivElement>` — `ref` points to the wrapper div, NOT the input.
- `SliderThumb.inputRef?: RefObject<HTMLInputElement | null>` — points to the actual `<input type="range">`.

Therefore:
- Use `<SliderThumb inputRef={inputRef}>` to register the focusable input in the stop list.
- To remove the input from the Tab order: set `inputRef.current.tabIndex = -1` in a `useEffect` (after mount and when `inputRef` changes). This is a direct DOM patch because RAC does not expose an input-level `tabIndex` prop.
- `onKeyDown` on `<SliderThumb>` fires on the wrapper div; events from the inner `<input>` bubble up to it, so this is the correct attachment point for key interception.

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
- `positionInputRef`, `volumeInputRef` — `RefObject<HTMLInputElement | null>` passed to `PlaybackPosition` and `VolumeSlider` as `inputRef`; these point to the actual `<input type="range">` elements and are registered in the stop list
- `usePlayerZoneNav(appRef, stops, exitZone)` — replaces all current navigation hooks
- Outer `<div role="complementary" aria-label={...} data-zone-id="player">` — landmark, unchanged
- Inner `<div role="application" aria-label={...} ref={appRef}>` — wraps all panels; `onRootKeyDown` from the hook attaches here
- `tabIndex={-1}` wrappers around text stops

**`restoreFocusPlayer`** simplified to: if stopped → `exitZone(direction === 'forward')`; else → `enterZone(direction)`.

**Button tabIndex policy:** After removing `useRovingFocus`, all transport buttons (`playPauseRef`, `stopRef`, `muteRef`) get static `tabIndex={-1}`. They are never reachable via Tab — the zone root's `onRootKeyDown` intercepts Tab and exits the zone, and ←/→ arrows handle all in-zone navigation. This replaces the roving-tabindex pattern from `useRovingFocus`.

Button refs (`playPauseRef`, `stopRef`, `muteRef`) remain as refs passed to `usePlayerZoneNav` stop list with `enabled: isActive`.

### `VolumeSlider.tsx`

- Add `inputRef?: RefObject<HTMLInputElement | null>` and `onNavigate?: (direction: 'prev' | 'next' | 'first' | 'last') => void` props.
- Add `onKeyDown` to `SliderThumb`: intercept Left/Right/Home/End/PageUp/PageDown (all with `preventDefault` + `stopPropagation`); pass Up/Down through.
- Forward `inputRef` to `<SliderThumb inputRef={inputRef}>`.
- Add a `useEffect` that sets `inputRef.current.tabIndex = -1` after mount and on `inputRef` changes (removes input from Tab order without using an unsupported prop).

### `PlaybackPosition.tsx`

- Add `inputRef?: RefObject<HTMLInputElement | null>` and `onNavigate?: (direction: 'prev' | 'next' | 'first' | 'last') => void` props.
- Add `onKeyDown` to `SliderThumb` in the file-source slider: same intercept pattern.
- Forward `inputRef` to `<SliderThumb inputRef={inputRef}>`. Same `useEffect` for `tabIndex = -1`.
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
| Playing file, `durationMs` not yet known (`=== 0`) | Position slider absent from stop list; keyboard nav skips from buttons to output device |
| Playing file, `durationMs` becomes known mid-navigation | Position slider added to stop list; `activeIdx` remapped; focus stays on current stop |

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

