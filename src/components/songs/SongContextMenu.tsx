import {
  Button, Menu, MenuItem, MenuTrigger, Popover,
} from "react-aria-components";
import type { Song } from "../../types/song";
import * as m from "../../i18n/paraglide/messages";

type Action = "play" | "explorer" | "rename" | "tags" | "delete";

interface Props {
  song: Song;
  onAction: (action: Action) => void;
}

export function SongContextMenu({ song, onAction }: Props) {
  return (
    <MenuTrigger>
      <Button
        data-context-menu-trigger
        data-item-id={song.path}
        aria-label={m.songs_action_menu()}
        className="sr-only"
      >
        {m.songs_action_menu()}
      </Button>
      <Popover
        placement="bottom end"
        className="rounded border border-slate-700 bg-slate-900 p-1 shadow-xl outline-none forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]"
      >
        <Menu className="flex min-w-[180px] flex-col text-sm outline-none">
          <MenuItem onAction={() => onAction("play")} className="cursor-pointer rounded px-2 py-1 text-slate-200 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]">
            {m.songs_action_play()}
          </MenuItem>
          <MenuItem onAction={() => onAction("explorer")} className="cursor-pointer rounded px-2 py-1 text-slate-200 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]">
            {m.songs_action_explorer()}
          </MenuItem>
          <MenuItem onAction={() => onAction("rename")} className="cursor-pointer rounded px-2 py-1 text-slate-200 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]">
            {m.songs_action_rename()}
          </MenuItem>
          <MenuItem onAction={() => onAction("tags")} className="cursor-pointer rounded px-2 py-1 text-slate-200 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]">
            {m.songs_action_tags()}
          </MenuItem>
          <MenuItem onAction={() => onAction("delete")} className="cursor-pointer rounded px-2 py-1 text-red-300 outline-none data-[focused]:bg-red-900/40 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight]">
            {m.songs_action_delete()}
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
