# ActivityBar — Startup Focus, Bidirectional Arrows, and Visual Redesign

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ActivityBar auto-focus on startup (NVDA focus mode), respond to ←/→ arrows in addition to ↑/↓, and adopt the icon-box + label visual design from the HTML prototype.

**Architecture:** Three surgical changes to three files. `useRovingFocus.ts` gains a `'both'` axis option. `ActivityBar.tsx` uses it and gets a restructured button layout (icon box + label copy, profile card redesign). `App.tsx` chains focus after `window.show()`.

**Tech Stack:** React 19, React Aria Components, Tailwind CSS v4, TypeScript, Tauri v2, Nanostores, Paraglide.js (i18n)

---

## Chunk 1: Hook + Keyboard + Startup Focus + Visual Redesign

### Task 1: Extend `useRovingFocus` with `'both'` axis

**Files:**
- Modify: `src/hooks/useRovingFocus.ts`

**Context:** `useRovingFocus` accepts `axis: 'horizontal' | 'vertical'` and maps it to a single prev/next key pair. Adding `'both'` makes all four arrow keys active simultaneously. No callers other than `ActivityBar` use `'vertical'`; adding `'both'` does not change existing behavior for other callers.

- [ ] **Step 1: Open `src/hooks/useRovingFocus.ts` and locate the axis type and `onKeyDown` logic**

  The relevant lines are:
  - Line 6: `axis: 'horizontal' | 'vertical'` parameter
  - Lines 51–63: `prevKey`/`nextKey` derivation and key checks

- [ ] **Step 2: Change the axis type union and update `onKeyDown`**

  Replace the axis parameter type:
  ```ts
  axis: 'horizontal' | 'vertical' | 'both',
  ```

  Replace the `prevKey`/`nextKey` block in `onKeyDown` with explicit key checks that handle all four arrows when `axis === 'both'`:
  ```ts
  const isPrev =
    (axis === 'vertical' && e.key === 'ArrowUp') ||
    (axis === 'horizontal' && e.key === 'ArrowLeft') ||
    (axis === 'both' && (e.key === 'ArrowUp' || e.key === 'ArrowLeft'));
  const isNext =
    (axis === 'vertical' && e.key === 'ArrowDown') ||
    (axis === 'horizontal' && e.key === 'ArrowRight') ||
    (axis === 'both' && (e.key === 'ArrowDown' || e.key === 'ArrowRight'));

  if (isPrev) { e.preventDefault(); moveTo(idx - 1); return; }
  if (isNext) { e.preventDefault(); moveTo(idx + 1); return; }
  ```

  Remove the now-unused `prevKey`/`nextKey` constants.

- [ ] **Step 3: Verify TypeScript compiles cleanly**

  ```
  cd C:\dev\Tapir\src-tauri && cargo check 2>$null; cd C:\dev\Tapir && pnpm exec tsc --noEmit 2>&1 | Select-String -NotMatch "paraglide"
  ```
  Expected: no errors other than pre-existing paraglide import warnings.

- [ ] **Step 4: Commit**

  ```
  git add src/hooks/useRovingFocus.ts
  git commit -m "feat(hooks): add 'both' axis to useRovingFocus for bidirectional arrow nav"
  ```

---

### Task 2: ActivityBar visual redesign + axis change

**Files:**
- Modify: `src/components/layout/ActivityBar.tsx`

**Context:** The new design wraps each icon in a square "icon box" (`42×42px`, `rounded-[14px]`) and places label text beside it. The button gets a border-based card style instead of `border-l-2`. Active state is a sky-blue gradient. The Settings button gains a visible label. The profile card gets an avatar box. The `useRovingFocus` axis changes from `'vertical'` to `'both'`.

**Disabled handling:** `schedule` and `songs` are disabled. Their icon box uses `bg-white/[.02] text-slate-600` (overriding the base `bg-white/[.04] text-slate-400`). The button itself uses `text-slate-600 forced-colors:text-[GrayText]`.

- [ ] **Step 1: Update the `useRovingFocus` call — change axis from `'vertical'` to `'both'`**

  In the `useRovingFocus(allRefs, 'vertical', ...)` call, change `'vertical'` to `'both'`.

- [ ] **Step 2: Replace the button className logic**

  Replace the current ternary `className` string on each section `<Button>` with:
  ```tsx
  className={[
    "flex items-center gap-3 w-full min-h-[58px] px-[14px] py-3 rounded-[18px] border transition-colors outline-none",
    "focus-visible:ring-2 focus-visible:ring-blue-400",
    activeSection === sec.id
      ? "bg-gradient-to-b from-sky-400/[.18] to-blue-700/[.16] border-sky-300/[.28] text-sky-300 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:border-[Highlight]"
      : sec.disabled
      ? "bg-white/[.02] border-transparent cursor-not-allowed text-slate-600 forced-colors:text-[GrayText]"
      : "bg-white/[.02] border-slate-700/30 text-slate-400 hover:bg-white/[.05] hover:border-slate-600/50 hover:text-slate-200 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]",
  ].join(" ")}
  ```

- [ ] **Step 3: Replace each button's inner content with icon-box + label-copy structure**

  Replace:
  ```tsx
  <sec.Icon size={20} aria-hidden={true} />
  <span className="text-sm">{sec.label()}</span>
  ```
  With:
  ```tsx
  <span className={[
    "relative flex items-center justify-center w-[42px] h-[42px] flex-none rounded-[14px]",
    activeSection === sec.id
      ? "bg-white/[.08] text-sky-300 forced-colors:text-[HighlightText]"
      : sec.disabled
      ? "bg-white/[.02] text-slate-600 forced-colors:text-[GrayText]"
      : "bg-white/[.04] text-slate-400",
  ].join(" ")}>
    <sec.Icon size={20} aria-hidden={true} />
  </span>
  <span className="flex flex-col gap-0.5 min-w-0">
    <span className="text-sm font-bold leading-tight">{sec.label()}</span>
  </span>
  ```

  The `sr-only` disabled description `<span>` remains immediately after the label span, unchanged.

- [ ] **Step 4: Redesign the Settings button**

  Replace the current Settings `<Button>` body (icon-only) with the same icon-box + label structure:
  ```tsx
  <Button
    ref={settingsRef}
    aria-label={m.settings_title()}
    {...{ tabIndex: getTabIndex(SECTIONS.length) }}
    onPress={() => $settingsDialogOpen.set(true)}
    className="flex items-center gap-3 w-full min-h-[58px] px-[14px] py-3 rounded-[18px] border border-slate-700/30 bg-white/[.02] text-slate-400 hover:bg-white/[.05] hover:border-slate-600/50 hover:text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:text-[ButtonText] forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText] transition-colors"
  >
    <span className="relative flex items-center justify-center w-[42px] h-[42px] flex-none rounded-[14px] bg-white/[.04] text-slate-400">
      <Settings size={20} aria-hidden={true} />
    </span>
    <span className="flex flex-col gap-0.5 min-w-0">
      <span className="text-sm font-bold leading-tight">{m.settings_title()}</span>
    </span>
  </Button>
  ```

- [ ] **Step 5: Redesign the profile card**

  Replace the current profile card `<div>` with:
  ```tsx
  <div
    className="flex items-center gap-3 px-[14px] py-3 rounded-[18px] border border-slate-700/30 bg-white/[.02] text-slate-400"
  >
    <span className="flex items-center justify-center w-[42px] h-[42px] flex-none rounded-[14px] bg-sky-400/[.12] text-sky-200">
      <User size={20} aria-hidden={true} />
    </span>
    <div className="flex flex-col gap-0.5 min-w-0">
      <strong className="text-sm font-bold text-slate-300 truncate leading-tight">{m.profile_name()}</strong>
      <span className="text-xs text-slate-500 truncate">{settings?.activeProfile ?? "Default"}</span>
    </div>
  </div>
  ```

  The `<div className="mt-auto flex flex-col gap-2 px-2">` wrapper that contains Settings + profile card: remove `px-2` (buttons are now self-padded) and reduce gap to `gap-1` to match the main nav items spacing:
  ```tsx
  <div className="mt-auto flex flex-col gap-1">
  ```

- [ ] **Step 6: Verify TypeScript compiles cleanly**

  ```
  pnpm exec tsc --noEmit 2>&1 | Select-String -NotMatch "paraglide"
  ```
  Expected: no new errors.

- [ ] **Step 7: Commit**

  ```
  git add src/components/layout/ActivityBar.tsx
  git commit -m "feat(ui): ActivityBar — icon-box layout, bidirectional arrows, redesigned profile card"
  ```

---

### Task 3: Startup auto-focus in `App.tsx`

**Files:**
- Modify: `src/App.tsx` (lines ~97–101, the `finally` block in the data-loading `useEffect`)

**Context:** Currently `getCurrentWindow().show()` is called fire-and-forget. We chain `.then()` and `.catch()` onto it so focus fires only after the window is truly visible, and errors are logged.

- [ ] **Step 1: Locate the `finally` block in the data-loading `useEffect`**

  Find this block (around line 97):
  ```ts
  }).catch(console.error).finally(() => {
    getCurrentWindow().show();
  });
  ```

- [ ] **Step 2: Replace with chained show + focus**

  ```ts
  }).catch(console.error).finally(() => {
    getCurrentWindow().show()
      .then(() => { activityBarZoneRef.current?.focus("forward"); })
      .catch(console.error);
  });
  ```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

  ```
  pnpm exec tsc --noEmit 2>&1 | Select-String -NotMatch "paraglide"
  ```
  Expected: no new errors.

- [ ] **Step 4: Commit**

  ```
  git add src/App.tsx
  git commit -m "feat(a11y): auto-focus first ActivityBar button on startup after window.show()"
  ```

---

## Manual Verification Checklist

After all tasks are committed, run `just dev` and verify with NVDA:

- [ ] Window shows → NVDA immediately announces the first ActivityBar button (focus mode active, no manual navigation required)
- [ ] ↑/↓ and ←/→ all move focus between ActivityBar items
- [ ] Settings button shows visible "Налаштування" text alongside icon
- [ ] Active section button has gradient blue background + accent border
- [ ] Icon appears inside rounded square box for all buttons
- [ ] Profile card has blue-tinted avatar box + profile name + active profile name
- [ ] Windows High Contrast mode: Highlight/HighlightText/GrayText render correctly
- [ ] Disabled sections (schedule, songs) show muted icon box + muted text in both normal and forced-colors modes
- [ ] Profile card is not focusable (Tab skips past it)
- [ ] `getCurrentWindow().show()` failure scenario: verified by code review — `.catch(console.error)` is chained so errors are logged and focus is skipped without a crash; no manual reproduction needed
