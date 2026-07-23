import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileSettingsDialog } from "./ProfileSettingsDialog";

vi.mock("../../i18n/paraglide/messages", () => ({
  profile_settings_title: ({ name }: { name: string }) => `Profile settings: ${name}`,
  profile_autoplay_label: () => "Resume last playback on startup",
  profile_autoplay_hint: () => "Sound plays over NVDA speech.",
  cancel: () => "Cancel",
  ok: () => "Save",
}));

const baseProps = {
  name: "Jazz",
  initialEnabled: false,
  busy: false,
  onConfirm: () => {},
  onCancel: () => {},
};

describe("ProfileSettingsDialog", () => {
  it("renders the title with the profile name", () => {
    render(<ProfileSettingsDialog {...baseProps} />);
    expect(screen.getByText("Profile settings: Jazz")).toBeInTheDocument();
  });

  it("reflects the initial autoplay value on the checkbox", () => {
    render(<ProfileSettingsDialog {...baseProps} initialEnabled />);
    expect(screen.getByRole("checkbox", { name: /Resume last playback/ })).toBeChecked();
  });

  it("shows the NVDA warning hint", () => {
    render(<ProfileSettingsDialog {...baseProps} />);
    expect(screen.getByText(/over NVDA speech/)).toBeInTheDocument();
  });

  it("confirms with the toggled value", async () => {
    const onConfirm = vi.fn();
    render(<ProfileSettingsDialog {...baseProps} initialEnabled={false} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /Resume last playback/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(<ProfileSettingsDialog {...baseProps} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(onCancel).toHaveBeenCalled();
  });
});
