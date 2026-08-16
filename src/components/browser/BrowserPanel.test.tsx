import { it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, act } from "@testing-library/react";
import { useCallback, useRef } from "react";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { useGlobalShortcuts } from "../../hooks/useGlobalShortcuts";
import * as m from "../../i18n/paraglide/messages";
import { $popularStations, $stationSelection } from "../../stores/browser";
import { $announcer } from "../../stores/announcer";
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
  $popularStations.set([mk("u1"), mk("u2")]);
  replaceSelection($stationSelection, new Set());
});

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
