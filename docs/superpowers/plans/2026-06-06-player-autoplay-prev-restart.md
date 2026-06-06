# Autoplay-next, Prev-restart & Transport Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional autoplay-next on natural track end and an optional "Previous restarts current track past N seconds" behavior, unifying prev/next/auto-advance behind one pure transport-policy function.

**Architecture:** The Rust engine emits a new `player-ended { path }` event on natural completion (instead of a generic `Stopped`); the frontend owns the consequence. A pure `resolveTransportAction(trigger, ctx)` decides play/seek/stop/none for prev, next, and auto-advance, and also drives button enablement. Two new persisted settings (`autoAdvance`, `prevRestartThresholdMs`) are storage-only on the backend.

**Tech Stack:** Rust (Tauri v2, rodio), React 19, nanostores, react-aria-components, paraglide-js, Vitest + RTL.

**Spec:** [docs/superpowers/specs/2026-06-06-player-autoplay-prev-restart-design.md](../specs/2026-06-06-player-autoplay-prev-restart-design.md) · **Branch:** `feat/player-autoplay-prev-restart`

**Gates:**
- Frontend: `pnpm test` and `pnpm vite:build` (paraglide regenerates during build; tsc is NOT a gate — memory `typecheck-paraglide-gotchas`).
- Backend: `cargo test --manifest-path src-tauri/Cargo.toml` and `cargo build --manifest-path src-tauri/Cargo.toml`. If cargo errors that the frontend dist is missing, run `pnpm vite:build` once first to produce `dist/`.

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src-tauri/src/player/engine.rs` | Emit `player-ended { path }` on natural end; `PlayerEndedPayload` type | Modify |
| `src-tauri/src/settings.rs` | Two new persisted fields + defaults + tests | Modify |
| `src/lib/tauri.ts` | `GlobalSettings` fields + `PlayerEndedPayload` interface | Modify |
| `src/i18n/messages/{en,uk}.json` | `player_restarted` + two settings labels | Modify |
| `src/lib/playbackTransport.ts` | Pure `resolveTransportAction` + `resolveEndedAction` | Create |
| `src/lib/playbackTransport.test.ts` | Pure resolver tests | Create |
| `src/components/player/PlayerPanel.tsx` | Resolver-driven enablement + new `handleSkip` + restart | Modify |
| `src/components/player/PlayerPanel.test.tsx` | Restart + threshold-enablement tests | Modify |
| `src/App.tsx` | `player-ended` subscription → auto-advance | Modify |
| `src/components/settings/AudioTab.tsx` | "Playback" section (checkbox + seconds field) | Modify |

---

## Task 1: Backend — `player-ended` event

**Files:** Modify `src-tauri/src/player/engine.rs`

- [ ] **Step 1: Add a failing serialization test**

In `engine.rs`, inside the existing `#[cfg(test)] mod tests { … }` block (near `player_status_stopped_serializes`), add:

```rust
    #[test]
    fn player_ended_payload_serializes_camel_case() {
        let p = PlayerEndedPayload { path: "C:/music/song.mp3".to_string() };
        let json = serde_json::to_string(&p).unwrap();
        assert_eq!(json, r#"{"path":"C:/music/song.mp3"}"#);
    }
```

- [ ] **Step 2: Run it to verify it fails (does not compile)**

Run: `cargo test --manifest-path src-tauri/Cargo.toml player_ended_payload_serializes_camel_case`
Expected: FAIL — `cannot find type PlayerEndedPayload`.

- [ ] **Step 3: Add the payload type**

In `engine.rs`, right after the `PlayerProgressPayload` struct (currently ends around line 46), add:

```rust
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerEndedPayload {
    pub path: String,
}
```

- [ ] **Step 4: Emit `player-ended` instead of `Stopped` on natural end**

In `play_file`, the progress task currently captures `volume_arc` and emits a `Stopped` status when `ended_naturally`. Change the capture and the end branch:

Replace this line (currently ~line 205):
```rust
        let volume_arc = Arc::clone(&self.volume);
```
with:
```rust
        let path_for_end = path.clone();
```

Replace the `if ended_naturally { … }` block (currently ~lines 226-235):
```rust
            if ended_naturally {
                let current_volume = *volume_arc.lock().await;
                emit_player_status(&app_clone, PlayerStatus {
                    state: PlaybackState::Stopped,
                    source: None,
                    volume: current_volume,
                    position_ms: None,
                    duration_ms: None,
                });
            }
```
with:
```rust
            if ended_naturally {
                // Surface natural completion as a distinct event; the frontend
                // decides whether to auto-advance or stop. We intentionally do NOT
                // emit Stopped here, so App.tsx doesn't announce "playback stopped"
                // before an auto-advance.
                if let Err(e) = app_clone.emit("player-ended", PlayerEndedPayload { path: path_for_end }) {
                    log::warn!("Player: failed to emit player-ended: {e}");
                }
            }
```

(The stream-end path lower in the file is unchanged — streams never auto-advance.)

- [ ] **Step 5: Verify tests pass and it compiles**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, including `player_ended_payload_serializes_camel_case`. No unused-variable warnings for `volume_arc` (it's gone).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/player/engine.rs
git commit -m "feat(player): emit player-ended event on natural track completion

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Backend — playback settings fields

**Files:** Modify `src-tauri/src/settings.rs`

- [ ] **Step 1: Add failing tests**

In the `#[cfg(test)] mod tests` block of `settings.rs`, add:

```rust
    #[test]
    fn playback_settings_defaults() {
        let s = GlobalSettings::default();
        assert!(s.auto_advance);
        assert_eq!(s.prev_restart_threshold_ms, 0);
    }

    #[test]
    fn legacy_config_without_playback_fields_uses_defaults() {
        // A config saved before these fields existed must still deserialize.
        let json = r#"{"language":"en-US","theme":"auto","activeProfile":"Default"}"#;
        let s: GlobalSettings = serde_json::from_str(json).unwrap();
        assert!(s.auto_advance);
        assert_eq!(s.prev_restart_threshold_ms, 0);
    }
```

- [ ] **Step 2: Run to verify failure (does not compile)**

Run: `cargo test --manifest-path src-tauri/Cargo.toml playback_settings_defaults`
Expected: FAIL — `no field auto_advance on type GlobalSettings`.

- [ ] **Step 3: Add the struct fields**

In `struct GlobalSettings` (ends with `log_level` around line 43), add before the closing brace:

```rust
    #[serde(default = "default_true")]
    pub auto_advance: bool,
    #[serde(default)]
    pub prev_restart_threshold_ms: u32,
```

- [ ] **Step 4: Add the fields to `impl Default`**

In `impl Default for GlobalSettings` (around line 137), add to the `Self { … }` literal:

```rust
            auto_advance: true,
            prev_restart_threshold_ms: 0,
```

- [ ] **Step 5: Run to verify tests pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, including the two new tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/settings.rs
git commit -m "feat(settings): add autoAdvance and prevRestartThresholdMs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Frontend contract — types + i18n strings

**Files:** Modify `src/lib/tauri.ts`, `src/i18n/messages/en.json`, `src/i18n/messages/uk.json`

- [ ] **Step 1: Add settings fields to the `GlobalSettings` interface**

In `src/lib/tauri.ts`, inside `export interface GlobalSettings { … }`, add after `autostart: boolean;`:

```ts
  autoAdvance: boolean;
  prevRestartThresholdMs: number;
```

- [ ] **Step 2: Add the `PlayerEndedPayload` interface**

In `src/lib/tauri.ts`, right after the `PlayerProgressPayload` interface (around line 182), add:

```ts
export interface PlayerEndedPayload {
  path: string;
}
```

- [ ] **Step 3: Add English i18n strings**

In `src/i18n/messages/en.json`, add (next to the other `player_`/`settings_` keys; JSON key order is irrelevant):

```json
  "player_restarted": "Restarting track",
  "settings_auto_advance": "Auto-play next track",
  "settings_prev_restart_threshold": "“Previous” restarts the track if played longer than (seconds, 0 = off)",
```

- [ ] **Step 4: Add Ukrainian i18n strings**

In `src/i18n/messages/uk.json`, add:

```json
  "player_restarted": "Спочатку треку",
  "settings_auto_advance": "Автоматично відтворювати наступний трек",
  "settings_prev_restart_threshold": "«Попередній» рестартує трек, якщо грав довше ніж (секунд, 0 = вимк)",
```

- [ ] **Step 5: Regenerate paraglide + verify build**

Run: `pnpm vite:build`
Expected: build succeeds; `src/i18n/paraglide/messages/player_restarted.js` (and the two settings messages) now exist.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tauri.ts src/i18n/messages/en.json src/i18n/messages/uk.json src/i18n/paraglide
git commit -m "feat(player): frontend contract for autoplay/prev-restart (types + i18n)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Frontend — pure transport policy

**Files:** Create `src/lib/playbackTransport.ts`, `src/lib/playbackTransport.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/playbackTransport.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveTransportAction, resolveEndedAction } from "./playbackTransport";
import type { TransportContext } from "./playbackTransport";
import type { PlaybackNeighbors } from "../stores/playbackNeighbors";
import type { PlaybackSource } from "./tauri";

const fileSrc = (path: string): PlaybackSource => ({ type: "file", path });
const streamSrc = (id: string): PlaybackSource => ({ type: "stream", streamId: id });

const nb = (over: Partial<PlaybackNeighbors> = {}): PlaybackNeighbors => ({
  prev: null, next: null, ...over,
});

const ctx = (over: Partial<TransportContext> = {}): TransportContext => ({
  source: null, positionMs: null, neighbors: nb(), prevRestartThresholdMs: 0, ...over,
});

describe("resolveTransportAction — next", () => {
  it("plays the next neighbor", () => {
    expect(resolveTransportAction("next", ctx({ neighbors: nb({ next: { kind: "file", path: "b" } }) })))
      .toEqual({ kind: "play-file", path: "b" });
  });
  it("is none at the end", () => {
    expect(resolveTransportAction("next", ctx())).toEqual({ kind: "none" });
  });
});

describe("resolveTransportAction — auto-advance", () => {
  it("plays the next neighbor", () => {
    expect(resolveTransportAction("auto-advance", ctx({ neighbors: nb({ next: { kind: "file", path: "b" } }) })))
      .toEqual({ kind: "play-file", path: "b" });
  });
  it("stops at the end of the list", () => {
    expect(resolveTransportAction("auto-advance", ctx())).toEqual({ kind: "stop" });
  });
});

describe("resolveTransportAction — prev (no threshold)", () => {
  it("plays the previous neighbor", () => {
    expect(resolveTransportAction("prev", ctx({ neighbors: nb({ prev: { kind: "stream", id: "s1" } }) })))
      .toEqual({ kind: "play-stream", id: "s1" });
  });
  it("is none with no previous", () => {
    expect(resolveTransportAction("prev", ctx())).toEqual({ kind: "none" });
  });
});

describe("resolveTransportAction — prev (restart threshold)", () => {
  it("seeks to start when a file played past the threshold", () => {
    expect(resolveTransportAction("prev", ctx({
      source: fileSrc("a"), positionMs: 4000, prevRestartThresholdMs: 3000,
      neighbors: nb({ prev: { kind: "file", path: "z" } }),
    }))).toEqual({ kind: "seek-start" });
  });
  it("goes to previous when below the threshold", () => {
    expect(resolveTransportAction("prev", ctx({
      source: fileSrc("a"), positionMs: 1000, prevRestartThresholdMs: 3000,
      neighbors: nb({ prev: { kind: "file", path: "z" } }),
    }))).toEqual({ kind: "play-file", path: "z" });
  });
  it("seeks to start even on the first track when past the threshold", () => {
    expect(resolveTransportAction("prev", ctx({
      source: fileSrc("a"), positionMs: 9000, prevRestartThresholdMs: 3000, neighbors: nb(),
    }))).toEqual({ kind: "seek-start" });
  });
  it("ignores the threshold for stream sources", () => {
    expect(resolveTransportAction("prev", ctx({
      source: streamSrc("s2"), positionMs: 9000, prevRestartThresholdMs: 3000,
      neighbors: nb({ prev: { kind: "stream", id: "s1" } }),
    }))).toEqual({ kind: "play-stream", id: "s1" });
  });
  it("treats null position as below the threshold", () => {
    expect(resolveTransportAction("prev", ctx({
      source: fileSrc("a"), positionMs: null, prevRestartThresholdMs: 3000,
      neighbors: nb({ prev: { kind: "file", path: "z" } }),
    }))).toEqual({ kind: "play-file", path: "z" });
  });
});

describe("resolveEndedAction", () => {
  it("stops when autoAdvance is off", () => {
    expect(resolveEndedAction(false, nb({ next: { kind: "file", path: "b" } }))).toEqual({ kind: "stop" });
  });
  it("plays next when autoAdvance is on and a next exists", () => {
    expect(resolveEndedAction(true, nb({ next: { kind: "file", path: "b" } }))).toEqual({ kind: "play-file", path: "b" });
  });
  it("stops at the end of the list when autoAdvance is on", () => {
    expect(resolveEndedAction(true, nb())).toEqual({ kind: "stop" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- src/lib/playbackTransport.test.ts`
Expected: FAIL — `Failed to resolve import "./playbackTransport"`.

- [ ] **Step 3: Implement the module**

Create `src/lib/playbackTransport.ts`:

```ts
import type { PlaybackSource } from "./tauri";
import type { PlaybackNeighbors, NeighborTarget } from "../stores/playbackNeighbors";

export type TransportAction =
  | { kind: "play-stream"; id: string }
  | { kind: "play-file"; path: string }
  | { kind: "seek-start" }
  | { kind: "stop" }
  | { kind: "none" };

export type TransportTrigger = "prev" | "next" | "auto-advance";

export interface TransportContext {
  source: PlaybackSource | null;
  positionMs: number | null;
  neighbors: PlaybackNeighbors;
  prevRestartThresholdMs: number;
}

function toPlay(target: NeighborTarget): TransportAction {
  return target.kind === "stream"
    ? { kind: "play-stream", id: target.id }
    : { kind: "play-file", path: target.path };
}

/**
 * Decide what a transport trigger does in the current context. Pure: takes the
 * already-computed neighbors, never reads stores.
 * - next: play next neighbor, else none (button disabled).
 * - auto-advance: play next neighbor, else stop (end of list).
 * - prev: restart the current file if played past the threshold, else play the
 *   previous neighbor, else none.
 */
export function resolveTransportAction(
  trigger: TransportTrigger,
  ctx: TransportContext,
): TransportAction {
  const { source, positionMs, neighbors, prevRestartThresholdMs } = ctx;

  if (trigger === "next") {
    return neighbors.next ? toPlay(neighbors.next) : { kind: "none" };
  }
  if (trigger === "auto-advance") {
    return neighbors.next ? toPlay(neighbors.next) : { kind: "stop" };
  }

  // prev
  if (
    source?.type === "file" &&
    prevRestartThresholdMs > 0 &&
    positionMs !== null &&
    positionMs > prevRestartThresholdMs
  ) {
    return { kind: "seek-start" };
  }
  return neighbors.prev ? toPlay(neighbors.prev) : { kind: "none" };
}

/** Decide what happens when a file ends naturally. */
export function resolveEndedAction(
  autoAdvance: boolean,
  neighbors: PlaybackNeighbors,
): TransportAction {
  if (!autoAdvance) return { kind: "stop" };
  return resolveTransportAction("auto-advance", {
    source: null,
    positionMs: null,
    neighbors,
    prevRestartThresholdMs: 0,
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test -- src/lib/playbackTransport.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/playbackTransport.ts src/lib/playbackTransport.test.ts
git commit -m "feat(player): pure transport policy (resolveTransportAction)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Frontend — PlayerPanel resolver wiring + prev-restart

**Files:** Modify `src/components/player/PlayerPanel.tsx`, `src/components/player/PlayerPanel.test.tsx`

### 5a — Failing tests

- [ ] **Step 1: Add tests for the restart path and threshold enablement**

In `src/components/player/PlayerPanel.test.tsx`:

(a) Add `seekPlayback` to the tauri mock and import `$settings`. The mock factory currently lists `playStream`, `playSavedSong`, `setVolume`, `pausePlayback`, `resumePlayback`, `stopPlayback`. Add:
```ts
  seekPlayback: vi.fn().mockResolvedValue(undefined),
```
Add near the other store imports:
```ts
import { $settings } from "../../stores/settings";
```

(b) In the `afterEach`, reset settings:
```ts
  $settings.set(null);
```

(c) Add this describe block:
```ts
describe("PlayerPanel — prev restart threshold", () => {
  function playingFileAt(path: string, positionMs: number, thresholdMs: number) {
    $songs.set([mkSong("a.mp3", "A"), mkSong("b.mp3", "B"), mkSong("c.mp3", "C")]);
    $songsSort.set("title");
    $settings.set({
      language: "en-US", theme: "auto", activeProfile: "Default", outputDevice: null,
      minimizeToTray: true, showTrayNotifications: true, showTrackInTitle: true,
      diskSpaceThresholdGb: 1, doubleClickAction: "play", bandwidthLimitKbps: 0,
      autostart: false, autoAdvance: true, prevRestartThresholdMs: thresholdMs,
    } as never);
    $playerStatus.set({
      state: "playing", source: { type: "file", path }, volume: 0.75,
      positionMs, durationMs: 200000,
    });
  }

  it("restarts the current track (seek 0) instead of going to previous, past the threshold", () => {
    playingFileAt("b.mp3", 5000, 3000);
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.player_prev() }));
    expect(tauri.seekPlayback).toHaveBeenCalledWith(0);
    expect(tauri.playSavedSong).not.toHaveBeenCalled();
  });

  it("goes to the previous track when below the threshold", () => {
    playingFileAt("b.mp3", 1000, 3000);
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: m.player_prev() }));
    expect(tauri.playSavedSong).toHaveBeenCalledWith("a.mp3");
    expect(tauri.seekPlayback).not.toHaveBeenCalled();
  });

  it("enables Prev on the first track once played past the threshold", () => {
    playingFileAt("a.mp3", 5000, 3000); // first track, no previous neighbor
    const { getByRole } = renderPanel();
    expect(getByRole("button", { name: m.player_prev() })).toBeEnabled();
  });
});
```

(Note: `mkSong`, `renderPanel`, `$songs`, `$songsSort`, `$playerStatus` already exist in this test file from the prev/next feature. The `as never` cast keeps the literal robust against unrelated `GlobalSettings` fields.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- src/components/player/PlayerPanel.test.tsx`
Expected: FAIL — Prev still routes through `playSavedSong`/disabled (no `seekPlayback`, first-track Prev disabled).

### 5b — Implement

- [ ] **Step 3: Update imports**

In `src/components/player/PlayerPanel.tsx`, change the playbackNeighbors import (line 15) from:
```ts
import { $playbackNeighbors, computePlaybackNeighbors, type NeighborTarget } from "../../stores/playbackNeighbors";
```
to:
```ts
import { $playbackNeighbors, computePlaybackNeighbors } from "../../stores/playbackNeighbors";
import { resolveTransportAction, type TransportAction, type TransportContext } from "../../lib/playbackTransport";
```

- [ ] **Step 4: Add a module-level boundary-focus helper**

In `src/components/player/PlayerPanel.tsx`, add after the imports and before `function useSourceLabel()`:

```ts
type SkipTrigger = "prev" | "next";

/**
 * Will the just-pressed skip button resolve to "none" after `action` applies?
 * Used to pre-move focus to Play/Pause before the stops set collapses, so the
 * usePlayerZoneNav remap doesn't strand focus on Mute.
 */
function pressedBecomesDisabled(
  trigger: SkipTrigger,
  action: TransportAction,
  ctx: TransportContext,
): boolean {
  if (action.kind === "seek-start") {
    // Same source; position resets to 0 → prev no longer offers a restart.
    return resolveTransportAction("prev", { ...ctx, positionMs: 0 }).kind === "none";
  }
  if (action.kind === "play-stream" || action.kind === "play-file") {
    const newSource =
      action.kind === "play-stream"
        ? ({ type: "stream", streamId: action.id } as const)
        : ({ type: "file", path: action.path } as const);
    const newNeighbors = computePlaybackNeighbors(newSource, $streams.get(), $filteredSongs.get());
    return resolveTransportAction(trigger, {
      source: newSource,
      positionMs: 0,
      neighbors: newNeighbors,
      prevRestartThresholdMs: ctx.prevRestartThresholdMs,
    }).kind === "none";
  }
  return false;
}
```

- [ ] **Step 5: Replace the `canPrev`/`canNext` derivation**

Replace (currently lines 76-78):
```ts
  const neighbors = useStore($playbackNeighbors);
  const canPrev = isActive && neighbors.prev !== null;
  const canNext = isActive && neighbors.next !== null;
```
with:
```ts
  const neighbors = useStore($playbackNeighbors);
  const positionMs = playerStatus.positionMs;
  const prevRestartThresholdMs = settings?.prevRestartThresholdMs ?? 0;
  const transportCtx: TransportContext = { source, positionMs, neighbors, prevRestartThresholdMs };
  const canPrev = isActive && resolveTransportAction("prev", transportCtx).kind !== "none";
  const canNext = isActive && resolveTransportAction("next", transportCtx).kind !== "none";
```

- [ ] **Step 6: Replace `handleSkip`**

Replace the entire `handleSkip` callback (currently lines 166-195) with:
```ts
  const handleSkip = useCallback(
    async (trigger: SkipTrigger) => {
      if (navPendingRef.current) return;
      const status = $playerStatus.get();
      const ctx: TransportContext = {
        source: status.source,
        positionMs: status.positionMs,
        neighbors: $playbackNeighbors.get(),
        prevRestartThresholdMs: $settings.get()?.prevRestartThresholdMs ?? 0,
      };
      const action = resolveTransportAction(trigger, ctx);
      if (action.kind === "none") return;
      navPendingRef.current = true;
      try {
        if (pressedBecomesDisabled(trigger, action, ctx)) playPauseRef.current?.focus();
        switch (action.kind) {
          case "play-stream": await tauri.playStream(action.id); break;
          case "play-file":   await tauri.playSavedSong(action.path); break;
          case "seek-start":
            await tauri.seekPlayback(0);
            announce(m.player_restarted(), "assertive");
            break;
          // "stop" cannot occur for prev/next (only auto-advance) — no-op.
        }
        // play-* announce "Playing: {name}" via App.tsx player-status.
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

- [ ] **Step 7: Update the Prev/Next button `onPress`**

Prev button (currently `onPress={() => handleSkip(neighbors.prev, "prev")}`) → `onPress={() => handleSkip("prev")}`.
Next button (currently `onPress={() => handleSkip(neighbors.next, "next")}`) → `onPress={() => handleSkip("next")}`.

- [ ] **Step 8: Run the component tests**

Run: `pnpm test -- src/components/player/PlayerPanel.test.tsx`
Expected: PASS — the new restart/threshold tests AND all pre-existing PlayerPanel tests (states, dispatch, race guard, boundary focus) stay green.

- [ ] **Step 9: Commit**

```bash
git add src/components/player/PlayerPanel.tsx src/components/player/PlayerPanel.test.tsx
git commit -m "feat(player): resolver-driven prev/next with prev-restart threshold

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Frontend — auto-advance on `player-ended`

**Files:** Modify `src/App.tsx`

- [ ] **Step 1: Add imports**

In `src/App.tsx`, add (near the other store/lib imports):
```ts
import { $filteredSongs } from "./stores/songs";
import { computePlaybackNeighbors } from "./stores/playbackNeighbors";
import { resolveEndedAction } from "./lib/playbackTransport";
import type { PlayerEndedPayload } from "./lib/tauri";
```
(`$settings`, `$streams`, and `tauri` are already imported in App.tsx; if any is missing, add it. Verify by reading the existing import block.)

- [ ] **Step 2: Add the handler and subscribe**

Near the existing `handlePlayerProgress` / `useTauriEvent("player-progress", …)` wiring (around lines 258-292), add a handler:
```ts
  const handlePlayerEnded = useCallback(async (payload: PlayerEndedPayload) => {
    const autoAdvance = $settings.get()?.autoAdvance ?? true;
    const neighbors = computePlaybackNeighbors(
      { type: "file", path: payload.path },
      $streams.get(),
      $filteredSongs.get(),
    );
    const action = resolveEndedAction(autoAdvance, neighbors);
    try {
      if (action.kind === "play-file") await tauri.playSavedSong(action.path);
      else await tauri.stopPlayback(); // end of list or autoAdvance off
    } catch (e) {
      console.error(e);
      // Skip-on-error guard: never loop through broken files — just stop.
      await tauri.stopPlayback().catch(() => {});
    }
  }, []);
```
And register it next to the other player events:
```ts
  useTauriEvent<PlayerEndedPayload>("player-ended", handlePlayerEnded);
```

- [ ] **Step 3: Verify the full suite still passes**

Run: `pnpm test`
Expected: PASS, no regressions.

- [ ] **Step 4: Build check**

Run: `pnpm vite:build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(player): auto-advance to next track on player-ended

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> Manual verification (jsdom can't drive real playback; do this in the running app during the final manual pass):
> - With autoplay ON, let a recorded file finish → next file in the current sorted/filtered list starts; NVDA announces "Playing: {next}" once, with no "playback stopped" first.
> - At the end of the list → playback stops (one "playback stopped").
> - With autoplay OFF → playback stops at end of each track.

---

## Task 7: Frontend — Audio tab "Playback" section

**Files:** Modify `src/components/settings/AudioTab.tsx`

- [ ] **Step 1: Add an `update` helper and the Playback section**

In `src/components/settings/AudioTab.tsx`:

(a) Extend the react-aria import (currently `Select, SelectValue, Label, Button, Popover, ListBox, ListBoxItem`) to also include `Checkbox, NumberField, Input, Group`:
```ts
import {
  Select,
  SelectValue,
  Label,
  Button,
  Popover,
  ListBox,
  ListBoxItem,
  Checkbox,
  NumberField,
  Input,
  Group,
} from "react-aria-components";
```
Add the settings type import:
```ts
import type { GlobalSettings } from "../../lib/tauri";
```

(b) Add an `update` helper inside the component (after the existing `save` definition):
```ts
  function update(patch: Partial<GlobalSettings>) {
    const current = $settings.get();
    if (!current) return;
    $settings.set({ ...current, ...patch });
    save();
  }
```

(c) Add this section inside the returned `<div className="space-y-6">`, after the device refresh `<Button>` (before the closing `</div>`):
```tsx
      <div className="space-y-4 border-t border-slate-700 pt-4">
        <h3 className="text-sm font-semibold text-slate-200">
          {m.player_controls()}
        </h3>

        {/* Auto-advance */}
        <Checkbox
          isSelected={settings.autoAdvance}
          onChange={(val) => update({ autoAdvance: val })}
          className="flex items-center gap-2 text-sm text-slate-300"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-600 bg-slate-700">
            {settings.autoAdvance && <span>✓</span>}
          </div>
          <Label>{m.settings_auto_advance()}</Label>
        </Checkbox>

        {/* Prev-restart threshold (seconds; stored as ms) */}
        <NumberField
          value={Math.round((settings.prevRestartThresholdMs ?? 0) / 1000)}
          onChange={(val) => {
            if (!Number.isNaN(val)) update({ prevRestartThresholdMs: Math.max(0, val) * 1000 });
          }}
          minValue={0}
          maxValue={30}
          step={1}
        >
          <Label className="block text-sm font-medium text-slate-300">
            {m.settings_prev_restart_threshold()}
          </Label>
          <Group className="mt-1 flex w-32">
            <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
          </Group>
        </NumberField>
      </div>
```

- [ ] **Step 2: Build check**

Run: `pnpm vite:build`
Expected: success.

- [ ] **Step 3: Add a focused test**

Create `src/components/settings/AudioTab.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
import { AudioTab } from "./AudioTab";
import { $settings } from "../../stores/settings";

vi.mock("../../lib/tauri", () => ({
  listOutputDevices: vi.fn().mockResolvedValue([]),
  setOutputDevice: vi.fn().mockResolvedValue(undefined),
  saveSettings: vi.fn().mockResolvedValue(undefined),
}));

const baseSettings = {
  language: "en-US", theme: "auto", activeProfile: "Default", outputDevice: null,
  minimizeToTray: true, showTrayNotifications: true, showTrackInTitle: true,
  diskSpaceThresholdGb: 1, doubleClickAction: "play", bandwidthLimitKbps: 0,
  autostart: false, autoAdvance: true, prevRestartThresholdMs: 0,
} as never;

beforeEach(() => { vi.clearAllMocks(); $settings.set(baseSettings); });
afterEach(() => { $settings.set(null); });

describe("AudioTab — playback settings", () => {
  it("toggles autoAdvance into the settings store", () => {
    const { getByRole } = render(<AudioTab />);
    fireEvent.click(getByRole("checkbox", { name: m.settings_auto_advance() }));
    expect($settings.get()?.autoAdvance).toBe(false);
  });

  it("stores the prev-restart threshold as milliseconds", () => {
    const { getByRole } = render(<AudioTab />);
    const input = getByRole("textbox", { name: m.settings_prev_restart_threshold() });
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.blur(input);
    expect($settings.get()?.prevRestartThresholdMs).toBe(3000);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm test -- src/components/settings/AudioTab.test.tsx`
Expected: PASS. If the react-aria `NumberField` commits on Enter rather than blur in jsdom, submit with `fireEvent.keyDown(input, { key: "Enter" })` instead of `blur` — verify by running and adjust to whichever the component actually uses; do not weaken the `3000` assertion.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/AudioTab.tsx src/components/settings/AudioTab.test.tsx
git commit -m "feat(settings): Playback section for autoplay and prev-restart

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Final gates

- [ ] **Step 1: Frontend gates**

Run: `pnpm test` → expect entire suite green.
Run: `pnpm vite:build` → expect success.

- [ ] **Step 2: Backend gates**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → expect green.
Run: `cargo build --manifest-path src-tauri/Cargo.toml` → expect success.
(If cargo complains about a missing frontend dist, run `pnpm vite:build` first.)

No commit (verification only).

---

## Manual verification (do in the running app before merge)

- [ ] Autoplay ON: a finishing file auto-plays the next in the current sorted/filtered list; one "Playing: {next}" announcement, no preceding "playback stopped".
- [ ] Autoplay ON at end of list → stops once. Autoplay OFF → stops at each track end.
- [ ] A deleted/unreadable next file → playback stops, no runaway skipping.
- [ ] Streams never auto-advance; stream end/error behaves as before.
- [ ] Prev-restart = 0 → Prev always goes to previous. Set to 3s → after 3s into a file, Prev restarts it (seek 0) with an assertive "Restarting track"; before 3s, Prev goes to previous. Streams ignore the threshold.
- [ ] Prev becomes focusable/enabled on the first track once past the threshold; arrow nav order intact.
- [ ] Settings persist across restart; an older config without the new keys loads with autoplay on / threshold 0.

---

## Self-Review

**Spec coverage** (spec §→task):
- §3 / §4.1 player-ended event → Task 1 ✅
- §4.2 settings fields + defaults → Task 2 ✅
- §5.1 types (GlobalSettings + PlayerEndedPayload) → Task 3 ✅
- §5.2 resolveTransportAction + resolveEndedAction → Task 4 ✅
- §5.3 PlayerPanel resolver wiring, restart, boundary focus → Task 5 ✅
- §5.4 auto-advance handler + skip-on-error → Task 6 ✅
- §5.5 i18n strings → Task 3 ✅
- §5.6 Audio tab Playback section → Task 7 ✅
- §6 testing (pure, PlayerPanel, ended, Rust serde) → Tasks 1,2,4,5,7 ✅
- §7 gates & footprint → Task 8; the 10 files match the table ✅
- §10 acceptance criteria → automated (Tasks 1-7) + manual checklist ✅

**Placeholder scan:** none — every code step has complete content.

**Type consistency:** `TransportAction`/`TransportContext`/`TransportTrigger`, `resolveTransportAction(trigger, ctx)`, `resolveEndedAction(autoAdvance, neighbors)`, `PlayerEndedPayload { path }`, and the settings field names `autoAdvance`/`prevRestartThresholdMs` (camelCase frontend; `auto_advance`/`prev_restart_threshold_ms` snake_case Rust via serde camelCase) are identical across the module definition (Task 4), its consumers (Tasks 5, 6), the contract (Task 3), and the backend (Tasks 1, 2). `pressedBecomesDisabled` is defined and used only within PlayerPanel (Task 5). i18n keys `player_restarted` / `settings_auto_advance` / `settings_prev_restart_threshold` are added in Task 3 before any task consumes them.
