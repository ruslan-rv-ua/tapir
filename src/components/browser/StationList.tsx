import { forwardRef, useCallback, useMemo } from "react";
import { useStore } from "@nanostores/react";
import { $streams } from "../../stores/streams";
import { addStation } from "../../stores/browser";
import { CompositeList, CompositeRow, CompositeSegment, COMPOSITE_FOCUS_RING } from "../common/composite-list";
import type { SegmentKind } from "../../hooks/useCompositeList";
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

const STATION_SEGMENTS: Exclude<SegmentKind, "summary">[] = ["metadata", "action-add"];

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

    const handleAdd = useCallback(
      async (station: StationResult) => {
        if (isAlreadyAdded(station)) return;
        try {
          await addStation(station);
          announce(m.browser_station_added({ name: station.name }), "polite");
        } catch (err) {
          addToast(String(err), "error");
        }
      },
      [isAlreadyAdded, announce],
    );

    return (
      <CompositeList
        ref={ref}
        zoneId="browser-results"
        ariaLabel={m.zone_browser_results()}
        items={items}
        className="flex-1 overflow-auto"
        onTabOut={exitZone}
        loading={
          loading ? (
            <div role="status" aria-live="polite" className="p-4 text-sm text-slate-400">
              {m.browser_loading()}
            </div>
          ) : undefined
        }
        error={error ? <div role="alert" className="p-4 text-sm text-red-400">{error}</div> : undefined}
        empty={<div role="status" className="p-4 text-center text-sm text-slate-500">{emptyMessage}</div>}
        footer={
          hasMore && onLoadMore ? (
            <li>
              <button onClick={onLoadMore} className="w-full py-2 text-sm text-slate-400 hover:bg-slate-800">
                {m.browser_load_more()}
              </button>
            </li>
          ) : undefined
        }
        // The Add button self-activates; Enter on the whole-row summary also adds.
        onAction={(type, itemId, segment) => {
          if (type !== "primary" || segment !== "summary") return;
          const station = stations.find((s) => s.stationuuid === itemId);
          if (station) void handleAdd(station);
        }}
        renderRow={({ id, isActive, isFocused }) => {
          const station = stations.find((s) => s.stationuuid === id)!;
          const added = isAlreadyAdded(station);
          // Value only; the "Метадані" type is announced via aria-roledescription.
          const metaValue = [
            station.country,
            station.codec,
            station.bitrate ? `${station.bitrate} кбіт/с` : null,
            station.clickcount ? String(station.clickcount) : null,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <CompositeRow
              key={id}
              itemId={id}
              isFocused={isFocused}
              isActiveRow={isActive}
              label={station.name}
              roleDescription={m.item_role_station()}
              className="border-b border-slate-800 forced-colors:border-[ButtonText]"
              activeClassName="bg-slate-800/60"
            >
              {/* Station name — visual only; the row's accessible name is on the <li>. */}
              <div className="px-3 py-2 font-medium text-slate-100">{station.name}</div>

              <CompositeSegment
                itemId={id}
                segment="metadata"
                isFocused={isFocused}
                label={metaValue}
                roleDescription={m.segment_metadata()}
                className="px-3 py-1 text-sm text-slate-400"
              >
                {[station.name, station.country, station.codec, station.bitrate && `${station.bitrate} kbps`]
                  .filter(Boolean)
                  .join(" · ")}
              </CompositeSegment>

              {/* Action — individual focus stop (roving tabIndex). Uses aria-disabled
                  (not a CompositeAction) because the "added" state is non-interactive. */}
              <div className="px-3 py-1">
                <button
                  data-item-id={id}
                  data-segment="action-add"
                  tabIndex={isFocused("action-add") ? 0 : -1}
                  aria-disabled={added || undefined}
                  aria-label={added ? m.browser_added() : m.add_stream()}
                  onClick={() => {
                    if (!added) void handleAdd(station);
                  }}
                  className={`rounded px-2 py-0.5 text-xs ${COMPOSITE_FOCUS_RING} ${
                    added
                      ? "cursor-not-allowed text-slate-600"
                      : "bg-blue-600 text-white hover:bg-blue-700 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
                  }`}
                >
                  {added ? m.browser_added() : m.add_stream()}
                </button>
              </div>
            </CompositeRow>
          );
        }}
      />
    );
  },
);
StationList.displayName = "StationList";
