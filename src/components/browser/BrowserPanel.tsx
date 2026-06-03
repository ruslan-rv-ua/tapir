import { useEffect, useRef, useCallback } from "react";
import { useStore } from "@nanostores/react";
import { SearchForm } from "./SearchForm";
import { StationList } from "./StationList";
import { ScreenHeader } from "../layout/ScreenHeader";
import {
  $searchResults, $searchLoading, $searchError,
  $popularStations, $popularLoading, $popularError,
  $hasMore, $isSearchActive,
  loadFilters, loadPopularStations, loadMore,
} from "../../stores/browser";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

export function BrowserPanel({ onZonesChange, exitZone }: Props) {
  const searchResults = useStore($searchResults);
  const searchLoading = useStore($searchLoading);
  const searchError = useStore($searchError);
  const popularStations = useStore($popularStations);
  const popularLoading = useStore($popularLoading);
  const popularError = useStore($popularError);
  const hasMore = useStore($hasMore);
  const isSearchActive = useStore($isSearchActive);

  useEffect(() => {
    loadFilters();
    loadPopularStations();
  }, []);

  // Both zones are forwardRef ZoneEntry providers (SearchForm owns its own
  // Tab-exit boundary; StationList owns its composite-list roving focus).
  // They register here via stable callback refs.
  const searchZoneRef = useRef<ZoneEntry | null>(null);
  const resultsListRef = useRef<ZoneEntry | null>(null);

  const searchCallbackRef = useCallback((zone: ZoneEntry | null) => {
    searchZoneRef.current = zone;
  }, []);
  const resultsCallbackRef = useCallback((zone: ZoneEntry | null) => {
    resultsListRef.current = zone;
  }, []);

  const showSearchResults = isSearchActive && (searchResults.length > 0 || searchLoading || !!searchError);
  const stations = showSearchResults ? searchResults : popularStations;
  const loading = showSearchResults ? searchLoading : popularLoading;
  const error = showSearchResults ? searchError : popularError;
  const emptyMessage = showSearchResults ? m.browser_no_results() : m.browser_empty();

  // Re-register zones whenever the results content changes (both callback refs
  // have already fired during the preceding commit). onZonesChange is stable.
  useEffect(() => {
    const zones: ZoneEntry[] = [];
    if (searchZoneRef.current) zones.push(searchZoneRef.current);
    if (resultsListRef.current) zones.push(resultsListRef.current);
    onZonesChange(zones);
  }, [onZonesChange, showSearchResults, stations.length]);

  return (
    <div role="region" aria-label={m.browser_section()} className="flex flex-1 flex-col overflow-hidden">
      <ScreenHeader title={m.browser_section()} />
      <SearchForm
        ref={searchCallbackRef}
        exitZone={(forward) => exitZone("browser-search", forward)}
      />
      {!showSearchResults && (
        <h2 className="px-4 py-2 text-sm font-medium text-slate-300">{m.browser_popular_title()}</h2>
      )}
      <StationList
        ref={resultsCallbackRef}
        stations={stations}
        loading={loading}
        error={error}
        hasMore={showSearchResults ? hasMore : false}
        onLoadMore={showSearchResults ? loadMore : undefined}
        emptyMessage={emptyMessage}
        exitZone={(forward) => exitZone("browser-results", forward)}
      />
    </div>
  );
}
