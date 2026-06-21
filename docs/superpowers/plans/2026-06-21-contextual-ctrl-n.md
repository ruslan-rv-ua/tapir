# Contextual Ctrl+N (Profiles / Wishlist / Schedule) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Ctrl+N` open the context-appropriate "create" dialog on the Profiles, Wishlist, and Schedule screens (Streams already works), so a keyboard/NVDA user learns one rule — "Ctrl+N creates a new thing on this screen".

**Architecture:** The global capture-phase handler (`useGlobalShortcuts`) dispatches through the pure `matchShortcut` registry. Each target dialog lives in its panel's local `useState`, so we add one boolean "signal" atom per screen: the registry action sets the atom `true`; the mounted panel subscribes via `useStore` and a bridge `useEffect` opens its local dialog and resets the atom to `false`. The active panel is guaranteed mounted because the registry `when`-gate only fires when `activeSection` equals that screen.

**Tech Stack:** React 19, nanostores + `@nanostores/react`, react-aria-components, Vitest + @testing-library/react, paraglide i18n.

## Global Constraints

Copied verbatim from the spec — every task's requirements implicitly include these:

- Use `e.code === "KeyN"`, never `e.key` — a Cyrillic layout returns `e.key === "н"` (accessibility.md §12).
- `ctrlOrMeta` means `(e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey` — already a module-private helper in `src/lib/shortcuts.ts`; reuse it, don't redefine.
- **No new i18n keys.** Reuse the existing getters `m.profile_create` ("Новий профіль"), `m.add_pattern` ("Додати патерн"), `m.schedule_add` ("Додати розклад").
- Every registry entry must stay `reserved` (existing invariant); since `Ctrl+N` is already reserved by Streams, `RESERVED_WEBVIEW_COMBOS` must be deduplicated by `combo` (keep first occurrence) so the reserved list still contains exactly one `Ctrl+N`.
- **Browser is deliberately out of scope.** Do not add a `new:browser` entry.
- `tsc` is **not** a gate (~51 pre-existing untyped-paraglide errors). The gates are `pnpm test` and `pnpm vite:build`.
- Branch: `feature/contextual-ctrl-n` (already checked out, branched from `develop`). Finish by merging into `develop`; do not push; never touch `main`.

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `src/stores/profileManager.ts` | modify | add `$showCreateProfileDialog` signal atom |
| `src/stores/wishlist.ts` | modify | add `$showAddPatternDialog` signal atom |
| `src/stores/schedule.ts` | modify | add `$showAddScheduleDialog` signal atom |
| `src/lib/shortcuts.ts` | modify | extend `ShortcutActions`; add 3 `Ctrl+N` registry entries |
| `src/lib/reservedShortcuts.ts` | modify | dedupe `RESERVED_WEBVIEW_COMBOS` by `combo` |
| `src/hooks/useGlobalShortcuts.ts` | modify | wire the 3 new actions to atom setters |
| `src/hooks/useGlobalShortcuts.test.tsx` | modify | dispatch tests for the 3 screens |
| `src/components/profile/ProfilesPanel.tsx` | modify | bridge effect → `{type:"create"}` sub-dialog |
| `src/components/profile/ProfilesPanel.test.tsx` | modify | bridge test |
| `src/components/wishlist/WishlistPanel.tsx` | modify | bridge effect → `{mode:"add"}` for active tab |
| `src/components/wishlist/WishlistPanel.test.tsx` | modify | bridge test |
| `src/components/schedule/SchedulePanel.tsx` | modify | bridge effect → `{schedule:null}` form |
| `src/components/schedule/SchedulePanel.test.tsx` | modify | bridge test |

---

### Task 1: Dispatch plumbing — atoms, registry, reserved dedup, wiring

**Files:**
- Modify: `src/stores/profileManager.ts`
- Modify: `src/stores/wishlist.ts`
- Modify: `src/stores/schedule.ts`
- Modify: `src/lib/shortcuts.ts:12-18` (`ShortcutActions`) and `src/lib/shortcuts.ts:94-103` (after `new:streams`)
- Modify: `src/lib/reservedShortcuts.ts:9-12`
- Modify: `src/hooks/useGlobalShortcuts.ts:6` (imports) and `:25-31` (`actions`)
- Test: `src/hooks/useGlobalShortcuts.test.tsx`
- Test (must stay green, no edits): `src/lib/reservedShortcuts.test.ts`

**Interfaces:**
- Produces: `$showCreateProfileDialog`, `$showAddPatternDialog`, `$showAddScheduleDialog` — each `import('nanostores').WritableAtom<boolean>` (i.e. `atom<boolean>(false)`), exported from the matching store module.
- Produces: `ShortcutActions.openCreateProfile`, `ShortcutActions.openAddPattern`, `ShortcutActions.openCreateSchedule` — all `() => void`.
- Consumes: existing `ctrlOrMeta`, `SHORTCUTS`, `matchShortcut`, `$showAddStreamDialog`.

- [ ] **Step 1: Write the failing dispatch tests**

In `src/hooks/useGlobalShortcuts.test.tsx`, add the three new atom imports next to the existing `$showAddStreamDialog` import (line 6):

```tsx
import { $showCreateProfileDialog } from "../stores/profileManager";
import { $showAddPatternDialog } from "../stores/wishlist";
import { $showAddScheduleDialog } from "../stores/schedule";
```

Extend the `beforeEach` (currently lines 28-32) to reset the new atoms:

```tsx
beforeEach(() => {
  $activeSection.set("browser");
  $commandPaletteOpen.set(false);
  $showAddStreamDialog.set(false);
  $showCreateProfileDialog.set(false);
  $showAddPatternDialog.set(false);
  $showAddScheduleDialog.set(false);
});
```

Add three tests inside the `describe("useGlobalShortcuts", …)` block, after the existing `Ctrl+N` tests:

```tsx
it("opens Create Profile on Ctrl+N on the profiles section, not Add Stream", () => {
  $activeSection.set("profiles");
  render(
    <Harness>
      <input data-testid="field" />
    </Harness>,
  );
  act(() => screen.getByTestId("field").focus());
  fireEvent.keyDown(screen.getByTestId("field"), { code: "KeyN", ctrlKey: true });
  expect($showCreateProfileDialog.get()).toBe(true);
  expect($showAddStreamDialog.get()).toBe(false);
});

it("opens Add Pattern on Ctrl+N on the wishlist section, not Add Stream", () => {
  $activeSection.set("wishlist");
  render(
    <Harness>
      <input data-testid="field" />
    </Harness>,
  );
  act(() => screen.getByTestId("field").focus());
  fireEvent.keyDown(screen.getByTestId("field"), { code: "KeyN", ctrlKey: true });
  expect($showAddPatternDialog.get()).toBe(true);
  expect($showAddStreamDialog.get()).toBe(false);
});

it("opens Create Schedule on Ctrl+N on the schedule section, not Add Stream", () => {
  $activeSection.set("schedule");
  render(
    <Harness>
      <input data-testid="field" />
    </Harness>,
  );
  act(() => screen.getByTestId("field").focus());
  fireEvent.keyDown(screen.getByTestId("field"), { code: "KeyN", ctrlKey: true });
  expect($showAddScheduleDialog.get()).toBe(true);
  expect($showAddStreamDialog.get()).toBe(false);
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm vitest run src/hooks/useGlobalShortcuts.test.tsx`
Expected: FAIL — module resolution / `undefined` for `$showCreateProfileDialog` (atoms not exported yet).

- [ ] **Step 3: Add the three signal atoms to the stores**

In `src/stores/profileManager.ts`, after the existing exports:

```ts
/** Signal: global Ctrl+N (profiles) wants the create-profile dialog opened. */
export const $showCreateProfileDialog = atom<boolean>(false);
```

In `src/stores/wishlist.ts`, after the existing exports:

```ts
/** Signal: global Ctrl+N (wishlist) wants the add-pattern dialog opened. */
export const $showAddPatternDialog = atom<boolean>(false);
```

In `src/stores/schedule.ts`, after the existing atom exports (before `loadSeq`):

```ts
/** Signal: global Ctrl+N (schedule) wants the new-schedule form opened. */
export const $showAddScheduleDialog = atom<boolean>(false);
```

(`atom` is already imported in all three files.)

- [ ] **Step 4: Extend `ShortcutActions` and add the registry entries**

In `src/lib/shortcuts.ts`, add three members to the `ShortcutActions` interface (currently lines 12-18):

```ts
export interface ShortcutActions {
  setSection: (s: Section) => void;
  toggleCommandPalette: () => void;
  toggleSettings: () => void;
  openAddStream: () => void;
  openHelp: () => void;
  openCreateProfile: () => void;
  openAddPattern: () => void;
  openCreateSchedule: () => void;
}
```

In the `SHORTCUTS` array, immediately **after** the `new:streams` entry (ends at line 103, `},`) and before the `// Tier 2′` comment, insert:

```ts
  {
    id: "new:profiles",
    combo: "Ctrl+N",
    label: m.profile_create,
    group: "context",
    reserved: true,
    match: (e) => ctrlOrMeta(e) && e.code === "KeyN",
    when: (ctx) => ctx.activeSection === "profiles",
    run: (a) => a.openCreateProfile(),
  },
  {
    id: "new:wishlist",
    combo: "Ctrl+N",
    label: m.add_pattern,
    group: "context",
    reserved: true,
    match: (e) => ctrlOrMeta(e) && e.code === "KeyN",
    when: (ctx) => ctx.activeSection === "wishlist",
    run: (a) => a.openAddPattern(),
  },
  {
    id: "new:schedule",
    combo: "Ctrl+N",
    label: m.schedule_add,
    group: "context",
    reserved: true,
    match: (e) => ctrlOrMeta(e) && e.code === "KeyN",
    when: (ctx) => ctx.activeSection === "schedule",
    run: (a) => a.openCreateSchedule(),
  },
```

The order streams → profiles → wishlist → schedule with mutually-exclusive `when` gates means `matchShortcut` returns exactly one entry per screen.

- [ ] **Step 5: Dedupe the reserved combos list**

In `src/lib/reservedShortcuts.ts`, replace the `RESERVED_WEBVIEW_COMBOS` definition (lines 9-12) with a `combo`-deduplicated version that keeps the first occurrence (Streams' `Ctrl+N`, preserving registry order):

```ts
export const RESERVED_WEBVIEW_COMBOS: ReadonlyArray<{
  combo: string;
  label: () => string;
}> = SHORTCUTS.filter((s) => s.reserved)
  .filter((s, i, arr) => arr.findIndex((x) => x.combo === s.combo) === i)
  .map(({ combo, label }) => ({ combo, label }));
```

`findReservedConflict("Ctrl+N")` keeps returning `m.add_stream` (the first occurrence). O(n²) is irrelevant at n≈16.

- [ ] **Step 6: Wire the actions to the atom setters**

In `src/hooks/useGlobalShortcuts.ts`, extend the imports (line 6 area) so the three new atoms are imported from their stores:

```ts
import { $showAddStreamDialog } from "../stores/streams";
import { $showCreateProfileDialog } from "../stores/profileManager";
import { $showAddPatternDialog } from "../stores/wishlist";
import { $showAddScheduleDialog } from "../stores/schedule";
```

Add three members to the `actions` object (currently lines 25-31):

```ts
const actions: ShortcutActions = {
  setSection: (s) => $activeSection.set(s),
  toggleCommandPalette: () => $commandPaletteOpen.set(!$commandPaletteOpen.get()),
  toggleSettings: () => $settingsDialogOpen.set(!$settingsDialogOpen.get()),
  openAddStream: () => $showAddStreamDialog.set(true),
  openHelp: () => $helpOpen.set(true),
  openCreateProfile: () => $showCreateProfileDialog.set(true),
  openAddPattern: () => $showAddPatternDialog.set(true),
  openCreateSchedule: () => $showAddScheduleDialog.set(true),
};
```

- [ ] **Step 7: Run the dispatch tests to verify they pass**

Run: `pnpm vitest run src/hooks/useGlobalShortcuts.test.tsx`
Expected: PASS — all tests including the three new ones and the existing Streams/off-section cases.

- [ ] **Step 8: Verify the reserved-combos test is still green**

Run: `pnpm vitest run src/lib/reservedShortcuts.test.ts`
Expected: PASS — the deduped array still equals the expected list with exactly one `Ctrl+N`, and `findReservedConflict("Ctrl+N")` still returns `m.add_stream()`. (A failure here means the dedupe in Step 5 was not applied.)

- [ ] **Step 9: Commit**

```bash
git add src/stores/profileManager.ts src/stores/wishlist.ts src/stores/schedule.ts \
        src/lib/shortcuts.ts src/lib/reservedShortcuts.ts \
        src/hooks/useGlobalShortcuts.ts src/hooks/useGlobalShortcuts.test.tsx
git commit -m "feat(shortcuts): dispatch Ctrl+N to per-screen create signals

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: ProfilesPanel bridge effect

**Files:**
- Modify: `src/components/profile/ProfilesPanel.tsx:4` (import), `:42` (subscribe), `:53-57` (effect after mount-load)
- Test: `src/components/profile/ProfilesPanel.test.tsx`

**Interfaces:**
- Consumes: `$showCreateProfileDialog` (from Task 1). Opening reuses the existing local `setSubDialog({ type: "create" })`, `setNameInput`, `setNameError`.

- [ ] **Step 1: Write the failing bridge test**

In `src/components/profile/ProfilesPanel.test.tsx`, add `act` to the testing-library import (line 2) and import the atom (next to the existing `profileManager` import on line 5):

```tsx
import { render, screen, waitFor, within, fireEvent, act } from "@testing-library/react";
```
```tsx
import { $profileList, $profilesSelection, $showCreateProfileDialog } from "../../stores/profileManager";
```

In the first `describe`'s `beforeEach` (lines 93-102), add a reset:

```tsx
$showCreateProfileDialog.set(false);
```

Add this test to the first `describe("ProfilesPanel", …)` block:

```tsx
it("opens the create dialog when the Ctrl+N bridge atom is set", async () => {
  renderPanel();
  await screen.findByText("Jazz");
  act(() => $showCreateProfileDialog.set(true));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByRole("heading", { name: m.profile_create() })).toBeInTheDocument();
  expect($showCreateProfileDialog.get()).toBe(false);
});
```

`ProfileNameDialog` uses `role="alertdialog"` (not `dialog`); its `Heading slot="title"` renders the title `m.profile_create()` (mocked to "New profile").

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/profile/ProfilesPanel.test.tsx -t "Ctrl+N bridge"`
Expected: FAIL — no `alertdialog` appears (the panel does not yet react to the atom).

- [ ] **Step 3: Add the bridge subscription and effect**

In `src/components/profile/ProfilesPanel.tsx`, add the atom to the existing import (line 4):

```ts
import { $profileList, $profilesSelection, $showCreateProfileDialog } from "../../stores/profileManager";
```

After `const announce = useAnnounce();` (line 42), subscribe:

```tsx
const showCreate = useStore($showCreateProfileDialog);
```

After the mount-load `useEffect` (lines 53-57), add the bridge effect:

```tsx
// Bridge: global Ctrl+N (profiles) → open the create dialog. The atom is the
// signal; reset it synchronously so the next Ctrl+N (after close) fires again.
// The guard prevents re-opening on unrelated re-renders.
useEffect(() => {
  if (showCreate) {
    setNameInput("");
    setNameError(null);
    setSubDialog({ type: "create" });
    $showCreateProfileDialog.set(false);
  }
}, [showCreate]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/components/profile/ProfilesPanel.test.tsx`
Expected: PASS — the whole file, including the new bridge test.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/ProfilesPanel.tsx src/components/profile/ProfilesPanel.test.tsx
git commit -m "feat(profiles): open create dialog from Ctrl+N bridge atom

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: WishlistPanel bridge effect

**Files:**
- Modify: `src/components/wishlist/WishlistPanel.tsx:14` (import), `:40` (subscribe), `:43-46` (effect after mount-load)
- Test: `src/components/wishlist/WishlistPanel.test.tsx`

**Interfaces:**
- Consumes: `$showAddPatternDialog` (from Task 1). Opening reuses the existing local `setDialog({ mode: "add", listType: activeTab })`.

- [ ] **Step 1: Write the failing bridge test**

In `src/components/wishlist/WishlistPanel.test.tsx`, extend the testing-library import (line 3) and the wishlist-store import (line 5):

```tsx
import { render, fireEvent, waitFor, screen, act } from "@testing-library/react";
```
```tsx
import { $wishlist, $ignorelist, $patternSelection, $showAddPatternDialog } from "../../stores/wishlist";
```

In `beforeEach` (lines 17-21), add a reset:

```tsx
$showAddPatternDialog.set(false);
```

Add this test (this file uses **real** paraglide messages — only `tauri` is mocked — and the active tab defaults to `wishlist`, so the dialog title is `m.add_to_wishlist()`):

```tsx
it("opens the add-pattern dialog for the active tab when the Ctrl+N bridge atom is set", async () => {
  render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
  await waitFor(() => screen.getByText(m.select_all()));
  act(() => $showAddPatternDialog.set(true));
  expect(await screen.findByRole("heading", { name: m.add_to_wishlist() })).toBeTruthy();
  expect($showAddPatternDialog.get()).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/wishlist/WishlistPanel.test.tsx -t "Ctrl+N bridge atom"`
Expected: FAIL — the `add_to_wishlist` heading never appears.

- [ ] **Step 3: Add the bridge subscription and effect**

In `src/components/wishlist/WishlistPanel.tsx`, add the atom to the existing import (line 14):

```ts
import { $wishlist, $ignorelist, $patternSelection, $showAddPatternDialog } from "../../stores/wishlist";
```

After `const announce = useAnnounce();` (line 40), subscribe:

```tsx
const showAddPattern = useStore($showAddPatternDialog);
```

After the mount-load `useEffect` (lines 43-46), add the bridge effect:

```tsx
// Bridge: global Ctrl+N (wishlist) → open the add dialog for the active tab.
// activeTab is in deps so the dialog opens against the current tab; the guard
// stops a tab switch from re-opening it.
useEffect(() => {
  if (showAddPattern) {
    setDialog({ mode: "add", listType: activeTab });
    $showAddPatternDialog.set(false);
  }
}, [showAddPattern, activeTab]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/components/wishlist/WishlistPanel.test.tsx`
Expected: PASS — the whole file, including the new bridge test.

- [ ] **Step 5: Commit**

```bash
git add src/components/wishlist/WishlistPanel.tsx src/components/wishlist/WishlistPanel.test.tsx
git commit -m "feat(wishlist): open add-pattern dialog from Ctrl+N bridge atom

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: SchedulePanel bridge effect

**Files:**
- Modify: `src/components/schedule/SchedulePanel.tsx:4-6` (import), `:32` (subscribe), `:51` (effect after mount-load)
- Test: `src/components/schedule/SchedulePanel.test.tsx`

**Interfaces:**
- Consumes: `$showAddScheduleDialog` (from Task 1). Opening reuses the existing local `setFormFor({ schedule: null })`.

- [ ] **Step 1: Write the failing bridge test**

In `src/components/schedule/SchedulePanel.test.tsx`, add the atom to the schedule-store import (line 5):

```tsx
import { $schedules, $scheduleSelection, $schedulesLoading, $schedulesError, $showAddScheduleDialog } from "../../stores/schedule";
```

(`act` and `screen` are already imported on line 2.) In the first `describe`'s `beforeEach` (lines 123-131), add a reset:

```tsx
$showAddScheduleDialog.set(false);
```

Add this test to `describe("SchedulePanel", …)`. The form's heading uses `m.schedule_form_add_title()` (mocked to "Додати розклад"); `$streams` is already seeded in `beforeEach`, so `ScheduleForm` renders:

```tsx
it("opens the new-schedule form when the Ctrl+N bridge atom is set", async () => {
  renderPanel();
  await screen.findByText("Поки що немає розкладів");
  act(() => $showAddScheduleDialog.set(true));
  expect(await screen.findByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("heading", { name: m.schedule_form_add_title() })).toBeTruthy();
  expect($showAddScheduleDialog.get()).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/schedule/SchedulePanel.test.tsx -t "Ctrl+N bridge atom"`
Expected: FAIL — no `dialog` appears.

- [ ] **Step 3: Add the bridge subscription and effect**

In `src/components/schedule/SchedulePanel.tsx`, add the atom to the existing store import (lines 4-6):

```ts
import {
  $schedules, $scheduleSelection, $schedulesError, $schedulesLoading, $showAddScheduleDialog, loadSchedules,
} from "../../stores/schedule";
```

After `const announce = useAnnounce();` (line 32), subscribe:

```tsx
const showAddSchedule = useStore($showAddScheduleDialog);
```

After the mount-load `useEffect` (line 51, `useEffect(() => { loadSchedules(); }, []);`), add the bridge effect:

```tsx
// Bridge: global Ctrl+N (schedule) → open the new-schedule form.
useEffect(() => {
  if (showAddSchedule) {
    setFormFor({ schedule: null });
    $showAddScheduleDialog.set(false);
  }
}, [showAddSchedule]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/components/schedule/SchedulePanel.test.tsx`
Expected: PASS — the whole file, including the new bridge test.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/SchedulePanel.tsx src/components/schedule/SchedulePanel.test.tsx
git commit -m "feat(schedule): open new-schedule form from Ctrl+N bridge atom

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Full gate + acceptance verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS (all files green).
Note: a first cold Vitest run after idle can spuriously fail many tests (cold transform cache). If a broad, unrelated set fails, re-run `pnpm test` once before investigating; do not mask the exit code.

- [ ] **Step 2: Run the production build gate**

Run: `pnpm vite:build`
Expected: build succeeds. (`tsc` errors are not part of this gate.)

- [ ] **Step 3: Confirm the acceptance criteria against the spec**

Tick each, citing the test or behavior that proves it:
- `Ctrl+N` on Profiles opens the "Створити профіль" dialog (`ProfileNameDialog`, `type:"create"`) — Task 2 test.
- `Ctrl+N` on Wishlist opens `AddPatternDialog` for the active tab — Task 3 test.
- `Ctrl+N` on Schedule opens `ScheduleForm` (new schedule) — Task 4 test.
- `useGlobalShortcuts.test.tsx` covers all three screens and does **not** open Add Stream off-Streams — Task 1 tests.
- Three panel bridge tests exist (atom `true` → dialog open) — Tasks 2-4.
- F1 help shows three new `context`-group entries with `m.profile_create` / `m.add_pattern` / `m.schedule_add` labels (derived automatically from `SHORTCUTS`).
- No new i18n keys added; Browser left out of scope.
- Gate: `pnpm test` + `pnpm vite:build` green.

- [ ] **Step 4: (Optional) Manual NVDA smoke check**

If a Windows + NVDA session is available, run `pnpm dev`, switch to each screen (Alt+digit), press `Ctrl+N`, and confirm NVDA announces the dialog's accessible name (its title). No code change expected — focus return is handled by react-aria `Modal` + the panels' existing success handlers, identical to Streams.

---

## Notes for the implementer

- **Why the panel is always mounted when its gate fires:** `App.tsx` mounts only the active section's panel; the registry `when`-gate only lets `run` fire when `activeSection` equals that screen — so the matching panel is guaranteed in the DOM, and the bridge effect runs.
- **Why re-entrancy is safe:** while a dialog is open, `isInModal()` in the global handler suppresses `Ctrl+N` (the `MODAL_SELECTOR` covers `role="dialog"` and `role="alertdialog"`). The synchronous atom reset plus the `if (show…)` guard prevent double-opens and stuck-`true` states.
- The F1 ShortcutsHelp dialog reads the lazy `label` getters; the dispatch path never calls them, which is why adding label references in the registry needs no message mocking in `useGlobalShortcuts.test.tsx`.
