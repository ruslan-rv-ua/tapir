import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import * as m from "../../i18n/paraglide/messages";
import { GeneralTab } from "./GeneralTab";
import { $settings } from "../../stores/settings";
import type { GlobalSettings } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { $announcer } from "../../stores/announcer";

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
  showTrackInTitle: true,
  doubleClickAction: "play",
  autostart: false,
  autostartMinimized: true,
  prevRestartThresholdMs: 0,
  smtcEnabled: true,
  hotkeys: {
    toggleRecording: "", togglePlayback: "", volumeUp: "", volumeDown: "",
    toggleWindow: "", stopAll: "", prevTrack: "", nextTrack: "",
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

// ADR 2026-08-31 §5: «записано на диск» не має видимого носія, тож факт
// прибрано з оголошення, а не забезпечено носієм. Результат дії — сам
// прапорець, і він на екрані. Тест стереже й запис, і тишу.
describe("GeneralTab — автозбереження мовчазне", () => {
  it("зберігає зміну налаштування, нічого не оголошуючи", async () => {
    const { getByRole } = render(<GeneralTab />);
    fireEvent.click(getByRole("checkbox", { name: new RegExp(m.settings_minimize_to_tray()) }));

    await waitFor(() => expect(tauri.saveSettings).toHaveBeenCalled());
    expect($announcer.get()).toBeNull();
  });
});

// Сповіщення в треї — свідомий виняток із ОС-межі: вони профільні
// (ADR 2026-08-08), тож у налаштуваннях програми їх бути не повинно.
describe("GeneralTab — межа глобальне/профільне", () => {
  it("does not show the tray-notifications toggle", () => {
    const { queryByRole } = render(<GeneralTab />);
    expect(
      queryByRole("checkbox", { name: new RegExp(m.settings_tray_notifications_track_change()) }),
    ).toBeNull();
  });

  it("keeps minimize-to-tray, which stays global", () => {
    const { getByRole } = render(<GeneralTab />);
    expect(
      getByRole("checkbox", { name: new RegExp(m.settings_minimize_to_tray()) }),
    ).toBeTruthy();
  });
});
