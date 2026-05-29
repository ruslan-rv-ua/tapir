import { forwardRef, useImperativeHandle, useMemo } from "react";
import { useStore } from "@nanostores/react";
import { $filteredSongs } from "../../stores/songs";
import { useCompositeList } from "../../hooks/useCompositeList";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { SongItem, getSongSegments } from "./SongItem";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  exitZone: (forward: boolean) => void;
  onEmpty: () => void;
  onPlay: (path: string) => void;
  onContextMenu: (path: string) => void;
}

export const SongsList = forwardRef<ZoneEntry, Props>(
  ({ exitZone, onEmpty, onPlay, onContextMenu }, ref) => {
    const songs = useStore($filteredSongs);

    const items = useMemo(
      () => songs.map((s) => ({ id: s.path, segments: getSongSegments(s) })),
      [songs]
    );

    const { listRef, onKeyDownCapture, isFocused, restoreFocus, activeItemId } =
      useCompositeList({
        zoneId: "songs-list",
        items,
        onTabOut: exitZone,
        onEmpty,
        onAction: (type, itemId, segment) => {
          if (type === "contextMenu") {
            onContextMenu(itemId);
            return;
          }
          if ((type === "primary" || type === "toggle") && segment === "summary") {
            onPlay(itemId);
          }
        },
      });

    useImperativeHandle(ref, () => ({
      id: "songs-list",
      get el() { return listRef.current!; },
      focus: restoreFocus,
    }), [restoreFocus]);

    return (
      <ul
        ref={listRef}
        role="list"
        data-zone-id="songs-list"
        aria-label={m.songs_zone_list()}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onKeyDownCapture={onKeyDownCapture}
      >
        {songs.map((song) => (
          <SongItem
            key={song.path}
            song={song}
            isActiveRow={activeItemId === song.path}
            isFocused={(segment) => isFocused(song.path, segment)}
            onPlay={() => onPlay(song.path)}
            onContextMenu={() => onContextMenu(song.path)}
          />
        ))}
      </ul>
    );
  }
);
SongsList.displayName = "SongsList";
