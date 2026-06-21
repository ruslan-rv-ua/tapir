import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import * as m from "../../i18n/paraglide/messages";
import { GeneralTab } from "./GeneralTab";
import { $settings } from "../../stores/settings";
import type { GlobalSettings } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  saveSettings: vi.fn().mockResolvedValue(undefined),
  syncAutostart: vi.fn().mockResolvedValue(undefined),
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
  autostartMinimized: true,
  autoAdvance: true,
  prevRestartThresholdMs: 0,
  smtcEnabled: true,
  hotkeys: {
    toggleRecording: "", togglePlayback: "", volumeUp: "", volumeDown: "",
    toggleWindow: "", stopAll: "", prevTrack: "", nextTrack: "",
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

function autostartCheckbox(getByRole: ReturnType<typeof render>["getByRole"]) {
  return getByRole("checkbox", { name: new RegExp(m.settings_autostart()) });
}
function minimizedCheckbox(getByRole: ReturnType<typeof render>["getByRole"]) {
  return getByRole("checkbox", { name: new RegExp(m.settings_autostart_minimized()) });
}

describe("GeneralTab — Autostart", () => {
  it("enabling 'Launch with Windows' writes the store and calls syncAutostart(true, minimized)", () => {
    const { getByRole } = render(<GeneralTab />);
    fireEvent.click(autostartCheckbox(getByRole));
    expect($settings.get()?.autostart).toBe(true);
    expect(tauri.syncAutostart).toHaveBeenCalledWith(true, true);
  });

  it("'Launch minimized' is disabled while autostart is off", () => {
    const { getByRole } = render(<GeneralTab />);
    expect(minimizedCheckbox(getByRole)).toBeDisabled();
  });

  it("'Launch minimized' is enabled when autostart is on", () => {
    $settings.set({ ...baseSettings, autostart: true });
    const { getByRole } = render(<GeneralTab />);
    expect(minimizedCheckbox(getByRole)).not.toBeDisabled();
  });

  it("reverts the optimistic update when syncAutostart rejects", async () => {
    (tauri.syncAutostart as Mock).mockRejectedValueOnce(new Error("registry blocked"));
    const { getByRole } = render(<GeneralTab />);
    fireEvent.click(autostartCheckbox(getByRole));
    // optimistic flip happened synchronously…
    expect($settings.get()?.autostart).toBe(true);
    // …then the rejected promise reverts it.
    await waitFor(() => expect($settings.get()?.autostart).toBe(false));
  });
});
