# Profiles Composite-List Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the profiles screen's React Aria `ListBox` + `ProfileActions` sidebar with a custom composite list (2D roving focus) that mirrors the streams screen — inline per-row action buttons + a context menu.

**Architecture:** Reuse the shared `useCompositeList` hook (Up/Down between profile rows, Left/Right between row segments). Each row = a `summary` stop + dynamic action-button stops + a `⋯` context-menu trigger. Disabled actions are omitted from the segment list (no focus stop); the context menu shows all actions with disabled ones greyed (`isDisabled`). `ProfilesPanel` keeps owning dialogs and Tauri calls; handlers now receive the target profile name per row instead of reading one selection state.

**Tech Stack:** React + TypeScript, react-aria-components (menu only), nanostores, Vitest + Testing Library, Paraglide i18n.

**Spec:** `docs/superpowers/specs/2026-06-02-profiles-list-composite-nav-design.md`

---

## File Structure

- `src/hooks/useCompositeList.ts` — **modify**: add 4 segment kinds to the `SegmentKind` union; add a `focusItem(itemId, segment?)` method to the return value.
- `src/i18n/messages/uk.json`, `src/i18n/messages/en.json` — **modify**: add 11 new messages; remove 4 orphaned ones.
- `src/components/profile/ProfileItem.tsx` — **create**: one profile row + `getProfileSegments()`.
- `src/components/profile/ProfileContextMenu.tsx` — **create**: `⋯` trigger + menu (mirror of `StreamContextMenu`).
- `src/components/profile/ProfileList.tsx` — **rewrite**: composite list on `useCompositeList`, exports `ProfileListHandle` (a `ZoneEntry` + `focusProfile`).
- `src/components/profile/ProfilesPanel.tsx` — **modify**: drop the `profiles-actions` zone and `ProfileActions` mount; handlers take a `name`; `selected` → `target`.
- `src/components/profile/ProfileActions.tsx` + `ProfileActions.test.tsx` — **delete**.
- Tests: `ProfileItem.test.tsx`, `ProfileContextMenu.test.tsx`, `ProfileList.test.tsx` (rewrite), `ProfilesPanel.test.tsx` (update).

**Verification commands** (used throughout):
- Tests (single file): `pnpm vitest run src/components/profile/<file>.test.tsx`
- All tests: `pnpm test`
- Typecheck: `pnpm exec tsc --noEmit`
- Regenerate i18n: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/i18n/paraglide`

---

## Task 1: i18n messages

**Files:**
- Modify: `src/i18n/messages/uk.json`
- Modify: `src/i18n/messages/en.json`

- [ ] **Step 1: Add new keys to `uk.json`**

Add these entries (place them next to the existing `profile_*` block, after `profile_actions_label`). Keep valid JSON (mind the trailing commas around insertion point):

```json
  "zone_profiles_list": "Список профілів",
  "item_role_profile": "профіль",
  "profile_already_active": "Профіль уже активний",
  "profile_actions": "Дії для {name}",
  "profile_context_menu": "Контекстне меню профілю",
  "profile_row_actions": "Дії для профілю {name}",
  "profile_switch_named": "Перемкнутися на {name}",
  "profile_duplicate_named": "Дублювати {name}",
  "profile_rename_named": "Перейменувати {name}",
  "profile_delete_named": "Видалити {name}",
  "profile_export_named": "Експортувати {name}"
```

- [ ] **Step 2: Add the same keys to `en.json`**

```json
  "zone_profiles_list": "Profiles list",
  "item_role_profile": "profile",
  "profile_already_active": "Profile is already active",
  "profile_actions": "Actions for {name}",
  "profile_context_menu": "Profile context menu",
  "profile_row_actions": "Actions for profile {name}",
  "profile_switch_named": "Switch to {name}",
  "profile_duplicate_named": "Duplicate {name}",
  "profile_rename_named": "Rename {name}",
  "profile_delete_named": "Delete {name}",
  "profile_export_named": "Export {name}"
```

- [ ] **Step 3: Regenerate Paraglide output**

Run: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/i18n/paraglide`
Expected: completes without error; generated message functions now include the new keys.

- [ ] **Step 4: Verify the new messages compiled**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no missing-export errors for the new `m.*` symbols when referenced later). At this point nothing references them yet, so this just confirms the JSON is valid and compiled.

> Note: orphaned messages (`profile_list_label`, `profile_actions_label`, `profile_group_profile`, `profile_group_file`) are removed in Task 7, after their last consumer is gone.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/messages/uk.json src/i18n/messages/en.json src/i18n/paraglide
git commit -m "i18n(profile): add messages for composite-list rows and context menu"
```

---

## Task 2: Extend `useCompositeList` (segment kinds + `focusItem`)

**Files:**
- Modify: `src/hooks/useCompositeList.ts`

- [ ] **Step 1: Add profile segment kinds to the union**

In `src/hooks/useCompositeList.ts`, extend the `SegmentKind` union. Replace the action-stops block (currently ending with the wishlist/ignorelist comment) so it reads:

```ts
  // Per-button action stops — each action button is its own focus stop,
  // reached via Left/Right and activated natively (Enter/Space/click).
  | 'action-play'
  | 'action-record'
  | 'action-menu' // streams / profiles
  | 'action-add' // browser results
  | 'action-edit'
  | 'action-delete' // wishlist / ignorelist / profiles
  // Profile rows
  | 'action-switch'
  | 'action-duplicate'
  | 'action-rename'
  | 'action-export';
```

- [ ] **Step 2: Add a `focusItem` method**

Inside `useCompositeList`, after the `moveFocus` definition (around line 198), add:

```ts
  /** Programmatically move focus to a specific item's segment (default summary). */
  const focusItem = useCallback(
    (itemId: string, segment: SegmentKind = 'summary') => {
      if (!items.some((it) => it.id === itemId)) return;
      moveFocus(itemId, segment);
    },
    [items, moveFocus],
  );
```

- [ ] **Step 3: Return `focusItem`**

Change the final return (line ~376) to include it:

```ts
  return { listRef, onKeyDownCapture, isFocused, restoreFocus, focusItem, activeItemId, activeSegment };
```

- [ ] **Step 4: Verify typecheck and existing tests still pass**

Run: `pnpm exec tsc --noEmit && pnpm vitest run src/components/streams/StreamList.test.tsx`
Expected: PASS. The union change is additive and `focusItem` is new — streams are unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCompositeList.ts
git commit -m "feat(composite-list): add profile segment kinds and focusItem()"
```

---

## Task 3: `ProfileItem` + `getProfileSegments`

**Files:**
- Create: `src/components/profile/ProfileItem.tsx`
- Test: `src/components/profile/ProfileItem.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/profile/ProfileItem.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { ProfileMeta } from "../../lib/tauri";
import { ProfileItem, getProfileSegments } from "./ProfileItem";

vi.mock("../../i18n/paraglide/runtime", () => ({ getLocale: () => "uk" }));
vi.mock("../../i18n/paraglide/messages", () => ({
  item_role_profile: () => "профіль",
  profile_active_badge: () => "активний",
  profile_row_actions: ({ name }: { name: string }) => `Дії для профілю ${name}`,
  profile_actions: ({ name }: { name: string }) => `Дії для ${name}`,
  profile_context_menu: () => "Контекстне меню профілю",
  profile_switch: () => "Перемкнутися",
  profile_duplicate: () => "Дублювати",
  profile_rename: () => "Перейменувати",
  profile_delete: () => "Видалити",
  profile_export: () => "Експортувати",
  profile_switch_named: ({ name }: { name: string }) => `Перемкнутися на ${name}`,
  profile_duplicate_named: ({ name }: { name: string }) => `Дублювати ${name}`,
  profile_rename_named: ({ name }: { name: string }) => `Перейменувати ${name}`,
  profile_delete_named: ({ name }: { name: string }) => `Видалити ${name}`,
  profile_export_named: ({ name }: { name: string }) => `Експортувати ${name}`,
  profile_stream_count_one: ({ count }: { count: number }) => `${count} потік`,
  profile_stream_count_few: ({ count }: { count: number }) => `${count} потоки`,
  profile_stream_count_many: ({ count }: { count: number }) => `${count} потоків`,
  profile_stream_count_other: ({ count }: { count: number }) => `${count} потоки`,
}));

const mk = (over: Partial<ProfileMeta> = {}): ProfileMeta => ({
  name: "Jazz", streamCount: 5, isActive: false, ...over,
});

function renderItem(profile: ProfileMeta, activeProfile: string, handlers = {}) {
  const h = {
    onSwitch: vi.fn(), onDuplicate: vi.fn(), onRename: vi.fn(),
    onDelete: vi.fn(), onExport: vi.fn(), ...handlers,
  };
  const utils = render(
    <ul>
      <ProfileItem
        profile={profile}
        activeProfile={activeProfile}
        isActiveRow
        isFocused={(seg) => seg === "summary"}
        {...h}
      />
    </ul>,
  );
  return { ...utils, ...h };
}

describe("getProfileSegments", () => {
  it("omits switch on the active row", () => {
    expect(getProfileSegments(mk({ name: "Jazz" }), "Jazz")).toEqual([
      "action-duplicate", "action-export", "action-menu",
    ]);
  });
  it("omits rename+delete for Default", () => {
    expect(getProfileSegments(mk({ name: "Default" }), "Jazz")).toEqual([
      "action-switch", "action-duplicate", "action-export", "action-menu",
    ]);
  });
  it("includes all actions for a non-active, non-Default row", () => {
    expect(getProfileSegments(mk({ name: "Jazz" }), "Default")).toEqual([
      "action-switch", "action-duplicate", "action-rename",
      "action-delete", "action-export", "action-menu",
    ]);
  });
});

describe("ProfileItem — row structure & a11y", () => {
  it("renders the row as a listitem described as a profile, labelled with name + count", () => {
    const { container } = renderItem(mk(), "Default");
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("role")).toBe("listitem");
    expect(li.getAttribute("aria-roledescription")).toBe("профіль");
    expect(li.getAttribute("aria-label")).toBe("Jazz, 5 потоків");
    expect(li.tabIndex).toBe(0);
  });

  it("folds the active state into the row label and shows a check icon", () => {
    const { container } = renderItem(mk({ name: "Default", streamCount: 2, isActive: true }), "Default");
    const li = container.querySelector<HTMLElement>('li[data-segment="summary"]')!;
    expect(li.getAttribute("aria-label")).toBe("Default, активний, 2 потоки");
    // The check icon is decorative.
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders only the enabled actions as button focus stops (active row)", () => {
    const { container } = renderItem(mk({ name: "Jazz", isActive: true }), "Jazz");
    const segs = Array.from(container.querySelectorAll("button[data-segment]"))
      .map((b) => b.getAttribute("data-segment"));
    expect(segs).toEqual(["action-duplicate", "action-export", "action-menu"]);
  });

  it("inline buttons call their handlers with the profile name", () => {
    const { container, onDuplicate, onExport } = renderItem(mk({ name: "Jazz" }), "Jazz");
    fireEvent.click(container.querySelector('button[data-segment="action-duplicate"]')!);
    expect(onDuplicate).toHaveBeenCalledWith("Jazz");
    fireEvent.click(container.querySelector('button[data-segment="action-export"]')!);
    expect(onExport).toHaveBeenCalledWith("Jazz");
  });

  it("wraps actions in a labelled group", () => {
    const { container } = renderItem(mk({ name: "Jazz" }), "Default");
    const group = container.querySelector('[role="group"]')!;
    expect(group.getAttribute("aria-label")).toBe("Дії для профілю Jazz");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/profile/ProfileItem.test.tsx`
Expected: FAIL — `Failed to resolve import "./ProfileItem"`.

- [ ] **Step 3: Create `ProfileItem.tsx`**

```tsx
import { CheckCircle, ArrowRightLeft, Copy, Pencil, Trash2, Upload } from "lucide-react";
import type { ProfileMeta } from "../../lib/tauri";
import type { SegmentKind } from "../../hooks/useCompositeList";
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
  if (!isDefault && !isActive) { segs.push("action-rename"); segs.push("action-delete"); }
  segs.push("action-export");
  segs.push("action-menu");
  return segs;
}

function streamCountLabel(count: number): string {
  const category = new Intl.PluralRules(getLocale()).select(count);
  switch (category) {
    case "one": return m.profile_stream_count_one({ count });
    case "few": return m.profile_stream_count_few({ count });
    case "many": return m.profile_stream_count_many({ count });
    default: return m.profile_stream_count_other({ count });
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
  profile, activeProfile, isFocused, isActiveRow,
  onSwitch, onDuplicate, onRename, onDelete, onExport,
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
    <li
      // Explicit role="listitem": the parent <ul> is role="application", which
      // drops the implicit listitem role and would leave NVDA with nothing to
      // announce on focus. Mirrors StreamItem.
      role="listitem"
      data-item-id={profile.name}
      data-segment="summary"
      tabIndex={isFocused("summary") ? 0 : -1}
      aria-label={rowLabel}
      aria-roledescription={m.item_role_profile()}
      className={`flex items-center gap-2 border-b border-slate-800 px-3 py-2 forced-colors:border-[ButtonText] ${
        isActive ? "border-l-2 border-l-sky-500 forced-colors:border-l-[Highlight]" : "border-l-2 border-l-transparent"
      } ${isActiveRow ? "bg-slate-800/60" : ""}`}
    >
      <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center">
        {isActive ? <CheckCircle size={14} className="text-sky-400 forced-colors:text-[Highlight]" /> : null}
      </span>
      <span className="truncate font-medium text-slate-200">{profile.name}</span>
      <span aria-hidden="true" className="ml-auto text-xs text-slate-500">{countLabel}</span>

      <div role="group" aria-label={m.profile_row_actions({ name: profile.name })} className="flex items-center gap-1">
        {!isActive && (
          <IconButton itemId={profile.name} segment="action-switch" focused={isFocused("action-switch")}
            onClick={() => onSwitch(profile.name)} label={m.profile_switch_named({ name: profile.name })} Icon={ArrowRightLeft} />
        )}
        <IconButton itemId={profile.name} segment="action-duplicate" focused={isFocused("action-duplicate")}
          onClick={() => onDuplicate(profile.name)} label={m.profile_duplicate_named({ name: profile.name })} Icon={Copy} />
        {!isDefault && !isActive && (
          <>
            <IconButton itemId={profile.name} segment="action-rename" focused={isFocused("action-rename")}
              onClick={() => onRename(profile.name)} label={m.profile_rename_named({ name: profile.name })} Icon={Pencil} />
            <IconButton itemId={profile.name} segment="action-delete" focused={isFocused("action-delete")}
              onClick={() => onDelete(profile.name)} label={m.profile_delete_named({ name: profile.name })} Icon={Trash2} />
          </>
        )}
        <IconButton itemId={profile.name} segment="action-export" focused={isFocused("action-export")}
          onClick={() => onExport(profile.name)} label={m.profile_export_named({ name: profile.name })} Icon={Upload} />
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
    </li>
  );
}

function IconButton({
  itemId, segment, focused, onClick, label, Icon,
}: {
  itemId: string;
  segment: ProfileSegment;
  focused: boolean;
  onClick: () => void;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <button
      data-item-id={itemId}
      data-segment={segment}
      tabIndex={focused ? 0 : -1}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center justify-center rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:border forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText] forced-colors:focus-visible:outline-[Highlight]"
    >
      <Icon size={14} aria-hidden className="opacity-80" />
    </button>
  );
}
```

> This file imports `./ProfileContextMenu`, created in Task 4. The test for Task 3 will not pass until Task 4's file exists. That is intentional — run Task 3's test at the end of Task 4. (If executing strictly task-by-task, create a 1-line placeholder `ProfileContextMenu.tsx` exporting `() => null` first, then replace it in Task 4. The provided Task 4 file is the real one.)

- [ ] **Step 4: Commit**

```bash
git add src/components/profile/ProfileItem.tsx src/components/profile/ProfileItem.test.tsx
git commit -m "feat(profile): add ProfileItem row and getProfileSegments"
```

---

## Task 4: `ProfileContextMenu`

**Files:**
- Create: `src/components/profile/ProfileContextMenu.tsx`
- Test: `src/components/profile/ProfileContextMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/profile/ProfileContextMenu.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import type { ProfileMeta } from "../../lib/tauri";
import { ProfileContextMenu } from "./ProfileContextMenu";

vi.mock("../../i18n/paraglide/messages", () => ({
  profile_actions: ({ name }: { name: string }) => `Дії для ${name}`,
  profile_context_menu: () => "Контекстне меню профілю",
  profile_switch: () => "Перемкнутися",
  profile_duplicate: () => "Дублювати",
  profile_rename: () => "Перейменувати",
  profile_delete: () => "Видалити",
  profile_export: () => "Експортувати",
}));

const mk = (over: Partial<ProfileMeta> = {}): ProfileMeta => ({
  name: "Jazz", streamCount: 5, isActive: false, ...over,
});

function renderMenu(profile: ProfileMeta, isActive: boolean, isDefault: boolean) {
  const h = {
    onSwitch: vi.fn(), onDuplicate: vi.fn(), onRename: vi.fn(),
    onDelete: vi.fn(), onExport: vi.fn(),
  };
  const utils = render(
    <ProfileContextMenu profile={profile} isActive={isActive} isDefault={isDefault} menuFocused {...h} />,
  );
  return { ...utils, ...h };
}

describe("ProfileContextMenu", () => {
  it("renders a trigger labelled for the profile and tagged as the menu segment", () => {
    const { container } = renderMenu(mk(), false, false);
    const trigger = container.querySelector('button[data-segment="action-menu"]')!;
    expect(trigger.getAttribute("aria-label")).toBe("Дії для Jazz");
    expect(trigger.hasAttribute("data-context-menu-trigger")).toBe(true);
  });

  it("opens to show all five actions; clicking one calls its handler", async () => {
    const { container, onRename } = renderMenu(mk(), false, false);
    fireEvent.click(container.querySelector('button[data-segment="action-menu"]')!);
    const items = await screen.findAllByRole("menuitem");
    expect(items).toHaveLength(5);
    fireEvent.click(screen.getByRole("menuitem", { name: "Перейменувати" }));
    expect(onRename).toHaveBeenCalled();
  });

  it("disables switch on the active profile", async () => {
    const { container } = renderMenu(mk({ name: "Jazz", isActive: true }), true, false);
    fireEvent.click(container.querySelector('button[data-segment="action-menu"]')!);
    const switchItem = await screen.findByRole("menuitem", { name: "Перемкнутися" });
    expect(switchItem.getAttribute("aria-disabled")).toBe("true");
  });

  it("disables rename and delete for Default", async () => {
    const { container } = renderMenu(mk({ name: "Default" }), false, true);
    fireEvent.click(container.querySelector('button[data-segment="action-menu"]')!);
    expect((await screen.findByRole("menuitem", { name: "Перейменувати" })).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Видалити" }).getAttribute("aria-disabled")).toBe("true");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/profile/ProfileContextMenu.test.tsx`
Expected: FAIL — `Failed to resolve import "./ProfileContextMenu"`.

- [ ] **Step 3: Create `ProfileContextMenu.tsx`**

```tsx
import type React from "react";
import { Menu, MenuItem, MenuTrigger, Popover, Button, Separator } from "react-aria-components";
import { ArrowRightLeft, Copy, Pencil, Trash2, Upload } from "lucide-react";
import type { ProfileMeta } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  profile: ProfileMeta;
  isActive: boolean;
  isDefault: boolean;
  /** True when the trigger is the active 'action-menu' focus stop. */
  menuFocused: boolean;
  onSwitch: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onDelete: () => void;
  onExport: () => void;
}

export function ProfileContextMenu({
  profile, isActive, isDefault, menuFocused,
  onSwitch, onDuplicate, onRename, onDelete, onExport,
}: Props) {
  const handleAction = (key: React.Key) => {
    switch (key) {
      case "switch": onSwitch(); break;
      case "duplicate": onDuplicate(); break;
      case "rename": onRename(); break;
      case "delete": onDelete(); break;
      case "export": onExport(); break;
    }
  };

  const itemClass =
    "cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40";

  return (
    <MenuTrigger>
      <Button
        // Roving focus stop: tabbable only while it is the active 'action-menu' segment.
        excludeFromTabOrder={!menuFocused}
        data-item-id={profile.name}
        data-segment="action-menu"
        data-context-menu-trigger
        aria-label={m.profile_actions({ name: profile.name })}
        title={m.profile_actions({ name: profile.name })}
        className="inline-flex shrink-0 items-center justify-center rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:border forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText] forced-colors:focus-visible:outline-[Highlight]"
      >
        ⋯
      </Button>
      <Popover>
        <Menu
          aria-label={m.profile_context_menu()}
          onAction={handleAction}
          className="min-w-48 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl outline-none"
        >
          <MenuItem id="switch" isDisabled={isActive} className={itemClass}>
            <span aria-hidden="true" className="mr-2 inline-flex"><ArrowRightLeft size={14} /></span>{m.profile_switch()}
          </MenuItem>
          <MenuItem id="duplicate" className={itemClass}>
            <span aria-hidden="true" className="mr-2 inline-flex"><Copy size={14} /></span>{m.profile_duplicate()}
          </MenuItem>
          <MenuItem id="rename" isDisabled={isDefault || isActive} className={itemClass}>
            <span aria-hidden="true" className="mr-2 inline-flex"><Pencil size={14} /></span>{m.profile_rename()}
          </MenuItem>
          <MenuItem id="delete" isDisabled={isDefault || isActive} className={`${itemClass} text-red-400 forced-colors:text-[CanvasText]`}>
            <span aria-hidden="true" className="mr-2 inline-flex"><Trash2 size={14} /></span>{m.profile_delete()}
          </MenuItem>
          <Separator className="my-1 border-t border-slate-700" />
          <MenuItem id="export" className={itemClass}>
            <span aria-hidden="true" className="mr-2 inline-flex"><Upload size={14} /></span>{m.profile_export()}
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
```

- [ ] **Step 4: Run both Task 3 and Task 4 tests**

Run: `pnpm vitest run src/components/profile/ProfileContextMenu.test.tsx src/components/profile/ProfileItem.test.tsx`
Expected: PASS for both. (If a menu-item test is flaky because the React Aria popover needs a tick, the `findAllByRole`/`findByRole` async queries already await it.)

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/ProfileContextMenu.tsx src/components/profile/ProfileContextMenu.test.tsx
git commit -m "feat(profile): add ProfileContextMenu mirroring StreamContextMenu"
```

---

## Task 5: Rewrite `ProfileList` as a composite list

**Files:**
- Rewrite: `src/components/profile/ProfileList.tsx`
- Rewrite: `src/components/profile/ProfileList.test.tsx`

- [ ] **Step 1: Replace the test file**

Overwrite `src/components/profile/ProfileList.test.tsx` (the old `ListBox`/`option` assertions no longer apply):

```tsx
import { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import type { ProfileMeta } from "../../lib/tauri";
import { ProfileList, type ProfileListHandle } from "./ProfileList";

vi.mock("../../i18n/paraglide/runtime", () => ({ getLocale: () => "uk" }));
vi.mock("../../i18n/paraglide/messages", () => ({
  zone_profiles_list: () => "Список профілів",
  item_role_profile: () => "профіль",
  profile_active_badge: () => "активний",
  profile_row_actions: ({ name }: { name: string }) => `Дії для профілю ${name}`,
  profile_actions: ({ name }: { name: string }) => `Дії для ${name}`,
  profile_context_menu: () => "Контекстне меню профілю",
  profile_switch: () => "Перемкнутися",
  profile_duplicate: () => "Дублювати",
  profile_rename: () => "Перейменувати",
  profile_delete: () => "Видалити",
  profile_export: () => "Експортувати",
  profile_switch_named: ({ name }: { name: string }) => `Перемкнутися на ${name}`,
  profile_duplicate_named: ({ name }: { name: string }) => `Дублювати ${name}`,
  profile_rename_named: ({ name }: { name: string }) => `Перейменувати ${name}`,
  profile_delete_named: ({ name }: { name: string }) => `Видалити ${name}`,
  profile_export_named: ({ name }: { name: string }) => `Експортувати ${name}`,
  profile_stream_count_one: ({ count }: { count: number }) => `${count} потік`,
  profile_stream_count_few: ({ count }: { count: number }) => `${count} потоки`,
  profile_stream_count_many: ({ count }: { count: number }) => `${count} потоків`,
  profile_stream_count_other: ({ count }: { count: number }) => `${count} потоки`,
}));

const profiles: ProfileMeta[] = [
  { name: "Default", streamCount: 2, isActive: true },
  { name: "Jazz", streamCount: 5, isActive: false },
  { name: "Rock", streamCount: 3, isActive: false },
];

function renderList(activeProfile = "Default", handlers = {}) {
  const ref = createRef<ProfileListHandle>();
  const h = {
    onSwitch: vi.fn(), onDuplicate: vi.fn(), onRename: vi.fn(),
    onDelete: vi.fn(), onExport: vi.fn(), exitZone: vi.fn(), ...handlers,
  };
  const utils = render(
    <ProfileList ref={ref} profiles={profiles} activeProfile={activeProfile} {...h} />,
  );
  return { ref, ...h, ...utils };
}

const activeAttrs = () => ({
  id: document.activeElement?.getAttribute("data-item-id") ?? null,
  seg: document.activeElement?.getAttribute("data-segment") ?? null,
});

beforeEach(() => vi.clearAllMocks());

describe("ProfileList — composite navigation", () => {
  it("renders one row per profile, each described as a profile", () => {
    const { container } = renderList();
    const rows = container.querySelectorAll('li[data-segment="summary"]');
    expect(rows).toHaveLength(3);
    rows.forEach((li) => expect(li.getAttribute("aria-roledescription")).toBe("профіль"));
  });

  it("exposes the list as an application region", () => {
    const { container } = renderList();
    const ul = container.querySelector("ul")!;
    expect(ul.getAttribute("role")).toBe("application");
    expect(ul.getAttribute("data-zone-id")).toBe("profiles-list");
    expect(ul.getAttribute("aria-label")).toBe("Список профілів");
  });

  it("focuses the first row on entry; ArrowDown moves to the next row", () => {
    const { ref } = renderList();
    act(() => ref.current!.focus("forward"));
    expect(activeAttrs()).toEqual({ id: "Default", seg: "summary" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(activeAttrs()).toEqual({ id: "Jazz", seg: "summary" });
  });

  it("Right drills into enabled segments, skipping disabled actions on the active row", () => {
    const { ref } = renderList();
    act(() => ref.current!.focus("forward")); // Default (active) summary
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    // Default is active → no switch; first stop is duplicate.
    expect(activeAttrs()).toEqual({ id: "Default", seg: "action-duplicate" });
  });

  it("Enter on a row summary triggers onSwitch with the row name", () => {
    const { ref, onSwitch } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" }); // Jazz
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onSwitch).toHaveBeenCalledWith("Jazz");
  });

  it("Delete key triggers onDelete with the row name", () => {
    const { ref, onDelete } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" }); // Jazz
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    expect(onDelete).toHaveBeenCalledWith("Jazz");
  });

  it("Tab exits the zone forward", () => {
    const { ref, exitZone } = renderList();
    act(() => ref.current!.focus("forward"));
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(exitZone).toHaveBeenCalledWith(true);
  });

  it("focusProfile(name) moves focus to that row's summary", () => {
    const { ref } = renderList();
    act(() => ref.current!.focusProfile("Rock"));
    expect(activeAttrs()).toEqual({ id: "Rock", seg: "summary" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/profile/ProfileList.test.tsx`
Expected: FAIL — old `ProfileList` has no `activeProfile`/handler props and no `focusProfile`; assertions about `role="application"` fail.

- [ ] **Step 3: Replace `ProfileList.tsx`**

Overwrite `src/components/profile/ProfileList.tsx`:

```tsx
import { forwardRef, useImperativeHandle, useMemo } from "react";
import { useCompositeList } from "../../hooks/useCompositeList";
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

  const { listRef, onKeyDownCapture, isFocused, restoreFocus, focusItem, activeItemId } =
    useCompositeList({
      zoneId: "profiles-list",
      items,
      onTabOut: exitZone,
      onAction: (type, itemId, segment) => {
        if (type === "delete") { onDelete(itemId); return; }
        if (type === "contextMenu") {
          const btn = listRef.current?.querySelector<HTMLButtonElement>(
            `[data-item-id="${CSS.escape(itemId)}"][data-context-menu-trigger]`,
          );
          btn?.click();
          return;
        }
        // Enter/Space on the whole-row summary switches to that profile. The panel
        // decides whether it is already active and announces accordingly.
        if ((type === "primary" || type === "toggle") && segment === "summary") {
          onSwitch(itemId);
        }
      },
    });

  useImperativeHandle(ref, () => ({
    id: "profiles-list",
    get el() { return listRef.current!; },
    focus: restoreFocus,
    focusProfile: (name: string) => focusItem(name, "summary"),
  }), [restoreFocus, focusItem]);

  return (
    <ul
      ref={listRef}
      data-zone-id="profiles-list"
      aria-label={m.zone_profiles_list()}
      role="application"
      className="flex-1 overflow-y-auto overflow-x-hidden"
      onKeyDownCapture={onKeyDownCapture}
    >
      {profiles.map((p) => (
        <ProfileItem
          key={p.name}
          profile={p}
          activeProfile={activeProfile}
          isActiveRow={activeItemId === p.name}
          isFocused={(seg) => isFocused(p.name, seg)}
          onSwitch={onSwitch}
          onDuplicate={onDuplicate}
          onRename={onRename}
          onDelete={onDelete}
          onExport={onExport}
        />
      ))}
    </ul>
  );
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/components/profile/ProfileList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/ProfileList.tsx src/components/profile/ProfileList.test.tsx
git commit -m "feat(profile): rewrite ProfileList as composite list with inline actions"
```

---

## Task 6: Update `ProfilesPanel` (drop actions zone, name-scoped handlers)

**Files:**
- Modify: `src/components/profile/ProfilesPanel.tsx`
- Modify: `src/components/profile/ProfilesPanel.test.tsx`
- Delete: `src/components/profile/ProfileActions.tsx`, `src/components/profile/ProfileActions.test.tsx`

- [ ] **Step 1: Update the panel test**

In `src/components/profile/ProfilesPanel.test.tsx`:

(a) In the `vi.mock("../../i18n/paraglide/messages", ...)` object, **remove** `profile_actions_label`, `profile_group_profile`, `profile_group_file`, `profile_list_label`, and **add**:

```ts
  zone_profiles_list: () => "Profiles list",
  item_role_profile: () => "profile",
  profile_already_active: () => "Profile is already active",
  profile_actions: ({ name }: { name: string }) => `Actions for ${name}`,
  profile_context_menu: () => "Profile context menu",
  profile_row_actions: ({ name }: { name: string }) => `Actions for profile ${name}`,
  profile_switch_named: ({ name }: { name: string }) => `Switch to ${name}`,
  profile_duplicate_named: ({ name }: { name: string }) => `Duplicate ${name}`,
  profile_rename_named: ({ name }: { name: string }) => `Rename ${name}`,
  profile_delete_named: ({ name }: { name: string }) => `Delete ${name}`,
  profile_export_named: ({ name }: { name: string }) => `Export ${name}`,
```

(b) Replace the "registers three zones" test with:

```tsx
  it("registers two zones via onZonesChange (no actions sidebar)", () => {
    const onZonesChange = vi.fn();
    render(<ProfilesPanel onZonesChange={onZonesChange} exitZone={() => {}} />);
    const zones = onZonesChange.mock.calls.at(-1)![0] as { id: string }[];
    expect(zones.map((z) => z.id)).toEqual(["profiles-toolbar", "profiles-list"]);
  });
```

(c) Replace the two focus tests ("returns focus to the selected profile after Switch" and "returns focus to Default after Delete") and the export test — they used `getByRole("option")` and a sidebar `Switch` button. Use inline buttons + row labels instead:

```tsx
  it("switches to a profile via its inline Switch button", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("button", { name: "Switch to Jazz" }));
    await waitFor(() => expect(tauri.switchProfile).toHaveBeenCalledWith("Jazz"));
  });

  it("announces 'already active' for Enter on the active row (no switch)", async () => {
    renderPanel();
    await screen.findByText("Default");
    const row = document.querySelector('li[data-item-id="Default"]') as HTMLElement;
    row.focus();
    fireEvent.keyDown(row, { key: "Enter" });
    await waitFor(() => expect($announcer.get().message).toBe("Profile is already active"));
    expect(tauri.switchProfile).not.toHaveBeenCalled();
  });

  it("deletes a profile via its inline Delete button + confirm", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("button", { name: "Delete Jazz" }));
    await screen.findByText("Delete Jazz?");
    await user.click(screen.getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => expect(tauri.deleteProfile).toHaveBeenCalledWith("Jazz"));
  });

  it("announces after a successful export via the inline Export button", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("button", { name: "Export Jazz" }));
    await waitFor(() => expect($announcer.get().message).toBe("Exported Jazz"));
  });
```

(d) Add `fireEvent` to the testing-library import and `tauri` to imports:

```tsx
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import * as tauri from "../../lib/tauri";
```

(e) The "renders the screen region and both profiles" and "has New and Import in the toolbar" tests still pass as-is (they don't use `option`). Add `renameProfile` and `duplicateProfile` to the `vi.mock("../../lib/tauri", ...)` object so the panel's imports resolve:

```ts
  renameProfile: vi.fn(async (_old: string, name: string) => ({ name, streamCount: 0, isActive: false })),
  duplicateProfile: vi.fn(async (_src: string, name: string) => ({ name, streamCount: 0, isActive: false })),
```

- [ ] **Step 2: Run the panel test to verify it fails**

Run: `pnpm vitest run src/components/profile/ProfilesPanel.test.tsx`
Expected: FAIL — current panel registers 3 zones and renders `option`s / a sidebar Switch button.

- [ ] **Step 3: Rewrite `ProfilesPanel.tsx`**

Overwrite `src/components/profile/ProfilesPanel.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import { $profileList } from "../../stores/profileManager";
import { $settings } from "../../stores/settings";
import { $commandPaletteOpen } from "../../stores/navigation";
import { ProfileList, type ProfileListHandle } from "./ProfileList";
import { ProfileNameDialog } from "./ProfileNameDialog";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { useAnnounce } from "../../hooks/useAnnounce";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as tauri from "../../lib/tauri";
import type { ImportPreview } from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

type SubDialog =
  | null
  | { type: "create" }
  | { type: "rename" }
  | { type: "duplicate" }
  | { type: "delete" }
  | { type: "switch-confirm" }
  | { type: "import"; preview: ImportPreview };

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

export function ProfilesPanel({ onZonesChange, exitZone }: Props) {
  const profiles = useStore($profileList);
  const settings = useStore($settings);
  const activeProfile = settings?.activeProfile ?? "Default";
  const announce = useAnnounce();

  // `target` is the profile a dialog currently operates on (rename/duplicate/delete/switch-confirm).
  const [target, setTarget] = useState(activeProfile);
  const [subDialog, setSubDialog] = useState<SubDialog>(null);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const listRef = useRef<ProfileListHandle>(null);

  useEffect(() => {
    tauri.listProfiles()
      .then((list) => $profileList.set(list))
      .catch((e) => addToast(String(e), "error"));
  }, [activeProfile]);

  const refreshList = async () => {
    const list = await tauri.listProfiles();
    $profileList.set(list);
  };

  // Focus helpers — rAF lets the list re-render with refreshed data (and the
  // updated focusProfile closure) before we move focus.
  const refocusProfile = (name: string) =>
    requestAnimationFrame(() => listRef.current?.focusProfile(name));
  const refocusList = () =>
    requestAnimationFrame(() => listRef.current?.focus("forward"));

  const handleError = (e: unknown) => {
    const msg = String(e);
    if (msg.startsWith("Conflict:") || msg.startsWith("InvalidName:")) {
      setNameError(msg.replace(/^(Conflict|InvalidName): /, ""));
    } else {
      addToast(msg, "error");
    }
  };

  // ── Switch (inline button / context menu / Enter on row summary) ──
  const handleSwitch = async (name: string) => {
    if (name === activeProfile) { announce(m.profile_already_active()); return; }
    setTarget(name);
    try {
      const statuses = await tauri.getAllStatuses?.() ?? [];
      const hasRecordings = statuses.some((s) => s.state === "recording");
      if (hasRecordings) { setSubDialog({ type: "switch-confirm" }); return; }
      doSwitch(name);
    } catch (e) { addToast(String(e), "error"); }
  };

  const doSwitch = async (name: string) => {
    setBusy(true);
    try {
      await tauri.switchProfile(name);
      await refreshList();
      announce(m.profile_switch() + ": " + name);
      setSubDialog(null);
      refocusProfile(name);
    } catch (e) { addToast(String(e), "error"); } finally { setBusy(false); }
  };

  const handleCreate = async () => {
    setNameError(null); setBusy(true);
    try {
      const meta = await tauri.createProfile(nameInput.trim());
      await refreshList();
      announce(m.profile_create() + ": " + meta.name);
      setSubDialog(null); setNameInput("");
      refocusProfile(meta.name);
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const handleRename = async () => {
    setNameError(null); setBusy(true);
    try {
      const meta = await tauri.renameProfile(target, nameInput.trim());
      await refreshList();
      announce(m.profile_rename() + ": " + meta.name);
      setSubDialog(null); setNameInput("");
      refocusProfile(meta.name);
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const handleDuplicate = async () => {
    setNameError(null); setBusy(true);
    try {
      const meta = await tauri.duplicateProfile(target, nameInput.trim());
      await refreshList();
      announce(m.profile_duplicate() + ": " + meta.name);
      setSubDialog(null); setNameInput("");
      refocusProfile(meta.name);
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await tauri.deleteProfile(target);
      await refreshList();
      announce(m.profile_delete() + ": " + target);
      setSubDialog(null);
      refocusList();
    } catch (e) { addToast(String(e), "error"); } finally { setBusy(false); }
  };

  const handleExport = async (name: string) => {
    setBusy(true);
    try {
      await tauri.exportProfile(name);
      announce(m.profile_exported_announcement({ name }));
    } catch (e) { addToast(String(e), "error"); } finally { setBusy(false); }
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const preview = await tauri.beginImport();
      if (!preview) return;
      setNameInput(preview.suggestedName);
      setNameError(preview.hasConflict ? m.profile_conflict_error() : null);
      setSubDialog({ type: "import", preview });
    } catch (e) { addToast(String(e), "error"); } finally { setBusy(false); }
  };

  const handleCommitImport = async () => {
    if (!subDialog || subDialog.type !== "import") return;
    setNameError(null); setBusy(true);
    try {
      const meta = await tauri.commitImport(subDialog.preview.profileJson, nameInput.trim());
      await refreshList();
      announce(m.profile_import() + ": " + meta.name);
      setSubDialog(null); setNameInput("");
      refocusProfile(meta.name);
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  // ── Toolbar zone (3 items) ──
  const toolbarZoneRef = useRef<HTMLDivElement | null>(null);
  const cmdBtn = useRef<HTMLButtonElement | null>(null);
  const newBtn = useRef<HTMLButtonElement | null>(null);
  const importBtn = useRef<HTMLButtonElement | null>(null);
  const toolbarRefs = useMemo(() => [cmdBtn, newBtn, importBtn], []);
  const {
    onKeyDown: toolbarKeyDown,
    getTabIndex: toolbarTabIndex,
    restoreFocus: toolbarRestore,
  } = useRovingFocus(toolbarRefs, "horizontal", {
    mode: "mixed-boundary-handoff",
    onTabBoundary: (forward) => exitZone("profiles-toolbar", forward),
  });

  // ── Zone registration (toolbar + list) ──
  useEffect(() => {
    const toolbarZone: ZoneEntry = {
      id: "profiles-toolbar",
      get el() { return toolbarZoneRef.current!; },
      focus: toolbarRestore,
    };
    const listZone: ZoneEntry = {
      id: "profiles-list",
      get el() { return listRef.current?.el!; },
      focus: (dir) => listRef.current?.focus(dir),
    };
    onZonesChange([toolbarZone, listZone]);
  // onZonesChange must be a stable reference from the caller.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolbarRestore]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden" role="region" aria-label={m.profile_name()}>
      {/* ── Toolbar zone ── */}
      <div
        ref={toolbarZoneRef}
        data-zone-id="profiles-toolbar"
        role="application"
        aria-label={m.zone_profiles_toolbar()}
        className="border-b border-slate-700 forced-colors:border-[ButtonText]"
        onKeyDown={toolbarKeyDown}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-base font-semibold text-slate-100">{m.profile_name()}</h1>
          <div className="flex items-center gap-2">
            <button
              ref={cmdBtn}
              tabIndex={toolbarTabIndex(0)}
              aria-label={m.command_palette_label()}
              onClick={() => $commandPaletteOpen.set(true)}
              className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.commands_label()}
            </button>
            <button
              ref={newBtn}
              tabIndex={toolbarTabIndex(1)}
              onClick={() => { setNameInput(""); setNameError(null); setSubDialog({ type: "create" }); }}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:border forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]"
            >
              {m.profile_create()}
            </button>
            <button
              ref={importBtn}
              tabIndex={toolbarTabIndex(2)}
              onClick={handleImport}
              className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              {m.profile_import()}
            </button>
          </div>
        </div>
      </div>

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

      {/* ── Sub-dialogs (single level, portalled) ── */}
      {(subDialog?.type === "create" || subDialog?.type === "rename" ||
        subDialog?.type === "duplicate" || subDialog?.type === "import") && createPortal(
        <ProfileNameDialog
          title={
            subDialog.type === "create" ? m.profile_create()
            : subDialog.type === "rename" ? m.profile_rename()
            : subDialog.type === "duplicate" ? m.profile_duplicate()
            : m.profile_import()
          }
          value={nameInput}
          error={nameError}
          busy={busy}
          onChange={(v) => { setNameInput(v); setNameError(null); }}
          onConfirm={() => {
            if (subDialog.type === "create") handleCreate();
            else if (subDialog.type === "rename") handleRename();
            else if (subDialog.type === "duplicate") handleDuplicate();
            else handleCommitImport();
          }}
          onCancel={() => { setSubDialog(null); setNameInput(""); }}
        />,
        document.body,
      )}

      {subDialog?.type === "delete" && createPortal(
        <ConfirmDialog
          title={m.profile_delete()}
          message={m.profile_delete_confirm({ name: target })}
          confirmLabel={m.profile_delete()}
          onConfirm={handleDelete}
          onCancel={() => setSubDialog(null)}
        />,
        document.body,
      )}

      {subDialog?.type === "switch-confirm" && createPortal(
        <ConfirmDialog
          title={m.profile_switch()}
          message={m.profile_switch_confirm({ name: target })}
          confirmLabel={m.profile_switch()}
          onConfirm={() => doSwitch(target)}
          onCancel={() => setSubDialog(null)}
        />,
        document.body,
      )}
    </div>
  );
}
```

- [ ] **Step 4: Delete `ProfileActions`**

```bash
git rm src/components/profile/ProfileActions.tsx src/components/profile/ProfileActions.test.tsx
```

- [ ] **Step 5: Run the panel test to verify it passes**

Run: `pnpm vitest run src/components/profile/ProfilesPanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/profile/ProfilesPanel.tsx src/components/profile/ProfilesPanel.test.tsx
git commit -m "feat(profile): drop actions sidebar, wire panel to composite list"
```

---

## Task 7: Remove orphaned messages + full verification

**Files:**
- Modify: `src/i18n/messages/uk.json`, `src/i18n/messages/en.json`

- [ ] **Step 1: Confirm the orphaned keys have no remaining consumers**

Run: `pnpm exec rg -n "profile_list_label|profile_actions_label|profile_group_profile|profile_group_file" src`
Expected: only matches inside `src/i18n/messages/*.json` and the generated `src/i18n/paraglide/` output — no `.tsx`/`.ts` source references. (If a test still references one, fix that test first.)

- [ ] **Step 2: Remove the four orphaned keys**

Delete these lines from **both** `uk.json` and `en.json`:

```
"profile_list_label": ...,
"profile_actions_label": ...,
"profile_group_profile": ...,
"profile_group_file": ...,
```

Ensure the surrounding JSON remains valid (no dangling commas).

- [ ] **Step 3: Regenerate Paraglide**

Run: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/i18n/paraglide`
Expected: completes without error.

- [ ] **Step 4: Full typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS. No references to removed `m.profile_list_label` / `m.profile_actions_label` / `m.profile_group_*`.

- [ ] **Step 5: Full test suite**

Run: `pnpm test`
Expected: PASS — all profile tests plus the untouched streams/other suites.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/messages/uk.json src/i18n/messages/en.json src/i18n/paraglide
git commit -m "chore(i18n): remove profile messages orphaned by the navigation refactor"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- 2 tab-stops (toolbar + list) → Tasks 5–6 (toolbar unchanged; list is the composite zone).
- Custom list via `useCompositeList`, replacing `ListBox` → Tasks 2, 5.
- Row = summary + 5 buttons (Switch/Duplicate/Rename/Delete/Export), icon-only with `aria-label` → Task 3.
- Enter on summary switches; already-active announcement → Tasks 5 (`onAction`), 6 (`handleSwitch`).
- Switch disabled on active; Rename/Delete disabled for Default/active (omitted as stops) → `getProfileSegments`, Task 3.
- `CheckCircle` icon (aria-hidden), state via row `aria-label` → Task 3.
- Context menu (RMB / Menu key), 5 actions, disabled greyed → Tasks 4, 5.
- Remove `ProfileActions` sidebar + replace `ProfileList` → Tasks 5, 6.
- a11y: `role="application"`/`listitem`, composed `aria-label`, action `role="group"`, `aria-roledescription` → Tasks 3, 5.

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `ProfileSegment` members ⊆ `SegmentKind` (Task 2 adds `action-switch`/`action-duplicate`/`action-rename`/`action-export`; `action-delete`/`action-menu` pre-exist). `getProfileSegments(profile, activeProfile)`, `focusItem(itemId, segment?)`, `focusProfile(name)`, and `ProfileListHandle extends ZoneEntry` are used identically across Tasks 2/3/5/6. Handler signatures `(name: string) => void` are consistent panel → list → item.
