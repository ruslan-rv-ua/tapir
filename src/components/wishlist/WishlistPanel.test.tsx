// src/components/wishlist/WishlistPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef, useState } from "react";
import * as m from "../../i18n/paraglide/messages";
import { $wishlist, $ignorelist, $wishlistMatches, $patternSelection, $showAddPatternDialog } from "../../stores/wishlist";
import type { WishlistEntry, WishlistMatch } from "../../lib/tauri";
import { $announcer } from "../../stores/announcer";
import { replaceSelection } from "../../stores/selection";
import * as tauri from "../../lib/tauri";
import { WishlistPanel } from "./WishlistPanel";
import { useZoneNavigation, type ZoneEntry } from "../../hooks/useZoneNavigation";
import { EXAMPLE_WISHLIST_PATTERNS, EXAMPLE_IGNORELIST_PATTERNS } from "./examplePatterns";

/** A wishlist row. The panel reads the pattern and the date; the rest is per-entry
    recording policy, and every test here leaves it at its defaults. */
const mkEntry = (pattern: string, addedAt = "2026-07-19T00:00:00Z"): WishlistEntry => ({
  pattern,
  addedAt,
  minBitrate: null,
  format: null,
  removeAfterRecord: false,
  addToIgnorelistAfterRecord: false,
});

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
  removeFromWishlist: vi.fn().mockResolvedValue(undefined),
  removeFromIgnorelist: vi.fn().mockResolvedValue(undefined),
  removeFromWishlistBulk: vi.fn().mockResolvedValue(1),
  removeFromIgnorelistBulk: vi.fn().mockResolvedValue(0),
  addToWishlist: vi.fn(async (pattern: string) => ({ pattern, addedAt: "2026-07-19T00:00:00Z" })),
  addToIgnorelist: vi.fn(async (_pattern: string) => undefined),
}));

beforeEach(() => {
  $wishlist.set([mkEntry("*ad*", "2026-01-01T00:00:00Z")]);
  $ignorelist.set([]);
  replaceSelection($patternSelection, new Set());
  $showAddPatternDialog.set(false);
  $wishlistMatches.set([]);
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

it("deleting the last remaining pattern moves focus to the empty-state CTA (R1: onEmpty is dead code once the parent swaps to the empty zone in the same render)", async () => {
  // Single-row delete: click the row's own delete action, then confirm. The
  // dialog's confirm button has no explicit confirmLabel, so it falls back to
  // m.delete() — distinct from the dialog title (m.remove_pattern()), so the
  // two buttons don't collide by accessible name.
  const { getByRole } = render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
  await waitFor(() => screen.getByText(m.select_all()));
  fireEvent.click(getByRole("button", { name: `${m.remove_pattern()}: *ad*` }));
  fireEvent.click(getByRole("button", { name: m["delete"]() }));
  await waitFor(() => expect(tauri.removeFromWishlist).toHaveBeenCalledWith("*ad*"));
  await waitFor(() => expect($wishlist.get()).toEqual([]));
  await waitFor(() => {
    const cta = document.activeElement as HTMLElement;
    expect(cta.tagName).toBe("BUTTON");
    expect(cta).toHaveAccessibleName(m.wishlist_add_example());
  });
});

it("bulk-deleting all remaining patterns moves focus to the empty-state CTA (bulk-remove path, distinct from the single-delete flag-set)", async () => {
  // Same drive as "routes the cluster delete..." above, but this test's whole
  // point is the focus assertion at the end: WishlistPanel.handleBulkRemove
  // sets pendingFocusEmptyZone.current directly (synchronously with its
  // $wishlist.set() call) — a different code site from the single-row delete
  // handlers' `if (next.length === 0) pendingFocusEmptyZone.current = true;`,
  // and one that has to win a real microtask race against React's own
  // automatic-batching flush (see WishlistPanel.tsx handleBulkRemove for the
  // full account of why the naive "set it in PatternList's onEmpty()" shape
  // loses that race).
  const { getByText, getByRole } = render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
  await waitFor(() => getByText(m.select_all()));
  fireEvent.click(getByText(m.select_all()));
  expect($patternSelection.get().size).toBe(1);
  fireEvent.click(getByText(m.delete_selected({ count: 1 })));
  fireEvent.click(getByRole("button", { name: m.remove_pattern() })); // confirm (explicit confirmLabel === title)
  await waitFor(() => expect(tauri.removeFromWishlistBulk).toHaveBeenCalledWith(["*ad*"]));
  await waitFor(() => expect($wishlist.get()).toEqual([]));
  await waitFor(() => {
    const cta = document.activeElement as HTMLElement;
    expect(cta.tagName).toBe("BUTTON");
    expect(cta).toHaveAccessibleName(m.wishlist_add_example());
  });
});

it("deleting the last pattern on the ignorelist tab moves focus to the empty-state CTA (active-tab-specific, not union of both lists)", async () => {
  // Seed BOTH lists — wishlist keeps its default non-empty seed from beforeEach
  // ("*ad*") and ignorelist gets one pattern of its own. If the focus effect
  // (WishlistPanel.tsx ~line 300) ever regressed to checking "either list is
  // non-empty" instead of the ACTIVE tab's list, this proves it: wishlist stays
  // non-empty throughout, so a union check would never fire the CTA focus here.
  $ignorelist.set(["blocked*"]);
  vi.mocked(tauri.getIgnorelist).mockResolvedValueOnce(["blocked*"]);
  render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
  await waitFor(() => screen.getByText(m.select_all()));
  fireEvent.click(screen.getByText(m.ignorelist_section_title()));
  const rowDeleteBtn = await screen.findByRole("button", { name: `${m.remove_pattern()}: blocked*` });
  fireEvent.click(rowDeleteBtn);
  fireEvent.click(screen.getByRole("button", { name: m["delete"]() }));
  await waitFor(() => expect(tauri.removeFromIgnorelist).toHaveBeenCalledWith("blocked*"));
  await waitFor(() => expect($ignorelist.get()).toEqual([]));
  await waitFor(() => {
    const cta = document.activeElement as HTMLElement;
    expect(cta.tagName).toBe("BUTTON");
    expect(cta).toHaveAccessibleName(m.wishlist_add_example());
  });
});

it("bulk-deleting all remaining patterns on the ignorelist tab moves focus to the empty-state CTA", async () => {
  // Ignorelist twin of the wishlist bulk test above. Wishlist keeps its
  // non-empty beforeEach seed ("*ad*") throughout, so this also re-proves the
  // active-tab (not union) keying. Drive: select-all via the toolbar, then the
  // ROW's ✕ button — with the row already in the selection, PatternList opens
  // the BULK confirm (not the single one), so this exercises
  // handleBulkRemove's ignorelist branch without going through the toolbar's
  // delete button (whose patternListRef path is a separate known issue).
  $ignorelist.set(["blocked*"]);
  vi.mocked(tauri.getIgnorelist).mockResolvedValueOnce(["blocked*"]);
  vi.mocked(tauri.removeFromIgnorelistBulk).mockResolvedValueOnce(1);
  render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
  await waitFor(() => screen.getByText(m.select_all()));
  fireEvent.click(screen.getByText(m.ignorelist_section_title()));
  const rowDeleteBtn = await screen.findByRole("button", { name: `${m.remove_pattern()}: blocked*` });
  fireEvent.click(screen.getByText(m.select_all()));
  expect($patternSelection.get().size).toBe(1);
  fireEvent.click(rowDeleteBtn); // in-selection ✕ → bulk confirm
  fireEvent.click(screen.getByRole("button", { name: m.remove_pattern() })); // confirm (explicit confirmLabel === title)
  await waitFor(() => expect(tauri.removeFromIgnorelistBulk).toHaveBeenCalledWith(["blocked*"]));
  await waitFor(() => expect($ignorelist.get()).toEqual([]));
  await waitFor(() => {
    const cta = document.activeElement as HTMLElement;
    expect(cta.tagName).toBe("BUTTON");
    expect(cta).toHaveAccessibleName(m.wishlist_add_example());
  });
});

it("the TOOLBAR delete still reaches the list after switching tabs (stale patternListRef)", async () => {
  // Both lists non-empty on purpose: switching tabs then leaves RAC's deselected
  // TabPanel mounted for one extra commit (useExitAnimation), so the ref order is
  // attach(new list) → detach(old list). Without a cleanup-returning callback ref,
  // the old panel's `null` lands AFTER the new attach and wipes patternListRef —
  // the toolbar's "Delete selected" then silently no-ops
  // (patternListRef.current?.requestBulkRemove()) with no feedback for NVDA.
  // The existing ignorelist-bulk test deliberately drives the ROW ✕ instead, so
  // this is the only coverage of the toolbar path on a switched-to tab.
  $ignorelist.set(["blocked*"]);
  vi.mocked(tauri.getIgnorelist).mockResolvedValueOnce(["blocked*"]);
  vi.mocked(tauri.removeFromIgnorelistBulk).mockResolvedValueOnce(1);
  render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
  await waitFor(() => screen.getByText(m.select_all()));
  fireEvent.click(screen.getByText(m.ignorelist_section_title()));
  await screen.findByRole("button", { name: `${m.remove_pattern()}: blocked*` });

  fireEvent.click(screen.getByText(m.select_all()));
  expect($patternSelection.get().size).toBe(1);
  fireEvent.click(screen.getByText(m.delete_selected({ count: 1 })));

  // The bulk confirm must actually open — that is the part that silently died.
  const confirm = await screen.findByRole("button", { name: m.remove_pattern() });
  fireEvent.click(confirm);
  await waitFor(() => expect(tauri.removeFromIgnorelistBulk).toHaveBeenCalledWith(["blocked*"]));
});

it("F6 still reaches the pattern list after switching tabs (stale patternListRef)", async () => {
  // Second symptom of the same stale ref: the wishlist-list proxy zone delegates
  // to patternListRef.current, so a wiped ref makes the zone decline focus and
  // cycleZone skips the list entirely (it is contractually allowed to skip zones
  // that decline). Drive the real Tab → composite-exit → cycleZone path.
  $ignorelist.set(["blocked*"]);
  vi.mocked(tauri.getIgnorelist).mockResolvedValueOnce(["blocked*"]);
  render(<ZoneHarness />);
  await waitFor(() => screen.getByText(m.select_all()));
  fireEvent.click(screen.getByText(m.ignorelist_section_title()));
  await screen.findByRole("button", { name: `${m.remove_pattern()}: blocked*` });

  const addBtn = screen.getByText(m.add_pattern());
  act(() => addBtn.focus());
  fireEvent.keyDown(addBtn, { key: "Tab" });
  // Expected: the ignorelist row, NOT the status bar (which is where a declined
  // list zone would dump focus).
  expect(document.activeElement?.getAttribute("data-item-id")).toBe("blocked*");
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

  it("merges the first successful pattern into the store when the second seed call rejects, and announces failure (R2: partial seed failure)", async () => {
    $wishlist.set([]);
    vi.mocked(tauri.getWishlist).mockResolvedValueOnce([]);
    vi.mocked(tauri.addToWishlist)
      .mockImplementationOnce(async (pattern: string) => mkEntry(pattern))
      .mockImplementationOnce(async () => { throw new Error("boom"); });
    render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: m.wishlist_add_example() }));

    await waitFor(() => expect(vi.mocked(tauri.addToWishlist).mock.calls.length).toBe(2));
    await waitFor(() =>
      expect($announcer.get()?.message).toBe(m.wishlist_examples_failed()),
    );
    // The backend already accepted the first pattern — the store must reflect
    // that even though the run as a whole failed, or the UI keeps lying that
    // the list is empty until a retry or remount.
    expect($wishlist.get().map((e) => e.pattern)).toEqual([EXAMPLE_WISHLIST_PATTERNS[0]]);
  });

  it("hides the CTA once the list has patterns", async () => {
    render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
    await waitFor(() => screen.getByText(m.select_all()));
    expect(screen.queryByRole("button", { name: m.wishlist_add_example() })).toBeNull();
  });
});



// ── Журнал збігів (третя вкладка) ──────────────────────────────────────────
// Носій-стан для рідкісної події станції: без нього збіг спостережуваний лише
// для скрінрідера (ADR 2026-08-31 «Носії для подій станції»).

const mkMatch = (over: Partial<WishlistMatch> = {}): WishlistMatch => ({
  id: 1,
  matchedAt: "2026-08-31T21:04:00Z",
  streamId: "s1",
  stationName: "Radio Paradise",
  artist: "Tycho",
  title: "Dive",
  pattern: "Tycho*",
  ...over,
});

async function openMatchesTab() {
  const view = render(<WishlistPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
  await waitFor(() => screen.getByText(m.select_all()));
  fireEvent.click(view.getByRole("tab", { name: m.matches_section_title() }));
  return view;
}

describe("WishlistPanel — журнал збігів", () => {
  it("рядок несе всі чотири факти: час, станцію, трек і патерн", async () => {
    $wishlistMatches.set([mkMatch()]);
    const { getByRole } = await openMatchesTab();

    const row = getByRole("listitem");
    const label = row.getAttribute("aria-label")!;
    expect(label).toMatch(/\d\d:\d\d/); // час, локальний
    expect(label).toContain("Radio Paradise");
    expect(label).toContain("Tycho — Dive");
    expect(label).toContain("Tycho*");
  });

  it("найновіший збіг стоїть зверху", async () => {
    // Порядок приходить із буфера в Rust; екран його не переупорядковує.
    $wishlistMatches.set([mkMatch({ id: 2, title: "Awake" }), mkMatch({ id: 1, title: "Dive" })]);
    const { getAllByRole } = await openMatchesTab();

    const labels = getAllByRole("listitem").map((li) => li.getAttribute("aria-label")!);
    expect(labels[0]).toContain("Awake");
    expect(labels[1]).toContain("Dive");
  });

  it("порожній вішліст → порожній стан кличе додати патерн", async () => {
    // Не лише store: на монтуванні панель перечитує список із бекенду, і без
    // цього мока він одразу повернув би патерн назад.
    vi.mocked(tauri.getWishlist).mockResolvedValueOnce([]);
    $wishlist.set([]);
    const { getByText } = await openMatchesTab();
    expect(getByText(m.empty_matches_no_patterns())).toBeTruthy();
  });

  it("патерни є, збігів немає → порожній стан називає сеанс і залежність від запису", async () => {
    // Обидва факти обов'язкові: без «за цей сеанс» текст брехав би після
    // перезапуску, а без другого речення ніде в інтерфейсі не сказано, що
    // звіряння йде лише під час запису.
    const { getByText } = await openMatchesTab();
    expect(getByText(m.empty_matches_none_yet())).toBeTruthy();
  });

  it("порожній журнал усе одно приймає фокус, тож F6 його не проскакує", async () => {
    render(<ZoneHarness />);
    await waitFor(() => screen.getByText(m.select_all()));
    fireEvent.click(screen.getByRole("tab", { name: m.matches_section_title() }));

    await waitFor(() => expect(document.querySelector('[data-zone-id="wishlist-matches"]')).toBeTruthy());
    screen.getByRole("tab", { name: m.matches_section_title() }).focus();
    fireEvent.keyDown(document.activeElement!, { key: "F6" });

    expect(document.activeElement?.closest("[data-zone-id]")?.getAttribute("data-zone-id"))
      .toBe("wishlist-matches");
  });

  it("тулбар зникає: у журналі немає ні куди додавати, ні що виділяти", async () => {
    const { queryByText } = await openMatchesTab();
    expect(queryByText(m.add_pattern())).toBeNull();
    expect(queryByText(m.select_all())).toBeNull();
  });

  it("Ctrl+N у журналі відкриває ту вкладку, в яку насправді додає", async () => {
    const { getByRole } = await openMatchesTab();
    act(() => $showAddPatternDialog.set(true));

    // Заголовок діалогу називає список, у який патерн ляже.
    await waitFor(() => expect(getByRole("dialog")).toBeTruthy());
    expect(getByRole("heading", { name: m.add_to_wishlist() })).toBeTruthy();
    // `hidden: true` обов'язкове: відкритий Modal aria-ховає решту сторінки.
    expect(
      getByRole("tab", { name: m.wishlist_section_title(), hidden: true }).getAttribute("aria-selected"),
    ).toBe("true");
  });
});
