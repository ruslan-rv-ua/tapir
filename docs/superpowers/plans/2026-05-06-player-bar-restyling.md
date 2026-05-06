# Player Bar Restyling Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `PlayerPanel` to match the approved design spec — card panels, larger transport buttons, pulsing LiveBadge, cleaner Panel 3.

**Architecture:** Pure visual changes — no logic, no IPC, no Rust changes. New `LiveBadge` component added. Tailwind CSS class updates across `PlayerPanel.tsx`, `PlaybackPosition.tsx`, `VolumeSlider.tsx`. New `@keyframes` in `styles.css`. One new i18n key.

**Tech Stack:** React 19, Tailwind CSS v4, React Aria Components, Paraglide.js (i18n), lucide-react

**Spec:** `docs/superpowers/specs/2026-05-06-player-bar-restyling-design.md`

**Verification command (run after each task):**
```
cd C:\dev\Tapir && npx tsc --noEmit 2>&1
```
Expected output: **no new errors from your changes**. The project has ~29 pre-existing errors (Paraglide declaration imports + `StreamContextMenu` prop) — these are expected and can be ignored. If unsure whether an error is pre-existing, run the check before making your changes and compare.

---

## Chunk 1: Foundation — i18n + animation + LiveBadge

### Task 1: Add `live_stream_short` i18n key

**Files:**
- Modify: `src/i18n/messages/uk.json`
- Modify: `src/i18n/messages/en.json`

- [ ] **Step 1: Add key to uk.json** — insert after the existing `"live_stream"` line:

  In `src/i18n/messages/uk.json`, find:
  ```json
  "live_stream": "Живий потік",
  ```
  Add after it:
  ```json
  "live_stream_short": "LIVE",
  ```

- [ ] **Step 2: Add key to en.json** — insert after the existing `"live_stream"` line:

  In `src/i18n/messages/en.json`, find:
  ```json
  "live_stream": "Live stream",
  ```
  Add after it:
  ```json
  "live_stream_short": "LIVE",
  ```

- [ ] **Step 3: Regenerate Paraglide messages**

  Paraglide in this project compiles via the Vite plugin (`paraglideVitePlugin` in `vite.config.ts`) — there is no standalone compile command. Trigger compilation with:
  ```
  cd C:\dev\Tapir && npx vite build 2>&1
  ```
  Expected: Build completes with no errors. The Paraglide plugin regenerates `src/i18n/paraglide/messages.js` with outdir `./src/i18n/paraglide`.

  Verify the new key exists:
  ```
  cd C:\dev\Tapir && Select-String "live_stream_short" src\i18n\paraglide\messages.js
  ```
  Expected: at least one match.

- [ ] **Step 4: TypeScript check**

  Run:
  ```
  cd C:\dev\Tapir && npx tsc --noEmit 2>&1
  ```
  Expected: no new errors from your changes. Pre-existing ~29 errors (Paraglide + StreamContextMenu) are OK.

- [ ] **Step 5: Commit**

  Note: `src/i18n/paraglide/` is in `.gitignore` — commit only the source message files.
  ```
  git add src/i18n/messages/uk.json src/i18n/messages/en.json
  git commit -m "feat(i18n): add live_stream_short key for LiveBadge"
  ```

---

### Task 2: Add `@keyframes live-pulse` to `styles.css`

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Append animation to styles.css**

  Append to the end of `src/styles.css`:
  ```css
  @keyframes live-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
    50%       { box-shadow: 0 0 0 5px rgba(239, 68, 68, 0); }
  }

  @theme {
    --animate-live-pulse: live-pulse 1.4s ease-in-out infinite;
  }
  ```

- [ ] **Step 2: Verify CSS syntax via Vite build**

  `npx tsc --noEmit` cannot validate CSS or Tailwind `@theme` syntax. Verify the CSS change with a Vite build:
  ```
  cd C:\dev\Tapir && npx vite build 2>&1
  ```
  Expected: Build succeeds with no CSS/Tailwind errors.

- [ ] **Step 3: Commit**

  ```
  git add src/styles.css
  git commit -m "style: add live-pulse keyframe animation for LiveBadge"
  ```

---

### Task 3: Create `LiveBadge` component

**Files:**
- Create: `src/components/player/LiveBadge.tsx`

- [ ] **Step 1: Create the file**

  Create `src/components/player/LiveBadge.tsx` with the following content:
  ```tsx
  import * as m from "../../i18n/paraglide/messages";

  export function LiveBadge() {
    return (
      <span
        aria-label={m.live_stream()}
        className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-0.5
                   rounded-full bg-red-500/15 border border-red-500/30
                   text-red-300 text-xs font-bold tracking-widest uppercase
                   forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
      >
        <span
          aria-hidden="true"
          className="w-2 h-2 rounded-full bg-red-500 shrink-0
                     motion-safe:animate-live-pulse
                     forced-colors:bg-[ButtonText]"
        />
        {m.live_stream_short()}
      </span>
    );
  }
  ```

  **Notes:**
  - `aria-label={m.live_stream()}` — NVDA reads "Живий потік" / "Live stream", not the dot
  - `aria-hidden="true"` on dot span — screen reader skips the dot entirely
  - `motion-safe:animate-live-pulse` — animation only when `prefers-reduced-motion` is NOT set
  - `forced-colors:` classes replace all colors with system colors in High Contrast mode

- [ ] **Step 2: TypeScript check**

  Run:
  ```
  cd C:\dev\Tapir && npx tsc --noEmit 2>&1
  ```
  Expected: no new errors from your changes. Pre-existing ~29 errors are OK.

- [ ] **Step 3: Commit**

  ```
  git add src/components/player/LiveBadge.tsx
  git commit -m "feat(player): add LiveBadge component with pulsing animation and a11y"
  ```

---

## Chunk 2: PlayerPanel Restyle

### Task 4: Update PlayerPanel container and panel card styles

**Files:**
- Modify: `src/components/player/PlayerPanel.tsx`

This task covers ONLY the wrapper `div` and all three `article` elements — not the inner content yet.

- [ ] **Step 1: Update container div classes** (line 208)

  Find:
  ```tsx
  className="grid grid-cols-3 gap-4 px-4 py-2 bg-slate-900 border-t border-slate-700 shrink-0 forced-colors:border-[ButtonText]"
  ```
  Replace with:
  ```tsx
  className="grid grid-cols-[1.15fr_1.2fr_minmax(200px,0.85fr)] gap-4 px-6 py-4 bg-gradient-to-b from-white/[0.03] to-white/[0.01] border-t border-white/[0.08] shrink-0 forced-colors:border-[ButtonText]"
  ```

- [ ] **Step 2: Update Panel 1 article classes** (line 211)

  Find:
  ```tsx
  <article aria-label={m.player_now_playing()} className="flex flex-col gap-1 min-w-0">
  ```
  Replace with:
  ```tsx
  <article aria-label={m.player_now_playing()} className="rounded-[20px] bg-white/[0.04] border border-white/[0.06] p-4 flex flex-col gap-2 min-w-0">
  ```

- [ ] **Step 3: Update Panel 2 article classes** (line 227)

  Find:
  ```tsx
  <article aria-label={m.player_controls()} className="flex flex-col gap-2 min-w-0">
  ```
  Replace with:
  ```tsx
  <article aria-label={m.player_controls()} className="rounded-[20px] bg-white/[0.04] border border-white/[0.06] p-4 flex flex-col gap-2 min-w-0">
  ```

- [ ] **Step 4: Update Panel 3 article classes** (line 301)

  Find:
  ```tsx
  <article aria-label={m.player_output()} className="flex flex-col gap-1.5 min-w-0">
  ```
  Replace with:
  ```tsx
  <article aria-label={m.player_output()} className="rounded-[20px] bg-white/[0.04] border border-white/[0.06] p-4 flex flex-col gap-2 min-w-0">
  ```

- [ ] **Step 5: TypeScript check**

  Run:
  ```
  cd C:\dev\Tapir && npx tsc --noEmit 2>&1
  ```
  Expected: no new errors from your changes. Pre-existing ~29 errors (Paraglide + StreamContextMenu) are OK.

- [ ] **Step 6: Commit**

  ```
  git add src/components/player/PlayerPanel.tsx
  git commit -m "style(player): card panel layout — gradient container + rounded cards"
  ```

---

### Task 5: Update H3 headings and Panel 1 text styles

**Files:**
- Modify: `src/components/player/PlayerPanel.tsx`

- [ ] **Step 1: Update Panel 1 H3** (line 212)

  Find (Panel 1 h3):
  ```tsx
  <h3 aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
    {m.player_now_playing()}
  </h3>
  ```
  Replace with:
  ```tsx
  <h3 aria-hidden="true" className="text-base font-bold text-slate-100">
    {m.player_now_playing()}
  </h3>
  ```

- [ ] **Step 2: Update Panel 1 track name text** (line 215)

  Find:
  ```tsx
  <p className="text-sm text-slate-200 truncate">{sourceLabel}</p>
  ```
  Replace with:
  ```tsx
  <p className="text-base font-bold text-slate-100 truncate">{sourceLabel}</p>
  ```

- [ ] **Step 3: Update Panel 1 track info text** (line 216)

  Find:
  ```tsx
  <p className="text-xs text-slate-400 truncate">{trackDisplay}</p>
  ```
  Replace with:
  ```tsx
  <p className="text-sm text-slate-400 truncate">{trackDisplay}</p>
  ```

- [ ] **Step 4: Update Panel 1 meta row** (line 217)

  Find:
  ```tsx
  <div className="flex items-center gap-2 text-xs text-slate-500">
  ```
  Replace with:
  ```tsx
  <div className="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
  ```

- [ ] **Step 5: Update Panel 2 H3** (line 228)

  Find (Panel 2 h3):
  ```tsx
  <h3 aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
    {m.player_controls()}
  </h3>
  ```
  Replace with:
  ```tsx
  <h3 aria-hidden="true" className="text-base font-bold text-slate-100">
    {m.player_controls()}
  </h3>
  ```

- [ ] **Step 6: Update Panel 3 H3** (line 302)

  Find (Panel 3 h3):
  ```tsx
  <h3 aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
    {m.player_output()}
  </h3>
  ```
  Replace with:
  ```tsx
  <h3 aria-hidden="true" className="text-base font-bold text-slate-100">
    {m.player_output()}
  </h3>
  ```

- [ ] **Step 7: TypeScript check**

  Run:
  ```
  cd C:\dev\Tapir && npx tsc --noEmit 2>&1
  ```
  Expected: no new errors from your changes. Pre-existing ~29 errors (Paraglide + StreamContextMenu) are OK.

- [ ] **Step 8: Commit**

  ```
  git add src/components/player/PlayerPanel.tsx
  git commit -m "style(player): update H3 headings and Panel 1 text styles"
  ```

---

### Task 6: Replace old Live span with LiveBadge

**Files:**
- Modify: `src/components/player/PlayerPanel.tsx`

- [ ] **Step 1: Add LiveBadge import** — add after the `formatBitrate` import line near the top of `PlayerPanel.tsx`:

  Find:
  ```tsx
  import { formatBitrate } from "../../lib/formatters";
  ```
  Add after it:
  ```tsx
  import { LiveBadge } from "./LiveBadge";
  ```

- [ ] **Step 2: Replace old Live span** (line 221)

  Find:
  ```tsx
  {source?.type === "stream" && (
    <span className="rounded bg-slate-700 px-1 py-0.5 text-xs">Live</span>
  )}
  ```
  Replace with:
  ```tsx
  {source?.type === "stream" && <LiveBadge />}
  ```

- [ ] **Step 3: TypeScript check**

  Run:
  ```
  cd C:\dev\Tapir && npx tsc --noEmit 2>&1
  ```
  Expected: no new errors from your changes. Pre-existing ~29 errors (Paraglide + StreamContextMenu) are OK.

- [ ] **Step 4: Commit**

  ```
  git add src/components/player/PlayerPanel.tsx
  git commit -m "feat(player): replace static Live span with animated LiveBadge"
  ```

---

### Task 7: Restyle transport buttons (Panel 2)

**Files:**
- Modify: `src/components/player/PlayerPanel.tsx`

The common secondary button class changes from `"p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText]"` to a larger 44×44px pill with subtle border/bg.

The Play/Pause button gets distinct primary styling: 52×52px blue square.

Icon sizes change: secondary buttons `size={16}` → `size={18}`, Play/Pause `size={16}` → `size={20}`.

- [ ] **Step 1: Update Prev button** (index 0)

  Find:
  ```tsx
  className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText]"
  >
    <SkipBack aria-hidden={true} size={16} />
  ```
  Replace with:
  ```tsx
  className="w-11 h-11 rounded-[14px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07] hover:border-white/[0.18] focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 forced-colors:border-[ButtonText] forced-colors:disabled:text-[GrayText]"
  >
    <SkipBack aria-hidden={true} size={18} />
  ```

- [ ] **Step 2: Update Play/Pause button** (index 1)

  Find:
  ```tsx
  className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText]"
  >
    {isPlaying ? <Pause aria-hidden={true} size={16} /> : <Play aria-hidden={true} size={16} />}
  ```
  Replace with:
  ```tsx
  className="w-[52px] h-[52px] rounded-2xl bg-blue-700 border border-transparent flex items-center justify-center hover:bg-blue-600 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 forced-colors:border-[ButtonText] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:disabled:text-[GrayText]"
  >
    {isPlaying ? <Pause aria-hidden={true} size={20} /> : <Play aria-hidden={true} size={20} />}
  ```

- [ ] **Step 3: Update Stop button** (index 2)

  Find:
  ```tsx
  className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText]"
  >
    <Square aria-hidden={true} size={16} />
  ```
  Replace with:
  ```tsx
  className="w-11 h-11 rounded-[14px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07] hover:border-white/[0.18] focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 forced-colors:border-[ButtonText] forced-colors:disabled:text-[GrayText]"
  >
    <Square aria-hidden={true} size={18} />
  ```

- [ ] **Step 4: Update Next button** (index 3)

  Find:
  ```tsx
  className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText]"
  >
    <SkipForward aria-hidden={true} size={16} />
  ```
  Replace with:
  ```tsx
  className="w-11 h-11 rounded-[14px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07] hover:border-white/[0.18] focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 forced-colors:border-[ButtonText] forced-colors:disabled:text-[GrayText]"
  >
    <SkipForward aria-hidden={true} size={18} />
  ```

- [ ] **Step 5: Update Mute button** (index 4)

  Find:
  ```tsx
  className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText]"
  >
    <VolumeX aria-hidden={true} size={16} />
  ```
  Replace with:
  ```tsx
  className="w-11 h-11 rounded-[14px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07] hover:border-white/[0.18] focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-35 forced-colors:border-[ButtonText] forced-colors:disabled:text-[GrayText]"
  >
    <VolumeX aria-hidden={true} size={18} />
  ```

- [ ] **Step 6: Add `items-center` to toolbar div** — the toolbar flex container needs centering for the mixed button sizes:

  Find:
  ```tsx
  <div role="toolbar" onKeyDown={transportKeyDown} className="flex items-center gap-1">
  ```
  Replace with:
  ```tsx
  <div role="toolbar" onKeyDown={transportKeyDown} className="flex items-center justify-center gap-2">
  ```

- [ ] **Step 7: TypeScript check**

  Run:
  ```
  cd C:\dev\Tapir && npx tsc --noEmit 2>&1
  ```
  Expected: no new errors from your changes. Pre-existing ~29 errors (Paraglide + StreamContextMenu) are OK.

- [ ] **Step 8: Commit**

  ```
  git add src/components/player/PlayerPanel.tsx
  git commit -m "style(player): resize transport buttons — 44px secondary, 52px play/pause"
  ```

---

### Task 8: Clean up Panel 3 — remove active recording and volume % rows

**Files:**
- Modify: `src/components/player/PlayerPanel.tsx`

- [ ] **Step 1: Remove active recording row** (lines 305-308 in original)

  Find:
  ```tsx
  <div className="flex items-center justify-between text-xs">
    <span className="text-slate-400">{m.player_active_recording()}</span>
    <strong className="text-slate-200 truncate ml-2">{activeRecordingName}</strong>
  </div>
  ```
  Delete this entire block.

- [ ] **Step 2: Remove volume % row** (lines 313-316 in original)

  Find:
  ```tsx
  <div className="flex items-center justify-between text-xs">
    <span className="text-slate-400">{m.player_volume()}</span>
    <strong className="text-slate-200">{`${Math.round(playerStatus.volume * 100)}%`}</strong>
  </div>
  ```
  Delete this entire block.

- [ ] **Step 3: Update device row text size** — align with new design:

  Find:
  ```tsx
  <div className="flex items-center justify-between text-xs">
    <span className="text-slate-400">{m.player_device()}</span>
    <strong className="text-slate-200 truncate ml-2">{settings?.outputDevice ?? "—"}</strong>
  </div>
  ```
  Replace with:
  ```tsx
  <div className="flex items-center justify-between text-sm">
    <span className="text-slate-400">{m.player_device()}</span>
    <strong className="text-slate-200 truncate ml-2">{settings?.outputDevice ?? "—"}</strong>
  </div>
  ```

- [ ] **Step 4: Check for unused variable `activeRecordingName`** — since we removed the row that used it, remove the variable declaration too.

  Find (around lines 72-74):
  ```tsx
  // Panel 3 data
  const activeRecordingName =
    streams.find(s => statuses[s.id]?.state === "recording")?.name ?? "—";
  ```
  Delete this block (all 3 lines).

- [ ] **Step 5: TypeScript check**

  Run:
  ```
  cd C:\dev\Tapir && npx tsc --noEmit 2>&1
  ```
  Expected: no new errors from your changes. Pre-existing ~29 errors are OK. The `activeRecordingName` unused-variable error should also be gone.

- [ ] **Step 6: Commit**

  ```
  git add src/components/player/PlayerPanel.tsx
  git commit -m "style(player): Panel 3 — remove active recording and volume % rows"
  ```

- [ ] **Step 7: Mid-chunk verification** — run `just dev`, then open the app and use browser DevTools (F12, accessible via keyboard) to verify DOM structure:

  Open browser DevTools → Elements panel. Navigate to the PlayerPanel root div and confirm:
  - Container `div` has `grid-cols-[1.15fr_1.2fr_minmax(200px,0.85fr)]` in its class
  - All 3 `article` elements have `rounded-[20px]` and `bg-white/[0.04]` in their class
  - All 3 `h3` elements have `text-base font-bold text-slate-100` (no longer `text-xs uppercase`)
  - Panel 2 toolbar: Play/Pause button has `w-[52px] h-[52px] bg-blue-700` in its class
  - Panel 3: only 3 child elements — h3, device row div, and volumeWrapperRef div (no recording row, no volume % row)

  Verify with NVDA:
  - Tab through transport buttons — all 5 are reachable and announce their labels
  - NVDA reads no unexpected elements in Panel 3 between H3 and VolumeSlider

---

## Chunk 3: Track and Slider Heights

### Task 9: Update `PlaybackPosition.tsx` track height

**Files:**
- Modify: `src/components/player/PlaybackPosition.tsx`

- [ ] **Step 1: Update SliderTrack height** (line 40)

  Find:
  ```tsx
  <SliderTrack className="relative h-1 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
  ```
  Replace with:
  ```tsx
  <SliderTrack className="relative h-2 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
  ```

- [ ] **Step 2: Update live stream progress bar height** (line 58)

  Find:
  ```tsx
  <div className="h-1 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
  ```
  Replace with:
  ```tsx
  <div className="h-2 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
  ```

- [ ] **Step 3: TypeScript check**

  Run:
  ```
  cd C:\dev\Tapir && npx tsc --noEmit 2>&1
  ```
  Expected: no new errors from your changes. Pre-existing ~29 errors (Paraglide + StreamContextMenu) are OK.

- [ ] **Step 4: Commit**

  ```
  git add src/components/player/PlaybackPosition.tsx
  git commit -m "style(player): increase playback position track height to 8px"
  ```

---

### Task 10: Update `VolumeSlider.tsx` track height and thumb size

**Files:**
- Modify: `src/components/player/VolumeSlider.tsx`

- [ ] **Step 1: Update SliderTrack height** (line 28)

  Find:
  ```tsx
  <SliderTrack className="relative h-1 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
  ```
  Replace with:
  ```tsx
  <SliderTrack className="relative h-2 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
  ```

- [ ] **Step 2: Update SliderThumb size** (line 31)

  Find:
  ```tsx
  className="w-3 h-3 rounded-full bg-white top-1/2 -translate-y-1/2 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 forced-colors:bg-[ButtonText]"
  ```
  Replace with:
  ```tsx
  className="w-3.5 h-3.5 rounded-full bg-white top-1/2 -translate-y-1/2 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 forced-colors:bg-[ButtonText]"
  ```

- [ ] **Step 3: TypeScript check**

  Run:
  ```
  cd C:\dev\Tapir && npx tsc --noEmit 2>&1
  ```
  Expected: no new errors from your changes. Pre-existing ~29 errors (Paraglide + StreamContextMenu) are OK.

- [ ] **Step 4: Commit**

  ```
  git add src/components/player/VolumeSlider.tsx
  git commit -m "style(player): increase volume slider track to 8px, thumb to 14px"
  ```

---

### Task 11: Final build verification

- [ ] **Step 1: Full TypeScript check**

  Run:
  ```
  cd C:\dev\Tapir && npx tsc --noEmit 2>&1
  ```
  Expected: no new errors from your changes. Pre-existing ~29 errors (Paraglide + StreamContextMenu) are OK.

- [ ] **Step 2: Rust check** (no Rust changes, but verify nothing broken by build system)

  Run:
  ```
  cd C:\dev\Tapir\src-tauri && cargo check 2>&1
  ```
  Expected: `Finished` with no errors.

- [ ] **Step 3: Run dev build and manual acceptance checklist**

  Run: `just dev`

  Verify each item from the spec. Use browser DevTools (F12) for class-based checks; use NVDA for interaction checks:
  - [ ] **Track heights (DevTools)**: Inspect `SliderTrack` in `PlaybackPosition` — class contains `h-2` (not `h-1`). Inspect live `ProgressBar` outer div — class contains `h-2`
  - [ ] **Volume slider (DevTools)**: Inspect `SliderTrack` in `VolumeSlider` — class `h-2`. Inspect `SliderThumb` — class contains `w-3.5 h-3.5`
  - [ ] **NVDA**: Navigate Panel 1 with NVDA virtual cursor (arrow keys) — LiveBadge is announced as "Живий потік" (from `aria-label`), the pulsing dot is skipped (it has `aria-hidden="true"`)
  - [ ] **Reduced motion (DevTools)**: In browser DevTools → Rendering tab → set "Emulate CSS media feature prefers-reduced-motion" to "reduce". Inspect LiveBadge dot — `animate-live-pulse` class should still be present but `motion-safe:` prefix means Tailwind only applies the animation when motion is not reduced. Confirm via DevTools computed styles that no animation is applied
  - [ ] **High Contrast (DevTools)**: In browser DevTools → Rendering tab → set "Emulate CSS media feature forced-colors" to "active". Inspect LiveBadge — `forced-colors:` classes should override colors with system color keywords
  - [ ] **Buttons keyboard nav**: Tab to each transport button — all 5 announce their ARIA labels via NVDA; Enter/Space activates them; roving focus (arrow keys) moves between them correctly
  - [ ] **File playback state (DevTools)**: Start file playback — inspect Panel 1 DOM — no `LiveBadge` span present
  - [ ] **Stopped state**: Stop playback — NVDA navigates Panel 1 without errors; DevTools shows sourceLabel is empty and trackDisplay is "—"

- [ ] **Step 4: Final commit (if any last fixes from manual testing)**

  Stage only files that were actually adjusted during manual testing:
  ```
  git add src/components/player/PlayerPanel.tsx src/components/player/LiveBadge.tsx src/components/player/PlaybackPosition.tsx src/components/player/VolumeSlider.tsx src/styles.css
  git commit -m "style(player): final tweaks from manual acceptance testing"
  ```
  Skip this step if no changes were needed.
