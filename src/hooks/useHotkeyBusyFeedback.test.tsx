import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import * as m from "../i18n/paraglide/messages";
import { $announcer } from "../stores/announcer";
import { $toasts } from "../stores/toasts";
import { $settings } from "../stores/settings";
import type { GlobalSettings } from "../lib/tauri";

type Handler = (e: { payload: unknown }) => void;
const handlers = new Map<string, Handler>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: Handler) => {
    handlers.set(event, cb);
    return () => handlers.delete(event);
  }),
}));

import { useHotkeyBusyFeedback } from "./useHotkeyBusyFeedback";

function Host() {
  useHotkeyBusyFeedback();
  return null;
}

const settings: GlobalSettings = {
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
  volumeStepPercent: 5,
  smtcEnabled: true,
  hotkeys: {
    toggleRecording: "Ctrl+Shift+R",
    togglePlayback: "Ctrl+Shift+P",
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
  handlers.clear();
  $announcer.set(null);
  $toasts.set([]);
  $settings.set(settings);
});

async function emitBusy(combos: string[]) {
  render(<Host />);
  await vi.waitFor(() => expect(handlers.has("hotkeys-busy")).toBe(true));
  handlers.get("hotkeys-busy")!({ payload: combos });
}

describe("useHotkeyBusyFeedback — репліка при старті про зайняту комбінацію", () => {
  it("називає комбінацію і дію: оголошення polite + тост warning", async () => {
    await emitBusy(["Ctrl+Shift+R"]);
    const msg = m.hotkey_busy_at_startup({
      combo: "Ctrl+Shift+R",
      action: m.settings_hotkey_toggle_recording(),
    });
    expect($announcer.get()).toEqual({ message: msg, priority: "polite" });
    expect($toasts.get().some((t) => t.message === msg && t.type === "warning")).toBe(true);
  });

  it("по одній репліці на кожну зайняту комбінацію", async () => {
    const seen: string[] = [];
    const unsub = $announcer.listen((a) => { if (a) seen.push(a.message); });
    await emitBusy(["Ctrl+Shift+R", "Ctrl+Shift+P"]);
    unsub();

    expect(seen).toEqual([
      m.hotkey_busy_at_startup({ combo: "Ctrl+Shift+R", action: m.settings_hotkey_toggle_recording() }),
      m.hotkey_busy_at_startup({ combo: "Ctrl+Shift+P", action: m.settings_hotkey_toggle_playback() }),
    ]);
    expect($toasts.get()).toHaveLength(2);
  });

  it("мовчить про комбінацію, якій не відповідає жодна дія", async () => {
    // Налаштування встигли змінитись між реєстрацією і реплікою: дії для
    // комбінації вже немає — казати «„…“ не спрацює» нема про що.
    await emitBusy(["Ctrl+Alt+Z"]);
    expect($announcer.get()).toBeNull();
    expect($toasts.get()).toHaveLength(0);
  });
});
