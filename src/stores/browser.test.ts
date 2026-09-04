import { describe, it, expect, beforeEach, vi } from "vitest";
import type { StationResult } from "../lib/tauri";
import { searchStationsIpc } from "../lib/tauri";
import {
  $stationSelection, $searchResults, $searchLoading, $appendLoading, $searchError, $hasMore,
  $searchParams, updateSearchParam, resetSearch, loadMore, searchStations,
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

// Replacing the result set may take the list off the screen; appending to it may
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

// The position in the result set is not stored anywhere: it IS the length of the
// prefix already on screen, counted at request time. A batch that never arrived
// therefore leaves nothing to roll back — ADR 2026-09-04 «прочитаний початок і
// є курсор пагінації».
describe("the loaded prefix is the pagination cursor", () => {
  it("leaves the criteria object untouched — the very same reference", async () => {
    const before = $searchParams.get();
    await loadMore();
    expect($searchParams.get()).toBe(before);
  });

  // The bug this rewrite is about: the offset was raised BEFORE the request and
  // not put back when it failed, so the next press asked for the page AFTER the
  // one that never arrived — a silent hole in the middle of a whole-looking list.
  it("asks for the very same page again after a failed batch", async () => {
    updateSearchParam("limit", 2);
    vi.mocked(searchStationsIpc).mockResolvedValueOnce(page(2));
    await searchStations($searchParams.get());

    vi.mocked(searchStationsIpc).mockRejectedValueOnce(new Error("offline"));
    await expect(loadMore()).rejects.toThrow("offline");
    vi.mocked(searchStationsIpc).mockResolvedValueOnce(page(2, 2));
    await loadMore();

    const appends = vi.mocked(searchStationsIpc).mock.calls.slice(1);
    expect(appends.map(([params]) => params.offset)).toEqual([2, 2]);
    expect($searchResults.get().map((s) => s.stationuuid)).toEqual(["u0", "u1", "u2", "u3"]);
  });

  // A batch belongs to the criteria it flew out with. Landing into a result set
  // the person has since replaced would append stations that do not match what
  // they are reading — again silently, again looking whole.
  it("throws away a batch that lands after the criteria changed", async () => {
    updateSearchParam("limit", 2);
    vi.mocked(searchStationsIpc).mockResolvedValueOnce(page(2));
    await searchStations($searchParams.get());

    let release!: (batch: StationResult[]) => void;
    vi.mocked(searchStationsIpc).mockImplementationOnce(
      () => new Promise<StationResult[]>((resolve) => { release = resolve; }),
    );
    const inFlight = loadMore();
    updateSearchParam("query", "jazz"); // a different result set now
    release(page(3, 2)); // …so this batch, and its "there is more", are not ours
    // Rejects rather than resolves: to the trailing stop a resolve means "look at
    // the rows now", and there is nothing new to look at. See BrowserPanel.test.
    await expect(inFlight).rejects.toThrow();

    expect($searchResults.get()).toHaveLength(2);
    expect($hasMore.get()).toBe(false);
    expect($toasts.get()).toHaveLength(0); // nothing to tell: they moved on
  });

  it("does not toast a batch that FAILED after the criteria changed", async () => {
    updateSearchParam("limit", 2);
    vi.mocked(searchStationsIpc).mockResolvedValueOnce(page(2));
    await searchStations($searchParams.get());

    let reject!: (e: Error) => void;
    vi.mocked(searchStationsIpc).mockImplementationOnce(
      () => new Promise<StationResult[]>((_, no) => { reject = no; }),
    );
    const inFlight = loadMore();
    updateSearchParam("query", "jazz");
    reject(new Error("offline"));
    await expect(inFlight).rejects.toThrow("offline");

    expect($toasts.get()).toHaveLength(0); // an error about a set they left
    expect($appendLoading.get()).toBe(false);
  });
});
