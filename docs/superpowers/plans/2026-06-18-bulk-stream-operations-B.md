# Bulk Stream Operations — Milestone B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bulk **copy/move** the selected streams into another profile — target chosen **once** — with partial-success (skip recording / URL-conflict) and one reason-broken-down summary announce, streams only.

**Architecture:** A new backend command `transfer_streams_to_profile` mirrors `remove_streams` (one target save + one active save for move) and returns `{transferred, skippedRecording, skippedConflict}`. The frontend converges all triggers (toolbar buttons + ⋯ on a selected row) in `StreamList` via a `requestBulkTransfer(mode)` handle method that opens the (now subject-aware) `StreamTransferDialog`; the single ⋯ path on a non-selected row keeps the existing single-transfer UX (collapse-to-row → single, Conflict keeps the picker open). Reuses the A bulk-op infrastructure (`$streamSelection`, `pendingBulkFocusRef`/`bulkDeleteSeq` focus, central `announce`).

**Tech Stack:** React 19, nanostores, Tauri v2 (Rust commands), Paraglide.js i18n (compile-time), Vitest + Testing Library, react-aria-components.

**Design source:** This plan references — does not duplicate — the spec
[2026-06-18-bulk-stream-operations-B-design.md](../specs/2026-06-18-bulk-stream-operations-B-design.md) (sections B1–B7, R1–R4) and the umbrella
[docs/backlog/p1-bulk-stream-operations.md](../../backlog/p1-bulk-stream-operations.md) (decisions 1–18). Section tags (e.g. "B3", "R4") point at that spec.

## Global Constraints

- **Gates:** `pnpm test` and `pnpm vite:build` are the real frontend gates; **NOT** `tsc` (~51 pre-existing untyped-paraglide errors). Rust via `cargo test --manifest-path src-tauri/Cargo.toml`.
- **Paraglide:** after editing `src/i18n/messages/*.json`, regenerate by running `pnpm vite:build` (the `@inlang/paraglide-vite` plugin compiles to `src/i18n/paraglide/`). New `m.*` functions only exist after regeneration.
- **Accessibility-first:** visible text of count-bearing buttons/menu items **==** accessible name (WCAG 2.5.3). All announcements go through the single central `announce()` (polite).
- **i18n:** Ukrainian first, English second. Strings are impersonal, no plural forms (consistent with A: `selection_count`, `streams_removed_bulk`).
- **Run a single Vitest file:** `pnpm exec vitest run <path>`.
- **`e.code` vs `e.key`** convention unchanged (not touched by B).

---

## File Structure

**Modify (backend):**
- `src-tauri/src/commands/stream_commands.rs` — `BulkTransferResult` struct, pure `insert_transfers`, `transfer_streams_to_profile` command, tests in the existing `mod tests` (B1, finding 3/5).
- `src-tauri/src/lib.rs` — register `transfer_streams_to_profile`.

**Modify (frontend):**
- `src/lib/tauri.ts` — `BulkTransferResult` interface + `moveStreamsToProfile`/`copyStreamsToProfile` wrappers (B1).
- `src/i18n/messages/{uk,en}.json` — 8 new keys; regenerate paraglide (B7).
- `src/components/streams/StreamTransferDialog.tsx` — `subject: TransferSubject` prop; title by route (B2, finding 2).
- `src/components/streams/StreamContextMenu.tsx` — selection-aware move/copy labels; move not disabled when selected (B4, R4).
- `src/components/streams/StreamList.tsx` — `TransferTarget`, stable `openTransfer`, `requestBulkTransfer` handle, `doBulkTransfer` + `composeSummary` + move focus, bulk-vs-single routing of `onMove/onCopyToProfile`, `doCreateAndTransfer` branch (B3/B4/B5).
- `src/components/streams/StreamsPanel.tsx` — 2 toolbar buttons (Move 4, Copy 5), roving 12→14, index/comment updates, `requestBulkTransfer` wiring (B6).

**Modify (tests):**
- `src-tauri/src/commands/stream_commands.rs` `mod tests`, `StreamTransferDialog.test.tsx`, `StreamContextMenu.test.tsx`, `StreamList.test.tsx`, `StreamsPanel.test.tsx`.

**Modify (docs, after code):**
- `docs/backlog/p1-bulk-stream-operations.md` — tick milestone-B criteria + header/table.

---

## Task 1: Backend — `transfer_streams_to_profile` + `insert_transfers` (B1)

**Files:**
- Modify: `src-tauri/src/commands/stream_commands.rs` (add struct + helper + command after `transfer_stream_to_profile` ~line 386; tests in `mod tests` after the `retain_streams_*` tests ~line 469)
- Modify: `src-tauri/src/lib.rs:231` (register, after `transfer_stream_to_profile,`)
- Modify: `src/lib/tauri.ts:610-615` (add interface + wrappers near `copy/moveStreamToProfile`)

**Interfaces:**
- Produces (Rust): `pub async fn transfer_streams_to_profile(stream_ids: Vec<String>, target_profile: String, mode: TransferMode, state) -> Result<BulkTransferResult, String>`; `BulkTransferResult { transferred: Vec<String>, skipped_recording: usize, skipped_conflict: usize }` (serde camelCase).
- Produces (TS): `moveStreamsToProfile(ids, target) -> Promise<BulkTransferResult>`, `copyStreamsToProfile(ids, target) -> Promise<BulkTransferResult>`, `interface BulkTransferResult { transferred: string[]; skippedRecording: number; skippedConflict: number }`.
- Consumes: existing `prepare_transfer_stream`, `move_blocked_by_state`, `add_stream_checked` (→ `RadioError::Conflict`), `Profile::load`/`save`.

- [ ] **Step 1: Write the failing Rust tests for the pure helper**

In `src-tauri/src/commands/stream_commands.rs`, inside `mod tests` (after `retain_streams_ignores_unknown_ids`, ~line 469), add a distinct-URL builder and three tests:

```rust
    fn src(id: &str, url: &str) -> StreamInfo {
        StreamInfo { id: id.into(), url: url.into(), ..sample() }
    }

    #[test]
    fn insert_transfers_copy_assigns_fresh_ids_and_returns_source_ids() {
        let mut target = Profile::create_default();
        let sources = vec![src("a", "http://a"), src("b", "http://b")];
        let (transferred, conflicts) =
            insert_transfers(&mut target, &sources, &TransferMode::Copy, "NOW").unwrap();
        assert_eq!(transferred, vec!["a".to_string(), "b".to_string()]); // source ids, in order
        assert_eq!(conflicts, 0);
        assert_eq!(target.streams.len(), 2);
        assert!(target.streams.iter().all(|s| s.id != "a" && s.id != "b"), "copy gets fresh ids");
    }

    #[test]
    fn insert_transfers_skips_duplicate_url_as_conflict() {
        let mut target = Profile::create_default();
        target.streams.push(src("existing", "http://dup"));
        let sources = vec![src("a", "http://dup"), src("b", "http://new")];
        let (transferred, conflicts) =
            insert_transfers(&mut target, &sources, &TransferMode::Copy, "NOW").unwrap();
        assert_eq!(transferred, vec!["b".to_string()]);
        assert_eq!(conflicts, 1);
        assert_eq!(target.streams.len(), 2); // existing + b only
    }

    #[test]
    fn insert_transfers_move_preserves_source_id() {
        let mut target = Profile::create_default();
        let sources = vec![src("keep-id", "http://a")];
        let (transferred, _) =
            insert_transfers(&mut target, &sources, &TransferMode::Move, "NOW").unwrap();
        assert_eq!(transferred, vec!["keep-id".to_string()]);
        assert_eq!(target.streams[0].id, "keep-id"); // move keeps id
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml insert_transfers`
Expected: FAIL — `cannot find function insert_transfers in this scope`.

- [ ] **Step 3: Implement the struct + pure helper**

In `src-tauri/src/commands/stream_commands.rs`, add **above** `transfer_stream_to_profile` (near the other free helpers, e.g. after `prepare_transfer_stream` ~line 29):

```rust
/// Result of a bulk transfer: which source ids actually landed in the target,
/// plus how many were skipped and why. `Conflict` is the only skip from the
/// insert step; recording-skips are counted by the command (move only).
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkTransferResult {
    pub transferred: Vec<String>,
    pub skipped_recording: usize,
    pub skipped_conflict: usize,
}

/// Insert each source into `target` with URL dedup. Returns (source ids that
/// landed; conflict count) or an error. `sources` are pre-filtered to the
/// eligible set (the command drops recording streams for move). `Conflict` is
/// the ONLY skip branch; any other `add_stream_checked` error propagates so a
/// future validation can't be silently mislabelled as a conflict (finding 5).
/// Pure over the profile — unit-testable without Tauri state.
pub fn insert_transfers(
    target: &mut Profile,
    sources: &[StreamInfo],
    mode: &TransferMode,
    now: &str,
) -> Result<(Vec<String>, usize), RadioError> {
    let mut transferred = Vec::new();
    let mut skipped_conflict = 0;
    for src in sources {
        let entry = prepare_transfer_stream(src, mode, now.to_string());
        match target.add_stream_checked(entry) {
            Ok(()) => transferred.push(src.id.clone()),
            Err(RadioError::Conflict(_)) => skipped_conflict += 1,
            Err(e) => return Err(e),
        }
    }
    Ok((transferred, skipped_conflict))
}
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml insert_transfers`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the command**

Add **after** `transfer_stream_to_profile` (after ~line 386):

```rust
/// Bulk variant of `transfer_stream_to_profile`. Target chosen once. Partial
/// success: for `Move`, streams in a recording-like state are skipped
/// (`skipped_recording`); a duplicate URL in the target is skipped
/// (`skipped_conflict`) for both modes. One save to the target; for `Move`, one
/// save to the active profile after removing only the transferred ids. Mirrors
/// `remove_streams` (one stop-pass, one retain, one save) and the single
/// `transfer_stream_to_profile` move branch — incl. its accepted TOCTOU window
/// (finding 3): a stream idle at eligibility may be stopped at removal if it
/// became active during the I/O window, same as single-move.
#[tauri::command]
pub async fn transfer_streams_to_profile(
    stream_ids: Vec<String>,
    target_profile: String,
    mode: TransferMode,
    state: tauri::State<'_, AppState>,
) -> Result<BulkTransferResult, String> {
    // 1. Guard: never transfer into the active profile.
    {
        let profile = state.active_profile.read().await;
        if profile.name == target_profile {
            return Err(RadioError::Forbidden(
                "Cannot transfer a stream into the active profile".into(),
            )
            .to_string());
        }
    }

    let id_set: std::collections::HashSet<String> = stream_ids.into_iter().collect();

    // 2. Collect sources from the active profile (active-profile order).
    let sources: Vec<StreamInfo> = {
        let profile = state.active_profile.read().await;
        profile.streams.iter().filter(|s| id_set.contains(&s.id)).cloned().collect()
    };

    // 3. Move: skip recording-like streams. Copy is never blocked by state (R4:
    //    a merely-playing stream is moved; playback is not a recording state).
    let (eligible, skipped_recording): (Vec<StreamInfo>, usize) = if mode == TransferMode::Move {
        let manager = state.stream_manager.read().await;
        let mut eligible = Vec::new();
        let mut skipped = 0usize;
        for s in sources {
            let blocked = manager
                .get_status(&s.id)
                .map(|st| move_blocked_by_state(&st.state))
                .unwrap_or(false);
            if blocked { skipped += 1; } else { eligible.push(s); }
        }
        (eligible, skipped)
    } else {
        (sources, 0)
    };

    // 4. Load the target off the async worker.
    let mut target = {
        let name = target_profile.clone();
        tokio::task::spawn_blocking(move || Profile::load(&name))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?
    };

    // 5. Insert eligible with URL dedup (Conflict → skip; other → error, finding 5).
    let now = chrono::Local::now().to_rfc3339();
    let (transferred, skipped_conflict) =
        insert_transfers(&mut target, &eligible, &mode, &now).map_err(|e| e.to_string())?;

    // 6. One save to the target.
    tokio::task::spawn_blocking(move || target.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    // 7. Move only: stop + remove the transferred ids from active, one save.
    if mode == TransferMode::Move && !transferred.is_empty() {
        let removed: std::collections::HashSet<String> = transferred.iter().cloned().collect();
        {
            let mut manager = state.stream_manager.write().await;
            for id in &removed {
                let _ = manager.stop_recording(id);
            }
        }
        let snapshot = {
            let mut profile = state.active_profile.write().await;
            profile.streams.retain(|s| !removed.contains(&s.id));
            profile.clone()
        };
        tokio::task::spawn_blocking(move || snapshot.save())
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
    }

    Ok(BulkTransferResult { transferred, skipped_recording, skipped_conflict })
}
```

- [ ] **Step 6: Register the command**

In `src-tauri/src/lib.rs`, add immediately after `commands::stream_commands::transfer_stream_to_profile,` (~line 231):

```rust
            commands::stream_commands::transfer_streams_to_profile,
```

- [ ] **Step 7: Add the frontend wrappers**

In `src/lib/tauri.ts`, after `moveStreamToProfile` (~line 615), add:

```ts
export interface BulkTransferResult {
  transferred: string[];
  skippedRecording: number;
  skippedConflict: number;
}

export async function copyStreamsToProfile(streamIds: string[], targetProfile: string): Promise<BulkTransferResult> {
  return invoke("transfer_streams_to_profile", { streamIds, targetProfile, mode: "copy" });
}

export async function moveStreamsToProfile(streamIds: string[], targetProfile: string): Promise<BulkTransferResult> {
  return invoke("transfer_streams_to_profile", { streamIds, targetProfile, mode: "move" });
}
```

- [ ] **Step 8: Verify backend compiles + Rust tests pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml stream_commands`
Expected: builds (warnings OK); all `stream_commands` tests pass incl. the 3 new ones.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/commands/stream_commands.rs src-tauri/src/lib.rs src/lib/tauri.ts
git commit -m "feat(streams): backend transfer_streams_to_profile bulk command + wrappers"
```

---

## Task 2: i18n — bulk-transfer messages (B7)

**Files:**
- Modify: `src/i18n/messages/uk.json` (after `"stream_already_in_profile"` ~line 122)
- Modify: `src/i18n/messages/en.json` (matching position)

**Interfaces:**
- Produces: `m.move_selected({count})`, `m.copy_selected({count})`, `m.move_selected_to_profile_title({count})`, `m.copy_selected_to_profile_title({count})`, `m.transfer_done_moved({count})`, `m.transfer_done_copied({count})`, `m.transfer_skipped_recording({count})`, `m.transfer_skipped_conflict({count})`.

- [ ] **Step 1: Add the Ukrainian keys**

In `src/i18n/messages/uk.json`, after the `"stream_already_in_profile": ...` line, add (keep commas valid):

```json
  "move_selected": "Перемістити виділені ({count})…",
  "copy_selected": "Копіювати виділені ({count})…",
  "move_selected_to_profile_title": "Перемістити виділені потоки ({count}) у профіль",
  "copy_selected_to_profile_title": "Копіювати виділені потоки ({count}) у профіль",
  "transfer_done_moved": "Переміщено {count}",
  "transfer_done_copied": "Скопійовано {count}",
  "transfer_skipped_recording": "пропущено {count} (записується)",
  "transfer_skipped_conflict": "пропущено {count} (вже в профілі)",
```

- [ ] **Step 2: Add the English keys**

In `src/i18n/messages/en.json`, at the matching position:

```json
  "move_selected": "Move selected ({count})…",
  "copy_selected": "Copy selected ({count})…",
  "move_selected_to_profile_title": "Move selected streams ({count}) to profile",
  "copy_selected_to_profile_title": "Copy selected streams ({count}) to profile",
  "transfer_done_moved": "Moved {count}",
  "transfer_done_copied": "Copied {count}",
  "transfer_skipped_recording": "skipped {count} (recording)",
  "transfer_skipped_conflict": "skipped {count} (already in profile)",
```

- [ ] **Step 3: Regenerate paraglide + verify build**

Run: `pnpm vite:build`
Expected: build succeeds; `src/i18n/paraglide/messages.js` now exports `move_selected`, `transfer_done_moved`, etc.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/uk.json src/i18n/messages/en.json src/i18n/paraglide
git commit -m "i18n(streams): bulk copy/move + partial-success summary messages"
```

---

## Task 3: `StreamTransferDialog` — subject-aware title (B2, finding 2)

**Files:**
- Modify: `src/components/streams/StreamTransferDialog.tsx`
- Test: `src/components/streams/StreamTransferDialog.test.tsx`

**Interfaces:**
- Produces: `export type TransferSubject = { kind: "single"; name: string } | { kind: "bulk"; count: number }`; `StreamTransferDialog` prop `subject: TransferSubject` (replaces `streamName`).
- Consumes: `m.{copy,move}_stream_to_profile_title`, `m.{copy,move}_selected_to_profile_title` (Task 2).

- [ ] **Step 1: Update the failing tests**

Rewrite `src/components/streams/StreamTransferDialog.test.tsx`. Extend the message mock and switch cases to `subject`:

```tsx
vi.mock("../../i18n/paraglide/messages", () => ({
  copy_stream_to_profile_title: ({ name }: { name: string }) => `Копіювати «${name}» у профіль`,
  move_stream_to_profile_title: ({ name }: { name: string }) => `Перемістити «${name}» у профіль`,
  copy_selected_to_profile_title: ({ count }: { count: number }) => `Копіювати виділені потоки (${count}) у профіль`,
  move_selected_to_profile_title: ({ count }: { count: number }) => `Перемістити виділені потоки (${count}) у профіль`,
  transfer_create_new_profile: () => "+ Новий профіль…",
  transfer_no_other_profiles: () => "Інших профілів немає",
  transfer_target_profiles: () => "Цільові профілі",
  cancel: () => "Скасувати",
}));
```

Update `renderDialog` to pass `subject` instead of `streamName`:

```tsx
function renderDialog(over: Partial<Parameters<typeof StreamTransferDialog>[0]> = {}) {
  const props = {
    mode: "copy" as const, subject: { kind: "single", name: "Radio Paradise" } as const, profiles,
    onSelect: vi.fn(), onCreateNew: vi.fn(), onCancel: vi.fn(), ...over,
  };
  return { ...render(<StreamTransferDialog {...props} />), props };
}
```

Replace the two title tests and add the discriminating bulk-at-1 test:

```tsx
  it("shows the single copy title from subject {single}", () => {
    renderDialog();
    expect(screen.getByText("Копіювати «Radio Paradise» у профіль")).toBeTruthy();
  });

  it("shows the move title in move mode", () => {
    renderDialog({ mode: "move" });
    expect(screen.getByText("Перемістити «Radio Paradise» у профіль")).toBeTruthy();
  });

  it("shows the BULK title for subject {bulk} — even when count is 1 (route, not count)", () => {
    renderDialog({ subject: { kind: "bulk", count: 1 } });
    expect(screen.getByText("Копіювати виділені потоки (1) у профіль")).toBeTruthy();
  });

  it("shows the bulk move title with the count", () => {
    renderDialog({ mode: "move", subject: { kind: "bulk", count: 3 } });
    expect(screen.getByText("Перемістити виділені потоки (3) у профіль")).toBeTruthy();
  });
```

(The `onSelect`/`onCreateNew`/empty-profiles tests keep working with the default single `subject`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/StreamTransferDialog.test.tsx`
Expected: FAIL — `subject` not used; old `streamName` title path / bulk-title missing.

- [ ] **Step 3: Implement the subject prop**

In `src/components/streams/StreamTransferDialog.tsx`, replace the `Props` interface and the `title` computation:

```tsx
export type TransferSubject = { kind: "single"; name: string } | { kind: "bulk"; count: number };

interface Props {
  mode: "copy" | "move";
  /** What is being transferred — drives the title by ROUTE, not by count (finding 2). */
  subject: TransferSubject;
  /** Non-active profiles the stream(s) can be sent to. */
  profiles: ProfileMeta[];
  onSelect: (profileName: string) => void;
  onCreateNew: () => void;
  onCancel: () => void;
}

export function StreamTransferDialog({ mode, subject, profiles, onSelect, onCreateNew, onCancel }: Props) {
  const title =
    subject.kind === "bulk"
      ? mode === "copy"
        ? m.copy_selected_to_profile_title({ count: subject.count })
        : m.move_selected_to_profile_title({ count: subject.count })
      : mode === "copy"
        ? m.copy_stream_to_profile_title({ name: subject.name })
        : m.move_stream_to_profile_title({ name: subject.name });
```

(Leave the rest of the component unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/streams/StreamTransferDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamTransferDialog.tsx src/components/streams/StreamTransferDialog.test.tsx
git commit -m "feat(streams): StreamTransferDialog subject-aware title (single|bulk)"
```

---

## Task 4: `StreamContextMenu` — selection-aware move/copy (B4, R4)

**Files:**
- Modify: `src/components/streams/StreamContextMenu.tsx`
- Test: `src/components/streams/StreamContextMenu.test.tsx`

**Interfaces:**
- Consumes: `$streamSelection` (already), `m.move_selected`/`m.copy_selected` (Task 2). No prop changes — labels keyed on the existing `isSelected`/`selection.size`. Routing stays in StreamList (Task 5).

- [ ] **Step 1: Write the failing tests**

In `src/components/streams/StreamContextMenu.test.tsx`, add the two new message mocks to the `vi.mock` block:

```tsx
  move_selected: ({ count }: { count: number }) => `Перемістити виділені (${count})`,
  copy_selected: ({ count }: { count: number }) => `Копіювати виділені (${count})`,
```

Add a new describe block:

```tsx
describe("StreamContextMenu — selection-aware move/copy labels", () => {
  const open = (container: HTMLElement) =>
    fireEvent.click(container.querySelector('button[data-segment="action-menu"]')!);

  it("shows bulk move/copy labels with the count when the row is selected", async () => {
    replaceSelection(new Set(["s1", "s2"])); // row under test is s1
    const { container } = renderMenu(mkStatus("idle"));
    open(container);
    expect(await screen.findByRole("menuitem", { name: "Перемістити виділені (2)" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Копіювати виділені (2)" })).toBeTruthy();
  });

  it("keeps Move enabled even while recording when the row is selected (bulk skips server-side)", async () => {
    replaceSelection(new Set(["s1"]));
    const { container } = renderMenu(mkStatus("recording"));
    open(container);
    const move = await screen.findByRole("menuitem", { name: "Перемістити виділені (1)" });
    expect(move.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("uses single labels + the moveDisabled gate when the row is NOT selected", async () => {
    replaceSelection(new Set(["other"]));
    const { container } = renderMenu(mkStatus("recording"));
    open(container);
    expect(await screen.findByRole("menuitem", { name: "Перемістити в профіль…" })).toBeTruthy();
    const move = screen.getByRole("menuitem", { name: "Перемістити в профіль…" });
    expect(move.getAttribute("aria-disabled")).toBe("true");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/StreamContextMenu.test.tsx`
Expected: FAIL — menu still renders single labels when selected; `move_selected` undefined.

- [ ] **Step 3: Implement selection-aware labels**

In `src/components/streams/StreamContextMenu.tsx`, replace the `copy-to-profile` and `move-to-profile` `MenuItem`s (lines ~144-157):

```tsx
          <MenuItem
            id="copy-to-profile"
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            <span aria-hidden="true" className="mr-2 inline-flex"><Copy size={14} /></span>
            {isSelected ? m.copy_selected({ count: selection.size }) : m.copy_to_profile()}
          </MenuItem>
          <MenuItem
            id="move-to-profile"
            isDisabled={isSelected ? false : moveDisabled}
            title={!isSelected && moveDisabled ? m.move_disabled_reason() : undefined}
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
          >
            <span aria-hidden="true" className="mr-2 inline-flex"><FolderInput size={14} /></span>
            {isSelected ? m.move_selected({ count: selection.size }) : m.move_to_profile()}
          </MenuItem>
```

(`isSelected`/`selection` already exist in the component.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/streams/StreamContextMenu.test.tsx`
Expected: PASS (incl. the existing single-label tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamContextMenu.tsx src/components/streams/StreamContextMenu.test.tsx
git commit -m "feat(streams): selection-aware move/copy labels in row menu (B4)"
```

---

## Task 5: `StreamList` — bulk transfer convergence (B3/B4/B5)

**Files:**
- Modify: `src/components/streams/StreamList.tsx`
- Test: `src/components/streams/StreamList.test.tsx`

**Interfaces:**
- Consumes: `tauri.copyStreamsToProfile`/`moveStreamsToProfile`/`BulkTransferResult` (Task 1), `m.transfer_done_*`/`m.transfer_skipped_*` (Task 2).
- Produces: `StreamListHandle = ZoneEntry & { requestBulkDelete(): void; requestBulkTransfer(mode: "copy" | "move"): void }` (consumed by StreamsPanel, Task 6).

- [ ] **Step 1: Write the failing tests**

In `src/components/streams/StreamList.test.tsx`, extend the `vi.mock("../../lib/tauri", …)` block with the bulk wrappers (place near `copyStreamToProfile`):

```tsx
  copyStreamsToProfile: vi.fn().mockResolvedValue({ transferred: [], skippedRecording: 0, skippedConflict: 0 }),
  moveStreamsToProfile: vi.fn().mockResolvedValue({ transferred: [], skippedRecording: 0, skippedConflict: 0 }),
```

Add a new describe block:

```tsx
describe("StreamList — bulk transfer to profile", () => {
  const openMenu = (container: HTMLElement, id: string) =>
    fireEvent.click(container.querySelector<HTMLElement>(`li[data-item-id="${id}"] button[data-segment="action-menu"]`)!);
  const idOf = () => document.activeElement?.getAttribute("data-item-id") ?? null;

  it("toolbar requestBulkTransfer('move') opens the picker with the BULK title", async () => {
    replaceSelection(new Set(["a", "b"]));
    const ref = createRef<ZoneEntry & { requestBulkTransfer(m: "copy" | "move"): void }>();
    render(<StreamList ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} />);
    await act(async () => { ref.current!.requestBulkTransfer("move"); });
    expect(await screen.findByText(m.move_selected_to_profile_title({ count: 2 }))).toBeTruthy();
  });

  it("bulk move calls moveStreamsToProfile, removes only transferred rows, focuses a survivor", async () => {
    vi.mocked(tauri.moveStreamsToProfile).mockResolvedValueOnce({ transferred: ["a"], skippedRecording: 0, skippedConflict: 0 });
    replaceSelection(new Set(["a", "b"])); // b will be reported as skipped (not in transferred)
    const ref = createRef<ZoneEntry & { requestBulkTransfer(m: "copy" | "move"): void }>();
    const { container } = render(<StreamList ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} />);
    act(() => (ref.current as unknown as ZoneEntry).focus("forward"));
    await act(async () => { ref.current!.requestBulkTransfer("move"); });
    fireEvent.click(await screen.findByRole("button", { name: "Jazz" }));

    await waitFor(() => expect(tauri.moveStreamsToProfile).toHaveBeenCalledTimes(1));
    expect(new Set(vi.mocked(tauri.moveStreamsToProfile).mock.calls[0][0])).toEqual(new Set(["a", "b"]));
    await waitFor(() => expect($streams.get().map((s) => s.id)).toEqual(["b", "c"])); // only 'a' removed
    await waitFor(() => expect(idOf()).toBe("b")); // nearest survivor, never <body>
    expect(document.activeElement).not.toBe(document.body);
    expect([...$streamSelection.get()]).toEqual(["b"]); // moved 'a' pruned; skipped 'b' stays selected
  });

  it("bulk copy calls copyStreamsToProfile, keeps rows AND selection", async () => {
    vi.mocked(tauri.copyStreamsToProfile).mockResolvedValueOnce({ transferred: ["a", "b"], skippedRecording: 0, skippedConflict: 0 });
    replaceSelection(new Set(["a", "b"]));
    const ref = createRef<ZoneEntry & { requestBulkTransfer(m: "copy" | "move"): void }>();
    render(<StreamList ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} />);
    await act(async () => { ref.current!.requestBulkTransfer("copy"); });
    fireEvent.click(await screen.findByRole("button", { name: "Jazz" }));

    await waitFor(() => expect(tauri.copyStreamsToProfile).toHaveBeenCalledTimes(1));
    expect($streams.get().map((s) => s.id)).toEqual(["a", "b", "c"]); // nothing removed
    expect([...$streamSelection.get()].sort()).toEqual(["a", "b"]); // selection kept
  });

  it("announces a reason-broken-down summary", async () => {
    vi.mocked(tauri.moveStreamsToProfile).mockResolvedValueOnce({ transferred: ["a"], skippedRecording: 1, skippedConflict: 1 });
    replaceSelection(new Set(["a", "b", "c"]));
    const ref = createRef<ZoneEntry & { requestBulkTransfer(m: "copy" | "move"): void }>();
    render(<StreamList ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} />);
    $announcer.set(null);
    await act(async () => { ref.current!.requestBulkTransfer("move"); });
    fireEvent.click(await screen.findByRole("button", { name: "Jazz" }));
    await waitFor(() =>
      expect($announcer.get()?.message).toBe(
        `${m.transfer_done_moved({ count: 1 })}, ${m.transfer_skipped_recording({ count: 1 })}, ${m.transfer_skipped_conflict({ count: 1 })}`,
      ),
    );
  });

  it("⋯ move on a SELECTED row opens bulk; on a NON-selected row collapses + single", async () => {
    replaceSelection(new Set(["a", "b"]));
    const { container } = renderList();
    openMenu(container, "a"); // selected
    fireEvent.click(await screen.findByRole("menuitem", { name: m.move_selected({ count: 2 }) }));
    expect(await screen.findByText(m.move_selected_to_profile_title({ count: 2 }))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: m.cancel() }));

    openMenu(container, "c"); // not selected
    fireEvent.click(await screen.findByRole("menuitem", { name: m.move_to_profile() }));
    expect(await screen.findByText(m.move_stream_to_profile_title({ name: "Charlie" }))).toBeTruthy();
    expect([...$streamSelection.get()]).toEqual(["c"]); // collapsed to the row
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/StreamList.test.tsx -t "bulk transfer"`
Expected: FAIL — `requestBulkTransfer` not on the handle; bulk routing/summary absent.

- [ ] **Step 3: Widen the handle type + Transfer target**

In `src/components/streams/StreamList.tsx`, change the handle type (line ~21) and the `Transfer` type (lines ~85-89):

```ts
/** Imperative handle: zone navigation + the toolbar's bulk-op entry points. */
export type StreamListHandle = ZoneEntry & {
  requestBulkDelete(): void;
  requestBulkTransfer(mode: "copy" | "move"): void;
};
```

```ts
  type TransferTarget = { kind: "single"; streamId: string } | { kind: "bulk" };
  type Transfer =
    | null
    | { phase: "pick"; mode: "copy" | "move"; target: TransferTarget; profiles: ProfileMeta[] }
    | { phase: "create"; mode: "copy" | "move"; target: TransferTarget };
```

- [ ] **Step 4: Make `openTransfer` stable + branch the transfer flows**

Replace `openTransfer` (lines ~94-101) with a `useCallback` version, and add `doBulkTransfer` + `composeSummary`. Place `openTransfer` **above** `imperativeExtra` (move the `imperativeExtra` definition below it, or keep `imperativeExtra` where it is and ensure `openTransfer` is declared earlier — both must precede the `imperativeExtra` that references it):

```ts
  const openTransfer = useCallback(async (mode: "copy" | "move", target: TransferTarget) => {
    try {
      const all = await tauri.listProfiles();
      setTransfer({ phase: "pick", mode, target, profiles: all.filter((p) => !p.isActive) });
    } catch (e) {
      addToast(String(e), "error");
    }
  }, []);

  const composeSummary = (mode: "copy" | "move", res: tauri.BulkTransferResult): string => {
    const lead =
      mode === "move"
        ? m.transfer_done_moved({ count: res.transferred.length })
        : m.transfer_done_copied({ count: res.transferred.length });
    const parts = [lead];
    if (res.skippedRecording > 0) parts.push(m.transfer_skipped_recording({ count: res.skippedRecording }));
    if (res.skippedConflict > 0) parts.push(m.transfer_skipped_conflict({ count: res.skippedConflict }));
    return parts.join(", ");
  };

  const doBulkTransfer = async (mode: "copy" | "move", targetProfile: string) => {
    const ids = [...$streamSelection.get()];
    if (ids.length === 0) { setTransfer(null); return; }
    const visible = streams; // snapshot before await — for the focus index (A8)
    try {
      const res = mode === "move"
        ? await tauri.moveStreamsToProfile(ids, targetProfile)
        : await tauri.copyStreamsToProfile(ids, targetProfile);
      if (mode === "move" && res.transferred.length > 0) {
        const moved = new Set(res.transferred);
        const topRemovedIdx = Math.max(0, visible.findIndex((s) => moved.has(s.id)));
        const survivors = visible.filter((s) => !moved.has(s.id));
        // Remove only the transferred rows; pruneSelection drops them from the
        // selection, leaving the skipped rows selected (R3). copy: untouched.
        $streams.set($streams.get().filter((s) => !moved.has(s.id)));
        pendingBulkFocusRef.current =
          survivors.length === 0 ? null : survivors[Math.min(topRemovedIdx, survivors.length - 1)].id;
        if (survivors.length === 0) onEmpty();
        setBulkDeleteSeq((n) => n + 1);
      }
      announce(composeSummary(mode, res), "polite");
      setTransfer(null);
    } catch (err) {
      addToast(String(err), "error");
      setTransfer(null);
    }
  };
```

Update `imperativeExtra` (lines ~48-56) to also expose `requestBulkTransfer`:

```ts
  const imperativeExtra = useCallback(
    (api: { focusItem: (itemId: string, segment?: SegmentKind) => void }) => {
      focusItemRef.current = api.focusItem;
      return {
        requestBulkDelete: () => setBulkConfirmOpen(true),
        requestBulkTransfer: (mode: "copy" | "move") => openTransfer(mode, { kind: "bulk" }),
      };
    },
    [openTransfer],
  );
```

- [ ] **Step 5: Branch `doCreateAndTransfer` + the JSX routing/dialog**

Update `doCreateAndTransfer` (lines ~130-150) to branch by `target.kind`:

```ts
      const meta = await tauri.createProfile(nameInput.trim());
      const { mode, target } = transfer;
      setNameInput("");
      if (target.kind === "bulk") await doBulkTransfer(mode, meta.name);
      else await doTransfer(mode, target.streamId, meta.name);
```

In `renderRow`, route `onMoveToProfile`/`onCopyToProfile` by selection (mirror `onDelete`, lines ~307-321):

```tsx
              onCopyToProfile={() => {
                if ($streamSelection.get().has(id)) openTransfer("copy", { kind: "bulk" });
                else { replaceSelection(new Set([id])); openTransfer("copy", { kind: "single", streamId: id }); }
              }}
              onMoveToProfile={() => {
                if ($streamSelection.get().has(id)) openTransfer("move", { kind: "bulk" });
                else { replaceSelection(new Set([id])); openTransfer("move", { kind: "single", streamId: id }); }
              }}
```

Update the `StreamTransferDialog` render (lines ~349-364) to pass `subject` + branch `onSelect`:

```tsx
      {transfer?.phase === "pick" &&
        createPortal(
          <StreamTransferDialog
            mode={transfer.mode}
            subject={
              transfer.target.kind === "bulk"
                ? { kind: "bulk", count: selectedSet.size }
                : { kind: "single", name: streams.find((s) => s.id === transfer.target.streamId)?.name ?? "" }
            }
            profiles={transfer.profiles}
            onSelect={(profileName) =>
              transfer.target.kind === "bulk"
                ? doBulkTransfer(transfer.mode, profileName)
                : doTransfer(transfer.mode, transfer.target.streamId, profileName)
            }
            onCreateNew={() => {
              setNameInput("");
              setNameError(null);
              setTransfer({ phase: "create", mode: transfer.mode, target: transfer.target });
            }}
            onCancel={() => setTransfer(null)}
          />,
          document.body,
        )}
```

(`doTransfer` keeps its existing signature `(mode, streamId, targetProfile)` and its Conflict-keeps-picker-open behavior — used only for `{kind:"single"}`.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/streams/StreamList.test.tsx`
Expected: PASS — new bulk-transfer block green; existing single copy/move/conflict/delete tests still green.

- [ ] **Step 7: Commit**

```bash
git add src/components/streams/StreamList.tsx src/components/streams/StreamList.test.tsx
git commit -m "feat(streams): converge bulk copy/move in StreamList (handle + summary + focus)"
```

---

## Task 6: `StreamsPanel` — toolbar Move/Copy buttons, roving 14 (B6)

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx`
- Test: `src/components/streams/StreamsPanel.test.tsx`

**Interfaces:**
- Consumes: `StreamListHandle.requestBulkTransfer` (Task 5), `m.move_selected`/`m.copy_selected` (Task 2).

- [ ] **Step 1: Write the failing tests**

In `src/components/streams/StreamsPanel.test.tsx`, extend the `vi.mock("../../lib/tauri", …)` block with the picker/bulk deps (so `requestBulkTransfer` → `openTransfer` → `listProfiles` works):

```tsx
  listProfiles: vi.fn().mockResolvedValue([
    { name: "Default", streamCount: 3, isActive: true },
    { name: "Jazz", streamCount: 0, isActive: false },
  ]),
  createProfile: vi.fn().mockResolvedValue({ name: "Fresh", streamCount: 0, isActive: false }),
  copyStreamsToProfile: vi.fn().mockResolvedValue({ transferred: [], skippedRecording: 0, skippedConflict: 0 }),
  moveStreamsToProfile: vi.fn().mockResolvedValue({ transferred: [], skippedRecording: 0, skippedConflict: 0 }),
```

Add to the `StreamsPanel — selection toolbar cluster` describe block:

```tsx
  it("shows disabled Move/Copy selected (0) buttons with no selection", () => {
    renderPanel();
    const move = screen.getByRole("button", { name: m.move_selected({ count: 0 }) });
    const copy = screen.getByRole("button", { name: m.copy_selected({ count: 0 }) });
    expect(move.getAttribute("aria-disabled")).toBe("true");
    expect(copy.getAttribute("aria-disabled")).toBe("true");
  });

  it("the toolbar move button opens the list's bulk transfer picker", async () => {
    replaceSelection(new Set(["a", "b"]));
    renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: m.move_selected({ count: 2 }) }));
    });
    expect(await screen.findByText(m.move_selected_to_profile_title({ count: 2 }))).toBeTruthy();
  });
```

Update the roving test (lines ~490-498) to 14:

```tsx
  it("keeps a 14-stop roving toolbar in DOM order", () => {
    const { container } = renderPanel();
    const toolbar = container.querySelector('[data-zone-id="streams-toolbar"]')!;
    const stops = Array.from(toolbar.querySelectorAll<HTMLButtonElement>("button"));
    const tabbable = stops.filter((b) => b.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
    expect(stops.length).toBeGreaterThanOrEqual(14);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx -t "selection toolbar cluster"`
Expected: FAIL — Move/Copy buttons don't exist.

- [ ] **Step 3: Add the refs + extend `toolbarRefs` (14)**

In `src/components/streams/StreamsPanel.tsx`, add two refs next to `deleteSelectedBtn` (line ~207):

```tsx
  const moveSelectedBtn = useRef<HTMLButtonElement | null>(null);
  const copySelectedBtn = useRef<HTMLButtonElement | null>(null);
```

Replace the `toolbarRefs` array (lines ~217-220) — new order puts Move 4, Copy 5, Delete 6:

```tsx
  const toolbarRefs = useMemo(
    () => [addBtn, importBtn, exportBtn, selectAllBtn, moveSelectedBtn, copySelectedBtn, deleteSelectedBtn, recordAllBtn, stopAllBtn, chip0Ref, chip1Ref, chip2Ref, sort0Ref, sort1Ref],
    [],
  );
```

- [ ] **Step 4: Add the two buttons + renumber tabIndex**

In the row-2 cluster, insert the Move/Copy buttons **between** SelectAll (index 3) and DeleteSelected, and bump every later `toolbarTabIndex`. After the SelectAll button (line ~490) add:

```tsx
          {/* Index 4: Перемістити виділені (N) — count in visible text == accessible name */}
          <button
            ref={moveSelectedBtn}
            tabIndex={toolbarTabIndex(4)}
            aria-disabled={selCount === 0 || undefined}
            onClick={() => { if (selCount > 0) streamListRef.current?.requestBulkTransfer("move"); }}
            className={`rounded px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
              selCount === 0 ? "cursor-not-allowed text-slate-600" : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            {m.move_selected({ count: selCount })}
          </button>

          {/* Index 5: Копіювати виділені (N) */}
          <button
            ref={copySelectedBtn}
            tabIndex={toolbarTabIndex(5)}
            aria-disabled={selCount === 0 || undefined}
            onClick={() => { if (selCount > 0) streamListRef.current?.requestBulkTransfer("copy"); }}
            className={`rounded px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
              selCount === 0 ? "cursor-not-allowed text-slate-600" : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            {m.copy_selected({ count: selCount })}
          </button>
```

Then renumber the existing `toolbarTabIndex(...)` calls below:
- DeleteSelected: `toolbarTabIndex(4)` → `toolbarTabIndex(6)`
- RecordAll: `toolbarTabIndex(5)` → `toolbarTabIndex(7)`
- StopAll: `toolbarTabIndex(6)` → `toolbarTabIndex(8)`
- Filter chips: `toolbarTabIndex(7 + i)` → `toolbarTabIndex(9 + i)`
- Sort options: `toolbarTabIndex(10 + i)` → `toolbarTabIndex(12 + i)`

- [ ] **Step 5: Update the index/count comments**

- Line ~201 `// ── Toolbar zone refs (12 items) ──` → `(14 items)`.
- Line ~434 comment `all 12 interactive items (indices 0–11)` → `all 14 interactive items (indices 0–13)`.
- The row-2 cluster comment (line ~477) and the per-button index comments — update DeleteSelected to "Index 6", RecordAll "Index 7", StopAll "Index 8", chips "Indices 9–11", sorts "Indices 12–13".

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx`
Expected: PASS — new Move/Copy tests green; the renumbered roving + existing cluster/lifecycle tests still green.

- [ ] **Step 7: Commit**

```bash
git add src/components/streams/StreamsPanel.tsx src/components/streams/StreamsPanel.test.tsx
git commit -m "feat(streams): toolbar Move/Copy selected buttons, roving 14 (B6)"
```

---

## Task 7: Full gates + docs flip

**Files:**
- Modify: `docs/backlog/p1-bulk-stream-operations.md`

- [ ] **Step 1: Run all gates**

```bash
pnpm test
pnpm vite:build
cargo test --manifest-path src-tauri/Cargo.toml
```
Expected: all green. (If a first `pnpm test` flakes on a cold transform cache, re-run once before diagnosing.)

- [ ] **Step 2: Tick milestone-B criteria in the umbrella record**

In `docs/backlog/p1-bulk-stream-operations.md`, "Критерії готовності": flip to `[x]`:
- `Масові копіювати/перемістити в профіль: ціль обирається один раз`
- `Часткове виконання: придатні — виконано, непридатні — пропущено + live-підсумок`

In the header (lines ~5) update the state note to "віхи A,B реалізовані; C–D попереду", and in the "Віхи (A–D)" section mark `### B. Перенос у профіль (streams)` as ✅ реалізовано (short note pointing at the B spec/plan), mirroring the A entry's format.

- [ ] **Step 3: Commit**

```bash
git add docs/backlog/p1-bulk-stream-operations.md
git commit -m "docs(backlog): mark bulk-stream milestone B done (transfer to profile)"
```

- [ ] **Step 4: Manual NVDA pass (B acceptance #6/#7)**

Build/run the app (`just dev`), then with NVDA:
1. Select rows (Ctrl+Space / Shift+↓ / Ctrl+A) → hear the selection summary.
2. Toolbar «Перемістити виділені (N)» → pick a profile → hear «Переміщено N» (+ skip clauses) → focus lands on a surviving row (never silence/`<body>`).
3. Repeat «Копіювати виділені (N)» → rows + selection remain; can copy the same set to another profile.
4. ⋯ on a selected row → «Перемістити/Копіювати виділені (N)…» acts on the set; ⋯ on a non-selected row → single labels, acts on that row.
5. Trigger partial success: include a recording stream (move → skipped recording) and a stream whose URL already exists in the target (skipped conflict); confirm the summary names both reasons.

---

## Self-Review (checklist run against the spec)

**Spec coverage:** B1→Task 1; B2→Task 3; B4 labels→Task 4; B3/B4 routing+B5→Task 5; B6→Task 6; B7→Task 2; R3 (selection kept)→Task 5 Step 4; R4 (playing moved, no skip)→Task 1 Step 5 (copy/move state partition) + Task 4 (move enabled when selected); finding 3 (TOCTOU wording)→Task 1 command doc-comment; finding 5 (error propagation)→Task 1 `insert_transfers`; docs flip→Task 7.

**Type consistency:** `BulkTransferResult` = `{transferred, skippedRecording, skippedConflict}` in tauri.ts (Task 1) and consumed identically in `composeSummary`/tests (Task 5). `TransferSubject` defined in Task 3, used in Task 5 dialog render. `requestBulkTransfer(mode: "copy" | "move")` declared on the handle (Task 5) and called in Task 6. `TransferTarget` single|bulk consistent across openTransfer/doCreateAndTransfer/dialog (Task 5).

**Placeholder scan:** every code step shows full code; no TBD/"similar to"/"handle errors" placeholders.
