import { describe, it, expect } from "vitest";
import { formatTimeParts } from "./time";

describe("formatTimeParts", () => {
  it("splits ms into whole minutes and leftover seconds", () => {
    expect(formatTimeParts(754_000)).toEqual({ min: 12, sec: 34 });
  });

  it("floors sub-second remainders", () => {
    expect(formatTimeParts(1_999)).toEqual({ min: 0, sec: 1 });
  });

  it("handles zero", () => {
    expect(formatTimeParts(0)).toEqual({ min: 0, sec: 0 });
  });
});
