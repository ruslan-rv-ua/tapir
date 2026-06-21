/**
 * Fixed (non-configurable) webview combos — Tier 2 + Tier 2′ — that Settings →
 * Hotkeys must refuse to assign (KB-09). Derived from the single shortcut
 * registry so the reserved list can never drift from the dispatch or the F1
 * help: an entry is reserved iff `shortcuts.ts` marks it `reserved`.
 */
import { SHORTCUTS } from "./shortcuts";

export const RESERVED_WEBVIEW_COMBOS: ReadonlyArray<{
  combo: string;
  label: () => string;
}> = SHORTCUTS.filter((s) => s.reserved)
  .filter((s, i, arr) => arr.findIndex((x) => x.combo === s.combo) === i)
  .map(({ combo, label }) => ({ combo, label }));

/**
 * Returns the conflicting reserved entry's label getter, or null if `combo`
 * is free. Pure — exact string match against the canonical accelerator format.
 */
export function findReservedConflict(combo: string): (() => string) | null {
  const hit = RESERVED_WEBVIEW_COMBOS.find((r) => r.combo === combo);
  return hit ? hit.label : null;
}
