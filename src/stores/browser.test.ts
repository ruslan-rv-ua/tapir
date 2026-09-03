import { describe, it, expect, beforeEach, vi } from "vitest";
import type { StationResult } from "../lib/tauri";
import { searchStationsIpc } from "../lib/tauri";
import {
  $stationSelection, $searchResults, $searchLoading, $appendLoading, $searchError, $hasMore,
  updateSearchParam, resetSearch, loadMore, searchStations,
} from "./browser";
import { $toasts } from "./toasts";
import { replaceSelection } from "./selection";

vi.mock("../lib/tauri", () => ({
  searchStationsIpc: vi.fn().mockResolvedValue([]),
}));

const mk = (uuid: string): StationResult => ({
  stationuuid: uuid, name: uuid, url: `http://${uuid}`, urlResolved: `http://${uuid}`,
  codec: "MP3", bitrate: 128, country: "", countrycode: "", tags: "", language: "",
  votes: 0, clickcount: 0, hasExtendedInfo: null, homepage: "", lastcheckok: 1,
});
const page = (n: number, from = 0) => Array.from({ length: n }, (_, i) => mk(`u${from + i}`));

beforeEach(() => {
  vi.clearAllMocks();
  resetSearch();
  $toasts.set([]);
  replaceSelection($stationSelection, new Set(["u1", "u2"]));
});

describe("browser selection lifecycle", () => {
  it("clears the selection when a new search param is set", () => {
    updateSearchParam("query", "jazz");
    expect($stationSelection.get().size).toBe(0);
  });

  it("clears the selection on resetSearch", () => {
    resetSearch();
    expect($stationSelection.get().size).toBe(0);
  });

  it("keeps the selection across load-more pagination", async () => {
    await loadMore();
    expect($stationSelection.get().size).toBe(2);
  });
});

// "Is there more?" used to be the guess `results.length === limit`, which made a
// full last batch promise a page that did not exist. Now it is an observation.
describe("hasMore is asked, not guessed", () => {
  it("asks the catalogue for one record past the batch it shows", async () => {
    vi.mocked(searchStationsIpc).mockResolvedValueOnce(page(4));
    await searchStations({ limit: 3, order: "clickcount" });
    expect(searchStationsIpc).toHaveBeenCalledWith(expect.objectContaining({ limit: 4 }));
  });

  it("keeps the extra record out of the list and reads it as 'there is more'", async () => {
    vi.mocked(searchStationsIpc).mockResolvedValueOnce(page(4));
    await searchStations({ limit: 3, order: "clickcount" });
    expect($searchResults.get().map((s) => s.stationuuid)).toEqual(["u0", "u1", "u2"]);
    expect($hasMore.get()).toBe(true);
  });

  it("a full batch with no extra record means there is nothing more", async () => {
    vi.mocked(searchStationsIpc).mockResolvedValueOnce(page(3));
    await searchStations({ limit: 3, order: "clickcount" });
    expect($searchResults.get()).toHaveLength(3);
    expect($hasMore.get()).toBe(false);
  });
});

// Replacing the selection may take the list off the screen; appending to it may
// not — the cursor is standing in those rows.
describe("appending and replacing do not share a loading or error surface", () => {
  it("appending raises $appendLoading, never $searchLoading", async () => {
    vi.mocked(searchStationsIpc).mockResolvedValueOnce(page(2));
    await searchStations({ limit: 2, order: "clickcount" });

    const seen: { search: boolean; append: boolean }[] = [];
    const unsubscribe = $appendLoading.subscribe(() =>
      seen.push({ search: $searchLoading.get(), append: $appendLoading.get() }),
    );
    vi.mocked(searchStationsIpc).mockResolvedValueOnce(page(2, 2));
    await loadMore();
    unsubscribe();

    expect(seen.some((s) => s.append)).toBe(true);
    expect(seen.every((s) => !s.search)).toBe(true);
    expect($searchResults.get()).toHaveLength(4); // the first batch stayed
  });

  it("a failed append leaves the results and $searchError alone, and toasts instead", async () => {
    vi.mocked(searchStationsIpc).mockResolvedValueOnce(page(2));
    await searchStations({ limit: 2, order: "clickcount" });

    vi.mocked(searchStationsIpc).mockRejectedValueOnce(new Error("offline"));
    await expect(loadMore()).rejects.toThrow("offline");

    expect($searchResults.get()).toHaveLength(2); // nothing was taken away
    expect($searchError.get()).toBeNull(); // no error card over the results
    expect($appendLoading.get()).toBe(false);
    expect($toasts.get().map((t) => t.type)).toEqual(["error"]);
  });

  it("a failed REPLACE still goes to $searchError, as before", async () => {
    vi.mocked(searchStationsIpc).mockRejectedValueOnce(new Error("offline"));
    await searchStations({ limit: 2, order: "clickcount" });
    expect($searchError.get()).toContain("offline");
    expect($toasts.get()).toHaveLength(0);
  });
});
