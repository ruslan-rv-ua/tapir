import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render } from "@testing-library/react";
import { ProfileActions } from "./ProfileActions";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";

vi.mock("../../i18n/paraglide/messages", () => ({
  profile_switch: () => "Switch",
  profile_rename: () => "Rename",
  profile_delete: () => "Delete",
  profile_duplicate: () => "Duplicate",
  profile_export: () => "Export",
  profile_actions_label: () => "Profile actions",
  profile_group_profile: () => "Profile",
  profile_group_file: () => "File",
}));

const baseProps = {
  selected: "Jazz",
  activeProfile: "Default",
  onSwitch: vi.fn(), onRename: vi.fn(), onDelete: vi.fn(),
  onDuplicate: vi.fn(), onExport: vi.fn(), exitZone: vi.fn(),
};

describe("ProfileActions", () => {
  it("disables Switch when selected is active", () => {
    const { getByRole } = render(
      <ProfileActions {...baseProps} selected="Default" activeProfile="Default" />
    );
    expect(getByRole("button", { name: /switch/i })).toBeDisabled();
  });

  it("enables Switch when selected is not active", () => {
    const { getByRole } = render(
      <ProfileActions {...baseProps} selected="Jazz" activeProfile="Default" />
    );
    expect(getByRole("button", { name: /switch/i })).not.toBeDisabled();
  });

  it("disables Rename when selected is Default", () => {
    const { getByRole } = render(
      <ProfileActions {...baseProps} selected="Default" activeProfile="Jazz" />
    );
    expect(getByRole("button", { name: /rename/i })).toBeDisabled();
  });

  it("disables Delete when selected is Default", () => {
    const { getByRole } = render(
      <ProfileActions {...baseProps} selected="Default" activeProfile="Jazz" />
    );
    expect(getByRole("button", { name: /delete/i })).toBeDisabled();
  });

  it("renders the group captions", () => {
    const { getByText } = render(<ProfileActions {...baseProps} />);
    expect(getByText("Profile")).toBeInTheDocument();
    expect(getByText("File")).toBeInTheDocument();
  });

  it("orders buttons: Switch, Duplicate, Rename, Delete, Export", () => {
    const { getAllByRole } = render(<ProfileActions {...baseProps} />);
    const names = getAllByRole("button").map((b) => b.textContent?.trim());
    expect(names).toEqual(["Switch", "Duplicate", "Rename", "Delete", "Export"]);
  });

  it("exposes a ZoneEntry handle with id 'profiles-actions'", () => {
    const ref = createRef<ZoneEntry>();
    render(<ProfileActions ref={ref} {...baseProps} />);
    expect(ref.current?.id).toBe("profiles-actions");
    expect(typeof ref.current?.focus).toBe("function");
  });

  it("wraps actions in an application zone with data-zone-id", () => {
    const { container } = render(<ProfileActions {...baseProps} />);
    const zone = container.querySelector('[data-zone-id="profiles-actions"]');
    expect(zone).toBeTruthy();
    expect(zone?.getAttribute("role")).toBe("application");
  });
});
