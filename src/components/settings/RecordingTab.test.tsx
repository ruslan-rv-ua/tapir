import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { RecordingTab } from "./RecordingTab";
import { $recordingSettings } from "../../stores/settings";
import type { RecordingSettings } from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  saveRecordingSettings: vi.fn().mockResolvedValue(undefined),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  openDirectoryPicker: vi.fn().mockResolvedValue(null),
}));

const baseRecording: RecordingSettings = {
  outputDir: "recordings",
  fileNameTemplate: "%artist% - %title%",
  incompleteFileNameTemplate: "incomplete/%artist% - %title%",
  streamFileNameTemplate: "%station%/stream",
  saveStreamFile: false,
  deleteStreamFileOnStop: false,
  skipFirstIncompleteTrack: true,
  skipShortTracksMs: 30000,
  autoCorrectCase: true,
  schedulePadBeforeMin: 0,
  schedulePadAfterMin: 0,
  reconnect: {
    maxRetries: 10, retryIntervalSecs: 5, backoffMultiplier: 1.5, maxIntervalSecs: 60,
  },
} as RecordingSettings;

beforeEach(() => {
  vi.clearAllMocks();
  $recordingSettings.set(baseRecording);
});

afterEach(() => {
  $recordingSettings.set(null);
});

describe("RecordingTab — група «Планувальник» (§5.4)", () => {
  it("рендерить обидва поля padding із поточними значеннями", () => {
    const { getByRole } = render(<RecordingTab />);
    expect(getByRole("textbox", { name: m.settings_schedule_pad_before() })).toBeTruthy();
    expect(getByRole("textbox", { name: m.settings_schedule_pad_after() })).toBeTruthy();
  });

  it("зміна «Починати раніше» пише в store", () => {
    const { getByRole } = render(<RecordingTab />);
    const input = getByRole("textbox", { name: m.settings_schedule_pad_before() });
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect($recordingSettings.get()?.schedulePadBeforeMin).toBe(5);
  });

  it("зміна «Закінчувати пізніше» пише в store", () => {
    const { getByRole } = render(<RecordingTab />);
    const input = getByRole("textbox", { name: m.settings_schedule_pad_after() });
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect($recordingSettings.get()?.schedulePadAfterMin).toBe(10);
  });
});
