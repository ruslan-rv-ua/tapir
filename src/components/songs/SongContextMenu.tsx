import { Button, Menu, MenuItem, MenuTrigger, Popover, Separator } from "react-aria-components";
import type { Key } from "react";
import type { Song } from "../../types/song";
import * as m from "../../i18n/paraglide/messages";

export type SongAction = "play" | "open" | "explorer" | "rename" | "tags" | "delete";

interface Props {
  song: Song;
  /** True when the menu trigger is the active 'action-menu' focus stop. */
  menuFocused: boolean;
  selectionCount: number;
  onAction: (action: SongAction) => void;
}

export function SongContextMenu({ song, menuFocused, selectionCount, onAction }: Props) {
  const handleAction = (key: Key) => {
    onAction(key as SongAction);
  };

  return (
    <MenuTrigger>
      <Button
        excludeFromTabOrder={!menuFocused}
        data-item-id={song.path}
        data-segment="action-menu"
        data-context-menu-trigger
        aria-label={m.songs_action_menu()}
        className="inline-flex shrink-0 items-center justify-center rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText] forced-colors:focus-visible:outline-[Highlight]"
      >
        ⋯
      </Button>
      <Popover>
        <Menu
          aria-label={m.songs_action_menu()}
          onAction={handleAction}
          className="min-w-48 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl outline-none forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]"
        >
          <MenuItem id="play" className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]">
            {m.songs_action_play()}
          </MenuItem>
          {/* "play/open" group: internal player, then the external app, then the
              folder — one sweep for a screen reader, no rename/delete in between.
              Acts on this row only; the selection is ignored (unlike delete). */}
          <MenuItem id="open" className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]">
            {m.songs_action_open()}
          </MenuItem>
          <MenuItem id="explorer" className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]">
            {m.songs_action_explorer()}
          </MenuItem>
          <MenuItem id="rename" className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]">
            {m.songs_action_rename()}
          </MenuItem>
          <MenuItem id="tags" className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]">
            {m.songs_action_tags()}
          </MenuItem>
          <Separator className="my-1 border-t border-slate-700" />
          <MenuItem id="delete" className="cursor-pointer px-3 py-1.5 text-sm text-red-400 outline-none data-[focused]:bg-slate-700 forced-colors:text-[ButtonText] forced-colors:data-[focused]:bg-[Highlight] forced-colors:data-[focused]:text-[HighlightText]">
            {selectionCount > 0 ? m.delete_selected({ count: selectionCount }) : m.songs_action_delete()}
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
