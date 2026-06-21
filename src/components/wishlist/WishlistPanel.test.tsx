// src/components/wishlist/WishlistPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, screen, act } from "@testing-library/react";
import * as m from "../../i18n/paraglide/messages";
import { $wishlist, $ignorelist, $patternSelection, $showAddPatternDialog } from "../../stores/wishlist";
import { replaceSelection } from "../../stores/selection";
import * as tauri from "../../lib/tauri";
import { WishlistPanel } from "./WishlistPanel";

vi.mock("../../lib/tauri", () => ({
  getWishlist: vi.fn().mockResolvedValue([{ pattern: "*ad*", addedAt: "2026-01-01T00:00:00Z" }]),
  getIgnorelist: vi.fn().mockResolvedValue([]),
  removeFromWishlistBulk: vi.fn().mockResolvedValue(1),
  removeFromIgnorelistBulk: vi.fn().mockResolvedValue(0),
}));

beforeEach(() => {
  $wishlist.set([{ pattern: "*ad*", addedAt: "2026-01-01T00:00:00Z" }]);
  $ignorelist.set([]);
  replaceSelection($patternSelection, new Set());
  $showAddPatternDialog.set(false);
});

it("routes the cluster delete to the wishlist bulk command for the active tab", async () => {
  const { getByText, getByRole } = render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
  await waitFor(() => getByText(m.select_all()));
  fireEvent.click(getByText(m.select_all()));
  expect($patternSelection.get().size).toBe(1);
  fireEvent.click(getByText(m.delete_selected({ count: 1 })));
  fireEvent.click(getByRole("button", { name: m.remove_pattern() })); // confirm (button === title, query by role)
  await waitFor(() => expect(tauri.removeFromWishlistBulk).toHaveBeenCalledWith(["*ad*"]));
});

it("clears the selection when the tab changes", async () => {
  const { getByText } = render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
  await waitFor(() => getByText(m.select_all()));
  replaceSelection($patternSelection, new Set(["*ad*"]));
  fireEvent.click(getByText(m.ignorelist_section_title()));
  await waitFor(() => expect($patternSelection.get().size).toBe(0));
});

it("opens the add-pattern dialog for the active tab when the Ctrl+N bridge atom is set", async () => {
  render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
  await waitFor(() => screen.getByText(m.select_all()));
  act(() => $showAddPatternDialog.set(true));
  // Default active tab is "wishlist", so AddPatternDialog opens titled
  // m.add_to_wishlist() ("Додати до бажаних"). The dialog MUST be reachable by
  // role: WishlistPanel wraps the screen in react-aria <Tabs>, a collection
  // component that renders its children twice. A createPortal dialog nested in
  // <Tabs> mounts the Modal twice and the two overlays mutually aria-hide each
  // other, dropping the dialog (and its focused input) from the a11y tree —
  // NVDA goes silent on open. The portal is now a sibling of <Tabs>, so exactly
  // one overlay mounts; findByRole("dialog") is the regression guard (it sees
  // no aria-hidden dialog, and would throw on a double-mount).
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent(m.add_to_wishlist());
  expect($showAddPatternDialog.get()).toBe(false);
});

describe("controls zone — roving toolbar", () => {
  it("moves focus between toolbar buttons with Left/Right arrows", async () => {
    const { getByText } = render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
    await waitFor(() => getByText(m.select_all()));
    const addBtn = getByText(m.add_pattern());
    const selectAllBtn = getByText(m.select_all());
    const deleteBtn = getByText(m.delete_selected({ count: 0 }));

    addBtn.focus();
    expect(addBtn).toHaveFocus();

    fireEvent.keyDown(addBtn, { key: "ArrowRight" });
    expect(selectAllBtn).toHaveFocus();

    fireEvent.keyDown(selectAllBtn, { key: "ArrowRight" });
    expect(deleteBtn).toHaveFocus();

    fireEvent.keyDown(deleteBtn, { key: "ArrowLeft" });
    expect(selectAllBtn).toHaveFocus();
  });

  it("Tab from a toolbar button exits the zone forward; Shift+Tab returns to the active tab", async () => {
    const exitZone = vi.fn();
    const { getByText, getByRole } = render(<WishlistPanel onZonesChange={vi.fn()} exitZone={exitZone} />);
    await waitFor(() => getByText(m.select_all()));

    fireEvent.keyDown(getByText(m.delete_selected({ count: 0 })), { key: "Tab" });
    expect(exitZone).toHaveBeenCalledWith("wishlist-controls", true);

    fireEvent.keyDown(getByText(m.add_pattern()), { key: "Tab", shiftKey: true });
    expect(getByRole("tab", { name: m.wishlist_section_title(), selected: true })).toHaveFocus();
  });

  it("exposes roving tabIndex (active 0, others -1)", async () => {
    const { getByText } = render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
    await waitFor(() => getByText(m.select_all()));
    expect(getByText(m.add_pattern())).toHaveAttribute("tabindex", "0");
    expect(getByText(m.select_all())).toHaveAttribute("tabindex", "-1");
    expect(getByText(m.delete_selected({ count: 0 }))).toHaveAttribute("tabindex", "-1");
  });
});

