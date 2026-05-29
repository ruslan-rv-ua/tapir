import { useCallback, useEffect, useRef, useState } from "react";
import type { SongAction } from "./SongContextMenu";
import { useStore } from "@nanostores/react";
import {
  $filteredSongs, $songs, $songsLoading, $songsError,
  loadSongs, replaceSongByPath, removeSongByPath,
} from "../../stores/songs";
import { $playerStatus } from "../../stores/player";
import { SongsFilterBar } from "./SongsFilterBar";
import { SongsList } from "./SongsList";
import { TagEditorDialog } from "./TagEditorDialog";
import { RenameDialog } from "./RenameDialog";
import { ConfirmDialog } from "../common/ConfirmDialog";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import * as tauri from "../../lib/tauri";
import type { Song, SongDeletedPayload, SongRenamedPayload } from "../../types/song";
import { useTauriEvent } from "../../hooks/useTauriEvent";
import { addToast } from "../../stores/toasts";
import { useAnnounce } from "../../hooks/useAnnounce";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: string, forward: boolean) => void;
}

export function SongsPanel({ onZonesChange, exitZone }: Props) {
  const songs = useStore($filteredSongs);
  const allSongs = useStore($songs);
  const loading = useStore($songsLoading);
  const error = useStore($songsError);
  const announce = useAnnounce();

  const filterRef = useRef<ZoneEntry | null>(null);
  const listRef = useRef<ZoneEntry | null>(null);

  const [tagEditorFor, setTagEditorFor] = useState<Song | null>(null);
  const [renameFor, setRenameFor] = useState<Song | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Song | null>(null);

  useEffect(() => {
    loadSongs();
  }, []);

  useEffect(() => {
    const zones: ZoneEntry[] = [];
    if (filterRef.current) zones.push(filterRef.current);
    if (listRef.current) zones.push(listRef.current);
    onZonesChange(zones);
  }, [onZonesChange, songs.length]);

  useTauriEvent<Song>("song-tags-updated", (payload) => {
    replaceSongByPath(payload);
  });
  useTauriEvent<SongDeletedPayload>("song-deleted", (payload) => {
    removeSongByPath(payload.path);
    announce(m.songs_toast_deleted(), "assertive");
  });
  useTauriEvent<SongRenamedPayload>("song-renamed", (payload) => {
    replaceSongByPath(payload.newSong, payload.oldPath);
  });
  useTauriEvent("recording-completed", () => {
    loadSongs();
  });

  const findSong = useCallback(
    (path: string) => allSongs.find((s) => s.path === path),
    [allSongs]
  );

  const handlePlay = useCallback(async (path: string) => {
    const ps = $playerStatus.get();
    const isThisPlaying =
      ps.state !== "stopped" &&
      ps.source?.type === "file" &&
      ps.source.path === path;
    try {
      if (isThisPlaying) await tauri.stopPlayback();
      else await tauri.playSavedSong(path);
    } catch (err) {
      addToast(String(err), "error");
    }
  }, []);

  const handleMenuAction = useCallback(
    async (path: string, action: SongAction) => {
      const song = findSong(path);
      if (!song) return;
      switch (action) {
        case "play":
          handlePlay(path);
          break;
        case "explorer":
          try { await tauri.openSongInExplorer(path); }
          catch (e) { addToast(m.songs_toast_failed({ error: String(e) }), "error"); }
          break;
        case "rename":
          setRenameFor(song);
          break;
        case "tags":
          setTagEditorFor(song);
          break;
        case "delete":
          setConfirmDelete(song);
          break;
      }
    },
    [findSong, handlePlay]
  );

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    try {
      await tauri.deleteSong(confirmDelete.path);
    } catch (e) {
      addToast(m.songs_toast_failed({ error: String(e) }), "error");
    }
    setConfirmDelete(null);
  };

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
          onAction={handleMenuAction}
        />
      )}

      {tagEditorFor && (
        <TagEditorDialog
          song={tagEditorFor}
          onClose={() => setTagEditorFor(null)}
          onSaved={(updated) => replaceSongByPath(updated)}
        />
      )}

      {renameFor && (
        <RenameDialog
          song={renameFor}
          onClose={() => setRenameFor(null)}
          onSaved={(updated, oldPath) => replaceSongByPath(updated, oldPath)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={m.songs_confirm_delete_title()}
          message={m.songs_confirm_delete_body({ fileName: confirmDelete.fileName })}
          confirmLabel={m.songs_action_delete()}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
