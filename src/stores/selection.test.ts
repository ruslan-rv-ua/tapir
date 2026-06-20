import { describe, it, expect } from "vitest";
import { atom } from "nanostores";
import { replaceSelection, pruneSelection } from "./selection";

describe("replaceSelection", () => {
  it("replaces with a fresh Set identity so useStore subscribers fire", () => {
    const $sel = atom<Set<string>>(new Set(["a"]));
    const before = $sel.get();
    replaceSelection($sel, new Set(["b", "c"]));
    expect($sel.get()).not.toBe(before);
    expect([...$sel.get()]).toEqual(["b", "c"]);
  });
});

describe("pruneSelection", () => {
  it("drops ids no longer present", () => {
    const $sel = atom<Set<string>>(new Set(["a", "b", "c"]));
    pruneSelection($sel, new Set(["a", "c"]));
    expect([...$sel.get()].sort()).toEqual(["a", "c"]);
  });

  it("is a no-op (keeps the same Set identity) when nothing changed", () => {
    const $sel = atom<Set<string>>(new Set(["a", "b"]));
    const before = $sel.get();
    pruneSelection($sel, new Set(["a", "b", "z"]));
    expect($sel.get()).toBe(before);
  });
});
