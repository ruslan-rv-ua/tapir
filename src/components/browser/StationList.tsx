import { forwardRef, useCallback, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { $streams } from "../../stores/streams";
import { addStation } from "../../stores/browser";
import { CompositeList } from "../common/composite-list";
import { ListCardState } from "../common/ListCard";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { StationResult } from "../../lib/tauri";
import { useAnnounce } from "../../hooks/useAnnounce";
import { addToast } from "../../stores/toasts";
import { StationItem, getStationSegments } from "./StationItem";
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

export const StationList = forwardRef<ZoneEntry, Props>(
  ({ stations, loading, error, hasMore, onLoadMore, emptyMessage, exitZone }, ref) => {
    const streams = useStore($streams);
    const announce = useAnnounce();
    const [failedPreview, setFailedPreview] = useState<Set<string>>(new Set());

    const existingUrls = useMemo(() => new Set(streams.map((s) => s.url)), [streams]);
    const isAlreadyAdded = useCallback(
      (station: StationResult) => existingUrls.has(station.urlResolved || station.url),
      [existingUrls],
    );

    const items = useMemo(
      () => stations.map((s) => ({ id: s.stationuuid, segments: getStationSegments(s) })),
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

    const markPreviewFailed = useCallback((id: string) => {
      setFailedPreview((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }, []);

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
            <ListCardState role="status" aria-live="polite" className="text-slate-400">
              {m.browser_loading()}
            </ListCardState>
          ) : undefined
        }
        error={error ? <ListCardState role="alert" className="text-red-400">{error}</ListCardState> : undefined}
        empty={<ListCardState role="status">{emptyMessage}</ListCardState>}
        footer={
          hasMore && onLoadMore ? (
            <li>
              <button onClick={onLoadMore} className="w-full py-2 text-sm text-slate-400 hover:bg-slate-800">
                {m.browser_load_more()}
              </button>
            </li>
          ) : undefined
        }
        // Enter on the whole-row summary adds the station (primary action).
        onAction={(type, itemId, segment) => {
          if (type !== "primary" || segment !== "summary") return;
          const station = stations.find((s) => s.stationuuid === itemId);
          if (station) void handleAdd(station);
        }}
        renderRow={({ id, isActive, isFocused }) => {
          const station = stations.find((s) => s.stationuuid === id)!;
          return (
            <StationItem
              key={id}
              station={station}
              isFocused={isFocused}
              isActiveRow={isActive}
              isAdded={isAlreadyAdded(station)}
              isUnavailable={station.lastcheckok === 0 || failedPreview.has(id)}
              onAdd={() => void handleAdd(station)}
              onPreviewFailed={() => markPreviewFailed(id)}
            />
          );
        }}
      />
    );
  },
);
StationList.displayName = "StationList";
