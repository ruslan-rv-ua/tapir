# Player Zone Navigation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor PlayerPanel keyboard navigation so the zone is skipped via Tab when stopped, arrow-keys navigate focus stops inside the zone, sliders adjust with Up/Down only, and NVDA always enters focus mode.

**Architecture:** A new `usePlayerZoneNav` hook owns the flat stop list, keyboard dispatch, and `activeIdx` sync. Sliders intercept their own Left/Right/Home/End and call `onNavigate` into the hook. The inner zone wrapper gets `role="application"` for NVDA focus mode while an outer `role="complementary"` preserves the landmark.

**Tech Stack:** React 19, React Aria Components (`SliderThumb.inputRef`), TypeScript, Nanostores

**Spec:** `docs/superpowers/specs/2026-05-13-player-zone-navigation-design.md`

**Verify commands:**
- TypeScript: `cd C:\dev\Tapir && npx tsc --noEmit` (pre-existing paraglide import errors are expected — ignore those)
- No automated unit tests: manual verification against acceptance cases in the spec

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `src/hooks/usePlayerZoneNav.ts` | **Create** | Zone navigation: stop list management, keyboard dispatch, `activeIdx` sync |
| `src/components/player/VolumeSlider.tsx` | **Modify** | Accept `inputRef`/`onNavigate`; intercept Left/Right/Home/End/PageUp/PageDown on `SliderThumb` |
| `src/components/player/PlaybackPosition.tsx` | **Modify** | Accept `inputRef`/`onNavigate`; intercept same keys on file-source `SliderThumb` |
| `src/components/player/PlayerPanel.tsx` | **Modify** | Remove `useRovingFocus` nav; add `role="application"` inner wrapper; build stop list; wire `usePlayerZoneNav` |

`src/hooks/useRovingFocus.ts` and `src/hooks/useZoneNavigation.ts` are **not changed**.

---

## Chunk 1: `usePlayerZoneNav` Hook

### Task 1: Create `src/hooks/usePlayerZoneNav.ts`

**Files:**
- Create: `src/hooks/usePlayerZoneNav.ts`

- [ ] **Step 1.1 — Create the file with the full hook implementation**

Create `src/hooks/usePlayerZoneNav.ts` with the following complete content:

```typescript
import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

export interface FocusStop {
  ref: RefObject<HTMLElement | null>;
  enabled: boolean;
}

/**
 * Manages keyboard navigation for the player zone.
 *
 * - Left/Right arrow: move between enabled stops (clamp, no wrap).
 * - Tab/Shift+Tab: exit zone (calls onExitZone).
 * - Home/End: jump to first/last enabled stop.
 * - Sliders call navigate() via their onNavigate callback instead of bubbling arrow keys.
 * - activeIdx stays in sync via focusin listener (click) and stops-change effect (removal/remap).
 */
export function usePlayerZoneNav(
  appRef: RefObject<HTMLElement | null>,
  stops: FocusStop[],
  onExitZone: (forward: boolean) => void,
): {
  onRootKeyDown: (e: React.KeyboardEvent) => void;
  enterZone: (direction: 'forward' | 'backward') => void;
  navigate: (direction: 'prev' | 'next' | 'first' | 'last') => void;
} {
  const [activeIdx, setActiveIdx] = useState(-1);

  // Ref mirrors — always current, safe to read inside effects/callbacks without stale closures.
  const activeIdxRef = useRef(-1);
  // Identity of the previously-focused stop's RefObject — used for remap/removal detection.
  // IMPORTANT: updated imperatively in focusStop and focusin listener, NOT in a useEffect.
  // A useEffect on [activeIdx, stops] would overwrite it with the NEW list's ref before the
  // stops-change remap effect runs, breaking the identity-based remap logic.
  const prevStopRefRef = useRef<RefObject<HTMLElement | null> | null>(null);

  // Keep activeIdxRef in sync (read by callbacks/effects without re-render).
  useEffect(() => {
    activeIdxRef.current = activeIdx;
  }, [activeIdx]);

  /** Focus a stop by index and record it as active. */
  const focusStop = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= stops.length) return;
      stops[idx].ref.current?.focus();
      setActiveIdx(idx);
      activeIdxRef.current = idx;
      // Update prevStopRefRef imperatively here (before any effects run) so the
      // stops-change effect can reliably identify the previously-focused stop by identity.
      prevStopRefRef.current = stops[idx].ref;
    },
    [stops],
  );

  /**
   * Find the nearest enabled stop.
   * 'first'/'last' scan the full list (ignores `from`).
   * 'next'/'prev' start adjacent to `from` and clamp at the boundary (no wrap).
   * Returns -1 if no enabled stop exists.
   */
  const findEnabled = useCallback(
    (from: number, dir: 'prev' | 'next' | 'first' | 'last'): number => {
      if (dir === 'first') return stops.findIndex((s) => s.enabled);
      if (dir === 'last') {
        for (let i = stops.length - 1; i >= 0; i--) if (stops[i].enabled) return i;
        return -1;
      }
      if (dir === 'next') {
        for (let i = from + 1; i < stops.length; i++) if (stops[i].enabled) return i;
        return from; // already at last enabled stop — clamp
      }
      // prev
      for (let i = from - 1; i >= 0; i--) if (stops[i].enabled) return i;
      return from; // already at first enabled stop — clamp
    },
    [stops],
  );

  /** Enter the zone, focusing the first or last enabled stop. */
  const enterZone = useCallback(
    (direction: 'forward' | 'backward') => {
      const idx =
        direction === 'forward'
          ? findEnabled(0, 'first')
          : findEnabled(stops.length - 1, 'last');
      if (idx < 0) {
        onExitZone(direction === 'forward');
        return;
      }
      focusStop(idx);
    },
    [stops.length, findEnabled, focusStop, onExitZone],
  );

  /**
   * Imperative navigation called by sliders via their onNavigate prop.
   * Maps to the same logic as keyboard handling.
   */
  const navigate = useCallback(
    (direction: 'prev' | 'next' | 'first' | 'last') => {
      const from = activeIdxRef.current < 0 ? 0 : activeIdxRef.current;
      const next = findEnabled(from, direction);
      if (next < 0) return;
      focusStop(next);
    },
    [findEnabled, focusStop],
  );

  /** Handles keydown events bubbled from all elements inside role="application". */
  const onRootKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        onExitZone(!e.shiftKey);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigate('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigate('next');
      } else if (e.key === 'Home') {
        e.preventDefault();
        navigate('first');
      } else if (e.key === 'End') {
        e.preventDefault();
        navigate('last');
      }
    },
    [navigate, onExitZone],
  );

  // Sync activeIdx when focus enters any stop via click or programmatic focus.
  useEffect(() => {
    const root = appRef.current;
    if (!root) return;
    const onFocusIn = (e: FocusEvent) => {
      const idx = stops.findIndex(
        (s) => s.ref.current && s.ref.current.contains(e.target as Node),
      );
      if (idx >= 0) {
        setActiveIdx(idx);
        activeIdxRef.current = idx;
        prevStopRefRef.current = stops[idx].ref;
      }
    };
    root.addEventListener('focusin', onFocusIn);
    return () => root.removeEventListener('focusin', onFocusIn);
  }, [appRef, stops]);

  // When stops change: remap activeIdx if active stop moved; move focus if stop gone/disabled.
  useEffect(() => {
    const prevRef = prevStopRefRef.current;
    if (!prevRef || activeIdxRef.current < 0) return;

    // Search for the same RefObject by identity in the new list.
    const newIdx = stops.findIndex((s) => s.ref === prevRef);
    if (newIdx >= 0 && stops[newIdx].enabled) {
      // Stop still present and enabled — remap index without moving DOM focus.
      setActiveIdx(newIdx);
      activeIdxRef.current = newIdx;
      return;
    }

    // Stop gone or disabled — move focus unconditionally (no document.activeElement check;
    // it may already point to <body> before this effect runs).
    const fromIdx = activeIdxRef.current;
    let target = -1;
    for (let i = fromIdx + 1; i < stops.length; i++) {
      if (stops[i].enabled) { target = i; break; }
    }
    if (target < 0) {
      for (let i = fromIdx - 1; i >= 0; i--) {
        if (stops[i].enabled) { target = i; break; }
      }
    }
    if (target >= 0) {
      focusStop(target);
    } else {
      onExitZone(true);
    }
  // stops identity change is the only trigger; other deps are read via refs to avoid stale closures.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops]);

  return { onRootKeyDown, enterZone, navigate };
}
```

- [ ] **Step 1.2 — Run TypeScript check**

```
cd C:\dev\Tapir && npx tsc --noEmit
```

Expected: No errors from `src/hooks/usePlayerZoneNav.ts`. Pre-existing paraglide import errors elsewhere are fine.

- [ ] **Step 1.3 — Commit**

```bash
git add src/hooks/usePlayerZoneNav.ts
git commit -m "feat(player): add usePlayerZoneNav hook

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 2: Slider Prop Updates

### Task 2: Update `src/components/player/VolumeSlider.tsx`

**Files:**
- Modify: `src/components/player/VolumeSlider.tsx`

**Context:** React Aria's `<SliderThumb>` renders a `<div>` wrapper containing an `<input type="range">`. `SliderThumb.ref` → `HTMLDivElement` (wrapper). `SliderThumb.inputRef` → `HTMLInputElement` (the focusable input). We use `inputRef` to get a ref to the actual input and patch its `tabIndex` to `-1` via a `useEffect` (RAC does not expose an input-level `tabIndex` prop). The `onKeyDown` on `<SliderThumb>` fires on the wrapper div; input key events bubble up to it, making it the correct interception point. `preventDefault()` on a bubbled keydown event still prevents the browser's default action (e.g., range value change) because browsers execute default actions after full event dispatch.

- [ ] **Step 2.1 — Replace `VolumeSlider.tsx` with the updated version**

Replace the entire file content with:

```typescript
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { Slider, SliderThumb, SliderTrack } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $playerStatus } from "../../stores/player";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

interface VolumeSliderProps {
  inputRef?: RefObject<HTMLInputElement | null>;
  onNavigate?: (direction: 'prev' | 'next' | 'first' | 'last') => void;
}

export function VolumeSlider({ inputRef, onNavigate }: VolumeSliderProps) {
  const { volume } = useStore($playerStatus);
  const storePercent = Math.round(volume * 100);
  const [dragPercent, setDragPercent] = useState<number | null>(null);
  const percent = dragPercent ?? storePercent;

  // RAC controls the input's tabIndex internally; patch it via DOM to remove from Tab order.
  useEffect(() => {
    const input = inputRef?.current;
    if (!input) return;
    input.tabIndex = -1;
  }, [inputRef]);

  return (
    <Slider
      aria-label={m.volume()}
      minValue={0}
      maxValue={100}
      value={percent}
      step={1}
      onChange={(v) => setDragPercent(v)}
      onChangeEnd={(v) => {
        setDragPercent(null);
        tauri.setVolume(v / 100).catch(console.error);
      }}
      className="flex items-center gap-2 w-full"
    >
      <SliderTrack className="relative h-2 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/70 pointer-events-none forced-colors:bg-[ButtonText]"
          style={{ width: `${percent}%` }}
          aria-hidden="true"
        />
        <SliderThumb
          inputRef={inputRef}
          aria-valuetext={`${percent}%`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault(); e.stopPropagation();
              onNavigate?.('prev');
            } else if (e.key === 'ArrowRight') {
              e.preventDefault(); e.stopPropagation();
              onNavigate?.('next');
            } else if (e.key === 'Home') {
              e.preventDefault(); e.stopPropagation();
              onNavigate?.('first');
            } else if (e.key === 'End') {
              e.preventDefault(); e.stopPropagation();
              onNavigate?.('last');
            } else if (e.key === 'PageUp' || e.key === 'PageDown') {
              // No-op: block browser/RAC default (spec §4 — PageUp/Down are no-ops on sliders).
              e.preventDefault(); e.stopPropagation();
            }
            // ArrowUp / ArrowDown: pass through to RAC for value adjustment.
          }}
          className="w-3.5 h-3.5 rounded-full bg-white top-1/2 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 forced-colors:bg-[ButtonText]"
        />
      </SliderTrack>
    </Slider>
  );
}
```

- [ ] **Step 2.2 — Run TypeScript check**

```
cd C:\dev\Tapir && npx tsc --noEmit
```

Expected: No new errors from `VolumeSlider.tsx`.

- [ ] **Step 2.3 — Commit**

```bash
git add src/components/player/VolumeSlider.tsx
git commit -m "feat(player): add inputRef/onNavigate props to VolumeSlider

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Update `src/components/player/PlaybackPosition.tsx`

**Files:**
- Modify: `src/components/player/PlaybackPosition.tsx`

**Context:** Only the file-source `<Slider>` branch gets the new props. The live-stream `<ProgressBar>` branch is unchanged. The component already returns `null` when `durationMs === 0` — this is why the stop condition in PlayerPanel must check `(durationMs ?? 0) > 0`.

- [ ] **Step 3.1 — Replace `PlaybackPosition.tsx` with the updated version**

Replace the entire file content with:

```typescript
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { Slider, SliderThumb, SliderTrack, ProgressBar } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $playerStatus } from "../../stores/player";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

interface PlaybackPositionProps {
  inputRef?: RefObject<HTMLInputElement | null>;
  onNavigate?: (direction: 'prev' | 'next' | 'first' | 'last') => void;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return m.time_format_min_sec({ min, sec });
}

function handleSliderKey(
  e: React.KeyboardEvent,
  onNavigate: PlaybackPositionProps['onNavigate'],
): void {
  if (e.key === 'ArrowLeft') {
    e.preventDefault(); e.stopPropagation();
    onNavigate?.('prev');
  } else if (e.key === 'ArrowRight') {
    e.preventDefault(); e.stopPropagation();
    onNavigate?.('next');
  } else if (e.key === 'Home') {
    e.preventDefault(); e.stopPropagation();
    onNavigate?.('first');
  } else if (e.key === 'End') {
    e.preventDefault(); e.stopPropagation();
    onNavigate?.('last');
  } else if (e.key === 'PageUp' || e.key === 'PageDown') {
    e.preventDefault(); e.stopPropagation();
  }
  // ArrowUp / ArrowDown: pass through for value adjustment.
}

export function PlaybackPosition({ inputRef, onNavigate }: PlaybackPositionProps) {
  const { state, source, positionMs, durationMs } = useStore($playerStatus);
  const [dragPos, setDragPos] = useState<number | null>(null);

  // RAC controls the input's tabIndex internally; patch it via DOM to remove from Tab order.
  // No dependency array — must run after every render, because this component conditionally
  // renders the Slider (null when durationMs===0 or stopped). When the slider first appears,
  // inputRef.current changes but [inputRef] would not re-trigger (same ref object).
  useEffect(() => {
    const input = inputRef?.current;
    if (!input) return;
    input.tabIndex = -1;
  });

  if (state === "stopped" || !source) return null;

  if (source.type === "file") {
    const storePos = positionMs ?? 0;
    const dur = durationMs ?? 0;
    if (dur === 0) return null;
    const pos = dragPos ?? storePos;
    return (
      <Slider
        aria-label={m.playback_position()}
        minValue={0}
        maxValue={dur}
        step={5000}
        value={pos}
        onChange={(v) => setDragPos(v)}
        onChangeEnd={(v) => {
          setDragPos(null);
          tauri.seekPlayback(v).catch(console.error);
        }}
        className="flex items-center gap-2 flex-1"
      >
        <SliderTrack className="relative h-2 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-blue-400 pointer-events-none forced-colors:bg-[Highlight]"
            style={{ width: `${Math.min((pos / dur) * 100, 100)}%` }}
            aria-hidden="true"
          />
          <SliderThumb
            inputRef={inputRef}
            aria-valuetext={formatTime(pos)}
            onKeyDown={(e) => handleSliderKey(e, onNavigate)}
            className="w-3 h-3 rounded-full bg-white top-1/2 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 forced-colors:bg-[ButtonText]"
          />
        </SliderTrack>
      </Slider>
    );
  }

  // Live stream — indeterminate progress bar (not a focus stop, unchanged).
  return (
    <ProgressBar
      aria-label={m.live_stream()}
      isIndeterminate
      className="flex-1"
    >
      {() => (
        <div className="h-2 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
          <div className="h-full w-8 rounded bg-blue-400 animate-pulse forced-colors:bg-[Highlight]" />
        </div>
      )}
    </ProgressBar>
  );
}
```

- [ ] **Step 3.2 — Run TypeScript check**

```
cd C:\dev\Tapir && npx tsc --noEmit
```

Expected: No new errors from `PlaybackPosition.tsx`.

- [ ] **Step 3.3 — Commit**

```bash
git add src/components/player/PlaybackPosition.tsx
git commit -m "feat(player): add inputRef/onNavigate props to PlaybackPosition

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 3: PlayerPanel Refactor

### Task 4: Refactor `src/components/player/PlayerPanel.tsx`

**Files:**
- Modify: `src/components/player/PlayerPanel.tsx`

**Overview of changes:**
- **Remove:** `focusFirstIn` helper, `transportRefs`, `onTabBoundary`, `useRovingFocus` call, `handlePositionKeyDown`, `handleVolumeKeyDown`, `positionWrapperRef`, `volumeWrapperRef`, `lastFocusedRef`, `prevRef`, `nextRef`.
- **Add:** `appRef`, `sourceNameRef`, `trackNameRef`, `bitrateRowRef`, `outputDeviceRef`, `positionInputRef`, `volumeInputRef`, `stops` memo, `usePlayerZoneNav`.
- **JSX:** Add inner `<div role="application" className="contents">` wrapper; add `tabIndex={-1}` focus-stop wrappers for text items and output device; set `tabIndex={-1}` statically on all buttons; pass `inputRef`/`onNavigate` to sliders.

**Important layout note:** The outer `<div>` is a CSS grid (`grid-cols-[1.15fr_1.2fr_minmax(200px,0.85fr)]`). The new inner `role="application"` div uses Tailwind `className="contents"` (`display: contents`) so the three `<article>` children remain direct grid items and the visual layout is unaffected. `display: contents` is transparent to CSS layout but the element still exists in the DOM and accessibility tree — `role="application"` is exposed to screen readers correctly.

**Stop list design:** All stops use `isActive` as the base "something is playing" guard. When `isActive` is `false` (stopped), every stop becomes `enabled: false`. The stops-change effect in `usePlayerZoneNav` then finds no enabled stop and calls `onExitZone(true)`. This implements "zone exits when stopped" for mid-play stop events without any special-casing in PlayerPanel.

- [ ] **Step 4.1 — Update imports**

Replace the entire imports block at the top of `PlayerPanel.tsx`:

```typescript
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useMemo,
  useCallback,
} from "react";
import type { RefObject } from "react";
import { Button } from "react-aria-components";
import { Play, Pause, Square, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useStore } from "@nanostores/react";
import { $playerStatus, $muteState } from "../../stores/player";
import { $streams, $statuses } from "../../stores/streams";
import { $settings } from "../../stores/settings";
import { PlaybackPosition } from "./PlaybackPosition";
import { VolumeSlider } from "./VolumeSlider";
import { useAnnounce } from "../../hooks/useAnnounce";
import { usePlayerZoneNav, type FocusStop } from "../../hooks/usePlayerZoneNav";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { formatBitrate } from "../../lib/formatters";
import { LiveBadge } from "./LiveBadge";
import { RecordingBadge } from "./RecordingBadge";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
```

- [ ] **Step 4.2 — Remove old code and add new refs**

Inside the component body, remove:
- The `focusFirstIn` helper function
- `positionWrapperRef`, `volumeWrapperRef`, `lastFocusedRef` declarations
- `prevRef`, `nextRef` declarations
- `transportRefs` useMemo
- `onTabBoundary` useCallback
- The `useRovingFocus(...)` call and its destructuring
- `handlePositionKeyDown` useCallback
- `handleVolumeKeyDown` useCallback

Add these new refs after the existing `muteRef` declaration:

```typescript
const appRef = useRef<HTMLDivElement>(null);
const sourceNameRef = useRef<HTMLDivElement>(null);
const trackNameRef = useRef<HTMLDivElement>(null);
const bitrateRowRef = useRef<HTMLDivElement>(null);
const outputDeviceRef = useRef<HTMLDivElement>(null);
const positionInputRef = useRef<HTMLInputElement>(null);
const volumeInputRef = useRef<HTMLInputElement>(null);
```

Keep: `playerRootRef`, `playPauseRef`, `stopRef`, `muteRef`, `mutePendingRef`.

- [ ] **Step 4.3 — Add derived state and the stop list**

Add after the existing `bitrateDisplay` line. Also add `durationMs` to the `playerStatus` destructuring (currently only `state` and `source` are used from it):

```typescript
const durationMs = playerStatus.durationMs;
const hasTrackName = source?.type === 'stream' && !!currentTrack;
const isStream = source?.type === 'stream';
const hasPositionSlider = source?.type === 'file' && (durationMs ?? 0) > 0;

// isActive is the base guard: when stopped, ALL stops become disabled so the
// stops-change effect in usePlayerZoneNav exits the zone automatically.
const stops = useMemo((): FocusStop[] => [
  { ref: sourceNameRef,                                                enabled: isActive },
  { ref: trackNameRef,                                                 enabled: isActive && hasTrackName },
  { ref: bitrateRowRef,                                                enabled: isActive && isStream },
  { ref: playPauseRef as RefObject<HTMLElement | null>,                enabled: isActive },
  { ref: stopRef      as RefObject<HTMLElement | null>,                enabled: isActive },
  { ref: muteRef      as RefObject<HTMLElement | null>,                enabled: isActive },
  { ref: positionInputRef as unknown as RefObject<HTMLElement | null>, enabled: isActive && hasPositionSlider },
  { ref: outputDeviceRef,                                              enabled: isActive },
  { ref: volumeInputRef   as unknown as RefObject<HTMLElement | null>, enabled: isActive },
], [isActive, hasTrackName, isStream, hasPositionSlider]);
```

**Cast notes:**
- `playPauseRef/stopRef/muteRef` are `RefObject<HTMLButtonElement | null>`. Cast to `RefObject<HTMLElement | null>` — safe (`HTMLButtonElement extends HTMLElement`).
- `positionInputRef/volumeInputRef` are `RefObject<HTMLInputElement | null>`. The `as unknown as` cast is necessary because TypeScript treats mutable generic parameters as invariant. Safe at runtime (`HTMLInputElement extends HTMLElement`).

- [ ] **Step 4.4 — Wire `usePlayerZoneNav` and replace `restoreFocusPlayer`**

Add after the stops memo:

```typescript
const { onRootKeyDown, enterZone, navigate } = usePlayerZoneNav(appRef, stops, exitZone);

const restoreFocusPlayer = useCallback(
  (direction: "forward" | "backward") => {
    announce(m.zone_player(), "polite");
    if (state === "stopped" || !source) {
      exitZone(direction === "forward");
      return;
    }
    enterZone(direction);
  },
  [announce, state, source, exitZone, enterZone],
);
```

The `useImperativeHandle` block is unchanged in structure — it still uses `playerRootRef` and `restoreFocusPlayer`:

```typescript
useImperativeHandle(
  ref,
  () => ({
    id: "player",
    get el() {
      return playerRootRef.current!;
    },
    focus: restoreFocusPlayer,
  }),
  [restoreFocusPlayer],
);
```

- [ ] **Step 4.5 — Update JSX: add `role="application"` inner wrapper**

In the `return (...)`, wrap the three `<article>` panels with a new inner div:

```tsx
return (
  <div
    ref={playerRootRef}
    role="complementary"
    aria-label={m.player_panel_label()}
    data-zone-id="player"
    className="grid grid-cols-[1.15fr_1.2fr_minmax(200px,0.85fr)] gap-4 px-6 py-4 bg-gradient-to-b from-white/[0.03] to-white/[0.01] border-t border-white/[0.08] shrink-0 forced-colors:border-[ButtonText]"
  >
    {/* role="application" forces NVDA into focus mode for the entire player zone.
        className="contents" keeps the three articles as direct CSS grid items. */}
    <div
      role="application"
      aria-label={m.player_panel_label()}
      ref={appRef}
      onKeyDown={onRootKeyDown}
      className="contents"
    >
      {/* ── Panel 1, Panel 2, Panel 3 go here ── */}
    </div>
  </div>
);
```

- [ ] **Step 4.6 — Update Panel 1 ("Now Playing"): add text-stop focus wrappers**

Replace the inner content of Panel 1's `<article>` (the `{!source ? ... : <>...</>}` block):

```tsx
{!source ? (
  <p className="text-sm text-slate-500 italic">{m.player_nothing_playing()}</p>
) : (
  <>
    {/* aria-live covers dynamically changing track info */}
    <div aria-live="polite">
      {source.type === "file" ? (
        <div className="flex items-center gap-2 min-w-0">
          <div
            ref={sourceNameRef}
            tabIndex={-1}
            className="text-base font-bold text-slate-100 truncate flex-1 min-w-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {sourceLabel}
          </div>
          <RecordingBadge />
        </div>
      ) : (
        <div
          ref={sourceNameRef}
          tabIndex={-1}
          className="text-base font-bold text-slate-100 truncate rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {sourceLabel}
        </div>
      )}
      {source.type === "stream" ? (
        currentTrack ? (
          <div
            ref={trackNameRef}
            tabIndex={-1}
            className="text-sm text-slate-400 truncate rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {trackDisplay}
          </div>
        ) : (
          <p className="text-sm text-slate-400 truncate">—</p>
        )
      ) : null}
    </div>
    {source.type === "stream" && (
      <div
        ref={bitrateRowRef}
        tabIndex={-1}
        className="flex items-center gap-2 text-sm text-slate-500 flex-wrap rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <span>{bitrateDisplay}</span>
        <LiveBadge />
      </div>
    )}
  </>
)}
```

- [ ] **Step 4.7 — Update Panel 2 ("Controls"): remove toolbar role/nav, update buttons and position slot**

Replace Panel 2's inner content. Key changes: no `role="toolbar"`, no `onKeyDown={transportKeyDown}`, all buttons get static `tabIndex={-1}`, `prevRef`/`nextRef` removed, position wrapper simplified:

```tsx
<h3 aria-hidden="true" className="text-base font-bold text-slate-100">
  {m.player_controls()}
</h3>
<div className="flex items-center justify-center gap-2">
  {/* Prev (stub, always disabled — not a focus stop) */}
  <Button
    aria-label={m.player_prev()}
    isDisabled={true}
    // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
    tabIndex={-1}
    className="w-11 h-11 rounded-[14px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07] hover:border-white/[0.18] focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 forced-colors:border-[ButtonText] forced-colors:disabled:text-[GrayText]"
  >
    <SkipBack aria-hidden={true} size={18} />
  </Button>

  <Button
    ref={playPauseRef}
    aria-label={isPlaying ? m.pause() : m.play()}
    isDisabled={!isActive}
    onPress={handlePlayPause}
    // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
    tabIndex={-1}
    className="w-[52px] h-[52px] rounded-2xl bg-blue-700 border border-transparent flex items-center justify-center hover:bg-blue-600 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 forced-colors:border-[ButtonText] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:disabled:text-[GrayText]"
  >
    {isPlaying ? <Pause aria-hidden={true} size={20} /> : <Play aria-hidden={true} size={20} />}
  </Button>

  <Button
    ref={stopRef}
    aria-label={m.stop()}
    isDisabled={!isActive}
    onPress={handleStop}
    // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
    tabIndex={-1}
    className="w-11 h-11 rounded-[14px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07] hover:border-white/[0.18] focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 forced-colors:border-[ButtonText] forced-colors:disabled:text-[GrayText]"
  >
    <Square aria-hidden={true} size={18} />
  </Button>

  {/* Next (stub, always disabled — not a focus stop) */}
  <Button
    aria-label={m.player_next()}
    isDisabled={true}
    // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
    tabIndex={-1}
    className="w-11 h-11 rounded-[14px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07] hover:border-white/[0.18] focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 forced-colors:border-[ButtonText] forced-colors:disabled:text-[GrayText]"
  >
    <SkipForward aria-hidden={true} size={18} />
  </Button>

  <Button
    ref={muteRef}
    aria-label={isMuted ? m.player_unmute_action() : m.player_mute_action()}
    aria-pressed={isMuted}
    isDisabled={!isActive}
    onPress={handleMute}
    // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
    tabIndex={-1}
    className="w-11 h-11 rounded-[14px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07] hover:border-white/[0.18] focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 aria-pressed:bg-amber-500/20 aria-pressed:border-amber-400/40 aria-pressed:text-amber-400 forced-colors:border-[ButtonText] forced-colors:disabled:text-[GrayText] forced-colors:aria-pressed:bg-[Highlight] forced-colors:aria-pressed:text-[HighlightText] forced-colors:aria-pressed:border-[Highlight]"
  >
    {isMuted ? <VolumeX aria-hidden={true} size={18} /> : <Volume2 aria-hidden={true} size={18} />}
  </Button>
</div>

<div className="mt-auto">
  <PlaybackPosition inputRef={positionInputRef} onNavigate={navigate} />
</div>
```

- [ ] **Step 4.8 — Update Panel 3 ("Output"): add output-device focus stop, update volume slider**

Replace Panel 3's inner content:

```tsx
<h3 aria-hidden="true" className="text-base font-bold text-slate-100">
  {m.player_output()}
</h3>

{/* Focus stop #8: output device display */}
<div
  ref={outputDeviceRef}
  tabIndex={-1}
  aria-label={`${m.player_device()}: ${settings?.outputDevice ?? "—"}`}
  className="flex items-center justify-between text-sm rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
>
  <span className="text-slate-400" aria-hidden="true">{m.player_device()}</span>
  <strong className="text-slate-200 truncate ml-2" aria-hidden="true">
    {settings?.outputDevice ?? "—"}
  </strong>
</div>

<div className="mt-auto">
  <VolumeSlider inputRef={volumeInputRef} onNavigate={navigate} />
</div>
```

- [ ] **Step 4.9 — Run TypeScript check**

```
cd C:\dev\Tapir && npx tsc --noEmit
```

Expected: No new errors. If TypeScript errors appear for `tabIndex` on `Button`, the `// @ts-expect-error` comments handle those. Fix any other unexpected errors before continuing.

- [ ] **Step 4.10 — Commit**

```bash
git add src/components/player/PlayerPanel.tsx
git commit -m "feat(player): refactor PlayerPanel to use usePlayerZoneNav

- Remove useRovingFocus, three-section Tab nav, positionWrapperRef/volumeWrapperRef
- Add role='application' inner wrapper (NVDA focus mode, display:contents for grid)
- Add tabIndex={-1} focus-stop wrappers for source name, track, bitrate, output device
- Build stops[] memo with isActive as base guard (zone auto-exits when stopped)
- Pass inputRef/onNavigate to PlaybackPosition and VolumeSlider

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Manual Verification Checklist

After all tasks complete, run `just dev` and test against spec acceptance cases:

**Zone skip when stopped:**
- [ ] Tab/Shift+Tab skips player zone when nothing is playing
- [ ] F6 skips player zone when stopped (`restoreFocusPlayer` exits immediately)

**Zone entry when playing:**
- [ ] Tab enters zone at source name (first enabled stop)
- [ ] Shift+Tab enters zone at volume slider (last enabled stop)

**In-zone navigation (stream, playing):**
- [ ] → from source name → track name → bitrate row → Play/Pause → Stop → Mute → output device → volume slider
- [ ] ← reverses the above; stops at edges without wrapping
- [ ] Tab / Shift+Tab at any position exits zone forward / backward

**Sliders:**
- [ ] ↑/↓ on volume slider adjusts volume; ←/→ navigate to adjacent stops
- [ ] ↑/↓ on position slider (file) seeks; ←/→ navigate to adjacent stops
- [ ] PageUp/PageDown on either slider: no-op (value unchanged, no navigation)
- [ ] Home: jumps to source name; End: stays on volume slider

**Mid-play state changes:**
- [ ] Playback stops while focus is on Stop button → focus exits zone forward
- [ ] Track metadata appears mid-play → track name stop added; focus stays on current stop

**Live stream:**
- [ ] Position slider absent from stop list; Mute →→ output device (no slider in between)

**NVDA (manual test with screen reader):**
- [ ] NVDA reads focused element text when navigating with ←/→
- [ ] No virtual cursor browsing inside player zone (application role enforces focus mode)
- [ ] Player zone still discoverable via NVDA landmark navigation (semicolon key)
