# CompositeList Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a thin presentational shell (`<CompositeList>` + `CompositeRow`/`CompositeSegment`/`CompositeAction` a11y primitives) around the existing `useCompositeList` hook, migrate all five composite lists onto it, and fix the `SongItem` accessibility drift — without changing navigation behaviour.

**Architecture:** `<CompositeList>` owns the `<ul role="application">`, the `useCompositeList` hook call, the `forwardRef`→`ZoneEntry` plumbing, and optional `loading`/`error`/`empty`/`footer` slots. It passes a row-bound `isFocused` and `isActive` to a `renderRow` callback. Domain rows stay as their own components/JSX and forward those into prop-based helper components that bake in `role`/`aria-*`/roving `tabIndex`. No React context (existing item tests render items bare, so focus state is threaded as props).

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, Tailwind v4, nanostores, Paraglide i18n, Tauri v2. Package manager: `pnpm`.

**Spec:** `docs/superpowers/specs/2026-06-03-composite-list-shell-design.md`

**Branch:** `refactor/composite-list-shell` (already created from `develop`).

**Conventions for every task:**
- Run a single test file with: `pnpm exec vitest run <path>`
- Run the whole suite with: `pnpm test`
- Typecheck with: `pnpm exec tsc --noEmit`
- The branch carries unrelated pre-existing edits in `src/components/browser/BrowserPanel.tsx` and `src/components/browser/SearchForm.tsx`. **Never `git add` those.** Stage only the files each task names.

---

## File Structure

New directory `src/components/common/composite-list/`:
- `CompositeList.tsx` — wrapper: owns `<ul>`, hook, `ZoneEntry`, slots.
- `CompositeRow.tsx` — `<li role="listitem">` summary focus stop.
- `CompositeSegment.tsx` — `<div role="group">` read-only segment focus stop.
- `CompositeAction.tsx` — native `<button>` action focus stop.
- `index.ts` — barrel export.
- `CompositeList.test.tsx` — unit tests for the shell + primitives.

Modified (migrations):
- `src/components/wishlist/PatternList.tsx`
- `src/components/browser/StationList.tsx`
- `src/components/profile/ProfileList.tsx`, `src/components/profile/ProfileItem.tsx`
- `src/components/songs/SongsList.tsx`, `src/components/songs/SongItem.tsx`
- `src/i18n/messages/en.json`, `src/i18n/messages/uk.json` (new `item_role_song`)
- `src/components/songs/SongItem.test.tsx` (new)
- `src/components/streams/StreamList.tsx`, `src/components/streams/StreamItem.tsx`

`useCompositeList.ts` is **not** modified.

---

## Task 1: CompositeList shell + primitives

**Files:**
- Create: `src/components/common/composite-list/CompositeList.tsx`
- Create: `src/components/common/composite-list/CompositeRow.tsx`
- Create: `src/components/common/composite-list/CompositeSegment.tsx`
- Create: `src/components/common/composite-list/CompositeAction.tsx`
- Create: `src/components/common/composite-list/index.ts`
- Test: `src/components/common/composite-list/CompositeList.test.tsx`

- [ ] **Step 1: Create `CompositeRow.tsx`**

```tsx
import type { CSSProperties, ReactNode } from "react";
import type { SegmentKind } from "../../../hooks/useCompositeList";

interface CompositeRowProps {
  itemId: string;
  /** Row-bound focus predicate from CompositeList's renderRow. */
  isFocused: (segment: SegmentKind) => boolean;
  /** This row is the active item — applies activeClassName for a context highlight. */
  isActiveRow?: boolean;
  /** Whole-row accessible name. */
  label: string;
  /** Announced by NVDA via aria-roledescription (e.g. "stream", "profile"). */
  roleDescription?: string;
  className?: string;
  /** Appended when isActiveRow is true. */
  activeClassName?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * The 'summary' (whole-row) focus stop. role="listitem" is EXPLICIT: under the
 * list's role="application" parent the <li>'s implicit listitem role is dropped,
 * leaving NVDA with nothing to announce. The whole-row focus ring comes from the
 * global [tabindex]:focus-visible rule in styles.css, so no ring class here.
 */
export function CompositeRow({
  itemId,
  isFocused,
  isActiveRow,
  label,
  roleDescription,
  className,
  activeClassName,
  style,
  children,
}: CompositeRowProps) {
  return (
    <li
      role="listitem"
      data-item-id={itemId}
      data-segment="summary"
      tabIndex={isFocused("summary") ? 0 : -1}
      aria-label={label}
      aria-roledescription={roleDescription}
      className={[className, isActiveRow ? activeClassName : ""].filter(Boolean).join(" ")}
      style={style}
    >
      {children}
    </li>
  );
}
```

- [ ] **Step 2: Create `CompositeSegment.tsx`**

```tsx
import type { CSSProperties, ReactNode } from "react";
import type { SegmentKind } from "../../../hooks/useCompositeList";

/** Shared roving focus ring for read-only segments and action buttons. */
export const COMPOSITE_FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]";

interface CompositeSegmentProps {
  itemId: string;
  segment: SegmentKind;
  isFocused: (segment: SegmentKind) => boolean;
  /** Value only — the segment *type* is announced via roleDescription. */
  label?: string;
  roleDescription?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * A read-only segment focus stop. role="group" is deliberate: a roleless named
 * <div> is exposed by Chromium as a "section" and read by NVDA as "розділ".
 * role="group" + aria-roledescription makes NVDA read e.g. "192 kbps, tech info".
 */
export function CompositeSegment({
  itemId,
  segment,
  isFocused,
  label,
  roleDescription,
  className,
  style,
  children,
}: CompositeSegmentProps) {
  return (
    <div
      role="group"
      data-item-id={itemId}
      data-segment={segment}
      tabIndex={isFocused(segment) ? 0 : -1}
      aria-label={label}
      aria-roledescription={roleDescription}
      className={[className, COMPOSITE_FOCUS_RING].filter(Boolean).join(" ")}
      style={style}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Create `CompositeAction.tsx`**

```tsx
import type { ReactNode } from "react";
import type { SegmentKind } from "../../../hooks/useCompositeList";
import { COMPOSITE_FOCUS_RING } from "./CompositeSegment";

interface CompositeActionProps {
  itemId: string;
  segment: SegmentKind;
  isFocused: (segment: SegmentKind) => boolean;
  label: string;
  onClick: () => void;
  className?: string;
  title?: string;
  ariaPressed?: boolean;
  ariaDisabled?: boolean;
  children: ReactNode;
}

/**
 * A per-button action focus stop. Native <button> so it self-activates on
 * Enter/Space/click; the hook stays out of the way for native controls.
 */
export function CompositeAction({
  itemId,
  segment,
  isFocused,
  label,
  onClick,
  className,
  title,
  ariaPressed,
  ariaDisabled,
  children,
}: CompositeActionProps) {
  return (
    <button
      type="button"
      data-item-id={itemId}
      data-segment={segment}
      tabIndex={isFocused(segment) ? 0 : -1}
      onClick={onClick}
      aria-label={label}
      aria-pressed={ariaPressed}
      aria-disabled={ariaDisabled}
      title={title}
      className={[className, COMPOSITE_FOCUS_RING].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Create `CompositeList.tsx`**

```tsx
import { forwardRef, useImperativeHandle, type ReactElement, type ReactNode, type Ref } from "react";
import {
  useCompositeList,
  type ActionType,
  type CompositeListItem,
  type SegmentKind,
} from "../../../hooks/useCompositeList";
import type { ZoneEntry } from "../../../hooks/useZoneNavigation";

export interface CompositeRowRenderArgs {
  id: string;
  /** This row is the active item (subtle context highlight). */
  isActive: boolean;
  /** Row-bound focus predicate to thread into CompositeRow/Segment/Action. */
  isFocused: (segment: SegmentKind) => boolean;
}

export interface CompositeListProps {
  zoneId: string;
  ariaLabel: string;
  items: CompositeListItem[];
  onTabOut: (forward: boolean) => void;
  onAction: (type: ActionType, itemId: string, segment: SegmentKind) => void;
  onEmpty?: () => void;
  renderRow: (row: CompositeRowRenderArgs) => ReactNode;
  className?: string;
  /** Render instead of the <ul> while async data loads. */
  loading?: ReactNode;
  /** Render instead of the <ul> on error. */
  error?: ReactNode;
  /** Render instead of the <ul> when items is empty. */
  empty?: ReactNode;
  /** Render after the rows, inside the <ul> (e.g. a "Load more" control). */
  footer?: ReactNode;
  /** Augment the imperative handle with extra methods (must be pure over `api`). */
  imperativeExtra?: (api: {
    focusItem: (itemId: string, segment?: SegmentKind) => void;
  }) => object;
}

function CompositeListInner<H extends ZoneEntry = ZoneEntry>(
  props: CompositeListProps,
  ref: Ref<H>,
): ReactElement {
  const {
    zoneId,
    ariaLabel,
    items,
    onTabOut,
    onAction,
    onEmpty,
    renderRow,
    className,
    loading,
    error,
    empty,
    footer,
    imperativeExtra,
  } = props;

  const { listRef, onKeyDownCapture, isFocused, restoreFocus, focusItem, activeItemId } =
    useCompositeList({ zoneId, items, onTabOut, onAction, onEmpty });

  useImperativeHandle(
    ref,
    () =>
      ({
        id: zoneId,
        get el() {
          return listRef.current!;
        },
        focus: restoreFocus,
        ...(imperativeExtra ? imperativeExtra({ focusItem }) : {}),
      }) as unknown as H,
    // imperativeExtra is expected to be pure over the `api` argument.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoneId, restoreFocus, focusItem],
  );

  if (loading != null) return <>{loading}</>;
  if (error != null) return <>{error}</>;
  if (items.length === 0 && empty != null) return <>{empty}</>;

  return (
    <ul
      ref={listRef}
      data-zone-id={zoneId}
      role="application"
      aria-label={ariaLabel}
      className={className}
      onKeyDownCapture={onKeyDownCapture}
    >
      {items.map((it) =>
        renderRow({
          id: it.id,
          isActive: activeItemId === it.id,
          isFocused: (segment) => isFocused(it.id, segment),
        }),
      )}
      {footer}
    </ul>
  );
}

// Generic forwardRef: the cast preserves the <H> type parameter so callers like
// ProfileList can pass a ref to a handle that extends ZoneEntry with extra methods.
export const CompositeList = forwardRef(CompositeListInner) as <H extends ZoneEntry = ZoneEntry>(
  props: CompositeListProps & { ref?: Ref<H> },
) => ReactElement;
```

- [ ] **Step 5: Create `index.ts`**

```ts
export { CompositeList } from "./CompositeList";
export type { CompositeListProps, CompositeRowRenderArgs } from "./CompositeList";
export { CompositeRow } from "./CompositeRow";
export { CompositeSegment, COMPOSITE_FOCUS_RING } from "./CompositeSegment";
export { CompositeAction } from "./CompositeAction";
```

- [ ] **Step 6: Write the failing test `CompositeList.test.tsx`**

```tsx
import { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import type { ZoneEntry } from "../../../hooks/useZoneNavigation";
import type { CompositeListItem } from "../../../hooks/useCompositeList";
import { CompositeList, CompositeRow, CompositeSegment, CompositeAction } from "./index";

const ITEMS: CompositeListItem[] = [
  { id: "a", segments: ["metadata", "action-add"] },
  { id: "b", segments: ["metadata", "action-add"] },
];

function renderList(extra: Record<string, unknown> = {}) {
  const ref = createRef<ZoneEntry>();
  const onTabOut = vi.fn();
  const onAction = vi.fn();
  const utils = render(
    <CompositeList
      ref={ref}
      zoneId="test-list"
      ariaLabel="Test list"
      items={ITEMS}
      onTabOut={onTabOut}
      onAction={onAction}
      renderRow={({ id, isActive, isFocused }) => (
        <CompositeRow
          key={id}
          itemId={id}
          isFocused={isFocused}
          isActiveRow={isActive}
          label={`Row ${id}`}
          roleDescription="item"
          className="row"
          activeClassName="active"
        >
          <CompositeSegment
            itemId={id}
            segment="metadata"
            isFocused={isFocused}
            label={`meta ${id}`}
            roleDescription="meta"
          >
            m
          </CompositeSegment>
          <CompositeAction
            itemId={id}
            segment="action-add"
            isFocused={isFocused}
            label={`act ${id}`}
            onClick={() => onAction("primary", id, "action-add")}
          >
            x
          </CompositeAction>
        </CompositeRow>
      )}
      {...extra}
    />,
  );
  return { ref, onTabOut, onAction, ...utils };
}

const activeAttrs = () => ({
  id: document.activeElement?.getAttribute("data-item-id") ?? null,
  seg: document.activeElement?.getAttribute("data-segment") ?? null,
});

describe("CompositeList", () => {
  it("renders a role=application list with the zone id and aria-label", () => {
    const { container } = renderList();
    const ul = container.querySelector("ul")!;
    expect(ul.getAttribute("role")).toBe("application");
    expect(ul.getAttribute("data-zone-id")).toBe("test-list");
    expect(ul.getAttribute("aria-label")).toBe("Test list");
  });

  it("renders each row as a listitem with roledescription and a roving tabIndex", () => {
    const { container } = renderList();
    const rows = container.querySelectorAll('li[data-segment="summary"]');
    expect(rows).toHaveLength(2);
    rows.forEach((li) => expect(li.getAttribute("aria-roledescription")).toBe("item"));
    // First row's summary is the initial focus stop.
    expect((rows[0] as HTMLElement).tabIndex).toBe(0);
    expect((rows[1] as HTMLElement).tabIndex).toBe(-1);
  });

  it("renders segments as role=group and actions as native buttons", () => {
    const { container } = renderList();
    const seg = container.querySelector('[data-segment="metadata"]')!;
    expect(seg.getAttribute("role")).toBe("group");
    expect(seg.getAttribute("aria-roledescription")).toBe("meta");
    const action = container.querySelector('[data-segment="action-add"]')!;
    expect(action.tagName).toBe("BUTTON");
  });

  it("drives roving focus: entry focuses first row, ArrowDown moves to the next", () => {
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    expect(activeAttrs()).toEqual({ id: "a", seg: "summary" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(activeAttrs()).toEqual({ id: "b", seg: "summary" });
  });

  it("Tab exits the zone via onTabOut", () => {
    const { ref, onTabOut } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(onTabOut).toHaveBeenCalledWith(true);
  });

  it("renders the empty slot instead of the <ul> when items is empty", () => {
    const ref = createRef<ZoneEntry>();
    const { container, queryByText } = render(
      <CompositeList
        ref={ref}
        zoneId="test-list"
        ariaLabel="Test list"
        items={[]}
        onTabOut={vi.fn()}
        onAction={vi.fn()}
        empty={<div>nothing here</div>}
        renderRow={() => null}
      />,
    );
    expect(container.querySelector("ul")).toBeNull();
    expect(queryByText("nothing here")).toBeTruthy();
  });

  it("renders the loading slot instead of the <ul>", () => {
    const ref = createRef<ZoneEntry>();
    const { container, queryByText } = render(
      <CompositeList
        ref={ref}
        zoneId="test-list"
        ariaLabel="Test list"
        items={ITEMS}
        onTabOut={vi.fn()}
        onAction={vi.fn()}
        loading={<div>loading…</div>}
        renderRow={() => null}
      />,
    );
    expect(container.querySelector("ul")).toBeNull();
    expect(queryByText("loading…")).toBeTruthy();
  });

  it("renders the footer after the rows inside the <ul>", () => {
    const { container } = renderList({ footer: <li data-testid="footer">more</li> });
    const ul = container.querySelector("ul")!;
    expect(ul.querySelector('[data-testid="footer"]')).toBeTruthy();
  });

  it("exposes extra imperative methods via imperativeExtra", () => {
    const ref = createRef<ZoneEntry & { focusFirst: () => void }>();
    render(
      <CompositeList
        ref={ref}
        zoneId="test-list"
        ariaLabel="Test list"
        items={ITEMS}
        onTabOut={vi.fn()}
        onAction={vi.fn()}
        imperativeExtra={({ focusItem }) => ({ focusFirst: () => focusItem("a", "summary") })}
        renderRow={({ id, isActive, isFocused }) => (
          <CompositeRow key={id} itemId={id} isFocused={isFocused} isActiveRow={isActive} label={id}>
            <span />
          </CompositeRow>
        )}
      />,
    );
    expect(typeof ref.current!.focusFirst).toBe("function");
    act(() => ref.current!.focusFirst());
    expect(activeAttrs()).toEqual({ id: "a", seg: "summary" });
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm exec vitest run src/components/common/composite-list/CompositeList.test.tsx`
Expected: FAIL initially only if files are missing. Since Steps 1–5 created the implementation, this step is the first green run. If any assertion fails, fix the primitive named in the failure before continuing.

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm exec vitest run src/components/common/composite-list/CompositeList.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 9: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/common/composite-list/
git commit -F - <<'EOF'
feat(list): CompositeList shell + Row/Segment/Action primitives

Thin presentational shell around useCompositeList: <CompositeList> owns
the <ul role="application">, the hook, the ZoneEntry plumbing and optional
loading/error/empty/footer slots. CompositeRow/Segment/Action bake in the
listitem/group/button a11y semantics so callers can no longer drift.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 2: Migrate PatternList (wishlist / ignorelist)

**Files:**
- Modify: `src/components/wishlist/PatternList.tsx` (full rewrite below)

This list has no dedicated unit test; the regression net is `pnpm test` (WishlistPanel tests, if any) + typecheck + the shared shell test.

- [ ] **Step 1: Replace `PatternList.tsx` with the migrated version**

```tsx
import { forwardRef, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CompositeList, CompositeRow, CompositeSegment, CompositeAction } from "../common/composite-list";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { ConfirmDialog } from "../common/ConfirmDialog";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as m from "../../i18n/paraglide/messages";

interface PatternItem {
  pattern: string;
  addedAt?: string;
}

interface Props {
  items: PatternItem[];
  ariaLabel: string;
  showDate: boolean;
  emptyMessage: string;
  exitZone: (forward: boolean) => void;
  onEmpty: () => void;
  onEdit: (pattern: string) => void;
  onRemove: (pattern: string) => void;
}

const PATTERN_SEGMENTS: Exclude<SegmentKind, "summary">[] = ["conditions", "action-edit", "action-delete"];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export const PatternList = forwardRef<ZoneEntry, Props>(
  ({ items, ariaLabel, showDate, emptyMessage, exitZone, onEmpty, onEdit, onRemove }, ref) => {
    const listItems = useMemo(
      () => items.map((item) => ({ id: item.pattern, segments: PATTERN_SEGMENTS })),
      [items],
    );
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    return (
      <>
        <CompositeList
          ref={ref}
          zoneId="wishlist-list"
          ariaLabel={ariaLabel}
          items={listItems}
          className="flex-1 overflow-auto"
          onTabOut={exitZone}
          onEmpty={onEmpty}
          empty={
            <div role="status" className="py-4 text-center text-sm text-slate-500">
              {emptyMessage}
            </div>
          }
          onAction={(type, itemId, segment) => {
            if (type === "delete") {
              setConfirmDelete(itemId);
              return;
            }
            // Edit/Delete buttons self-activate; Enter/Space on the whole-row summary edits.
            if ((type === "primary" || type === "toggle") && segment === "summary") {
              onEdit(itemId);
            }
          }}
          renderRow={({ id, isActive, isFocused }) => {
            const item = items.find((it) => it.pattern === id)!;
            // Value only; the "conditions" type is announced via aria-roledescription.
            const conditionsValue =
              showDate && item.addedAt
                ? `${m.column_added_at()}, ${formatDate(item.addedAt)}`
                : m.empty_conditions();
            return (
              <CompositeRow
                key={id}
                itemId={id}
                isFocused={isFocused}
                isActiveRow={isActive}
                label={id}
                roleDescription={m.item_role_pattern()}
                className="border-b border-slate-800 forced-colors:border-[ButtonText]"
                activeClassName="bg-slate-800/60"
              >
                {/* Pattern text — visual only; the row's accessible name is on the <li>. */}
                <div className="px-3 py-2 font-mono text-slate-200">{id}</div>

                <CompositeSegment
                  itemId={id}
                  segment="conditions"
                  isFocused={isFocused}
                  label={conditionsValue}
                  roleDescription={m.segment_conditions()}
                  className="px-3 py-1 text-sm text-slate-400"
                >
                  {showDate && item.addedAt ? formatDate(item.addedAt) : "—"}
                </CompositeSegment>

                <div className="flex justify-end gap-1 px-3 py-1">
                  <CompositeAction
                    itemId={id}
                    segment="action-edit"
                    isFocused={isFocused}
                    onClick={() => onEdit(id)}
                    label={`${m.edit_pattern()}: ${id}`}
                    className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300"
                  >
                    ✎
                  </CompositeAction>
                  <CompositeAction
                    itemId={id}
                    segment="action-delete"
                    isFocused={isFocused}
                    onClick={() => setConfirmDelete(id)}
                    label={`${m.remove_pattern()}: ${id}`}
                    className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300"
                  >
                    ✕
                  </CompositeAction>
                </div>
              </CompositeRow>
            );
          }}
        />
        {confirmDelete &&
          createPortal(
            <ConfirmDialog
              title={m.remove_pattern()}
              message={m.confirm_remove_pattern({ pattern: confirmDelete })}
              onConfirm={() => {
                onRemove(confirmDelete);
                setConfirmDelete(null);
              }}
              onCancel={() => setConfirmDelete(null)}
            />,
            document.body,
          )}
      </>
    );
  },
);
PatternList.displayName = "PatternList";
```

- [ ] **Step 2: Run the full suite**

Run: `pnpm test`
Expected: PASS (no regressions; `WishlistPanel` still registers the `wishlist-list` zone).

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/wishlist/PatternList.tsx
git commit -F - <<'EOF'
refactor(wishlist): migrate PatternList to CompositeList

Replace the hand-rolled <ul>/<li>/segment boilerplate with the shared
CompositeList shell and Row/Segment/Action primitives. DOM/ARIA output
unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 3: Migrate StationList (browser results)

**Files:**
- Modify: `src/components/browser/StationList.tsx` (full rewrite below)

Key points: `loading`/`error`/`empty` go into the matching slots; the "Load more" row goes into `footer`. The metadata segment keeps its value-only label (`metaValue`) while the visible text differs (matches the current component exactly).

- [ ] **Step 1: Replace `StationList.tsx` with the migrated version**

```tsx
import { forwardRef, useCallback, useMemo } from "react";
import { useStore } from "@nanostores/react";
import { $streams } from "../../stores/streams";
import { addStation } from "../../stores/browser";
import { CompositeList, CompositeRow, CompositeSegment, COMPOSITE_FOCUS_RING } from "../common/composite-list";
import type { SegmentKind } from "../../hooks/useCompositeList";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { StationResult } from "../../lib/tauri";
import { useAnnounce } from "../../hooks/useAnnounce";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  stations: StationResult[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore?: () => void;
  emptyMessage: string;
  exitZone: (forward: boolean) => void;
}

const STATION_SEGMENTS: Exclude<SegmentKind, "summary">[] = ["metadata", "action-add"];

export const StationList = forwardRef<ZoneEntry, Props>(
  ({ stations, loading, error, hasMore, onLoadMore, emptyMessage, exitZone }, ref) => {
    const streams = useStore($streams);
    const announce = useAnnounce();

    const existingUrls = useMemo(() => new Set(streams.map((s) => s.url)), [streams]);
    const isAlreadyAdded = useCallback(
      (station: StationResult) => existingUrls.has(station.urlResolved || station.url),
      [existingUrls],
    );

    const items = useMemo(
      () => stations.map((s) => ({ id: s.stationuuid, segments: STATION_SEGMENTS })),
      [stations],
    );

    const handleAdd = useCallback(
      async (station: StationResult) => {
        if (isAlreadyAdded(station)) return;
        try {
          await addStation(station);
          announce(m.browser_station_added({ name: station.name }), "polite");
        } catch (err) {
          addToast(String(err), "error");
        }
      },
      [isAlreadyAdded, announce],
    );

    return (
      <CompositeList
        ref={ref}
        zoneId="browser-results"
        ariaLabel={m.zone_browser_results()}
        items={items}
        className="flex-1 overflow-auto"
        onTabOut={exitZone}
        loading={
          loading ? (
            <div role="status" aria-live="polite" className="p-4 text-sm text-slate-400">
              {m.browser_loading()}
            </div>
          ) : undefined
        }
        error={error ? <div role="alert" className="p-4 text-sm text-red-400">{error}</div> : undefined}
        empty={<div role="status" className="p-4 text-center text-sm text-slate-500">{emptyMessage}</div>}
        footer={
          hasMore && onLoadMore ? (
            <li>
              <button onClick={onLoadMore} className="w-full py-2 text-sm text-slate-400 hover:bg-slate-800">
                {m.browser_load_more()}
              </button>
            </li>
          ) : undefined
        }
        // The Add button self-activates; Enter on the whole-row summary also adds.
        onAction={(type, itemId, segment) => {
          if (type !== "primary" || segment !== "summary") return;
          const station = stations.find((s) => s.stationuuid === itemId);
          if (station) void handleAdd(station);
        }}
        renderRow={({ id, isActive, isFocused }) => {
          const station = stations.find((s) => s.stationuuid === id)!;
          const added = isAlreadyAdded(station);
          // Value only; the "Метадані" type is announced via aria-roledescription.
          const metaValue = [
            station.country,
            station.codec,
            station.bitrate ? `${station.bitrate} кбіт/с` : null,
            station.clickcount ? String(station.clickcount) : null,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <CompositeRow
              key={id}
              itemId={id}
              isFocused={isFocused}
              isActiveRow={isActive}
              label={station.name}
              roleDescription={m.item_role_station()}
              className="border-b border-slate-800 forced-colors:border-[ButtonText]"
              activeClassName="bg-slate-800/60"
            >
              {/* Station name — visual only; the row's accessible name is on the <li>. */}
              <div className="px-3 py-2 font-medium text-slate-100">{station.name}</div>

              <CompositeSegment
                itemId={id}
                segment="metadata"
                isFocused={isFocused}
                label={metaValue}
                roleDescription={m.segment_metadata()}
                className="px-3 py-1 text-sm text-slate-400"
              >
                {[station.name, station.country, station.codec, station.bitrate && `${station.bitrate} kbps`]
                  .filter(Boolean)
                  .join(" · ")}
              </CompositeSegment>

              {/* Action — individual focus stop (roving tabIndex). Uses aria-disabled
                  (not a CompositeAction) because the "added" state is non-interactive. */}
              <div className="px-3 py-1">
                <button
                  data-item-id={id}
                  data-segment="action-add"
                  tabIndex={isFocused("action-add") ? 0 : -1}
                  aria-disabled={added || undefined}
                  aria-label={added ? m.browser_added() : m.add_stream()}
                  onClick={() => {
                    if (!added) void handleAdd(station);
                  }}
                  className={`rounded px-2 py-0.5 text-xs ${COMPOSITE_FOCUS_RING} ${
                    added
                      ? "cursor-not-allowed text-slate-600"
                      : "bg-blue-600 text-white hover:bg-blue-700 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
                  }`}
                >
                  {added ? m.browser_added() : m.add_stream()}
                </button>
              </div>
            </CompositeRow>
          );
        }}
      />
    );
  },
);
StationList.displayName = "StationList";
```

> Note: the add button stays a raw `<button>` (not `CompositeAction`) because its
> disabled/added state and conditional styling differ from the generic action
> pattern. It still carries `data-item-id`/`data-segment`/roving `tabIndex` and the
> shared `COMPOSITE_FOCUS_RING`, so navigation and focus ring are identical.

- [ ] **Step 2: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/browser/StationList.tsx
git commit -F - <<'EOF'
refactor(browser): migrate StationList to CompositeList

Move the <ul>/<li>/segment boilerplate to the shared shell; loading/error/
empty become slots and "Load more" becomes the footer slot. DOM/ARIA output
unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 4: Migrate ProfileList + ProfileItem

**Files:**
- Modify: `src/components/profile/ProfileItem.tsx` (full rewrite below)
- Modify: `src/components/profile/ProfileList.tsx` (full rewrite below)

Regression net: `ProfileItem.test.tsx` and `ProfileList.test.tsx` must pass **unchanged**. `ProfileItem` keeps its exact props (`isFocused`, `isActiveRow`).

- [ ] **Step 1: Replace `ProfileItem.tsx` with the migrated version**

```tsx
import { CheckCircle, ArrowRightLeft, Copy, Pencil, Trash2, Upload } from "lucide-react";
import type React from "react";
import type { ProfileMeta } from "../../lib/tauri";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { CompositeRow, CompositeAction } from "../common/composite-list";
import { ProfileContextMenu } from "./ProfileContextMenu";
import { getLocale } from "../../i18n/paraglide/runtime";
import * as m from "../../i18n/paraglide/messages";

export type ProfileSegment =
  | "action-switch"
  | "action-duplicate"
  | "action-rename"
  | "action-delete"
  | "action-export"
  | "action-menu";

/**
 * Compute the Left/Right focus-stop order for a profile row. Disabled actions
 * are omitted entirely — a row never carries a focus stop the user cannot use.
 * 'summary' is implicit (handled by useCompositeList), so it is not listed here.
 */
export function getProfileSegments(profile: ProfileMeta, activeProfile: string): ProfileSegment[] {
  const isActive = profile.name === activeProfile;
  const isDefault = profile.name === "Default";
  const segs: ProfileSegment[] = [];
  if (!isActive) segs.push("action-switch");
  segs.push("action-duplicate");
  if (!isDefault && !isActive) {
    segs.push("action-rename");
    segs.push("action-delete");
  }
  segs.push("action-export");
  segs.push("action-menu");
  return segs;
}

function streamCountLabel(count: number): string {
  const category = new Intl.PluralRules(getLocale()).select(count);
  switch (category) {
    case "one":
      return m.profile_stream_count_one({ count });
    case "few":
      return m.profile_stream_count_few({ count });
    case "many":
      return m.profile_stream_count_many({ count });
    default:
      return m.profile_stream_count_other({ count });
  }
}

interface Props {
  profile: ProfileMeta;
  activeProfile: string;
  isFocused: (segment: "summary" | SegmentKind) => boolean;
  /** This row is the composite list's active item — subtle context highlight. */
  isActiveRow: boolean;
  onSwitch: (name: string) => void;
  onDuplicate: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
  onExport: (name: string) => void;
}

export function ProfileItem({
  profile,
  activeProfile,
  isFocused,
  isActiveRow,
  onSwitch,
  onDuplicate,
  onRename,
  onDelete,
  onExport,
}: Props) {
  const isActive = profile.name === activeProfile;
  const isDefault = profile.name === "Default";
  const countLabel = streamCountLabel(profile.streamCount);
  // The whole row's accessible name carries every piece of state; the check icon
  // and the count are decorative (aria-hidden) so NVDA reads one clean label.
  const rowLabel = isActive
    ? `${profile.name}, ${m.profile_active_badge()}, ${countLabel}`
    : `${profile.name}, ${countLabel}`;

  return (
    <CompositeRow
      itemId={profile.name}
      isFocused={isFocused}
      isActiveRow={isActiveRow}
      label={rowLabel}
      roleDescription={m.item_role_profile()}
      className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 forced-colors:border-[ButtonText]"
      activeClassName="bg-slate-800/60"
    >
      <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center">
        {isActive ? <CheckCircle size={14} className="text-sky-400 forced-colors:text-[Highlight]" /> : null}
      </span>
      <span className="truncate font-medium text-slate-200">{profile.name}</span>
      <span aria-hidden="true" className="ml-auto text-xs text-slate-500">
        {countLabel}
      </span>

      <div
        role="group"
        aria-label={m.profile_row_actions({ name: profile.name })}
        className="flex items-center gap-1"
      >
        {!isActive && (
          <IconButton
            name={profile.name}
            segment="action-switch"
            isFocused={isFocused}
            onClick={() => onSwitch(profile.name)}
            label={m.profile_switch_named({ name: profile.name })}
            Icon={ArrowRightLeft}
          />
        )}
        <IconButton
          name={profile.name}
          segment="action-duplicate"
          isFocused={isFocused}
          onClick={() => onDuplicate(profile.name)}
          label={m.profile_duplicate_named({ name: profile.name })}
          Icon={Copy}
        />
        {!isDefault && !isActive && (
          <>
            <IconButton
              name={profile.name}
              segment="action-rename"
              isFocused={isFocused}
              onClick={() => onRename(profile.name)}
              label={m.profile_rename_named({ name: profile.name })}
              Icon={Pencil}
            />
            <IconButton
              name={profile.name}
              segment="action-delete"
              isFocused={isFocused}
              onClick={() => onDelete(profile.name)}
              label={m.profile_delete_named({ name: profile.name })}
              Icon={Trash2}
            />
          </>
        )}
        <IconButton
          name={profile.name}
          segment="action-export"
          isFocused={isFocused}
          onClick={() => onExport(profile.name)}
          label={m.profile_export_named({ name: profile.name })}
          Icon={Upload}
        />
        <ProfileContextMenu
          profile={profile}
          isActive={isActive}
          isDefault={isDefault}
          menuFocused={isFocused("action-menu")}
          onSwitch={() => onSwitch(profile.name)}
          onDuplicate={() => onDuplicate(profile.name)}
          onRename={() => onRename(profile.name)}
          onDelete={() => onDelete(profile.name)}
          onExport={() => onExport(profile.name)}
        />
      </div>
    </CompositeRow>
  );
}

function IconButton({
  name,
  segment,
  isFocused,
  onClick,
  label,
  Icon,
}: {
  name: string;
  segment: ProfileSegment;
  isFocused: (segment: "summary" | SegmentKind) => boolean;
  onClick: () => void;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <CompositeAction
      itemId={name}
      segment={segment}
      isFocused={isFocused}
      onClick={onClick}
      label={label}
      title={label}
      className="inline-flex shrink-0 items-center justify-center rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600 forced-colors:border forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]"
    >
      <Icon size={14} aria-hidden className="opacity-80" />
    </CompositeAction>
  );
}
```

> `CompositeAction`'s `isFocused` prop is `(segment: SegmentKind) => boolean`.
> `ProfileItem`'s `isFocused` prop is typed `(segment: "summary" | SegmentKind) => boolean`,
> which is assignable. `IconButton` passes it straight through.

- [ ] **Step 2: Replace `ProfileList.tsx` with the migrated version**

```tsx
import { forwardRef, useMemo } from "react";
import { CompositeList } from "../common/composite-list";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { ProfileMeta } from "../../lib/tauri";
import { ProfileItem, getProfileSegments } from "./ProfileItem";
import * as m from "../../i18n/paraglide/messages";

export interface ProfileListHandle extends ZoneEntry {
  /** Move focus to a specific profile row's summary (used after create/rename/switch). */
  focusProfile: (name: string) => void;
}

interface Props {
  profiles: ProfileMeta[];
  activeProfile: string;
  exitZone: (forward: boolean) => void;
  onSwitch: (name: string) => void;
  onDuplicate: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
  onExport: (name: string) => void;
}

export const ProfileList = forwardRef<ProfileListHandle, Props>(function ProfileList(
  { profiles, activeProfile, exitZone, onSwitch, onDuplicate, onRename, onDelete, onExport },
  ref,
) {
  const items = useMemo(
    () => profiles.map((p) => ({ id: p.name, segments: getProfileSegments(p, activeProfile) })),
    [profiles, activeProfile],
  );

  return (
    <CompositeList<ProfileListHandle>
      ref={ref}
      zoneId="profiles-list"
      ariaLabel={m.zone_profiles_list()}
      items={items}
      className="flex-1 overflow-y-auto overflow-x-hidden pt-1"
      onTabOut={exitZone}
      // No onEmpty: a profile list always contains at least "Default".
      imperativeExtra={({ focusItem }) => ({
        focusProfile: (name: string) => focusItem(name, "summary"),
      })}
      onAction={(type, itemId, segment) => {
        if (type === "delete") {
          onDelete(itemId);
          return;
        }
        if (type === "contextMenu") {
          const btn = document.querySelector<HTMLButtonElement>(
            `[data-item-id="${CSS.escape(itemId)}"][data-context-menu-trigger]`,
          );
          btn?.click();
          return;
        }
        // Enter/Space on the whole-row summary switches to that profile.
        if ((type === "primary" || type === "toggle") && segment === "summary") {
          onSwitch(itemId);
        }
      }}
      renderRow={({ id, isActive, isFocused }) => {
        const profile = profiles.find((p) => p.name === id)!;
        return (
          <ProfileItem
            key={id}
            profile={profile}
            activeProfile={activeProfile}
            isActiveRow={isActive}
            isFocused={isFocused}
            onSwitch={onSwitch}
            onDuplicate={onDuplicate}
            onRename={onRename}
            onDelete={onDelete}
            onExport={onExport}
          />
        );
      }}
    />
  );
});
ProfileList.displayName = "ProfileList";
```

> The old `ProfileList` used `listRef.current?.querySelector` for the context-menu
> click; the migrated version queries `document` because the list no longer holds a
> ref to the `<ul>`. The `data-context-menu-trigger` attribute is unique per row, so
> a document-scoped query is equivalent. (Profile names are unique.)

- [ ] **Step 3: Run the profile tests**

Run: `pnpm exec vitest run src/components/profile/ProfileItem.test.tsx src/components/profile/ProfileList.test.tsx`
Expected: PASS, unchanged. In particular `focusProfile(name)` (ProfileList.test) and the bare-item a11y assertions (ProfileItem.test) pass.

- [ ] **Step 4: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/profile/ProfileItem.tsx src/components/profile/ProfileList.tsx
git commit -F - <<'EOF'
refactor(profile): migrate ProfileList/ProfileItem to CompositeList

ProfileList delegates the <ul>/ZoneEntry to the shell and uses
imperativeExtra for focusProfile; ProfileItem renders via CompositeRow/
CompositeAction. Item prop API (isFocused/isActiveRow) is unchanged, so the
existing bare-item tests pass without edits.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 5: Migrate SongsList + SongItem + fix a11y drift

**Files:**
- Modify: `src/i18n/messages/en.json` (add `item_role_song`)
- Modify: `src/i18n/messages/uk.json` (add `item_role_song`)
- Modify: `src/components/songs/SongItem.tsx` (full rewrite below)
- Modify: `src/components/songs/SongsList.tsx` (full rewrite below)
- Create: `src/components/songs/SongItem.test.tsx`

This is the only task that changes DOM output: it adds `aria-roledescription`,
makes segments `role="group"`, and switches the focus ring from `ring-2` to the
shared `outline`.

- [ ] **Step 1: Add the `item_role_song` key to `en.json`**

In `src/i18n/messages/en.json`, find the line:

```json
  "item_role_pattern": "pattern",
```

Add directly below it:

```json
  "item_role_song": "song",
```

- [ ] **Step 2: Add the `item_role_song` key to `uk.json`**

In `src/i18n/messages/uk.json`, find the line:

```json
  "item_role_pattern": "патерн",
```

Add directly below it:

```json
  "item_role_song": "пісня",
```

- [ ] **Step 3: Regenerate the Paraglide message functions**

Run: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/i18n/paraglide`
Expected: regenerates `src/i18n/paraglide/messages/`. Verify the message exists:

Run: `pnpm exec node -e "import('./src/i18n/paraglide/messages.js').then(m => console.log(typeof m.item_role_song))"`
Expected: prints `function`.

> If the standalone CLI is unavailable, run `pnpm vite:build` instead — the
> `paraglideVitePlugin` recompiles messages from `./project.inlang` on build.

- [ ] **Step 4: Replace `SongItem.tsx` with the migrated version**

```tsx
import { Play, Square, FileMusic, AlertCircle } from "lucide-react";
import type { Song } from "../../types/song";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { CompositeRow, CompositeSegment, CompositeAction } from "../common/composite-list";
import { SongContextMenu, type SongAction } from "./SongContextMenu";
import { formatDuration } from "../../lib/formatters";
import * as m from "../../i18n/paraglide/messages";

export interface SongItemData {
  id: string;
  /** Segments after summary. Status sits before track on incomplete files. */
  segments: Exclude<SegmentKind, "summary">[];
}

export function getSongSegments(song: Song): SongItemData["segments"] {
  const base: SongItemData["segments"] = ["track", "tech", "action-play", "action-menu"];
  return song.isComplete ? base : ["status", ...base];
}

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

interface Props {
  song: Song;
  isActiveRow: boolean;
  isPlaying: boolean;
  isFocused: (segment: "summary" | SegmentKind) => boolean;
  onPlay: () => void;
  onAction: (action: SongAction) => void;
}

export function SongItem({ song, isActiveRow, isPlaying, isFocused, onPlay, onAction }: Props) {
  const summaryLabel = m.songs_row_summary({
    title: song.title || song.fileName,
    artist: song.artist || "—",
    station: song.station,
    size: formatSize(song.sizeBytes),
    date: formatDate(song.recordedAt),
  });

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

      <CompositeSegment
        itemId={song.path}
        segment="track"
        isFocused={isFocused}
        label={song.title || song.fileName}
        className="flex flex-1 min-w-0 items-center gap-2 truncate text-sm text-slate-100"
      >
        <FileMusic size={14} aria-hidden className="flex-none text-slate-500" />
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
}
```

> Drift fixes applied: the row now carries `aria-roledescription` (was missing);
> `status`/`track`/`tech` are `role="group"` segments via `CompositeSegment` (were
> bare `<span>`s); the focus ring is the shared `outline` (was `ring-2`). The
> whole-row accessible name (`summaryLabel`) is preserved unchanged.

- [ ] **Step 5: Replace `SongsList.tsx` with the migrated version**

```tsx
import { forwardRef, useMemo } from "react";
import { useStore } from "@nanostores/react";
import { $filteredSongs } from "../../stores/songs";
import { $playerStatus } from "../../stores/player";
import { CompositeList } from "../common/composite-list";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { SongItem, getSongSegments } from "./SongItem";
import type { SongAction } from "./SongContextMenu";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  exitZone: (forward: boolean) => void;
  onEmpty: () => void;
  onPlay: (path: string) => void;
  onAction: (path: string, action: SongAction) => void;
}

export const SongsList = forwardRef<ZoneEntry, Props>(({ exitZone, onEmpty, onPlay, onAction }, ref) => {
  const songs = useStore($filteredSongs);
  const playerStatus = useStore($playerStatus);
  const playingPath =
    playerStatus.state !== "stopped" && playerStatus.source?.type === "file"
      ? playerStatus.source.path
      : null;

  const items = useMemo(() => songs.map((s) => ({ id: s.path, segments: getSongSegments(s) })), [songs]);

  return (
    <CompositeList
      ref={ref}
      zoneId="songs-list"
      ariaLabel={m.songs_zone_list()}
      items={items}
      className="flex-1 overflow-y-auto overflow-x-hidden"
      onTabOut={exitZone}
      onEmpty={onEmpty}
      onAction={(type, itemId, segment) => {
        if (type === "contextMenu") {
          const menuBtn = document.querySelector<HTMLButtonElement>(
            `[data-item-id="${CSS.escape(itemId)}"][data-context-menu-trigger]`,
          );
          menuBtn?.click();
          return;
        }
        if ((type === "primary" || type === "toggle") && segment === "summary") {
          onPlay(itemId);
        }
      }}
      renderRow={({ id, isActive, isFocused }) => {
        const song = songs.find((s) => s.path === id)!;
        return (
          <SongItem
            key={id}
            song={song}
            isActiveRow={isActive}
            isPlaying={playingPath === id}
            isFocused={isFocused}
            onPlay={() => onPlay(id)}
            onAction={(action) => onAction(id, action)}
          />
        );
      }}
    />
  );
});
SongsList.displayName = "SongsList";
```

> Like ProfileList, the context-menu click now queries `document` instead of the
> list ref. Song paths are unique, so the scoped query is equivalent.

- [ ] **Step 6: Write the new test `SongItem.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { Song } from "../../types/song";
import { SongItem } from "./SongItem";

vi.mock("../../i18n/paraglide/messages", () => ({
  item_role_song: () => "пісня",
  songs_row_summary: ({ title }: { title: string }) => `${title} summary`,
  songs_incomplete_badge: () => "неповний",
  songs_action_play: () => "Відтворити",
  songs_action_stop: () => "Зупинити",
  songs_action_menu: () => "Меню",
  songs_action_explorer: () => "Провідник",
  songs_action_rename: () => "Перейменувати",
  songs_action_tags: () => "Теги",
  songs_action_delete: () => "Видалити",
}));

const mk = (over: Partial<Song> = {}): Song => ({
  path: "/songs/a.mp3",
  fileName: "a.mp3",
  title: "Title A",
  artist: "Artist A",
  album: "",
  station: "Radio X",
  sizeBytes: 2048,
  durationMs: 60000,
  recordedAt: "2026-01-01T00:00:00Z",
  isComplete: true,
  ...over,
});

function renderItem(song = mk(), focusedSeg: string = "summary", isPlaying = false) {
  return render(
    <ul>
      <SongItem
        song={song}
        isActiveRow
        isPlaying={isPlaying}
        isFocused={(seg) => seg === focusedSeg}
        onPlay={() => {}}
        onAction={() => {}}
      />
    </ul>,
  );
}

describe("SongItem — a11y structure (drift fixes)", () => {
  it("describes the row as a song via aria-roledescription", () => {
    const { container } = renderItem();
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("role")).toBe("listitem");
    expect(li.getAttribute("aria-roledescription")).toBe("пісня");
    expect(li.getAttribute("aria-label")).toContain("Title A");
    expect(li.tabIndex).toBe(0);
  });

  it("renders track and tech segments as role=group", () => {
    const { container } = renderItem();
    expect(container.querySelector('[data-segment="track"]')!.getAttribute("role")).toBe("group");
    expect(container.querySelector('[data-segment="tech"]')!.getAttribute("role")).toBe("group");
  });

  it("renders the incomplete badge as a role=group status segment", () => {
    const { container } = renderItem(mk({ isComplete: false }));
    const status = container.querySelector('[data-segment="status"]')!;
    expect(status.getAttribute("role")).toBe("group");
    expect(status.getAttribute("aria-label")).toBe("неповний");
  });

  it("uses the shared outline focus ring (not ring-2) on segments", () => {
    const { container } = renderItem();
    const track = container.querySelector('[data-segment="track"]')!;
    expect(track.className).toMatch(/focus-visible:outline/);
    expect(track.className).not.toMatch(/focus-visible:ring-2/);
  });

  it("renders play as a button focus stop that calls onPlay", () => {
    const onPlay = vi.fn();
    const { container } = render(
      <ul>
        <SongItem
          song={mk()}
          isActiveRow
          isPlaying={false}
          isFocused={(seg) => seg === "summary"}
          onPlay={onPlay}
          onAction={() => {}}
        />
      </ul>,
    );
    const btn = container.querySelector('button[data-segment="action-play"]')!;
    expect(btn.tagName).toBe("BUTTON");
    fireEvent.click(btn);
    expect(onPlay).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run the song tests**

Run: `pnpm exec vitest run src/components/songs/SongItem.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 8: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 9: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors (requires `item_role_song` to exist — regenerated in Step 3).

- [ ] **Step 10: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/uk.json src/i18n/paraglide/ src/components/songs/SongItem.tsx src/components/songs/SongsList.tsx src/components/songs/SongItem.test.tsx
git commit -F - <<'EOF'
refactor(songs): migrate SongsList + fix a11y drift

Migrate to CompositeList and bring SongItem in line with the other lists:
add aria-roledescription (new item_role_song key), make track/tech/status
segments role="group", and use the shared outline focus ring instead of
ring-2. Adds SongItem.test.tsx covering the fixes.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 6: Migrate StreamList + StreamItem

**Files:**
- Modify: `src/components/streams/StreamItem.tsx` (full rewrite below)
- Modify: `src/components/streams/StreamList.tsx` (full rewrite below)

Most complex: dynamic segments, grid layout, ConfirmDialog, context menu.
Regression net: `StreamList.test.tsx` and `StreamItem.test.tsx` must pass
**unchanged**. `StreamItem` keeps its exact props.

- [ ] **Step 1: Replace `StreamItem.tsx` with the migrated version**

```tsx
import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import { Loader2, RefreshCw, AlertCircle, Volume2, Circle } from "lucide-react";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { CompositeRow, CompositeSegment, CompositeAction } from "../common/composite-list";
import { formatBitrate, formatDuration } from "../../lib/formatters";
import { StreamContextMenu } from "./StreamContextMenu";
import { AddPatternDialog } from "../wishlist/AddPatternDialog";
import { $playerStatus } from "../../stores/player";
import * as m from "../../i18n/paraglide/messages";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import { useAnnounce } from "../../hooks/useAnnounce";

export interface StreamItemData {
  id: string;
  /** Dynamic segment list — do NOT include 'summary'. */
  segments: Exclude<SegmentKind, "summary">[];
}

/**
 * Compute the segment list (Left/Right focus-stop order) for a stream.
 * Every row exposes its three action buttons as individual stops; 'status'
 * appears only while the stream is active.
 */
export function getStreamSegments(status: StreamStatus | undefined): StreamItemData["segments"] {
  const state = status?.state ?? "idle";
  const active = state === "recording" || state === "connecting" || state === "reconnecting";
  const actions: StreamItemData["segments"] = ["action-play", "action-record", "action-menu"];
  return active ? ["track", "tech", "status", ...actions] : ["track", "tech", ...actions];
}

interface Props {
  stream: StreamInfo;
  status: StreamStatus | undefined;
  isFocused: (segment: "summary" | SegmentKind) => boolean;
  /** This row is the active item — used for a subtle context highlight. */
  isActiveRow: boolean;
  maxRetries: number;
  onPrimaryAction: () => void;
  onContextMenu: () => void;
  onDelete: () => void;
}

export function StreamItem({
  stream,
  status,
  isFocused,
  isActiveRow,
  maxRetries,
  onPrimaryAction: _onPrimaryAction,
  onContextMenu: _onContextMenu,
  onDelete,
}: Props) {
  const state = status?.state ?? "idle";
  const isRecording = state === "recording";
  const playerStatus = useStore($playerStatus);
  const announce = useAnnounce();
  const [patternDialog, setPatternDialog] = useState<{
    listType: "wishlist" | "ignorelist";
    initialPattern: string;
  } | null>(null);
  const [, setTick] = useState(0);

  const isThisStreamPlaying =
    playerStatus.state !== "stopped" &&
    playerStatus.source?.type === "stream" &&
    playerStatus.source.streamId === stream.id;

  // Update elapsed time display while recording
  useEffect(() => {
    if (!isRecording || !status?.recordingStartedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording, status?.recordingStartedAt]);

  const elapsedMs = status?.recordingStartedAt
    ? Date.now() - new Date(status.recordingStartedAt).getTime()
    : 0;

  const handleRecordToggle = async () => {
    try {
      if (isRecording) await tauri.stopRecording(stream.id);
      else await tauri.startRecording(stream.id);
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  const handlePlayToggle = async () => {
    try {
      if (isThisStreamPlaying) await tauri.stopPlayback();
      else await tauri.playStream(stream.id);
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  // Summary label — uses screen-reader-friendly words, not the visual "REC".
  const stateLabel =
    isRecording && isThisStreamPlaying
      ? m.status_recording_and_playing()
      : isRecording
        ? m.status_recording_label()
        : isThisStreamPlaying
          ? m.segment_playing()
          : state === "error"
            ? m.status_error()
            : null;
  const summaryLabel = stateLabel ? `${stateLabel}, ${stream.name}` : stream.name;

  const slot1Icon =
    state === "recording" ? (
      <Circle
        size={10}
        aria-hidden
        className="fill-red-500 text-red-500 motion-safe:animate-pulse forced-colors:fill-[Highlight] forced-colors:text-[Highlight]"
      />
    ) : state === "connecting" ? (
      <Loader2 size={14} aria-hidden className="text-amber-400 motion-safe:animate-spin forced-colors:text-[Highlight]" />
    ) : state === "reconnecting" ? (
      <RefreshCw size={14} aria-hidden className="text-amber-400 motion-safe:animate-spin forced-colors:text-[Highlight]" />
    ) : state === "error" ? (
      <AlertCircle size={14} aria-hidden className="text-red-500 forced-colors:text-[Highlight]" />
    ) : null;

  const slot2Icon = isThisStreamPlaying ? (
    <Volume2 size={14} aria-hidden className="text-blue-400 forced-colors:text-[Highlight]" />
  ) : null;

  // When the stream is neither recording/connecting nor playing through us, any
  // known currentTrack is the *last* one we saw — show it dimmed + italic and
  // re-label it for screen readers.
  const isStreamActive =
    isRecording || isThisStreamPlaying || state === "connecting" || state === "reconnecting";
  const hasTrack = !!status?.currentTrack;
  const showAsLastTrack = !isStreamActive && hasTrack;
  const trackValue = status?.currentTrack
    ? `${status.currentTrack.artist} — ${status.currentTrack.title}`
    : "—";
  const trackLabel = showAsLastTrack ? m.segment_track_last({ track: trackValue }) : trackValue;
  const trackTextClass = showAsLastTrack ? "text-slate-500 italic" : "text-slate-400";

  const techValue = formatBitrate(stream.bitrate);

  const retryAttempt = status?.reconnectAttempt ?? null;
  const retryLabel =
    retryAttempt !== null && maxRetries > 0
      ? m.status_reconnecting_attempt({ attempt: retryAttempt, max: maxRetries })
      : retryAttempt !== null
        ? m.status_reconnecting_attempt_unlimited({ attempt: retryAttempt })
        : m.status_reconnecting();

  const statusValue =
    state === "recording"
      ? formatDuration(elapsedMs)
      : state === "connecting"
        ? m.status_connecting()
        : state === "reconnecting"
          ? retryLabel
          : m.status_idle();
  // Recording rows describe the value as a duration; others as stream status.
  const statusRoleDesc = state === "recording" ? m.segment_status_duration() : m.segment_status();

  const segments = getStreamSegments(status);

  // A subtle background marks the active row while focus is drilled into a segment.
  const rowBg = isRecording
    ? "bg-red-950/30 border-l-2 border-l-red-500"
    : isThisStreamPlaying
      ? "bg-blue-950/30"
      : isActiveRow
        ? "bg-slate-800/60"
        : "";

  return (
    <CompositeRow
      itemId={stream.id}
      isFocused={isFocused}
      label={summaryLabel}
      roleDescription={m.item_role_stream()}
      className={`grid border-b border-slate-800 forced-colors:border-[ButtonText] ${rowBg}`}
      style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.5fr) 90px 90px auto" }}
    >
      {/* Stream name with inline status slots — visual only; the row's accessible name is on the <li>. */}
      <div style={{ gridRow: 1, gridColumn: 1 }} className="flex items-center gap-1 min-w-0 px-3 py-2">
        <span data-slot="record" aria-hidden="true" className="w-4 h-4 flex items-center justify-center shrink-0">
          {slot1Icon}
        </span>
        <span data-slot="play" aria-hidden="true" className="w-4 h-4 flex items-center justify-center shrink-0">
          {slot2Icon}
        </span>
        <span className="font-medium text-slate-200 truncate">{stream.name}</span>
      </div>

      {segments.map((kind) => {
        if (kind === "track")
          return (
            <CompositeSegment
              key="track"
              itemId={stream.id}
              segment="track"
              isFocused={isFocused}
              label={trackLabel}
              roleDescription={m.segment_track()}
              className={`px-3 py-2 text-sm ${trackTextClass} truncate`}
              style={{ gridRow: 1, gridColumn: 2 }}
            >
              {trackValue}
            </CompositeSegment>
          );

        if (kind === "tech")
          return (
            <CompositeSegment
              key="tech"
              itemId={stream.id}
              segment="tech"
              isFocused={isFocused}
              label={techValue}
              roleDescription={m.segment_tech()}
              className="px-3 py-2 text-sm text-slate-400"
              style={{ gridRow: 1, gridColumn: 3 }}
            >
              {techValue}
            </CompositeSegment>
          );

        if (kind === "status")
          return (
            <CompositeSegment
              key="status"
              itemId={stream.id}
              segment="status"
              isFocused={isFocused}
              label={statusValue}
              roleDescription={statusRoleDesc}
              className="px-3 py-2 text-sm"
              style={{ gridRow: 1, gridColumn: 4 }}
            >
              {statusValue}
            </CompositeSegment>
          );

        return null;
      })}

      {/* Actions — each button is its own Left/Right focus stop (roving tabIndex). */}
      <div className="flex gap-1 px-3 py-2" style={{ gridRow: 1, gridColumn: 5 }}>
        <CompositeAction
          itemId={stream.id}
          segment="action-play"
          isFocused={isFocused}
          onClick={handlePlayToggle}
          label={
            isThisStreamPlaying
              ? m.stop_stream_playback_named({ name: stream.name })
              : m.play_stream_named({ name: stream.name })
          }
          className={`inline-flex min-w-[5.5rem] justify-center shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
            isThisStreamPlaying
              ? "bg-blue-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
              : "bg-slate-700 text-slate-300 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
          }`}
        >
          <span aria-hidden="true">{isThisStreamPlaying ? "■" : "►"}</span>
          <span>{isThisStreamPlaying ? m.stop() : m.play()}</span>
        </CompositeAction>
        <CompositeAction
          itemId={stream.id}
          segment="action-record"
          isFocused={isFocused}
          onClick={handleRecordToggle}
          label={
            isRecording
              ? m.stop_recording_named({ name: stream.name })
              : m.start_recording_named({ name: stream.name })
          }
          className={`inline-flex min-w-[7.5rem] justify-center shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
            isRecording
              ? "bg-red-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
              : "bg-slate-700 text-slate-300 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
          }`}
        >
          <span aria-hidden="true">{isRecording ? "⏹" : "⏺"}</span>
          <span>{isRecording ? m.stop_recording() : m.start_recording()}</span>
        </CompositeAction>
        <StreamContextMenu
          stream={stream}
          status={status}
          menuFocused={isFocused("action-menu")}
          onAddToWishlist={(track) => setPatternDialog({ listType: "wishlist", initialPattern: track })}
          onAddToIgnorelist={(track) => setPatternDialog({ listType: "ignorelist", initialPattern: track })}
          onDelete={onDelete}
        />
      </div>

      {patternDialog &&
        createPortal(
          <AddPatternDialog
            listType={patternDialog.listType}
            initialPattern={patternDialog.initialPattern}
            onSubmit={async (pattern) => {
              try {
                if (patternDialog.listType === "wishlist") await tauri.addToWishlist(pattern);
                else await tauri.addToIgnorelist(pattern);
                announce(m.announcement_pattern_added({ pattern }), "polite");
                setPatternDialog(null);
              } catch (err) {
                addToast(String(err), "error");
              }
            }}
            onClose={() => setPatternDialog(null)}
          />,
          document.body,
        )}
    </CompositeRow>
  );
}
```

> The `track`/`tech`/`status` cells previously set `aria-label` to the value and
> `role="group"` by hand — `CompositeSegment` produces identical attributes. The
> grid placement (`style={{ gridRow, gridColumn }}`) is forwarded through
> `CompositeSegment`'s `style` prop, so the layout is unchanged. The two action
> buttons keep their full styling via `CompositeAction`'s `className`; the shared
> focus ring is appended (it was already present in the old className, so the
> rendered ring is unchanged).

- [ ] **Step 2: Replace `StreamList.tsx` with the migrated version**

```tsx
import { forwardRef, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { $streams, $statuses } from "../../stores/streams";
import { $recordingSettings } from "../../stores/settings";
import { CompositeList } from "../common/composite-list";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { StreamInfo } from "../../lib/tauri";
import { StreamItem, getStreamSegments } from "./StreamItem";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "../common/ConfirmDialog";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  exitZone: (forward: boolean) => void;
  onEmpty: () => void;
  /** Pre-filtered list to render. Defaults to all streams in the store. */
  streams?: StreamInfo[];
}

export const StreamList = forwardRef<ZoneEntry, Props>(({ exitZone, onEmpty, streams: streamsProp }, ref) => {
  const allStreams = useStore($streams);
  const statuses = useStore($statuses);
  const recordingSettings = useStore($recordingSettings);
  const maxRetries = recordingSettings?.reconnect.maxRetries ?? 0;
  const streams = streamsProp ?? allStreams;
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Build items with dynamic segments
  const items = useMemo(
    () => streams.map((s) => ({ id: s.id, segments: getStreamSegments(statuses[s.id]) })),
    [streams, statuses],
  );

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    const streamName = streams.find((s) => s.id === pendingDeleteId)?.name ?? "";
    try {
      await tauri.removeStream(pendingDeleteId);
      $streams.set($streams.get().filter((s) => s.id !== pendingDeleteId));
      addToast(m.stream_removed({ name: streamName }), "info");
    } catch (err) {
      addToast(String(err), "error");
    }
    setPendingDeleteId(null);
  };

  return (
    <>
      <CompositeList
        ref={ref}
        zoneId="streams-list"
        ariaLabel={m.zone_streams_list()}
        items={items}
        className="flex-1 overflow-y-auto overflow-x-hidden pt-1"
        onTabOut={exitZone}
        onEmpty={onEmpty}
        onAction={(type, itemId, segment) => {
          if (type === "delete") {
            setPendingDeleteId(itemId);
            return;
          }
          if (type === "contextMenu") {
            const menuBtn = document.querySelector<HTMLButtonElement>(
              `[data-item-id="${CSS.escape(itemId)}"][data-context-menu-trigger]`,
            );
            menuBtn?.click();
            return;
          }
          // Action buttons self-activate; only Enter/Space on the whole-row summary
          // triggers the row's primary action (record toggle).
          if ((type === "primary" || type === "toggle") && segment === "summary") {
            const isRecording = statuses[itemId]?.state === "recording";
            (isRecording ? tauri.stopRecording(itemId) : tauri.startRecording(itemId)).catch((err) =>
              addToast(String(err), "error"),
            );
          }
        }}
        renderRow={({ id, isActive, isFocused }) => {
          const stream = streams.find((s) => s.id === id)!;
          return (
            <StreamItem
              key={id}
              stream={stream}
              status={statuses[id]}
              isActiveRow={isActive}
              isFocused={isFocused}
              maxRetries={maxRetries}
              onPrimaryAction={() => {
                const isRecording = statuses[id]?.state === "recording";
                if (isRecording) tauri.stopRecording(id).catch((e) => addToast(String(e), "error"));
                else tauri.startRecording(id).catch((e) => addToast(String(e), "error"));
              }}
              onContextMenu={() => {
                const menuBtn = document.querySelector<HTMLButtonElement>(
                  `[data-item-id="${CSS.escape(id)}"] [data-context-menu-trigger]`,
                );
                menuBtn?.click();
              }}
              onDelete={() => setPendingDeleteId(id)}
            />
          );
        }}
      />
      {pendingDeleteId &&
        createPortal(
          <ConfirmDialog
            title={m.remove_stream()}
            message={m.confirm_delete_stream({ name: streams.find((s) => s.id === pendingDeleteId)?.name ?? "" })}
            onConfirm={handleConfirmDelete}
            onCancel={() => setPendingDeleteId(null)}
          />,
          document.body,
        )}
    </>
  );
});
StreamList.displayName = "StreamList";
```

- [ ] **Step 3: Run the stream tests**

Run: `pnpm exec vitest run src/components/streams/StreamList.test.tsx src/components/streams/StreamItem.test.tsx`
Expected: PASS, unchanged. Notably: the `tech` cell is `role="group"` with a value-only label matching `/192/`; the three action buttons (`action-play`, `action-record`, `action-menu`) exist; ArrowRight from summary lands on `track`; slot containers stay `aria-hidden`.

- [ ] **Step 4: Run the full suite**

Run: `pnpm test`
Expected: PASS (entire suite green).

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Production build sanity check**

Run: `pnpm vite:build`
Expected: builds without errors (confirms Paraglide messages and the new components compile in a production bundle).

- [ ] **Step 7: Commit**

```bash
git add src/components/streams/StreamItem.tsx src/components/streams/StreamList.tsx
git commit -F - <<'EOF'
refactor(streams): migrate StreamList/StreamItem to CompositeList

Final migration onto the shared shell. Dynamic track/tech/status segments
render via CompositeSegment (grid placement forwarded through style); the
two action buttons via CompositeAction; ConfirmDialog and context menu kept.
DOM/ARIA output unchanged — existing StreamList/StreamItem tests pass as-is.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Final verification (after Task 6)

- [ ] `pnpm test` — whole suite green.
- [ ] `pnpm exec tsc --noEmit` — no type errors.
- [ ] `pnpm vite:build` — production bundle builds.
- [ ] `git status` — only intended files changed; `BrowserPanel.tsx` / `SearchForm.tsx` remain unstaged (untouched by this work).
- [ ] Manual NVDA smoke test of the **Songs** screen (the only changed output): each row announces "…, пісня"; Left/Right reads track/tech as grouped segments; focus ring visible.

## Notes for the executor

- The five `renderRow` callbacks each do `items.find(...)!` to recover the domain
  object from the row `id`. This mirrors the original `.map` and is O(n²) only for
  pathologically large lists; these lists are small (streams/profiles/patterns) or
  already virtualization-free (songs/stations). Do **not** prematurely optimise.
- `CompositeList` is the generic-forwardRef cast; when a caller needs extra handle
  methods, write `<CompositeList<MyHandle> ref={ref} imperativeExtra={…} />` (see
  ProfileList). Otherwise the default `H = ZoneEntry` is inferred.
- Context-menu activation queries `document` (not a list ref) in the migrated
  ProfileList/SongsList/StreamList. `data-item-id` values (profile name, song path,
  stream id) are unique, so the scoped query is equivalent to the old ref-scoped one.
