import { describe, it, expect, vi, beforeEach } from "vitest";
import * as tauri from "./tauri";
import { $toasts } from "../stores/toasts";
import { recordRefusalMessage, toggleRecording } from "./recordingToggle";

// No backend in jsdom — stub the Tauri IPC layer.
vi.mock("./tauri", () => ({
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
  $toasts.set([]);
});

describe("recordRefusalMessage", () => {
  it("swallows both «nothing to do» codes — a second press is a skip, not a failure", () => {
    // The same verdict «Записати все» («пропущено») and the scheduler
    // («потік уже записувався») already give. The row itself is the answer:
    // it flips to «Зупинити запис» a tick later.
    expect(recordRefusalMessage("already_recording")).toBeNull();
    expect(recordRefusalMessage("not_recording")).toBeNull();
  });

  it("passes anything else through untouched", () => {
    // Other refusals on the same call are another record's problem; hiding
    // them here would take away the only detail the user has.
    expect(recordRefusalMessage("Stream s1 not found")).toBe("Stream s1 not found");
    expect(recordRefusalMessage(new Error("boom"))).toBe("Error: boom");
  });
});

describe("toggleRecording — a recording exists from the start command on", () => {
  it.each(["connecting", "reconnecting", "recording"] as const)(
    "stops the recording while it is %s",
    async (state) => {
      await toggleRecording("s1", state);
      expect(tauri.stopRecording).toHaveBeenCalledWith("s1");
      expect(tauri.startRecording).not.toHaveBeenCalled();
    },
  );

  it.each(["idle", "error", undefined] as const)("starts a recording when the state is %s", async (state) => {
    await toggleRecording("s1", state);
    expect(tauri.startRecording).toHaveBeenCalledWith("s1");
    expect(tauri.stopRecording).not.toHaveBeenCalled();
  });
});

describe("toggleRecording — feedback", () => {
  it("stays silent when the backend says the recording already exists (the race after a first press)", async () => {
    vi.mocked(tauri.startRecording).mockRejectedValueOnce("already_recording");
    await toggleRecording("s1", "idle");
    expect($toasts.get()).toEqual([]);
  });

  it("stays silent when there was nothing left to stop", async () => {
    vi.mocked(tauri.stopRecording).mockRejectedValueOnce("not_recording");
    await toggleRecording("s1", "recording");
    expect($toasts.get()).toEqual([]);
  });

  it("reports any other refusal as an error toast", async () => {
    vi.mocked(tauri.startRecording).mockRejectedValueOnce("Stream s1 not found");
    await toggleRecording("s1", "idle");
    expect($toasts.get().map((t) => [t.message, t.type])).toEqual([["Stream s1 not found", "error"]]);
  });
});
