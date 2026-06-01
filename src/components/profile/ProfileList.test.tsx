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
  it("renders all profiles as radio buttons", () => {
    const { getAllByRole } = render(
      <ProfileList
        profiles={profiles}
        selected="Default"
        onSelect={() => {}}
      />
    );
    const radios = getAllByRole("radio");
    expect(radios).toHaveLength(2);
  });

  it("marks the selected profile as checked", () => {
    const { getAllByRole } = render(
      <ProfileList profiles={profiles} selected="Default" onSelect={() => {}} />
    );
    const radios = getAllByRole("radio");
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
  });
});
