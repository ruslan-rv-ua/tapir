# Volume Hotkey Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hold-to-repeat behaviour to volume hotkeys and a user-configurable volume step (1–10%, default 5%) applied to both hotkeys and the VolumeSlider keyboard navigation.

**Architecture:** `WM_HOTKEY` on Windows does not auto-repeat, so hold-to-repeat is implemented manually: `Pressed` sets an `AtomicBool` and spawns a tokio task that loops with 350ms initial delay then 80ms intervals; `Released` clears the flag to exit the loop. A new `volume_step_percent: u8` field in `GlobalSettings` is read on every volume change so settings updates take effect immediately with no restart.

**Tech Stack:** Rust (tokio, tauri, serde), TypeScript, React (react-aria-components, nanostores), Paraglide i18n

---

## File Map

| File | Change |
|------|--------|
| `src-tauri/src/settings.rs` | Add `volume_step_percent: u8` field, default fn, tests |
| `src-tauri/src/shortcuts.rs` | Hold-to-repeat statics + `apply_volume_change`, update registration loop, remove stale volume arms from `handle_shortcut_action`, add tests |
| `src/lib/tauri.ts` | Add `volumeStepPercent: number` to `GlobalSettings` interface |
| `src/i18n/messages/en.json` | Add `settings_volume_step` key |
| `src/i18n/messages/uk.json` | Add `settings_volume_step` key |
| `src/components/settings/AudioTab.tsx` | Add `NumberField` for step after `prevRestartThreshold` |
| `src/components/player/VolumeSlider.tsx` | Read `volumeStepPercent` from `$settings`, pass as `step` |

---

## Task 1: Create the feature branch

**Files:** (none — git only)

- [ ] **Step 1: Create and switch to branch**

```bash
git checkout -b feature/volume-hotkey-improvements
```

Expected: `Switched to a new branch 'feature/volume-hotkey-improvements'`

---

## Task 2: Add `volume_step_percent` to Rust settings

**Files:**
- Modify: `src-tauri/src/settings.rs`

- [ ] **Step 1: Write the failing tests**

Open `src-tauri/src/settings.rs`. At the end of the `mod tests` block (after the last test, before the closing `}`), add:

```rust
    #[test]
    fn volume_step_defaults_to_5() {
        assert_eq!(GlobalSettings::default().volume_step_percent, 5);
    }

    #[test]
    fn legacy_config_without_volume_step_uses_default() {
        let json = r#"{"language":"en-US","theme":"auto","activeProfile":"Default"}"#;
        let s: GlobalSettings = serde_json::from_str(json).unwrap();
        assert_eq!(s.volume_step_percent, 5);
    }
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd src-tauri && cargo test volume_step 2>&1
```

Expected: compile error — `no field 'volume_step_percent'`

- [ ] **Step 3: Add the field to the struct**

In `GlobalSettings`, after the `prev_restart_threshold_ms` field:

```rust
    #[serde(default)]
    pub prev_restart_threshold_ms: u32,
    #[serde(default = "default_volume_step_percent")]
    pub volume_step_percent: u8,
```

- [ ] **Step 4: Add the default function**

After the line `fn default_true() -> bool { true }` (near the other default fns), add:

```rust
fn default_volume_step_percent() -> u8 { 5 }
```

- [ ] **Step 5: Add the field to the `Default` impl**

In `impl Default for GlobalSettings`, after `prev_restart_threshold_ms: 0`, add:

```rust
            prev_restart_threshold_ms: 0,
            volume_step_percent: 5,
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
cd src-tauri && cargo test volume_step 2>&1
```

Expected: both tests PASS

- [ ] **Step 7: Run all settings tests**

```bash
cd src-tauri && cargo test settings 2>&1
```

Expected: all pass, no regressions

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/settings.rs
git commit -m "feat(settings): add volume_step_percent field (default 5%)"
```

---

## Task 3: Update `shortcuts.rs` — hold-to-repeat + configurable step

**Files:**
- Modify: `src-tauri/src/shortcuts.rs`

### 3a — New imports, statics, constants, helper functions

- [ ] **Step 1: Update the import lines**

Replace:
```rust
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
```

With:
```rust
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
```

- [ ] **Step 2: Add statics and constants after `SHORTCUT_DEBOUNCE_MS`**

After the line `const SHORTCUT_DEBOUNCE_MS: u64 = 500;`, add:

```rust
static VOLUME_UP_HELD: AtomicBool = AtomicBool::new(false);
static VOLUME_DOWN_HELD: AtomicBool = AtomicBool::new(false);

const VOLUME_REPEAT_INITIAL_DELAY_MS: u64 = 350;
const VOLUME_REPEAT_INTERVAL_MS: u64 = 80;

fn volume_held_flag(action: &str) -> &'static AtomicBool {
    if action == "volume_up" { &VOLUME_UP_HELD } else { &VOLUME_DOWN_HELD }
}

async fn apply_volume_change(app: &AppHandle, direction: i8) {
    let state = app.state::<AppState>();
    let step = state.settings.read().await.volume_step_percent as f64 / 100.0;
    let status = state.player.get_status().await;
    let new_vol = if direction > 0 {
        (status.volume + step).min(1.0)
    } else {
        (status.volume - step).max(0.0)
    };
    let _ = state.player.set_volume(new_vol, app).await;
}
```

### 3b — Write new tests before changing the registration loop

- [ ] **Step 3: Write failing tests**

In the `mod tests` block, add after the existing `recently_fired_debounces_second_call` test:

```rust
    #[test]
    fn volume_held_flags_are_distinct() {
        assert!(!std::ptr::eq(
            volume_held_flag("volume_up"),
            volume_held_flag("volume_down"),
        ));
    }

    #[test]
    fn volume_held_swap_prevents_double_spawn() {
        let flag = volume_held_flag("volume_up");
        flag.store(false, Ordering::Relaxed);
        // First Pressed: flag was false → swap returns false → spawn proceeds
        assert!(!flag.swap(true, Ordering::Relaxed));
        // Spurious second Pressed: flag still true → swap returns true → spawn skipped
        assert!(flag.swap(true, Ordering::Relaxed));
        flag.store(false, Ordering::Relaxed); // restore module-level static
    }
```

- [ ] **Step 4: Run tests to confirm they pass (functions already added in Step 2)**

```bash
cd src-tauri && cargo test volume_held 2>&1
```

Expected: both PASS

### 3c — Update the registration loop

- [ ] **Step 5: Replace the shortcut callback inside the `for` loop**

In `register_global_shortcuts`, replace the entire `let result = manager.on_shortcut(...)` block (currently lines 32–36) with:

```rust
        let is_volume = action_name == "volume_up" || action_name == "volume_down";
        let result = manager.on_shortcut(combo.as_str(), move |app, _shortcut, event| {
            if is_volume {
                let dir: i8 = if action_name == "volume_up" { 1 } else { -1 };
                let held = volume_held_flag(&action_name);
                match event.state {
                    ShortcutState::Pressed => {
                        if !held.swap(true, Ordering::Relaxed) {
                            let app = app.clone();
                            tauri::async_runtime::spawn(async move {
                                apply_volume_change(&app, dir).await;
                                tokio::time::sleep(Duration::from_millis(VOLUME_REPEAT_INITIAL_DELAY_MS)).await;
                                while held.load(Ordering::Relaxed) {
                                    apply_volume_change(&app, dir).await;
                                    tokio::time::sleep(Duration::from_millis(VOLUME_REPEAT_INTERVAL_MS)).await;
                                }
                            });
                        }
                    }
                    ShortcutState::Released => {
                        held.store(false, Ordering::Relaxed);
                    }
                    _ => {}
                }
            } else if event.state == ShortcutState::Pressed {
                handle_shortcut_action(app, &action_name);
            }
        });
```

### 3d — Remove dead volume arms from `handle_shortcut_action`

- [ ] **Step 6: Remove the `volume_up` and `volume_down` match arms**

In `handle_shortcut_action`, remove these two arms entirely:

```rust
            "volume_up" => {
                let status = state.player.get_status().await;
                let new_vol = (status.volume + 0.05).min(1.0);
                let _ = state.player.set_volume(new_vol, &app).await;
            }
            "volume_down" => {
                let status = state.player.get_status().await;
                let new_vol = (status.volume - 0.05).max(0.0);
                let _ = state.player.set_volume(new_vol, &app).await;
            }
```

- [ ] **Step 7: Build to confirm it compiles**

```bash
cd src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Finished` with no errors

- [ ] **Step 8: Run all shortcuts tests**

```bash
cd src-tauri && cargo test shortcuts 2>&1
```

Expected: all 3 tests pass (recently_fired + both new volume_held tests)

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/shortcuts.rs
git commit -m "feat(shortcuts): hold-to-repeat for volume hotkeys, read step from settings"
```

---

## Task 4: Update TypeScript `GlobalSettings` type

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Add `volumeStepPercent` to the interface**

In `src/lib/tauri.ts`, find the `GlobalSettings` interface. After `prevRestartThresholdMs: number;`, add:

```ts
  volumeStepPercent: number;
```

The interface should look like:

```ts
export interface GlobalSettings {
  language: string;
  theme: "auto" | "dark" | "light";
  activeProfile: string;
  outputDevice: string | null;
  minimizeToTray: boolean;
  showTrayNotifications: boolean;
  showTrackInTitle: boolean;
  diskSpaceThresholdGb: number;
  doubleClickAction: "record" | "play";
  bandwidthLimitKbps: number;
  autostart: boolean;
  autoAdvance: boolean;
  prevRestartThresholdMs: number;
  volumeStepPercent: number;
  hotkeys: HotkeyMap;
  logRotation: boolean;
  logMaxSizeMb: number;
  logLevel: LogLevel;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/tauri.ts
git commit -m "feat(tauri-ts): add volumeStepPercent to GlobalSettings type"
```

---

## Task 5: Add i18n messages

**Files:**
- Modify: `src/i18n/messages/en.json`
- Modify: `src/i18n/messages/uk.json`

- [ ] **Step 1: Add English message**

In `src/i18n/messages/en.json`, after the `"settings_prev_restart_threshold"` key, add:

```json
  "settings_volume_step": "Volume step (keys, %)",
```

- [ ] **Step 2: Add Ukrainian message**

In `src/i18n/messages/uk.json`, after the `"settings_prev_restart_threshold"` key, add:

```json
  "settings_volume_step": "Крок гучності (клавіші, %)",
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/uk.json
git commit -m "feat(i18n): add settings_volume_step message"
```

---

## Task 6: Add `NumberField` to `AudioTab`

**Files:**
- Modify: `src/components/settings/AudioTab.tsx`

- [ ] **Step 1: Add the `NumberField` after `prevRestartThreshold`**

In `src/components/settings/AudioTab.tsx`, find the closing `</NumberField>` of the `prevRestartThreshold` field (around line 146). After it, inside the same `<div className="space-y-4 ...">` section, add:

```tsx
        {/* Volume step */}
        <NumberField
          value={settings.volumeStepPercent}
          onChange={(val) => {
            if (!Number.isNaN(val)) update({ volumeStepPercent: Math.min(10, Math.max(1, val)) });
          }}
          minValue={1}
          maxValue={10}
          step={1}
        >
          <Label className="block text-sm font-medium text-slate-300">
            {m.settings_volume_step()}
          </Label>
          <Group className="mt-1 flex w-24">
            <Input className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400" />
          </Group>
        </NumberField>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm vite:build 2>&1 | tail -10
```

Expected: build succeeds (paraglide generates `settings_volume_step` function automatically)

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/AudioTab.tsx
git commit -m "feat(ui): add volume step NumberField to AudioTab"
```

---

## Task 7: Update `VolumeSlider` — dynamic step

**Files:**
- Modify: `src/components/player/VolumeSlider.tsx`

- [ ] **Step 1: Import `$settings`**

In `src/components/player/VolumeSlider.tsx`, after the existing import of `$playerStatus`, add:

```tsx
import { $settings } from "../../stores/settings";
```

- [ ] **Step 2: Read the step inside the component**

At the top of the `VolumeSlider` function body, after `const { volume } = useStore($playerStatus);`, add:

```tsx
  const step = useStore($settings)?.volumeStepPercent ?? 5;
```

- [ ] **Step 3: Pass `step` to the `Slider`**

Change `step={1}` on the `<Slider>` component to:

```tsx
      step={step}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm vite:build 2>&1 | tail -10
```

Expected: build succeeds, no type errors

- [ ] **Step 5: Commit**

```bash
git add src/components/player/VolumeSlider.tsx
git commit -m "feat(ui): use configurable volume step in VolumeSlider keyboard navigation"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run all Rust tests**

```bash
cd src-tauri && cargo test 2>&1 | tail -15
```

Expected: all tests pass, no failures

- [ ] **Step 2: Run frontend tests**

```bash
pnpm test 2>&1 | tail -15
```

Expected: all tests pass

- [ ] **Step 3: Full production build**

```bash
pnpm build 2>&1 | tail -10
```

Expected: `Finished` Rust build + Vite bundle completes without errors
