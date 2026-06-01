import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render } from "@testing-library/react";
import { ProfileList } from "./ProfileList";
import type { ProfileListHandle } from "./ProfileList";
import type { ProfileMeta } from "../../lib/tauri";

vi.mock("../../i18n/paraglide/runtime", () => ({
  getLocale: () => "uk",
}));

vi.mock("../../i18n/paraglide/messages", () => ({
  profile_list_label: () => "Profiles",
  profile_active_badge: () => "active",
  profile_stream_count_one: ({ count }: { count: number }) => `${count} потік`,
  profile_stream_count_few: ({ count }: { count: number }) => `${count} потоки`,
  profile_stream_count_many: ({ count }: { count: number }) => `${count} потоків`,
  profile_stream_count_other: ({ count }: { count: number }) => `${count} потоки`,
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

  it("renders an 'active' pill only for the active profile", () => {
    const { getAllByText, getByText } = render(
      <ProfileList profiles={profiles} selected="Default" onSelect={() => {}} />
    );
    expect(getAllByText("active")).toHaveLength(1);
    expect(getByText("active")).toBeInTheDocument();
  });

  it("exposes focusSelected() that focuses the selected option", () => {
    const ref = createRef<ProfileListHandle>();
    const { getByRole } = render(
      <ProfileList ref={ref} profiles={profiles} selected="Jazz" onSelect={() => {}} />
    );
    ref.current!.focusSelected();
    const jazz = getByRole("option", { name: /Jazz/ });
    expect(document.activeElement).toBe(jazz);
  });

  it("pluralizes the stream count for Ukrainian (1/3/5)", () => {
    const ukProfiles: ProfileMeta[] = [
      { name: "A", streamCount: 1, isActive: false },
      { name: "B", streamCount: 3, isActive: false },
      { name: "C", streamCount: 5, isActive: false },
    ];
    const { getByText } = render(
      <ProfileList profiles={ukProfiles} selected="A" onSelect={() => {}} />
    );
    expect(getByText("1 потік")).toBeInTheDocument();
    expect(getByText("3 потоки")).toBeInTheDocument();
    expect(getByText("5 потоків")).toBeInTheDocument();
  });
});
