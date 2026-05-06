import { useState } from "react";
import { Slider, SliderThumb, SliderTrack, ProgressBar } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $playerStatus } from "../../stores/player";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return m.time_format_min_sec({ min, sec });
}

export function PlaybackPosition() {
  const { state, source, positionMs, durationMs } = useStore($playerStatus);
  const [dragPos, setDragPos] = useState<number | null>(null);

  if (state === "stopped" || !source) return null;

  if (source.type === "file") {
    const storePos = positionMs ?? 0;
    const dur = durationMs ?? 0;
    if (dur === 0) return null;
    const pos = dragPos ?? storePos;
    return (
      <Slider
        aria-label={m.playback_position()}
        minValue={0}
        maxValue={dur}
        step={5000}
        value={pos}
        onChange={(v) => setDragPos(v)}
        onChangeEnd={(v) => {
          setDragPos(null);
          tauri.seekPlayback(v).catch(console.error);
        }}
        className="flex items-center gap-2 flex-1"
      >
        <SliderTrack className="relative h-2 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
          <SliderThumb
            aria-valuetext={formatTime(pos)}
            className="w-3 h-3 rounded-full bg-white top-1/2 -translate-y-1/2 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 forced-colors:bg-[ButtonText]"
          />
        </SliderTrack>
      </Slider>
    );
  }

  // Live stream — indeterminate progress bar
  return (
    <ProgressBar
      aria-label={m.live_stream()}
      isIndeterminate
      className="flex-1"
    >
      {() => (
        <div className="h-2 w-full rounded bg-slate-600 forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]">
          <div className="h-full w-8 rounded bg-blue-400 animate-pulse forced-colors:bg-[Highlight]" />
        </div>
      )}
    </ProgressBar>
  );
}
