import { useStore } from "@nanostores/react";
import { forwardRef, useImperativeHandle, useRef } from "react";
import {
  $songsQuery, $songsStation, $songsSort, $songsStations,
} from "../../stores/songs";
import { useFocusBoundary } from "../../hooks/useFocusBoundary";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  exitZone: (forward: boolean) => void;
}

export const SongsFilterBar = forwardRef<ZoneEntry, Props>(({ exitZone }, ref) => {
  const query = useStore($songsQuery);
  const station = useStore($songsStation);
  const sort = useStore($songsSort);
  const stations = useStore($songsStations);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const { restoreFocus } = useFocusBoundary(containerRef, exitZone);

  useImperativeHandle(ref, () => ({
    id: "songs-filter",
    get el() { return containerRef.current!; },
    focus: restoreFocus,
  }), [restoreFocus]);

  return (
    <div
      ref={containerRef}
      data-zone-id="songs-filter"
      aria-label={m.songs_zone_filter()}
      role="region"
      className="flex flex-col gap-2 border-b border-slate-700 bg-slate-900/40 p-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex flex-1 min-w-[220px] flex-col gap-1">
          <span className="sr-only">{m.songs_search_placeholder()}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => $songsQuery.set(e.target.value)}
            placeholder={m.songs_search_placeholder()}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Field] forced-colors:text-[FieldText] forced-colors:border-[ButtonText]"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <span>{m.songs_sort_label()}</span>
          <select
            value={sort}
            onChange={(e) => $songsSort.set(e.target.value as typeof sort)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Field] forced-colors:text-[FieldText]"
          >
            <option value="date">{m.songs_sort_date()}</option>
            <option value="title">{m.songs_sort_title()}</option>
            <option value="artist">{m.songs_sort_artist()}</option>
            <option value="size">{m.songs_sort_size()}</option>
          </select>
        </label>
      </div>

      <div role="group" aria-label={m.songs_filter_all()} className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => $songsStation.set(null)}
          aria-pressed={station === null}
          className={[
            "rounded-full border px-3 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
            station === null
              ? "border-sky-400 bg-sky-400/20 text-sky-200 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
              : "border-slate-600 text-slate-300 hover:border-slate-500 forced-colors:text-[ButtonText]",
          ].join(" ")}
        >
          {m.songs_filter_all()}
        </button>
        {stations.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => $songsStation.set(s)}
            aria-pressed={station === s}
            className={[
              "rounded-full border px-3 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
              station === s
                ? "border-sky-400 bg-sky-400/20 text-sky-200 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
                : "border-slate-600 text-slate-300 hover:border-slate-500 forced-colors:text-[ButtonText]",
            ].join(" ")}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
});
SongsFilterBar.displayName = "SongsFilterBar";
