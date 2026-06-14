# Streams List Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "By name / By date added" sort toggle to the streams screen toolbar, with the choice persisted in `GlobalSettings` (default "name").

**Architecture:** Sorting is a pure frontend display concern computed in `StreamsPanel` over the already-filtered list (backend `Vec` stays insertion-order). The chosen mode lives in `GlobalSettings.sortBy` (Rust + TS), written via the existing `$settings.set` + `tauri.saveSettings` pattern. The toolbar gets two `aria-pressed` toggle buttons mirroring the filter chips, extending roving-focus from 8 to 10 items.

**Tech Stack:** Rust (serde), React + nanostores, react-aria roving focus, paraglide i18n, Vitest, `Intl.Collator`.

**Spec:** [docs/superpowers/specs/2026-06-14-streams-sort-design.md](../specs/2026-06-14-streams-sort-design.md)

**Gates (per repo convention):** `pnpm test` + `pnpm vite:build`. NOT `tsc` (≈51 pre-existing untyped-paraglide errors). Rust: `cargo test`.

---

## Task 1: Rust — `sortBy` field in `GlobalSettings`

**Files:**
- Modify: `src-tauri/src/settings.rs` (struct ~13-52, `default_*` fns ~160-171, `Default` impl ~173-197, tests mod ~224-385)

- [ ] **Step 1: Write the failing tests**

Add inside `mod tests` in `src-tauri/src/settings.rs` (after the `smtc_enabled` tests, before the closing `}`):

```rust
    #[test]
    fn sort_by_defaults_to_name() {
        assert_eq!(GlobalSettings::default().sort_by, "name");
    }

    #[test]
    fn legacy_config_without_sort_by_defaults_to_name() {
        // A settings.json written before this field existed must still load.
        let json = r#"{"language":"en-US","theme":"auto","activeProfile":"Default"}"#;
        let s: GlobalSettings = serde_json::from_str(json).unwrap();
        assert_eq!(s.sort_by, "name");
    }

    #[test]
    fn sort_by_round_trips() {
        let mut s = GlobalSettings::default();
        s.sort_by = "added".to_string();
        let json = serde_json::to_string(&s).unwrap();
        let back: GlobalSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.sort_by, "added");
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml sort_by`
Expected: FAIL — `no field 'sort_by' on type 'GlobalSettings'` (compile error).

- [ ] **Step 3: Add the field, default fn, and Default entry**

In the `GlobalSettings` struct, add as the last field (after `smtc_enabled`):

```rust
    #[serde(default = "default_sort_by")]
    pub sort_by: String,
```

Next to the other `default_*` fns (e.g. after `default_volume_step_percent`):

```rust
fn default_sort_by() -> String { "name".to_string() }
```

In `impl Default for GlobalSettings`, add as the last field initializer (after `smtc_enabled: true,`):

```rust
            sort_by: "name".to_string(),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml sort_by`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/settings.rs
git commit -m "feat(settings): add sortBy field to GlobalSettings (default name)"
```

---

## Task 2: TS type + test fixtures

**Files:**
- Modify: `src/lib/tauri.ts` (`GlobalSettings` interface ~73-90)
- Modify: `src/stores/streams.ts` (add `StreamSort` type)
- Modify (fixtures, add `sortBy: "name",`): `src/components/streams/StreamList.test.tsx`, `src/components/settings/AudioTab.test.tsx`, `src/components/settings/HotkeysTab.test.tsx`, `src/lib/transportControl.test.ts`, `src/components/player/PlayerPanel.test.tsx`

- [ ] **Step 1: Add `sortBy` to the `GlobalSettings` TS interface**

In `src/lib/tauri.ts`, inside `interface GlobalSettings`, add after `doubleClickAction`:

```ts
  sortBy: "name" | "added";
```

- [ ] **Step 2: Add the `StreamSort` UI type**

In `src/stores/streams.ts`, after the `StreamFilter` type/atom block, add:

```ts
export type StreamSort = "name" | "added";
```

- [ ] **Step 3: Update test fixtures**

In each of these files, find the object literal that builds a `GlobalSettings` (it contains `doubleClickAction:`) and add `sortBy: "name",` to it:
- `src/components/streams/StreamList.test.tsx`
- `src/components/settings/AudioTab.test.tsx`
- `src/components/settings/HotkeysTab.test.tsx`
- `src/lib/transportControl.test.ts`
- `src/components/player/PlayerPanel.test.tsx`

Example (StreamList.test.tsx — add the field onto the existing `doubleClickAction` line group):

```ts
  diskSpaceThresholdGb: 0, doubleClickAction: "record", bandwidthLimitKbps: 0, sortBy: "name",
```

- [ ] **Step 4: Run the full test suite to verify nothing broke**

Run: `pnpm test`
Expected: PASS (same as before — no behavior changed yet).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tauri.ts src/stores/streams.ts src/components/streams/StreamList.test.tsx src/components/settings/AudioTab.test.tsx src/components/settings/HotkeysTab.test.tsx src/lib/transportControl.test.ts src/components/player/PlayerPanel.test.tsx
git commit -m "feat(settings): mirror sortBy in TS GlobalSettings + StreamSort type"
```

---

## Task 3: i18n messages

**Files:**
- Modify: `src/i18n/messages/uk.json` (~365, near `streams_filter_*`)
- Modify: `src/i18n/messages/en.json` (~365, near `streams_filter_*`)

> Generated `m.*` functions are produced by the paraglide vite plugin on the next `pnpm test` / `pnpm vite:build` — do NOT hand-edit `src/i18n/paraglide/`.

- [ ] **Step 1: Add Ukrainian messages**

In `src/i18n/messages/uk.json`, after the `"streams_filter_changed_many"` line, add:

```json
  "streams_sort_group": "Сортування",
  "streams_sort_by_name": "За назвою",
  "streams_sort_by_added": "За часом додавання",
  "streams_sort_changed": "Сортування: {label}",
```

- [ ] **Step 2: Add English messages**

In `src/i18n/messages/en.json`, after the `"streams_filter_changed_many"` line, add:

```json
  "streams_sort_group": "Sort",
  "streams_sort_by_name": "By name",
  "streams_sort_by_added": "By date added",
  "streams_sort_changed": "Sort: {label}",
```

- [ ] **Step 3: Regenerate + verify the keys compile**

Run: `pnpm vite:build`
Expected: build succeeds; `src/i18n/paraglide/messages` now contains `streams_sort_group`, `streams_sort_by_name`, `streams_sort_by_added`, `streams_sort_changed`.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/uk.json src/i18n/messages/en.json src/i18n/paraglide
git commit -m "i18n(streams): add sort group + mode labels + announcement"
```

---

## Task 4: Sorting logic + toolbar toggle in `StreamsPanel`

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx`
- Test: `src/components/streams/StreamsPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/components/streams/StreamsPanel.test.tsx`:

(a) Add the settings store import near the other store imports:

```ts
import { $settings } from "../../stores/settings";
import type { GlobalSettings } from "../../lib/tauri";
```

(b) Add `saveSettings` to the `vi.mock("../../lib/tauri", ...)` factory object:

```ts
  saveSettings: vi.fn().mockResolvedValue(undefined),
```

(c) In the top-level `beforeEach`, add a reset so settings never leak between tests:

```ts
  $settings.set(null);
```

(d) Add these helpers below the existing `chipButtons` helper:

```ts
function rowOrder(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>('li[data-segment="summary"]'),
  ).map((li) => li.getAttribute("data-item-id"));
}

// The sort group is the role="group" whose aria-label matches "Сортування"/"Sort".
function sortButtons(container: HTMLElement) {
  const group = Array.from(container.querySelectorAll('[role="group"]')).find((g) =>
    /сортуван|sort/i.test(g.getAttribute("aria-label") ?? ""),
  );
  return group
    ? Array.from(group.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"))
    : [];
}
```

(e) Add the test block at the end of the file:

```ts
describe("StreamsPanel — stream sorting", () => {
  it("sorts rows alphabetically by name by default (settings null → name)", () => {
    $streams.set([mkStream("c", "Charlie"), mkStream("a", "Alpha"), mkStream("b", "Bravo")]);
    const { container } = renderPanel();
    expect(rowOrder(container)).toEqual(["a", "b", "c"]);
  });

  it("orders names numerically (Радіо 2 before Радіо 10)", () => {
    $streams.set([mkStream("x", "Радіо 10"), mkStream("y", "Радіо 2")]);
    const { container } = renderPanel();
    expect(rowOrder(container)).toEqual(["y", "x"]);
  });

  it("sorts case-insensitively", () => {
    $streams.set([mkStream("b", "beta"), mkStream("a", "Alpha")]);
    const { container } = renderPanel();
    expect(rowOrder(container)).toEqual(["a", "b"]);
  });

  it("sorts by added date (newest first) when sortBy is 'added'", () => {
    $settings.set({ sortBy: "added", language: "uk" } as GlobalSettings);
    $streams.set([
      { ...mkStream("old", "Old"), addedAt: "2026-01-01T00:00:00Z" },
      { ...mkStream("new", "New"), addedAt: "2026-03-01T00:00:00Z" },
      { ...mkStream("mid", "Mid"), addedAt: "2026-02-01T00:00:00Z" },
    ]);
    const { container } = renderPanel();
    expect(rowOrder(container)).toEqual(["new", "mid", "old"]);
  });

  it("applies sort within the active filter", () => {
    $streamFilter.set("recording");
    $streams.set([mkStream("c", "Charlie"), mkStream("a", "Alpha"), mkStream("b", "Bravo")]);
    $statuses.set({ a: mkStatus("a", "recording"), c: mkStatus("c", "recording") });
    const { container } = renderPanel();
    expect(rowOrder(container)).toEqual(["a", "c"]); // b filtered out, a before c
  });

  it("renders a sort group with two toggle buttons, active one pressed", () => {
    $settings.set({ sortBy: "added", language: "uk" } as GlobalSettings);
    const { container } = renderPanel();
    const btns = sortButtons(container);
    expect(btns).toHaveLength(2);
    const pressed = btns.filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toMatch(/час|added|date/i);
  });

  it("persists the new sort when a different mode is chosen", () => {
    $settings.set({ sortBy: "name", language: "uk" } as GlobalSettings);
    const { container } = renderPanel();
    const added = sortButtons(container).find((b) => /час|added|date/i.test(b.textContent ?? ""))!;
    fireEvent.click(added);
    expect(tauri.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ sortBy: "added" }));
  });

  it("clicking the active sort is a no-op", () => {
    $settings.set({ sortBy: "name", language: "uk" } as GlobalSettings);
    const { container } = renderPanel();
    const name = sortButtons(container).find((b) => /назв|name/i.test(b.textContent ?? ""))!;
    fireEvent.click(name);
    expect(tauri.saveSettings).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm test -- StreamsPanel`
Expected: FAIL — no sort group found / `rowOrder` not alphabetical (rows render in insertion order), `saveSettings` not called.

- [ ] **Step 3: Implement sorting + toolbar toggle**

In `src/components/streams/StreamsPanel.tsx`:

(a) Import the `StreamSort` type — extend the existing `stores/streams` import:

```ts
import { $streams, $statuses, $showAddStreamDialog, $streamFilter, $importCandidates, $showExportStreamsDialog, type StreamFilter, type StreamSort } from "../../stores/streams";
```

(b) After the `FILTER_CHIPS` const, add:

```ts
const SORT_OPTIONS = [
  { id: "name",  labelFn: () => m.streams_sort_by_name() },
  { id: "added", labelFn: () => m.streams_sort_by_added() },
] as const satisfies ReadonlyArray<{ id: StreamSort; labelFn: () => string }>;
```

(c) After the `filteredStreams` useMemo, add the sorted derivation:

```ts
  const sortBy: StreamSort = settings?.sortBy ?? "name";

  const sortedStreams = useMemo(() => {
    if (sortBy === "added") {
      // newest first; added_at is a uniform RFC3339 string → lexical compare works
      return [...filteredStreams].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    }
    const collator = new Intl.Collator(
      settings?.language || document.documentElement.lang || "uk",
      { numeric: true, sensitivity: "base" },
    );
    return [...filteredStreams].sort((a, b) => collator.compare(a.name, b.name));
  }, [filteredStreams, sortBy, settings?.language]);

  const sortAnnouncement = useCallback(
    (id: StreamSort) => {
      const opt = SORT_OPTIONS.find((o) => o.id === id);
      return m.streams_sort_changed({ label: opt ? opt.labelFn() : "" });
    },
    [],
  );

  const handleSortChange = (id: StreamSort) => {
    if (id === sortBy) return;
    const current = $settings.get();
    if (!current) return;
    const updated = { ...current, sortBy: id };
    $settings.set(updated);
    tauri.saveSettings(updated).catch((e) => addToast(String(e), "error"));
    announce(sortAnnouncement(id), "polite");
  };
```

(d) Add the two refs next to the chip refs (~152-155) and extend `toolbarRefs` (~156-159):

```ts
  const sort0Ref   = useRef<HTMLButtonElement | null>(null);
  const sort1Ref   = useRef<HTMLButtonElement | null>(null);
  const sortRefs = useMemo(() => [sort0Ref, sort1Ref], []);
```

Update the toolbar comment `// ── Toolbar zone refs (8 items) ──` → `(10 items)` and the array:

```ts
  const toolbarRefs = useMemo(
    () => [addBtn, importBtn, exportBtn, recordAllBtn, stopAllBtn, chip0Ref, chip1Ref, chip2Ref, sort0Ref, sort1Ref],
    [],
  );
```

(e) In the JSX, change the list to render the sorted streams — replace `streams={filteredStreams}` with:

```tsx
              streams={sortedStreams}
```

(f) Add the sort group in toolbar Row 2, immediately AFTER the closing `</div>` of the filter-chips `role="group"` block and BEFORE the closing `</div>` of the Row-2 flex container:

```tsx
          <div className="mx-1 h-4 w-px bg-slate-700 forced-colors:bg-[ButtonText]" aria-hidden="true" />

          {/* Indices 8–9: Sort toggle — segmented group mirroring the filter chips */}
          <div role="group" aria-label={m.streams_sort_group()} className="flex items-center gap-2">
            {SORT_OPTIONS.map((opt, i) => (
              <button
                key={opt.id}
                ref={sortRefs[i]}
                tabIndex={toolbarTabIndex(8 + i)}
                aria-pressed={sortBy === opt.id}
                onClick={() => handleSortChange(opt.id)}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
                  sortBy === opt.id
                    ? "border border-sky-300/[.22] bg-sky-400/[.14] text-slate-100 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
                    : "border border-slate-700/50 text-slate-400 hover:bg-slate-800 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
                }`}
              >
                {opt.labelFn()}
              </button>
            ))}
          </div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- StreamsPanel`
Expected: PASS (all new tests + the pre-existing filter/chip tests still green — the filter group stays first in DOM, so `chipButtons` and the `aria-pressed="true"` lookups still resolve to filter chips).

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamsPanel.tsx src/components/streams/StreamsPanel.test.tsx
git commit -m "feat(streams): sort list by name/date with toolbar toggle"
```

---

## Task 5: Docs — `data-models.md`

**Files:**
- Modify: `docs/data-models.md` (`GlobalSettings` TS block ~74, Rust block ~1049, JSON example ~968)

- [ ] **Step 1: Add `sortBy` to the TS `GlobalSettings` block**

After the `doubleClickAction` line in the TS interface block, add:

```ts
  sortBy: "name" | "added";        // порядок списку потоків
```

- [ ] **Step 2: Add `sort_by` to the Rust `GlobalSettings` block**

After the `double_click_action` field in the Rust struct block, add:

```rust
    #[serde(default = "default_sort_by")]
    pub sort_by: String, // "name" | "added"
```

- [ ] **Step 3: Add `sortBy` to the JSON example**

After the `"doubleClickAction"` line in the example JSON block, add:

```json
  "sortBy": "name",
```

- [ ] **Step 4: Commit**

```bash
git add docs/data-models.md
git commit -m "docs(data-models): document sortBy in GlobalSettings"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run all gates**

Run: `pnpm test`
Expected: PASS (whole suite).

Run: `pnpm vite:build`
Expected: build succeeds.

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (whole Rust suite).

- [ ] **Step 2: Manual smoke (optional, via /run or `pnpm dev`)**

Confirm: streams render alphabetically by default; toggling "За часом додавання" reorders newest-first; choice survives an app restart; NVDA announces "Сортування: …" on toggle.

---

## Self-Review Notes (coverage map)

- Spec Р1 (frontend sort, collator/added) → Task 4 step 3c + tests.
- Spec Р2 (no auto-reorder; toggle in toolbar) → Task 4 (toggle lives in toolbar; status changes don't re-sort — covered by "applies sort within the active filter" + absence of status-keyed sort).
- Spec Р3 (`sortBy` in GlobalSettings, default name, back-compat) → Tasks 1, 2 + Rust legacy test.
- Spec Р4 (2 aria-pressed buttons, roving 8→10, announce) → Task 4 steps 3d/3f + tests. Roving is wired structurally (refs added to `toolbarRefs`, `tabIndex={toolbarTabIndex(8+i)}` identical to chips); arrow-key navigation itself is covered by `useRovingFocus`'s own unit tests, so no brittle focus test is duplicated here.
- Spec i18n → Task 3.
- Spec docs → Task 5.
- Spec test plan (TS + Rust + fixtures) → Tasks 1, 2, 4.
