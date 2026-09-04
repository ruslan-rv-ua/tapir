import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { useZoneNavigation, type ZoneEntry } from "./useZoneNavigation";

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
    id,
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
