import { Menu, MenuItem, MenuTrigger, Popover, Button, Separator } from "react-aria-components";
import type { StreamInfo, StreamStatus } from "../../lib/tauri";
import * as tauri from "../../lib/tauri";
import { $editStream } from "../../stores/streams";
import { $playerStatus } from "../../stores/player";
import { addToast } from "../../stores/toasts";
import { useStore } from "@nanostores/react";
import * as m from "../../i18n/paraglide/messages";

interface Props {
  stream: StreamInfo;
  status: StreamStatus | undefined;
  onAddToWishlist: (currentTrack: string) => void;
  onAddToIgnorelist: (currentTrack: string) => void;
  onDelete: () => void;
}

export function StreamContextMenu({ stream, status, onAddToWishlist, onAddToIgnorelist, onDelete }: Props) {
  const playerStatus = useStore($playerStatus);
  const state = status?.state ?? "idle";
  const isRecording = state === "recording";
  const isThisStreamPlaying =
    playerStatus.state !== "stopped" &&
    playerStatus.source?.type === "stream" &&
    playerStatus.source.streamId === stream.id;

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
        case "edit":
          $editStream.set(stream);
          break;
        case "add-wishlist":
          if (currentTrack) onAddToWishlist(currentTrack);
          break;
        case "add-ignorelist":
          if (currentTrack) onAddToIgnorelist(currentTrack);
          break;
        case "delete":
          onDelete();
          break;
      }
    } catch (err) {
      addToast(String(err), "error");
    }
  };

  return (
    <MenuTrigger>
      <Button
        aria-label={m.stream_actions({ name: stream.name })}
        data-context-menu-trigger
        className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-slate-300"
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
            {isThisStreamPlaying ? `■ ${m.stop_stream_playback()}` : `▶ ${m.play_stream()}`}
          </MenuItem>
          <MenuItem
            id="record"
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            {isRecording ? `⏹ ${m.stop_recording()}` : `⏺ ${m.start_recording()}`}
          </MenuItem>
          <MenuItem
            id="edit"
            className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            ✎ {m.edit_stream()}
          </MenuItem>
          {currentTrack && (
            <>
              <MenuItem
                id="add-wishlist"
                className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
              >
                ⊕ {m.add_to_wishlist()}
              </MenuItem>
              <MenuItem
                id="add-ignorelist"
                className="cursor-pointer px-3 py-1.5 text-sm text-slate-200 outline-none hover:bg-slate-700 focus:bg-slate-700"
              >
                ⊖ {m.add_to_ignorelist()}
              </MenuItem>
            </>
          )}
          <Separator className="my-1 border-t border-slate-700" />
          <MenuItem
            id="delete"
            className="cursor-pointer px-3 py-1.5 text-sm text-red-400 outline-none hover:bg-slate-700 focus:bg-slate-700"
          >
            ✕ {m.remove_stream()}
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}