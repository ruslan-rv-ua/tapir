import { atom, computed } from "nanostores";
import type { StationResult, SearchParams, BrowserFilters, StreamInfo } from "../lib/tauri";
import { searchStationsIpc, getBrowserFilters, addStationFromBrowser, addStationsFromBrowser } from "../lib/tauri";
import { replaceSelection } from "./selection";
import { addToast } from "./toasts";
import * as m from "../i18n/paraglide/messages";

// --- State ---

export const $searchResults = atom<StationResult[]>([]);
/**
 * A NEW selection is being fetched — the list on screen is about to be replaced,
 * so the screen shows a loading card INSTEAD of it. Appending has its own flag
 * ($appendLoading) precisely because it must not do that: taking the <ul> away
 * mid-append drops the cursor to <body> and the results zone with it.
 */
export const $searchLoading = atom<boolean>(false);
/** A further batch is in flight. The list stays on screen; only the button is busy. */
export const $appendLoading = atom<boolean>(false);
/**
 * A NEW selection failed. Appending never sets this: an error card here would
 * take away the 50 results already on screen — a failed extra batch is reported
 * as a toast instead (searchStations below).
 */
export const $searchError = atom<string | null>(null);
export const $searchParams = atom<SearchParams>({
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
 * True when these params ask for MORE of the selection already on screen
 * ("Load more"), false when they define a new one. `offset` is the only thing
 * that says so: every filter change resets it to 0 (updateSearchParam), and
 * loadMore is the only path that raises it. Callers that must tell "appended"
 * from "replaced" apart — the results cursor, among them — ask here rather than
 * re-reading the field and re-deriving the rule.
 */
export function isAppendingResults(params: SearchParams): boolean {
  return (params.offset ?? 0) > 0;
}

/**
 * Fetch a batch. Two different events share this function and must not share
 * their loading/error surfaces: REPLACING the selection may take the list away,
 * APPENDING to it may not. `isAppendingResults` is the one place that tells them
 * apart. Rejects only on an append failure — the caller (the trailing stop) uses
 * that to keep focus on the button it pressed.
 */
export async function searchStations(params: SearchParams): Promise<void> {
  const appending = isAppendingResults(params);
  const limit = params.limit ?? 50;
  if (appending) {
    $appendLoading.set(true);
  } else {
    $searchLoading.set(true);
    $searchError.set(null);
  }
  try {
    // Ask the catalogue for one MORE than we will show: whether that extra
    // record came back IS the answer to "is there more", instead of the guess
    // "a full batch probably means more" (which produced an empty final page).
    // The +1 lives strictly here — `limit` in SearchParams means "how many to
    // show", and loadMore's offset still steps by exactly `limit`.
    const batch = await searchStationsIpc({ ...params, limit: limit + 1 });
    const results = batch.slice(0, limit);
    if (appending) {
      $searchResults.set([...$searchResults.get(), ...results]);
    } else {
      $searchResults.set(results);
    }
    $hasMore.set(batch.length > limit);
  } catch (e) {
    if (appending) {
      addToast(String(e), "error");
      throw e;
    }
    $searchError.set(String(e));
  } finally {
    if (appending) $appendLoading.set(false);
    else $searchLoading.set(false);
  }
}

export async function loadMore(): Promise<void> {
  const params = $searchParams.get();
  const newParams = {
    ...params,
    offset: (params.offset ?? 0) + (params.limit ?? 50),
  };
  $searchParams.set(newParams);
  await searchStations(newParams);
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

export function updateSearchParam<K extends keyof SearchParams>(
  key: K,
  value: SearchParams[K],
): void {
  $searchParams.set({ ...$searchParams.get(), [key]: value, offset: 0 });
  replaceSelection($stationSelection, new Set()); // new result set → drop selection
}

export function resetSearch(): void {
  $searchParams.set({ limit: 50, order: "clickcount" });
  $searchResults.set([]);
  $hasMore.set(false);
  $searchError.set(null);
  replaceSelection($stationSelection, new Set());
}
