# Bulk Stream Operations — Milestone C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the toolbar **Export** dynamic (export the selected subset to M3U8/PLS) and switch **Record-all / Stop-all** to a **selected** mode when there is a selection — dynamic labels, partial-success summaries, streams only.

**Architecture:** Three existing backend commands (`export_streams`, `start_all_recordings`, `stop_all_recordings`) each gain an optional `stream_ids: Option<Vec<String>>` filter (`None` = whole profile, exactly as today; `Some` = those ids in profile order). A shared pure `select_by_ids` does the filtering; `stop_now(filter)` generalizes `stop_all_now`. On the frontend, the Export open-signal store becomes a discriminated `$exportStreamsRequest` carrying scope; `StreamsPanel` computes `selected{Startable,Stoppable}Count`/`stoppableCount` (broad backend `is_active`), relabels the same Export/Record/Stop buttons, and switches them to `aria-disabled` so the dynamic label stays NVDA-reachable. No new buttons → roving stays 14.

**Tech Stack:** React 19, nanostores, Tauri v2 (Rust commands), Paraglide.js i18n (compile-time), Vitest + Testing Library, react-aria-components.

**Design source:** This plan references — does not duplicate — the spec
[2026-06-19-bulk-stream-operations-C-design.md](../specs/2026-06-19-bulk-stream-operations-C-design.md) (sections C1–C7, R1–R8) and the umbrella
[docs/backlog/p1-bulk-stream-operations.md](../../backlog/p1-bulk-stream-operations.md) (decisions 1–18). Tags (e.g. "C4", "R8") point at that spec.

## Global Constraints

- **Gates:** `pnpm test` and `pnpm vite:build` are the real frontend gates; **NOT** `tsc` (~51 pre-existing untyped-paraglide errors). Rust via `cargo test --manifest-path src-tauri/Cargo.toml`.
- **Paraglide:** after editing `src/i18n/messages/*.json`, regenerate by running `pnpm vite:build`. New `m.*` functions only exist after regeneration.
- **Accessibility-first:** visible text of count-bearing buttons **==** accessible name (WCAG 2.5.3). All announcements go through the single central `announce()` (polite). Selection-aware toolbar buttons use `aria-disabled` (stay roving-reachable), **never** native `disabled` (R8).
- **i18n:** Ukrainian first, English second. Strings are impersonal, no plural forms (consistent with A/B).
- **"active" for Stop = backend `is_active`** = `recording | connecting | reconnecting` (R6). `activeCount` (recording-only) stays for the metric/chip **only**.
- **Run a single Vitest file:** `pnpm exec vitest run <path>`.
- **No `lib.rs` change:** the three commands are already registered; only their signatures change (Tauri picks that up automatically).

---

## File Structure

**Modify (backend):**
- `src-tauri/src/commands/stream_commands.rs` — pure `select_by_ids` (pub(crate)); `start_all_recordings`/`stop_all_recordings` gain `stream_ids: Option<Vec<String>>`; tests in `mod tests` (C1/C4, R2/R6).
- `src-tauri/src/commands/stream_io_commands.rs` — `export_streams` gains `stream_ids`; pure `export_file_name`; tests (C1, finding 4).
- `src-tauri/src/recording_control.rs` — pure `active_targets`; `stop_now(filter)`; `stop_all_now = stop_now(None)`; test (C1/R6).

**Modify (frontend):**
- `src/lib/tauri.ts` — `exportStreams(format, ids?)`, `startAllRecordings(ids?)`, `stopAllRecordings(ids?) -> number` (C2).
- `src/i18n/messages/{uk,en}.json` — 10 new keys; regenerate (C5).
- `src/stores/streams.ts` — `$showExportStreamsDialog` → `$exportStreamsRequest` (C3).
- `src/components/streams/ExportFormatDialog.tsx` — read request; scoped title; pass ids (C3, R4).
- `src/components/common/CommandPalette.tsx` — export → `$exportStreamsRequest.set({ ids: null })`; record/stop unchanged (C3, R7).
- `src/components/streams/StreamsPanel.tsx` — dynamic Export button (C3); `IS_ACTIVE`/`selected{Startable,Stoppable}Count`/`stoppableCount`; Record/Stop selected handlers, `aria-disabled` (R8), confirm + summaries (C4, R6/R8).

**Modify (tests):**
- the three Rust `mod tests`; `ExportFormatDialog.test.tsx`; `CommandPalette.test.tsx`; `StreamsPanel.test.tsx`.

**Modify (docs, after code):**
- `docs/backlog/p1-bulk-stream-operations.md` — tick milestone-C criteria + header/table.

---

## Task 1: Backend — scoped `export_streams` + `select_by_ids` + `export_file_name` (C1)

**Files:**
- Modify: `src-tauri/src/commands/stream_commands.rs` (add `select_by_ids` near `retain_streams`; tests in `mod tests` after the `insert_transfers_*` tests, ~line 649)
- Modify: `src-tauri/src/commands/stream_io_commands.rs` (`export_streams` ~line 174; `export_file_name` helper; tests in `mod tests` ~line 236)
- Modify: `src/lib/tauri.ts:666-668` (`exportStreams` signature)

**Interfaces:**
- Produces (Rust): `pub(crate) fn select_by_ids(streams: &[StreamInfo], ids: &[String]) -> Vec<StreamInfo>`; `export_streams(app, format: String, stream_ids: Option<Vec<String>>, state) -> Result<bool, String>`.
- Produces (TS): `exportStreams(format: "m3u8" | "pls", ids?: string[]) -> Promise<boolean>`.
- Consumes: `playlist::to_m3u8`/`to_pls`, existing dialog/`set_file_name` flow.

- [ ] **Step 1: Write the failing Rust tests**

In `src-tauri/src/commands/stream_commands.rs`, inside `mod tests` after `insert_transfers_move_preserves_source_id` (~line 649, before the closing `}`), add (reuses the existing `with_id` helper):

```rust
    #[test]
    fn select_by_ids_keeps_profile_order_and_ignores_unknown() {
        let all = vec![with_id("a"), with_id("b"), with_id("c")];
        let ids = vec!["c".to_string(), "a".to_string(), "zzz".to_string()];
        let got = select_by_ids(&all, &ids);
        // profile order (a before c), unknown id dropped
        assert_eq!(got.iter().map(|s| s.id.clone()).collect::<Vec<_>>(), vec!["a", "c"]);
    }

    #[test]
    fn select_by_ids_empty_ids_yields_empty() {
        let all = vec![with_id("a")];
        assert!(select_by_ids(&all, &[]).is_empty());
    }
```

In `src-tauri/src/commands/stream_io_commands.rs`, inside `mod tests` after `build_candidates_marks_existing_urls` (~line 236, before the closing `}`), add:

```rust
    #[test]
    fn export_file_name_whole_profile_uses_plain_name() {
        assert_eq!(export_file_name("My Radio", "m3u8", None), "My Radio.m3u8");
    }

    #[test]
    fn export_file_name_selected_encodes_post_filter_count() {
        assert_eq!(export_file_name("My Radio", "pls", Some(3)), "My Radio-selected-3.pls");
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml select_by_ids export_file_name`
Expected: FAIL — `cannot find function select_by_ids` / `export_file_name`.

- [ ] **Step 3: Implement `select_by_ids`**

In `src-tauri/src/commands/stream_commands.rs`, add next to `retain_streams` (a sibling pure bulk helper):

```rust
/// Keep only the streams whose id is in `ids`, in `streams` order (profile
/// order). Unknown ids are ignored. Shared by export / start / stop of the
/// selected subset. `pub(crate)` — `export_streams` lives in the sibling
/// `stream_io_commands` module.
pub(crate) fn select_by_ids(streams: &[StreamInfo], ids: &[String]) -> Vec<StreamInfo> {
    let want: std::collections::HashSet<&str> = ids.iter().map(String::as_str).collect();
    streams.iter().filter(|s| want.contains(s.id.as_str())).cloned().collect()
}
```

- [ ] **Step 4: Implement `export_file_name` + scoped `export_streams`**

In `src-tauri/src/commands/stream_io_commands.rs`, add the helper above `export_streams` (~line 169):

```rust
/// Default file name proposed in the Save dialog. Selected exports carry the
/// scope in the name (`-selected-{count}`) so the native Save dialog — the final
/// confirmation surface NVDA reads — doesn't propose an identical name for a
/// subset vs the whole profile (finding 4). `count` is the POST-filter count.
fn export_file_name(profile_name: &str, ext: &str, count: Option<usize>) -> String {
    match count {
        Some(n) => format!("{profile_name}-selected-{n}.{ext}"),
        None => format!("{profile_name}.{ext}"),
    }
}
```

Replace the `export_streams` command (~lines 173-201) with:

```rust
/// Serialize the active profile's streams (or only `stream_ids`, when given) to
/// the chosen format and write them to a user-picked file. `format` is "m3u8"
/// (default) or "pls". Returns `true` when a file was written, `false` when the
/// user cancelled the save dialog. The proposed file name encodes the scope
/// (finding 4): selected → `{name}-selected-{count}.{ext}`, where `count` is the
/// post-filter count (unknown ids are dropped by `select_by_ids`).
#[tauri::command]
pub async fn export_streams(
    app: AppHandle,
    format: String,
    stream_ids: Option<Vec<String>>,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let (all, profile_name) = {
        let profile = state.active_profile.read().await;
        (profile.streams.clone(), profile.name.clone())
    };
    let (streams, scope_count) = match &stream_ids {
        Some(ids) => {
            let sel = crate::commands::stream_commands::select_by_ids(&all, ids);
            let n = sel.len();
            (sel, Some(n))
        }
        None => (all, None),
    };
    let fmt = format.as_str();
    let (ext, content) = match fmt {
        "pls" => ("pls", playlist::to_pls(&streams)),
        _ => ("m3u8", playlist::to_m3u8(&streams)),
    };
    let path = app
        .dialog()
        .file()
        .set_file_name(&export_file_name(&profile_name, ext, scope_count))
        .add_filter("Playlist", &[ext])
        .blocking_save_file();
    match path {
        Some(FilePath::Path(p)) => {
            std::fs::write(&p, content).map_err(|e| e.to_string())?;
            Ok(true)
        }
        _ => Ok(false),
    }
}
```

- [ ] **Step 5: Run the Rust tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml select_by_ids export_file_name`
Expected: PASS (4 tests). Also `cargo test --manifest-path src-tauri/Cargo.toml stream_io_commands stream_commands` builds (warnings OK).

- [ ] **Step 6: Update the frontend wrapper**

In `src/lib/tauri.ts`, replace `exportStreams` (~line 666):

```ts
/** Resolves to `true` when a file was written, `false` when the save dialog was cancelled. */
export async function exportStreams(format: "m3u8" | "pls", ids?: string[]): Promise<boolean> {
  return invoke("export_streams", { format, streamIds: ids ?? null });
}
```

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/stream_commands.rs src-tauri/src/commands/stream_io_commands.rs src/lib/tauri.ts
git commit -m "feat(streams): scoped export_streams (select_by_ids + scoped filename)"
```

---

## Task 2: Backend — scoped Record/Stop (`active_targets` + `stop_now`) (C1, R6)

**Files:**
- Modify: `src-tauri/src/recording_control.rs` (add `active_targets` + `stop_now`; rewrite `stop_all_now`; test in `mod tests`)
- Modify: `src-tauri/src/commands/stream_commands.rs:305-322` (`stop_all_recordings`, `start_all_recordings` gain `stream_ids`)
- Modify: `src/lib/tauri.ts:153-158` (`stopAllRecordings`/`startAllRecordings` signatures)

**Interfaces:**
- Produces (Rust): `pub async fn stop_now(app: &AppHandle, filter: Option<&HashSet<String>>) -> usize`; `start_all_recordings(stream_ids: Option<Vec<String>>, state) -> Result<usize, String>`; `stop_all_recordings(stream_ids: Option<Vec<String>>, app) -> Result<usize, String>`.
- Produces (TS): `startAllRecordings(ids?: string[]) -> Promise<number>`, `stopAllRecordings(ids?: string[]) -> Promise<number>`.
- Consumes: `select_by_ids` (Task 1), `is_active`, `manager.start_all`/`stop_all`/`stop_recording`.

- [ ] **Step 1: Write the failing Rust test for `active_targets`**

In `src-tauri/src/recording_control.rs`, inside `mod tests` (after `count_active_empty_is_zero`, ~line 162), add a helper + test:

```rust
    fn st(id: &str, state: StreamState, session: u64) -> StreamStatus {
        StreamStatus {
            stream_id: id.to_string(), state, current_track: None,
            recording_started_at: None, bytes_recorded: 0, tracks_recorded: 0,
            error: None, reconnect_attempt: None, session_id: session,
        }
    }

    #[test]
    fn active_targets_filters_by_state_and_optional_id() {
        let statuses = vec![
            st("a", StreamState::Recording, 1),
            st("b", StreamState::Connecting, 2),
            st("c", StreamState::Idle, 3),        // not active
            st("d", StreamState::Reconnecting, 4),
        ];
        // None → every active stream (a, b, d), in order.
        let all: Vec<String> = active_targets(&statuses, None).into_iter().map(|(id, _)| id).collect();
        assert_eq!(all, vec!["a", "b", "d"]);
        // Filter {a,c,d} → active ∩ filter = a, d (c is idle; b not in filter).
        let set: std::collections::HashSet<String> =
            ["a", "c", "d"].iter().map(|s| s.to_string()).collect();
        let some: Vec<String> = active_targets(&statuses, Some(&set)).into_iter().map(|(id, _)| id).collect();
        assert_eq!(some, vec!["a", "d"]);
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml active_targets`
Expected: FAIL — `cannot find function active_targets in this scope`.

- [ ] **Step 3: Implement `active_targets` + `stop_now`, rewrite `stop_all_now`**

In `src-tauri/src/recording_control.rs`, add `use std::collections::HashSet;` to the imports (top, after `use tauri::{AppHandle, Manager};`). Replace the existing `stop_all_now` (~lines 62-79) with:

```rust
/// Pick (stream_id, session_id) of active recordings that pass the optional id
/// filter (None = all active), in status order. Pure — unit-tested without an
/// AppHandle.
fn active_targets(statuses: &[StreamStatus], filter: Option<&HashSet<String>>) -> Vec<(String, u64)> {
    statuses
        .iter()
        .filter(|s| is_active(&s.state) && filter.map_or(true, |f| f.contains(&s.stream_id)))
        .map(|s| (s.stream_id.clone(), s.session_id))
        .collect()
}

/// Stop active recordings passing `filter` (None = all). Returns how many were
/// stopped. session_ids are read BEFORE cancel (§3.3 — entries vanish from the
/// manager async after cancel), then the shared `notify_manual_stop` hook runs.
/// `None` keeps the original whole-profile semantics (`mgr.stop_all()` cancels
/// every entry); `Some` cancels only the filtered active ids.
pub async fn stop_now(app: &AppHandle, filter: Option<&HashSet<String>>) -> usize {
    let state = app.state::<AppState>();
    let targets: Vec<(String, u64)> = {
        let mut mgr = state.stream_manager.write().await;
        let targets = active_targets(&mgr.get_all_statuses(), filter);
        match filter {
            None => mgr.stop_all(),
            Some(_) => {
                for (stream_id, _) in &targets {
                    let _ = mgr.stop_recording(stream_id);
                }
            }
        }
        targets
    };
    for (stream_id, session_id) in &targets {
        crate::scheduler::timer::notify_manual_stop(app, stream_id, *session_id).await;
    }
    targets.len()
}

/// Stop all active recordings unconditionally; returns how many were active.
/// Single path for every whole-profile stop-all surface (tray, global hotkeys).
pub async fn stop_all_now(app: &AppHandle) -> usize {
    stop_now(app, None).await
}
```

- [ ] **Step 4: Run the `active_targets` test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml active_targets`
Expected: PASS.

- [ ] **Step 5: Scope the two commands**

In `src-tauri/src/commands/stream_commands.rs`, replace `stop_all_recordings` (~lines 304-308) and `start_all_recordings` (~lines 310-322):

```rust
#[tauri::command]
pub async fn stop_all_recordings(
    stream_ids: Option<Vec<String>>,
    app: tauri::AppHandle,
) -> Result<usize, String> {
    let set = stream_ids.map(|v| v.into_iter().collect::<std::collections::HashSet<_>>());
    Ok(crate::recording_control::stop_now(&app, set.as_ref()).await)
}

#[tauri::command]
pub async fn start_all_recordings(
    stream_ids: Option<Vec<String>>,
    state: tauri::State<'_, AppState>,
) -> Result<usize, String> {
    check_disk_space(&state).await.map_err(|e| e.to_string())?;

    let (all, settings) = {
        let profile = state.active_profile.read().await;
        (profile.streams.clone(), profile.recording.clone())
    };
    let streams = match stream_ids {
        Some(ids) => select_by_ids(&all, &ids),
        None => all,
    };

    let manager_arc = state.stream_manager.clone();
    let mut manager = manager_arc.write().await;
    Ok(manager.start_all(streams, settings, manager_arc.clone()))
}
```

- [ ] **Step 6: Update the frontend wrappers**

In `src/lib/tauri.ts`, replace `stopAllRecordings` (~line 153) and `startAllRecordings` (~line 156):

```ts
export async function stopAllRecordings(ids?: string[]): Promise<number> {
  return invoke("stop_all_recordings", { streamIds: ids ?? null });
}
export async function startAllRecordings(ids?: string[]): Promise<number> {
  return invoke("start_all_recordings", { streamIds: ids ?? null });
}
```

- [ ] **Step 7: Verify the backend compiles + Rust suite passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: builds (warnings OK); all tests pass incl. `active_targets_filters_by_state_and_optional_id`.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/recording_control.rs src-tauri/src/commands/stream_commands.rs src/lib/tauri.ts
git commit -m "feat(streams): scoped start/stop recordings (active_targets + stop_now filter)"
```

---

## Task 3: i18n — Record/Stop/Export-selected messages (C5)

**Files:**
- Modify: `src/i18n/messages/uk.json` (after `"transfer_skipped_conflict"` ~line 130)
- Modify: `src/i18n/messages/en.json` (matching position)

**Interfaces:**
- Produces: `m.record_selected`, `m.stop_selected`, `m.streams_export_selected`, `m.streams_export_selected_title` (each `{count}`); `m.record_done`, `m.record_skipped`, `m.stop_done`, `m.stop_skipped` (each `{count}`); `m.confirm_stop_selected_title`, `m.confirm_stop_selected_message({count})`.

- [ ] **Step 1: Add the Ukrainian keys**

In `src/i18n/messages/uk.json`, after the `"transfer_skipped_conflict": ...` line:

```json
  "record_selected": "Записати виділені ({count})",
  "stop_selected": "Зупинити виділені ({count})",
  "streams_export_selected": "Експорт виділених ({count})…",
  "streams_export_selected_title": "Експорт виділених ({count})",
  "record_done": "Розпочато запис: {count}",
  "record_skipped": "пропущено {count} (вже записуються)",
  "stop_done": "Зупинено запис: {count}",
  "stop_skipped": "пропущено {count} (не записувались)",
  "confirm_stop_selected_title": "Зупинити виділені записи?",
  "confirm_stop_selected_message": "Буде зупинено {count} виділених записів.",
```

- [ ] **Step 2: Add the English keys**

In `src/i18n/messages/en.json`, at the matching position:

```json
  "record_selected": "Record selected ({count})",
  "stop_selected": "Stop selected ({count})",
  "streams_export_selected": "Export selected ({count})…",
  "streams_export_selected_title": "Export selected ({count})",
  "record_done": "Started recording: {count}",
  "record_skipped": "skipped {count} (already recording)",
  "stop_done": "Stopped recording: {count}",
  "stop_skipped": "skipped {count} (not recording)",
  "confirm_stop_selected_title": "Stop selected recordings?",
  "confirm_stop_selected_message": "{count} selected recordings will be stopped.",
```

- [ ] **Step 3: Regenerate paraglide + verify build**

Run: `pnpm vite:build`
Expected: build succeeds; `src/i18n/paraglide/messages.js` now exports `record_selected`, `stop_done`, `confirm_stop_selected_message`, etc.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/uk.json src/i18n/messages/en.json src/i18n/paraglide
git commit -m "i18n(streams): record/stop/export-selected + partial-success messages"
```

---

## Task 4: Export frontend — scoped store, dialog, palette, toolbar button (C3, R4/R7)

**Files:**
- Modify: `src/stores/streams.ts:46-47`
- Modify: `src/components/streams/ExportFormatDialog.tsx`
- Modify: `src/components/common/CommandPalette.tsx:3, 84`
- Modify: `src/components/streams/StreamsPanel.tsx` (import + Export button ~line 464)
- Test: `src/components/streams/ExportFormatDialog.test.tsx`, `src/components/common/CommandPalette.test.tsx`, `src/components/streams/StreamsPanel.test.tsx`

**Interfaces:**
- Produces: `export type ExportRequest = { ids: string[] | null }`; `export const $exportStreamsRequest = atom<ExportRequest | null>(null)` (replaces `$showExportStreamsDialog`).
- Consumes: `tauri.exportStreams(format, ids?)` (Task 1), `m.streams_export_selected`/`m.streams_export_selected_title` (Task 3).

- [ ] **Step 1: Write the failing tests**

In `src/components/streams/ExportFormatDialog.test.tsx`: change the store import (line 5) to `import { $exportStreamsRequest } from "../../stores/streams";`, add the scoped-title mock to the `vi.mock` messages block, replace `beforeEach`'s reset, and update each `$showExportStreamsDialog.set(true)` to `$exportStreamsRequest.set({ ids: null })`. Add the scoped-title mock:

```tsx
  streams_export_selected_title: ({ count }: { count: number }) => `Export selected (${count})`,
```

Replace `beforeEach` body's reset line with:

```tsx
  $exportStreamsRequest.set(null);
```

Update the two `toHaveBeenCalledWith` assertions to pass the ids arg (whole profile → `undefined`):

```tsx
    await waitFor(() => expect(tauri.exportStreams).toHaveBeenCalledWith("m3u8", undefined));
```
```tsx
    await waitFor(() => expect(tauri.exportStreams).toHaveBeenCalledWith("pls", undefined));
```

And in the "stays silent when cancelled" test, replace the final assertion:

```tsx
    expect($exportStreamsRequest.get()).toBeNull(); // dialog still closes
```

Add a new scoped test at the end of the `describe`:

```tsx
  it("shows the selected title and exports only the selected ids", async () => {
    const user = userEvent.setup();
    $exportStreamsRequest.set({ ids: ["a", "b"] });
    render(<ExportFormatDialog />);
    expect(await screen.findByText("Export selected (2)")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(tauri.exportStreams).toHaveBeenCalledWith("m3u8", ["a", "b"]));
  });
```

In `src/components/common/CommandPalette.test.tsx`: extend imports and add an R7 describe block. Change line 5 import to:

```tsx
import { $streams, $statuses, $streamSelection, replaceSelection, $exportStreamsRequest } from "../../stores/streams";
```

Add `replaceSelection(new Set());` to `beforeEach`, and append:

```tsx
describe("CommandPalette — whole-profile regardless of selection (R7)", () => {
  it("record-all/stop-all call the whole-profile path even with a selection", async () => {
    replaceSelection(new Set(["a", "b"]));
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.click(screen.getByText(/^записати все$|^record all$/i));
    });
    expect(tauri.startAllRecordings).toHaveBeenCalledWith(); // no ids = whole profile
  });

  it("export command opens a whole-profile request (ids: null)", () => {
    $streams.set([{ id: "a", name: "Alpha" } as never]); // export command only shows when streams exist
    replaceSelection(new Set(["a"]));
    render(<CommandPalette />);
    // Command label is `streams_export_action`: "Експортувати потоки…" / "Export streams…".
    fireEvent.click(screen.getByText(/експортувати потоки|export streams/i));
    expect($exportStreamsRequest.get()).toEqual({ ids: null });
  });
});
```

In `src/components/streams/StreamsPanel.test.tsx`: add `$exportStreamsRequest` to the store import (line 4) and `exportStreams` to the tauri mock (line 14 block):

```tsx
  exportStreams: vi.fn().mockResolvedValue(true),
```

Add to the `selection toolbar cluster` describe:

```tsx
  it("export button becomes 'Export selected (N)' and snapshots ids on click", () => {
    replaceSelection(new Set(["a", "b"]));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: m.streams_export_selected({ count: 2 }) }));
    expect($exportStreamsRequest.get()).toEqual({ ids: expect.arrayContaining(["a", "b"]) });
  });

  it("export button stays whole-profile (ids: null) with no selection", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: m.streams_export_button() }));
    expect($exportStreamsRequest.get()).toEqual({ ids: null });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/ExportFormatDialog.test.tsx src/components/common/CommandPalette.test.tsx`
Expected: FAIL — `$exportStreamsRequest` not exported; scoped title/ids missing.

- [ ] **Step 3: Rename the store**

In `src/stores/streams.ts`, replace lines 46-47:

```ts
// Export flow: non-null = the ExportFormatDialog is open. `ids: null` = whole
// profile; `ids: string[]` = the selected subset (snapshot taken at click).
export type ExportRequest = { ids: string[] | null };
export const $exportStreamsRequest = atom<ExportRequest | null>(null);
```

- [ ] **Step 4: Update `ExportFormatDialog`**

In `src/components/streams/ExportFormatDialog.tsx`: change the store import to `$exportStreamsRequest`; derive open/title/scope; pass ids. Replace the top of the component (the `isOpen`/`close` lines) and the title usages:

```tsx
import { $exportStreamsRequest } from "../../stores/streams";
```

```tsx
export function ExportFormatDialog() {
  const request = useStore($exportStreamsRequest);
  const isOpen = request !== null;
  const announce = useAnnounce();
  const [format, setFormat] = useState<ExportFormat>("m3u8");
  const [busy, setBusy] = useState(false);

  // Reset to default each time the dialog opens.
  useEffect(() => {
    if (isOpen) setFormat("m3u8");
  }, [isOpen]);

  const close = () => $exportStreamsRequest.set(null);

  const title = request?.ids
    ? m.streams_export_selected_title({ count: request.ids.length })
    : m.streams_export_title();

  const handleExport = async () => {
    setBusy(true);
    try {
      // false = the user cancelled the save dialog — close without claiming success
      const written = await tauri.exportStreams(format, request?.ids ?? undefined);
      if (written) announce(m.streams_export_done());
      close();
    } catch (e) {
      addToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };
```

Then use `title` in the dialog: change `aria-label={m.streams_export_title()}` → `aria-label={title}` and the `<Heading slot="title" …>{m.streams_export_title()}</Heading>` → `{title}`.

- [ ] **Step 5: Update `CommandPalette` (R7)**

In `src/components/common/CommandPalette.tsx`: change the import on line 3 (`$showExportStreamsDialog` → `$exportStreamsRequest`) and the export action (line 84):

```tsx
          action: () => {
            close();
            $exportStreamsRequest.set({ ids: null });
          },
```

(Leave `record-all` and `stop-all` commands unchanged — they call `startAllRecordings()`/`stopAllRecordings()` with no args = whole profile, R7.)

- [ ] **Step 6: Update the `StreamsPanel` Export button**

In `src/components/streams/StreamsPanel.tsx`: change the import (line 4) `$showExportStreamsDialog` → `$exportStreamsRequest`. Replace the Export button (~lines 464-476):

```tsx
          {/* aria-disabled (not native disabled) so the button stays
              focusable/discoverable when the profile has no streams */}
          <button
            ref={exportBtn}
            tabIndex={toolbarTabIndex(2)}
            aria-disabled={isEmpty || undefined}
            onClick={() => { if (!isEmpty) $exportStreamsRequest.set({ ids: selCount > 0 ? [...selection] : null }); }}
            className={`rounded px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
              isEmpty
                ? "cursor-not-allowed text-slate-600"
                : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            {selCount > 0 ? m.streams_export_selected({ count: selCount }) : m.streams_export_button()}
          </button>
```

(`selCount`/`selection` already exist in `StreamsPanel`, lines ~150-151.)

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/streams/ExportFormatDialog.test.tsx src/components/common/CommandPalette.test.tsx src/components/streams/StreamsPanel.test.tsx`
Expected: PASS — new export/palette tests green; existing export-button + record-all tests still green.

- [ ] **Step 8: Commit**

```bash
git add src/stores/streams.ts src/components/streams/ExportFormatDialog.tsx src/components/common/CommandPalette.tsx src/components/streams/StreamsPanel.tsx src/components/streams/ExportFormatDialog.test.tsx src/components/common/CommandPalette.test.tsx src/components/streams/StreamsPanel.test.tsx
git commit -m "feat(streams): dynamic Export selected button + scoped export dialog/palette (C3)"
```

---

## Task 5: StreamsPanel — Record/Stop selected, aria-disabled, confirm, summaries (C4, R5/R6/R8)

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx`
- Test: `src/components/streams/StreamsPanel.test.tsx`

**Interfaces:**
- Consumes: `tauri.startAllRecordings(ids?)`/`stopAllRecordings(ids?)` (Task 2), `m.record_selected`/`m.stop_selected`/`m.record_done`/`m.record_skipped`/`m.stop_done`/`m.stop_skipped`/`m.confirm_stop_selected_*` (Task 3), `$streamSelection` (already imported).
- Produces: module-level `IS_ACTIVE`; `composeRecordSummary`/`composeStopSummary` (local).

- [ ] **Step 1: Write the failing tests**

In `src/components/streams/StreamsPanel.test.tsx`, add `within` to the Testing Library import (line 2):

```tsx
import { render, act, screen, fireEvent, waitFor, within } from "@testing-library/react";
```

Then **update** the two existing record-all disabled tests (lines ~205-223) from native `disabled` to `aria-disabled`:

```tsx
  it("disables Record-all (aria) when every stream is already active", () => {
    $streams.set([mkStream("a", "Alpha")]);
    $statuses.set({ a: mkStatus("a", "recording") });
    renderPanel();
    const btn = screen.getByRole("button", { name: /записати все|record all/i });
    expect(btn.getAttribute("aria-disabled")).toBe("true");
  });

  it("enables Record-all when a stream is idle or errored", () => {
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo")]);
    $statuses.set({ a: mkStatus("a", "recording"), b: mkStatus("b", "error") });
    renderPanel();
    const btn = screen.getByRole("button", { name: /записати все|record all/i });
    expect(btn.getAttribute("aria-disabled")).toBeNull();
  });
```

Add a new describe block for the selected mode:

```tsx
describe("StreamsPanel — Record/Stop selected (C4, R6/R8)", () => {
  beforeEach(() => {
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo"), mkStream("c", "Charlie")]);
    $statuses.set({});
  });

  it("relabels Record/Stop to the selected count and snapshots selection on Record", async () => {
    $statuses.set({ a: mkStatus("a", "idle"), b: mkStatus("b", "recording") });
    replaceSelection(new Set(["a", "b"]));
    vi.mocked(tauri.startAllRecordings).mockResolvedValueOnce(1); // only 'a' startable
    renderPanel();
    $announcer.set({ message: "", priority: "polite" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: m.record_selected({ count: 2 }) }));
    });
    expect(new Set(vi.mocked(tauri.startAllRecordings).mock.calls[0][0])).toEqual(new Set(["a", "b"]));
    // started 1, skipped 1 (b already recording)
    expect($announcer.get().message).toBe(`${m.record_done({ count: 1 })}, ${m.record_skipped({ count: 1 })}`);
  });

  it("Stop-selected aria-disabled when no selected stream is active (idle selection)", () => {
    replaceSelection(new Set(["a", "b"])); // both idle
    renderPanel();
    const stop = screen.getByRole("button", { name: m.stop_selected({ count: 2 }) });
    expect(stop.getAttribute("aria-disabled")).toBe("true");
  });

  it("Stop-selected stops directly (no confirm) when exactly one selected is active", async () => {
    $statuses.set({ a: mkStatus("a", "recording"), b: mkStatus("b", "idle") });
    replaceSelection(new Set(["a", "b"]));
    vi.mocked(tauri.stopAllRecordings).mockResolvedValueOnce(1);
    renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: m.stop_selected({ count: 2 }) }));
    });
    expect(new Set(vi.mocked(tauri.stopAllRecordings).mock.calls[0][0])).toEqual(new Set(["a", "b"]));
  });

  it("Stop-selected confirms when >1 selected is active, then stops on confirm", async () => {
    $statuses.set({ a: mkStatus("a", "recording"), b: mkStatus("b", "connecting") });
    replaceSelection(new Set(["a", "b"]));
    renderPanel();
    // Only the toolbar button exists yet, so this opens the confirm dialog.
    fireEvent.click(screen.getByRole("button", { name: m.stop_selected({ count: 2 }) }));
    // The dialog's confirm button shares the label — scope the query to the dialog.
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(m.confirm_stop_selected_message({ count: 2 }))).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: m.stop_selected({ count: 2 }) }));
    await waitFor(() => expect(tauri.stopAllRecordings).toHaveBeenCalledTimes(1));
  });

  it("R6: a reconnecting stream makes Stop-all enabled (broad is_active), metric stays recording-only", () => {
    $statuses.set({ a: mkStatus("a", "reconnecting") });
    renderPanel();
    const stop = screen.getByRole("button", { name: /^зупинити запис$|^stop recording$/i });
    expect(stop.getAttribute("aria-disabled")).toBeNull(); // broad stoppableCount = 1 → enabled
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx -t "Record/Stop selected"`
Expected: FAIL — selected labels absent; Record/Stop still native `disabled`; reconnecting Stop-all disabled.

- [ ] **Step 3: Add the module-level `IS_ACTIVE` + counters**

In `src/components/streams/StreamsPanel.tsx`, add a module-level constant near the top (after the imports, before `FILTER_CHIPS`):

```tsx
// Backend `is_active` (recording_control.rs): a stream with an in-flight
// recording task. startable = !IS_ACTIVE, stoppable = IS_ACTIVE (R6).
const IS_ACTIVE = new Set(["recording", "connecting", "reconnecting"]);
```

Replace the existing `startableCount` memo (~lines 60-63) to reuse it, and add the selected/whole stoppable counts next to `selCount` (~line 151):

```tsx
  const startableCount = useMemo(
    () => streams.filter((s) => !IS_ACTIVE.has(statuses[s.id]?.state ?? "idle")).length,
    [streams, statuses],
  );
```

```tsx
  const selectedStartableCount = useMemo(
    () => [...selection].filter((id) => streamIds.has(id) && !IS_ACTIVE.has(statuses[id]?.state ?? "idle")).length,
    [selection, statuses, streamIds],
  );
  const selectedStoppableCount = useMemo(
    () => [...selection].filter((id) => streamIds.has(id) && IS_ACTIVE.has(statuses[id]?.state ?? "idle")).length,
    [selection, statuses, streamIds],
  );
  const stoppableCount = useMemo(
    () => streams.filter((s) => IS_ACTIVE.has(statuses[s.id]?.state ?? "idle")).length,
    [streams, statuses],
  );
  const recordDisabled = selCount > 0 ? selectedStartableCount === 0 : startableCount === 0;
  const stopDisabled = selCount > 0 ? selectedStoppableCount === 0 : stoppableCount === 0;
```

(`streamIds` already exists, ~line 47.)

- [ ] **Step 4: Add summaries + rewrite handlers + confirm state**

Replace the `confirmStopAll` state (~line 110) with the scoped confirm state:

```tsx
  const [confirmStop, setConfirmStop] = useState<null | { scope: "all" | "selected" }>(null);
```

Replace `doStopAll`/`handleStopAll` (~lines 354-362) and `handleRecordAll` (~lines 376-384), and add the two summary builders + `doStopSelected`:

```tsx
  const composeRecordSummary = (sel: number, started: number): string => {
    const parts = [m.record_done({ count: started })];
    if (sel - started > 0) parts.push(m.record_skipped({ count: sel - started }));
    return parts.join(", ");
  };
  const composeStopSummary = (sel: number, stopped: number): string => {
    const parts = [m.stop_done({ count: stopped })];
    if (sel - stopped > 0) parts.push(m.stop_skipped({ count: sel - stopped }));
    return parts.join(", ");
  };

  const doStopAll = async () => {
    try { await tauri.stopAllRecordings(); }
    catch (err) { addToast(String(err), "error"); }
  };
  const doStopSelected = async (ids: string[]) => {
    try {
      const stopped = await tauri.stopAllRecordings(ids);
      announce(composeStopSummary(ids.length, stopped), "polite");
    } catch (err) { addToast(String(err), "error"); }
  };
  const handleStopAll = () => {
    if (selCount > 0) {
      if (selectedStoppableCount === 0) return;
      if (selectedStoppableCount > 1) { setConfirmStop({ scope: "selected" }); return; }
      doStopSelected([...selection]);
    } else {
      if (stoppableCount === 0) return;
      if (stoppableCount > 1) { setConfirmStop({ scope: "all" }); return; }
      doStopAll();
    }
  };

  const handleRecordAll = async () => {
    if (selCount > 0) {
      if (selectedStartableCount === 0) return;
      const ids = [...selection];
      try {
        const started = await tauri.startAllRecordings(ids);
        announce(composeRecordSummary(ids.length, started), "polite");
      } catch (err) { addToast(String(err), "error"); }
    } else {
      if (startableCount === 0) return;
      try {
        const started = await tauri.startAllRecordings();
        announce(recordAllAnnouncement(started), "polite");
      } catch (err) { addToast(String(err), "error"); }
    }
  };
```

(`recordAllAnnouncement` already exists, ~line 364. Delete the now-unused `activeCount`-based old `handleStopAll`/`doStopAll`.)

- [ ] **Step 5: Switch Record/Stop buttons to `aria-disabled` + dynamic labels (R8)**

Replace the RecordAll button (~lines 542-550) and StopAll button (~lines 552-561):

```tsx
          {/* Index 7: Записати все / Записати виділені (N) — aria-disabled (R8) */}
          <button
            ref={recordAllBtn}
            tabIndex={toolbarTabIndex(7)}
            onClick={handleRecordAll}
            aria-disabled={recordDisabled || undefined}
            className={`rounded bg-blue-600 px-3 py-1 text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText] ${
              recordDisabled ? "cursor-not-allowed opacity-50" : "hover:bg-blue-700"
            }`}
          >
            {selCount > 0 ? m.record_selected({ count: selCount }) : m.record_all()}
          </button>

          {/* Index 8: Зупинити запис / Зупинити виділені (N) — aria-disabled (R8) */}
          <button
            ref={stopAllBtn}
            tabIndex={toolbarTabIndex(8)}
            onClick={handleStopAll}
            aria-disabled={stopDisabled || undefined}
            className={`rounded px-3 py-1 text-xs text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
              stopDisabled ? "cursor-not-allowed opacity-50" : "hover:bg-slate-800"
            }`}
          >
            {selCount > 0 ? m.stop_selected({ count: selCount }) : m.stop_all()}
          </button>
```

- [ ] **Step 6: Rewrite the confirm dialog render (scope all|selected, live count)**

Replace the `confirmStopAll && createPortal(...)` block (~lines 689-698):

```tsx
      {confirmStop && createPortal(
        <ConfirmDialog
          title={confirmStop.scope === "selected" ? m.confirm_stop_selected_title() : m.confirm_stop_all_title()}
          message={confirmStop.scope === "selected"
            ? m.confirm_stop_selected_message({ count: selectedStoppableCount })
            : m.confirm_stop_all_message({ count: stoppableCount })}
          confirmLabel={confirmStop.scope === "selected" ? m.stop_selected({ count: selCount }) : m.stop_all()}
          onConfirm={() => {
            const scope = confirmStop.scope;
            setConfirmStop(null);
            if (scope === "selected") doStopSelected([...$streamSelection.get()]);
            else doStopAll();
          }}
          onCancel={() => setConfirmStop(null)}
        />,
        document.body,
      )}
```

(`$streamSelection` is already imported, line 4. The message uses the **live** memoized count — accurate while the dialog is open, finding 3.)

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx`
Expected: PASS — new Record/Stop-selected block green; the updated record-all aria-disabled tests green; existing cluster/lifecycle/roving tests still green.

- [ ] **Step 8: Commit**

```bash
git add src/components/streams/StreamsPanel.tsx src/components/streams/StreamsPanel.test.tsx
git commit -m "feat(streams): Record/Stop selected mode + aria-disabled toolbar (C4, R6/R8)"
```

---

## Task 6: Full gates + docs flip + manual NVDA

**Files:**
- Modify: `docs/backlog/p1-bulk-stream-operations.md`

- [ ] **Step 1: Run all gates**

```bash
pnpm test
pnpm vite:build
cargo test --manifest-path src-tauri/Cargo.toml
```
Expected: all green. (If a first `pnpm test` flakes on a cold transform cache, re-run once before diagnosing — don't mask the exit code.)

- [ ] **Step 2: Tick milestone-C criteria in the umbrella record**

In `docs/backlog/p1-bulk-stream-operations.md`, "Критерії готовності", flip to `[x]`:
- `Масовий експорт виділених (M3U8/PLS)`
- `Масовий запис/зупинка виділених`

In the header (line ~6) update the state note to `in progress (віхи A,B,C реалізовані; D попереду)`. In the "Віхи (A–D)" section mark `### C. Експорт + запис/зупинка виділених (streams)` as ✅ реалізовано with a short note pointing at the C spec/plan, mirroring the A/B entries. In "Промпт для агента" change `зараз — **C**` → `зараз — **D**` and the milestone line to milestone D.

- [ ] **Step 3: Commit**

```bash
git add docs/backlog/p1-bulk-stream-operations.md
git commit -m "docs(backlog): mark bulk-stream milestone C done (export + record/stop selected)"
```

- [ ] **Step 4: Manual NVDA pass (C acceptance #1-#8)**

Build/run the app (`just dev`), then with NVDA:
1. With no selection: confirm toolbar reads «Експорт…», «Записати все», «Зупинити запис»; export a whole profile; Save dialog proposes `{profile}.m3u8`.
2. Select rows (Ctrl+Space / Shift+↓ / Ctrl+A). Tab the toolbar — confirm the Export/Record/Stop buttons now read «Експорт виділених (N)» / «Записати виділені (N)» / «Зупинити виділені (N)»; when a button is disabled (e.g. select only idle streams → Stop) it is **still reachable** and announces «недоступно» (R8).
3. «Експорт виділених (N)» → format dialog heading «Експорт виділених (N)» → pick format → Save dialog proposes `{profile}-selected-{N}.{ext}` (read the filename field).
4. Mixed selection (some recording, some idle): «Записати виділені (N)» → hear «Розпочато запис: X, пропущено Y (вже записуються)».
5. «Зупинити виділені (N)» with >1 active → confirm «Буде зупинено N виділених записів» → confirm → «Зупинено запис: X[, пропущено Y (не записувались)]».
6. Open the Command Palette with a selection active → «Записати все»/«Зупинити запис»/«Експорт потоків» still act on the whole profile (R7).

---

## Self-Review (checklist run against the spec)

**Spec coverage:** C1 export→Task 1; C1 record/stop→Task 2; C2 wrappers→Tasks 1-2; C3 store/dialog/palette/button→Task 4; C4 counters/handlers/confirm/summaries→Task 5; C5 i18n→Task 3; R2 (Option filter)→Tasks 1-2; R4 (scoped dialog title)→Task 4; R5 (skipped=sel−done)→Task 5 `compose*Summary`; R6 (broad is_active, normalize whole-profile Stop)→Task 2 `active_targets` + Task 5 `stoppableCount`; R7 (palette whole-profile)→Task 4 + tests; R8 (aria-disabled)→Task 5; finding 3 (live confirm count)→Task 5 Step 6; finding 4 (scoped filename)→Task 1 `export_file_name`; docs flip→Task 6.

**Type consistency:** `select_by_ids(&[StreamInfo], &[String]) -> Vec<StreamInfo>` defined Task 1, used Tasks 1-2. `exportStreams(format, ids?)`/`startAllRecordings(ids?)`/`stopAllRecordings(ids?)->number` defined Task 1-2, consumed Tasks 4-5. `ExportRequest = { ids: string[] | null }` defined Task 4, read in dialog/button. `confirmStop: { scope: "all" | "selected" } | null` defined and consumed in Task 5. `IS_ACTIVE` module-level in Task 5, reused by `startableCount`/`stoppableCount`/selected counters.

**Placeholder scan:** every code step shows full code; no TBD / "similar to" / "add error handling" placeholders. Each backend/​frontend task is independently testable (Rust `cargo test`; Vitest per-file) and committed.
