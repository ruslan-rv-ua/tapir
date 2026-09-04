import { useStore } from "@nanostores/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  $songsQuery, $songsStation, $songsSort, $songsStations,
} from "../../stores/songs";
import { useFocusBoundary } from "../../hooks/useFocusBoundary";
import { focusOrSelect } from "../../lib/focusOrSelect";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  exitZone: (forward: boolean) => void;
}

export const SongsFilterBar = forwardRef<ZoneEntry, Props>(({ exitZone }, ref) => {
  const storeQuery = useStore($songsQuery);
  const [localQuery, setLocalQuery] = useState(storeQuery);
  const station = useStore($songsStation);
  const sort = useStore($songsSort);
  const stations = useStore($songsStations);

  // Push local → store after a short idle, so rapid keystrokes coalesce.
  useEffect(() => {
    if (localQuery === storeQuery) return;
    const id = setTimeout(() => $songsQuery.set(localQuery), 200);
    return () => clearTimeout(id);
  }, [localQuery, storeQuery]);

  // Reflect external store changes (e.g. clear on section switch) into local.
  useEffect(() => {
    if (storeQuery !== localQuery) setLocalQuery(storeQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeQuery]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { restoreFocus } = useFocusBoundary(containerRef, exitZone);

  // Ctrl+F target — the search input itself, never `restoreFocus`: that one
  // returns to the last-touched control of the zone, which here is as likely to
  // be the station or sort <select>.
  const focusSearch = useCallback(() => focusOrSelect(searchInputRef.current), []);

  useImperativeHandle(ref, () => ({
    id: "songs-filter",
    focus: restoreFocus,
    focusSearch,
  }), [restoreFocus, focusSearch]);

  return (
    <div
      ref={containerRef}
      data-zone-id="songs-filter"
      aria-label={m.songs_zone_filter()}
      role="region"
      className="flex flex-wrap items-center gap-3 border-b border-slate-700 bg-slate-900/40 p-3"
    >
      <label className="flex flex-1 min-w-[220px] flex-col gap-1">
        <span className="sr-only">{m.songs_search_placeholder()}</span>
        <input
          ref={searchInputRef}
          type="search"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          placeholder={m.songs_search_placeholder()}
          className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Field] forced-colors:text-[FieldText] forced-colors:border-[ButtonText]"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <span>{m.songs_filter_station_label()}</span>
        <select
          value={station ?? ""}
          onChange={(e) => $songsStation.set(e.target.value || null)}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 forced-colors:bg-[Field] forced-colors:text-[FieldText]"
        >
          <option value="">{m.songs_filter_all()}</option>
          {stations.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
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
  );
});
SongsFilterBar.displayName = "SongsFilterBar";
