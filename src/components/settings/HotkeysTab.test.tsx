import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { HotkeysTab } from "./HotkeysTab";
import { $settings } from "../../stores/settings";
import type { GlobalSettings } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { $announcer } from "../../stores/announcer";

vi.mock("../../lib/tauri", () => ({
  saveSettings: vi.fn().mockResolvedValue(undefined),
  registerHotkeys: vi.fn().mockResolvedValue([]),
  defaultHotkeys: vi.fn().mockResolvedValue({
    toggleRecording: "Ctrl+Shift+R",
    togglePlayback: "Ctrl+Shift+P",
    volumeUp: "Ctrl+Shift+Up",
    volumeDown: "Ctrl+Shift+Down",
    toggleWindow: "Ctrl+Shift+H",
  }),
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
  $announcer.set(null);
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

describe("HotkeysTab — reset to defaults (KB-10)", () => {
  it("resets all combos, saves, re-registers and announces", async () => {
    const { getByRole } = render(<HotkeysTab />);
    fireEvent.click(getByRole("button", { name: m.settings_hotkeys_reset() }));

    // Store gets the defaults from the backend command.
    await waitFor(() => {
      expect($settings.get()?.hotkeys.toggleRecording).toBe("Ctrl+Shift+R");
    });
    expect($settings.get()?.hotkeys.toggleWindow).toBe("Ctrl+Shift+H");
    expect($announcer.get()?.message).toBe(m.settings_hotkeys_reset_done());

    // Debounced auto-save (300ms) persists and re-registers.
    await waitFor(() => {
      expect(tauri.saveSettings).toHaveBeenCalled();
      expect(tauri.registerHotkeys).toHaveBeenCalled();
    });
  });
});
