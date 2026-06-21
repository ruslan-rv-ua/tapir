# Bulk Stream Operations — Milestone D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roll the keyboard/mouse/NVDA multi-select model proven on streams (milestones A–C) out to the five remaining composite lists — songs, profiles, schedule, patterns (wishlist/ignorelist), browser — and give each one relevant bulk action (delete for songs/profiles/schedule/patterns; add-selected for browser).

**Architecture:** The selection mechanics already live in `useCompositeList` (opt-in via a `selection` adapter) and `CompositeRow` (the `selected` prop). D reuses them. We extract the identical per-list glue (atom helpers, the consumer hook, the focus-index math, the toolbar cluster) into four shared modules (Approach B), then wire each list to them. Only what genuinely differs per list (backend call, store mutation, name getter, row render, Explorer routing) stays per-list. Backend gets one bulk command per list, each following the `remove_streams` pattern: one save, an honest count, a pure unit-tested helper.

**Tech Stack:** React 19 + TypeScript, nanostores, react-aria-components, Tauri v2 (Rust), Paraglide.js (compile-time i18n), Vitest + @testing-library/react, `cargo test`.

## Global Constraints

- **Gates are `pnpm test` + `pnpm vite:build` + `cargo test` — NOT `tsc`.** `tsc` has ~51 pre-existing errors (untyped paraglide) and is not a gate. Never claim done without running all three.
- **i18n source** lives in `src/i18n/messages/uk.json` (source, Ukrainian-first) and `src/i18n/messages/en.json`. The typed `m.*` functions in `src/i18n/paraglide/messages/` are GENERATED — after editing the JSON you MUST run `pnpm vite:build` once to regenerate them (the Paraglide Vite plugin compiles on build), or Vitest imports of `m.<new_key>` are `undefined`. Add every new key to BOTH `uk.json` and `en.json`.
- **The developer is blind and uses NVDA.** Consistency across screens is the highest-value property (umbrella decision #1). Do not "approximate" one list differently from another.
- **Active profile is selectable-but-skipped at delete time** (mirror of skip-semantics). Do NOT add a per-row "selectable" predicate to `useCompositeList`; the hook is not modified by D.
- **Streams toolbar is untouched** — it uses `SelectionActionsMenu` (3 actions). New lists have 1 action and use the new `SelectionToolbar`. No A–C regression.
- **Bulk has no Undo** (consistent with single deletes).
- **Selection store helper signature is 2-arg:** `replaceSelection($atom, next)` / `pruneSelection($atom, existingIds)`. Each list owns its own `atom<Set<string>>`.
- **`removedIds` for focus = actually-removed ids** (from the backend result where skip is possible), never the raw selection. **Full skip (`removedIds.size === 0`) is a focus no-op:** announce only, do not move focus, do not mutate the store, leave the skipped rows selected.

---

## File Structure

**New shared modules (Phase 0):**
- `src/stores/selection.ts` — generic `replaceSelection`/`pruneSelection` (atom passed in).
- `src/lib/bulkFocus.ts` — `computeBulkFocusTarget(visibleItems, removedIds)`.
- `src/hooks/useListSelection.ts` — selection adapter + `onSelectionChange`→announce + prune effect.
- `src/components/common/SelectionToolbar.tsx` — select-all toggle + one action button + count span.

**Per-list (Phases 1–5):** one new `atom<Set<string>>` in each store, the row's `isSelected` suffix, the list's selection wiring + bulk orchestration + imperative handle, the panel's toolbar cluster + lifecycle clearing, and one Rust bulk command + `lib/tauri.ts` wrapper each.

**Phase ordering:** Phase 0 is the foundation for everything. Phases 1–5 are mutually independent (different files) and may be executed/reviewed in any order or in parallel once Phase 0 lands. Phase 6 finishes docs and runs the full gate.

---

# Phase 0 — Shared infrastructure (D1)

### Task 1: Generic selection store helpers + migrate streams

**Files:**
- Create: `src/stores/selection.ts`
- Modify: `src/stores/streams.ts:16-34` (replace the two streams-specific functions with thin wrappers)
- Test: `src/stores/selection.test.ts`

**Interfaces:**
- Produces: `replaceSelection($sel: WritableAtom<Set<string>>, next: ReadonlySet<string>): void`, `pruneSelection($sel: WritableAtom<Set<string>>, existingIds: ReadonlySet<string>): void`
- Consumed by: every list store/hook from Task 4 onward; `stores/streams.ts` re-exports its old 1-arg wrappers so A-tests stay green.

- [ ] **Step 1: Write the failing test**

```ts
// src/stores/selection.test.ts
import { describe, it, expect } from "vitest";
import { atom } from "nanostores";
import { replaceSelection, pruneSelection } from "./selection";

describe("replaceSelection", () => {
  it("replaces with a fresh Set identity so useStore subscribers fire", () => {
    const $sel = atom<Set<string>>(new Set(["a"]));
    const before = $sel.get();
    replaceSelection($sel, new Set(["b", "c"]));
    expect($sel.get()).not.toBe(before);
    expect([...$sel.get()]).toEqual(["b", "c"]);
  });
});

describe("pruneSelection", () => {
  it("drops ids no longer present", () => {
    const $sel = atom<Set<string>>(new Set(["a", "b", "c"]));
    pruneSelection($sel, new Set(["a", "c"]));
    expect([...$sel.get()].sort()).toEqual(["a", "c"]);
  });

  it("is a no-op (keeps the same Set identity) when nothing changed", () => {
    const $sel = atom<Set<string>>(new Set(["a", "b"]));
    const before = $sel.get();
    pruneSelection($sel, new Set(["a", "b", "z"]));
    expect($sel.get()).toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/stores/selection.test.ts`
Expected: FAIL — cannot find module `./selection`.

- [ ] **Step 3: Create the generic helpers**

```ts
// src/stores/selection.ts
import type { WritableAtom } from "nanostores";

/**
 * Generic multi-select helpers shared by every composite list (milestone D).
 * The atom is passed in so each list owns its own `atom<Set<string>>`; the
 * semantics are identical to the original streams-only functions:
 *  - replace installs a fresh Set identity (so useStore subscribers re-render);
 *  - prune is a no-op when nothing changed (safe to run in an effect on every
 *    store change without spurious rerenders).
 */
export function replaceSelection(
  $sel: WritableAtom<Set<string>>,
  next: ReadonlySet<string>,
): void {
  $sel.set(new Set(next));
}

export function pruneSelection(
  $sel: WritableAtom<Set<string>>,
  existingIds: ReadonlySet<string>,
): void {
  const current = $sel.get();
  let changed = false;
  const next = new Set<string>();
  for (const id of current) {
    if (existingIds.has(id)) next.add(id);
    else changed = true;
  }
  if (changed) $sel.set(next);
}
```

- [ ] **Step 4: Migrate `stores/streams.ts` to delegate (behavior 1:1)**

Replace the bodies of the existing `replaceSelection`/`pruneSelection` in `src/stores/streams.ts:16-34` with thin wrappers over the generic — the public 1-arg signatures stay identical so `StreamList`/`StreamsPanel` and their A-tests are untouched:

```ts
// near the top of src/stores/streams.ts, after the $streamSelection declaration
import { replaceSelection as replaceSel, pruneSelection as pruneSel } from "./selection";

// ... keep `export const $streamSelection = atom<Set<string>>(new Set());`

/** Replace the whole streams selection. Thin wrapper over the generic helper. */
export function replaceSelection(next: ReadonlySet<string>): void {
  replaceSel($streamSelection, next);
}

/** Prune vanished ids from the streams selection. Thin wrapper. */
export function pruneSelection(existingIds: ReadonlySet<string>): void {
  pruneSel($streamSelection, existingIds);
}
```

- [ ] **Step 5: Run tests to verify they pass (incl. unchanged streams behavior)**

Run: `pnpm test src/stores/selection.test.ts src/components/streams/StreamList.test.tsx`
Expected: PASS — new selection tests green AND the existing StreamList suite still green (migration is behavior-preserving).

- [ ] **Step 6: Commit**

```bash
git add src/stores/selection.ts src/stores/selection.test.ts src/stores/streams.ts
git commit -m "feat(selection): generic replace/prune helpers; migrate streams to delegate"
```

---

### Task 2: `computeBulkFocusTarget` focus-index helper

**Files:**
- Create: `src/lib/bulkFocus.ts`
- Test: `src/lib/bulkFocus.test.ts`

**Interfaces:**
- Produces: `computeBulkFocusTarget(visibleItems: { id: string }[], removedIds: ReadonlySet<string>): string | null`
- Consumed by: every list's bulk handler (Tasks 10, 16, 22, 27). Returns the id of the first survivor at/after the top removed index; `null` when every visible row was removed (caller then calls `onEmpty()`). **Caller guarantees `removedIds` is non-empty** — full skip is handled before calling.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/bulkFocus.test.ts
import { describe, it, expect } from "vitest";
import { computeBulkFocusTarget } from "./bulkFocus";

const items = (...ids: string[]) => ids.map((id) => ({ id }));

describe("computeBulkFocusTarget", () => {
  it("lands on the first survivor at/after the top removed index", () => {
    // remove b,c from [a,b,c,d] → top removed idx 1 → survivor at that idx is d
    expect(computeBulkFocusTarget(items("a", "b", "c", "d"), new Set(["b", "c"]))).toBe("d");
  });

  it("falls back to the new last row when the tail was removed", () => {
    expect(computeBulkFocusTarget(items("a", "b", "c"), new Set(["b", "c"]))).toBe("a");
  });

  it("returns null when every visible row was removed", () => {
    expect(computeBulkFocusTarget(items("a", "b"), new Set(["a", "b"]))).toBeNull();
  });

  it("falls back to the first row when no removed id is visible (findIndex === -1)", () => {
    // e.g. selection removed under a filter — land on the first row, never <body>
    expect(computeBulkFocusTarget(items("a", "b"), new Set(["zzz"]))).toBe("a");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/bulkFocus.test.ts`
Expected: FAIL — cannot find module `./bulkFocus`.

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/bulkFocus.ts
/**
 * Compute where to move focus after a bulk removal (rule A8). Pure index math
 * over the CURRENT visible order, taken BEFORE the store mutation.
 *
 * Returns the id of the first survivor at/after the top removed index; when the
 * tail was removed it returns the new last survivor; when every visible row was
 * removed it returns null (caller switches to the empty-state zone).
 *
 * `removedIds` MUST be the actually-removed ids and MUST be non-empty — a full
 * skip (nothing removed) is a focus no-op the CALLER handles before calling this
 * (otherwise findIndex === -1 here would wrongly jump focus to the first row).
 * When removedIds is non-empty but none are visible (e.g. removed under a
 * filter), Math.max(0, -1) deliberately lands on the first row, never <body>.
 */
export function computeBulkFocusTarget(
  visibleItems: { id: string }[],
  removedIds: ReadonlySet<string>,
): string | null {
  const topRemovedIdx = Math.max(0, visibleItems.findIndex((it) => removedIds.has(it.id)));
  const survivors = visibleItems.filter((it) => !removedIds.has(it.id));
  if (survivors.length === 0) return null;
  return survivors[Math.min(topRemovedIdx, survivors.length - 1)].id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/bulkFocus.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bulkFocus.ts src/lib/bulkFocus.test.ts
git commit -m "feat(selection): computeBulkFocusTarget post-delete focus helper"
```

---

### Task 3: i18n — shared selection renames + generic keys

**Files:**
- Modify: `src/i18n/messages/uk.json:166-176`, `src/i18n/messages/en.json:166-176`
- Modify: `src/components/streams/StreamList.tsx:70`
- Modify: `src/components/streams/StreamList.test.tsx:375`

**Interfaces:**
- Produces (generated `m.*`): `m.item_selected({name})`, `m.item_deselected({name})`, `m.add_selected({count})`. Keeps existing `m.select_all`, `m.clear_selection`, `m.selected_count_label`, `m.selection_count`, `m.selection_cleared`, `m.selection_suffix`, `m.delete_selected` (all already generic, reused by every list).

- [ ] **Step 1: Rename the streams-specific selected/deselected keys to generic + add `add_selected`**

In `src/i18n/messages/uk.json`, rename `stream_selected`→`item_selected`, `stream_deselected`→`item_deselected` (values unchanged) and add `add_selected`:

```json
  "item_selected": "{name}, виділено",
  "item_deselected": "{name}, знято з виділення",
  "add_selected": "Додати виділені ({count})",
```

In `src/i18n/messages/en.json`, the mirror:

```json
  "item_selected": "{name}, selected",
  "item_deselected": "{name}, deselected",
  "add_selected": "Add selected ({count})",
```

(Leave `select_all`, `clear_selection`, `selected_count_label`, `selection_count`, `selection_cleared`, `selection_suffix`, `delete_selected` exactly as they are — they are already generic.)

- [ ] **Step 2: Update the two streams call sites**

`src/components/streams/StreamList.tsx:70` — change `m.stream_selected`/`m.stream_deselected` to the generic names:

```tsx
        announce(c.selected ? m.item_selected({ name }) : m.item_deselected({ name }), "polite");
```

`src/components/streams/StreamList.test.tsx:375`:

```tsx
    expect($announcer.get()?.message).toBe(m.item_selected({ name: "Alpha" }));
```

- [ ] **Step 3: Regenerate Paraglide and verify nothing references the old keys**

Run: `pnpm vite:build`
Then: `pnpm test src/components/streams/StreamList.test.tsx`
Expected: build succeeds (regenerates `src/i18n/paraglide/messages/item_selected.js` etc.); StreamList suite PASS. A grep for `stream_selected`/`stream_deselected` should return nothing under `src/`.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/uk.json src/i18n/messages/en.json src/i18n/paraglide src/components/streams/StreamList.tsx src/components/streams/StreamList.test.tsx
git commit -m "i18n(selection): rename stream_selected→item_selected; add add_selected"
```

---

### Task 4: `useListSelection` consumer hook

**Files:**
- Create: `src/hooks/useListSelection.ts`
- Test: `src/hooks/useListSelection.test.tsx`

**Interfaces:**
- Consumes: `replaceSelection`/`pruneSelection` (Task 1); `m.item_selected`/`m.item_deselected`/`m.selection_count`/`m.selection_cleared` (Task 3); `CompositeSelection`/`SelectionChange` from `useCompositeList`.
- Produces: `useListSelection<T>({ $selection, announce, resolveName, allItems, getId }) => { selectionAdapter: CompositeSelection; onSelectionChange: (c: SelectionChange) => void }`. The hook ALSO runs the prune effect on `allItems` identity change. `allItems` MUST be the stable store array (NOT a freshly-mapped array each render); `getId` derives the id inside the effect.

- [ ] **Step 1: Write the failing test**

```tsx
// src/hooks/useListSelection.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { atom } from "nanostores";
import * as m from "../i18n/paraglide/messages";
import { useListSelection } from "./useListSelection";
import type { SelectionChange } from "./useCompositeList";

type Row = { id: string; name: string };

function setup(allItems: Row[]) {
  const $sel = atom<Set<string>>(new Set());
  const announce = vi.fn();
  const resolveName = (id: string) => allItems.find((r) => r.id === id)?.name ?? "";
  const hook = renderHook(
    (props: { items: Row[] }) =>
      useListSelection({
        $selection: $sel,
        announce,
        resolveName,
        allItems: props.items,
        getId: (r: Row) => r.id,
      }),
    { initialProps: { items: allItems } },
  );
  return { $sel, announce, hook };
}

const rows: Row[] = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Bravo" },
];

describe("useListSelection — adapter", () => {
  it("current() reads the atom and replace() installs a fresh Set", () => {
    const { $sel, hook } = setup(rows);
    act(() => hook.result.current.selectionAdapter.replace(new Set(["a"])));
    expect([...$sel.get()]).toEqual(["a"]);
    expect(hook.result.current.selectionAdapter.current().has("a")).toBe(true);
  });
});

describe("useListSelection — onSelectionChange announces", () => {
  const fire = (h: ReturnType<typeof setup>["hook"], c: SelectionChange) =>
    act(() => h.result.current.onSelectionChange(c));

  it("key single-select announces the localized name", () => {
    const s = setup(rows);
    fire(s.hook, { kind: "single", via: "key", count: 1, lastId: "a", selected: true });
    expect(s.announce).toHaveBeenCalledWith(m.item_selected({ name: "Alpha" }), "polite");
  });

  it("skips a pointer single (DOM focus already moved → NVDA reads the row)", () => {
    const s = setup(rows);
    fire(s.hook, { kind: "single", via: "pointer", count: 1, lastId: "a", selected: true });
    expect(s.announce).not.toHaveBeenCalled();
  });

  it("group announces a count, and the cleared message at zero", () => {
    const s = setup(rows);
    fire(s.hook, { kind: "group", via: "key", count: 2 });
    expect(s.announce).toHaveBeenCalledWith(m.selection_count({ count: 2 }), "polite");
    fire(s.hook, { kind: "group", via: "key", count: 0 });
    expect(s.announce).toHaveBeenCalledWith(m.selection_cleared(), "polite");
  });
});

describe("useListSelection — prune effect", () => {
  it("drops selected ids that vanish from allItems", () => {
    const s = setup(rows);
    act(() => s.hook.result.current.selectionAdapter.replace(new Set(["a", "b"])));
    act(() => s.hook.rerender({ items: [{ id: "a", name: "Alpha" }] }));
    expect([...s.$sel.get()]).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/hooks/useListSelection.test.tsx`
Expected: FAIL — cannot find module `./useListSelection`.

- [ ] **Step 3: Implement the hook**

```ts
// src/hooks/useListSelection.ts
import { useCallback, useEffect, useMemo } from "react";
import type { WritableAtom } from "nanostores";
import type { CompositeSelection, SelectionChange } from "./useCompositeList";
import { replaceSelection, pruneSelection } from "../stores/selection";
import * as m from "../i18n/paraglide/messages";

interface Options<T> {
  /** The list's own selection atom. */
  $selection: WritableAtom<Set<string>>;
  /** Central announce channel (useAnnounce()). */
  announce: (message: string, priority?: "polite" | "assertive") => void;
  /** Resolve a row id to its display name — over the VISIBLE list (single-select
   *  focus always stays on a rendered row, so a visible-list getter is correct). */
  resolveName: (id: string) => string;
  /** The FULL store array (stable identity between updates). Drives auto-prune. */
  allItems: T[];
  /** Derive an id from a store item (kept out of effect deps; assumed stable). */
  getId: (item: T) => string;
}

/**
 * Consumer-side selection glue shared by every composite list (D1, parts ②③④).
 * Byte-for-byte the logic StreamList hand-rolled: the atom adapter, the
 * announce-payload routing (pointer-single skipped; key-single name;
 * group count/cleared), and the auto-prune effect on store change.
 */
export function useListSelection<T>({
  $selection,
  announce,
  resolveName,
  allItems,
  getId,
}: Options<T>) {
  const selectionAdapter = useMemo<CompositeSelection>(
    () => ({
      current: () => $selection.get(),
      replace: (next) => replaceSelection($selection, next),
    }),
    [$selection],
  );

  const onSelectionChange = useCallback(
    (c: SelectionChange) => {
      // A pointer single already moved DOM focus → NVDA reads the row (with its
      // ", виділено" suffix) natively; re-announcing would double-speak.
      if (c.via === "pointer" && c.kind === "single") return;
      if (c.kind === "single") {
        const name = resolveName(c.lastId ?? "");
        announce(c.selected ? m.item_selected({ name }) : m.item_deselected({ name }), "polite");
      } else {
        announce(c.count === 0 ? m.selection_cleared() : m.selection_count({ count: c.count }), "polite");
      }
    },
    [resolveName, announce],
  );

  // Auto-prune ids that vanished from the FULL store (bulk ops, edits, sync).
  // Keyed on the store array IDENTITY (stable between updates); ids derived
  // inside so we never build a fresh Set just to compare on every render.
  useEffect(() => {
    pruneSelection($selection, new Set(allItems.map(getId)));
    // getId is assumed stable; intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [$selection, allItems]);

  return { selectionAdapter, onSelectionChange };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/hooks/useListSelection.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useListSelection.ts src/hooks/useListSelection.test.tsx
git commit -m "feat(selection): useListSelection adapter + announce + prune hook"
```

---

### Task 5: `SelectionToolbar` cluster component

**Files:**
- Create: `src/components/common/SelectionToolbar.tsx`
- Test: `src/components/common/SelectionToolbar.test.tsx`

**Interfaces:**
- Consumes: `m.select_all`, `m.clear_selection`, `m.selected_count_label` (existing).
- Produces: `SelectionToolbar` with props below. Two roving stops (select-all button, action button) exposed via the two refs; `tabIndex` is OPTIONAL per button (roving panels pass a controlled `0|-1`; a focus-boundary zone omits it → the button stays in the natural tab order). The action button's visible text === its accessible name (WCAG 2.5.3).

```ts
interface SelectionToolbarProps {
  selCount: number;
  visibleCount: number;
  allVisibleSelected: boolean;
  selectAllRef: React.RefObject<HTMLButtonElement | null>;
  actionRef: React.RefObject<HTMLButtonElement | null>;
  selectAllTabIndex?: 0 | -1;
  actionTabIndex?: 0 | -1;
  /** Full action label incl. count, e.g. m.delete_selected({count}) / m.add_selected({count}). */
  actionLabel: string;
  onSelectAll: () => void;
  onAction: () => void;
}
```

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/common/SelectionToolbar.test.tsx
import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render, fireEvent } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { SelectionToolbar } from "./SelectionToolbar";

function renderToolbar(over: Partial<Parameters<typeof SelectionToolbar>[0]> = {}) {
  const props = {
    selCount: 2,
    visibleCount: 5,
    allVisibleSelected: false,
    selectAllRef: createRef<HTMLButtonElement>(),
    actionRef: createRef<HTMLButtonElement>(),
    actionLabel: m.delete_selected({ count: 2 }),
    onSelectAll: vi.fn(),
    onAction: vi.fn(),
    ...over,
  };
  return { props, ...render(<SelectionToolbar {...props} />) };
}

describe("SelectionToolbar", () => {
  it("toggles the select-all label between select_all and clear_selection", () => {
    const { getByText, rerender, props } = renderToolbar();
    expect(getByText(m.select_all())).toBeTruthy();
    rerender(<SelectionToolbar {...props} allVisibleSelected={true} />);
    expect(getByText(m.clear_selection())).toBeTruthy();
  });

  it("disables select-all when there are no visible rows", () => {
    const { props } = renderToolbar({ visibleCount: 0 });
    expect(props.selectAllRef.current!.getAttribute("aria-disabled")).toBe("true");
  });

  it("disables the action and does not fire it when selection is empty", () => {
    const { props } = renderToolbar({ selCount: 0, actionLabel: m.delete_selected({ count: 0 }) });
    expect(props.actionRef.current!.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(props.actionRef.current!);
    expect(props.onAction).not.toHaveBeenCalled();
  });

  it("the action button's visible text equals its accessible name", () => {
    const { props } = renderToolbar();
    expect(props.actionRef.current!.textContent).toBe(m.delete_selected({ count: 2 }));
    expect(props.actionRef.current!.getAttribute("aria-label")).toBe(m.delete_selected({ count: 2 }));
  });

  it("fires onAction when selection is non-empty", () => {
    const { props } = renderToolbar();
    fireEvent.click(props.actionRef.current!);
    expect(props.onAction).toHaveBeenCalled();
  });

  it("shows a non-live count and renders it only when selCount > 0", () => {
    const { queryByText, rerender, props } = renderToolbar();
    expect(queryByText(m.selected_count_label({ count: 2 }))).toBeTruthy();
    rerender(<SelectionToolbar {...props} selCount={0} actionLabel={m.delete_selected({ count: 0 })} />);
    expect(queryByText(m.selected_count_label({ count: 0 }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/common/SelectionToolbar.test.tsx`
Expected: FAIL — cannot find module `./SelectionToolbar`.

- [ ] **Step 3: Implement the component**

```tsx
// src/components/common/SelectionToolbar.tsx
import type React from "react";
import * as m from "../../i18n/paraglide/messages";

interface SelectionToolbarProps {
  selCount: number;
  visibleCount: number;
  allVisibleSelected: boolean;
  selectAllRef: React.RefObject<HTMLButtonElement | null>;
  actionRef: React.RefObject<HTMLButtonElement | null>;
  /** Controlled roving tabIndex; omit for a focus-boundary zone (natural tab order). */
  selectAllTabIndex?: 0 | -1;
  actionTabIndex?: 0 | -1;
  /** Full action label incl. count (visible text === accessible name, WCAG 2.5.3). */
  actionLabel: string;
  onSelectAll: () => void;
  onAction: () => void;
}

/**
 * Selection cluster for lists with exactly ONE bulk action: a select-all toggle
 * (mirror of Ctrl+A), one action button, and a non-live count span. Two roving
 * stops (select-all, action). aria-disabled (NOT native disabled) keeps both
 * buttons focusable/discoverable; activation is gated so a disabled action
 * no-ops. Streams keeps its 3-action SelectionActionsMenu — not this.
 */
export function SelectionToolbar({
  selCount,
  visibleCount,
  allVisibleSelected,
  selectAllRef,
  actionRef,
  selectAllTabIndex,
  actionTabIndex,
  actionLabel,
  onSelectAll,
  onAction,
}: SelectionToolbarProps) {
  const selectAllDisabled = visibleCount === 0;
  const actionDisabled = selCount === 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        ref={selectAllRef}
        tabIndex={selectAllTabIndex}
        aria-disabled={selectAllDisabled || undefined}
        onClick={() => { if (!selectAllDisabled) onSelectAll(); }}
        className={`shrink-0 whitespace-nowrap rounded px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
          selectAllDisabled ? "cursor-not-allowed text-slate-600" : "text-slate-400 hover:bg-slate-800"
        }`}
      >
        {allVisibleSelected ? m.clear_selection() : m.select_all()}
      </button>

      <button
        ref={actionRef}
        tabIndex={actionTabIndex}
        aria-disabled={actionDisabled || undefined}
        aria-label={actionLabel}
        onClick={() => { if (!actionDisabled) onAction(); }}
        className={`shrink-0 whitespace-nowrap rounded px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText] ${
          actionDisabled ? "cursor-not-allowed text-slate-600" : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {actionLabel}
      </button>

      {/* Plain (NOT live) count — read in browse mode; the central announce() on
          each gesture is the only spoken update. */}
      {selCount > 0 && (
        <span className="text-xs text-slate-400">{m.selected_count_label({ count: selCount })}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/common/SelectionToolbar.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/common/SelectionToolbar.tsx src/components/common/SelectionToolbar.test.tsx
git commit -m "feat(selection): SelectionToolbar cluster for single-action lists"
```

---

# Phase 1 — Songs

### Task 6: Backend `delete_songs` (recycle-bin, skip the playing file)

**Files:**
- Modify: `src-tauri/src/commands/songs_commands.rs` (add `BulkDeleteSongs` + `delete_songs`)
- Modify: `src-tauri/src/lib.rs:271-276` (register the command)
- Modify: `src/lib/tauri.ts` (add `deleteSongs` wrapper near `deleteSong` at line 449)

**Interfaces:**
- Produces: `delete_songs(paths: Vec<String>) -> BulkDeleteSongs { deleted: Vec<String>, skipped: Vec<String> }`. Recycle-bins each path; the currently-playing file goes to `skipped` (partial success, NOT an error like single `delete_song`). Does NOT emit per-file `song-deleted` (the frontend updates `$songs` once and gives one summary). TS: `deleteSongs(paths: string[]): Promise<{ deleted: string[]; skipped: string[] }>`.

- [ ] **Step 1: Write the failing Rust test**

Add to the (currently absent) `#[cfg(test)] mod tests` at the end of `src-tauri/src/commands/songs_commands.rs`. The recycle-bin call and player state need Tauri state, so unit-test only the pure partition helper:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partition_skips_the_playing_path() {
        let paths = vec!["a.mp3".to_string(), "b.mp3".to_string(), "c.mp3".to_string()];
        let (to_delete, skipped) = partition_deletable(&paths, Some("b.mp3"));
        assert_eq!(to_delete, vec!["a.mp3".to_string(), "c.mp3".to_string()]);
        assert_eq!(skipped, vec!["b.mp3".to_string()]);
    }

    #[test]
    fn partition_keeps_all_when_nothing_is_playing() {
        let paths = vec!["a.mp3".to_string()];
        let (to_delete, skipped) = partition_deletable(&paths, None);
        assert_eq!(to_delete, vec!["a.mp3".to_string()]);
        assert!(skipped.is_empty());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p tapir partition_ --manifest-path src-tauri/Cargo.toml`
Expected: FAIL — `partition_deletable` not found.

- [ ] **Step 3: Implement the helper + command + DTO**

In `src-tauri/src/commands/songs_commands.rs`, add the DTO and pure helper near the top (after the imports), and the command after `delete_song`:

```rust
/// Result of a bulk delete: which paths were recycle-binned, which were skipped
/// (currently playing). Mirrors the streams "honest count" pattern but returns
/// the path lists so the frontend can compute focus over visible row order.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkDeleteSongs {
    pub deleted: Vec<String>,
    pub skipped: Vec<String>,
}

/// Split `paths` into (deletable, skipped) — the currently-playing path is
/// skipped. Pure; unit-testable without Tauri state.
fn partition_deletable(paths: &[String], playing: Option<&str>) -> (Vec<String>, Vec<String>) {
    let mut to_delete = Vec::new();
    let mut skipped = Vec::new();
    for p in paths {
        if Some(p.as_str()) == playing {
            skipped.push(p.clone());
        } else {
            to_delete.push(p.clone());
        }
    }
    (to_delete, skipped)
}

/// Bulk variant of `delete_song`: recycle-bin each path in one pass, skipping the
/// currently-playing file (partial success, not an error). Does NOT emit per-file
/// `song-deleted` (the frontend updates $songs once and gives one summary).
#[tauri::command]
pub async fn delete_songs(
    paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<BulkDeleteSongs, String> {
    let playing = {
        use crate::player::engine::PlaybackSource;
        let status = state.player.get_status().await;
        match status.source.as_ref() {
            Some(PlaybackSource::File { path }) => Some(path.clone()),
            _ => None,
        }
    };
    let (to_delete, skipped) = partition_deletable(&paths, playing.as_deref());

    let recycled = tokio::task::spawn_blocking(move || {
        let mut ok = Vec::new();
        for p in to_delete {
            if songs::ops::delete_to_recycle_bin(Path::new(&p)).is_ok() {
                ok.push(p);
            }
        }
        ok
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(BulkDeleteSongs { deleted: recycled, skipped })
}
```

- [ ] **Step 4: Register the command** in `src-tauri/src/lib.rs`, after `commands::songs_commands::delete_song,` (line 276):

```rust
            commands::songs_commands::delete_songs,
```

- [ ] **Step 5: Add the `lib/tauri.ts` wrapper** after `deleteSong` (line 449):

```ts
export async function deleteSongs(paths: string[]): Promise<{ deleted: string[]; skipped: string[] }> {
  return invoke("delete_songs", { paths });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo test -p tapir --manifest-path src-tauri/Cargo.toml partition_`
Expected: PASS (2 tests). Also confirm the crate still compiles: `cargo build --manifest-path src-tauri/Cargo.toml`.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/songs_commands.rs src-tauri/src/lib.rs src/lib/tauri.ts
git commit -m "feat(songs): delete_songs bulk command (recycle-bin, skip playing)"
```

---

### Task 7: i18n — songs bulk keys

**Files:**
- Modify: `src/i18n/messages/uk.json`, `src/i18n/messages/en.json`

**Interfaces:**
- Produces: `m.confirm_delete_selected_songs({count})`, `m.songs_removed_bulk({count})`, `m.bulk_skipped_playing({count})`.

- [ ] **Step 1: Add the keys to both files**

`uk.json`:
```json
  "confirm_delete_selected_songs": "Видалити вибрані пісні ({count})?",
  "songs_removed_bulk": "Видалено {count}",
  "bulk_skipped_playing": "пропущено {count} (відтворюється)",
```
`en.json`:
```json
  "confirm_delete_selected_songs": "Delete selected songs ({count})?",
  "songs_removed_bulk": "Removed {count}",
  "bulk_skipped_playing": "{count} skipped (playing)",
```

- [ ] **Step 2: Regenerate Paraglide**

Run: `pnpm vite:build`
Expected: build succeeds; `src/i18n/paraglide/messages/songs_removed_bulk.js` etc. now exist.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/messages/uk.json src/i18n/messages/en.json src/i18n/paraglide
git commit -m "i18n(songs): bulk delete confirm + summary keys"
```

---

### Task 8: Songs store — selection atom + bulk store mutation

**Files:**
- Modify: `src/stores/songs.ts` (add `$songsSelection`, `removeSongsByPaths`)
- Test: `src/stores/songs.test.ts` (create if absent)

**Interfaces:**
- Produces: `$songsSelection: atom<Set<string>>`, `removeSongsByPaths(paths: string[]): void`.

- [ ] **Step 1: Write the failing test**

```ts
// src/stores/songs.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import type { Song } from "../types/song";
import { $songs, removeSongsByPaths } from "./songs";

const mk = (path: string): Song => ({
  path, fileName: path, title: path, artist: "", album: "", station: "S",
  durationMs: 0, sizeBytes: 1, recordedAt: "2026-01-01T00:00:00Z", isComplete: true,
});

beforeEach(() => $songs.set([mk("a.mp3"), mk("b.mp3"), mk("c.mp3")]));

describe("removeSongsByPaths", () => {
  it("removes every listed path in one update", () => {
    removeSongsByPaths(["a.mp3", "c.mp3"]);
    expect($songs.get().map((s) => s.path)).toEqual(["b.mp3"]);
  });
});
```

(Adjust the `Song` literal to the real `src/types/song.ts` shape if fields differ — read it first.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/stores/songs.test.ts`
Expected: FAIL — `removeSongsByPaths` is not exported.

- [ ] **Step 3: Implement**

In `src/stores/songs.ts`, add after `$songsSort` and after `removeSongByPath`:

```ts
import { atom, computed } from "nanostores";
// ... existing imports

/** Multi-select state for the songs list (milestone D). Keyed by song path. */
export const $songsSelection = atom<Set<string>>(new Set());
```

```ts
/** Bulk variant of removeSongByPath: drop every listed path in one update. */
export function removeSongsByPaths(paths: string[]): void {
  const drop = new Set(paths);
  $songs.set($songs.get().filter((s) => !drop.has(s.path)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/stores/songs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/songs.ts src/stores/songs.test.ts
git commit -m "feat(songs): $songsSelection atom + removeSongsByPaths"
```

---

### Task 9: SongItem selected suffix + SongContextMenu dynamic delete label

**Files:**
- Modify: `src/components/songs/SongItem.tsx`
- Modify: `src/components/songs/SongContextMenu.tsx`
- Test: `src/components/songs/SongItem.test.tsx`

**Interfaces:**
- Produces: `SongItem` gains `isSelected: boolean`; appends `, ${m.selection_suffix()}` to `summaryLabel` and passes `selected={isSelected}` to `CompositeRow`. `SongContextMenu` gains `selectionCount: number`; the Delete item reads `m.delete_selected({count})` when the row is part of a non-empty selection-driven delete (see Task 10 routing), else `m.songs_action_delete()`.

- [ ] **Step 1: Write the failing test** (add to `SongItem.test.tsx`)

```tsx
it("appends the selected suffix to the row label and marks the row data-selected", () => {
  const { container } = renderItem({ isSelected: true }); // extend renderItem props
  const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
  expect(li.getAttribute("aria-label")).toMatch(new RegExp(`${m.selection_suffix()}$`));
  expect(li.getAttribute("data-selected")).toBe("true");
});
```

(Extend the file's `renderItem`/props with `isSelected: false` default and import `* as m` if not already imported.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/songs/SongItem.test.tsx`
Expected: FAIL — `isSelected` not handled; no `data-selected`.

- [ ] **Step 3: Implement SongItem**

In `src/components/songs/SongItem.tsx`, add `isSelected` to `Props`, fold it into the label, and pass `selected`:

```tsx
interface Props {
  song: Song;
  isActiveRow: boolean;
  isPlaying: boolean;
  isSelected: boolean;
  isFocused: (segment: "summary" | SegmentKind) => boolean;
  onPlay: () => void;
  onAction: (action: SongAction) => void;
}

export function SongItem({ song, isActiveRow, isPlaying, isSelected, isFocused, onPlay, onAction }: Props) {
  // ... existing baseSummary / summaryLabel computation ...
  const labelWithSelection = isSelected ? `${summaryLabel}, ${m.selection_suffix()}` : summaryLabel;

  return (
    <CompositeRow
      itemId={song.path}
      isFocused={isFocused}
      isActiveRow={isActiveRow}
      label={labelWithSelection}
      selected={isSelected}
      roleDescription={m.item_role_song()}
      className="border-b border-slate-800 px-3 py-2"
      activeClassName="bg-slate-800/40"
    >
      {/* ...unchanged children... */}
```

- [ ] **Step 4: Implement SongContextMenu dynamic label**

In `src/components/songs/SongContextMenu.tsx`, add `selectionCount: number` to `Props` and make the delete item label dynamic (decision #16 — only the delete item carries the count):

```tsx
interface Props {
  song: Song;
  menuFocused: boolean;
  selectionCount: number;
  onAction: (action: SongAction) => void;
}
```
```tsx
          <MenuItem id="delete" className="cursor-pointer px-3 py-1.5 text-sm text-red-400 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]">
            {selectionCount > 0 ? m.delete_selected({ count: selectionCount }) : m.songs_action_delete()}
          </MenuItem>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/components/songs/SongItem.test.tsx`
Expected: PASS (the new selected-suffix test + the existing ones).

- [ ] **Step 6: Commit**

```bash
git add src/components/songs/SongItem.tsx src/components/songs/SongContextMenu.tsx src/components/songs/SongItem.test.tsx
git commit -m "feat(songs): selected suffix on row + dynamic delete label in ⋯ menu"
```

---

### Task 10: SongsList selection wiring, bulk delete, Explorer routing, handle

**Files:**
- Modify: `src/components/songs/SongsList.tsx`
- Test: `src/components/songs/SongsList.test.tsx` (create)

**Interfaces:**
- Consumes: `useListSelection` (Task 4), `computeBulkFocusTarget` (Task 2), `deleteSongs` (Task 6), `$songs`/`$songsSelection`/`removeSongsByPaths` (Task 8), `SelectionToolbar` is NOT used here (lives in the panel).
- Produces: `SongsListHandle = ZoneEntry & { requestBulkDelete(): void }`. New props `selectedCount`-free — the list reads `$songsSelection` itself. Adds a `delete` branch to `onAction` (the D4 gap fix), the bulk `ConfirmDialog`, the focus effect, and `isSelected` on each row. The single-delete path is delegated to the panel via the existing `onAction(path, "delete")`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/songs/SongsList.test.tsx
import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act, waitFor } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $songs, $songsSelection } from "../../stores/songs";
import { $announcer } from "../../stores/announcer";
import { $playerStatus } from "../../stores/player";
import { replaceSelection } from "../../stores/selection";
import type { Song } from "../../types/song";
import * as tauri from "../../lib/tauri";
import { SongsList, type SongsListHandle } from "./SongsList";

vi.mock("../../lib/tauri", () => ({
  deleteSongs: vi.fn().mockResolvedValue({ deleted: ["b.mp3", "c.mp3"], skipped: [] }),
  playSavedSong: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
}));

const mk = (path: string): Song => ({
  path, fileName: path, title: path, artist: "", album: "", station: "S",
  durationMs: 0, sizeBytes: 1, recordedAt: "2026-01-01T00:00:00Z", isComplete: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null });
  $songs.set([mk("a.mp3"), mk("b.mp3"), mk("c.mp3")]);
  replaceSelection($songsSelection, new Set());
});

function renderList() {
  const ref = createRef<SongsListHandle>();
  const onAction = vi.fn();
  const onEmpty = vi.fn();
  const utils = render(
    <SongsList ref={ref} exitZone={vi.fn()} onEmpty={onEmpty} onPlay={vi.fn()} onAction={onAction} />,
  );
  return { ref, onAction, onEmpty, ...utils };
}

describe("SongsList — bulk delete", () => {
  it("requestBulkDelete opens a confirm with the exact count, deletes, and announces the summary", async () => {
    replaceSelection($songsSelection, new Set(["b.mp3", "c.mp3"]));
    const { ref, getByText } = renderList();
    act(() => ref.current!.requestBulkDelete());
    expect(getByText(m.confirm_delete_selected_songs({ count: 2 }))).toBeTruthy();
    fireEvent.click(getByText(m.songs_action_delete())); // confirm button label
    await waitFor(() => expect(tauri.deleteSongs).toHaveBeenCalledWith(["b.mp3", "c.mp3"]));
    await waitFor(() => expect($songs.get().map((s) => s.path)).toEqual(["a.mp3"]));
    expect($announcer.get()?.message).toBe(m.songs_removed_bulk({ count: 2 }));
  });

  it("Delete with an empty selection routes a single delete to the panel", () => {
    const { ref, onAction } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    expect(onAction).toHaveBeenCalledWith("a.mp3", "delete");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/songs/SongsList.test.tsx`
Expected: FAIL — `SongsListHandle`/`requestBulkDelete` don't exist.

- [ ] **Step 3: Rewrite SongsList**

```tsx
// src/components/songs/SongsList.tsx
import { forwardRef, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import { $songs, $filteredSongs, $songsSelection, removeSongsByPaths } from "../../stores/songs";
import { replaceSelection } from "../../stores/selection";
import { $playerStatus } from "../../stores/player";
import { CompositeList } from "../common/composite-list";
import { ConfirmDialog } from "../common/ConfirmDialog";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { useListSelection } from "../../hooks/useListSelection";
import { useAnnounce } from "../../hooks/useAnnounce";
import { computeBulkFocusTarget } from "../../lib/bulkFocus";
import { SongItem, getSongSegments } from "./SongItem";
import type { SongAction } from "./SongContextMenu";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import type { Song } from "../../types/song";
import * as m from "../../i18n/paraglide/messages";

export type SongsListHandle = ZoneEntry & { requestBulkDelete(): void };

interface Props {
  exitZone: (forward: boolean) => void;
  onEmpty: () => void;
  onPlay: (path: string) => void;
  /** Single-row menu actions, incl. the single-delete path (Explorer model). */
  onAction: (path: string, action: SongAction) => void;
}

export const SongsList = forwardRef<SongsListHandle, Props>(
  ({ exitZone, onEmpty, onPlay, onAction }, ref) => {
    const songs = useStore($filteredSongs);
    const allSongs = useStore($songs);
    const selectedSet = useStore($songsSelection);
    const playerStatus = useStore($playerStatus);
    const announce = useAnnounce();
    const playingPath =
      playerStatus.state !== "stopped" && playerStatus.source?.type === "file"
        ? playerStatus.source.path
        : null;

    const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
    const pendingBulkFocusRef = useRef<string | null>(null);
    const [bulkSeq, setBulkSeq] = useState(0);
    const focusItemRef = useRef<((id: string, segment?: SegmentKind) => void) | null>(null);

    const resolveName = useCallback(
      (path: string) => songs.find((s) => s.path === path)?.title || path,
      [songs],
    );
    const { selectionAdapter, onSelectionChange } = useListSelection<Song>({
      $selection: $songsSelection,
      announce,
      resolveName,
      allItems: allSongs, // FULL store (prune must NOT drop rows hidden by a filter)
      getId: (s) => s.path,
    });

    const items = useMemo(() => songs.map((s) => ({ id: s.path, segments: getSongSegments() })), [songs]);

    // Programmatic focus after a bulk delete (mirror StreamList).
    useLayoutEffect(() => {
      const targetId = pendingBulkFocusRef.current;
      if (!targetId) return;
      pendingBulkFocusRef.current = null;
      focusItemRef.current?.(targetId, "summary");
    }, [items, bulkSeq]);

    const handleConfirmBulkDelete = async () => {
      const paths = [...$songsSelection.get()];
      if (paths.length === 0) { setBulkConfirmOpen(false); return; }
      const visible = songs; // snapshot before await (focus index, A8)
      try {
        const res = await tauri.deleteSongs(paths);
        const removedIds = new Set(res.deleted);
        if (removedIds.size > 0) {
          removeSongsByPaths(res.deleted);
          replaceSelection($songsSelection, new Set());
          const target = computeBulkFocusTarget(visible, removedIds);
          if (target === null) onEmpty();
          else pendingBulkFocusRef.current = target;
          setBulkSeq((n) => n + 1);
        }
        const parts = [m.songs_removed_bulk({ count: res.deleted.length })];
        if (res.skipped.length > 0) parts.push(m.bulk_skipped_playing({ count: res.skipped.length }));
        announce(parts.join(", "), "polite");
      } catch (err) {
        addToast(String(err), "error");
      }
      setBulkConfirmOpen(false);
    };

    return (
      <>
        <CompositeList<SongsListHandle>
          ref={ref}
          imperativeExtra={({ focusItem }) => {
            focusItemRef.current = focusItem;
            return { requestBulkDelete: () => setBulkConfirmOpen(true) };
          }}
          zoneId="songs-list"
          ariaLabel={m.songs_zone_list()}
          items={items}
          className="flex-1 overflow-y-auto overflow-x-hidden"
          onTabOut={exitZone}
          onEmpty={onEmpty}
          selection={selectionAdapter}
          onSelectionChange={onSelectionChange}
          onAction={(type, itemId, segment) => {
            if (type === "delete") {
              // Keyboard Delete: whole selection if any, else single (the D4 gap —
              // songs had no delete branch before). Single is delegated to the panel.
              if ($songsSelection.get().size > 0) setBulkConfirmOpen(true);
              else onAction(itemId, "delete");
              return;
            }
            if ((type === "primary" || type === "toggle") && segment === "summary") onPlay(itemId);
          }}
          renderRow={({ id, isActive, isFocused }) => {
            const song = songs.find((s) => s.path === id)!;
            return (
              <SongItem
                key={id}
                song={song}
                isActiveRow={isActive}
                isPlaying={playingPath === id}
                isSelected={selectedSet.has(id)}
                isFocused={isFocused}
                onPlay={() => onPlay(id)}
                onAction={(action) => {
                  if (action === "delete") {
                    // Explorer model: ⋯-delete INSIDE the selection → bulk; OUTSIDE
                    // → collapse to {id} then single (delegated to the panel).
                    if ($songsSelection.get().has(id)) setBulkConfirmOpen(true);
                    else { replaceSelection($songsSelection, new Set([id])); onAction(id, "delete"); }
                  } else {
                    onAction(id, action);
                  }
                }}
              />
            );
          }}
        />
        {bulkConfirmOpen &&
          createPortal(
            <ConfirmDialog
              title={m.songs_confirm_delete_title()}
              message={m.confirm_delete_selected_songs({ count: selectedSet.size })}
              confirmLabel={m.songs_action_delete()}
              onConfirm={handleConfirmBulkDelete}
              onCancel={() => setBulkConfirmOpen(false)}
            />,
            document.body,
          )}
      </>
    );
  },
);
SongsList.displayName = "SongsList";
```

Note: `SongItem` now needs `selectionCount` threaded into `SongContextMenu`. Inside `SongItem.tsx`, pass `selectionCount={isSelected ? /* count */ : 0}` — but the count isn't known in the row. Simpler per decision #16: the ⋯ delete label shows the count ONLY when the row is selected; pass `selectionCount` from `SongsList` renderRow as `selectedSet.has(id) ? selectedSet.size : 0`. Update `SongItem` to accept and forward `selectionCount` to `SongContextMenu`. Add `selectionCount={selectedSet.has(id) ? selectedSet.size : 0}` to the `<SongItem>` above and a matching prop in `SongItem` that it forwards to `<SongContextMenu ... selectionCount={selectionCount} />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/songs/SongsList.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/songs/SongsList.tsx src/components/songs/SongItem.tsx src/components/songs/SongsList.test.tsx
git commit -m "feat(songs): selection wiring + bulk delete + Delete-key branch + ⋯ routing"
```

---

### Task 11: SongsPanel header cluster zone + lifecycle clearing

**Files:**
- Modify: `src/components/songs/SongsPanel.tsx`
- Test: `src/components/songs/SongsPanel.test.tsx` (create)

**Interfaces:**
- Consumes: `SelectionToolbar` (Task 5), `SongsListHandle` (Task 10), `$songsSelection`/`replaceSelection`.
- Produces: a new `songs-selection` roving zone in the header (two stops: select-all + delete-selected), registered FIRST in `[selection, filter, list]`. Select-all acts on `$filteredSongs` (visible) and announces itself (A7). Selection clears on `$songsQuery`/`$songsStation` change and on unmount; sort preserves.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/songs/SongsPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $songs, $songsSelection, $songsQuery } from "../../stores/songs";
import { $announcer } from "../../stores/announcer";
import { replaceSelection } from "../../stores/selection";
import type { Song } from "../../types/song";
import { SongsPanel } from "./SongsPanel";

vi.mock("../../lib/tauri", () => ({
  listSavedSongs: vi.fn().mockResolvedValue([]),
  deleteSongs: vi.fn().mockResolvedValue({ deleted: [], skipped: [] }),
}));

const mk = (path: string): Song => ({
  path, fileName: path, title: path, artist: "", album: "", station: "S",
  durationMs: 0, sizeBytes: 1, recordedAt: "2026-01-01T00:00:00Z", isComplete: true,
});

beforeEach(() => {
  $songs.set([mk("a.mp3"), mk("b.mp3")]);
  $songsQuery.set("");
  replaceSelection($songsSelection, new Set());
});

const renderPanel = () => render(<SongsPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);

describe("SongsPanel — selection cluster", () => {
  it("select-all selects every visible song and announces the count", () => {
    const { getByText } = renderPanel();
    fireEvent.click(getByText(m.select_all()));
    expect($songsSelection.get().size).toBe(2);
    expect($announcer.get()?.message).toBe(m.selection_count({ count: 2 }));
  });

  it("clears the selection when the search query changes (filter change)", () => {
    renderPanel();
    replaceSelection($songsSelection, new Set(["a.mp3"]));
    $songsQuery.set("rock");
    expect($songsSelection.get().size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/songs/SongsPanel.test.tsx`
Expected: FAIL — no select-all control; selection not cleared on filter change.

- [ ] **Step 3: Implement SongsPanel changes**

Wrap the standalone `ScreenHeader` in a `ScreenZone role="application"` carrying the `SelectionToolbar` as header children, add the roving hook over `[selectAllBtn, deleteSelectedBtn]`, register the new zone first, type `listRef` as `SongsListHandle`, and add lifecycle clearing. Key additions to `src/components/songs/SongsPanel.tsx`:

```tsx
// new imports
import { useStore } from "@nanostores/react";
import { ScreenZone } from "../layout/ScreenZone";
import { SelectionToolbar } from "../common/SelectionToolbar";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { $songsSelection, $songsQuery, $songsStation } from "../../stores/songs";
import { replaceSelection } from "../../stores/selection";
import { SongsList, type SongsListHandle } from "./SongsList";
```

```tsx
  // inside SongsPanel(), near the top
  const selection = useStore($songsSelection);
  const query = useStore($songsQuery);
  const station = useStore($songsStation);
  const selCount = selection.size;
  const visibleIds = useMemo(() => songs.map((s) => s.path), [songs]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));

  // listRef now carries the bulk-delete entry point
  const listRef = useRef<SongsListHandle | null>(null);

  // Selection toolbar roving zone (two stops)
  const selectionZoneRef = useRef<HTMLDivElement | null>(null);
  const selectAllBtn = useRef<HTMLButtonElement | null>(null);
  const deleteSelectedBtn = useRef<HTMLButtonElement | null>(null);
  const selectionRefs = useMemo(() => [selectAllBtn, deleteSelectedBtn], []);
  const {
    onKeyDown: selKeyDown,
    getTabIndex: selTabIndex,
    restoreFocus: selRestore,
  } = useRovingFocus(selectionRefs, "horizontal", {
    mode: "mixed-boundary-handoff",
    onTabBoundary: (forward) => exitZone("songs-selection", forward),
  });

  const handleSelectAll = () => {
    if (visibleIds.length === 0) return;
    const next = new Set(selection);
    if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    replaceSelection($songsSelection, next);
    announce(next.size === 0 ? m.selection_cleared() : m.selection_count({ count: next.size }), "polite");
  };

  // Lifecycle: clear on filter change (query/station) and on unmount; sort preserves.
  useEffect(() => { replaceSelection($songsSelection, new Set()); }, [query, station]);
  useEffect(() => () => { replaceSelection($songsSelection, new Set()); }, []);
```

Zone registration (replace the existing `useEffect` that builds zones) — register the selection zone FIRST:

```tsx
  useEffect(() => {
    const zones: ZoneEntry[] = [{
      id: "songs-selection",
      get el() { return selectionZoneRef.current!; },
      focus: selRestore,
    }];
    if (filterRef.current) zones.push(filterRef.current);
    if (listRef.current) zones.push(listProxyRef.current);
    onZonesChange(zones);
  }, [onZonesChange, songs.length, selRestore]);
```

Header markup (replace `<ScreenHeader title={m.songs_section()} />`):

```tsx
      <ScreenZone
        ref={selectionZoneRef}
        id="songs-selection"
        role="application"
        label={m.zone_songs_selection()}
        onKeyDown={selKeyDown}
      >
        <ScreenHeader title={m.songs_section()}>
          <SelectionToolbar
            selCount={selCount}
            visibleCount={visibleIds.length}
            allVisibleSelected={allVisibleSelected}
            selectAllRef={selectAllBtn}
            actionRef={deleteSelectedBtn}
            selectAllTabIndex={selTabIndex(0)}
            actionTabIndex={selTabIndex(1)}
            actionLabel={m.delete_selected({ count: selCount })}
            onSelectAll={handleSelectAll}
            onAction={() => listRef.current?.requestBulkDelete()}
          />
        </ScreenHeader>
      </ScreenZone>
```

Add the i18n zone label `zone_songs_selection` ("Дії з вибраними піснями" / "Selected songs actions") to both message files and regenerate (`pnpm vite:build`).

Change `<SongsList ref={listRef} ... />` — the `listRef` is still passed by the same callback that also feeds the proxy; keep the existing `listRef`/`listProxyRef` wiring but with the new `SongsListHandle` type. The list now also needs `onAction` for single delete — it already receives `handleMenuAction`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/songs/SongsPanel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the songs suite + build**

Run: `pnpm test src/components/songs/ src/stores/songs.test.ts && pnpm vite:build`
Expected: all green; build OK.

- [ ] **Step 6: Commit**

```bash
git add src/components/songs/SongsPanel.tsx src/components/songs/SongsPanel.test.tsx src/i18n/messages src/i18n/paraglide
git commit -m "feat(songs): header selection cluster zone + filter/unmount lifecycle clearing"
```

---

# Phase 2 — Profiles

### Task 12: Backend `delete_profiles` (skip the active profile)

**Files:**
- Modify: `src-tauri/src/commands/profile_commands.rs`
- Modify: `src-tauri/src/lib.rs` (register after `delete_profile`, line 280)
- Modify: `src/lib/tauri.ts` (add `deleteProfiles` near `deleteProfile`, line 595)

**Interfaces:**
- Produces: `delete_profiles(names: Vec<String>) -> BulkDeleteProfiles { deleted: Vec<String>, skipped_active: bool }`. Deletes each via `Profile::delete`, skipping the active profile (compared against `state.active_profile`). `deleted` = names actually removed (the active is never in it). TS: `deleteProfiles(names: string[]): Promise<{ deleted: string[]; skippedActive: boolean }>`.

- [ ] **Step 1: Write the failing Rust test** (pure partition helper)

```rust
// in profile_commands.rs tests mod (create the mod if absent)
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partition_excludes_active() {
        let names = vec!["Jazz".to_string(), "Default".to_string(), "News".to_string()];
        let (to_delete, skipped_active) = partition_deletable_profiles(&names, "Default");
        assert_eq!(to_delete, vec!["Jazz".to_string(), "News".to_string()]);
        assert!(skipped_active);
    }

    #[test]
    fn partition_reports_no_skip_when_active_absent() {
        let names = vec!["Jazz".to_string()];
        let (to_delete, skipped_active) = partition_deletable_profiles(&names, "Default");
        assert_eq!(to_delete, vec!["Jazz".to_string()]);
        assert!(!skipped_active);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p tapir --manifest-path src-tauri/Cargo.toml partition_deletable_profiles`
Expected: FAIL — helper not found.

- [ ] **Step 3: Implement helper + DTO + command**

```rust
/// Names actually removed + whether the active profile was among the requested.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkDeleteProfiles {
    pub deleted: Vec<String>,
    pub skipped_active: bool,
}

/// Split requested names into (deletable, whether the active was requested).
/// Pure; unit-testable without Tauri state.
fn partition_deletable_profiles(names: &[String], active: &str) -> (Vec<String>, bool) {
    let mut to_delete = Vec::new();
    let mut skipped_active = false;
    for n in names {
        if n == active { skipped_active = true; } else { to_delete.push(n.clone()); }
    }
    (to_delete, skipped_active)
}

#[tauri::command]
pub async fn delete_profiles(
    names: Vec<String>,
    state: State<'_, AppState>,
) -> Result<BulkDeleteProfiles, String> {
    let active = {
        let profile = state.active_profile.read().await;
        profile.name.clone()
    };
    let (to_delete, skipped_active) = partition_deletable_profiles(&names, &active);
    let mut deleted = Vec::new();
    for name in to_delete {
        // Best-effort per profile; a single failure doesn't abort the batch.
        if Profile::delete(&name).is_ok() {
            deleted.push(name);
        }
    }
    Ok(BulkDeleteProfiles { deleted, skipped_active })
}
```

- [ ] **Step 4: Register + wrapper**

`lib.rs` after line 280:
```rust
            commands::profile_commands::delete_profiles,
```
`lib/tauri.ts` after `deleteProfile`:
```ts
export async function deleteProfiles(names: string[]): Promise<{ deleted: string[]; skippedActive: boolean }> {
  return invoke("delete_profiles", { names });
}
```

- [ ] **Step 5: Run tests + build**

Run: `cargo test -p tapir --manifest-path src-tauri/Cargo.toml partition_deletable_profiles && cargo build --manifest-path src-tauri/Cargo.toml`
Expected: PASS + compiles.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/profile_commands.rs src-tauri/src/lib.rs src/lib/tauri.ts
git commit -m "feat(profiles): delete_profiles bulk command (skip active)"
```

---

### Task 13: i18n — profiles bulk keys

**Files:** `src/i18n/messages/uk.json`, `src/i18n/messages/en.json`

**Interfaces:** Produces `m.confirm_delete_selected_profiles({count})`, `m.profiles_removed_bulk({count})`, `m.bulk_skipped_active()`.

- [ ] **Step 1: Add keys**

`uk.json`:
```json
  "confirm_delete_selected_profiles": "Видалити вибрані профілі ({count})?",
  "profiles_removed_bulk": "Видалено профілів: {count}",
  "bulk_skipped_active": "активний профіль пропущено",
```
`en.json`:
```json
  "confirm_delete_selected_profiles": "Delete selected profiles ({count})?",
  "profiles_removed_bulk": "Profiles removed: {count}",
  "bulk_skipped_active": "active profile skipped",
```

- [ ] **Step 2: Regenerate + commit**

Run: `pnpm vite:build`
```bash
git add src/i18n/messages src/i18n/paraglide
git commit -m "i18n(profiles): bulk delete confirm + summary keys"
```

---

### Task 14: Profiles store — selection atom

**Files:** Modify `src/stores/profileManager.ts`

**Interfaces:** Produces `$profilesSelection: atom<Set<string>>` (keyed by profile name).

- [ ] **Step 1: Implement** (no separate test — exercised by Task 16)

```ts
import { atom } from "nanostores";
import type { ProfileMeta } from "../lib/tauri";

export const $profileList = atom<ProfileMeta[]>([]);

/** Multi-select state for the profiles list (milestone D). Keyed by profile name. */
export const $profilesSelection = atom<Set<string>>(new Set());
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/profileManager.ts
git commit -m "feat(profiles): $profilesSelection atom"
```

---

### Task 15: ProfileItem selected suffix + ProfileContextMenu dynamic delete label

**Files:**
- Modify: `src/components/profile/ProfileItem.tsx`
- Modify: `src/components/profile/ProfileContextMenu.tsx`
- Test: `src/components/profile/ProfileItem.test.tsx`

**Interfaces:** Produces `ProfileItem` `isSelected: boolean` → appends `, ${m.selection_suffix()}` to `rowLabel`, passes `selected`. The active profile CAN show the suffix. `ProfileContextMenu` gains `selectionCount: number`; the delete item label becomes `m.delete_selected({count})` when `selectionCount > 0`.

- [ ] **Step 1: Write the failing test** (add to `ProfileItem.test.tsx`)

```tsx
it("appends the selected suffix and sets data-selected, even for the active profile", () => {
  const { container } = renderItem({ isSelected: true, profile: { name: "Default", streamCount: 1, isActive: true }, activeProfile: "Default" });
  const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
  expect(li.getAttribute("aria-label")).toMatch(new RegExp(`${m.selection_suffix()}$`));
  expect(li.getAttribute("data-selected")).toBe("true");
});
```

(Extend `renderItem` with `isSelected: false` default; import `* as m`.)

- [ ] **Step 2: Run → FAIL**

Run: `pnpm test src/components/profile/ProfileItem.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** — add `isSelected` to `ProfileItem` Props; compute `const labelWithSelection = isSelected ? \`${rowLabel}, ${m.selection_suffix()}\` : rowLabel;` and pass `label={labelWithSelection}` + `selected={isSelected}` to `CompositeRow`. Thread `selectionCount` to `ProfileContextMenu` (`selectionCount={isSelected ? selectionCountFromList : 0}` — the count is passed down from `ProfileList`). In `ProfileContextMenu`, add `selectionCount: number` and make the delete `MenuItem` label `selectionCount > 0 ? m.delete_selected({ count: selectionCount }) : m.profile_delete()`.

- [ ] **Step 4: Run → PASS**

Run: `pnpm test src/components/profile/ProfileItem.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/ProfileItem.tsx src/components/profile/ProfileContextMenu.tsx src/components/profile/ProfileItem.test.tsx
git commit -m "feat(profiles): selected suffix (incl. active) + dynamic delete label"
```

---

### Task 16: ProfileList selection wiring, bulk delete (active-skip), Explorer routing, handle

**Files:**
- Modify: `src/components/profile/ProfileList.tsx`
- Test: `src/components/profile/ProfileList.test.tsx`

**Interfaces:**
- Consumes: `useListSelection`, `computeBulkFocusTarget`, `deleteProfiles`, `$profileList`/`$profilesSelection`.
- Produces: `ProfileListHandle` gains `requestBulkDelete(): void` (alongside existing `focusProfile`). Bulk removes only `result.deleted`; `removedIds = new Set(result.deleted)` (active excluded). Full skip (`removedIds.size === 0`, e.g. only the active was selected) is a focus no-op + summary. The active always survives → `onEmpty` branch is unreachable.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/profile/ProfileList.test.tsx (new file or extend existing)
import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act, waitFor } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $profileList, $profilesSelection } from "../../stores/profileManager";
import { $announcer } from "../../stores/announcer";
import { replaceSelection } from "../../stores/selection";
import type { ProfileMeta } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { ProfileList, type ProfileListHandle } from "./ProfileList";

vi.mock("../../lib/tauri", () => ({
  deleteProfiles: vi.fn().mockResolvedValue({ deleted: ["Jazz"], skippedActive: true }),
}));

const profiles: ProfileMeta[] = [
  { name: "Default", streamCount: 2, isActive: true },
  { name: "Jazz", streamCount: 0, isActive: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  $profileList.set(profiles);
  replaceSelection($profilesSelection, new Set());
});

function renderList() {
  const ref = createRef<ProfileListHandle>();
  const utils = render(
    <ProfileList
      ref={ref}
      profiles={profiles}
      activeProfile="Default"
      exitZone={vi.fn()}
      onSwitch={vi.fn()} onDuplicate={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} onExport={vi.fn()}
    />,
  );
  return { ref, ...utils };
}

describe("ProfileList — bulk delete", () => {
  it("skips the active profile and announces the partial-success tail", async () => {
    replaceSelection($profilesSelection, new Set(["Default", "Jazz"]));
    const { ref, getByText } = renderList();
    act(() => ref.current!.requestBulkDelete());
    fireEvent.click(getByText(m.profile_delete())); // confirm button
    await waitFor(() => expect(tauri.deleteProfiles).toHaveBeenCalledWith(["Default", "Jazz"]));
    await waitFor(() => expect($profileList.get().map((p) => p.name)).toEqual(["Default"]));
    expect($announcer.get()?.message).toBe(
      `${m.profiles_removed_bulk({ count: 1 })}, ${m.bulk_skipped_active()}`,
    );
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `pnpm test src/components/profile/ProfileList.test.tsx`
Expected: FAIL — `requestBulkDelete` missing.

- [ ] **Step 3: Implement ProfileList changes** — add selection wiring + bulk + handle. Key edits:

```tsx
// new imports
import { forwardRef, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import { $profileList, $profilesSelection } from "../../stores/profileManager";
import { replaceSelection } from "../../stores/selection";
import { useListSelection } from "../../hooks/useListSelection";
import { useAnnounce } from "../../hooks/useAnnounce";
import { computeBulkFocusTarget } from "../../lib/bulkFocus";
import { ConfirmDialog } from "../common/ConfirmDialog";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import type { SegmentKind } from "../../hooks/useCompositeList";

export interface ProfileListHandle extends ZoneEntry {
  focusProfile: (name: string) => void;
  requestBulkDelete: () => void;
}
```

```tsx
  // inside ProfileList body
  const selectedSet = useStore($profilesSelection);
  const announce = useAnnounce();
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const pendingBulkFocusRef = useRef<string | null>(null);
  const [bulkSeq, setBulkSeq] = useState(0);
  const focusItemRef = useRef<((id: string, segment?: SegmentKind) => void) | null>(null);

  const resolveName = useCallback((name: string) => name, []);
  const { selectionAdapter, onSelectionChange } = useListSelection<ProfileMeta>({
    $selection: $profilesSelection,
    announce,
    resolveName,
    allItems: profiles, // membership stable on switch — prune only drops vanished
    getId: (p) => p.name,
  });

  useLayoutEffect(() => {
    const targetId = pendingBulkFocusRef.current;
    if (!targetId) return;
    pendingBulkFocusRef.current = null;
    focusItemRef.current?.(targetId, "summary");
  }, [items, bulkSeq]);

  const handleConfirmBulkDelete = async () => {
    const names = [...$profilesSelection.get()];
    if (names.length === 0) { setBulkConfirmOpen(false); return; }
    const visible = profiles; // snapshot before await
    try {
      const res = await tauri.deleteProfiles(names);
      const removedIds = new Set(res.deleted);
      if (removedIds.size > 0) {
        $profileList.set($profileList.get().filter((p) => !removedIds.has(p.name)));
        replaceSelection($profilesSelection, new Set());
        const target = computeBulkFocusTarget(visible.map((p) => ({ id: p.name })), removedIds);
        if (target !== null) pendingBulkFocusRef.current = target; // active always survives
        setBulkSeq((n) => n + 1);
      }
      const parts = [m.profiles_removed_bulk({ count: res.deleted.length })];
      if (res.skippedActive) parts.push(m.bulk_skipped_active());
      announce(parts.join(", "), "polite");
    } catch (err) {
      addToast(String(err), "error");
    }
    setBulkConfirmOpen(false);
  };
```

Pass the selection layer + handle to `CompositeList`:
```tsx
      imperativeExtra={({ focusItem }) => {
        focusItemRef.current = focusItem;
        return {
          focusProfile: (name: string) => focusItem(name, "summary"),
          requestBulkDelete: () => setBulkConfirmOpen(true),
        };
      }}
      selection={selectionAdapter}
      onSelectionChange={onSelectionChange}
```

`onAction` delete branch (keyboard): route by selection size, else single via `onDelete`:
```tsx
      onAction={(type, itemId, segment) => {
        if (type === "delete") {
          if ($profilesSelection.get().size > 0) setBulkConfirmOpen(true);
          else onDelete(itemId);
          return;
        }
        if ((type === "primary" || type === "toggle") && segment === "summary") onSwitch(itemId);
      }}
```

`renderRow` → pass `isSelected`, `selectionCount`, and route the per-row delete (inline Trash2 + ⋯) by selection:
```tsx
      renderRow={({ id, isActive, isFocused }) => {
        const profile = profiles.find((p) => p.name === id)!;
        return (
          <ProfileItem
            key={id}
            profile={profile}
            activeProfile={activeProfile}
            isActiveRow={isActive}
            isSelected={selectedSet.has(id)}
            selectionCount={selectedSet.has(id) ? selectedSet.size : 0}
            isFocused={isFocused}
            onSwitch={onSwitch}
            onDuplicate={onDuplicate}
            onRename={onRename}
            onDelete={(name) => {
              if ($profilesSelection.get().has(name)) setBulkConfirmOpen(true);
              else { replaceSelection($profilesSelection, new Set([name])); onDelete(name); }
            }}
            onExport={onExport}
          />
        );
      }}
```

Add the bulk `ConfirmDialog` (portalled) after `</CompositeList>` — wrap the return in a fragment:
```tsx
      {bulkConfirmOpen &&
        createPortal(
          <ConfirmDialog
            title={m.profile_delete()}
            message={m.confirm_delete_selected_profiles({ count: selectedSet.size })}
            confirmLabel={m.profile_delete()}
            onConfirm={handleConfirmBulkDelete}
            onCancel={() => setBulkConfirmOpen(false)}
          />,
          document.body,
        )}
```

(`ProfileItem` must accept and forward `selectionCount` to `ProfileContextMenu` — added in Task 15.)

- [ ] **Step 4: Run → PASS**

Run: `pnpm test src/components/profile/ProfileList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/ProfileList.tsx src/components/profile/ProfileItem.tsx src/components/profile/ProfileList.test.tsx
git commit -m "feat(profiles): selection wiring + bulk delete with active-skip + ⋯ routing"
```

---

### Task 17: ProfilesPanel toolbar cluster (roving 2→4) + lifecycle

**Files:**
- Modify: `src/components/profile/ProfilesPanel.tsx`
- Test: `src/components/profile/ProfilesPanel.test.tsx`

**Interfaces:** Adds `SelectAll` + `DeleteSelected` to the toolbar roving array (`[New, Import, SelectAll, DeleteSelected]`, indices 0–3). Select-all acts on all profiles and announces itself. Selection clears only on unmount (switch does NOT clear — membership unchanged).

- [ ] **Step 1: Write the failing test** (add to `ProfilesPanel.test.tsx`)

```tsx
it("select-all selects every profile and the cluster delete drives the list bulk-delete", () => {
  // render the panel with $profileList populated; assert the select_all button exists,
  // clicking it sets $profilesSelection to all names and announces the count.
});
```

(Mirror the existing ProfilesPanel test setup for store seeding + `tauri.listProfiles` mock.)

- [ ] **Step 2: Run → FAIL**

Run: `pnpm test src/components/profile/ProfilesPanel.test.tsx`
Expected: FAIL — no select-all control.

- [ ] **Step 3: Implement** — extend the toolbar:

```tsx
  // refs: add two stops
  const selectAllBtn = useRef<HTMLButtonElement | null>(null);
  const deleteSelectedBtn = useRef<HTMLButtonElement | null>(null);
  const toolbarRefs = useMemo(() => [newBtn, importBtn, selectAllBtn, deleteSelectedBtn], []);
```
```tsx
  const selection = useStore($profilesSelection);
  const selCount = selection.size;
  const allVisibleSelected = profiles.length > 0 && profiles.every((p) => selection.has(p.name));
  const handleSelectAll = () => {
    if (profiles.length === 0) return;
    const next = new Set(selection);
    if (allVisibleSelected) profiles.forEach((p) => next.delete(p.name));
    else profiles.forEach((p) => next.add(p.name));
    replaceSelection($profilesSelection, next);
    announce(next.size === 0 ? m.selection_cleared() : m.selection_count({ count: next.size }), "polite");
  };
  // clear on unmount only (switch keeps membership → keeps selection)
  useEffect(() => () => { replaceSelection($profilesSelection, new Set()); }, []);
```

Render the `SelectionToolbar` inside the existing `ScreenHeader` (after the New/Import buttons), passing `selectAllTabIndex={toolbarTabIndex(2)}`, `actionTabIndex={toolbarTabIndex(3)}`, `actionLabel={m.delete_selected({ count: selCount })}`, `onAction={() => listRef.current?.requestBulkDelete()}`. The `listRef` is already `ProfileListHandle` (now with `requestBulkDelete`). Add `import { $profilesSelection } from "../../stores/profileManager"; import { replaceSelection } from "../../stores/selection"; import { SelectionToolbar } from "../common/SelectionToolbar";` and `const selection = useStore($profilesSelection);`.

- [ ] **Step 4: Run → PASS**

Run: `pnpm test src/components/profile/ProfilesPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the profiles suite + build**

Run: `pnpm test src/components/profile/ && pnpm vite:build`
Expected: green; build OK.

- [ ] **Step 6: Commit**

```bash
git add src/components/profile/ProfilesPanel.tsx src/components/profile/ProfilesPanel.test.tsx
git commit -m "feat(profiles): toolbar selection cluster (roving 2→4) + unmount lifecycle"
```

---

# Phase 3 — Schedule

### Task 18: Backend `delete_schedules` + `retain_schedules`

**Files:**
- Modify: `src-tauri/src/commands/schedule_commands.rs`
- Modify: `src-tauri/src/lib.rs` (register after `delete_schedule`, line 293)
- Modify: `src/lib/tauri.ts` (add `deleteSchedules` near `deleteSchedule`, line 335)

**Interfaces:** Produces `delete_schedules(ids: Vec<String>) -> u32` — one `retain` + one `save` + `notify_schedule_deleted` per removed id. Pure helper `retain_schedules(&mut Profile, &HashSet<String>) -> usize`. TS: `deleteSchedules(ids: string[]): Promise<number>`.

- [ ] **Step 1: Write the failing Rust test** (add to the existing tests mod)

```rust
    #[test]
    fn retain_schedules_removes_listed_and_counts() {
        let mut p = profile_with_stream();
        let a = add_schedule_impl(&mut p, valid_input()).unwrap();
        let mut second = valid_input();
        second.name = "Second".into();
        let b = add_schedule_impl(&mut p, second).unwrap();
        let ids: std::collections::HashSet<String> = [a.id.clone()].into_iter().collect();
        let removed = retain_schedules(&mut p, &ids);
        assert_eq!(removed, 1);
        assert_eq!(p.scheduled_recordings.iter().map(|s| s.id.clone()).collect::<Vec<_>>(), vec![b.id]);
    }
```

- [ ] **Step 2: Run → FAIL**

Run: `cargo test -p tapir --manifest-path src-tauri/Cargo.toml retain_schedules`
Expected: FAIL — helper not found.

- [ ] **Step 3: Implement helper + command**

```rust
/// Remove every schedule whose id is in `ids`; returns how many were removed.
/// Pure over the profile — unit-testable without Tauri state.
pub fn retain_schedules(profile: &mut Profile, ids: &std::collections::HashSet<String>) -> usize {
    let before = profile.scheduled_recordings.len();
    profile.scheduled_recordings.retain(|s| !ids.contains(&s.id));
    before - profile.scheduled_recordings.len()
}

#[tauri::command]
pub async fn delete_schedules(
    ids: Vec<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<u32, String> {
    let id_set: std::collections::HashSet<String> = ids.iter().cloned().collect();
    let (removed, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let removed = retain_schedules(&mut profile, &id_set);
        (removed, profile.clone())
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    // §3.5: stop any in-progress recording for each deleted id (nothing to record).
    for id in &ids {
        crate::scheduler::timer::notify_schedule_deleted(&app, id).await;
    }
    Ok(removed as u32)
}
```

- [ ] **Step 4: Register + wrapper**

`lib.rs` after line 293:
```rust
            commands::schedule_commands::delete_schedules,
```
`lib/tauri.ts`:
```ts
export async function deleteSchedules(ids: string[]): Promise<number> {
  return invoke("delete_schedules", { ids });
}
```

- [ ] **Step 5: Run → PASS + build**

Run: `cargo test -p tapir --manifest-path src-tauri/Cargo.toml retain_schedules && cargo build --manifest-path src-tauri/Cargo.toml`
Expected: PASS + compiles.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/schedule_commands.rs src-tauri/src/lib.rs src/lib/tauri.ts
git commit -m "feat(schedule): delete_schedules bulk command + retain_schedules helper"
```

---

### Task 19: i18n — schedule bulk keys

**Files:** `src/i18n/messages/{uk,en}.json`

**Interfaces:** Produces `m.confirm_delete_selected_schedules({count})`, `m.schedules_removed_bulk({count})`, plus zone label `m.zone_schedule_selection` if needed (reuse the toolbar zone — no new zone here).

- [ ] **Step 1: Add keys**

`uk.json`:
```json
  "confirm_delete_selected_schedules": "Видалити вибрані розклади ({count})?",
  "schedules_removed_bulk": "Видалено розкладів: {count}",
```
`en.json`:
```json
  "confirm_delete_selected_schedules": "Delete selected schedules ({count})?",
  "schedules_removed_bulk": "Schedules removed: {count}",
```

- [ ] **Step 2: Regenerate + commit**

Run: `pnpm vite:build`
```bash
git add src/i18n/messages src/i18n/paraglide
git commit -m "i18n(schedule): bulk delete confirm + summary keys"
```

---

### Task 20: Schedule store — selection atom

**Files:** Modify `src/stores/schedule.ts`

**Interfaces:** Produces `$scheduleSelection: atom<Set<string>>` (keyed by schedule id).

- [ ] **Step 1: Implement**

```ts
// add to src/stores/schedule.ts
export const $scheduleSelection = atom<Set<string>>(new Set());
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/schedule.ts
git commit -m "feat(schedule): $scheduleSelection atom"
```

---

### Task 21: ScheduleItem selected suffix + ScheduleContextMenu dynamic delete label

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx`
- Modify: `src/components/schedule/ScheduleContextMenu.tsx`
- Test: `src/components/schedule/ScheduleItem.test.tsx` (create)

**Interfaces:** `ScheduleItem` gains `isSelected: boolean` (suffix on `summaryLabel` + `selected` on row) and threads `selectionCount` to `ScheduleContextMenu`, whose delete label becomes `m.delete_selected({count})` when `selectionCount > 0`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/schedule/ScheduleItem.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { ScheduleItem } from "./ScheduleItem";
import type { ScheduleDto } from "../../lib/tauri";

const dto: ScheduleDto = {
  id: "s1", streamId: "st1", name: "Evening Jazz", type: "recurring",
  days: [0], date: null, time: "20:00", durationMinutes: 60, enabled: true,
  createdAt: "2026-01-01T00:00:00Z", lastResult: null, nextRun: "2026-06-20T20:00",
} as unknown as ScheduleDto;

it("appends the selected suffix and marks the row selected", () => {
  const { container } = render(
    <ul>
      <ScheduleItem schedule={dto} streamName="X" isActiveRow isSelected selectionCount={1}
        isFocused={(s) => s === "summary"} onToggle={vi.fn()} onAction={vi.fn()} />
    </ul>,
  );
  const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
  expect(li.getAttribute("aria-label")).toMatch(new RegExp(`${m.selection_suffix()}$`));
  expect(li.getAttribute("data-selected")).toBe("true");
});
```

- [ ] **Step 2: Run → FAIL**

Run: `pnpm test src/components/schedule/ScheduleItem.test.tsx`
Expected: FAIL — `isSelected`/`selectionCount` not accepted.

- [ ] **Step 3: Implement** — add `isSelected: boolean` + `selectionCount: number` to `ScheduleItem` Props; `const labelWithSelection = isSelected ? \`${summaryLabel}, ${m.selection_suffix()}\` : summaryLabel;`; pass `label={labelWithSelection}` + `selected={isSelected}`; forward `selectionCount` to `ScheduleContextMenu`. In `ScheduleContextMenu`, add `selectionCount: number` and set the delete `MenuItem` text to `selectionCount > 0 ? m.delete_selected({ count: selectionCount }) : m.schedule_action_delete()`.

- [ ] **Step 4: Run → PASS**

Run: `pnpm test src/components/schedule/ScheduleItem.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/ScheduleItem.tsx src/components/schedule/ScheduleContextMenu.tsx src/components/schedule/ScheduleItem.test.tsx
git commit -m "feat(schedule): selected suffix + dynamic delete label"
```

---

### Task 22: ScheduleTable selection wiring, bulk delete, Explorer routing, handle

**Files:**
- Modify: `src/components/schedule/ScheduleTable.tsx`
- Test: `src/components/schedule/ScheduleTable.test.tsx` (create)

**Interfaces:** `ScheduleTableHandle` gains `requestBulkDelete(): void` (alongside `focusSchedule`). No skip → `removedIds = selection`. Mutates `$schedules` directly, focus via `computeBulkFocusTarget`. Owns the bulk `ConfirmDialog`. Keyboard Delete & ⋯-delete route by selection (single delegated to panel `onDelete`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/schedule/ScheduleTable.test.tsx
import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act, waitFor } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $schedules, $scheduleSelection } from "../../stores/schedule";
import { $streams } from "../../stores/streams";
import { $announcer } from "../../stores/announcer";
import { replaceSelection } from "../../stores/selection";
import type { ScheduleDto } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { ScheduleTable, type ScheduleTableHandle } from "./ScheduleTable";

vi.mock("../../lib/tauri", () => ({ deleteSchedules: vi.fn().mockResolvedValue(2) }));

const dto = (id: string): ScheduleDto => ({
  id, streamId: "st1", name: id, type: "recurring", days: [0], date: null,
  time: "20:00", durationMinutes: 60, enabled: true, createdAt: "2026-01-01T00:00:00Z",
  lastResult: null, nextRun: null,
} as unknown as ScheduleDto);

beforeEach(() => {
  vi.clearAllMocks();
  $streams.set([]);
  $schedules.set([dto("a"), dto("b"), dto("c")]);
  replaceSelection($scheduleSelection, new Set());
});

it("bulk-deletes the selection, mutates the store once, and announces the count", async () => {
  replaceSelection($scheduleSelection, new Set(["b", "c"]));
  const ref = createRef<ScheduleTableHandle>();
  const { getByText } = render(
    <ScheduleTable ref={ref} exitZone={vi.fn()} onEmpty={vi.fn()} onToggle={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />,
  );
  act(() => ref.current!.requestBulkDelete());
  fireEvent.click(getByText(m.schedule_action_delete()));
  await waitFor(() => expect(tauri.deleteSchedules).toHaveBeenCalledWith(["b", "c"]));
  await waitFor(() => expect($schedules.get().map((s) => s.id)).toEqual(["a"]));
  expect($announcer.get()?.message).toBe(m.schedules_removed_bulk({ count: 2 }));
});
```

- [ ] **Step 2: Run → FAIL**

Run: `pnpm test src/components/schedule/ScheduleTable.test.tsx`
Expected: FAIL — `requestBulkDelete` missing.

- [ ] **Step 3: Implement** — mirror Task 10/16 in `ScheduleTable.tsx`:

```tsx
// new imports
import { forwardRef, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { $schedules, $scheduleSelection } from "../../stores/schedule";
import { replaceSelection } from "../../stores/selection";
import { useListSelection } from "../../hooks/useListSelection";
import { useAnnounce } from "../../hooks/useAnnounce";
import { computeBulkFocusTarget } from "../../lib/bulkFocus";
import { ConfirmDialog } from "../common/ConfirmDialog";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import type { SegmentKind } from "../../hooks/useCompositeList";
import type { ScheduleDto } from "../../lib/tauri";

export interface ScheduleTableHandle extends ZoneEntry {
  focusSchedule: (id: string) => void;
  requestBulkDelete: () => void;
}
```

```tsx
    const selectedSet = useStore($scheduleSelection);
    const announce = useAnnounce();
    const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
    const pendingBulkFocusRef = useRef<string | null>(null);
    const [bulkSeq, setBulkSeq] = useState(0);
    const focusItemRef = useRef<((id: string, segment?: SegmentKind) => void) | null>(null);

    const resolveName = useCallback((id: string) => schedules.find((s) => s.id === id)?.name ?? "", [schedules]);
    const { selectionAdapter, onSelectionChange } = useListSelection<ScheduleDto>({
      $selection: $scheduleSelection, announce, resolveName, allItems: schedules, getId: (s) => s.id,
    });

    useLayoutEffect(() => {
      const t = pendingBulkFocusRef.current;
      if (!t) return;
      pendingBulkFocusRef.current = null;
      focusItemRef.current?.(t, "summary");
    }, [items, bulkSeq]);

    const handleConfirmBulkDelete = async () => {
      const ids = [...$scheduleSelection.get()];
      if (ids.length === 0) { setBulkConfirmOpen(false); return; }
      const visible = schedules;
      const removedIds = new Set(ids); // no skip for schedule delete
      try {
        const removed = await tauri.deleteSchedules(ids);
        $schedules.set($schedules.get().filter((s) => !removedIds.has(s.id)));
        replaceSelection($scheduleSelection, new Set());
        const target = computeBulkFocusTarget(visible, removedIds);
        if (target === null) onEmpty();
        else pendingBulkFocusRef.current = target;
        setBulkSeq((n) => n + 1);
        announce(m.schedules_removed_bulk({ count: removed }), "polite");
      } catch (err) {
        addToast(String(err), "error");
      }
      setBulkConfirmOpen(false);
    };
```

Pass `selection`/`onSelectionChange`, extend `imperativeExtra` (stash `focusItemRef`, add `requestBulkDelete`), add the `delete` routing in `onAction` (Delete key: selection→bulk else `onDelete`), pass `isSelected`/`selectionCount` to `ScheduleItem`, route the ⋯-delete via `dispatch` by selection, and add the portalled bulk `ConfirmDialog` (`message={m.confirm_delete_selected_schedules({ count: selectedSet.size })}`, `confirmLabel={m.schedule_action_delete()}`). Wrap the return in a fragment.

For the ⋯-delete routing, change `dispatch`:
```tsx
    const dispatch = (id: string, action: ScheduleAction) => {
      if (action === "edit") onEdit(id);
      else if (action === "toggle") onToggle(id);
      else {
        if ($scheduleSelection.get().has(id)) setBulkConfirmOpen(true);
        else { replaceSelection($scheduleSelection, new Set([id])); onDelete(id); }
      }
    };
```
And `onAction` delete branch:
```tsx
        onAction={(type, itemId, segment) => {
          if (type === "delete") {
            if ($scheduleSelection.get().size > 0) setBulkConfirmOpen(true);
            else onDelete(itemId);
            return;
          }
          if (segment !== "summary") return;
          if (type === "primary") onEdit(itemId);
          else if (type === "toggle") onToggle(itemId);
        }}
```

- [ ] **Step 4: Run → PASS**

Run: `pnpm test src/components/schedule/ScheduleTable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/ScheduleTable.tsx src/components/schedule/ScheduleTable.test.tsx
git commit -m "feat(schedule): selection wiring + bulk delete + Delete/⋯ routing"
```

---

### Task 23: SchedulePanel toolbar cluster (roving 1→3) + lifecycle

**Files:**
- Modify: `src/components/schedule/SchedulePanel.tsx`
- Test: `src/components/schedule/SchedulePanel.test.tsx`

**Interfaces:** Toolbar roving array `[Add, SelectAll, DeleteSelected]` (indices 0–2). Select-all over `$schedules`, announces itself. Clears selection on unmount.

- [ ] **Step 1: Write the failing test** (add to `SchedulePanel.test.tsx`)

```tsx
it("renders a select-all control that selects every schedule", () => {
  // seed $schedules; render panel; click m.select_all(); assert $scheduleSelection.size === N.
});
```

- [ ] **Step 2: Run → FAIL**

Run: `pnpm test src/components/schedule/SchedulePanel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** — extend the toolbar refs `[addBtn, selectAllBtn, deleteSelectedBtn]`; add `const selection = useStore($scheduleSelection);` + `handleSelectAll` (over `$schedules`) + unmount clear; render `SelectionToolbar` inside `ScreenHeader` after the Add button with `selectAllTabIndex={toolbarTabIndex(1)}`, `actionTabIndex={toolbarTabIndex(2)}`, `actionLabel={m.delete_selected({ count: selection.size })}`, `onAction={() => tableRef.current?.requestBulkDelete()}`. Imports: `$scheduleSelection` from stores/schedule, `replaceSelection` from stores/selection, `SelectionToolbar`.

- [ ] **Step 4: Run → PASS + suite + build**

Run: `pnpm test src/components/schedule/ && pnpm vite:build`
Expected: green; build OK.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/SchedulePanel.tsx src/components/schedule/SchedulePanel.test.tsx
git commit -m "feat(schedule): toolbar selection cluster (roving 1→3) + unmount lifecycle"
```

---

# Phase 4 — Patterns (wishlist / ignorelist)

### Task 24: Backend bulk remove for wishlist + ignorelist

**Files:**
- Modify: `src-tauri/src/commands/wishlist_commands.rs`
- Modify: `src-tauri/src/lib.rs` (register after the respective single commands)
- Modify: `src/lib/tauri.ts` (wrappers near `removeFromWishlist`, line 288)

**Interfaces:** Produces `remove_from_wishlist_bulk(patterns: Vec<String>) -> u32` and `remove_from_ignorelist_bulk(patterns: Vec<String>) -> u32` — one `retain` + one `save` each. TS: `removeFromWishlistBulk(patterns: string[]): Promise<number>`, `removeFromIgnorelistBulk(patterns: string[]): Promise<number>`.

- [ ] **Step 1: Write the failing Rust test** (pure count helper)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retain_patterns_removes_listed_and_counts() {
        let mut v = vec!["*ad*".to_string(), "*jingle*".to_string(), "*promo*".to_string()];
        let ids: std::collections::HashSet<String> =
            ["*ad*".to_string(), "*promo*".to_string()].into_iter().collect();
        let removed = retain_patterns(&mut v, &ids);
        assert_eq!(removed, 2);
        assert_eq!(v, vec!["*jingle*".to_string()]);
    }
}
```

- [ ] **Step 2: Run → FAIL**

Run: `cargo test -p tapir --manifest-path src-tauri/Cargo.toml retain_patterns`
Expected: FAIL — helper not found.

- [ ] **Step 3: Implement helper + commands**

```rust
/// Remove every string equal to one in `ids`; returns how many were removed.
/// Pure over the vector — unit-testable without Tauri state.
fn retain_patterns(patterns: &mut Vec<String>, ids: &std::collections::HashSet<String>) -> usize {
    let before = patterns.len();
    patterns.retain(|p| !ids.contains(p));
    before - patterns.len()
}

#[tauri::command]
pub async fn remove_from_wishlist_bulk(
    patterns: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<u32, String> {
    let ids: std::collections::HashSet<String> = patterns.into_iter().collect();
    let (removed, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let before = profile.wishlist.len();
        profile.wishlist.retain(|e| !ids.contains(&e.pattern));
        let removed = before - profile.wishlist.len();
        (removed, profile.clone())
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(removed as u32)
}

#[tauri::command]
pub async fn remove_from_ignorelist_bulk(
    patterns: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<u32, String> {
    let ids: std::collections::HashSet<String> = patterns.into_iter().collect();
    let (removed, snapshot) = {
        let mut profile = state.active_profile.write().await;
        let removed = retain_patterns(&mut profile.ignorelist, &ids);
        (removed, profile.clone())
    };
    tokio::task::spawn_blocking(move || snapshot.save())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(removed as u32)
}
```

(The wishlist holds `WishlistEntry`, so its bulk uses an inline `retain` on `.pattern`; the ignorelist is `Vec<String>` and reuses `retain_patterns`.)

- [ ] **Step 4: Register + wrappers**

`lib.rs` after `remove_from_wishlist` (line 261) and `remove_from_ignorelist` (line 265):
```rust
            commands::wishlist_commands::remove_from_wishlist_bulk,
            commands::wishlist_commands::remove_from_ignorelist_bulk,
```
`lib/tauri.ts`:
```ts
export async function removeFromWishlistBulk(patterns: string[]): Promise<number> {
  return invoke("remove_from_wishlist_bulk", { patterns });
}
export async function removeFromIgnorelistBulk(patterns: string[]): Promise<number> {
  return invoke("remove_from_ignorelist_bulk", { patterns });
}
```

- [ ] **Step 5: Run → PASS + build**

Run: `cargo test -p tapir --manifest-path src-tauri/Cargo.toml retain_patterns && cargo build --manifest-path src-tauri/Cargo.toml`
Expected: PASS + compiles.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/wishlist_commands.rs src-tauri/src/lib.rs src/lib/tauri.ts
git commit -m "feat(patterns): bulk remove for wishlist + ignorelist (one save each)"
```

---

### Task 25: i18n — patterns bulk keys

**Files:** `src/i18n/messages/{uk,en}.json`

**Interfaces:** Produces `m.confirm_delete_selected_patterns({count})`, `m.patterns_removed_bulk({count})`, zone label reuse (controls zone exists).

- [ ] **Step 1: Add keys**

`uk.json`:
```json
  "confirm_delete_selected_patterns": "Видалити вибрані шаблони ({count})?",
  "patterns_removed_bulk": "Видалено: {count}",
```
`en.json`:
```json
  "confirm_delete_selected_patterns": "Delete selected patterns ({count})?",
  "patterns_removed_bulk": "Removed: {count}",
```

- [ ] **Step 2: Regenerate + commit**

Run: `pnpm vite:build`
```bash
git add src/i18n/messages src/i18n/paraglide
git commit -m "i18n(patterns): bulk remove confirm + summary keys"
```

---

### Task 26: Wishlist store — shared selection atom

**Files:** Modify `src/stores/wishlist.ts`

**Interfaces:** Produces `$patternSelection: atom<Set<string>>` — SHARED by both tabs (only one `TabPanel` is mounted at a time; switching the tab clears, so the shared atom never confuses wishlist vs ignorelist). Keyed by the pattern string.

- [ ] **Step 1: Implement**

```ts
import { atom } from "nanostores";
import type { WishlistEntry } from "../lib/tauri";

export const $wishlist = atom<WishlistEntry[]>([]);
export const $ignorelist = atom<string[]>([]);

/** Shared multi-select for whichever PatternList tab is mounted (milestone D). */
export const $patternSelection = atom<Set<string>>(new Set());
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/wishlist.ts
git commit -m "feat(patterns): shared $patternSelection atom"
```

---

### Task 27: PatternList selection wiring, bulk remove, handle, isSelected

**Files:**
- Modify: `src/components/wishlist/PatternList.tsx`
- Test: `src/components/wishlist/PatternList.test.tsx` (create)

**Interfaces:**
- Consumes: `useListSelection`, `computeBulkFocusTarget`, `$patternSelection`, the new `onBulkRemove` prop.
- Produces: `PatternListHandle = ZoneEntry & { requestBulkRemove(): void }`. New prop `onBulkRemove: (patterns: string[]) => Promise<number>` (the panel does backend + store update + returns count; PatternList stays list-type-agnostic and owns the summary + focus). No skip → `removedIds = selection`. Row label gains the selected suffix; `selected` on the row. Keyboard Delete & inline-✕ route by selection.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/wishlist/PatternList.test.tsx
import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act, waitFor } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $patternSelection } from "../../stores/wishlist";
import { $announcer } from "../../stores/announcer";
import { replaceSelection } from "../../stores/selection";
import { PatternList, type PatternListHandle } from "./PatternList";

beforeEach(() => replaceSelection($patternSelection, new Set()));

function renderList(onBulkRemove = vi.fn().mockResolvedValue(2)) {
  const ref = createRef<PatternListHandle>();
  const items = [{ pattern: "*ad*" }, { pattern: "*jingle*" }, { pattern: "*promo*" }];
  const utils = render(
    <PatternList ref={ref} items={items} ariaLabel="Wishlist" showDate={false}
      emptyMessage="empty" exitZone={vi.fn()} onEmpty={vi.fn()} onEdit={vi.fn()}
      onRemove={vi.fn()} onBulkRemove={onBulkRemove} />,
  );
  return { ref, onBulkRemove, items, ...utils };
}

it("requestBulkRemove confirms with the count, calls onBulkRemove, announces the summary", async () => {
  replaceSelection($patternSelection, new Set(["*ad*", "*promo*"]));
  const { ref, onBulkRemove, getByText } = renderList();
  act(() => ref.current!.requestBulkRemove());
  expect(getByText(m.confirm_delete_selected_patterns({ count: 2 }))).toBeTruthy();
  fireEvent.click(getByText(m["delete"]())); // default confirm label
  await waitFor(() => expect(onBulkRemove).toHaveBeenCalledWith(["*ad*", "*promo*"]));
  await waitFor(() => expect($announcer.get()?.message).toBe(m.patterns_removed_bulk({ count: 2 })));
});
```

- [ ] **Step 2: Run → FAIL**

Run: `pnpm test src/components/wishlist/PatternList.test.tsx`
Expected: FAIL — `PatternListHandle`/`onBulkRemove` missing.

- [ ] **Step 3: Implement PatternList changes**

```tsx
// new imports
import { forwardRef, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import { $patternSelection } from "../../stores/wishlist";
import { replaceSelection } from "../../stores/selection";
import { useListSelection } from "../../hooks/useListSelection";
import { useAnnounce } from "../../hooks/useAnnounce";
import { computeBulkFocusTarget } from "../../lib/bulkFocus";
import type { SegmentKind } from "../../hooks/useCompositeList";

export type PatternListHandle = ZoneEntry & { requestBulkRemove: () => void };

interface Props {
  items: PatternItem[];
  ariaLabel: string;
  showDate: boolean;
  emptyMessage: string;
  exitZone: (forward: boolean) => void;
  onEmpty: () => void;
  onEdit: (pattern: string) => void;
  onRemove: (pattern: string) => void;
  /** Bulk: backend + store update done by the parent; returns count removed. */
  onBulkRemove: (patterns: string[]) => Promise<number>;
}
```

Inside the component (replace the `forwardRef<ZoneEntry>` with `forwardRef<PatternListHandle>`):

```tsx
    const selectedSet = useStore($patternSelection);
    const announce = useAnnounce();
    const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
    const pendingBulkFocusRef = useRef<string | null>(null);
    const [bulkSeq, setBulkSeq] = useState(0);
    const focusItemRef = useRef<((id: string, segment?: SegmentKind) => void) | null>(null);

    const resolveName = useCallback((p: string) => p, []);
    const { selectionAdapter, onSelectionChange } = useListSelection<PatternItem>({
      $selection: $patternSelection, announce, resolveName, allItems: items, getId: (it) => it.pattern,
    });

    useLayoutEffect(() => {
      const t = pendingBulkFocusRef.current;
      if (!t) return;
      pendingBulkFocusRef.current = null;
      focusItemRef.current?.(t, "summary");
    }, [listItems, bulkSeq]);

    const handleConfirmBulkRemove = async () => {
      const patterns = [...$patternSelection.get()];
      if (patterns.length === 0) { setBulkConfirmOpen(false); return; }
      const visible = items.map((it) => ({ id: it.pattern }));
      const removedIds = new Set(patterns); // no skip
      try {
        const removed = await onBulkRemove(patterns); // parent mutates the store
        replaceSelection($patternSelection, new Set());
        const target = computeBulkFocusTarget(visible, removedIds);
        if (target === null) onEmpty();
        else pendingBulkFocusRef.current = target;
        setBulkSeq((n) => n + 1);
        announce(m.patterns_removed_bulk({ count: removed }), "polite");
      } catch (err) {
        // toast is the parent's job for onBulkRemove failures; keep the dialog closed
      }
      setBulkConfirmOpen(false);
    };
```

Pass to `CompositeList`: `selection={selectionAdapter}`, `onSelectionChange={onSelectionChange}`, and `imperativeExtra={({ focusItem }) => { focusItemRef.current = focusItem; return { requestBulkRemove: () => setBulkConfirmOpen(true) }; }}`.

`onAction` delete branch routes by selection:
```tsx
          onAction={(type, itemId, segment) => {
            if (type === "delete") {
              if ($patternSelection.get().size > 0) setBulkConfirmOpen(true);
              else setConfirmDelete(itemId); // existing single confirm
              return;
            }
            if ((type === "primary" || type === "toggle") && segment === "summary") onEdit(itemId);
          }}
```

`renderRow`: append the suffix to `label` and set `selected`; route the inline ✕ by selection:
```tsx
            const isSelected = selectedSet.has(id);
            return (
              <CompositeRow
                key={id}
                itemId={id}
                isFocused={isFocused}
                isActiveRow={isActive}
                label={isSelected ? `${id}, ${m.selection_suffix()}` : id}
                selected={isSelected}
                roleDescription={m.item_role_pattern()}
                className="border-b border-slate-800 forced-colors:border-[ButtonText]"
                activeClassName="bg-slate-800/60"
              >
                {/* ...unchanged inner markup, except the ✕ button: */}
                  <CompositeAction
                    itemId={id}
                    segment="action-delete"
                    isFocused={isFocused}
                    onClick={() => {
                      if ($patternSelection.get().has(id)) setBulkConfirmOpen(true);
                      else { replaceSelection($patternSelection, new Set([id])); setConfirmDelete(id); }
                    }}
                    label={`${m.remove_pattern()}: ${id}`}
                    className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300"
                  >
                    ✕
                  </CompositeAction>
```

Add the bulk `ConfirmDialog` alongside the existing single one:
```tsx
        {bulkConfirmOpen &&
          createPortal(
            <ConfirmDialog
              title={m.remove_pattern()}
              message={m.confirm_delete_selected_patterns({ count: selectedSet.size })}
              onConfirm={handleConfirmBulkRemove}
              onCancel={() => setBulkConfirmOpen(false)}
            />,
            document.body,
          )}
```

- [ ] **Step 4: Run → PASS**

Run: `pnpm test src/components/wishlist/PatternList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/wishlist/PatternList.tsx src/components/wishlist/PatternList.test.tsx
git commit -m "feat(patterns): selection wiring + bulk remove via onBulkRemove + ✕ routing"
```

---

### Task 28: WishlistPanel controls cluster (focus-boundary) + lifecycle + onBulkRemove

**Files:**
- Modify: `src/components/wishlist/WishlistPanel.tsx`
- Test: `src/components/wishlist/WishlistPanel.test.tsx` (create)

**Interfaces:** Adds `SelectionToolbar` to the existing `wishlist-controls` zone (focus-boundary, so NO roving `tabIndex` — buttons join the natural Tab order; boundary is stable because the buttons are always present). Types `patternListRef` as `PatternListHandle`; the cluster's action calls the LIVE `patternListRef.current?.requestBulkRemove()` (not the proxy). Provides `onBulkRemove` bound to the active tab (wishlist vs ignorelist). Clears selection on tab change and unmount. `refreshBoundary` already runs on tab change.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/wishlist/WishlistPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $wishlist, $ignorelist, $patternSelection } from "../../stores/wishlist";
import { replaceSelection } from "../../stores/selection";
import * as tauri from "../../lib/tauri";
import { WishlistPanel } from "./WishlistPanel";

vi.mock("../../lib/tauri", () => ({
  getWishlist: vi.fn().mockResolvedValue([{ pattern: "*ad*", addedAt: "2026-01-01T00:00:00Z" }]),
  getIgnorelist: vi.fn().mockResolvedValue([]),
  removeFromWishlistBulk: vi.fn().mockResolvedValue(1),
  removeFromIgnorelistBulk: vi.fn().mockResolvedValue(0),
}));

beforeEach(() => {
  $wishlist.set([{ pattern: "*ad*", addedAt: "2026-01-01T00:00:00Z" }]);
  $ignorelist.set([]);
  replaceSelection($patternSelection, new Set());
});

it("routes the cluster delete to the wishlist bulk command for the active tab", async () => {
  const { getByText } = render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
  await waitFor(() => getByText(m.select_all()));
  fireEvent.click(getByText(m.select_all()));
  expect($patternSelection.get().size).toBe(1);
  fireEvent.click(getByText(m.delete_selected({ count: 1 })));
  fireEvent.click(getByText(m["delete"]())); // confirm
  await waitFor(() => expect(tauri.removeFromWishlistBulk).toHaveBeenCalledWith(["*ad*"]));
});

it("clears the selection when the tab changes", async () => {
  const { getByText } = render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
  await waitFor(() => getByText(m.select_all()));
  replaceSelection($patternSelection, new Set(["*ad*"]));
  fireEvent.click(getByText(m.ignorelist_section_title()));
  await waitFor(() => expect($patternSelection.get().size).toBe(0));
});
```

- [ ] **Step 2: Run → FAIL**

Run: `pnpm test src/components/wishlist/WishlistPanel.test.tsx`
Expected: FAIL — no select-all; selection not cleared on tab change.

- [ ] **Step 3: Implement WishlistPanel changes**

```tsx
// new imports
import { useStore } from "@nanostores/react";
import { SelectionToolbar } from "../common/SelectionToolbar";
import { $wishlist, $ignorelist, $patternSelection } from "../../stores/wishlist";
import { replaceSelection } from "../../stores/selection";
import { PatternList, type PatternListHandle } from "./PatternList";
```

```tsx
  const selection = useStore($patternSelection);
  const selCount = selection.size;
  const activeItems = activeTab === "wishlist" ? wishlistItems : ignorelistItems;
  const visibleIds = useMemo(() => activeItems.map((it) => it.pattern), [activeItems]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));

  const selectAllBtnRef = useRef<HTMLButtonElement | null>(null);
  const deleteSelectedBtnRef = useRef<HTMLButtonElement | null>(null);

  const handleSelectAll = () => {
    if (visibleIds.length === 0) return;
    const next = new Set(selection);
    if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    replaceSelection($patternSelection, next);
    announce(next.size === 0 ? m.selection_cleared() : m.selection_count({ count: next.size }), "polite");
  };

  // Bulk-remove bound to the active tab: backend + store update; return count.
  const handleBulkRemove = useCallback(
    async (patterns: string[]): Promise<number> => {
      const drop = new Set(patterns);
      if (activeTab === "wishlist") {
        const n = await tauri.removeFromWishlistBulk(patterns);
        $wishlist.set($wishlist.get().filter((e) => !drop.has(e.pattern)));
        return n;
      }
      const n = await tauri.removeFromIgnorelistBulk(patterns);
      $ignorelist.set($ignorelist.get().filter((p) => !drop.has(p)));
      return n;
    },
    [activeTab],
  );

  // Lifecycle: clear on tab change and on unmount.
  useEffect(() => { replaceSelection($patternSelection, new Set()); }, [activeTab]);
  useEffect(() => () => { replaceSelection($patternSelection, new Set()); }, []);
```

Type the ref: `const patternListRef = useRef<PatternListHandle | null>(null);` and update the callback ref to store the `PatternListHandle`. Add the cluster into the controls `ScreenZone` after the Add button (NO `tabIndex` props → natural tab order):

```tsx
          <SelectionToolbar
            selCount={selCount}
            visibleCount={visibleIds.length}
            allVisibleSelected={allVisibleSelected}
            selectAllRef={selectAllBtnRef}
            actionRef={deleteSelectedBtnRef}
            actionLabel={m.delete_selected({ count: selCount })}
            onSelectAll={handleSelectAll}
            onAction={() => patternListRef.current?.requestBulkRemove()}
          />
```

Pass `onBulkRemove={handleBulkRemove}` to BOTH `<PatternList>` instances. After adding the always-present cluster buttons, call `refreshBoundary()` in the existing `useEffect([activeTab, refreshBoundary])` (already present) so the boundary re-discovers the now-larger tabbable set.

- [ ] **Step 4: Run → PASS + suite + build**

Run: `pnpm test src/components/wishlist/ && pnpm vite:build`
Expected: green; build OK.

- [ ] **Step 5: Commit**

```bash
git add src/components/wishlist/WishlistPanel.tsx src/components/wishlist/WishlistPanel.test.tsx
git commit -m "feat(patterns): controls selection cluster + tab/unmount lifecycle + onBulkRemove"
```

---

# Phase 5 — Browser

### Task 29: Backend `add_stations_from_browser`

**Files:**
- Modify: `src-tauri/src/commands/browser_commands.rs`
- Modify: `src-tauri/src/lib.rs` (register after `add_station_from_browser`, line 269)
- Modify: `src/lib/tauri.ts` (wrapper near `addStationFromBrowser`, line 422)

**Interfaces:** Produces `add_stations_from_browser(stations: Vec<StationResult>) -> Vec<StreamInfo>` via the existing `append_streams_to_active_profile` (one save + emits `streams-changed`, dedups by url against the profile AND within the batch). Returned = actually added; skipped = `stations.len() - added.len()` (reason: duplicates — already-in-profile OR repeated-in-selection). TS: `addStationsFromBrowser(stations: StationResult[]): Promise<StreamInfo[]>`.

- [ ] **Step 1: Write the failing Rust test** (reuse the existing dedup coverage; add a batch-mapping test)

```rust
    #[test]
    fn batch_maps_stations_and_dedups_within_selection() {
        // station_to_stream_info is already covered; assert the batch builder dedups
        // two stations that resolve to the same url down to one StreamInfo.
        let a = mk_station("A", "https://same", "MP3", 128);
        let b = mk_station("B", "https://same", "MP3", 128);
        let built: Vec<StreamInfo> = [&a, &b].iter().map(|s| station_to_stream_info(s)).collect();
        let added = dedup_new_streams(&[], built);
        assert_eq!(added.len(), 1);
    }
```

- [ ] **Step 2: Run → FAIL**

Run: `cargo test -p tapir --manifest-path src-tauri/Cargo.toml batch_maps_stations`
Expected: FAIL — test not present yet (drives adding the command + confirms the dedup contract).

- [ ] **Step 3: Implement the command**

```rust
/// Bulk variant of `add_station_from_browser`: build a StreamInfo per station and
/// append in ONE save+emit via the shared helper (dedups by url, both against the
/// profile and within the batch). Returns the streams actually added; the
/// frontend computes skipped = requested − added. Unlike the single command this
/// returns the (possibly empty) added list instead of erroring on duplicates.
#[tauri::command]
pub async fn add_stations_from_browser(
    stations: Vec<StationResult>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<StreamInfo>, String> {
    let streams: Vec<StreamInfo> = stations.iter().map(station_to_stream_info).collect();
    append_streams_to_active_profile(state.inner(), &app, streams).await
}
```

- [ ] **Step 4: Register + wrapper**

`lib.rs` after line 269:
```rust
            commands::browser_commands::add_stations_from_browser,
```
`lib/tauri.ts`:
```ts
export async function addStationsFromBrowser(stations: StationResult[]): Promise<StreamInfo[]> {
  return invoke("add_stations_from_browser", { stations });
}
```

- [ ] **Step 5: Run → PASS + build**

Run: `cargo test -p tapir --manifest-path src-tauri/Cargo.toml batch_maps_stations dedup_ && cargo build --manifest-path src-tauri/Cargo.toml`
Expected: PASS + compiles.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/browser_commands.rs src-tauri/src/lib.rs src/lib/tauri.ts
git commit -m "feat(browser): add_stations_from_browser bulk command (one save+emit, dedup)"
```

---

### Task 30: i18n — browser bulk keys

**Files:** `src/i18n/messages/{uk,en}.json`

**Interfaces:** Produces `m.stations_added_bulk({count})`, `m.stations_skipped_duplicate({count})`, zone label `m.zone_browser_selection`.

- [ ] **Step 1: Add keys**

`uk.json`:
```json
  "stations_added_bulk": "Додано {count}",
  "stations_skipped_duplicate": "пропущено {count} (дублікати)",
  "zone_browser_selection": "Дії з вибраними станціями",
```
`en.json`:
```json
  "stations_added_bulk": "Added {count}",
  "stations_skipped_duplicate": "{count} skipped (duplicates)",
  "zone_browser_selection": "Selected stations actions",
```

- [ ] **Step 2: Regenerate + commit**

Run: `pnpm vite:build`
```bash
git add src/i18n/messages src/i18n/paraglide
git commit -m "i18n(browser): bulk add summary + selection zone label"
```

---

### Task 31: Browser store — selection atom + bulk add + clear triggers

**Files:**
- Modify: `src/stores/browser.ts`
- Test: `src/stores/browser.test.ts` (create)

**Interfaces:** Produces `$stationSelection: atom<Set<string>>` (keyed by `stationuuid`), `addStations(stations: StationResult[]): Promise<StreamResult[]>` thin wrapper (does NOT touch `$streams` — backend emits `streams-changed`). New-search entry points (`updateSearchParam`, `resetSearch`) clear `$stationSelection`; `loadMore` (offset > 0) does NOT.

- [ ] **Step 1: Write the failing test**

```ts
// src/stores/browser.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { $stationSelection, updateSearchParam, resetSearch, loadMore } from "./browser";
import { replaceSelection } from "./selection";

beforeEach(() => replaceSelection($stationSelection, new Set(["u1", "u2"])));

describe("browser selection lifecycle", () => {
  it("clears the selection when a new search param is set", () => {
    updateSearchParam("query", "jazz");
    expect($stationSelection.get().size).toBe(0);
  });

  it("clears the selection on resetSearch", () => {
    resetSearch();
    expect($stationSelection.get().size).toBe(0);
  });

  it("keeps the selection across load-more pagination", async () => {
    // loadMore awaits searchStations; mock invoke is not wired here, so just assert
    // the selection is untouched synchronously before the network call resolves.
    void loadMore().catch(() => {});
    expect($stationSelection.get().size).toBe(2);
  });
});
```

(If `loadMore` throws synchronously in the test env because `invoke` is unmocked, wrap the call in try/catch as shown; the assertion is about the selection NOT being cleared by the new-search path.)

- [ ] **Step 2: Run → FAIL**

Run: `pnpm test src/stores/browser.test.ts`
Expected: FAIL — `$stationSelection` not exported; `updateSearchParam` doesn't clear.

- [ ] **Step 3: Implement**

```ts
// add near the top of src/stores/browser.ts
import { atom, computed } from "nanostores";
import { replaceSelection } from "./selection";
// ...

/** Multi-select for browser results (milestone D). Keyed by stationuuid. */
export const $stationSelection = atom<Set<string>>(new Set());
```

Make the new-search entry points clear the selection:

```ts
export function updateSearchParam<K extends keyof SearchParams>(key: K, value: SearchParams[K]): void {
  $searchParams.set({ ...$searchParams.get(), [key]: value, offset: 0 });
  replaceSelection($stationSelection, new Set()); // new result set → drop selection
}

export function resetSearch(): void {
  $searchParams.set({ limit: 50, order: "clickcount" });
  $searchResults.set([]);
  $hasMore.set(false);
  $searchError.set(null);
  replaceSelection($stationSelection, new Set());
}
```

Add the bulk wrapper (does NOT touch `$streams`; the existing single `addStation` stays):

```ts
import { addStationsFromBrowser } from "../lib/tauri";
// ...
/** Bulk add: backend appends in one save+emit (streams-changed reloads $streams). */
export async function addStations(stations: StationResult[]): Promise<StreamInfo[]> {
  return addStationsFromBrowser(stations);
}
```

(`StreamInfo` import: add to the existing `import type { ... } from "../lib/tauri";` line.) `loadMore` is left untouched (offset > 0 → keeps selection).

- [ ] **Step 4: Run → PASS**

Run: `pnpm test src/stores/browser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/browser.ts src/stores/browser.test.ts
git commit -m "feat(browser): $stationSelection atom + addStations + new-search clear triggers"
```

---

### Task 32: StationItem selected suffix

**Files:**
- Modify: `src/components/browser/StationItem.tsx`
- Test: `src/components/browser/StationItem.test.tsx`

**Interfaces:** `StationItem` gains `isSelected: boolean`; the suffix is appended to `summaryLabel` (after any previewing/offline clause) and `selected={isSelected}` set on the row.

- [ ] **Step 1: Write the failing test** (add to `StationItem.test.tsx`)

```tsx
it("appends the selected suffix and marks the row selected", () => {
  const { container } = renderItem({ isSelected: true }); // extend renderItem props with isSelected default false
  const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
  expect(li.getAttribute("aria-label")).toMatch(new RegExp(`${m.selection_suffix()}$`));
  expect(li.getAttribute("data-selected")).toBe("true");
});
```

(Import `* as m` and add `isSelected: false` to the `renderItem` defaults.)

- [ ] **Step 2: Run → FAIL**

Run: `pnpm test src/components/browser/StationItem.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** — add `isSelected: boolean` to `StationItemProps`; compute `const labelWithSelection = isSelected ? \`${summaryLabel}, ${m.selection_suffix()}\` : summaryLabel;`; pass `label={labelWithSelection}` and `selected={isSelected}` to `CompositeRow`.

- [ ] **Step 4: Run → PASS**

Run: `pnpm test src/components/browser/StationItem.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/browser/StationItem.tsx src/components/browser/StationItem.test.tsx
git commit -m "feat(browser): selected suffix on station rows"
```

---

### Task 33: StationList selection wiring + bulk add (no focus move) + handle

**Files:**
- Modify: `src/components/browser/StationList.tsx`
- Test: `src/components/browser/StationList.test.tsx`

**Interfaces:**
- Consumes: `useListSelection`, `addStations`, `$stationSelection`.
- Produces: `StationListHandle = ZoneEntry & { requestBulkAdd(): void }`. Bulk add maps selected `stationuuid`s → `StationResult[]` → `addStations`; skipped = `selected − added.length`; summary `m.stations_added_bulk` + optional `m.stations_skipped_duplicate`. Focus does NOT move (rows stay; `streams-changed` re-marks them `isAdded`). On `added.length > 0` clear the selection; on a full skip (`added.length === 0`) leave it. The simple-click-collapses default stays; Enter/Add stay single.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/browser/StationList.test.tsx (extend or create)
import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $streams } from "../../stores/streams";
import { $stationSelection } from "../../stores/browser";
import { $announcer } from "../../stores/announcer";
import { replaceSelection } from "../../stores/selection";
import type { StationResult } from "../../lib/tauri";
import * as browserStore from "../../stores/browser";
import { StationList, type StationListHandle } from "./StationList";

const mk = (uuid: string): StationResult => ({
  stationuuid: uuid, name: uuid, url: `http://${uuid}`, urlResolved: `http://${uuid}`,
  codec: "MP3", bitrate: 128, country: "", countrycode: "", tags: "", language: "",
  votes: 0, clickcount: 0, hasExtendedInfo: null, homepage: "", lastcheckok: 1,
});

beforeEach(() => {
  $streams.set([]);
  replaceSelection($stationSelection, new Set());
});

it("bulk-adds the selection, announces the summary, and does NOT move focus", async () => {
  const addSpy = vi.spyOn(browserStore, "addStations").mockResolvedValue([{} as never]); // 1 added
  const stations = [mk("u1"), mk("u2")];
  replaceSelection($stationSelection, new Set(["u1", "u2"]));
  const ref = createRef<StationListHandle>();
  render(<StationList ref={ref} stations={stations} loading={false} error={null} hasMore={false}
    emptyMessage="empty" exitZone={vi.fn()} />);
  const before = document.activeElement;
  await act(async () => { ref.current!.requestBulkAdd(); });
  await waitFor(() => expect(addSpy).toHaveBeenCalled());
  await waitFor(() =>
    expect($announcer.get()?.message).toBe(
      `${m.stations_added_bulk({ count: 1 })}, ${m.stations_skipped_duplicate({ count: 1 })}`,
    ),
  );
  expect(document.activeElement).toBe(before); // focus untouched
});
```

- [ ] **Step 2: Run → FAIL**

Run: `pnpm test src/components/browser/StationList.test.tsx`
Expected: FAIL — `StationListHandle`/`requestBulkAdd` missing.

- [ ] **Step 3: Implement StationList changes**

```tsx
// new/changed imports
import { forwardRef, useCallback, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { $streams } from "../../stores/streams";
import { addStation, addStations, $stationSelection } from "../../stores/browser";
import { replaceSelection } from "../../stores/selection";
import { useListSelection } from "../../hooks/useListSelection";
import type { StationResult } from "../../lib/tauri";

export type StationListHandle = ZoneEntry & { requestBulkAdd: () => void };
```

Change `forwardRef<ZoneEntry, Props>` to `forwardRef<StationListHandle, Props>` and pass an `imperativeExtra` to `CompositeList` (it must be typed `CompositeList<StationListHandle>`):

```tsx
    const selectedSet = useStore($stationSelection);
    const resolveName = useCallback(
      (id: string) => stations.find((s) => s.stationuuid === id)?.name ?? "",
      [stations],
    );
    const { selectionAdapter, onSelectionChange } = useListSelection<StationResult>({
      $selection: $stationSelection, announce, resolveName, allItems: stations, getId: (s) => s.stationuuid,
    });

    const handleBulkAdd = useCallback(async () => {
      const ids = $stationSelection.get();
      if (ids.size === 0) return;
      const selected = stations.filter((s) => ids.has(s.stationuuid));
      try {
        const added = await addStations(selected); // does NOT touch $streams (event reloads)
        const skipped = selected.length - added.length;
        if (added.length > 0) replaceSelection($stationSelection, new Set()); // full skip keeps selection
        const parts = [m.stations_added_bulk({ count: added.length })];
        if (skipped > 0) parts.push(m.stations_skipped_duplicate({ count: skipped }));
        announce(parts.join(", "), "polite"); // focus deliberately NOT moved
      } catch (err) {
        addToast(String(err), "error");
      }
    }, [stations, announce]);
```

On the `CompositeList`: add `selection={selectionAdapter}`, `onSelectionChange={onSelectionChange}`, `imperativeExtra={() => ({ requestBulkAdd: handleBulkAdd })}`, and pass `isSelected={selectedSet.has(id)}` to `<StationItem>`. The existing `onAction` (Enter adds single, Shift+Enter previews) is unchanged.

- [ ] **Step 4: Run → PASS**

Run: `pnpm test src/components/browser/StationList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/browser/StationList.tsx src/components/browser/StationList.test.tsx
git commit -m "feat(browser): selection wiring + bulk add (no focus move) + handle"
```

---

### Task 34: BrowserPanel header cluster zone + useAnnounce + lifecycle

**Files:**
- Modify: `src/components/browser/BrowserPanel.tsx`
- Test: `src/components/browser/BrowserPanel.test.tsx` (create)

**Interfaces:** New `browser-selection` roving zone in the header (two stops: select-all + add-selected), registered FIRST in `[selection, search, results]`. Adds `useAnnounce` to the panel (select-all announces itself, A7). Types the results ref as `StationListHandle`; the action calls the live ref's `requestBulkAdd()`. Selection clears on unmount (new-search/reset already clear via the store from Task 31).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/browser/BrowserPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $popularStations, $stationSelection } from "../../stores/browser";
import { $announcer } from "../../stores/announcer";
import { replaceSelection } from "../../stores/selection";
import type { StationResult } from "../../lib/tauri";
import { BrowserPanel } from "./BrowserPanel";

vi.mock("../../lib/tauri", () => ({
  getBrowserFilters: vi.fn().mockResolvedValue({ countries: [], languages: [], codecs: [] }),
  searchStationsIpc: vi.fn().mockResolvedValue([]),
  addStationsFromBrowser: vi.fn().mockResolvedValue([]),
}));

const mk = (uuid: string): StationResult => ({
  stationuuid: uuid, name: uuid, url: `http://${uuid}`, urlResolved: `http://${uuid}`,
  codec: "MP3", bitrate: 128, country: "", countrycode: "", tags: "", language: "",
  votes: 0, clickcount: 0, hasExtendedInfo: null, homepage: "", lastcheckok: 1,
});

beforeEach(() => {
  $popularStations.set([mk("u1"), mk("u2")]);
  replaceSelection($stationSelection, new Set());
});

it("select-all selects all visible stations and announces the count", async () => {
  const { getByText } = render(<BrowserPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
  await waitFor(() => getByText(m.select_all()));
  fireEvent.click(getByText(m.select_all()));
  expect($stationSelection.get().size).toBe(2);
  expect($announcer.get()?.message).toBe(m.selection_count({ count: 2 }));
});
```

- [ ] **Step 2: Run → FAIL**

Run: `pnpm test src/components/browser/BrowserPanel.test.tsx`
Expected: FAIL — no select-all.

- [ ] **Step 3: Implement BrowserPanel changes**

```tsx
// new imports
import { useStore } from "@nanostores/react";
import { ScreenZone } from "../layout/ScreenZone";
import { SelectionToolbar } from "../common/SelectionToolbar";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { useAnnounce } from "../../hooks/useAnnounce";
import { $stationSelection } from "../../stores/browser";
import { replaceSelection } from "../../stores/selection";
import { StationList, type StationListHandle } from "./StationList";
import * as m from "../../i18n/paraglide/messages";
```

```tsx
  const announce = useAnnounce();
  const selection = useStore($stationSelection);
  const selCount = selection.size;
  const visibleIds = useMemo(() => stations.map((s) => s.stationuuid), [stations]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));

  // selection zone (two roving stops)
  const selectionZoneRef = useRef<HTMLDivElement | null>(null);
  const selectAllBtn = useRef<HTMLButtonElement | null>(null);
  const addSelectedBtn = useRef<HTMLButtonElement | null>(null);
  const selectionRefs = useMemo(() => [selectAllBtn, addSelectedBtn], []);
  const {
    onKeyDown: selKeyDown,
    getTabIndex: selTabIndex,
    restoreFocus: selRestore,
  } = useRovingFocus(selectionRefs, "horizontal", {
    mode: "mixed-boundary-handoff",
    onTabBoundary: (forward) => exitZone("browser-selection", forward),
  });

  const handleSelectAll = () => {
    if (visibleIds.length === 0) return;
    const next = new Set(selection);
    if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    replaceSelection($stationSelection, next);
    announce(next.size === 0 ? m.selection_cleared() : m.selection_count({ count: next.size }), "polite");
  };

  // clear on unmount (new-search/reset already clear via the store)
  useEffect(() => () => { replaceSelection($stationSelection, new Set()); }, []);
```

Type the results ref provider as `StationListHandle` (the callback ref stores `StationListHandle | null`; the proxy stays `ZoneEntry`). Register the selection zone first:

```tsx
  useEffect(() => {
    const zones: ZoneEntry[] = [{
      id: "browser-selection",
      get el() { return selectionZoneRef.current!; },
      focus: selRestore,
    }];
    if (searchZoneRef.current) zones.push(searchZoneRef.current);
    if (resultsListRef.current) zones.push(resultsProxyRef.current);
    onZonesChange(zones);
  }, [onZonesChange, showSearchResults, stations.length, selRestore]);
```

Header markup (replace `<ScreenHeader title={m.browser_section()} />`):

```tsx
      <ScreenZone
        ref={selectionZoneRef}
        id="browser-selection"
        role="application"
        label={m.zone_browser_selection()}
        onKeyDown={selKeyDown}
      >
        <ScreenHeader title={m.browser_section()}>
          <SelectionToolbar
            selCount={selCount}
            visibleCount={visibleIds.length}
            allVisibleSelected={allVisibleSelected}
            selectAllRef={selectAllBtn}
            actionRef={addSelectedBtn}
            selectAllTabIndex={selTabIndex(0)}
            actionTabIndex={selTabIndex(1)}
            actionLabel={m.add_selected({ count: selCount })}
            onSelectAll={handleSelectAll}
            onAction={() => resultsListRef.current?.requestBulkAdd()}
          />
        </ScreenHeader>
      </ScreenZone>
```

(`resultsListRef.current` is the live `StationListHandle`; `resultsProxyRef` is only for zone registration.)

- [ ] **Step 4: Run → PASS + suite + build**

Run: `pnpm test src/components/browser/ && pnpm vite:build`
Expected: green; build OK.

- [ ] **Step 5: Commit**

```bash
git add src/components/browser/BrowserPanel.tsx src/components/browser/BrowserPanel.test.tsx
git commit -m "feat(browser): header selection cluster zone + useAnnounce + unmount lifecycle"
```

---

# Phase 6 — Documentation & final gate

### Task 35: Docs + umbrella update + full gate

**Files:**
- Modify: `docs/keyboard-shortcuts.md`
- Modify: `docs/backlog/p1-bulk-stream-operations.md` (umbrella — mark D readiness criteria after the manual NVDA pass)

**Interfaces:** None (docs + verification only).

- [ ] **Step 1: Update keyboard-shortcuts.md** — note that list-scoped selection (Ctrl+Space / Shift+↑↓ / Ctrl+A / Escape / Delete-bulk) now applies to ALL composite lists (songs, profiles, schedule, wishlist/ignorelist, browser), not just streams. Add the per-list bulk action (delete for songs/profiles/schedule/patterns; add-selected for browser) under the relevant section.

- [ ] **Step 2: Run the full gate**

Run:
```bash
pnpm test
pnpm vite:build
cargo test --manifest-path src-tauri/Cargo.toml
```
Expected: all three green. If `pnpm test` shows broad spurious failures on the first run after idle, re-run once (cold transform-cache flake) before diagnosing.

- [ ] **Step 3: Manual NVDA pass (record the result in the umbrella)** — for EACH of the five lists: select (Ctrl+Space / Shift / Ctrl+A) → hear the suffix + "Виділено N" → trigger the bulk action (Delete / toolbar) → confirm → focus lands on a surviving row (never `<body>`) + hear the summary. For browser: add-selected → focus stays put → hear "Додано N, пропущено M (дублікати)".

- [ ] **Step 4: Mark the umbrella's D criteria closed** in `docs/backlog/p1-bulk-stream-operations.md` once the NVDA pass is clean.

- [ ] **Step 5: Commit**

```bash
git add docs/keyboard-shortcuts.md docs/backlog/p1-bulk-stream-operations.md
git commit -m "docs(bulk-D): keyboard-shortcuts + umbrella criteria closed for milestone D"
```

---

## Self-Review

**Spec coverage (D1–D8, file list, acceptance criteria):**
- **D1 shared infra** → Tasks 1 (`selection.ts`), 2 (`bulkFocus.ts`), 4 (`useListSelection.ts`), 5 (`SelectionToolbar.tsx`); streams migration in Task 1.
- **D2 per-list atoms / shared pattern atom** → Tasks 8, 14, 20, 26 (shared), 31.
- **D3 ARIA/NVDA suffix per Item** → Tasks 9, 15, 21, 27 (PatternList row), 32.
- **D4 Explorer routing per-list** (incl. the songs Delete-gap) → Tasks 10, 16, 22, 27; browser has no Delete (Task 33 leaves Enter/Add single).
- **D5 lifecycle clearing** → Task 11 (songs filter/unmount), 17 (profiles unmount-only, switch preserves), 23 (schedule unmount), 28 (patterns tab/unmount), 31+34 (browser new-search via store + unmount).
- **D6 backend bulk commands** → Tasks 6, 12, 18, 24, 29 (each: command + register + wrapper + pure helper test).
- **D7 toolbar clusters** → new zones Tasks 11 (songs), 34 (browser); extended roving Tasks 17 (profiles 2→4), 23 (schedule 1→3); focus-boundary Task 28 (wishlist, no roving tabIndex).
- **D8 bulk orchestration + focus** → Tasks 10, 16, 22, 27 use `computeBulkFocusTarget`; full-skip no-op guarded in each (`removedIds.size > 0`); browser (Task 33) does not move focus.
- **i18n** rename + generic keys (Task 3) + per-list keys (Tasks 7, 13, 19, 25, 30).
- **Acceptance criteria 1–8** map to: per-list List/Item/Panel tests (criteria 1–3, 7), partial-success summaries (criterion 4 — Tasks 10/16/33), focus tests (criterion 5 — Task 2 + per-list), lifecycle tests (criterion 6 — Tasks 11/28/31), and the Task 35 gate + NVDA pass (criterion 8).

**Placeholder scan:** Item-suffix, ⋯-label, and panel-cluster steps that recur across lists give full code each time (no "similar to Task N"). A few large unchanged-markup regions in existing files are referenced as "unchanged inner markup" with the exact changed lines shown — acceptable because the engineer edits the named existing file in place rather than recreating it.

**Type consistency:** `replaceSelection`/`pruneSelection` are 2-arg `(atom, …)` everywhere after Task 1 (streams keeps 1-arg wrappers internally). `computeBulkFocusTarget(visibleItems: {id}[], removedIds: ReadonlySet<string>)` is called uniformly (profiles map `name`→`{id}`). Handle names are stable: `SongsListHandle.requestBulkDelete`, `ProfileListHandle.requestBulkDelete` (+ `focusProfile`), `ScheduleTableHandle.requestBulkDelete` (+ `focusSchedule`), `PatternListHandle.requestBulkRemove`, `StationListHandle.requestBulkAdd`. `useListSelection` signature `{ $selection, announce, resolveName, allItems, getId }` is identical at all five call sites. New i18n keys are referenced exactly as declared.

**Note for the executor:** Before writing the per-store test fixtures (Tasks 8, 21, 22), read the real `src/types/song.ts` and the `ScheduleDto`/`StationResult` shapes in `src/lib/tauri.ts` and adjust the literal fixtures to the actual field names — the shapes shown here are representative.
