# Disk-space Metric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show free disk space on the recording volume in the streams metrics card and the StatusBar, with a visual warning when it drops below the configured threshold.

**Architecture:** A read-only Tauri command `get_free_space` queries free bytes via Win32 `GetDiskFreeSpaceExW` on the active profile's recording volume. The frontend polls it every 30 s into a `$freeSpace` nanostore; the streams card and StatusBar read the store and apply a warning state when `free < threshold`.

**Tech Stack:** Rust + Tauri v2, `windows` crate (already a dependency), React 19, nanostores, Paraglide i18n (Vite plugin + CLI codegen), Vitest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-05-29-disk-space-metric-design.md](../specs/2026-05-29-disk-space-metric-design.md)

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src-tauri/Cargo.toml` | add `Win32_Storage_FileSystem` feature |
| `src-tauri/src/portable.rs` | shared path helpers: `resolve_output_dir`, `nearest_existing_dir` (+ tests) |
| `src-tauri/src/commands/songs_commands.rs` | use shared `resolve_output_dir` |
| `src-tauri/src/commands/settings_commands.rs` | `get_free_space` command + `free_bytes_on_volume` |
| `src-tauri/src/lib.rs` | register `get_free_space` |
| `src/i18n/messages/{en,uk}.json` | add `metric_free_space_low`, edit `settings_disk_threshold_desc` |
| `src/i18n/paraglide/` | regenerated output (committed) |
| `src/lib/formatters.ts` | `isLowDiskSpace` helper (+ tests) |
| `src/lib/tauri.ts` | `getFreeSpace()` wrapper |
| `src/stores/system.ts` | `$freeSpace` atom |
| `src/hooks/useDiskSpacePolling.ts` | 30 s polling hook (+ tests) |
| `src/App.tsx` | mount polling hook |
| `src/components/streams/FreeSpaceMetric.tsx` | presentational card (+ tests) |
| `src/components/streams/StreamsPanel.tsx` | render `FreeSpaceMetric` in metrics grid |
| `src/components/layout/StatusBar.tsx` | free-space segment + warning |

---

## Task 1: Backend — shared path helpers

**Files:**
- Modify: `src-tauri/src/portable.rs`
- Modify: `src-tauri/src/commands/songs_commands.rs:11-19,34,82,122`

- [ ] **Step 1: Write the failing tests in `portable.rs`**

Append to `src-tauri/src/portable.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_output_dir_absolute_is_unchanged() {
        let abs = if cfg!(windows) { "C:\\music" } else { "/music" };
        assert_eq!(resolve_output_dir(abs), PathBuf::from(abs));
    }

    #[test]
    fn resolve_output_dir_relative_joins_data_dir() {
        assert_eq!(resolve_output_dir("recordings"), data_dir().join("recordings"));
    }

    #[test]
    fn nearest_existing_dir_returns_self_when_present() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(
            nearest_existing_dir(tmp.path()),
            Some(tmp.path().to_path_buf())
        );
    }

    #[test]
    fn nearest_existing_dir_climbs_to_existing_ancestor() {
        let tmp = tempfile::tempdir().unwrap();
        let missing = tmp.path().join("a").join("b").join("c");
        assert_eq!(
            nearest_existing_dir(&missing),
            Some(tmp.path().to_path_buf())
        );
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri; cargo test --lib portable::tests`
Expected: FAIL — `cannot find function resolve_output_dir` / `nearest_existing_dir`.

- [ ] **Step 3: Implement the helpers in `portable.rs`**

Change the top `use` line and add two functions. Current top:

```rust
use std::path::PathBuf;
use tracing::info;
```

Replace with:

```rust
use std::path::{Path, PathBuf};
use tracing::info;
```

Add after `recordings_dir()` (before `ensure_data_dirs`):

```rust
/// Resolve a (possibly relative) recording output dir to an absolute path.
/// Relative paths are joined onto `data_dir()`.
pub fn resolve_output_dir(rel: &str) -> PathBuf {
    let p = PathBuf::from(rel);
    if p.is_absolute() {
        p
    } else {
        data_dir().join(p)
    }
}

/// Walk up from `path` until an existing directory is found.
/// Returns `None` if no ancestor exists (should not happen on a mounted volume).
pub fn nearest_existing_dir(path: &Path) -> Option<PathBuf> {
    let mut p = path.to_path_buf();
    loop {
        if p.exists() {
            return Some(p);
        }
        if !p.pop() {
            return None;
        }
    }
}
```

- [ ] **Step 4: Replace the duplicate in `songs_commands.rs`**

Delete the private fn at `songs_commands.rs:11-19`:

```rust
/// Resolve `recording.output_dir` (which may be relative) to an absolute path.
fn resolve_output_dir(rel: &str) -> PathBuf {
    let p = PathBuf::from(rel);
    if p.is_absolute() {
        p
    } else {
        portable::data_dir().join(p)
    }
}
```

Then update its three call sites (lines ~34, ~82, ~122) from `resolve_output_dir(&profile.recording.output_dir)` to `portable::resolve_output_dir(&profile.recording.output_dir)`.

- [ ] **Step 5: Run tests + build**

Run: `cd src-tauri; cargo test --lib portable::tests`
Expected: PASS (4 tests).
Run: `cd src-tauri; cargo build`
Expected: builds clean (no unused-import warning for `PathBuf` in songs_commands — it is still used by `format_from_path`/other fns; if a warning appears, leave the `use` line as-is since other items need it).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/portable.rs src-tauri/src/commands/songs_commands.rs
git commit -m "refactor(paths): extract shared resolve_output_dir + nearest_existing_dir"
```

---

## Task 2: Backend — `get_free_space` command

**Files:**
- Modify: `src-tauri/Cargo.toml:73-77`
- Modify: `src-tauri/src/commands/settings_commands.rs`
- Modify: `src-tauri/src/lib.rs:95` (handler list)

- [ ] **Step 1: Add the Win32 feature in `Cargo.toml`**

Change:

```toml
windows = { version = "0.62", features = [
    "Win32_UI_WindowsAndMessaging",
    "Win32_UI_Shell",
    "Win32_Foundation",
] }
```

to:

```toml
windows = { version = "0.62", features = [
    "Win32_UI_WindowsAndMessaging",
    "Win32_UI_Shell",
    "Win32_Foundation",
    "Win32_Storage_FileSystem",
] }
```

- [ ] **Step 2: Add the command + helper in `settings_commands.rs`**

Append to `src-tauri/src/commands/settings_commands.rs`:

```rust
/// Free bytes available to the caller on the volume hosting `dir`.
/// Climbs to the nearest existing ancestor so a not-yet-created output dir
/// still reports its volume.
fn free_bytes_on_volume(dir: &std::path::Path) -> Result<u64, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    use windows::core::PCWSTR;

    let base = crate::portable::nearest_existing_dir(dir)
        .ok_or_else(|| "no existing ancestor directory".to_string())?;
    let wide: Vec<u16> = base
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut free_to_caller: u64 = 0;
    unsafe {
        GetDiskFreeSpaceExW(
            PCWSTR(wide.as_ptr()),
            Some(&mut free_to_caller as *mut u64),
            None,
            None,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(free_to_caller)
}

#[tauri::command]
pub async fn get_free_space(state: tauri::State<'_, AppState>) -> Result<u64, String> {
    let dir = {
        let profile = state.active_profile.read().await;
        crate::portable::resolve_output_dir(&profile.recording.output_dir)
    };
    tokio::task::spawn_blocking(move || free_bytes_on_volume(&dir))
        .await
        .map_err(|e| e.to_string())?
}
```

Note: `AppState` is already imported at the top of this file (`use crate::app_state::AppState;`).

- [ ] **Step 3: Register the command in `lib.rs`**

In the `tauri::generate_handler![ ... ]` list, after `commands::settings_commands::save_recording_settings,` add:

```rust
            commands::settings_commands::get_free_space,
```

- [ ] **Step 4: Build**

Run: `cd src-tauri; cargo build`
Expected: builds clean. (If `GetDiskFreeSpaceExW` is not found, double-check the `Win32_Storage_FileSystem` feature was added correctly.)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/commands/settings_commands.rs src-tauri/src/lib.rs
git commit -m "feat(disk): add get_free_space command via GetDiskFreeSpaceExW"
```

---

## Task 3: i18n keys + description fix

**Files:**
- Modify: `src/i18n/messages/en.json:187,280-281`
- Modify: `src/i18n/messages/uk.json:187,280-281`
- Generated (committed): `src/i18n/paraglide/messages/metric_free_space_low.js`, regenerated `settings_disk_threshold_desc.js`

- [ ] **Step 1: Edit `en.json`**

Change the `settings_disk_threshold_desc` value:

```json
  "settings_disk_threshold_desc": "Stop recording when disk space is low. 0 = disabled",
```

to:

```json
  "settings_disk_threshold_desc": "Warn when free disk space drops below this threshold. 0 = disabled",
```

After the `"metric_free_space_unavailable"` line, add:

```json
  "metric_free_space_low": "Free space low: {space}",
```

(Ensure correct comma placement — add a trailing comma to the preceding line if it is now followed by this new key.)

- [ ] **Step 2: Edit `uk.json`**

Change the `settings_disk_threshold_desc` value:

```json
  "settings_disk_threshold_desc": "Зупинити запис при низькому місці на диску. 0 = вимкнено",
```

to:

```json
  "settings_disk_threshold_desc": "Попереджати, коли вільного місця менше за поріг. 0 = вимкнено",
```

After the `"metric_free_space_unavailable"` line, add:

```json
  "metric_free_space_low": "Мало вільного місця: {space}",
```

- [ ] **Step 3: Run paraglide codegen**

Run: `npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/i18n/paraglide`
Expected: creates `src/i18n/paraglide/messages/metric_free_space_low.js`, updates `_index.js` and `settings_disk_threshold_desc.js`.

- [ ] **Step 4: Verify the generated function exists**

Run: `node -e "import('./src/i18n/paraglide/messages/metric_free_space_low.js').then(m => console.log(typeof m.metric_free_space_low, m.metric_free_space_low({space:'2 GB'}, {locale:'en'})))"`
Expected: `function Free space low: 2 GB`

- [ ] **Step 5: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/uk.json src/i18n/paraglide/
git commit -m "feat(i18n): add low-disk message; fix disk-threshold description"
```

---

## Task 4: Frontend lib — `isLowDiskSpace`, `getFreeSpace`, `$freeSpace`

**Files:**
- Modify: `src/lib/formatters.ts`
- Test: `src/lib/formatters.test.ts` (create if absent)
- Modify: `src/lib/tauri.ts`
- Create: `src/stores/system.ts`

- [ ] **Step 1: Write the failing test for `isLowDiskSpace`**

Create/append `src/lib/formatters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isLowDiskSpace } from "./formatters";

const GiB = 1024 ** 3;

describe("isLowDiskSpace", () => {
  it("is false when threshold is 0 (disabled)", () => {
    expect(isLowDiskSpace(0, 0)).toBe(false);
  });
  it("is false when free space is null (unknown)", () => {
    expect(isLowDiskSpace(null, 5)).toBe(false);
  });
  it("is true when free bytes are below threshold", () => {
    expect(isLowDiskSpace(2 * GiB, 5)).toBe(true);
  });
  it("is false when free bytes are at or above threshold", () => {
    expect(isLowDiskSpace(5 * GiB, 5)).toBe(false);
    expect(isLowDiskSpace(6 * GiB, 5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/formatters.test.ts`
Expected: FAIL — `isLowDiskSpace is not a function`.

- [ ] **Step 3: Implement `isLowDiskSpace` in `formatters.ts`**

Append to `src/lib/formatters.ts`:

```ts
/** True when free disk space is known and below the threshold. 0 = disabled. */
export function isLowDiskSpace(freeBytes: number | null, thresholdGb: number): boolean {
  if (thresholdGb <= 0 || freeBytes === null) return false;
  return freeBytes < thresholdGb * 1024 ** 3;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/formatters.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Add the `getFreeSpace` wrapper in `tauri.ts`**

After the `getSettings` wrapper (around line 148), add:

```ts
export async function getFreeSpace(): Promise<number> {
  return invoke("get_free_space");
}
```

- [ ] **Step 6: Create the store `src/stores/system.ts`**

```ts
import { atom } from "nanostores";

/** Free bytes on the recording volume. null = unavailable/unknown. */
export const $freeSpace = atom<number | null>(null);
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/formatters.ts src/lib/formatters.test.ts src/lib/tauri.ts src/stores/system.ts
git commit -m "feat(disk): add isLowDiskSpace, getFreeSpace wrapper, $freeSpace store"
```

---

## Task 5: Polling hook + mount

**Files:**
- Create: `src/hooks/useDiskSpacePolling.ts`
- Test: `src/hooks/useDiskSpacePolling.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useDiskSpacePolling.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import * as tauri from "../lib/tauri";
import { $freeSpace } from "../stores/system";
import { useDiskSpacePolling } from "./useDiskSpacePolling";

vi.mock("../lib/tauri", () => ({
  getFreeSpace: vi.fn(),
}));

function Harness() {
  useDiskSpacePolling();
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  $freeSpace.set(null);
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useDiskSpacePolling", () => {
  it("fetches once on mount and writes the store", async () => {
    vi.mocked(tauri.getFreeSpace).mockResolvedValue(1234);
    render(<Harness />);
    await vi.waitFor(() => expect($freeSpace.get()).toBe(1234));
    expect(tauri.getFreeSpace).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after 30s", async () => {
    vi.mocked(tauri.getFreeSpace).mockResolvedValue(1);
    render(<Harness />);
    await vi.waitFor(() => expect(tauri.getFreeSpace).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(tauri.getFreeSpace).toHaveBeenCalledTimes(2);
  });

  it("sets store to null on error", async () => {
    $freeSpace.set(999);
    vi.mocked(tauri.getFreeSpace).mockRejectedValue(new Error("boom"));
    render(<Harness />);
    await vi.waitFor(() => expect($freeSpace.get()).toBeNull());
  });

  it("stops polling after unmount", async () => {
    vi.mocked(tauri.getFreeSpace).mockResolvedValue(1);
    const { unmount } = render(<Harness />);
    await vi.waitFor(() => expect(tauri.getFreeSpace).toHaveBeenCalledTimes(1));
    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tauri.getFreeSpace).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useDiskSpacePolling.test.tsx`
Expected: FAIL — cannot resolve `./useDiskSpacePolling`.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useDiskSpacePolling.ts`:

```ts
import { useEffect } from "react";
import { getFreeSpace } from "../lib/tauri";
import { $freeSpace } from "../stores/system";

const POLL_INTERVAL_MS = 30_000;

/** Polls free disk space into the $freeSpace store on mount and every 30s. */
export function useDiskSpacePolling(): void {
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      getFreeSpace()
        .then((bytes) => {
          if (!cancelled) $freeSpace.set(bytes);
        })
        .catch(() => {
          if (!cancelled) $freeSpace.set(null);
        });
    };
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useDiskSpacePolling.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Mount the hook in `App.tsx`**

Add the import near the other hook imports (after `import { useTauriEvent } from "./hooks/useTauriEvent";`):

```tsx
import { useDiskSpacePolling } from "./hooks/useDiskSpacePolling";
```

Inside the `App` component body, near the other `useTauriEvent(...)` calls (around line 278), add:

```tsx
  useDiskSpacePolling();
```

- [ ] **Step 6: Verify the suite still passes**

Run: `npx vitest run`
Expected: PASS (all tests).

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useDiskSpacePolling.ts src/hooks/useDiskSpacePolling.test.tsx src/App.tsx
git commit -m "feat(disk): poll free space every 30s into $freeSpace"
```

---

## Task 6: Streams metric card (`FreeSpaceMetric`)

**Files:**
- Create: `src/components/streams/FreeSpaceMetric.tsx`
- Test: `src/components/streams/FreeSpaceMetric.test.tsx`
- Modify: `src/components/streams/StreamsPanel.tsx:288-296` and imports

- [ ] **Step 1: Write the failing test**

Create `src/components/streams/FreeSpaceMetric.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FreeSpaceMetric } from "./FreeSpaceMetric";

const GiB = 1024 ** 3;

describe("FreeSpaceMetric", () => {
  it("shows the dash and unavailable aria when free space is null", () => {
    render(<FreeSpaceMetric freeBytes={null} thresholdGb={1} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/not available|недоступно/i),
    );
  });

  it("shows the formatted value when available", () => {
    render(<FreeSpaceMetric freeBytes={5 * GiB} thresholdGb={1} />);
    expect(screen.getByText("5.00 GB")).toBeInTheDocument();
  });

  it("applies the low-space warning aria when below threshold", () => {
    render(<FreeSpaceMetric freeBytes={2 * GiB} thresholdGb={5} />);
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/low|мало/i),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/streams/FreeSpaceMetric.test.tsx`
Expected: FAIL — cannot resolve `./FreeSpaceMetric`.

- [ ] **Step 3: Implement `FreeSpaceMetric.tsx`**

Create `src/components/streams/FreeSpaceMetric.tsx`:

```tsx
import { formatBytes, isLowDiskSpace } from "../../lib/formatters";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  freeBytes: number | null;
  thresholdGb: number;
}

export function FreeSpaceMetric({ freeBytes, thresholdGb }: Props) {
  const low = isLowDiskSpace(freeBytes, thresholdGb);
  const valueText = freeBytes === null ? "—" : formatBytes(freeBytes);

  const ariaLabel =
    freeBytes === null
      ? m.metric_free_space_unavailable()
      : low
        ? m.metric_free_space_low({ space: valueText })
        : `${m.metric_free_space()}: ${valueText}`;

  return (
    <div
      role="status"
      aria-atomic="true"
      aria-label={ariaLabel}
      className={
        "flex flex-col gap-1.5 rounded-2xl border p-4 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas] " +
        (low
          ? "border-amber-500/40 bg-amber-500/[.06] forced-colors:text-[CanvasText]"
          : "border-white/[.06] bg-white/[.04]")
      }
    >
      <strong className={low ? "text-sm text-amber-300" : "text-sm text-slate-100"}>
        {valueText}
      </strong>
      <span className="text-xs text-slate-400">{m.metric_free_space()}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/streams/FreeSpaceMetric.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire `FreeSpaceMetric` into `StreamsPanel.tsx`**

Add imports near the top (after the existing store imports):

```tsx
import { $freeSpace } from "../../stores/system";
import { FreeSpaceMetric } from "./FreeSpaceMetric";
```

In the component body, near the other `useStore` calls (after `const settings = useStore($settings);`), add:

```tsx
  const freeSpace = useStore($freeSpace);
```

Replace the stub card at lines 288-296:

```tsx
            <div
              role="status"
              aria-atomic="true"
              aria-label={m.metric_free_space_unavailable()}
              className="flex flex-col gap-1.5 rounded-2xl border border-white/[.06] bg-white/[.04] p-4 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas]"
            >
              <strong className="text-sm text-slate-100" aria-hidden="true">—</strong>
              <span className="text-xs text-slate-400" aria-hidden="true">{m.metric_free_space()}</span>
            </div>
```

with:

```tsx
            <FreeSpaceMetric
              freeBytes={freeSpace}
              thresholdGb={settings?.diskSpaceThresholdGb ?? 0}
            />
```

- [ ] **Step 6: Verify build + suite**

Run: `npx vitest run`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/streams/FreeSpaceMetric.tsx src/components/streams/FreeSpaceMetric.test.tsx src/components/streams/StreamsPanel.tsx
git commit -m "feat(disk): show free space in streams metrics card with low warning"
```

---

## Task 7: StatusBar free-space segment

**Files:**
- Modify: `src/components/layout/StatusBar.tsx`
- Test: `src/components/layout/StatusBar.test.tsx` (create if absent)

- [ ] **Step 1: Write the failing test**

Create `src/components/layout/StatusBar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { StatusBar } from "./StatusBar";
import { $statuses } from "../../stores/streams";
import { $freeSpace } from "../../stores/system";
import { $settings } from "../../stores/settings";

const GiB = 1024 ** 3;

beforeEach(() => {
  $statuses.set({});
  $freeSpace.set(null);
  $settings.set(null);
});

function renderBar() {
  const ref = createRef<ZoneEntry>();
  return render(<StatusBar ref={ref} exitZone={() => {}} />);
}

describe("StatusBar free-space segment", () => {
  it("renders a dash when free space is unknown", () => {
    renderBar();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the formatted free space when known", () => {
    $freeSpace.set(5 * GiB);
    renderBar();
    expect(screen.getByText("5.00 GB")).toBeInTheDocument();
  });

  it("marks the segment low when below threshold", () => {
    $freeSpace.set(2 * GiB);
    $settings.set({ diskSpaceThresholdGb: 5 } as never);
    renderBar();
    const seg = screen.getByText("2.00 GB").closest("div")!;
    expect(seg.getAttribute("aria-label")).toMatch(/low|мало/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/StatusBar.test.tsx`
Expected: FAIL — no "—" / "5.00 GB" present (no free-space segment yet).

- [ ] **Step 3: Implement the segment in `StatusBar.tsx`**

Add imports after the existing store import:

```tsx
import { $freeSpace } from "../../stores/system";
import { $settings } from "../../stores/settings";
import { formatBytes, formatDuration, isLowDiskSpace } from "../../lib/formatters";
```

(Replace the existing `import { formatDuration } from "../../lib/formatters";` line — do not leave a duplicate `formatDuration` import.)

Read the stores in the component body, after `const statuses = useStore($statuses);`:

```tsx
  const freeSpace = useStore($freeSpace);
  const settings = useStore($settings);
  const freeLow = isLowDiskSpace(freeSpace, settings?.diskSpaceThresholdGb ?? 0);
  const freeText = freeSpace === null ? "—" : formatBytes(freeSpace);
  const freeAria = freeLow
    ? m.metric_free_space_low({ space: freeText })
    : `${m.metric_free_space()}: ${freeText}`;
```

Add a third segment ref. Change:

```tsx
  const seg0Ref = useRef<HTMLDivElement | null>(null);
  const seg1Ref = useRef<HTMLDivElement | null>(null);
  const segRefs = useMemo(() => [seg0Ref, seg1Ref], []);
```

to:

```tsx
  const seg0Ref = useRef<HTMLDivElement | null>(null);
  const seg1Ref = useRef<HTMLDivElement | null>(null);
  const seg2Ref = useRef<HTMLDivElement | null>(null);
  const segRefs = useMemo(() => [seg0Ref, seg1Ref, seg2Ref], []);
```

The longest-recording segment moves to index 2 (it stays the conditional, last segment). Update its `ref` from `seg1Ref` to `seg2Ref` and its `getTabIndex(1)`/`tabIndex` to `getTabIndex(2)`.

Update the focus-reset effect to use the new last index:

```tsx
  // Reset to seg0 when the conditional last segment (seg2) unmounts
  useEffect(() => {
    if (longestMs === 0) moveTo(0);
  }, [longestMs, moveTo]);
```

(The body is unchanged; only the comment is updated for clarity.)

Insert the always-present free-space segment as index 1, between the recordings segment and the conditional longest-recording segment:

```tsx
      <div
        ref={seg1Ref}
        tabIndex={getTabIndex(1)}
        aria-label={freeAria}
        className={
          "cursor-default rounded px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 " +
          (freeLow ? "text-amber-300" : "")
        }
      >
        <strong className={freeLow ? "text-amber-300" : "text-slate-200"}>{freeText}</strong>
      </div>
```

The longest-recording block (now index 2) becomes:

```tsx
      {longestMs > 0 && (
        <div
          ref={seg2Ref}
          tabIndex={getTabIndex(2)}
          aria-label={`${m.segment_longest_recording()}: ${formatDuration(longestMs)}`}
          className="cursor-default rounded px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
        >
          <strong className="text-slate-200">{formatDuration(longestMs)}</strong>
        </div>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/layout/StatusBar.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify full suite + types**

Run: `npx vitest run`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/StatusBar.tsx src/components/layout/StatusBar.test.tsx
git commit -m "feat(disk): add free-space segment to StatusBar with low warning"
```

---

## Task 8: Manual verification + final build

- [ ] **Step 1: Type-check and full test suite**

Run: `npx tsc --noEmit; npx vitest run`
Expected: both clean.

- [ ] **Step 2: Release build of the Rust side**

Run: `cd src-tauri; cargo build`
Expected: clean build.

- [ ] **Step 3: Manual smoke (optional, requires app run)**

Run: `pnpm tauri dev`
Verify:
- Streams screen 4th metric card shows a real free-space value (e.g. "123.45 GB"), not "—".
- StatusBar shows the same free-space value as a focusable segment; F6 to the Status Bar zone and arrow across segments works.
- Set Disk threshold (GB) in Settings above current free space → card and StatusBar segment turn amber; screen reader announces the "low" label.
- Set threshold to 0 → warning disappears.

- [ ] **Step 4: No commit needed unless smoke testing surfaced a fix.**

---

## Self-Review Notes

- **Spec coverage:** backend command (Task 2) ✓; path reuse (Task 1) ✓; store + polling (Tasks 4–5) ✓; card (Task 6) ✓; StatusBar segment with stable roving-focus indices (Task 7) ✓; threshold visual-only warning via `isLowDiskSpace` ✓; i18n new key + description fix + codegen (Task 3) ✓; tests at each layer ✓.
- **Type consistency:** `getFreeSpace(): Promise<number>` ↔ Rust `Result<u64>`; `$freeSpace: atom<number | null>`; `isLowDiskSpace(freeBytes: number | null, thresholdGb: number)`; `metric_free_space_low({ space })` used consistently in `FreeSpaceMetric` and `StatusBar`.
- **Out of scope (confirmed not built):** stop-recording, toasts, scheduler events, capacity/percentage.
