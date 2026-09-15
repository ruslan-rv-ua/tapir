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
    $searchParams.set({ limit: 3, order: "clickcount" });
    await searchStations();
    expect(searchStationsIpc).toHaveBeenCalledWith(expect.objectContaining({ limit: 4 }));
  });

  it("keeps the extra record out of the list and reads it as 'there is more'", async () => {
    vi.mocked(searchStationsIpc).mockResolvedValueOnce(page(4));
    $searchParams.set({ limit: 3, order: "clickcount" });
    await searchStations();
    expect($searchResults.get().map((s) => s.stationuuid)).toEqual(["u0", "u1", "u2"]);
    expect($hasMore.get()).toBe(true);
  });

  it("a full batch with no extra record means there is nothing more", async () => {
    vi.mocked(searchStationsIpc).mockResolvedValueOnce(page(3));
    $searchParams.set({ limit: 3, order: "clickcount" });
    await searchStations();
    expect($searchResults.get()).toHaveLength(3);
    expect($hasMore.get()).toBe(false);
  });
});

// Replacing the result set may take the list off the screen; appending to it may
// not — the cursor is standing in those rows.
describe("appending and replacing do not share a loading or error surface", () => {
  it("appending raises $appendLoading, never $searchLoading", async () => {
    vi.mocked(searchStationsIpc).mockResolvedValueOnce(page(2));
    $searchParams.set({ limit: 2, order: "clickcount" });
    await searchStations();

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
    $searchParams.set({ limit: 2, order: "clickcount" });
    await searchStations();

    vi.mocked(searchStationsIpc).mockRejectedValueOnce(new Error("offline"));
    await expect(loadMore()).rejects.toThrow("offline");

    expect($searchResults.get()).toHaveLength(2); // nothing was taken away
    expect($searchError.get()).toBeNull(); // no error card over the results
    expect($appendLoading.get()).toBe(false);
    expect($toasts.get().map((t) => t.type)).toEqual(["error"]);
  });

  it("a failed REPLACE still goes to $searchError, as before", async () => {
    vi.mocked(searchStationsIpc).mockRejectedValueOnce(new Error("offline"));
    $searchParams.set({ limit: 2, order: "clickcount" });
    await searchStations();
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
    await searchStations();

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
    await searchStations();

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
    await searchStations();

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

// The second half of «стан розійшовся з екраном»: two REPLACEs can be in the air at
// once (a filter fires at once, the text query after a debounce, and the catalogue
// rotates mirrors on a timeout — so the older one really can land last). The reply
// carries the same ticket the append already carries; what is new is that a foreign
// one touches NOTHING, the loading flag included. ADR 2026-09-15 «прапорець заміни
// належить екрану, а не запиту».
describe("a foreign reply to a REPLACE touches nothing", () => {
  const held = () => {
    let settle!: { ok: (b: StationResult[]) => void; no: (e: Error) => void };
    vi.mocked(searchStationsIpc).mockImplementationOnce(
      () => new Promise<StationResult[]>((ok, no) => { settle = { ok, no }; }),
    );
    return () => settle;
  };

  it("the late reply puts neither rows, nor hasMore, nor an error on screen", async () => {
    $searchParams.set({ limit: 2, order: "clickcount" });
    const a = held();
    const inFlightA = searchStations();

    updateSearchParam("query", "jazz"); // a different result set now
    vi.mocked(searchStationsIpc).mockResolvedValueOnce(page(2, 10));
    await searchStations(); // …and its answer is already on screen

    a().ok(page(3)); // so this one, and its "there is more", are not ours
    await inFlightA;

    expect($searchResults.get().map((s) => s.stationuuid)).toEqual(["u10", "u11"]);
    expect($hasMore.get()).toBe(false);
    expect($searchError.get()).toBeNull();
    expect($searchLoading.get()).toBe(false);
  });

  // The blink this record is named after: the abandoned reply used to reach its
  // `finally` and clear the flag while the fresh request was still on the wire.
  it("keeps the loading card up while the fresh request is still on the wire", async () => {
    $searchParams.set({ limit: 2, order: "clickcount" });
    const a = held();
    const inFlightA = searchStations();

    const seen: boolean[] = [];
    const unsubscribe = $searchLoading.subscribe((v) => seen.push(v));

    updateSearchParam("query", "jazz");
    const b = held();
    const inFlightB = searchStations();

    a().ok(page(3)); // the abandoned one lands FIRST
    await inFlightA;
    expect($searchLoading.get()).toBe(true); // …and the card stays put

    b().ok(page(2, 10));
    await inFlightB;
    unsubscribe();

    expect(seen[0]).toBe(true); // it was raised at all — nothing else pins that
    expect(seen.filter((v) => !v)).toHaveLength(1); // and lowered exactly once
  });

  // $searchError is cleared at request START, so without the ticket an older
  // failure lands on top of a newer success and nothing ever clears it again.
  it("the late FAILURE puts no error card over a good result set", async () => {
    $searchParams.set({ limit: 2, order: "clickcount" });
    const a = held();
    const inFlightA = searchStations();

    updateSearchParam("query", "jazz");
    vi.mocked(searchStationsIpc).mockResolvedValueOnce(page(2, 10));
    await searchStations();

    a().no(new Error("offline"));
    await inFlightA;

    expect($searchError.get()).toBeNull();
    expect($searchResults.get()).toHaveLength(2);
    expect($toasts.get()).toHaveLength(0); // an error about a set they left
  });

  // Who has the RIGHT to lower the flag. Every other criteria write is followed by
  // a request that will lower it; «Скинути фільтри» is the one that is not, so it
  // has to say so itself — otherwise the abandoned reply leaves the flag up for good.
  it("resetSearch says «nothing is coming», and the late reply leaves that alone", async () => {
    $searchParams.set({ limit: 2, order: "clickcount" });
    const a = held();
    const inFlightA = searchStations();
    expect($searchLoading.get()).toBe(true);

    resetSearch(); // no request behind this one
    expect($searchLoading.get()).toBe(false);

    a().ok(page(3));
    await inFlightA;

    expect($searchLoading.get()).toBe(false);
    expect($searchResults.get()).toHaveLength(0);
  });
});
