import { describe, it, expect } from "vitest";
import { selectRecordingAnnouncement, describeRecording, failureReasonText, DEFAULT_FAILURE_REASON } from "./recordingAnnounce";
import type { RecordingStatusPayload, StreamState } from "./tauri";

const payload = (status: StreamState, error?: RecordingStatusPayload["error"]): RecordingStatusPayload =>
  ({ streamId: "s1", status, ...(error ? { error } : {}) });

describe("selectRecordingAnnouncement", () => {
  it("speaks for the three transitions that end something", () => {
    expect(selectRecordingAnnouncement(payload("recording"))).toEqual({ kind: "started" });
    expect(selectRecordingAnnouncement(payload("stopped"))).toEqual({ kind: "stopped" });
    expect(selectRecordingAnnouncement(payload("error", "disk_write_failed")))
      .toEqual({ kind: "failed", reason: "disk_write_failed" });
  });

  it("stays silent while the stream is still trying", () => {
    // Every failed attempt used to fire a toast — ten of them over ~40 minutes,
    // never once saying the stream had finally given up (ADR 2026-09-06 §4).
    // The carrier for a retry is the row itself, not speech.
    expect(selectRecordingAnnouncement(payload("connecting"))).toBeNull();
    expect(selectRecordingAnnouncement(payload("reconnecting"))).toBeNull();
    expect(selectRecordingAnnouncement(payload("idle"))).toBeNull();
  });

  it("still speaks when a failure arrives without a reason", () => {
    // A reason-less `error` is a backend defect, but silence would hide the one
    // event this whole record exists to make audible.
    expect(selectRecordingAnnouncement(payload("error")))
      .toEqual({ kind: "failed", reason: "station_unreachable" });
  });
});

describe("failureReasonText", () => {
  it("defaults a missing reason instead of leaving the row blank", () => {
    // The row reads this straight off the nullable status field; before, three
    // sites each defaulted by hand.
    expect(failureReasonText(null)).toBe(failureReasonText(DEFAULT_FAILURE_REASON));
    expect(failureReasonText(undefined)).toBe("Станція не відповідає");
    expect(failureReasonText("disk_write_failed")).toBe("Не вдалося записати на диск");
  });
});

describe("describeRecording", () => {
  it("names the station and the reason it gave up", () => {
    expect(describeRecording({ kind: "failed", reason: "station_unreachable" }, "Radio X"))
      .toEqual({ message: "Radio X: Станція не відповідає", priority: "polite", toast: "error" });
    expect(describeRecording({ kind: "failed", reason: "disk_write_failed" }, "Radio X"))
      .toEqual({ message: "Radio X: Не вдалося записати на диск", priority: "polite", toast: "error" });
  });

  it("keeps the failure polite", () => {
    // The regression guard. `assertive` interrupts NVDA mid-sentence, and it was
    // what the dead branch carried; a give-up arrives ~40 minutes after the last
    // keypress, so by accessibility.md §1.4's own criterion it is a background
    // fact. Ten streams dropped by one outage must not mean ten interruptions.
    expect(describeRecording({ kind: "failed", reason: "station_unreachable" }, "Radio X").priority)
      .toBe("polite");
  });

  it("toasts what the screen does not already carry", () => {
    expect(describeRecording({ kind: "started" }, "Radio X"))
      .toEqual({ message: "Запис розпочато: Radio X", priority: "polite", toast: "success" });
    // Stop is announced only: the row goes back to «Очікування» on its own.
    expect(describeRecording({ kind: "stopped" }, "Radio X"))
      .toEqual({ message: "Запис зупинено: Radio X", priority: "polite", toast: null });
  });
});
