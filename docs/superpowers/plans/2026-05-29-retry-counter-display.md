# Retry Counter Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show "Attempt N of max" (or "Attempt N" when unlimited) in the status cell and icon tooltip whenever a stream is in the `reconnecting` state.

**Architecture:** Add two i18n keys, thread `maxRetries` from `$recordingSettings` as a prop from `StreamList` → `StreamItem`, derive a `retryLabel` from `reconnectAttempt` + `maxRetries`, and replace the two bare `m.status_reconnecting()` calls with it.

**Tech Stack:** React, nanostores, Paraglide i18n (Vite plugin + CLI codegen), Vitest + Testing Library

---

## File map

| File | Change |
|---|---|
| `src/i18n/messages/en.json` | Add 2 message keys |
| `src/i18n/messages/uk.json` | Add 2 message keys |
| `src/i18n/paraglide/messages/` | 2 new generated JS files (from paraglide compile) |
| `src/components/streams/StreamList.tsx` | Subscribe to `$recordingSettings`; pass `maxRetries` prop |
| `src/components/streams/StreamItem.tsx` | Accept `maxRetries` prop; derive and use `retryLabel` |
| `src/components/streams/StreamItem.test.tsx` | Update `renderItem` helper; add reconnecting counter tests |

---

## Task 1: Add i18n keys and regenerate paraglide output

**Files:**
- Modify: `src/i18n/messages/en.json`
- Modify: `src/i18n/messages/uk.json`
- Generated (auto): `src/i18n/paraglide/messages/status_reconnecting_attempt.js`
- Generated (auto): `src/i18n/paraglide/messages/status_reconnecting_attempt_unlimited.js`

**Background:** The project uses `@inlang/paraglide-vite` which auto-generates typed JS message functions from JSON. The vitest config intentionally does NOT include the paraglide Vite plugin (see comment in `vitest.config.ts`), so the generated JS files must be committed to the repo. After editing the JSON files, run the paraglide CLI to regenerate.

- [ ] **Step 1: Add English keys to en.json**

In `src/i18n/messages/en.json`, find the `"status_reconnecting"` key and add the two new keys after it:

```json
"status_reconnecting": "Reconnecting...",
"status_reconnecting_attempt": "Attempt {attempt} of {max}",
"status_reconnecting_attempt_unlimited": "Attempt {attempt}",
```

- [ ] **Step 2: Add Ukrainian keys to uk.json**

In `src/i18n/messages/uk.json`, find the `"status_reconnecting"` key and add the two new keys after it:

```json
"status_reconnecting": "Перепідключення...",
"status_reconnecting_attempt": "Спроба {attempt} з {max}",
"status_reconnecting_attempt_unlimited": "Спроба {attempt}",
```

- [ ] **Step 3: Run paraglide codegen**

```bash
npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/i18n/paraglide
```

Expected: no errors. Two new files appear:
- `src/i18n/paraglide/messages/status_reconnecting_attempt.js`
- `src/i18n/paraglide/messages/status_reconnecting_attempt_unlimited.js`

- [ ] **Step 4: Verify the generated files look correct**

`src/i18n/paraglide/messages/status_reconnecting_attempt.js` should export a function `status_reconnecting_attempt` that accepts `{ attempt, max }` and returns a localized string. The pattern matches `status_reconnecting.js` — check that file as a reference.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/uk.json src/i18n/paraglide/
git commit -m "feat(i18n): add reconnecting attempt counter message keys"
```

---

## Task 2: Thread maxRetries prop — skeleton with no behavior change

**Files:**
- Modify: `src/components/streams/StreamItem.tsx`
- Modify: `src/components/streams/StreamList.tsx`
- Modify: `src/components/streams/StreamItem.test.tsx`

This step wires up the data flow without changing any visible output. Existing tests must continue to pass after this step.

- [ ] **Step 1: Add maxRetries to StreamItem Props interface**

In `src/components/streams/StreamItem.tsx`, update the `Props` interface (currently at line 34):

```tsx
interface Props {
  stream: StreamInfo;
  status: StreamStatus | undefined;
  isFocused: (segment: 'summary' | SegmentKind) => boolean;
  /** This row is the active item — used for a subtle context highlight. */
  isActiveRow: boolean;
  maxRetries: number;
  onPrimaryAction: () => void;
  onContextMenu: () => void;
  onDelete: () => void;
}
```

- [ ] **Step 2: Destructure maxRetries in StreamItem function**

Update the function signature (currently line 45) to destructure `maxRetries`:

```tsx
export function StreamItem({ stream, status, isFocused, isActiveRow, maxRetries, onPrimaryAction: _onPrimaryAction, onContextMenu: _onContextMenu, onDelete }: Props) {
```

(`maxRetries` is accepted but not yet used — that's fine for this step.)

- [ ] **Step 3: Update StreamList to read $recordingSettings and pass maxRetries**

In `src/components/streams/StreamList.tsx`:

Add the import for `$recordingSettings` (line 3, alongside the existing streams imports):
```tsx
import { $streams, $statuses } from "../../stores/streams";
import { $recordingSettings } from "../../stores/settings";
```

Inside the `StreamList` component body, after the existing `useStore` calls (around line 23–24), add:
```tsx
const recordingSettings = useStore($recordingSettings);
const maxRetries = recordingSettings?.reconnect.maxRetries ?? 0;
```

Then pass `maxRetries` to each `<StreamItem>` (currently around line 89):
```tsx
<StreamItem
  key={stream.id}
  stream={stream}
  status={statuses[stream.id]}
  isActiveRow={activeItemId === stream.id}
  isFocused={(segment) => isFocused(stream.id, segment)}
  maxRetries={maxRetries}
  onPrimaryAction={() => {
    const isRecording = statuses[stream.id]?.state === "recording";
    if (isRecording) tauri.stopRecording(stream.id).catch((e) => addToast(String(e), "error"));
    else tauri.startRecording(stream.id).catch((e) => addToast(String(e), "error"));
  }}
  onContextMenu={() => {
    const menuBtn = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-item-id="${CSS.escape(stream.id)}"] [data-context-menu-trigger]`
    );
    menuBtn?.click();
  }}
  onDelete={() => setPendingDeleteId(stream.id)}
/>
```

- [ ] **Step 4: Update the renderItem test helper to accept and forward maxRetries**

In `src/components/streams/StreamItem.test.tsx`, update `renderItem` (currently line 33) to accept `maxRetries` as a 4th parameter with default `0`:

```tsx
function renderItem(stream = mkStream(), status?: StreamStatus, focusedSeg = "summary", maxRetries = 0) {
  return render(
    <ul>
      <StreamItem
        stream={stream}
        status={status}
        isActiveRow
        isFocused={(seg) => seg === focusedSeg}
        maxRetries={maxRetries}
        onPrimaryAction={() => {}}
        onContextMenu={() => {}}
        onDelete={() => {}}
      />
    </ul>,
  );
}
```

- [ ] **Step 5: Run existing tests — verify they still pass**

```bash
npm test
```

Expected: all existing tests pass. If any fail, fix before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/components/streams/StreamItem.tsx src/components/streams/StreamList.tsx src/components/streams/StreamItem.test.tsx
git commit -m "refactor(streams): thread maxRetries prop from StreamList to StreamItem"
```

---

## Task 3: Write failing tests for reconnecting counter

**Files:**
- Modify: `src/components/streams/StreamItem.test.tsx`

- [ ] **Step 1: Add the reconnecting counter test suite to StreamItem.test.tsx**

Append the following new `describe` block at the end of `src/components/streams/StreamItem.test.tsx`:

```tsx
describe("StreamItem — reconnecting counter display", () => {
  const mkReconnecting = (reconnectAttempt: number | null): StreamStatus => ({
    streamId: "s1",
    state: "reconnecting",
    currentTrack: null,
    recordingStartedAt: null,
    bytesRecorded: 0,
    tracksRecorded: 0,
    error: null,
    reconnectAttempt,
  });

  it("shows 'Attempt N of max' in status cell and icon tooltip when maxRetries > 0", () => {
    const { container } = renderItem(mkStream(), mkReconnecting(3), "summary", 10);
    const statusCell = container.querySelector('[data-segment="status"]')!;
    expect(statusCell.textContent).toMatch(/attempt 3 of 10|спроба 3 з 10/i);
    const icon = container.querySelector('[role="img"]')!;
    expect(icon.getAttribute("aria-label")).toMatch(/attempt 3 of 10|спроба 3 з 10/i);
  });

  it("shows 'Attempt N' without max when maxRetries is 0 (unlimited)", () => {
    const { container } = renderItem(mkStream(), mkReconnecting(5), "summary", 0);
    const statusCell = container.querySelector('[data-segment="status"]')!;
    expect(statusCell.textContent).toMatch(/attempt 5|спроба 5/i);
    expect(statusCell.textContent).not.toMatch(/of \d|з \d/i);
    const icon = container.querySelector('[role="img"]')!;
    expect(icon.getAttribute("aria-label")).toMatch(/attempt 5|спроба 5/i);
    expect(icon.getAttribute("aria-label")).not.toMatch(/of \d|з \d/i);
  });

  it("falls back to 'Reconnecting...' when reconnectAttempt is null", () => {
    const { container } = renderItem(mkStream(), mkReconnecting(null), "summary", 10);
    const statusCell = container.querySelector('[data-segment="status"]')!;
    expect(statusCell.textContent).toMatch(/reconnecting|перепідключення/i);
    const icon = container.querySelector('[role="img"]')!;
    expect(icon.getAttribute("aria-label")).toMatch(/reconnecting|перепідключення/i);
  });
});
```

- [ ] **Step 2: Run the new tests — verify they fail**

```bash
npm test -- --reporter=verbose
```

Expected: the three new tests in "StreamItem — reconnecting counter display" FAIL (status cell and icon still show "Reconnecting..." / "Перепідключення..."). All previously passing tests still pass.

---

## Task 4: Implement retryLabel — make the tests pass

**Files:**
- Modify: `src/components/streams/StreamItem.tsx`

- [ ] **Step 1: Derive retryLabel in StreamItem**

In `src/components/streams/StreamItem.tsx`, after line 112 (`const techValue = formatBitrate(stream.bitrate);`), add:

```tsx
const retryAttempt = status?.reconnectAttempt ?? null;
const retryLabel =
  retryAttempt !== null && maxRetries > 0 ? m.status_reconnecting_attempt({ attempt: retryAttempt, max: maxRetries }) :
  retryAttempt !== null                   ? m.status_reconnecting_attempt_unlimited({ attempt: retryAttempt }) :
  m.status_reconnecting();
```

- [ ] **Step 2: Replace m.status_reconnecting() in statusIconLabel**

In `src/components/streams/StreamItem.tsx`, find `statusIconLabel` (around line 114–120). Replace the reconnecting branch:

Before:
```tsx
const statusIconLabel =
  state === "recording"    ? m.status_recording_label() :
  state === "connecting"   ? m.status_connecting() :
  state === "reconnecting" ? m.status_reconnecting() :
  state === "error"        ? m.status_error() :
  isThisStreamPlaying      ? m.segment_playing() :
  m.status_idle();
```

After:
```tsx
const statusIconLabel =
  state === "recording"    ? m.status_recording_label() :
  state === "connecting"   ? m.status_connecting() :
  state === "reconnecting" ? retryLabel :
  state === "error"        ? m.status_error() :
  isThisStreamPlaying      ? m.segment_playing() :
  m.status_idle();
```

- [ ] **Step 3: Replace m.status_reconnecting() in statusValue**

In `src/components/streams/StreamItem.tsx`, find `statusValue` (around line 122–126). Replace the reconnecting branch:

Before:
```tsx
const statusValue =
  state === "recording"    ? formatDuration(elapsedMs) :
  state === "connecting"   ? m.status_connecting() :
  state === "reconnecting" ? m.status_reconnecting() :
  m.status_idle();
```

After:
```tsx
const statusValue =
  state === "recording"    ? formatDuration(elapsedMs) :
  state === "connecting"   ? m.status_connecting() :
  state === "reconnecting" ? retryLabel :
  m.status_idle();
```

- [ ] **Step 4: Run all tests — verify they pass**

```bash
npm test
```

Expected: all tests pass, including the three new reconnecting counter tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamItem.tsx src/components/streams/StreamItem.test.tsx
git commit -m "feat(streams): show retry attempt counter in reconnecting state"
```
