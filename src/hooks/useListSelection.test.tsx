import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { atom } from "nanostores";
import * as m from "../i18n/paraglide/messages";
import { useListSelection } from "./useListSelection";
import type { SelectionChange } from "./useCompositeList";

type Row = { id: string; name: string };

function setup(allItems: Row[]) {
  const $sel = atom<Set<string>>(new Set());
  const announce = vi.fn();
  const resolveName = (id: string) => allItems.find((r) => r.id === id)?.name ?? "";
  const hook = renderHook(
    (props: { items: Row[] }) =>
      useListSelection({
        $selection: $sel,
        announce,
        resolveName,
        allItems: props.items,
        getId: (r: Row) => r.id,
      }),
    { initialProps: { items: allItems } },
  );
  return { $sel, announce, hook };
}

const rows: Row[] = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Bravo" },
];

describe("useListSelection — adapter", () => {
  it("current() reads the atom and replace() installs a fresh Set", () => {
    const { $sel, hook } = setup(rows);
    act(() => hook.result.current.selectionAdapter.replace(new Set(["a"])));
    expect([...$sel.get()]).toEqual(["a"]);
    expect(hook.result.current.selectionAdapter.current().has("a")).toBe(true);
  });
});

describe("useListSelection — onSelectionChange announces", () => {
  const fire = (h: ReturnType<typeof setup>["hook"], c: SelectionChange) =>
    act(() => h.result.current.onSelectionChange(c));

  it("key single-select announces the localized name", () => {
    const s = setup(rows);
    fire(s.hook, { kind: "single", via: "key", count: 1, lastId: "a", selected: true });
    expect(s.announce).toHaveBeenCalledWith(m.item_selected({ name: "Alpha" }), "polite");
  });

  it("key single-deselect announces the localized name", () => {
    const s = setup(rows);
    fire(s.hook, { kind: "single", via: "key", count: 0, lastId: "b", selected: false });
    expect(s.announce).toHaveBeenCalledWith(m.item_deselected({ name: "Bravo" }), "polite");
  });

  it("skips a pointer single (DOM focus already moved → NVDA reads the row)", () => {
    const s = setup(rows);
    fire(s.hook, { kind: "single", via: "pointer", count: 1, lastId: "a", selected: true });
    expect(s.announce).not.toHaveBeenCalled();
  });

  it("group announces a count, and the cleared message at zero", () => {
    const s = setup(rows);
    fire(s.hook, { kind: "group", via: "key", count: 2 });
    expect(s.announce).toHaveBeenCalledWith(m.selection_count({ count: 2 }), "polite");
    fire(s.hook, { kind: "group", via: "key", count: 0 });
    expect(s.announce).toHaveBeenCalledWith(m.selection_cleared(), "polite");
  });
});

describe("useListSelection — prune effect", () => {
  it("drops selected ids that vanish from allItems", () => {
    const s = setup(rows);
    act(() => s.hook.result.current.selectionAdapter.replace(new Set(["a", "b"])));
    act(() => s.hook.rerender({ items: [{ id: "a", name: "Alpha" }] }));
    expect([...s.$sel.get()]).toEqual(["a"]);
  });
});
