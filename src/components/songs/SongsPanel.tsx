import { useEffect, useRef } from "react";
import { useStore } from "@nanostores/react";
import { $filteredSongs, $songsLoading, $songsError, loadSongs } from "../../stores/songs";
import { SongsFilterBar } from "./SongsFilterBar";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

export function SongsPanel({ onZonesChange, exitZone }: Props) {
  const songs = useStore($filteredSongs);
  const loading = useStore($songsLoading);
  const error = useStore($songsError);

  const filterRef = useRef<ZoneEntry | null>(null);

  useEffect(() => {
    loadSongs();
  }, []);

  useEffect(() => {
    if (filterRef.current) onZonesChange([filterRef.current]);
  }, [onZonesChange]);

  return (
    <div role="region" aria-label={m.songs_section()} className="flex flex-1 flex-col overflow-hidden">
      <SongsFilterBar ref={filterRef} exitZone={(forward) => exitZone("songs-filter", forward)} />
      {loading && <p className="p-4 text-slate-400" role="status">{m.songs_loading()}</p>}
      {error && <p className="p-4 text-red-400" role="alert">{m.songs_error({ error })}</p>}
      {!loading && !error && songs.length === 0 && (
        <p className="p-4 text-slate-400">{m.songs_empty()}</p>
      )}
      {!loading && !error && songs.length > 0 && (
        <p className="p-4 text-slate-400">
          Showing {songs.length} songs (list UI in Task 14)
        </p>
      )}
    </div>
  );
}
