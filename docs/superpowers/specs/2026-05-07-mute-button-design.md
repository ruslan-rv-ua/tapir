# Mute Button — Design Spec

## Problem

The mute button in `PlayerPanel` is a stub (`isDisabled={true}`) with no logic. Users cannot mute playback via the UI.

## Approach

Frontend-only mute (no backend changes). A new nanostores atom tracks mute state alongside the existing `$playerStatus`.

## Architecture

### New Atom — `$muteState`

Added to `src/stores/player.ts`:

```ts
interface MuteState {
  muted: boolean;
  savedVolume: number;  // the volume to restore on unmute (0.0–1.0)
  restoring: boolean;   // true while setVolume is in-flight during unexpected-stop restore
}

export const $muteState = atom<MuteState>({ muted: false, savedVolume: 0.75, restoring: false });
```

### Mute Logic (PlayerPanel)

Handler `handleMute` (async, with error handling):

```ts
const handleMute = async () => {
  try {
    if (!isMuted) {
      const vol = $playerStatus.get().volume;
      const savedVolume = vol > 0 ? vol : 0.75;
      await tauri.setVolume(0);                          // IPC first
      $muteState.set({ muted: true, savedVolume, restoring: false });      // state update only on success
      announce(m.player_mute_action(), "assertive");
    } else {
      const { savedVolume } = $muteState.get();
      await tauri.setVolume(savedVolume);                // IPC first
      $muteState.set({ muted: false, savedVolume, restoring: false });     // state update only on success
      announce(m.player_unmute_action(), "assertive");
    }
  } catch (e) {
    console.error(e);
    announce(m.playback_error(), "assertive");
  }
};
```

`$muteState` is updated **after** the IPC call succeeds to prevent UI/backend desync on failure.

**Edge case — volume already at 0:** If the user has manually set the slider to 0% before muting, `savedVolume` falls back to `0.75` so that unmuting restores an audible level rather than silence.

### In-Flight Protection

`handleMute` uses a `pendingRef = useRef(false)` guard to prevent concurrent IPC calls on rapid double-presses:

```ts
const mutePendingRef = useRef(false);

const handleMute = async () => {
  if (mutePendingRef.current) return;
  mutePendingRef.current = true;
  try {
    // ... mute/unmute logic
  } finally {
    mutePendingRef.current = false;
  }
};
```

### Mute State on Playback Stop

**User-initiated stop** (`handleStop` in `PlayerPanel`): if muted, restore volume **before** stopping so the engine is never left at 0. The `playback_stopped` announcement is **not** made here — it comes from `handlePlayerStatus` in `App.tsx` (single source of truth for all playback state announcements):

```ts
const handleStop = async () => {
  const muteState = $muteState.get();
  try {
    if (muteState.muted) {
      await tauri.setVolume(muteState.savedVolume);
    }
    await tauri.stopPlayback();
    // Clear mute only after BOTH operations succeed
    if (muteState.muted) {
      $muteState.set({ muted: false, savedVolume: muteState.savedVolume, restoring: false });
    }
    // No announce here — handlePlayerStatus announces playback_stopped
  } catch (e) {
    console.error(e);
    // If we were muted, backend volume may have been set to savedVolume before the
    // failure. Re-mute the backend so it stays consistent with $muteState (still muted).
    if (muteState.muted) {
      tauri.setVolume(0).catch(console.error);
    }
    announce(m.playback_error(), "assertive");
  }
};
```

If `setVolume` fails, the stop is aborted, backend stays at 0, `$muteState` stays muted — no change. If `stopPlayback` fails, the re-mute in the catch block returns the backend to 0 so it matches `$muteState` (still muted). A double failure (re-mute also fails) leaves a backend/UI inconsistency but is accepted as an extreme edge case.

**Unexpected stop** (stream disconnect, file ended, context-menu Stop, source switch — any stop NOT initiated by `PlayerPanel.handleStop`): all such stops arrive as `player-status { state: "stopped" }` and are handled by `handlePlayerStatus` in `App.tsx`. The `restoring` flag on `$muteState` prevents re-entry if `setVolume` causes a second `player-status { state: "stopped" }` event before the async restore completes:

```ts
if (payload.state === "stopped" && $muteState.get().muted && !$muteState.get().restoring) {
  const { savedVolume } = $muteState.get();
  $muteState.set({ muted: true, savedVolume, restoring: true });  // mark in-flight
  tauri.setVolume(savedVolume)
    .then(() => {
      // Guard: Case 2 may have already cleared mute state if new playback started
      // before this promise settled. Only update if still restoring.
      if ($muteState.get().restoring) {
        $muteState.set({ muted: false, savedVolume, restoring: false });
      }
    })
    .catch((e) => {
      if ($muteState.get().restoring) {
        console.error("mute restore failed:", e);
        $muteState.set({ muted: true, savedVolume, restoring: false }); // stay muted; user can fix via slider
      }
    });
}
```

`setVolume` fires a second `player-status { state: "stopped" }` event. This is harmless because the `playback_stopped` announcement is gated on state transition (see Double-Announce Prevention below) — the second event does not re-announce.

No logic changes. Volume slider always displays `$playerStatus.volume` (the actual backend volume). While muted this value is 0. When the user moves the slider and releases, `onChangeEnd` calls `setVolume(v / 100)`. The backend emits a `PlayerStatus` event with the new volume > 0, which triggers mute-state cleanup in `App.tsx`.

### Mute-State Cleanup in App.tsx

`handlePlayerStatus` handles two mute-clearing cases:

**Case 1 — keyboard shortcut raised volume while muted:**
```ts
if ($muteState.get().muted && !$muteState.get().restoring && payload.volume > 0) {
  const { savedVolume } = $muteState.get();
  $muteState.set({ muted: false, savedVolume, restoring: false });
}
```

**Case 2 — new playback started (source switch or play from stopped) while muted:**
When `stateChangedToPlaying || sourceChangedWhilePlaying` AND `$muteState.muted`, restore volume and clear mute so the new source plays audibly. Resume (`paused → playing`) does **not** trigger this case — if the user paused while muted, they expect to stay muted on resume.

```ts
if ((stateChangedToPlaying || sourceChangedWhilePlaying) && $muteState.get().muted) {
  const { savedVolume, restoring } = $muteState.get();
  if (!restoring) {
    // No restore in flight — call setVolume now
    tauri.setVolume(savedVolume).catch((e) => {
      // Restore failed: revert UI to muted so user can see the problem
      console.error("mute restore failed on new source:", e);
      $muteState.set({ muted: true, savedVolume, restoring: false });
    });
  }
  // If restoring === true, the unexpected-stop restore promise is already in flight.
  // Clearing mute state here is sufficient; the .then() callback checks restoring
  // before updating, so it will no-op after this clear.
  $muteState.set({ muted: false, savedVolume, restoring: false });
}
```

### Button Appearance

| State | Icon | `aria-pressed` | `aria-label` |
|-------|------|----------------|--------------|
| Not muted | `Volume2` | `false` | i18n `player_mute_action` ("Вимкнути звук" / "Mute") |
| Muted | `VolumeX` | `true` | i18n `player_unmute_action` ("Увімкнути звук" / "Unmute") |

- Button is **enabled** only when `isActive` (state is `"playing"` or `"paused"`), consistent with other transport controls.
- `Volume2` icon is imported from `lucide-react` (already a dependency).
- `PlayerPanel` derives icon and `aria-pressed` directly from `$muteState.muted`: when `muted === true`, render `VolumeX` with `aria-pressed=true`; otherwise render `Volume2` with `aria-pressed=false`.

### Accessibility

- `aria-pressed` correctly communicates toggle state to NVDA.
- `aria-label` changes dynamically so the screen reader announces the current action ("Вимкнути звук" / "Увімкнути звук").
- After a successful mute, announce `m.player_mute_action()` via `useAnnounce` with `"assertive"` priority.
- After a successful unmute, announce `m.player_unmute_action()` via `useAnnounce` with `"assertive"` priority.
- On IPC failure, announce `m.playback_error()` with `"assertive"` priority (consistent with other transport controls).

### i18n

Add two new keys (the existing `player_mute` key is **removed**, as the stub button that used it is replaced):

| Key | uk | en |
|-----|----|----|
| `player_mute_action` | `"Вимкнути звук"` | `"Mute"` |
| `player_unmute_action` | `"Увімкнути звук"` | `"Unmute"` |

Note: `volume === 0` set via the volume slider does **not** set `$muteState.muted = true`. The muted flag is only set by pressing the mute button. These are two distinct states.

## Data Flow

```
User presses Mute button (not muted, volume = 75%)
  → handleMute()
    → tauri.setVolume(0)           ← IPC first
      → Rust emits PlayerStatus { state: "playing", volume: 0.0, ... }
        → handlePlayerStatus: state unchanged ("playing"→"playing") → no announce
          → $playerStatus.set({ volume: 0, ... })
    → $muteState.set({ muted: true, savedVolume: 0.75, restoring: false }) ← state after success
    → announce("Вимкнути звук", "assertive")
      → VolumeSlider renders 0%, mute icon = VolumeX, aria-pressed=true ✓

User presses Mute button again (muted)
  → handleMute()
    → tauri.setVolume(0.75)        ← IPC first
      → Rust emits PlayerStatus { state: "playing", volume: 0.75, ... }
        → handlePlayerStatus: state unchanged ("playing"→"playing") → no announce
          → $playerStatus.set({ volume: 0.75, ... })
    → $muteState.set({ muted: false, savedVolume: 0.75, restoring: false }) ← state after success
    → announce("Увімкнути звук", "assertive")
      → VolumeSlider renders 75%, mute icon = Volume2, aria-pressed=false ✓

Keyboard shortcut volume_up while muted
  → Rust: 0.0 + 0.05 = 0.05 → emit PlayerStatus { state: "playing", volume: 0.05 }
    → handlePlayerStatus: volume > 0 && muted == true
      → $muteState.set({ muted: false, savedVolume: 0.75, restoring: false }) ← auto-clear (savedVolume preserved)
        → mute icon = Volume2, aria-pressed=false ✓
```

### Double-Announce Prevention

`set_volume` causes the Rust backend to emit `player-status`, which `handlePlayerStatus` currently receives and announces `playback_started` whenever `state === "playing"`. This fires on **every** volume change (slider, keyboard, mute), causing spurious announcements.

**Fix (in scope):** Track previous playback state and source in `handlePlayerStatus`. Only call `announce(playback_started)` when either:
1. State transitions from **stopped** to "playing" (new source starts), **or**
2. State remains "playing" but the source changes (e.g., user switches stream while playing).

Resume (`paused → playing`) must NOT trigger `playback_started` — it already has its own `playback_resumed` announcement.

Implementation:

```ts
const prev = $playerStatus.get();
$playerStatus.set(payload);

const stateChangedToPlaying = prev.state === "stopped" && payload.state === "playing";
const resumed = prev.state === "paused" && payload.state === "playing";
const sourceChangedWhilePlaying =
  payload.state === "playing" &&
  (prev.source?.type !== payload.source?.type ||
    (payload.source?.type === "stream" &&
      prev.source?.type === "stream" &&
      prev.source.streamId !== payload.source.streamId) ||
    (payload.source?.type === "file" &&
      prev.source?.type === "file" &&
      prev.source.path !== payload.source.path));

if (stateChangedToPlaying || sourceChangedWhilePlaying) {
  // announce playback_started
}
if (resumed) {
  // announce playback_resumed (pre-existing behavior, unchanged)
}
```

Volume-only updates (`set_volume` → `player-status` with same state+source) will NOT trigger an announcement. The same state-transition guard is applied to `playback_stopped`: only announce when `previousState !== "stopped" && payload.state === "stopped"`. This prevents the second `player-status` event triggered by mute-restore on unexpected stop from double-announcing.

This fix is included in `src/App.tsx` changes.

## Files Changed

| File | Change |
|------|--------|
| `src/stores/player.ts` | Add `$muteState` atom |
| `src/App.tsx` | Add mute-state cleanup in `handlePlayerStatus`; fix double-announce (state-transition guard for both `playback_started` and `playback_stopped`); handle unexpected stop while muted (restore volume) |
| `src/components/player/PlayerPanel.tsx` | Implement `handleMute` with in-flight guard; update `handleStop` to restore volume if muted; update mute button props; import `Volume2` |
| `src/i18n/messages/uk.json` | Add `player_mute_action`, `player_unmute_action` |
| `src/i18n/messages/en.json` | Add `player_mute_action`, `player_unmute_action` |

> **Note:** After editing i18n JSON files, run `pnpm run build` (or the Paraglide compile step) to regenerate `src/i18n/paraglide/messages.js` before using the new keys in components.

## Out of Scope

- Backend `muted` field (deferred; not needed for this phase)
- Persisting mute state across app restarts
- Muting when player is stopped
