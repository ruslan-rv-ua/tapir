import { forwardRef, useCallback, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { $streams } from "../../stores/streams";
import { addStation, addStations, $stationSelection } from "../../stores/browser";
import { replaceSelection } from "../../stores/selection";
import { useListSelection } from "../../hooks/useListSelection";
import { CompositeList, type CompositeListHandle } from "../common/composite-list";
import { ListCardState } from "../common/ListCard";
import type { StationResult } from "../../lib/tauri";
import { useAnnounce } from "../../hooks/useAnnounce";
import { addToast } from "../../stores/toasts";
import { StationItem, getStationSegments } from "./StationItem";
import * as m from "../../i18n/paraglide/messages";

// resetCursor comes from CompositeList: this is the one list whose whole result
// set is replaced under the user (a changed query/filter), so BrowserPanel needs
// to say "forget the remembered row".
export type StationListHandle = CompositeListHandle & { requestBulkAdd: () => void };

interface Props {
  stations: StationResult[];
  /**
   * Which of the screen's two lists this is. "popular" is a fixed showcase —
   * finite, with nothing more to fetch — so it has no trailing "Load more" stop;
   * search results are paged and do. Passed as a MODE rather than by leaving the
   * paging props out upstream, so the absence of the button reads as a decision
   * here instead of as a forgotten prop in BrowserPanel.
   */
  mode: "search" | "popular";
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  /** A further batch is in flight (search mode only). */
  loadingMore?: boolean;
  onLoadMore?: () => Promise<void>;
  emptyMessage: string;
  exitZone: (forward: boolean) => void;
}

export const StationList = forwardRef<StationListHandle, Props>(
  ({ stations, mode, loading, error, hasMore, loadingMore, onLoadMore, emptyMessage, exitZone }, ref) => {
    const streams = useStore($streams);
    const announce = useAnnounce();
    const [failedPreview, setFailedPreview] = useState<Set<string>>(new Set());
    const selectedSet = useStore($stationSelection);

    // Keyed by URL, not id: the catalogue and the profile share nothing else.
    // Holding the whole stream (rather than just its URL) is what lets a row
    // show the codec verdict the backend already made — no second decision here.
    const existingByUrl = useMemo(
      () => new Map(streams.map((s) => [s.url, s])),
      [streams],
    );
    const streamFor = useCallback(
      (station: StationResult) => existingByUrl.get(station.urlResolved || station.url),
      [existingByUrl],
    );
    const isAlreadyAdded = useCallback(
      (station: StationResult) => streamFor(station) !== undefined,
      [streamFor],
    );

    const items = useMemo(
      () => stations.map((s) => ({ id: s.stationuuid, segments: getStationSegments(s) })),
      [stations],
    );

    const resolveName = useCallback(
      (id: string) => stations.find((s) => s.stationuuid === id)?.name ?? "",
      [stations],
    );

    const { selectionAdapter, onSelectionChange } = useListSelection<StationResult>({
      $selection: $stationSelection,
      announce,
      resolveName,
      allItems: stations,
      getId: (s) => s.stationuuid,
    });

    const handleAdd = useCallback(
      async (station: StationResult) => {
        if (isAlreadyAdded(station)) {
          // Say so rather than no-op: the row already reads "Added" visually, but
          // a keyboard user activating it heard nothing at all.
          announce(m.browser_station_already_added({ name: station.name }), "polite");
          return;
        }
        try {
          // The catalogue's own Codec column is the evidence, so the caveat can
          // ride inside the confirmation instead of arriving as a second toast
          // the user has to reconcile with the first (ADR 2026-08-31).
          const added = await addStation(station);
          const codec = added.unsupportedCodec?.family;
          announce(
            codec
              ? m.browser_station_added_unsupported({ name: station.name, codec })
              : m.browser_station_added({ name: station.name }),
            "polite",
          );
        } catch (err) {
          addToast(String(err), "error");
        }
      },
      [isAlreadyAdded, announce],
    );

    const handleBulkAdd = useCallback(async () => {
      const ids = $stationSelection.get();
      if (ids.size === 0) return;
      const selected = stations.filter((s) => ids.has(s.stationuuid));
      try {
        const added = await addStations(selected);
        const skipped = selected.length - added.length;
        if (added.length > 0) replaceSelection($stationSelection, new Set()); // full skip keeps selection
        const parts = [m.stations_added_bulk({ count: added.length })];
        if (skipped > 0) parts.push(m.stations_skipped_duplicate({ count: skipped }));
        // Added, but Tapir will not record them — said here rather than in a
        // toast of its own, for the same reason as the single-add path.
        const unrecordable = added.filter((s) => s.unsupportedCodec).length;
        if (unrecordable > 0) parts.push(m.stations_added_unsupported({ count: unrecordable }));
        announce(parts.join(", "), "polite"); // focus deliberately NOT moved
      } catch (err) {
        addToast(String(err), "error");
      }
    }, [stations, announce]);

    const markPreviewFailed = useCallback((id: string) => {
      setFailedPreview((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }, []);

    return (
      <CompositeList<StationListHandle>
        ref={ref}
        zoneId="browser-results"
        ariaLabel={m.zone_browser_results()}
        items={items}
        className="flex-1 overflow-auto"
        onTabOut={exitZone}
        selection={selectionAdapter}
        onSelectionChange={onSelectionChange}
        imperativeExtra={() => ({ requestBulkAdd: handleBulkAdd })}
        loading={
          loading ? (
            <ListCardState role="status" aria-live="polite" className="text-slate-400">
              {m.browser_loading()}
            </ListCardState>
          ) : undefined
        }
        error={error ? <ListCardState role="alert" className="text-red-400">{error}</ListCardState> : undefined}
        emptyLabel={emptyMessage}
        empty={<ListCardState role="status">{emptyMessage}</ListCardState>}
        // Popular Stations is a fixed showcase: no further batches exist, so it
        // has no trailing stop at all. Search results do, for as long as the
        // catalogue still has a record past the ones on screen.
        trailingStop={
          mode === "search" && hasMore && onLoadMore
            ? {
                label: loadingMore ? m.browser_load_more_busy() : m.browser_load_more(),
                busy: loadingMore,
                onActivate: onLoadMore,
                exhaustedMessage: m.browser_no_more_results(),
              }
            : undefined
        }
        // Enter on the whole-row summary adds the station (primary action).
        // Shift+Enter toggles the preview (app-wide "Shift = listen" convention) by
        // delegating to the row's own preview button — the single owner of preview
        // state, labels and failure handling. Ctrl+Enter is reserved for recording,
        // which doesn't exist here, so it deliberately does nothing.
        onAction={(type, itemId, segment, mods) => {
          if (type !== "primary" || segment !== "summary") return;
          if (mods.shift) {
            document
              .querySelector<HTMLElement>(
                `[data-zone-id="browser-results"] [data-item-id="${CSS.escape(itemId)}"][data-segment="action-play"]`,
              )
              ?.click();
            return;
          }
          if (mods.ctrl) return;
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
              unsupported={streamFor(station)?.unsupportedCodec ?? null}
              isSelected={selectedSet.has(id)}
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
