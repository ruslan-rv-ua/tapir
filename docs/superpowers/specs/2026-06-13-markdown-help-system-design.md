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

- `enforce: "pre"`, registered first in `vite.config.ts`.
- Sanitization runs at build time (defense-in-depth, zero runtime cost).
- New **devDependencies** (build-time only — runtime bundle unchanged):
  `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-sanitize`,
  `rehype-stringify`.

### B. Content loading + locale

```ts
import.meta.glob("../../../docs/help/*/*.md", {
  query: "?help", import: "default", eager: true,
})
```

Build a `{ locale → { sectionId → html } }` map. Active locale comes from
paraglide `getLocale()` (returns `"uk"` / `"en"`), not from settings.

### C. Heading structure (a11y)

- Dialog title = `h1` ("Довідка Tapir" / "Tapir Help").
- Markdown files are authored starting at `##` — no own `h1` — so NVDA heading
  navigation has no level jumps.
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
  `TabPanel` = content. Focus restore via the `openerRef` /
  `document.activeElement` pattern already used in `CommandPalette`.
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
- TS ambient: `src/markdown.d.ts` →
  `declare module "*.md?help" { const html: string; export default html; }`.
- No Command Palette change.

### I. Tests

- `KeyboardShortcutsDialog.test.tsx` → `HelpDialog.test.tsx`: open/close via
  `$helpOpen`; a representative combo from each group renders in the shortcuts
  tab; tab switching works (overview ↔ shortcuts). vitest runs through
  `vite.config.ts`, so `?help` imports resolve in tests.
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
- Verify `import.meta.glob` with `query: "?help"` resolves through the plugin in
  the vitest environment during test setup.
