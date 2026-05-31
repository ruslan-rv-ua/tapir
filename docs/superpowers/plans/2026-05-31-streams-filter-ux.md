# Streams Filter UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the streams filter chips — group semantics for screen readers, per-chip counts, and filter state that survives leaving the section.

**Architecture:** Three focused changes to the existing streams panel. (1) Wrap the three filter chips in a `role="group"` while keeping their `aria-pressed` toggle semantics. (2) Render a count badge on the Recording/Errors chips, hidden from assistive tech, with the count folded into each chip's `aria-label` via a comma. (3) Lift the filter selection from component `useState` to an in-memory nanostore atom. No roving-focus rewiring.

**Tech Stack:** React + TypeScript, nanostores (`@nanostores/react`), Vitest + @testing-library/react (jsdom), inlang/paraglide i18n (compiled via `pnpm compile-i18n`).

**Spec:** [docs/superpowers/specs/2026-05-31-streams-filter-ux-design.md](../specs/2026-05-31-streams-filter-ux-design.md)

---

## File Structure

- **Modify** `src/stores/streams.ts` — add `StreamFilter` type + `$streamFilter` atom (single source of truth for the active filter).
- **Modify** `src/components/streams/StreamsPanel.tsx` — consume `$streamFilter` instead of `useState`; wrap chips in a group; render count badges + comma `aria-label`.
- **Modify** `src/i18n/messages/uk.json` and `src/i18n/messages/en.json` — two new keys, then recompile.
- **Create** `src/components/streams/StreamsPanel.test.tsx` — covers group role, count badges, and store persistence.

Compiled i18n output under `src/i18n/paraglide/` is generated, never hand-edited.

---

## Task 1: Add i18n keys for the filter group and chip count

**Files:**
- Modify: `src/i18n/messages/uk.json` (after line 281, the `filter_errors` entry)
- Modify: `src/i18n/messages/en.json` (after line 281, the `filter_errors` entry)

- [ ] **Step 1: Add the two keys to the Ukrainian source**

In `src/i18n/messages/uk.json`, immediately after the line:

```json
  "filter_errors": "З помилками",
```

add:

```json
  "streams_filter_group": "Фільтр потоків",
  "streams_filter_chip_count": "{label}, {count}",
```

- [ ] **Step 2: Add the two keys to the English source**

In `src/i18n/messages/en.json`, immediately after the line:

```json
  "filter_errors": "With errors",
```

add:

```json
  "streams_filter_group": "Stream filter",
  "streams_filter_chip_count": "{label}, {count}",
```

- [ ] **Step 3: Compile the messages**

Run: `pnpm compile-i18n`
Expected: completes without error; generates `src/i18n/paraglide/messages/streams_filter_group.js` and `src/i18n/paraglide/messages/streams_filter_chip_count.js`.

- [ ] **Step 4: Verify the compiled message files exist**

Run: `pnpm exec node -e "const fs=require('fs'); ['streams_filter_group','streams_filter_chip_count'].forEach(k=>{ if(!fs.existsSync('src/i18n/paraglide/messages/'+k+'.js')) throw new Error('missing '+k); }); console.log('i18n OK')"`
Expected: prints `i18n OK`.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/messages/uk.json src/i18n/messages/en.json src/i18n/paraglide
git commit -m "i18n: add streams filter group + chip-count messages"
```

---

## Task 2: Lift filter state into the store

**Files:**
- Modify: `src/stores/streams.ts`
- Modify: `src/components/streams/StreamsPanel.tsx:24` (remove local `ChipId`), `:94` (state hook), `:124-133` (`handleChipClick`), `:179-182` (`handleResetFilter`)
- Test: `src/components/streams/StreamsPanel.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/components/streams/StreamsPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { $streams, $statuses, $streamFilter } from "../../stores/streams";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import { StreamsPanel } from "./StreamsPanel";

// No backend in jsdom — stub the Tauri IPC layer.
vi.mock("../../lib/tauri", () => ({
  playStream: vi.fn().mockResolvedValue(undefined),
  stopPlayback: vi.fn().mockResolvedValue(undefined),
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue(undefined),
  stopAllRecordings: vi.fn().mockResolvedValue(undefined),
  removeStream: vi.fn().mockResolvedValue(undefined),
  addToWishlist: vi.fn().mockResolvedValue(undefined),
  addToIgnorelist: vi.fn().mockResolvedValue(undefined),
}));

const mkStream = (id: string, name: string): StreamInfo => ({
  id,
  url: `http://x/${id}`,
  name,
  format: "mp3",
  bitrate: 192,
  icyName: null,
  icyGenre: null,
  icyUrl: null,
  ignorelist: [],
  username: null,
  password: null,
  addedAt: "2026-01-01T00:00:00Z",
});

const mkStatus = (id: string, state: StreamStatus["state"]): StreamStatus => ({
  streamId: id,
  state,
  currentTrack: null,
  recordingStartedAt: null,
  bytesRecorded: 0,
  tracksRecorded: 0,
  error: null,
  reconnectAttempt: null,
});

function renderPanel() {
  return render(<StreamsPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
}

// The chip group is the one role="group" whose buttons carry aria-pressed
// (StreamItem cells are also role="group" but contain no pressed buttons).
function chipButtons(container: HTMLElement) {
  const groups = Array.from(container.querySelectorAll('[role="group"]'));
  const group = groups.find((g) => g.querySelector("button[aria-pressed]"));
  return {
    group,
    chips: group
      ? Array.from(group.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"))
      : [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  $statuses.set({});
  $streamFilter.set("all");
  $streams.set([mkStream("a", "Alpha")]);
});

describe("StreamsPanel — filter state persistence", () => {
  it("reads the active filter from the store after remount", () => {
    const { unmount } = renderPanel();
    act(() => $streamFilter.set("errors"));
    unmount();

    const { container } = renderPanel();
    const pressed = container.querySelector('button[aria-pressed="true"]')!;
    expect(pressed.textContent).toMatch(/помилк|error/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx`
Expected: FAIL — `$streamFilter` is not exported from `../../stores/streams`.

- [ ] **Step 3: Add the atom to the store**

In `src/stores/streams.ts`, after the existing `$editStream` line:

```ts
export const $editStream = atom<StreamInfo | null>(null);

export type StreamFilter = "all" | "recording" | "errors";
export const $streamFilter = atom<StreamFilter>("all");
```

- [ ] **Step 4: Wire the panel to the store**

In `src/components/streams/StreamsPanel.tsx`:

a) Extend the store import (line 4) to include the new symbols:

```tsx
import { $streams, $statuses, $showAddStreamDialog, $streamFilter, type StreamFilter } from "../../stores/streams";
```

b) Delete the local type alias (line 24):

```tsx
type ChipId = "all" | "recording" | "errors";
```

c) Update `FILTER_CHIPS` (lines 26-30) to use `StreamFilter` instead of `ChipId`:

```tsx
const FILTER_CHIPS = [
  { id: "all",       labelFn: () => m.filter_all() },
  { id: "recording", labelFn: () => m.filter_recording() },
  { id: "errors",    labelFn: () => m.filter_errors() },
] as const satisfies ReadonlyArray<{ id: StreamFilter; labelFn: () => string }>;
```

d) Replace the local state hook (line 94):

```tsx
  const activeChip = useStore($streamFilter);
```

e) Update `filterAnnouncement`'s parameter type (line 101) `chipId: ChipId` → `chipId: StreamFilter`.

f) Update `handleChipClick` (lines 124-133) — change the signature type and the setter:

```tsx
  const handleChipClick = (chipId: StreamFilter) => {
    if (chipId === activeChip) return;
    $streamFilter.set(chipId);
    const count = chipId === "all"
      ? streams.length
      : chipId === "recording"
      ? streams.filter(s => statuses[s.id]?.state === "recording").length
      : streams.filter(s => statuses[s.id]?.state === "error").length;
    announce(filterAnnouncement(chipId, count), "polite");
  };
```

g) Update `handleResetFilter` (lines 179-182):

```tsx
  const handleResetFilter = () => {
    $streamFilter.set("all");
    announce(filterAnnouncement("all", streams.length), "polite");
  };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (confirms `ChipId` has no remaining references).

- [ ] **Step 7: Commit**

```bash
git add src/stores/streams.ts src/components/streams/StreamsPanel.tsx src/components/streams/StreamsPanel.test.tsx
git commit -m "feat(streams): lift filter selection into \$streamFilter store"
```

---

## Task 3: Wrap the chips in a labelled group

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx:349-365` (the `FILTER_CHIPS.map` block)
- Test: `src/components/streams/StreamsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/components/streams/StreamsPanel.test.tsx`:

```tsx
describe("StreamsPanel — filter chip group semantics", () => {
  it("wraps the three chips in a single labelled group", () => {
    const { container } = renderPanel();
    const { group, chips } = chipButtons(container);
    expect(group).toBeTruthy();
    expect(group!.getAttribute("aria-label")).toMatch(/фільтр потоків|stream filter/i);
    expect(chips).toHaveLength(3);
  });

  it("keeps the Stop-all button outside the group", () => {
    const { container } = renderPanel();
    const { group } = chipButtons(container);
    const texts = Array.from(group!.querySelectorAll("button")).map((b) => b.textContent);
    expect(texts.some((t) => /зупинити|stop all/i.test(t ?? ""))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx -t "filter chip group"`
Expected: FAIL — no group wraps the chips (`group` is undefined).

- [ ] **Step 3: Wrap the chips**

In `src/components/streams/StreamsPanel.tsx`, replace the chips block (lines 349-365, the comment `{/* Indices 3–5: Filter chips */}` through the closing `))}`) with a group wrapper around the same `.map`:

```tsx
              {/* Indices 3–5: Filter chips — semantic group, toggle chips kept */}
              <div role="group" aria-label={m.streams_filter_group()} className="flex items-center gap-2">
                {FILTER_CHIPS.map((chip, i) => (
                  <button
                    key={chip.id}
                    ref={chipRefs[i]}
                    tabIndex={toolbarTabIndex(3 + i)}
                    aria-pressed={activeChip === chip.id}
                    onClick={() => handleChipClick(chip.id)}
                    className={`rounded-full px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
                      activeChip === chip.id
                        ? "border border-sky-300/[.22] bg-sky-400/[.14] text-slate-100 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
                        : "border border-slate-700/50 text-slate-400 hover:bg-slate-800 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
                    }`}
                  >
                    {chip.labelFn()}
                  </button>
                ))}
              </div>
```

The wrapping `<div>` is purely semantic: roving-focus uses `chipRefs`/`toolbarTabIndex` on the buttons directly, so DOM order, refs, and tab indices are unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx -t "filter chip group"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamsPanel.tsx src/components/streams/StreamsPanel.test.tsx
git commit -m "feat(streams): group filter chips under role=group"
```

---

## Task 4: Render count badges on the Recording/Errors chips

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx` (the `FILTER_CHIPS.map` block from Task 3)
- Test: `src/components/streams/StreamsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/components/streams/StreamsPanel.test.tsx`:

```tsx
describe("StreamsPanel — chip counts", () => {
  beforeEach(() => {
    $streams.set([mkStream("a", "Alpha"), mkStream("b", "Bravo"), mkStream("c", "Charlie")]);
    $statuses.set({
      a: mkStatus("a", "recording"),
      b: mkStatus("b", "error"),
      c: mkStatus("c", "error"),
    });
  });

  it("shows a visual count badge (hidden from AT) on recording and errors chips", () => {
    const { container } = renderPanel();
    const { chips } = chipButtons(container);
    const [, rec, err] = chips; // order: all, recording, errors
    const recBadge = rec.querySelector('[aria-hidden="true"]');
    const errBadge = err.querySelector('[aria-hidden="true"]');
    expect(recBadge?.textContent).toBe("1");
    expect(errBadge?.textContent).toBe("2");
  });

  it("folds the count into the chip aria-label with a comma; All has no numeric label", () => {
    const { container } = renderPanel();
    const { chips } = chipButtons(container);
    const [all, rec, err] = chips;
    expect(all.getAttribute("aria-label")).toBeNull();
    expect(rec.getAttribute("aria-label")).toMatch(/,\s*1$/);
    expect(err.getAttribute("aria-label")).toMatch(/,\s*2$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx -t "chip counts"`
Expected: FAIL — no badge element; `aria-label` is absent on the count chips.

- [ ] **Step 3: Add the count + badge to the chip map**

In `src/components/streams/StreamsPanel.tsx`, replace the `FILTER_CHIPS.map(...)` body inside the group (from Task 3) so each chip computes its count and renders a badge:

```tsx
                {FILTER_CHIPS.map((chip, i) => {
                  const count = chip.id === "recording" ? activeCount
                              : chip.id === "errors"    ? errorCount
                              : null;
                  return (
                    <button
                      key={chip.id}
                      ref={chipRefs[i]}
                      tabIndex={toolbarTabIndex(3 + i)}
                      aria-pressed={activeChip === chip.id}
                      aria-label={count === null ? undefined : m.streams_filter_chip_count({ label: chip.labelFn(), count })}
                      onClick={() => handleChipClick(chip.id)}
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
                        activeChip === chip.id
                          ? "border border-sky-300/[.22] bg-sky-400/[.14] text-slate-100 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
                          : "border border-slate-700/50 text-slate-400 hover:bg-slate-800 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
                      }`}
                    >
                      <span>{chip.labelFn()}</span>
                      {count !== null && (
                        <span
                          aria-hidden="true"
                          className="ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full bg-slate-700/80 px-1 text-[10px] leading-4 text-slate-300 forced-colors:border forced-colors:border-[ButtonText] forced-colors:bg-[Canvas] forced-colors:text-[ButtonText]"
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
```

Notes: `count === null` is only the "All" chip (keeps its text content as the accessible name, no `aria-label`). The badge is `aria-hidden`; the number reaches a screen reader only through the comma-separated `aria-label`, mirroring the comma-pause technique in `StreamItem.tsx`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx -t "chip counts"`
Expected: PASS.

- [ ] **Step 5: Run the full panel test file**

Run: `pnpm exec vitest run src/components/streams/StreamsPanel.test.tsx`
Expected: all describe blocks PASS (persistence, group semantics, chip counts).

- [ ] **Step 6: Commit**

```bash
git add src/components/streams/StreamsPanel.tsx src/components/streams/StreamsPanel.test.tsx
git commit -m "feat(streams): show count badges on recording/errors chips"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: all tests pass, including the existing `StreamItem.test.tsx` / `StreamList.test.tsx` (unchanged).

- [ ] **Step 2: Typecheck the project**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Confirm clean tree**

Run: `git status`
Expected: nothing to commit, working tree clean (all changes committed across Tasks 1–4).

---

## Self-Review Notes

- **Spec coverage:** chip semantics → Task 3; counts on chips → Task 4; filter state in store → Task 2; new i18n keys → Task 1; `StreamsPanel.test.tsx` covering all three → Tasks 2–4. The three out-of-scope items (richer filters/sorting, column alignment, responsive metrics) are intentionally absent.
- **Type consistency:** `StreamFilter` defined in Task 2 (store) and reused for `FILTER_CHIPS`, `handleChipClick`, `filterAnnouncement`. `$streamFilter`, `streams_filter_group`, `streams_filter_chip_count` named identically across tasks.
- **Forced-colors:** badge degrades via `forced-colors:` border/`[ButtonText]` since `bg-slate-700` is dropped in high-contrast mode.
