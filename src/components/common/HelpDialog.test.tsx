import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpDialog } from "./HelpDialog";
import { $helpOpen } from "../../stores/navigation";

vi.mock("../../i18n/paraglide/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/paraglide/runtime")>();
  return { ...actual, getLocale: () => "uk" };
});

beforeEach(() => $helpOpen.set(false));

describe("HelpDialog", () => {
  it("renders nothing while closed", () => {
    render(<HelpDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on the overview tab with markdown content in the DOM", () => {
    act(() => $helpOpen.set(true));
    render(<HelpDialog />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Overview HTML (compiled from docs/help/uk/overview.md) is the default panel.
    expect(screen.getByText(/Ласкаво просимо/)).toBeTruthy();
  });

  it("shows a representative combo from every group after switching to the shortcuts tab", async () => {
    act(() => $helpOpen.set(true));
    render(<HelpDialog />);
    await userEvent.click(screen.getByRole("tab", { name: "Гарячі клавіші" }));
    expect(screen.getByText("Ctrl+K")).toBeTruthy();        // global
    expect(screen.getByText("Alt+1")).toBeTruthy();         // navigation
    expect(screen.getAllByText("Ctrl+N").length).toBeGreaterThanOrEqual(4); // context — one Ctrl+N per screen (streams/profiles/wishlist/schedule); ≥ tolerates future screens (ADR scaling)
    expect(screen.getByText("Shift+F10")).toBeTruthy();     // list
  });

  it("closes when the store flips to false", () => {
    act(() => $helpOpen.set(true));
    render(<HelpDialog />);
    act(() => $helpOpen.set(false));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
