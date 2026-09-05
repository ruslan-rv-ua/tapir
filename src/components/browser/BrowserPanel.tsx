import { useEffect, useRef, useCallback, useMemo } from "react";
import { useStore } from "@nanostores/react";
import { SearchForm } from "./SearchForm";
import { StationList, type StationListHandle } from "./StationList";
import { ScreenHeader } from "../layout/ScreenHeader";
import { ScreenZone } from "../layout/ScreenZone";
import { SelectionToolbar } from "../common/SelectionToolbar";
import { ListCard } from "../common/ListCard";
import {
  $searchResults, $searchLoading, $appendLoading, $searchError,
  $popularStations, $popularLoading, $popularError,
  $hasMore, $isSearchActive, $stationSelection, $searchParams,
  loadFilters, loadPopularStations, loadMore,
} from "../../stores/browser";
import { replaceSelection } from "../../stores/selection";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { useAnnounce } from "../../hooks/useAnnounce";
import type { ZoneEntry, ZoneId } from "../../hooks/useZoneNavigation";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: ZoneId, forward: boolean) => void;
}

export function BrowserPanel({ onZonesChange, exitZone }: Props) {
  const searchResults = useStore($searchResults);
  const searchLoading = useStore($searchLoading);
  const appendLoading = useStore($appendLoading);
  const searchError = useStore($searchError);
  const popularStations = useStore($popularStations);
  const popularLoading = useStore($popularLoading);
  const popularError = useStore($popularError);
  const hasMore = useStore($hasMore);
  const isSearchActive = useStore($isSearchActive);

  const announce = useAnnounce();
  const selection = useStore($stationSelection);
  const selCount = selection.size;

  useEffect(() => {
    loadFilters();
    loadPopularStations();
  }, []);

  // Both zones are forwardRef ZoneEntry providers (SearchForm owns its own
  // Tab-exit boundary; StationList owns its composite-list roving focus).
  // They register here via stable callback refs.
  const searchZoneRef = useRef<ZoneEntry | null>(null);
  const resultsListRef = useRef<StationListHandle | null>(null);

  const searchCallbackRef = useCallback((zone: ZoneEntry | null) => {
    searchZoneRef.current = zone;
  }, []);
  const resultsCallbackRef = useCallback((zone: StationListHandle | null) => {
    resultsListRef.current = zone;
  }, []);

  // Stable proxy for the results list zone. StationList's CompositeList drops its
  // <ul> (and recreates its ZoneEntry) while loading/empty and on each new result
  // set; the registration effect only re-runs on showSearchResults/stations.length,
  // so without the proxy a same-count refresh could leave App holding a stale
  // ZoneEntry whose focus() no-ops and F6 stalls. The proxy is created once and
  // always delegates to the CURRENT handle (the pattern App.tsx uses for permanent
  // zones).
  const resultsProxyRef = useRef<ZoneEntry>({
    id: "browser-results",
    focus: (dir) => resultsListRef.current?.focus(dir),
  });

  const showSearchResults = isSearchActive && (searchResults.length > 0 || searchLoading || !!searchError);
  const stations = showSearchResults ? searchResults : popularStations;
  const loading = showSearchResults ? searchLoading : popularLoading;
  const error = showSearchResults ? searchError : popularError;
  const emptyMessage = showSearchResults ? m.browser_no_results() : m.browser_empty();

  const visibleIds = useMemo(() => stations.map((s) => s.stationuuid), [stations]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));

  // Selection toolbar roving zone (two stops)
  const selectAllBtn = useRef<HTMLButtonElement | null>(null);
  const addSelectedBtn = useRef<HTMLButtonElement | null>(null);
  const selectionRefs = useMemo(() => [selectAllBtn, addSelectedBtn], []);
  const {
    onKeyDown: selKeyDown,
    getTabIndex: selTabIndex,
    restoreFocus: selRestore,
  } = useRovingFocus(selectionRefs, "horizontal", {
    mode: "mixed-boundary-handoff",
    onTabBoundary: (forward) => exitZone("browser-selection", forward),
  });

  const handleSelectAll = () => {
    if (visibleIds.length === 0) return;
    const next = new Set(selection);
    if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    replaceSelection($stationSelection, next);
    announce(next.size === 0 ? m.selection_cleared() : m.selection_count({ count: next.size }), "polite");
  };

  // Clear on unmount (new-search/reset already clear via the store from Task 31).
  // Browser has no filter bar → unmount-clear only (no filter-change effect).
  useEffect(() => () => { replaceSelection($stationSelection, new Set()); }, []);

  // A changed query or filter REPLACES the result set, and the remembered row no
  // longer means anything — why that is the right rule is on resetCursor in
  // useCompositeList. Every change of the criteria is such a case: "Load more"
  // appends to the SAME result set and writes nothing here, so it never wakes
  // this listener. Focus is not moved: the user keeps typing.
  //
  // Subscribed imperatively instead of with useStore: the query changes on every
  // keystroke, and re-rendering the whole results list per character is a price
  // this cursor rule has no reason to charge.
  useEffect(
    () => $searchParams.listen(() => resultsListRef.current?.resetCursor()),
    [],
  );

  // Zone registration: selection zone FIRST, then search, then results.
  // Re-register whenever the results content changes (both callback refs
  // have already fired during the preceding commit). onZonesChange is stable.
  useEffect(() => {
    const zones: ZoneEntry[] = [{
      id: "browser-selection",
      focus: selRestore,
    }];
    if (searchZoneRef.current) zones.push(searchZoneRef.current);
    if (resultsListRef.current) zones.push(resultsProxyRef.current);
    onZonesChange(zones);
  }, [onZonesChange, showSearchResults, stations.length, selRestore]);

  return (
    <div role="region" aria-label={m.browser_section()} className="flex flex-1 flex-col overflow-hidden">
      {/* browser-selection zone: header title + selection toolbar (two roving stops) */}
      <ScreenZone
        id="browser-selection"
        role="application"
        label={m.zone_browser_selection()}
        onKeyDown={selKeyDown}
      >
        <ScreenHeader title={m.browser_section()}>
          <SelectionToolbar
            selCount={selCount}
            visibleCount={visibleIds.length}
            allVisibleSelected={allVisibleSelected}
            selectAllRef={selectAllBtn}
            actionRef={addSelectedBtn}
            selectAllTabIndex={selTabIndex(0)}
            actionTabIndex={selTabIndex(1)}
            actionLabel={m.add_selected({ count: selCount })}
            onSelectAll={handleSelectAll}
            onAction={() => resultsListRef.current?.requestBulkAdd()}
          />
        </ScreenHeader>
      </ScreenZone>
      <SearchForm
        ref={searchCallbackRef}
        exitZone={(forward) => exitZone("browser-search", forward)}
      />
      {!showSearchResults && (
        <h2 className="px-4 py-2 text-sm font-medium text-slate-300">{m.browser_popular_title()}</h2>
      )}
      <ListCard>
        <StationList
          ref={resultsCallbackRef}
          stations={stations}
          mode={showSearchResults ? "search" : "popular"}
          loading={loading}
          error={error}
          hasMore={hasMore}
          loadingMore={appendLoading}
          onLoadMore={loadMore}
          emptyMessage={emptyMessage}
          exitZone={(forward) => exitZone("browser-results", forward)}
        />
      </ListCard>
    </div>
  );
}
