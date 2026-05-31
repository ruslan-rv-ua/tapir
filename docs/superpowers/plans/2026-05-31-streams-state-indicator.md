# Stream Row State Indicator — Inline Icon Slots Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 100px status-icon column in stream rows with two inline `aria-hidden` icon slots inside the name cell, fix the `error` state NVDA accessibility gap, and update tests accordingly.

**Architecture:** All changes are confined to `StreamItem.tsx` (grid layout + icon logic) and `StreamItem.test.tsx` (update stale assertions, add new slot behavior tests). The `getStreamSegments` function and the `status`/duration column remain untouched. A one-line change to `stateLabel` fixes the `error` NVDA gap (D9).

**Tech Stack:** React 19, Tailwind CSS v3, lucide-react, Vitest + @testing-library/react, Nanostores.

**Spec:** `docs/decisions/2026-05-31-streams-state-indicator.md`

---

## Chunk 1: Branch setup + D9 (error in summaryLabel)

### Task 1: Create the feature branch

**Files:** _(no file changes)_

- [ ] **Step 1: Switch to develop and create branch**

```bash
git checkout develop && git checkout -b feature/streams-state-indicator
```

Expected: `Switched to branch 'develop'` then `Switched to a new branch 'feature/streams-state-indicator'`

---

### Task 2: Add and verify D9 — error state in row aria-label

The `error` state currently has no NVDA representation: it is neither in `summaryLabel` nor in any focus-stop segment. Removing the icon column would leave it invisible to screen readers. Fix this first (one line in `stateLabel`) before touching the icon column.

**Files:**
- Modify: `src/components/streams/StreamItem.test.tsx` (add describe block at end of file)
- Modify: `src/components/streams/StreamItem.tsx` (lines 87–91, `stateLabel` block)

- [ ] **Step 1: Add failing test**

Append this describe block at the **end** of `src/components/streams/StreamItem.test.tsx` (after all existing describes):

```tsx
describe("StreamItem — error state accessibility (D9)", () => {
  it("includes error label in the row aria-label so NVDA announces it", () => {
    const status: StreamStatus = {
      streamId: "s1",
      state: "error",
      currentTrack: null,
      recordingStartedAt: null,
      bytesRecorded: 0,
      tracksRecorded: 0,
      error: "Connection refused",
      reconnectAttempt: null,
    };
    const { container } = renderItem(mkStream(), status);
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toMatch(/error|помилка/i);
    expect(li.getAttribute("aria-label")).toContain("Radio Paradise");
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm test -- StreamItem
```

Expected: 1 FAIL — `expect(received).toMatch(expected)` — the aria-label is just `"Radio Paradise"` with no error prefix.

- [ ] **Step 3: Implement D9 in StreamItem.tsx**

In `src/components/streams/StreamItem.tsx`, find the `stateLabel` block (~line 87). Change it from:

```tsx
const stateLabel =
  isRecording && isThisStreamPlaying ? m.status_recording_and_playing() :
  isRecording                        ? m.status_recording_label() :
  isThisStreamPlaying                ? m.segment_playing() :
  null;
```

To:

```tsx
const stateLabel =
  isRecording && isThisStreamPlaying ? m.status_recording_and_playing() :
  isRecording                        ? m.status_recording_label() :
  isThisStreamPlaying                ? m.segment_playing() :
  state === "error"                  ? m.status_error() :
  null;
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
pnpm test -- StreamItem
```

Expected: ALL tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamItem.tsx src/components/streams/StreamItem.test.tsx
git commit -m "fix(a11y): add error state to stream row aria-label (D9)

Closes the NVDA accessibility gap where a stream in error state was only
communicated via the visual status icon. summaryLabel now includes the
error label, matching the pattern used for recording and playing states.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 2: Update stale reconnecting test assertions

### Task 3: Remove role="img" assertions from reconnecting tests

Three reconnecting tests assert `container.querySelector('[role="img"]')`. After Chunk 4 removes the icon column, those queries return `null` and `.getAttribute` throws. Remove them now — the status-cell assertions already verify the same text, so no coverage is lost.

**Files:**
- Modify: `src/components/streams/StreamItem.test.tsx` (lines 144–168, `describe("StreamItem — reconnecting counter display", ...)`)

- [ ] **Step 1: Update test 1 — "Attempt N of max"**

Find this test and remove the two `icon` lines:

Before:
```tsx
it("shows 'Attempt N of max' in status cell and icon tooltip when maxRetries > 0", () => {
  const { container } = renderItem(mkStream(), mkReconnecting(3), "summary", 10);
  const statusCell = container.querySelector('[data-segment="status"]')!;
  expect(statusCell.textContent).toMatch(/attempt 3 of 10|спроба 3 з 10/i);
  const icon = container.querySelector('[role="img"]')!;
  expect(icon.getAttribute("aria-label")).toMatch(/attempt 3 of 10|спроба 3 з 10/i);
});
```

After:
```tsx
it("shows 'Attempt N of max' in status cell when maxRetries > 0", () => {
  const { container } = renderItem(mkStream(), mkReconnecting(3), "summary", 10);
  const statusCell = container.querySelector('[data-segment="status"]')!;
  expect(statusCell.textContent).toMatch(/attempt 3 of 10|спроба 3 з 10/i);
});
```

- [ ] **Step 2: Update test 2 — "Attempt N without max"**

Before:
```tsx
it("shows 'Attempt N' without max when maxRetries is 0 (unlimited)", () => {
  const { container } = renderItem(mkStream(), mkReconnecting(5), "summary", 0);
  const statusCell = container.querySelector('[data-segment="status"]')!;
  expect(statusCell.textContent).toMatch(/attempt 5|спроба 5/i);
  expect(statusCell.textContent).not.toMatch(/of \d|з \d/i);
  const icon = container.querySelector('[role="img"]')!;
  expect(icon.getAttribute("aria-label")).toMatch(/attempt 5|спроба 5/i);
  expect(icon.getAttribute("aria-label")).not.toMatch(/of \d|з \d/i);
});
```

After:
```tsx
it("shows 'Attempt N' without max when maxRetries is 0 (unlimited)", () => {
  const { container } = renderItem(mkStream(), mkReconnecting(5), "summary", 0);
  const statusCell = container.querySelector('[data-segment="status"]')!;
  expect(statusCell.textContent).toMatch(/attempt 5|спроба 5/i);
  expect(statusCell.textContent).not.toMatch(/of \d|з \d/i);
});
```

- [ ] **Step 3: Update test 3 — "falls back to Reconnecting..."**

Before:
```tsx
it("falls back to 'Reconnecting...' when reconnectAttempt is null", () => {
  const { container } = renderItem(mkStream(), mkReconnecting(null), "summary", 10);
  const statusCell = container.querySelector('[data-segment="status"]')!;
  expect(statusCell.textContent).toMatch(/reconnecting|перепідключення/i);
  const icon = container.querySelector('[role="img"]')!;
  expect(icon.getAttribute("aria-label")).toMatch(/reconnecting|перепідключення/i);
});
```

After:
```tsx
it("falls back to 'Reconnecting...' when reconnectAttempt is null", () => {
  const { container } = renderItem(mkStream(), mkReconnecting(null), "summary", 10);
  const statusCell = container.querySelector('[data-segment="status"]')!;
  expect(statusCell.textContent).toMatch(/reconnecting|перепідключення/i);
});
```

- [ ] **Step 4: Run tests — verify all still pass**

```bash
pnpm test -- StreamItem
```

Expected: ALL tests PASS. (The icon column still exists at this point; we've only removed the assertions against it.)

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamItem.test.tsx
git commit -m "test(streams): drop legacy role='img' assertions from reconnecting tests

The icon column's aria-label duplicates what the status cell already says.
Removing these assertions now lets the implementation commit (Chunk 4)
drop the icon column without test breakage.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 3: New failing tests for inline slot behavior

### Task 4: Write failing tests for the new slot structure

Write tests that describe the *target* behavior. They will fail until Chunk 4 is implemented. **Do not commit failing tests** — they stay as WIP in the working tree until all pass.

**Files:**
- Modify: `src/components/streams/StreamItem.test.tsx` (add import + describe block at end)

- [ ] **Step 1: Add $playerStatus import**

After the existing imports at the top of `src/components/streams/StreamItem.test.tsx`, add:

```tsx
import { $playerStatus } from "../../stores/player";
```

- [ ] **Step 2: Append new describe block at end of file**

```tsx
describe("StreamItem — inline R|P icon slots", () => {
  // Factory for StreamStatus — avoids repeating all fields in every test.
  const mkSt = (state: StreamStatus["state"], over: Partial<StreamStatus> = {}): StreamStatus => ({
    streamId: "s1",
    state,
    currentTrack: null,
    recordingStartedAt: state === "recording" ? "2026-01-01T00:00:00Z" : null,
    bytesRecorded: 0,
    tracksRecorded: 0,
    error: null,
    reconnectAttempt: null,
    ...over,
  });

  // Reset player store after each test so state doesn't leak.
  afterEach(() => {
    $playerStatus.set({ state: "stopped", source: null, volume: 0.75, positionMs: null, durationMs: null });
  });

  it("idle: both slot spans are rendered but contain no icon", () => {
    const { container } = renderItem(mkStream(), mkSt("idle"));
    // Spans must exist (always-rendered reserved space).
    expect(container.querySelector('[data-slot="record"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="play"]')).not.toBeNull();
    // But contain no SVG icon.
    expect(container.querySelector('[data-slot="record"] svg')).toBeNull();
    expect(container.querySelector('[data-slot="play"] svg')).toBeNull();
  });

  it("recording: record slot has icon, play slot is empty", () => {
    const { container } = renderItem(mkStream(), mkSt("recording"));
    expect(container.querySelector('[data-slot="record"] svg')).not.toBeNull();
    expect(container.querySelector('[data-slot="play"] svg')).toBeNull();
  });

  it("connecting: record slot has icon, play slot is empty", () => {
    const { container } = renderItem(mkStream(), mkSt("connecting"));
    expect(container.querySelector('[data-slot="record"] svg')).not.toBeNull();
    expect(container.querySelector('[data-slot="play"] svg')).toBeNull();
  });

  it("reconnecting: record slot has icon, play slot is empty", () => {
    const { container } = renderItem(mkStream(), mkSt("reconnecting"));
    expect(container.querySelector('[data-slot="record"] svg')).not.toBeNull();
    expect(container.querySelector('[data-slot="play"] svg')).toBeNull();
  });

  it("error: record slot has icon, play slot is empty", () => {
    const { container } = renderItem(mkStream(), mkSt("error", { error: "timeout" }));
    expect(container.querySelector('[data-slot="record"] svg')).not.toBeNull();
    expect(container.querySelector('[data-slot="play"] svg')).toBeNull();
  });

  it("playing via player store: record slot empty, play slot has icon", () => {
    $playerStatus.set({ state: "playing", source: { type: "stream", streamId: "s1" }, volume: 0.75, positionMs: null, durationMs: null });
    const { container } = renderItem(mkStream(), mkSt("idle"));
    expect(container.querySelector('[data-slot="record"] svg')).toBeNull();
    expect(container.querySelector('[data-slot="play"] svg')).not.toBeNull();
  });

  it("recording + playing: both slots have icons (dual state)", () => {
    $playerStatus.set({ state: "playing", source: { type: "stream", streamId: "s1" }, volume: 0.75, positionMs: null, durationMs: null });
    const { container } = renderItem(mkStream(), mkSt("recording"));
    expect(container.querySelector('[data-slot="record"] svg')).not.toBeNull();
    expect(container.querySelector('[data-slot="play"] svg')).not.toBeNull();
  });

  it("connecting + playing: both slots have icons (dual state)", () => {
    $playerStatus.set({ state: "playing", source: { type: "stream", streamId: "s1" }, volume: 0.75, positionMs: null, durationMs: null });
    const { container } = renderItem(mkStream(), mkSt("connecting"));
    expect(container.querySelector('[data-slot="record"] svg')).not.toBeNull();
    expect(container.querySelector('[data-slot="play"] svg')).not.toBeNull();
  });

  it("reconnecting + playing: both slots have icons (dual state)", () => {
    $playerStatus.set({ state: "playing", source: { type: "stream", streamId: "s1" }, volume: 0.75, positionMs: null, durationMs: null });
    const { container } = renderItem(mkStream(), mkSt("reconnecting"));
    expect(container.querySelector('[data-slot="record"] svg')).not.toBeNull();
    expect(container.querySelector('[data-slot="play"] svg')).not.toBeNull();
  });

  it("no role='img' element in the row (old icon column removed)", () => {
    $playerStatus.set({ state: "playing", source: { type: "stream", streamId: "s1" }, volume: 0.75, positionMs: null, durationMs: null });
    const { container } = renderItem(mkStream(), mkSt("recording"));
    expect(container.querySelectorAll('[role="img"]').length).toBe(0);
  });

  it("icon slot spans are aria-hidden", () => {
    const { container } = renderItem(mkStream(), mkSt("idle"));
    expect(container.querySelector('[data-slot="record"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector('[data-slot="play"]')?.getAttribute("aria-hidden")).toBe("true");
  });
});
```

- [ ] **Step 3: Run tests — verify new tests fail, old tests still pass**

```bash
pnpm test -- StreamItem
```

Expected: 11 FAIL (all from the new `inline R|P icon slots` describe), all previously passing tests still PASS. Note the failing test names — these drive the next chunk.

---

## Chunk 4: Implement grid restructure + inline slots

### Task 5: Restructure StreamItem.tsx

All changes in `src/components/streams/StreamItem.tsx`.

Grid before (6 columns): `"100px minmax(0,1fr) minmax(0,1.5fr) 90px 90px auto"`
Grid after (5 columns): `"minmax(0,1fr) minmax(0,1.5fr) 90px 90px auto"`

gridColumn shifts after removing col 1:

| Segment  | Before | After |
|----------|--------|-------|
| name     | 2      | 1     |
| track    | 3      | 2     |
| tech     | 4      | 3     |
| status   | 5      | 4     |
| actions  | 6      | 5     |

**Files:**
- Modify: `src/components/streams/StreamItem.tsx`

- [ ] **Step 1: Update imports (line 4)**

Change:
```tsx
import { Mic, Loader2, RefreshCw, AlertCircle, Radio, Volume2 } from "lucide-react";
```
To:
```tsx
import { Circle, Loader2, RefreshCw, AlertCircle, Volume2 } from "lucide-react";
```

- [ ] **Step 2: Remove the `statusIconLabel` variable**

Remove the entire `statusIconLabel` block (no longer used after the icon column is removed):
```tsx
const statusIconLabel =
  state === "recording"    ? m.status_recording_label() :
  state === "connecting"   ? m.status_connecting() :
  state === "reconnecting" ? retryLabel :
  state === "error"        ? m.status_error() :
  isThisStreamPlaying      ? m.segment_playing() :
  m.status_idle();
```

- [ ] **Step 3: Add slot icon variables after `summaryLabel`**

Immediately after `const summaryLabel = ...`, insert:

```tsx
const slot1Icon =
  state === "recording"    ? <Circle      size={10} aria-hidden className="fill-red-500 text-red-500 motion-safe:animate-pulse forced-colors:fill-[Highlight] forced-colors:text-[Highlight]" /> :
  state === "connecting"   ? <Loader2     size={14} aria-hidden className="text-amber-400 animate-spin forced-colors:text-[Highlight]" /> :
  state === "reconnecting" ? <RefreshCw   size={14} aria-hidden className="text-amber-400 animate-spin forced-colors:text-[Highlight]" /> :
  state === "error"        ? <AlertCircle size={14} aria-hidden className="text-red-500 forced-colors:text-[Highlight]" /> :
  null;

const slot2Icon = isThisStreamPlaying
  ? <Volume2 size={14} aria-hidden className="text-blue-400 forced-colors:text-[Highlight]" />
  : null;
```

- [ ] **Step 4: Update `gridTemplateColumns` on the `<li>` element**

Change:
```tsx
style={{ gridTemplateColumns: "100px minmax(0,1fr) minmax(0,1.5fr) 90px 90px auto" }}
```
To:
```tsx
style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.5fr) 90px 90px auto" }}
```

- [ ] **Step 5: Replace name cell with slot+name flex layout**

Replace:
```tsx
{/* Stream name — visual only; the row's accessible name is on the <li>. */}
<div className="flex items-center px-3 py-2" style={{ gridRow: 1, gridColumn: 2 }}>
  <span className="font-medium text-slate-200 truncate">{stream.name}</span>
</div>
```

With:
```tsx
{/* Name cell: two fixed-width aria-hidden icon slots + stream name. Slots are always
    rendered (even when empty) so the name x-position never shifts on state changes. */}
<div className="flex items-center gap-1 px-3 py-2" style={{ gridRow: 1, gridColumn: 1 }}>
  <span data-slot="record" aria-hidden className="w-4 h-4 shrink-0 flex items-center justify-center">
    {slot1Icon}
  </span>
  <span data-slot="play" aria-hidden className="w-4 h-4 shrink-0 flex items-center justify-center">
    {slot2Icon}
  </span>
  <span className="font-medium text-slate-200 truncate">{stream.name}</span>
</div>
```

- [ ] **Step 6: Remove the old status-icon column block**

Remove the entire block:
```tsx
{/* Status icon — col 1 */}
<div
  role="img"
  aria-label={statusIconLabel}
  title={statusIconLabel}
  className="flex items-center justify-center px-3 py-2"
  style={{ gridRow: 1, gridColumn: 1 }}
>
  {state === "recording"    ? <Mic         aria-hidden size={16} className="text-red-500   forced-colors:text-[Highlight]" /> :
   state === "connecting"   ? <Loader2     aria-hidden size={16} className="text-amber-400 animate-spin forced-colors:text-[Highlight]" /> :
   state === "reconnecting" ? <RefreshCw   aria-hidden size={16} className="text-amber-400 animate-spin forced-colors:text-[Highlight]" /> :
   state === "error"        ? <AlertCircle aria-hidden size={16} className="text-red-500   forced-colors:text-[Highlight]" /> :
   isThisStreamPlaying      ? <Volume2     aria-hidden size={16} className="text-blue-400  forced-colors:text-[Highlight]" /> :
                               <Radio       aria-hidden size={16} className="text-green-500  forced-colors:text-[Highlight]" />}
</div>
```

- [ ] **Step 7: Update `gridColumn` for track segment**

In the track `<div>` (kind === "track"), change:
```tsx
style={{ gridRow: 1, gridColumn: 3 }}
```
To:
```tsx
style={{ gridRow: 1, gridColumn: 2 }}
```

- [ ] **Step 8: Update `gridColumn` for tech segment**

In the tech `<div>` (kind === "tech"), change:
```tsx
style={{ gridRow: 1, gridColumn: 4 }}
```
To:
```tsx
style={{ gridRow: 1, gridColumn: 3 }}
```

- [ ] **Step 9: Update `gridColumn` for status segment**

In the status `<div>` (kind === "status"), change:
```tsx
style={{ gridRow: 1, gridColumn: 5 }}
```
To:
```tsx
style={{ gridRow: 1, gridColumn: 4 }}
```

- [ ] **Step 10: Update `gridColumn` for actions div**

In the actions `<div>` (the flex container with buttons), change:
```tsx
style={{ gridRow: 1, gridColumn: 6 }}
```
To:
```tsx
style={{ gridRow: 1, gridColumn: 5 }}
```

---

### Task 6: Run all tests and commit

**Files:** _(verification + commit only)_

- [ ] **Step 1: Run StreamItem tests — all must pass**

```bash
pnpm test -- StreamItem
```

Expected: ALL tests PASS (including the 9 new slot tests from Chunk 3).  
If any fail, fix before proceeding.

- [ ] **Step 2: Run full test suite — no regressions**

```bash
pnpm test
```

Expected: ALL tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/streams/StreamItem.tsx src/components/streams/StreamItem.test.tsx
git commit -m "feat(streams): inline R|P status slots, remove 100px icon column (D1-D8)

- Replace standalone 100px icon column with two 16px aria-hidden slots
  inside the name cell (flex layout): slot1=record/connecting/error,
  slot2=playing.
- Dual states (recording+playing, connecting+playing) show both icons.
- Recording dot: Circle with fill-red-500 + motion-safe:animate-pulse
  and forced-colors:fill-[Highlight] (R5).
- Idle state: both slots empty — no icon. Radio glyph removed (§8 Q1).
- Grid: 6 columns → 5; all gridColumn values shifted by -1 (R4).
- Icons are aria-hidden; NVDA relies on row aria-label (D8).
- Removes unused statusIconLabel variable.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
