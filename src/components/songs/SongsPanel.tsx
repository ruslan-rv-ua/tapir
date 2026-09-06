import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SongAction } from "./SongContextMenu";
import { useStore } from "@nanostores/react";
import {
  $filteredSongs, $songs, $songsLoading, $songsError,
  loadSongs, replaceSongByPath, removeSongByPath,
  $songsSelection, $songsQuery, $songsStation, $songsSort,
} from "../../stores/songs";
import { replaceSelection } from "../../stores/selection";
import { $playerStatus } from "../../stores/player";
import { SongsFilterBar } from "./SongsFilterBar";
import { SongsList, type SongsListHandle } from "./SongsList";
import { TagEditorDialog } from "./TagEditorDialog";
import { RenameDialog } from "./RenameDialog";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { ListCard, ListCardState } from "../common/ListCard";
import { ScreenHeader } from "../layout/ScreenHeader";
import { ScreenZone } from "../layout/ScreenZone";
import { SelectionToolbar } from "../common/SelectionToolbar";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { useZoneProxy, type ZoneEntry, type ZoneId } from "../../hooks/useZoneNavigation";
import * as tauri from "../../lib/tauri";
import type { Song, SongTagsUpdatedPayload, SongDeletedPayload, SongRenamedPayload } from "../../types/song";
import { useTauriEvent } from "../../hooks/useTauriEvent";
import { addToast } from "../../stores/toasts";
import { shellOpenErrorMessage } from "../../lib/shellOpenError";
import { plural } from "../../lib/plural";
import { resultSetKey } from "../../lib/resultSetKey";
import { useAnnounce } from "../../hooks/useAnnounce";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  onZonesChange: (zones: ZoneEntry[]) => void;
  exitZone: (fromId: ZoneId, forward: boolean) => void;
}

export function SongsPanel({ onZonesChange, exitZone }: Props) {
  const songs = useStore($filteredSongs);
  const allSongs = useStore($songs);
  const loading = useStore($songsLoading);
  const error = useStore($songsError);
  const announce = useAnnounce();

  // Selection state
  const selection = useStore($songsSelection);
  const query = useStore($songsQuery);
  const station = useStore($songsStation);
  const sort = useStore($songsSort);

  // What makes the visible list the set it is: the search text, the station and
  // the order. Changing any of the three REPLACES the set, so the list forgets
  // its current stop and the next entry starts at the first row; a file that
  // appears or disappears in the recordings folder changes the rows without
  // changing this, and the stop stays where the person left it (ADR 2026-09-06).
  const listResultSetKey = resultSetKey([query, station, sort]);
  const selCount = selection.size;
  const visibleIds = useMemo(() => songs.map((s) => s.path), [songs]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));

  const filterRef = useRef<ZoneEntry | null>(null);
  // listRef now carries the bulk-delete entry point
  const listRef = useRef<SongsListHandle | null>(null);

  // Proxied (see useZoneProxy): SongsList remounts whenever $songsLoading toggles, e.g. on a rescan.
  const listProxy = useZoneProxy("songs-list", listRef);

  // Selection toolbar roving zone (two stops)
  const selectAllBtn = useRef<HTMLButtonElement | null>(null);
  const deleteSelectedBtn = useRef<HTMLButtonElement | null>(null);
  const selectionRefs = useMemo(() => [selectAllBtn, deleteSelectedBtn], []);
  const {
    onKeyDown: selKeyDown,
    getTabIndex: selTabIndex,
    restoreFocus: selRestore,
  } = useRovingFocus(selectionRefs, "horizontal", {
    mode: "mixed-boundary-handoff",
    onTabBoundary: (forward) => exitZone("songs-selection", forward),
  });

  const handleSelectAll = () => {
    if (visibleIds.length === 0) return;
    const next = new Set(selection);
    if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    replaceSelection($songsSelection, next);
    announce(next.size === 0 ? m.selection_cleared() : m.selection_count({ count: next.size }), "polite");
  };

  // Lifecycle: clear on filter change (query/station); sort changes must NOT clear.
  useEffect(() => { replaceSelection($songsSelection, new Set()); }, [query, station]);
  // Clear on unmount (section-scoped).
  useEffect(() => () => { replaceSelection($songsSelection, new Set()); }, []);

  const [tagEditorFor, setTagEditorFor] = useState<Song | null>(null);
  const [renameFor, setRenameFor] = useState<Song | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Song | null>(null);

  useEffect(() => {
    loadSongs();
  }, []);

  // Zone registration: selection zone FIRST, then filter, then list.
  useEffect(() => {
    const zones: ZoneEntry[] = [{
      id: "songs-selection",
      focus: selRestore,
    }];
    if (filterRef.current) zones.push(filterRef.current);
    if (listRef.current) zones.push(listProxy);
    onZonesChange(zones);
  }, [onZonesChange, songs.length, selRestore, listProxy]);

  useTauriEvent<SongTagsUpdatedPayload>("song-tags-updated", (payload) => {
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

  // Announce filter result count politely. Uses pluralized i18n.
  const announceCount = useCallback((count: number) => {
    announce(plural(count, {
      zero: () => m.songs_loaded_zero(),
      one: () => m.songs_loaded_one({ count: String(count) }),
      few: () => m.songs_loaded_few({ count: String(count) }),
      many: () => m.songs_loaded_many({ count: String(count) }),
    }), "polite");
  }, [announce]);

  useEffect(() => {
    if (loading || error) return;
    announceCount(songs.length);
  }, [songs.length, loading, error, announceCount]);

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
        case "open":
          // The external app is launched fire-and-forget; the only thing we can
          // report is that the launch itself failed (file gone / no association).
          try { await tauri.openSongInApp(path); }
          catch (e) { addToast(shellOpenErrorMessage(e), "error"); }
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
      {/* songs-selection zone: header title + selection toolbar (two roving stops) */}
      <ScreenZone
        id="songs-selection"
        role="application"
        label={m.zone_songs_selection()}
        onKeyDown={selKeyDown}
      >
        <ScreenHeader title={m.songs_section()}>
          <SelectionToolbar
            selCount={selCount}
            visibleCount={visibleIds.length}
            allVisibleSelected={allVisibleSelected}
            selectAllRef={selectAllBtn}
            actionRef={deleteSelectedBtn}
            selectAllTabIndex={selTabIndex(0)}
            actionTabIndex={selTabIndex(1)}
            actionLabel={m.delete_selected({ count: selCount })}
            onSelectAll={handleSelectAll}
            onAction={() => listRef.current?.requestBulkDelete()}
          />
        </ScreenHeader>
      </ScreenZone>
      <SongsFilterBar ref={filterRef} exitZone={(forward) => exitZone("songs-filter", forward)} />
      <ListCard>
        {loading && <ListCardState role="status" className="text-slate-400">{m.songs_loading()}</ListCardState>}
        {error && <ListCardState role="alert" className="text-red-400">{m.songs_error({ error })}</ListCardState>}
        {!loading && !error && songs.length === 0 && (
          <ListCardState role="status">{m.songs_empty()}</ListCardState>
        )}
        {!loading && !error && songs.length > 0 && (
          <SongsList
            ref={listRef}
            exitZone={(forward) => exitZone("songs-list", forward)}
            onEmpty={() => filterRef.current?.focus("forward")}
            onPlay={handlePlay}
            onAction={handleMenuAction}
            resultSetKey={listResultSetKey}
          />
        )}
      </ListCard>

      {tagEditorFor && (
        <TagEditorDialog
          song={tagEditorFor}
          onClose={() => setTagEditorFor(null)}
        />
      )}

      {renameFor && (
        <RenameDialog
          song={renameFor}
          onClose={() => setRenameFor(null)}
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
