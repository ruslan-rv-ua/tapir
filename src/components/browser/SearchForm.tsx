import { useRef, useCallback, useEffect, type RefObject } from "react";
import { useStore } from "@nanostores/react";
import { SearchField, Input, Button, Label, Select, SelectValue, Popover, ListBox, ListBoxItem, NumberField, Group } from "react-aria-components";
import {
  $searchParams,
  $browserFilters,
  searchStations,
  updateSearchParam,
  resetSearch,
} from "../../stores/browser";
import { useFocusBoundary } from "../../hooks/useFocusBoundary";
import type { SearchParams } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

interface SearchFormProps {
  containerRef?: RefObject<HTMLDivElement | null>;
  exitZone?: (forward: boolean) => void;
}

export function SearchForm({ containerRef, exitZone }: SearchFormProps = {}) {
  const params = useStore($searchParams);
  const filters = useStore($browserFilters);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const internalRef = useRef<HTMLDivElement | null>(null);
  const effectiveRef = containerRef ?? internalRef;
  const { refreshBoundary } = useFocusBoundary(
    effectiveRef,
    exitZone ?? (() => {}),
  );

  useEffect(() => { refreshBoundary(); }, [filters, refreshBoundary]);

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
  const handleFilterChange = useCallback(<K extends keyof typeof params>(key: K, value: string) => {
    updateSearchParam(key, (value || undefined) as SearchParams[K]);
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

  const handleClear = useCallback(() => {
    clearTimeout(debounceRef.current);
    resetSearch();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  return (
    <div ref={effectiveRef} data-zone-id="browser-search" className="flex flex-wrap items-end gap-3 border-b border-slate-700 px-4 py-3 forced-colors:border-[ButtonText]">
      <SearchField
        aria-label={m.browser_search_placeholder()}
        value={params.query ?? ""}
        onChange={handleQueryChange}
        onClear={handleClear}
        autoFocus
        className="flex-1 min-w-48"
      >
        <Input
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
    </div>
  );
}
