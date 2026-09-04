import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import * as m from "../../i18n/paraglide/messages";
import { GeneralTab } from "./GeneralTab";
import { $settings } from "../../stores/settings";
import type { GlobalSettings } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { $announcer } from "../../stores/announcer";
import { $toasts } from "../../stores/toasts";

vi.mock("../../lib/tauri", () => ({
  saveSettings: vi.fn().mockResolvedValue(undefined),
  syncAutostart: vi.fn().mockResolvedValue(undefined),
  getAppInfo: vi
    .fn()
    .mockResolvedValue({ version: "0.1.0", homepage: "https://github.com/ruslan-rv-ua/tapir" }),
  openProjectPage: vi.fn().mockResolvedValue(undefined),
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
  volumeStepPercent: 5,
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
  $toasts.set([]);
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

describe("GeneralTab — About", () => {
  const HOMEPAGE = "https://github.com/ruslan-rv-ua/tapir";

  function openButton(getByRole: ReturnType<typeof render>["getByRole"]) {
    return getByRole("button", { name: m.settings_about_open_project() });
  }

  it("shows the version and the project address it got from the backend", async () => {
    const { findByText, getByText } = render(<GeneralTab />);
    expect(await findByText(m.settings_about_version({ version: "0.1.0" }))).toBeInTheDocument();
    expect(getByText(HOMEPAGE)).toBeInTheDocument();
  });

  it("the version and address are plain text, not focus stops", async () => {
    const { findByText, getByText } = render(<GeneralTab />);
    const version = await findByText(m.settings_about_version({ version: "0.1.0" }));
    expect(version).not.toHaveAttribute("tabindex");
    expect(getByText(HOMEPAGE)).not.toHaveAttribute("tabindex");
    expect(getByText(HOMEPAGE).closest("a")).toBeNull();
  });

  it("describes the Open project page button with the version and address", async () => {
    const { findByText, getByRole } = render(<GeneralTab />);
    await findByText(m.settings_about_version({ version: "0.1.0" }));
    expect(openButton(getByRole)).toHaveAccessibleDescription(
      `${m.settings_about_version({ version: "0.1.0" })} ${HOMEPAGE}`,
    );
  });

  it("pressing Open project page hands the address to the backend, not to the webview", async () => {
    const { findByText, getByRole } = render(<GeneralTab />);
    await findByText(m.settings_about_version({ version: "0.1.0" }));
    fireEvent.click(openButton(getByRole));
    await waitFor(() => expect(tauri.openProjectPage).toHaveBeenCalledTimes(1));
    expect($toasts.get()).toHaveLength(0);
  });

  it("a failed open reports the failure as an error toast", async () => {
    (tauri.openProjectPage as Mock).mockRejectedValueOnce("generic");
    const { findByText, getByRole } = render(<GeneralTab />);
    await findByText(m.settings_about_version({ version: "0.1.0" }));
    fireEvent.click(openButton(getByRole));
    await waitFor(() => expect($toasts.get()[0]?.message).toBe(m.about_open_failed()));
    expect($toasts.get()[0]?.type).toBe("error");
  });
});
