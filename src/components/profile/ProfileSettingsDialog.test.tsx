import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as m from "../../i18n/paraglide/messages";
import { ProfileSettingsDialog } from "./ProfileSettingsDialog";
import { $profileSettings } from "../../stores/settings";
import type { ProfileMeta, ProfileSettings } from "../../lib/tauri";

const profileSettings: ProfileSettings = {
  recording: {
    outputDir: "recordings",
    diskSpaceThresholdGb: 1,
    fileNameTemplate: "%a - %t",
    incompleteFileNameTemplate: "%a - %t_incomplete",
    streamFileNameTemplate: "stream",
    saveStreamFile: false,
    skipFirstIncompleteTrack: true,
    skipShortTracksMs: 30000,
    autoCorrectCase: true,
    schedulePadBeforeMin: 0,
    schedulePadAfterMin: 0,
    reconnect: {
      maxRetries: 10, retryIntervalSecs: 5, backoffMultiplier: 1.5, maxIntervalSecs: 60,
    },
  },
  ui: { streamSort: "name", trayNotificationsTrackChange: true, trayNotificationsScheduled: true },
  autoplayOnStartup: false,
  autoAdvance: true,
  resumeFileFrom: "position",
};

vi.mock("../../lib/tauri", () => ({
  getProfileSettings: vi.fn(async () => structuredClone(profileSettings)),
  updateProfileSettings: vi.fn(async () => {}),
  openDirectoryPicker: vi.fn(async () => null),
}));

const announce = vi.fn();
vi.mock("../../hooks/useAnnounce", () => ({ useAnnounce: () => announce }));

import * as tauri from "../../lib/tauri";

const profiles: ProfileMeta[] = [
  { name: "Default", streamCount: 2, isActive: true },
  { name: "Jazz", streamCount: 5, isActive: false },
];

function renderDialog(over: Partial<React.ComponentProps<typeof ProfileSettingsDialog>> = {}) {
  const props = {
    name: "Jazz",
    profiles,
    activeProfile: "Default",
    onClose: vi.fn(),
    onForceClose: vi.fn(),
    ...over,
  };
  return { props, ...render(<ProfileSettingsDialog {...props} />) };
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { $profileSettings.set(null); });

describe("ProfileSettingsDialog — структура", () => {
  it("несе ім'я профілю в заголовку", async () => {
    renderDialog();
    expect(
      await screen.findByRole("dialog", { name: m.profile_settings_title({ name: "Jazz" }) }),
    ).toBeTruthy();
  });

  it("має чотири вкладки в порядку Запис / Відтворення / Інтерфейс / Постобробка", async () => {
    renderDialog();
    await screen.findByRole("tablist");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      m.settings_tab_recording(),
      m.settings_tab_playback(),
      m.profile_settings_tab_interface(),
      m.profile_settings_tab_postprocess(),
    ]);
  });

  it("«Постобробка» оголошується недоступною, але лишається в навігації стрілками", async () => {
    renderDialog();
    await screen.findByRole("tablist");
    const postprocess = screen.getByRole("tab", { name: m.profile_settings_tab_postprocess() });
    // aria-disabled, НЕ isDisabled: react-aria прибрав би вкладку з навігації
    // стрілками, і користувач NVDA ніколи б її не зустрів.
    expect(postprocess.getAttribute("aria-disabled")).toBe("true");
    // Перша вкладка має autoFocus — три стрілки вниз доводять до четвертої.
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("tab", { selected: true }).textContent)
      .toBe(m.profile_settings_tab_postprocess());
  });

  it("панель «Постобробка» пояснює, чому вкладка недоступна", async () => {
    renderDialog();
    await screen.findByRole("tablist");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("tabpanel").textContent)
      .toBe(m.profile_settings_postprocess_unavailable());
  });

  it("не має кнопок підтвердження/скасування — збереження автоматичне", async () => {
    renderDialog();
    await screen.findByRole("tablist");
    expect(screen.queryByRole("button", { name: m.ok() })).toBeNull();
    expect(screen.queryByRole("button", { name: m.cancel() })).toBeNull();
  });
});

describe("ProfileSettingsDialog — редагування", () => {
  it("сіється зрізом названого профілю, навіть якщо той неактивний", async () => {
    renderDialog({ name: "Jazz" });
    await screen.findByRole("tablist");
    expect(tauri.getProfileSettings).toHaveBeenCalledWith("Jazz");
  });

  it("шле лише змінену секцію, а не копію профілю", async () => {
    renderDialog();
    await screen.findByRole("tablist");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await userEvent.click(screen.getByRole("checkbox", { name: m.settings_tray_notifications_track_change() }));

    await waitFor(() => expect(tauri.updateProfileSettings).toHaveBeenCalled());
    const [name, patch] = vi.mocked(tauri.updateProfileSettings).mock.calls[0];
    expect(name).toBe("Jazz");
    expect(patch).toEqual({
      ui: { streamSort: "name", trayNotificationsTrackChange: false, trayNotificationsScheduled: true },
    });
    expect(patch).not.toHaveProperty("recording");
  });

  // Вихідний баг: один прапорець глушив і балаканину про треки, і розклад.
  // Тепер це дві незалежні категорії — і на боці UI теж.
  it("прапорець про плановий запис не чіпає прапорець про зміну треку", async () => {
    renderDialog();
    await screen.findByRole("tablist");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await userEvent.click(
      screen.getByRole("checkbox", { name: m.settings_tray_notifications_scheduled() }),
    );

    await waitFor(() => expect(tauri.updateProfileSettings).toHaveBeenCalled());
    const [, patch] = vi.mocked(tauri.updateProfileSettings).mock.calls[0];
    expect(patch).toEqual({
      ui: { streamSort: "name", trayNotificationsTrackChange: true, trayNotificationsScheduled: false },
    });
  });

  // ADR 2026-08-31 §5: «збережено» не має видимого носія — діалог показує сам
  // змінений контрол, а не запис на диск. Факт прибрано з оголошення; тест
  // стереже, щоб він не повернувся.
  it("зберігає мовчки — жодного оголошення про запис", async () => {
    renderDialog();
    await screen.findByRole("tablist");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    // Чистимо після переходу по вкладках: перевіряємо тишу саме навколо
    // збереження, а не забороняємо діалогу говорити взагалі.
    announce.mockClear();
    await userEvent.click(screen.getByRole("checkbox", { name: m.settings_tray_notifications_track_change() }));
    await waitFor(() => expect(tauri.updateProfileSettings).toHaveBeenCalled());
    expect(announce).not.toHaveBeenCalled();
  });

  it("числове поле зберігає нарівні з чекбоксом — і так само мовчки", async () => {
    renderDialog();
    await screen.findByRole("tablist");
    const field = screen.getByLabelText(m.settings_disk_threshold());
    announce.mockClear();
    await userEvent.clear(field);
    await userEvent.type(field, "7{Enter}");

    await waitFor(() => expect(tauri.updateProfileSettings).toHaveBeenCalled());
    const [, patch] = vi.mocked(tauri.updateProfileSettings).mock.calls[0];
    expect(patch.recording?.diskSpaceThresholdGb).toBe(7);
    expect(announce).not.toHaveBeenCalled();
  });

  it("дві швидкі зміни підряд — один запис", async () => {
    renderDialog();
    await screen.findByRole("tablist");
    const threshold = screen.getByLabelText(m.settings_disk_threshold());
    const padBefore = screen.getByLabelText(m.settings_schedule_pad_before());

    // Фейкові таймери — тест саме про вікно дебаунсу: на реальних він залежав
    // би від того, чи встиг ввід пройти два поля за 300 мс. Вмикаємо їх після
    // завантаження діалогу, і далі лише fireEvent + vi.*: async-хелпери RTL
    // (findBy*, userEvent) під фейковими таймерами чекають на setTimeout, який
    // ніколи не спрацює, і тест зависає.
    vi.useFakeTimers();
    try {
      fireEvent.change(threshold, { target: { value: "7" } });
      fireEvent.blur(threshold);
      fireEvent.change(padBefore, { target: { value: "3" } });
      fireEvent.blur(padBefore);
      expect(tauri.updateProfileSettings).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(300);

      // Дебаунс злив обидві зміни в один запис.
      expect(tauri.updateProfileSettings).toHaveBeenCalledTimes(1);
      const [, patch] = vi.mocked(tauri.updateProfileSettings).mock.calls[0];
      expect(patch.recording?.diskSpaceThresholdGb).toBe(7);
      expect(patch.recording?.schedulePadBeforeMin).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("оновлює стор активного профілю після збереження, а неактивного — ні", async () => {
    const { unmount } = renderDialog({ name: "Default", activeProfile: "Default" });
    await screen.findByRole("tablist");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await userEvent.click(screen.getByRole("checkbox", { name: m.settings_tray_notifications_track_change() }));
    await waitFor(() => expect($profileSettings.get()?.ui.trayNotificationsTrackChange).toBe(false));

    unmount();
    $profileSettings.set(null);

    renderDialog({ name: "Jazz", activeProfile: "Default" });
    await screen.findByRole("tablist");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await userEvent.click(screen.getByRole("checkbox", { name: m.settings_tray_notifications_track_change() }));
    await waitFor(() => expect(tauri.updateProfileSettings).toHaveBeenCalledTimes(2));
    expect($profileSettings.get()).toBeNull();
  });
});

describe("ProfileSettingsDialog — примусове закриття", () => {
  it("ціль зникла зі списку → закриття з озвученою причиною", async () => {
    const onForceClose = vi.fn();
    const { rerender, props } = renderDialog({ onForceClose });
    await screen.findByRole("tablist");
    expect(onForceClose).not.toHaveBeenCalled();

    rerender(
      <ProfileSettingsDialog
        {...props}
        profiles={[{ name: "Default", streamCount: 2, isActive: true }]}
      />,
    );

    expect(announce).toHaveBeenCalledWith(
      m.profile_settings_closed_gone({ name: "Jazz" }),
      "assertive",
    );
    expect(onForceClose).toHaveBeenCalled();
  });

  it("перейменування читається так само: нове ім'я є, старого немає", async () => {
    const onForceClose = vi.fn();
    const { rerender, props } = renderDialog({ onForceClose });
    await screen.findByRole("tablist");

    rerender(
      <ProfileSettingsDialog
        {...props}
        profiles={[
          { name: "Default", streamCount: 2, isActive: true },
          { name: "Jazz 2", streamCount: 5, isActive: false },
        ]}
      />,
    );

    expect(onForceClose).toHaveBeenCalled();
  });

  it("порожній список — це ще не завантажений список, а не зникла ціль", async () => {
    const onForceClose = vi.fn();
    renderDialog({ onForceClose, profiles: [] });
    await screen.findByRole("tablist");
    expect(onForceClose).not.toHaveBeenCalled();
  });
});
