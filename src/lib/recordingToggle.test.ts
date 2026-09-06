import { describe, it, expect, vi, beforeEach } from "vitest";
import * as tauri from "./tauri";
import { $toasts } from "../stores/toasts";
import * as m from "../i18n/paraglide/messages";
import { recordRefusalMessage, reportRecordRefusal, toggleRecording } from "./recordingToggle";

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

  it("words the disk-threshold refusal without numbers", () => {
    // The figures have a visible carrier already — the status bar and the
    // «Вільно» metric flip to «low» at the same threshold — and the backend
    // keeps them in the log. Nothing English, nothing numeric, crosses.
    const text = recordRefusalMessage("disk_space_low");
    expect(text).toBe(m.record_refused_disk_space());
    expect(text).not.toMatch(/disk_space_low|\d/);
  });

  it("names a stream that is no longer in the active profile — a toast, not silence", () => {
    // The list should never have offered that row; swallowing the refusal
    // would hide exactly that defect.
    expect(recordRefusalMessage("stream_not_found")).toBe(m.stream_not_found_in_profile());
  });

  it("still lets untyped prose through as it came", () => {
    // Hiding it here would take away the only detail the user has.
    expect(recordRefusalMessage("Network error: boom")).toBe("Network error: boom");
    expect(recordRefusalMessage(new Error("boom"))).toBe("Error: boom");
  });
});

describe("reportRecordRefusal — one answer for every recording command", () => {
  it("shows a worded refusal as an error toast", () => {
    reportRecordRefusal("disk_space_low", "test");
    expect($toasts.get().map((t) => [t.message, t.type])).toEqual([
      [m.record_refused_disk_space(), "error"],
    ]);
  });

  it("shows nothing for a skip", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    reportRecordRefusal("already_recording", "test");
    expect($toasts.get()).toEqual([]);
    expect(debug).toHaveBeenCalledOnce();
    debug.mockRestore();
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

  it("words the disk refusal in the interface language, not the backend's", async () => {
    vi.mocked(tauri.startRecording).mockRejectedValueOnce("disk_space_low");
    await toggleRecording("s1", "idle");
    expect($toasts.get().map((t) => [t.message, t.type])).toEqual([
      [m.record_refused_disk_space(), "error"],
    ]);
  });

  it("reports untyped prose as an error toast, as it came", async () => {
    vi.mocked(tauri.startRecording).mockRejectedValueOnce("Network error: boom");
    await toggleRecording("s1", "idle");
    expect($toasts.get().map((t) => [t.message, t.type])).toEqual([["Network error: boom", "error"]]);
  });
});
