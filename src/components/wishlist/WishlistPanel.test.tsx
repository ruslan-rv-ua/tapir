// src/components/wishlist/WishlistPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef, useState } from "react";
import * as m from "../../i18n/paraglide/messages";
import { $wishlist, $ignorelist, $patternSelection, $showAddPatternDialog } from "../../stores/wishlist";
import { $announcer } from "../../stores/announcer";
import { replaceSelection } from "../../stores/selection";
import * as tauri from "../../lib/tauri";
import { WishlistPanel } from "./WishlistPanel";
import { useZoneNavigation, type ZoneEntry } from "../../hooks/useZoneNavigation";
import { EXAMPLE_WISHLIST_PATTERNS, EXAMPLE_IGNORELIST_PATTERNS } from "./examplePatterns";

// Faithful mirror of App.tsx's zone wiring: a permanent activity-bar zone, the
// panel's screen zones, a player zone that DECLINES focus (nothing playing —
// PlayerPanel.restoreFocusPlayer returns), and a status-bar zone. This exercises
// the real cycleZone path that WishlistPanel's own tests bypass by mocking exitZone.
function ZoneHarness() {
  const [screenZones, setScreenZones] = useState<ZoneEntry[]>([]);
  const orderedZonesRef = useRef<ZoneEntry[]>([]);
  const activityRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLButtonElement>(null);
  const { exitZone } = useZoneNavigation(orderedZonesRef);

  useEffect(() => {
    orderedZonesRef.current = [
      { id: "activity-bar", get el() { return activityRef.current!; }, focus: () => activityRef.current?.focus() },
      ...screenZones,
      { id: "player", get el() { return document.body; }, focus: () => {} }, // declines (stopped)
      { id: "status-bar", get el() { return statusRef.current!; }, focus: () => statusRef.current?.focus() },
    ];
  }, [screenZones]);

  return (
    <>
      <button ref={activityRef} data-zone-id="activity-bar">activity</button>
      <WishlistPanel onZonesChange={setScreenZones} exitZone={exitZone} />
      <button ref={statusRef} data-zone-id="status-bar">status</button>
    </>
  );
}

vi.mock("../../lib/tauri", () => ({
  getWishlist: vi.fn().mockResolvedValue([{ pattern: "*ad*", addedAt: "2026-01-01T00:00:00Z" }]),
  getIgnorelist: vi.fn().mockResolvedValue([]),
  removeFromWishlistBulk: vi.fn().mockResolvedValue(1),
  removeFromIgnorelistBulk: vi.fn().mockResolvedValue(0),
  addToWishlist: vi.fn(async (pattern: string) => ({ pattern, addedAt: "2026-07-19T00:00:00Z" })),
  addToIgnorelist: vi.fn(async (_pattern: string) => undefined),
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

  it("registers the wishlist-list zone so Tab from the controls reaches the list", async () => {
    const onZonesChange = vi.fn();
    render(<WishlistPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />);
    await waitFor(() => screen.getByText(m.select_all()));
    const zones = onZonesChange.mock.calls.at(-1)![0] as {
      id: string;
      focus: (d: "forward" | "backward") => void;
    }[];
    const listZone = zones.find((z) => z.id === "wishlist-list");
    expect(listZone).toBeTruthy();
    act(() => listZone!.focus("forward"));
    expect(document.activeElement?.getAttribute("data-item-id")).toBe("*ad*");
  });

  it("Tab from a toolbar button lands on the pattern list (real cycleZone path)", async () => {
    render(<ZoneHarness />);
    await waitFor(() => screen.getByText(m.select_all()));
    const addBtn = screen.getByText(m.add_pattern());
    act(() => addBtn.focus());
    expect(addBtn).toHaveFocus();
    fireEvent.keyDown(addBtn, { key: "Tab" });
    // Expected: focus enters the pattern list, NOT the status bar.
    expect(document.activeElement?.getAttribute("data-item-id")).toBe("*ad*");
  });

  it("Tab from a toolbar button lands on the EMPTY zone's CTA button, not the status bar", async () => {
    // The reported bug (R1): with no patterns, Tab from the toolbar landed inside
    // CompositeList's own empty-state slot, whose onKeyDownCapture treats ANY Tab
    // (no active row) as an exit — so a CTA button placed there was unreachable.
    // The empty zone is now a plain hand-rolled region with no keydown capture
    // (mirrors StreamsPanel), and its ZoneEntry.focus targets the CTA directly.
    const user = userEvent.setup();
    $wishlist.set([]);
    vi.mocked(tauri.getWishlist).mockResolvedValueOnce([]);
    render(<ZoneHarness />);
    await waitFor(() => screen.getByText(m.select_all()));
    const addBtn = screen.getByText(m.add_pattern());
    act(() => addBtn.focus());
    fireEvent.keyDown(addBtn, { key: "Tab" });
    const ae = document.activeElement;
    expect(ae?.closest("[data-zone-id]")?.getAttribute("data-zone-id")).toBe("wishlist-empty");
    expect(ae?.tagName).toBe("BUTTON");
    expect(ae).toHaveAccessibleName(m.wishlist_add_example());

    // Not a focus trap: the CTA has no Tab handler of its own, so a real Tab key
    // (user-event, which computes native tab order — fireEvent.keyDown alone
    // cannot, since there is deliberately no app-level interception here)
    // advances to the next zone (player declines → status bar in this harness).
    await user.tab();
    expect(document.activeElement?.closest("[data-zone-id]")?.getAttribute("data-zone-id")).toBe("status-bar");
  });

  it("the CTA is reachable by real Tab from the toolbar and activatable by Enter (R1 regression guard)", async () => {
    // This is the test the whole redesign exists for: prove the CTA can be
    // reached AND activated without a mouse. fireEvent.click alone would not
    // catch the original bug (the button was clickable, just unreachable by Tab).
    const user = userEvent.setup();
    $wishlist.set([]);
    vi.mocked(tauri.getWishlist).mockResolvedValueOnce([]);
    vi.mocked(tauri.addToWishlist).mockClear();
    render(<ZoneHarness />);
    await waitFor(() => screen.getByText(m.select_all()));

    const deleteBtn = screen.getByText(m.delete_selected({ count: 0 }));
    act(() => deleteBtn.focus());
    expect(deleteBtn).toHaveFocus();

    // Real Tab from the toolbar — traverses composite-exit → cycleZone →
    // wishlist-empty's ZoneEntry.focus, exactly as a screen-reader user would.
    await user.tab();
    const cta = document.activeElement as HTMLElement;
    expect(cta.tagName).toBe("BUTTON");
    expect(cta).toHaveAccessibleName(m.wishlist_add_example());

    // Activate with the keyboard, not fireEvent.click.
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(vi.mocked(tauri.addToWishlist).mock.calls.map((c) => c[0]))
        .toEqual([...EXAMPLE_WISHLIST_PATTERNS]),
    );
  });
});

describe("empty-state example seeding", () => {
  beforeEach(() => {
    vi.mocked(tauri.addToWishlist).mockClear();
    vi.mocked(tauri.addToIgnorelist).mockClear();
  });

  it("seeds the wishlist examples and focuses the first row", async () => {
    $wishlist.set([]);
    vi.mocked(tauri.getWishlist).mockResolvedValueOnce([]);
    render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
    const cta = await screen.findByRole("button", { name: m.wishlist_add_example() });

    fireEvent.click(cta);

    await waitFor(() =>
      expect(vi.mocked(tauri.addToWishlist).mock.calls.map((c) => c[0]))
        .toEqual([...EXAMPLE_WISHLIST_PATTERNS]),
    );
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("data-item-id"))
        .toBe(EXAMPLE_WISHLIST_PATTERNS[0]),
    );
  });

  it("announces the seeded patterns", async () => {
    $wishlist.set([]);
    vi.mocked(tauri.getWishlist).mockResolvedValueOnce([]);
    render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: m.wishlist_add_example() }));
    await waitFor(() =>
      expect($announcer.get()?.message).toBe(
        m.wishlist_examples_added({ patterns: EXAMPLE_WISHLIST_PATTERNS.join(", ") }),
      ),
    );
  });

  it("seeds the ignorelist examples from the ignorelist tab", async () => {
    $wishlist.set([]);
    vi.mocked(tauri.getWishlist).mockResolvedValueOnce([]);
    render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
    await waitFor(() => screen.getByText(m.select_all()));
    fireEvent.click(screen.getByText(m.ignorelist_section_title()));

    fireEvent.click(await screen.findByRole("button", { name: m.wishlist_add_example() }));

    await waitFor(() =>
      expect(vi.mocked(tauri.addToIgnorelist).mock.calls.map((c) => c[0]))
        .toEqual([...EXAMPLE_IGNORELIST_PATTERNS]),
    );
    expect(tauri.addToWishlist).not.toHaveBeenCalled();
  });

  it("shows the wildcard syntax badge next to the CTA, and it is not a Tab stop", async () => {
    $wishlist.set([]);
    vi.mocked(tauri.getWishlist).mockResolvedValueOnce([]);
    render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
    await screen.findByRole("button", { name: m.wishlist_add_example() });
    const badge = screen.getByText(m.pattern_hint());
    expect(badge.tagName).toBe("P");
    expect(badge.hasAttribute("tabindex")).toBe(false);
  });

  it("hides the CTA once the list has patterns", async () => {
    render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
    await waitFor(() => screen.getByText(m.select_all()));
    expect(screen.queryByRole("button", { name: m.wishlist_add_example() })).toBeNull();
  });
});

