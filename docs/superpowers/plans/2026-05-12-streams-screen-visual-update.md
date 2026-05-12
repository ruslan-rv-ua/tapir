# Streams Screen Visual Update Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the visual styling of the Streams screen to match the reference design (`docs/ui/01-streams-screen.html`) — metric cards, pill filter chips, rounded card wrapper around the stream list, larger status dot with ring shadow, and icon+text action buttons.

**Architecture:** Pure CSS/Tailwind class changes plus minimal DOM additions (wrapper `<div>`s and `<span>`s). All business logic, accessibility attributes, keyboard navigation, and the empty-state branch remain untouched. `StreamList.tsx` requires no changes.

**Tech Stack:** Tailwind CSS (utility classes), React 19 JSX, existing i18n via Paraglide.js (`m.*` functions), Unicode symbols for icons.

---

## Chunk 1: StreamsPanel.tsx

### Task 1: Metric cards — styled card shell

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx` (metrics bar section, ~lines 207–225)

**Reference:** Spec § "Metrics bar"

The metrics bar outer container changes `py-3` → `py-4`. Each of the 4 inner metric `<div>`s gains card classes. Forced-colors classes added to new card border/bg.

- [ ] **Step 1: Open `src/components/streams/StreamsPanel.tsx` and find the metrics bar**

  Locate (around line 208):
  ```tsx
  <div className="grid grid-cols-4 gap-3 border-b border-slate-700 px-4 py-3 forced-colors:border-[ButtonText]">
    <div className="flex flex-col gap-0.5">
  ```

- [ ] **Step 2: Update outer container padding**

  Change `py-3` → `py-4`:
  ```tsx
  <div className="grid grid-cols-4 gap-3 border-b border-slate-700 px-4 py-4 forced-colors:border-[ButtonText]">
  ```

- [ ] **Step 3: Update all 4 metric card divs**

  Change each of the four inner divs from:
  ```tsx
  <div className="flex flex-col gap-0.5">
  ```
  to:
  ```tsx
  <div className="flex flex-col gap-1.5 rounded-2xl border border-white/[.06] bg-white/[.04] p-4 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas]">
  ```
  There are exactly 4 occurrences (streams, active recordings, errors, free space).

- [ ] **Step 4: Verify TypeScript compiles**

  Run in `src-tauri/` parent (repo root):
  ```
  cd C:\dev\Tapir && npx tsc --noEmit
  ```
  Expected: no errors (pre-existing paraglide message import warnings are acceptable).

- [ ] **Step 5: Commit**

  ```
  git add src/components/streams/StreamsPanel.tsx
  git commit -m "style(streams): metric cards with rounded border and bg"
  ```

---

### Task 2: Filter chips — pill shape

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx` (chip className, ~lines 304–309)

**Reference:** Spec § "Filter chips"

- [ ] **Step 1: Find the filter chip className in StreamsPanel.tsx**

  Locate the chip button `className` template string (around line 304):
  ```tsx
  className={`rounded px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
    activeChip === chip.id
      ? "bg-blue-600 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
      : "text-slate-400 hover:bg-slate-800 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
  }`}
  ```

- [ ] **Step 2: Replace with pill-shape classes**

  ```tsx
  className={`rounded-full px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
    activeChip === chip.id
      ? "border border-sky-300/[.22] bg-sky-400/[.14] text-slate-100 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
      : "border border-slate-700/50 text-slate-400 hover:bg-slate-800 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
  }`}
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```
  cd C:\dev\Tapir && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```
  git add src/components/streams/StreamsPanel.tsx
  git commit -m "style(streams): filter chips → pill shape"
  ```

---

### Task 3: Table-wrap — column headers + StreamList inside rounded card, grid 240px

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx` (column headers + StreamList render section, ~lines 316–336)
- Modify: `src/components/streams/StreamItem.tsx` (`<li>` gridTemplateColumns, ~line 114)

**Reference:** Spec § "Column headers + Stream list — wrap in table-wrap", § "Grid template columns", § "Scroll ownership chain"

The column headers `<div>` and `<StreamList>` are wrapped in two new container `<div>`s. The `<ul>` inside `StreamList` already has `flex-1 overflow-auto` — every ancestor must have `flex flex-1 flex-col overflow-hidden` for scroll to work correctly.

- [ ] **Step 1: Find the column headers section in StreamsPanel.tsx**

  Locate (around line 316):
  ```tsx
  {/* ── Column headers (visual only) ── */}
  <div
    aria-hidden="true"
    className="grid border-b border-slate-700 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-500 forced-colors:border-[ButtonText]"
    style={{ gridTemplateColumns: "100px 1fr 1.5fr 90px 90px 160px" }}
  >
    <span style={{ gridColumn: 1 }}>{m.column_status()}</span>
    <span style={{ gridColumn: 2 }}>{m.column_station()}</span>
    <span style={{ gridColumn: 3 }}>{m.column_now_playing()}</span>
    <span style={{ gridColumn: 4 }}>{m.column_bitrate()}</span>
    <span style={{ gridColumn: 5 }}>{m.column_duration()}</span>
    <span style={{ gridColumn: 6 }}>{m.column_actions()}</span>
  </div>

  {/* ── Stream list zone ── */}
  <StreamList
    ref={streamListCallbackRef}
    exitZone={(forward) => exitZone("streams-list", forward)}
    onEmpty={() => {/* handled by isEmpty effect */}}
  />
  ```

- [ ] **Step 2: Wrap both elements in the content-pad + card containers**

  Replace the entire block above with:
  ```tsx
  {/* Content pad wrapper */}
  <div className="flex flex-1 flex-col overflow-hidden px-4 py-3">
    {/* Rounded card container */}
    <div className="flex flex-1 flex-col overflow-hidden rounded-[18px] border border-slate-700/60 bg-white/[.02] forced-colors:border-[ButtonText]">
      {/* ── Column headers (visual only) ── */}
      <div
        aria-hidden="true"
        className="grid border-b border-slate-700 bg-white/[.04] px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas]"
        style={{ gridTemplateColumns: "100px 1fr 1.5fr 90px 90px 240px" }}
      >
        <span style={{ gridColumn: 1 }}>{m.column_status()}</span>
        <span style={{ gridColumn: 2 }}>{m.column_station()}</span>
        <span style={{ gridColumn: 3 }}>{m.column_now_playing()}</span>
        <span style={{ gridColumn: 4 }}>{m.column_bitrate()}</span>
        <span style={{ gridColumn: 5 }}>{m.column_duration()}</span>
        <span style={{ gridColumn: 6 }}>{m.column_actions()}</span>
      </div>

      {/* ── Stream list zone ── */}
      <StreamList
        ref={streamListCallbackRef}
        exitZone={(forward) => exitZone("streams-list", forward)}
        onEmpty={() => {/* handled by isEmpty effect */}}
      />
    </div>
  </div>
  ```

  Key points:
  - Both new wrapper `<div>`s use `flex flex-1 flex-col overflow-hidden` — critical for scroll chain
  - `gridTemplateColumns` on the headers div is updated to `240px` actions column
  - The headers div no longer has an outer border-b role — the border-b now acts as the card's inner divider

- [ ] **Step 3: Update `<li>` gridTemplateColumns in StreamItem.tsx**

  The `<li>` grid must match the column headers grid. Locate (around line 114 in `StreamItem.tsx`):
  ```tsx
  style={{ gridTemplateColumns: "100px 1fr 1.5fr 90px 90px 160px" }}
  ```
  Change to:
  ```tsx
  style={{ gridTemplateColumns: "100px 1fr 1.5fr 90px 90px 240px" }}
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  ```
  cd C:\dev\Tapir && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 5: Verify visually in dev server**

  ```
  cd C:\dev\Tapir && just dev
  ```
  With at least one stream present, confirm:
  - Stream list is inside a rounded card with visible border
  - Column headers row is inside the card, above the stream rows
  - Header "Actions" column and stream row actions cell are visually aligned (both 240px)
  - Scrolling the list works (only the `<ul>` scrolls, not the whole panel)

- [ ] **Step 6: Commit**

  ```
  git add src/components/streams/StreamsPanel.tsx src/components/streams/StreamItem.tsx
  git commit -m "style(streams): wrap list in rounded card, actions col 240px"
  ```

---

## Chunk 2: StreamItem.tsx + StreamContextMenu.tsx

### Task 4: Status dot — larger size, ring shadow, forced-colors

**Files:**
- Modify: `src/components/streams/StreamItem.tsx` (status dot span, ~lines 134–144)

**Reference:** Spec § "Status dot"

- [ ] **Step 1: Find the status dot `<span>` in StreamItem.tsx**

  Locate (around line 134):
  ```tsx
  <span
    className={`h-2 w-2 shrink-0 rounded-full ${
      state === "recording"
        ? "bg-red-500"
        : state === "connecting" || state === "reconnecting"
        ? "bg-amber-400"
        : state === "error"
        ? "bg-red-500"
        : "bg-green-500"
    }`}
  />
  ```

- [ ] **Step 2: Replace with larger dot + ring shadow + forced-colors**

  ```tsx
  <span
    className={`h-2.5 w-2.5 shrink-0 rounded-full forced-colors:shadow-none ${
      state === "recording" || state === "error"
        ? "bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,.2)] forced-colors:bg-[Highlight]"
        : state === "connecting" || state === "reconnecting"
        ? "bg-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,.18)] forced-colors:bg-[Highlight]"
        : "bg-green-500 shadow-[0_0_0_3px_rgba(34,197,94,.15)] forced-colors:bg-[Highlight]"
    }`}
  />
  ```

  Note: `recording` and `error` are grouped together (same color/shadow). `forced-colors:shadow-none` suppresses the box-shadow ring in High Contrast mode where shadows are stripped by the system.

- [ ] **Step 3: Verify TypeScript compiles**

  ```
  cd C:\dev\Tapir && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```
  git add src/components/streams/StreamItem.tsx
  git commit -m "style(streams): status dot larger with ring shadow"
  ```

---

### Task 5: Play button — icon + text label

**Files:**
- Modify: `src/components/streams/StreamItem.tsx` (play button, ~lines 212–219)

**Reference:** Spec § "Play/Stop-playback button — add text label"

The `aria-label` already provides the full accessible name — the visible text is purely decorative. Uses existing i18n keys `m.play()` = "Відтворити" and `m.stop()` = "Зупинити".

- [ ] **Step 1: Find the play button in StreamItem.tsx**

  Locate (around line 212):
  ```tsx
  <button
    tabIndex={-1}
    onClick={handlePlayToggle}
    aria-label={isThisStreamPlaying ? m.stop_stream_playback() : m.play_stream()}
    className={`rounded px-2 py-0.5 text-xs ${isThisStreamPlaying ? "bg-blue-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]" : "bg-slate-700 text-slate-300 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"}`}
  >
    {isThisStreamPlaying ? "■" : "▶"}
  </button>
  ```

- [ ] **Step 2: Replace with icon+text version**

  ```tsx
  <button
    tabIndex={-1}
    onClick={handlePlayToggle}
    aria-label={isThisStreamPlaying ? m.stop_stream_playback() : m.play_stream()}
    className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-0.5 text-xs ${isThisStreamPlaying ? "bg-blue-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]" : "bg-slate-700 text-slate-300 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"}`}
  >
    <span aria-hidden="true">{isThisStreamPlaying ? "■" : "▶"}</span>
    <span>{isThisStreamPlaying ? m.stop() : m.play()}</span>
  </button>
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```
  cd C:\dev\Tapir && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```
  git add src/components/streams/StreamItem.tsx
  git commit -m "style(streams): play button icon+text"
  ```

---

### Task 6: Record button — add leading icon

**Files:**
- Modify: `src/components/streams/StreamItem.tsx` (record button, ~lines 220–227)

**Reference:** Spec § "Record button — add icon to match play button"

- [ ] **Step 1: Find the record button**

  Locate (around line 220):
  ```tsx
  <button
    tabIndex={-1}
    onClick={handleRecordToggle}
    aria-label={isRecording ? m.stop_recording() : m.start_recording()}
    className={`rounded px-2 py-0.5 text-xs ${isRecording ? "bg-red-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]" : "bg-slate-700 text-slate-300 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"}`}
  >
    {isRecording ? m.stop_recording() : m.start_recording()}
  </button>
  ```

- [ ] **Step 2: Replace with icon+text version**

  ```tsx
  <button
    tabIndex={-1}
    onClick={handleRecordToggle}
    aria-label={isRecording ? m.stop_recording() : m.start_recording()}
    className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-0.5 text-xs ${isRecording ? "bg-red-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]" : "bg-slate-700 text-slate-300 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"}`}
  >
    <span aria-hidden="true">{isRecording ? "⏹" : "⏺"}</span>
    <span>{isRecording ? m.stop_recording() : m.start_recording()}</span>
  </button>
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```
  cd C:\dev\Tapir && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```
  git add src/components/streams/StreamItem.tsx
  git commit -m "style(streams): record button icon+text"
  ```

---

### Task 7: StreamContextMenu — shrink-0 on trigger

**Files:**
- Modify: `src/components/streams/StreamContextMenu.tsx` (trigger Button, ~line 67)

**Reference:** Spec § "StreamContextMenu.tsx"

- [ ] **Step 1: Find the trigger Button className in StreamContextMenu.tsx**

  Locate (around line 67):
  ```tsx
  className="inline-flex items-center justify-center rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
  ```

- [ ] **Step 2: Add `shrink-0`**

  ```tsx
  className="inline-flex shrink-0 items-center justify-center rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```
  cd C:\dev\Tapir && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```
  git add src/components/streams/StreamContextMenu.tsx
  git commit -m "style(streams): context menu trigger shrink-0"
  ```

---

## Final Verification

- [ ] **Run full TypeScript check one more time**

  ```
  cd C:\dev\Tapir && npx tsc --noEmit
  ```
  Expected: no new errors vs baseline.

- [ ] **Start dev server and visually inspect**

  ```
  cd C:\dev\Tapir && just dev
  ```

  Check with at least one stream in the list:
  - [ ] Metrics bar shows 4 cards with rounded border
  - [ ] Filter chips are pill-shaped with border
  - [ ] Stream list is inside a rounded card container
  - [ ] Scrolling the stream list works (list scrolls, not the whole panel)
  - [ ] Status dot is slightly larger with a soft glow ring
  - [ ] Play button shows "▶ Відтворити" / "■ Зупинити"
  - [ ] Record button shows "⏺ Почати запис" / "⏹ Зупинити запис"
  - [ ] Context menu ⋯ button is not squished (only `shrink-0` added, no `whitespace-nowrap`)
  - [ ] Header "Actions" column and row actions cell are visually aligned
  - [ ] Empty state (no streams) is visually unchanged

- [ ] **Optional: verify NVDA by tabbing through the stream list** — aria-labels should announce button actions, not the Unicode symbols.
