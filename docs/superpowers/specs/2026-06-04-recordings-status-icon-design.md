# Recordings incomplete indicator — design

**Date:** 2026-06-04
**Branch:** `feat/recordings-status-icon`
**Scope:** Recordings screen only (`SongItem`). Streams screen is the reference model and stays untouched.

## Problem

The recordings list already flags incomplete recordings, but with a model that
has two accessibility weaknesses the streams screen does not have:

1. **State is reachable only by drilling in.** When focus lands on a recording
   row, its accessible name (`songs_row_summary`: title, artist, station, size,
   date) does **not** mention "incomplete". A screen-reader user arrowing down
   the list row-to-row never learns a recording is incomplete unless they arrow
   Right into a separate `status` segment.
2. **Focus-stop count drifts between rows.** `getSongSegments` prepends a
   `status` segment only for incomplete rows, so the number of Left/Right focus
   stops changes from row to row — unpredictable navigation.

The streams screen avoids both: its status icons are purely visual
(`aria-hidden`), and state is carried by the **row's accessible name**
(e.g. "recording, StreamName"), heard the instant focus lands on the row.

## Goal

Every recording row carries one always-present leading icon whose **shape**
signals state. The screen reader stays silent on the icon and hears the
"incomplete" state from the **row name**, mirroring the streams a11y model.

- Complete recording → neutral icon, silent to the screen reader.
- Incomplete recording → warning icon, state announced via the row name.

## Decisions (locked)

- **Announce via name prefix**, not an `aria-roledescription` swap. Mirrors the
  streams screen exactly (it prefixes "recording, …" onto the row name) and the
  state word is heard **first**, before the title. `aria-roledescription` stays
  `"запис"`/"recording" for both states.
- **In-place glyph swap**, not a new dedicated icon column. The recording
  already renders a leading icon inside the `track` segment; we keep it there
  and swap the glyph by state. Smaller change, no second leading icon, no a11y
  loss.
- **No new i18n strings, no paraglide regeneration.** Reuse the existing
  `songs_incomplete_badge` ("incomplete" / "незавершений") as the name prefix.

## Changes

All edits are in `src/components/songs/SongItem.tsx` and its test, plus the
incidental simplification of `getSongSegments` that `SongsList` consumes.

### 1. `getSongSegments` — single segment list for both states

Return the same list regardless of completeness; drop the `status` branch:

```ts
export function getSongSegments(_song: Song): SongItemData["segments"] {
  return ["track", "tech", "action-play", "action-menu"];
}
```

Update the now-stale comment on `SongItemData.segments` (it currently says
"Status sits before track on incomplete files"). The `"status"` member of the
shared `SegmentKind` union stays — streams still use it.

### 2. Row name — prefix when incomplete

```ts
const base = m.songs_row_summary({
  title: song.title || song.fileName,
  artist: song.artist || "—",
  station: song.station,
  size: formatSize(song.sizeBytes),
  date: formatDate(song.recordedAt),
});
const summaryLabel = song.isComplete
  ? base
  : `${m.songs_incomplete_badge()}, ${base}`;
```

`roleDescription={m.item_role_song()}` on the row is unchanged.

### 3. Icon — swap glyph by state inside the `track` segment

Replace the unconditional `FileMusic` with a state-driven glyph; both variants
stay `aria-hidden` and `flex-none` so layout never shifts:

```tsx
{song.isComplete ? (
  <FileMusic size={14} aria-hidden className="flex-none text-slate-500" />
) : (
  <AlertCircle
    size={14}
    aria-hidden
    className="flex-none text-amber-400 forced-colors:text-[Highlight]"
  />
)}
```

`forced-colors:text-[Highlight]` matches how the streams screen renders its
`AlertCircle` error icon, keeping it visible in Windows High Contrast. The two
states differ by **shape** (file vs alert), not color alone. No animation — an
incomplete file is a static past-state, unlike the live REC pulse on streams.

### 4. Remove the old badge segment

Delete the `{!song.isComplete && <CompositeSegment segment="status">…}` block.
`AlertCircle` is now imported for the in-place icon, so the import stays.

## Tests (`src/components/songs/SongItem.test.tsx`)

- **Rewrite** "renders the incomplete badge as a role=group status segment" →
  for an incomplete song assert: (a) the `<li>` `aria-label` is prefixed with
  the incomplete word (mock returns `"неповний"`), and (b)
  `[data-segment="status"]` no longer exists.
- **Add** a complete-row assertion: `aria-label` does **not** contain the
  incomplete prefix.
- **Add** an always-present-icon invariant: a leading `svg[aria-hidden]` exists
  inside `[data-segment="track"]` for **both** complete and incomplete songs.
- **Unchanged / still green:** `aria-roledescription === "запис"`, `track`/`tech`
  as `role=group`, play button focus stop.

## Verification

- `pnpm test`
- `pnpm vite:build`

(`tsc`'s ~51 pre-existing untyped-paraglide errors are not a gate. No i18n
regeneration is required — no message keys change.)

## Out of scope (YAGNI)

- Streams screen — untouched (reference model only).
- Renaming the `songs_incomplete_badge` key (mildly legacy now; a trivial
  optional follow-up).
- Any change to play/menu behavior for incomplete recordings.
- Any animation on the indicator.
