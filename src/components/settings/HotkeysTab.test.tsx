import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { HotkeysTab } from "./HotkeysTab";
import { $settings } from "../../stores/settings";
import type { GlobalSettings } from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  saveSettings: vi.fn().mockResolvedValue(undefined),
  registerHotkeys: vi.fn().mockResolvedValue([]),
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

// The toggleRecording label is "Recording (toggle)" — its parens are regex
// metacharacters, so match the accessible name with a prefix function instead.
function recordButton(getByRole: ReturnType<typeof render>["getByRole"]) {
  const label = m.settings_hotkey_toggle_recording();
  return getByRole("button", { name: (name: string) => name.startsWith(label) });
}

describe("HotkeysTab — reserved-combo collision (KB-09)", () => {
  it("blocks a combo reserved by a webview action and does not save it", () => {
    const { getByRole } = render(<HotkeysTab />);
    const button = recordButton(getByRole);
    fireEvent.click(button); // arm the recorder
    fireEvent.keyDown(button, { code: "KeyK", key: "k", ctrlKey: true });

    expect(getByRole("alert")).toHaveTextContent(
      m.settings_hotkey_reserved({ action: m.command_palette_label() }),
    );
    expect($settings.get()?.hotkeys.toggleRecording).toBe("");
  });

  it("still records a free combo into the store", () => {
    const { getByRole } = render(<HotkeysTab />);
    const button = recordButton(getByRole);
    fireEvent.click(button);
    fireEvent.keyDown(button, { code: "KeyJ", key: "j", ctrlKey: true, shiftKey: true });

    expect($settings.get()?.hotkeys.toggleRecording).toBe("Ctrl+Shift+J");
  });
});
