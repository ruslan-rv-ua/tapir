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
    volumeUp: "Ctrl+Alt+Up",
    volumeDown: "Ctrl+Alt+Down",
    toggleWindow: "Ctrl+Shift+H",
    stopAll: "Ctrl+Shift+S",
    prevTrack: "Ctrl+Alt+Left",
    nextTrack: "Ctrl+Alt+Right",
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
  sortBy: "name",
  bandwidthLimitKbps: 0,
  autostart: false,
  autoAdvance: true,
  prevRestartThresholdMs: 0,
  smtcEnabled: true,
  hotkeys: {
    toggleRecording: "",
    togglePlayback: "",
    volumeUp: "",
    volumeDown: "",
    toggleWindow: "",
    stopAll: "",
    prevTrack: "",
    nextTrack: "",
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
      expect($settings.get()?.hotkeys.toggleWindow).toBe("Ctrl+Shift+H");
      expect($announcer.get()?.message).toBe(m.settings_hotkeys_reset_done());
    });

    // Debounced auto-save (300ms) persists and re-registers.
    await waitFor(() => {
      expect(tauri.saveSettings).toHaveBeenCalled();
      expect(tauri.registerHotkeys).toHaveBeenCalled();
    });
  });
});

describe("HotkeysTab — clear hotkey", () => {
  it("clears the combo and announces it", () => {
    $settings.set({
      ...baseSettings,
      hotkeys: { ...baseSettings.hotkeys, toggleRecording: "Ctrl+Shift+R" },
    });
    const { getByRole } = render(<HotkeysTab />);
    fireEvent.click(
      getByRole("button", {
        name: m.settings_hotkey_clear({ action: m.settings_hotkey_toggle_recording() }),
      }),
    );

    expect($settings.get()?.hotkeys.toggleRecording).toBe("");
    expect($announcer.get()?.message).toBe(m.settings_hotkey_cleared());
  });
});

describe("HotkeysTab — prev/next track hotkeys", () => {
  it("renders recorder rows for both track hotkeys", () => {
    const { getByRole } = render(<HotkeysTab />);
    for (const label of [m.settings_hotkey_prev_track(), m.settings_hotkey_next_track()]) {
      expect(
        getByRole("button", { name: (name: string) => name.startsWith(label) }),
      ).toBeInTheDocument();
    }
  });

  it("rejects a combo already taken by next_track as a duplicate", () => {
    $settings.set({
      ...baseSettings,
      hotkeys: { ...baseSettings.hotkeys, nextTrack: "Ctrl+Alt+Right" },
    });
    const { getByRole } = render(<HotkeysTab />);
    const button = recordButton(getByRole);
    fireEvent.click(button); // arm the recorder
    fireEvent.keyDown(button, { code: "ArrowRight", key: "ArrowRight", ctrlKey: true, altKey: true });

    expect(getByRole("alert")).toHaveTextContent(
      m.settings_hotkey_duplicate({ action: m.settings_hotkey_next_track() }),
    );
    expect($settings.get()?.hotkeys.toggleRecording).toBe("");
  });
});

describe("HotkeysTab — global stop_all (KB-12)", () => {
  it("renders a recorder row for the stop-all hotkey", () => {
    const { getByRole } = render(<HotkeysTab />);
    const label = m.settings_hotkey_stop_all();
    expect(
      getByRole("button", { name: (name: string) => name.startsWith(label) }),
    ).toBeInTheDocument();
  });

  it("rejects a combo already taken by stop_all as a duplicate", () => {
    $settings.set({
      ...baseSettings,
      hotkeys: { ...baseSettings.hotkeys, stopAll: "Ctrl+Shift+J" },
    });
    const { getByRole } = render(<HotkeysTab />);
    const button = recordButton(getByRole);
    fireEvent.click(button); // arm the recorder
    fireEvent.keyDown(button, { code: "KeyJ", key: "j", ctrlKey: true, shiftKey: true });

    expect(getByRole("alert")).toHaveTextContent(
      m.settings_hotkey_duplicate({ action: m.settings_hotkey_stop_all() }),
    );
    expect($settings.get()?.hotkeys.toggleRecording).toBe("");
  });
});
