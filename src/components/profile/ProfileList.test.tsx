import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ProfileList } from "./ProfileList";
import type { ProfileMeta } from "../../lib/tauri";

vi.mock("../../i18n/paraglide/messages", () => ({
  profile_list_label: () => "Profiles",
  profile_active_badge: () => "active",
  profile_stream_count_hint: ({ count }: { count: number }) => `${count} streams`,
}));

const profiles: ProfileMeta[] = [
  { name: "Default", streamCount: 2, isActive: true },
  { name: "Jazz", streamCount: 5, isActive: false },
];

describe("ProfileList", () => {
  it("renders all profiles as list options", () => {
    const { getAllByRole } = render(
      <ProfileList
        profiles={profiles}
        selected="Default"
        onSelect={() => {}}
      />
    );
    const options = getAllByRole("option");
    expect(options).toHaveLength(2);
  });

  it("marks the selected profile as selected", () => {
    const { getAllByRole } = render(
      <ProfileList profiles={profiles} selected="Default" onSelect={() => {}} />
    );
    const options = getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
  });

  it("marks only one item when profile names share a prefix (Default vs Default1)", () => {
    const prefixProfiles: ProfileMeta[] = [
      { name: "Default", streamCount: 10, isActive: true },
      { name: "Default1", streamCount: 10, isActive: false },
    ];
    const { getAllByRole } = render(
      <ProfileList profiles={prefixProfiles} selected="Default" onSelect={() => {}} />
    );
    const options = getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
  });
});
