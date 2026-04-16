# Phase 3I-1 — Windows High Contrast Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `forced-colors:` Tailwind classes to all 26 component files so every custom UI element is visible under Windows High Contrast mode.

**Architecture:** Inline `forced-colors:` Tailwind 4 classes in JSX. One global `@media (forced-colors: active)` block in styles.css for the focus ring. No new dependencies, no config changes, no Rust changes.

**Tech Stack:** Tailwind CSS 4 (`forced-colors:` variant), React, CSS system colors (ButtonFace, ButtonText, Canvas, CanvasText, Highlight, HighlightText, GrayText)

**Spec:** `docs/superpowers/specs/2026-04-17-phase-3i1-high-contrast-design.md`

---

## Chunk 1: Critical Visibility — Status Indicators, Toasts, Sliders, Action Buttons

These elements are completely invisible without forced-colors support.

### Task 1: StreamRow — Status Indicators + Action Buttons

**Files:**
- Modify: `src/components/streams/StreamRow.tsx`

- [ ] **Step 1: Add forced-colors to StatusIcon dots and REC label**

In `StatusIcon`, add forced-colors classes to each status dot and the REC text:

```tsx
// recording dot + REC label
<span aria-label={m.status_recording()} className="inline-flex items-center gap-1 text-xs font-bold text-red-400 forced-colors:text-[ButtonText]">
  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500 forced-colors:bg-[ButtonText] forced-colors:border forced-colors:border-[ButtonText]" aria-hidden="true" />
  REC
</span>

// connecting
<span aria-label={m.status_connecting()} className="h-2 w-2 animate-pulse rounded-full bg-yellow-400 forced-colors:bg-[ButtonText] forced-colors:border forced-colors:border-[ButtonText]" />

// reconnecting
<span aria-label={m.status_reconnecting()} className="h-2 w-2 animate-pulse rounded-full bg-yellow-500 forced-colors:bg-[ButtonText] forced-colors:border forced-colors:border-[ButtonText]" />

// error
<span aria-label={m.status_error()} className="h-2 w-2 rounded-full bg-red-600 forced-colors:bg-[ButtonText] forced-colors:border forced-colors:border-[ButtonText]" />

// idle
<span aria-label={m.status_idle()} className="h-2 w-2 rounded-full bg-slate-600 forced-colors:bg-[GrayText] forced-colors:border forced-colors:border-[ButtonText]" />
```

- [ ] **Step 2: Add forced-colors to action buttons and row hover**

Play button (active state):
```tsx
className={`rounded px-2 py-0.5 text-xs ${
  isThisStreamPlaying
    ? "bg-blue-700 text-white hover:bg-blue-600 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
    : "bg-slate-700 text-slate-300 hover:bg-slate-600 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
}`}
```

Record button:
```tsx
className={`rounded px-2 py-0.5 text-xs ${
  isRecording
    ? "bg-red-700 text-white hover:bg-red-600 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
    : "bg-slate-700 text-slate-300 hover:bg-slate-600 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
}`}
```

Row hover — on the `<Row>` element:
```tsx
<Row id={stream.id} className="border-b border-slate-800 hover:bg-slate-800/50 forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]" onContextMenu={handleContextMenu}>
```

- [ ] **Step 3: Commit**

```
git add src/components/streams/StreamRow.tsx
git commit -m "feat(a11y): add forced-colors to StreamRow status indicators and buttons"
```

### Task 2: ToastContainer — Toast Backgrounds

**Files:**
- Modify: `src/components/common/ToastContainer.tsx`

- [ ] **Step 1: Add forced-colors to toast type backgrounds**

Each toast type class gets forced-colors for border + text visibility:

```tsx
className={`flex items-center gap-2 rounded px-3 py-2 text-sm shadow-lg ${
  toast.type === "error" ? "bg-red-700 text-white forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]" :
  toast.type === "warning" ? "bg-amber-600 text-white forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]" :
  toast.type === "success" ? "bg-green-700 text-white forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]" :
  "bg-slate-700 text-slate-100 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]"
}`}
```

- [ ] **Step 2: Commit**

```
git add src/components/common/ToastContainer.tsx
git commit -m "feat(a11y): add forced-colors to ToastContainer"
```

### Task 3: PlaybackPosition + VolumeSlider — Slider Tracks & Thumbs

**Files:**
- Modify: `src/components/player/PlaybackPosition.tsx`
- Modify: `src/components/player/VolumeSlider.tsx`

- [ ] **Step 1: Add forced-colors to PlaybackPosition**

SliderTrack (line 40):
```tsx
className="relative h-1 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]"
```

SliderThumb (line 41-43):
```tsx
className="w-3 h-3 rounded-full bg-white top-1/2 -translate-y-1/2 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 forced-colors:bg-[ButtonText]"
```

Live stream track (line 58):
```tsx
className="h-1 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]"
```

Live pulse bar (line 59):
```tsx
className="h-full w-8 rounded bg-blue-400 animate-pulse forced-colors:bg-[Highlight]"
```

- [ ] **Step 2: Add forced-colors to VolumeSlider**

SliderTrack (line 28):
```tsx
className="relative h-1 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]"
```

SliderThumb (line 29-31):
```tsx
className="w-3 h-3 rounded-full bg-white top-1/2 -translate-y-1/2 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 forced-colors:bg-[ButtonText]"
```

- [ ] **Step 3: Commit**

```
git add src/components/player/PlaybackPosition.tsx src/components/player/VolumeSlider.tsx
git commit -m "feat(a11y): add forced-colors to PlaybackPosition and VolumeSlider"
```

### Task 4: StreamsPanel — Add Stream / Stop All Buttons

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx`

- [ ] **Step 1: Add forced-colors to EmptyState add button**

Line 18 — add button in EmptyState:
```tsx
className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
```

- [ ] **Step 2: Add forced-colors to Toolbar buttons**

Add stream button (line 38-40):
```tsx
className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
```

Stop all button (line 43-45):
```tsx
className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:text-[ButtonText]"
```

- [ ] **Step 3: Build verification**

Run: `just build-fast 2>&1 | Select-Object -Last 5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```
git add src/components/streams/StreamsPanel.tsx
git commit -m "feat(a11y): add forced-colors to StreamsPanel buttons"
```

---

## Chunk 2: Important UX — Focus Ring, Tabs, Command Palette, Activity Bar

### Task 5: styles.css — Global Focus Ring

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add @media (forced-colors: active) block for focus ring**

Append after the existing focus-visible block:

```css
@media (forced-colors: active) {
  button:focus-visible,
  [role="row"]:focus-visible,
  [role="menuitem"]:focus-visible,
  input:focus-visible,
  select:focus-visible,
  [tabindex]:focus-visible {
    outline: 2px solid Highlight !important;
    outline-offset: 2px;
  }
}
```

- [ ] **Step 2: Commit**

```
git add src/styles.css
git commit -m "feat(a11y): add forced-colors focus ring to styles.css"
```

### Task 6: SettingsDialog — Tab Indicator

**Files:**
- Modify: `src/components/settings/SettingsDialog.tsx`

- [ ] **Step 1: Add forced-colors to all Tab elements**

Each `<Tab>` (5 of them, all with identical className) — add to each className:
```
forced-colors:text-[ButtonText] forced-colors:selected:border-[Highlight] forced-colors:selected:text-[HighlightText]
```

Full class for each Tab:
```tsx
className="cursor-pointer border-b-2 border-transparent px-3 py-2 text-sm text-slate-400 outline-none hover:text-slate-200 selected:border-blue-400 selected:text-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText] forced-colors:selected:border-[Highlight] forced-colors:selected:text-[HighlightText]"
```

- [ ] **Step 2: Commit**

```
git add src/components/settings/SettingsDialog.tsx
git commit -m "feat(a11y): add forced-colors to SettingsDialog tabs"
```

### Task 7: CommandPalette — Selection + Input

**Files:**
- Modify: `src/components/common/CommandPalette.tsx`

- [ ] **Step 1: Add forced-colors to input and container**

CommandPalette container (line 112):
```tsx
className="h-fit w-[560px] overflow-hidden rounded-lg bg-slate-800 shadow-2xl forced-colors:border forced-colors:border-[ButtonText]"
```

Input (line 129):
```tsx
className="w-full border-b border-slate-600 bg-transparent p-4 text-slate-200 outline-none placeholder:text-slate-500 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]"
```

- [ ] **Step 2: Add forced-colors to selected/unselected list items**

Selected item (line 149-150):
```tsx
className={`flex cursor-pointer flex-col px-4 py-2.5 text-sm ${
  index === clampedIndex ? "bg-blue-600/30 text-slate-100 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]" : "text-slate-300 hover:bg-slate-700/50 forced-colors:text-[CanvasText]"
}`}
```

- [ ] **Step 3: Commit**

```
git add src/components/common/CommandPalette.tsx
git commit -m "feat(a11y): add forced-colors to CommandPalette"
```

### Task 8: ActivityBar — Button States

**Files:**
- Modify: `src/components/layout/ActivityBar.tsx`

- [ ] **Step 1: Add forced-colors to section buttons**

Navigation buttons (line 44-50) — update the className template literal:
```tsx
className={`flex h-10 w-10 items-center justify-center rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
  activeSection === section.id
    ? "bg-slate-700 text-blue-400 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
    : section.disabled
    ? "cursor-not-allowed text-slate-600 forced-colors:text-[GrayText]"
    : "text-slate-400 hover:bg-slate-700 hover:text-slate-200 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
}`}
```

Settings button — add forced-colors:
```tsx
className="flex h-10 w-10 items-center justify-center rounded text-slate-400 hover:bg-slate-700 hover:text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
```

- [ ] **Step 2: Build verification**

Run: `just build-fast 2>&1 | Select-Object -Last 5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```
git add src/components/layout/ActivityBar.tsx
git commit -m "feat(a11y): add forced-colors to ActivityBar"
```

---

## Chunk 3: Dialogs, Settings Tabs, Layout, Remaining Components

### Task 9: AddStreamDialog — Input Borders + Error Text

**Files:**
- Modify: `src/components/streams/AddStreamDialog.tsx`

- [ ] **Step 1: Add forced-colors to modal, inputs, error**

Modal (line 50):
```tsx
className="w-96 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]"
```

URL input (line 66):
```tsx
className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:border-blue-500 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText] forced-colors:focus:border-[Highlight]"
```

Name input (line 79):
```tsx
className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:border-blue-500 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText] forced-colors:focus:border-[Highlight]"
```

Error text (line 82):
```tsx
<p role="alert" className="text-sm text-red-400 forced-colors:text-[CanvasText]">{error}</p>
```

- [ ] **Step 2: Commit**

```
git add src/components/streams/AddStreamDialog.tsx
git commit -m "feat(a11y): add forced-colors to AddStreamDialog"
```

### Task 10: AddPatternDialog — Modal + Input Borders

**Files:**
- Modify: `src/components/wishlist/AddPatternDialog.tsx`

- [ ] **Step 1: Add forced-colors to modal, input, cancel button**

Modal (line 39):
```tsx
className="w-96 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]"
```

Input (line 54):
```tsx
className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-slate-100 outline-none focus:border-blue-500 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText] forced-colors:focus:border-[Highlight]"
```

Cancel button — add forced-colors:text:
```tsx
className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:text-[ButtonText]"
```

- [ ] **Step 2: Commit**

```
git add src/components/wishlist/AddPatternDialog.tsx
git commit -m "feat(a11y): add forced-colors to AddPatternDialog"
```

### Task 11: ConfirmDialog — Danger Button

**Files:**
- Modify: `src/components/common/ConfirmDialog.tsx`

- [ ] **Step 1: Add forced-colors to modal and delete button**

Modal (line 18):
```tsx
className="w-80 rounded-lg bg-slate-800 p-6 shadow-2xl outline-none forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]"
```

Cancel button (line 26):
```tsx
className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 forced-colors:text-[ButtonText]"
```

Delete/confirm button (line 31):
```tsx
className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
```

- [ ] **Step 2: Commit**

```
git add src/components/common/ConfirmDialog.tsx
git commit -m "feat(a11y): add forced-colors to ConfirmDialog"
```

### Task 12: StreamContextMenu — Delete Item

**Files:**
- Modify: `src/components/streams/StreamContextMenu.tsx`

- [ ] **Step 1: Add forced-colors to delete menu item**

Delete MenuItem (line 116):
```tsx
className="cursor-pointer px-3 py-1.5 text-sm text-red-400 outline-none hover:bg-slate-700 focus:bg-slate-700 forced-colors:text-[CanvasText]"
```

- [ ] **Step 2: Commit**

```
git add src/components/streams/StreamContextMenu.tsx
git commit -m "feat(a11y): add forced-colors to StreamContextMenu delete item"
```

### Task 13: PatternTable — Row Hover

**Files:**
- Modify: `src/components/wishlist/PatternTable.tsx`

- [ ] **Step 1: Add forced-colors to row hover**

Row (line 54):
```tsx
<Row key={item.pattern} className="border-b border-slate-800 hover:bg-slate-800/50 forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]">
```

- [ ] **Step 2: Commit**

```
git add src/components/wishlist/PatternTable.tsx
git commit -m "feat(a11y): add forced-colors to PatternTable row hover"
```

### Task 14: PlayerPanel — Disabled Buttons

**Files:**
- Modify: `src/components/player/PlayerPanel.tsx`

- [ ] **Step 1: Add forced-colors to play/pause and stop buttons**

Play/pause button (line 66):
```tsx
className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText] forced-colors:disabled:border-[GrayText]"
```

Stop button (line 77):
```tsx
className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText] forced-colors:disabled:border-[GrayText]"
```

- [ ] **Step 2: Commit**

```
git add src/components/player/PlayerPanel.tsx
git commit -m "feat(a11y): add forced-colors to PlayerPanel disabled buttons"
```

- [ ] **Step 3: Mid-chunk build verification**

Run: `just build-fast 2>&1 | Select-Object -Last 5`
Expected: Build succeeds

### Task 15: GeneralTab — Disabled Checkboxes

**Files:**
- Modify: `src/components/settings/GeneralTab.tsx`

- [ ] **Step 1: Add forced-colors to disabled checkbox labels**

Minimize to tray checkbox (line 122):
```tsx
className="flex items-center gap-2 text-sm text-slate-500 forced-colors:text-[GrayText]"
```

Tray disabled hint spans (lines 128-129):
```tsx
className="text-xs text-slate-600 forced-colors:text-[GrayText]"
```

Show tray notifications checkbox (line 137):
```tsx
className="flex items-center gap-2 text-sm text-slate-500 forced-colors:text-[GrayText]"
```

Second tray disabled hint (line 143-144):
```tsx
className="text-xs text-slate-600 forced-colors:text-[GrayText]"
```

- [ ] **Step 2: Commit**

```
git add src/components/settings/GeneralTab.tsx
git commit -m "feat(a11y): add forced-colors to GeneralTab disabled checkboxes"
```

### Task 16: HotkeysTab — Warning Text

**Files:**
- Modify: `src/components/settings/HotkeysTab.tsx`

- [ ] **Step 1: Add forced-colors to registration error text**

Error paragraph (line 79):
```tsx
className="text-sm text-red-300 forced-colors:text-[CanvasText]"
```

- [ ] **Step 2: Commit**

```
git add src/components/settings/HotkeysTab.tsx
git commit -m "feat(a11y): add forced-colors to HotkeysTab warnings"
```

### Task 17: KeyRecorder — Buttons + Error

**Files:**
- Modify: `src/components/settings/KeyRecorder.tsx`

- [ ] **Step 1: Add forced-colors to record button, clear button, error**

Record button (line 84):
```tsx
className="min-w-36 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText] forced-colors:focus:ring-[Highlight]"
```

Clear button (line 91):
```tsx
className="rounded border border-slate-600 bg-slate-700 px-2 py-2 text-sm text-slate-400 hover:text-slate-200 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border-[ButtonText] forced-colors:text-[ButtonText] forced-colors:focus:ring-[Highlight]"
```

Error text (line 96):
```tsx
className="text-xs text-red-400 forced-colors:text-[CanvasText]"
```

- [ ] **Step 2: Commit**

```
git add src/components/settings/KeyRecorder.tsx
git commit -m "feat(a11y): add forced-colors to KeyRecorder"
```

### Task 18: WishlistPanel — Add Buttons

**Files:**
- Modify: `src/components/wishlist/WishlistPanel.tsx`

- [ ] **Step 1: Add forced-colors to add pattern buttons**

Wishlist add button (line 118):
```tsx
className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText] forced-colors:focus-visible:outline-[Highlight]"
```

Ignorelist add button (line 140):
```tsx
className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText] forced-colors:focus-visible:outline-[Highlight]"
```

- [ ] **Step 2: Commit**

```
git add src/components/wishlist/WishlistPanel.tsx
git commit -m "feat(a11y): add forced-colors to WishlistPanel buttons"
```

### Task 19: Settings Input Tabs — RecordingTab, ReconnectionTab, AudioTab

**Files:**
- Modify: `src/components/settings/RecordingTab.tsx`
- Modify: `src/components/settings/ReconnectionTab.tsx`
- Modify: `src/components/settings/AudioTab.tsx`

- [ ] **Step 1: RecordingTab — browse button forced-colors**

Browse button (line 60):
```tsx
className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
```

All `<Input>` fields in RecordingTab (lines 55, 74, 87, 97, 145) already have `border-slate-600 bg-slate-700`. Add to each:
```
forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]
```

- [ ] **Step 2: ReconnectionTab — input fields forced-colors**

All 4 `<Input>` fields (lines 42, 58, 75, 91) — add to each className:
```
forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]
```

- [ ] **Step 3: AudioTab — select button and refresh button forced-colors**

Select trigger button (line 69):
```tsx
className="mt-1 flex w-80 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]"
```

Refresh button (line 96):
```tsx
className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
```

- [ ] **Step 4: Commit**

```
git add src/components/settings/RecordingTab.tsx src/components/settings/ReconnectionTab.tsx src/components/settings/AudioTab.tsx
git commit -m "feat(a11y): add forced-colors to settings input tabs"
```

### Task 20: Layout — StatusBar, SectionHeader, StreamTable

**Files:**
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/components/layout/SectionHeader.tsx`
- Modify: `src/components/streams/StreamTable.tsx`

- [ ] **Step 1: StatusBar — border and text forced-colors**

Footer (line 42):
```tsx
className="flex items-center gap-4 border-t border-slate-700 px-4 py-1.5 text-xs text-slate-400 forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]"
```

- [ ] **Step 2: SectionHeader — border, button text, hover**

Header div (line 10):
```tsx
className="flex items-center justify-between border-b border-slate-700 px-4 py-2 forced-colors:border-[ButtonText]"
```

Button (line 17):
```tsx
className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText] forced-colors:focus-visible:outline-[Highlight]"
```

- [ ] **Step 3: StreamTable — table header border**

TableHeader (line 62):
```tsx
className="border-b border-slate-700 text-xs text-slate-500 uppercase forced-colors:border-[ButtonText]"
```

- [ ] **Step 4: Commit**

```
git add src/components/layout/StatusBar.tsx src/components/layout/SectionHeader.tsx src/components/streams/StreamTable.tsx
git commit -m "feat(a11y): add forced-colors to StatusBar, SectionHeader, StreamTable"
```

### Task 21: ErrorBoundary — Error Text

**Files:**
- Modify: `src/components/common/ErrorBoundary.tsx`

- [ ] **Step 1: Add forced-colors to error heading**

Error heading (line 24):
```tsx
className="text-xl font-bold text-red-400 forced-colors:text-[CanvasText]"
```

- [ ] **Step 2: Commit**

```
git add src/components/common/ErrorBoundary.tsx
git commit -m "feat(a11y): add forced-colors to ErrorBoundary"
```

### Task 22: Final Build Verification + Testing Doc

- [ ] **Step 1: Full build**

Run: `just build-fast 2>&1 | Select-Object -Last 5`
Expected: Build succeeds

- [ ] **Step 2: Add testing checklist**

Append the visual testing checklist from the spec to `docs/testing/manual-testing-phase3i1-high-contrast.md`.

- [ ] **Step 3: Commit testing doc**

```
git add docs/testing/manual-testing-phase3i1-high-contrast.md
git commit -m "docs: add Phase 3I-1 High Contrast manual testing checklist"
```

- [ ] **Step 4: Update implementation-phases.md to mark Phase 3I-1**

Mark Phase 3I-1 as ✅ Complete in docs.

```
git add docs/implementation-phases.md
git commit -m "docs: mark Phase 3I-1 as complete"
```
