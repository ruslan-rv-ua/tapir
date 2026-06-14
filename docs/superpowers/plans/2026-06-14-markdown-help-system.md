# Markdown Help System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the keyboard-shortcuts-only F1 dialog with a full, accessible Help dialog whose prose comes from Markdown compiled to sanitized HTML at build time, while the shortcuts tab stays data-driven from the existing `SHORTCUTS` registry.

**Architecture:** A `*.md?help` import is transformed by a `unified` (remark/rehype) Vite plugin into a sanitized HTML string at build time — the runtime bundle ships no Markdown or sanitizer code. A react-aria `Modal` + vertical `Tabs` dialog (`HelpDialog`) renders one tab per section: `overview` + four stub sections load their HTML via eager `import.meta.glob`; the `shortcuts` tab renders the existing registry directly. NVDA-first heading structure: dialog `h1` title, content authored at `h2`.

**Tech Stack:** TypeScript, React 19, react-aria-components, nanostores, Vite 8, Vitest 4, paraglide i18n, and build-time `unified`/`remark`/`rehype`.

---

## File Structure

**Created:**
- `build/markdownHelpPlugin.ts` — the Vite plugin (Node-only; lives **outside** `src/` so `tsc`'s `include: ["src"]` does not type-check its `node:fs/promises` import — the cleaner of the two options the spec offers, avoiding a global `@types/node` in the DOM-only frontend).
- `src/markdown.d.ts` — TS ambient declaration for `*.md?help`.
- `src/components/common/helpContent.ts` — eager glob of the `.md?help` files → `{ locale → { sectionId → html } }` map + `getHelpHtml(locale, section)` lookup.
- `src/components/common/helpContent.test.ts` — proves the `?help` transform + glob resolve through vitest.
- `src/components/common/HelpContent.tsx` — injects trusted HTML into a `.help-content` div.
- `src/components/common/ShortcutsHelp.tsx` — the data-driven shortcuts tab (extracted from `KeyboardShortcutsDialog`, group headings demoted `h3 → h2`).
- `src/components/common/HelpDialog.tsx` — the dialog: react-aria `Modal`/`Dialog` + vertical `Tabs`.
- `src/components/common/HelpDialog.test.tsx` — behaviour test (replaces the old dialog test).
- `docs/help/{uk,en}/overview.md` — full overview content.
- `docs/help/{uk,en}/{recording,wishlist,templates,scheduling,profiles}.md` — "coming soon" stubs.

**Modified:**
- `vite.config.ts` — register `markdownHelpPlugin()` first.
- `vitest.config.ts` — register `markdownHelpPlugin()` (so `?help` resolves under vitest).
- `src/stores/navigation.ts` — `$shortcutsHelpOpen` → `$helpOpen`.
- `src/hooks/useGlobalShortcuts.ts` — `openHelp` uses `$helpOpen`.
- `src/App.tsx` — render `<HelpDialog />` instead of `<KeyboardShortcutsDialog />`.
- `src/lib/shortcuts.ts` — doc comment names `ShortcutsHelp` instead of `KeyboardShortcutsDialog`.
- `src/i18n/messages/{uk,en}.json` — new `help_*` keys.
- `src/styles.css` — scoped `.help-content` styling block.
- `docs/keyboard-shortcuts.md` — update the dangling `KeyboardShortcutsDialog.tsx` link.

**Deleted:**
- `src/components/common/KeyboardShortcutsDialog.tsx`
- `src/components/common/KeyboardShortcutsDialog.test.tsx`

---

## Task 1: Install build-time dependencies

**Files:**
- Modify: `package.json` (via pnpm)

- [ ] **Step 1: Add the remark/rehype toolchain as devDependencies**

These are build-time only — nothing in the app bundle imports them, so the runtime bundle is unchanged. (No `@types/node`: the plugin lives outside `src/`, so it is not in the frontend `tsc` include.)

Run:
```bash
pnpm add -D unified remark-parse remark-gfm remark-rehype rehype-sanitize rehype-stringify
```

- [ ] **Step 2: Verify they landed in devDependencies**

Run: `git diff package.json`
Expected: the six packages appear under `devDependencies` (not `dependencies`).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add remark/rehype toolchain for markdown help plugin"
```

---

## Task 2: Write the Vite plugin

**Files:**
- Create: `build/markdownHelpPlugin.ts`

- [ ] **Step 1: Create the plugin**

A single shared `unified` processor: `remark-parse → remark-gfm → remark-rehype → rehype-sanitize → rehype-stringify`. Sanitization runs at build time (defence-in-depth, zero runtime cost). The exported factory returns a Vite `Plugin` so `this.addWatchFile` is typed; `load` is a normal function (not an arrow) so `this` is the Rollup plugin context.

Create `build/markdownHelpPlugin.ts`:
```ts
import { readFile } from "node:fs/promises";
import type { Plugin } from "vite";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

// Build-time Markdown → sanitized HTML. Shared across every `*.md?help` import.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize)
  .use(rehypeStringify);

/**
 * Transforms `*.md?help` imports into a default-exported sanitized HTML string.
 * `enforce: "pre"` so it wins before Vite's default asset handling. Guarded on
 * the `?help` query (parsed via URLSearchParams — Vite may append extra params)
 * and the `.md` extension. The runtime bundle gains no Markdown/sanitizer code.
 */
export function markdownHelpPlugin(): Plugin {
  return {
    name: "markdown-help",
    enforce: "pre",
    async load(id) {
      const [file, rawQuery = ""] = id.split("?");
      if (!new URLSearchParams(rawQuery).has("help")) return null;
      if (!file.endsWith(".md")) return null;
      this.addWatchFile(file); // reliable HMR on .md edits
      const html = String(await processor.process(await readFile(file, "utf8")));
      return `export default ${JSON.stringify(html)};`;
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add build/markdownHelpPlugin.ts
git commit -m "feat(help): build-time markdown→sanitized-html vite plugin"
```

---

## Task 3: Wire the plugin into Vite + Vitest and add the ambient type

**Files:**
- Modify: `vite.config.ts`
- Modify: `vitest.config.ts`
- Create: `src/markdown.d.ts`

- [ ] **Step 1: Register the plugin in `vite.config.ts` (first in the array)**

Replace the existing imports + `plugins` array in `vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { paraglideVitePlugin as paraglide } from "@inlang/paraglide-js";
import { markdownHelpPlugin } from "./build/markdownHelpPlugin";

export default defineConfig({
  plugins: [
    markdownHelpPlugin(),
    react(),
    tailwindcss(),
    paraglide({
      project: "./project.inlang",
      outdir: "./src/i18n/paraglide",
    }),
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 700,
  },
});
```

- [ ] **Step 2: Register the plugin in `vitest.config.ts`**

vitest does **not** run through `vite.config.ts`, so `*.md?help` and `import.meta.glob(..., { query: "?help" })` will not resolve under vitest until the plugin is added here. Replace `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { markdownHelpPlugin } from "./build/markdownHelpPlugin";

// Standalone test config — intentionally does NOT include the paraglide/tailwind
// plugins from vite.config.ts (paraglide messages are generated to disk, so they
// resolve without their plugin). The markdown-help plugin IS required here: the
// `?help` transform is not generated to disk, so HelpDialog/helpContent tests
// would fail to resolve `*.md?help` imports without it.
export default defineConfig({
  plugins: [markdownHelpPlugin(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
```

- [ ] **Step 3: Add the ambient module declaration**

Create `src/markdown.d.ts`:
```ts
declare module "*.md?help" {
  const html: string;
  export default html;
}
```

- [ ] **Step 4: Verify the existing suite still passes (no regressions from config changes)**

Run: `pnpm test`
Expected: PASS — same number of tests as before (the new plugin is inert until a `?help` import exists).

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts vitest.config.ts src/markdown.d.ts
git commit -m "feat(help): wire markdown-help plugin into vite + vitest, add ambient type"
```

---

## Task 4: Author the Markdown content files

**Files:**
- Create: `docs/help/uk/overview.md`, `docs/help/en/overview.md`
- Create: `docs/help/{uk,en}/{recording,wishlist,templates,scheduling,profiles}.md`

> **Authoring rules (a11y + Tauri webview):** every file starts at `##` (no own `h1`) so NVDA heading nav has no level jumps under the dialog's `h1` title. **No links** — in the Tauri webview a plain `<a href>` click navigates the whole SPA away (white-screens the app); keep this rule for the stubs too.

- [ ] **Step 1: Create `docs/help/uk/overview.md`**

```markdown
## Ласкаво просимо до Tapir

Tapir — це застосунок для запису інтернет-радіо. Він стежить за обраними
потоками, розпізнає назви треків з метаданих ефіру й зберігає кожен трек в
окремий файл.

## Основні можливості

- **Потоки** — додавайте радіостанції та записуйте їх вручну або за розкладом.
- **Записи** — переглядайте, відтворюйте, перейменовуйте та редагуйте теги
  збережених треків.
- **Вішліст** — задавайте патерни бажаних треків; Tapir сповістить, коли такий
  трек з'явиться в ефірі.
- **Розклад** — плануйте автоматичний запис на певний час і дні тижня.
- **Профілі** — групуйте потоки в окремі набори й перемикайтеся між ними.

## Навігація з клавіатури

Tapir розрахований на роботу без миші та сумісний з NVDA. Натисніть `F1`, щоб
відкрити цю довідку, або перейдіть на вкладку «Гарячі клавіші», щоб побачити
повний перелік комбінацій.

Використовуйте `F6`, щоб переходити між зонами екрана, а `Alt` із цифрою — щоб
відкрити відповідний розділ.
```

- [ ] **Step 2: Create `docs/help/en/overview.md`**

```markdown
## Welcome to Tapir

Tapir is an internet-radio recording application. It watches the streams you
choose, reads track titles from the stream metadata, and saves each track to its
own file.

## Key features

- **Streams** — add radio stations and record them manually or on a schedule.
- **Recordings** — browse, play, rename, and edit tags on saved tracks.
- **Wishlist** — define patterns for the tracks you want; Tapir notifies you when
  a match goes on air.
- **Scheduling** — plan automatic recording for specific times and days.
- **Profiles** — group streams into separate sets and switch between them.

## Keyboard navigation

Tapir is built for mouse-free use and works with NVDA. Press `F1` to open this
help, or go to the "Keyboard shortcuts" tab to see the full list of combinations.

Use `F6` to move between screen zones, and `Alt` with a digit to open the
matching section.
```

- [ ] **Step 3: Create the five Ukrainian stub files**

`docs/help/uk/recording.md`:
```markdown
## Запис

Цей розділ незабаром буде доповнено.
```

`docs/help/uk/wishlist.md`:
```markdown
## Вішліст

Цей розділ незабаром буде доповнено.
```

`docs/help/uk/templates.md`:
```markdown
## Шаблони

Цей розділ незабаром буде доповнено.
```

`docs/help/uk/scheduling.md`:
```markdown
## Розклад

Цей розділ незабаром буде доповнено.
```

`docs/help/uk/profiles.md`:
```markdown
## Профілі

Цей розділ незабаром буде доповнено.
```

- [ ] **Step 4: Create the five English stub files**

`docs/help/en/recording.md`:
```markdown
## Recording

This section is coming soon.
```

`docs/help/en/wishlist.md`:
```markdown
## Wishlist

This section is coming soon.
```

`docs/help/en/templates.md`:
```markdown
## Templates

This section is coming soon.
```

`docs/help/en/scheduling.md`:
```markdown
## Scheduling

This section is coming soon.
```

`docs/help/en/profiles.md`:
```markdown
## Profiles

This section is coming soon.
```

- [ ] **Step 5: Commit**

```bash
git add docs/help
git commit -m "docs(help): overview content (uk/en) + coming-soon section stubs"
```

---

## Task 5: Content loading map + test (proves the pipeline end-to-end)

**Files:**
- Create: `src/components/common/helpContent.ts`
- Test: `src/components/common/helpContent.test.ts`

> The glob lives in `src/components/common/` so the `../../../docs/help` relative depth (`common → components → src → repo root`) is correct.

- [ ] **Step 1: Write the failing test**

Create `src/components/common/helpContent.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getHelpHtml } from "./helpContent";

describe("getHelpHtml", () => {
  it("compiles the uk overview markdown to sanitized HTML through the plugin", () => {
    const html = getHelpHtml("uk", "overview");
    expect(html).toContain("<h2");
    expect(html).toContain("Ласкаво просимо");
    // Authored at ## — must NOT emit an <h1> (would break the dialog's heading scale).
    expect(html).not.toContain("<h1");
  });

  it("returns locale-specific content for en", () => {
    expect(getHelpHtml("en", "overview")).toContain("Welcome to Tapir");
  });

  it("resolves the stub sections", () => {
    expect(getHelpHtml("en", "recording")).toContain("coming soon");
  });

  it("falls back to uk for an unknown locale", () => {
    expect(getHelpHtml("de", "overview")).toContain("Ласкаво просимо");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- helpContent`
Expected: FAIL — "Cannot find module './helpContent'" (the module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/components/common/helpContent.ts`:
```ts
// Eager, both-locale payload of tiny sanitized HTML strings (negligible size),
// so content is in the DOM synchronously on first render — best for NVDA.
const modules = import.meta.glob("../../../docs/help/*/*.md", {
  query: "?help",
  import: "default",
  eager: true,
}) as Record<string, string>;

// { locale: { sectionId: html } } — built once at module load.
const byLocale: Record<string, Record<string, string>> = {};
for (const [path, html] of Object.entries(modules)) {
  const match = path.match(/\/help\/([^/]+)\/([^/]+)\.md$/);
  if (!match) continue;
  const [, locale, section] = match;
  (byLocale[locale] ??= {})[section] = html;
}

/** HTML for a help section, falling back to the base locale (uk) then "". */
export function getHelpHtml(locale: string, section: string): string {
  return byLocale[locale]?.[section] ?? byLocale.uk?.[section] ?? "";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- helpContent`
Expected: PASS (all four cases). This confirms the `?help` transform and `import.meta.glob({ query: "?help" })` resolve through the plugin under vitest.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/helpContent.ts src/components/common/helpContent.test.ts
git commit -m "feat(help): content loading map from docs/help via ?help glob"
```

---

## Task 6: HelpContent injector component

**Files:**
- Create: `src/components/common/HelpContent.tsx`

- [ ] **Step 1: Create the component**

No DOMPurify — the HTML is already sanitized at build time by `rehype-sanitize`.

Create `src/components/common/HelpContent.tsx`:
```tsx
/** Injects build-time-sanitized help HTML. No runtime sanitizer needed. */
export function HelpContent({ html }: { html: string }) {
  return (
    <div className="help-content" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/common/HelpContent.tsx
git commit -m "feat(help): HelpContent HTML injector component"
```

---

## Task 7: ShortcutsHelp data-driven tab

**Files:**
- Create: `src/components/common/ShortcutsHelp.tsx`

> Extracted verbatim from the `KeyboardShortcutsDialog` body, with the group labels demoted from `h3` to `h2` so this tab matches the markdown tabs' single-level-under-`h1` structure.

- [ ] **Step 1: Create the component**

Create `src/components/common/ShortcutsHelp.tsx`:
```tsx
import { SHORTCUTS, type ShortcutGroup } from "../../lib/shortcuts";
import * as m from "../../i18n/paraglide/messages";

const GROUP_ORDER: ShortcutGroup[] = ["global", "navigation", "context", "list"];

const GROUP_LABEL: Record<ShortcutGroup, () => string> = {
  global: m.shortcuts_group_global,
  navigation: m.shortcuts_group_navigation,
  context: m.shortcuts_group_context,
  list: m.shortcuts_group_list,
};

/** Data-driven shortcuts reference — the single source of truth is SHORTCUTS. */
export function ShortcutsHelp() {
  return (
    <>
      {GROUP_ORDER.map((group) => {
        const rows = SHORTCUTS.filter((s) => s.group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} aria-label={GROUP_LABEL[group]()} className="mb-4 last:mb-0">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              {GROUP_LABEL[group]()}
            </h2>
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
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/common/ShortcutsHelp.tsx
git commit -m "feat(help): ShortcutsHelp tab (h2 group labels) from SHORTCUTS"
```

---

## Task 8: Add i18n keys

**Files:**
- Modify: `src/i18n/messages/uk.json:8` (after `shortcuts_group_list`)
- Modify: `src/i18n/messages/en.json:8`

> Source files only — `src/i18n/paraglide/` is generated and regenerates via the paraglide Vite plugin on build/dev. The shortcuts tab reuses the existing `shortcuts_help_title`, so no key for it.

- [ ] **Step 1: Add the `help_*` keys to `uk.json`**

In `src/i18n/messages/uk.json`, insert after the `"shortcuts_group_list": "Списки",` line:
```json
  "help_title": "Довідка Tapir",
  "help_sections_label": "Розділи довідки",
  "help_section_overview": "Огляд",
  "help_section_recording": "Запис",
  "help_section_wishlist": "Вішліст",
  "help_section_templates": "Шаблони",
  "help_section_scheduling": "Розклад",
  "help_section_profiles": "Профілі",
```

- [ ] **Step 2: Add the matching keys to `en.json`**

In `src/i18n/messages/en.json`, insert after the `"shortcuts_group_list": "Lists",` line:
```json
  "help_title": "Tapir Help",
  "help_sections_label": "Help sections",
  "help_section_overview": "Overview",
  "help_section_recording": "Recording",
  "help_section_wishlist": "Wishlist",
  "help_section_templates": "Templates",
  "help_section_scheduling": "Scheduling",
  "help_section_profiles": "Profiles",
```

- [ ] **Step 3: Regenerate paraglide output**

The paraglide plugin regenerates `src/i18n/paraglide/` during a Vite build. Run a quick build to emit the new message modules so editor/test imports resolve:

Run: `pnpm vite:build`
Expected: build succeeds; `src/i18n/paraglide/messages/help_title.js` (and the others) now exist.

- [ ] **Step 4: Verify the generated message exists**

Run: `git status --porcelain src/i18n/paraglide`
Expected: new generated `help_*` files appear (paraglide output is committed in this repo).

- [ ] **Step 5: Commit**

```bash
git add src/i18n/messages/uk.json src/i18n/messages/en.json src/i18n/paraglide
git commit -m "i18n(help): add help_* keys (uk/en) + regenerate paraglide"
```

---

## Task 9: HelpDialog component (additive store + test-first)

**Files:**
- Modify: `src/stores/navigation.ts` (add `$helpOpen`; keep `$shortcutsHelpOpen` for now)
- Create: `src/components/common/HelpDialog.tsx`
- Create: `src/components/common/HelpDialog.test.tsx`

> **Additive, always-green migration.** A direct rename of `$shortcutsHelpOpen` would instantly break the still-present `KeyboardShortcutsDialog` + `App.tsx`, leaving several committed tasks with a red `pnpm test`. Instead: add `$helpOpen` now (Task 9), repoint F1/App onto it (Task 10), then delete the old dialog and `$shortcutsHelpOpen` together (Task 11). Every commit leaves `pnpm test` green; the end state is identical to the spec's "rename".
>
> HelpDialog is modelled on `SettingsDialog.tsx` (react-aria `Modal` + `Tabs`), not `CommandPalette`. Focus restore is automatic (react-aria `Modal` wraps content in a `FocusScope` with `restoreFocus`) — no manual `openerRef`/`document.activeElement`. No manual `announce()` — react-aria Dialog announces natively when focus enters. The dialog title is `<Heading slot="title" level={1}>` — without the explicit `level`, react-aria defaults to `level={3}`, which would make the `h2` content below it a backward `h3 → h2` jump.

- [ ] **Step 1: Add the `$helpOpen` atom (keep `$shortcutsHelpOpen` for now)**

In `src/stores/navigation.ts`, add a line after the existing `$shortcutsHelpOpen` so the file reads:
```ts
export const $shortcutsHelpOpen = atom<boolean>(false);
export const $helpOpen = atom<boolean>(false);
```

- [ ] **Step 2: Write the failing behaviour test**

The default active tab is **overview**, and react-aria mounts only the selected `TabPanel`, so the shortcut-combo assertions must come **after** activating the shortcuts tab. `vi.mock` pins the locale to `uk` (the schedule/profile tests' pattern); real paraglide messages still resolve — only `getLocale` is mocked, and the message files' other runtime import (`experimentalStaticLocale`) falling through to `undefined` is harmless (`undefined ?? options.locale ?? getLocale()`).

Create `src/components/common/HelpDialog.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpDialog } from "./HelpDialog";
import { $helpOpen } from "../../stores/navigation";

vi.mock("../../i18n/paraglide/runtime", () => ({ getLocale: () => "uk" }));

beforeEach(() => $helpOpen.set(false));

describe("HelpDialog", () => {
  it("renders nothing while closed", () => {
    render(<HelpDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on the overview tab with markdown content in the DOM", () => {
    act(() => $helpOpen.set(true));
    render(<HelpDialog />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Overview HTML (compiled from docs/help/uk/overview.md) is the default panel.
    expect(screen.getByText(/Ласкаво просимо/)).toBeTruthy();
  });

  it("shows a representative combo from every group after switching to the shortcuts tab", async () => {
    act(() => $helpOpen.set(true));
    render(<HelpDialog />);
    await userEvent.click(screen.getByRole("tab", { name: "Гарячі клавіші" }));
    expect(screen.getByText("Ctrl+K")).toBeTruthy();    // global
    expect(screen.getByText("Alt+1")).toBeTruthy();     // navigation
    expect(screen.getByText("Ctrl+N")).toBeTruthy();    // context
    expect(screen.getByText("Shift+F10")).toBeTruthy(); // list
  });

  it("closes when the store flips to false", () => {
    act(() => $helpOpen.set(true));
    render(<HelpDialog />);
    act(() => $helpOpen.set(false));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test -- HelpDialog`
Expected: FAIL — "Failed to resolve import './HelpDialog'" (the component does not exist yet). Only `HelpDialog.test.tsx` runs; the substring filter excludes the still-present `KeyboardShortcutsDialog.test.tsx`.

- [ ] **Step 4: Create the component**

Tabs (7), default active = `overview` (`autoFocus` on the overview tab; react-aria selects the first tab by default). Order: `overview`, `shortcuts`, `recording`, `wishlist`, `templates`, `scheduling`, `profiles`. Vertical tab list on the left, panels on the right. Each markdown panel reads `getHelpHtml(locale, section)`; the shortcuts panel renders `<ShortcutsHelp />`. react-aria mounts only the selected `TabPanel`.

Create `src/components/common/HelpDialog.tsx`:
```tsx
import { Dialog, Modal, ModalOverlay, Heading, Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $helpOpen } from "../../stores/navigation";
import { getLocale } from "../../i18n/paraglide/runtime";
import * as m from "../../i18n/paraglide/messages";
import { getHelpHtml } from "./helpContent";
import { HelpContent } from "./HelpContent";
import { ShortcutsHelp } from "./ShortcutsHelp";

const TAB_CLS =
  "cursor-pointer rounded border-l-2 border-transparent px-3 py-2 text-left text-sm text-slate-400 outline-none hover:text-slate-200 selected:border-blue-400 selected:text-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText] forced-colors:selected:border-[Highlight] forced-colors:selected:text-[HighlightText]";

export function HelpDialog() {
  const isOpen = useStore($helpOpen);
  if (!isOpen) return null;

  const locale = getLocale();

  return (
    <ModalOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) $helpOpen.set(false);
      }}
      isDismissable
    >
      <Modal className="flex h-[80vh] w-[90vw] max-w-3xl flex-col rounded-lg bg-slate-800 shadow-2xl outline-none">
        <Dialog aria-label={m.help_title()} className="flex h-full flex-col outline-none">
          <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
            <Heading slot="title" level={1} className="text-lg font-semibold text-slate-100">
              {m.help_title()}
            </Heading>
            <button
              onClick={() => $helpOpen.set(false)}
              aria-label={m.settings_close()}
              className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              ✖
            </button>
          </div>
          <Tabs orientation="vertical" className="flex flex-1 overflow-hidden">
            <TabList
              aria-label={m.help_sections_label()}
              className="flex w-48 flex-col gap-1 overflow-y-auto border-r border-slate-700 px-2 py-4"
            >
              <Tab id="overview" autoFocus className={TAB_CLS}>{m.help_section_overview()}</Tab>
              <Tab id="shortcuts" className={TAB_CLS}>{m.shortcuts_help_title()}</Tab>
              <Tab id="recording" className={TAB_CLS}>{m.help_section_recording()}</Tab>
              <Tab id="wishlist" className={TAB_CLS}>{m.help_section_wishlist()}</Tab>
              <Tab id="templates" className={TAB_CLS}>{m.help_section_templates()}</Tab>
              <Tab id="scheduling" className={TAB_CLS}>{m.help_section_scheduling()}</Tab>
              <Tab id="profiles" className={TAB_CLS}>{m.help_section_profiles()}</Tab>
            </TabList>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <TabPanel id="overview"><HelpContent html={getHelpHtml(locale, "overview")} /></TabPanel>
              <TabPanel id="shortcuts"><ShortcutsHelp /></TabPanel>
              <TabPanel id="recording"><HelpContent html={getHelpHtml(locale, "recording")} /></TabPanel>
              <TabPanel id="wishlist"><HelpContent html={getHelpHtml(locale, "wishlist")} /></TabPanel>
              <TabPanel id="templates"><HelpContent html={getHelpHtml(locale, "templates")} /></TabPanel>
              <TabPanel id="scheduling"><HelpContent html={getHelpHtml(locale, "scheduling")} /></TabPanel>
              <TabPanel id="profiles"><HelpContent html={getHelpHtml(locale, "profiles")} /></TabPanel>
            </div>
          </Tabs>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test -- HelpDialog`
Expected: PASS (all four cases). This also confirms the `?help` glob + paraglide messages resolve in the rendered component under vitest.

> If the "switching to the shortcuts tab" case fails to find `Ctrl+K` (react-aria's `usePress` ignores a bare synthetic `click` — `userEvent.click` fires the full pointer/mouse sequence, which it handles, but jsdom lacks `PointerEvent` so it falls back to mouse events), fall back to keyboard activation: focus the tablist and arrow to the tab —
> ```tsx
> const tab = screen.getByRole("tab", { name: "Гарячі клавіші" });
> await userEvent.click(tab);            // primary path
> // fallback if needed: tab.focus(); await userEvent.keyboard("{Enter}");
> ```
> Do **not** switch to `fireEvent.click` — that fires only a `click` event, which react-aria's press handling does not act on.

- [ ] **Step 6: Run the full suite (no regressions; old dialog still works)**

Run: `pnpm test`
Expected: PASS — the old `KeyboardShortcutsDialog` and its test are untouched and still green (`$shortcutsHelpOpen` is still exported).

- [ ] **Step 7: Commit**

```bash
git add src/stores/navigation.ts src/components/common/HelpDialog.tsx src/components/common/HelpDialog.test.tsx
git commit -m "feat(help): HelpDialog component + \$helpOpen store atom"
```

---

## Task 10: Repoint F1 + App onto HelpDialog

**Files:**
- Modify: `src/hooks/useGlobalShortcuts.ts:4,30`
- Modify: `src/App.tsx:10,378`

> After this task, F1 sets `$helpOpen` and `App` renders `HelpDialog`. The old `KeyboardShortcutsDialog` becomes dead code (no longer rendered, but still compiles on the still-exported `$shortcutsHelpOpen`) — removed in Task 11.

- [ ] **Step 1: Point `openHelp` at `$helpOpen`**

In `src/hooks/useGlobalShortcuts.ts`, change the import on line 4:
```ts
import { $activeSection, $commandPaletteOpen, $helpOpen } from "../stores/navigation";
```
and the action on line 30:
```ts
      openHelp: () => $helpOpen.set(true),
```

- [ ] **Step 2: Swap the import + render in `App.tsx`**

In `src/App.tsx`, change line 10:
```tsx
import { HelpDialog } from "./components/common/HelpDialog";
```
and line 378 (inside the `App` function's render):
```tsx
      <HelpDialog />
```

- [ ] **Step 3: Run the full suite**

Run: `pnpm test`
Expected: PASS. `useGlobalShortcuts.test.tsx` does not assert on the help store, so the repoint is transparent to it; the old dialog test still passes standalone.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useGlobalShortcuts.ts src/App.tsx
git commit -m "feat(help): F1 + App render HelpDialog via \$helpOpen"
```

---

## Task 11: Remove the old dialog and `$shortcutsHelpOpen`

**Files:**
- Delete: `src/components/common/KeyboardShortcutsDialog.tsx`
- Delete: `src/components/common/KeyboardShortcutsDialog.test.tsx`
- Modify: `src/stores/navigation.ts` (remove `$shortcutsHelpOpen`)
- Modify: `src/lib/shortcuts.ts:62`
- Modify: `docs/keyboard-shortcuts.md:139`

- [ ] **Step 1: Delete the old dialog and its test**

```bash
git rm src/components/common/KeyboardShortcutsDialog.tsx src/components/common/KeyboardShortcutsDialog.test.tsx
```

- [ ] **Step 2: Remove the now-unused `$shortcutsHelpOpen` atom**

In `src/stores/navigation.ts`, delete the line (leaving `$helpOpen`):
```ts
export const $shortcutsHelpOpen = atom<boolean>(false);
```

- [ ] **Step 3: Update the `SHORTCUTS` doc comment in `shortcuts.ts`**

In `src/lib/shortcuts.ts`, in the block comment above `SHORTCUTS` (≈ line 62), change:
```
 * the KeyRecorder. reservedShortcuts.ts and KeyboardShortcutsDialog derive from
```
to:
```
 * the KeyRecorder. reservedShortcuts.ts and ShortcutsHelp derive from
```

- [ ] **Step 4: Fix the dangling doc link in `docs/keyboard-shortcuts.md`**

In `docs/keyboard-shortcuts.md` line 139, change:
```
> ([KeyboardShortcutsDialog.tsx](../src/components/common/KeyboardShortcutsDialog.tsx)).
```
to:
```
> ([ShortcutsHelp.tsx](../src/components/common/ShortcutsHelp.tsx)).
```

- [ ] **Step 5: Verify nothing references the removed symbols**

Run: `git grep -n "KeyboardShortcutsDialog\|shortcutsHelpOpen" -- src`
Expected: no matches in `src/`.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: PASS — the old dialog test is gone; every remaining suite is green.

- [ ] **Step 7: Commit**

```bash
git add src/stores/navigation.ts src/lib/shortcuts.ts docs/keyboard-shortcuts.md
git commit -m "refactor(help): remove KeyboardShortcutsDialog + \$shortcutsHelpOpen, fix refs"
```

---

## Task 12: Scoped `.help-content` styling

**Files:**
- Modify: `src/styles.css` (append a new block)

> No `@tailwindcss/typography`. Explicit high-contrast styles for `h2`/`h3`/`ul`/`ol`/`code`/`pre`/`a`/`p`, plus a `forced-colors` rule — consistent with the file's existing conventions (raw CSS after the Tailwind import).

- [ ] **Step 1: Append the `.help-content` block to `src/styles.css`**

Add at the end of `src/styles.css`:
```css
/* Scoped styling for build-time-rendered help HTML (HelpContent). */
.help-content {
  color: oklch(0.87 0.01 256);
  line-height: 1.6;
}
.help-content h2 {
  margin: 1.25rem 0 0.5rem;
  font-size: 1.05rem;
  font-weight: 600;
  color: oklch(0.96 0.01 256);
}
.help-content h2:first-child {
  margin-top: 0;
}
.help-content h3 {
  margin: 1rem 0 0.5rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: oklch(0.92 0.01 256);
}
.help-content p {
  margin: 0.5rem 0;
}
.help-content ul,
.help-content ol {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}
.help-content ul {
  list-style: disc;
}
.help-content ol {
  list-style: decimal;
}
.help-content li {
  margin: 0.25rem 0;
}
.help-content code {
  border-radius: 0.25rem;
  background: oklch(0.28 0.01 256);
  padding: 0.1rem 0.35rem;
  font-family: ui-monospace, monospace;
  font-size: 0.85em;
  color: oklch(0.94 0.01 256);
}
.help-content pre {
  margin: 0.75rem 0;
  overflow-x: auto;
  border-radius: 0.375rem;
  background: oklch(0.24 0.01 256);
  padding: 0.75rem 1rem;
}
.help-content pre code {
  background: none;
  padding: 0;
}
.help-content a {
  color: oklch(0.72 0.14 254);
  text-decoration: underline;
}

@media (forced-colors: active) {
  .help-content code,
  .help-content pre {
    border: 1px solid CanvasText;
  }
  .help-content a {
    color: LinkText;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles.css
git commit -m "style(help): scoped .help-content typography + forced-colors rule"
```

---

## Task 13: Final verification gates

**Files:** (none — verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all suites green, including `helpContent` and `HelpDialog`, and no reference to the deleted `KeyboardShortcutsDialog` test.

- [ ] **Step 2: Run the production build**

Run: `pnpm vite:build`
Expected: build succeeds. This exercises the markdown-help plugin's `load` hook for every `.md?help` import and regenerates paraglide. Confirm no warning about a missing `?help` resolution or unresolved `help_*` message.

- [ ] **Step 3: Confirm the runtime bundle did not gain the markdown toolchain**

Run: `git grep -n "remark\|rehype\|unified" -- src`
Expected: no matches in `src/` (the toolchain is imported only by `build/markdownHelpPlugin.ts`, which the app bundle never imports).

- [ ] **Step 4: Final commit (if any verification touched files)**

If steps 1–3 produced no changes, there is nothing to commit. Otherwise:
```bash
git add -A
git commit -m "chore(help): verification pass"
```

---

## Self-Review Notes (spec coverage)

- **A. Vite plugin** → Task 2 (processor chain, `enforce: "pre"`, URLSearchParams + `.md` guard, `addWatchFile`), Task 3 step 1 (registered first).
- **Plugin location / Node types** → Task 1 (no `@types/node`) + `build/` location (Tasks 2/3): option (b), outside the `src` `tsc` include.
- **B. Content loading + locale** → Task 5 (eager glob, locale map, `getLocale()`).
- **C. Heading structure** → Task 9 (`Heading slot="title" level={1}`), Task 4 (md authored at `##`), Task 7 (group labels `h3 → h2`).
- **D. Components** → Tasks 6 (HelpContent), 7 (ShortcutsHelp), 9 (HelpDialog: SettingsDialog model, automatic focus restore, no manual announce, 7 tabs default overview).
- **E. Content files** → Task 4 (overview full + 5 stubs × 2 locales; shortcuts not a md file).
- **F. i18n** → Task 8 (source JSON keys + regenerate; reuses `shortcuts_help_title`).
- **G. Styling** → Task 12 (scoped `.help-content`, no typography plugin, forced-colors).
- **H. Integration & deletions** → the spec's `$shortcutsHelpOpen → $helpOpen` "rename" is realised as an additive, always-green migration: Task 9 (add `$helpOpen` + HelpDialog), Task 10 (useGlobalShortcuts repoint + App.tsx swap), Task 11 (delete dialog + remove `$shortcutsHelpOpen` + shortcuts.ts comment + the extra `docs/keyboard-shortcuts.md` fix); Task 3 step 3 (`src/markdown.d.ts`).
- **I. Tests** → Task 5 (glob resolves through vitest), Task 9 (HelpDialog: test-first open/close, tab switch, combos after activating shortcuts tab, `vi.mock` getLocale), Task 3 step 2 (`markdownHelpPlugin()` in `vitest.config.ts`), Task 13 (gates: `pnpm test` + `pnpm vite:build`).
- **Risks/notes** → Task 4 (no links in webview), Task 2 (URLSearchParams parsing), Task 5/Task 13 (glob resolves under vitest).
- **Always-green ordering** → no committed task leaves `pnpm test` red: the only full-suite runs are Task 3 (plugin inert), Task 9 step 6, Task 10 step 3, Task 11 step 6, and Task 13 — each at a consistent tree state.
