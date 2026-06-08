# Announce Active Section Name (Polite) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every `activeSection` change, speak the section's name through the existing polite live region so screen-reader users know which section they are in, regardless of where focus lands.

**Architecture:** Extend the existing `activeSection` effect in `src/App.tsx` (the one already at line ~88). After its early-return guard, resolve the active section's label from the shared `SECTIONS` registry and announce it polite via `announceRef.current`. No new i18n keys, no zone-navigation changes.

**Tech Stack:** React + TypeScript, nanostores (`@nanostores/react`), Paraglide i18n, existing `useAnnounce` → `$announcer` → `LiveAnnouncer` live-region pipeline. Vitest for the gate (no new test added). Vite build gate.

**Spec:** `docs/superpowers/specs/2026-06-08-announce-active-section-design.md`
**Branch:** `feat/announce-active-section` (already created off `develop`)

---

## File Structure

- **Modify:** `src/App.tsx`
  - Add an import of `SECTIONS` from `./lib/sections`.
  - Inside the existing `useEffect` keyed on `[activeSection]`, after `prevSectionRef.current = activeSection;` and before the `requestAnimationFrame(...)`, resolve the label and announce it polite.

No other files change. The change is two edits in one file.

---

### Task 1: Announce the section label on section change

**Files:**
- Modify: `src/App.tsx` (import block near line 25; effect at lines ~88-98)

**Context for the implementer:**
- `SECTIONS` is `readonly SectionMeta[]` exported from `src/lib/sections.ts`. Each entry has `{ id, label, digit, disabled? }`, where `label: () => string` is a locale-aware getter (calling it returns e.g. `"Recordings"`, `"Station Browser"`).
- `announceRef` is already declared in `App.tsx` (`const announceRef = useRef(announce);` kept current by an effect). Using `announceRef.current(...)` keeps the effect's dependency array as `[activeSection]` — do **not** add `announce` to the deps.
- The effect already early-returns on initial mount because `prevSectionRef` is initialized to `activeSection`. The new announce sits after that guard, so launch stays silent on this path.

- [ ] **Step 1: Add the `SECTIONS` import**

In `src/App.tsx`, the navigation store is imported near line 25:

```ts
import { $activeSection } from "./stores/navigation";
```

Immediately after that line, add:

```ts
import { SECTIONS } from "./lib/sections";
```

- [ ] **Step 2: Announce the label inside the existing effect**

Find this existing effect (around lines 86-98):

```ts
  // When the section changes, focus first screen zone after zones register
  const prevSectionRef = useRef(activeSection);
  useEffect(() => {
    if (prevSectionRef.current === activeSection) return;
    prevSectionRef.current = activeSection;
    const rafId = requestAnimationFrame(() => {
      const firstScreen = orderedZonesRef.current.find(
        (z) => !PERMANENT_ZONE_IDS.has(z.id)
      );
      firstScreen?.focus("forward");
    });
    return () => cancelAnimationFrame(rafId);
  }, [activeSection]);
```

Replace it with (only the inserted block between the guard and the `rafId` is new):

```ts
  // When the section changes, focus first screen zone after zones register
  const prevSectionRef = useRef(activeSection);
  useEffect(() => {
    if (prevSectionRef.current === activeSection) return;
    prevSectionRef.current = activeSection;
    // Announce the section name so screen-reader users get the section identity
    // regardless of where focus subsequently lands. Polite + bare label, sourced
    // from the shared SECTIONS registry (locale-aware getter).
    const sectionLabel = SECTIONS.find((s) => s.id === activeSection)?.label();
    if (sectionLabel) announceRef.current(sectionLabel, "polite");
    const rafId = requestAnimationFrame(() => {
      const firstScreen = orderedZonesRef.current.find(
        (z) => !PERMANENT_ZONE_IDS.has(z.id)
      );
      firstScreen?.focus("forward");
    });
    return () => cancelAnimationFrame(rafId);
  }, [activeSection]);
```

- [ ] **Step 3: Run the test gate**

Run: `pnpm test`
Expected: PASS — all existing suites green (this change adds no new test and must not break any existing one).

- [ ] **Step 4: Run the build/typecheck gate**

Run: `pnpm vite:build`
Expected: build succeeds with no new TypeScript errors. (Note: `tsc` has ~51 pre-existing untyped-Paraglide errors that are NOT a gate; `pnpm vite:build` is the real gate.)

- [ ] **Step 5: Manual NVDA smoke (verification, not blocking commit if NVDA unavailable)**

With NVDA running:
1. Launch the app — confirm **no** section name is announced on startup (only the existing startup focus announcement).
2. Switch sections via `Alt+1` … `Alt+5` — confirm the section name is spoken on each switch (e.g. "Station Browser", "Recordings").
3. Switch sections by activating the ActivityBar buttons — same confirmation.
4. Confirm focus still lands in the first screen zone after each switch (zone navigation unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(a11y): announce active section name (polite) on section change

Announce the section label via the existing polite live region inside
the activeSection effect, after the initial-mount guard and before the
rAF focus. Gives screen-reader users the section identity regardless of
where focus lands. Bare label from the SECTIONS registry, no new i18n,
zone architecture untouched.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- "Announce section label on `activeSection` change, polite, in the same effect at App.tsx:88" → Task 1, Step 2. ✓
- "Bare label, no new i18n, sourced from SECTIONS" → Step 1 (import) + Step 2 (`SECTIONS.find(...).label()`). ✓
- "No announcement on initial launch" → inherited from the existing `prevSectionRef` guard; verified in Step 5.1. ✓
- "Dependency array stays `[activeSection]` via `announceRef.current`" → Step 2 code + implementer context note. ✓
- "Zone architecture untouched" → only the announce lines added; rAF/focus block unchanged. ✓
- "No new automated test; gates `pnpm test` + `pnpm vite:build`" → Steps 3-4. ✓
- "Manual NVDA verification" → Step 5. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/vague steps. Every code step shows complete code. ✓

**3. Type consistency:** `SECTIONS` (named export), `SectionMeta.label: () => string`, `announceRef.current(message, "polite")` signature — all match `src/lib/sections.ts` and `src/App.tsx` as read. The `?.label()` + truthiness guard handles the (type-impossible but defensive) miss. ✓
