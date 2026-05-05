# ActivityBar — Startup Focus, Bidirectional Arrows, and Visual Redesign

**Date:** 2026-05-05  
**Branch:** feature/activity-bar  
**Scope:** `src/hooks/useRovingFocus.ts`, `src/components/layout/ActivityBar.tsx`, `src/App.tsx`

---

## Problem Statement

Three independent improvements to the ActivityBar:

1. **Startup focus** — when the app window appears, NVDA is in browse mode and no element has focus. The user must manually orient. Fix: auto-focus the first ActivityBar button after initial data loads and the window is shown.
2. **Bidirectional arrow navigation** — ActivityBar currently responds only to ↑/↓. Adding ←/→ as aliases makes navigation more discoverable and consistent with other toolbars.
3. **Visual redesign** — the current design uses a flat `border-l-2` active indicator. The reference mockup (`docs/ui/01-streams-screen.html`) uses a richer pattern: each button wraps its icon in a dedicated square "icon box" and shows a text label. The Settings button should also show its label. The profile card should follow the mockup avatar-box layout.

---

## Approach

**Approach A (chosen):** minimal, surgical changes.

- Extend `useRovingFocus` with `axis: 'both'` option.
- Auto-focus via existing `activityBarZoneRef` in `App.tsx`.
- Redesign `ActivityBar.tsx` markup and Tailwind classes; no new hooks or components.

---

## Design

### 1. Startup Focus (`App.tsx`)

In the `useEffect` that loads initial data, the `finally` block currently calls `getCurrentWindow().show()` synchronously (fire-and-forget). `show()` returns a `Promise`, so focus must be called **after** it resolves — otherwise the focus event may fire before the OS window is visible.

Change the `finally` callback to `async` and `await show()` before focusing:

```ts
.catch(console.error)
.finally(async () => {
  await getCurrentWindow().show();
  activityBarZoneRef.current?.focus("forward");
});
```

**Partial-failure behavior:** `Promise.all` short-circuits on the first rejection, so the `catch` runs and then `finally` still executes. This is acceptable — the ActivityBar is always mounted and its ref is always non-null, so focus is set regardless of whether data fetches succeeded or partially failed. The window always appears.

**Why this works for NVDA:** NVDA automatically switches from browse mode to focus/application mode when an interactive element (button) receives programmatic focus. No NVDA-specific API is required.

### 2. Bidirectional Arrow Navigation (`useRovingFocus.ts`)

Add `'both'` as a valid value for the `axis` parameter:

```ts
axis: 'horizontal' | 'vertical' | 'both'
```

When `axis === 'both'`, both `ArrowUp`/`ArrowLeft` move to the previous item and `ArrowDown`/`ArrowRight` move to the next item. Home/End remain unchanged.

`ActivityBar` changes its `useRovingFocus` call from `'vertical'` to `'both'`. No other callers are affected.

### 3. ActivityBar Visual Redesign (`ActivityBar.tsx`)

#### Button structure

Each navigation button changes from a flat icon+text layout to an icon-box+label-copy layout mirroring the HTML prototype:

```tsx
<Button ...className="...">
  <span className="icon-box-classes">
    <sec.Icon size={20} aria-hidden />
  </span>
  <span className="flex flex-col gap-0.5 min-w-0">
    <span className="text-sm font-bold leading-tight">{sec.label()}</span>
  </span>
  {/* sr-only disabled description unchanged */}
</Button>
```

#### Tailwind class mapping (aligned with existing slate/sky palette)

| Element | Tailwind classes |
|---------|-----------------|
| Button (base) | `flex items-center gap-3 w-full min-h-[58px] px-[14px] py-3 rounded-[18px] border border-slate-700/30 bg-white/[.02] text-slate-400 transition-colors outline-none` |
| Button (active) | `bg-gradient-to-b from-sky-400/[.18] to-blue-700/[.16] border-sky-300/[.28] text-sky-300` |
| Button (disabled) | `cursor-not-allowed text-slate-600 border-transparent` |
| Button (hover, inactive) | `hover:bg-white/[.05] hover:border-slate-600/50 hover:text-slate-200` |
| Icon box (base) | `relative flex items-center justify-center w-[42px] h-[42px] flex-none rounded-[14px] bg-white/[.04] text-slate-400` |
| Icon box (active) | `bg-white/[.08] text-sky-300` |
| Icon box (disabled) | `bg-white/[.02] text-slate-600 forced-colors:text-[GrayText]` — color does **not** inherit automatically from the button because icon box is a sibling span; class must be applied conditionally based on `sec.disabled` |
| focus-visible | `focus-visible:ring-2 focus-visible:ring-blue-400` |
| forced-colors active | existing `forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]` patterns preserved |

#### Settings button

The Settings button in the footer footer adopts the same icon-box+label structure and shows the i18n string `m.settings_title()` as visible text (not sr-only).

#### Profile card

The profile card changes its avatar from `<User size={16}>` in a plain div to an icon in a styled avatar box matching the prototype:

```tsx
<div className="flex items-center gap-3 px-[14px] py-3 rounded-[18px] border border-slate-700/30 bg-white/[.02] text-slate-400">
  <span className="flex items-center justify-center w-[42px] h-[42px] flex-none rounded-[14px] bg-sky-400/[.12] text-sky-200">
    <User size={20} aria-hidden />
  </span>
  <div className="flex flex-col gap-0.5 min-w-0">
    <strong className="text-sm font-bold text-slate-300 truncate leading-tight">{m.profile_name()}</strong>
    <span className="text-xs text-slate-500 truncate">{settings?.activeProfile ?? "Default"}</span>
  </div>
</div>
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useRovingFocus.ts` | Add `'both'` to axis union; handle ArrowLeft/ArrowRight when axis is `'both'` |
| `src/components/layout/ActivityBar.tsx` | New button structure (icon box + label copy); Settings label; profile card redesign; axis `'both'` |
| `src/App.tsx` | `finally` callback becomes `async`, `show()` is awaited, then `activityBarZoneRef.current?.focus("forward")` is called |

---

## Accessibility Notes

- NVDA focus mode is triggered automatically by programmatic `button.focus()` — no special markup needed.
- All `aria-label`, `aria-pressed`, `aria-disabled`, `aria-describedby` attributes remain unchanged.
- `forced-colors` classes must be preserved for Windows High Contrast mode.
- The Settings button previously relied on `aria-label` for screen reader identification; with visible text added, `aria-label` can be retained as-is (it overrides visible text for AT, but visible text benefits sighted+low-vision users).

---

## Accessibility Notes — aria-label on Settings Button

The Settings button currently has `aria-label={m.settings_title()}`. After the redesign, the button will also have visible text (same string). Keeping `aria-label` is an **explicit accessibility decision**: React Aria passes `aria-label` through to the DOM, where it takes precedence over visible text for screen readers. Removing it would have no negative effect (visible text + accessible name are identical), but keeping it is harmless and makes intent clear. **Decision: keep `aria-label` as-is.**

## Verification Checklist

- [ ] Window shows, then NVDA announces first ActivityBar button automatically (focus mode active)
- [ ] ↑/↓ and ←/→ all move focus within ActivityBar items
- [ ] Settings button shows visible "Налаштування" text alongside icon
- [ ] Active section button has gradient background + accent border
- [ ] Icon appears inside rounded square box for all buttons
- [ ] Profile card has avatar box (blue-tinted) + profile name + active profile name
- [ ] Windows High Contrast mode: forced-colors classes render correctly (Highlight, HighlightText, GrayText)
- [ ] Disabled sections (schedule, songs) render with muted icon box and muted text in both normal and forced-colors modes
- [ ] `getCurrentWindow().show()` failure: log error, window stays hidden — focus call is skipped naturally since the promise rejects; no separate error handling needed

## Out of Scope

- No changes to `useZoneNavigation.ts` or any panel component.
- No new i18n keys (Settings label already exists as `m.settings_title()`).
- No Rust/Tauri changes.
