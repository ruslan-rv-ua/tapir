import { useCallback, useEffect, useMemo } from "react";
import type { WritableAtom } from "nanostores";
import type { CompositeSelection, SelectionChange } from "./useCompositeList";
import { replaceSelection, pruneSelection } from "../stores/selection";
import * as m from "../i18n/paraglide/messages";

interface Options<T> {
  /** The list's own selection atom. */
  $selection: WritableAtom<Set<string>>;
  /** Central announce channel (useAnnounce()). */
  announce: (message: string, priority?: "polite" | "assertive") => void;
  /** Resolve a row id to its display name — over the VISIBLE list (single-select
   *  focus always stays on a rendered row, so a visible-list getter is correct). */
  resolveName: (id: string) => string;
  /** The FULL store array (stable identity between updates). Drives auto-prune. */
  allItems: T[];
  /** Derive an id from a store item (kept out of effect deps; assumed stable). */
  getId: (item: T) => string;
}

/**
 * Consumer-side selection glue shared by every composite list (D1, parts ②③④).
 * Byte-for-byte the logic StreamList hand-rolled: the atom adapter, the
 * announce-payload routing (pointer-single skipped; key-single name;
 * group count/cleared), and the auto-prune effect on store change.
 */
export function useListSelection<T>({
  $selection,
  announce,
  resolveName,
  allItems,
  getId,
}: Options<T>) {
  const selectionAdapter = useMemo<CompositeSelection>(
    () => ({
      current: () => $selection.get(),
      replace: (next) => replaceSelection($selection, next),
    }),
    [$selection],
  );

  const onSelectionChange = useCallback(
    (c: SelectionChange) => {
      // A pointer single already moved DOM focus → NVDA reads the row (with its
      // ", виділено" suffix) natively; re-announcing would double-speak.
      if (c.via === "pointer" && c.kind === "single") return;
      if (c.kind === "single") {
        const name = resolveName(c.lastId ?? "");
        announce(c.selected ? m.item_selected({ name }) : m.item_deselected({ name }), "polite");
      } else {
        announce(c.count === 0 ? m.selection_cleared() : m.selection_count({ count: c.count }), "polite");
      }
    },
    [resolveName, announce],
  );

  // Auto-prune ids that vanished from the FULL store (bulk ops, edits, sync).
  // Keyed on the store array IDENTITY (stable between updates); ids derived
  // inside so we never build a fresh Set just to compare on every render.
  useEffect(() => {
    pruneSelection($selection, new Set(allItems.map(getId)));
    // getId is assumed stable; intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [$selection, allItems]);

  return { selectionAdapter, onSelectionChange };
}
