import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { AudioTab } from "./AudioTab";
import { $settings } from "../../stores/settings";
import { $announcer } from "../../stores/announcer";
import * as tauri from "../../lib/tauri";
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
  showTrackInTitle: true,
  doubleClickAction: "play",
  smtcEnabled: true,
  autostart: false,
  autostartMinimized: true,
  prevRestartThresholdMs: 0,
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

describe("AudioTab — playback settings", () => {
  it("stores the prev-restart threshold as milliseconds", () => {
    const { getByRole } = render(<AudioTab />);
    // react-aria NumberField renders a textbox associated via aria-labelledby.
    const input = getByRole("textbox", { name: m.settings_prev_restart_threshold() });
    fireEvent.change(input, { target: { value: "3" } });
    // react-aria NumberField commits on Enter in jsdom.
    fireEvent.keyDown(input, { key: "Enter" });
    expect($settings.get()?.prevRestartThresholdMs).toBe(3000);
  });

  // Автоперехід і «звідки відновлювати» переїхали в діалог профілю
  // (ADR 2026-08-08): у налаштуваннях програми їх бути не повинно.
  it("does not show the profile-scoped playback controls", () => {
    const { queryByRole } = render(<AudioTab />);
    expect(queryByRole("checkbox", { name: new RegExp(m.settings_auto_advance()) })).toBeNull();
    expect(queryByRole("button", { name: new RegExp(m.settings_resume_file_from()) })).toBeNull();
  });
});

describe("AudioTab — SMTC toggle (FR-7)", () => {
  it("toggles smtcEnabled into the settings store", () => {
    const { getByRole } = render(<AudioTab />);
    fireEvent.click(
      getByRole("checkbox", { name: new RegExp(m.settings_smtc_enabled()) }),
    );
    expect($settings.get()?.smtcEnabled).toBe(false);
  });
});

// Той самий шов, що в GeneralTab: у діалозі немає жодного візуального
// підтвердження запису, тож автозбереження мусить бути чутним.
describe("AudioTab — автозбереження чути", () => {
  it("оголошує збереження після зміни налаштування", async () => {
    const { getByRole } = render(<AudioTab />);
    fireEvent.click(
      getByRole("checkbox", { name: new RegExp(m.settings_smtc_enabled()) }),
    );

    await waitFor(() => {
      expect(tauri.saveSettings).toHaveBeenCalled();
      expect($announcer.get()).toEqual({ message: m.settings_saved(), priority: "polite" });
    });
  });
});
