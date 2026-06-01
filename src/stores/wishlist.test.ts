import { describe, it, expect, beforeEach } from "vitest";
import { $wishlist, $ignorelist } from "./wishlist";
import type { WishlistEntry } from "../lib/tauri";

function entry(pattern: string): WishlistEntry {
  return { pattern, minBitrate: null, format: null, removeAfterRecord: false, addToIgnorelistAfterRecord: false, addedAt: "2026-01-01" };
}

beforeEach(() => {
  $wishlist.set([]);
  $ignorelist.set([]);
});

describe("$wishlist", () => {
  it("defaults to empty", () => { expect($wishlist.get()).toHaveLength(0); });
  it("stores entries", () => {
    $wishlist.set([entry("Jazz")]);
    expect($wishlist.get()[0].pattern).toBe("Jazz");
  });
});

describe("$ignorelist", () => {
  it("defaults to empty", () => { expect($ignorelist.get()).toHaveLength(0); });
});
