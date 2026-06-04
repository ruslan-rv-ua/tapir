# Recordings Incomplete Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the recordings list, signal an incomplete recording through an always-present leading icon (shape-based, `aria-hidden`) and a prefix on the row's accessible name, instead of a separate focusable status badge.

**Architecture:** Mirror the streams screen's accessibility model. The icon is pure decoration; the screen reader learns the state from the row name (`aria-label`), heard the moment focus lands on the row. The completeness-dependent `status` focus segment is removed so every recording row has the same Left/Right focus-stop count. All changes are local to `SongItem` and its test; `getSongSegments` simplifies and its only consumer (`SongsList`) is unaffected.

**Tech Stack:** React 19 + TypeScript, lucide-react icons, paraglide i18n, Vitest + @testing-library/react. Reference spec: `docs/superpowers/specs/2026-06-04-recordings-status-icon-design.md`.

**Branch:** `feat/recordings-status-icon` (already created off `develop`; spec already committed).

---

## File Structure

- **Modify** `src/components/songs/SongItem.tsx` — the only production change:
  - `getSongSegments(...)` returns one segment list for every row (drop the `status` branch).
  - `summaryLabel` gains an "incomplete" prefix when `!song.isComplete`.
  - The leading `track` icon swaps glyph by state (`FileMusic` ↔ `AlertCircle`).
  - The standalone `{!song.isComplete && <CompositeSegment segment="status">}` block is removed.
- **Modify** `src/components/songs/SongItem.test.tsx` — replace the old status-segment test with tests for the new contract.
- **Untouched but verified:** `src/components/songs/SongsList.tsx` still calls `getSongSegments(s)`; the simplified signature keeps that call valid.

No i18n changes (reuses `songs_incomplete_badge`), so **no paraglide regeneration**.

---

## Task 1: Move incomplete state to the row name + status icon

**Files:**
- Modify: `src/components/songs/SongItem.tsx`
- Test: `src/components/songs/SongItem.test.tsx`

- [ ] **Step 1: Rewrite the test for the new contract (the failing test)**

In `src/components/songs/SongItem.test.tsx`, find this existing block:

```tsx
  it("renders the incomplete badge as a role=group status segment", () => {
    const { container } = renderItem(mk({ isComplete: false }));
    const status = container.querySelector('[data-segment="status"]')!;
    expect(status.getAttribute("role")).toBe("group");
    expect(status.getAttribute("aria-label")).toBe("неповний");
  });
```

Replace it with these four tests:

```tsx
  it("prefixes the incomplete state onto the row's accessible name", () => {
    const { container } = renderItem(mk({ isComplete: false }));
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toMatch(/^неповний, /);
    expect(li.getAttribute("aria-label")).toContain("Title A summary");
  });

  it("does not prefix the name for a complete recording", () => {
    const { container } = renderItem(mk({ isComplete: true }));
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).not.toContain("неповний");
  });

  it("drops the standalone status segment (state moves to the row name)", () => {
    const { container } = renderItem(mk({ isComplete: false }));
    expect(container.querySelector('[data-segment="status"]')).toBeNull();
  });

  it("always renders an aria-hidden icon in the track segment, both states", () => {
    const complete = renderItem(mk({ isComplete: true }));
    expect(
      complete.container.querySelector('[data-segment="track"] svg[aria-hidden="true"]'),
    ).not.toBeNull();
    const incomplete = renderItem(mk({ isComplete: false }));
    expect(
      incomplete.container.querySelector('[data-segment="track"] svg[aria-hidden="true"]'),
    ).not.toBeNull();
  });
```

(The test's local mock returns `"неповний"` for `songs_incomplete_badge` and `` `${title} summary` `` for `songs_row_summary`, so an incomplete row's name is `"неповний, Title A summary"`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/components/songs/SongItem.test.tsx`
Expected: FAIL. "prefixes the incomplete state…" fails (current name has no prefix) and "drops the standalone status segment…" fails (current code still renders `[data-segment="status"]`). The two guard tests ("does not prefix…", "always renders an aria-hidden icon…") already pass.

- [ ] **Step 3: Simplify `getSongSegments` to one list for every row**

In `src/components/songs/SongItem.tsx`, replace:

```tsx
export interface SongItemData {
  id: string;
  /** Segments after summary. Status sits before track on incomplete files. */
  segments: Exclude<SegmentKind, "summary">[];
}

export function getSongSegments(song: Song): SongItemData["segments"] {
  const base: SongItemData["segments"] = ["track", "tech", "action-play", "action-menu"];
  return song.isComplete ? base : ["status", ...base];
}
```

with:

```tsx
export interface SongItemData {
  id: string;
  /** Segments after summary. Same set for every row — completeness no longer adds a stop. */
  segments: Exclude<SegmentKind, "summary">[];
}

export function getSongSegments(_song: Song): SongItemData["segments"] {
  return ["track", "tech", "action-play", "action-menu"];
}
```

(The `_song` parameter stays so the existing `getSongSegments(s)` call in `SongsList.tsx` remains valid; the underscore marks it intentionally unused.)

- [ ] **Step 4: Prefix the row name when incomplete**

In `src/components/songs/SongItem.tsx`, replace:

```tsx
  const summaryLabel = m.songs_row_summary({
    title: song.title || song.fileName,
    artist: song.artist || "—",
    station: song.station,
    size: formatSize(song.sizeBytes),
    date: formatDate(song.recordedAt),
  });
```

with:

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

- [ ] **Step 5: Remove the standalone status badge segment**

In `src/components/songs/SongItem.tsx`, delete this block in its entirety (including the trailing blank line before the `track` segment):

```tsx
      {!song.isComplete && (
        <CompositeSegment
          itemId={song.path}
          segment="status"
          isFocused={isFocused}
          label={m.songs_incomplete_badge()}
          className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-300 forced-colors:bg-[Mark] forced-colors:text-[MarkText]"
        >
          <AlertCircle size={12} aria-hidden /> {m.songs_incomplete_badge()}
        </CompositeSegment>
      )}

```

(`AlertCircle` stays imported — Step 6 uses it. `CompositeSegment` stays imported — `track`/`tech` use it.)

- [ ] **Step 6: Swap the track icon glyph by state**

In `src/components/songs/SongItem.tsx`, inside the `track` `CompositeSegment`, replace:

```tsx
        <FileMusic size={14} aria-hidden className="flex-none text-slate-500" />
```

with:

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

(`forced-colors:text-[Highlight]` matches the streams screen's error `AlertCircle`, keeping the indicator visible in Windows High Contrast and distinguished by shape, not color.)

- [ ] **Step 7: Run the recordings tests to verify they pass**

Run: `pnpm test src/components/songs/SongItem.test.tsx`
Expected: PASS — all tests in the file green, including the four from Step 1.

- [ ] **Step 8: Run the full gates**

Run: `pnpm test`
Expected: PASS — whole suite green (no other test referenced the songs `status` segment).

Run: `pnpm vite:build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/components/songs/SongItem.tsx src/components/songs/SongItem.test.tsx
git commit -m "feat(recordings): signal incomplete state via row name + status icon

Replace the separate focusable 'incomplete' badge with the streams-style
model: an always-present leading icon (FileMusic when complete, AlertCircle
when not; aria-hidden), and the incomplete state prefixed onto the row's
accessible name so NVDA announces it on landing. getSongSegments now returns
one segment list for every row, removing focus-stop drift between rows.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- "Icon always aria-hidden, shape-based" → Step 6 (swap, both `aria-hidden`) + Step 1 always-icon test. ✓
- "Announce via name prefix, roleDescription unchanged" → Step 4; roleDescription untouched, existing `aria-roledescription === "запис"` test stays green. ✓
- "Drop focusable status segment / no focus-stop drift" → Step 3 + Step 5 + Step 1 status-absent test. ✓
- "Reuse `songs_incomplete_badge`, no new strings / no regen" → Step 4 uses it; no i18n files touched. ✓
- "forced-colors visible, no animation" → Step 6 (`forced-colors:text-[Highlight]`, static). ✓
- "Tests: rewrite status test, add complete-no-prefix, status-absent, always-icon" → Step 1. ✓
- "Gates: `pnpm test` + `pnpm vite:build`" → Step 8. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code. ✓

**3. Type consistency:** `getSongSegments(_song: Song)` returns `SongItemData["segments"]`; `summaryLabel`/`baseSummary` are `string`; `song.isComplete` is the existing `Song` boolean. Icon swap reuses already-imported `FileMusic`/`AlertCircle`. No new symbols introduced. ✓
