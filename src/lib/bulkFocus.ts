/**
 * Compute where to move focus after a bulk removal (rule A8). Pure index math
 * over the CURRENT visible order, taken BEFORE the store mutation.
 *
 * Returns the id of the first survivor at/after the top removed index; when the
 * tail was removed it returns the new last survivor; when every visible row was
 * removed it returns null (caller switches to the empty-state zone).
 *
 * `removedIds` MUST be the actually-removed ids and MUST be non-empty — a full
 * skip (nothing removed) is a focus no-op the CALLER handles before calling this
 * (otherwise findIndex === -1 here would wrongly jump focus to the first row).
 * When removedIds is non-empty but none are visible (e.g. removed under a
 * filter), Math.max(0, -1) deliberately lands on the first row, never <body>.
 */
export function computeBulkFocusTarget(
  visibleItems: { id: string }[],
  removedIds: ReadonlySet<string>,
): string | null {
  const topRemovedIdx = Math.max(0, visibleItems.findIndex((it) => removedIds.has(it.id)));
  const survivors = visibleItems.filter((it) => !removedIds.has(it.id));
  if (survivors.length === 0) return null;
  return survivors[Math.min(topRemovedIdx, survivors.length - 1)].id;
}
