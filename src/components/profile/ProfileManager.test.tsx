import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
}));

// Mock i18n
vi.mock("../../i18n/paraglide/messages", () => ({
  profile_manager_title: () => "Profile Manager",
  profile_close: () => "Close",
  profile_list_label: () => "Profiles",
  profile_active_badge: () => "active",
  profile_stream_count_hint: ({ count }: { count: number }) => `${count} streams`,
  profile_switch: () => "Switch",
  profile_rename: () => "Rename",
  profile_delete: () => "Delete",
  profile_duplicate: () => "Duplicate",
  profile_export: () => "Export",
  profile_import: () => "Import",
  profile_create: () => "New profile",
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
});
