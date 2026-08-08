import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { ProfileRecordingTab } from "./ProfileRecordingTab";
import type { RecordingSettings } from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  openDirectoryPicker: vi.fn().mockResolvedValue(null),
}));

const baseRecording: RecordingSettings = {
  outputDir: "recordings",
  diskSpaceThresholdGb: 1,
  fileNameTemplate: "%artist% - %title%",
  incompleteFileNameTemplate: "incomplete/%artist% - %title%",
  streamFileNameTemplate: "%station%/stream",
  saveStreamFile: false,
  skipFirstIncompleteTrack: true,
  skipShortTracksMs: 30000,
  autoCorrectCase: true,
  schedulePadBeforeMin: 0,
  schedulePadAfterMin: 0,
  reconnect: {
    maxRetries: 10, retryIntervalSecs: 5, backoffMultiplier: 1.5, maxIntervalSecs: 60,
  },
};

let onChange: Mock<(patch: Partial<RecordingSettings>) => void>;

function renderTab(over: Partial<RecordingSettings> = {}) {
  return render(
    <ProfileRecordingTab recording={{ ...baseRecording, ...over }} onChange={onChange} />,
  );
}

beforeEach(() => {
  onChange = vi.fn();
});

describe("ProfileRecordingTab — група «Планувальник» (§5.4)", () => {
  it("рендерить обидва поля padding із поточними значеннями", () => {
    const { getByRole } = renderTab();
    expect(getByRole("textbox", { name: m.settings_schedule_pad_before() })).toBeTruthy();
    expect(getByRole("textbox", { name: m.settings_schedule_pad_after() })).toBeTruthy();
  });

  it("зміна «Починати раніше» повідомляється діалогу", () => {
    const { getByRole } = renderTab();
    const input = getByRole("textbox", { name: m.settings_schedule_pad_before() });
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ schedulePadBeforeMin: 5 });
  });

  it("зміна «Закінчувати пізніше» повідомляється діалогу", () => {
    const { getByRole } = renderTab();
    const input = getByRole("textbox", { name: m.settings_schedule_pad_after() });
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ schedulePadAfterMin: 10 });
  });
});

describe("ProfileRecordingTab — поріг вільного місця", () => {
  it("показує профільне значення, а не глобальне", () => {
    const { getByRole } = renderTab({ diskSpaceThresholdGb: 25 });
    const input = getByRole("textbox", { name: m.settings_disk_threshold() });
    expect((input as HTMLInputElement).value).toBe("25");
  });

  it("пише поріг у секцію запису профілю", () => {
    const { getByRole } = renderTab();
    const input = getByRole("textbox", { name: m.settings_disk_threshold() });
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ diskSpaceThresholdGb: 7 });
  });
});
