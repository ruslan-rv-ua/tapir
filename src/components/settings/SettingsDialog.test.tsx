import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as m from "../../i18n/paraglide/messages";
import { SettingsDialog } from "./SettingsDialog";
import { $settings, $settingsDialogOpen, $profileSettingsTarget } from "../../stores/settings";
import type { GlobalSettings } from "../../lib/tauri";

// Every tab panel this dialog can mount reaches for tauri, so the module mock
// has to cover all three tabs, not just the dialog itself.
vi.mock("../../lib/tauri", () => ({
  saveSettings: vi.fn().mockResolvedValue(undefined),
  syncAutostart: vi.fn().mockResolvedValue(undefined),
  openDirectoryPicker: vi.fn().mockResolvedValue(null),
  listOutputDevices: vi.fn().mockResolvedValue([]),
  setOutputDevice: vi.fn().mockResolvedValue(undefined),
  registerHotkeys: vi.fn().mockResolvedValue([]),
  defaultHotkeys: vi.fn().mockResolvedValue({}),
}));

const baseSettings: GlobalSettings = {
  language: "en-US",
  theme: "auto",
  activeProfile: "Default",
  outputDevice: null,
  minimizeToTray: false,
  showTrackInTitle: true,
  doubleClickAction: "play",
  bandwidthLimitKbps: 0,
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
} as GlobalSettings;

async function openDialog() {
  $settings.set(baseSettings);
  act(() => $settingsDialogOpen.set(true));
  render(<SettingsDialog />);
  await screen.findByRole("tablist");
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  $settingsDialogOpen.set(false);
  $settings.set(null);
  $profileSettingsTarget.set(null);
});

describe("SettingsDialog — вертикальна бічна панель вкладок", () => {
  it("позначає таблист вертикальним і називає його окремо від заголовка діалогу", async () => {
    await openDialog();
    const tablist = screen.getByRole("tablist");
    expect(tablist.getAttribute("aria-orientation")).toBe("vertical");
    // Власна мітка, а не settings_title: інакше NVDA читає «Налаштування»
    // двічі поспіль — діалог і таблист.
    expect(tablist.getAttribute("aria-label")).toBe(m.settings_sections_label());
    expect(m.settings_sections_label()).not.toBe(m.settings_title());
  });

  it("перемикає вкладки всіма чотирма стрілками", async () => {
    await openDialog();
    // Перша вкладка має autoFocus, тож клавіші йдуть у таблист одразу.
    const selected = () => screen.getByRole("tab", { selected: true }).textContent;
    expect(selected()).toBe(m.settings_tab_general());

    await userEvent.keyboard("{ArrowDown}");
    expect(selected()).toBe(m.settings_tab_audio());

    await userEvent.keyboard("{ArrowUp}");
    expect(selected()).toBe(m.settings_tab_general());

    // ←/→ у vertical-режимі RAC теж рухають вибір (TabsKeyboardDelegate не має
    // orientation-guard у getKeyLeftOf/getKeyRightOf). Це страховка для NVDA,
    // який не озвучує aria-orientation — див. p2-settings-sidebar-tabs.
    await userEvent.keyboard("{ArrowRight}");
    expect(selected()).toBe(m.settings_tab_audio());

    await userEvent.keyboard("{ArrowLeft}");
    expect(selected()).toBe(m.settings_tab_general());
  });

  it("показує панель обраної вкладки", async () => {
    await openDialog();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: m.settings_tab_audio(), selected: true })).toBeTruthy();
    expect(screen.getByRole("tabpanel")).toBeTruthy();
  });
});

describe("SettingsDialog — межа глобальне/профільне", () => {
  it("має рівно три вкладки: Загальні, Аудіо, Хоткеї", async () => {
    await openDialog();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      m.settings_tab_general(),
      m.settings_tab_audio(),
      m.settings_tab_hotkeys(),
    ]);
  });

  it("не показує вкладку «Запис» — вона переїхала в діалог профілю", async () => {
    await openDialog();
    expect(screen.queryByRole("tab", { name: m.settings_tab_recording() })).toBeNull();
  });

  it("кнопка налаштувань профілю закриває цей діалог і відкриває профільний", async () => {
    await openDialog();
    await userEvent.click(
      screen.getByRole("button", {
        name: m.profile_settings_open_action({ name: "Default" }),
      }),
    );
    expect($settingsDialogOpen.get()).toBe(false);
    expect($profileSettingsTarget.get()).toBe("Default");
  });
});
