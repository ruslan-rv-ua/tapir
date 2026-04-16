import { useState, useCallback, useMemo } from "react";
import { useStore } from "@nanostores/react";
import {
  Cell,
  Column,
  Row,
  Table,
  TableBody,
  TableHeader,
  Button,
} from "react-aria-components";
import type { SortDescriptor } from "react-aria-components";
import { $streams } from "../../stores/streams";
import { addStation, updateSearchParam, searchStations, $searchParams } from "../../stores/browser";
import { addToast } from "../../stores/toasts";
import type { StationResult } from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

interface StationTableProps {
  stations: StationResult[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore?: () => void;
  emptyMessage: string;
}

export function StationTable({ stations, loading, error, hasMore, onLoadMore, emptyMessage }: StationTableProps) {
  const streams = useStore($streams);
  const params = useStore($searchParams);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "clickcount",
    direction: "descending",
  });

  const existingUrls = useMemo(() => new Set(streams.map((s) => s.url)), [streams]);

  const isAlreadyAdded = useCallback(
    (station: StationResult) => {
      const url = station.urlResolved || station.url;
      return existingUrls.has(url);
    },
    [existingUrls],
  );

  const handleAdd = useCallback(async (station: StationResult) => {
    setAddingIds((prev) => new Set(prev).add(station.stationuuid));
    try {
      await addStation(station);
      addToast(m.browser_station_added({ name: station.name }), "success");
    } catch (e) {
      const errMsg = String(e);
      if (errMsg.includes("already exists")) {
        addToast(m.browser_station_duplicate(), "error");
      } else {
        addToast(errMsg, "error");
      }
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev);
        next.delete(station.stationuuid);
        return next;
      });
    }
  }, []);

  const handleSortChange = useCallback((descriptor: SortDescriptor) => {
    setSortDescriptor(descriptor);
    const field = String(descriptor.column);
    const reverse = descriptor.direction === "descending";
    updateSearchParam("order", field);
    updateSearchParam("reverse", reverse);
    setTimeout(() => searchStations($searchParams.get()), 0);
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Live region for announcements */}
      <div aria-live="polite" className="sr-only">
        {loading && m.browser_loading()}
        {!loading && stations.length > 0 && m.browser_results_count({ count: String(stations.length) })}
      </div>
      {error && (
        <div aria-live="assertive" className="px-4 py-2 text-sm text-red-400 forced-colors:text-[CanvasText]">
          {m.browser_error({ error })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {stations.length === 0 && !loading ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">{emptyMessage}</p>
        ) : (
          <Table
            aria-label={m.browser_section()}
            selectionMode="none"
            sortDescriptor={sortDescriptor}
            onSortChange={handleSortChange}
            className="w-full"
          >
            <TableHeader className="border-b border-slate-700 text-xs text-slate-500 uppercase forced-colors:border-[ButtonText]">
              <Column id="name" isRowHeader allowsSorting className="px-4 py-2 text-left cursor-pointer">
                {m.browser_column_name()}
              </Column>
              <Column id="country" allowsSorting className="w-[120px] px-2 py-2 text-left cursor-pointer">
                {m.browser_column_country()}
              </Column>
              <Column id="codec" allowsSorting className="w-[80px] px-2 py-2 text-left cursor-pointer">
                {m.browser_column_codec()}
              </Column>
              <Column id="bitrate" allowsSorting className="w-[90px] px-2 py-2 text-left cursor-pointer">
                {m.browser_column_bitrate()}
              </Column>
              <Column id="clickcount" allowsSorting className="w-[110px] px-2 py-2 text-left cursor-pointer">
                {m.browser_column_popularity()}
              </Column>
              <Column id="actions" className="w-[90px] px-2 py-2 text-left">
                {m.browser_column_actions()}
              </Column>
            </TableHeader>
            <TableBody>
              {stations.map((station) => {
                const added = isAlreadyAdded(station);
                const adding = addingIds.has(station.stationuuid);
                return (
                  <Row key={station.stationuuid} className="border-b border-slate-800 hover:bg-slate-800/50 forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]">
                    <Cell className="px-4 py-2 text-sm">{station.name}</Cell>
                    <Cell className="px-2 py-2 text-sm text-slate-400">{station.country}</Cell>
                    <Cell className="px-2 py-2 text-sm text-slate-400">{station.codec || "—"}</Cell>
                    <Cell className="px-2 py-2 text-sm text-slate-400">
                      {station.bitrate > 0 ? `${station.bitrate}` : "—"}
                    </Cell>
                    <Cell className="px-2 py-2 text-sm text-slate-400">{station.clickcount}</Cell>
                    <Cell className="px-2 py-2">
                      <Button
                        onPress={() => handleAdd(station)}
                        isDisabled={added || adding}
                        aria-label={
                          added
                            ? m.browser_station_already_added({ name: station.name })
                            : m.browser_add_station({ name: station.name })
                        }
                        className={`rounded px-2 py-0.5 text-xs ${
                          added
                            ? "text-slate-500 forced-colors:text-[GrayText]"
                            : "bg-blue-600 text-white hover:bg-blue-700 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
                        }`}
                      >
                        {added ? m.browser_added() : adding ? "..." : "+"}
                      </Button>
                    </Cell>
                  </Row>
                );
              })}
            </TableBody>
          </Table>
        )}

        {loading && (
          <p className="px-4 py-4 text-center text-sm text-slate-500">{m.browser_loading()}</p>
        )}

        {hasMore && !loading && onLoadMore && (
          <div className="flex justify-center py-3">
            <Button
              onPress={onLoadMore}
              aria-label={m.browser_load_more()}
              className="rounded bg-slate-700 px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-600 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
            >
              {m.browser_load_more()}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
