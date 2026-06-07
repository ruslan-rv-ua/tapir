# Webview Shortcut Dispatch + F1 Help — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `Alt+0..5` section navigation, `Ctrl+N`→Add Stream (on Streams), and an `F1` keyboard-shortcuts help dialog, all driven by two pure registries so the dispatch, the KeyRecorder reserved-guard, and the help screen share one source of truth.

**Architecture:** Two pure lib modules — `sections.ts` (section order/digit/disabled) and `shortcuts.ts` (named-combo registry + a pure `matchShortcut`). The `App.tsx` window listener collapses to `matchShortcut(e, ctx) → hit.run(actions)`. `reservedShortcuts.ts` and a new `KeyboardShortcutsDialog` both derive from `shortcuts.ts`. `ActivityBar` consumes `sections.ts`.

**Tech Stack:** React 19, nanostores, react-aria-components, paraglide i18n (compiled by the Vite plugin), Vitest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-06-07-webview-shortcut-dispatch-and-help-design.md](../specs/2026-06-07-webview-shortcut-dispatch-and-help-design.md)

**Conventions (from the codebase, do not violate):**
- Match physical keys with `e.code`, never `e.key` (Cyrillic layouts) — [accessibility.md §12](../../accessibility.md).
- New i18n keys go in **both** `src/i18n/messages/en.json` and `uk.json`, then regenerate with `pnpm vite:build`.
- `pnpm test` (Vitest) and `pnpm vite:build` are the gates. `tsc` has ~51 pre-existing paraglide errors — **not** a gate.
- Run a single test file with `pnpm test <path>` (Vitest treats the trailing arg as a filename filter).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/sections.ts` (create) | Section metadata: id, label, digit, disabled — single source | 2 |
| `src/lib/sections.test.ts` (create) | Digit/order/disabled invariants | 2 |
| `src/lib/shortcuts.ts` (create) | Named-combo registry + pure `matchShortcut` + types | 3 |
| `src/lib/shortcuts.test.ts` (create) | Matching, context gates, `e.code` safety, run-mapping | 3 |
| `src/stores/navigation.ts` (modify) | Add `$shortcutsHelpOpen` atom | 4 |
| `src/App.tsx` (modify) | Listener → `matchShortcut`; render help dialog | 4, 6 |
| `src/lib/reservedShortcuts.ts` (modify) | Derive `RESERVED_WEBVIEW_COMBOS` from `SHORTCUTS` | 5 |
| `src/lib/reservedShortcuts.test.ts` (modify) | Expect derived set incl. `F1` | 5 |
| `src/components/common/KeyboardShortcutsDialog.tsx` (create) | F1 modal, groups rendered from `SHORTCUTS` | 6 |
| `src/components/common/KeyboardShortcutsDialog.test.tsx` (create) | Open/closed + grouped rows | 6 |
| `src/components/layout/ActivityBar.tsx` (modify) | Consume shared `SECTIONS`; icons/phase stay local | 7 |
| `src/i18n/messages/{en,uk}.json` (modify) | 6 new keys | 1 |
| `docs/keyboard-shortcuts*.md`, ADRs (modify) | Flip ⬜→✅, record single-source | 8 |

---

## Task 1: i18n keys for the help dialog

**Files:**
- Modify: `src/i18n/messages/en.json`
- Modify: `src/i18n/messages/uk.json`

- [ ] **Step 1: Add the 6 keys to `en.json`**

Insert these lines immediately after the `"app_name": "Tapir",` line (line 2):

```json
  "shortcuts_help_title": "Keyboard shortcuts",
  "shortcuts_help_action": "Keyboard shortcuts help",
  "shortcuts_group_global": "Global",
  "shortcuts_group_navigation": "Navigation",
  "shortcuts_group_context": "Context",
  "shortcuts_group_list": "Lists",
```

- [ ] **Step 2: Add the same 6 keys to `uk.json`**

Insert immediately after the first `"app_name"` entry in `uk.json`:

```json
  "shortcuts_help_title": "Гарячі клавіші",
  "shortcuts_help_action": "Довідник гарячих клавіш",
  "shortcuts_group_global": "Глобальні",
  "shortcuts_group_navigation": "Навігація",
  "shortcuts_group_context": "Контекстні",
  "shortcuts_group_list": "Списки",
```

- [ ] **Step 3: Regenerate paraglide messages**

Run: `pnpm vite:build`
Expected: build completes with `✓ built in …` (the Vite paraglide plugin rewrites `src/i18n/paraglide`).

- [ ] **Step 4: Verify the new messages compiled**

Run: `rg "shortcuts_help_title|shortcuts_group_global" src/i18n/paraglide`
Expected: at least one match in the generated output (proves the keys are now callable as `m.shortcuts_help_title()` etc.).

- [ ] **Step 5: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/uk.json src/i18n/paraglide
git commit -m "i18n(shortcuts): keys for keyboard-shortcuts help dialog

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `sections.ts` — shared section registry

**Files:**
- Create: `src/lib/sections.ts`
- Test: `src/lib/sections.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/sections.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SECTIONS } from "./sections";

describe("SECTIONS", () => {
  it("assigns digits 0..5 in array order with no gaps or dupes", () => {
    expect(SECTIONS.map((s) => s.digit)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("each entry's array index equals its digit (index lookup is safe)", () => {
    SECTIONS.forEach((s, i) => expect(s.digit).toBe(i));
  });

  it("marks only Schedule as disabled", () => {
    expect(SECTIONS.filter((s) => s.disabled).map((s) => s.id)).toEqual(["schedule"]);
  });

  it("orders profiles first, then streams..songs", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual([
      "profiles", "streams", "browser", "wishlist", "schedule", "songs",
    ]);
  });

  it("every label getter returns a non-empty string", () => {
    for (const s of SECTIONS) expect(s.label().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/sections.test.ts`
Expected: FAIL — cannot resolve `./sections`.

- [ ] **Step 3: Create `src/lib/sections.ts`**

```ts
import type { Section } from "../stores/navigation";
import * as m from "../i18n/paraglide/messages";

export interface SectionMeta {
  /** Logical section id (matches `$activeSection`). */
  id: Section;
  /** i18n label getter — read at call time so it follows the active locale. */
  label: () => string;
  /** Alt+<digit> shortcut. Array index equals digit by construction. */
  digit: number;
  /** True while the section is not yet shippable (Schedule until Phase 3D). */
  disabled?: boolean;
}

/**
 * Single source of truth for section order, digits, and disabled state.
 * Consumed by the Alt+digit dispatch (shortcuts.ts), ActivityBar, and the F1
 * help dialog. Profiles is digit 0 (rendered separately at the top of the
 * ActivityBar); streams..songs are 1..5. Icons/phase live in ActivityBar —
 * presentation does not belong in a lib.
 */
export const SECTIONS: readonly SectionMeta[] = [
  { id: "profiles", label: m.profiles_section, digit: 0 },
  { id: "streams", label: m.streams_section, digit: 1 },
  { id: "browser", label: m.browser_section, digit: 2 },
  { id: "wishlist", label: m.wishlist_section, digit: 3 },
  { id: "schedule", label: m.schedule_section, digit: 4, disabled: true },
  { id: "songs", label: m.songs_section, digit: 5 },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/sections.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sections.ts src/lib/sections.test.ts
git commit -m "feat(shortcuts): shared SECTIONS registry (order/digit/disabled)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `shortcuts.ts` — registry + pure `matchShortcut`

**Files:**
- Create: `src/lib/shortcuts.ts`
- Test: `src/lib/shortcuts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/shortcuts.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { Section } from "../stores/navigation";
import { matchShortcut, SHORTCUTS, type ShortcutActions, type ShortcutCtx } from "./shortcuts";

// Synthetic event: matchShortcut only reads code + the four modifier flags.
const ev = (
  code: string,
  mods: Partial<Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">> = {},
): KeyboardEvent =>
  ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods }) as KeyboardEvent;

const ctx = (activeSection: Section): ShortcutCtx => ({ activeSection });

const makeActions = (): ShortcutActions => ({
  setSection: vi.fn(),
  toggleCommandPalette: vi.fn(),
  toggleSettings: vi.fn(),
  openAddStream: vi.fn(),
  openHelp: vi.fn(),
});

describe("matchShortcut — matching", () => {
  it("matches Ctrl+K → command-palette", () => {
    expect(matchShortcut(ev("KeyK", { ctrlKey: true }), ctx("streams"))?.id).toBe("command-palette");
  });

  it("matches Meta+K too (macOS-style)", () => {
    expect(matchShortcut(ev("KeyK", { metaKey: true }), ctx("streams"))?.id).toBe("command-palette");
  });

  it("matches Ctrl+, → settings", () => {
    expect(matchShortcut(ev("Comma", { ctrlKey: true }), ctx("streams"))?.id).toBe("settings");
  });

  it("matches F1 → help", () => {
    expect(matchShortcut(ev("F1"), ctx("streams"))?.id).toBe("help");
  });

  it("maps Alt+digit to the right section", () => {
    expect(matchShortcut(ev("Digit0", { altKey: true }), ctx("streams"))?.id).toBe("section:profiles");
    expect(matchShortcut(ev("Digit1", { altKey: true }), ctx("songs"))?.id).toBe("section:streams");
    expect(matchShortcut(ev("Digit5", { altKey: true }), ctx("streams"))?.id).toBe("section:songs");
  });

  it("ignores Alt+4 because Schedule is disabled", () => {
    expect(matchShortcut(ev("Digit4", { altKey: true }), ctx("streams"))).toBeNull();
  });

  it("matches Ctrl+N only on the streams section", () => {
    expect(matchShortcut(ev("KeyN", { ctrlKey: true }), ctx("streams"))?.id).toBe("new:streams");
    expect(matchShortcut(ev("KeyN", { ctrlKey: true }), ctx("songs"))).toBeNull();
  });

  it("is e.code-based, so it works on a Cyrillic layout", () => {
    // Physical N yields key "т" on Cyrillic, but e.code stays "KeyN".
    const cyrillic = { code: "KeyN", key: "т", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false } as KeyboardEvent;
    expect(matchShortcut(cyrillic, ctx("streams"))?.id).toBe("new:streams");
  });

  it("requires exact modifiers (Ctrl+Alt+1 is not a section shortcut)", () => {
    expect(matchShortcut(ev("Digit1", { altKey: true, ctrlKey: true }), ctx("streams"))).toBeNull();
  });

  it("does not match the numpad (Alt+Numpad is a Windows alt-code)", () => {
    expect(matchShortcut(ev("Numpad1", { altKey: true }), ctx("streams"))).toBeNull();
  });

  it("returns null for an unbound combo", () => {
    expect(matchShortcut(ev("KeyJ", { ctrlKey: true, shiftKey: true }), ctx("streams"))).toBeNull();
  });
});

describe("matchShortcut — run mapping", () => {
  it("Ctrl+K runs toggleCommandPalette", () => {
    const a = makeActions();
    const c = ctx("streams");
    matchShortcut(ev("KeyK", { ctrlKey: true }), c)!.run!(a, c);
    expect(a.toggleCommandPalette).toHaveBeenCalledOnce();
  });

  it("Alt+1 runs setSection('streams')", () => {
    const a = makeActions();
    const c = ctx("songs");
    matchShortcut(ev("Digit1", { altKey: true }), c)!.run!(a, c);
    expect(a.setSection).toHaveBeenCalledWith("streams");
  });

  it("Ctrl+N runs openAddStream", () => {
    const a = makeActions();
    const c = ctx("streams");
    matchShortcut(ev("KeyN", { ctrlKey: true }), c)!.run!(a, c);
    expect(a.openAddStream).toHaveBeenCalledOnce();
  });

  it("F1 runs openHelp", () => {
    const a = makeActions();
    const c = ctx("streams");
    matchShortcut(ev("F1"), c)!.run!(a, c);
    expect(a.openHelp).toHaveBeenCalledOnce();
  });
});

describe("SHORTCUTS — registry shape", () => {
  it("every entry has a unique id and a non-empty combo + label", () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SHORTCUTS) {
      expect(s.combo.length).toBeGreaterThan(0);
      expect(s.label().length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/shortcuts.test.ts`
Expected: FAIL — cannot resolve `./shortcuts`.

- [ ] **Step 3: Create `src/lib/shortcuts.ts`**

```ts
import type { Section } from "../stores/navigation";
import * as m from "../i18n/paraglide/messages";
import { SECTIONS } from "./sections";

export type ShortcutGroup = "global" | "navigation" | "context" | "list";

export interface ShortcutCtx {
  activeSection: Section;
}

/** Side effects injected into `run` so the registry itself stays pure. */
export interface ShortcutActions {
  setSection: (s: Section) => void;
  toggleCommandPalette: () => void;
  toggleSettings: () => void;
  openAddStream: () => void;
  openHelp: () => void;
}

export interface Shortcut {
  /** Stable action id, e.g. "section:streams". */
  id: string;
  /** Canonical accelerator string ("Ctrl+K", "Alt+1", "F1") — also the help label. */
  combo: string;
  /** i18n label getter. */
  label: () => string;
  /** Grouping in the F1 help dialog. */
  group: ShortcutGroup;
  /** Present ⇒ included in RESERVED_WEBVIEW_COMBOS (KeyRecorder guard). */
  reserved?: boolean;
  /** Present ⇒ dispatched centrally by the App.tsx listener. */
  match?: (e: KeyboardEvent) => boolean;
  /** Context gate (active section / disabled). */
  when?: (ctx: ShortcutCtx) => boolean;
  /** Effect, run with injected actions. */
  run?: (a: ShortcutActions, ctx: ShortcutCtx) => void;
}

// Ctrl OR Meta, and no other modifier. e.code matches the physical key so
// Cyrillic layouts still work (accessibility.md §12).
const ctrlOrMeta = (e: KeyboardEvent): boolean =>
  (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;

// One section-nav shortcut per section, generated so the digit↔section mapping
// can never drift from SECTIONS. Disabled sections match nothing (when=false).
const sectionShortcuts: Shortcut[] = SECTIONS.map((s) => ({
  id: `section:${s.id}`,
  combo: `Alt+${s.digit}`,
  label: s.label,
  group: "navigation",
  reserved: true,
  match: (e) =>
    e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && e.code === `Digit${s.digit}`,
  when: () => !s.disabled,
  run: (a) => a.setSection(s.id),
}));

/**
 * Every named webview shortcut. Entries with `match` are dispatched centrally
 * (App.tsx); entries without (F6/Shift+F6/Shift+F10) are handled by their own
 * hooks but listed here so they appear in the F1 help and stay reserved against
 * the KeyRecorder. reservedShortcuts.ts and KeyboardShortcutsDialog derive from
 * this array, so keep it the single source of truth.
 */
export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: "command-palette",
    combo: "Ctrl+K",
    label: m.command_palette_label,
    group: "global",
    reserved: true,
    match: (e) => ctrlOrMeta(e) && e.code === "KeyK",
    run: (a) => a.toggleCommandPalette(),
  },
  {
    id: "settings",
    combo: "Ctrl+,",
    label: m.settings_title,
    group: "global",
    reserved: true,
    match: (e) => ctrlOrMeta(e) && e.code === "Comma",
    run: (a) => a.toggleSettings(),
  },
  {
    id: "help",
    combo: "F1",
    label: m.shortcuts_help_action,
    group: "global",
    reserved: true,
    match: (e) => !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && e.code === "F1",
    run: (a) => a.openHelp(),
  },
  ...sectionShortcuts,
  {
    id: "new:streams",
    combo: "Ctrl+N",
    label: m.add_stream,
    group: "context",
    reserved: true,
    match: (e) => ctrlOrMeta(e) && e.code === "KeyN",
    when: (ctx) => ctx.activeSection === "streams",
    run: (a) => a.openAddStream(),
  },
  // Tier 2′ — handled by their own hooks; here for help + reserved guard only.
  {
    id: "zone-nav",
    combo: "F6",
    label: m.settings_hotkey_action_zone_nav,
    group: "navigation",
    reserved: true,
  },
  {
    id: "zone-nav-back",
    combo: "Shift+F6",
    label: m.settings_hotkey_action_zone_nav,
    group: "navigation",
    reserved: true,
  },
  {
    id: "row-menu",
    combo: "Shift+F10",
    label: m.settings_hotkey_action_row_menu,
    group: "list",
    reserved: true,
  },
];

/**
 * Pure dispatch: first shortcut whose `match` fires and whose `when` (if any)
 * holds. e.repeat / focus guards live in the App.tsx listener, not here.
 */
export function matchShortcut(e: KeyboardEvent, ctx: ShortcutCtx): Shortcut | null {
  for (const s of SHORTCUTS) {
    if (!s.match || !s.match(e)) continue;
    if (s.when && !s.when(ctx)) continue;
    return s;
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/shortcuts.test.ts`
Expected: PASS (all matching, run-mapping, and shape tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shortcuts.ts src/lib/shortcuts.test.ts
git commit -m "feat(shortcuts): registry + pure matchShortcut dispatch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: store atom + App.tsx listener rewrite

**Files:**
- Modify: `src/stores/navigation.ts`
- Modify: `src/App.tsx:25-33` (imports) and `src/App.tsx:135-161` (the listener `useEffect`)

- [ ] **Step 1: Add the help store atom**

In `src/stores/navigation.ts`, add below `$commandPaletteOpen`:

```ts
export const $shortcutsHelpOpen = atom<boolean>(false);
```

- [ ] **Step 2: Add the new imports in `App.tsx`**

After the existing `import { shouldIgnoreShortcut } from "./lib/shortcutGuard";` line, add:

```ts
import { matchShortcut, type ShortcutActions } from "./lib/shortcuts";
```

Extend the navigation-store import to include the help atom:

```ts
import { $commandPaletteOpen, $shortcutsHelpOpen } from "./stores/navigation";
```

Extend the existing streams import (currently `import { $streams, updateStreamStatus } from "./stores/streams";` at `src/App.tsx:21`) to add the Add-Stream store — do **not** add a second import from the same module:

```ts
import { $streams, updateStreamStatus, $showAddStreamDialog } from "./stores/streams";
```

(`$activeSection`, `$settingsDialogOpen` are already imported.)

- [ ] **Step 3: Replace the listener `useEffect` body**

Replace the entire `useEffect` at `src/App.tsx:135-161` (the "Ctrl+K and Ctrl+, keyboard handlers" effect) with:

```ts
  // Tier-2 webview shortcuts — single dispatch through the shortcut registry.
  // matchShortcut is pure (src/lib/shortcuts.ts); side effects are injected here
  // as `actions`. Guards kept from KB-04/KB-06: drop key auto-repeat, and ignore
  // shortcuts while typing in a field or with a modal/recorder open.
  useEffect(() => {
    const actions: ShortcutActions = {
      setSection: (s) => $activeSection.set(s),
      toggleCommandPalette: () => $commandPaletteOpen.set(!$commandPaletteOpen.get()),
      toggleSettings: () => $settingsDialogOpen.set(!$settingsDialogOpen.get()),
      openAddStream: () => $showAddStreamDialog.set(true),
      openHelp: () => $shortcutsHelpOpen.set(true),
    };
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (shouldIgnoreShortcut()) return;
      const ctx = { activeSection: $activeSection.get() };
      const hit = matchShortcut(e, ctx);
      if (hit) {
        e.preventDefault();
        hit.run?.(actions, ctx);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
```

- [ ] **Step 4: Verify the suite stays green and the build passes**

Run: `pnpm test`
Expected: PASS — all existing tests, plus Tasks 2–3.

Run: `pnpm vite:build`
Expected: `✓ built` (confirms the App.tsx wiring type-checks under esbuild).

- [ ] **Step 5: Manual smoke (record in the commit body if run)**

Run `pnpm tauri dev`, then: `Ctrl+K` toggles the palette, `Ctrl+,` toggles settings, `Alt+2` switches to Browser, `Alt+4` does nothing (Schedule disabled), `Ctrl+N` on Streams opens Add Stream, `Ctrl+N` on Songs does nothing, `F1` sets the help store (no visible dialog yet — added in Task 6).

- [ ] **Step 6: Commit**

```bash
git add src/stores/navigation.ts src/App.tsx
git commit -m "feat(shortcuts): route App.tsx listener through matchShortcut + add help store

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: derive `reservedShortcuts` from the registry

**Files:**
- Modify: `src/lib/reservedShortcuts.test.ts`
- Modify: `src/lib/reservedShortcuts.ts`

- [ ] **Step 1: Update the order assertion to the derived set (test-first)**

In `src/lib/reservedShortcuts.test.ts`, replace the first `it(...)` block with:

```ts
  it("reserves exactly the registry's reserved combos, in registry order", () => {
    expect(RESERVED_WEBVIEW_COMBOS.map((r) => r.combo)).toEqual([
      "Ctrl+K", "Ctrl+,", "F1",
      "Alt+0", "Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5",
      "Ctrl+N",
      "F6", "Shift+F6", "Shift+F10",
    ]);
  });
```

(The other `it` blocks — `Ctrl+K`→`command_palette_label`, `Ctrl+N`→`add_stream`, the F6 family, free-combo null, exact-case — stay unchanged and must keep passing.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/reservedShortcuts.test.ts`
Expected: FAIL — the current hardcoded array lacks `F1` and uses a different order.

- [ ] **Step 3: Replace `src/lib/reservedShortcuts.ts` body with a derivation**

Keep the file's doc-comment intent, but replace the `import` + `RESERVED_WEBVIEW_COMBOS` definition with:

```ts
/**
 * Fixed (non-configurable) webview combos — Tier 2 + Tier 2′ — that Settings →
 * Hotkeys must refuse to assign (KB-09). Derived from the single shortcut
 * registry so the reserved list can never drift from the dispatch or the F1
 * help: an entry is reserved iff `shortcuts.ts` marks it `reserved`.
 */
import { SHORTCUTS } from "./shortcuts";

export const RESERVED_WEBVIEW_COMBOS: ReadonlyArray<{
  combo: string;
  label: () => string;
}> = SHORTCUTS.filter((s) => s.reserved).map(({ combo, label }) => ({ combo, label }));

/**
 * Returns the conflicting reserved entry's label getter, or null if `combo`
 * is free. Pure — exact string match against the canonical accelerator format.
 */
export function findReservedConflict(combo: string): (() => string) | null {
  const hit = RESERVED_WEBVIEW_COMBOS.find((r) => r.combo === combo);
  return hit ? hit.label : null;
}
```

(The `import * as m` line is no longer needed in this file — labels come from the registry. Remove it.)

- [ ] **Step 4: Run the reserved test and the HotkeysTab test**

Run: `pnpm test src/lib/reservedShortcuts.test.ts src/components/settings/HotkeysTab.test.tsx`
Expected: PASS — derived set matches; KeyRecorder guard behaviour unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reservedShortcuts.ts src/lib/reservedShortcuts.test.ts
git commit -m "refactor(shortcuts): derive reservedShortcuts from registry (+reserve F1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `KeyboardShortcutsDialog` (F1 help)

**Files:**
- Create: `src/components/common/KeyboardShortcutsDialog.tsx`
- Test: `src/components/common/KeyboardShortcutsDialog.test.tsx`
- Modify: `src/App.tsx` (render the dialog in `App()`)

- [ ] **Step 1: Write the failing test**

Create `src/components/common/KeyboardShortcutsDialog.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";
import { $shortcutsHelpOpen } from "../../stores/navigation";

beforeEach(() => $shortcutsHelpOpen.set(false));

describe("KeyboardShortcutsDialog", () => {
  it("renders nothing while closed", () => {
    render(<KeyboardShortcutsDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a representative combo from every group when open", () => {
    act(() => $shortcutsHelpOpen.set(true));
    render(<KeyboardShortcutsDialog />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Ctrl+K")).toBeTruthy();   // global
    expect(screen.getByText("Alt+1")).toBeTruthy();    // navigation
    expect(screen.getByText("Ctrl+N")).toBeTruthy();   // context
    expect(screen.getByText("Shift+F10")).toBeTruthy();// list
  });

  it("closes when the store flips to false", () => {
    act(() => $shortcutsHelpOpen.set(true));
    render(<KeyboardShortcutsDialog />);
    act(() => $shortcutsHelpOpen.set(false));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/components/common/KeyboardShortcutsDialog.test.tsx`
Expected: FAIL — cannot resolve `./KeyboardShortcutsDialog`.

- [ ] **Step 3: Create `src/components/common/KeyboardShortcutsDialog.tsx`**

```tsx
import { Dialog, Modal, ModalOverlay, Heading } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $shortcutsHelpOpen } from "../../stores/navigation";
import { SHORTCUTS, type ShortcutGroup } from "../../lib/shortcuts";
import * as m from "../../i18n/paraglide/messages";

const GROUP_ORDER: ShortcutGroup[] = ["global", "navigation", "context", "list"];

const GROUP_LABEL: Record<ShortcutGroup, () => string> = {
  global: m.shortcuts_group_global,
  navigation: m.shortcuts_group_navigation,
  context: m.shortcuts_group_context,
  list: m.shortcuts_group_list,
};

export function KeyboardShortcutsDialog() {
  const isOpen = useStore($shortcutsHelpOpen);
  if (!isOpen) return null;

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) $shortcutsHelpOpen.set(false);
      }}
      isDismissable
    >
      <Modal className="flex max-h-[80vh] w-[90vw] max-w-lg flex-col rounded-lg bg-slate-800 shadow-2xl outline-none">
        <Dialog aria-label={m.shortcuts_help_title()} className="flex h-full flex-col outline-none">
          <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
            <Heading slot="title" className="text-lg font-semibold text-slate-100">
              {m.shortcuts_help_title()}
            </Heading>
            <button
              onClick={() => $shortcutsHelpOpen.set(false)}
              aria-label={m.settings_close()}
              className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              ✖
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {GROUP_ORDER.map((group) => {
              const rows = SHORTCUTS.filter((s) => s.group === group);
              if (rows.length === 0) return null;
              return (
                <section key={group} aria-label={GROUP_LABEL[group]()} className="mb-4 last:mb-0">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
                    {GROUP_LABEL[group]()}
                  </h3>
                  <dl className="flex flex-col gap-1">
                    {rows.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-4 text-sm">
                        <dt className="text-slate-300">{s.label()}</dt>
                        <dd>
                          <kbd className="rounded border border-slate-600 bg-slate-900 px-2 py-0.5 font-mono text-xs text-slate-200">
                            {s.combo}
                          </kbd>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/components/common/KeyboardShortcutsDialog.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Render the dialog in `App()`**

In `src/App.tsx`, add the import near the other common-component imports:

```ts
import { KeyboardShortcutsDialog } from "./components/common/KeyboardShortcutsDialog";
```

Then add `<KeyboardShortcutsDialog />` inside the `App()` `ErrorBoundary`, next to the other modals:

```tsx
function App() {
  return (
    <ErrorBoundary>
      <AppContent />
      <CommandPalette />
      <SettingsDialog />
      <KeyboardShortcutsDialog />
      <LiveAnnouncer />
      <ToastContainer />
    </ErrorBoundary>
  );
}
```

- [ ] **Step 6: Verify the full suite + build**

Run: `pnpm test`
Expected: PASS.

Run: `pnpm vite:build`
Expected: `✓ built`.

- [ ] **Step 7: Manual smoke**

In `pnpm tauri dev`: `F1` opens the dialog with all groups; `Escape` closes it; reopening with `F1` works (open-once, no toggle-flicker).

- [ ] **Step 8: Commit**

```bash
git add src/components/common/KeyboardShortcutsDialog.tsx src/components/common/KeyboardShortcutsDialog.test.tsx src/App.tsx
git commit -m "feat(shortcuts): F1 keyboard-shortcuts help dialog from registry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `ActivityBar` consumes the shared `SECTIONS`

**Files:**
- Modify: `src/components/layout/ActivityBar.tsx`

Behaviour-preserving refactor. Safety net: the existing `ActivityBar.test.tsx` (7 buttons, profile first, launch-focus indices) must stay green.

- [ ] **Step 1: Add a regression test for the disabled flag's source**

Append to `src/components/layout/ActivityBar.test.tsx` inside `describe("ActivityBar — structure", ...)`:

```ts
  it("marks the Schedule button disabled (from shared SECTIONS)", () => {
    const { container } = renderBar();
    const schedule = Array.from(container.querySelectorAll("button")).find((b) =>
      b.getAttribute("aria-disabled") === "true",
    );
    expect(schedule).toBeTruthy();
  });
```

- [ ] **Step 2: Run it — it should pass already (current code disables Schedule)**

Run: `pnpm test src/components/layout/ActivityBar.test.tsx`
Expected: PASS. (This pins the behaviour we must preserve through the refactor.)

- [ ] **Step 3: Refactor `ActivityBar.tsx` to consume `SECTIONS`**

In `src/components/layout/ActivityBar.tsx`:

a) Add the import and replace the local `SectionConfig`/`SECTIONS` (lines ~12-26) with an icon+phase map plus the derived section list:

```ts
import type { ComponentType } from "react";
import { SECTIONS as ALL_SECTIONS } from "../../lib/sections";

const ICONS: Record<Section, ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  profiles: Layers,
  streams: Radio,
  browser: Globe,
  wishlist: Heart,
  schedule: Calendar,
  songs: Music,
};

// Phase shown in the disabled-section hint; only Schedule has one today.
const PHASES: Partial<Record<Section, string>> = { schedule: "3" };

// The ActivityBar's section group is every section except Profiles (which is the
// separate header at the top). Order/disabled come from the shared registry.
const sectionItems = ALL_SECTIONS.filter((s) => s.id !== "profiles");
```

b) In the section-group JSX, change `SECTIONS.map((sec, i) => ...)` to `sectionItems.map((sec, i) => ...)`, and inside it:
- compute the icon: `const Icon = ICONS[sec.id];`
- replace `<sec.Icon size={20} aria-hidden={true} />` with `<Icon size={20} aria-hidden={true} />`
- replace `sec.phase ?? ""` with `PHASES[sec.id] ?? ""`
- `sec.disabled`, `sec.id`, `sec.label()` already exist on `SectionMeta` — unchanged.

c) Update `activeNavIndex` (lines ~59-63): change `SECTIONS.findIndex(...)` to `sectionItems.findIndex(...)` (keeps profile=0, sections offset +1). The roving refs (`ref0..ref4`, `allRefs`, `moveTo`) are unchanged — `sectionItems` is the same five sections in the same order.

- [ ] **Step 4: Run the ActivityBar test + full suite**

Run: `pnpm test src/components/layout/ActivityBar.test.tsx`
Expected: PASS (structure, profile behaviour, launch-focus, the new disabled test).

Run: `pnpm test`
Expected: PASS (whole suite).

- [ ] **Step 5: Verify the build**

Run: `pnpm vite:build`
Expected: `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/ActivityBar.tsx src/components/layout/ActivityBar.test.tsx
git commit -m "refactor(nav): ActivityBar consumes shared SECTIONS registry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: documentation — flip ⬜→✅ and record single-source

**Files:**
- Modify: `docs/keyboard-shortcuts.md`
- Modify: `docs/keyboard-shortcuts-backlog.md`
- Modify: `docs/decisions/2026-06-02-section-navigation-shortcuts.md`
- Modify: `docs/decisions/2026-06-02-context-aware-keyboard-shortcuts.md`

- [ ] **Step 1: Update the Tier-2 table in `keyboard-shortcuts.md`**

In the "Tier 2 — глобальні у webview" table (lines ~60-69):
- Change the **Стан** column from `⬜` to `✅` for: `Alt+1`, `Alt+2`, `Alt+3`, `Alt+5`, `Alt+0`, and the `Ctrl+N` row whose умова is `$activeSection === "streams"`.
- Leave `Alt+4` (Schedule) as `⬜ (після Phase 3D)` and the `Ctrl+N` wishlist/profiles rows as `⬜` (out of scope this branch).
- Replace the `F1` row with a реалізований entry and move it conceptually into Tier 2 (it is now a dispatched global toggle):

```md
| `F1` | довідник гарячих клавіш (open-once, модаль з реєстру) | — | webview | ✅ | відкривність (a11y) |
```

- [ ] **Step 2: Update the implementation note under the table**

Append to the note block under the Tier-2 table:

```md
> Реалізація: диспетч єдиний — чистий `matchShortcut` ([shortcuts.ts](../src/lib/shortcuts.ts))
> над реєстром `SHORTCUTS`, що його поділяють слухач App.tsx, гард
> [reservedShortcuts.ts](../src/lib/reservedShortcuts.ts) і F1-довідник
> ([KeyboardShortcutsDialog.tsx](../src/components/common/KeyboardShortcutsDialog.tsx)).
> Порядок/digit секцій — спільний [sections.ts](../src/lib/sections.ts) (його ж
> читає ActivityBar) → застереження section-navigation ADR про дрейф нумерації
> знято: число й секція більше не дублюються.
```

- [ ] **Step 3: Fill the empty P2 bucket in the backlog**

In `docs/keyboard-shortcuts-backlog.md`, under `## P2 — відкривність (найбільший a11y-виграш)`, add:

```md
### [x] KB-13 · ✨ F1 — довідник гарячих клавіш
Відкривність: жодного способу побачити список клавіш не було.
- **Готово коли:** `F1` відкриває модаль зі списком названих шорткатів, згенерованим
  з реєстру (не дрейфує від реальних біндингів).
- **Зроблено (2026-06-07):** модаль [KeyboardShortcutsDialog.tsx](../src/components/common/KeyboardShortcutsDialog.tsx)
  рендерить `SHORTCUTS` ([shortcuts.ts](../src/lib/shortcuts.ts)), згруповані по
  `group`; `F1` (open-once) / `Escape`. Реалізовано разом із `Alt+digit`/`Ctrl+N`
  (єдиний диспетч). Спека/план:
  `docs/superpowers/{specs,plans}/2026-06-07-webview-shortcut-dispatch-and-help*`.
```

- [ ] **Step 4: Mark the two ADRs implemented**

In `docs/decisions/2026-06-02-section-navigation-shortcuts.md`, change the status line to:

```md
- **Статус:** РЕАЛІЗОВАНО (2026-06-07) — inline-скетч замінено на реєстр-диспетч
  ([shortcuts.ts](../../src/lib/shortcuts.ts)/[sections.ts](../../src/lib/sections.ts));
  рішення про комбо незмінне.
```

In `docs/decisions/2026-06-02-context-aware-keyboard-shortcuts.md`, change the status line to:

```md
- **Статус:** РЕАЛІЗОВАНО частково (2026-06-07) — `Ctrl+N`→Add Stream (Streams)
  через реєстр; wishlist/profiles лишаються майбутнім.
```

- [ ] **Step 5: Sanity-check links and commit**

Run: `pnpm vite:build`
Expected: `✓ built` (docs-only change, but confirms nothing else regressed).

```bash
git add docs/keyboard-shortcuts.md docs/keyboard-shortcuts-backlog.md docs/decisions/2026-06-02-section-navigation-shortcuts.md docs/decisions/2026-06-02-context-aware-keyboard-shortcuts.md
git commit -m "docs(shortcuts): mark Alt+digit/Ctrl+N/F1 done; record single-source dispatch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run `pnpm test` — entire suite green.
- [ ] Run `pnpm vite:build` — `✓ built`.
- [ ] Manual NVDA pass in `pnpm tauri dev`: `Alt+1..5`/`Alt+0` switch sections and focus lands in the panel; `Alt+4` is silent; `Ctrl+N` opens Add Stream only on Streams; `F1` opens the help dialog and `Escape` closes it.

---

## Spec coverage check

- §2 sections.ts → Task 2. §3 shortcuts.ts + matchShortcut → Task 3. §4 App.tsx listener → Task 4. §5 dialog + `$shortcutsHelpOpen` → Tasks 4 (store) + 6 (dialog). §6 reservedShortcuts derivation → Task 5. §7 ActivityBar → Task 7. §8 behaviour (disabled silent, focus parity, F1 under guard) → encoded in Tasks 3/4 tests. §9 i18n → Task 1. §10 testing → Tasks 2/3/5/6. §11 docs → Task 8. Out-of-scope items (wishlist/profiles `Ctrl+N`, list keys, KB-10/12, per-section announce) are not implemented, as specified.
