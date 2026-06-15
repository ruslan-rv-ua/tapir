# Bulk Stream Operations — Milestone A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in selection layer to `useCompositeList`/`CompositeList` over a `$streamSelection` atom, with a Windows-standard keyboard + mouse model, NVDA-correct ARIA announcements, and bulk stream deletion with one confirm and correct focus restoration — streams only.

**Architecture:** The hook owns all selection *mechanics* (toggle, range, select-all, clear, anchor); the consumer supplies a tiny two-method adapter to the atom plus a localized-text callback. The atom (`$streamSelection`) is the single source of truth, read via `useStore` by the toolbar (`StreamsPanel`), list (`StreamList`), and rows (`StreamItem`) — no prop-drilling through `CompositeList`. Bulk delete is backend-first (one Rust command, one save) and converges in `StreamList`, which owns the single `ConfirmDialog` and programmatic post-delete focus.

**Tech Stack:** React 19, nanostores (`atom`/`map`), Tauri v2 (Rust commands), Paraglide.js i18n (compile-time), Vitest + Testing Library, react-aria-components. Gates: `pnpm test` + `pnpm vite:build` (NOT `tsc` — see [typecheck note](#notes)); Rust via `cargo test`.

**Design source:** This plan references — does not duplicate — the decisions in
[docs/backlog/p1-bulk-stream-operations.md](../../backlog/p1-bulk-stream-operations.md) (decisions 1–18) and the spec
[2026-06-14-bulk-stream-operations-A-design.md](../specs/2026-06-14-bulk-stream-operations-A-design.md) (sections A1–A10). Section tags below (e.g. "A8") point at that spec.

---

## File Structure

**Create:**
- `docs/superpowers/plans/2026-06-14-bulk-stream-operations-A.md` — this plan.

**Modify (frontend):**
- `src/stores/streams.ts` — `$streamSelection` atom + `replaceSelection`/`pruneSelection` store-actions (A1).
- `src/hooks/useCompositeList.ts` — (1) `resolveKeyAction` refactor (A3); (2) split `case ' '` by ctrl (A4); (3) `selection`/`onSelectionChange` options; (4) `anchorRef`/`anchorBaseRef` + toggle/range/all/clear (A2/A4); (5) delegated `onClick` for mouse (A5).
- `src/components/common/composite-list/CompositeList.tsx` — thread `selection`/`onSelectionChange` props + attach hook's `onClick`.
- `src/components/common/composite-list/CompositeRow.tsx` — `selected?: boolean` → `data-selected` attribute.
- `src/components/streams/StreamItem.tsx` — `isSelected` prop: name suffix + `data-selected` highlight (A6).
- `src/components/streams/StreamContextMenu.tsx` — delete item label carries count when the row is selected (A8/№16).
- `src/components/streams/StreamList.tsx` — selection adapter, render `isSelected`, `onSelectionChange`→`announce`, bulk `ConfirmDialog` + execution + focus, `requestBulkDelete()` on the handle, delete routing, `pruneSelection` effect (A2/A6/A8/A10).
- `src/components/streams/StreamsPanel.tsx` — 2 toolbar buttons + `[N вибрано]`, roving 10→12, lifecycle clearing, deferred `onEmpty` focus (A7/A8/A10).
- `src/hooks/useProfileSync.ts` — clear selection on `profile-changed` (A10).
- `src/lib/tauri.ts` — `removeStreams(ids)` wrapper (A9).
- `src/i18n/messages/{uk,en}.json` — new selection/bulk-delete keys; regenerate paraglide.

**Modify (backend):**
- `src-tauri/src/commands/stream_commands.rs` — `retain_streams` pure helper + `remove_streams` command (A9).
- `src-tauri/src/lib.rs` — register `remove_streams`.

**Documentation (flip after code lands):**
- `docs/keyboard-shortcuts.md` Tier 2′ — ⬜→✅ for Ctrl+Space/Ctrl+A/Shift+↑↓/Escape-clear.
- `docs/backlog/p1-bulk-stream-operations.md` — tick milestone-A items in "Критерії готовності".

---

## Notes

- **Gates:** `pnpm test` and `pnpm vite:build` are the real frontend gates. `tsc` has ~51 pre-existing errors from untyped paraglide output — do **not** treat `tsc` as a gate.
- **Paraglide:** after editing `src/i18n/messages/*.json`, regenerate the typed messages by running `pnpm vite:build` (the `@inlang/paraglide-vite` plugin compiles to `src/i18n/paraglide/`). New `m.*` functions only exist after regeneration.
- **`e.code` vs `e.key`:** letters (`KeyA`, `KeyC`) and Space use `e.code` (Cyrillic-layout safe, accessibility.md §12); arrows/Enter/Delete/Tab/Escape use `e.key`. Space is matched as `e.code === "Space" || e.key === " "` so existing `key:" "` tests keep working.
- **Run a single Vitest file:** `pnpm exec vitest run <path>`.

---

## Task 1: Backend — `remove_streams` command (A9)

**Files:**
- Modify: `src-tauri/src/commands/stream_commands.rs` (add `retain_streams` near the other helpers; add command after `remove_stream` at line ~144; add tests in the existing `#[cfg(test)] mod tests` at line ~344)
- Modify: `src-tauri/src/lib.rs:229` (register command in the `invoke_handler!` list)
- Modify: `src/lib/tauri.ts:138-140` (add `removeStreams` wrapper)

- [ ] **Step 1: Write the failing Rust test**

In `src-tauri/src/commands/stream_commands.rs`, inside `mod tests` (after the `move_*` tests at line ~376), add a small builder and two tests:

```rust
    fn with_id(id: &str) -> StreamInfo {
        StreamInfo { id: id.into(), ..sample() }
    }

    #[test]
    fn retain_streams_removes_only_targeted_ids_and_counts() {
        let mut v = vec![with_id("a"), with_id("b"), with_id("c")];
        let ids: std::collections::HashSet<String> =
            ["a".to_string(), "c".to_string()].into_iter().collect();
        let removed = retain_streams(&mut v, &ids);
        assert_eq!(removed, 2);
        assert_eq!(v.iter().map(|s| s.id.clone()).collect::<Vec<_>>(), vec!["b"]);
    }

    #[test]
    fn retain_streams_ignores_unknown_ids() {
        let mut v = vec![with_id("a")];
        let ids: std::collections::HashSet<String> =
            ["does-not-exist".to_string()].into_iter().collect();
        assert_eq!(retain_streams(&mut v, &ids), 0);
        assert_eq!(v.len(), 1);
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml retain_streams`
Expected: FAIL — `cannot find function retain_streams in this scope`.

- [ ] **Step 3: Implement the pure helper + command**

In `src-tauri/src/commands/stream_commands.rs`, add the pure helper above the `remove_stream` command (near the other free helpers; keep it `pub` so `mod tests` sees it):

```rust
/// Remove every stream whose id is in `ids`. Returns how many were actually
/// removed (ignores ids not present). Pure over the vector — unit-testable
/// without any Tauri state, mirroring `prepare_transfer_stream`.
pub fn retain_streams(streams: &mut Vec<StreamInfo>, ids: &std::collections::HashSet<String>) -> usize {
    let before = streams.len();
    streams.retain(|s| !ids.contains(&s.id));
    before - streams.len()
}
```

Then add the command right after `remove_stream` (after line ~144):

```rust
/// Bulk variant of `remove_stream`: one stop-recordings pass, one `retain`, one
/// save. Returns the count actually removed (honest, vs an N-save frontend loop).
/// Deleting a stream that is currently recording is allowed (same as the single
/// `remove_stream`), so there is no "skipped" category for delete.
#[tauri::command]
pub async fn remove_streams(
    stream_ids: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<usize, String> {
    let ids: std::collections::HashSet<String> = stream_ids.into_iter().collect();

    // 1. Stop recordings first (best-effort; NotFound is a harmless no-op).
    {
        let mut manager = state.stream_manager.write().await;
        for id in &ids {
            let _ = manager.stop_recording(id);
        }
    }

    // 2. Retain survivors + count removed, snapshot while the write lock is held.
    let (removed, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let removed = retain_streams(&mut profile.streams, &ids);
        (removed, profile.clone())
    };

    // 3. One save on a blocking thread (don't starve the async worker).
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    Ok(removed)
}
```

- [ ] **Step 4: Run the Rust tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml retain_streams`
Expected: PASS (both tests).

- [ ] **Step 5: Register the command**

In `src-tauri/src/lib.rs`, add the line immediately after `commands::stream_commands::remove_stream,` (line ~229):

```rust
            commands::stream_commands::remove_streams,
```

- [ ] **Step 6: Add the frontend wrapper**

In `src/lib/tauri.ts`, after `removeStream` (line ~138-140), add:

```ts
export async function removeStreams(streamIds: string[]): Promise<number> {
  return invoke("remove_streams", { streamIds });
}
```

- [ ] **Step 7: Verify the backend compiles**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: builds (warnings OK).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/commands/stream_commands.rs src-tauri/src/lib.rs src/lib/tauri.ts
git commit -m "feat(streams): backend remove_streams bulk command + wrapper"
```

---

## Task 2: Store — `$streamSelection` + `replaceSelection`/`pruneSelection` (A1)

**Files:**
- Modify: `src/stores/streams.ts`
- Create: `src/stores/streams.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/stores/streams.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { $streamSelection, replaceSelection, pruneSelection } from "./streams";

beforeEach(() => $streamSelection.set(new Set()));

describe("$streamSelection + replaceSelection", () => {
  it("defaults to an empty set", () => {
    expect($streamSelection.get().size).toBe(0);
  });

  it("replaceSelection stores a brand-new Set (new identity for useStore)", () => {
    const before = $streamSelection.get();
    replaceSelection(new Set(["a", "b"]));
    const after = $streamSelection.get();
    expect(after).not.toBe(before);
    expect([...after].sort()).toEqual(["a", "b"]);
  });
});

describe("pruneSelection", () => {
  it("drops ids that no longer exist", () => {
    replaceSelection(new Set(["a", "b", "c"]));
    pruneSelection(new Set(["a", "c"])); // b is gone
    expect([...$streamSelection.get()].sort()).toEqual(["a", "c"]);
  });

  it("is a no-op (same Set identity) when nothing changed — avoids extra rerenders", () => {
    replaceSelection(new Set(["a", "b"]));
    const before = $streamSelection.get();
    pruneSelection(new Set(["a", "b", "x"])); // all selected ids still exist
    expect($streamSelection.get()).toBe(before);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/stores/streams.test.ts`
Expected: FAIL — `replaceSelection is not exported`.

- [ ] **Step 3: Implement the atom + store-actions**

In `src/stores/streams.ts`, after the `$streams` declaration (line ~4), add:

```ts
/**
 * Multi-select state for the streams list. The single source of truth — the
 * toolbar (StreamsPanel), the list (StreamList) and each row (StreamItem) read
 * it via useStore. Streams-specific for now; generalised to the other lists in
 * milestone D.
 */
export const $streamSelection = atom<Set<string>>(new Set());

/** Replace the whole selection with a fresh Set (new identity so useStore fires). */
export function replaceSelection(next: ReadonlySet<string>): void {
  $streamSelection.set(new Set(next));
}

/**
 * Drop selected ids that are no longer present in `existingIds`. No-op (keeps the
 * same Set identity) when nothing changed, so it can run in an effect on every
 * $streams change without spurious rerenders.
 */
export function pruneSelection(existingIds: ReadonlySet<string>): void {
  const current = $streamSelection.get();
  let changed = false;
  const next = new Set<string>();
  for (const id of current) {
    if (existingIds.has(id)) next.add(id);
    else changed = true;
  }
  if (changed) $streamSelection.set(next);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/stores/streams.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/streams.ts src/stores/streams.test.ts
git commit -m "feat(streams): $streamSelection atom + replace/prune store-actions"
```

---

## Task 3: i18n — selection + bulk-delete messages

**Files:**
- Modify: `src/i18n/messages/uk.json`
- Modify: `src/i18n/messages/en.json`

- [ ] **Step 1: Add the Ukrainian keys**

In `src/i18n/messages/uk.json`, add these keys right after the `"stream_removed": ...` line (line ~146). Keep the surrounding commas valid:

```json
  "selection_suffix": "виділено",
  "stream_selected": "{name}, виділено",
  "stream_deselected": "{name}, знято з виділення",
  "selection_count": "Виділено {count}",
  "selection_cleared": "Виділення знято",
  "select_all": "Виділити все",
  "clear_selection": "Зняти виділення",
  "selected_count_label": "{count} вибрано",
  "delete_selected": "Видалити виділені ({count})",
  "confirm_delete_selected": "Видалити виділені потоки ({count})?",
  "streams_removed_bulk": "Видалено {count}",
```

- [ ] **Step 2: Add the English keys**

In `src/i18n/messages/en.json`, add the mirrored keys at the matching position (after `"stream_removed"`):

```json
  "selection_suffix": "selected",
  "stream_selected": "{name}, selected",
  "stream_deselected": "{name}, deselected",
  "selection_count": "{count} selected",
  "selection_cleared": "Selection cleared",
  "select_all": "Select all",
  "clear_selection": "Clear selection",
  "selected_count_label": "{count} selected",
  "delete_selected": "Delete selected ({count})",
  "confirm_delete_selected": "Delete selected streams ({count})?",
  "streams_removed_bulk": "Removed {count}",
```

- [ ] **Step 3: Regenerate paraglide + verify build**

Run: `pnpm vite:build`
Expected: build succeeds; `src/i18n/paraglide/messages.js` now exports `selection_count`, `delete_selected`, etc.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/uk.json src/i18n/messages/en.json src/i18n/paraglide
git commit -m "i18n(streams): selection + bulk-delete messages"
```

---

## Task 4: Refactor `useCompositeList` key handling to a `resolveKeyAction` table (A3)

This is a behaviour-preserving refactor (decision: do it **before** adding new keys, clearing the REFACTOR TRIGGER). The existing `useCompositeList.test.tsx` is the safety net — no new tests; all must stay green.

**Files:**
- Modify: `src/hooks/useCompositeList.ts`
- Test: `src/hooks/useCompositeList.test.tsx` (existing — must stay green)

- [ ] **Step 1: Add the `ActionId` type + `resolveKeyAction` pure function**

In `src/hooks/useCompositeList.ts`, above `useCompositeList`, add:

```ts
/** Semantic key intents resolved from a KeyboardEvent (pure; no list state). */
type ActionId =
  | "up" | "down" | "left" | "right"
  | "home" | "end" | "pageup" | "pagedown"
  | "enter" | "space" | "delete" | "tab" | "copy";

/**
 * Map a keyboard event to a single list intent, or null to let it bubble.
 * Letters/Space use e.code (Cyrillic-layout safe); navigation/activation keys
 * use e.key. Modifiers for Enter/Space (Shift=listen, Ctrl=record) are NOT
 * encoded here — they ride along via `modifiers(e)` at dispatch time.
 */
function resolveKeyAction(e: React.KeyboardEvent): ActionId | null {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === "KeyC") return "copy";
  switch (e.key) {
    case "ArrowUp": return "up";
    case "ArrowDown": return "down";
    case "ArrowLeft": return "left";
    case "ArrowRight": return "right";
    case "Home": return "home";
    case "End": return "end";
    case "PageUp": return "pageup";
    case "PageDown": return "pagedown";
    case "Enter": return "enter";
    case "Delete": return "delete";
    case "Tab": return "tab";
  }
  if (e.code === "Space" || e.key === " ") return "space";
  return null;
}
```

- [ ] **Step 2: Rewrite `onKeyDownCapture` body as `switch (action)`**

Replace the body of `onKeyDownCapture` (lines ~246-374) so it resolves the action first, keeping every existing behaviour 1:1. The `consume`, `isInModal`, and no-`activeItemId` guards stay. Tab and copy short-circuit before the index lookup:

```ts
  const onKeyDownCapture = useCallback(
    (e: React.KeyboardEvent) => {
      const consume = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      if (isInModal()) return;

      const action = resolveKeyAction(e);
      if (!action) return;

      if (!activeItemId) {
        if (action === "tab") {
          consume();
          onTabOutRef.current(!e.shiftKey);
        }
        return;
      }

      if (action === "tab") {
        consume();
        onTabOutRef.current(!e.shiftKey);
        return;
      }

      // Ctrl/Cmd+C → generic "copy" for the active row; the consumer decides what
      // to copy. List-scoped on purpose (a registry match would hijack Ctrl+C in
      // text fields across the whole section).
      if (action === "copy") {
        consume();
        onActionRef.current("copy", activeItemId, activeSegment, modifiers(e));
        return;
      }

      const currentIdx = items.findIndex((it) => it.id === activeItemId);
      if (currentIdx < 0) return;
      const currentItem = items[currentIdx];
      const allSegments = resolveSegments(currentItem);
      const segIdx = allSegments.indexOf(activeSegment);

      switch (action) {
        case "up":
          consume();
          if (currentIdx > 0) moveFocus(items[currentIdx - 1].id, "summary");
          break;

        case "down":
          consume();
          if (currentIdx < items.length - 1) moveFocus(items[currentIdx + 1].id, "summary");
          break;

        case "left":
          consume();
          if (segIdx > 0) moveFocus(activeItemId, allSegments[segIdx - 1]);
          break;

        case "right":
          consume();
          if (segIdx < allSegments.length - 1) moveFocus(activeItemId, allSegments[segIdx + 1]);
          break;

        case "home":
          consume();
          if (items.length > 0) moveFocus(items[0].id, "summary");
          break;

        case "end":
          consume();
          if (items.length > 0) moveFocus(items[items.length - 1].id, "summary");
          break;

        case "pageup": {
          consume();
          const container = listRef.current;
          if (!container || items.length === 0) break;
          const firstItemEl = container.querySelector<HTMLElement>("[data-item-id]");
          const itemH = firstItemEl?.offsetHeight || 40;
          const page = Math.max(1, Math.floor(container.clientHeight / itemH));
          const targetIdx = Math.max(0, currentIdx - page);
          moveFocus(items[targetIdx].id, "summary");
          break;
        }

        case "pagedown": {
          consume();
          const container = listRef.current;
          if (!container || items.length === 0) break;
          const firstItemEl = container.querySelector<HTMLElement>("[data-item-id]");
          const itemH = firstItemEl?.offsetHeight || 40;
          const page = Math.max(1, Math.floor(container.clientHeight / itemH));
          const targetIdx = Math.min(items.length - 1, currentIdx + page);
          moveFocus(items[targetIdx].id, "summary");
          break;
        }

        case "enter":
          if (isNativeControl(document.activeElement)) break;
          consume();
          onActionRef.current("primary", activeItemId, activeSegment, modifiers(e));
          break;

        case "space":
          if (isNativeControl(document.activeElement)) break;
          consume();
          onActionRef.current("toggle", activeItemId, activeSegment, modifiers(e));
          break;

        case "delete":
          consume();
          onActionRef.current("delete", activeItemId, activeSegment, modifiers(e));
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeItemId, activeSegment, items, moveFocus],
  );
```

Delete the now-obsolete `REFACTOR TRIGGER` comment block (old lines ~268-273).

- [ ] **Step 3: Run the existing hook tests to verify they still pass**

Run: `pnpm exec vitest run src/hooks/useCompositeList.test.tsx`
Expected: PASS — all existing tests green (ArrowDown, Home/End, Enter, Space, Delete, Ctrl+C, Tab, native-button passthrough, modal containment, restoreFocus, reconciliation).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCompositeList.ts
git commit -m "refactor(composite-list): key handling via resolveKeyAction table (no behaviour change)"
```

---

## Task 5: Selection plumbing + Ctrl+Space toggle + split Space (A2/A4)

**Files:**
- Modify: `src/hooks/useCompositeList.ts`
- Test: `src/hooks/useCompositeList.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `src/hooks/useCompositeList.test.tsx`. First extend `HarnessProps`/`Harness` to forward selection (an in-test mutable Set backs the adapter):

```tsx
// add to HarnessProps:
  selectionRef?: { current: Set<string> };
  onSelectionChange?: (c: SelectionChange) => void;
```

Import `SelectionChange` from the hook. In `Harness`, build the adapter and pass it:

```tsx
  const selection = selectionRef
    ? {
        current: () => selectionRef.current as ReadonlySet<string>,
        replace: (next: ReadonlySet<string>) => {
          selectionRef.current = new Set(next);
        },
      }
    : undefined;

  const { listRef, onKeyDownCapture, onContextMenu, onClick, isFocused, restoreFocus } =
    useCompositeList({ zoneId: "test", items, onTabOut, onAction, onEmpty, selection, onSelectionChange });
```

…and attach `onClick={onClick}` to the `<ul>` (used in Task 10). Then add the test block:

```tsx
describe("selection — Ctrl+Space toggles the active row", () => {
  it("adds the active row to the selection and emits a single change (not toggle/record)", () => {
    const selectionRef = { current: new Set<string>() };
    const onAction = vi.fn();
    const onSelectionChange = vi.fn();
    render(
      <Harness items={makeItems()} onAction={onAction} selectionRef={selectionRef} onSelectionChange={onSelectionChange} />,
    );
    focusStart("a");

    press(" ", { code: "Space", ctrlKey: true });

    expect([...selectionRef.current]).toEqual(["a"]);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "single", via: "key", count: 1, lastId: "a", selected: true }),
    );
    // Must NOT fall into the record/play toggle branch.
    expect(onAction).not.toHaveBeenCalledWith("toggle", "a", "summary", expect.anything());
  });

  it("Ctrl+Space again removes the row (selected:false)", () => {
    const selectionRef = { current: new Set<string>(["a"]) };
    const onSelectionChange = vi.fn();
    render(<Harness items={makeItems()} selectionRef={selectionRef} onSelectionChange={onSelectionChange} />);
    focusStart("a");
    press(" ", { code: "Space", ctrlKey: true });
    expect(selectionRef.current.has("a")).toBe(false);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "single", count: 0, lastId: "a", selected: false }),
    );
  });

  it("plain Space still fires record/play toggle (no selection change)", () => {
    const selectionRef = { current: new Set<string>() };
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} selectionRef={selectionRef} />);
    focusStart("a");
    press(" ");
    expect(onAction).toHaveBeenCalledWith("toggle", "a", "summary", noMods);
    expect(selectionRef.current.size).toBe(0);
  });

  it("Ctrl+Space on an action button still toggles the ROW (not gated by isNativeControl)", () => {
    const selectionRef = { current: new Set<string>() };
    render(<Harness items={makeItems()} selectionRef={selectionRef} />);
    focusStart("a");
    press("ArrowRight"); press("ArrowRight"); press("ArrowRight"); // a/action-play (a button)
    expectActive("a", "action-play");
    press(" ", { code: "Space", ctrlKey: true });
    expect([...selectionRef.current]).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/hooks/useCompositeList.test.tsx -t "Ctrl+Space"`
Expected: FAIL — `onClick` undefined / `selectToggle` not handled / Ctrl+Space falls into record-play.

- [ ] **Step 3: Add the selection interfaces + options**

In `src/hooks/useCompositeList.ts`, add above the options interface:

```ts
/** Two-method bridge to the consumer's selection store (atom). */
export interface CompositeSelection {
  /** Event-time snapshot (atom.get). */
  current: () => ReadonlySet<string>;
  /** Delegates to the store's replaceSelection (new Set identity). */
  replace: (next: ReadonlySet<string>) => void;
}

/** Emitted after every selection gesture so the consumer can localize an announce. */
export interface SelectionChange {
  /** single = Ctrl+Space/Ctrl+Click/simple click; group = range/all/clear. */
  kind: "single" | "group";
  /** pointer gestures already moved DOM focus (NVDA reads the row) → caller skips single. */
  via: "key" | "pointer";
  /** New selection size. */
  count: number;
  /** Toggled row (single only). */
  lastId?: string;
  /** Its new state (single only). */
  selected?: boolean;
}
```

Add to `UseCompositeListOptions`:

```ts
  /** Opt-in: enables the selection layer. Omit → list behaves exactly as before. */
  selection?: CompositeSelection;
  onSelectionChange?: (change: SelectionChange) => void;
```

Destructure them in the hook signature: `({ items, onTabOut, onAction, onEmpty, selection, onSelectionChange })`.

- [ ] **Step 4: Add selection refs + anchor + helpers, and the `selectToggle` action**

Inside the hook, alongside the other option refs (after `onEmptyRef`):

```ts
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  // Range anchor (id) + snapshot of the selection when the anchor was (re)set.
  const anchorRef = useRef<string | null>(null);
  const anchorBaseRef = useRef<ReadonlySet<string>>(new Set());
```

Add helpers near `resolveSegments` (these close over `items` and the refs, so define inside the hook body, before `onKeyDownCapture`):

```ts
  /** (Re)set the anchor and snapshot the *current* selection as its base. */
  const setAnchor = useCallback((id: string) => {
    anchorRef.current = id;
    anchorBaseRef.current = new Set(selectionRef.current?.current() ?? []);
  }, []);

  /** Toggle one row's membership; (re)sets the anchor; emits a single change. */
  const toggleSelection = useCallback((id: string, via: "key" | "pointer") => {
    const sel = selectionRef.current;
    if (!sel) return;
    const next = new Set(sel.current());
    const willSelect = !next.has(id);
    if (willSelect) next.add(id);
    else next.delete(id);
    sel.replace(next);
    setAnchor(id); // base snapshot now includes the just-toggled row
    onSelectionChangeRef.current?.({ kind: "single", via, count: next.size, lastId: id, selected: willSelect });
  }, [setAnchor]);
```

Now extend `resolveKeyAction` (and the `ActionId` union) for Ctrl+Space. Add `"selectToggle"` to `ActionId`, and at the **top** of `resolveKeyAction` (before the `KeyC` check is fine; Space + ctrl):

```ts
  if (
    (e.code === "Space" || e.key === " ") &&
    (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey
  ) return "selectToggle";
```

In the `switch (action)`, add a case **above** `case "space"`:

```ts
        case "selectToggle":
          // Selection toggle for the active row. NOT gated by isNativeControl:
          // it works from any segment incl. an action button, and consume() mutes
          // the native click. No-op (and no consume) when selection is disabled.
          if (!selectionRef.current) break;
          consume();
          toggleSelection(activeItemId, "key");
          break;
```

Add `toggleSelection`, `setAnchor` to the `onKeyDownCapture` dependency array.

- [ ] **Step 5: Add a no-op `onClick` to the hook return (filled in Task 10) and export it**

So the Harness/CompositeList can wire it now. Add near `onContextMenu`:

```ts
  const onClick = useCallback((_e: React.MouseEvent) => {
    // Mouse selection gestures are added in Task 10.
  }, []);
```

Add `onClick` to the returned object: `return { listRef, onKeyDownCapture, onContextMenu, onClick, isFocused, restoreFocus, focusItem, activeItemId, activeSegment };`

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/hooks/useCompositeList.test.tsx -t "Ctrl+Space"`
Expected: PASS (4 tests). Also rerun the whole file to confirm no regression: `pnpm exec vitest run src/hooks/useCompositeList.test.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useCompositeList.ts src/hooks/useCompositeList.test.tsx
git commit -m "feat(composite-list): selection adapter + Ctrl+Space toggle, split Space by ctrl"
```

---

## Task 6: Shift+↑/↓ range selection + anchorBase guard (A2/A4)

**Files:**
- Modify: `src/hooks/useCompositeList.ts`
- Test: `src/hooks/useCompositeList.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
describe("selection — Shift+Arrow range from the anchor", () => {
  it("Shift+Down expands, then Shift+Up contracts (anchored, base-snapshot model)", () => {
    const selectionRef = { current: new Set<string>() };
    const onSelectionChange = vi.fn();
    render(<Harness items={makeItems()} selectionRef={selectionRef} onSelectionChange={onSelectionChange} />);
    focusStart("a");

    press(" ", { code: "Space", ctrlKey: true }); // anchor = a, select a
    press("ArrowDown", { shiftKey: true }); // span a..b
    expect([...selectionRef.current].sort()).toEqual(["a", "b"]);
    expectActive("b", "summary");

    press("ArrowDown", { shiftKey: true }); // span a..c
    expect([...selectionRef.current].sort()).toEqual(["a", "b", "c"]);

    press("ArrowUp", { shiftKey: true }); // span a..b — c drops
    expect([...selectionRef.current].sort()).toEqual(["a", "b"]);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "group", via: "key", count: 2 }),
    );
  });

  it("anchorBase guard: after external clear, the first Shift+Down yields exactly the landed row", () => {
    const selectionRef = { current: new Set<string>() };
    render(<Harness items={makeItems()} selectionRef={selectionRef} />);
    focusStart("a");
    press(" ", { code: "Space", ctrlKey: true }); // anchor=a, base={a}
    // External clear (toolbar/lifecycle) WITHOUT touching the hook's anchor:
    selectionRef.current = new Set();
    press("ArrowDown", { shiftKey: true });
    // Stale base {a} must NOT resurrect; result is just the landed row.
    expect([...selectionRef.current]).toEqual(["b"]);
  });

  it("without a selection adapter, Shift+Down is a plain move (1:1 legacy)", () => {
    render(<Harness items={makeItems()} />);
    focusStart("a");
    press("ArrowDown", { shiftKey: true });
    expectActive("b", "summary");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/hooks/useCompositeList.test.tsx -t "Shift+Arrow"`
Expected: FAIL — Shift+Down resolves to plain `down` and doesn't build a range.

- [ ] **Step 3: Implement range selection**

Add to `ActionId`: `"selectRangeUp" | "selectRangeDown"`. In `resolveKeyAction`, before the `switch (e.key)` arrow cases, add:

```ts
  if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (e.key === "ArrowDown") return "selectRangeDown";
    if (e.key === "ArrowUp") return "selectRangeUp";
  }
```

Add a `rangeIds` helper inside the hook (near `setAnchor`):

```ts
  /** Contiguous ids from `fromId` to `toId` over the current visible items. */
  const rangeIds = useCallback((fromId: string, toId: string): string[] => {
    const i = items.findIndex((it) => it.id === fromId);
    const j = items.findIndex((it) => it.id === toId);
    if (i < 0 || j < 0) return [toId];
    const [lo, hi] = i <= j ? [i, j] : [j, i];
    return items.slice(lo, hi + 1).map((it) => it.id);
  }, [items]);
```

The range cursor needs the live `activeItemId`/`currentIdx`, so inline the logic directly in the `switch (action)` (a memoized callback would capture a stale `activeItemId`). Add these two cases:

```ts
        case "selectRangeDown":
        case "selectRangeUp": {
          consume();
          const dir = action === "selectRangeDown" ? 1 : -1;
          const nextIdx = Math.max(0, Math.min(items.length - 1, currentIdx + dir));
          const cursorId = items[nextIdx].id;
          moveFocus(cursorId, "summary");
          const sel = selectionRef.current;
          if (!sel) break; // no adapter → behaves like a plain arrow move
          // Guard: an external clear leaves a stale anchorBase that base ∪ range
          // would resurrect. On an empty selection, re-anchor to the landed row
          // with an empty base so the span is just {cursor}.
          if (sel.current().size === 0) {
            anchorRef.current = cursorId;
            anchorBaseRef.current = new Set();
          }
          if (anchorRef.current == null) anchorRef.current = cursorId;
          const span = rangeIds(anchorRef.current, cursorId);
          const next = new Set(anchorBaseRef.current);
          for (const id of span) next.add(id);
          sel.replace(next);
          onSelectionChangeRef.current?.({ kind: "group", via: "key", count: next.size });
          break;
        }
```

Add `rangeIds` to the `onKeyDownCapture` deps (`setAnchor`/`toggleSelection` were already added in Task 5).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/hooks/useCompositeList.test.tsx -t "Shift+Arrow"`
Expected: PASS (3 tests). Rerun the full file to confirm no regression.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCompositeList.ts src/hooks/useCompositeList.test.tsx
git commit -m "feat(composite-list): Shift+Arrow range selection with anchorBase guard"
```

---

## Task 7: Ctrl+A toggle-all-visible (A4)

**Files:**
- Modify: `src/hooks/useCompositeList.ts`
- Test: `src/hooks/useCompositeList.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
describe("selection — Ctrl+A toggles all visible", () => {
  it("from partial selection → all visible selected; group change", () => {
    const selectionRef = { current: new Set<string>(["a"]) };
    const onSelectionChange = vi.fn();
    render(<Harness items={makeItems()} selectionRef={selectionRef} onSelectionChange={onSelectionChange} />);
    focusStart("a");
    press("a", { code: "KeyA", ctrlKey: true });
    expect([...selectionRef.current].sort()).toEqual(["a", "b", "c"]);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "group", count: 3 }),
    );
  });

  it("from all-visible-selected → cleared (those rows removed)", () => {
    const selectionRef = { current: new Set<string>(["a", "b", "c"]) };
    render(<Harness items={makeItems()} selectionRef={selectionRef} />);
    focusStart("a");
    press("a", { code: "KeyA", ctrlKey: true });
    expect(selectionRef.current.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/hooks/useCompositeList.test.tsx -t "Ctrl+A"`
Expected: FAIL — `KeyA`+ctrl is unresolved (`null`), nothing happens.

- [ ] **Step 3: Implement Ctrl+A**

Add `"selectAll"` to `ActionId`. In `resolveKeyAction`, next to the `KeyC` check:

```ts
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === "KeyA") return "selectAll";
```

In the `switch (action)` add:

```ts
        case "selectAll": {
          const sel = selectionRef.current;
          if (!sel) break;
          consume();
          const next = new Set(sel.current());
          const visibleIds = items.map((it) => it.id);
          const allSelected = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
          if (allSelected) visibleIds.forEach((id) => next.delete(id));
          else visibleIds.forEach((id) => next.add(id));
          sel.replace(next);
          onSelectionChangeRef.current?.({ kind: "group", via: "key", count: next.size });
          break;
        }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/hooks/useCompositeList.test.tsx -t "Ctrl+A"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCompositeList.ts src/hooks/useCompositeList.test.tsx
git commit -m "feat(composite-list): Ctrl+A toggles all visible rows"
```

---

## Task 8: Escape clears (consume only when non-empty) (A4)

**Files:**
- Modify: `src/hooks/useCompositeList.ts`
- Test: `src/hooks/useCompositeList.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
describe("selection — Escape clears non-empty, otherwise passes through", () => {
  it("non-empty: clears, emits group count 0, and consumes (no bubble)", () => {
    const selectionRef = { current: new Set<string>(["a", "b"]) };
    const onSelectionChange = vi.fn();
    const onParentKeyDown = vi.fn();
    render(
      <Harness items={makeItems()} selectionRef={selectionRef} onSelectionChange={onSelectionChange} onParentKeyDown={onParentKeyDown} />,
    );
    focusStart("a");
    press("Escape");
    expect(selectionRef.current.size).toBe(0);
    expect(onSelectionChange).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "group", count: 0 }));
    expect(onParentKeyDown).not.toHaveBeenCalled(); // consumed
  });

  it("empty: does NOT consume — Escape stays free in the list", () => {
    const selectionRef = { current: new Set<string>() };
    const onParentKeyDown = vi.fn();
    render(<Harness items={makeItems()} selectionRef={selectionRef} onParentKeyDown={onParentKeyDown} />);
    focusStart("a");
    press("Escape");
    expect(onParentKeyDown).toHaveBeenCalledTimes(1); // bubbled
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/hooks/useCompositeList.test.tsx -t "Escape clears"`
Expected: FAIL — Escape is unresolved; nothing clears.

- [ ] **Step 3: Implement Escape clear**

Add `"clearSelection"` to `ActionId`. In `resolveKeyAction`, in the `switch (e.key)`:

```ts
    case "Escape": return "clearSelection";
```

In the `switch (action)`:

```ts
        case "clearSelection": {
          const sel = selectionRef.current;
          if (sel && sel.current().size > 0) {
            consume();
            sel.replace(new Set());
            anchorRef.current = null;
            anchorBaseRef.current = new Set();
            onSelectionChangeRef.current?.({ kind: "group", via: "key", count: 0 });
          }
          // empty (or no adapter): do NOT consume — Escape is free in the list.
          break;
        }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/hooks/useCompositeList.test.tsx -t "Escape clears"`
Expected: PASS (2 tests). Rerun the whole hook file.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCompositeList.ts src/hooks/useCompositeList.test.tsx
git commit -m "feat(composite-list): Escape clears non-empty selection, else passes through"
```

---

## Task 9: Anchor (re)set on plain navigation (A2/A4)

When `selection` is active, plain arrow/Home/End/Page moves must (re)set the anchor (base = current selection) so a following Shift gesture extends from the new position. Shift gestures must NOT move the anchor (already handled in Task 6).

**Files:**
- Modify: `src/hooks/useCompositeList.ts`
- Test: `src/hooks/useCompositeList.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
describe("selection — plain navigation re-sets the anchor", () => {
  it("Ctrl+Space, ArrowDown, then Shift+Down ranges from the moved-to row", () => {
    const selectionRef = { current: new Set<string>() };
    render(<Harness items={makeItems()} selectionRef={selectionRef} />);
    focusStart("a");
    press(" ", { code: "Space", ctrlKey: true }); // select a, anchor=a, base={a}
    press("ArrowDown"); // plain move to b → anchor=b, base={a}
    press("ArrowDown", { shiftKey: true }); // span b..c → {a,b,c}
    expect([...selectionRef.current].sort()).toEqual(["a", "b", "c"]);
  });
});
```

(If the anchor had stayed at `a`, Shift+Down from `c` would span `a..c` = `{a,b,c}` too — so to make the test discriminating, the assertion above is the union either way. Use this sharper variant instead:)

```tsx
  it("after moving the cursor, Shift+Up contracts toward the NEW anchor, not the old one", () => {
    const selectionRef = { current: new Set<string>() };
    render(<Harness items={makeItems()} selectionRef={selectionRef} />);
    focusStart("a");
    press(" ", { code: "Space", ctrlKey: true }); // anchor=a
    press("End"); // plain move to c → anchor=c, base={a}
    press("ArrowUp", { shiftKey: true }); // span c..b → {a,b,c}? no: base={a} ∪ range(c,b)={b,c}
    expect([...selectionRef.current].sort()).toEqual(["a", "b", "c"]);
    press("ArrowDown", { shiftKey: true }); // back to c → base{a} ∪ {c} = {a,c}
    expect([...selectionRef.current].sort()).toEqual(["a", "c"]);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/hooks/useCompositeList.test.tsx -t "re-sets the anchor"`
Expected: FAIL — without anchor re-set, the second Shift+Down spans from the stale anchor `a`, giving `{a,b,c}` not `{a,c}`.

- [ ] **Step 3: Implement anchor re-set on plain moves**

In the `switch (action)`, after `moveFocus(...)` in the `up`/`down`/`home`/`end`/`pageup`/`pagedown` cases, set the anchor to the new active row when selection is active. To avoid repeating it six times, compute the moved-to id and call `setAnchor` once. Refactor those cases to capture the target id, e.g.:

```ts
        case "up": {
          consume();
          if (currentIdx > 0) {
            const id = items[currentIdx - 1].id;
            moveFocus(id, "summary");
            if (selectionRef.current) setAnchor(id);
          }
          break;
        }
        case "down": {
          consume();
          if (currentIdx < items.length - 1) {
            const id = items[currentIdx + 1].id;
            moveFocus(id, "summary");
            if (selectionRef.current) setAnchor(id);
          }
          break;
        }
        case "home": {
          consume();
          if (items.length > 0) {
            const id = items[0].id;
            moveFocus(id, "summary");
            if (selectionRef.current) setAnchor(id);
          }
          break;
        }
        case "end": {
          consume();
          if (items.length > 0) {
            const id = items[items.length - 1].id;
            moveFocus(id, "summary");
            if (selectionRef.current) setAnchor(id);
          }
          break;
        }
```

For `pageup`/`pagedown`, after computing `targetIdx`, replace the `moveFocus` line with:

```ts
          const id = items[targetIdx].id;
          moveFocus(id, "summary");
          if (selectionRef.current) setAnchor(id);
```

(`left`/`right` are within-row segment moves — they do NOT change the row, so leave them as-is.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/hooks/useCompositeList.test.tsx -t "re-sets the anchor"`
Expected: PASS. Rerun the whole hook file — all green.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCompositeList.ts src/hooks/useCompositeList.test.tsx
git commit -m "feat(composite-list): plain navigation re-anchors the selection range"
```

---

## Task 10: Mouse selection — delegated `onClick` (A5)

**Files:**
- Modify: `src/hooks/useCompositeList.ts`
- Test: `src/hooks/useCompositeList.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add a click helper near the other helpers in the test file:

```tsx
function clickRow(id: string, init: MouseEventInit = {}) {
  fireEvent.click(stop(id, "summary"), { bubbles: true, ...init });
}
```

Then:

```tsx
describe("selection — mouse gestures on the <ul>", () => {
  it("simple click collapses the selection to that row (single, pointer)", () => {
    const selectionRef = { current: new Set<string>(["a", "b"]) };
    const onSelectionChange = vi.fn();
    render(<Harness items={makeItems()} selectionRef={selectionRef} onSelectionChange={onSelectionChange} />);
    clickRow("c");
    expect([...selectionRef.current]).toEqual(["c"]);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "single", via: "pointer", count: 1, lastId: "c", selected: true }),
    );
  });

  it("Ctrl+Click toggles that row (single, pointer)", () => {
    const selectionRef = { current: new Set<string>(["a"]) };
    render(<Harness items={makeItems()} selectionRef={selectionRef} />);
    clickRow("b", { ctrlKey: true });
    expect([...selectionRef.current].sort()).toEqual(["a", "b"]);
  });

  it("Shift+Click spans anchor→click (group, pointer)", () => {
    const selectionRef = { current: new Set<string>() };
    const onSelectionChange = vi.fn();
    render(<Harness items={makeItems()} selectionRef={selectionRef} onSelectionChange={onSelectionChange} />);
    clickRow("a"); // anchor = a
    clickRow("c", { shiftKey: true }); // span a..c
    expect([...selectionRef.current].sort()).toEqual(["a", "b", "c"]);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "group", via: "pointer", count: 3 }),
    );
  });

  it("clicks on the row's own controls do not touch the selection", () => {
    const selectionRef = { current: new Set<string>(["a"]) };
    render(<Harness items={makeItems()} selectionRef={selectionRef} />);
    fireEvent.click(stop("a", "action-play"), { bubbles: true });
    expect([...selectionRef.current]).toEqual(["a"]); // unchanged
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/hooks/useCompositeList.test.tsx -t "mouse gestures"`
Expected: FAIL — `onClick` is still the Task-5 no-op.

- [ ] **Step 3: Implement the delegated `onClick`**

Replace the placeholder `onClick` in `useCompositeList.ts` with the real handler:

```ts
  // Delegated mouse selection on the <ul> (only active when `selection` is set),
  // mirroring onContextMenu. All gestures move DOM focus to the clicked row, so
  // NVDA reads it (with the ", виділено" suffix) — that's why single-row pointer
  // changes are emitted via:"pointer" (the consumer must NOT re-announce them).
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      const sel = selectionRef.current;
      if (!sel) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // The row's own controls handle their own clicks.
      if (target.closest("button, a, input, select, textarea")) return;
      const row = target.closest<HTMLElement>("[data-item-id]");
      const id = row?.dataset.itemId;
      if (!id || !items.some((it) => it.id === id)) return;

      // Move active + DOM focus to the clicked row.
      setActiveItemId(id);
      setActiveSegment("summary");
      pendingFocusRef.current = { itemId: id, segment: "summary" };

      if (e.ctrlKey && !e.shiftKey) {
        toggleSelection(id, "pointer");
        return;
      }
      if (e.shiftKey) {
        if (sel.current().size === 0) {
          anchorRef.current = id;
          anchorBaseRef.current = new Set();
        }
        if (anchorRef.current == null) anchorRef.current = id;
        const span = rangeIds(anchorRef.current, id);
        const next = new Set(anchorBaseRef.current);
        for (const x of span) next.add(x);
        sel.replace(next);
        onSelectionChangeRef.current?.({ kind: "group", via: "pointer", count: next.size });
        return;
      }
      // Simple click → collapse to {id}, anchor here.
      sel.replace(new Set([id]));
      setAnchor(id);
      onSelectionChangeRef.current?.({ kind: "single", via: "pointer", count: 1, lastId: id, selected: true });
    },
    [items, rangeIds, setAnchor, toggleSelection],
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/hooks/useCompositeList.test.tsx -t "mouse gestures"`
Expected: PASS (4 tests). Rerun the whole hook file — all green.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCompositeList.ts src/hooks/useCompositeList.test.tsx
git commit -m "feat(composite-list): delegated mouse selection (simple/Ctrl/Shift click)"
```

---

## Task 11: `CompositeList` — thread selection props + attach `onClick`

**Files:**
- Modify: `src/components/common/composite-list/CompositeList.tsx`
- Test: existing `useCompositeList.test.tsx` already covers behaviour; no new test (plumbing is exercised end-to-end by StreamList in Task 13). Gate = `pnpm vite:build` typecheck via the consumer.

- [ ] **Step 1: Add the props to `CompositeListProps`**

In `CompositeList.tsx`, import the new types and extend the interface:

```ts
import {
  useCompositeList,
  type ActionType,
  type ActionModifiers,
  type CompositeListItem,
  type SegmentKind,
  type CompositeSelection,
  type SelectionChange,
} from "../../../hooks/useCompositeList";
```

Add to `CompositeListProps`:

```ts
  /** Opt-in selection adapter (atom bridge). Omit → no selection layer. */
  selection?: CompositeSelection;
  onSelectionChange?: (change: SelectionChange) => void;
```

- [ ] **Step 2: Pass them into the hook + attach `onClick`**

Destructure `selection`, `onSelectionChange` from `props`, pass to `useCompositeList`, pull `onClick` out, and attach it to the `<ul>`:

```ts
  const { listRef, onKeyDownCapture, onContextMenu, onClick, isFocused, restoreFocus, focusItem, activeItemId } =
    useCompositeList({ zoneId, items, onTabOut, onAction, onEmpty, selection, onSelectionChange });
```

On the `<ul>` element (line ~114-122) add `onClick={onClick}` alongside `onKeyDownCapture`/`onContextMenu`.

- [ ] **Step 3: Verify the build typechecks**

Run: `pnpm vite:build`
Expected: builds (the new optional props are accepted; existing callers unaffected).

- [ ] **Step 4: Commit**

```bash
git add src/components/common/composite-list/CompositeList.tsx
git commit -m "feat(composite-list): thread selection props + attach delegated onClick"
```

---

## Task 12: `StreamItem` + `CompositeRow` — selection name suffix + highlight (A6)

**Files:**
- Modify: `src/components/common/composite-list/CompositeRow.tsx`
- Modify: `src/components/streams/StreamItem.tsx`
- Test: `src/components/streams/StreamItem.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/components/streams/StreamItem.test.tsx`, add an inline render that passes the new `isSelected` prop (the shared `renderItem` helper omits it):

```tsx
import { render } from "@testing-library/react";
import { StreamItem } from "./StreamItem";
import * as m from "../../i18n/paraglide/messages";

describe("StreamItem — selection presentation", () => {
  const renderSelected = (isSelected: boolean) =>
    render(
      <ul>
        <StreamItem
          stream={mkStream({ name: "Radio Paradise" })}
          status={undefined}
          isActiveRow={false}
          isSelected={isSelected}
          isFocused={(seg) => seg === "summary"}
          maxRetries={0}
          onDelete={() => {}}
          onCopyToProfile={() => {}}
          onMoveToProfile={() => {}}
        />
      </ul>,
    );

  it("appends the ', виділено' suffix to the row's accessible name when selected", () => {
    const { container } = renderSelected(true);
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toBe(`Radio Paradise, ${m.selection_suffix()}`);
    expect(li.getAttribute("data-selected")).toBe("true");
  });

  it("no suffix and no data-selected when not selected", () => {
    const { container } = renderSelected(false);
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toBe("Radio Paradise");
    expect(li.getAttribute("data-selected")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/StreamItem.test.tsx -t "selection presentation"`
Expected: FAIL — `isSelected` is not a prop; no suffix; no `data-selected`.

- [ ] **Step 3: Add `selected` to `CompositeRow`**

In `CompositeRow.tsx`, add to `CompositeRowProps`:

```ts
  /** Marks the row as selected — sets data-selected for CSS + assistive parity. */
  selected?: boolean;
```

Destructure `selected` and render the attribute on the `<li>` (after `data-segment="summary"`):

```tsx
      data-selected={selected ? "true" : undefined}
```

- [ ] **Step 4: Wire `isSelected` through `StreamItem`**

In `StreamItem.tsx`:

1. Add to `Props`:

```ts
  /** This row is part of the multi-selection (name suffix + highlight). */
  isSelected?: boolean;
```

2. Destructure `isSelected` in the component signature.

3. Append the suffix to `summaryLabel` (replace the existing `summaryLabel` line ~117):

```ts
  const baseLabel = stateLabel ? `${stateLabel}, ${stream.name}` : stream.name;
  const summaryLabel = isSelected ? `${baseLabel}, ${m.selection_suffix()}` : baseLabel;
```

4. Pass `selected={isSelected}` to `CompositeRow` and add the selection highlight to its `className` (a hue distinct from active/recording/playing; works under forced-colors):

```tsx
      selected={isSelected}
      className={`grid border-b border-slate-800 forced-colors:border-[ButtonText] ${rowBg} data-[selected=true]:bg-sky-900/40 data-[selected=true]:ring-1 data-[selected=true]:ring-inset data-[selected=true]:ring-sky-400/40 forced-colors:data-[selected=true]:bg-[Highlight] forced-colors:data-[selected=true]:text-[HighlightText]`}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/streams/StreamItem.test.tsx`
Expected: PASS (selection tests + existing StreamItem tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/common/composite-list/CompositeRow.tsx src/components/streams/StreamItem.tsx src/components/streams/StreamItem.test.tsx
git commit -m "feat(streams): selected-row name suffix + highlight"
```

---

## Task 13: `StreamList` — selection adapter, render, announcements (A2/A6)

**Files:**
- Modify: `src/components/streams/StreamList.tsx`
- Test: `src/components/streams/StreamList.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `StreamList.test.tsx`, import the selection store and announcer, and reset selection in `beforeEach`:

```tsx
import { $streamSelection, replaceSelection } from "../../stores/streams";
import { $announcer } from "../../stores/announcer";
// in beforeEach: replaceSelection(new Set());
```

Add tests:

```tsx
describe("StreamList — selection rendering & announcements", () => {
  it("renders the ', виділено' suffix for selected rows from $streamSelection", () => {
    replaceSelection(new Set(["b"]));
    const { container } = renderList();
    const li = container.querySelector<HTMLElement>('li[data-item-id="b"][data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toContain(m.selection_suffix());
    expect(li.getAttribute("data-selected")).toBe("true");
  });

  it("Ctrl+Space announces the single toggle with the stream name + state", () => {
    const { ref } = renderList();
    act(() => ref.current!.focus("forward")); // row a
    $announcer.set(null);
    fireEvent.keyDown(document.activeElement!, { key: " ", code: "Space", ctrlKey: true });
    expect($streamSelection.get().has("a")).toBe(true);
    expect($announcer.get()?.message).toBe(m.stream_selected({ name: "Alpha" }));
  });

  it("a group gesture announces one summary; a pointer single is NOT announced", () => {
    const { ref, container } = renderList();
    act(() => ref.current!.focus("forward"));
    // Group: Ctrl+A selects all visible → one summary announce.
    $announcer.set(null);
    fireEvent.keyDown(document.activeElement!, { key: "a", code: "KeyA", ctrlKey: true });
    expect($announcer.get()?.message).toBe(m.selection_count({ count: 3 }));
    // Pointer single (simple click) collapses selection but is NOT re-announced.
    $announcer.set(null);
    fireEvent.click(
      container.querySelector<HTMLElement>('li[data-item-id="b"][data-segment="summary"]')!,
      { bubbles: true },
    );
    expect($streamSelection.get().size).toBe(1);
    expect($announcer.get()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/StreamList.test.tsx -t "selection rendering"`
Expected: FAIL — no suffix; no announcements.

- [ ] **Step 3: Build the adapter + read selection + render + announce**

In `StreamList.tsx`:

1. Imports — add the store + types:

```ts
import { $streams, $statuses, $streamSelection, replaceSelection } from "../../stores/streams";
import type { ActionModifiers, CompositeSelection, SelectionChange } from "../../hooks/useCompositeList";
```

2. Read selection via `useStore`:

```ts
  const selectedSet = useStore($streamSelection);
```

3. Build the adapter (stable identity):

```ts
  const selectionAdapter = useMemo<CompositeSelection>(
    () => ({
      current: () => $streamSelection.get(),
      replace: (next) => replaceSelection(next),
    }),
    [],
  );
```

4. The localized announce on selection change (A6 — pointer singles skipped; group → one summary or "cleared"):

```ts
  const handleSelectionChange = useCallback(
    (c: SelectionChange) => {
      if (c.via === "pointer" && c.kind === "single") return; // row moved focus; NVDA read it
      if (c.kind === "single") {
        const name = streams.find((s) => s.id === c.lastId)?.name ?? "";
        announce(c.selected ? m.stream_selected({ name }) : m.stream_deselected({ name }), "polite");
      } else {
        announce(c.count === 0 ? m.selection_cleared() : m.selection_count({ count: c.count }), "polite");
      }
    },
    [streams, announce],
  );
```

5. Pass them to `CompositeList` and render `isSelected` per row. On the `<CompositeList>` element add `selection={selectionAdapter}` and `onSelectionChange={handleSelectionChange}`. In `renderRow`, pass `isSelected={selectedSet.has(id)}` to `<StreamItem>`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/streams/StreamList.test.tsx -t "selection rendering"`
Expected: PASS (3 tests). Rerun the whole file to confirm no regression.

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamList.tsx src/components/streams/StreamList.test.tsx
git commit -m "feat(streams): wire selection adapter, render selected rows, announce gestures"
```

---

## Task 14: `StreamList` — bulk delete (confirm + execute + announce) + Delete routing (A8)

**Files:**
- Modify: `src/components/streams/StreamList.tsx`
- Test: `src/components/streams/StreamList.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add `removeStreams` to the tauri mock at the top of `StreamList.test.tsx`:

```tsx
  removeStreams: vi.fn().mockResolvedValue(2),
```

Tests:

```tsx
describe("StreamList — bulk delete", () => {
  it("Delete with a non-empty selection opens one confirm with the exact count", async () => {
    replaceSelection(new Set(["a", "b"]));
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    expect(await screen.findByText(m.confirm_delete_selected({ count: 2 }))).toBeTruthy();
  });

  it("confirming calls removeStreams with the selected ids, updates $streams once, announces", async () => {
    replaceSelection(new Set(["a", "c"]));
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    fireEvent.click(await screen.findByRole("button", { name: m["delete"]() }));

    await waitFor(() => expect(tauri.removeStreams).toHaveBeenCalledTimes(1));
    expect(new Set(vi.mocked(tauri.removeStreams).mock.calls[0][0])).toEqual(new Set(["a", "c"]));
    await waitFor(() => expect($streams.get().map((s) => s.id)).toEqual(["b"]));
    expect($streamSelection.get().size).toBe(0);
    await waitFor(() => expect($announcer.get()?.message).toBe(m.streams_removed_bulk({ count: 2 })));
  });

  it("Delete with an empty selection still does single-row delete (unchanged)", async () => {
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    expect(await screen.findByText(m.confirm_delete_stream({ name: "Alpha" }))).toBeTruthy();
  });
});
```

(`ConfirmDialog`'s confirm button is `confirmLabel ?? m["delete"]()` — the dialog below passes **no** `confirmLabel`, so the button is the default "Видалити" (`m["delete"]()`), same as the single-delete dialog. `m.ok()` is the *ProfileNameDialog*'s button, not this one — do not use it here.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/StreamList.test.tsx -t "bulk delete"`
Expected: FAIL — Delete with selection still opens the single-delete dialog; `removeStreams` never called.

- [ ] **Step 3: Implement bulk-delete state, dialog, execution, routing**

In `StreamList.tsx`:

1. Imports — add `useLayoutEffect`, `useRef`, and `removeStreams`:

```ts
import { forwardRef, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
```

(`removeStreams` is reached via the existing `import * as tauri`.)

2. State + a ref to carry the post-delete focus target across the re-render:

```ts
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const pendingBulkFocusRef = useRef<string | null>(null);
```

3. The bulk confirm handler — reads live `$streamSelection` and the current `streams` prop (this closure is rendered fresh into the dialog, so it is never stale):

```ts
  const handleConfirmBulkDelete = async () => {
    const ids = [...$streamSelection.get()];
    if (ids.length === 0) {
      setBulkConfirmOpen(false);
      return;
    }
    const idSet = new Set(ids);
    // Focus target computed from the CURRENT visible order, BEFORE deletion (A8):
    // first survivor at/after the top removed index; tail → new last; none → onEmpty.
    const topRemovedIdx = Math.max(0, streams.findIndex((s) => idSet.has(s.id)));
    const survivors = streams.filter((s) => !idSet.has(s.id));
    try {
      const removed = await tauri.removeStreams(ids);
      $streams.set($streams.get().filter((s) => !idSet.has(s.id)));
      replaceSelection(new Set());
      announce(m.streams_removed_bulk({ count: removed }), "polite");
      pendingBulkFocusRef.current =
        survivors.length === 0 ? null : survivors[Math.min(topRemovedIdx, survivors.length - 1)].id;
      if (survivors.length === 0) onEmpty();
    } catch (err) {
      addToast(String(err), "error");
    }
    setBulkConfirmOpen(false);
  };
```

4. Delete routing in the `onAction` handler (the `delete` branch, line ~180-183) — bulk when selection non-empty, else single:

```ts
          if (type === "delete") {
            if ($streamSelection.get().size > 0) setBulkConfirmOpen(true);
            else setPendingDeleteId(itemId);
            return;
          }
```

5. Render the bulk `ConfirmDialog` (next to the existing single one, ~line 209):

```tsx
      {bulkConfirmOpen &&
        createPortal(
          <ConfirmDialog
            title={m.remove_stream()}
            message={m.confirm_delete_selected({ count: selectedSet.size })}
            onConfirm={handleConfirmBulkDelete}
            onCancel={() => setBulkConfirmOpen(false)}
          />,
          document.body,
        )}
```

**Do NOT pass `confirmLabel`.** If it were `m.delete_selected({ count })`, the confirm button would carry the *same* accessible name as the toolbar "Видалити виділені (N)" button (Task 19); in a `StreamsPanel` test both are mounted at once, so `findByRole("button", { name })` would match two elements and throw. The message (`confirm_delete_selected`) already states the exact count; the button reuses the default "Видалити", matching the single-delete dialog. `delete_selected` is still used for the toolbar button (Task 19) and the ⋯ menu item (Task 18).

The post-delete programmatic focus (`pendingBulkFocusRef`) is consumed in Task 15.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/streams/StreamList.test.tsx -t "bulk delete"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamList.tsx src/components/streams/StreamList.test.tsx
git commit -m "feat(streams): bulk-delete confirm + execution + Delete routing"
```

---

## Task 15: `StreamList` — programmatic focus after bulk delete (A8)

**Files:**
- Modify: `src/components/streams/StreamList.tsx`
- Test: `src/components/streams/StreamList.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
describe("StreamList — focus after bulk delete", () => {
  const idOf = () => document.activeElement?.getAttribute("data-item-id") ?? null;

  it("lands on the nearest survivor at/after the top removed index (never <body>)", async () => {
    replaceSelection(new Set(["a"])); // remove first; survivor at idx0 → b
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    fireEvent.click(await screen.findByRole("button", { name: m["delete"]() }));
    await waitFor(() => expect(idOf()).toBe("b"));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("deleting the tail focuses the new last row", async () => {
    replaceSelection(new Set(["c"]));
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    fireEvent.click(await screen.findByRole("button", { name: m["delete"]() }));
    await waitFor(() => expect(idOf()).toBe("b"));
  });

  it("computes the index over the FILTERED/SORTED visible order, not the full $streams", async () => {
    // Visible = only [b, c] (a hidden by the parent's filter); remove b → focus c.
    replaceSelection(new Set(["b"]));
    const ref = createRef<ZoneEntry>();
    render(
      <StreamList
        ref={ref}
        exitZone={vi.fn()}
        onEmpty={vi.fn()}
        streams={[mkStream("b", "Bravo"), mkStream("c", "Charlie")]}
      />,
    );
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    fireEvent.click(await screen.findByRole("button", { name: m["delete"]() }));
    await waitFor(() => expect(idOf()).toBe("c"));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/StreamList.test.tsx -t "focus after bulk delete"`
Expected: FAIL — focus falls to `<body>` (nothing consumes `pendingBulkFocusRef`).

- [ ] **Step 3: Capture `focusItem` via `imperativeExtra` + a layout effect**

In `StreamList.tsx`:

1. Add a ref for the hook's `focusItem`, and an `imperativeExtra` that stashes it and exposes `requestBulkDelete` (the handle method used by the toolbar in Task 16):

```ts
  const focusItemRef = useRef<((id: string, segment?: SegmentKind) => void) | null>(null);
  const imperativeExtra = useCallback(
    (api: { focusItem: (itemId: string, segment?: SegmentKind) => void }) => {
      // Stash the latest focusItem; the handle is rebuilt on items change, so this
      // ref always points at a focusItem that knows the post-delete item set.
      focusItemRef.current = api.focusItem;
      return { requestBulkDelete: () => setBulkConfirmOpen(true) };
    },
    [],
  );
```

Import `SegmentKind`:

```ts
import type { ActionModifiers, CompositeSelection, SelectionChange, SegmentKind } from "../../hooks/useCompositeList";
```

2. The layout effect that fires once the list has re-rendered without the deleted rows (keyed on `items`, which changes after `$streams.set`):

```ts
  // Programmatic focus after a bulk delete — bound to the post-deletion items
  // change so it is the LAST word after the ConfirmDialog (react-aria Modal)
  // restores focus to its now-removed trigger. Survivors > 0 only; the empty
  // case already called onEmpty() in the handler.
  useLayoutEffect(() => {
    const targetId = pendingBulkFocusRef.current;
    if (!targetId) return;
    pendingBulkFocusRef.current = null;
    focusItemRef.current?.(targetId, "summary");
  }, [items]);
```

3. Pass `imperativeExtra` to `CompositeList` (and keep `ref={ref}` — its handle type is widened in Task 16):

```tsx
      <CompositeList
        ref={ref}
        imperativeExtra={imperativeExtra}
        ...
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/streams/StreamList.test.tsx -t "focus after bulk delete"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamList.tsx src/components/streams/StreamList.test.tsx
git commit -m "feat(streams): programmatic focus to nearest survivor after bulk delete"
```

---

## Task 16: `StreamList` — `requestBulkDelete()` on the handle (A8)

**Files:**
- Modify: `src/components/streams/StreamList.tsx`
- Test: `src/components/streams/StreamList.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
describe("StreamList — imperative requestBulkDelete", () => {
  it("opens the bulk confirm from the handle (toolbar entry point)", async () => {
    replaceSelection(new Set(["a", "b"]));
    const ref = createRef<ZoneEntry & { requestBulkDelete(): void }>();
    render(<StreamList ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} />);
    act(() => ref.current!.requestBulkDelete());
    expect(await screen.findByText(m.confirm_delete_selected({ count: 2 }))).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/StreamList.test.tsx -t "imperative requestBulkDelete"`
Expected: FAIL — `requestBulkDelete` is not on the typed handle.

- [ ] **Step 3: Widen the handle type**

In `StreamList.tsx`, export a handle type and use it on the `forwardRef` and the generic `CompositeList`:

```ts
export type StreamListHandle = ZoneEntry & { requestBulkDelete(): void };

export const StreamList = forwardRef<StreamListHandle, Props>(
  ({ exitZone, onEmpty, streams: streamsProp }, ref) => {
    // ...
```

On the JSX, type the generic: `<CompositeList<StreamListHandle> ref={ref} imperativeExtra={imperativeExtra} ... >`.

(`requestBulkDelete` is already returned by `imperativeExtra` from Task 15.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/components/streams/StreamList.test.tsx -t "imperative requestBulkDelete"`
Expected: PASS. Rerun the full file — all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamList.tsx src/components/streams/StreamList.test.tsx
git commit -m "feat(streams): expose requestBulkDelete on the StreamList handle"
```

---

## Task 17: `StreamList` — `pruneSelection` on `$streams` change (A10)

**Files:**
- Modify: `src/components/streams/StreamList.tsx`
- Test: `src/components/streams/StreamList.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
describe("StreamList — prune vanished ids", () => {
  it("drops selected ids that no longer exist in $streams (keeps the counter honest)", async () => {
    replaceSelection(new Set(["a", "b"]));
    renderList(); // streams a,b,c exist → nothing pruned yet
    expect($streamSelection.get().size).toBe(2);
    act(() => $streams.set([mkStream("a", "Alpha")])); // b and c gone
    await waitFor(() => expect([...$streamSelection.get()]).toEqual(["a"]));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/StreamList.test.tsx -t "prune vanished"`
Expected: FAIL — selection still contains `b` after it left `$streams`.

- [ ] **Step 3: Add the prune effect**

In `StreamList.tsx`, import `pruneSelection` and add an effect keyed on the full (unfiltered) `$streams`. `allStreams` is already read via `useStore($streams)` at line ~28:

```ts
import { $streams, $statuses, $streamSelection, replaceSelection, pruneSelection } from "../../stores/streams";
```

```ts
  // Prune ids that vanished from $streams (after bulk ops, edits, sync). Uses the
  // FULL store, not the visible list — a row hidden by a status change under a
  // chip must NOT drop out of the selection (only an explicit filter change clears).
  useEffect(() => {
    pruneSelection(new Set(allStreams.map((s) => s.id)));
  }, [allStreams]);
```

Add `useEffect` to the React import.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/components/streams/StreamList.test.tsx -t "prune vanished"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamList.tsx src/components/streams/StreamList.test.tsx
git commit -m "feat(streams): prune vanished ids from selection on $streams change"
```

---

## Task 18: `StreamContextMenu` + ⋯ delete routing (A8/№15/№16)

**Files:**
- Modify: `src/components/streams/StreamContextMenu.tsx`
- Modify: `src/components/streams/StreamList.tsx` (onDelete routing)
- Test: `src/components/streams/StreamContextMenu.test.tsx`, `src/components/streams/StreamList.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `StreamContextMenu.test.tsx` (selection-aware label). **This file `vi.mock`s the whole paraglide module** with a hand-written object, so the menu only sees the keys listed there. The new menu code calls `m.delete_selected(...)` when the row is selected, so you MUST add that key to the mock or the menu renders `undefined()` and throws. Add to the existing `vi.mock("../../i18n/paraglide/messages", () => ({ ... }))` object (next to `remove_stream`):

```ts
  delete_selected: ({ count }: { count: number }) => `Видалити виділені (${count})`,
```

The file has no `beforeEach` today (only an `afterEach` resetting `$playerStatus`), and `$streamSelection` is the *real* store (not mocked) — so add a reset to keep the new test isolated:

```ts
import { replaceSelection } from "../../stores/streams";
// at top level, next to the existing afterEach:
beforeEach(() => replaceSelection(new Set()));
```

Then the test (uses the file's existing `renderMenu` + `open` helpers; `import * as m` resolves to the mock above):

```tsx
it("delete item shows the bulk count when the row is selected", async () => {
  replaceSelection(new Set(["s1", "s2"])); // stream under test is s1
  const { container } = renderMenu(mkStatus("idle"));
  fireEvent.click(container.querySelector('button[data-segment="action-menu"]')!);
  expect(await screen.findByRole("menuitem", { name: m.delete_selected({ count: 2 }) })).toBeTruthy();
});
```

(Don't forget `beforeEach` in the vitest import list if it isn't already there.)

In `StreamList.test.tsx` (routing):

```tsx
describe("StreamList — ⋯ delete routing by selection (Explorer model)", () => {
  const openMenu = (container: HTMLElement, id: string) =>
    fireEvent.click(container.querySelector<HTMLElement>(`li[data-item-id="${id}"] button[data-segment="action-menu"]`)!);

  it("⋯ delete on a selected row opens the bulk confirm", async () => {
    replaceSelection(new Set(["a", "b"]));
    const { container } = renderList();
    openMenu(container, "a");
    fireEvent.click(await screen.findByRole("menuitem", { name: m.delete_selected({ count: 2 }) }));
    expect(await screen.findByText(m.confirm_delete_selected({ count: 2 }))).toBeTruthy();
  });

  it("⋯ delete on a NON-selected row collapses to it, then does single delete", async () => {
    replaceSelection(new Set(["a", "b"]));
    const { container } = renderList();
    openMenu(container, "c"); // c not selected
    fireEvent.click(await screen.findByRole("menuitem", { name: m.remove_stream() }));
    expect(await screen.findByText(m.confirm_delete_stream({ name: "Charlie" }))).toBeTruthy();
    expect([...$streamSelection.get()]).toEqual(["c"]); // collapsed
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/StreamContextMenu.test.tsx src/components/streams/StreamList.test.tsx -t "delete"`
Expected: FAIL — menu label is always "Видалити потік"; ⋯ on a selected row opens single delete.

- [ ] **Step 3: Selection-aware delete label**

In `StreamContextMenu.tsx`, read the selection and switch the delete label:

```ts
import { $editStream, $streamSelection } from "../../stores/streams";
```

```ts
  const selection = useStore($streamSelection);
  const isSelected = selection.has(stream.id);
```

Replace the delete `MenuItem` text (line ~161):

```tsx
            <span aria-hidden="true">✕ </span>
            {isSelected ? m.delete_selected({ count: selection.size }) : m.remove_stream()}
```

- [ ] **Step 4: Route ⋯ delete in `StreamList`**

In `StreamList.tsx`, change the per-row `onDelete` passed to `StreamItem` (line ~200) to route by selection (bulk when the row is selected; otherwise collapse to it, then single):

```tsx
              onDelete={() => {
                if ($streamSelection.get().has(id)) {
                  setBulkConfirmOpen(true);
                } else {
                  replaceSelection(new Set([id]));
                  setPendingDeleteId(id);
                }
              }}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/streams/StreamContextMenu.test.tsx src/components/streams/StreamList.test.tsx -t "delete"`
Expected: PASS. (The `delete_selected` mock key and the `replaceSelection(new Set())` reset from Step 1 are what make the `StreamContextMenu` test green.)

- [ ] **Step 6: Commit**

```bash
git add src/components/streams/StreamContextMenu.tsx src/components/streams/StreamList.tsx src/components/streams/StreamContextMenu.test.tsx src/components/streams/StreamList.test.tsx
git commit -m "feat(streams): ⋯ menu delete carries count + Explorer-model routing"
```

---

## Task 19: `StreamsPanel` — toolbar buttons + `[N вибрано]` + roving 12 (A7)

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx`
- Test: `src/components/streams/StreamsPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add `$streamSelection`, `replaceSelection` imports to `StreamsPanel.test.tsx` and reset in `beforeEach` (`replaceSelection(new Set())`). Also add `removeStreams: vi.fn().mockResolvedValue(0)` to the tauri mock. Tests:

```tsx
describe("StreamsPanel — selection toolbar cluster", () => {
  beforeEach(() => {
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo"), mkStream("c", "Charlie")]);
    $statuses.set({});
  });

  it("shows 'Виділити все' and a disabled 'Видалити виділені (0)' with no selection", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: m.select_all() })).toBeTruthy();
    const del = screen.getByRole("button", { name: m.delete_selected({ count: 0 }) });
    expect(del.getAttribute("aria-disabled")).toBe("true");
  });

  it("flips to 'Зняти виділення' when all visible are selected", () => {
    replaceSelection(new Set(["a", "b", "c"]));
    renderPanel();
    expect(screen.getByRole("button", { name: m.clear_selection() })).toBeTruthy();
  });

  it("shows the [N вибрано] label and an enabled delete button when something is selected", () => {
    replaceSelection(new Set(["a", "b"]));
    renderPanel();
    expect(screen.getByText(m.selected_count_label({ count: 2 }))).toBeTruthy();
    const del = screen.getByRole("button", { name: m.delete_selected({ count: 2 }) });
    expect(del.getAttribute("aria-disabled")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx -t "selection toolbar cluster"`
Expected: FAIL — the buttons/label don't exist.

- [ ] **Step 3: Add selection state, refs, and the two buttons + label**

In `StreamsPanel.tsx`:

1. Imports:

```ts
import { $streams, $statuses, $showAddStreamDialog, $streamFilter, $importCandidates, $showExportStreamsDialog, $streamSelection, replaceSelection, type StreamFilter, type StreamSort } from "../../stores/streams";
```

2. Read selection + derive visible predicate:

```ts
  const selection = useStore($streamSelection);
  const selCount = selection.size;
```

(Place after `sortedStreams` is defined so it can reference it:)

```ts
  const visibleIds = useMemo(() => sortedStreams.map((s) => s.id), [sortedStreams]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));

  const handleSelectAll = () => {
    if (visibleIds.length === 0) return;
    const next = new Set(selection);
    if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    replaceSelection(next);
    // Toolbar acts beside the hook, so it announces itself on the same central
    // channel (A7) — otherwise Ctrl+A would announce but its mirror button wouldn't.
    announce(next.size === 0 ? m.selection_cleared() : m.selection_count({ count: next.size }), "polite");
  };
```

3. New refs + reindexed roving array. Add the two button refs and rebuild `toolbarRefs` to 12 entries, in DOM order — Add 0, Import 1, Export 2, **SelectAll 3, DeleteSelected 4**, RecordAll 5, StopAll 6, chips 7–9, sorts 10–11:

```ts
  const selectAllBtn      = useRef<HTMLButtonElement | null>(null);
  const deleteSelectedBtn = useRef<HTMLButtonElement | null>(null);
  // ...existing addBtn/importBtn/exportBtn/recordAllBtn/stopAllBtn/chip*/sort* refs...
  const toolbarRefs = useMemo(
    () => [addBtn, importBtn, exportBtn, selectAllBtn, deleteSelectedBtn, recordAllBtn, stopAllBtn, chip0Ref, chip1Ref, chip2Ref, sort0Ref, sort1Ref],
    [],
  );
```

4. Bump the existing `tabIndex` indices on the moved buttons: RecordAll `toolbarTabIndex(3)`→`(5)`, StopAll `(4)`→`(6)`, chips `5 + i`→`7 + i`, sorts `8 + i`→`10 + i`. Update the colocated comments (`Index 3` "Записати все", `Index 4` "Зупинити запис", `Indices 5–7` chips, `Indices 8–9` sort) to the new indices (`Index 5`, `Index 6`, `Indices 7–9`, `Indices 10–11`), the refs header `── Toolbar zone refs (10 items) ──` → `(12 items)`, and the `ScreenZone` header comment "all 8 interactive items (indices 0–7)" → "all 12 interactive items (indices 0–11)".

5. Render the cluster at the start of Row 2 (before "Записати все"), with `[N вибрано]` as a plain (non-live) span visible only when `selCount > 0`:

```tsx
          {/* Index 3: Виділити все / Зняти */}
          <button
            ref={selectAllBtn}
            tabIndex={toolbarTabIndex(3)}
            aria-disabled={visibleIds.length === 0 || undefined}
            onClick={handleSelectAll}
            className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
          >
            {allVisibleSelected ? m.clear_selection() : m.select_all()}
          </button>

          {/* Index 4: Видалити виділені (N) — count in visible text == accessible name */}
          <button
            ref={deleteSelectedBtn}
            tabIndex={toolbarTabIndex(4)}
            aria-disabled={selCount === 0 || undefined}
            onClick={() => { if (selCount > 0) streamListRef.current?.requestBulkDelete(); }}
            className={`rounded px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
              selCount === 0 ? "cursor-not-allowed text-slate-600" : "text-red-400 hover:bg-slate-800"
            }`}
          >
            {m.delete_selected({ count: selCount })}
          </button>

          {/* Plain (NOT live) count — read by NVDA on focus, but never double-announced */}
          {selCount > 0 && (
            <span className="text-xs text-slate-400">{m.selected_count_label({ count: selCount })}</span>
          )}

          <div className="mx-1 h-4 w-px bg-slate-700 forced-colors:bg-[ButtonText]" aria-hidden="true" />
```

`streamListRef`'s type is widened in Task 20 (it currently holds `ZoneEntry | null`; calling `requestBulkDelete()` typechecks after that change — implement Task 20 next before running the build gate).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx -t "selection toolbar cluster"`
Expected: PASS (3 tests). The roving-12 test lands in Task 20; existing toolbar tests must stay green.

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamsPanel.tsx src/components/streams/StreamsPanel.test.tsx
git commit -m "feat(streams): toolbar selection cluster (Select all / Delete selected / count) + roving 12"
```

---

## Task 20: `StreamsPanel` — wire `requestBulkDelete` + roving-12 assertion (A7)

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx`
- Test: `src/components/streams/StreamsPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it("the toolbar delete button triggers the list's bulk confirm", async () => {
  replaceSelection(new Set(["a", "b"]));
  renderPanel();
  fireEvent.click(screen.getByRole("button", { name: m.delete_selected({ count: 2 }) }));
  expect(await screen.findByText(m.confirm_delete_selected({ count: 2 }))).toBeTruthy();
});

it("keeps a 12-stop roving toolbar in DOM order", () => {
  const { container } = renderPanel();
  const zone = container.querySelector('[data-zone-id="streams-toolbar"]')!;
  const stops = zone.querySelectorAll("button");
  // Exactly one button is tabbable (roving); the rest are -1.
  const tabbable = Array.from(stops).filter((b) => b.getAttribute("tabindex") === "0");
  expect(tabbable).toHaveLength(1);
  expect(stops.length).toBeGreaterThanOrEqual(12);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx -t "bulk confirm"`
Expected: FAIL — `streamListRef.current.requestBulkDelete` is untyped / unavailable.

- [ ] **Step 3: Widen `streamListRef` to the StreamList handle**

In `StreamsPanel.tsx`, import the handle type and update the ref + callback ref types:

```ts
import { StreamList, type StreamListHandle } from "./StreamList";
```

```ts
  const streamListRef = useRef<StreamListHandle | null>(null);
  const streamListCallbackRef = useCallback((zone: StreamListHandle | null) => {
    streamListRef.current = zone;
  }, []);
```

(`StreamListHandle extends ZoneEntry`, so pushing it into `onZonesChange` still typechecks.)

- [ ] **Step 4: Run the tests + full build**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx`
Expected: PASS (incl. the two new tests and all existing toolbar tests).
Run: `pnpm vite:build`
Expected: builds clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamsPanel.tsx src/components/streams/StreamsPanel.test.tsx
git commit -m "feat(streams): toolbar delete triggers list bulk confirm; roving-12 verified"
```

---

## Task 21: Lifecycle clearing — filter / profile / section exit + deferred `onEmpty` focus (A8/A10)

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx`
- Modify: `src/hooks/useProfileSync.ts`
- Test: `src/components/streams/StreamsPanel.test.tsx`, `src/hooks/useProfileSync.test.tsx` (if present; else cover the clear in StreamsPanel)

- [ ] **Step 1: Write the failing tests**

```tsx
describe("StreamsPanel — selection lifecycle", () => {
  beforeEach(() => {
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo")]);
    $statuses.set({});
  });

  it("changing the filter clears the selection", () => {
    replaceSelection(new Set(["a"]));
    const { container } = renderPanel();
    const { chips } = chipButtons(container);
    fireEvent.click(chips[1]); // "recording" chip
    expect($streamSelection.get().size).toBe(0);
  });

  it("resetting the filter clears the selection", () => {
    $statuses.set({}); // no recording rows → filter "recording" hides all
    $streamFilter.set("recording");
    replaceSelection(new Set(["a"]));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: m.streams_filter_reset() }));
    expect($streamSelection.get().size).toBe(0);
  });

  it("clears the selection when the panel unmounts (leaving the section)", () => {
    replaceSelection(new Set(["a"]));
    const { unmount } = renderPanel();
    unmount();
    expect($streamSelection.get().size).toBe(0);
  });

  it("deletes all visible under a filter → onEmpty focuses reset-filter (never <body>)", async () => {
    // a recording, b idle; filter=recording → visible=[a]; select+delete a → filter-empty.
    $statuses.set({ a: mkStatus("a", "recording") });
    $streamFilter.set("recording");
    replaceSelection(new Set(["a"]));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: m.delete_selected({ count: 1 }) }));
    fireEvent.click(await screen.findByRole("button", { name: m["delete"]() }));
    // tauri.removeStreams is mocked → simulate the store update it represents:
    act(() => $streams.set([mkStream("b", "Bravo")]));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: m.streams_filter_reset() })),
    );
  });
});
```

(Adjust the last test to your `removeStreams` mock: if it resolves and the handler calls `$streams.set` itself, you don't need the manual `$streams.set` — keep whichever reflects the real path. The assertion that matters: focus lands on the reset-filter button, not `<body>`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx -t "selection lifecycle"`
Expected: FAIL — selection survives filter/reset/unmount; `onEmpty` is a no-op so focus is lost.

- [ ] **Step 3: Clear on filter change, reset, and unmount**

In `StreamsPanel.tsx`:

1. `handleChipClick` — after `$streamFilter.set(chipId)`:

```ts
    replaceSelection(new Set());
```

2. `handleResetFilter` — after `$streamFilter.set("all")`:

```ts
    replaceSelection(new Set());
```

3. Unmount cleanup (leaving the streams section unmounts the panel — App.tsx:359):

```ts
  // Selection is section-scoped: clear it when the streams screen unmounts.
  useEffect(() => () => { replaceSelection(new Set()); }, []);
```

- [ ] **Step 4: Deferred `onEmpty` focus**

Replace the no-op `onEmpty` passed to `<StreamList>` (line ~574) with a deferred-focus flag (mirrors the existing `pendingFocusFirstRow` pattern, because the empty zone isn't mounted yet at `onEmpty` time):

```ts
  const pendingFocusEmptyZone = useRef(false);
```

```tsx
              onEmpty={() => { pendingFocusEmptyZone.current = true; }}
```

Add an effect that fires once the empty/filter-empty zone mounts:

```ts
  // After a bulk delete empties the visible list, onEmpty set a flag; the target
  // button isn't mounted until isEmpty/filterHidesAll flips true, so focus it here.
  useEffect(() => {
    if (!pendingFocusEmptyZone.current) return;
    if (isEmpty) {
      pendingFocusEmptyZone.current = false;
      addExamplesBtnRef.current?.focus();
    } else if (filterHidesAll) {
      pendingFocusEmptyZone.current = false;
      resetFilterBtnRef.current?.focus();
    }
  }, [isEmpty, filterHidesAll]);
```

- [ ] **Step 5: Clear on profile change**

In `src/hooks/useProfileSync.ts`, add `replaceSelection` to the existing streams import (line 6) and clear right after `$streams.set(profile.streams)` (line ~32):

```ts
import { $streams, $statuses, replaceSelection } from "../stores/streams";
```

```ts
        $streams.set(profile.streams);
        // Selection is profile-scoped — clear immediately (explicit, so the toolbar
        // counter drops at once rather than waiting on the prune effect).
        replaceSelection(new Set());
```

(Only `replaceSelection` is needed here — don't import `$streamSelection`, it would be unused.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx -t "selection lifecycle"`
Expected: PASS. Rerun the whole `StreamsPanel.test.tsx` and `useProfileSync.test.tsx` (if present) — all green.

- [ ] **Step 7: Commit**

```bash
git add src/components/streams/StreamsPanel.tsx src/hooks/useProfileSync.ts src/components/streams/StreamsPanel.test.tsx
git commit -m "feat(streams): section-scoped selection lifecycle + deferred onEmpty focus"
```

---

## Task 22: Full gates + docs flip

**Files:**
- Modify: `docs/keyboard-shortcuts.md` (Tier 2′ ⬜→✅)
- Modify: `docs/backlog/p1-bulk-stream-operations.md` (tick milestone-A items)

- [ ] **Step 1: Run the full frontend test suite**

Run: `pnpm test`
Expected: PASS (all files, including the new selection/bulk-delete tests).

- [ ] **Step 2: Run the production build gate**

Run: `pnpm vite:build`
Expected: builds clean (paraglide regenerated, no type errors in the touched files).

- [ ] **Step 3: Run the Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (incl. `retain_streams_*`).

- [ ] **Step 4: Flip the documentation**

In `docs/keyboard-shortcuts.md` Tier 2′, switch the ⬜→✅ status for `Ctrl+Space`, `Ctrl+A`, `Shift+↑↓`, and the `Escape` clear branch (these are now implemented). In `docs/backlog/p1-bulk-stream-operations.md` "Критерії готовності", tick the items delivered by milestone A:
- selection layer in `useCompositeList`/`CompositeList` (streams);
- select/deselect multiple via keyboard (NVDA); "Виділити все" = visible;
- filter clears / sort keeps;
- bulk delete with one ConfirmDialog (exact count).

Leave move/copy, export, record/stop selected, other lists, and the live-counter umbrella item for B–D.

- [ ] **Step 5: Commit**

```bash
git add docs/keyboard-shortcuts.md docs/backlog/p1-bulk-stream-operations.md
git commit -m "docs(streams): mark bulk-stream-operations milestone A shortcuts + criteria done"
```

- [ ] **Step 6: Manual NVDA verification (acceptance criterion 8)**

With `just dev` running and NVDA on:
1. Focus the streams list; `Ctrl+Space` → hear "{name}, виділено".
2. `Shift+↓` twice → hear new rows + one summary "Виділено N" (no per-row flood).
3. `Ctrl+A` → "Виділено N"; `Ctrl+A` again → cleared.
4. Select 2–3, press `Delete` → one confirm with the exact count → confirm → focus lands on the nearest surviving row (never silence/`<body>`) → hear "Видалено N".
5. Toolbar "Видалити виділені (N)" and ⋯-menu on a selected row reach the same confirm.
6. Change a filter chip → selection clears; switch profile → clears.

Record the result in the PR description.

---

## Self-Review (spec coverage)

- **A1** store atom + replace/prune → Task 2. **A2** adapter + anchor/base + guard → Tasks 5,6,9,10. **A3** resolveKeyAction refactor → Task 4. **A4** keyboard model (Ctrl+Space/Shift-range/Ctrl+A/Escape/split Space) → Tasks 5–8. **A5** mouse model → Task 10. **A6** ARIA suffix + central announce + pointer-single suppression → Tasks 12,13. **A7** toolbar cluster + roving 12 + self-announce → Tasks 19,20. **A8** bulk delete + focus + requestBulkDelete + ⋯ routing + empty-zone focus → Tasks 14–18,21. **A9** backend remove_streams → Task 1. **A10** lifecycle (prune, filter/profile/section clear) → Tasks 17,21.
- **Acceptance criteria 1–8** are each exercised by a test task above; criterion 8's manual NVDA pass is Task 22 step 6.
- **Type consistency:** `CompositeSelection`/`SelectionChange` (Task 5) are the only public selection types, consumed unchanged in Tasks 11,13; `StreamListHandle` (Task 16) is reused in Task 20; `retain_streams`/`remove_streams`/`removeStreams` names are consistent across Tasks 1.
