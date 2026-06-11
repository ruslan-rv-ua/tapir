# Settings Dialog UX Improvements

## What NOT to do

- **No vertical sidebar tabs** — four tabs fit fine horizontally.
- **No search/filter** — too few settings to justify it.
- **No single-page scroll** — tabs give discoverability and keep sections short.

---

## 1. Merge "Reconnection" tab into "Recording"

**Why:** Four number-fields don't warrant a dedicated tab; it's the least-used and thinnest tab.

**How:** Add a `<details>` collapsible section at the bottom of `RecordingTab.tsx` (precedent: the "Advanced" logging block in `GeneralTab`).

```
Recording tab
  ├── Output directory + Browse
  ├── File templates
  ├── Stream file
  ├── Track filters
  └── <details> Reconnection (collapsed by default)
        ├── Max retries
        ├── Retry interval
        ├── Backoff multiplier
        └── Max interval
```

Files to change:
- Delete `src/components/settings/ReconnectionTab.tsx` (merge content into `RecordingTab.tsx`)
- `src/components/settings/SettingsDialog.tsx` — remove the `reconnection` Tab and TabPanel

---

## 2. Move "Disk threshold" from General to Recording

**Why:** The setting controls recording behaviour ("block recording if disk < N GB"), not general app behaviour.

**How:** Move the `<NumberField diskSpaceThresholdGb>` block from `GeneralTab.tsx` into `RecordingTab.tsx` under "Track filters" (alongside min track duration, skip first incomplete, etc.).

Files to change: `GeneralTab.tsx`, `RecordingTab.tsx`

---

## 3. Move SMTC checkbox from Hotkeys to Audio/Playback

**Why:** "System media keys integration" is playback behaviour, not a keyboard shortcut. Keeping HotkeysTab as a uniform list of `KeyRecorder` rows is cleaner.

**How:** Move `Checkbox smtcEnabled` block from `HotkeysTab.tsx` into `AudioTab.tsx`, above the "Player controls" section (or as its own section header "Media integration").

Files to change: `HotkeysTab.tsx`, `AudioTab.tsx`

---

## 4. Rename tabs + new tab order

After merging Reconnection, four tabs remain. Rename "Audio" → "Playback" because the tab is already half "Player controls", not just audio device selection.

New order (frequency-of-use, left to right):

| # | id | Label |
|---|-----|-------|
| 1 | `general` | Загальні |
| 2 | `recording` | Запис |
| 3 | `audio` | Відтворення |
| 4 | `hotkeys` | Гарячі клавіші |

i18n: rename `settings_tab_audio` → "Відтворення" / "Playback" in `uk.json` and `en.json`.

---

## 5. Add section headings inside General

Currently a flat list of 7 unrelated controls. Add `<h3>` section headers (already used in GeneralTab's Logging block) so screen-reader users can navigate with the H key in NVDA.

Proposed grouping:

```
Загальні
  ── Інтерфейс ────────────────────────
  Language (Select)
  Theme (Select)

  ── Трей ─────────────────────────────
  Minimize to tray (Checkbox)
  Show tray notifications (Checkbox)

  ── Поведінка ────────────────────────
  Show track in title (Checkbox)
  Double-click action (Select)

  ── Журналювання ─────────────────────  ← already has a heading
  Verbose toggle (Checkbox)
  <details> Advanced …
```

File to change: `GeneralTab.tsx` — wrap groups in `<div className="space-y-3 border-t border-slate-700 pt-4">` + `<h3 className="text-sm font-semibold text-slate-200">`.

---

## 6. Add section headings inside Recording

Same rationale as §5.

```
Запис
  ── Тека та шаблони ──────────────────
  Output dir + Browse
  File name template (+ help text once for the group)
  Incomplete template
  Stream template

  ── Файл потоку ──────────────────────
  Save stream file (Checkbox)
  Delete stream file on stop (Checkbox)

  ── Фільтри треків ───────────────────
  Skip first incomplete track (Checkbox)
  Min track duration (NumberField)
  Auto-correct case (Checkbox)
  Disk threshold (NumberField)  ← moved from General (§2)

  ── Перепідключення ──────────────────  ← <details> collapsed (§1)
  …
```

Move the shared template help text (`settings_template_help`) to appear once after the section heading rather than only under the first field.

---

## 7. "Refresh" button inline with device selector (Audio/Playback tab)

Currently the "Refresh devices" button sits alone below the Select, like an afterthought.

**How:** Place it to the right of the Select trigger button using `flex gap-2 items-end` — same pattern as "Output dir + Browse" in RecordingTab.

File to change: `AudioTab.tsx`

---

## 8. Add a footer with Close button + autosave notice

Users have no feedback that changes are saved. There's only an ✖ in the header and Escape.

**How:** Add a sticky footer bar inside the Dialog:

```
┌─────────────────────────────────────────────┐
│  Зміни зберігаються автоматично             │  [Закрити]  │
└─────────────────────────────────────────────┘
```

- Left: `<p className="text-xs text-slate-500">` with the autosave notice (i18n key `settings_autosave_notice`).
- Right: `<button>` that calls `$settingsDialogOpen.set(false)` — same as ✖, but labelled and at the bottom where users expect a Close/Done button.
- Styling: `border-t border-slate-700 px-6 py-3 flex items-center justify-between` at the Dialog level in `SettingsDialog.tsx`.

New i18n keys needed: `settings_autosave_notice`, `settings_close_btn`.

---

## 9. Deduplicate Tab className in SettingsDialog

All five Tab elements share the same 150-char className string. Extract to a constant and render via `.map()`.

```tsx
const TABS = [
  { id: "general",   label: () => m.settings_tab_general() },
  { id: "recording", label: () => m.settings_tab_recording() },
  { id: "audio",     label: () => m.settings_tab_audio() },
  { id: "hotkeys",   label: () => m.settings_tab_hotkeys() },
] as const;

const TAB_CLS = "cursor-pointer border-b-2 border-transparent px-3 py-2 …";
```

File to change: `SettingsDialog.tsx`

---

## Priority order

| Priority | Change | Effort | Benefit |
|----------|--------|--------|---------|
| 1 | §5 + §6 — section headings in General & Recording | Low | High (a11y + visual clarity) |
| 2 | §1 — merge Reconnection into Recording | Medium | High (fewer tabs) |
| 3 | §2 — move disk threshold to Recording | Low | Medium |
| 4 | §3 — move SMTC to Audio/Playback | Low | Medium |
| 5 | §8 — footer with Close + autosave notice | Medium | Medium |
| 6 | §7 — Refresh button inline | Low | Low |
| 7 | §4 — rename Audio→Playback + reorder | Low | Low |
| 8 | §9 — deduplicate Tab className | Low | Low (code quality) |
