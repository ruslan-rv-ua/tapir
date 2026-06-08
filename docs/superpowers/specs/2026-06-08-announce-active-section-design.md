# Announce active section name (polite) on section change

**Date:** 2026-06-08
**Branch:** `feat/announce-active-section`
**Status:** Approved design

## Problem

When the user switches sections (Streams, Station Browser, Wishlist, Recordings,
Profiles), a screen-reader user gets no spoken confirmation of *which* section
they landed in. The section-change effect at [`App.tsx:88`](../../../src/App.tsx#L88)
moves focus to the first screen zone, and NVDA announces whatever element receives
focus — but that element's label rarely conveys the section identity. The user
hears, e.g., a list item or a search field, with no "you are now in Recordings"
context.

## Goal

On every `activeSection` change, announce the section's name via the existing
polite live region, so the section identity is spoken **regardless of where focus
lands**. The change must not touch the zone-navigation architecture.

## Non-goals

- No change to zone registration, `useZoneNavigation`, or focus order.
- No announcement on initial app launch (handled separately; see Edge cases).
- No new i18n strings.
- No descriptive phrasing ("section", "switched to") — bare label only
  (decided with the user).

## Design

### Placement

Extend the **existing** effect at [`App.tsx:88`](../../../src/App.tsx#L88) — the one
already keyed on `[activeSection]`. After its early-return guard and the
`prevSectionRef` update, and **before** the `requestAnimationFrame` that moves
focus, announce the section label:

```ts
const prevSectionRef = useRef(activeSection);
useEffect(() => {
  if (prevSectionRef.current === activeSection) return;
  prevSectionRef.current = activeSection;

  // Announce the section name so screen-reader users get the section identity
  // regardless of where focus subsequently lands.
  const label = SECTIONS.find((s) => s.id === activeSection)?.label();
  if (label) announceRef.current(label, "polite");

  const rafId = requestAnimationFrame(() => {
    const firstScreen = orderedZonesRef.current.find(
      (z) => !PERMANENT_ZONE_IDS.has(z.id)
    );
    firstScreen?.focus("forward");
  });
  return () => cancelAnimationFrame(rafId);
}, [activeSection]);
```

The announcement is **synchronous in the effect body**, not inside the rAF. This
decouples it from focus timing: it fires even if no screen zone exists to receive
focus, which is what "regardless of where focus lands" requires.

### Label resolution & i18n

- Resolve via the shared registry: `SECTIONS.find((s) => s.id === activeSection)?.label()`
  from [`lib/sections.ts`](../../../src/lib/sections.ts). `label()` is a getter, so it
  follows the active locale.
- **Bare label**, **polite** priority — e.g. `"Recordings"`, `"Station Browser"`.
  No new i18n key. This is the same vocabulary already used for the ActivityBar
  button `aria-label`s.
- Add the `SECTIONS` import to `App.tsx` (it is not currently imported there).

### Live-region mechanism (unchanged)

Reuse the existing path: `announceRef.current(label, "polite")` →
[`$announcer`](../../../src/stores/announcer.ts) →
[`LiveAnnouncer`](../../../src/components/common/LiveAnnouncer.tsx) polite region.
`announceRef` is already maintained at [`App.tsx:39-40`](../../../src/App.tsx#L39-L40);
using it keeps the effect's dependency array as `[activeSection]` (the `announce`
callback is stable, but using the ref matches the sibling data-load effect and
avoids any dependency churn).

## Rejected alternatives

- **Announce inside the rAF, next to `focus()`** — couples the announcement to
  focus timing and skips it entirely when no screen zone exists. Rejected.
- **A separate effect keyed on `activeSection`** — duplicates the same guard and
  dependency for no benefit; the user explicitly asked for the same effect.
  Rejected.
- **Contextualizing phrase ("Розділ: Recordings" / "Recordings section")** —
  would need a new `section_changed` i18n key. User chose the bare label.
  Rejected.

## Edge cases

- **Initial mount / app launch**: the existing `prevSectionRef.current === activeSection`
  guard returns early on first render (the ref is initialized to `activeSection`).
  The new code sits after that guard, so it inherits the skip — no announcement on
  launch, and therefore no collision with the NVDA-startup focus/announce handled
  at [`App.tsx:106`](../../../src/App.tsx#L106).
- **Disabled `schedule` section**: not reachable through the UI today, but
  `label()` exists for it regardless, so no special-casing is needed.
- **Dependency array**: stays `[activeSection]` by using `announceRef.current`.
- **NVDA speech ordering (noted, not a blocker)**: the polite live region and the
  focus-move's own speech both queue. The polite announcement supplies the section
  context; the focused element's announcement follows. This is the intended
  behaviour.

## Testing & verification

- **No new automated test.** Every sibling `announce(...)` call in `App.tsx`
  (recording status, playback transitions, welcome-first-run) is inline and has no
  dedicated unit test; there is no `App.test.tsx`. Adding one solely for this
  two-line addition would be brittle and inconsistent with the file's convention.
  The label-resolution path is already covered by
  [`sections.test.ts`](../../../src/lib/sections.test.ts) and
  [`ActivityBar.test.tsx`](../../../src/components/layout/ActivityBar.test.tsx).
- **Gates** (the real CI gates for this project): `pnpm test` and `pnpm vite:build`
  must stay green.
- **Manual / NVDA smoke**:
  1. Launch the app — confirm no section name is announced on startup (only the
     existing startup focus announcement occurs).
  2. Switch sections via Alt+digit — confirm the section name is spoken on each
     switch.
  3. Switch sections via the ActivityBar buttons — same confirmation.
  4. Confirm focus still lands in the first screen zone afterwards (zone
     navigation unchanged).

## Files touched

- `src/App.tsx` — add `SECTIONS` import; add label resolution + polite announce
  inside the existing `activeSection` effect.
