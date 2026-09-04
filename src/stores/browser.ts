import { atom, computed } from "nanostores";
import type { StationResult, SearchParams, BrowserFilters, StreamInfo } from "../lib/tauri";
import { searchStationsIpc, getBrowserFilters, addStationFromBrowser, addStationsFromBrowser } from "../lib/tauri";
import { replaceSelection } from "./selection";
import { addToast } from "./toasts";
import * as m from "../i18n/paraglide/messages";

// --- State ---

export const $searchResults = atom<StationResult[]>([]);
/**
 * A NEW result set is being fetched — the list on screen is about to be replaced,
 * so the screen shows a loading card INSTEAD of it. Appending has its own flag
 * ($appendLoading) precisely because it must not do that: taking the <ul> away
 * mid-append drops the cursor to <body> and the results zone with it.
 */
export const $searchLoading = atom<boolean>(false);
/** A further batch is in flight. The list stays on screen; only the button is busy. */
export const $appendLoading = atom<boolean>(false);
/**
 * A NEW result set failed. Appending never sets this: an error card here would
 * take away the 50 results already on screen — a failed extra batch is reported
 * as a toast instead (loadMore below).
 */
export const $searchError = atom<string | null>(null);
/**
 * What the result set IS — query, filters, order, batch size. Where reading of it
 * has got to is deliberately not here: that position is the length of the prefix
 * already on screen ($searchResults), counted at request time, so it cannot drift
 * away from what the person sees. ADR 2026-09-04 «прочитаний початок і є курсор
 * пагінації»; vocabulary — CONTEXT.md §«Пошук станцій».
 */
export type SearchCriteria = Omit<SearchParams, "offset">;
export const $searchParams = atom<SearchCriteria>({
  limit: 50,
  order: "clickcount",
});
export const $browserFilters = atom<BrowserFilters | null>(null);
export const $hasMore = atom<boolean>(false);
export const $popularStations = atom<StationResult[]>([]);
export const $popularLoading = atom<boolean>(false);
export const $popularError = atom<string | null>(null);

export const $isSearchActive = computed($searchParams, (params) =>
  Boolean(params.query || params.country || params.language || params.codec || params.minBitrate)
);

/** Multi-select for browser results (milestone D). Keyed by stationuuid. */
export const $stationSelection = atom<Set<string>>(new Set());

// --- Actions ---

/**
 * One request for a batch of the result set — shared by the two events that ask
 * for one, replacing and appending. Asks the catalogue for one MORE record than it
 * will show: whether that extra record came back IS the answer
 * to "is there more", instead of the guess "a full batch probably means more"
 * (which produced an empty final page). The +1 lives strictly here — `limit` in
 * SearchCriteria means "how many to show".
 */
async function fetchBatch(
  criteria: SearchCriteria,
  offset: number,
): Promise<{ results: StationResult[]; hasMore: boolean }> {
  const limit = criteria.limit ?? 50;
  const batch = await searchStationsIpc({ ...criteria, offset, limit: limit + 1 });
  return { results: batch.slice(0, limit), hasMore: batch.length > limit };
}

/**
 * REPLACE the result set: a new query, filter or order. May take the list off the
 * screen (loading card, error card) precisely because the rows on it no longer
 * mean anything. Never rejects — the failure is already on screen as $searchError.
 */
export async function searchStations(criteria: SearchCriteria): Promise<void> {
  $searchLoading.set(true);
  $searchError.set(null);
  try {
    const { results, hasMore } = await fetchBatch(criteria, 0);
    $searchResults.set(results);
    $hasMore.set(hasMore);
  } catch (e) {
    $searchError.set(String(e));
  } finally {
    $searchLoading.set(false);
  }
}

/**
 * Rejection value for a batch that landed into criteria nobody is reading any more.
 * It never reaches a person: the trailing stop reads ANY rejection as "nothing was
 * appended, leave the rows and the cursor alone", which is exactly what a foreign
 * batch deserves — resolving would make it read the press as a successful EMPTY
 * append and say "there is nothing more" about a result set that has plenty.
 */
class ForeignBatch extends Error {
  constructor() {
    super("batch landed into criteria that have since changed");
  }
}

/**
 * APPEND the next batch of the SAME result set. Must not take the list away — the
 * cursor is standing in those rows — so a failure is a toast, and the state is
 * left exactly as it was: the next press asks for the very same page again.
 * Rejects so the caller (the trailing stop) can keep focus on the button it pressed.
 */
export async function loadMore(): Promise<void> {
  const criteria = $searchParams.get();
  const offset = $searchResults.get().length;
  // The batch belongs to the criteria it flew out with. If they changed while it
  // was in the air — landed or failed — it is about a result set nobody is looking
  // at, and there is nothing to tell someone already reading another one.
  const stillOurs = () => $searchParams.get() === criteria;
  $appendLoading.set(true);
  try {
    const { results, hasMore } = await fetchBatch(criteria, offset);
    if (!stillOurs()) throw new ForeignBatch();
    $searchResults.set([...$searchResults.get(), ...results]);
    $hasMore.set(hasMore);
  } catch (e) {
    if (stillOurs()) addToast(String(e), "error");
    throw e;
  } finally {
    $appendLoading.set(false);
  }
}

export async function loadFilters(): Promise<void> {
  try {
    const filters = await getBrowserFilters();
    $browserFilters.set(filters);
  } catch (e) {
    console.error("Failed to load browser filters:", e);
    addToast(m.browser_filters_load_error(), "error");
  }
}

export async function loadPopularStations(): Promise<void> {
  $popularLoading.set(true);
  $popularError.set(null);
  try {
    const results = await searchStationsIpc({ limit: 50, order: "clickcount" });
    $popularStations.set(results);
  } catch (e) {
    $popularError.set(String(e));
  } finally {
    $popularLoading.set(false);
  }
}

/** Returns the stream as it landed in the profile — the caller needs its codec
 *  verdict to say, in the same breath, that Tapir will not record it. */
export async function addStation(station: StationResult): Promise<StreamInfo> {
  return addStationFromBrowser(station);
}

/** Bulk add: backend appends in one save+emit (streams-changed reloads $streams). */
export async function addStations(stations: StationResult[]): Promise<StreamInfo[]> {
  return addStationsFromBrowser(stations);
}

export function updateSearchParam<K extends keyof SearchCriteria>(
  key: K,
  value: SearchCriteria[K],
): void {
  $searchParams.set({ ...$searchParams.get(), [key]: value });
  replaceSelection($stationSelection, new Set()); // new result set → drop selection
}

export function resetSearch(): void {
  $searchParams.set({ limit: 50, order: "clickcount" });
  $searchResults.set([]);
  $hasMore.set(false);
  $searchError.set(null);
  replaceSelection($stationSelection, new Set());
}
