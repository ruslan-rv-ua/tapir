import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfilesPanel } from "./ProfilesPanel";
import { $profileList } from "../../stores/profileManager";
import { $settings } from "../../stores/settings";
import { $announcer } from "../../stores/announcer";
import type { ProfileMeta } from "../../lib/tauri";

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
}));

vi.mock("../../i18n/paraglide/runtime", () => ({ getLocale: () => "uk" }));

vi.mock("../../i18n/paraglide/messages", () => ({
  profile_name: () => "Profile",
  zone_profiles_toolbar: () => "Profile actions toolbar",
  command_palette_label: () => "Command palette",
  commands_label: () => "Commands",
  profile_list_label: () => "Profiles",
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
  profile_actions_label: () => "Profile actions",
  profile_group_profile: () => "Profile",
  profile_group_file: () => "File",
  profile_new_name_label: () => "New name",
  profile_conflict_error: () => "Conflict",
  profile_delete_confirm: ({ name }: { name: string }) => `Delete ${name}?`,
  profile_switch_confirm: ({ name }: { name: string }) => `Switch to ${name}?`,
  profile_exported_announcement: ({ name }: { name: string }) => `Exported ${name}`,
  cancel: () => "Cancel",
  ok: () => "OK",
}));

function renderPanel() {
  return render(<ProfilesPanel onZonesChange={() => {}} exitZone={() => {}} />);
}

describe("ProfilesPanel", () => {
  beforeEach(() => {
    $profileList.set([
      { name: "Default", streamCount: 2, isActive: true },
      { name: "Jazz", streamCount: 5, isActive: false },
    ]);
    $settings.set({ activeProfile: "Default" } as Parameters<typeof $settings.set>[0]);
    $announcer.set({ message: "", priority: "polite" });
  });

  it("registers three zones via onZonesChange", () => {
    const onZonesChange = vi.fn();
    render(<ProfilesPanel onZonesChange={onZonesChange} exitZone={() => {}} />);
    const zones = onZonesChange.mock.calls.at(-1)![0] as { id: string }[];
    expect(zones.map((z) => z.id)).toEqual([
      "profiles-toolbar", "profiles-list", "profiles-actions",
    ]);
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

  it("returns focus to the selected profile after Switch", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("option", { name: /Jazz/ }));
    await user.click(screen.getByRole("button", { name: /^Switch$/ }));
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("option", { name: /Jazz/ }));
    });
  });

  it("returns focus to Default after Delete", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("option", { name: /Jazz/ }));
    await user.click(screen.getByRole("button", { name: /^Delete$/ }));
    await screen.findByText("Delete Jazz?");
    await user.click(screen.getAllByRole("button", { name: /^Delete$/ })[0]);
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("option", { name: /Default/ }));
    });
  });

  it("opens the name dialog from the toolbar New button", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("button", { name: /New profile/ }));
    expect(await screen.findByRole("button", { name: /^OK$/ })).toBeInTheDocument();
  });

  it("announces after a successful export", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("option", { name: /Jazz/ }));
    await user.click(screen.getByRole("button", { name: /^Export$/ }));
    await waitFor(() => expect($announcer.get().message).toBe("Exported Jazz"));
  });
});
