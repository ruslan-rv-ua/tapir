import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
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
  showTrackInTitle: true,
  doubleClickAction: "play",
  autostart: false,
  autostartMinimized: true,
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

// Провал реєстрації показувався блоком role="alert". Той мовчить, коли та сама
// комбінація провалюється вдруге: DOM не змінюється, отже вставки, про яку
// можна повідомити, немає. Тепер про це каже центральний канал.
describe("HotkeysTab — провал реєстрації комбінації", () => {
  function announcements() {
    const seen: { message: string; priority: string }[] = [];
    const unsub = $announcer.listen((a) => { if (a) seen.push({ ...a }); });
    return { seen, unsub };
  }

  function record(getByRole: ReturnType<typeof render>["getByRole"]) {
    const button = recordButton(getByRole);
    fireEvent.click(button); // arm the recorder
    fireEvent.keyDown(button, { code: "KeyJ", key: "j", ctrlKey: true, shiftKey: true });
  }

  it("оголошує наполегливо, що щойно призначена комбінація не зареєструвалась", async () => {
    (tauri.registerHotkeys as Mock).mockResolvedValue(["Ctrl+Shift+J"]);
    const { getByRole } = render(<HotkeysTab />);
    record(getByRole);

    await waitFor(() =>
      expect($announcer.get()).toEqual({
        message: m.settings_hotkey_registration_failed({ combo: "Ctrl+Shift+J" }),
        priority: "assertive",
      }),
    );
  });

  it("той самий провал удруге звучить удруге", async () => {
    (tauri.registerHotkeys as Mock).mockResolvedValue(["Ctrl+Shift+J"]);
    const { getByRole } = render(<HotkeysTab />);
    const { seen, unsub } = announcements();
    const failure = m.settings_hotkey_registration_failed({ combo: "Ctrl+Shift+J" });

    record(getByRole);
    await waitFor(() => expect(seen.filter((a) => a.message === failure)).toHaveLength(1));
    record(getByRole); // та сама комбінація тій самій дії
    await waitFor(() => expect(seen.filter((a) => a.message === failure)).toHaveLength(2));

    unsub();
  });

  it("мовчить про чужий давній провал, коли користувач змінює іншу комбінацію", async () => {
    (tauri.registerHotkeys as Mock).mockResolvedValue(["Ctrl+Shift+J"]);
    const { getByRole } = render(<HotkeysTab />);
    const { seen, unsub } = announcements();
    const failure = m.settings_hotkey_registration_failed({ combo: "Ctrl+Shift+J" });

    record(getByRole);
    await waitFor(() => expect(seen.filter((a) => a.message === failure)).toHaveLength(1));

    // Інша дія, вільна комбінація: вона зареєструвалась, а Ctrl+Shift+J як
    // провалювався, так і провалюється — але кричати про нього знову нема за що.
    const playback = getByRole("button", {
      name: (name: string) => name.startsWith(m.settings_hotkey_toggle_playback()),
    });
    fireEvent.click(playback);
    fireEvent.keyDown(playback, { code: "KeyU", key: "u", ctrlKey: true, altKey: true });

    await waitFor(() => expect(tauri.registerHotkeys).toHaveBeenCalledTimes(2));
    expect(seen.filter((a) => a.message === failure)).toHaveLength(1);
    expect(seen.at(-1)?.message).toBe(m.settings_hotkey_changed({ combo: "Ctrl+Alt+U" }));

    unsub();
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

describe("HotkeysTab — recorder hint", () => {
  it("shows the combination rule once above the rows, as plain text", () => {
    const { getByText } = render(<HotkeysTab />);
    const hint = getByText(m.settings_hotkeys_recorder_hint());
    // Reading-order text, not a control: no Tab stop, and no describedby that
    // would repeat the rule on each of the eight buttons.
    expect(hint.tagName).toBe("P");
    expect(hint).not.toHaveAttribute("tabindex");
  });
});
