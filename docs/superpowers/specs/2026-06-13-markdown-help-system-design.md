# Design: Markdown help system via build-time Vite plugin

**Date:** 2026-06-13
**Branch:** `feature/markdown-help`
**Status:** Approved (design), pending implementation plan

## Goal

Replace the keyboard-shortcuts-only F1 dialog with a full, accessible Help dialog.
Prose help lives in Markdown files under `docs/help/{locale}/`, compiled to
sanitized HTML at build time by a Vite plugin. The shortcuts section stays
data-driven from the existing `SHORTCUTS` registry — never duplicated into
Markdown. NVDA-first: clean heading structure, react-aria semantics, reliable
focus handling.

## Chosen approach

**Build-time HTML via a remark/rehype Vite plugin.** A `*.md?help` import is
transformed by `unified` into a sanitized HTML string at build time. The runtime
bundle gains **no** Markdown or sanitizer code.

Rejected alternatives:

- **`?raw` + `marked` at runtime** — simplest, but ships `marked` (~35 KB) and
  re-parses on every open.
- **`marked` inside the plugin** — needs extra extensions for heading ids and
  cannot sanitize; the `headerIds`/`mangle` options the original spec used were
  removed from `marked` v8+ (no-ops in v15).

## Decisions locked in brainstorming

- **Content scope (v1):** full `overview` (uk + en) + data-driven shortcuts tab.
  The other five sections ship as short "coming soon" stub `.md` files, to be
  filled later.
- **Anchors:** no in-page `[text](#id)` anchors in v1. Flat layout — one section
  per tab.
- **Old dialog:** `KeyboardShortcutsDialog` is fully replaced. Store
  `$shortcutsHelpOpen` → `$helpOpen`. F1 is the single entry point.
- **No Command Palette entry** for Help (F1 only).
- **Content loading:** eager `import.meta.glob` (synchronous render — content is
  in the DOM immediately, best for NVDA; both-locale payload of tiny HTML strings
  is negligible). Not lazy/per-locale.

## Architecture

### A. Vite plugin — `src/vite/markdownHelpPlugin.ts`

A single shared `unified` processor:

```
remark-parse → remark-gfm → remark-rehype → rehype-sanitize → rehype-stringify
```

```ts
async load(id) {
  const [file, rawQuery = ""] = id.split("?");
  if (!new URLSearchParams(rawQuery).has("help")) return null;
  if (!file.endsWith(".md")) return null;
  this.addWatchFile(file);                     // reliable HMR on .md edits
  const html = String(await processor.process(await readFile(file, "utf8")));
  return `export default ${JSON.stringify(html)};`;
}
```

- `enforce: "pre"`, registered first in `vite.config.ts`. Type the export as a
  Vite `Plugin` so `this.addWatchFile` is typed.
- Sanitization runs at build time (defense-in-depth, zero runtime cost).
- New **devDependencies** (build-time only — runtime bundle unchanged):
  `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-sanitize`,
  `rehype-stringify`, **and `@types/node`**.
- **Node types / file location:** the plugin imports `node:fs/promises`, but
  `tsconfig.json` is `include: ["src"]` with no `node` types and a DOM-only
  `lib`, and `@types/node` is not currently installed. Because the plugin lives
  under `src/`, `tsc` type-checks it — so either (a) add `@types/node` (above),
  or (b) move the plugin out of `src/` (e.g. a root `build/` dir) so it is not in
  the frontend `include`. Putting Node-only build code under `src/` (the webview
  bundle root) is a smell; (b) is the cleaner option, but either works. Whichever
  is chosen, `vite.config.ts` imports it (it is outside `include` itself), and
  nothing in the app bundle imports it, so the runtime bundle stays unchanged.

### B. Content loading + locale

```ts
import.meta.glob("../../../docs/help/*/*.md", {
  query: "?help", import: "default", eager: true,
})
```

Build a `{ locale → { sectionId → html } }` map. Active locale comes from
paraglide `getLocale()` (returns `"uk"` / `"en"`), not from settings.

### C. Heading structure (a11y)

- Dialog title = `h1` ("Довідка Tapir" / "Tapir Help"). **Must pass
  `<Heading slot="title" level={1}>`** — react-aria's `Heading` defaults to
  `level={3}` (what `SettingsDialog`/the old dialog render today), so without the
  explicit level the title would be an `h3` and the `##` content below it would
  be a backward `h3 → h2` jump — the opposite of the goal.
- Markdown files are authored starting at `##` — no own `h1` — so NVDA heading
  navigation has no level jumps (`h1` title → `h2` sections).
- **Shortcuts tab:** `ShortcutsHelp` currently renders its group labels as `h3`
  (carried over from `KeyboardShortcutsDialog`). Demote them to `h2` so the
  shortcuts tab matches the markdown tabs' single-level-under-`h1` structure
  (otherwise that tab alone has an `h1 → h3` jump).
- One section per tab; no intra-document anchors.

### D. Components

- `src/vite/markdownHelpPlugin.ts` — the plugin (above).
- `src/components/common/HelpContent.tsx` — injects trusted HTML into
  `<div className="help-content" dangerouslySetInnerHTML={{ __html }} />`.
  **No DOMPurify** (already sanitized at build time).
- `src/components/common/ShortcutsHelp.tsx` — extracted from the current
  `KeyboardShortcutsDialog` body (`GROUP_ORDER` / `GROUP_LABEL` / `SHORTCUTS`
  → `<dl>`). Reused as the "shortcuts" tab content.
- `src/components/common/HelpDialog.tsx` — react-aria `Modal` / `Dialog` +
  react-aria `Tabs orientation="vertical"`: left `TabList` = sections,
  `TabPanel` = content. **Model it on `SettingsDialog.tsx`** (the existing
  react-aria `Modal` + `Tabs` dialog), not `CommandPalette`. Focus restore is
  **automatic** — react-aria's `Modal` wraps content in a `FocusScope` with
  `restoreFocus`, so focus returns to the opener (the element focused when F1
  fired) on close. Do **not** add the manual `openerRef`/`document.activeElement`
  pattern: `CommandPalette` only hand-rolls it because it is a plain `role=
  "dialog"` div, not a react-aria `Modal`.
  **No manual `announce()`** — rely on react-aria Dialog's native announcement
  (focus enters the dialog; NVDA reads the dialog label + active tab). This
  sidesteps the aria-hidden-inside-modal live-region pitfall.

**Tabs (7), default active = overview:**
`overview`, `shortcuts` (data-driven), `recording`, `wishlist`, `templates`,
`scheduling`, `profiles`.

### E. Content files — `docs/help/{uk,en}/`

```
docs/help/uk/{overview,recording,wishlist,templates,scheduling,profiles}.md
docs/help/en/{overview,recording,wishlist,templates,scheduling,profiles}.md
```

- `overview.md` (uk + en): full content.
- The other five (uk + en): short stub — a `##` heading + one line
  ("Цей розділ незабаром буде доповнено." / "This section is coming soon.").
- Shortcuts is **not** a Markdown file — it is the data-driven tab.

### F. i18n

Source: `src/i18n/messages/{uk,en}.json` (NOT the generated `src/i18n/paraglide/`
output). Regenerate paraglide via the Vite plugin (runs on build/dev).

New keys: `help_title`, `help_sections_label` (aria-label for the TabList),
`help_section_overview`, `help_section_recording`, `help_section_wishlist`,
`help_section_templates`, `help_section_scheduling`, `help_section_profiles`.
The shortcuts tab reuses the existing `shortcuts_help_title`.

### G. Styling

No `@tailwindcss/typography`. A scoped `.help-content` block in `src/styles.css`
with explicit, high-contrast styles for `h2`/`h3`/`ul`/`ol`/`code`/`pre`/`a`
plus a `forced-colors` rule, consistent with the file's existing conventions.

### H. Integration & deletions

- `src/stores/navigation.ts`: `$shortcutsHelpOpen` → `$helpOpen` (update all
  usages).
- `src/hooks/useGlobalShortcuts.ts`: `openHelp` → `$helpOpen.set(true)`.
- `src/App.tsx`: replace `KeyboardShortcutsDialog` import + render with
  `HelpDialog`.
- **Delete** `src/components/common/KeyboardShortcutsDialog.tsx`.
- `src/lib/shortcuts.ts`: the doc comment above `SHORTCUTS` (≈ line 62) names
  `KeyboardShortcutsDialog` as a derived consumer — update it to `ShortcutsHelp`
  so it doesn't dangle after the deletion.
- TS ambient: `src/markdown.d.ts` →
  `declare module "*.md?help" { const html: string; export default html; }`.
  (`import.meta.glob` typing already comes from the `vite/client` reference in
  `src/vite-env.d.ts`.)
- No Command Palette change.

### I. Tests

- `KeyboardShortcutsDialog.test.tsx` → `HelpDialog.test.tsx`: open/close via
  `$helpOpen`; tab switching works (overview ↔ shortcuts); after switching to
  the shortcuts tab, a representative combo from each group renders. Note the
  default active tab is **overview**, and react-aria mounts only the selected
  `TabPanel`, so the combo assertions must come **after** activating the
  shortcuts tab (the old test asserted them immediately — update it).
- **Test config (must-fix):** vitest does **not** run through `vite.config.ts`.
  There is a standalone `vitest.config.ts` whose comment explicitly states it
  omits the `vite.config.ts` plugins. So `*.md?help` and
  `import.meta.glob(..., { query: "?help" })` will **not** resolve under vitest
  as written. Add `markdownHelpPlugin()` (with `enforce: "pre"`) to the
  `plugins` array in `vitest.config.ts`. (Paraglide messages still resolve
  without their plugin because they are generated to disk; only the `?help`
  transform needs wiring up.)
- The test should `vi.mock("../../i18n/paraglide/runtime", () => ({ getLocale:
  () => "uk" }))` for a deterministic locale — the same pattern the schedule /
  profile tests already use. (Default `getLocale()` returns base locale `uk`,
  but pin it explicitly.)
- Gates: `pnpm test` + `pnpm vite:build`. Paraglide regenerates via its Vite
  plugin on build/dev.

## Out of scope (v1, YAGNI)

Intra-document anchors; full prose for the five non-overview sections; the
typography plugin; runtime sanitization; manual `announce()` on open; a Command
Palette Help entry.

## Risks / notes

- `?help` query parsing must use `URLSearchParams` (Vite may append extra query
  params); guard on `.md` extension.
- react-aria Tabs inside Dialog provides roving tabindex + arrow-key navigation
  for free — strictly better for NVDA than hand-rolled nav buttons.
- **External links in a Tauri webview:** the default `rehype-sanitize` schema
  permits `<a href>`. In the webview, a plain `<a href="https://…">` click
  navigates the whole SPA away (white-screens the app). v1 `overview.md` should
  therefore avoid links; if any are needed later, `HelpContent` must intercept
  link clicks and route external URLs through the Tauri opener (open in the
  system browser) rather than letting the webview follow them. Keep this in mind
  when authoring the "coming soon" stubs too.
- `import.meta.glob` with `query: "?help"` only resolves in vitest once
  `markdownHelpPlugin()` is added to `vitest.config.ts` (see Tests) — the
  standalone test config does not inherit `vite.config.ts` plugins. Verify the
  glob resolves through the plugin in the vitest environment.
