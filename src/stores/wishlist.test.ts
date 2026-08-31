import { describe, it, expect, beforeEach } from "vitest";
import { $wishlist, $ignorelist, $wishlistMatches, MATCH_LOG_CAPACITY, prependMatch } from "./wishlist";
import type { WishlistEntry, WishlistMatch } from "../lib/tauri";

function entry(pattern: string): WishlistEntry {
  return { pattern, minBitrate: null, format: null, removeAfterRecord: false, addToIgnorelistAfterRecord: false, addedAt: "2026-01-01" };
}

function match(id: number): WishlistMatch {
  return {
    id,
    matchedAt: "2026-08-31T21:00:00+03:00",
    streamId: "st1",
    stationName: "Radio Tapir",
    artist: "Tycho",
    title: `track ${id}`,
    pattern: "Tycho*",
  };
}

beforeEach(() => {
  $wishlist.set([]);
  $ignorelist.set([]);
  $wishlistMatches.set([]);
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
  it("stores patterns", () => {
    $ignorelist.set(["Jazz", "Pop"]);
    expect($ignorelist.get()).toContain("Jazz");
    expect($ignorelist.get()).toHaveLength(2);
  });
});

describe("prependMatch", () => {
  it("puts the newest match on top", () => {
    const out = prependMatch([match(1)], match(2));
    expect(out.map((m) => m.id)).toEqual([2, 1]);
  });

  it("drops the oldest at the ceiling, mirroring the Rust buffer", () => {
    const full = Array.from({ length: MATCH_LOG_CAPACITY }, (_, i) => match(MATCH_LOG_CAPACITY - i));
    const out = prependMatch(full, match(MATCH_LOG_CAPACITY + 1));
    expect(out).toHaveLength(MATCH_LOG_CAPACITY);
    expect(out[0].id).toBe(MATCH_LOG_CAPACITY + 1);
    expect(out[out.length - 1].id).toBe(2);
  });
});
