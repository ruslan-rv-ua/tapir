import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileManager } from "./ProfileManager";
import { $profileManagerOpen, $profileList } from "../../stores/profileManager";
import { $settings } from "../../stores/settings";
import type { ProfileMeta } from "../../lib/tauri";

// Mock tauri IPC
vi.mock("../../lib/tauri", () => ({
  listProfiles: vi.fn(async () => [
    { name: "Default", streamCount: 2, isActive: true },
    { name: "Jazz", streamCount: 5, isActive: false },
  ] as ProfileMeta[]),
  switchProfile: vi.fn(async () => ({})),
  deleteProfile: vi.fn(async () => {}),
  createProfile: vi.fn(async (name: string) => ({ name, streamCount: 0, isActive: false })),
  getAllStatuses: vi.fn(async () => []),
}));

vi.mock("../../i18n/paraglide/runtime", () => ({ getLocale: () => "uk" }));

// Mock i18n
vi.mock("../../i18n/paraglide/messages", () => ({
  profile_manager_title: () => "Profile Manager",
  profile_close: () => "Close",
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

describe("ProfileManager", () => {
  beforeEach(() => {
    $profileManagerOpen.set(true);
    $profileList.set([
      { name: "Default", streamCount: 2, isActive: true },
      { name: "Jazz", streamCount: 5, isActive: false },
    ]);
    $settings.set({ activeProfile: "Default" } as Parameters<typeof $settings.set>[0]);
  });

  it("renders the dialog when open", async () => {
    render(<ProfileManager />);
    await screen.findByText("Default");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows both profiles in the list", async () => {
    render(<ProfileManager />);
    await waitFor(() => {
      expect(screen.getByText("Default")).toBeInTheDocument();
      expect(screen.getByText("Jazz")).toBeInTheDocument();
    });
  });

  it("has a close button", async () => {
    render(<ProfileManager />);
    await screen.findByText("Default");
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("returns focus to the selected profile option after Switch", async () => {
    const user = userEvent.setup();
    render(<ProfileManager />);
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("option", { name: /Jazz/ }));
    await user.click(screen.getByRole("button", { name: /^Switch$/ }));
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("option", { name: /Jazz/ }));
    });
  });

  it("returns focus to the Default option after Delete", async () => {
    const user = userEvent.setup();
    render(<ProfileManager />);
    await screen.findByText("Jazz");
    await user.click(screen.getByRole("option", { name: /Jazz/ }));
    await user.click(screen.getByRole("button", { name: /^Delete$/ }));
    const confirm = await screen.findByText("Delete Jazz?");
    expect(confirm).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /^Delete$/ })[0]);
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("option", { name: /Default/ }));
    });
  });
});
