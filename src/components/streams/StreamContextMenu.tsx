import { Menu, MenuItem, MenuTrigger, Popover, Button, Separator } from "react-aria-components";
import { Copy, FolderInput, Link } from "lucide-react";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { isRecordingLike } from "../../lib/streamState";
import { playRefusalMessage } from "../../lib/playRefusal";
import { $editStream, $streamSelection } from "../../stores/streams";
import { $playerStatus } from "../../stores/player";
import { addToast } from "../../stores/toasts";
import { useStore } from "@nanostores/react";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  stream: StreamInfo;
  status: StreamStatus | undefined;
  /** True when the menu trigger is the active 'action-menu' focus stop. */
  menuFocused: boolean;
  onAddToWishlist: (currentTrack: string) => void;
  onAddToIgnorelist: (currentTrack: string) => void;
  onCopyToProfile: () => void;
  onMoveToProfile: () => void;
  onCopyUrl: () => void;
  /** Hand this one stream to the system's playlist app. Ignores the selection. */
  onOpenInPlayer: () => void;
  onDelete: () => void;
}

export function StreamContextMenu({ stream, status, menuFocused, onAddToWishlist, onAddToIgnorelist, onCopyToProfile, onMoveToProfile, onCopyUrl, onOpenInPlayer, onDelete }: Props) {
  const playerStatus = useStore($playerStatus);
  const selection = useStore($streamSelection);
  const isSelected = selection.has(stream.id);
  const state = status?.state ?? "idle";
  const isRecording = state === "recording";
  const isThisStreamPlaying =
    playerStatus.state !== "stopped" &&
    playerStatus.source?.type === "stream" &&
    playerStatus.source.streamId === stream.id;

  // Playback is not a recording state (R4), but a stream the user is
  // listening to must not be moved out from under the player either.
  const moveDisabled = isRecordingLike(state) || isThisStreamPlaying;

  const currentTrack = status?.currentTrack
    ? `${status.currentTrack.artist} - ${status.currentTrack.title}`.replace(/^ - | - $/g, "").trim()
    : null;

  const handleAction = async (key: React.Key) => {
    try {
      switch (key) {
        case "play":
          if (isThisStreamPlaying) await tauri.stopPlayback();
          else await tauri.playStream(stream.id);
          break;
        case "record":
          if (isRecording) await tauri.stopRecording(stream.id);
          else await tauri.startRecording(stream.id);
          break;
        case "open-player":
          onOpenInPlayer();
          break;
        case "edit":
          $editStream.set(stream);
          break;
        case "add-wishlist":
          if (currentTrack) onAddToWishlist(currentTrack);
          break;
        case "add-ignorelist":
          if (currentTrack) onAddToIgnorelist(currentTrack);
          break;
        case "copy-url":
          onCopyUrl();
          break;
        case "copy-to-profile":
          onCopyToProfile();
          break;
        case "move-to-profile":
          onMoveToProfile();
          break;
        case "delete":
          onDelete();
          break;
      }
    } catch (err) {
      addToast(playRefusalMessage(err), "error");
    }
  };

  return (
    <MenuTrigger>
      <Button
        // Roving focus stop: tabbable only while it is the active 'action-menu' segment.
        excludeFromTabOrder={!menuFocused}
        data-item-id={stream.id}
        data-segment="action-menu"
        data-context-menu-trigger
        aria-label={m.stream_actions({ name: stream.name })}
        title={m.stream_actions({ name: stream.name })}
        className="inline-flex shrink-0 items-center justify-center rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText] forced-colors:focus-visible:outline-[Highlight]"
      >
        ⋯
      </Button>
      <Popover>
        <Menu
          aria-label={m.stream_context_menu()}
          onAction={handleAction}
          className="min-w-48 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl outline-none"
        >
          <MenuItem
            id="play"
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            {isThisStreamPlaying
              ? <><span aria-hidden="true">■ </span>{m.stop_stream_playback()}</>
              : <><span aria-hidden="true">▶ </span>{m.play_stream()}</>}
          </MenuItem>
          <MenuItem
            id="record"
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            {isRecording
              ? <><span aria-hidden="true">⏹ </span>{m.stop_recording()}</>
              : <><span aria-hidden="true">⏺ </span>{m.start_recording()}</>}
          </MenuItem>
          <MenuItem
            id="open-player"
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            <span aria-hidden="true">→ </span>{m.stream_action_open_player()}
          </MenuItem>
          <MenuItem
            id="edit"
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            <span aria-hidden="true">✎ </span>{m.edit_stream()}
          </MenuItem>
          {currentTrack && (
            <>
              <MenuItem
                id="add-wishlist"
                className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
              >
                <span aria-hidden="true">⊕ </span>{m.add_to_wishlist()}
              </MenuItem>
              <MenuItem
                id="add-ignorelist"
                className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
              >
                <span aria-hidden="true">⊖ </span>{m.add_to_ignorelist()}
              </MenuItem>
            </>
          )}
          <MenuItem
            id="copy-url"
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            <span aria-hidden="true" className="mr-2 inline-flex"><Link size={14} /></span>{m.copy_url()}
          </MenuItem>
          <MenuItem
            id="copy-to-profile"
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            <span aria-hidden="true" className="mr-2 inline-flex"><Copy size={14} /></span>
            {isSelected ? m.copy_selected({ count: selection.size }) : m.copy_to_profile()}
          </MenuItem>
          <MenuItem
            id="move-to-profile"
            isDisabled={isSelected ? false : moveDisabled}
            title={!isSelected && moveDisabled ? m.move_disabled_reason() : undefined}
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
          >
            <span aria-hidden="true" className="mr-2 inline-flex"><FolderInput size={14} /></span>
            {isSelected ? m.move_selected({ count: selection.size }) : m.move_to_profile()}
          </MenuItem>
          <Separator className="my-1 border-t border-slate-700" />
          <MenuItem
            id="delete"
            className="cursor-pointer px-3 py-1.5 text-sm text-red-400 outline-none hover:bg-slate-700 focus:bg-slate-700 forced-colors:text-[CanvasText]"
          >
            <span aria-hidden="true">✕ </span>
            {isSelected ? m.delete_selected({ count: selection.size }) : m.remove_stream()}
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}