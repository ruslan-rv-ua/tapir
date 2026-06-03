# Station browser list — design

**Date:** 2026-06-03
**Status:** Approved design, pending implementation plan
**Supersedes:** the earlier curated-4-stops draft (`*.md1`). This revision uses
**per-value focus stops (Layout A)** and the `preview_station` naming.

## Problem

The Streams row (`StreamItem`) is the polished reference: a `summary` (whole-row)
stop, then read-only segments each a Left/Right focus stop, then per-button action
stops. The Station browser row (`StationList`) is impoverished: each row exposes
only **one** combined `metadata` blob plus a single `action-add` button. There is
**no way to listen to a station before adding it**, and nothing signals that a
station may be offline.

The 2D roving-focus engine (`useCompositeList`) and the a11y shell (`CompositeRow`
/ `CompositeSegment` / `CompositeAction`) already support everything we need — the
browser row just doesn't use them fully.

## Goal

Bring the station row up to the Streams row's polish, honouring this app's
screen-reader-first constraint:

- split metadata into **one focus stop per value** (Layout A), each with its own
  `aria-roledescription`;
- add a **Preview** (listen-before-add) action that plays the station's resolved
  URL directly, without first adding it to a profile;
- surface station liveness **only when problematic** (warning marker), never a
  noisy "ok" badge;
- keep the add-to-profile action, now icon-only.

## Non-goals (YAGNI now, seam preserved)

- **No bulk profile health-check.** Out of scope. Seam: `connection::connect(url)`
  is already isolated; a future `check_station_url(url) -> { ok, codec, bitrate,
  error }` is a thin extraction that connects, validates content-type, and drops.
- **No m3u / pls import.** Out of scope; same `connect`/check seam serves it later.
- **No active per-row probing on load.** Liveness comes only from the free
  `lastcheckok` flag and the natural failure of a preview attempt.
- **No change to `useCompositeList` navigation behaviour** (only new `SegmentKind`
  string values are added to the union).

## How "dead" is determined (rationale, informs the design)

Two signals, different trust and cost:

1. **`lastcheckok` — Radio Browser's cached verdict.** Their service periodically
   checks each station; `1` = last check ok, `0` = not. Possibly stale. Our search
   query already sends `hidebroken=true` + `lastcheckok=1`
   (`src-tauri/src/browser/api.rs`), so results are pre-filtered → in practice
   almost every row has `lastcheckok === 1`. A positive "ok" badge would therefore
   carry no information; only `lastcheckok === 0` (rare) is worth surfacing.
2. **Live connection — `connection::connect(&url)` — ground truth.** Connects,
   returns `content_type` / ICY headers / bitrate hints. Connect + valid audio
   content-type + decodes → alive; failure / timeout / wrong content-type / decode
   error → dead (for us, now). In this design this happens **reactively** when the
   user presses Preview.

"Dead" = failure to connect/decode the real URL. `lastcheckok` is only a hint.
Both consumers (reactive preview now; bulk check / import later) share the same
`connection::connect` path, so they agree on the definition of "dead".

## Chosen approach

**Mirror the Streams structure.** Extract the row into a dedicated
`StationItem.tsx` (mirroring `StreamItem.tsx`), driven by a
`getStationSegments(station)` helper that computes the dynamic Left/Right segment
order. `StationList` stays thin, like `StreamList`.

Rejected:
- *Keep everything inline in `StationList`'s `renderRow`.* The row grows to 6
  metadata segments + 2 actions; inline rendering would bloat the list file and
  diverge from the `StreamList`/`StreamItem` split the codebase follows.
- *Curated/grouped metadata stops (the earlier draft).* The user chose per-value
  granularity: for NVDA the "extra" stops are nearly free (Down-scanning reads only
  the summary; stops are felt only when the user deliberately drills in with
  Right), while sighted keyboard users gain precise addressing of each value.

## Architecture

### Row anatomy — Left/Right focus-stop order (Layout A)

One focus stop per value. Decorative `lucide-react` icons are visual only
(`aria-hidden`); the value text and `roleDescription` carry meaning. Empty values
**omit their stop** (dynamic, like `getStreamSegments`).

| # | Stop | `SegmentKind` | Value (visual) | `aria-roledescription` | Omitted when |
|---|---|---|---|---|---|
| 1 | summary | `summary` | station name | `item_role_station` | — (always; whole-row name on `<li>`, gets a state prefix) |
| 2 | country | `country` | 🌍 `country` | `segment_country` | `country` empty |
| 3 | language | `language` | 🗣 `language` | `segment_language` | `language` empty |
| 4 | codec | `codec` | 🎵 `MP3` | `segment_codec` | `codec` empty |
| 5 | bitrate | `bitrate` | 📶 `128 kbps` | `segment_bitrate` | `bitrate` is 0 |
| 6 | genre | `genre` | 🏷 `tags` | `segment_genre` | `tags` empty |
| 7 | popularity | `popularity` | 🎧 `1.2k` (`clickcount`) | `segment_popularity` | `clickcount` is 0 (`votes` folded into `aria-label`) |
| 8 | preview | `action-play` | ▶ / ■ | — (native button) | never |
| 9 | add | `action-add` | ＋ / ✓ | — (native button) | never (✓ + `aria-disabled` when already added) |

Up/Down always lands on the target row's `summary` — existing hook behaviour,
unchanged.

Visual layout: two-line row inside one `CompositeRow` — line 1 = name (+ optional
warning marker) with the two icon buttons right-aligned; line 2 = the metadata
values as individually-focusable inline cells. Follow `StreamItem`'s Tailwind /
`forced-colors:` patterns.

### `summary` accessible name (screen-reader-first)

Whole-row accessible name = `{problem-prefix}{name}, {country}, {genre}` (country /
genre omitted when empty). Codec, bitrate, popularity are **not** in the summary —
they are reachable as Right stops — to keep Down-scanning concise during
discovery. Problem-prefix:

- previewing this station → `m.station_summary_previewing({ name })` →
  "Відтворюється, …" (takes precedence — a playing station is clearly not dead);
- `lastcheckok === 0` **or** in the failed-preview set → `m.station_summary_offline`
  → "Недоступна, …";
- otherwise → no prefix.

> Open for your review: whether the summary should stay this concise (name +
> country + genre) or also include bitrate. Codec/popularity intentionally
> excluded from the summary regardless.

### `getStationSegments(station)` helper

Pure function, unit-tested. Returns the ordered `Exclude<SegmentKind,'summary'>[]`:

```
[ country?, language?, codec?, bitrate?, genre?, popularity?, 'action-play', 'action-add' ]
```

Each metadata stop is included only when its value is present (see table). Both
actions are always present. Mirrors `getStreamSegments`.

### New `SegmentKind`s

Add `country`, `language`, `codec`, `bitrate`, `genre`, `popularity` to the
`SegmentKind` union in `useCompositeList.ts` (`action-play` / `action-add` already
exist). These strings are used only for the `data-segment` attribute and
roving-focus identity; the spoken role comes from the i18n `roleDescription`, not
the kind name. The old `metadata` kind becomes unused by stations — remove it if
`StationList` was its only consumer (verify during implementation).

## Preview (listen before adding)

### Backend

- New command **`preview_station(url: String, name: String)`** in
  `player_commands.rs` → `state.player.preview(url, name, &app)`. Plays the
  station's resolved URL through the existing engine path, calling `stop_session()`
  first — it occupies the single player, stopping any current playback, exactly
  like `play_stream`. No recording, no profile mutation. Register in `lib.rs`.
- New **`PlaybackSource::Preview { url, name }`** variant (Rust enum in
  `engine.rs`, `#[serde(rename = "preview", rename_all = "camelCase")]`) + the
  matching arm in the `PlaybackSource` union in `tauri.ts`
  (`{ type: "preview"; url: string; name: string }`). A distinct Preview source:
  (a) lets the browser row match "what is playing" precisely, and (b) lets the
  player panel / tray label it "Прев'ю: {name}" instead of resolving a
  non-existent stream id. The stored `url` is the **resolved URL**
  (`urlResolved || url`, same fallback the backend uses).
- Exhaustive `match PlaybackSource` sites must handle the new arm — notably
  `src-tauri/src/tray/menu.rs` (Stream/File today).
- The engine `preview` method is a near-clone of `play_stream` that sets
  `source: PlaybackSource::Preview { url, name }`; connect / ICY / ring-buffer
  plumbing is shared.

### Frontend

- `tauri.ts`: `previewStation(url, name)` wrapper + the `Preview` union arm.
- Let `resolved = station.urlResolved || station.url`.
- The Preview button is a **toggle** (`CompositeAction`, segment `action-play`,
  `aria-pressed` while previewing): if this station is the active preview source →
  `stopPlayback()`, else → `previewStation(resolved, station.name)`.
- "Is this station previewing?" = `playerStatus.state !== "stopped" &&
  playerStatus.source?.type === "preview" && playerStatus.source.url === resolved`.

## Dead-station handling (two-layer, no probing)

1. **Passive — `lastcheckok`.** Only `lastcheckok === 0` is surfaced: the summary
   gets the "Недоступна" prefix and the row shows a dim ⚠ marker next to the name.
   No positive badge for the (almost always) ok case. Preview stays **enabled** —
   the flag may be stale.
2. **Reactive — preview failure.** `preview_station` returns `Err` →
   `addToast(String(err), "error")` + `announce(m.station_preview_failed({ name }),
   "polite")` + add `station.stationuuid` to a session-local
   `failedPreview: Set<string>` in `StationList`. A row is "unavailable" when
   `lastcheckok === 0` **or** its uuid is in that set (drives the ⚠ marker + summary
   prefix). No own pinging.

## Icons & a11y

- `lucide-react`: `Play` / `Square` (preview toggle), `Plus` / `Check`
  (add / added), `TriangleAlert` (unavailable marker), and decorative segment icons
  `Globe` / `Languages` / `Music` / `Signal` / `Tag` / `Headphones` (all
  `aria-hidden`).
- Every icon-only control carries a required **`aria-label`** (no visible text)
  **and** a `title` (mouse hover). `CompositeAction` already supports both; target
  size ≥ 24px; visible focus ring (`COMPOSITE_FOCUS_RING`).
- The add control keeps the current pattern: a raw `<button>` (focus stop with
  roving `tabIndex`) using `aria-disabled` (not a `CompositeAction`) because the
  "added" state is non-interactive; icon swaps `Plus` → `Check`, `aria-label`
  swaps to `m.browser_added()`.
- `forced-colors:` treatment copied from `StreamItem` (focus ring, button surfaces;
  the ⚠ marker maps to a system colour).

## Files touched

- **New** `src/components/browser/StationItem.tsx` — the row + `getStationSegments`.
- **Edit** `src/components/browser/StationList.tsx` — render `<StationItem>` per row
  (thin, like `StreamList`); drop the inline `metadata` blob and inline add button;
  hold the `failedPreview` set.
- **Edit** `src/hooks/useCompositeList.ts` — add the 6 new `SegmentKind`s.
- **Edit** `src/lib/tauri.ts` — `Preview` source arm + `previewStation` wrapper.
- **Edit** `src-tauri/src/player/engine.rs` — `PlaybackSource::Preview` variant +
  `preview` method.
- **Edit** `src-tauri/src/commands/player_commands.rs` — `preview_station` command;
  register in `src-tauri/src/lib.rs`.
- **Edit** `src-tauri/src/tray/menu.rs` — handle the new `Preview` match arm.
- **Edit** i18n source + regenerate Paraglide messages via the vite plugin (not
  tsc).

## New i18n strings (en + uk, then regenerate)

- `segment_country` → "країна" / "country"
- `segment_language` → "мова" / "language"
- `segment_codec` → "кодек" / "codec"
- `segment_bitrate` → "бітрейт" / "bitrate"
- `segment_genre` → "жанр" / "genre"
- `segment_popularity` → "популярність" / "popularity"
- `station_summary_offline({name})` → "Недоступна, {name}" / "Unavailable, {name}"
- `station_summary_previewing({name})` → "Відтворюється, {name}" / "Playing, {name}"
- `station_preview_play({name})` / `station_preview_stop({name})` →
  "Прослухати {name}" / "Зупинити {name}"  (and EN equivalents)
- `station_preview_failed({name})` → "Не вдалося підключитися до {name}" /
  "Could not connect to {name}"
- `player_source_preview({name})` → "Прев'ю: {name}" / "Preview: {name}"  (player
  panel / tray label for the Preview source)
- reuse existing `add_stream`, `browser_added`, `formatBitrate`.

## Testing (gates: `pnpm test` + `pnpm vite:build`; tsc has ~51 pre-existing untyped-paraglide errors, ignored)

- **Unit** `getStationSegments`: each metadata stop present/absent independently
  (country/language/codec/bitrate/genre/popularity), and the fixed tail (both
  actions always present, in order).
- **a11y** `StationItem.test.tsx` (mirroring `StreamItem.test.tsx`):
  - row `aria-roledescription` = station role;
  - each present segment exposes the right `aria-roledescription`;
  - preview/add buttons have non-empty `aria-label`; add shows `aria-disabled` +
    `Check` when already added;
  - summary carries the "Недоступна" prefix + ⚠ marker when `lastcheckok === 0`;
  - preview button reflects the previewing state (label + icon + `aria-pressed`)
    when `source.type === "preview"` matches `resolved`.
- **Backend:** `PlaybackSource::Preview` serde round-trip (`{type:"preview"}`);
  `preview_station` command wiring.
- **Regression:** existing `StreamItem.test.tsx` / `useCompositeList.test.tsx` stay
  green (engine and hook navigation behaviour unchanged).
- `pnpm test` + `pnpm vite:build` green after each commit.

## Suggested commit sequence (feature branch off `develop`)

1. `feat(player): add PlaybackSource::Preview + preview_station command`
   (engine variant + method, command, `lib.rs` + `tray/menu.rs`; `tauri.ts` arm +
   `previewStation`).
2. `feat(browser): per-value metadata stops + preview/add actions`
   (new `StationItem` + `getStationSegments`, `SegmentKind` additions, i18n +
   Paraglide regen, thin `StationList`, `failedPreview` set, liveness marker).
3. `test(browser): getStationSegments + StationItem a11y`.

## Working tree note

Only this spec (formerly the stale `*.md1`) is untracked at design time; the tree
is otherwise clean. The stale `*.md1` is removed in favour of this file.
