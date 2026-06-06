import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { AudioTab } from "./AudioTab";
import { $settings } from "../../stores/settings";
import type { GlobalSettings } from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  listOutputDevices: vi.fn().mockResolvedValue([]),
  setOutputDevice: vi.fn().mockResolvedValue(undefined),
  saveSettings: vi.fn().mockResolvedValue(undefined),
}));

const baseSettings: GlobalSettings = {
  language: "en-US",
  theme: "auto",
  activeProfile: "Default",
  outputDevice: null,
  minimizeToTray: false,
  showTrayNotifications: true,
  showTrackInTitle: true,
  diskSpaceThresholdGb: 1,
  doubleClickAction: "play",
  bandwidthLimitKbps: 0,
  autostart: false,
  autoAdvance: true,
  prevRestartThresholdMs: 0,
  hotkeys: {
    toggleRecording: "",
    togglePlayback: "",
    volumeUp: "",
    volumeDown: "",
    toggleWindow: "",
  },
  logRotation: true,
  logMaxSizeMb: 10,
  logLevel: "info",
};

beforeEach(() => {
  vi.clearAllMocks();
  $settings.set(baseSettings);
});

afterEach(() => {
  $settings.set(null);
});

describe("AudioTab — playback settings", () => {
  it("toggles autoAdvance into the settings store", () => {
    const { getByRole } = render(<AudioTab />);
    // react-aria Checkbox renders the visual ✓ inside the label wrapper,
    // so the accessible name includes the checkmark prefix.
    // Use a regex to match the label text regardless of prefix.
    fireEvent.click(
      getByRole("checkbox", { name: new RegExp(m.settings_auto_advance()) }),
    );
    expect($settings.get()?.autoAdvance).toBe(false);
  });

  it("stores the prev-restart threshold as milliseconds", () => {
    const { getByRole } = render(<AudioTab />);
    // react-aria NumberField renders a textbox associated via aria-labelledby.
    const input = getByRole("textbox", { name: m.settings_prev_restart_threshold() });
    fireEvent.change(input, { target: { value: "3" } });
    // react-aria NumberField commits on Enter in jsdom.
    fireEvent.keyDown(input, { key: "Enter" });
    expect($settings.get()?.prevRestartThresholdMs).toBe(3000);
  });
});
