# Recordings Two-Line Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each recording row on **two visual lines** like the station browser — line 1 is the title (+ state icon) and the play/menu actions; line 2 is the metadata `artist · station · duration · size · date`. Surface `size` and `date` (previously only in the accessible name) and give the title full width. The keyboard/screen-reader model is unchanged: still two content focus stops (`track`, `tech`), Up/Down on the row summary, Left/Right across stops. As a unification carried by the same change, move the row's byte/date formatting into the shared `lib/formatters.ts`.

**Architecture:** Decision record: `docs/decisions/2026-06-04-recordings-two-line-layout.md` (locked answers). Row idiom mirrors `StationItem` structurally (name + actions on line 1, metadata below) but **without** the per-value focus stops — songs keep one combined `tech` metadata stop. Line 2 uses smart truncation: `artist · station` share flexible width and truncate first; the `duration · size · date` tail is `flex-none` and always visible. The accessible name (`songs_row_summary`) is unchanged and keeps the full date **with time** via `formatDateTime`; the visual line 2 uses the compact, time-less `formatDate`.

**Tech Stack:** React 19 + TypeScript, lucide-react icons, paraglide i18n, Vitest + @testing-library/react. No new i18n strings, no paraglide regeneration (line 2 renders existing field values; dates via `Intl`).

**Branch:** Create `feat/recordings-two-line` off `develop`.

---

## File Structure

- **Modify** `src/lib/formatters.ts` — add `formatDate` (compact, no time) and `formatDateTime` (date + time). `formatBytes` already exists and is reused.
- **Modify** `src/lib/formatters.test.ts` — add tests for the two new functions (and a `formatBytes` boundary test).
- **Modify** `src/components/songs/SongItem.tsx` — the production change:
  - Drop the local `formatSize` (duplicate of `formatBytes`) and local `formatDate`.
  - Import `formatBytes`, `formatDate`, `formatDateTime` from `lib/formatters`.
  - Accessible summary uses `formatBytes` + `formatDateTime`.
  - Replace the single-line flex body with a two-line layout.
- **Modify** `src/components/songs/SongItem.test.tsx` — add one behavioral test (size + date appear in the `tech` segment). All existing tests stay green.
- **Modify (optional, Task 3)** `src/components/wishlist/PatternList.tsx` — drop its local `formatDate`, reuse the shared one.

`getSongSegments()` and `SongsList.tsx` are **untouched** — the segment set is identical, only the visual arrangement changes.

---

## Task 1: Shared date/size formatters

**Files:**
- Modify: `src/lib/formatters.ts`
- Test: `src/lib/formatters.test.ts`

- [ ] **Step 1: Add failing tests for the new formatters**

In `src/lib/formatters.test.ts`, update the import and append two `describe` blocks. Replace:

```ts
import { describe, it, expect } from "vitest";
import { isLowDiskSpace } from "./formatters";
```

with:

```ts
import { describe, it, expect } from "vitest";
import { isLowDiskSpace, formatBytes, formatDate, formatDateTime } from "./formatters";
```

Then append at the end of the file:

```ts
describe("formatBytes", () => {
  it("formats across unit boundaries", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("formatDate / formatDateTime", () => {
  // Midday UTC so the local date never crosses a day/year boundary in any TZ.
  const iso = "2026-06-15T12:00:00Z";

  it("formatDate includes the year and omits the time", () => {
    const out = formatDate(iso);
    expect(out).toContain("2026");
    expect(out).not.toMatch(/\d\d:\d\d/);
  });

  it("formatDateTime includes the time", () => {
    expect(formatDateTime(iso)).toMatch(/\d\d:\d\d/);
  });

  it("returns the raw input for an unparseable date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });
});
```

- [ ] **Step 2: Run the formatter tests to verify they fail**

Run: `pnpm test src/lib/formatters.test.ts`
Expected: FAIL — `formatDate`/`formatDateTime` are not exported yet (import error / undefined). The `formatBytes` block already passes (function exists).

- [ ] **Step 3: Implement the two new formatters**

In `src/lib/formatters.ts`, add after `formatBytes` (and before `isLowDiskSpace`):

```ts
/** Compact localized date, no time (e.g. "Jun 15, 2026"). For dense list rows. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

/** Localized date + time (e.g. "Jun 15, 2026, 02:30"). For accessible names. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
```

- [ ] **Step 4: Run the formatter tests to verify they pass**

Run: `pnpm test src/lib/formatters.test.ts`
Expected: PASS — all blocks green.

---

## Task 2: SongItem two-line layout

**Files:**
- Modify: `src/components/songs/SongItem.tsx`
- Test: `src/components/songs/SongItem.test.tsx`

- [ ] **Step 1: Add the failing behavioral test (size + date on line 2)**

In `src/components/songs/SongItem.test.tsx`, append this test inside the existing `describe("SongItem — a11y structure (drift fixes)", …)` block (before its closing `});`):

```tsx
  it("surfaces size and date in the metadata (tech) segment", () => {
    // Midday UTC keeps the rendered year stable across timezones.
    const { container } = renderItem(mk({ recordedAt: "2026-06-15T12:00:00Z" }));
    const tech = container.querySelector('[data-segment="tech"]')!;
    expect(tech.textContent).toContain("2.0 KB"); // formatBytes(2048)
    expect(tech.textContent).toContain("2026");    // compact date includes the year
  });
```

(The default `mk()` song has `sizeBytes: 2048` → "2.0 KB". The real `lib/formatters` functions run — they are not mocked.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/components/songs/SongItem.test.tsx`
Expected: FAIL — the current single-line `tech` segment renders only `artist · station · duration`, so neither "2.0 KB" nor "2026" is present. All other tests in the file still pass.

- [ ] **Step 3: Update imports and remove the local formatters**

In `src/components/songs/SongItem.tsx`, replace the import:

```tsx
import { formatDuration } from "../../lib/formatters";
```

with:

```tsx
import { formatDuration, formatBytes, formatDate, formatDateTime } from "../../lib/formatters";
```

Then delete both local helper functions in their entirety:

```tsx
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
```

- [ ] **Step 4: Point the accessible summary at the shared formatters**

In `src/components/songs/SongItem.tsx`, replace:

```tsx
  const baseSummary = m.songs_row_summary({
    title: song.title || song.fileName,
    artist: song.artist || "—",
    station: song.station,
    size: formatSize(song.sizeBytes),
    date: formatDate(song.recordedAt),
  });
  const summaryLabel = song.isComplete
    ? baseSummary
    : `${m.songs_incomplete_badge()}, ${baseSummary}`;
```

with:

```tsx
  const baseSummary = m.songs_row_summary({
    title: song.title || song.fileName,
    artist: song.artist || "—",
    station: song.station,
    size: formatBytes(song.sizeBytes),
    date: formatDateTime(song.recordedAt), // a11y name keeps the full date + time
  });
  const summaryLabel = song.isComplete
    ? baseSummary
    : `${m.songs_incomplete_badge()}, ${baseSummary}`;

  // Line 2 tail: short, fixed-width values that must always stay visible.
  const metaTail = [
    song.durationMs > 0 ? formatDuration(song.durationMs) : null,
    formatBytes(song.sizeBytes),
    formatDate(song.recordedAt),
  ]
    .filter(Boolean)
    .join(" · ");
```

- [ ] **Step 5: Replace the row body with the two-line layout**

In `src/components/songs/SongItem.tsx`, replace the entire returned JSX:

```tsx
  return (
    <CompositeRow
      itemId={song.path}
      isFocused={isFocused}
      isActiveRow={isActiveRow}
      label={summaryLabel}
      roleDescription={m.item_role_song()}
      className="flex items-center gap-3 border-b border-slate-800 px-3 py-2"
      activeClassName="bg-slate-800/40"
    >
      <CompositeSegment
        itemId={song.path}
        segment="track"
        isFocused={isFocused}
        label={song.title || song.fileName}
        className="flex flex-1 min-w-0 items-center gap-2 truncate text-sm text-slate-100"
      >
        {song.isComplete ? (
          <FileMusic size={14} aria-hidden className="flex-none text-slate-500" />
        ) : (
          <AlertCircle
            size={14}
            aria-hidden
            className="flex-none text-amber-400 forced-colors:text-[Highlight]"
          />
        )}
        <span className="truncate">{song.title || song.fileName}</span>
      </CompositeSegment>

      <CompositeSegment
        itemId={song.path}
        segment="tech"
        isFocused={isFocused}
        className="min-w-0 flex-1 truncate text-xs text-slate-400"
      >
        {song.artist} · {song.station}
        {song.durationMs > 0 ? ` · ${formatDuration(song.durationMs)}` : ""}
      </CompositeSegment>

      <CompositeAction
        itemId={song.path}
        segment="action-play"
        isFocused={isFocused}
        onClick={onPlay}
        label={isPlaying ? m.songs_action_stop() : m.songs_action_play()}
        ariaPressed={isPlaying}
        className="rounded p-1.5 text-slate-300 hover:bg-slate-700 forced-colors:text-[ButtonText]"
      >
        {isPlaying ? <Square size={16} aria-hidden /> : <Play size={16} aria-hidden />}
      </CompositeAction>

      <SongContextMenu song={song} menuFocused={isFocused("action-menu")} onAction={onAction} />
    </CompositeRow>
  );
```

with:

```tsx
  return (
    <CompositeRow
      itemId={song.path}
      isFocused={isFocused}
      isActiveRow={isActiveRow}
      label={summaryLabel}
      roleDescription={m.item_role_song()}
      className="border-b border-slate-800 px-3 py-2"
      activeClassName="bg-slate-800/40"
    >
      {/* Line 1: state icon + title, with the action buttons pushed right. */}
      <div className="flex items-center gap-2">
        <CompositeSegment
          itemId={song.path}
          segment="track"
          isFocused={isFocused}
          label={song.title || song.fileName}
          className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-100"
        >
          {song.isComplete ? (
            <FileMusic size={14} aria-hidden className="flex-none text-slate-500" />
          ) : (
            <AlertCircle
              size={14}
              aria-hidden
              className="flex-none text-amber-400 forced-colors:text-[Highlight]"
            />
          )}
          <span className="truncate">{song.title || song.fileName}</span>
        </CompositeSegment>

        <div className="ml-auto flex flex-none gap-1">
          <CompositeAction
            itemId={song.path}
            segment="action-play"
            isFocused={isFocused}
            onClick={onPlay}
            label={isPlaying ? m.songs_action_stop() : m.songs_action_play()}
            ariaPressed={isPlaying}
            className="rounded p-1.5 text-slate-300 hover:bg-slate-700 forced-colors:text-[ButtonText]"
          >
            {isPlaying ? <Square size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          </CompositeAction>

          <SongContextMenu song={song} menuFocused={isFocused("action-menu")} onAction={onAction} />
        </div>
      </div>

      {/* Line 2: metadata. artist·station truncate first; the tail always shows. */}
      <CompositeSegment
        itemId={song.path}
        segment="tech"
        isFocused={isFocused}
        className="mt-1 flex items-center gap-1 text-xs text-slate-400"
      >
        <span className="min-w-0 flex-1 truncate">
          {song.artist || "—"} · {song.station}
        </span>
        <span className="flex-none whitespace-nowrap">
          {" · "}
          {metaTail}
        </span>
      </CompositeSegment>
    </CompositeRow>
  );
```

- [ ] **Step 6: Run the recordings tests to verify they pass**

Run: `pnpm test src/components/songs/SongItem.test.tsx`
Expected: PASS — the new size/date test plus every existing test (roledescription, track/tech `role=group`, incomplete prefix, status-segment absent, always-icon, glyph swap, focus ring, play button) all green.

---

## Task 3 (optional cleanup): Converge PatternList onto the shared formatDate

Carries the unification a bit further so wishlist/ignorelist dates match the rest of the app. This **changes PatternList's visible date format** from `toLocaleDateString()` (e.g. "6/15/2026") to the compact shared form (e.g. "Jun 15, 2026").

**Files:**
- Modify: `src/components/wishlist/PatternList.tsx`

- [ ] **Step 1: Confirm no test pins the old format**

Run: `pnpm test src/components/wishlist` (and grep `src/components/wishlist` for `toLocaleDateString`/date assertions). There is no `PatternList.test.tsx`; proceed only if no wishlist test asserts a specific date string. If one does, update it to the new format in this step.

- [ ] **Step 2: Replace the local formatter with the shared import**

In `src/components/wishlist/PatternList.tsx`, add to the imports:

```tsx
import { formatDate } from "../../lib/formatters";
```

and delete the local definition:

```tsx
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}
```

(The two call sites — `conditionsValue` and the segment body — keep calling `formatDate(item.addedAt)` unchanged.)

- [ ] **Step 3: Run the wishlist tests**

Run: `pnpm test src/components/wishlist`
Expected: PASS.

---

## Gates & Commit

- [ ] **Run the full gates**

Run: `pnpm test`
Expected: PASS — whole suite green.

Run: `pnpm vite:build`
Expected: build succeeds.

(`tsc`'s ~51 pre-existing untyped-paraglide errors are not a gate. No i18n regeneration — no message keys change.)

- [ ] **Commit**

```bash
git add src/lib/formatters.ts src/lib/formatters.test.ts \
  src/components/songs/SongItem.tsx src/components/songs/SongItem.test.tsx \
  src/components/wishlist/PatternList.tsx
git commit -m "feat(recordings): two-line row layout; share date/size formatters

Render each recording on two lines like the station browser: line 1 is the
title (+ state icon) and the play/menu actions; line 2 is the metadata
artist · station · duration · size · date. This surfaces size and date
(previously only in the accessible name) and gives the title full width.
artist·station truncate first; the duration·size·date tail stays visible.
The keyboard/SR model is unchanged (track + tech stops; summary on Up/Down).

Hoist the row's byte/date formatting into lib/formatters: reuse the existing
formatBytes (was duplicated as a local formatSize) and add shared formatDate
(compact, no time) / formatDateTime (with time, for the accessible name).
PatternList reuses the shared formatDate so dates are consistent app-wide.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Decision coverage** (`docs/decisions/2026-06-04-recordings-two-line-layout.md`):
- Line 1 = title only; artist leads line 2 → Step 5 (title in `track`; `artist · station` opens line 2). ✓
- Line 2 no icons, `·` separator → Step 5 (plain text spans). ✓
- Compact date, no time, with year (Intl, no new i18n) → Task 1 `formatDate` + Step 5 `metaTail`. ✓
- Smart truncation, tail always visible → Step 5 (`min-w-0 flex-1 truncate` vs `flex-none whitespace-nowrap`). ✓
- a11y summary keeps full date+time → Step 4 (`formatDateTime`). ✓
- Navigation unchanged (2 content stops) → `track` + `tech` retained; `getSongSegments`/`SongsList` untouched. ✓
- Unification: reuse `formatBytes`, share `formatDate`/`formatDateTime` → Task 1 + Step 3/4 + Task 3. ✓

**2. Existing-test safety:** `track` and `tech` remain `CompositeSegment`s (role=group preserved); the state icon stays inside `track` (always-icon + glyph-swap tests pass); `summaryLabel` prefix logic is unchanged (incomplete tests pass); no `status` segment is introduced; play stays a `CompositeAction` button. The i18n mock's `songs_row_summary` ignores size/date, so the formatter swap is invisible to summary assertions.

**3. Timezone safety:** the only date assertion uses a midday-UTC timestamp, so the rendered local year is stable across CI timezones; other tests don't assert dates.

**4. Placeholder scan:** no TBD/TODO; every code step shows complete code.

**5. Type consistency:** `formatDate`/`formatDateTime` take `string`, return `string`; `metaTail` is `string`; `formatBytes(song.sizeBytes: number)` matches. No new symbols beyond the two exported formatters.

## Out of scope (YAGNI)

- Per-value focus stops for songs (deliberately rejected — see decision).
- `format`/`genre`/`album` on the row.
- Any change to streams, browser, or profiles layout.
- Relative dates ("today"/"yesterday").
