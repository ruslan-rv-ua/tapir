import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { ProgressBar, Slider, SliderThumb, SliderTrack } from "react-aria-components";
import { useStore } from "@nanostores/react";
import { $playerStatus } from "../../stores/player";
import * as tauri from "../../lib/tauri";
import * as m from "../../i18n/paraglide/messages";

interface PlaybackPositionProps {
  inputRef?: RefObject<HTMLInputElement | null>;
  onNavigate?: (direction: 'prev' | 'next' | 'first' | 'last') => void;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return m.time_format_min_sec({ min, sec });
}

export function PlaybackPosition({ inputRef, onNavigate }: PlaybackPositionProps) {
  const { state, source, positionMs, durationMs } = useStore($playerStatus);
  const [dragPos, setDragPos] = useState<number | null>(null);

  // Patch tabIndex after every render — slider conditionally mounts, so ref.current
  // becomes available at an unpredictable render. No dep array ensures we patch
  // whenever the input is present.
  useEffect(() => {
    const input = inputRef?.current;
    if (!input) return;
    input.tabIndex = -1;
  });

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
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-blue-400 pointer-events-none forced-colors:bg-[Highlight]"
            style={{ width: `${Math.min((pos / dur) * 100, 100)}%` }}
            aria-hidden="true"
          />
          <SliderThumb
            inputRef={inputRef}
            aria-valuetext={formatTime(pos)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault(); e.stopPropagation();
                onNavigate?.('prev');
              } else if (e.key === 'ArrowRight') {
                e.preventDefault(); e.stopPropagation();
                onNavigate?.('next');
              } else if (e.key === 'Home') {
                e.preventDefault(); e.stopPropagation();
                onNavigate?.('first');
              } else if (e.key === 'End') {
                e.preventDefault(); e.stopPropagation();
                onNavigate?.('last');
              } else if (e.key === 'PageUp' || e.key === 'PageDown') {
                e.preventDefault(); e.stopPropagation();
              }
              // ArrowUp / ArrowDown: pass through to RAC for value adjustment.
            }}
            onKeyUp={(e) => {
              // onChangeEnd may not fire for keyboard in RAC — seek on key release instead.
              if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && dragPos !== null) {
                tauri.seekPlayback(dragPos).catch(console.error);
                setDragPos(null);
              }
            }}
            className="w-3 h-3 rounded-full bg-white top-1/2 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 forced-colors:bg-[ButtonText]"
          />
        </SliderTrack>
      </Slider>
    );
  }

  // Live stream — indeterminate progress bar (not interactive, no inputRef/onNavigate)
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
