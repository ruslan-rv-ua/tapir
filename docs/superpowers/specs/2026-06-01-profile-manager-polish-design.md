# Profile Manager — Polish & Bugfix Design

**Date:** 2026-06-01
**Status:** Approved
**Scope:** Visual polish of the "Управління профілями" dialog (within the existing
two-column layout) plus five correctness / accessibility / i18n bug fixes.
**Builds on:** `2026-06-01-phase-3f-profile-manager-design.md` (the original Phase 3F feature).

> This is a follow-up polish pass. No backend, IPC, or data-model changes. All work is in
> `src/components/profile/*`, `src/i18n/messages/{uk,en}.json`, and the paraglide regen output.

---

## 1. Goals

1. Make the active profile unmistakable and the action set scannable, without changing the
   two-column structure (profile list left, action buttons right).
2. Fix five real defects found during review (focus loss, invisible focus rings, broken
   pluralization, hardcoded label, missing export feedback).

Out of scope: layout restructuring, duplicate-name prefill, backend behaviour, new features.

---

## 2. Visual polish (direction "B")

### 2.1. ProfileList (`ProfileList.tsx`)

Each `ListBoxItem` gains a clearer active/selected language:

- **Active profile** (`p.isActive`): an accent dot at the left (`bg-sky-400`, ~7px), the name in
  the brighter `text-slate-100`, a pill badge `активний` (`text-sky-300` on `bg-sky-400/15`,
  rounded-full), and an accent left bar via `shadow-[inset_2px_0_0_theme(colors.sky.400)]`.
- **Selected, not active**: existing fill highlight only (`data-[selected]:bg-sky-600/20`), name in
  `text-slate-200`. A 7px spacer keeps the name column aligned with active rows (no dot).
- **Stream count**: unchanged position (`ml-auto`, muted), but text comes from the new pluralized
  message (see §3.3).
- Keep the existing `focus-visible:ring-2 focus-visible:ring-blue-400`, hover, and `forced-colors`
  behaviour. The pill and dot must degrade gracefully in `forced-colors` (use `forced-colors:hidden`
  on the dot/bar; keep the textual `активний` badge so high-contrast users still see state).

### 2.2. ProfileActions (`ProfileActions.tsx`)

Reorder and group the buttons. Group separators are non-interactive `.label`-style captions
(small, uppercase, muted) plus the existing 2px gap.

```
[ Перемкнутися ]            ← primary (accent), ArrowRightLeft icon
  ── Профіль ──
[ + Новий ]                 Plus
[ ⧉ Дублювати ]             Copy
[ ✎ Перейменувати ]         Pencil
[ 🗑 Видалити ]             Trash2
  ── Файл ──
[ ↑ Експорт ]              Upload
[ ↓ Імпорт ]               Download
```

- **Switch** becomes the visually primary action: `bg-blue-600 text-white hover:bg-blue-700`
  (matches the OK/confirm buttons), keeping its disabled state when `selected === active`.
- All other buttons keep the subtle `bg-white/[.04]` treatment but gain a leading lucide icon
  (`size={14}`, `aria-hidden`, `opacity-70`). Icon is decorative; the text label remains the
  accessible name.
- Group caption labels are localized: reuse-or-add keys `profile_group_profile` ("Профіль" /
  "Profile") and `profile_group_file` ("Файл" / "File"). They are `aria-hidden` visual captions —
  the buttons themselves are already inside the labelled `role="group"`, so the captions are not
  needed for the accessibility tree and would otherwise add noise to NVDA.
- Disabled rules unchanged: Switch (active), Rename/Delete (Default or active), others always
  enabled except while `busy`.

### 2.3. ProfileManager sub-dialogs (`ProfileManager.tsx`)

- Add the same `forced-colors` fallback used on the main `Modal`
  (`forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]`) to each
  sub-dialog `Modal`.
- Icon set is imported from `lucide-react`, consistent with the existing `X` import.

No change to the dialog width strategy, max-height, or scroll containers (those were already
patched in recent commits).

---

## 3. Bug fixes

### 3.1. Bug 1 — Focus lost after Switch / Delete (HIGH, a11y)

**Symptom:** Operations that disable their own trigger button strand keyboard/NVDA focus.
- After **Switch**, `selected` becomes the active profile → the "Перемкнутися" button (the element
  that had focus, or whose confirm-dialog trigger restores to it) is now `disabled`.
- After **Delete**, `selected` is forced to `"Default"` → the "Видалити" button is now `disabled`
  (delete is disabled for Default). Focus restoration to a disabled element drops focus to `<body>`.

**Fix:** After a successful Switch and after a successful Delete, explicitly move focus into the
`ProfileList`. Implementation approach:
- `ProfileList` accepts a `ref` (or exposes an imperative focus via `forwardRef` /
  `useImperativeHandle`) so `ProfileManager` can call `listRef.current?.focus()` to focus the
  ListBox, which React Aria will route to the currently selected item.
- `ProfileManager` calls this after `doSwitch` success and after `handleDelete` success — including
  the confirm-dialog paths, after `setSubDialog(null)` and the list refresh complete.
- Verify during implementation that focus actually lands on the selected list item (not `body`) for
  all four paths: direct switch, switch-via-confirm, delete-via-confirm, and the no-recordings
  switch path.

### 3.2. Bug 2 — Sub-dialog Cancel/OK buttons have no visible focus (MEDIUM, a11y)

**Symptom:** The Cancel/OK buttons in the name dialog, the delete-confirm dialog, and the
switch-confirm dialog are raw `<button onClick>` elements. Cancel has only `hover:` styling and no
`focus-visible` ring, so keyboard focus is invisible; OK rings inconsistently. They also bypass
React Aria press handling used everywhere else.

**Fix:** Convert all sub-dialog footer buttons to React Aria `<Button onPress>` with the standard
`outline-none focus-visible:ring-2 focus-visible:ring-blue-400` treatment. Preserve existing
variants: neutral (Cancel), primary blue (OK / Switch confirm), destructive red (Delete confirm).
Preserve `disabled={busy || !nameInput.trim()}` semantics via `isDisabled`. Keep `autoFocus`
placement (Cancel in destructive dialogs, name field in input dialogs).

### 3.3. Bug 3 — Stream count not pluralized (MEDIUM, i18n)

**Symptom:** `profile_stream_count_hint` is the flat string `"{count} потоків"` /
`"{count} streams"`, producing "1 потоків", "3 потоків", "1 streams". Ukrainian needs three
plural forms (one / few / many).

**Fix (safe approach — does not rely on unproven paraglide plural compilation):**
- Add four explicit keys per locale following CLDR categories used by each language:
  - English: `profile_stream_count_one` ("{count} stream"), `profile_stream_count_other`
    ("{count} streams").
  - Ukrainian: `profile_stream_count_one` ("{count} потік"), `profile_stream_count_few`
    ("{count} потоки"), `profile_stream_count_many` ("{count} потоків").
- In `ProfileList`, pick the key via `new Intl.PluralRules(locale).select(count)` where `locale`
  is the active paraglide language tag, resolving `profile_stream_count_${category}`. Implement as
  a tiny local helper (e.g. `streamCountLabel(count)`) so the JSX stays clean.
- Remove the old `profile_stream_count_hint` key once no longer referenced.
- During implementation, confirm how to read the current locale from the paraglide runtime
  (`languageTag()` or equivalent) and that `Intl.PluralRules` category names match the keys added.

### 3.4. Bug 4 — "OK" label hardcoded (LOW, i18n)

**Symptom:** The confirm button in the name input sub-dialog renders the literal `"OK"`.

**Fix:** Add an `ok` message key (uk: "Гаразд", en: "OK") and use `m.ok()`. (Mirrors the existing
`cancel` key.)

### 3.5. Bug 5 — Export gives no feedback (LOW, UX/a11y)

**Symptom:** `handleExport` succeeds silently — no toast and no `aria-live` announcement, unlike
create/rename/delete/switch/import.

**Fix:** On successful `exportProfile`, call `announce(...)` with a localized message
`profile_exported_announcement` (uk: "Профіль експортовано: {name}" / en: "Profile exported:
{name}"). The native save dialog already confirms the file path, so no toast is required — the
live announcement is for screen-reader parity. Note: `exportProfile` is a silent no-op when the
user cancels the save dialog; the announcement must only fire on actual success. Since the current
IPC wrapper returns `void` for both cancel and success, confirm during implementation whether the
backend distinguishes cancel from success; if not, the announcement fires on resolve (acceptable —
user initiated the action) OR we keep it minimal. Prefer firing on resolve unless cancel detection
is trivial.

---

## 4. i18n key changes summary

| Key | Ukrainian | English | Action |
|-----|-----------|---------|--------|
| `ok` | Гаразд | OK | add |
| `profile_group_profile` | Профіль | Profile | add |
| `profile_group_file` | Файл | File | add |
| `profile_stream_count_one` | {count} потік | {count} stream | add (both) |
| `profile_stream_count_few` | {count} потоки | — | add (uk only) |
| `profile_stream_count_many` | {count} потоків | — | add (uk only) |
| `profile_stream_count_other` | — | {count} streams | add (en only) |
| `profile_exported_announcement` | Профіль експортовано: {name} | Profile exported: {name} | add |
| `profile_stream_count_hint` | — | — | remove |

> Keys mirror CLDR categories exactly. Ukrainian integers use `one` / `few` / `many`; English uses
> `one` / `other`. The helper resolves `profile_stream_count_${category}` from
> `new Intl.PluralRules(locale).select(count)`. Because each locale only defines its own
> categories, no cross-locale fallback is needed; add a defensive fallback to `one` only to satisfy
> the type checker. Paraglide messages must be regenerated after editing the JSON.

---

## 5. Components touched

| File | Change |
|------|--------|
| `src/components/profile/ProfileList.tsx` | Active dot+pill+bar, aligned spacer, pluralized count helper, `forwardRef` for focus, `forced-colors` degradation |
| `src/components/profile/ProfileActions.tsx` | Regroup buttons, primary Switch, lucide icons, group captions |
| `src/components/profile/ProfileManager.tsx` | React Aria sub-dialog buttons, `m.ok()`, export announcement, focus-to-list after switch/delete, sub-dialog `forced-colors` |
| `src/i18n/messages/uk.json`, `en.json` | Key changes per §4; regenerate paraglide |

---

## 6. Testing

Existing test files (`ProfileList.test.tsx`, `ProfileActions.test.tsx`, `ProfileManager.test.tsx`)
are updated/extended:

- **ProfileList**: active row renders the `активний` pill; count text is correct for counts
  1 / 2 / 5 in uk (потік / потоки / потоків) and 1 / 5 in en (stream / streams).
- **ProfileActions**: buttons render in the new order; Switch carries the primary styling hook;
  group captions are present and `aria-hidden`; disabled rules unchanged.
- **ProfileManager**: sub-dialog footer buttons are focusable React Aria buttons; OK uses the
  localized label; after a simulated successful switch and delete, focus is on the ListBox (not
  `body`); export triggers a live-region announcement.

Run the existing frontend test suite; all profile tests must pass.

---

## 7. Criteria for Done

- [ ] Active profile shows dot + pill + accent bar; selected-not-active shows fill only; columns aligned
- [ ] Action buttons regrouped (Switch primary; Профіль group; Файл group) with lucide icons and localized captions
- [ ] Sub-dialog Cancel/OK/confirm buttons are React Aria `<Button>` with visible focus rings; OK localized
- [ ] Stream count pluralizes correctly in uk (1/3/5) and en (1/5)
- [ ] Focus returns to the profile list (selected item) after Switch and after Delete, in all paths
- [ ] Successful export makes a localized `aria-live` announcement
- [ ] `forced-colors` fallback present on sub-dialogs; active indicators degrade gracefully
- [ ] All profile component tests updated and passing
