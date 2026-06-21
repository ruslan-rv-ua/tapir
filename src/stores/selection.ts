import type { WritableAtom } from "nanostores";

/**
 * Generic multi-select helpers shared by every composite list (milestone D).
 * The atom is passed in so each list owns its own `atom<Set<string>>`; the
 * semantics are identical to the original streams-only functions:
 *  - replace installs a fresh Set identity (so useStore subscribers re-render);
 *  - prune is a no-op when nothing changed (safe to run in an effect on every
 *    store change without spurious rerenders).
 */
export function replaceSelection(
  $sel: WritableAtom<Set<string>>,
  next: ReadonlySet<string>,
): void {
  $sel.set(new Set(next));
}

export function pruneSelection(
  $sel: WritableAtom<Set<string>>,
  existingIds: ReadonlySet<string>,
): void {
  const current = $sel.get();
  let changed = false;
  const next = new Set<string>();
  for (const id of current) {
    if (existingIds.has(id)) next.add(id);
    else changed = true;
  }
  if (changed) $sel.set(next);
}
