# Streams filter UX — design

**Date:** 2026-05-31
**Branch:** `feat/streams-filter-ux`
**Scope:** Three of six raised issues for the streams filter chips. The other
three (richer filter set + sorting, column-header alignment, responsive metrics
grid) are explicitly **out of scope** for this branch.

## Problem

The three filter chips in [StreamsPanel.tsx](../../../src/components/streams/StreamsPanel.tsx)
(Row 2 of the toolbar) have three independent issues:

1. **Chip semantics.** Each chip is a standalone `<button aria-pressed>`, even
   though they behave as a mutually-exclusive single choice. A screen reader
   announces "toggle button, pressed" ×3 without conveying that they form one
   group with one selection.
2. **No counts on chips.** `activeCount` / `errorCount` are already computed for
   the metrics bar. Surfacing them on the chips lets the user see whether
   filtering is worthwhile before clicking.
3. **Filter state is local (`useState`)** — it resets when leaving the section.

## Decisions (resolved during brainstorming)

- **Semantics:** wrap the chips in `role="group"` with an `aria-label`, but
  **keep `aria-pressed`** on each chip. This is the deliberately lighter option:
  it adds group context (NVDA announces the group name on entry) with minimal
  change and **no touching of the roving-focus wiring**. We knowingly accept that
  each chip still reads as "toggle button, pressed" rather than "radio, 1 of 3".
  A full `radiogroup`/`radio` refactor was considered and rejected for this
  branch because it would require reworking the `mixed-boundary-handoff`
  roving-focus group.
- **Counts:** show a count on **every** chip (always, including `0`): **All**
  shows the total stream count, **Recording** and **Errors** their respective
  counts. Rendered as a separate visual **badge**, `aria-hidden`, with the count
  folded into the chip's `aria-label` via a **comma** so NVDA inserts a
  micro-pause ("Errors, 2"). This comma-pause technique is already used in
  [StreamItem.tsx:86](../../../src/components/streams/StreamItem.tsx).
  (Revised after the initial build: the **All** chip originally stayed without a
  number, but a total-count badge was added so the user sees the overall list
  size alongside the filtered counts.)
- **State:** lift to an **in-memory nanostore atom** `$streamFilter` in
  [streams.ts](../../../src/stores/streams.ts). Survives leaving/re-entering the
  section; resets to "all" only on app restart. No disk persistence (avoids the
  confusing "why is the list filtered?" on startup).

## Design

### 1. Chip semantics — `role="group"`

In [StreamsPanel.tsx](../../../src/components/streams/StreamsPanel.tsx) Row 2,
wrap the three chips in a group container. The wrapper is **purely semantic** —
roving-focus operates on the button refs directly, so a wrapping `<div>` does not
change DOM order, refs, or tab indices.

```jsx
<div role="group" aria-label={m.streams_filter_group()}>
  {FILTER_CHIPS.map(...)}  // buttons keep aria-pressed + tabIndex={toolbarTabIndex(3 + i)}
</div>
```

The "Stop all" button and the divider stay **outside** the group. `aria-pressed`,
active-state classes, and `onClick` are unchanged.

New i18n key `streams_filter_group` → "Фільтр потоків" / "Stream filter".

### 2. Counts on chips — badge + comma aria-label

Counts depend on `activeCount` / `errorCount`, so the label must be computed in
render, not in the module-level `FILTER_CHIPS` constant. `FILTER_CHIPS` keeps
`id` + base `labelFn`; the final markup is built inside `.map`:

```jsx
{FILTER_CHIPS.map((chip, i) => {
  const count = chip.id === "recording" ? activeCount
              : chip.id === "errors"    ? errorCount
              : streams.length;
  return (
    <button
      ...
      aria-label={m.streams_filter_chip_count({ label: chip.labelFn(), count })}
    >
      <span>{chip.labelFn()}</span>
      <span aria-hidden="true" className="ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full bg-slate-700/80 px-1 text-[10px] ...">
        {count}
      </span>
    </button>
  );
})}
```

- **Visual:** chip text + a small rounded badge with the number, on every chip.
- **Screen reader:** the badge is `aria-hidden`; the count is read via the chip's
  `aria-label` with a comma → "Помилки, 2" (NVDA pauses on the comma).
- **All** chip's count is the total stream count (`streams.length`); like the
  others it gets a badge and a comma `aria-label` ("Усі, 3").

New i18n key `streams_filter_chip_count` = `«{label}, {count}»` → "Помилки, 2" /
"Errors, 2".

Forced-colors: badge background must degrade gracefully (use a `forced-colors:`
border/`[ButtonText]` like the surrounding chips), since `bg-slate-700` is
dropped in high-contrast mode.

### 3. Filter state in the store

In [streams.ts](../../../src/stores/streams.ts):

```ts
export type StreamFilter = "all" | "recording" | "errors";
export const $streamFilter = atom<StreamFilter>("all");
```

In [StreamsPanel.tsx:94](../../../src/components/streams/StreamsPanel.tsx#L94):
replace `useState<ChipId>("all")` with `useStore($streamFilter)`; setter
`setActiveChip(x)` → `$streamFilter.set(x)`. The local `ChipId` type and
`StreamFilter` are identical — remove the duplication by importing the single
exported `StreamFilter` from the store. The rest of the logic
([handleChipClick](../../../src/components/streams/StreamsPanel.tsx#L124),
[handleResetFilter](../../../src/components/streams/StreamsPanel.tsx#L179),
[filteredStreams](../../../src/components/streams/StreamsPanel.tsx#L115)) is
unchanged. Component unmount no longer loses the selection; the atom persists.

## Testing

The project has [StreamItem.test.tsx](../../../src/components/streams/StreamItem.test.tsx)
and [StreamList.test.tsx](../../../src/components/streams/StreamList.test.tsx) but
no `StreamsPanel.test.tsx`. Following TDD, add a new `StreamsPanel.test.tsx`
covering:

1. **Group role** — the three chips are wrapped in an element with
   `role="group"` and the expected `aria-label`.
2. **Count badge + aria-label** — every chip renders the count badge
   (`aria-hidden`) and exposes an `aria-label` with the comma form; "All"
   carries the total stream count, including the `0`-count edge case.
3. **Store persistence** — setting `$streamFilter`, unmounting, and remounting
   the panel preserves the active chip (verifies the lift out of `useState`).

## i18n keys to add

Source files: [uk.json](../../../src/i18n/messages/uk.json) /
[en.json](../../../src/i18n/messages/en.json), compiled to `paraglide/messages/*.js`.

| key | uk | en |
| --- | --- | --- |
| `streams_filter_group` | Фільтр потоків | Stream filter |
| `streams_filter_chip_count` | {label}, {count} | {label}, {count} |

## Out of scope (not this branch)

- Richer filter set ("playing", "reconnecting") + sorting (name/bitrate/time)
- Column-header vs row width sync (240px vs auto)
- Responsive metrics grid (`grid-cols-4`)
