import { describe, it, expect } from "vitest";
import { isLowDiskSpace } from "./formatters";

const GiB = 1024 ** 3;

describe("isLowDiskSpace", () => {
  it("is false when threshold is 0 (disabled)", () => {
    expect(isLowDiskSpace(0, 0)).toBe(false);
  });
  it("is false when free space is null (unknown)", () => {
    expect(isLowDiskSpace(null, 5)).toBe(false);
  });
  it("is true when free bytes are below threshold", () => {
    expect(isLowDiskSpace(2 * GiB, 5)).toBe(true);
  });
  it("is false when free bytes are at or above threshold", () => {
    expect(isLowDiskSpace(5 * GiB, 5)).toBe(false);
    expect(isLowDiskSpace(6 * GiB, 5)).toBe(false);
  });
});
