import { forwardRef, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { createPortal } from "react-dom";
import { $songs, $filteredSongs, $songsSelection, removeSongsByPaths } from "../../stores/songs";
import { replaceSelection } from "../../stores/selection";
import { $playerStatus } from "../../stores/player";
import { CompositeList } from "../common/composite-list";
import { ConfirmDialog } from "../common/ConfirmDialog";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import type { SegmentKind } from "../../hooks/useCompositeList";
import { useListSelection } from "../../hooks/useListSelection";
import { useAnnounce } from "../../hooks/useAnnounce";
import { computeBulkFocusTarget } from "../../lib/bulkFocus";
import { SongItem, getSongSegments } from "./SongItem";
import type { SongAction } from "./SongContextMenu";
import * as tauri from "../../lib/tauri";
import { addToast } from "../../stores/toasts";
import type { Song } from "../../types/song";
import * as m from "../../i18n/paraglide/messages";

export type SongsListHandle = ZoneEntry & { requestBulkDelete(): void };

interface Props {
  exitZone: (forward: boolean) => void;
  onEmpty: () => void;
  onPlay: (path: string) => void;
  /** Single-row menu actions, incl. the single-delete path (Explorer model). */
  onAction: (path: string, action: SongAction) => void;
}

export const SongsList = forwardRef<SongsListHandle, Props>(
  ({ exitZone, onEmpty, onPlay, onAction }, ref) => {
    const songs = useStore($filteredSongs);
    const allSongs = useStore($songs);
    const selectedSet = useStore($songsSelection);
    const playerStatus = useStore($playerStatus);
    const announce = useAnnounce();
    const playingPath =
      playerStatus.state !== "stopped" && playerStatus.source?.type === "file"
        ? playerStatus.source.path
        : null;

    const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
    const pendingBulkFocusRef = useRef<string | null>(null);
    const [bulkSeq, setBulkSeq] = useState(0);
    const focusItemRef = useRef<((id: string, segment?: SegmentKind) => void) | null>(null);

    const resolveName = useCallback(
      (path: string) => songs.find((s) => s.path === path)?.title || path,
      [songs],
    );
    const { selectionAdapter, onSelectionChange } = useListSelection<Song>({
      $selection: $songsSelection,
      announce,
      resolveName,
      allItems: allSongs, // FULL store (prune must NOT drop rows hidden by a filter)
      getId: (s) => s.path,
    });

    const items = useMemo(() => songs.map((s) => ({ id: s.path, segments: getSongSegments() })), [songs]);

    // Programmatic focus after a bulk delete (mirror StreamList).
    useLayoutEffect(() => {
      const targetId = pendingBulkFocusRef.current;
      if (!targetId) return;
      pendingBulkFocusRef.current = null;
      focusItemRef.current?.(targetId, "summary");
    }, [items, bulkSeq]);

    const handleConfirmBulkDelete = async () => {
      const paths = [...$songsSelection.get()];
      if (paths.length === 0) { setBulkConfirmOpen(false); return; }
      const visible = songs.map((s) => ({ id: s.path })); // snapshot before await (focus index, A8)
      try {
        const res = await tauri.deleteSongs(paths);
        const removedIds = new Set(res.deleted);
        if (removedIds.size > 0) {
          removeSongsByPaths(res.deleted);
          replaceSelection($songsSelection, new Set());
          const target = computeBulkFocusTarget(visible, removedIds);
          if (target === null) onEmpty();
          else pendingBulkFocusRef.current = target;
          setBulkSeq((n) => n + 1);
        }
        const parts = [m.songs_removed_bulk({ count: res.deleted.length })];
        if (res.skipped.length > 0) parts.push(m.bulk_skipped_playing({ count: res.skipped.length }));
        announce(parts.join(", "), "polite");
      } catch (err) {
        addToast(String(err), "error");
      }
      setBulkConfirmOpen(false);
    };

    const imperativeExtra = useCallback(
      ({ focusItem }: { focusItem: (id: string, segment?: SegmentKind) => void }) => {
        // Stash the latest focusItem; the handle is rebuilt on items change, so this
        // ref always points at a focusItem that knows the post-delete item set.
        focusItemRef.current = focusItem;
        return { requestBulkDelete: () => setBulkConfirmOpen(true) };
      },
      [],
    );

    return (
      <>
        <CompositeList<SongsListHandle>
          ref={ref}
          imperativeExtra={imperativeExtra}
          zoneId="songs-list"
          ariaLabel={m.songs_zone_list()}
          items={items}
          className="flex-1 overflow-y-auto overflow-x-hidden"
          onTabOut={exitZone}
          onEmpty={onEmpty}
          selection={selectionAdapter}
          onSelectionChange={onSelectionChange}
          onAction={(type, itemId, segment, mods) => {
            if (type === "delete") {
              // Keyboard Delete: whole selection if any, else single (the D4 gap —
              // songs had no delete branch before). Single is delegated to the panel.
              if ($songsSelection.get().size > 0) setBulkConfirmOpen(true);
              else onAction(itemId, "delete");
              return;
            }
            if (segment !== "summary") return;
            // Modifiers ride on Enter only, and always target the FOCUSED row —
            // unlike Delete, which fans out to the selection. Space (toggle)
            // deliberately ignores them, so Alt+Space stays plain play.
            if (type === "primary" && mods.alt) { onAction(itemId, "open"); return; }
            if (type === "primary" && mods.ctrl) { onAction(itemId, "explorer"); return; }
            if (type === "primary" || type === "toggle") onPlay(itemId);
          }}
          renderRow={({ id, isActive, isFocused }) => {
            const song = songs.find((s) => s.path === id)!;
            return (
              <SongItem
                key={id}
                song={song}
                isActiveRow={isActive}
                isPlaying={playingPath === id}
                isSelected={selectedSet.has(id)}
                selectionCount={selectedSet.has(id) ? selectedSet.size : 0}
                isFocused={isFocused}
                onPlay={() => onPlay(id)}
                onAction={(action) => {
                  if (action === "delete") {
                    // Explorer model: ⋯-delete INSIDE the selection → bulk; OUTSIDE
                    // → collapse to {id} then single (delegated to the panel).
                    if ($songsSelection.get().has(id)) setBulkConfirmOpen(true);
                    else { replaceSelection($songsSelection, new Set([id])); onAction(id, "delete"); }
                  } else {
                    onAction(id, action);
                  }
                }}
              />
            );
          }}
        />
        {bulkConfirmOpen &&
          createPortal(
            <ConfirmDialog
              title={m.songs_confirm_delete_title()}
              message={m.confirm_delete_selected_songs({ count: selectedSet.size })}
              confirmLabel={m.songs_action_delete()}
              onConfirm={handleConfirmBulkDelete}
              onCancel={() => setBulkConfirmOpen(false)}
            />,
            document.body,
          )}
      </>
    );
  },
);
SongsList.displayName = "SongsList";
