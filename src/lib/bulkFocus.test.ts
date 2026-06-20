import { describe, it, expect } from "vitest";
import { computeBulkFocusTarget } from "./bulkFocus";

const items = (...ids: string[]) => ids.map((id) => ({ id }));

describe("computeBulkFocusTarget", () => {
  it("lands on the first survivor at/after the top removed index", () => {
    // remove b,c from [a,b,c,d] → top removed idx 1 → survivor at that idx is d
    expect(computeBulkFocusTarget(items("a", "b", "c", "d"), new Set(["b", "c"]))).toBe("d");
  });

  it("falls back to the new last row when the tail was removed", () => {
    expect(computeBulkFocusTarget(items("a", "b", "c"), new Set(["b", "c"]))).toBe("a");
  });

  it("returns null when every visible row was removed", () => {
    expect(computeBulkFocusTarget(items("a", "b"), new Set(["a", "b"]))).toBeNull();
  });

  it("falls back to the first row when no removed id is visible (findIndex === -1)", () => {
    // e.g. selection removed under a filter — land on the first row, never <body>
    expect(computeBulkFocusTarget(items("a", "b"), new Set(["zzz"]))).toBe("a");
  });
});
