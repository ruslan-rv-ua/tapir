# Scoped `role="application"` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global `role="application"` on `#root` with focus mode scoped to the arrow-key-navigated zones, restoring NVDA browse mode for landmarks, static text, and native-form zones.

**Architecture:** Two mechanisms. (1) **Role replacement** — for non-landmark interactive containers (`<ul role="list">` lists, `<div role="toolbar">`), swap the role to `application` on the same element; `aria-label`/`data-zone-id`/handlers stay. (2) **Nested wrapper** — for landmark zones (`<nav>` navigation, `<footer>` contentinfo), keep the landmark and add an inner `<div role="application" className="contents">` around the focusable children (player precedent; `display:contents` is layout-transparent and keydown events bubble to the outer element). Native Tab zones, empty states, and the player are untouched.

**Tech Stack:** React 18 + TypeScript, Tailwind (`contents` = `display:contents`), Vitest + Testing Library, paraglide i18n (`m.*`).

**Spec:** `docs/superpowers/specs/2026-05-30-scoped-application-role-design.md`

**Key safety fact (verified):** No test queries the affected roles via `getByRole('list'|'toolbar'|'navigation'|'contentinfo')`, and no test depends on the old roles. Existing tests pass unchanged; changes are additive ARIA edits. `npm test` is the regression guard for the mechanically-identical list swaps.

---

### Task 1: Remove `role="application"` from `#root`

**Files:**
- Modify: `index.html:10`
- Test: `src/a11y/root-role.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/a11y/root-role.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("index.html #root", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const rootTag = html.match(/<div id="root"[^>]*>/)?.[0] ?? "";

  it("does not carry role=application (no global focus mode)", () => {
    expect(rootTag).not.toContain('role="application"');
  });

  it("keeps its accessible name", () => {
    expect(rootTag).toContain('aria-label="Tapir"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/a11y/root-role.test.ts`
Expected: FAIL on the first assertion — `rootTag` still contains `role="application"`.

- [ ] **Step 3: Make the change**

In `index.html:10`, change:

```html
    <div id="root" role="application" aria-label="Tapir"></div>
```

to:

```html
    <div id="root" aria-label="Tapir"></div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/a11y/root-role.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add index.html src/a11y/root-role.test.ts
git commit -m "feat(a11y): drop global role=application from #root"
```

---

### Task 2: `streams-list` — replace `role="list"` with `role="application"`

**Files:**
- Modify: `src/components/streams/StreamList.tsx:87`
- Test: `src/components/streams/StreamList.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

Append this test inside the existing `describe("StreamList — integration with composite-list navigation", ...)` block in `src/components/streams/StreamList.test.tsx` (it reuses the file's existing `renderList` helper):

```tsx
  it("exposes the list as an application region (NVDA focus mode)", () => {
    const { container } = renderList();
    const ul = container.querySelector("ul")!;
    expect(ul.getAttribute("role")).toBe("application");
    expect(ul.getAttribute("data-zone-id")).toBe("streams-list");
    expect(ul.getAttribute("aria-label")).toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/streams/StreamList.test.tsx -t "application region"`
Expected: FAIL — role is `"list"`, not `"application"`.

- [ ] **Step 3: Make the change**

In `src/components/streams/StreamList.tsx:87`, change `role="list"` to `role="application"`:

```tsx
      <ul
        ref={listRef}
        data-zone-id="streams-list"
        aria-label={m.zone_streams_list()}
        role="application"
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onKeyDownCapture={onKeyDownCapture}
      >
```

- [ ] **Step 4: Run the full StreamList suite**

Run: `npx vitest run src/components/streams/StreamList.test.tsx`
Expected: PASS — the new test passes and all existing composite-list navigation tests still pass (roving/arrows unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/components/streams/StreamList.tsx src/components/streams/StreamList.test.tsx
git commit -m "feat(a11y): scope focus mode to streams-list via role=application"
```

---

### Task 3: Remaining lists — `songs-list`, `browser-results`, `wishlist-list`

**Files:**
- Modify: `src/components/songs/SongsList.tsx:61`
- Modify: `src/components/browser/StationList.tsx:80`
- Modify: `src/components/wishlist/PatternList.tsx:80`

These three edits are mechanically identical to Task 2 (swap `role="list"` → `role="application"` on the `<ul>` that carries `data-zone-id` + `onKeyDownCapture`). The pattern is already unit-tested in Task 2; per YAGNI we do not duplicate a bespoke render harness for each. The `npm test` regression run in Task 7 is the guard.

- [ ] **Step 1: Edit `SongsList.tsx`**

In `src/components/songs/SongsList.tsx:61`, change `role="list"` to `role="application"`:

```tsx
      <ul
        ref={listRef}
        role="application"
        data-zone-id="songs-list"
        aria-label={m.songs_zone_list()}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onKeyDownCapture={onKeyDownCapture}
      >
```

- [ ] **Step 2: Edit `StationList.tsx`**

In `src/components/browser/StationList.tsx:80`, change `role="list"` to `role="application"`:

```tsx
      <ul
        ref={listRef}
        data-zone-id="browser-results"
        role="application"
        aria-label={m.zone_browser_results()}
        className="flex-1 overflow-auto"
        onKeyDownCapture={onKeyDownCapture}
      >
```

- [ ] **Step 3: Edit `PatternList.tsx`**

In `src/components/wishlist/PatternList.tsx:80`, change `role="list"` to `role="application"`:

```tsx
        <ul
          ref={listRef}
          data-zone-id="wishlist-list"
          role="application"
          aria-label={ariaLabel}
          className="flex-1 overflow-auto"
          onKeyDownCapture={onKeyDownCapture}
        >
```

- [ ] **Step 4: Build-type check the three files**

Run: `npx vitest run src/components/streams/StreamList.test.tsx`
Expected: PASS (sanity; the shared composite-list path is unchanged). Full regression is Task 7.

- [ ] **Step 5: Commit**

```bash
git add src/components/songs/SongsList.tsx src/components/browser/StationList.tsx src/components/wishlist/PatternList.tsx
git commit -m "feat(a11y): scope focus mode to songs/browser/wishlist lists"
```

---

### Task 4: `streams-toolbar` — replace `role="toolbar"` with `role="application"`

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx:303`

Same role-replacement mechanism; the toolbar is not a landmark. Roving handler `toolbarKeyDown` and `data-zone-id` stay on the element. Guarded by Task 7 regression.

- [ ] **Step 1: Make the change**

In `src/components/streams/StreamsPanel.tsx:303`, change `role="toolbar"` to `role="application"`:

```tsx
          <div
            ref={toolbarZoneRef}
            data-zone-id="streams-toolbar"
            role="application"
            aria-label={m.zone_streams_toolbar()}
            className="border-b border-slate-700 forced-colors:border-[ButtonText]"
            onKeyDown={toolbarKeyDown}
          >
```

- [ ] **Step 2: Commit**

```bash
git add src/components/streams/StreamsPanel.tsx
git commit -m "feat(a11y): scope focus mode to streams-toolbar via role=application"
```

---

### Task 5: `activity-bar` — nested `role="application"` wrapper inside the `<nav>` landmark

**Files:**
- Modify: `src/components/layout/ActivityBar.tsx:71-142`
- Test: `src/components/layout/ActivityBar.test.tsx` (create)

The `<nav>` must remain a navigation landmark (browse-mode discoverable). Wrap all focusable children in an inner `<div role="application" className="contents">`. `display:contents` keeps the flex layout (`mt-auto` still works); `onKeyDown` stays on `<nav>` and receives bubbled keydown.

- [ ] **Step 1: Write the failing test**

Create `src/components/layout/ActivityBar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { ActivityBar } from "./ActivityBar";
import { $activeSection } from "../../stores/navigation";
import { $settings } from "../../stores/settings";

beforeEach(() => {
  $activeSection.set("streams");
  $settings.set(null);
});

function renderBar() {
  const ref = createRef<ZoneEntry>();
  return render(<ActivityBar ref={ref} exitZone={() => {}} />);
}

const navButtonTabIndices = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLButtonElement>("button")).map((b) =>
    b.getAttribute("tabindex"),
  );

describe("ActivityBar — scoped application role", () => {
  it("keeps the navigation landmark and nests an application wrapper", () => {
    const { container } = renderBar();
    const nav = container.querySelector("nav")!;
    // Implicit navigation landmark must NOT be overridden by an explicit role.
    expect(nav.getAttribute("role")).toBeNull();
    const app = nav.querySelector('[role="application"]')!;
    expect(app).toBeTruthy();
    expect(app.getAttribute("aria-label")).toBeTruthy();
    // All focusable buttons live inside the application wrapper.
    expect(app.querySelectorAll("button").length).toBeGreaterThan(0);
    expect(nav.querySelectorAll('[role="application"] button').length).toBe(
      nav.querySelectorAll("button").length,
    );
  });

  it("roving arrows still drive focus (keydown bubbles through the wrapper)", () => {
    const { container } = renderBar();
    const nav = container.querySelector("nav")!;
    expect(navButtonTabIndices(nav)[0]).toBe("0");
    fireEvent.keyDown(nav, { key: "ArrowDown" });
    // Active roving tabindex moves off the first button.
    expect(navButtonTabIndices(nav)[0]).toBe("-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/ActivityBar.test.tsx`
Expected: FAIL — no `[role="application"]` element exists yet.

- [ ] **Step 3: Make the change**

In `src/components/layout/ActivityBar.tsx`, wrap the `<nav>` children (the `SECTIONS.map(...)` block and the `mt-auto` div) in an inner application wrapper. The `<nav>` open tag (lines 64-70) and close tag (line 143) stay; insert the wrapper immediately inside:

```tsx
    <nav
      ref={navRef}
      aria-label={m.main_navigation()}
      data-zone-id="activity-bar"
      className="flex w-56 flex-col gap-1 border-r border-slate-700 bg-slate-900 py-2 px-2"
      onKeyDown={onKeyDown}
    >
      <div role="application" aria-label={m.main_navigation()} className="contents">
        {SECTIONS.map((sec, i) => (
          // ...unchanged Button block...
        ))}
        <div className="mt-auto flex flex-col gap-1">
          {/* ...unchanged settings Button + profile card... */}
        </div>
      </div>
    </nav>
```

Concretely: add `<div role="application" aria-label={m.main_navigation()} className="contents">` directly after the `<nav ...>` open tag (after line 70), and add the matching `</div>` directly before `</nav>` (before line 143). Do not change any inner JSX.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/layout/ActivityBar.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/ActivityBar.tsx src/components/layout/ActivityBar.test.tsx
git commit -m "feat(a11y): nest application wrapper inside activity-bar nav landmark"
```

---

### Task 6: `status-bar` — nested `role="application"` wrapper inside the `<footer>` landmark

**Files:**
- Modify: `src/components/layout/StatusBar.tsx:101-131`
- Test: `src/components/layout/StatusBar.test.tsx` (extend)

The `<footer>` must remain a contentinfo landmark. Wrap the segment divs in an inner `<div role="application" aria-label={m.zone_status()} className="contents">`. `onKeyDown` stays on `<footer>`; `display:contents` preserves the flex row.

- [ ] **Step 1: Write the failing test**

Append to `src/components/layout/StatusBar.test.tsx` (reuses the existing `renderBar` helper). Add a new `describe` block at the end of the file:

```tsx
describe("StatusBar — scoped application role", () => {
  it("keeps the contentinfo landmark and nests an application wrapper", () => {
    const { container } = renderBar();
    const footer = container.querySelector("footer")!;
    // Implicit contentinfo landmark must NOT be overridden.
    expect(footer.getAttribute("role")).toBeNull();
    const app = footer.querySelector('[role="application"]')!;
    expect(app).toBeTruthy();
    expect(app.getAttribute("aria-label")).toBeTruthy();
    // Roving segments live inside the wrapper.
    expect(app.querySelectorAll("[tabindex]").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/StatusBar.test.tsx -t "scoped application role"`
Expected: FAIL — no `[role="application"]` element exists yet.

- [ ] **Step 3: Make the change**

In `src/components/layout/StatusBar.tsx`, wrap the three segment `<div>`s (lines 101-131) in the application wrapper. The `<footer>` open tag (lines 95-100) and close tag (line 132) stay. Add `import` is not needed — `m` is already imported. Result:

```tsx
    <footer
      ref={footerRef}
      data-zone-id="status-bar"
      className="flex items-center gap-4 border-t border-slate-700 px-4 py-1.5 text-sm text-slate-400 forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]"
      onKeyDown={onKeyDown}
    >
      <div role="application" aria-label={m.zone_status()} className="contents">
        {/* ...unchanged seg0 / seg1 / seg2 divs... */}
      </div>
    </footer>
```

Concretely: insert `<div role="application" aria-label={m.zone_status()} className="contents">` directly after the `<footer ...>` open tag (after line 100), and the matching `</div>` directly before `</footer>` (before line 132). Do not change the segment JSX.

- [ ] **Step 4: Run the full StatusBar suite**

Run: `npx vitest run src/components/layout/StatusBar.test.tsx`
Expected: PASS — new test passes; existing roving tests (`tabIndices(footer)` recursive query, `fireEvent.keyDown(footer, ...)`) still pass because the wrapper is transparent and keydown bubbles to `<footer>`.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/StatusBar.tsx src/components/layout/StatusBar.test.tsx
git commit -m "feat(a11y): nest application wrapper inside status-bar contentinfo landmark"
```

---

### Task 7: Full regression + manual NVDA verification note

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — entire suite green (regression guard for Task 3/4 list+toolbar swaps and all roving behavior).

- [ ] **Step 2: Type-check / build**

Run: `npm run vite:build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Record manual NVDA checklist in the PR description**

The following require a real NVDA + WebView2 session (cannot be automated in jsdom). Copy into the PR body as a verification checklist:

1. App start → focus on Activity Bar → NVDA in focus mode; Up/Down switches sections.
2. `D` / `;` (browse mode) cycles landmarks: navigation → main → complementary (player) → contentinfo (status).
3. Each list (streams/songs/browser/wishlist): arrows move roving focus; Enter/Space/Delete/context-menu work.
4. `browser-search` / `songs-filter` / `wishlist-controls`: Tab between native controls; inputs read and edit (auto focus mode); labels announced.
5. Empty states (`streams-empty`) read via virtual cursor in browse mode.
6. Esc exits focus mode inside lists (possible now — not application at root).
7. No focus trapping; F6 / Shift+F6 cycles zones.

- [ ] **Step 4: Final commit (if any checklist doc added)**

```bash
git add -A
git commit -m "chore(a11y): record manual NVDA verification checklist" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** §3.1 zones → Tasks 2-6; §3.4 root → Task 1; §3.2/§3.3 (untouched) → explicitly not modified; §6.1 tests → Tasks 1,2,5,6 + Task 7 regression; §6.2 manual checklist → Task 7. All covered.
- **Mechanism consistency:** role-replacement (Tasks 2-4) vs nested-wrapper (Tasks 5-6) applied exactly per spec §4; landmark elements (`<nav>`, `<footer>`) use wrappers, non-landmarks use replacement.
- **i18n:** reuses `m.main_navigation()` and `m.zone_status()` (both exist); no new keys.
- **No placeholders:** every edit shows the exact before/after; every test shows full code.
