import { useEffect } from "react";
import { useStore } from "@nanostores/react";
import { SearchForm } from "./SearchForm";
import { StationTable } from "./StationTable";
import {
  $searchResults,
  $searchLoading,
  $searchError,
  $popularStations,
  $popularLoading,
  $popularError,
  $hasMore,
  $isSearchActive,
  loadFilters,
  loadPopularStations,
  loadMore,
} from "../../stores/browser";
import * as m from "../../i18n/paraglide/messages";

export function BrowserPanel() {
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

  return (
    <div role="region" aria-label={m.browser_section()} className="flex flex-1 flex-col overflow-hidden">
      <SearchForm />
      {isSearchActive && (searchResults.length > 0 || searchLoading || searchError) ? (
        <StationTable
          stations={searchResults}
          loading={searchLoading}
          error={searchError}
          hasMore={hasMore}
          onLoadMore={loadMore}
          emptyMessage={m.browser_no_results()}
        />
      ) : (
        <>
          <h2 className="px-4 py-2 text-sm font-medium text-slate-300">{m.browser_popular_title()}</h2>
          <StationTable
            stations={popularStations}
            loading={popularLoading}
            error={popularError}
            hasMore={false}
            emptyMessage={m.browser_empty()}
          />
        </>
      )}
    </div>
  );
}
