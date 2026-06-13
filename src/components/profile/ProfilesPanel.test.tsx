import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfilesPanel } from "./ProfilesPanel";
import { $profileList } from "../../stores/profileManager";
import { $settings } from "../../stores/settings";
import { $announcer } from "../../stores/announcer";
import type { ProfileMeta } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  listProfiles: vi.fn(async () => [
    { name: "Default", streamCount: 2, isActive: true },
    { name: "Jazz", streamCount: 5, isActive: false },
  ] as ProfileMeta[]),
  switchProfile: vi.fn(async () => ({})),
  deleteProfile: vi.fn(async () => {}),
  createProfile: vi.fn(async (name: string) => ({ name, streamCount: 0, isActive: false })),
  getAllStatuses: vi.fn(async () => []),
  exportProfile: vi.fn(async () => {}),
  renameProfile: vi.fn(async (_old: string, name: string) => ({ name, streamCount: 0, isActive: false })),
  duplicateProfile: vi.fn(async (_src: string, name: string) => ({ name, streamCount: 0, isActive: false })),
  getActiveScheduled: vi.fn(async () => []),
}));

vi.mock("../../i18n/paraglide/runtime", () => ({ getLocale: () => "uk" }));

vi.mock("../../i18n/paraglide/messages", () => ({
  profile_name: () => "Profile",
  zone_profiles_toolbar: () => "Profile actions toolbar",
  command_palette_label: () => "Command palette",
  commands_label: () => "Commands",
  profile_active_badge: () => "active",
  profile_stream_count_one: ({ count }: { count: number }) => `${count} потік`,
  profile_stream_count_few: ({ count }: { count: number }) => `${count} потоки`,
  profile_stream_count_many: ({ count }: { count: number }) => `${count} потоків`,
  profile_stream_count_other: ({ count }: { count: number }) => `${count} потоки`,
  profile_switch: () => "Switch",
  profile_rename: () => "Rename",
  profile_delete: () => "Delete",
  profile_duplicate: () => "Duplicate",
  profile_export: () => "Export",
  profile_import: () => "Import",
  profile_create: () => "New profile",
  profile_new_name_label: () => "New name",
  profile_conflict_error: () => "Conflict",
  profile_delete_confirm: ({ name }: { name: string }) => `Delete ${name}?`,
  profile_switch_confirm: ({ name }: { name: string }) => `Switch to ${name}?`,
  profile_exported_announcement: ({ name }: { name: string }) => `Exported ${name}`,
  cancel: () => "Cancel",
  ok: () => "OK",
  zone_profiles_list: () => "Profiles list",
  item_role_profile: () => "profile",
  profile_already_active: () => "Profile is already active",
  profile_actions: ({ name }: { name: string }) => `Actions for ${name}`,
  profile_context_menu: () => "Profile context menu",
  profile_row_actions: ({ name }: { name: string }) => `Actions for profile ${name}`,
  profile_switch_named: ({ name }: { name: string }) => `Switch to ${name}`,
  profile_duplicate_named: ({ name }: { name: string }) => `Duplicate ${name}`,
  profile_rename_named: ({ name }: { name: string }) => `Rename ${name}`,
  profile_delete_named: ({ name }: { name: string }) => `Delete ${name}`,
  profile_export_named: ({ name }: { name: string }) => `Export ${name}`,
  profile_switch_scheduled_one: ({ name, end }: { name: string; end: string }) =>
    `Триває плановий запис «${name}» до ${end}. Переключити профіль і зупинити його?`,
  profile_switch_scheduled_item: ({ name, end }: { name: string; end: string }) => `«${name}» до ${end}`,
  profile_switch_scheduled_many: ({ list }: { list: string }) => `Тривають планові записи: ${list}. Переключити?`,
  schedule_result_none: () => "—",
  // scheduleFormat.ts читає ці ключі на рівні модуля (DAY_LABELS).
  day_short_0: () => "Пн", day_short_1: () => "Вт", day_short_2: () => "Ср",
  day_short_3: () => "Чт", day_short_4: () => "Пт", day_short_5: () => "Сб",
  day_short_6: () => "Нд",
}));

function renderPanel() {
  return render(<ProfilesPanel onZonesChange={() => {}} exitZone={() => {}} />);
}

describe("ProfilesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    $profileList.set([
      { name: "Default", streamCount: 2, isActive: true },
      { name: "Jazz", streamCount: 5, isActive: false },
    ]);
    $settings.set({ activeProfile: "Default" } as Parameters<typeof $settings.set>[0]);
    $announcer.set({ message: "", priority: "polite" });
  });

  it("registers two zones via onZonesChange (no actions sidebar)", () => {
    const onZonesChange = vi.fn();
    render(<ProfilesPanel onZonesChange={onZonesChange} exitZone={() => {}} />);
    const zones = onZonesChange.mock.calls.at(-1)![0] as { id: string }[];
    expect(zones.map((z) => z.id)).toEqual(["profiles-toolbar", "profiles-list"]);
  });

  it("renders the screen region and both profiles", async () => {
    renderPanel();
    await screen.findByText("Default");
    expect(screen.getByText("Jazz")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Profile" })).toBeInTheDocument();
  });

  it("has New and Import in the toolbar, not in the actions panel", async () => {
    renderPanel();
    await screen.findByText("Jazz");
    const toolbar = document.querySelector('[data-zone-id="profiles-toolbar"]')!;
    expect(toolbar.querySelector("button")).toBeTruthy();
    expect(within(toolbar).getByRole("button", { name: /New profile/ })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: /Import/ })).toBeInTheDocument();
  });

  it("switches to a profile via its inline Switch button", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("button", { name: "Switch to Jazz" }));
    await waitFor(() => expect(tauri.switchProfile).toHaveBeenCalledWith("Jazz"));
  });

  it("переключення з активним плановим записом — confirm з назвою і часом кінця", async () => {
    const user = userEvent.setup();
    vi.mocked(tauri.getActiveScheduled).mockResolvedValueOnce([
      { recordingId: "r1", name: "Evening Jazz", streamId: "st1", windowEnd: "2026-06-12T22:05" },
    ]);
    renderPanel();
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("button", { name: "Switch to Jazz" }));
    expect(
      await screen.findByText(
        "Триває плановий запис «Evening Jazz» до 22:05. Переключити профіль і зупинити його?",
      ),
    ).toBeTruthy();
    expect(tauri.switchProfile).not.toHaveBeenCalled();
  });

  it("announces 'already active' for Enter on the active row (no switch)", async () => {
    renderPanel();
    await screen.findByText("Default");
    const row = document.querySelector('li[data-item-id="Default"]') as HTMLElement;
    row.focus();
    fireEvent.keyDown(row, { key: "Enter" });
    await waitFor(() => expect($announcer.get().message).toBe("Profile is already active"));
    expect(tauri.switchProfile).not.toHaveBeenCalled();
  });

  it("deletes a profile via its inline Delete button + confirm", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("button", { name: "Delete Jazz" }));
    await screen.findByText("Delete Jazz?");
    await user.click(screen.getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => expect(tauri.deleteProfile).toHaveBeenCalledWith("Jazz"));
  });

  it("announces after a successful export via the inline Export button", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("button", { name: "Export Jazz" }));
    await waitFor(() => expect($announcer.get().message).toBe("Exported Jazz"));
  });

  it("opens the name dialog from the toolbar New button", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("button", { name: /New profile/ }));
    expect(await screen.findByRole("button", { name: /^OK$/ })).toBeInTheDocument();
  });
});
