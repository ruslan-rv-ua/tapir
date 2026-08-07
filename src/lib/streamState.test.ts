import { describe, it, expect } from "vitest";
import { isRecordingLike } from "./streamState";

describe("isRecordingLike", () => {
  it("covers exactly the states with an in-flight recording task", () => {
    expect(isRecordingLike("recording")).toBe(true);
    expect(isRecordingLike("connecting")).toBe(true);
    expect(isRecordingLike("reconnecting")).toBe(true);
  });

  it("does not count an errored stream as active", () => {
    // The entry lingers through reconnect retries; treating it as active would
    // lock the user out of the one stream that needs fixing.
    expect(isRecordingLike("error")).toBe(false);
  });

  it("treats idle, stopped and an unknown stream alike", () => {
    expect(isRecordingLike("idle")).toBe(false);
    expect(isRecordingLike("stopped")).toBe(false);
    expect(isRecordingLike(undefined)).toBe(false);
  });
});
