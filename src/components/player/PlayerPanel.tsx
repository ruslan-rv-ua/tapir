import { Button } from "react-aria-components";
import { Play, Pause, Square } from "lucide-react";
import { useStore } from "@nanostores/react";
import { $playerStatus } from "../../stores/player";
import { $streams } from "../../stores/streams";
import { PlaybackPosition } from "./PlaybackPosition";
import { VolumeSlider } from "./VolumeSlider";
import { useAnnounce } from "../../hooks/useAnnounce";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

function useSourceLabel(): string {
  const { source } = useStore($playerStatus);
  const streams = useStore($streams);
  if (!source) return "";
  if (source.type === "stream") {
    const stream = streams.find((s) => s.id === source.streamId);
    return stream?.name ?? source.streamId;
  }
  return source.path.split(/[\\/]/).pop() ?? source.path;
}

export function PlayerPanel() {
  const { state } = useStore($playerStatus);
  const sourceLabel = useSourceLabel();
  const announce = useAnnounce();
  const isPlaying = state === "playing";
  const isPaused = state === "paused";
  const isActive = isPlaying || isPaused;

  const handlePlayPause = async () => {
    try {
      if (isPlaying) {
        await tauri.pausePlayback();
        announce(m.playback_paused(), "assertive");
      } else if (isPaused) {
        await tauri.resumePlayback();
        announce(m.playback_resumed(), "assertive");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleStop = async () => {
    try {
      await tauri.stopPlayback();
      announce(m.playback_stopped(), "assertive");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div
      role="complementary"
      aria-label={m.player_panel_label()}
      className="flex items-center gap-3 px-4 py-2 bg-slate-900 border-t border-slate-700 shrink-0"
    >
      <Button
        aria-label={isPlaying ? m.pause() : m.play()}
        isDisabled={!isActive}
        onPress={handlePlayPause}
        className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40"
      >
        {isPlaying
          ? <Pause aria-hidden size={16} />
          : <Play aria-hidden size={16} />}
      </Button>

      <Button
        aria-label={m.stop()}
        isDisabled={!isActive}
        onPress={handleStop}
        className="p-1.5 rounded hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40"
      >
        <Square aria-hidden size={16} />
      </Button>

      <span
        aria-live="polite"
        aria-atomic="true"
        className="text-sm text-slate-300 truncate flex-shrink-0 max-w-48"
      >
        {sourceLabel}
      </span>

      <PlaybackPosition />

      <VolumeSlider />
    </div>
  );
}
