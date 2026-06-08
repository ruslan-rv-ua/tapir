import { describe, it, expect } from "vitest";
import { SECTIONS } from "./sections";

describe("SECTIONS", () => {
  it("assigns digits 0..5 in array order with no gaps or dupes", () => {
    expect(SECTIONS.map((s) => s.digit)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("each entry's array index equals its digit (index lookup is safe)", () => {
    SECTIONS.forEach((s, i) => expect(s.digit).toBe(i));
  });

  it("marks only Schedule as disabled", () => {
    expect(SECTIONS.filter((s) => s.disabled).map((s) => s.id)).toEqual(["schedule"]);
  });

  it("orders profiles first, then streams..songs", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual([
      "profiles", "streams", "browser", "wishlist", "schedule", "songs",
    ]);
  });

  it("every label getter returns a non-empty string", () => {
    for (const s of SECTIONS) expect(s.label().length).toBeGreaterThan(0);
  });
});
