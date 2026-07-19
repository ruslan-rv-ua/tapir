// src/components/wishlist/examplePatterns.test.ts
import { it, expect } from "vitest";
import { EXAMPLE_WISHLIST_PATTERNS, EXAMPLE_IGNORELIST_PATTERNS } from "./examplePatterns";

it("seeds the agreed wishlist examples", () => {
  expect(EXAMPLE_WISHLIST_PATTERNS).toEqual(["*новин*", "*news*"]);
});

it("seeds the agreed ignorelist examples", () => {
  expect(EXAMPLE_IGNORELIST_PATTERNS).toEqual([
    "*реклама*", "*джингл*", "*advert*", "*jingle*", "*promo*",
  ]);
});

it("wraps every example in *…* so the anchored matcher can hit a substring", () => {
  for (const p of [...EXAMPLE_WISHLIST_PATTERNS, ...EXAMPLE_IGNORELIST_PATTERNS]) {
    expect(p.startsWith("*")).toBe(true);
    expect(p.endsWith("*")).toBe(true);
    expect(p.length).toBeGreaterThan(2);
  }
});
