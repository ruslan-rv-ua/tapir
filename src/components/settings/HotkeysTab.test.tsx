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
  registerHotkeys: vi.fn().mockResolvedValue({ busy: [], newlyBusy: [] }),
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
  volumeStepPercent: 5,
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

  const free = { busy: [], newlyBusy: [] };
  const busyJ = { busy: ["Ctrl+Shift+J"], newlyBusy: ["Ctrl+Shift+J"] };

  it("оголошує наполегливо, що щойно призначена комбінація не зареєструвалась", async () => {
    (tauri.registerHotkeys as Mock).mockResolvedValueOnce(free).mockResolvedValue(busyJ);
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
    // Монтування: вільно. Перша спроба: J нова. Друга: J зайнята, але вже не новина.
    (tauri.registerHotkeys as Mock)
      .mockResolvedValueOnce(free)
      .mockResolvedValueOnce(busyJ)
      .mockResolvedValue({ busy: ["Ctrl+Shift+J"], newlyBusy: [] });
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
    (tauri.registerHotkeys as Mock)
      .mockResolvedValueOnce(free)
      .mockResolvedValueOnce(busyJ)
      .mockResolvedValue({ busy: ["Ctrl+Shift+J"], newlyBusy: [] });
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

    // Три реєстрації: перевірка при монтуванні, потім дві зміни.
    await waitFor(() => expect(tauri.registerHotkeys).toHaveBeenCalledTimes(3));
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

// Зайнята комбінація (hotkey-registration-silent-at-startup): «яка комбінація
// призначена» — налаштування, «чи вона працює зараз» — стан, який знає лише Rust.
// Вкладка не тримає своєї копії: при кожному монтуванні перереєструє комбінації —
// це і є «перевір ще раз», яка знімає позначку, коли конфлікт зник.
describe("HotkeysTab — зайнята комбінація", () => {
  const assigned = {
    ...baseSettings,
    hotkeys: { ...baseSettings.hotkeys, toggleRecording: "Ctrl+Shift+R", togglePlayback: "Ctrl+Shift+P" },
  };

  it("при монтуванні перереєструє й позначає зайнятий рядок, не зберігаючи нічого", async () => {
    $settings.set(assigned);
    // R зайнята, але про неї вже казали (при старті) — вкладка мовчить.
    (tauri.registerHotkeys as Mock).mockResolvedValue({ busy: ["Ctrl+Shift+R"], newlyBusy: [] });
    const { getByRole, getAllByText } = render(<HotkeysTab />);

    await waitFor(() => expect(tauri.registerHotkeys).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getAllByText(m.settings_hotkey_busy())).toHaveLength(1));
    expect(recordButton(getByRole)).toHaveAccessibleName(
      expect.stringContaining(m.settings_hotkey_busy()),
    );
    expect(tauri.saveSettings).not.toHaveBeenCalled();
    // Позначка — носій стану, не подія: про вже відоме вкладка мовчить.
    expect($announcer.get()).toBeNull();
  });

  it("нововиявлену при монтуванні зайняту комбінацію оголошує ввічливо", async () => {
    // Перше виявлення не мовчить ніде: пам'ять «уже повідомлено» помічається
    // саме тому, що вкладка це озвучує (спека, «Після реалізації»).
    $settings.set(assigned);
    (tauri.registerHotkeys as Mock).mockResolvedValue({
      busy: ["Ctrl+Shift+R"],
      newlyBusy: ["Ctrl+Shift+R"],
    });
    const { getAllByText } = render(<HotkeysTab />);
    await waitFor(() => expect(getAllByText(m.settings_hotkey_busy())).toHaveLength(1));
    expect($announcer.get()).toEqual({
      message: m.settings_hotkey_registration_failed({ combo: "Ctrl+Shift+R" }),
      priority: "polite",
    });
  });

  it("зниклий конфлікт: перереєстрація при монтуванні повертає порожній перелік — позначки немає", async () => {
    $settings.set(assigned);
    (tauri.registerHotkeys as Mock).mockResolvedValue({ busy: [], newlyBusy: [] });
    const { queryByText } = render(<HotkeysTab />);
    await waitFor(() => expect(tauri.registerHotkeys).toHaveBeenCalledTimes(1));
    expect(queryByText(m.settings_hotkey_busy())).toBeNull();
  });

  it("провал щойно призначеної комбінації позначає її рядок, а блоку під рядками немає", async () => {
    (tauri.registerHotkeys as Mock)
      .mockResolvedValueOnce({ busy: [], newlyBusy: [] })
      .mockResolvedValue({ busy: ["Ctrl+Shift+J"], newlyBusy: ["Ctrl+Shift+J"] });
    const { getByRole, getAllByText, queryByText } = render(<HotkeysTab />);
    const button = recordButton(getByRole);
    fireEvent.click(button);
    fireEvent.keyDown(button, { code: "KeyJ", key: "j", ctrlKey: true, shiftKey: true });

    await waitFor(() => expect(getAllByText(m.settings_hotkey_busy())).toHaveLength(1));
    expect(
      queryByText(m.settings_hotkey_registration_failed({ combo: "Ctrl+Shift+J" })),
    ).toBeNull();
  });
});
