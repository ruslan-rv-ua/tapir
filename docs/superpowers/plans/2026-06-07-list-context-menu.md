# Unified List Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make right-click, the Menu key, and Shift+F10 all open the app's per-row context menu (anchored to the ⋯ button) and suppress the native WebView2 menu, across all three composite lists (Streams/Songs/Profiles), by handling the `contextmenu` DOM event in the shared `useCompositeList` layer.

**Architecture:** The `contextmenu` DOM event becomes the single source of truth. Chromium/WebView2 emits it for right-click, the Menu key, and Shift+F10 alike. A new `onContextMenu` handler in `useCompositeList` calls `preventDefault()` (killing the native menu), resolves the target row, makes it the active row, and clicks the row's `[data-context-menu-trigger]`. The old `keydown` branches (`ContextMenu`/`Shift+F10`) and the `'contextMenu'` `ActionType` are removed, along with the duplicated `menuBtn.click()` branches in the three lists.

**Tech Stack:** React 18, TypeScript, React Aria Components (`MenuTrigger`/`Menu`), Vitest + Testing Library, Tauri v2 (WebView2 on Windows).

---

## Background / current code

- `src/hooks/useCompositeList.ts`
  - `ActionType` (line 31): `'primary' | 'toggle' | 'delete' | 'contextMenu'`
  - `keydown` handler has `case 'ContextMenu':` and `case 'F10':` (lines 332-341) that dispatch `onAction('contextMenu', …)`.
  - Returns: `{ listRef, onKeyDownCapture, isFocused, restoreFocus, focusItem, activeItemId, activeSegment }`.
  - Has `setActiveItemId`/`setActiveSegment` state setters and `listRef` in scope.
- `src/components/common/composite-list/CompositeList.tsx`
  - Destructures hook results (line 61), renders `<ul … onKeyDownCapture={onKeyDownCapture}>` (lines 108-115).
- Three lists each have an identical block `if (type === "contextMenu") { …querySelector([data-context-menu-trigger])…click() }`:
  - `src/components/streams/StreamList.tsx:90-96`
  - `src/components/songs/SongsList.tsx:38-44`
  - `src/components/profile/ProfileList.tsx:49-55`
- Each list's row renders a `[data-context-menu-trigger]` ⋯ button (e.g. `StreamContextMenu.tsx:69`).
- Tests: `src/hooks/useCompositeList.test.tsx` has the keydown contextMenu test at lines 245-263. The harness's `action-*` buttons (lines 60-69) do NOT carry `data-context-menu-trigger` yet.

Gate commands for this repo (from project memory): `pnpm test` and `pnpm vite:build` are the real gates. `tsc` has ~51 pre-existing untyped-paraglide errors — do not treat those as regressions.

---

## Task 1: Failing tests for the `contextmenu` handler

**Files:**
- Modify (harness): `src/hooks/useCompositeList.test.tsx:60-69`
- Modify (tests): `src/hooks/useCompositeList.test.tsx:245-263`

- [ ] **Step 1: Add `data-context-menu-trigger` to the harness's `action-menu` button**

In `src/hooks/useCompositeList.test.tsx`, replace the `action-*` button render (currently lines 60-69):

```tsx
              seg.startsWith("action-") ? (
                <button
                  key={seg}
                  data-item-id={item.id}
                  data-segment={seg}
                  data-context-menu-trigger={seg === "action-menu" ? "" : undefined}
                  tabIndex={isFocused(item.id, seg) ? 0 : -1}
                  onClick={() => onButtonClick?.(item.id, seg)}
                >
                  {seg}
                </button>
              ) : (
```

- [ ] **Step 2: Add a `rightClick` helper next to the other helpers**

In `src/hooks/useCompositeList.test.tsx`, after the `press` helper (after line 104), add:

```tsx
/** Dispatch a contextmenu event; returns false when preventDefault was called. */
function rightClick(el: HTMLElement) {
  return fireEvent.contextMenu(el, { bubbles: true });
}
```

- [ ] **Step 3: Replace the keydown contextMenu test with contextmenu-event tests**

In `src/hooks/useCompositeList.test.tsx`, replace the whole `it("Delete fires delete; ContextMenu and Shift+F10 fire contextMenu; bare F10 does not", …)` block (lines 245-263) with:

```tsx
  it("Delete fires delete; bare F10 does not fire contextMenu", () => {
    const onAction = vi.fn();
    render(<Harness items={makeItems()} onAction={onAction} />);
    focusStart("a");

    press("Delete");
    expect(onAction).toHaveBeenCalledWith("delete", "a", "summary");

    onAction.mockClear();
    press("F10"); // no shift
    expect(onAction).not.toHaveBeenCalled();
  });

  it("contextmenu on a row suppresses the native menu and clicks the row's trigger", () => {
    const onButtonClick = vi.fn();
    render(<Harness items={makeItems()} onButtonClick={onButtonClick} />);
    focusStart("a");

    // Right-click anywhere on row 'a' (its summary <li>) opens that row's menu.
    const prevented = rightClick(stop("a", "summary")) === false;
    expect(prevented).toBe(true); // preventDefault → native menu suppressed
    expect(onButtonClick).toHaveBeenCalledWith("a", "action-menu");
  });

  it("contextmenu on a non-active row makes it active before opening", () => {
    const onButtonClick = vi.fn();
    render(<Harness items={makeItems()} onButtonClick={onButtonClick} />);
    focusStart("a"); // active row is 'a'

    // Row 'c' carries an action-menu trigger; right-click moves activity to it.
    rightClick(stop("c", "action-menu"));
    expect(stop("c", "summary").getAttribute("tabindex")).toBe("0");
    expect(onButtonClick).toHaveBeenCalledWith("c", "action-menu");
  });

  it("contextmenu on empty list space suppresses the native menu and opens nothing", () => {
    const onButtonClick = vi.fn();
    render(<Harness items={makeItems()} onButtonClick={onButtonClick} />);
    focusStart("a");

    const prevented = rightClick(list()) === false; // the <ul> itself, no row
    expect(prevented).toBe(true);
    expect(onButtonClick).not.toHaveBeenCalled();
  });
```

> Note: `makeItems()` (lines 116-120) gives row `c` the segments `["metadata", "action-add"]` — it has NO `action-menu`. The "non-active row" test needs row `c` to carry an `action-menu` trigger. Update `makeItems` in the next step.

- [ ] **Step 4: Give row `c` an `action-menu` segment so it has a trigger**

In `src/hooks/useCompositeList.test.tsx`, change the `makeItems` `c` entry (line 119) from:

```tsx
  { id: "c", segments: ["metadata", "action-add"] },
```

to:

```tsx
  { id: "c", segments: ["metadata", "action-add", "action-menu"] },
```

> Verify this does not break other tests in the file that count segments on `c`. Search the file for `"c"` usages; the existing arrow/segment tests use rows `a` and `b` for left/right traversal, so adding a segment to `c` is safe. If any test asserts an exact segment list for `c`, update it to include `action-menu`.

- [ ] **Step 5: Run the new tests — expect FAIL (handler not implemented yet)**

Run: `pnpm test -- useCompositeList`
Expected: the three new `contextmenu …` tests FAIL (the native menu is not prevented / trigger not clicked, because `useCompositeList` has no `onContextMenu` yet and the harness `<ul>` has no handler wired). The `Delete … bare F10` test should PASS.

- [ ] **Step 6: Commit the failing tests**

```bash
git add src/hooks/useCompositeList.test.tsx
git commit -m "test(composite-list): contextmenu event drives the row menu"
```

---

## Task 2: Implement `onContextMenu` in the hook; remove keydown branches and the `contextMenu` ActionType

**Files:**
- Modify: `src/hooks/useCompositeList.ts:31` (ActionType)
- Modify: `src/hooks/useCompositeList.ts:332-341` (remove keydown cases)
- Modify: `src/hooks/useCompositeList.ts` (add `onContextMenu`, wire harness `<ul>`, extend return)
- Modify: `src/hooks/useCompositeList.test.tsx:50` (attach `onContextMenu` in the harness)

- [ ] **Step 1: Narrow `ActionType` — drop `'contextMenu'`**

In `src/hooks/useCompositeList.ts`, change line 31 from:

```ts
export type ActionType = 'primary' | 'toggle' | 'delete' | 'contextMenu';
```

to:

```ts
export type ActionType = 'primary' | 'toggle' | 'delete';
```

- [ ] **Step 2: Remove the `ContextMenu` and `F10` cases from the keydown handler**

In `src/hooks/useCompositeList.ts`, delete these two cases (currently lines 332-341):

```ts
        case 'ContextMenu':
          consume();
          onActionRef.current('contextMenu', activeItemId, activeSegment);
          break;

        case 'F10':
          if (!e.shiftKey) break;
          consume();
          onActionRef.current('contextMenu', activeItemId, activeSegment);
          break;
```

Leave the surrounding `case 'Delete':` and `case 'Tab':` cases intact.

- [ ] **Step 3: Add the `onContextMenu` handler**

In `src/hooks/useCompositeList.ts`, add this `useCallback` immediately after the `onKeyDownCapture` definition (right before the `isFocused` callback, ~line 353):

```ts
  // Single source of truth for the per-row context menu: WebView2 emits a
  // `contextmenu` event for right-click, the Menu key, AND Shift+F10. Handling
  // it here suppresses the native menu and opens the row's own menu for all three.
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Always suppress the native WebView2 menu inside the list — a role=application
      // list has no selectable text or inputs, so the native menu shows nothing useful.
      e.preventDefault();

      const row = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-item-id]');
      const itemId = row?.dataset.itemId;
      if (!itemId || !items.some((it) => it.id === itemId)) return; // empty list space → just suppress

      // Make the row active WITHOUT queuing programmatic focus (no pendingFocusRef):
      // React Aria owns focus once the menu opens, and a pending focus would fight it.
      setActiveItemId(itemId);
      setActiveSegment('summary');

      // Open the menu, anchored to this row's ⋯ trigger (shared DOM convention).
      const trigger = listRef.current?.querySelector<HTMLElement>(
        `[data-item-id="${CSS.escape(itemId)}"][data-context-menu-trigger]`,
      );
      trigger?.click();
    },
    [items],
  );
```

- [ ] **Step 4: Return `onContextMenu` from the hook**

In `src/hooks/useCompositeList.ts`, change the return statement (currently line 396) from:

```ts
  return { listRef, onKeyDownCapture, isFocused, restoreFocus, focusItem, activeItemId, activeSegment };
```

to:

```ts
  return { listRef, onKeyDownCapture, onContextMenu, isFocused, restoreFocus, focusItem, activeItemId, activeSegment };
```

- [ ] **Step 5: Wire the harness `<ul>` to the new handler**

In `src/hooks/useCompositeList.test.tsx`, destructure `onContextMenu` (line 34) and attach it to the `<ul>` (line 50).

Change line 34 from:

```tsx
  const { listRef, onKeyDownCapture, isFocused, restoreFocus } = useCompositeList({
```

to:

```tsx
  const { listRef, onKeyDownCapture, onContextMenu, isFocused, restoreFocus } = useCompositeList({
```

Change line 50 from:

```tsx
      <ul ref={listRef} role="list" data-testid="list" onKeyDownCapture={onKeyDownCapture}>
```

to:

```tsx
      <ul ref={listRef} role="list" data-testid="list" onKeyDownCapture={onKeyDownCapture} onContextMenu={onContextMenu}>
```

- [ ] **Step 6: Run the hook tests — expect PASS**

Run: `pnpm test -- useCompositeList`
Expected: all tests PASS, including the three new `contextmenu …` tests.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useCompositeList.ts src/hooks/useCompositeList.test.tsx
git commit -m "feat(composite-list): handle contextmenu event in useCompositeList"
```

---

## Task 3: Wire `onContextMenu` through `CompositeList`

**Files:**
- Modify: `src/components/common/composite-list/CompositeList.tsx:61` and `:108-115`
- Test: `src/components/common/composite-list/CompositeList.test.tsx`

- [ ] **Step 1: Write a failing wiring test**

In `src/components/common/composite-list/CompositeList.test.tsx`, the shared `renderList` row (lines 25-55) renders an `action-add` button but no `[data-context-menu-trigger]`. Add a trigger to the row so the wiring can be observed. Inside the `<CompositeRow>` children, after the `<CompositeAction …>x</CompositeAction>` (line 53), add a plain trigger button:

```tsx
          <button
            data-item-id={id}
            data-context-menu-trigger
            data-testid={`trigger-${id}`}
            onClick={() => onAction("primary", id, "action-menu")}
          >
            ⋯
          </button>
```

Then add this test inside the `describe("CompositeList", …)` block:

```tsx
  it("right-click on a row suppresses the native menu and clicks the row's trigger", () => {
    const { container, onAction } = renderList();
    const row = container.querySelector<HTMLElement>('[data-item-id="a"][data-segment="summary"]')!;
    const prevented = fireEvent.contextMenu(row, { bubbles: true }) === false;
    expect(prevented).toBe(true);
    expect(onAction).toHaveBeenCalledWith("primary", "a", "action-menu");
  });
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm test -- CompositeList`
Expected: FAIL — `CompositeList` does not pass `onContextMenu` to the `<ul>` yet, so the event is not prevented and the trigger is not clicked.

- [ ] **Step 3: Destructure `onContextMenu` from the hook**

In `src/components/common/composite-list/CompositeList.tsx`, change line 61 from:

```ts
  const { listRef, onKeyDownCapture, isFocused, restoreFocus, focusItem, activeItemId } =
    useCompositeList({ zoneId, items, onTabOut, onAction, onEmpty });
```

to:

```ts
  const { listRef, onKeyDownCapture, onContextMenu, isFocused, restoreFocus, focusItem, activeItemId } =
    useCompositeList({ zoneId, items, onTabOut, onAction, onEmpty });
```

- [ ] **Step 4: Attach it to the `<ul>`**

In `src/components/common/composite-list/CompositeList.tsx`, change the `<ul>` opening tag (lines 108-115) so it includes `onContextMenu`:

```tsx
    <ul
      ref={listRef}
      data-zone-id={zoneId}
      role="application"
      aria-label={ariaLabel}
      className={`py-1 ${className}`}
      onKeyDownCapture={onKeyDownCapture}
      onContextMenu={onContextMenu}
    >
```

- [ ] **Step 5: Run it — expect PASS**

Run: `pnpm test -- CompositeList`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/common/composite-list/CompositeList.tsx src/components/common/composite-list/CompositeList.test.tsx
git commit -m "feat(composite-list): forward contextmenu handler to the list ul"
```

---

## Task 4: Remove the now-dead `contextMenu` branches in the three lists

These branches reference the removed `'contextMenu'` `ActionType` and will fail type-check; they are now handled centrally.

**Files:**
- Modify: `src/components/streams/StreamList.tsx:90-96`
- Modify: `src/components/songs/SongsList.tsx:38-44`
- Modify: `src/components/profile/ProfileList.tsx:49-55`

- [ ] **Step 1: StreamList — delete the contextMenu branch**

In `src/components/streams/StreamList.tsx`, delete this block (currently lines 90-96):

```tsx
          if (type === "contextMenu") {
            const menuBtn = document.querySelector<HTMLButtonElement>(
              `[data-item-id="${CSS.escape(itemId)}"][data-context-menu-trigger]`,
            );
            menuBtn?.click();
            return;
          }
```

Leave the `delete` branch above it and the `primary`/`toggle` branch below it intact.

- [ ] **Step 2: SongsList — delete the contextMenu branch**

In `src/components/songs/SongsList.tsx`, delete this block (currently lines 38-44):

```tsx
        if (type === "contextMenu") {
          const menuBtn = document.querySelector<HTMLButtonElement>(
            `[data-item-id="${CSS.escape(itemId)}"][data-context-menu-trigger]`,
          );
          menuBtn?.click();
          return;
        }
```

- [ ] **Step 3: ProfileList — delete the contextMenu branch**

In `src/components/profile/ProfileList.tsx`, delete this block (currently lines 49-55):

```tsx
        if (type === "contextMenu") {
          const btn = document.querySelector<HTMLButtonElement>(
            `[data-item-id="${CSS.escape(itemId)}"][data-context-menu-trigger]`,
          );
          btn?.click();
          return;
        }
```

Leave the `delete` branch (lines 45-48) and the `primary`/`toggle` switch branch intact.

- [ ] **Step 4: Run the full test suite — expect PASS**

Run: `pnpm test`
Expected: PASS. No test should reference the `'contextMenu'` action anymore.

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamList.tsx src/components/songs/SongsList.tsx src/components/profile/ProfileList.tsx
git commit -m "refactor(lists): drop per-list contextMenu branches (handled centrally)"
```

---

## Task 5: Build gate + manual verification in the real app

**Files:** none (verification only)

- [ ] **Step 1: Run the production build gate**

Run: `pnpm vite:build`
Expected: build succeeds. (Per project memory, `tsc` shows ~51 pre-existing untyped-paraglide errors — those are NOT regressions. The build is the real gate. If the build surfaces a NEW error mentioning `contextMenu` or `ActionType`, a dead branch was missed — fix it.)

- [ ] **Step 2: Manual verification in the Tauri app (this is the bug's whole point — WebView2 behavior cannot be unit-tested)**

Launch the app (e.g. `pnpm tauri dev`), then for EACH of the three lists — Streams, Songs, Profiles — confirm:

1. **Menu key** on a focused row → the app's context menu opens, and the native WebView2 menu does NOT appear (no double menu).
2. **Shift+F10** on a focused row → same as the Menu key.
3. **Right-click** on a row → the app's context menu opens anchored to the ⋯ button, and the native menu does NOT appear.
4. **Right-click on an unfocused row** → that row becomes active, then its menu opens.
5. **Right-click on empty space** below the rows → no native menu, nothing opens.
6. Closing the menu (Esc / click away) returns focus to the ⋯ button (unchanged from before).

Expected: all of the above hold in all three lists.

- [ ] **Step 3: Final commit (if any verification fix was needed)**

If Step 1 or 2 required a fix, commit it:

```bash
git add -A
git commit -m "fix(lists): address context-menu verification findings"
```

If nothing changed, skip this step.

---

## Self-review notes (already applied)

- **Spec coverage:** root-cause fix (single `contextmenu` handler) → Task 2; suppress native menu → Task 2 Step 3 (`preventDefault`); anchor to ⋯ → Task 2 Step 3 (clicks `[data-context-menu-trigger]`); focus the row first → Task 2 Step 3 (`setActiveItemId`/`setActiveSegment` without pending focus); remove keydown branches + `ActionType` → Task 2 Steps 1-2; centralize / remove per-list duplication → Task 4; list-scoped suppression → Task 3 (`<ul>`-level handler); tests → Tasks 1 & 3; live WebView2 verification → Task 5.
- **Out of scope (follow-up, not in this plan):** global native-menu suppression outside lists (e.g. dialogs/inputs).
- **Type consistency:** the hook returns `onContextMenu` (Task 2 Step 4); both `CompositeList` (Task 3 Step 3) and the test harness (Task 2 Step 5) destructure that exact name. `ActionType` loses `'contextMenu'` (Task 2 Step 1) and no remaining code references it after Task 4.
