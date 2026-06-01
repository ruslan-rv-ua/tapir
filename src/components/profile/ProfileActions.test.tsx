import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ProfileActions } from "./ProfileActions";

vi.mock("../../i18n/paraglide/messages", () => ({
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
}));

describe("ProfileActions", () => {
  const noop = vi.fn();
  const baseProps = {
    selected: "Jazz",
    activeProfile: "Default",
    onSwitch: noop, onRename: noop, onDelete: noop,
    onDuplicate: noop, onExport: noop, onImport: noop, onNew: noop,
  };

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

  it("disables Rename when selected is active", () => {
    const { getByRole } = render(
      <ProfileActions {...baseProps} selected="Default" activeProfile="Default" />
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

  it("orders buttons: Switch, New, Duplicate, Rename, Delete, Export, Import", () => {
    const { getAllByRole } = render(<ProfileActions {...baseProps} />);
    const names = getAllByRole("button").map((b) => b.textContent?.trim());
    expect(names).toEqual([
      "Switch", "New profile", "Duplicate", "Rename", "Delete", "Export", "Import",
    ]);
  });
});
