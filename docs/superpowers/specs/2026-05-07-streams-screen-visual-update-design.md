# Streams Screen — Visual Update Design

**Date:** 2026-05-07  
**Status:** Approved  
**Scope:** Visual/styling only — no logic, no new features, no keyboard-navigation changes

---

## Problem

The Streams screen (`StreamsPanel`, `StreamList`, `StreamItem`, `StreamContextMenu`) uses minimal Tailwind classes that don't match the reference design in `docs/ui/01-streams-screen.html`. The screen looks plain compared to the intended visual style: no card-style metrics, flat chip buttons, no rounded container around the stream list.

---

## Approach

Update CSS classes in four existing components (`StreamsPanel`, `StreamList`, `StreamItem`, `StreamContextMenu`). Minimal DOM additions are allowed (new wrapper `<div>`s for layout structure, new `<span>` elements for icon+text composition) — but no semantic or logic changes.

**Unchanged (must not be touched):**
- `<ul>/<li>` with CSS Grid (not `<table>`)
- All `data-item-id`, `data-segment`, `data-zone-id` attributes
- All `aria-*` labels, roles, and keyboard navigation logic
- All business logic, event handlers, and IPC calls
- The empty state branch (`isEmpty === true`) in `StreamsPanel` — rendered unchanged

---

## Changes per Component

### 1. `src/components/streams/StreamsPanel.tsx`

#### Metrics bar
Each of the 4 metric divs becomes a styled card:

```
Before:  <div className="flex flex-col gap-0.5">
After:   <div className="flex flex-col gap-1.5 rounded-2xl border border-white/[.06] bg-white/[.04] p-4">
```

Outer container padding increases slightly (`py-3` → `py-4`) to accommodate card padding.

#### Column headers + Stream list — wrap in `table-wrap`
The column headers `<div aria-hidden>` and `<StreamList>` are wrapped together in a content-pad + card container:

```jsx
{/* Content pad wrapper */}
<div className="flex flex-1 flex-col overflow-hidden px-4 py-3">
  {/* Rounded card container */}
  <div className="flex flex-1 flex-col overflow-hidden rounded-[18px] border border-slate-700/60 bg-white/[.02]">
    {/* Column headers — now inside card */}
    <div aria-hidden="true" className="grid border-b border-slate-700 bg-white/[.04] px-3 py-2.5 ...">
      ...
    </div>
    {/* Stream list */}
    <StreamList ... />
  </div>
</div>
```

The `border-b` class on the column headers `<div>` moves from being a standalone separator to being the divider inside the card. The outer column headers div previously had `border-b border-slate-700` directly on StreamsPanel; that border-b is preserved but now lives inside the card container.

#### Grid template columns — actions column width
Adding text to the play button significantly increases the actions cell width. Update the `gridTemplateColumns` inline style in **both** `StreamsPanel.tsx` (column headers div) and `StreamItem.tsx` (`<li>`):

```
Before: "100px 1fr 1.5fr 90px 90px 160px"
After:  "100px 1fr 1.5fr 90px 90px 240px"
```

The actions container `<div>` is `flex gap-1`; add `shrink-0 whitespace-nowrap` to the **play and record** buttons so they do not shrink or wrap text. The context menu trigger button only needs `shrink-0` (handled in Section 4 — it has no wrappable text):

```
// Before (play button)
className="rounded px-2 py-0.5 text-xs ..."

// After
className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-0.5 text-xs ..."
```

The record button gets the same `shrink-0 whitespace-nowrap` addition.

#### Filter chips
From rectangular to pill shape:

```
Before active:   "rounded px-2 py-1 text-xs bg-blue-600 text-white ..."
After active:    "rounded-full px-3 py-1 text-xs bg-sky-400/[.14] border border-sky-300/[.22] text-slate-100 ..."

Before inactive: "rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 ..."
After inactive:  "rounded-full px-3 py-1 text-xs text-slate-400 border border-slate-700/50 hover:bg-slate-800 ..."
```

Forced-colors classes carry over unchanged.

### 2. `src/components/streams/StreamList.tsx`

No changes. The `<ul>` keeps `className="flex-1 overflow-auto"` and remains the sole scrolling region.

**Scroll ownership chain (must be preserved):**
```
StreamsPanel root div         → flex flex-1 flex-col overflow-hidden
  └─ content-pad wrapper      → flex flex-1 flex-col overflow-hidden px-4 py-3
       └─ card div            → flex flex-1 flex-col overflow-hidden rounded-[18px] ...
            └─ <ul> (StreamList) → flex-1 overflow-auto   ← scrolls here
```
Every ancestor above `<ul>` uses `flex-1 flex-col overflow-hidden` so height is passed down correctly and the `<ul>` is the only element that actually scrolls.

### 3. `src/components/streams/StreamItem.tsx`

#### Status dot
Size increase, colored ring shadow per state, and forced-colors dot color:

| State | Dot color | Ring shadow | Forced-colors dot |
|-------|-----------|-------------|-------------------|
| recording | `bg-red-500` | `shadow-[0_0_0_3px_rgba(239,68,68,.2)]` | `forced-colors:bg-[Highlight]` |
| connecting / reconnecting | `bg-amber-400` | `shadow-[0_0_0_3px_rgba(245,158,11,.18)]` | `forced-colors:bg-[Highlight]` |
| error | `bg-red-500` | `shadow-[0_0_0_3px_rgba(239,68,68,.2)]` | `forced-colors:bg-[Highlight]` |
| idle | `bg-green-500` | `shadow-[0_0_0_3px_rgba(34,197,94,.15)]` | `forced-colors:bg-[Highlight]` |

Size: `h-2 w-2` → `h-2.5 w-2.5`

Add `forced-colors:shadow-none` to suppress the box-shadow ring in High Contrast mode (shadows are hidden by the system; the dot color via `forced-colors:bg-[Highlight]` provides the indicator).

#### Play/Stop-playback button — add text label
Currently shows only a Unicode symbol. Add a short text span using existing i18n keys:

```jsx
// Before
{isThisStreamPlaying ? "■" : "▶"}

// After
<>
  <span aria-hidden="true">{isThisStreamPlaying ? "■" : "▶"}</span>
  <span>{isThisStreamPlaying ? m.stop() : m.play()}</span>
</>
```

Uses existing messages: `"play": "Відтворити"` and `"stop": "Зупинити"`.  
The `aria-label` on the button already provides the full accessible name — the span text is purely visual.

Button classes update: `rounded px-2 py-0.5 text-xs` → `inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-0.5 text-xs`

#### Record button — add icon to match play button
Currently shows only text (`m.stop_recording()` / `m.start_recording()`). Add leading icon:

```jsx
// Before
{isRecording ? m.stop_recording() : m.start_recording()}

// After
<>
  <span aria-hidden="true">{isRecording ? "⏹" : "⏺"}</span>
  <span>{isRecording ? m.stop_recording() : m.start_recording()}</span>
</>
```

Same `inline-flex shrink-0 whitespace-nowrap items-center gap-1` classes as play button.

### 4. `src/components/streams/StreamContextMenu.tsx`

Add `shrink-0` to the trigger `<Button>` className to prevent it from being squeezed in the flex actions row (`whitespace-nowrap` is not needed — the trigger shows only an ellipsis symbol):

```
Before: "inline-flex items-center justify-center rounded bg-slate-700 px-2 py-1 text-xs ..."
After:  "inline-flex shrink-0 items-center justify-center rounded bg-slate-700 px-2 py-1 text-xs ..."
```

All other classes remain unchanged.

---

## Icon style

Action button icons use Unicode symbols (`"▶"`, `"■"`, `"⏺"`, `"⏹"`) — consistent with the existing play button which already uses Unicode. **Do not use lucide-react** for these icons; keep Unicode to avoid introducing an SVG dependency inside `data-segment="actions"` cells.

No new keys required. Reuses existing:
- `play` / `stop` — short labels for the play button visual text
- `start_recording` / `stop_recording` — already used for record button text

---

## Accessibility

All changes are additive styling only:
- `aria-label` values on buttons are unchanged (full labels for screen readers)
- New `<span aria-hidden="true">` wraps the icon symbol to prevent double-reading
- No focus management or keyboard behavior changes

**Forced-colors (Windows High Contrast mode):**

| Element | Forced-colors classes |
|---------|-----------------------|
| Metric cards | `forced-colors:border-[ButtonText] forced-colors:bg-[Canvas]` |
| Card table-wrap container | `forced-colors:border-[ButtonText]` |
| Column header row | `forced-colors:border-[ButtonText] forced-colors:bg-[Canvas]` |
| Status dot ring shadow | `forced-colors:shadow-none` (shadows are hidden in HC; dot color already uses `forced-colors:bg-[Highlight]` per state) |
| Filter chips — active | unchanged: `forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]` |
| Filter chips — inactive | unchanged: `forced-colors:text-[ButtonText]` |

---

## Out of Scope

- Search box icon + Ctrl+F hint (not selected during design review)
- Titlebar buttons as pills (not selected)
- Station name subtitle line (not in current data model)
- Stop-all button style changes
