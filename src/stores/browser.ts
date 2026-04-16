import { atom, computed } from "nanostores";
import type { StationResult, SearchParams, BrowserFilters } from "../lib/tauri";
import { searchStationsIpc, getBrowserFilters, addStationFromBrowser } from "../lib/tauri";

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

export function updateSearchParam<K extends keyof SearchParams>(
  key: K,
  value: SearchParams[K],
): void {
  $searchParams.set({ ...$searchParams.get(), [key]: value, offset: 0 });
}

export function resetSearch(): void {
  $searchParams.set({ limit: 50, order: "clickcount" });
  $searchResults.set([]);
  $hasMore.set(false);
  $searchError.set(null);
}
