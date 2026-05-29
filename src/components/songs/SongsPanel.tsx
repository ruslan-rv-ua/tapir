import { useCallback, useEffect, useRef } from "react";
import { useStore } from "@nanostores/react";
import { $filteredSongs, $songsLoading, $songsError, loadSongs } from "../../stores/songs";
import { SongsFilterBar } from "./SongsFilterBar";
import { SongsList } from "./SongsList";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
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
  const listRef = useRef<ZoneEntry | null>(null);

  useEffect(() => {
    loadSongs();
  }, []);

  const refreshZones = useCallback(() => {
    const zones: ZoneEntry[] = [];
    if (filterRef.current) zones.push(filterRef.current);
    if (listRef.current) zones.push(listRef.current);
    onZonesChange(zones);
  }, [onZonesChange]);

  useEffect(() => {
    refreshZones();
  }, [refreshZones, songs.length]);

  const handlePlay = useCallback((path: string) => {
    tauri.playSavedSong(path).catch((err) => addToast(String(err), "error"));
  }, []);

  const handleContextMenu = useCallback((_path: string) => {
    // Stub: real menu wired in Task 15.
  }, []);

  return (
    <div role="region" aria-label={m.songs_section()} className="flex flex-1 flex-col overflow-hidden">
      <SongsFilterBar ref={filterRef} exitZone={(forward) => exitZone("songs-filter", forward)} />
      {loading && <p className="p-4 text-slate-400" role="status">{m.songs_loading()}</p>}
      {error && <p className="p-4 text-red-400" role="alert">{m.songs_error({ error })}</p>}
      {!loading && !error && songs.length === 0 && (
        <p className="p-4 text-slate-400">{m.songs_empty()}</p>
      )}
      {!loading && !error && songs.length > 0 && (
        <SongsList
          ref={listRef}
          exitZone={(forward) => exitZone("songs-list", forward)}
          onEmpty={() => filterRef.current?.focus("forward")}
          onPlay={handlePlay}
          onContextMenu={handleContextMenu}
        />
      )}
    </div>
  );
}
