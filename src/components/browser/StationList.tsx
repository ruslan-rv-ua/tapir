import { forwardRef, useImperativeHandle, useCallback, useMemo } from "react";
import { useStore } from "@nanostores/react";
import { $streams } from "../../stores/streams";
import { addStation } from "../../stores/browser";
import { useCompositeList, type SegmentKind } from "../../hooks/useCompositeList";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { StationResult } from "../../lib/tauri";
import { useAnnounce } from "../../hooks/useAnnounce";
import { addToast } from "../../stores/toasts";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  stations: StationResult[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore?: () => void;
  emptyMessage: string;
  exitZone: (forward: boolean) => void;
}

const STATION_SEGMENTS: Exclude<SegmentKind, 'summary'>[] = ["metadata", "action-add"];

export const StationList = forwardRef<ZoneEntry, Props>(
  ({ stations, loading, error, hasMore, onLoadMore, emptyMessage, exitZone }, ref) => {
    const streams = useStore($streams);
    const announce = useAnnounce();

    const existingUrls = useMemo(() => new Set(streams.map((s) => s.url)), [streams]);
    const isAlreadyAdded = useCallback(
      (station: StationResult) => existingUrls.has(station.urlResolved || station.url),
      [existingUrls],
    );

    const items = useMemo(
      () => stations.map((s) => ({ id: s.stationuuid, segments: STATION_SEGMENTS })),
      [stations],
    );

    const { listRef, onKeyDownCapture, isFocused, restoreFocus, activeItemId } = useCompositeList({
      zoneId: "browser-results",
      items,
      onTabOut: exitZone,
      // The Add button self-activates; Enter on the whole-row summary also adds.
      onAction: async (type, itemId, segment) => {
        if (type !== "primary" || segment !== "summary") return;
        const station = stations.find((s) => s.stationuuid === itemId);
        if (!station || isAlreadyAdded(station)) return;
        try {
          await addStation(station);
          announce(m.browser_station_added({ name: station.name }), "polite");
        } catch (err) {
          addToast(String(err), "error");
        }
      },
    });

    useImperativeHandle(ref, () => ({
      id: "browser-results",
      get el() { return listRef.current!; },
      focus: restoreFocus,
    }), [restoreFocus]);

    if (loading) return (
      <div role="status" aria-live="polite" className="p-4 text-sm text-slate-400">
        {m.browser_loading()}
      </div>
    );
    if (error) return (
      <div role="alert" className="p-4 text-sm text-red-400">{error}</div>
    );
    if (stations.length === 0) return (
      <div role="status" className="p-4 text-center text-sm text-slate-500">{emptyMessage}</div>
    );

    return (
      <ul
        ref={listRef}
        data-zone-id="browser-results"
        aria-label={m.zone_browser_results()}
        role="application"
        className="flex-1 overflow-auto"
        onKeyDownCapture={onKeyDownCapture}
      >
        {stations.map((station) => {
          const added = isAlreadyAdded(station);
          // Value only; the "Метадані" type is announced via aria-roledescription.
          const metaValue = [
            station.country,
            station.codec,
            station.bitrate ? `${station.bitrate} кбіт/с` : null,
            station.clickcount ? String(station.clickcount) : null,
          ].filter(Boolean).join(", ");
          const activeRow = activeItemId === station.stationuuid;

          return (
            <li
              key={station.stationuuid}
              // The <li> is the 'summary' (whole-row) focus stop; aria-roledescription
              // makes NVDA read "{name}, станція". Single focus ring via the global
              // [tabindex]:focus-visible rule.
              data-item-id={station.stationuuid}
              data-segment="summary"
              tabIndex={isFocused(station.stationuuid, "summary") ? 0 : -1}
              aria-label={station.name}
              aria-roledescription={m.item_role_station()}
              className={`border-b border-slate-800 forced-colors:border-[ButtonText] ${activeRow ? "bg-slate-800/60" : ""}`}
            >
              {/* Station name — visual only; the row's accessible name is on the <li>. */}
              <div className="px-3 py-2 font-medium text-slate-100">
                {station.name}
              </div>

              {/* Metadata segment */}
              <div
                role="group"
                data-item-id={station.stationuuid}
                data-segment="metadata"
                tabIndex={isFocused(station.stationuuid, "metadata") ? 0 : -1}
                aria-label={metaValue}
                aria-roledescription={m.segment_metadata()}
                className="px-3 py-1 text-sm text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight]"
              >
                {[station.name, station.country, station.codec, station.bitrate && `${station.bitrate} kbps`].filter(Boolean).join(" · ")}
              </div>

              {/* Action — individual focus stop (roving tabIndex). */}
              <div className="px-3 py-1">
                <button
                  data-item-id={station.stationuuid}
                  data-segment="action-add"
                  tabIndex={isFocused(station.stationuuid, "action-add") ? 0 : -1}
                  aria-disabled={added || undefined}
                  aria-label={added ? m.browser_added() : m.add_stream()}
                  onClick={async () => {
                    if (added) return;
                    try {
                      await addStation(station);
                      announce(m.browser_station_added({ name: station.name }), "polite");
                    } catch (err) { addToast(String(err), "error"); }
                  }}
                  className={`rounded px-2 py-0.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:focus-visible:outline-[Highlight] ${added ? "cursor-not-allowed text-slate-600" : "bg-blue-600 text-white hover:bg-blue-700 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"}`}
                >
                  {added ? m.browser_added() : m.add_stream()}
                </button>
              </div>
            </li>
          );
        })}
        {hasMore && onLoadMore && (
          <li>
            <button
              onClick={onLoadMore}
              className="w-full py-2 text-sm text-slate-400 hover:bg-slate-800"
            >
              {m.browser_load_more()}
            </button>
          </li>
        )}
      </ul>
    );
  },
);
StationList.displayName = "StationList";
