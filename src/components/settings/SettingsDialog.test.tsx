import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as m from "../../i18n/paraglide/messages";
import { SettingsDialog } from "./SettingsDialog";
import { $settings, $settingsDialogOpen, $recordingSettings } from "../../stores/settings";
import type { GlobalSettings, RecordingSettings } from "../../lib/tauri";

// Every tab panel this dialog can mount reaches for tauri, so the module mock
// has to cover all four tabs, not just the dialog itself.
vi.mock("../../lib/tauri", () => ({
  getRecordingSettings: vi.fn().mockResolvedValue({
    outputDir: "recordings",
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
  } as RecordingSettings),
  saveRecordingSettings: vi.fn().mockResolvedValue(undefined),
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
  resumeFileFrom: "position",
  smtcEnabled: true,
  hotkeys: {
    toggleRecording: "", togglePlayback: "", volumeUp: "", volumeDown: "",
    toggleWindow: "", stopAll: "", prevTrack: "", nextTrack: "",
  },
  logMaxSizeMb: 10,
  logLevel: "info",
} as GlobalSettings;

/** Opens the dialog and waits out the getRecordingSettings effect. */
async function openDialog() {
  $settings.set(baseSettings);
  act(() => $settingsDialogOpen.set(true));
  render(<SettingsDialog />);
  await screen.findByRole("tablist");
  // Дочекатися ефекту getRecordingSettings, інакше стор наповниться поза act()
  // і RecordingTab насмітить попередженнями при переході на свою вкладку.
  await waitFor(() => expect($recordingSettings.get()).not.toBeNull());
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  $settingsDialogOpen.set(false);
  $settings.set(null);
  $recordingSettings.set(null);
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
    expect(selected()).toBe(m.settings_tab_recording());

    await userEvent.keyboard("{ArrowUp}");
    expect(selected()).toBe(m.settings_tab_general());

    // ←/→ у vertical-режимі RAC теж рухають вибір (TabsKeyboardDelegate не має
    // orientation-guard у getKeyLeftOf/getKeyRightOf). Це страховка для NVDA,
    // який не озвучує aria-orientation — див. p2-settings-sidebar-tabs.
    await userEvent.keyboard("{ArrowRight}");
    expect(selected()).toBe(m.settings_tab_recording());

    await userEvent.keyboard("{ArrowLeft}");
    expect(selected()).toBe(m.settings_tab_general());
  });

  it("показує панель обраної вкладки", async () => {
    await openDialog();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: m.settings_tab_recording(), selected: true })).toBeTruthy();
    expect(screen.getByRole("tabpanel")).toBeTruthy();
  });
});
