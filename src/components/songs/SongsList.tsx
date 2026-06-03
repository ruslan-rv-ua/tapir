import { forwardRef, useMemo } from "react";
import { useStore } from "@nanostores/react";
import { $filteredSongs } from "../../stores/songs";
import { $playerStatus } from "../../stores/player";
import { CompositeList } from "../common/composite-list";
import type { ZoneEntry } from "../../hooks/useZoneNavigation";
import { SongItem, getSongSegments } from "./SongItem";
import type { SongAction } from "./SongContextMenu";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  exitZone: (forward: boolean) => void;
  onEmpty: () => void;
  onPlay: (path: string) => void;
  onAction: (path: string, action: SongAction) => void;
}

export const SongsList = forwardRef<ZoneEntry, Props>(({ exitZone, onEmpty, onPlay, onAction }, ref) => {
  const songs = useStore($filteredSongs);
  const playerStatus = useStore($playerStatus);
  const playingPath =
    playerStatus.state !== "stopped" && playerStatus.source?.type === "file"
      ? playerStatus.source.path
      : null;

  const items = useMemo(() => songs.map((s) => ({ id: s.path, segments: getSongSegments(s) })), [songs]);

  return (
    <CompositeList
      ref={ref}
      zoneId="songs-list"
      ariaLabel={m.songs_zone_list()}
      items={items}
      className="flex-1 overflow-y-auto overflow-x-hidden"
      onTabOut={exitZone}
      onEmpty={onEmpty}
      onAction={(type, itemId, segment) => {
        if (type === "contextMenu") {
          const menuBtn = document.querySelector<HTMLButtonElement>(
            `[data-item-id="${CSS.escape(itemId)}"][data-context-menu-trigger]`,
          );
          menuBtn?.click();
          return;
        }
        if ((type === "primary" || type === "toggle") && segment === "summary") {
          onPlay(itemId);
        }
      }}
      renderRow={({ id, isActive, isFocused }) => {
        const song = songs.find((s) => s.path === id)!;
        return (
          <SongItem
            key={id}
            song={song}
            isActiveRow={isActive}
            isPlaying={playingPath === id}
            isFocused={isFocused}
            onPlay={() => onPlay(id)}
            onAction={(action) => onAction(id, action)}
          />
        );
      }}
    />
  );
});
SongsList.displayName = "SongsList";
