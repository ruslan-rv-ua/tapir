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
  // m.add_to_wishlist() ("Додати до бажаних"). NB: react-aria's ModalOverlay
  // is given aria-hidden in jsdom when the dialog renders inside this panel's
  // <Tabs>, so role-based queries (findByRole "dialog"/"heading") can't see it
  // — true for the shipped button-open path too, not just this bridge. Assert
  // against the role="dialog" DOM node directly (the a11y-tree filter doesn't
  // drop a querySelector) and its title text.
  const dialog = await waitFor(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) throw new Error("add-pattern dialog did not open");
    return d as HTMLElement;
  });
  expect(dialog).toHaveTextContent(m.add_to_wishlist());
  expect($showAddPatternDialog.get()).toBe(false);
});

