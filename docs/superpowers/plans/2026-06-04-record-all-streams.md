# Record-all-streams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a primary "Записати все" button to the Streams toolbar that starts recording every stream in the active profile, and relabel the existing stop button to «Зупинити запис» so its recording intent is explicit.

**Architecture:** Server-side `start_all` on `StreamManager` (mirrors `stop_all`) exposed via a `start_all_recordings` IPC command; a thin TS wrapper; a new primary button wired into the existing roving-focus toolbar in `StreamsPanel`. The manager owns the "which streams are active" logic via its `entries` map, so the command skips already-recording streams and is resilient to per-stream failures.

**Tech Stack:** Rust (Tauri v2, tokio), React 19 + nanostores, paraglide i18n (compiled by the `@inlang/paraglide-vite` plugin), vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-record-all-streams-design.md`

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `src-tauri/src/stream/manager.rs` | Modify | Add `StreamManager::start_all` (+ signature test) |
| `src-tauri/src/commands/stream_commands.rs` | Modify | Add `start_all_recordings` command |
| `src-tauri/src/lib.rs` | Modify | Register the new command |
| `src/lib/tauri.ts` | Modify | `startAllRecordings()` IPC wrapper |
| `src/i18n/messages/uk.json` | Modify | `record_all`, relabel `stop_all`, announce keys |
| `src/i18n/messages/en.json` | Modify | Same keys (English) |
| `src/i18n/paraglide/messages/**` | Regenerated | Compiled message output (committed) |
| `src/components/streams/StreamsPanel.tsx` | Modify | Button, relabel, roving focus, disabled, announce |
| `src/components/streams/StreamsPanel.test.tsx` | Modify | Tests for the above |

**Note on gates:** `tsc` has ~51 pre-existing untyped-paraglide errors and is **not** a gate. The real gates are `pnpm test`, `pnpm vite:build`, and `cargo test`/`cargo build`. `pnpm vite:build` does not run `tsc`, so it passes despite those type errors and it regenerates the paraglide output.

---

## Task 1: Backend — `StreamManager::start_all`

**Files:**
- Modify: `src-tauri/src/stream/manager.rs` (add method after `stop_all_async`, ~line 230; add test inside `mod tests`, ~line 954)

- [ ] **Step 1: Write the failing signature test**

Add inside the existing `mod tests { ... }` block (next to `stop_all_async_returns_handles_for_active_entries`):

```rust
    #[test]
    fn start_all_has_expected_signature() {
        // Contract check: a full behavioural test needs a Tauri AppHandle, which
        // isn't available in a unit test. Mirror the stop_all_async test and just
        // pin the signature so refactors can't silently change it.
        let _: fn(
            &mut StreamManager,
            Vec<StreamInfo>,
            RecordingSettings,
            Arc<RwLock<StreamManager>>,
        ) -> usize = StreamManager::start_all;
    }
```

(`StreamInfo`, `RecordingSettings`, `Arc`, `RwLock` are all in scope via the module's `use super::*;`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml start_all_has_expected_signature`
Expected: **compile error** — `no associated item named start_all found for struct StreamManager`.

- [ ] **Step 3: Implement `start_all`**

Add this method immediately after `stop_all_async` (after the closing brace of `stop_all_async`, around line 230):

```rust
    /// Start recording every stream not already active. Returns the number of
    /// streams newly started. Streams already present in `entries`
    /// (recording / connecting / reconnecting) are skipped; a per-stream start
    /// error is logged and does NOT abort the batch.
    pub fn start_all(
        &mut self,
        streams: Vec<StreamInfo>,
        settings: RecordingSettings,
        manager_ref: Arc<RwLock<Self>>,
    ) -> usize {
        let mut started = 0;
        for stream in streams {
            if self.entries.contains_key(&stream.id) {
                continue;
            }
            match self.start_recording(stream, settings.clone(), manager_ref.clone()) {
                Ok(()) => started += 1,
                Err(e) => warn!("start_all: failed to start stream: {}", e),
            }
        }
        started
    }
```

(`warn!` is already imported at the top of the file: `use log::{info, warn, error, debug};`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml start_all_has_expected_signature`
Expected: **PASS** — `test result: ok. 1 passed`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/stream/manager.rs
git commit -m "feat(streams): add StreamManager::start_all" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Backend — `start_all_recordings` command

**Files:**
- Modify: `src-tauri/src/commands/stream_commands.rs` (add command after `stop_all_recordings`, ~line 144)
- Modify: `src-tauri/src/lib.rs` (register in `generate_handler!`, ~line 150)

- [ ] **Step 1: Add the command**

In `src-tauri/src/commands/stream_commands.rs`, immediately after the `stop_all_recordings` function (which ends ~line 144), add:

```rust
#[tauri::command]
pub async fn start_all_recordings(state: tauri::State<'_, AppState>) -> Result<usize, String> {
    let (streams, settings) = {
        let profile = state.active_profile.read().await;
        (profile.streams.clone(), profile.recording.clone())
    };

    let manager_arc = state.stream_manager.clone();
    let mut manager = manager_arc.write().await;
    Ok(manager.start_all(streams, settings, manager_arc.clone()))
}
```

(No new `use` lines needed: `AppState` and `StreamInfo` are already imported at the top of the file; `RecordingSettings` is inferred from `profile.recording`.)

- [ ] **Step 2: Register the command**

In `src-tauri/src/lib.rs`, inside the `tauri::generate_handler![ ... ]` list, add a line directly after `commands::stream_commands::stop_all_recordings,` (line 150):

```rust
            commands::stream_commands::start_all_recordings,
```

- [ ] **Step 3: Verify it compiles**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: **`Finished`** with no errors (warnings about unrelated dead-code scaffolding are fine).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/stream_commands.rs src-tauri/src/lib.rs
git commit -m "feat(streams): add start_all_recordings command" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Frontend plumbing — IPC wrapper + i18n

**Files:**
- Modify: `src/lib/tauri.ts` (add wrapper after `stopAllRecordings`, ~line 142)
- Modify: `src/i18n/messages/uk.json`
- Modify: `src/i18n/messages/en.json`
- Regenerated: `src/i18n/paraglide/messages/**` (via `pnpm vite:build`)

- [ ] **Step 1: Add the IPC wrapper**

In `src/lib/tauri.ts`, directly after the `stopAllRecordings` function (line 142), add:

```ts
export async function startAllRecordings(): Promise<number> {
  return invoke("start_all_recordings");
}
```

- [ ] **Step 2: Edit Ukrainian messages**

In `src/i18n/messages/uk.json`, replace the existing `stop_all` line (line 91):

```json
  "stop_all": "Зупинити всі",
```

with both an added `record_all` key and the relabeled `stop_all`:

```json
  "record_all": "Записати все",
  "stop_all": "Зупинити запис",
```

Then, directly after the `active_recordings_many` line (line 286):

```json
  "active_recordings_many": "{count} записів",
```

add the four pluralized announce keys:

```json
  "active_recordings_many": "{count} записів",
  "record_all_announce_zero": "Немає потоків для запису",
  "record_all_announce_one": "Розпочато запис: {count} потік",
  "record_all_announce_few": "Розпочато запис: {count} потоки",
  "record_all_announce_many": "Розпочато запис: {count} потоків",
```

- [ ] **Step 3: Edit English messages**

In `src/i18n/messages/en.json`, replace the existing `stop_all` line (line 91):

```json
  "stop_all": "Stop all",
```

with:

```json
  "record_all": "Record all",
  "stop_all": "Stop recording",
```

Then, directly after the `active_recordings_many` line (line 286):

```json
  "active_recordings_many": "{count} recordings",
```

add:

```json
  "active_recordings_many": "{count} recordings",
  "record_all_announce_zero": "No streams to record",
  "record_all_announce_one": "Recording started: {count} stream",
  "record_all_announce_few": "Recording started: {count} streams",
  "record_all_announce_many": "Recording started: {count} streams",
```

- [ ] **Step 4: Regenerate paraglide output and verify the build**

Run: `pnpm vite:build`
Expected: build succeeds (`✓ built in …`). This runs the `@inlang/paraglide-vite` plugin, which recompiles `src/i18n/messages/*.json` into `src/i18n/paraglide/messages/**`.

- [ ] **Step 5: Confirm the new messages compiled**

Run: `git status --short src/i18n/paraglide` (Expected: modified files listed) and verify the keys exist:
Run (PowerShell): `Select-String -Path src/i18n/paraglide/messages/*.js -Pattern "record_all" -List`
Expected: at least one match (the generated `record_all` / `record_all_announce_*` exports).

- [ ] **Step 6: Commit**

```bash
git add src/lib/tauri.ts src/i18n/messages/uk.json src/i18n/messages/en.json src/i18n/paraglide
git commit -m "feat(streams): i18n + IPC wrapper for record-all" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: StreamsPanel — Record-all button, relabel, wiring + tests

**Files:**
- Modify: `src/components/streams/StreamsPanel.test.tsx`
- Modify: `src/components/streams/StreamsPanel.tsx`

- [ ] **Step 1: Add the failing tests**

In `src/components/streams/StreamsPanel.test.tsx`:

(a) Add `fireEvent` to the testing-library import and add a namespaced tauri import. Change the top imports:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
import * as tauri from "../../lib/tauri";
import { $streams, $statuses, $streamFilter } from "../../stores/streams";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import { StreamsPanel } from "./StreamsPanel";
```

(b) Add `startAllRecordings` to the tauri mock object (inside the `vi.mock("../../lib/tauri", () => ({ ... }))` factory):

```ts
  startAllRecordings: vi.fn().mockResolvedValue(0),
```

(c) Append these two describe blocks to the end of the file:

```ts
describe("StreamsPanel — record all", () => {
  it("renders the Record-all primary button", () => {
    renderPanel();
    expect(
      screen.getByRole("button", { name: /записати все|record all/i }),
    ).toBeTruthy();
  });

  it("calls startAllRecordings when clicked", async () => {
    renderPanel();
    const btn = screen.getByRole("button", { name: /записати все|record all/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(tauri.startAllRecordings).toHaveBeenCalledOnce();
  });

  it("disables Record-all when every stream is already active", () => {
    $streams.set([mkStream("a", "Alpha")]);
    $statuses.set({ a: mkStatus("a", "recording") });
    renderPanel();
    const btn = screen.getByRole("button", {
      name: /записати все|record all/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("enables Record-all when a stream is idle or errored", () => {
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo")]);
    $statuses.set({ a: mkStatus("a", "recording"), b: mkStatus("b", "error") });
    renderPanel();
    const btn = screen.getByRole("button", {
      name: /записати все|record all/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});

describe("StreamsPanel — stop button label", () => {
  it("labels the stop button as stopping recording", () => {
    $streams.set([mkStream("a", "Alpha")]);
    $statuses.set({ a: mkStatus("a", "recording") });
    renderPanel();
    expect(
      screen.getByRole("button", { name: /зупинити запис|stop recording/i }),
    ).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- StreamsPanel`
Expected: the 5 new tests **FAIL** — the record-all button is not found (e.g. `Unable to find an accessible element with the role "button" and name /записати все|record all/i`). Existing tests still pass.

- [ ] **Step 3: Compute `startableCount`**

In `src/components/streams/StreamsPanel.tsx`, after the `errorCount` line (line 48), add:

```tsx
  // Streams whose recording task is NOT currently live (idle / error / stopped /
  // never-started) — these are what "Записати все" will start. Backend skips any
  // already-active stream, so this only drives the button's disabled state.
  const startableCount = useMemo(() => {
    const active = new Set(["recording", "connecting", "reconnecting"]);
    return streams.filter((s) => !active.has(statuses[s.id]?.state ?? "idle")).length;
  }, [streams, statuses]);
```

- [ ] **Step 4: Add the `recordAllBtn` ref**

In the toolbar refs block (~line 137), add a ref between `addBtn` and `stopAllBtn`:

```tsx
  const addBtn       = useRef<HTMLButtonElement | null>(null);
  const recordAllBtn = useRef<HTMLButtonElement | null>(null);
  const stopAllBtn   = useRef<HTMLButtonElement | null>(null);
```

- [ ] **Step 5: Add `recordAllBtn` to the roving ring**

Update `toolbarRefs` (~line 143) to insert `recordAllBtn` at index 1:

```tsx
  const toolbarRefs = useMemo(
    () => [addBtn, recordAllBtn, stopAllBtn, chip0Ref, chip1Ref, chip2Ref],
    [],
  );
```

- [ ] **Step 6: Add the announce helper and click handler**

After the existing `handleStopAll` function (~line 221), add:

```tsx
  const recordAllAnnouncement = useCallback(
    (count: number) =>
      pluralize(
        count,
        m.record_all_announce_zero,
        m.record_all_announce_one,
        m.record_all_announce_few,
        m.record_all_announce_many,
      ),
    [pluralize],
  );

  const handleRecordAll = async () => {
    if (startableCount === 0) return;
    try {
      const started = await tauri.startAllRecordings();
      announce(recordAllAnnouncement(started), "polite");
    } catch (err) {
      addToast(String(err), "error");
    }
  };
```

- [ ] **Step 7: Render the button and bump the stop/chip tab indices**

Replace the Row 2 opening through the stop button. Change this block (lines 305–316):

```tsx
            {/* Row 2: Зупинити все + Chips */}
            <div className="flex items-center gap-2 px-4 py-2">
              {/* Index 1: Зупинити все */}
              <button
                ref={stopAllBtn}
                tabIndex={toolbarTabIndex(1)}
                onClick={handleStopAll}
                disabled={activeCount === 0}
                className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              >
                {m.stop_all()}
              </button>
```

with:

```tsx
            {/* Row 2: Записати все + Зупинити запис + Chips */}
            <div className="flex items-center gap-2 px-4 py-2">
              {/* Index 1: Записати все (primary) */}
              <button
                ref={recordAllBtn}
                tabIndex={toolbarTabIndex(1)}
                onClick={handleRecordAll}
                disabled={startableCount === 0}
                className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
              >
                {m.record_all()}
              </button>

              {/* Index 2: Зупинити запис */}
              <button
                ref={stopAllBtn}
                tabIndex={toolbarTabIndex(2)}
                onClick={handleStopAll}
                disabled={activeCount === 0}
                className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              >
                {m.stop_all()}
              </button>
```

Then update the filter-chip comment and tab index. Change line 320:

```tsx
              {/* Indices 2–4: Filter chips — semantic group, toggle chips kept */}
```

to:

```tsx
              {/* Indices 3–5: Filter chips — semantic group, toggle chips kept */}
```

and change the chip `tabIndex` (line 330) from:

```tsx
                      tabIndex={toolbarTabIndex(2 + i)}
```

to:

```tsx
                      tabIndex={toolbarTabIndex(3 + i)}
```

- [ ] **Step 8: Update the stale index comment**

Change the comment above `ScreenZone` (lines 284–285) from:

```tsx
          {/* IMPORTANT: Both rows must live inside ScreenZone so mixed-boundary-handoff
              sees all 5 interactive items (indices 0–4). The heading is structural, not focusable. */}
```

to:

```tsx
          {/* IMPORTANT: Both rows must live inside ScreenZone so mixed-boundary-handoff
              sees all 6 interactive items (indices 0–5). The heading is structural, not focusable. */}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm test -- StreamsPanel`
Expected: **all pass**, including the 5 new tests and the existing chip/group tests.

- [ ] **Step 10: Run the full test suite and the build**

Run: `pnpm test`
Expected: full vitest suite passes.
Run: `pnpm vite:build`
Expected: build succeeds.

- [ ] **Step 11: Commit**

```bash
git add src/components/streams/StreamsPanel.tsx src/components/streams/StreamsPanel.test.tsx
git commit -m "feat(streams): Record-all button + clearer stop label" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` — green
- [ ] `pnpm test` — green
- [ ] `pnpm vite:build` — green
- [ ] Manual smoke (optional, via `pnpm dev`): with ≥2 idle streams, click «Записати все» → all start recording, NVDA announces "Розпочато запис: N потоків"; «Зупинити запис» enables and stops them; «Записати все» disables once every stream is active.
