# Player Prev/Next Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the player's Previous/Next track buttons so they walk the current playback context (streams or filtered songs), with clamp-at-boundaries, a race guard, and screen-reader-friendly focus handling.

**Architecture:** A pure `computePlaybackNeighbors(source, streams, songs)` function (fully unit-tested) feeds a nanostores `computed` store `$playbackNeighbors`. `PlayerPanel` consumes it via `useStore`, derives `canPrev`/`canNext` (driving both `isDisabled` and the keyboard focus-stop set), and dispatches the existing `playStream`/`playSavedSong` IPC. No backend changes.

**Tech Stack:** React 19, react-aria-components, nanostores, paraglide-js (i18n), Vitest + React Testing Library, Tauri v2.

**Spec:** [docs/superpowers/specs/2026-06-06-player-prev-next-design.md](../specs/2026-06-06-player-prev-next-design.md) · **FRD:** [docs/FRD-player-prev-next.md](../../FRD-player-prev-next.md) · **Branch:** `feat/player-prev-next`

**Gates (run before every commit that touches `src/`):** `pnpm test` and `pnpm vite:build`. (tsc is NOT a gate — paraglide types are untyped; see memory `typecheck-paraglide-gotchas`.)

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/stores/playbackNeighbors.ts` | Pure neighbor logic + `$playbackNeighbors` computed store | Create |
| `src/stores/playbackNeighbors.test.ts` | Unit tests for `computePlaybackNeighbors` | Create |
| `src/components/player/PlayerPanel.tsx` | Wire prev/next: states, focus stops, handler | Modify |
| `src/components/player/PlayerPanel.test.tsx` | Component tests: states, dispatch, race guard, focus | Create |
| `src/i18n/messages/en.json` | Generalize prev/next labels | Modify (lines 324–325) |
| `src/i18n/messages/uk.json` | Generalize prev/next labels | Modify (lines 324–325) |

---

## Task 1: Pure neighbor logic + computed store

**Files:**
- Create: `src/stores/playbackNeighbors.ts`
- Test: `src/stores/playbackNeighbors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/stores/playbackNeighbors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computePlaybackNeighbors } from "./playbackNeighbors";
import type { StreamInfo, PlaybackSource } from "../lib/tauri";
import type { Song } from "../types/song";

const mkStream = (id: string): StreamInfo => ({
  id,
  url: `http://x/${id}`,
  name: id,
  format: "mp3",
  bitrate: 192,
  icyName: null,
  icyGenre: null,
  icyUrl: null,
  ignorelist: [],
  username: null,
  password: null,
  addedAt: "2026-01-01T00:00:00Z",
});

const mkSong = (path: string): Song => ({
  path,
  fileName: path,
  artist: "a",
  title: path,
  album: "",
  genre: "",
  station: "st",
  format: "mp3",
  durationMs: 1000,
  sizeBytes: 1000,
  recordedAt: "2026-01-01T00:00:00Z",
  isComplete: true,
});

const streams = [mkStream("s1"), mkStream("s2"), mkStream("s3")];
const songs = [mkSong("a.mp3"), mkSong("b.mp3"), mkSong("c.mp3")];

const streamSrc = (streamId: string): PlaybackSource => ({ type: "stream", streamId });
const fileSrc = (path: string): PlaybackSource => ({ type: "file", path });

describe("computePlaybackNeighbors — no context", () => {
  it("returns both null when source is null", () => {
    expect(computePlaybackNeighbors(null, streams, songs)).toEqual({ prev: null, next: null });
  });

  it("returns both null for a preview source", () => {
    const preview: PlaybackSource = { type: "preview", url: "http://x", name: "X" };
    expect(computePlaybackNeighbors(preview, streams, songs)).toEqual({ prev: null, next: null });
  });
});

describe("computePlaybackNeighbors — stream context", () => {
  it("returns both neighbors in the middle", () => {
    expect(computePlaybackNeighbors(streamSrc("s2"), streams, songs)).toEqual({
      prev: { kind: "stream", id: "s1" },
      next: { kind: "stream", id: "s3" },
    });
  });

  it("clamps prev to null on the first element", () => {
    expect(computePlaybackNeighbors(streamSrc("s1"), streams, songs)).toEqual({
      prev: null,
      next: { kind: "stream", id: "s2" },
    });
  });

  it("clamps next to null on the last element", () => {
    expect(computePlaybackNeighbors(streamSrc("s3"), streams, songs)).toEqual({
      prev: { kind: "stream", id: "s2" },
      next: null,
    });
  });

  it("returns both null for a single-element context", () => {
    expect(computePlaybackNeighbors(streamSrc("only"), [mkStream("only")], songs)).toEqual({
      prev: null,
      next: null,
    });
  });

  it("returns both null when the anchor stream is not in the list", () => {
    expect(computePlaybackNeighbors(streamSrc("gone"), streams, songs)).toEqual({
      prev: null,
      next: null,
    });
  });
});

describe("computePlaybackNeighbors — file context", () => {
  it("returns both neighbors in the middle", () => {
    expect(computePlaybackNeighbors(fileSrc("b.mp3"), streams, songs)).toEqual({
      prev: { kind: "file", path: "a.mp3" },
      next: { kind: "file", path: "c.mp3" },
    });
  });

  it("clamps prev to null on the first element", () => {
    expect(computePlaybackNeighbors(fileSrc("a.mp3"), streams, songs)).toEqual({
      prev: null,
      next: { kind: "file", path: "b.mp3" },
    });
  });

  it("clamps next to null on the last element", () => {
    expect(computePlaybackNeighbors(fileSrc("c.mp3"), streams, songs)).toEqual({
      prev: { kind: "file", path: "b.mp3" },
      next: null,
    });
  });

  it("returns both null for a single-element context", () => {
    expect(computePlaybackNeighbors(fileSrc("only.mp3"), streams, [mkSong("only.mp3")])).toEqual({
      prev: null,
      next: null,
    });
  });

  it("returns both null when the anchor file was filtered out or deleted", () => {
    expect(computePlaybackNeighbors(fileSrc("gone.mp3"), streams, songs)).toEqual({
      prev: null,
      next: null,
    });
  });

  it("uses the given array order (mirrors $filteredSongs sort/filter)", () => {
    const reordered = [mkSong("c.mp3"), mkSong("a.mp3"), mkSong("b.mp3")];
    expect(computePlaybackNeighbors(fileSrc("a.mp3"), streams, reordered)).toEqual({
      prev: { kind: "file", path: "c.mp3" },
      next: { kind: "file", path: "b.mp3" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/stores/playbackNeighbors.test.ts`
Expected: FAIL — `Failed to resolve import "./playbackNeighbors"` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/stores/playbackNeighbors.ts`:

```ts
import { computed } from "nanostores";
import type { PlaybackSource, StreamInfo } from "../lib/tauri";
import type { Song } from "../types/song";
import { $playerStatus } from "./player";
import { $streams } from "./streams";
import { $filteredSongs } from "./songs";

export type NeighborTarget =
  | { kind: "stream"; id: string }
  | { kind: "file"; path: string };

export interface PlaybackNeighbors {
  prev: NeighborTarget | null;
  next: NeighborTarget | null;
}

const NONE: PlaybackNeighbors = { prev: null, next: null };

/**
 * Compute the previous/next transport targets for the current playback context.
 * Context is the stream list (source.type === "stream") or the filtered songs
 * list (source.type === "file"). Returns null on a side to mean "disabled":
 * no source, preview, anchor not in the list, single element, or a boundary.
 * Pure — order comes entirely from the passed arrays.
 */
export function computePlaybackNeighbors(
  source: PlaybackSource | null,
  streams: StreamInfo[],
  songs: Song[],
): PlaybackNeighbors {
  if (!source) return NONE;

  if (source.type === "stream") {
    const idx = streams.findIndex((s) => s.id === source.streamId);
    if (idx === -1) return NONE;
    return {
      prev: idx > 0 ? { kind: "stream", id: streams[idx - 1].id } : null,
      next: idx < streams.length - 1 ? { kind: "stream", id: streams[idx + 1].id } : null,
    };
  }

  if (source.type === "file") {
    const idx = songs.findIndex((s) => s.path === source.path);
    if (idx === -1) return NONE;
    return {
      prev: idx > 0 ? { kind: "file", path: songs[idx - 1].path } : null,
      next: idx < songs.length - 1 ? { kind: "file", path: songs[idx + 1].path } : null,
    };
  }

  return NONE; // preview
}

/** Live neighbor descriptor for the current player status. */
export const $playbackNeighbors = computed(
  [$playerStatus, $streams, $filteredSongs],
  (status, streams, songs) => computePlaybackNeighbors(status.source, streams, songs),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/stores/playbackNeighbors.test.ts`
Expected: PASS — all 14 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/stores/playbackNeighbors.ts src/stores/playbackNeighbors.test.ts
git commit -m "feat(player): add playback-neighbor logic and store"
```

---

## Task 2: Generalize prev/next i18n labels

**Files:**
- Modify: `src/i18n/messages/en.json:324-325`
- Modify: `src/i18n/messages/uk.json:324-325`

These labels no longer apply to streams only, so they become track-generic (FRD §7.1). Tests do not depend on the label text (they select by `m.player_prev()`/`m.player_next()`), so this task is independent of Task 3.

- [ ] **Step 1: Edit the English labels**

In `src/i18n/messages/en.json`, replace:

```json
  "player_prev": "Previous stream",
  "player_next": "Next stream",
```

with:

```json
  "player_prev": "Previous track",
  "player_next": "Next track",
```

- [ ] **Step 2: Edit the Ukrainian labels**

In `src/i18n/messages/uk.json`, replace:

```json
  "player_prev": "Попередній потік",
  "player_next": "Наступний потік",
```

with:

```json
  "player_prev": "Попередній трек",
  "player_next": "Наступний трек",
```

- [ ] **Step 3: Regenerate paraglide messages + verify the build**

Run: `pnpm vite:build`
Expected: build succeeds; the `@inlang/paraglide-vite` plugin regenerates `src/i18n/paraglide/messages.js` so `m.player_prev()` now returns "Previous track" (default locale).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/uk.json src/i18n/paraglide
git commit -m "i18n(player): generalize prev/next labels to track"
```

---

## Task 3: Wire prev/next in PlayerPanel

**Files:**
- Modify: `src/components/player/PlayerPanel.tsx`
- Test: `src/components/player/PlayerPanel.test.tsx`

### 3a — Write the failing component test

- [ ] **Step 1: Create the test file**

Create `src/components/player/PlayerPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRef } from "react";
import { render, fireEvent } from "@testing-library/react";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import { PlayerPanel } from "./PlayerPanel";
import { $playerStatus } from "../../stores/player";
import { $streams } from "../../stores/streams";
import { $songs, $songsQuery, $songsStation, $songsSort } from "../../stores/songs";
import type { StreamInfo } from "../../lib/tauri";
import type { Song } from "../../types/song";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";

// Stub the Tauri IPC layer — there is no backend in jsdom.
vi.mock("../../lib/tauri", () => ({
  playStream: vi.fn().mockResolvedValue(undefined),
  playSavedSong: vi.fn().mockResolvedValue(undefined),
  setVolume: vi.fn().mockResolvedValue(undefined),
  pausePlayback: vi.fn().mockResolvedValue(undefined),
  resumePlayback: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
}));

// Isolate prev/next logic from the slider children (which mount react-aria sliders).
vi.mock("./VolumeSlider", () => ({ VolumeSlider: () => null }));
vi.mock("./PlaybackPosition", () => ({ PlaybackPosition: () => null }));

const mkStream = (id: string): StreamInfo => ({
  id,
  url: `http://x/${id}`,
  name: id,
  format: "mp3",
  bitrate: 192,
  icyName: null,
  icyGenre: null,
  icyUrl: null,
  ignorelist: [],
  username: null,
  password: null,
  addedAt: "2026-01-01T00:00:00Z",
});

const mkSong = (path: string, title: string): Song => ({
  path,
  fileName: path,
  artist: "a",
  title,
  album: "",
  genre: "",
  station: "st",
  format: "mp3",
  durationMs: 0,
  sizeBytes: 1000,
  recordedAt: "2026-01-01T00:00:00Z",
  isComplete: true,
});

function renderPanel() {
  const ref = createRef<ZoneEntry>();
  return render(<PlayerPanel ref={ref} exitZone={() => {}} />);
}

/** Drive a 3-stream context with the given stream playing. */
function playingStream(streamId: string) {
  $streams.set([mkStream("s1"), mkStream("s2"), mkStream("s3")]);
  $playerStatus.set({
    state: "playing",
    source: { type: "stream", streamId },
    volume: 0.75,
    positionMs: null,
    durationMs: null,
  });
}

/** Drive a 3-file context (title-sorted A,B,C) with the given path playing. */
function playingFile(path: string) {
  $songs.set([mkSong("a.mp3", "A"), mkSong("b.mp3", "B"), mkSong("c.mp3", "C")]);
  $songsSort.set("title");
  $playerStatus.set({
    state: "playing",
    source: { type: "file", path },
    volume: 0.75,
    positionMs: null,
    durationMs: null,
  });
}

beforeEach(() => vi.clearAllMocks());

afterEach(() => {
  $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null });
  $streams.set([]);
  $songs.set([]);
  $songsQuery.set("");
  $songsStation.set(null);
  $songsSort.set("date");
});

describe("PlayerPanel — prev/next enabled states", () => {
  it("disables both when nothing is playing", () => {
    const { getByRole } = renderPanel();
    expect(getByRole("button", { name: m.player_prev() })).toBeDisabled();
    expect(getByRole("button", { name: m.player_next() })).toBeDisabled();
  });

  it("enables both in the middle of a stream context", () => {
    playingStream("s2");
    const { getByRole } = renderPanel();
    expect(getByRole("button", { name: m.player_prev() })).toBeEnabled();
    expect(getByRole("button", { name: m.player_next() })).toBeEnabled();
  });

  it("disables prev on the first stream, next on the last", () => {
    playingStream("s1");
    const first = renderPanel();
    expect(first.getByRole("button", { name: m.player_prev() })).toBeDisabled();
    expect(first.getByRole("button", { name: m.player_next() })).toBeEnabled();
    first.unmount();

    playingStream("s3");
    const last = renderPanel();
    expect(last.getByRole("button", { name: m.player_prev() })).toBeEnabled();
    expect(last.getByRole("button", { name: m.player_next() })).toBeDisabled();
  });
});

describe("PlayerPanel — prev/next dispatch", () => {
  it("starts the next stream via playStream", () => {
    playingStream("s2");
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.player_next() }));
    expect(tauri.playStream).toHaveBeenCalledWith("s3");
  });

  it("starts the previous file via playSavedSong (filtered order)", () => {
    playingFile("b.mp3");
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.player_prev() }));
    expect(tauri.playSavedSong).toHaveBeenCalledWith("a.mp3");
  });
});

describe("PlayerPanel — prev/next race guard", () => {
  it("ignores a second press while a transition is in flight", () => {
    let release: () => void = () => {};
    vi.mocked(tauri.playStream).mockImplementation(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    playingStream("s2");
    const { getByRole } = renderPanel();
    const next = getByRole("button", { name: m.player_next() });
    fireEvent.click(next);
    fireEvent.click(next);
    expect(tauri.playStream).toHaveBeenCalledTimes(1);
    release(); // let the pending promise settle so no unhandled rejection lingers
  });
});

describe("PlayerPanel — boundary focus", () => {
  it("anchors focus to Play/Pause when a skip lands on the last element", () => {
    playingStream("s2"); // next → s3 (last); the Next button will disable
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.player_next() }));
    // While playing, the central control is labelled with the Pause action.
    expect(document.activeElement).toBe(getByRole("button", { name: m.pause() }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/player/PlayerPanel.test.tsx`
Expected: FAIL — the prev/next buttons are still hard-disabled stubs, so the "enabled", "dispatch", and "focus" assertions fail (e.g. `expect(element).toBeEnabled()` receives a disabled button; `playStream`/`playSavedSong` not called).

### 3b — Implement the PlayerPanel changes

- [ ] **Step 3: Add imports**

In `src/components/player/PlayerPanel.tsx`, after the existing `import { $streams, $statuses } from "../../stores/streams";` line, add:

```tsx
import { $filteredSongs } from "../../stores/songs";
import { $playbackNeighbors, computePlaybackNeighbors, type NeighborTarget } from "../../stores/playbackNeighbors";
```

- [ ] **Step 4: Add refs and derived neighbor state**

In the component body, alongside the existing refs (`mutePendingRef`, `playPauseRef`, …), add:

```tsx
const prevRef = useRef<HTMLButtonElement>(null);
const nextRef = useRef<HTMLButtonElement>(null);
const navPendingRef = useRef(false);
```

Then, after the existing derived values (e.g. after the `hasPositionSlider` line), add:

```tsx
const neighbors = useStore($playbackNeighbors);
const canPrev = isActive && neighbors.prev !== null;
const canNext = isActive && neighbors.next !== null;
```

- [ ] **Step 5: Add the skip handler**

Add this `handleSkip` callback near the other handlers (e.g. just before `handlePlayPause`):

```tsx
const handleSkip = useCallback(
  async (target: NeighborTarget | null, direction: "prev" | "next") => {
    if (!target || navPendingRef.current) return;
    navPendingRef.current = true;
    // Predict whether the pressed button will disable after this move. If so,
    // anchor focus to Play/Pause BEFORE the source change collapses the stops
    // set, so usePlayerZoneNav's remap effect doesn't strand focus on Mute.
    // Mid-list (button stays enabled) we leave focus on the pressed skip button
    // so repeated presses keep walking the list.
    const targetSource =
      target.kind === "stream"
        ? ({ type: "stream", streamId: target.id } as const)
        : ({ type: "file", path: target.path } as const);
    const after = computePlaybackNeighbors(targetSource, $streams.get(), $filteredSongs.get());
    const willDisablePressed = direction === "next" ? !after.next : !after.prev;
    if (willDisablePressed) playPauseRef.current?.focus();

    try {
      if (target.kind === "stream") await tauri.playStream(target.id);
      else await tauri.playSavedSong(target.path);
      // No announce here — App.tsx announces "Playing: {name}" on player-status.
    } catch (e) {
      console.error(e);
      announce(m.playback_error(), "assertive");
    } finally {
      navPendingRef.current = false;
    }
  },
  [announce],
);
```

- [ ] **Step 6: Add prev/next to the focus-stop set**

Replace the existing `stops` memo:

```tsx
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

with (prev inserted before playPause; next inserted after stop, before mute — FRD §8.3):

```tsx
const stops = useMemo((): FocusStop[] => [
  { ref: sourceNameRef,                                                enabled: isActive },
  { ref: trackNameRef,                                                 enabled: isActive && hasTrackName },
  { ref: bitrateRowRef,                                                enabled: isActive && isStream },
  { ref: prevRef      as RefObject<HTMLElement | null>,                enabled: canPrev },
  { ref: playPauseRef as RefObject<HTMLElement | null>,                enabled: isActive },
  { ref: stopRef      as RefObject<HTMLElement | null>,                enabled: isActive },
  { ref: nextRef      as RefObject<HTMLElement | null>,                enabled: canNext },
  { ref: muteRef      as RefObject<HTMLElement | null>,                enabled: isActive },
  { ref: positionInputRef as unknown as RefObject<HTMLElement | null>, enabled: isActive && hasPositionSlider },
  { ref: outputDeviceRef,                                              enabled: isActive },
  { ref: volumeInputRef   as unknown as RefObject<HTMLElement | null>, enabled: isActive },
], [isActive, hasTrackName, isStream, hasPositionSlider, canPrev, canNext]);
```

- [ ] **Step 7: Activate the Prev button**

Replace the Prev stub button (currently `aria-label={m.player_prev()}` with `isDisabled={true}` and no `ref`/`onPress`):

```tsx
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
```

with:

```tsx
<Button
  ref={prevRef}
  aria-label={m.player_prev()}
  isDisabled={!canPrev}
  onPress={() => handleSkip(neighbors.prev, "prev")}
  // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
  tabIndex={-1}
  className="w-11 h-11 rounded-[14px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07] hover:border-white/[0.18] focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 forced-colors:border-[ButtonText] forced-colors:disabled:text-[GrayText]"
>
  <SkipBack aria-hidden={true} size={18} />
</Button>
```

- [ ] **Step 8: Activate the Next button**

Replace the Next stub button (currently `aria-label={m.player_next()}` with `isDisabled={true}` and no `ref`/`onPress`):

```tsx
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
```

with:

```tsx
<Button
  ref={nextRef}
  aria-label={m.player_next()}
  isDisabled={!canNext}
  onPress={() => handleSkip(neighbors.next, "next")}
  // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
  tabIndex={-1}
  className="w-11 h-11 rounded-[14px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07] hover:border-white/[0.18] focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 forced-colors:border-[ButtonText] forced-colors:disabled:text-[GrayText]"
>
  <SkipForward aria-hidden={true} size={18} />
</Button>
```

### 3c — Verify and commit

- [ ] **Step 9: Run the component test to verify it passes**

Run: `pnpm test -- src/components/player/PlayerPanel.test.tsx`
Expected: PASS — enabled-states, dispatch, race-guard, and boundary-focus cases all green.

- [ ] **Step 10: Run the full gates**

Run: `pnpm test`
Expected: PASS — full suite green, no regressions.

Run: `pnpm vite:build`
Expected: build succeeds.

- [ ] **Step 11: Commit**

```bash
git add src/components/player/PlayerPanel.tsx src/components/player/PlayerPanel.test.tsx
git commit -m "feat(player): enable prev/next track buttons"
```

---

## Manual verification (NVDA, after Task 3)

Not automatable in jsdom — verify by hand per FRD §11.4 before merge:

- [ ] Arrow-navigate the player zone: enabled prev/next appear in order `prev → play/pause → stop → next → mute`; disabled ones are skipped without breaking the order.
- [ ] During stream playback, Next/Prev move through streams; during file playback, through the visible (sorted/filtered) songs list.
- [ ] Press Next repeatedly mid-list: focus stays on Next. Reach the last track: focus lands on Play/Pause and Next is announced as unavailable.
- [ ] NVDA announces "Playing: {name}" on each skip, with no duplicate announcements.
- [ ] Visible focus ring is present in normal mode and Windows High Contrast.

---

## Self-Review

**Spec coverage** (spec §→task):
- §3 pure core + store → Task 1 ✅
- §4.1–4.3 refs, canPrev/canNext, buttons, focus stops → Task 3 Steps 4,6,7,8 ✅
- §4.4–4.5 handleSkip race guard + boundary focus → Task 3 Step 5 + test 3a ✅
- §4.6 no-change items (announce/volume/profile) → respected (no announce on press; no volume/profile code) ✅
- §5 i18n → Task 2 ✅
- §6.1 pure-logic matrix → Task 1 test ✅
- §6.2 component states/dispatch/race guard → Task 3 test ✅
- §7 gates & footprint → Task 3 Step 10; exactly the 6 files in the table ✅
- §8 acceptance mapping → automated (Tasks 1,3) + manual checklist ✅

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `NeighborTarget` (`kind`/`id`/`path`), `PlaybackNeighbors` (`prev`/`next`), and `computePlaybackNeighbors(source, streams, songs)` signature are identical across Task 1 (definition), Task 3 (`handleSkip` call + import), and both test files. `canPrev`/`canNext` drive both `isDisabled` and focus-stop `enabled`. Store/import paths match the repo (`$filteredSongs` from `stores/songs`, `$streams` from `stores/streams`, `$playerStatus` from `stores/player`).
