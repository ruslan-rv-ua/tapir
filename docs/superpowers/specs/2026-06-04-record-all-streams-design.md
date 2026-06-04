# Record-all-streams — design

**Date:** 2026-06-04
**Status:** Approved (brainstorming) — ready for implementation plan
**Screen:** Streams (`StreamsPanel`)

## Problem

The Streams toolbar already has a "Stop all" button wired to `stop_all_recordings`, but
there is no counterpart to **start** recording every stream in the active profile in one
action. The agreed product model (one active profile; "record everything" is a single
deliberate action — see `profiles-recording-model` memory) calls for a primary
"Записати все" button. Two gaps:

1. No "record all" button and no backend `start_all` to support it.
2. The stop button's label ("Зупинити всі" / "Stop all") does not make clear that it stops
   **recording** (as opposed to playback).

## Goals

- Add a primary "Записати все" / "Record all" button that starts recording every stream in
  the active profile that is not already recording.
- Relabel the stop button to make the recording intent explicit:
  **«Зупинити запис»** / **"Stop recording"** (message key `stop_all` unchanged).
- Keep the existing stop button fully wired (it already is).

## Non-goals

- A separate "retry errors" action. "Record all" restarts errored streams as a side effect,
  which subsumes this for now (it remains an optional future candidate).
- Auto-starting recording on profile switch (explicitly rejected in the product model).
- Any change to per-stream record/stop buttons in `StreamItem`.

## Approach

**Server-side `start_all`**, mirroring the existing `stop_all_recordings`: one IPC call, with
the "which streams" logic living in `StreamManager`. Chosen over a client-side per-stream
loop because it is symmetric with the existing stop pair, avoids N round-trips, and keeps the
skip/partial-failure logic in one authoritative place (the manager already owns the
`entries` map that tells us what is active).

## Design

### 1. Backend — `StreamManager` + command

**`StreamManager::start_all`** (`src-tauri/src/stream/manager.rs`)

```rust
pub fn start_all(
    &mut self,
    streams: Vec<StreamInfo>,
    settings: RecordingSettings,
    manager_ref: Arc<RwLock<Self>>,
) -> usize
```

- For each stream **not** already present in `self.entries`, call the existing
  `start_recording(...)`.
- Streams already in `entries` (recording / connecting / reconnecting) are skipped — this is
  what makes the operation idempotent and resilient.
- A per-stream `start_recording` error (in practice only "already recording", which the skip
  already avoids) is swallowed so one bad stream cannot abort the batch.
- Returns the count of streams **newly started**.

**Command `start_all_recordings`** (`src-tauri/src/commands/stream_commands.rs`)

- Reads the active profile's `streams` and `recording` settings (same reads
  `start_recording` performs today).
- Acquires the manager write lock and calls `start_all`, passing `manager_arc.clone()`.
- Returns `Result<usize, String>` — the number of streams started.
- Registered in the `generate_handler!` list in `src-tauri/src/lib.rs` next to
  `stop_all_recordings`.

**Semantics (which streams start):** every active-profile stream whose task is not currently
live — i.e. `idle`, `error`, and `stopped` streams all (re)start; `recording`, `connecting`,
and `reconnecting` streams are skipped. "Записати все" therefore literally records all
stations of the profile and naturally re-attempts failed ones.

### 2. Frontend IPC — `src/lib/tauri.ts`

```ts
export async function startAllRecordings(): Promise<number> {
  return invoke("start_all_recordings");
}
```

### 3. StreamsPanel — `src/components/streams/StreamsPanel.tsx`

- **New primary button** "Записати все" (blue, same visual treatment as the "Add stream"
  primary button) placed in Row 2, to the **left** of the stop button.
- **Roving focus** grows from 5 → **6 toolbar items**. New index order:
  `add(0), recordAll(1), stop(2), chip0(3), chip1(4), chip2(5)`. Update `toolbarRefs`,
  the `recordAllBtn` ref, and every `toolbarTabIndex(n)` accordingly.
- **Stop button** relabeled via the `stop_all` message value (no key rename). The
  confirm-dialog `confirmLabel={m.stop_all()}` follows automatically.
- **Disabled states:**
  - Record-all: disabled when there are **no startable streams** — i.e. every stream is
    already `recording`/`connecting`/`reconnecting`. Compute a `startableCount` and disable
    when it is `0`.
  - Stop: unchanged (disabled when `activeCount === 0`).
- **No confirmation** for record-all (non-destructive). The stop button's existing
  "confirm when more than one active" flow is unchanged.
- **Accessibility:** on success, a `polite` announce
  "Розпочато запис: N потоків" (pluralized via the existing `pluralize` helper using the
  count returned from `startAllRecordings`). This gives immediate feedback because the
  `role="status"` "active recordings" metric only ticks up later, as streams reach
  `recording` state.
- **Handler:**

  ```ts
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

### 4. i18n — `src/i18n/messages/{uk,en}.json`

- Add `record_all`: "Записати все" / "Record all".
- Change `stop_all`: "Зупинити запис" / "Stop recording".
- Add pluralized announce keys following the existing `active_recordings_*` pattern:
  `record_all_announce_zero` / `_one` / `_few` / `_many` (each taking `{count}`).
- Regenerate paraglide messages via the vite plugin (`pnpm vite:build`).

### 5. Tests

- **Backend** (`manager.rs` tests): assert `StreamManager::start_all` exists with the
  expected signature and skips already-present entries — mirroring the existing
  `stop_all_async_returns_handles_for_active_entries` compile/contract test.
- **Frontend** (`StreamsPanel.test.tsx`):
  - Add `startAllRecordings: vi.fn().mockResolvedValue(0)` to the tauri mock.
  - Assert the "Записати все" button renders and calls `startAllRecordings` on click.
  - Assert record-all is **disabled** when all streams are active (recording) and enabled
    when at least one is idle/error.
  - Assert the stop button is relabeled (matches "Зупинити запис").
  - Existing chip-group / "stop button outside the group" tests must remain green.

## Error handling

- Per-stream start failures are swallowed in `start_all`; the batch always continues.
- The single IPC call surfaces only a top-level failure (e.g. lock/profile read) as a toast
  via the existing `addToast(String(err), "error")` path.

## Verification gates

- `pnpm test` (vitest) — green.
- `pnpm vite:build` — green (also regenerates paraglide messages).
- `cargo test` for the manager unit test.
- Note: `tsc` has ~51 pre-existing untyped-paraglide errors and is **not** a gate.
