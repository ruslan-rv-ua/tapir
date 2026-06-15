import { describe, it, expect, beforeEach } from "vitest";
import { $streamSelection, replaceSelection, pruneSelection } from "./streams";

beforeEach(() => $streamSelection.set(new Set()));

describe("$streamSelection + replaceSelection", () => {
  it("defaults to an empty set", () => {
    expect($streamSelection.get().size).toBe(0);
  });

  it("replaceSelection stores a brand-new Set (new identity for useStore)", () => {
    const before = $streamSelection.get();
    replaceSelection(new Set(["a", "b"]));
    const after = $streamSelection.get();
    expect(after).not.toBe(before);
    expect([...after].sort()).toEqual(["a", "b"]);
  });
});

describe("pruneSelection", () => {
  it("drops ids that no longer exist", () => {
    replaceSelection(new Set(["a", "b", "c"]));
    pruneSelection(new Set(["a", "c"])); // b is gone
    expect([...$streamSelection.get()].sort()).toEqual(["a", "c"]);
  });

  it("is a no-op (same Set identity) when nothing changed — avoids extra rerenders", () => {
    replaceSelection(new Set(["a", "b"]));
    const before = $streamSelection.get();
    pruneSelection(new Set(["a", "b", "x"])); // all selected ids still exist
    expect($streamSelection.get()).toBe(before);
  });
});
