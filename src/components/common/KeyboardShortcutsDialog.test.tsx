import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";
import { $shortcutsHelpOpen } from "../../stores/navigation";

beforeEach(() => $shortcutsHelpOpen.set(false));

describe("KeyboardShortcutsDialog", () => {
  it("renders nothing while closed", () => {
    render(<KeyboardShortcutsDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a representative combo from every group when open", () => {
    act(() => $shortcutsHelpOpen.set(true));
    render(<KeyboardShortcutsDialog />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Ctrl+K")).toBeTruthy();   // global
    expect(screen.getByText("Alt+1")).toBeTruthy();    // navigation
    expect(screen.getByText("Ctrl+N")).toBeTruthy();   // context
    expect(screen.getByText("Shift+F10")).toBeTruthy();// list
  });

  it("closes when the store flips to false", () => {
    act(() => $shortcutsHelpOpen.set(true));
    render(<KeyboardShortcutsDialog />);
    act(() => $shortcutsHelpOpen.set(false));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
