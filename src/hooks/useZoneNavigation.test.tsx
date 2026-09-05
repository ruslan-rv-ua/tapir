import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { useZoneNavigation, useZoneProxy, type ZoneEntry, type ZoneId } from "./useZoneNavigation";

/**
 * Build a real DOM zone (a `[data-zone-id]` container with a focusable button)
 * and a matching ZoneEntry. A `dead` zone declines focus (its focus() no-ops),
 * mirroring an empty/hidden zone or a stale ZoneEntry left by a remount — the
 * case that used to make F6 stall.
 */
function makeZone(
  id: string,
  opts: { dead?: boolean } = {},
): { entry: ZoneEntry; button: HTMLButtonElement } {
  const div = document.createElement("div");
  div.setAttribute("data-zone-id", id);
  const button = document.createElement("button");
  button.textContent = id;
  div.appendChild(button);
  document.body.appendChild(div);
  const entry: ZoneEntry = {
    // Named for the scenario, not for a screen: the cast opts out of ZoneId on purpose.
    id: id as ZoneId,
    focus: opts.dead ? () => {} : () => button.focus(),
  };
  return { entry, button };
}

function pressF6(shift = false): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "F6", shiftKey: shift, bubbles: true }),
  );
}

function mount(zones: ZoneEntry[]) {
  const ref = { current: zones } as RefObject<ZoneEntry[]>;
  return renderHook(() => useZoneNavigation(ref));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useZoneNavigation — F6 cycling", () => {
  it("advances to the next zone on F6", () => {
    const a = makeZone("a");
    const b = makeZone("b");
    const c = makeZone("c");
    mount([a.entry, b.entry, c.entry]);
    a.button.focus();
    pressF6();
    expect(document.activeElement).toBe(b.button);
  });

  it("advances to the previous zone on Shift+F6", () => {
    const a = makeZone("a");
    const b = makeZone("b");
    const c = makeZone("c");
    mount([a.entry, b.entry, c.entry]);
    b.button.focus();
    pressF6(true);
    expect(document.activeElement).toBe(a.button);
  });

  it("wraps around from the last zone to the first", () => {
    const a = makeZone("a");
    const b = makeZone("b");
    const c = makeZone("c");
    mount([a.entry, b.entry, c.entry]);
    c.button.focus();
    pressF6();
    expect(document.activeElement).toBe(a.button);
  });

  // The regression: a zone whose focus() no-ops (stale/empty) must not absorb F6.
  it("skips a zone that declines focus and lands on the next live one", () => {
    const a = makeZone("a");
    const dead = makeZone("dead", { dead: true });
    const c = makeZone("c");
    mount([a.entry, dead.entry, c.entry]);
    a.button.focus();
    pressF6(); // a → (dead no-ops) → c
    expect(document.activeElement).toBe(c.button);
  });

  it("skips backward over a dead zone too", () => {
    const a = makeZone("a");
    const dead = makeZone("dead", { dead: true });
    const c = makeZone("c");
    mount([a.entry, dead.entry, c.entry]);
    c.button.focus();
    pressF6(true); // c → (dead no-ops) → a
    expect(document.activeElement).toBe(a.button);
  });

  it("leaves focus unchanged when no other zone accepts it (no infinite loop)", () => {
    const a = makeZone("a");
    const d1 = makeZone("d1", { dead: true });
    const d2 = makeZone("d2", { dead: true });
    mount([a.entry, d1.entry, d2.entry]);
    a.button.focus();
    pressF6();
    expect(document.activeElement).toBe(a.button);
  });

  it("does nothing while focus is inside a modal", () => {
    const a = makeZone("a");
    const b = makeZone("b");
    mount([a.entry, b.entry]);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const inner = document.createElement("button");
    dialog.appendChild(inner);
    document.body.appendChild(dialog);
    inner.focus();
    pressF6();
    expect(document.activeElement).toBe(inner);
  });
});

/**
 * A zone whose handle knows the entry direction: forward lands on its first
 * stop, backward on its last — the shape every CompositeList handle has.
 */
function makeTwoStopZone(id: string): {
  entry: ZoneEntry;
  first: HTMLButtonElement;
  last: HTMLButtonElement;
  detach(): void;
} {
  const div = document.createElement("div");
  div.setAttribute("data-zone-id", id);
  const first = document.createElement("button");
  const last = document.createElement("button");
  div.append(first, last);
  document.body.appendChild(div);
  const entry: ZoneEntry = {
    // Named for the scenario, not for a screen: the cast opts out of ZoneId on purpose.
    id: id as ZoneId,
    focus: (dir) => (dir === "forward" ? first : last).focus(),
  };
  return { entry, first, last, detach: () => div.remove() };
}

/**
 * Render the hook around a ref the test can swap out afterwards — what a
 * remounting list does to the ref its panel holds.
 */
function renderProxy(id: string, initial: ZoneEntry | null) {
  const ref: RefObject<ZoneEntry | null> = { current: initial };
  // Same opt-out as makeZone: "list" is a scenario name, not a screen zone.
  const { result, rerender } = renderHook(() => useZoneProxy(id as ZoneId, ref));
  return { ref, proxy: result.current, result, rerender };
}

describe("useZoneProxy — a stable stand-in for a zone whose handle is replaced", () => {
  // The regression the proxy exists for: a list remounts (loading → loaded, a
  // rescan, a tab switch) and hands out a NEW handle, but nobody re-registers
  // the zones. The entry App holds must still reach the live handle.
  it("routes F6 to the handle installed after registration", () => {
    const a = makeZone("a");
    const stale = makeTwoStopZone("list");
    const { ref, proxy } = renderProxy("list", stale.entry);
    mount([a.entry, proxy]);

    // The list remounts: old DOM gone, new handle in the ref, zones untouched.
    stale.detach();
    const live = makeTwoStopZone("list");
    ref.current = live.entry;

    a.button.focus();
    pressF6();
    expect(document.activeElement).toBe(live.first);
  });

  it("passes the entry direction through to the handle", () => {
    const a = makeZone("a");
    const list = makeTwoStopZone("list");
    const { proxy } = renderProxy("list", list.entry);
    mount([a.entry, proxy]);

    a.button.focus();
    pressF6(true); // backward into the list → its last stop
    expect(document.activeElement).toBe(list.last);
  });

  it("carries the zone id, so F6 from inside the zone leaves it forward", () => {
    const a = makeZone("a");
    const list = makeTwoStopZone("list");
    const c = makeZone("c");
    const { proxy } = renderProxy("list", list.entry);
    expect(proxy.id).toBe("list");
    mount([a.entry, proxy, c.entry]);

    list.first.focus();
    pressF6();
    expect(document.activeElement).toBe(c.button);
  });

  it("declines focus quietly while no handle is installed", () => {
    const a = makeZone("a");
    const { proxy } = renderProxy("list", null);
    const c = makeZone("c");
    mount([a.entry, proxy, c.entry]);

    a.button.focus();
    pressF6(); // a → (list has no handle) → c
    expect(document.activeElement).toBe(c.button);
  });

  // Registration effects push the entry into App's zones array once; a fresh
  // object per render would either go stale there or, listed as an effect
  // dependency, re-register on every render.
  it("hands out the same entry on every render", () => {
    const { result, rerender } = renderProxy("list", null);
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
