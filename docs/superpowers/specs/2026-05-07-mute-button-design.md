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
  savedVolume: number; // the volume to restore on unmute (0.0–1.0)
}

export const $muteState = atom<MuteState>({ muted: false, savedVolume: 0.75 });
```

### Mute Logic (PlayerPanel)

Handler `handleMute`:
- **Not muted → mute**: read `$playerStatus.get().volume`; if it is 0, use 0.75 as savedVolume; set `$muteState` to `{ muted: true, savedVolume }`, call `tauri.setVolume(0)`.
- **Muted → unmute**: read `$muteState.get().savedVolume`, set `$muteState` to `{ muted: false, savedVolume }`, call `tauri.setVolume(savedVolume)`.

### VolumeSlider

No logic changes. Volume slider always displays `$playerStatus.volume` (the actual backend volume). While muted this value is 0. When the user moves the slider and releases, `onChangeEnd` calls `setVolume(v / 100)`. The backend emits a `PlayerStatus` event with the new volume > 0, which triggers mute-state cleanup in `App.tsx`.

### Mute-State Cleanup in App.tsx

In `handlePlayerStatus`, add:

```ts
if ($muteState.get().muted && payload.volume > 0) {
  $muteState.set({ ...$muteState.get(), muted: false });
}
```

This handles the case where a keyboard shortcut (`volume_up`) raises volume while muted, automatically clearing mute state.

### Button Appearance

| State | Icon | `aria-pressed` | `aria-label` |
|-------|------|----------------|--------------|
| Not muted | `Volume2` | `false` | i18n `player_unmuted` ("Вимкнути звук" / "Mute") |
| Muted | `VolumeX` | `true` | i18n `player_muted` ("Увімкнути звук" / "Unmute") |

- Button is **enabled** only when `isActive` (state is `"playing"` or `"paused"`), consistent with other transport controls.
- `Volume2` icon is imported from `lucide-react` (already a dependency).

### Accessibility

- `aria-pressed` correctly communicates toggle state to NVDA.
- `aria-label` changes dynamically so the screen reader announces the current action ("Вимкнути звук" / "Увімкнути звук").
- After pressing, announce mute/unmute via `useAnnounce` with `"assertive"` priority.

### i18n

Add two new keys (replacing the single `player_mute` key that was a combined label):

| Key | uk | en |
|-----|----|----|
| `player_mute_action` | `"Вимкнути звук"` | `"Mute"` |
| `player_unmute_action` | `"Увімкнути звук"` | `"Unmute"` |

The existing `player_mute` key (`"Вимкнути/увімкнути звук"`) can be kept for backward compat or removed if unused.

## Data Flow

```
User presses Mute button
  → handleMute()
    → $muteState.set({ muted: true, savedVolume: 0.75 })
    → tauri.setVolume(0)
      → Rust emits PlayerStatus { volume: 0.0, ... }
        → handlePlayerStatus: volume == 0 → mute state unchanged ✓
          → $playerStatus.set({ volume: 0, ... })
            → VolumeSlider renders 0%

User presses Mute button again (unmute)
  → handleMute()
    → $muteState.set({ muted: false, savedVolume: 0.75 })
    → tauri.setVolume(0.75)
      → Rust emits PlayerStatus { volume: 0.75, ... }
        → handlePlayerStatus: volume > 0 && muted already false → no-op ✓
          → $playerStatus.set({ volume: 0.75, ... })
            → VolumeSlider renders 75%

Keyboard shortcut volume_up while muted
  → Rust: 0.0 + 0.05 = 0.05 → set_volume(0.05)
    → Rust emits PlayerStatus { volume: 0.05, ... }
      → handlePlayerStatus: volume > 0 && muted == true
        → $muteState.set({ muted: false, savedVolume: 0.75 }) ← auto-clear
          → VolumeSlider renders 5%, mute icon clears ✓
```

## Files Changed

| File | Change |
|------|--------|
| `src/stores/player.ts` | Add `$muteState` atom |
| `src/App.tsx` | Add mute-state cleanup in `handlePlayerStatus` |
| `src/components/player/PlayerPanel.tsx` | Implement `handleMute`, update button props, import `Volume2` |
| `src/i18n/messages/uk.json` | Add `player_mute_action`, `player_unmute_action` |
| `src/i18n/messages/en.json` | Add `player_mute_action`, `player_unmute_action` |

## Out of Scope

- Backend `muted` field (deferred; not needed for this phase)
- Persisting mute state across app restarts
- Muting when player is stopped
