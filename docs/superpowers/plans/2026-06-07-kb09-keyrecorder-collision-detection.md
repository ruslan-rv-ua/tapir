# KB-09 · Reserved-combo collision detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard-block recording a Settings hotkey that collides with a fixed webview combo (Tier 2 + Tier 2′), so a user cannot silently shadow e.g. the command palette by binding an OS hotkey to `Ctrl+K`.

**Architecture:** A new pure lib `src/lib/reservedShortcuts.ts` (mirrors `shortcutGuard.ts`) lists every hardcoded webview combo in the exact accelerator-string format `KeyRecorder`'s `codeToToken` produces, each with an i18n action label. `HotkeysTab.validateHotkey` calls `findReservedConflict(combo)` first (reserved wins over the existing Tier-1 duplicate check) and returns a blocking message string; `KeyRecorder` already renders that as a `role="alert"` and skips `onChange`, so the recorder itself needs **zero changes**.

**Tech Stack:** React + TypeScript, Vitest + @testing-library/react (jsdom), nanostores, paraglide i18n (compiled via the `@inlang/paraglide-js` Vite plugin → committed JS under `src/i18n/paraglide/`).

**Spec:** [docs/superpowers/specs/2026-06-07-kb09-keyrecorder-collision-detection-design.md](../specs/2026-06-07-kb09-keyrecorder-collision-detection-design.md)

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/i18n/messages/en.json`, `uk.json` | Source i18n strings | Modify — add 4 keys ×2 langs |
| `src/i18n/paraglide/**` | **Generated** message functions (committed; vitest reads these directly) | Regenerate + commit |
| `src/lib/reservedShortcuts.ts` | The reserved-combo list + `findReservedConflict` (pure) | Create |
| `src/lib/reservedShortcuts.test.ts` | Unit tests for the lib | Create |
| `src/components/settings/HotkeysTab.tsx` | Compose the reserved check into `validateHotkey` | Modify |
| `src/components/settings/HotkeysTab.test.tsx` | Integration: recording `Ctrl+K` blocks + does not save | Create |
| `docs/keyboard-shortcuts-backlog.md`, `keyboard-shortcuts.md` | Mark KB-09 done; note the guard | Modify |

> **Heads-up on dirty working tree:** `docs/keyboard-shortcuts-backlog.md` and `docs/keyboard-shortcuts.md` already have *uncommitted* edits from before this work. In Task 4, inspect `git diff` for those two files and stage only KB-09-related changes (use `git add -p` if needed) — do not bundle unrelated WIP.

---

### Task 1: i18n groundwork (4 new keys + regenerate)

Not TDD — this is data + codegen. The new message functions MUST exist in the committed `src/i18n/paraglide/` output **before** later tasks, because `vitest.config.ts` does *not* run the paraglide plugin; tests import the pre-generated files.

**Files:**
- Modify: `src/i18n/messages/en.json`
- Modify: `src/i18n/messages/uk.json`
- Regenerate: `src/i18n/paraglide/**` (via the Vite plugin)

- [ ] **Step 1: Add the three `settings_hotkey_*` keys to `en.json`**

Find the line:
```json
  "settings_hotkey_duplicate": "This combination is already used for: {action}",
```
Insert immediately after it:
```json
  "settings_hotkey_reserved": "This combination is reserved for: {action}",
  "settings_hotkey_action_zone_nav": "Zone navigation",
  "settings_hotkey_action_row_menu": "Row menu",
```

- [ ] **Step 2: Add `profiles_section` to `en.json`**

Find the line:
```json
  "streams_section": "Streams",
```
Insert immediately after it:
```json
  "profiles_section": "Profiles",
```

- [ ] **Step 3: Add the three `settings_hotkey_*` keys to `uk.json`**

Find the line:
```json
  "settings_hotkey_duplicate": "Цю комбінацію вже використано для: {action}",
```
Insert immediately after it:
```json
  "settings_hotkey_reserved": "Цю комбінацію зарезервовано для: {action}",
  "settings_hotkey_action_zone_nav": "Навігація по зонах",
  "settings_hotkey_action_row_menu": "Меню рядка",
```

- [ ] **Step 4: Add `profiles_section` to `uk.json`**

Find the line:
```json
  "streams_section": "Потоки",
```
Insert immediately after it:
```json
  "profiles_section": "Профілі",
```

- [ ] **Step 5: Regenerate the paraglide output and verify the build**

Run: `pnpm vite:build`
Expected: build succeeds (exit 0). The paraglide Vite plugin recompiles messages as a side effect.

- [ ] **Step 6: Confirm the new message functions were generated**

Run (PowerShell): `Test-Path src/i18n/paraglide/messages/settings_hotkey_reserved.js, src/i18n/paraglide/messages/profiles_section.js, src/i18n/paraglide/messages/settings_hotkey_action_zone_nav.js, src/i18n/paraglide/messages/settings_hotkey_action_row_menu.js`
Expected: four `True` lines (the four new generated files exist). If any is `False`, Step 5's regeneration did not run — re-run `pnpm vite:build`.

- [ ] **Step 7: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/uk.json src/i18n/paraglide
git commit -m "i18n(shortcuts): add reserved-hotkey + zone-nav/row-menu/profiles labels (KB-09)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `reservedShortcuts.ts` lib (TDD)

**Files:**
- Create: `src/lib/reservedShortcuts.ts`
- Test: `src/lib/reservedShortcuts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/reservedShortcuts.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import * as m from "../i18n/paraglide/messages";
import { RESERVED_WEBVIEW_COMBOS, findReservedConflict } from "./reservedShortcuts";

describe("RESERVED_WEBVIEW_COMBOS", () => {
  it("reserves exactly the documented webview combos, in registry order", () => {
    expect(RESERVED_WEBVIEW_COMBOS.map((r) => r.combo)).toEqual([
      "Ctrl+K", "Ctrl+,",
      "Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5", "Alt+0",
      "Ctrl+N",
      "F6", "Shift+F6", "Shift+F10",
    ]);
  });
});

describe("findReservedConflict", () => {
  it("flags every reserved combo with a non-null label getter", () => {
    for (const { combo } of RESERVED_WEBVIEW_COMBOS) {
      expect(findReservedConflict(combo)).not.toBeNull();
    }
  });

  it("returns the command-palette label for Ctrl+K", () => {
    expect(findReservedConflict("Ctrl+K")?.()).toBe(m.command_palette_label());
  });

  it("returns the Add Stream label for Ctrl+N", () => {
    expect(findReservedConflict("Ctrl+N")?.()).toBe(m.add_stream());
  });

  it("covers Tier 2′ named keys that KeyRecorder can record", () => {
    expect(findReservedConflict("F6")).not.toBeNull();
    expect(findReservedConflict("Shift+F6")).not.toBeNull();
    expect(findReservedConflict("Shift+F10")).not.toBeNull();
  });

  it("returns null for a free combo", () => {
    expect(findReservedConflict("Ctrl+Shift+J")).toBeNull();
  });

  it("matches exactly — wrong case or a Tier-1 default does not collide", () => {
    expect(findReservedConflict("ctrl+k")).toBeNull();
    expect(findReservedConflict("Ctrl+Shift+R")).toBeNull(); // Tier-1 OS default, not a webview combo
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/reservedShortcuts.test.ts`
Expected: FAIL — cannot resolve module `./reservedShortcuts` (file not created yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/reservedShortcuts.ts`:
```ts
/**
 * Fixed (non-configurable) webview key combos — Tier 2 + Tier 2′ in
 * docs/keyboard-shortcuts.md — that Settings → Hotkeys must refuse to assign.
 *
 * A Tier-1 OS hotkey is registered globally and intercepts its combo before it
 * reaches the App.tsx webview listener, so binding an OS hotkey to one of these
 * would silently shadow the webview action (e.g. the command palette). The
 * Hotkeys tab validates against this list and hard-blocks such a combo (KB-09).
 *
 * Strings are in the exact accelerator format KeyRecorder's `codeToToken`
 * produces: modifier order Ctrl→Shift→Alt→Super, tokens like "Up"/"F6", no
 * spaces. `label()` is deferred because paraglide messages read the active
 * locale at call time. Keep this list in sync with the registry.
 */
import * as m from "../i18n/paraglide/messages";

export const RESERVED_WEBVIEW_COMBOS: ReadonlyArray<{
  combo: string;
  label: () => string;
}> = [
  // Tier 2 — global webview toggles (App.tsx listener)
  { combo: "Ctrl+K", label: () => m.command_palette_label() },
  // Ctrl+, is currently unreachable via KeyRecorder (codeToToken("Comma") === null);
  // listed for intent + future-proofing if codeToToken later supports punctuation.
  { combo: "Ctrl+,", label: () => m.settings_title() },
  { combo: "Alt+1", label: () => m.streams_section() },
  { combo: "Alt+2", label: () => m.browser_section() },
  { combo: "Alt+3", label: () => m.wishlist_section() },
  { combo: "Alt+4", label: () => m.schedule_section() },
  { combo: "Alt+5", label: () => m.songs_section() },
  { combo: "Alt+0", label: () => m.profiles_section() },
  { combo: "Ctrl+N", label: () => m.add_stream() },
  // Tier 2′ — named navigation/control keys (own handlers, not in the listener)
  { combo: "F6", label: () => m.settings_hotkey_action_zone_nav() },
  { combo: "Shift+F6", label: () => m.settings_hotkey_action_zone_nav() },
  { combo: "Shift+F10", label: () => m.settings_hotkey_action_row_menu() },
];

/**
 * Returns the conflicting reserved entry's label getter, or null if `combo`
 * is free. Pure — exact string match against the canonical accelerator format.
 */
export function findReservedConflict(combo: string): (() => string) | null {
  const hit = RESERVED_WEBVIEW_COMBOS.find((r) => r.combo === combo);
  return hit ? hit.label : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/reservedShortcuts.test.ts`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reservedShortcuts.ts src/lib/reservedShortcuts.test.ts
git commit -m "feat(shortcuts): reservedShortcuts lib — webview combos + findReservedConflict (KB-09)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire the reserved check into `HotkeysTab` (TDD)

**Files:**
- Modify: `src/components/settings/HotkeysTab.tsx`
- Test: `src/components/settings/HotkeysTab.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/settings/HotkeysTab.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { HotkeysTab } from "./HotkeysTab";
import { $settings } from "../../stores/settings";
import type { GlobalSettings } from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  saveSettings: vi.fn().mockResolvedValue(undefined),
  registerHotkeys: vi.fn().mockResolvedValue([]),
}));

const baseSettings: GlobalSettings = {
  language: "en-US",
  theme: "auto",
  activeProfile: "Default",
  outputDevice: null,
  minimizeToTray: false,
  showTrayNotifications: true,
  showTrackInTitle: true,
  diskSpaceThresholdGb: 1,
  doubleClickAction: "play",
  bandwidthLimitKbps: 0,
  autostart: false,
  autoAdvance: true,
  prevRestartThresholdMs: 0,
  hotkeys: {
    toggleRecording: "",
    togglePlayback: "",
    volumeUp: "",
    volumeDown: "",
    toggleWindow: "",
  },
  logRotation: true,
  logMaxSizeMb: 10,
  logLevel: "info",
};

beforeEach(() => {
  vi.clearAllMocks();
  $settings.set(baseSettings);
});

afterEach(() => {
  $settings.set(null);
});

// The toggleRecording label is "Recording (toggle)" — its parens are regex
// metacharacters, so match the accessible name with a prefix function instead.
function recordButton(getByRole: ReturnType<typeof render>["getByRole"]) {
  const label = m.settings_hotkey_toggle_recording();
  return getByRole("button", { name: (name: string) => name.startsWith(label) });
}

describe("HotkeysTab — reserved-combo collision (KB-09)", () => {
  it("blocks a combo reserved by a webview action and does not save it", () => {
    const { getByRole } = render(<HotkeysTab />);
    const button = recordButton(getByRole);
    fireEvent.click(button); // arm the recorder
    fireEvent.keyDown(button, { code: "KeyK", key: "k", ctrlKey: true });

    expect(getByRole("alert")).toHaveTextContent(
      m.settings_hotkey_reserved({ action: m.command_palette_label() }),
    );
    expect($settings.get()?.hotkeys.toggleRecording).toBe("");
  });

  it("still records a free combo into the store", () => {
    const { getByRole } = render(<HotkeysTab />);
    const button = recordButton(getByRole);
    fireEvent.click(button);
    fireEvent.keyDown(button, { code: "KeyJ", key: "j", ctrlKey: true, shiftKey: true });

    expect($settings.get()?.hotkeys.toggleRecording).toBe("Ctrl+Shift+J");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/settings/HotkeysTab.test.tsx`
Expected: FAIL — the "blocks a combo reserved…" case fails: with no reserved check, `Ctrl+K` is recorded, so there is no `role="alert"` and `toggleRecording` becomes `"Ctrl+K"`. (The "free combo" case already passes.)

- [ ] **Step 3: Add the import to `HotkeysTab.tsx`**

In `src/components/settings/HotkeysTab.tsx`, find:
```ts
import type { HotkeyMap } from "../../lib/tauri";
```
Insert after it:
```ts
import { findReservedConflict } from "../../lib/reservedShortcuts";
```

- [ ] **Step 4: Compose the reserved check into `validateHotkey`**

In `src/components/settings/HotkeysTab.tsx`, replace:
```ts
    return (combo: string): string | null => {
      if (!combo) return null;
      const hotkeys = $settings.get()?.hotkeys;
```
with:
```ts
    return (combo: string): string | null => {
      if (!combo) return null;
      // Reserved webview combos win over the Tier-1 duplicate check: the user
      // cannot resolve them by reassigning, so report that first (KB-09).
      const reserved = findReservedConflict(combo);
      if (reserved) return m.settings_hotkey_reserved({ action: reserved() });
      const hotkeys = $settings.get()?.hotkeys;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/components/settings/HotkeysTab.test.tsx`
Expected: PASS (both cases green).

- [ ] **Step 6: Run the full frontend test suite (no regressions)**

Run: `pnpm test`
Expected: PASS — all suites, including the unchanged `KeyRecorder.test.tsx` and `reservedShortcuts.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/HotkeysTab.tsx src/components/settings/HotkeysTab.test.tsx
git commit -m "feat(shortcuts): block hotkeys reserved by webview combos in Settings (KB-09)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Docs — mark KB-09 done; note the guard

**Files:**
- Modify: `docs/keyboard-shortcuts-backlog.md`
- Modify: `docs/keyboard-shortcuts.md`

> Reminder: both files have pre-existing uncommitted edits. Run `git diff docs/keyboard-shortcuts.md docs/keyboard-shortcuts-backlog.md` first and stage only the KB-09 changes below.

- [ ] **Step 1: Mark KB-09 done in the backlog**

In `docs/keyboard-shortcuts-backlog.md`, replace:
```markdown
### ☐ KB-09 · 🔍 Детект колізій у KeyRecorder
Шов `onValidate` існує ([KeyRecorder.tsx:9,52](../src/components/settings/KeyRecorder.tsx#L52)).
Перевірити, чи він відхиляє комбо, зайняте іншою дією, і попереджає про збіг із
фіксованими webview-клавішами.
- **Готово коли:** не можна призначити дубльоване комбо без попередження.
```
with:
```markdown
### [x] KB-09 · 🔍 Детект колізій у KeyRecorder
Шов `onValidate` існує ([KeyRecorder.tsx:9,52](../src/components/settings/KeyRecorder.tsx#L52)).
Перевірити, чи він відхиляє комбо, зайняте іншою дією, і попереджає про збіг із
фіксованими webview-клавішами.
- **Готово коли:** не можна призначити дубльоване комбо без попередження.
- **Зроблено (2026-06-07):** дублікати Tier-1 уже відхилялись; додано перевірку
  проти **фіксованих webview-комбо** (Tier 2 + Tier 2′). Новий чистий lib
  [reservedShortcuts.ts](../src/lib/reservedShortcuts.ts) (`RESERVED_WEBVIEW_COMBOS`
  + `findReservedConflict`, за зразком `shortcutGuard.ts`) скомпоновано у
  `HotkeysTab.validateHotkey` ([HotkeysTab.tsx](../src/components/settings/HotkeysTab.tsx))
  — зарезервоване має пріоритет над дублікатом, бо його не обійти переназначенням.
  `KeyRecorder` без змін: блокуючий рядок іде в наявний `role="alert"`, `onChange`
  не викликається. Повідомлення називає дію (`settings_hotkey_reserved`), реюз
  наявних i18n-міток + 4 нові ключі. Спека/план:
  `docs/superpowers/{specs,plans}/2026-06-07-kb09-keyrecorder-collision-detection*`.
  Тести: [reservedShortcuts.test.ts](../src/lib/reservedShortcuts.test.ts),
  [HotkeysTab.test.tsx](../src/components/settings/HotkeysTab.test.tsx).
```

- [ ] **Step 2: Note the guard in the registry**

In `docs/keyboard-shortcuts.md`, find the end of the Tier-1 intro paragraph:
```markdown
користувачем у Settings → Hotkeys ([KeyRecorder.tsx](../src/components/settings/KeyRecorder.tsx)).
```
Replace it with:
```markdown
користувачем у Settings → Hotkeys ([KeyRecorder.tsx](../src/components/settings/KeyRecorder.tsx)).
Записане комбо валідується проти зарезервованих webview-клавіш
([reservedShortcuts.ts](../src/lib/reservedShortcuts.ts)): не можна призначити
OS-хоткей на `Ctrl+K`/`Alt+digit`/`F6`/… — гард і реєстр поділяють той самий
намір (KB-09).
```

- [ ] **Step 3: Commit**

```bash
git add docs/keyboard-shortcuts-backlog.md docs/keyboard-shortcuts.md
git commit -m "docs(shortcuts): mark KB-09 done; note reserved-combo guard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Final verification gates

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all suites.

- [ ] **Step 2: Run the production build (also re-verifies paraglide compiles)**

Run: `pnpm vite:build`
Expected: build succeeds (exit 0).

> Note: `pnpm tsc` is **not** a gate — it reports ~51 pre-existing untyped-paraglide errors that are unrelated to this work (see memory `typecheck-paraglide-gotchas`). The real gates are `pnpm test` + `pnpm vite:build`.

---

## Done-when (acceptance, from the spec)

- Recording a combo bound to another Tier-1 hotkey → blocked with a warning (already worked; still passes).
- Recording a combo equal to any fixed webview combo (`Ctrl+K`, `Alt+0..5`, `Ctrl+N`, `F6`, `Shift+F6`, `Shift+F10`) → blocked with a `role="alert"` naming the action; nothing saved.
- The reserved list lives in one named, unit-tested place that the registry points at.
