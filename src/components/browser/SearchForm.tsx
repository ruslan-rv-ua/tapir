import { useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from "react";
import { useStore } from "@nanostores/react";
import { SearchField, Input, Button, Label, Select, SelectValue, Popover, ListBox, ListBoxItem, NumberField, Group } from "react-aria-components";
import {
  $searchParams,
  $browserFilters,
  $isSearchActive,
  searchStations,
  updateSearchParam,
  resetSearch,
} from "../../stores/browser";
import type { SearchCriteria } from "../../stores/browser";
import { useFocusBoundary } from "../../hooks/useFocusBoundary";
import { focusOrSelect } from "../../lib/focusOrSelect";
import { ScreenZone } from "../layout/ScreenZone";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as m from "../../i18n/paraglide/messages";

interface SearchFormProps {
  exitZone: (forward: boolean) => void;
}

export const SearchForm = forwardRef<ZoneEntry, SearchFormProps>(function SearchForm({ exitZone }, ref) {
  const params = useStore($searchParams);
  const filters = useStore($browserFilters);
  const isActive = useStore($isSearchActive);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Single source of truth for this zone's Tab-exit boundary. The filter fields
  // render asynchronously (after $browserFilters loads), so the boundary's
  // first/last elements change — refreshBoundary() re-discovers them.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { refreshBoundary, restoreFocus } = useFocusBoundary(containerRef, exitZone);

  useEffect(() => { refreshBoundary(); }, [filters, isActive, refreshBoundary]);

  // Ctrl+F target: the input itself, not the zone.
  const focusSearch = useCallback(() => focusOrSelect(searchInputRef.current), []);

  useImperativeHandle(ref, () => ({
    id: "browser-search",
    get el() { return containerRef.current!; },
    focus: restoreFocus,
    focusSearch,
  }), [restoreFocus, focusSearch]);

  // Debounced text search
  const handleQueryChange = useCallback((value: string) => {
    updateSearchParam("query", value || undefined);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const current = $searchParams.get();
      searchStations(current);
    }, 500);
  }, []);

  // Immediate search on filter change
  const handleFilterChange = useCallback(<K extends keyof SearchCriteria>(key: K, value: string) => {
    updateSearchParam(key, (value || undefined) as SearchCriteria[K]);
    clearTimeout(debounceRef.current);
    setTimeout(() => searchStations($searchParams.get()), 0);
  }, []);

  // Debounced bitrate change
  const handleBitrateChange = useCallback((value: number) => {
    updateSearchParam("minBitrate", value > 0 ? value : undefined);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchStations($searchParams.get());
    }, 500);
  }, []);

  // SearchField clear (Escape / clear button) only clears the text query —
  // dropdown filters and bitrate are left intact. Full reset is the dedicated button.
  const handleClear = useCallback(() => {
    clearTimeout(debounceRef.current);
    updateSearchParam("query", undefined);
    setTimeout(() => searchStations($searchParams.get()), 0);
  }, []);

  // Dedicated "Reset filters" button: clears every filter and returns to Popular.
  // The button unmounts once isActive flips false, so move focus to the search
  // input to avoid focus loss (matters for screen readers).
  const handleReset = useCallback(() => {
    clearTimeout(debounceRef.current);
    resetSearch();
    searchInputRef.current?.focus();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  return (
    <ScreenZone ref={containerRef} id="browser-search" role="search" label={m.zone_browser_search()} className="flex flex-wrap items-end gap-3 px-4 py-3">
      <SearchField
        aria-label={m.browser_search_placeholder()}
        value={params.query ?? ""}
        onChange={handleQueryChange}
        onClear={handleClear}
        autoFocus
        className="flex-1 min-w-48"
      >
        <Input
          ref={searchInputRef}
          placeholder={m.browser_search_placeholder()}
          className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText] forced-colors:focus:border-[Highlight]"
        />
      </SearchField>

      {filters && (
        <>
          <Select
            aria-label={m.browser_filter_country()}
            selectedKey={params.country ?? ""}
            onSelectionChange={(key) => handleFilterChange("country", String(key))}
          >
            <Label className="text-xs text-slate-400">{m.browser_filter_country()}</Label>
            <Button className="mt-1 flex w-40 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]">
              <SelectValue />
            </Button>
            <Popover className="w-60 rounded border border-slate-600 bg-slate-800 shadow-lg forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
              <ListBox className="max-h-60 overflow-y-auto p-1">
                <ListBoxItem id="" className="cursor-pointer rounded px-2 py-1.5 text-sm text-slate-300 outline-none hover:bg-slate-700 focus:bg-slate-700 forced-colors:text-[CanvasText] forced-colors:focus:bg-[Highlight] forced-colors:focus:text-[HighlightText]">
                  {m.browser_all_countries()}
                </ListBoxItem>
                {filters.countries.map((c) => (
                  <ListBoxItem key={c.name} id={c.name} className="cursor-pointer rounded px-2 py-1.5 text-sm text-slate-300 outline-none hover:bg-slate-700 focus:bg-slate-700 forced-colors:text-[CanvasText] forced-colors:focus:bg-[Highlight] forced-colors:focus:text-[HighlightText]">
                    {c.name} ({c.stationcount})
                  </ListBoxItem>
                ))}
              </ListBox>
            </Popover>
          </Select>

          <Select
            aria-label={m.browser_filter_language()}
            selectedKey={params.language ?? ""}
            onSelectionChange={(key) => handleFilterChange("language", String(key))}
          >
            <Label className="text-xs text-slate-400">{m.browser_filter_language()}</Label>
            <Button className="mt-1 flex w-40 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]">
              <SelectValue />
            </Button>
            <Popover className="w-60 rounded border border-slate-600 bg-slate-800 shadow-lg forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
              <ListBox className="max-h-60 overflow-y-auto p-1">
                <ListBoxItem id="" className="cursor-pointer rounded px-2 py-1.5 text-sm text-slate-300 outline-none hover:bg-slate-700 focus:bg-slate-700 forced-colors:text-[CanvasText] forced-colors:focus:bg-[Highlight] forced-colors:focus:text-[HighlightText]">
                  {m.browser_all_languages()}
                </ListBoxItem>
                {filters.languages.map((l) => (
                  <ListBoxItem key={l.name} id={l.name} className="cursor-pointer rounded px-2 py-1.5 text-sm text-slate-300 outline-none hover:bg-slate-700 focus:bg-slate-700 forced-colors:text-[CanvasText] forced-colors:focus:bg-[Highlight] forced-colors:focus:text-[HighlightText]">
                    {l.name} ({l.stationcount})
                  </ListBoxItem>
                ))}
              </ListBox>
            </Popover>
          </Select>

          <Select
            aria-label={m.browser_filter_codec()}
            selectedKey={params.codec ?? ""}
            onSelectionChange={(key) => handleFilterChange("codec", String(key))}
          >
            <Label className="text-xs text-slate-400">{m.browser_filter_codec()}</Label>
            <Button className="mt-1 flex w-32 items-center justify-between rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]">
              <SelectValue />
            </Button>
            <Popover className="w-48 rounded border border-slate-600 bg-slate-800 shadow-lg forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
              <ListBox className="max-h-60 overflow-y-auto p-1">
                <ListBoxItem id="" className="cursor-pointer rounded px-2 py-1.5 text-sm text-slate-300 outline-none hover:bg-slate-700 focus:bg-slate-700 forced-colors:text-[CanvasText] forced-colors:focus:bg-[Highlight] forced-colors:focus:text-[HighlightText]">
                  {m.browser_all_codecs()}
                </ListBoxItem>
                {filters.codecs.map((c) => (
                  <ListBoxItem key={c.name} id={c.name} className="cursor-pointer rounded px-2 py-1.5 text-sm text-slate-300 outline-none hover:bg-slate-700 focus:bg-slate-700 forced-colors:text-[CanvasText] forced-colors:focus:bg-[Highlight] forced-colors:focus:text-[HighlightText]">
                    {c.name} ({c.stationcount})
                  </ListBoxItem>
                ))}
              </ListBox>
            </Popover>
          </Select>

          <NumberField
            aria-label={m.browser_filter_min_bitrate()}
            value={params.minBitrate ?? 0}
            onChange={handleBitrateChange}
            minValue={0}
            maxValue={320}
            step={32}
          >
            <Label className="text-xs text-slate-400">{m.browser_filter_min_bitrate()}</Label>
            <Group className="mt-1 flex">
              <Input className="w-20 rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500 forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]" />
            </Group>
          </NumberField>
        </>
      )}

      {isActive && (
        <Button
          onPress={handleReset}
          className="self-end rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
        >
          {m.browser_reset_filters()}
        </Button>
      )}
    </ScreenZone>
  );
});
SearchForm.displayName = "SearchForm";
