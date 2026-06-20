import { atom, computed } from "nanostores";
import type { StationResult, SearchParams, BrowserFilters, StreamInfo } from "../lib/tauri";
import { searchStationsIpc, getBrowserFilters, addStationFromBrowser, addStationsFromBrowser } from "../lib/tauri";
import { replaceSelection } from "./selection";
import { addToast } from "./toasts";
import * as m from "../i18n/paraglide/messages";

// --- State ---

export const $searchResults = atom<StationResult[]>([]);
export const $searchLoading = atom<boolean>(false);
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

export async function searchStations(params: SearchParams): Promise<void> {
  $searchLoading.set(true);
  $searchError.set(null);
  try {
    const results = await searchStationsIpc(params);
    if (params.offset && params.offset > 0) {
      $searchResults.set([...$searchResults.get(), ...results]);
    } else {
      $searchResults.set(results);
    }
    $hasMore.set(results.length === (params.limit ?? 50));
  } catch (e) {
    $searchError.set(String(e));
  } finally {
    $searchLoading.set(false);
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

export async function addStation(station: StationResult): Promise<void> {
  await addStationFromBrowser(station);
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
