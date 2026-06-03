# CompositeList shell — design

**Date:** 2026-06-03
**Branch:** `refactor/composite-list-shell` (from `develop`)
**Status:** Approved design, pending implementation plan

## Problem

The app has five segment-based composite lists — Profiles, Streams, Stations
(browser), Songs (recorded files), Patterns (wishlist/ignorelist). Their
*behaviour* is already unified by the `useCompositeList` hook (2D roving focus:
row `summary` + Left/Right segments + self-activating action buttons). What is
**not** unified is the presentational shell around the hook:

- the `<ul role="application">` boilerplate, `forwardRef` → `ZoneEntry`
  plumbing and `restoreFocus` wiring are duplicated five times;
- the per-row accessibility conventions (`role="listitem"` +
  `aria-roledescription`, `role="group"` on read-only segments, the
  `focus-visible:outline` focus ring) are re-derived by hand in every list.

That hand-derivation has already drifted. `SongItem` diverged from the other
four (no `aria-roledescription` on the row, segments are bare `<span>`s without
`role="group"`, uses `focus-visible:ring-2` instead of the shared `outline`
ring) — latent accessibility bugs in a screen-reader-first app. A sixth consumer
(the Schedule screen, Phase 3, currently `disabled` in the ActivityBar) is on
the horizon and will re-derive the same conventions unless we extract a shared
shell first.

## Goal

Extract a thin presentational shell that owns the boilerplate and **bakes in**
the accessibility semantics, so no screen — existing or future — can render a
composite-list row with the wrong ARIA. Migrate all five existing lists onto it.
Fix the `SongItem` drift as part of its migration. Do **not** implement the
Schedule screen here; only prepare the foundation.

## Non-goals

- No change to `useCompositeList` (the navigation engine stays untouched).
- No unification of empty/loading/error handling — it is genuinely
  panel-coupled and heterogeneous (see below). Panels are not modified.
- No fully declarative / schema-driven list. Domain rows stay as components;
  domain differences (dynamic stream segments, context menus, delete flows,
  grid layout) would distort a column-descriptor API.

## Chosen approach

**Approach A — `<CompositeList>` wrapper + a11y helper components.** The wrapper
owns the hook, the `<ul>`, the `ZoneEntry`/forwardRef, and optional empty-state
slots; helper components render accessibility-correct DOM.

**Focus state is threaded as props, not via context.** Originally a private
context was considered, but the existing item tests (`ProfileItem.test.tsx`,
`StreamItem.test.tsx`) render items *bare* — directly inside a plain `<ul>`,
passing `isFocused`/`isActiveRow` as props, with no provider in the tree. A
context-reading helper would throw there and break the "existing tests pass
unchanged" guarantee. So the wrapper passes a row-bound `isFocused` (and
`isActive`) through `renderRow`; items forward them into the prop-based helpers.
Item prop APIs (`isFocused`, `isActiveRow`) are unchanged, so bare-item tests
stay green, and the a11y attributes are still centralised in the helpers (the
actual goal).

Rejected:
- **B — primitives + hook helper only:** keeps each list rendering its own
  `<ul>`; centralises row semantics but not the shell or empty-state plumbing.
- **C — declarative `columns/segments` descriptor:** over-abstraction; domain
  differences distort the API.

## Architecture

New directory: `src/components/common/composite-list/`.

### `<CompositeList>` — `forwardRef<ZoneEntry | TExtraHandle>`

Owns:

- the call to `useCompositeList` (hook unchanged);
- `<ul role="application" data-zone-id={zoneId} aria-label={ariaLabel}
  onKeyDownCapture={onKeyDownCapture}>`;
- `useImperativeHandle` → `ZoneEntry { id, get el(), focus: restoreFocus }`;
- optional `imperativeExtra?: (api: { focusItem }) => object` so `ProfileList`
  can attach its `focusProfile`;
- optional render slots `loading?`, `error?`, `empty?`, `footer?: ReactNode`.
  `loading`/`error`/`empty` render **instead of** the `<ul>`; `footer` renders
  after the rows inside the `<ul>` (for the browser "Load more" control).
  Panels whose lists unmount when empty (Streams, Songs) never reach the `empty`
  slot.

Public props:

```tsx
interface CompositeListProps<T extends CompositeListItem> {
  zoneId: string;
  ariaLabel: string;
  items: T[];                          // { id, segments }[]
  onTabOut: (forward: boolean) => void;
  onAction: (type: ActionType, itemId: string, segment: SegmentKind) => void;
  onEmpty?: () => void;
  renderRow: (row: {
    id: string;
    isActive: boolean;
    isFocused: (segment: SegmentKind) => boolean;
  }) => ReactNode;
  className?: string;
  loading?: ReactNode;
  error?: ReactNode;
  empty?: ReactNode;
  footer?: ReactNode;
  imperativeExtra?: (api: { focusItem: (id: string, seg?: SegmentKind) => void }) => object;
}
```

### Accessibility helper components

Each bakes in the semantics every list currently writes by hand. They receive a
row-bound `isFocused` (and, for the row, `isActiveRow`) as props;
`tabIndex`/`aria-*` are never written by callers again.

- **`<CompositeRow itemId isFocused isActiveRow roleDescription label className
  activeClassName style>`** → `<li role="listitem" data-item-id
  data-segment="summary" tabIndex aria-label aria-roledescription>`, appends
  `activeClassName` when `isActiveRow`.
- **`<CompositeSegment itemId segment isFocused label roleDescription className
  style>`** → `<div role="group" data-item-id data-segment tabIndex aria-label
  aria-roledescription>` with the shared `focus-visible:outline` ring appended.
- **`<CompositeAction itemId segment isFocused label onClick className title
  ariaPressed ariaDisabled>`** → native `<button type="button">` with roving
  `tabIndex` and the shared focus ring, self-activating (Enter/Space/click
  handled natively, as today).

Context-menu triggers (`StreamContextMenu`, `ProfileContextMenu`,
`SongContextMenu`) are *not* `CompositeAction`s — they stay as-is and keep
receiving `menuFocused={isFocused("action-menu")}`.

## Behaviour-preservation principle

For the four non-Songs lists the DOM output and ARIA must remain **byte-for-byte
identical** after migration. This is a behaviour-preserving refactor: existing
tests must pass unchanged. Only Songs changes output (drift fixes below).

## Migration plan (order: simple → complex)

1. **PatternList** (inline `<li>`) — cleanest reference case. Empty state via
   the `empty` slot. ConfirmDialog stays local to the list.
2. **StationList** (inline `<li>`) — `loading`/`error`/`empty` slots carry the
   current three branches (`role="status"` / `role="alert"`). "Load more" is not
   a focus-stop row → rendered via the `footer` slot.
3. **ProfileList** (`<ProfileItem>`) — uses `imperativeExtra` for `focusProfile`.
   `ProfileItem` adopts `<CompositeRow>` + `<CompositeAction>`; its `IconButton`
   becomes a thin wrapper over `<CompositeAction>`. `isFocused`/`isActiveRow`
   props disappear (read from context).
4. **SongsList** (`<SongItem>`) — migrate **and** fix drift (below).
5. **StreamList** (`<StreamItem>`) — most complex (dynamic segments, grid layout,
   ConfirmDialog, context menu). Migrated last, on the proven API. Row grid
   classes ride on `<CompositeRow className>`; `getStreamSegments` keeps
   computing the dynamic `track/tech/status` segment list.

## SongItem drift fixes (only DOM-output change)

Bring `SongItem` in line with the other four:

- add `aria-roledescription={m.item_role_song()}` on the row (new i18n key
  `item_role_song` → uk "пісня", en "song");
- `track`/`tech`/`status` segments become `role="group"` via `<CompositeSegment>`
  (currently bare `<span>` without role);
- focus ring `ring-2` → shared `outline`.

The whole-row accessible name stays the existing composite `songs_row_summary`
on `<CompositeRow label>` — we **extend** (add `roleDescription`), not rewrite,
so row announcement is unchanged in substance.

## Empty / loading / error — confirmed heterogeneous, NOT unified

Left as-is because it is panel-coupled:

- **Streams** — panel swaps an entire `streams-empty` zone (plus
  `streams-filter-empty`); the list does not mount when empty. `onEmpty` stays a
  focus-recovery callback. Panel untouched.
- **Songs** — panel renders `<p>` loading/error/empty outside the list; the list
  mounts only when `length > 0`. Panel untouched.
- **Stations / Patterns** — inline slots (`loading`/`error`/`empty`) inside
  `<CompositeList>`. The only two consumers of the slots.

Shell slots are optional; two lists use them, three do not. No panel changes.

## Testing

- **New unit tests** (`CompositeList.test.tsx`): `<ul role="application">` with
  correct `data-zone-id`/`aria-label`; `<CompositeRow>` →
  `role="listitem"` + `aria-roledescription` + roving `tabIndex`;
  `<CompositeSegment>` → `role="group"`; `<CompositeAction>` → native `<button>`;
  `loading`/`error`/`empty` slots render instead of the `<ul>`; `footer` renders
  after rows; `imperativeExtra` exposes the extra method.
- **Existing list/item tests are the regression net** — `ProfileList.test.tsx`,
  `StreamList.test.tsx`, `StreamItem.test.tsx`, `ProfileItem.test.tsx`,
  `useCompositeList.test.tsx` must pass **without edits**. A break on a
  non-Songs list is a migration bug, not a stale test.
- **Songs is the only test update** — assert `aria-roledescription="пісня"` and
  `role="group"` on segments; add a minimal `SongItem.test.tsx` if none exists.
- After each list: `npm run test` + `npm run build` (typecheck) green before
  committing the next.

## New i18n strings

- `item_role_song` → uk "пісня", en "song" (mirrors
  `item_role_stream/station/profile/pattern`). Added to both `en.json` and
  `uk.json` so the Paraglide build does not fail.

## Risks & mitigation

| Risk | Mitigation |
|---|---|
| DOM change breaks NVDA announcement | 4 lists byte-for-byte identical; Songs only extends (adds role, removes nothing). Manual NVDA verification of Songs at the end. |
| Context breaks roving `tabIndex` | Helpers compute `tabIndex` exactly as today (`isFocused`), just from context instead of a prop. Covered by primitive unit tests. |
| StreamList grid / dynamic segments | Keep `getStreamSegments` and grid `className` as-is; migrate last on the proven API. |
| Large diff | Per-commit: 1 commit = primitives + tests, then 1 commit per list (5), with i18n + Songs fix folded into the Songs commit. Each green. |

## Commit sequence (branch `refactor/composite-list-shell` from `develop`)

1. `feat(list): CompositeList shell + Row/Segment/Action primitives + tests`
2. `refactor(wishlist): migrate PatternList to CompositeList`
3. `refactor(browser): migrate StationList to CompositeList`
4. `refactor(profile): migrate ProfileList/ProfileItem to CompositeList`
5. `refactor(songs): migrate SongsList + fix a11y drift (roledescription, role=group, outline)`
6. `refactor(streams): migrate StreamList/StreamItem to CompositeList`

Schedule is **not** implemented in this branch — the shell becomes its
foundation on a separate branch later.

## Pre-existing uncommitted changes

The branch inherited unrelated uncommitted edits in `BrowserPanel.tsx` and
`SearchForm.tsx`. They are out of scope and must not be staged into the commits
above.
