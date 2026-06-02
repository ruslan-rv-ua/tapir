import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileNameDialog } from "./ProfileNameDialog";

vi.mock("../../i18n/paraglide/messages", () => ({
  profile_new_name_label: () => "New name",
  cancel: () => "Cancel",
  ok: () => "OK",
}));

const baseProps = {
  title: "New profile",
  value: "",
  error: null as string | null,
  busy: false,
  onChange: () => {},
  onConfirm: () => {},
  onCancel: () => {},
};

describe("ProfileNameDialog", () => {
  it("renders the title and a localized OK button", () => {
    render(<ProfileNameDialog {...baseProps} />);
    expect(screen.getByRole("button", { name: /^OK$/ })).toBeInTheDocument();
    expect(screen.getByText("New profile")).toBeInTheDocument();
  });

  it("disables OK when the value is empty", () => {
    render(<ProfileNameDialog {...baseProps} value="   " />);
    expect(screen.getByRole("button", { name: /^OK$/ })).toBeDisabled();
  });

  it("shows the error text with role=alert", () => {
    render(<ProfileNameDialog {...baseProps} value="X" error="Conflict" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Conflict");
  });

  it("calls onConfirm when OK is clicked", async () => {
    const onConfirm = vi.fn();
    render(<ProfileNameDialog {...baseProps} value="Jazz" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: /^OK$/ }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("gives footer buttons a visible focus outline class", () => {
    render(<ProfileNameDialog {...baseProps} />);
    expect(screen.getByRole("button", { name: /Cancel/ }).className).toMatch(/focus-visible:outline/);
  });
});
