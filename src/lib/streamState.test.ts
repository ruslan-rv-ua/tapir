import { describe, it, expect } from "vitest";
import { isRecordingLike, needsAttention } from "./streamState";

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

describe("needsAttention", () => {
  it("collects both the stream that gave up and the one still fighting", () => {
    // The bucket is one predicate behind both the filter chip and the metric
    // (ADR 2026-09-06 §2); counting only `error` would leave the ~40 minutes of
    // retries showing zero.
    expect(needsAttention("error")).toBe(true);
    expect(needsAttention("reconnecting")).toBe(true);
  });

  it("leaves healthy, finished and unknown streams out", () => {
    expect(needsAttention("recording")).toBe(false);
    expect(needsAttention("connecting")).toBe(false);
    expect(needsAttention("idle")).toBe(false);
    expect(needsAttention("stopped")).toBe(false);
    expect(needsAttention(undefined)).toBe(false);
  });
});
