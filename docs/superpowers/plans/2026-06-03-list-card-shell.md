# ListCard Shell (Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all five list screens one consistent framed container by extracting a shared `ListCard` (+ `ListCardState` for centered empty/loading/error messages) and applying it everywhere, matching the current Streams card look.

**Architecture:** Two tiny presentational components in `src/components/common/ListCard.tsx`. Each list screen swaps its ad-hoc container for `<ListCard>`; the seven not-populated state blocks across three files swap to `<ListCardState>`. Purely visual — no changes to zones, roving focus, stores, or list logic. Scroll stays on each list's own `<ul>` (CompositeList) inside the card.

**Tech Stack:** React + TypeScript, Tailwind CSS, Vitest + @testing-library/react. Spec: `docs/superpowers/specs/2026-06-03-list-card-shell-design.md`.

**Per-task gate rationale:** Tasks 2–6 are visual-only with no new assertions, so their per-task gate is `pnpm vite:build` — it runs the TypeScript/JSX compile and catches the realistic failure mode (bad import, malformed JSX, type error). The full `pnpm test` regression suite runs once at the end (Task 7). Task 1 (the new components) is real TDD with its own unit tests.

---

## File Structure

- **Create** `src/components/common/ListCard.tsx` — `ListCard` (framed container) + `ListCardState` (centered state message). One responsibility: the shared visual shell for list screens.
- **Create** `src/components/common/ListCard.test.tsx` — unit tests for the two components.
- **Modify** `src/components/streams/StreamsPanel.tsx` — replace inline card divs with `<ListCard>`.
- **Modify** `src/components/profile/ProfilesPanel.tsx` — replace padding div with `<ListCard>`.
- **Modify** `src/components/browser/BrowserPanel.tsx` — wrap `<StationList>` in `<ListCard>`.
- **Modify** `src/components/browser/StationList.tsx` — loading/error/empty → `<ListCardState>`.
- **Modify** `src/components/wishlist/WishlistPanel.tsx` — wrap each `<PatternList>` in `<ListCard>`.
- **Modify** `src/components/wishlist/PatternList.tsx` — empty slot → `<ListCardState>`.
- **Modify** `src/components/songs/SongsPanel.tsx` — wrap states + `<SongsList>` in `<ListCard>`; the three `<p>` states → `<ListCardState>`.

All screens import from the same relative path: `../common/ListCard`.

---

## Task 1: Create ListCard + ListCardState (TDD)

**Files:**
- Create: `src/components/common/ListCard.tsx`
- Test: `src/components/common/ListCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/common/ListCard.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListCard, ListCardState } from "./ListCard";

describe("ListCard", () => {
  it("renders children inside the framed container", () => {
    render(
      <ListCard>
        <span>card content</span>
      </ListCard>,
    );
    expect(screen.getByText("card content")).toBeInTheDocument();
  });
});

describe("ListCardState", () => {
  it("renders its children", () => {
    render(<ListCardState>empty message</ListCardState>);
    expect(screen.getByText("empty message")).toBeInTheDocument();
  });

  it("forwards role and aria-live to the container", () => {
    render(
      <ListCardState role="alert" aria-live="assertive">
        boom
      </ListCardState>,
    );
    const el = screen.getByRole("alert");
    expect(el).toHaveTextContent("boom");
    expect(el).toHaveAttribute("aria-live", "assertive");
  });

  it("uses the default text color when no className is given", () => {
    render(<ListCardState role="status">x</ListCardState>);
    expect(screen.getByRole("status").className).toContain("text-slate-500");
  });

  it("uses the provided className instead of the default color", () => {
    render(
      <ListCardState role="status" className="text-red-400">
        x
      </ListCardState>,
    );
    const el = screen.getByRole("status");
    expect(el.className).toContain("text-red-400");
    expect(el.className).not.toContain("text-slate-500");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/common/ListCard.test.tsx`
Expected: FAIL — cannot resolve `./ListCard` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/components/common/ListCard.tsx`:

```tsx
import type { ReactNode, HTMLAttributes } from "react";

/**
 * Shared framed container for every list screen: outer padding + a rounded,
 * bordered card that fills remaining height and clips overflow. The list's own
 * scroll lives on its <ul> (CompositeList) inside. Visual only — does not affect
 * zone / roving navigation. See docs/FRD-navigation.md and
 * docs/superpowers/specs/2026-06-03-list-card-shell-design.md.
 */
export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden px-4 py-3">
      <div
        className={
          "flex flex-1 flex-col overflow-hidden rounded-[18px] border border-slate-700/60 bg-white/[.02] forced-colors:border-[ButtonText]" +
          (className ? " " + className : "")
        }
      >
        {children}
      </div>
    </div>
  );
}

/** Centered message shown inside a ListCard for empty / loading / error states. */
export function ListCardState({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={
        "flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center text-sm " +
        (className ?? "text-slate-500")
      }
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/components/common/ListCard.test.tsx`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/ListCard.tsx src/components/common/ListCard.test.tsx
git commit -m "feat(common): add ListCard + ListCardState shell components" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Streams — use ListCard for the list container

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx`

- [ ] **Step 1: Add the import**

Find this line:

```tsx
import { ConfirmDialog } from "../common/ConfirmDialog";
```

Add immediately after it:

```tsx
import { ListCard } from "../common/ListCard";
```

- [ ] **Step 2: Replace the opening card divs**

Find:

```tsx
          {/* Content pad wrapper */}
          <div className="flex flex-1 flex-col overflow-hidden px-4 py-3">
            {/* Rounded card container */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-[18px] border border-slate-700/60 bg-white/[.02] forced-colors:border-[ButtonText]">
```

Replace with:

```tsx
          {/* Framed list container (shared ListCard) */}
          <ListCard>
```

- [ ] **Step 3: Replace the closing card divs**

Find (this is the close of the list block, just before the fragment closes):

```tsx
              )}
            </div>
          </div>
        </>
```

Replace with:

```tsx
              )}
          </ListCard>
        </>
```

(The column-header row, the filter-empty block, and `<StreamList>` between them stay exactly as they are — only the two wrapping `<div>`s become `<ListCard>`. The Streams filter-empty zone is intentionally left as-is; it is a focusable zone with a reset button, not a plain message.)

- [ ] **Step 4: Verify the build passes**

Run: `pnpm vite:build`
Expected: `✓ built` with no TypeScript/JSX errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamsPanel.tsx
git commit -m "refactor(streams): use shared ListCard for the list container" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Profiles — wrap the list in ListCard

**Files:**
- Modify: `src/components/profile/ProfilesPanel.tsx`

- [ ] **Step 1: Add the import**

Find this line:

```tsx
import { ConfirmDialog } from "../common/ConfirmDialog";
```

Add immediately after it:

```tsx
import { ListCard } from "../common/ListCard";
```

- [ ] **Step 2: Replace the padding wrapper with ListCard**

Find:

```tsx
      {/* ── List ── */}
      <div className="flex flex-1 flex-col overflow-hidden px-4 py-3">
        <ProfileList
          ref={listRef}
          profiles={profiles}
          activeProfile={activeProfile}
          exitZone={(forward) => exitZone("profiles-list", forward)}
          onSwitch={handleSwitch}
          onDuplicate={(name) => { setTarget(name); setNameInput(""); setNameError(null); setSubDialog({ type: "duplicate" }); }}
          onRename={(name) => { setTarget(name); setNameInput(name); setNameError(null); setSubDialog({ type: "rename" }); }}
          onDelete={(name) => { setTarget(name); setSubDialog({ type: "delete" }); }}
          onExport={handleExport}
        />
      </div>
```

Replace with:

```tsx
      {/* ── List ── */}
      <ListCard>
        <ProfileList
          ref={listRef}
          profiles={profiles}
          activeProfile={activeProfile}
          exitZone={(forward) => exitZone("profiles-list", forward)}
          onSwitch={handleSwitch}
          onDuplicate={(name) => { setTarget(name); setNameInput(""); setNameError(null); setSubDialog({ type: "duplicate" }); }}
          onRename={(name) => { setTarget(name); setNameInput(name); setNameError(null); setSubDialog({ type: "rename" }); }}
          onDelete={(name) => { setTarget(name); setSubDialog({ type: "delete" }); }}
          onExport={handleExport}
        />
      </ListCard>
```

- [ ] **Step 3: Verify the build passes**

Run: `pnpm vite:build`
Expected: `✓ built` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/profile/ProfilesPanel.tsx
git commit -m "refactor(profile): wrap profile list in shared ListCard" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Browser — wrap results in ListCard, states via ListCardState

**Files:**
- Modify: `src/components/browser/BrowserPanel.tsx`
- Modify: `src/components/browser/StationList.tsx`

- [ ] **Step 1: Add the import to BrowserPanel**

Find this line:

```tsx
import { ScreenHeader } from "../layout/ScreenHeader";
```

Add immediately after it:

```tsx
import { ListCard } from "../common/ListCard";
```

- [ ] **Step 2: Wrap StationList in ListCard**

Find:

```tsx
      {!showSearchResults && (
        <h2 className="px-4 py-2 text-sm font-medium text-slate-300">{m.browser_popular_title()}</h2>
      )}
      <StationList
        ref={resultsCallbackRef}
        stations={stations}
        loading={loading}
        error={error}
        hasMore={showSearchResults ? hasMore : false}
        onLoadMore={showSearchResults ? loadMore : undefined}
        emptyMessage={emptyMessage}
        exitZone={(forward) => exitZone("browser-results", forward)}
      />
```

Replace with:

```tsx
      {!showSearchResults && (
        <h2 className="px-4 py-2 text-sm font-medium text-slate-300">{m.browser_popular_title()}</h2>
      )}
      <ListCard>
        <StationList
          ref={resultsCallbackRef}
          stations={stations}
          loading={loading}
          error={error}
          hasMore={showSearchResults ? hasMore : false}
          onLoadMore={showSearchResults ? loadMore : undefined}
          emptyMessage={emptyMessage}
          exitZone={(forward) => exitZone("browser-results", forward)}
        />
      </ListCard>
```

(The `<h2>` "Популярні станції" stays above the card — it is a section subheading, not part of the list.)

- [ ] **Step 3: Add the import to StationList**

Find this line:

```tsx
import { CompositeList, CompositeRow, CompositeSegment, COMPOSITE_FOCUS_RING } from "../common/composite-list";
```

Add immediately after it:

```tsx
import { ListCardState } from "../common/ListCard";
```

- [ ] **Step 4: Convert the loading/error/empty slots**

Find:

```tsx
        loading={
          loading ? (
            <div role="status" aria-live="polite" className="p-4 text-sm text-slate-400">
              {m.browser_loading()}
            </div>
          ) : undefined
        }
        error={error ? <div role="alert" className="p-4 text-sm text-red-400">{error}</div> : undefined}
        empty={<div role="status" className="p-4 text-center text-sm text-slate-500">{emptyMessage}</div>}
```

Replace with:

```tsx
        loading={
          loading ? (
            <ListCardState role="status" aria-live="polite" className="text-slate-400">
              {m.browser_loading()}
            </ListCardState>
          ) : undefined
        }
        error={error ? <ListCardState role="alert" className="text-red-400">{error}</ListCardState> : undefined}
        empty={<ListCardState role="status">{emptyMessage}</ListCardState>}
```

- [ ] **Step 5: Verify the build passes**

Run: `pnpm vite:build`
Expected: `✓ built` with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/browser/BrowserPanel.tsx src/components/browser/StationList.tsx
git commit -m "refactor(browser): wrap results in ListCard, states via ListCardState" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Wishlist — wrap pattern lists in ListCard, empty via ListCardState

**Files:**
- Modify: `src/components/wishlist/WishlistPanel.tsx`
- Modify: `src/components/wishlist/PatternList.tsx`

- [ ] **Step 1: Add the import to WishlistPanel**

Find this line:

```tsx
import { ScreenHeader } from "../layout/ScreenHeader";
```

Add immediately after it:

```tsx
import { ListCard } from "../common/ListCard";
```

- [ ] **Step 2: Wrap the wishlist TabPanel's list**

Find:

```tsx
        <TabPanel id="wishlist" className="flex flex-1 flex-col overflow-hidden">
          <PatternList
            ref={patternListCallbackRef}
            items={wishlistItems}
            ariaLabel={m.wishlist_section_title()}
            showDate={true}
            emptyMessage={m.empty_wishlist()}
            exitZone={(forward) => exitZone("wishlist-list", forward)}
            onEmpty={() => addPatternBtnRef.current?.focus()}
            onEdit={(pattern) => setDialog({ mode: "edit", listType: "wishlist", pattern })}
            onRemove={handleRemoveWishlist}
          />
        </TabPanel>
```

Replace with:

```tsx
        <TabPanel id="wishlist" className="flex flex-1 flex-col overflow-hidden">
          <ListCard>
            <PatternList
              ref={patternListCallbackRef}
              items={wishlistItems}
              ariaLabel={m.wishlist_section_title()}
              showDate={true}
              emptyMessage={m.empty_wishlist()}
              exitZone={(forward) => exitZone("wishlist-list", forward)}
              onEmpty={() => addPatternBtnRef.current?.focus()}
              onEdit={(pattern) => setDialog({ mode: "edit", listType: "wishlist", pattern })}
              onRemove={handleRemoveWishlist}
            />
          </ListCard>
        </TabPanel>
```

- [ ] **Step 3: Wrap the ignorelist TabPanel's list**

Find:

```tsx
        <TabPanel id="ignorelist" className="flex flex-1 flex-col overflow-hidden">
          <PatternList
            ref={patternListCallbackRef}
            items={ignorelistItems}
            ariaLabel={m.ignorelist_section_title()}
            showDate={false}
            emptyMessage={m.empty_ignorelist()}
            exitZone={(forward) => exitZone("wishlist-list", forward)}
            onEmpty={() => addPatternBtnRef.current?.focus()}
            onEdit={(pattern) => setDialog({ mode: "edit", listType: "ignorelist", pattern })}
            onRemove={handleRemoveIgnorelist}
          />
        </TabPanel>
```

Replace with:

```tsx
        <TabPanel id="ignorelist" className="flex flex-1 flex-col overflow-hidden">
          <ListCard>
            <PatternList
              ref={patternListCallbackRef}
              items={ignorelistItems}
              ariaLabel={m.ignorelist_section_title()}
              showDate={false}
              emptyMessage={m.empty_ignorelist()}
              exitZone={(forward) => exitZone("wishlist-list", forward)}
              onEmpty={() => addPatternBtnRef.current?.focus()}
              onEdit={(pattern) => setDialog({ mode: "edit", listType: "ignorelist", pattern })}
              onRemove={handleRemoveIgnorelist}
            />
          </ListCard>
        </TabPanel>
```

- [ ] **Step 4: Add the import to PatternList**

Find this line:

```tsx
import { ConfirmDialog } from "../common/ConfirmDialog";
```

Add immediately after it:

```tsx
import { ListCardState } from "../common/ListCard";
```

- [ ] **Step 5: Convert the empty slot**

Find:

```tsx
          empty={
            <div role="status" className="py-4 text-center text-sm text-slate-500">
              {emptyMessage}
            </div>
          }
```

Replace with:

```tsx
          empty={
            <ListCardState role="status">{emptyMessage}</ListCardState>
          }
```

- [ ] **Step 6: Verify the build passes**

Run: `pnpm vite:build`
Expected: `✓ built` with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/wishlist/WishlistPanel.tsx src/components/wishlist/PatternList.tsx
git commit -m "refactor(wishlist): wrap pattern lists in ListCard, empty via ListCardState" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Songs — wrap list in ListCard, states via ListCardState

**Files:**
- Modify: `src/components/songs/SongsPanel.tsx`

- [ ] **Step 1: Add the import**

Find this line:

```tsx
import { ConfirmDialog } from "../common/ConfirmDialog";
```

Add immediately after it:

```tsx
import { ListCard, ListCardState } from "../common/ListCard";
```

- [ ] **Step 2: Wrap the states + list in ListCard**

Find:

```tsx
      <SongsFilterBar ref={filterRef} exitZone={(forward) => exitZone("songs-filter", forward)} />
      {loading && <p className="p-4 text-slate-400" role="status">{m.songs_loading()}</p>}
      {error && <p className="p-4 text-red-400" role="alert">{m.songs_error({ error })}</p>}
      {!loading && !error && songs.length === 0 && (
        <p className="p-4 text-slate-400">{m.songs_empty()}</p>
      )}
      {!loading && !error && songs.length > 0 && (
        <SongsList
          ref={listRef}
          exitZone={(forward) => exitZone("songs-list", forward)}
          onEmpty={() => filterRef.current?.focus("forward")}
          onPlay={handlePlay}
          onAction={handleMenuAction}
        />
      )}
```

Replace with:

```tsx
      <SongsFilterBar ref={filterRef} exitZone={(forward) => exitZone("songs-filter", forward)} />
      <ListCard>
        {loading && <ListCardState role="status" className="text-slate-400">{m.songs_loading()}</ListCardState>}
        {error && <ListCardState role="alert" className="text-red-400">{m.songs_error({ error })}</ListCardState>}
        {!loading && !error && songs.length === 0 && (
          <ListCardState role="status">{m.songs_empty()}</ListCardState>
        )}
        {!loading && !error && songs.length > 0 && (
          <SongsList
            ref={listRef}
            exitZone={(forward) => exitZone("songs-list", forward)}
            onEmpty={() => filterRef.current?.focus("forward")}
            onPlay={handlePlay}
            onAction={handleMenuAction}
          />
        )}
      </ListCard>
```

(The empty message loses its explicit `text-slate-400` and falls back to `ListCardState`'s default `text-slate-500`, which matches the empty color used on Browser and Wishlist — a deliberate normalization. Loading stays `text-slate-400`, error stays `text-red-400`.)

- [ ] **Step 3: Verify the build passes**

Run: `pnpm vite:build`
Expected: `✓ built` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/songs/SongsPanel.tsx
git commit -m "refactor(songs): wrap list in ListCard, states via ListCardState" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Final regression gate + manual handoff

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all pass — the previously green suite plus the 5 new `ListCard.test.tsx` tests.

- [ ] **Step 2: Run the production build**

Run: `pnpm vite:build`
Expected: `✓ built` with no errors.

- [ ] **Step 3: Hand off for manual visual check**

The user builds, runs the app, and reviews all five screens — full lists, empty / loading / error states, and Windows High Contrast — confirming the framed card looks consistent everywhere. No code action here; report that automated gates are green and the change is ready for visual review.

---

## Self-Review

**Spec coverage:**
- `ListCard` component → Task 1. ✓
- `ListCardState` component → Task 1. ✓
- Streams uses ListCard, filter-empty untouched → Task 2. ✓
- Profiles gets the frame → Task 3. ✓
- Browser wraps list, h2 stays above, 3 states → ListCardState → Task 4. ✓
- Wishlist wraps both lists, empty → ListCardState → Task 5. ✓
- Songs wraps block, 3 states → ListCardState, empty color normalized → Task 6. ✓
- 7 states migrated total (Browser 3 + Wishlist 1 + Songs 3). ✓
- Gates `pnpm test` + `pnpm vite:build` → per-task build + Task 7 full suite. ✓
- Out of scope (columns, navigation, metrics/toolbars) → not touched by any task. ✓

**Placeholder scan:** none — every step has exact code or exact commands.

**Type consistency:** `ListCard({ children, className })` and `ListCardState({ children, className, ...rest })` signatures defined in Task 1 are used consistently in Tasks 2–6. Import path `../common/ListCard` is identical across all consuming files. `ListCardState` receives only `role`, `aria-live`, `className`, and children — all covered by `HTMLAttributes<HTMLDivElement>`.
