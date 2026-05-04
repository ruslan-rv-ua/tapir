# Streams Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Tapir streams screen to match the mockup at `docs/ui/01-streams-screen.html` — wide labeled ActivityBar with profile card, metrics+search toolbar with filter chips, CSS-grid stream rows with status dot, and a 3-panel PlayerPanel.

**Architecture:** In-place restyling (Approach A). No new files; all navigation hooks (`useRovingFocus`, `useZoneNavigation`) are kept intact. The old `streams-actions` zone is replaced by a `streams-toolbar` zone using `mixed-boundary-handoff` mode (8 items including a search input). Zone cycle: `activity-bar` → `streams-toolbar` → `streams-list` → `player` → `status-bar`.

**Tech Stack:** React 19, Tailwind CSS, React Aria Components, Nanostores, Paraglide.js i18n, Lucide React icons.

**Spec reference:** `docs/superpowers/specs/2026-05-04-streams-screen-redesign.md`

**TypeScript check:** `npx tsc --noEmit` (run from `C:\dev\Tapir`)  
**Cargo check:** Not needed — no Rust changes.

---

## Chunk 1: Infrastructure — i18n, ActivityBar, App.tsx

### Task 1: Add i18n keys

**Files:**
- Modify: `src/i18n/messages/uk.json`
- Modify: `src/i18n/messages/en.json`

- [ ] **Step 1: Add all new keys to `uk.json`**

Add the following entries to `uk.json`. Insert near the end, before the closing `}`. Do **not** add keys already present (`column_status`, `column_bitrate`, `column_duration`, `column_actions`, `stop_all`).

```json
  "streams_count_zero": "Немає потоків",
  "streams_count_one": "{count} потік",
  "streams_count_few": "{count} потоки",
  "streams_count_many": "{count} потоків",
  "active_recordings_zero": "Немає записів",
  "active_recordings_one": "{count} запис",
  "active_recordings_few": "{count} записи",
  "active_recordings_many": "{count} записів",
  "errors_count_zero": "Немає збоїв",
  "errors_count_one": "{count} збій",
  "errors_count_few": "{count} збої",
  "errors_count_many": "{count} збоїв",
  "zone_streams_toolbar": "Пошук і фільтри",
  "streams_search_label": "Пошук потоків або URL",
  "filter_all": "Усі",
  "filter_recording": "Записуються",
  "filter_errors": "З помилками",
  "filter_selected": "Вибрані",
  "metric_streams_in_profile": "У профілі",
  "metric_active_recordings": "Активні",
  "metric_errors": "Потребує уваги",
  "metric_free_space": "Вільно",
  "profile_name": "Профіль",
  "column_station": "Станція",
  "column_now_playing": "Зараз грає",
  "player_now_playing": "Зараз грає",
  "player_controls": "Керування",
  "player_output": "Вивід",
  "player_prev": "Попередній потік",
  "player_next": "Наступний потік",
  "player_mute": "Вимкнути/увімкнути звук",
  "player_active_recording": "Активний запис",
  "player_device": "Пристрій",
  "player_volume": "Гучність",
  "commands_label": "Команди",
  "player_listening": "Прослуховування"
```

- [ ] **Step 2: Add all new keys to `en.json`**

Add the following entries to `en.json`, before the closing `}`:

```json
  "streams_count_zero": "No streams",
  "streams_count_one": "{count} stream",
  "streams_count_few": "{count} streams",
  "streams_count_many": "{count} streams",
  "active_recordings_zero": "No recordings",
  "active_recordings_one": "{count} recording",
  "active_recordings_few": "{count} recordings",
  "active_recordings_many": "{count} recordings",
  "errors_count_zero": "No errors",
  "errors_count_one": "{count} error",
  "errors_count_few": "{count} errors",
  "errors_count_many": "{count} errors",
  "zone_streams_toolbar": "Search and filters",
  "streams_search_label": "Search streams or URL",
  "filter_all": "All",
  "filter_recording": "Recording",
  "filter_errors": "With errors",
  "filter_selected": "Selected",
  "metric_streams_in_profile": "In profile",
  "metric_active_recordings": "Active",
  "metric_errors": "Needs attention",
  "metric_free_space": "Free space",
  "profile_name": "Profile",
  "column_station": "Station",
  "column_now_playing": "Now playing",
  "player_now_playing": "Now playing",
  "player_controls": "Controls",
  "player_output": "Output",
  "player_prev": "Previous stream",
  "player_next": "Next stream",
  "player_mute": "Mute/unmute",
  "player_active_recording": "Active recording",
  "player_device": "Device",
  "player_volume": "Volume",
  "commands_label": "Commands",
  "player_listening": "Listening"
```

- [ ] **Step 3: Regenerate paraglide message types**

`src/i18n/paraglide/` is gitignored and generated at build time. Adding new JSON keys requires regeneration before new `m.*` functions are available in TypeScript. Run:

```
pnpm vite:build
```

Expected: build completes (TS type-check warnings are fine). The `src/i18n/paraglide/` directory is now up to date with the new keys.

> ⚠️ `src/i18n/paraglide/` is gitignored — do NOT include it in the commit.

- [ ] **Step 4: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors related to missing i18n keys. (Pre-existing paraglide import warnings are expected and should be ignored.)

- [ ] **Step 5: Commit**

```
git add src/i18n/messages/uk.json src/i18n/messages/en.json
git commit -m "feat(i18n): add keys for streams screen redesign

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: ActivityBar redesign

**Files:**
- Modify: `src/components/layout/ActivityBar.tsx`

**Changes needed:**
1. Nav `<nav>` width: `w-12` → `w-56`
2. Nav buttons: icon-only → icon + text label; update className for wide layout
3. Settings button: keep icon-only but ensure it fits the wider nav
4. Add profile card at the bottom (below Settings, inside `mt-auto` div)
5. Import `User` icon from `lucide-react` and `$settings` store

- [ ] **Step 1: Update imports in ActivityBar.tsx**

Add `User` to the lucide import line, and import `$settings`:

```tsx
import { Radio, Globe, Heart, Calendar, Music, Settings, User } from "lucide-react";
import { $settings } from "../../stores/settings";
```

- [ ] **Step 2: Add `$settings` store usage**

Inside the `ActivityBar` component body, after `const activeSection = useStore($activeSection);`, add:

```tsx
const settings = useStore($settings);
```

- [ ] **Step 3: Update nav element and button className**

Replace the `<nav>` opening tag's className:

```tsx
// Before:
className="flex w-12 flex-col items-center gap-1 border-r border-slate-700 bg-slate-900 py-2"

// After:
className="flex w-56 flex-col gap-1 border-r border-slate-700 bg-slate-900 py-2 px-2"
```

Replace the section button's className (currently a template literal for active/disabled/default states). The new classes give each button a full-width layout with a left accent on active state:

```tsx
className={`flex w-full items-center gap-3 px-3 py-3 rounded-xl border-l-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
  activeSection === sec.id
    ? "border-blue-400 bg-slate-700/60 text-blue-400 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:border-[Highlight]"
    : sec.disabled
    ? "border-transparent cursor-not-allowed text-slate-600 forced-colors:text-[GrayText]"
    : "border-transparent text-slate-400 hover:bg-slate-700/40 hover:text-slate-200 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
}`}
```

- [ ] **Step 4: Add text label inside each nav button**

Inside the `<Button>` for sections, after `<sec.Icon size={20} aria-hidden={true} />`, add:

```tsx
<span className="text-sm">{sec.label()}</span>
```

Keep the `aria-label` attribute — it matches the visible text and ensures screen reader compatibility. Keep the existing `aria-disabled` / `aria-describedby` / `aria-pressed` attributes unchanged.

The full section button after changes:

```tsx
<Button
  key={sec.id}
  ref={allRefs[i]}
  aria-label={sec.label()}
  aria-pressed={activeSection === sec.id}
  aria-disabled={sec.disabled ? "true" : undefined}
  aria-describedby={sec.disabled ? `nav-${sec.id}-desc` : undefined}
  {...{ tabIndex: getTabIndex(i) }}
  onPress={() => {
    if (sec.disabled) return;
    $activeSection.set(sec.id);
  }}
  className={`flex w-full items-center gap-3 px-3 py-3 rounded-xl border-l-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
    activeSection === sec.id
      ? "border-blue-400 bg-slate-700/60 text-blue-400 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:border-[Highlight]"
      : sec.disabled
      ? "border-transparent cursor-not-allowed text-slate-600 forced-colors:text-[GrayText]"
      : "border-transparent text-slate-400 hover:bg-slate-700/40 hover:text-slate-200 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
  }`}
>
  <sec.Icon size={20} aria-hidden={true} />
  <span className="text-sm">{sec.label()}</span>
  {sec.disabled && (
    <span id={`nav-${sec.id}-desc`} className="sr-only">
      {m.phase_not_available({ phase: sec.phase ?? "" })}
    </span>
  )}
</Button>
```

- [ ] **Step 5: Update Settings button and add profile card**

Replace the `<div className="mt-auto">` block with:

```tsx
<div className="mt-auto flex flex-col gap-2 px-2">
  <Button
    ref={settingsRef}
    aria-label={m.settings_title()}
    {...{ tabIndex: getTabIndex(SECTIONS.length) }}
    onPress={() => $settingsDialogOpen.set(true)}
    className="flex w-full items-center gap-3 px-3 py-3 rounded-xl border-l-2 border-transparent text-slate-400 hover:bg-slate-700/40 hover:text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText] transition-colors"
  >
    <Settings size={20} aria-hidden={true} />
  </Button>

  {/* Profile card — not focusable; NVDA reads as passive text */}
  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/50 text-slate-400">
    <User size={16} aria-hidden={true} className="shrink-0" />
    <div className="min-w-0">
      <strong className="block text-xs text-slate-300 truncate">{m.profile_name()}</strong>
      <span className="block text-xs truncate">
        {settings?.activeProfile ?? "Default"}
      </span>
    </div>
  </div>
</div>
```

- [ ] **Step 6: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```
git add src/components/layout/ActivityBar.tsx
git commit -m "feat(ui): ActivityBar — wide labeled rail + profile card

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Remove SectionHeader from App.tsx

**Files:**
- Modify: `src/App.tsx`

The `SectionHeader.tsx` component file itself is NOT deleted — keep it for potential future use.

- [ ] **Step 1: Remove the SectionHeader import from App.tsx**

Delete the line:
```tsx
import { SectionHeader } from "./components/layout/SectionHeader";
```

- [ ] **Step 2: Remove the SectionHeader JSX usage**

In the `return` of `AppContent`, delete:
```tsx
<SectionHeader section={activeSection} />
```

The remaining `<main>` structure becomes:
```tsx
<main className="flex flex-1 flex-col overflow-hidden">
  {activeSection === "streams" && <StreamsPanel ... />}
  {activeSection === "wishlist" && <WishlistPanel ... />}
  {activeSection === "browser" && <BrowserPanel ... />}
  <PlayerPanel ... />
  <StatusBar ... />
</main>
```

- [ ] **Step 3: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no errors. (`activeSection` may now be unused if only used for `SectionHeader` — check and remove the `const activeSection = useStore($activeSection);` if it becomes truly unused. It's still used by `PERMANENT_ZONE_IDS` logic and section conditionals, so it should be fine.)

- [ ] **Step 4: Commit**

```
git add src/App.tsx
git commit -m "feat(ui): remove SectionHeader — title moves to streams titlebar

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 2: StreamsPanel Restructure

### Task 4: StreamsPanel full restructure

**Files:**
- Modify: `src/components/streams/StreamsPanel.tsx`

This is a near-complete rewrite of the component. The `StreamList`, `AddStreamDialog`, and empty-state logic are preserved; the actions zone is replaced with a toolbar zone; metrics and column headers are new.

**Summary of changes:**
- Remove `actionsZoneRef`, `paletteBtn`, `addBtn`, `stopAllBtn` and their `useRovingFocus` call
- Add `toolbarZoneRef` and 8 refs: `cmdBtn`, `addBtn`, `stopAllBtn`, `searchRef`, `chip0Ref`–`chip3Ref`
- Add `toolbarRestore` / `toolbarKeyDown` / `toolbarTabIndex` / `toolbarMoveTo` from `useRovingFocus(..., "mixed-boundary-handoff", ...)`
- Add `$statuses` store for metrics
- Update `onZonesChange` effect to register `toolbarZone` instead of `actionsZone`
- Render: `<h2>` titlebar, metrics bar, toolbar zone, column headers row, then `<StreamList>`
- Ctrl+F global keydown handler → `toolbarMoveTo(3)` to focus search input

- [ ] **Step 1: Replace StreamsPanel.tsx with the new implementation**

Replace the entire file content with:

```tsx
import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { $streams, $statuses, $showAddStreamDialog } from "../../stores/streams";
import { $commandPaletteOpen } from "../../stores/navigation";
import { StreamList } from "./StreamList";
import { AddStreamDialog } from "./AddStreamDialog";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

const FILTER_CHIPS = [
  { id: "all",       labelFn: () => m.filter_all() },
  { id: "recording", labelFn: () => m.filter_recording() },
  { id: "errors",    labelFn: () => m.filter_errors() },
  { id: "selected",  labelFn: () => m.filter_selected() },
] as const;

export function StreamsPanel({ onZonesChange, exitZone }: Props) {
  const streams = useStore($streams);
  const statuses = useStore($statuses);
  const isEmpty = streams.length === 0;

  // ── Metrics ──────────────────────────────────────────────
  const streamIds = useMemo(() => new Set(streams.map(s => s.id)), [streams]);
  const visibleStatuses = useMemo(
    () => Object.entries(statuses)
      .filter(([id]) => streamIds.has(id))
      .map(([, s]) => s),
    [statuses, streamIds],
  );
  const activeCount = visibleStatuses.filter(s => s.state === "recording").length;
  const errorCount  = visibleStatuses.filter(s => s.state === "error").length;

  const pluralRules = useMemo(
    () => new Intl.PluralRules(document.documentElement.lang || "uk"),
    [],
  );
  const pluralize = useCallback(
    (
      count: number,
      zero: () => string,
      one:  (p: { count: number }) => string,
      few:  (p: { count: number }) => string,
      many: (p: { count: number }) => string,
    ) => {
      if (count === 0) return zero();
      const form = pluralRules.select(count);
      if (form === "one") return one({ count });
      if (form === "few") return few({ count });
      return many({ count });
    },
    [pluralRules],
  );

  const streamCountText = pluralize(
    streams.length,
    m.streams_count_zero,
    m.streams_count_one,
    m.streams_count_few,
    m.streams_count_many,
  );
  const activeRecText = pluralize(
    activeCount,
    m.active_recordings_zero,
    m.active_recordings_one,
    m.active_recordings_few,
    m.active_recordings_many,
  );
  const errorText = pluralize(
    errorCount,
    m.errors_count_zero,
    m.errors_count_one,
    m.errors_count_few,
    m.errors_count_many,
  );

  // ── Filter chip stub state ────────────────────────────────
  const [activeChip, setActiveChip] = useState<string>("all");

  // ── Toolbar zone refs (8 items) ──────────────────────────
  const toolbarZoneRef = useRef<HTMLDivElement | null>(null);
  const cmdBtn     = useRef<HTMLButtonElement | null>(null);
  const addBtn     = useRef<HTMLButtonElement | null>(null);
  const stopAllBtn = useRef<HTMLButtonElement | null>(null);
  const searchRef  = useRef<HTMLInputElement | null>(null);
  const chip0Ref   = useRef<HTMLButtonElement | null>(null);
  const chip1Ref   = useRef<HTMLButtonElement | null>(null);
  const chip2Ref   = useRef<HTMLButtonElement | null>(null);
  const chip3Ref   = useRef<HTMLButtonElement | null>(null);
  const chipRefs = useMemo(() => [chip0Ref, chip1Ref, chip2Ref, chip3Ref], []);
  const toolbarRefs = useMemo(
    () => [cmdBtn, addBtn, stopAllBtn, searchRef, chip0Ref, chip1Ref, chip2Ref, chip3Ref],
    [],
  );

  const {
    onKeyDown: toolbarKeyDown,
    getTabIndex: toolbarTabIndex,
    restoreFocus: toolbarRestore,
    moveTo: toolbarMoveTo,
  } = useRovingFocus(toolbarRefs, "horizontal", {
    mode: "mixed-boundary-handoff",
    onTabBoundary: (forward) => exitZone("streams-toolbar", forward),
  });

  // Ctrl+F: focus the search input via rovingFocus moveTo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        toolbarMoveTo(3); // index 3 = searchRef
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toolbarMoveTo]);

  // ── List zone ────────────────────────────────────────────
  const streamListRef = useRef<ZoneEntry | null>(null);
  const streamListCallbackRef = useCallback((zone: ZoneEntry | null) => {
    streamListRef.current = zone;
  }, []);

  // ── Empty-state zone ─────────────────────────────────────
  const emptyZoneRef      = useRef<HTMLDivElement | null>(null);
  const emptyPaletteBtnRef = useRef<HTMLButtonElement | null>(null);
  const emptyCtaRef       = useRef<HTMLButtonElement | null>(null);
  const emptyBtns = useMemo(() => [emptyPaletteBtnRef, emptyCtaRef], []);
  const { onKeyDown: emptyKeyDown, getTabIndex: emptyTabIndex } =
    useRovingFocus(emptyBtns, "horizontal", {
      mode: "composite-exit",
      onTabOut: (forward) => exitZone("streams-empty", forward),
    });

  // ── Zone registration ────────────────────────────────────
  useEffect(() => {
    if (isEmpty) {
      const emptyZone: ZoneEntry = {
        id: "streams-empty",
        get el() { return emptyZoneRef.current!; },
        focus: (dir) => {
          if (dir === "forward") emptyCtaRef.current?.focus();
          else (emptyPaletteBtnRef.current ?? emptyCtaRef.current)?.focus();
        },
      };
      onZonesChange([emptyZone]);
    } else {
      const toolbarZone: ZoneEntry = {
        id: "streams-toolbar",
        get el() { return toolbarZoneRef.current!; },
        focus: toolbarRestore,
      };
      const zones: ZoneEntry[] = [toolbarZone];
      if (streamListRef.current) zones.push(streamListRef.current);
      onZonesChange(zones);
    }
  // onZonesChange intentionally omitted — callers must pass a stable reference.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmpty, toolbarRestore]);

  const handleStopAll = async () => {
    try { await tauri.stopAllRecordings(); }
    catch (err) { addToast(String(err), "error"); }
  };

  const emptyDescId = "streams-empty-desc";

  return (
    <div className="flex flex-1 flex-col overflow-hidden" role="region" aria-label={m.streams_section()}>
      {isEmpty ? (
        /* ── Empty state ── */
        <div
          ref={emptyZoneRef}
          data-zone-id="streams-empty"
          className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-400"
          onKeyDown={emptyKeyDown}
        >
          <span id={emptyDescId} className="sr-only">{m.streams_empty_description()}</span>
          <button
            ref={emptyPaletteBtnRef}
            tabIndex={emptyTabIndex(0)}
            aria-label={m.command_palette_label()}
            onClick={() => $commandPaletteOpen.set(true)}
            className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
          >
            {m.command_palette_label()}
          </button>
          <button
            ref={emptyCtaRef}
            tabIndex={emptyTabIndex(1)}
            aria-describedby={emptyDescId}
            onClick={() => $showAddStreamDialog.set(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
          >
            {m.add_stream()}
          </button>
        </div>
      ) : (
        <>
          {/* ── Metrics bar ── */}
          <div className="grid grid-cols-4 gap-3 border-b border-slate-700 px-4 py-3 forced-colors:border-[ButtonText]">
            <div className="flex flex-col gap-0.5">
              <strong className="text-sm text-slate-100">{streamCountText}</strong>
              <span className="text-xs text-slate-400">{m.metric_streams_in_profile()}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <strong className="text-sm text-slate-100">{activeRecText}</strong>
              <span className="text-xs text-slate-400">{m.metric_active_recordings()}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <strong className="text-sm text-slate-100">{errorText}</strong>
              <span className="text-xs text-slate-400">{m.metric_errors()}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <strong className="text-sm text-slate-100">—</strong>
              <span className="text-xs text-slate-400">{m.metric_free_space()}</span>
            </div>
          </div>

          {/* ── Workspace titlebar + Toolbar = streams-toolbar zone ── */}
          {/* IMPORTANT: Both rows must live inside the zone div so mixed-boundary-handoff
              sees all 8 interactive items (indices 0–7). h2 is structural, not focusable. */}
          <div
            ref={toolbarZoneRef}
            data-zone-id="streams-toolbar"
            role="toolbar"
            aria-label={m.zone_streams_toolbar()}
            className="border-b border-slate-700 forced-colors:border-[ButtonText]"
            onKeyDown={toolbarKeyDown}
          >
            {/* Row 1: Title + Команди + Додати */}
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-base font-semibold text-slate-100">{m.streams_section()}</h2>
              <div className="flex items-center gap-2">
                {/* Index 0: Команди */}
                <button
                  ref={cmdBtn}
                  tabIndex={toolbarTabIndex(0)}
                  aria-label={m.command_palette_label()}
                  onClick={() => $commandPaletteOpen.set(true)}
                  className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
                >
                  {m.commands_label()}
                </button>
                {/* Index 1: Додати потік */}
                <button
                  ref={addBtn}
                  tabIndex={toolbarTabIndex(1)}
                  onClick={() => $showAddStreamDialog.set(true)}
                  className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
                >
                  {m.add_stream()}
                </button>
              </div>
            </div>

            {/* Row 2: Зупинити все + Search + Chips */}
            <div className="flex items-center gap-2 px-4 py-2">
              {/* Index 2: Зупинити все */}
              <button
                ref={stopAllBtn}
                tabIndex={toolbarTabIndex(2)}
                onClick={handleStopAll}
                className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
              >
                {m.stop_all()}
              </button>

              <div className="mx-1 h-4 w-px bg-slate-700 forced-colors:bg-[ButtonText]" aria-hidden="true" />

              {/* Index 3: Search */}
              <input
                ref={searchRef}
                type="text"
                tabIndex={toolbarTabIndex(3)}
                aria-label={m.streams_search_label()}
                placeholder={m.streams_search_label()}
                className="min-w-0 flex-1 rounded bg-slate-800 px-3 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:text-[CanvasText] forced-colors:border forced-colors:border-[ButtonText]"
                onKeyDown={(e) => {
                  // Prevent arrow keys from being consumed by the outer rovingFocus handler
                  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                    e.stopPropagation();
                  }
                }}
              />

              <div className="mx-1 h-4 w-px bg-slate-700 forced-colors:bg-[ButtonText]" aria-hidden="true" />

              {/* Indices 4–7: Filter chips */}
              {FILTER_CHIPS.map((chip, i) => (
                <button
                  key={chip.id}
                  ref={chipRefs[i]}
                  tabIndex={toolbarTabIndex(4 + i)}
                  aria-pressed={activeChip === chip.id}
                  onClick={() => setActiveChip(chip.id)}
                  className={`rounded px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
                    activeChip === chip.id
                      ? "bg-blue-600 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
                      : "text-slate-400 hover:bg-slate-800 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]"
                  }`}
                >
                  {chip.labelFn()}
                </button>
              ))}
            </div>
          </div>

          {/* ── Column headers (visual only) ── */}
          <div
            aria-hidden="true"
            className="grid border-b border-slate-700 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-500 forced-colors:border-[ButtonText]"
            style={{ gridTemplateColumns: "100px 1fr 1.5fr 90px 90px 160px" }}
          >
            <span style={{ gridColumn: 1 }}>{m.column_status()}</span>
            <span style={{ gridColumn: 2 }}>{m.column_station()}</span>
            <span style={{ gridColumn: 3 }}>{m.column_now_playing()}</span>
            <span style={{ gridColumn: 4 }}>{m.column_bitrate()}</span>
            <span style={{ gridColumn: 5 }}>{m.column_duration()}</span>
            <span style={{ gridColumn: 6 }}>{m.column_actions()}</span>
          </div>

          {/* ── Stream list zone ── */}
          <StreamList
            ref={streamListCallbackRef}
            exitZone={(forward) => exitZone("streams-list", forward)}
            onEmpty={() => {/* handled by isEmpty effect */}}
          />
        </>
      )}

      <AddStreamDialog />
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Manual verification checklist (runtime)**

Run `just dev` and visually confirm:
1. Tab into streams-toolbar zone: first focus lands on "Команди" button (CTA-first entry when coming forward from ActivityBar)
2. Arrow Right moves: Команди → Додати → Зупинити все → Search → 4 chips
3. In search input: ArrowLeft / ArrowRight / Home / End move text cursor; they do NOT jump to adjacent items
4. Ctrl+F: search input receives focus (index 3 in toolbar)
5. Shift+Tab from "Команди" button: exits zone backward to ActivityBar
6. Tab from last chip: exits zone forward to streams list
7. Metrics bar shows correct counts (streams total, recording active count, error count)
8. h2 "Потоки" is visible but NOT tabbable (structural only, no tabIndex)
9. Column headers row is present but not announced by NVDA (aria-hidden="true")

- [ ] **Step 5: Commit**

```
git add src/components/streams/StreamsPanel.tsx
git commit -m "feat(ui): StreamsPanel — toolbar zone, metrics bar, column headers

Replaces streams-actions zone with streams-toolbar (mixed-boundary-handoff,
8 items including search input). h2 + Row 1 (Команди+Додати) + Row 2 (StopAll
+Search+Chips) all inside the zone div. Metrics bar with plural-aware counts.
Column headers row (aria-hidden). Ctrl+F focuses search input.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 3: StreamItem Grid Layout

### Task 5: StreamItem CSS grid redesign

**Files:**
- Modify: `src/components/streams/StreamItem.tsx`

**Summary of changes:**
- `<li>` becomes a CSS Grid container with 6 explicit columns: `100px 1fr 1.5fr 90px 90px 160px`
- All children get explicit `grid-row: 1` + `grid-column: N` to avoid auto-placement issues
- `summary` div moves to `grid-column: 2` (DOM position 1)
- NEW: `status dot` div inserted after `summary` in DOM; `grid-column: 1`; `aria-hidden="true"` (visual only)
- Each segment from `segments.map()` gets explicit `gridColumn` placement
- Row highlighting: `bg-red-950/30 border-l-2 border-red-500` when recording; `bg-blue-950/30` when this stream is playing
- `getStreamSegments()` is **not changed**

**Column → grid-column mapping:**
| Content | grid-column |
|---|---|
| Status dot (new, aria-hidden) | 1 |
| Summary (existing) | 2 |
| Track | 3 |
| Tech (bitrate) | 4 |
| Status segment (active only) | 5 |
| Actions | 6 |

- [ ] **Step 1: Update the `<li>` element and add row highlighting**

Replace the current `<li className="...">` opening with:

```tsx
<li
  className={`grid border-b border-slate-800 forced-colors:border-[ButtonText] ${
    isRecording
      ? "bg-red-950/30 border-l-2 border-l-red-500"
      : isThisStreamPlaying
      ? "bg-blue-950/30"
      : ""
  }`}
  style={{ gridTemplateColumns: "100px 1fr 1.5fr 90px 90px 160px" }}
>
```

- [ ] **Step 2: Add `gridRow: 1` and `gridColumn: 2` to the summary div**

Update the summary `<div>` to include explicit grid placement:

```tsx
<div
  data-item-id={stream.id}
  data-segment="summary"
  tabIndex={isFocused("summary") ? 0 : -1}
  aria-label={summaryLabel}
  className="flex items-center px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
  style={{ gridRow: 1, gridColumn: 2 }}
>
  <span className="font-medium text-slate-200 truncate">{stream.name}</span>
</div>
```

- [ ] **Step 3: Insert the status dot div after the summary div**

Immediately after the closing `</div>` of the summary, add:

```tsx
{/* Visual status dot — col 1, aria-hidden (screen readers get status from summary + status segment) */}
<div
  aria-hidden="true"
  className="flex items-center gap-1.5 px-3 py-2 text-xs"
  style={{ gridRow: 1, gridColumn: 1 }}
>
  <span
    className={`h-2 w-2 shrink-0 rounded-full ${
      state === "recording"
        ? "bg-red-500"
        : state === "connecting" || state === "reconnecting"
        ? "bg-amber-400"
        : state === "error"
        ? "bg-red-500"
        : "bg-green-500"
    }`}
  />
  <span className="truncate text-slate-400">
    {state === "recording"    ? m.status_recording() :
     state === "connecting"   ? m.status_connecting() :
     state === "reconnecting" ? m.status_reconnecting() :
     state === "error"        ? m.status_error() :
     m.status_idle()}
  </span>
</div>
```

> Note: `m.status_error()` key must exist in uk.json. Check — if it doesn't, use a fallback. Verify with `grep "status_error" src/i18n/messages/uk.json`.

- [ ] **Step 4: Add grid placement to each segment in the `segments.map()` block**

Update each `kind` branch to add `style={{ gridRow: 1, gridColumn: N }}`:

**track segment (col 3):**
```tsx
if (kind === "track") return (
  <div
    key="track"
    data-item-id={stream.id}
    data-segment="track"
    tabIndex={isFocused("track") ? 0 : -1}
    aria-label={trackLabel}
    className="px-3 py-2 text-sm text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight] truncate"
    style={{ gridRow: 1, gridColumn: 3 }}
  >
    {status?.currentTrack
      ? `${status.currentTrack.artist} — ${status.currentTrack.title}`
      : "—"}
  </div>
);
```

**tech segment (col 4):**
```tsx
if (kind === "tech") return (
  <div
    key="tech"
    data-item-id={stream.id}
    data-segment="tech"
    tabIndex={isFocused("tech") ? 0 : -1}
    aria-label={techLabel}
    className="px-3 py-2 text-sm text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
    style={{ gridRow: 1, gridColumn: 4 }}
  >
    {formatBitrate(stream.bitrate)}
  </div>
);
```

**status segment (col 5):**
```tsx
if (kind === "status") return (
  <div
    key="status"
    data-item-id={stream.id}
    data-segment="status"
    tabIndex={isFocused("status") ? 0 : -1}
    aria-label={statusLabel}
    className="px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
    style={{ gridRow: 1, gridColumn: 5 }}
  >
    {state === "recording"    ? formatDuration(elapsedMs) :
     state === "connecting"   ? m.status_connecting() :
     state === "reconnecting" ? m.status_reconnecting() :
     m.status_idle()}
  </div>
);
```

**actions segment (col 6):**
```tsx
if (kind === "actions") return (
  <div
    key="actions"
    data-item-id={stream.id}
    data-segment="actions"
    tabIndex={isFocused("actions") ? 0 : -1}
    aria-label={actionsLabel}
    className="flex gap-1 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
    style={{ gridRow: 1, gridColumn: 6 }}
  >
    <button
      tabIndex={-1}
      onClick={handlePlayToggle}
      aria-label={isThisStreamPlaying ? m.stop_stream_playback() : m.play_stream()}
      className={`rounded px-2 py-0.5 text-xs ${isThisStreamPlaying ? "bg-blue-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]" : "bg-slate-700 text-slate-300 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"}`}
    >
      {isThisStreamPlaying ? "■" : "▶"}
    </button>
    <button
      tabIndex={-1}
      onClick={handleRecordToggle}
      aria-label={isRecording ? m.stop_recording() : m.start_recording()}
      className={`rounded px-2 py-0.5 text-xs ${isRecording ? "bg-red-700 text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]" : "bg-slate-700 text-slate-300 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"}`}
    >
      {isRecording ? m.stop_recording() : m.start_recording()}
    </button>
    <StreamContextMenu
      stream={stream}
      status={status}
      onAddToWishlist={(track) => setPatternDialog({ listType: "wishlist", initialPattern: track })}
      onAddToIgnorelist={(track) => setPatternDialog({ listType: "ignorelist", initialPattern: track })}
      onDelete={onDelete}
    />
  </div>
);
```

- [ ] **Step 5: Verify `m.status_error` key exists**

```
grep "status_error" src/i18n/messages/uk.json
```

Expected: `"status_error": "Помилка"` (or similar). The key already exists — use it directly as written in Step 3. No fallback needed.

- [ ] **Step 6: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 7: Manual verification checklist (runtime)**

Run `just dev` and with a stream loaded confirm:
1. DOM order in each `<li>`: summary div comes FIRST (col 2) then status dot div (col 1, aria-hidden)
2. NVDA does NOT announce status dot content (aria-hidden="true" on the dot div)
3. `data-item-id` and `data-segment` attributes preserved on all interactive divs
4. Grid columns visually align with column headers: dot in col 1 (100px), name in col 2, track in col 3, bitrate in col 4, duration in col 5, actions in col 6
5. Recording stream: red left border + dark red background
6. Playing stream: dark blue background

- [ ] **Step 8: Commit**

```
git add src/components/streams/StreamItem.tsx
git commit -m "feat(ui): StreamItem — CSS grid row with status dot

6-column grid layout. Col 1: aria-hidden status dot (recording=red,
connecting/reconnecting=amber, error=red, idle=green). Col 2-6: existing
segments with explicit grid-column placement. Row highlighting for recording
and playing states.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Chunk 4: PlayerPanel 3-panel Layout + StatusBar Styling

### Task 6: PlayerPanel 3-panel layout

**Files:**
- Modify: `src/components/player/PlayerPanel.tsx`

**Summary of changes:**
- Add 2 new stub transport refs: `prevRef`, `nextRef`, `muteRef`
- Expand `transportRefs` from 2 to 5: `[prevRef, playPauseRef, stopRef, nextRef, muteRef]`
- Import `$streams`, `$statuses` stores and `formatBitrate` formatter
- Import `$settings` store
- Add imports for new Lucide icons: `SkipBack`, `SkipForward`, `VolumeX`
- Restructure JSX: flat single bar → `grid grid-cols-3` with 3 `<article>` panels
- `positionWrapperRef` and `volumeWrapperRef` move into Panel 2 and Panel 3 respectively

- [ ] **Step 1: Update imports in PlayerPanel.tsx**

```tsx
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { Button } from "react-aria-components";
import { Play, Pause, Square, SkipBack, SkipForward, VolumeX } from "lucide-react";
import { useStore } from "@nanostores/react";
import { $playerStatus } from "../../stores/player";
import { $streams, $statuses } from "../../stores/streams";
import { $settings } from "../../stores/settings";
import { PlaybackPosition } from "./PlaybackPosition";
import { VolumeSlider } from "./VolumeSlider";
import { useAnnounce } from "../../hooks/useAnnounce";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { formatBitrate } from "../../lib/formatters";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";
```

- [ ] **Step 2: Update store references inside the component**

**2a.** Change the existing `useStore($playerStatus)` call from partial destructuring to full object access. Find the line that reads:

```tsx
const { state } = useStore($playerStatus);
```

Replace it with:

```tsx
const playerStatus = useStore($playerStatus);
const { state } = playerStatus;
```

This is required because Panel 1 uses `playerStatus.source` and Panel 3 uses `playerStatus.volume`.

**2b.** After the existing `const sourceLabel = useSourceLabel();`, add:

```tsx
const streams = useStore($streams);
const statuses = useStore($statuses);
const settings = useStore($settings);
```

- [ ] **Step 3: Add the 3 new stub refs and expand transportRefs**

Add after `const stopRef = useRef<HTMLButtonElement>(null);`:

```tsx
const prevRef  = useRef<HTMLButtonElement>(null);
const nextRef  = useRef<HTMLButtonElement>(null);
const muteRef  = useRef<HTMLButtonElement>(null);
```

Replace `const transportRefs = useMemo(() => [playPauseRef, stopRef], []);` with:

```tsx
const transportRefs = useMemo(
  () => [prevRef, playPauseRef, stopRef, nextRef, muteRef],
  [],
);
```

- [ ] **Step 4: Compute Panel 1 and Panel 3 data**

Add these computations after the existing `const isActive = isPlaying || isPaused;` line:

```tsx
// Panel 1 data
const source = playerStatus.source;
const currentStream = source?.type === "stream"
  ? streams.find(s => s.id === source.streamId)
  : null;
const currentStreamStatus = source?.type === "stream"
  ? statuses[source.streamId]
  : null;
const currentTrack = currentStreamStatus?.currentTrack;
const trackDisplay = source?.type === "stream"
  ? (currentTrack ? `${currentTrack.artist} — ${currentTrack.title}` : "—")
  : source?.type === "file"
  ? (source.path.split(/[\\/]/).pop() ?? "—")
  : "—";
const bitrateDisplay = currentStream ? formatBitrate(currentStream.bitrate) : "—";

// Panel 3 data
const activeRecordingName =
  streams.find(s => statuses[s.id]?.state === "recording")?.name ?? "—";
```

- [ ] **Step 5: Replace the JSX return**

Replace the entire `return (...)` block with the 3-panel layout:

```tsx
return (
  <div
    ref={playerRootRef}
    role="complementary"
    aria-label={m.player_panel_label()}
    data-zone-id="player"
    className="grid grid-cols-3 gap-4 px-4 py-2 bg-slate-900 border-t border-slate-700 shrink-0 forced-colors:border-[ButtonText]"
  >
    {/* ── Panel 1: Зараз грає ── */}
    <article aria-label={m.player_now_playing()} className="flex flex-col gap-1 min-w-0">
      <h3 aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {m.player_now_playing()}
      </h3>
      <p className="text-sm text-slate-200 truncate">{sourceLabel}</p>
      <p className="text-xs text-slate-400 truncate">{trackDisplay}</p>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>{m.player_listening()}</span>
        <span>{bitrateDisplay}</span>
        {source?.type === "stream" && (
          <span className="rounded bg-slate-700 px-1 py-0.5 text-xs">Live</span>
        )}
      </div>
    </article>

    {/* ── Panel 2: Керування ── */}
    <article aria-label={m.player_controls()} className="flex flex-col gap-2 min-w-0">
      <h3 aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {m.player_controls()}
      </h3>
      <div role="toolbar" onKeyDown={transportKeyDown} className="flex items-center gap-1">
        {/* Index 0: Prev (stub) */}
        <Button
          ref={prevRef}
          aria-label={m.player_prev()}
          isDisabled={true}
          // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
          tabIndex={getTabIndex(0)}
          className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText]"
        >
          <SkipBack aria-hidden={true} size={16} />
        </Button>

        {/* Index 1: Play/Pause */}
        <Button
          ref={playPauseRef}
          aria-label={isPlaying ? m.pause() : m.play()}
          isDisabled={!isActive}
          onPress={handlePlayPause}
          // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
          tabIndex={getTabIndex(1)}
          className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText]"
        >
          {isPlaying ? <Pause aria-hidden={true} size={16} /> : <Play aria-hidden={true} size={16} />}
        </Button>

        {/* Index 2: Stop */}
        <Button
          ref={stopRef}
          aria-label={m.stop()}
          isDisabled={!isActive}
          onPress={handleStop}
          // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
          tabIndex={getTabIndex(2)}
          className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText]"
        >
          <Square aria-hidden={true} size={16} />
        </Button>

        {/* Index 3: Next (stub) */}
        <Button
          ref={nextRef}
          aria-label={m.player_next()}
          isDisabled={true}
          // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
          tabIndex={getTabIndex(3)}
          className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText]"
        >
          <SkipForward aria-hidden={true} size={16} />
        </Button>

        {/* Index 4: Mute (stub) */}
        <Button
          ref={muteRef}
          aria-label={m.player_mute()}
          isDisabled={true}
          // @ts-expect-error – react-aria-components Button missing tabIndex in JSX types
          tabIndex={getTabIndex(4)}
          className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 forced-colors:disabled:text-[GrayText]"
        >
          <VolumeX aria-hidden={true} size={16} />
        </Button>
      </div>

      <div ref={positionWrapperRef} tabIndex={-1} onKeyDown={handlePositionKeyDown}>
        <PlaybackPosition />
      </div>
    </article>

    {/* ── Panel 3: Вивід ── */}
    <article aria-label={m.player_output()} className="flex flex-col gap-1.5 min-w-0">
      <h3 aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {m.player_output()}
      </h3>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{m.player_active_recording()}</span>
        <strong className="text-slate-200 truncate ml-2">{activeRecordingName}</strong>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{m.player_device()}</span>
        <strong className="text-slate-200 truncate ml-2">{settings?.outputDevice ?? "—"}</strong>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{m.player_volume()}</span>
        <strong className="text-slate-200">{`${Math.round(playerStatus.volume * 100)}%`}</strong>
      </div>
      <div ref={volumeWrapperRef} tabIndex={-1} onKeyDown={handleVolumeKeyDown}>
        <VolumeSlider />
      </div>
    </article>
  </div>
);
```

> **Note on tab indices in the transport toolbar:**
> The `transportKeyDown` handler and `getTabIndex` now use `activeIndex` from the expanded 5-ref array. The `getTabIndex(0)` through `getTabIndex(4)` calls match the new ref order: `[prevRef, playPauseRef, stopRef, nextRef, muteRef]`. No changes are needed to `onTabBoundary` or `restoreFocusPlayer` — they still work correctly:
> - Backward zone entry → `lastFocusedRef.current = "volume"; focusFirstIn(volumeWrapperRef.current)`
> - Forward zone entry → resumes at `lastFocusedRef.current` (transport/position/volume)

- [ ] **Step 6: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```
git add src/components/player/PlayerPanel.tsx
git commit -m "feat(ui): PlayerPanel — 3-panel layout with 5 transport refs

Panel 1: now playing (source, track, bitrate). Panel 2: transport row (prev
stub, play/pause, stop, next stub, mute stub) + playback position. Panel 3:
active recording, device, volume info + volume slider. Refs expanded from 2
to 5 for rovingFocus transport row.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: StatusBar minor styling

**Files:**
- Modify: `src/components/layout/StatusBar.tsx`

**Changes:**
- `text-xs` → `text-sm` in footer className
- Wrap the dynamic value portions in `<strong>` for visual emphasis (values remain in aria-label already)

- [ ] **Step 1: Update footer className**

In the `<footer>` element, change:
```
text-xs text-slate-400
```
to:
```
text-sm text-slate-400
```

- [ ] **Step 2: Wrap displayed values in `<strong>`**

In `seg0`:
```tsx
// Before:
{recordingsText}

// After:
<strong className="text-slate-200">{recordingsText}</strong>
```

In `seg1`:
```tsx
// Before:
{formatDuration(longestMs)}

// After:
<strong className="text-slate-200">{formatDuration(longestMs)}</strong>
```

- [ ] **Step 3: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
git add src/components/layout/StatusBar.tsx
git commit -m "feat(ui): StatusBar — minor visual styling

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Integration verification

- [ ] **Step 1: Run full TypeScript check**

```
npx tsc --noEmit
```

Expected: no errors (pre-existing paraglide warnings are allowed).

- [ ] **Step 2: Start dev server and do smoke-check**

```
just dev
```

Manual checks:
1. App launches, no white screen
2. ActivityBar is ~224px wide, shows icon + label for each section, profile card at bottom
3. Streams section: h2 "Потоки" visible, metrics bar shows counts, toolbar has search + chips
4. Column headers visible above stream list
5. Stream rows show as grid rows with colored status dot in col 1
6. PlayerPanel shows 3 panels side by side

- [ ] **Step 3: Keyboard navigation smoke-check**

Using Tab key only (no mouse):
1. Tab into ActivityBar → arrow keys move between sections → Tab exits to toolbar
2. In streams-toolbar: arrow keys move between all 8 items, Tab on last chip exits to stream list
3. Shift+Tab on "Команди" button → returns to ActivityBar
4. Ctrl+F → search input receives focus (index 3 in toolbar)
5. Tab from stream list → PlayerPanel transport (5 buttons now) → position → volume → StatusBar
6. Shift+Tab from first transport button (Prev) → returns to stream list
7. Shift+Tab from ActivityBar → wraps to StatusBar (zone cycle wraps)
8. Shift+Tab from StatusBar → focus returns to PlayerPanel volume wrapper

- [ ] **Step 4: PlayerPanel transport state check**

With no active stream playing:
- Prev, Next, Mute buttons: visually dimmed (disabled stubs, `opacity-40`)
- Play/Pause, Stop: also dimmed (no active source)

Start playback on a stream, then:
- Play/Pause and Stop: enabled (full opacity)
- Prev, Next, Mute: still dimmed (stubs, always disabled)

- [ ] **Step 5: StatusBar check**

Confirm in `StatusBar.tsx` output:
- Footer text is `text-sm` (not `text-xs`)
- Recording count value wrapped in `<strong className="text-slate-200">`
- Longest duration value wrapped in `<strong className="text-slate-200">`

- [ ] **Step 6: Final commit (if any fixups needed)**

```
git add -A
git commit -m "fix(ui): post-integration fixups

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
