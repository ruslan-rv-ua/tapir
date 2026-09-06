import { it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, act } from "@testing-library/react";
import { useCallback, useRef } from "react";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { useGlobalShortcuts } from "../../hooks/useGlobalShortcuts";
import * as m from "../../i18n/paraglide/messages";
import {
  $popularStations, $searchParams, $stationSelection,
  loadMore, resetSearch, searchStations, updateSearchParam,
} from "../../stores/browser";
import { searchStationsIpc } from "../../lib/tauri";
import { $announcer } from "../../stores/announcer";
import { $toasts } from "../../stores/toasts";
import { replaceSelection } from "../../stores/selection";
import type { StationResult } from "../../lib/tauri";
import { BrowserPanel } from "./BrowserPanel";

vi.mock("../../lib/tauri", () => ({
  getBrowserFilters: vi.fn().mockResolvedValue({ countries: [], languages: [], codecs: [] }),
  searchStationsIpc: vi.fn().mockResolvedValue([mk("u1"), mk("u2")]),
  addStationsFromBrowser: vi.fn().mockResolvedValue([]),
  // Pulled in by useGlobalShortcuts (Ctrl+M → muteControl) in the wired test below.
  setVolume: vi.fn().mockResolvedValue(undefined),
}));

function mk(uuid: string): StationResult {
  return {
    stationuuid: uuid, name: uuid, url: `http://${uuid}`, urlResolved: `http://${uuid}`,
    codec: "MP3", bitrate: 128, country: "", countrycode: "", tags: "", language: "",
    votes: 0, clickcount: 0, hasExtendedInfo: null, homepage: "", lastcheckok: 1,
  };
}

beforeEach(() => {
  resetSearch();
  $popularStations.set([mk("u1"), mk("u2")]);
  replaceSelection($stationSelection, new Set());
});

/** The three zones this panel registers, once the results list has a handle. */
async function zonesOf(onZonesChange: ReturnType<typeof vi.fn>): Promise<ZoneEntry[]> {
  await waitFor(() => expect((onZonesChange.mock.lastCall![0] as ZoneEntry[]).length).toBe(3));
  return onZonesChange.mock.lastCall![0] as ZoneEntry[];
}

const activeRow = () => document.activeElement?.getAttribute("data-item-id") ?? null;

// The Ctrl+F contract at the section level: App only ever sees the zones this
// panel registers, so exactly one of them must offer focusSearch.
it("registers the search zone as this section's Ctrl+F target", async () => {
  const onZonesChange = vi.fn();
  render(<BrowserPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />);
  await waitFor(() => expect(onZonesChange).toHaveBeenCalled());
  const zones = onZonesChange.mock.lastCall![0] as ZoneEntry[];
  const searchable = zones.filter((z) => z.focusSearch);
  expect(searchable.map((z) => z.id)).toEqual(["browser-search"]);

  // Park focus outside the field first — SearchForm autofocuses on mount, which
  // would make the assertion vacuous.
  const elsewhere = document.createElement("button");
  document.body.appendChild(elsewhere);
  act(() => elsewhere.focus());
  act(() => searchable[0].focusSearch!());
  expect((document.activeElement as HTMLInputElement).placeholder)
    .toBe(m.browser_search_placeholder());
});

// End-to-end for the criterion "фокус лендиться в поле пошуку з будь-якої зони
// секції": the real panel registers the real zones, and the real Tier-2 listener
// dispatches a real Ctrl+F. App.tsx wires exactly these two together.
it("Ctrl+F lands focus in the search field from another zone of the section", async () => {
  function Wired() {
    const zonesRef = useRef<ZoneEntry[]>([]);
    const onZonesChange = useCallback((z: ZoneEntry[]) => { zonesRef.current = z; }, []);
    useGlobalShortcuts(zonesRef);
    return <BrowserPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />;
  }
  const { getByText } = render(<Wired />);
  await waitFor(() => getByText(m.select_all()));

  // Stand in the selection toolbar — a zone with no search field of its own.
  act(() => getByText(m.select_all()).focus());
  fireEvent.keyDown(getByText(m.select_all()), { code: "KeyF", ctrlKey: true });

  expect((document.activeElement as HTMLInputElement).placeholder)
    .toBe(m.browser_search_placeholder());
});

it("select-all selects all visible stations and announces the count", async () => {
  const { getByText } = render(<BrowserPanel onZonesChange={vi.fn()} exitZone={vi.fn()} />);
  await waitFor(() => getByText(m.select_all()));
  fireEvent.click(getByText(m.select_all()));
  expect($stationSelection.get().size).toBe(2);
  expect($announcer.get()?.message).toBe(m.selection_count({ count: 2 }));
});

// A new query means a new set of results: the row remembered from the previous
// one says nothing about this one, so entry starts at the best new match.
it("a changed query sends the results cursor back to the first station", async () => {
  const onZonesChange = vi.fn();
  const { getByPlaceholderText } = render(<BrowserPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />);
  const results = (await zonesOf(onZonesChange)).find((z) => z.id === "browser-results")!;

  act(() => results.focus("forward"));
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(activeRow()).toBe("u2");

  // Unchanged selection → the position memory still holds (no regression).
  act(() => (document.activeElement as HTMLElement).blur());
  act(() => results.focus("forward"));
  expect(activeRow()).toBe("u2");

  const input = getByPlaceholderText(m.browser_search_placeholder());
  act(() => (input as HTMLInputElement).focus());
  vi.mocked(searchStationsIpc).mockResolvedValueOnce([mk("s1"), mk("s2")]);
  await act(async () => {
    updateSearchParam("query", "jazz");
    await searchStations($searchParams.get());
  });

  // Typing never drags focus into the list.
  expect(document.activeElement).toBe(input);
  // Native Tab target (the roving tabIndex=0 stop) followed the new selection…
  const rows = document.querySelectorAll<HTMLElement>('li[data-segment="summary"]');
  expect(rows[0].getAttribute("data-item-id")).toBe("s1");
  expect(rows[0].tabIndex).toBe(0);
  // …and so does zone entry.
  act(() => results.focus("forward"));
  expect(activeRow()).toBe("s1");
});

// "Load more" appends to the SAME result set — the remembered row still means
// what it meant, so it survives.
it("«Load more» keeps the remembered row", async () => {
  const onZonesChange = vi.fn();
  render(<BrowserPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />);
  const results = (await zonesOf(onZonesChange)).find((z) => z.id === "browser-results")!;

  vi.mocked(searchStationsIpc).mockResolvedValueOnce([mk("s1"), mk("s2")]);
  await act(async () => {
    updateSearchParam("query", "jazz");
    await searchStations($searchParams.get());
  });

  act(() => results.focus("forward"));
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(activeRow()).toBe("s2");
  act(() => (document.activeElement as HTMLElement).blur());

  vi.mocked(searchStationsIpc).mockResolvedValueOnce([mk("s3")]);
  await act(async () => { await loadMore(); });

  act(() => results.focus("forward"));
  expect(activeRow()).toBe("s2");
});

// The query is not the only criterion: a dropdown filter replaces the result set
// just as thoroughly, and the key has to name it too. Guards the half of the
// contract the query test cannot reach.
it("a changed FILTER, not just the query, sends the cursor back to the first station", async () => {
  const onZonesChange = vi.fn();
  render(<BrowserPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />);
  const results = (await zonesOf(onZonesChange)).find((z) => z.id === "browser-results")!;

  vi.mocked(searchStationsIpc).mockResolvedValueOnce([mk("s1"), mk("s2")]);
  await act(async () => {
    updateSearchParam("query", "jazz");
    await searchStations($searchParams.get());
  });
  act(() => results.focus("forward"));
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(activeRow()).toBe("s2");
  act(() => (document.activeElement as HTMLElement).blur());

  // Same query, another country — a different result set all the same.
  vi.mocked(searchStationsIpc).mockResolvedValueOnce([mk("s7"), mk("s8")]);
  await act(async () => {
    updateSearchParam("country", "Poland");
    await searchStations($searchParams.get());
  });

  const rows = document.querySelectorAll<HTMLElement>('li[data-segment="summary"]');
  expect(rows[0].tabIndex).toBe(0); // native Tab target
  act(() => results.focus("forward"));
  expect(activeRow()).toBe("s7");
});

/** Two results on screen with a third waiting in the catalogue. */
async function withMoreToLoad(onZonesChange: ReturnType<typeof vi.fn>) {
  const results = (await zonesOf(onZonesChange)).find((z) => z.id === "browser-results")!;
  vi.mocked(searchStationsIpc).mockResolvedValueOnce([mk("s1"), mk("s2"), mk("s3")]);
  await act(async () => {
    updateSearchParam("query", "jazz");
    updateSearchParam("limit", 2);
    await searchStations($searchParams.get());
  });
  return results;
}

const trailingBtn = () => document.querySelector<HTMLButtonElement>("[data-trailing-stop]");

// The bug this record is about: the button was visible but no keyboard path led
// to it — arrows walked rows only, and Tab meant "leave the zone".
it("reaches and presses «Load more» with the keyboard alone", async () => {
  const onZonesChange = vi.fn();
  render(<BrowserPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />);
  const results = await withMoreToLoad(onZonesChange);

  act(() => results.focus("forward"));
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  expect(activeRow()).toBe("s2"); // End stops at the last ROW
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(document.activeElement).toBe(trailingBtn());

  // Enter on a native button IS a click; the list does not synthesize anything.
  vi.mocked(searchStationsIpc).mockResolvedValueOnce([mk("s3"), mk("s4"), mk("s5")]);
  await act(async () => { fireEvent.click(trailingBtn()!); });

  expect(activeRow()).toBe("s3"); // the first row that just arrived
  fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
  expect(activeRow()).toBe("s2"); // …and the rows before it are still there
});

it("keeps the list, the cursor and the zone while a batch is in flight", async () => {
  const onZonesChange = vi.fn();
  render(<BrowserPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />);
  const results = await withMoreToLoad(onZonesChange);

  act(() => results.focus("forward"));
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });

  let release!: (v: StationResult[]) => void;
  vi.mocked(searchStationsIpc).mockImplementationOnce(
    () => new Promise<StationResult[]>((resolve) => { release = resolve; }),
  );
  await act(async () => { fireEvent.click(trailingBtn()!); });

  // Mid-flight: rows still rendered, cursor still on the button, F6 still has a
  // zone element to land on — the three things the shared loading flag took away.
  expect(document.querySelectorAll('li[data-segment="summary"]')).toHaveLength(2);
  expect(document.activeElement).toBe(trailingBtn());
  expect(trailingBtn()!.textContent).toBe(m.browser_load_more_busy());
  expect(trailingBtn()!.getAttribute("aria-busy")).toBe("true");
  // The zone check reads exactly what cycleZone reads — closest([data-zone-id])
  // off the focused element — so it fails the way F6 would if the list went away.
  expect(document.activeElement!.closest("[data-zone-id]")?.getAttribute("data-zone-id"))
    .toBe("browser-results");

  await act(async () => { release([mk("s3"), mk("s4"), mk("s5")]); });
  expect(activeRow()).toBe("s3");
});

it("an empty batch keeps the cursor in the list and says there is nothing more", async () => {
  const onZonesChange = vi.fn();
  render(<BrowserPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />);
  const results = await withMoreToLoad(onZonesChange);

  act(() => results.focus("forward"));
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });

  vi.mocked(searchStationsIpc).mockResolvedValueOnce([]);
  await act(async () => { fireEvent.click(trailingBtn()!); });

  expect(activeRow()).toBe("s2"); // the last row, never <body>
  expect(document.activeElement).not.toBe(document.body);
  expect($announcer.get()?.message).toBe(m.browser_no_more_results());
  expect(trailingBtn()).toBeNull(); // the button's absence carries the same fact
});

it("a failed batch keeps the results and leaves the cursor on the button", async () => {
  const onZonesChange = vi.fn();
  render(<BrowserPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />);
  const results = await withMoreToLoad(onZonesChange);

  act(() => results.focus("forward"));
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });

  $toasts.set([]);
  vi.mocked(searchStationsIpc).mockRejectedValueOnce(new Error("offline"));
  await act(async () => { fireEvent.click(trailingBtn()!); });

  expect(document.querySelectorAll('li[data-segment="summary"]')).toHaveLength(2);
  expect(document.activeElement).toBe(trailingBtn());
  expect($toasts.get().map((t) => t.type)).toEqual(["error"]);
});

// A batch that lands into criteria the person has already changed is not theirs
// any more, and the list must hear that as "nothing was appended". Anything else
// is read as a successful EMPTY append: the list would speak "nothing more" —
// false, there is more — and pull focus out of the field being typed in.
it("a batch landing after the criteria changed neither speaks nor moves focus", async () => {
  const onZonesChange = vi.fn();
  const { getByPlaceholderText } = render(
    <BrowserPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />,
  );
  const results = await withMoreToLoad(onZonesChange);

  act(() => results.focus("forward"));
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });

  let release!: (batch: StationResult[]) => void;
  vi.mocked(searchStationsIpc).mockImplementationOnce(
    () => new Promise<StationResult[]>((resolve) => { release = resolve; }),
  );
  await act(async () => { fireEvent.click(trailingBtn()!); });

  // …and while it is in the air, the person types on: a different result set.
  const input = getByPlaceholderText(m.browser_search_placeholder());
  act(() => (input as HTMLInputElement).focus());
  act(() => { updateSearchParam("query", "blues"); });
  $announcer.set(null);
  $toasts.set([]);

  await act(async () => { release([mk("s3"), mk("s4"), mk("s5")]); });

  expect(document.activeElement).toBe(input); // still typing, undisturbed
  expect($announcer.get()).toBeNull(); // nothing to say about a set they left
  expect(document.querySelectorAll('li[data-segment="summary"]')).toHaveLength(2);
  expect($toasts.get()).toHaveLength(0);
});

it("Popular Stations has no trailing stop at all", async () => {
  const onZonesChange = vi.fn();
  render(<BrowserPanel onZonesChange={onZonesChange} exitZone={vi.fn()} />);
  await zonesOf(onZonesChange);
  expect(trailingBtn()).toBeNull();
});
