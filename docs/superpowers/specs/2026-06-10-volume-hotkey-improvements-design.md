# Volume Hotkey Improvements — Design Spec

**Date:** 2026-06-10
**Branch:** feature/volume-hotkey-improvements (to be created)

## Problem

Changing volume via global hotkeys requires many keypresses — e.g., 10 presses to go from 50% to 100% at the current 5% step. Users expect to hold the key and have the volume sweep continuously.

## Goals

1. **Hold-to-repeat** — holding the volume hotkey continuously adjusts volume, like OS volume keys.
2. **Configurable step** — users can set the step (1–10%, default 5%) in settings.

## Out of scope

- Making repeat timing (initial delay, interval) user-configurable.
- Changing default step from 5%.
- Any changes to recording or other hotkeys.

---

## Technical constraint

`tauri-plugin-global-shortcut` v2.3.1 wraps `global-hotkey` v0.7.0. On Windows, `WM_HOTKEY` does not auto-repeat; the library exposes only `HotKeyState::Pressed` and `HotKeyState::Released` — no `Repeated` variant. Hold-to-repeat must be implemented manually.

---

## Design

### 1. `settings.rs` — new field

```rust
#[serde(default = "default_volume_step_percent")]
pub volume_step_percent: u8,
```

- Default: `5` (matches existing hardcoded behaviour)
- Range validated in UI only (1–10); backend clamps to `[1, 100]` if ever needed
- `#[serde(default)]` ensures old `settings.json` without this field loads cleanly

### 2. `shortcuts.rs` — hold-to-repeat + configurable step

Two module-level statics:
```rust
static VOLUME_UP_HELD: AtomicBool = AtomicBool::new(false);
static VOLUME_DOWN_HELD: AtomicBool = AtomicBool::new(false);
```

New async function:
```rust
async fn apply_volume_change(app: &AppHandle, direction: i8)
```
Reads `volume_step_percent` from `AppState.settings` on every call (no caching), computes new volume, calls `player.set_volume`.

Registration loop change — for `volume_up` / `volume_down` combos only:
- **Pressed**: if flag not already set → set flag, spawn async task:
  1. Apply change immediately
  2. Sleep 350 ms (initial delay)
  3. Loop: apply change, sleep 80 ms, check flag
- **Released**: clear flag → loop exits naturally

All other actions (`toggle_recording`, `stop_all`, `toggle_playback`, `toggle_window`) remain unchanged — `Pressed` only, existing debounce logic untouched.

Timing constants (fixed, not user-configurable):
```rust
const VOLUME_REPEAT_INITIAL_DELAY_MS: u64 = 350;
const VOLUME_REPEAT_INTERVAL_MS: u64 = 80;
```

`Cargo.toml`: verify `tokio` dep has `features = ["time"]`; add if absent.

### 3. `tauri.ts` — type

```ts
volumeStepPercent: number;
```

Added to the `GlobalSettings` interface.

### 4. `AudioTab.tsx` — settings UI

New `NumberField` inside the existing "Керування / Controls" section, after `prevRestartThreshold`:

```tsx
<NumberField
  value={settings.volumeStepPercent}
  onChange={(val) => { if (!Number.isNaN(val)) update({ volumeStepPercent: Math.min(10, Math.max(1, val)) }) }}
  minValue={1}
  maxValue={10}
  step={1}
>
  <Label>{m.settings_volume_step()}</Label>
  <Group className="mt-1 flex w-24">
    <Input className="..." />
  </Group>
</NumberField>
```

Uses existing `update()` + `useAutoSave` pattern — no new plumbing needed.

### 5. `VolumeSlider.tsx` — dynamic step

```tsx
const { volume } = useStore($playerStatus);
const step = useStore($settings)?.volumeStepPercent ?? 5;
// ...
<Slider step={step} ...>
```

Affects ArrowUp / ArrowDown keyboard navigation only. Drag precision is unaffected.

### 6. i18n

`src/i18n/messages/en.json`:
```json
"settings_volume_step": "Volume step (keys, %)"
```

`src/i18n/messages/uk.json`:
```json
"settings_volume_step": "Крок гучності (клавіші, %)"
```

---

## Data flow

```
User holds Ctrl+Shift+Up
  → WM_HOTKEY → Pressed event
    → VOLUME_UP_HELD = true
    → spawn task:
        apply_volume_change (+1 * step%)  ← immediate
        sleep 350ms
        loop while VOLUME_UP_HELD:
          apply_volume_change (+1 * step%)
          sleep 80ms
User releases keys
  → WM_HOTKEY → Released event
    → VOLUME_UP_HELD = false  ← loop exits
```

---

## Files changed

| File | Change |
|------|--------|
| `src-tauri/src/settings.rs` | Add `volume_step_percent: u8` field + default fn + tests |
| `src-tauri/src/shortcuts.rs` | Hold-to-repeat logic, `apply_volume_change` fn, use step from settings |
| `src-tauri/Cargo.toml` | Ensure `tokio` has `time` feature |
| `src/lib/tauri.ts` | Add `volumeStepPercent` to `GlobalSettings` type |
| `src/components/settings/AudioTab.tsx` | Add `NumberField` for step |
| `src/components/player/VolumeSlider.tsx` | Read step from `$settings` |
| `src/i18n/messages/en.json` | Add `settings_volume_step` |
| `src/i18n/messages/uk.json` | Add `settings_volume_step` |

---

## Edge cases

- **Step change takes effect immediately** — `apply_volume_change` reads from `AppState.settings` on every invocation; no restart needed.
- **Both keys held simultaneously** — each has its own `AtomicBool`; they operate independently.
- **`register_global_shortcuts` called again** (hotkey reconfiguration) — old flags are `false` by design (released before re-registration); no orphan tasks.
- **`settings.json` without `volumeStepPercent`** — serde default → 5; user's other settings survive.
