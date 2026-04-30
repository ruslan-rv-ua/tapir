import { useEffect, useRef, useCallback } from "react";
import { useStore } from "@nanostores/react";
import { SearchForm } from "./SearchForm";
import { StationList } from "./StationList";
import {
  $searchResults, $searchLoading, $searchError,
  $popularStations, $popularLoading, $popularError,
  $hasMore, $isSearchActive,
  loadFilters, loadPopularStations, loadMore,
} from "../../stores/browser";
import { useFocusBoundary } from "../../hooks/useFocusBoundary";
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

  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const { refreshBoundary: _refreshBoundary, restoreFocus: searchRestoreFocus } = useFocusBoundary(
    searchContainerRef,
    (forward) => exitZone("browser-search", forward),
  );

  const resultsListRef = useRef<ZoneEntry | null>(null);

  const searchZone: ZoneEntry = {
    id: "browser-search",
    get el() { return searchContainerRef.current!; },
    focus: searchRestoreFocus,
  };

  const resultsCallbackRef = useCallback((zone: ZoneEntry | null) => {
    resultsListRef.current = zone;
  }, []);

  useEffect(() => {
    const zones: ZoneEntry[] = [searchZone];
    if (resultsListRef.current) zones.push(resultsListRef.current);
    onZonesChange(zones);
    // onZonesChange intentionally omitted — callers must pass a stable (useCallback-wrapped) reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRestoreFocus]);

  const showSearchResults = isSearchActive && (searchResults.length > 0 || searchLoading || !!searchError);
  const stations = showSearchResults ? searchResults : popularStations;
  const loading = showSearchResults ? searchLoading : popularLoading;
  const error = showSearchResults ? searchError : popularError;
  const emptyMessage = showSearchResults ? m.browser_no_results() : m.browser_empty();

  return (
    <div role="region" aria-label={m.browser_section()} className="flex flex-1 flex-col overflow-hidden">
      <SearchForm
        containerRef={searchContainerRef}
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
