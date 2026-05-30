import { describe, it, expect } from "vitest";
import { isVerbose, toggleVerbose } from "./logLevel";

describe("isVerbose", () => {
  it("is true for debug and trace", () => {
    expect(isVerbose("debug")).toBe(true);
    expect(isVerbose("trace")).toBe(true);
  });
  it("is false for info, warn, error", () => {
    expect(isVerbose("info")).toBe(false);
    expect(isVerbose("warn")).toBe(false);
    expect(isVerbose("error")).toBe(false);
  });
});

describe("toggleVerbose", () => {
  it("turning on a non-verbose level yields debug", () => {
    expect(toggleVerbose("info", true)).toBe("debug");
    expect(toggleVerbose("error", true)).toBe("debug");
  });
  it("turning on preserves an already-verbose trace level", () => {
    expect(toggleVerbose("trace", true)).toBe("trace");
  });
  it("turning off yields info", () => {
    expect(toggleVerbose("debug", false)).toBe("info");
    expect(toggleVerbose("trace", false)).toBe("info");
  });
});
